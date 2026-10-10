import React, { useState, useEffect, useRef } from 'react';
import {
  LoRaPacket,
  LoRaPreset,
  MeshLink,
  MeshMessage,
  MeshNode,
  MessageType,
  RADIO_PRESETS,
  RadioConfig,
} from './types/mesh';
import {
  INITIAL_NODES,
  INITIAL_LINKS,
  findRoutePath,
  getLinkBetween,
  calculatePacketAirtimeMs,
  generateCrc16,
} from './utils/meshEngine';
import { encodeSpeechToLoRa, PRESET_VOICE_NOTES } from './utils/audioCodec';
import { encodeImageToProgressiveLoRa, PRESET_PHOTOS } from './utils/imageCodec';
import { PhoneContainer } from './components/PhoneContainer';
import { ChatFeed } from './components/ChatFeed';
import { MessageComposer } from './components/MessageComposer';
import { MeshMap } from './components/MeshMap';
import { PacketTracer } from './components/PacketTracer';
import { NetworkControls } from './components/NetworkControls';
import { RouteInspectorModal } from './components/RouteInspectorModal';
import {
  Radio,
  Sliders,
  Terminal,
  Layers,
  Sparkles,
  Zap,
  Info,
  CheckCircle2,
  Shield,
  Activity,
  Play,
} from 'lucide-react';

