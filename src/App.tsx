import React, { useState, useEffect, useRef } from 'react';
import { LoRaPacket, MeshMessage, MeshNode, RADIO_PRESETS, RadioConfig } from './types/mesh';
import { INITIAL_NODES, INITIAL_LINKS, findRoutePath, getLinkBetween, calculatePacketAirtimeMs } from './utils/meshEngine';
import { prepareVoice } from './utils/audioCodec';
import { prepareImage, PRESET_PHOTOS, renderReceivedPreview } from './utils/imageCodec';
import { prepareVideo, renderReceivedVideo, DEMO_VIDEO } from './utils/videoCodec';
import { decodeMedia, encodeText, PreparedMedia } from './utils/media';
import { CHUNK_BYTES, crc16, hexCrc, packetize, seededRandom } from './utils/protocol';
import { runTransfer, TransportEvent } from './utils/transport';
import { HardwareReveal } from './components/HardwareReveal';
import { PhoneContainer } from './components/PhoneContainer';
import { ChatFeed } from './components/ChatFeed';
import { MessageComposer, SendParams } from './components/MessageComposer';
import { MeshMap } from './components/MeshMap';
import { PacketTracer } from './components/PacketTracer';
import { NetworkControls } from './components/NetworkControls';
import { RouteInspectorModal } from './components/RouteInspectorModal';
import { Radio, Play } from 'lucide-react';