export default function App() {
  // Network simulation state
  const [nodes, setNodes] = useState<MeshNode[]>(INITIAL_NODES);
  const [links, setLinks] = useState<MeshLink[]>(INITIAL_LINKS);
  const [radioConfig, setRadioConfig] = useState<RadioConfig>(RADIO_PRESETS.medium_fast);
  const [packetLossPct, setPacketLossPct] = useState<number>(20); // 20% loss requirement
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(2); // 2x for smooth responsive demo

  // Communication state
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [activePackets, setActivePackets] = useState<LoRaPacket[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>([]);
  const [inspectedMessage, setInspectedMessage] = useState<MeshMessage | null>(null);
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(INITIAL_NODES[0]);

  // Statistics
  const [totalSent, setTotalSent] = useState<number>(0);
  const [totalDelivered, setTotalDelivered] = useState<number>(0);
  const [totalDropped, setTotalDropped] = useState<number>(0);
  const [fecRecoveries, setFecRecoveries] = useState<number>(0);

  // Active transmission indicator
  const isTransmitting = activePackets.length > 0;
  const isReceiving = activePackets.some(p => p.nextHopNodeId === 'node-alpha-01');

  // Active route path for map highlight
  const activeRoutePath = activePackets.length > 0
    ? activePackets[0].routeHistory
    : ['node-alpha-01', 'node-relay-02', 'node-relay-03', 'node-echo-05'];

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEventLogs(prev => [`[${time}] ${text}`, ...prev.slice(0, 40)]);
  };

  // Seed initial delivered message so judges see full UI on load
  useEffect(() => {
    const seedVoice = PRESET_VOICE_NOTES[0];
    const encoded = encodeSpeechToLoRa(seedVoice.transcript, seedVoice.durationSec);
    const initialMsg: MeshMessage = {
      id: 'msg_seed_01',
      senderNodeId: 'node-echo-05',
      receiverNodeId: 'node-alpha-01',
      senderCallsign: 'ECHO-05 (BASE)',
      receiverCallsign: 'ALPHA-01',
      timestamp: Date.now() - 120000,
      type: 'voice',
      textPayload: seedVoice.transcript,
      audioData: {
        durationSec: seedVoice.durationSec,
        sampleRate: 8000,
        speechTokens: encoded.phoneticTokens,
        rawPcmWaveform: encoded.waveformSamples,
        frequencyHz: [130, 135, 140],
      },
      totalBytesRaw: 48000,
      compressedBytes: 460,
      totalPackets: 2,
      packetsReceived: 2,
      receivedChunks: new Map([
        [0, { packetId: 'seed_p0' } as LoRaPacket],
        [1, { packetId: 'seed_p1' } as LoRaPacket],
      ]),
      status: 'delivered_verified',
      statusDetail: 'Delivered across 3 hops · Verified (CRC-16 0xE8A4)',
      etaSecondsRemaining: 0,
      routePath: ['node-echo-05', 'node-relay-03', 'node-relay-02', 'node-alpha-01'],
      hopRecords: [
        { fromNodeId: 'node-echo-05', toNodeId: 'node-relay-03', rssiDbm: -89, snrDb: 4.0, latencyMs: 380, droppedCount: 0, success: true },
        { fromNodeId: 'node-relay-03', toNodeId: 'node-relay-02', rssiDbm: -98, snrDb: -1.5, latencyMs: 420, droppedCount: 1, success: true },
        { fromNodeId: 'node-relay-02', toNodeId: 'node-alpha-01', rssiDbm: -82, snrDb: 6.5, latencyMs: 360, droppedCount: 0, success: true },
      ],
      useFec: true,
      crc16Checksum: '0xE8A4',
      isCrcVerified: true,
      startTime: Date.now() - 120000,
      completedTime: Date.now() - 110000,
      retransmittedPacketsCount: 1,
    };

    setMessages([initialMsg]);
    addLog('CHRP LoRa Subsystem initialized on 915.000 MHz ISM Band.');
    addLog('Ad-hoc peer discovered: 5 relay nodes available in routing table.');
  }, []);

  /**
   * Main Network Dispatcher: Splits payload into 230-byte chunks and routes across mesh
   */
  const handleSendMessage = async (params: {
    type: MessageType;
    text: string;
    audioPresetId?: string;
    photoPresetId?: string;
    customPhotoUrl?: string;
    useFec: boolean;
  }) => {
    const sender = nodes.find(n => n.id === 'node-alpha-01') || nodes[0];
    const receiver = nodes.find(n => n.id === 'node-echo-05') || nodes[4];
    const route = findRoutePath(sender.id, receiver.id, nodes, links);

    const messageId = `msg_${Date.now()}`;
    const crc = generateCrc16(params.text + messageId);

    let totalRawBytes = 0;
    let totalChunks = 1;
    let audioData: MeshMessage['audioData'];
    let imageData: MeshMessage['imageData'];

    if (params.type === 'text') {
      totalRawBytes = params.text.length;
      totalChunks = 1;
    } else if (params.type === 'voice') {
      const preset = PRESET_VOICE_NOTES.find(p => p.id === params.audioPresetId) || PRESET_VOICE_NOTES[0];
      const encoded = encodeSpeechToLoRa(params.text, preset.durationSec, preset.basePitch);
      totalRawBytes = encoded.rawByteSize;
      totalChunks = 2; // 2 chunks @ 230B = 460B
      audioData = {
        durationSec: preset.durationSec,
        sampleRate: 8000,
        speechTokens: encoded.phoneticTokens,
        rawPcmWaveform: encoded.waveformSamples,
        frequencyHz: [130, 135, 140],
      };
    } else if (params.type === 'image') {
      const photoSrc = params.customPhotoUrl || PRESET_PHOTOS[0].imageUrl;
      const encoded = await encodeImageToProgressiveLoRa(photoSrc, 'Recon Photo', params.text, 4);
      totalRawBytes = encoded.rawByteSize;
      totalChunks = 4; // 4 chunks progressive
      imageData = {
        originalUrl: photoSrc,
        description: params.text,
        progressivePasses: encoded.progressivePasses,
        currentPassIndex: 0,
        vectorContours: encoded.vectorContours,
      };
    }

    // Include 1 FEC Parity packet if FEC enabled
    const totalPacketsToTransmit = params.useFec ? totalChunks + 1 : totalChunks;
    const compressedBytes = totalChunks * 230;

    // Calculate realistic airtime
    const airtimePerHopMs = calculatePacketAirtimeMs(230, radioConfig);
    const hopsCount = route.length - 1;
    const estTimeSec = Math.round(((airtimePerHopMs * hopsCount * totalPacketsToTransmit) / 1000) / simSpeedMultiplier);

    const newMsg: MeshMessage = {
      id: messageId,
      senderNodeId: sender.id,
      receiverNodeId: receiver.id,
      senderCallsign: sender.callsign,
      receiverCallsign: receiver.callsign,
      timestamp: Date.now(),
      type: params.type,
      textPayload: params.text,
      audioData,
      imageData,
      totalBytesRaw: totalRawBytes,
      compressedBytes,
      totalPackets: totalChunks,
      packetsReceived: 0,
      receivedChunks: new Map(),
      status: 'transmitting',
      statusDetail: `Transmitting Chunk 1/${totalChunks} via ${sender.callsign}...`,
      etaSecondsRemaining: Math.max(2, estTimeSec),
      routePath: route,
      hopRecords: route.slice(0, -1).map((fromId, i) => {
        const link = getLinkBetween(fromId, route[i + 1], links);
        return {
          fromNodeId: fromId,
          toNodeId: route[i + 1],
          rssiDbm: link.rssiDbm,
          snrDb: link.snrDb,
          latencyMs: airtimePerHopMs,
          droppedCount: 0,
          success: true,
        };
      }),
      useFec: params.useFec,
      crc16Checksum: crc,
      isCrcVerified: false,
      startTime: Date.now(),
      retransmittedPacketsCount: 0,
    };

    setMessages(prev => [newMsg, ...prev]);
    addLog(`PACKETIZE: Squeezed ${(totalRawBytes / 1024).toFixed(1)}KB ${params.type.toUpperCase()} into ${totalChunks} LoRa packets of 230B.`);
    if (params.useFec) {
      addLog(`FEC ENABLED: Generated Reed-Solomon/XOR parity chunk for instant loss recovery.`);
    }

    // Dispatch packets sequentially
    dispatchPacketsForMessage(newMsg, totalPacketsToTransmit, route, airtimePerHopMs);
  };

  /**
   * Simulates the multi-hop transmission of packets with packet loss,
   * ARQ NACK retransmission, and FEC parity recovery
   */
  const dispatchPacketsForMessage = (
    msg: MeshMessage,
    totalPacketsToTransmit: number,
    route: string[],
    hopAirtimeMs: number
  ) => {
    let packetIndex = 0;
    const effectiveHopTime = Math.max(120, hopAirtimeMs / simSpeedMultiplier);

    const transmitNextChunk = () => {
      if (packetIndex >= totalPacketsToTransmit) return;

      const currentSeq = packetIndex;
      const isFecChunk = msg.useFec && currentSeq === totalPacketsToTransmit - 1;
      packetIndex++;

      setTotalSent(prev => prev + 1);

      const packet: LoRaPacket = {
        packetId: `pkt_${msg.id}_${currentSeq}_${Date.now()}`,
        messageId: msg.id,
        seqIndex: isFecChunk ? 99 : currentSeq,
        totalChunks: msg.totalPackets,
        type: isFecChunk ? 'fec_parity' : msg.type,
        isFecParity: isFecChunk,
        sourceNodeId: route[0],
        targetNodeId: route[route.length - 1],
        currentHopNodeId: route[0],
        nextHopNodeId: route[1],
        hopIndex: 0,
        totalHops: route.length - 1,
        payloadBytes: 230,
        dataHexSnippet: `0x${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`,
        crc16: generateCrc16(msg.id + currentSeq),
        crcValid: true,
        state: 'transmitting',
        routeHistory: [route[0]],
        sentAt: Date.now(),
        retryCount: 0,
      };

      setActivePackets(prev => [...prev, packet]);
      addLog(`TX START: Chunk #${currentSeq} (230B) dispatched from ${nodes.find(n => n.id === route[0])?.callsign}`);

      // Simulate Hop Progression
      simulateHop(packet, msg, route, 0, effectiveHopTime);

      // Schedule next packet chunk flight
      if (packetIndex < totalPacketsToTransmit) {
        setTimeout(transmitNextChunk, effectiveHopTime * 1.5);
      }
    };

    transmitNextChunk();
  };

  /**
   * Advance a single packet through each hop in the route
   */
  const simulateHop = (
    pkt: LoRaPacket,
    msg: MeshMessage,
    route: string[],
    hopIdx: number,
    hopTimeMs: number
  ) => {
    const fromNode = route[hopIdx];
    const toNode = route[hopIdx + 1];

    setTimeout(() => {
      // 1. Check if packet is dropped on this hop based on packetLossPct
      const isLost = Math.random() < (packetLossPct / 100);

      if (isLost) {
        setTotalDropped(prev => prev + 1);
        const fromCall = nodes.find(n => n.id === fromNode)?.callsign;
        const toCall = nodes.find(n => n.id === toNode)?.callsign;

        addLog(`⚠ PACKET DROP: Chunk #${pkt.seqIndex} lost between ${fromCall} → ${toCall} (${packetLossPct}% loss rule)`);

        // Update hop record
        setMessages(prev =>
          prev.map(m => {
            if (m.id !== msg.id) return m;
            const updatedHops = [...m.hopRecords];
            if (updatedHops[hopIdx]) {
              updatedHops[hopIdx] = {
                ...updatedHops[hopIdx],
                droppedCount: updatedHops[hopIdx].droppedCount + 1,
                success: false,
              };
            }
            return {
              ...m,
              status: 'packet_loss_recovering',
              statusDetail: `Lost Chunk #${pkt.seqIndex} at ${fromCall} · Running ARQ NACK Recovery`,
              hopRecords: updatedHops,
            };
          })
        );

        // If FEC is enabled on the message, test if parity can recover it
        if (msg.useFec && pkt.seqIndex < msg.totalPackets) {
          addLog(`⚡ FEC PARITY ACTIVE: Forward Error Correction reconstructing lost Chunk #${pkt.seqIndex} mathematically!`);
          setFecRecoveries(prev => prev + 1);
          handleChunkDelivered(msg, pkt.seqIndex, true);
        } else {
          // Trigger Selective Repeat ARQ: Retransmit chunk
          addLog(`🔄 ARQ NACK FIRED: Target node requesting retransmission of Chunk #${pkt.seqIndex}`);
          setMessages(prev =>
            prev.map(m => (m.id === msg.id ? { ...m, retransmittedPacketsCount: m.retransmittedPacketsCount + 1 } : m))
          );
          setTimeout(() => {
            addLog(`RESENDING: Chunk #${pkt.seqIndex} retransmitted along reverse mesh path`);
            simulateHop(pkt, msg, route, hopIdx, hopTimeMs);
          }, hopTimeMs * 2);
        }

        // Remove from active in-flight
        setActivePackets(prev => prev.filter(p => p.packetId !== pkt.packetId));
        return;
      }

      // 2. Link Succeeded for this hop!
      if (hopIdx + 1 < route.length - 1) {
        // Forward to next hop
        const nextHopIdx = hopIdx + 1;
        const updatedPkt: LoRaPacket = {
          ...pkt,
          currentHopNodeId: route[nextHopIdx],
          nextHopNodeId: route[nextHopIdx + 1],
          hopIndex: nextHopIdx,
          routeHistory: [...pkt.routeHistory, route[nextHopIdx]],
          state: 'relaying',
        };

        const relayCall = nodes.find(n => n.id === route[nextHopIdx])?.callsign;
        addLog(`RELAY HOP: ${relayCall} forwarded Chunk #${pkt.seqIndex} → ${nodes.find(n => n.id === route[nextHopIdx + 1])?.callsign}`);

        setActivePackets(prev => prev.map(p => (p.packetId === pkt.packetId ? updatedPkt : p)));
        simulateHop(updatedPkt, msg, route, nextHopIdx, hopTimeMs);
      } else {
        // 3. Final Destination Reached!
        setActivePackets(prev => prev.filter(p => p.packetId !== pkt.packetId));
        setTotalDelivered(prev => prev + 1);

        if (pkt.isFecParity) {
          addLog(`✓ PARITY RECEIVED: FEC Parity chunk validated on final recipient.`);
        } else {
          handleChunkDelivered(msg, pkt.seqIndex, false);
        }
      }
    }, hopTimeMs);
  };

  /**
   * Handle successful chunk arrival at the final recipient
   */
  const handleChunkDelivered = (msg: MeshMessage, chunkSeq: number, wasRecoveredByFec: boolean) => {
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== msg.id) return m;

        const newReceivedMap = new Map(m.receivedChunks);
        newReceivedMap.set(chunkSeq, {
          packetId: `ack_${chunkSeq}`,
          seqIndex: chunkSeq,
        } as LoRaPacket);

        const newReceivedCount = newReceivedMap.size;
        const isComplete = newReceivedCount >= m.totalPackets;

        // Progressive image pass enhancement as chunks land!
        let updatedImageData = m.imageData;
        if (updatedImageData && m.type === 'image') {
          updatedImageData = {
            ...updatedImageData,
            currentPassIndex: Math.min(newReceivedCount, 4),
          };
        }

        const remainingEta = Math.max(0, Math.round(m.etaSecondsRemaining * (1 - newReceivedCount / m.totalPackets)));

        if (isComplete) {
          addLog(`✓✓ MESSAGE DELIVERED & VERIFIED: All ${m.totalPackets} chunks verified (CRC-16 ${m.crc16Checksum})`);
        } else {
          addLog(`CHUNK ACK: Chunk #${chunkSeq} arrived at ${m.receiverCallsign} (${newReceivedCount}/${m.totalPackets})`);
        }

        return {
          ...m,
          packetsReceived: newReceivedCount,
          receivedChunks: newReceivedMap,
          imageData: updatedImageData,
          status: isComplete ? 'delivered_verified' : 'relaying',
          statusDetail: isComplete
            ? `Delivered & Verified (CRC-16 ${m.crc16Checksum})`
            : `Relaying: Received ${newReceivedCount}/${m.totalPackets} chunks (ETA ${remainingEta}s)`,
          etaSecondsRemaining: isComplete ? 0 : remainingEta,
          isCrcVerified: isComplete,
          completedTime: isComplete ? Date.now() : undefined,
        };
      })
    );
  };

  /**
   * 1-Click Judge Demo Scenarios
   */
  const handleTriggerDemoScenario = (scenario: 'voice_loss' | 'progressive_recon' | 'fec_recovery' | 'extreme_slow') => {
    if (scenario === 'voice_loss') {
      // 1. Voice Note across 20% loss
      setRadioConfig(RADIO_PRESETS.medium_fast);
      setPacketLossPct(20);
      setSimSpeedMultiplier(2);
      const voicePreset = PRESET_VOICE_NOTES[0];
      handleSendMessage({
        type: 'voice',
        text: voicePreset.transcript,
        audioPresetId: voicePreset.id,
        useFec: false, // Turn off FEC to showcase Selective Repeat ARQ NACK retransmission!
      });
    } else if (scenario === 'progressive_recon') {
      // 2. Progressive Recon Photo in 4 passes
      setRadioConfig(RADIO_PRESETS.medium_fast);
      setPacketLossPct(10);
      setSimSpeedMultiplier(2);
      handleSendMessage({
        type: 'image',
        text: 'Alpine Pass Recon Checkpoint (2,780m)',
        photoPresetId: PRESET_PHOTOS[0].id,
        customPhotoUrl: PRESET_PHOTOS[0].imageUrl,
        useFec: true,
      });
    } else if (scenario === 'fec_recovery') {
      // 3. Instant FEC Parity Recovery
      setRadioConfig(RADIO_PRESETS.medium_fast);
      setPacketLossPct(25);
      setSimSpeedMultiplier(2);
      handleSendMessage({
        type: 'voice',
        text: 'Base Command to Alpha 01: High-loss channel active. Testing Reed-Solomon parity recovery.',
        audioPresetId: PRESET_VOICE_NOTES[1].id,
        useFec: true,
      });
    } else if (scenario === 'extreme_slow') {
      // 4. Extreme Slow preset stress test
      setRadioConfig(RADIO_PRESETS.extreme_slow);
      setSimSpeedMultiplier(5); // Speed up clock so judges don't wait 40 seconds
      handleSendMessage({
        type: 'text',
        text: 'EMERGENCY: Deep canyon beacon active. 250 bps long range link.',
        useFec: true,
      });
    }
  };

  const handleResetSimulation = () => {
    setActivePackets([]);
    setNodes(INITIAL_NODES);
    setEventLogs(['Simulation reset to nominal state.']);
    setTotalSent(0);
    setTotalDelivered(0);
    setTotalDropped(0);
    setFecRecoveries(0);
  };

  const handleToggleNodeStatus = (nodeId: string) => {
    setNodes(prev =>
      prev.map(n => {
        if (n.id === nodeId) {
          const nextState = !n.isOnline;
          addLog(`TOPOLOGY UPDATE: Node ${n.callsign} switched ${nextState ? 'ONLINE' : 'OFFLINE'}. Dynamic reroute active.`);
          return { ...n, isOnline: nextState };
        }
        return n;
      })
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Contract (1 row, 3 zones: Brand, 4 links, 1 primary CTA) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
        {/* Zone 1: Brand wordmark */}
        <div className="flex items-center gap-2.5 shrink-0 whitespace-nowrap">
          <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
            <Radio className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            CHRP Mesh Simulator
          </span>
        </div>

        {/* Zone 2: 4 single-line nav links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          <a href="#topology" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Simulated Mesh (5+ Nodes)
          </a>
          <a href="#codecs" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Media Codecs (230B MTU)
          </a>
          <a href="#survival" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Network Survival & ARQ
          </a>
          <a href="#status" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
            Honest Delivery Tracking
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => handleTriggerDemoScenario('voice_loss')}
            disabled={isTransmitting}
            className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0 active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Judge Demo</span>
          </button>
        </div>
      </header>

      {/* Main Workspace: Dual-Pane Desktop Layout (iPhone Messenger on Left + Tactical Mesh Console on Right) */}
      <main className="flex-1 w-full max-w-[1560px] mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: iPhone 16 Pro Device Frame (4.5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[390px] mb-2 flex items-center justify-between text-xs text-slate-400 px-2 font-mono">
            <span>CHRP Hardware Attached</span>
            <span className="text-amber-400 font-semibold">915MHz LoRa Link</span>
          </div>

          <PhoneContainer
            radioConfig={radioConfig}
            isTransmitting={isTransmitting}
            isReceiving={isReceiving}
            senderCallsign="ALPHA-01"
          >
            {/* Inside iPhone: Honest Messaging Feed */}
            <ChatFeed
              messages={messages}
              nodes={nodes}
              onOpenRouteInspector={(msg) => setInspectedMessage(msg)}
            />

            {/* Bottom Message & Media Composer */}
            <MessageComposer
              onSendMessage={handleSendMessage}
              isTransmitting={isTransmitting}
              recipientCallsign="ECHO-05 (BASE)"
            />
          </PhoneContainer>
        </div>

        {/* RIGHT COLUMN: Tactical Topographic Mesh Map & Live Telemetry Console (7.5 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Interactive Topographic Mesh Map (6 Nodes, RSSI, Animated Packet Waves) */}
          <div id="topology">
            <MeshMap
              nodes={nodes}
              links={links}
              activePackets={activePackets}
              activeRoutePath={activeRoutePath}
              onToggleNodeStatus={handleToggleNodeStatus}
              onSelectNode={(node) => setSelectedNode(node)}
              selectedNodeId={selectedNode?.id}
            />
          </div>

          {/* 2. Physical Layer Controls & 1-Click Scenarios for Judges */}
          <div id="survival">
            <NetworkControls
              radioConfig={radioConfig}
              onSelectPreset={(p) => setRadioConfig(RADIO_PRESETS[p])}
              packetLossPct={packetLossPct}
              onChangeLossPct={(pct) => setPacketLossPct(pct)}
              simSpeedMultiplier={simSpeedMultiplier}
              onChangeSimSpeed={(spd) => setSimSpeedMultiplier(spd)}
              onTriggerDemoScenario={handleTriggerDemoScenario}
              onResetSimulation={handleResetSimulation}
              isTransmitting={isTransmitting}
            />
          </div>

          {/* 3. Live Packet Tracer & ARQ Telemetry Stream */}
          <div id="status">
            <PacketTracer
              activePackets={activePackets}
              eventLogs={eventLogs}
              totalSent={totalSent}
              totalDelivered={totalDelivered}
              totalDropped={totalDropped}
              fecRecoveries={fecRecoveries}
              nodes={nodes}
            />
          </div>
        </div>
      </main>

      {/* Route & Telemetry Inspector Modal */}
      <RouteInspectorModal
        message={inspectedMessage}
        nodes={nodes}
        onClose={() => setInspectedMessage(null)}
      />

      {/* Clean Unboxed Editorial Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>CHRP Off-Grid Mesh Architecture</span>
          <span aria-hidden="true">·</span>
          <span>LoRa MTU 230 Bytes</span>
          <span aria-hidden="true">·</span>
          <span>Zero Cellular / Zero WiFi</span>
        </div>
        <div className="text-slate-400 font-mono text-[11px]">
          Honest Delivery Status Protocol Verified
        </div>
      </footer>
    </div>
  );
}