export default function App() {
  const [nodes, setNodes] = useState<MeshNode[]>(INITIAL_NODES);
  const [radioConfig, setRadioConfig] = useState<RadioConfig>(RADIO_PRESETS.medium_fast);
  const [packetLossPct, setPacketLossPct] = useState(20);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(5);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [activePackets, setActivePackets] = useState<LoRaPacket[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>(['Ready. Receiver starts empty; every preview comes from received bytes.']);
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [error, setError] = useState('');
  const nodesRef = useRef(nodes);
  const controller = useRef<AbortController | null>(null);
  const transferCounter = useRef(0);
  const urls = useRef<string[]>([]);
  const demoRunning = useRef(false);
  const demoGeneration = useRef(0);
  const links = INITIAL_LINKS;
  const isReceiving = activePackets.some(p => p.type === 'ack');
  const inspectedMessage = messages.find(m => m.id === inspectedId) ?? null;
  const totalSent = messages.reduce((n, m) => n + (m.transmissionCount ?? 0), 0);
  const totalDelivered = messages.filter(m => m.status === 'delivered_verified').length;
  const totalDropped = messages.reduce((n, m) => n + (m.droppedTransmissions ?? 0), 0);
  const fecRecoveries = messages.reduce((n, m) => n + (m.fecRecovered ?? 0), 0);
  const activeRoutePath = activePackets[0]?.routeHistory ?? findRoutePath('node-alpha-01', 'node-echo-05', nodes, links, radioConfig.maxRangeKm);
  useEffect(() => () => { controller.current?.abort(); urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const addLog = (text: string) => setEventLogs(prev => [`${new Date().toLocaleTimeString()} · ${text}`, ...prev].slice(0, 80));

  const send = async (params: SendParams, settings = { radio: radioConfig, loss: packetLossPct, speed: simSpeedMultiplier }, seed?: number) => {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    setIsTransmitting(true); setError('');
    const transfer = ++transferCounter.current, id = `msg_${transfer}`;
    let started = false;
    try {
      const prepared: PreparedMedia = params.prepared ?? (params.type === 'text' ? encodeText(params.text) : params.type === 'voice' ? await prepareVoice(params.audioPresetId) : params.type === 'video_burst' ? await prepareVideo(params.customVideoUrl ?? DEMO_VIDEO) : await prepareImage(params.customPhotoUrl ?? PRESET_PHOTOS[0].imageUrl));
      if (abort.signal.aborted) return;
      const frames = packetize(prepared.bytes, transfer);
      const route = findRoutePath('node-alpha-01', 'node-echo-05', nodesRef.current, links, settings.radio.maxRangeKm);
      const message: MeshMessage = {
        id, senderNodeId: 'node-alpha-01', receiverNodeId: 'node-echo-05', senderCallsign: 'ALPHA-01', receiverCallsign: 'ECHO-05',
        timestamp: Date.now(), type: prepared.kind, textPayload: params.text,
        totalBytesRaw: prepared.rawBytes, compressedBytes: prepared.bytes.length,
        totalPackets: frames.length, packetsReceived: 0, receivedChunks: new Map(),
        status: 'transmitting', statusDetail: 'Queued for the radio', etaSecondsRemaining: 0,
        routePath: route, hopRecords: [], useFec: params.useFec,
        crc16Checksum: hexCrc(crc16(prepared.bytes)), isCrcVerified: false, receiverVerified: false,
        startTime: Date.now(), retransmittedPacketsCount: 0, codecLabel: prepared.label,
        audioData: prepared.kind === 'voice' ? { durationSec: prepared.durationSec, sampleRate: 16000, speechTokens: '', rawPcmWaveform: [], frequencyHz: [] } : undefined,
      };
      setMessages(prev => [message, ...prev]); started = true;
      addLog(`Queued ${prepared.bytes.length} actual bytes in ${frames.length} frames · ${route.length ? route.length - 1 : 0} hops${seed !== undefined ? ` · reproducible seed ${seed}` : ''}`);
      let receivedAudioUrl: string | undefined;
      let lastPreviewWidth = 0;
      let previousPrefixLength = -1;
      let cachedPreview: ReturnType<typeof renderReceivedPreview>;
      let cachedVideo: ReturnType<typeof renderReceivedVideo> = [];
      const onEvent = (e: TransportEvent) => {
        if (abort.signal.aborted) return;
        if (e.kind !== 'hop') addLog(e.message);
        if (e.kind === 'tx' && e.frame && e.route) {
          const f = e.frame;
          setActivePackets([{ packetId: `${transfer}-${e.stats.transmissionCount}`, messageId: id, seqIndex: f.seq,
            totalChunks: f.total, type: f.kind === 'data' ? prepared.kind : f.kind === 'parity' ? 'fec_parity' : f.kind === 'probe' ? 'nack' : 'ack',
            sourceNodeId: e.route[0], targetNodeId: e.route.at(-1)!, currentHopNodeId: e.from!, nextHopNodeId: e.to!,
            hopIndex: e.hop!, totalHops: e.route.length - 1, payloadBytes: f.body.length + 18,
            dataHexSnippet: '', crc16: hexCrc(f.checksum), crcValid: true, state: 'transmitting', routeHistory: e.route,
            sentAt: Date.now(), retryCount: e.stats.retries,
          }]);
        } else if (e.kind === 'receive' || e.kind === 'drop' || e.kind === 'ack') setActivePackets([]);
        const decoded = e.receiver.output ? decodeMedia(e.receiver.output) : undefined;
        if (decoded?.kind === 'voice' && !receivedAudioUrl) {
          receivedAudioUrl = URL.createObjectURL(new Blob([new Uint8Array(decoded.data)], { type: decoded.mime })); urls.current.push(receivedAudioUrl);
        }
        const prefix = e.receiver.prefix();
        if (prefix.length !== previousPrefixLength) {
          previousPrefixLength = prefix.length;
          if (prepared.kind === 'image') cachedPreview = renderReceivedPreview(prefix);
          if (prepared.kind === 'video_burst') cachedVideo = renderReceivedVideo(prefix);
        }
        const preview = cachedPreview;
        const receivedChunks = new Map<number, LoRaPacket>();
        e.receiver.chunks.forEach((bytes, seq) => receivedChunks.set(seq, { seqIndex: seq, payloadBytes: bytes.length, chunkData: bytes.slice(), crcValid: true } as LoRaPacket));
        setMessages(prev => prev.map(m => {
          if (m.id !== id) return m;
          const hops = [...m.hopRecords];
          if (e.from && e.to && e.frame?.kind === 'data') {
            let index = hops.findIndex(h => h.fromNodeId === e.from && h.toNodeId === e.to);
            if (index < 0) { const link = getLinkBetween(e.from, e.to, links); index = hops.length; hops.push({ fromNodeId: e.from, toNodeId: e.to, rssiDbm: link.rssiDbm, snrDb: link.snrDb, latencyMs: 0, droppedCount: 0, success: false }); }
            hops[index] = { ...hops[index], droppedCount: hops[index].droppedCount + (e.kind === 'drop' ? 1 : 0), success: e.kind === 'hop' || hops[index].success, latencyMs: hops[index].latencyMs + (e.kind === 'tx' ? calculatePacketAirtimeMs(e.frame.body.length + 18, settings.radio) : 0) };
          }
          const remaining = frames.length - receivedChunks.size;
          const hopsCount = Math.max(1, route.length - 1);
          const eta = Math.ceil(((remaining * calculatePacketAirtimeMs(230, settings.radio) * hopsCount / Math.pow(1 - settings.loss / 100, hopsCount)) + 1000) / settings.speed / 1000);
          return { ...m, ...e.stats, retransmittedPacketsCount: e.stats.retries, droppedTransmissions: e.stats.dropped,
            fecRecovered: e.receiver.recovered, packetsReceived: receivedChunks.size, receivedChunks,
            receiverVerified: e.receiver.verified, receivedAudioUrl,
            receivedVideoFrames: prepared.kind === 'video_burst' ? cachedVideo : undefined,
            receivedText: decoded?.kind === 'text' ? new TextDecoder().decode(decoded.data) : undefined,
            receivedImageUrl: preview?.url ?? m.receivedImageUrl, previewWidth: preview?.width ?? m.previewWidth,
            routePath: e.route && e.frame?.kind === 'data' ? e.route : m.routePath, hopRecords: hops,
            status: e.receiver.verified ? 'awaiting_ack' : e.kind === 'drop' || e.kind === 'retry' ? 'packet_loss_recovering' : 'relaying',
            statusDetail: e.receiver.verified ? 'Receiver verified all bytes. Waiting for its receipt to reach the sender.' : `${receivedChunks.size}/${frames.length} chunks at receiver. ${e.kind === 'drop' ? 'Loss detected; retry pending.' : 'Transfer in progress.'}`,
            etaSecondsRemaining: eta,
          };
        }));
        if (preview && preview.width > lastPreviewWidth) { lastPreviewWidth = preview.width; addLog(`Receiver decoded ${preview.width} × ${preview.width * 3 / 4} thumbnail from received bytes`); }
      };
      const result = await runTransfer({ payload: prepared.bytes, transfer, source: message.senderNodeId, target: message.receiverNodeId,
        network: () => ({ nodes: nodesRef.current, links }), radio: settings.radio, lossPct: settings.loss, speed: settings.speed,
        fec: params.useFec, signal: abort.signal, random: seed === undefined ? Math.random : seededRandom(seed), onEvent });
      if (abort.signal.aborted) return;
      setMessages(prev => prev.map(m => m.id !== id ? m : { ...m,
        status: result.delivered ? 'delivered_verified' : 'failed', isCrcVerified: result.delivered,
        statusDetail: result.delivered ? 'Delivered: reassembled bytes passed CRC-16 and the receipt reached the sender.' : 'Retry limit reached. Delivery is not confirmed.',
        etaSecondsRemaining: 0, completedTime: Date.now(),
      }));
      addLog(result.delivered ? `DELIVERED · ${prepared.bytes.length} payload bytes · ${result.stats.wireBytes} frame bytes over all hops · ${(result.stats.radioAirtimeMs / 1000).toFixed(1)}s radio time` : 'Delivery unconfirmed: retry limit reached');
    } catch (cause) {
      const detail = abort.signal.aborted ? 'Cancelled. Delivery is not confirmed.' : (cause as Error).message;
      if (started) setMessages(prev => prev.map(m => m.id === id ? { ...m, status: abort.signal.aborted ? 'cancelled' : 'failed', statusDetail: detail, etaSecondsRemaining: 0 } : m));
      if (!abort.signal.aborted) { setError(detail); addLog(detail); }
    } finally {
      if (controller.current === abort) { controller.current = null; setIsTransmitting(false); setActivePackets([]); }
    }
  };
  const handleSendMessage = (params: SendParams) => { if (!demoRunning.current) void send(params); };
  const handleTriggerDemoScenario = async (scenario: 'voice_loss' | 'progressive_recon' | 'fec_recovery' | 'extreme_slow' | 'full_demo') => {
    if (controller.current || demoRunning.current) return;
    demoRunning.current = true;
    const generation = ++demoGeneration.current;
    const settings = { radio: scenario === 'extreme_slow' ? RADIO_PRESETS.extreme_slow : RADIO_PRESETS.medium_fast, loss: 20, speed: scenario === 'extreme_slow' ? 10 : 5 };
    setRadioConfig(settings.radio); setPacketLossPct(20); setSimSpeedMultiplier(settings.speed);
    try {
      if (scenario === 'extreme_slow') await send({ type: 'text', text: 'Base camp, we are safe at the ridge.', useFec: true }, settings, 42);
      else if (scenario === 'progressive_recon') await send({ type: 'image', text: 'The mountain pass', useFec: true }, settings, 73);
      else {
        await send({ type: 'voice', text: 'A check-in from the ridge', useFec: scenario !== 'voice_loss' }, settings, 42);
        if (scenario === 'full_demo' && demoRunning.current && generation === demoGeneration.current) await send({ type: 'image', text: 'The mountain pass', useFec: true }, settings, 73);
      }
    } finally { if (generation === demoGeneration.current) demoRunning.current = false; }
  };
  const handleResetSimulation = () => {
    demoGeneration.current++; demoRunning.current = false; controller.current?.abort(); controller.current = null;
    setIsTransmitting(false); setActivePackets([]); setMessages([]); setError(''); setInspectedId(null);
    urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = [];
    nodesRef.current = INITIAL_NODES; setNodes(INITIAL_NODES); setEventLogs(['Reset. Receiver buffers and pending transmissions cleared.']);
  };
  const handleToggleNodeStatus = (nodeId: string) => {
    const updated = nodesRef.current.map(n => n.id === nodeId ? { ...n, isOnline: !n.isOnline } : n);
    nodesRef.current = updated; setNodes(updated);
    addLog(`${nodeId} ${updated.find(n => n.id === nodeId)?.isOnline ? 'online' : 'offline'} · next packet recalculates its route`);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-zinc-900 flex flex-col font-sans">
      <header className="app-header sticky top-0 z-40">
        <div className="mx-auto max-w-[1400px] px-5 sm:px-10 h-[72px] flex items-center justify-between gap-6">
          <a href="#" className="flex items-center gap-2.5 text-zinc-900" aria-label="Chrp home">
            <div className="brand-mark"><Radio className="w-5 h-5" /></div>
            <span className="text-[23px] font-semibold tracking-[-0.06em]">chrp<span className="text-blue-600">.</span></span>
          </a>
          <nav aria-label="Main navigation" className="hidden sm:flex items-center gap-8 text-[13px] text-zinc-500">
            <a href="#hardware">Hardware</a>
            <a href="#topology">Network</a>
            <a href="#survival">Explore</a>
            <a href="#status">Activity</a>
          </nav>
          <button onClick={() => { document.getElementById('simulator')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); void handleTriggerDemoScenario('full_demo'); }} disabled={isTransmitting} className="primary-button">
            <Play className="w-3 h-3 fill-current" />
            {isTransmitting ? 'Sending…' : 'Run live demo'}
          </button>
        </div>
      </header>

      <HardwareReveal />

      <section id="simulator" className="intro mx-auto w-full max-w-[1400px] px-6 sm:px-10 pt-12 pb-9">
        <div>
          <p className="text-[12px] font-medium tracking-[0.12em] text-zinc-500 mb-3">CHRP / OFF-GRID MESSAGING</p>
          <h2 className="text-[38px] sm:text-[52px] leading-[1.07] font-semibold tracking-[-0.055em] text-zinc-900">A little further.<br /><span className="text-zinc-400">Still connected.</span></h2>
          <p className="mt-5 text-[15px] leading-relaxed text-zinc-500 max-w-md">A message can go a long way. Explore how voice, photos, and a few words travel beyond cellular coverage.</p>
        </div>
        <div className="connection-pill"><span className="status-dot" /> {nodes.filter(n => n.isOnline).length} nodes online <span className="text-zinc-300">/</span> Live simulation</div>
      </section>

      {error && <div role="alert" className="mx-auto w-full max-w-[1320px] px-5 pb-5 text-sm text-rose-600">{error}</div>}
      <div className="mx-auto w-full max-w-[1400px] px-6 sm:px-10 pb-5 text-xs text-zinc-500">
        Real bytes · 230 B frames · 3-hop default route · {packetLossPct}% loss per hop · {simSpeedMultiplier}× playback.
        Voice uses Opus; photos are lossy thumbnails; video sends three keyframes. Radio timing is an approximation.
        {isTransmitting && <button className="ml-3 text-rose-600 underline" onClick={() => { demoGeneration.current++; demoRunning.current = false; controller.current?.abort(); }}>Cancel transfer</button>}
      </div>
      {/* Main Workspace: Dual-Pane Desktop Layout (iPhone Messenger on Left + Tactical Mesh Console on Right) */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-10 pb-12 grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start">
        {/* LEFT COLUMN: iPhone 16 Pro Device Frame (4.5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center phone-column">
          <div className="w-full max-w-[390px] mb-2 flex items-center justify-between text-xs text-zinc-500 px-2 tabular-nums">
            <span>Your conversation</span>
            <span className="text-blue-600 font-semibold">Connected via Chrp</span>
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
              onOpenRouteInspector={(msg) => setInspectedId(msg.id)}
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
        <div className="lg:col-span-7 space-y-6">
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
              maxRangeKm={radioConfig.maxRangeKm}
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
        onClose={() => setInspectedId(null)}
      />

      {/* Clean Unboxed Editorial Footer */}
      <footer className="mt-auto border-t border-zinc-200 bg-zinc-50 px-6 py-4 text-xs text-zinc-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span>Designed for the way out there.</span>
          <span aria-hidden="true">·</span>
          <span>Chrp mesh simulator</span>
          <span aria-hidden="true">·</span>
          <span>No cell service needed</span>
        </div>
        <div className="text-zinc-500 tabular-nums text-[11px]">
          Made to keep you connected.
        </div>
      </footer>
    </div>
  );
}
