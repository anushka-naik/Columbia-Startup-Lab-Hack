import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, Info, Play, Radio, Shield, TriangleAlert, Waves } from 'lucide-react';
import { MessageComposer, SendMessageParams } from './components/MessageComposer';
import { PhoneContainer } from './components/PhoneContainer';
import { ChatFeed } from './components/ChatFeed';
import { MeshMap } from './components/MeshMap';
import { NetworkControls } from './components/NetworkControls';
import { PacketTracer } from './components/PacketTracer';
import { RouteInspectorModal } from './components/RouteInspectorModal';
import { LoRaPacket, LoRaPreset, MeshLink, MeshMessage, MeshNode, RADIO_PRESETS, RadioConfig } from './types/mesh';
import { calculatePacketAirtimeMs, findRoutePath, generateCrc16, getLinkBetween, INITIAL_LINKS, INITIAL_NODES } from './utils/meshEngine';
import { decodeCodec2, encodeCodec2 } from './utils/audioCodec';
import { decodeVideoBurst, encodeImage, encodeVideoBurst, PRESET_PHOTOS } from './utils/imageCodec';
import { assembleChunks, bytesToHex, chunkBytes, createXorParity, MEDIA_CHUNK_BYTES, recoverSingleMissingChunk, sha256Hex } from './utils/packetCodec';

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, Math.max(5, ms)));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
const asOwnedBytes = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => Uint8Array.from(bytes);

function estimateRouteSeconds(packetCount: number, route: string[], radio: RadioConfig, lossPct: number, speed: number): number {
  if (packetCount <= 0 || route.length < 2) return 0;
  const airtimeMs = calculatePacketAirtimeMs(230, radio);
  let attemptAirtimeMs = 0;
  let routeSuccess = 1;
  for (let hop = 0; hop < route.length - 1; hop++) {
    const hopLoss = lossPct / 100;
    attemptAirtimeMs += routeSuccess * airtimeMs;
    routeSuccess *= 1 - hopLoss;
  }
  if (routeSuccess <= 0) return 0;
  // Expected retries restart at the source after any hop loses the packet.
  return Math.ceil(packetCount * attemptAirtimeMs / routeSuccess / Math.max(1, speed) / 1000);
}

interface WireManifest {
  type: SendMessageParams['type'];
  note: string;
  codec?: string;
  mimeType: string;
  width?: number;
  height?: number;
  durationSec?: number;
  frames?: number;
}

export default function App() {
  const [nodes, setNodes] = useState<MeshNode[]>(INITIAL_NODES);
  const [links] = useState<MeshLink[]>(INITIAL_LINKS);
  const [radioConfig, setRadioConfig] = useState<RadioConfig>(RADIO_PRESETS.medium_fast);
  const [packetLossPct, setPacketLossPct] = useState(20);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(10);
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [activePackets, setActivePackets] = useState<LoRaPacket[]>([]);
  const [eventLogs, setEventLogs] = useState<string[]>(['Offline mesh ready · six virtual radios · content remains on this device.']);
  const [inspectedMessage, setInspectedMessage] = useState<MeshMessage | null>(null);
  const [selectedNode, setSelectedNode] = useState<MeshNode | null>(INITIAL_NODES[0]);
  const [totalSent, setTotalSent] = useState(0);
  const [totalDelivered, setTotalDelivered] = useState(0);
  const [totalDropped, setTotalDropped] = useState(0);
  const [fecRecoveries, setFecRecoveries] = useState(0);
  const [radioBytes, setRadioBytes] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const live = useRef({ nodes, links, radioConfig, packetLossPct, simSpeedMultiplier, isPaused });
  const activeJobs = useRef(0);
  const controlledFecDemo = useRef(false);

  useEffect(() => { live.current = { nodes, links, radioConfig, packetLossPct, simSpeedMultiplier, isPaused }; }, [nodes, links, radioConfig, packetLossPct, simSpeedMultiplier, isPaused]);
  const isTransmitting = activePackets.length > 0 || preparing || activeJobs.current > 0;
  const isReceiving = activePackets.some(packet => packet.nextHopNodeId === 'node-alpha-01');
  const activeRoutePath = activePackets.length ? activePackets[0].routeHistory : ['node-alpha-01', 'node-relay-02', 'node-relay-03', 'node-echo-05'];

  const addLog = (text: string) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEventLogs(previous => [`[${time}] ${text}`, ...previous].slice(0, 80));
  };

  const updateMessage = (id: string, change: (message: MeshMessage) => MeshMessage) => {
    setMessages(previous => previous.map(message => message.id === id ? change(message) : message));
  };

  const currentRoute = () => findRoutePath('node-alpha-01', 'node-echo-05', live.current.nodes, live.current.links, live.current.radioConfig);

  const transitPacket = async (message: MeshMessage, seqIndex: number, source: Uint8Array, type: MeshMessage['type'] | 'fec_parity' | 'ack', maxAttempts = 6): Promise<boolean> => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (live.current.isPaused) {
        updateMessage(message.id, item => ({ ...item, status: 'paused', statusDetail: 'Paused · waiting for transmission to resume.' }));
        while (live.current.isPaused) await sleep(100);
      }
      const route = type === 'ack'
        ? findRoutePath('node-echo-05', 'node-alpha-01', live.current.nodes, live.current.links, live.current.radioConfig)
        : currentRoute();
      if (route.length < 2) {
        updateMessage(message.id, item => ({ ...item, status: 'paused', statusDetail: 'No in-range route · waiting for a relay.' }));
        await sleep(350);
        continue;
      }
      const packetId = `${message.id}-${seqIndex}-${attempt}-${crypto.randomUUID().slice(0, 5)}`;
      let packetRoute = [route[0]];
      let lost = false;
      for (let hop = 0; hop < route.length - 1; hop++) {
        const from = route[hop]; const to = route[hop + 1];
        const radio = live.current.radioConfig;
        const size = source.length + 24;
        const airtime = calculatePacketAirtimeMs(size, radio);
        const pkt: LoRaPacket = {
          packetId, messageId: message.id, seqIndex, totalChunks: message.totalPackets,
          type, isFecParity: type === 'fec_parity', sourceNodeId: route[0], targetNodeId: route[route.length - 1],
          currentHopNodeId: from, nextHopNodeId: to, hopIndex: hop, totalHops: route.length - 1,
          payloadBytes: size, dataHexSnippet: bytesToHex(source), crc16: generateCrc16(source), crcValid: true,
          state: attempt ? 'retrying' : hop ? 'relaying' : 'transmitting', routeHistory: packetRoute,
          sentAt: Date.now(), retryCount: attempt, chunkData: source,
        };
        setActivePackets([pkt]); setTotalSent(value => value + 1); setRadioBytes(value => value + size);
        updateMessage(message.id, item => ({ ...item, status: 'transmitting', transmittedBytes: item.transmittedBytes + size }));
        await sleep(airtime / Math.max(1, live.current.simSpeedMultiplier));
        if (live.current.isPaused) { hop--; continue; }
        const forcedFecErasure = controlledFecDemo.current && type === 'text' && seqIndex === 1 && attempt === 0 && hop === 0;
        const lossPct = live.current.packetLossPct;
        if (forcedFecErasure || Math.random() < lossPct / 100) {
          if (forcedFecErasure) controlledFecDemo.current = false;
          lost = true; setTotalDropped(value => value + 1);
          const droppedNode = live.current.nodes.find(node => node.id === to)?.callsign ?? to;
          setNodes(previous => previous.map(node => node.id === from ? { ...node, packetsDropped: node.packetsDropped + 1 } : node));
          addLog(`DROP · ${forcedFecErasure ? 'CONTROLLED FEC ERASURE · ' : ''}${type.toUpperCase()} #${seqIndex + 1} at ${droppedNode} · ${forcedFecErasure ? 'one packet intentionally erased for the recovery demo' : `${lossPct}% hop loss`}`);
          updateMessage(message.id, item => ({ ...item, status: 'packet_loss_recovering', statusDetail: `Packet ${seqIndex + 1} lost at ${droppedNode} · retrying over a fresh route`, retransmittedPacketsCount: item.retransmittedPacketsCount + 1 }));
          setActivePackets([]); break;
        }
        if (hop < route.length - 2) {
          setNodes(previous => previous.map(node => node.id === to ? { ...node, packetsRelayed: node.packetsRelayed + 1 } : node));
          packetRoute = [...packetRoute, to];
        }
      }
      setActivePackets([]);
      if (!lost) { setTotalDelivered(value => value + 1); return true; }
      if (attempt < maxAttempts - 1) await sleep(70 / Math.max(1, live.current.simSpeedMultiplier));
    }
    return false;
  };

  const dispatch = async (
    message: MeshMessage,
    wire: Uint8Array,
    metadataBytes: number,
    mediaOffset: number,
    mediaMimeType: string,
    manifestHash: string,
    useFec: boolean,
  ) => {
    const sourceChunks = chunkBytes(wire);
    const parityBlocks = useFec ? createXorParity(sourceChunks) : [];
    const received = new Map<number, Uint8Array>();
    updateMessage(message.id, item => ({ ...item, totalPackets: sourceChunks.length, compressedBytes: wire.length, status: 'transmitting' }));
    addLog(`PACKETIZE · ${wire.length.toLocaleString()} wire bytes into ${sourceChunks.length} data packets · ${MEDIA_CHUNK_BYTES} data bytes per packet · ${message.routePath.length - 1} hop route`);
    if (parityBlocks.length) addLog(`XOR FEC · ${parityBlocks.length} real parity packet${parityBlocks.length === 1 ? '' : 's'} · one erased source packet per group of eight can be reconstructed.`);

    let sentParityBlocks = 0;
    const markReceived = (seq: number, bytes: Uint8Array, recovered = false) => {
      if (received.has(seq)) return;
      received.set(seq, bytes);
      const chunks = new Map(message.receivedChunks);
      chunks.set(seq, { packetId: `${message.id}-rx-${seq}`, messageId: message.id, seqIndex: seq, totalChunks: sourceChunks.length, type: message.type, sourceNodeId: message.senderNodeId, targetNodeId: message.receiverNodeId, currentHopNodeId: message.receiverNodeId, nextHopNodeId: message.receiverNodeId, hopIndex: Math.max(0, message.routePath.length - 2), totalHops: message.routePath.length - 1, payloadBytes: bytes.length + 24, dataHexSnippet: bytesToHex(bytes), crc16: generateCrc16(bytes), crcValid: true, state: recovered ? 'recovered_fec' : 'delivered', routeHistory: message.routePath, sentAt: Date.now(), deliveredAt: Date.now(), retryCount: 0, chunkData: bytes } as LoRaPacket);
        const manifestArrived = [...Array(Math.ceil(metadataBytes / MEDIA_CHUNK_BYTES)).keys()].every(index => received.has(index));
      const receivedBytes = [...received.values()].reduce((sum, chunk) => sum + chunk.length, 0);
      const remainingPackets = sourceChunks.length - received.size + parityBlocks.length - sentParityBlocks + 1;
      const eta = estimateRouteSeconds(remainingPackets, currentRoute(), live.current.radioConfig, live.current.packetLossPct, live.current.simSpeedMultiplier);
      updateMessage(message.id, item => ({
        ...item, receivedChunks: chunks, packetsReceived: received.size,
        transcript: message.type !== 'text' && manifestArrived && item.textPayload ? item.textPayload : item.transcript,
        status: 'transmitting', statusDetail: recovered ? `Recovered packet ${seq + 1} with XOR parity · ${received.size}/${sourceChunks.length} packets at receiver` : `Received ${received.size}/${sourceChunks.length} data packets · ${receivedBytes} bytes`,
        etaSecondsRemaining: eta,
      }));
      if (recovered) { setFecRecoveries(value => value + 1); addLog(`FEC RECOVERY · Reconstructed missing source packet #${seq + 1} from received XOR parity.`); }
    };

    for (let start = 0; start < sourceChunks.length; start += 8) {
      const end = Math.min(sourceChunks.length, start + 8);
      for (let seq = start; seq < end; seq++) {
        const delivered = await transitPacket(message, seq, sourceChunks[seq], message.type, useFec ? 1 : 6);
        if (delivered) markReceived(seq, sourceChunks[seq]);
      }
      const parity = parityBlocks.find(block => block.firstSequence === start);
      if (parity) {
        try {
          const parityDelivered = await transitPacket(message, sourceChunks.length + parity.groupIndex, parity.bytes, 'fec_parity');
          if (!parityDelivered) addLog('FEC PARITY LOST · source chunks remain protected by selective retransmission.');
          else {
            sentParityBlocks++;
            const missing = parity.sourceSequences.filter(seq => !received.has(seq));
            if (missing.length === 1) {
              const rebuilt = recoverSingleMissingChunk(received, parity.bytes, parity.sourceSequences, missing[0]);
              const expectedLength = sourceChunks[missing[0]].length;
              const restored = rebuilt.slice(0, expectedLength);
              sourceChunks[missing[0]] = restored; markReceived(missing[0], restored, true);
            } else if (missing.length > 1) addLog(`FEC BLOCK · ${missing.length} losses exceed one-packet XOR recovery · requesting selective repairs.`);
          }
        } catch { addLog(`FEC PARITY LOST · source chunks remain protected by selective retransmission.`); }
      }
      for (let seq = start; seq < end; seq++) {
        if (!received.has(seq)) {
          const repaired = await transitPacket(message, seq, sourceChunks[seq], message.type);
          if (!repaired) throw new Error(`Packet ${seq + 1} did not reach the receiver after six attempts.`);
          markReceived(seq, sourceChunks[seq]);
        }
      }
    }

    updateMessage(message.id, item => ({ ...item, status: 'reassembling', statusDetail: 'All source packets reached the receiver · verifying the reconstructed message.' }));
    const reconstructed = assembleChunks(received, sourceChunks.length, wire.length);
    if (await sha256Hex(reconstructed) !== manifestHash) throw new Error('The reassembled message failed its SHA-256 integrity check.');
    const view = new DataView(reconstructed.buffer, reconstructed.byteOffset, reconstructed.byteLength);
    const actualManifestLength = view.getUint32(0, false);
    const manifest = JSON.parse(new TextDecoder().decode(reconstructed.subarray(4, 4 + actualManifestLength))) as WireManifest;
    if (4 + actualManifestLength !== mediaOffset || manifest.mimeType !== mediaMimeType) throw new Error('The received media manifest did not match the encoded payload.');
    const media = reconstructed.slice(mediaOffset);

    let receivedUrl: string;
    if (manifest.type === 'voice') {
      const audio = await decodeCodec2(media);
      receivedUrl = URL.createObjectURL(audio);
    } else if (manifest.type === 'video_burst') {
      const frames = decodeVideoBurst(media);
      await Promise.all(frames.map(frame => new Promise<void>((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('A reconstructed video keyframe did not decode.')); image.src = frame.src;
      })));
      receivedUrl = URL.createObjectURL(new Blob([media], { type: 'application/x-chrp-video-burst' }));
    } else if (manifest.type === 'image') {
      const image = new Image(); receivedUrl = URL.createObjectURL(new Blob([media], { type: manifest.mimeType })); image.src = receivedUrl;
      await image.decode();
    } else {
      receivedUrl = '';
    }
    updateMessage(message.id, item => ({ ...item, status: 'reassembling', statusDetail: `Receiver verified SHA-256 and decoded the ${manifest.type} representation · waiting for the receipt to return.`, isIntegrityVerified: true, receivedUrl, codecLabel: manifest.codec, mediaMimeType: manifest.mimeType, mediaWidth: manifest.width, mediaHeight: manifest.height, textPayload: manifest.note || item.textPayload, etaSecondsRemaining: estimateRouteSeconds(1, findRoutePath('node-echo-05', 'node-alpha-01', live.current.nodes, live.current.links, live.current.radioConfig), live.current.radioConfig, live.current.packetLossPct, live.current.simSpeedMultiplier) }));
    const ackNodeSnapshot = live.current.nodes;
    const receiverNode = ackNodeSnapshot.find(node => node.id === message.receiverNodeId);
    if (!receiverNode?.isOnline) throw new Error('Media is verified at the receiver, but its delivery receipt cannot return while the receiver is offline.');
    const ackReceived = await transitPacket(message, sourceChunks.length + parityBlocks.length, new TextEncoder().encode(`ACK:${manifestHash}`), 'ack');
    if (!ackReceived) throw new Error('Receiver verified and decoded the media, but its delivery receipt could not return to the sender.');
    const durationSec = manifest.durationSec;
    updateMessage(message.id, item => ({ ...item, status: 'delivered_verified', statusDetail: `Delivered · receiver reassembled ${wire.length.toLocaleString()} bytes, SHA-256 verified, and decoded the ${manifest.type} representation.`, isIntegrityVerified: true, receivedUrl, codecLabel: manifest.codec, mediaMimeType: manifest.mimeType, mediaWidth: manifest.width, mediaHeight: manifest.height, textPayload: manifest.note || undefined, etaSecondsRemaining: 0, completedTime: Date.now(), isPartial: false }));
    setTotalDelivered(value => value + 1);
    addLog(`DELIVERY RECEIPT · ${receiverNode.callsign} verified and decoded ${manifest.type}${durationSec ? ` (${durationSec.toFixed(1)} s)` : ''} · SHA-256 ${manifestHash.slice(0, 12)}…`);
  };

  const handleSendMessage = async (params: SendMessageParams) => {
    const sender = live.current.nodes.find(node => node.id === 'node-alpha-01');
    const receiver = live.current.nodes.find(node => node.id === 'node-echo-05');
    const route = findRoutePath(sender?.id ?? '', receiver?.id ?? '', live.current.nodes, live.current.links, live.current.radioConfig);
    if (!sender || !receiver || route.length < 2) throw new Error('There is no in-range route to the selected receiver. Bring a relay online or select a longer-range preset.');
    if (activeJobs.current > 0) throw new Error('One shared-radio transfer is already active. Wait for it to finish.');
    activeJobs.current++;
    setPreparing(true);
    let media = new Uint8Array(); let manifest: WireManifest; let sourceBytes = 0;
    try {
      if (params.type === 'voice') {
        if (!params.audioBlob) throw new Error('Record or select an audio file first.');
        addLog('VOICE · Resampling to mono 8 kHz and encoding the real recording with Codec2…');
        const encoded = await encodeCodec2(params.audioBlob, params.codecMode ?? '700');
        media = asOwnedBytes(encoded.bytes); sourceBytes = encoded.pcmBytes;
        manifest = { type: 'voice', note: params.text.trim(), codec: `Codec2 ${encoded.mode === '700' ? '700C' : encoded.mode} · ${encoded.mode} bps`, mimeType: encoded.mimeType, durationSec: encoded.durationSec };
        addLog(`CODEC2 · ${encoded.durationSec.toFixed(1)} seconds · ${media.length.toLocaleString()} encoded bytes · ${Math.ceil(media.length / MEDIA_CHUNK_BYTES)} media packets.`);
      } else if (params.type === 'image') {
        let source = params.imageBlob;
        if (!source) {
          const photo = PRESET_PHOTOS[0]; source = await (await fetch(photo.imageUrl)).blob();
        }
        addLog('IMAGE · Creating an independently decodable WebP preview within the radio budget…');
        const encoded = await encodeImage(source, 1350, 144);
        media = asOwnedBytes(encoded.bytes); sourceBytes = encoded.originalBytes;
        manifest = { type: 'image', note: params.text.trim(), mimeType: encoded.mimeType, width: encoded.width, height: encoded.height };
        addLog(`IMAGE PREVIEW · ${encoded.width}×${encoded.height} · ${media.length.toLocaleString()} WebP bytes from ${sourceBytes.toLocaleString()} source bytes.`);
      } else if (params.type === 'video_burst') {
        if (!params.videoBlob) throw new Error('Select a video clip first.');
        addLog('VIDEO · Extracting and compressing up to five genuine keyframes…');
        const encoded = await encodeVideoBurst(params.videoBlob);
        media = asOwnedBytes(encoded.bytes); sourceBytes = encoded.originalBytes;
        manifest = { type: 'video_burst', note: params.text.trim(), mimeType: encoded.mimeType, frames: encoded.frameCount, durationSec: encoded.durationSec };
        addLog(`VIDEO BURST · ${encoded.frameCount} keyframes over ${encoded.durationSec.toFixed(1)} seconds · ${media.length.toLocaleString()} bytes.`);
      } else {
        media = new TextEncoder().encode(params.text);
        sourceBytes = media.length;
        manifest = { type: 'text', note: '', mimeType: 'text/plain; charset=utf-8' };
      }
      const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
      const lengthPrefix = new Uint8Array(4); new DataView(lengthPrefix.buffer).setUint32(0, manifestBytes.length, false);
      const metadataBytes = 4 + manifestBytes.length;
      const wire = concat(lengthPrefix, manifestBytes, media);
      const chunks = chunkBytes(wire);
      const parityCount = params.useFec ? createXorParity(chunks).length : 0;
      const initialEta = estimateRouteSeconds(chunks.length + parityCount + 1, route, live.current.radioConfig, live.current.packetLossPct, live.current.simSpeedMultiplier);
      const wireHash = await sha256Hex(wire);
      const messageId = `chrp-${crypto.randomUUID()}`;
      const emptyMap = new Map<number, LoRaPacket>();
      const queued: MeshMessage = {
        id: messageId, senderNodeId: sender.id, receiverNodeId: receiver.id, senderCallsign: sender.callsign, receiverCallsign: receiver.callsign,
        timestamp: Date.now(), type: params.type, textPayload: params.text, transcript: undefined,
        totalBytesRaw: sourceBytes, compressedBytes: wire.length, totalPackets: chunkBytes(wire).length, packetsReceived: 0,
        receivedChunks: emptyMap, status: 'queued', statusDetail: 'Queued on the local radio · receiver has not received this content yet.',
        etaSecondsRemaining: initialEta, routePath: route, hopRecords: route.slice(0, -1).map((from, index) => {
          const link = getLinkBetween(from, route[index + 1], live.current.links);
          return { fromNodeId: from, toNodeId: route[index + 1], rssiDbm: link.rssiDbm, snrDb: link.snrDb, latencyMs: calculatePacketAirtimeMs(230, live.current.radioConfig), droppedCount: 0, success: false };
        }),
        useFec: params.useFec, integrityHashLabel: `SHA-256 ${wireHash.slice(0, 16)}`, isIntegrityVerified: false,
        startTime: Date.now(), retransmittedPacketsCount: 0, transmittedBytes: 0,
        sourceUrl: undefined,
        mediaMimeType: manifest.mimeType, mediaWidth: manifest.width, mediaHeight: manifest.height, codecLabel: manifest.codec,
      };
      setMessages(previous => [queued, ...previous]);
      setPreparing(false);
      dispatch(queued, wire, metadataBytes, metadataBytes, manifest.mimeType, wireHash, params.useFec).catch(error => {
        const detail = error instanceof Error ? error.message : 'Transfer failed.';
        updateMessage(messageId, item => ({ ...item, status: 'failed', statusDetail: `${detail} · verified delivery was not confirmed.` }));
        addLog(`TRANSFER INCOMPLETE · ${detail}`);
      }).finally(() => { activeJobs.current = Math.max(0, activeJobs.current - 1); });
    } catch (error) {
      activeJobs.current = Math.max(0, activeJobs.current - 1);
      setPreparing(false);
      throw error;
    }
  };

  const triggerScenario = (scenario: 'voice_loss' | 'progressive_recon' | 'fec_recovery' | 'extreme_slow') => {
    const nextLoss = scenario === 'fec_recovery' ? 0 : 20;
    const nextRadio = scenario === 'extreme_slow' ? RADIO_PRESETS.extreme_slow : RADIO_PRESETS.medium_fast;
    setPacketLossPct(nextLoss); setRadioConfig(nextRadio); setSimSpeedMultiplier(10);
    live.current = { ...live.current, packetLossPct: nextLoss, radioConfig: nextRadio, simSpeedMultiplier: 10 };
    if (scenario === 'voice_loss') { addLog('VOICE DEMO · Record a real voice note with the microphone button; the selected Codec2 profile and 20% hop loss will be applied.'); return; }
    if (scenario === 'fec_recovery') { controlledFecDemo.current = true; addLog('FEC DEMO · Background loss is set to 0%; the demo intentionally erases one source packet so its received parity can visibly recover it.'); }
    if (scenario === 'progressive_recon') {
      const photo = PRESET_PHOTOS[0];
      void handleSendMessage({ type: 'image', text: photo.description, imageBlob: undefined, imageName: photo.title, useFec: true }).catch(error => addLog(error instanceof Error ? error.message : 'Could not start image demo.'));
      return;
    }
    const text = scenario === 'fec_recovery'
      ? 'XOR parity demo: this message is intentionally larger than one LoRa packet. Every byte is split into 206-byte source chunks, then one XOR repair packet is sent for the group. If exactly one source packet is erased and the remaining source chunks plus parity arrive, the receiver reconstructs the missing bytes before SHA-256 verification. '.repeat(2)
      : 'Long range link selected. This text message still waits for a receiver receipt.';
    void handleSendMessage({ type: 'text', text, useFec: true }).catch(error => addLog(error instanceof Error ? error.message : 'Could not start mesh demo.'));
  };

  const reset = () => {
    setActivePackets([]); setNodes(INITIAL_NODES); setMessages([]); setEventLogs(['Simulation reset · no previous receiver content is retained.']);
    setTotalSent(0); setTotalDelivered(0); setTotalDropped(0); setFecRecoveries(0); setRadioBytes(0); setPreparing(false);
  };

  const toggleNode = (id: string) => setNodes(previous => previous.map(node => node.id === id ? { ...node, isOnline: !node.isOnline } : node));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="flex items-center justify-between gap-5 px-5 py-3 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-40">
        <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center"><Radio className="w-4 h-4" /></div><div><div className="text-sm font-bold text-white">CHRP Off‑Grid</div><div className="text-[9px] text-emerald-300 font-mono">LOCAL MESH · NO CELLULAR · NO WI‑FI</div></div></div>
        <nav className="hidden lg:flex items-center gap-5 text-[11px] text-slate-400"><a href="#phone" className="hover:text-white">Messages</a><a href="#topology" className="hover:text-white">Mesh</a><a href="#network" className="hover:text-white">Radio settings</a><a href="#telemetry" className="hover:text-white">Packet log</a></nav>
        <button onClick={() => triggerScenario('progressive_recon')} disabled={isTransmitting} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold bg-amber-400 text-slate-950 disabled:opacity-50"><Play className="w-3 h-3 fill-current" />Run image demo</button>
      </header>

      <main className="flex-1 w-full max-w-[1500px] mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section id="phone" className="lg:col-span-5 flex flex-col items-center w-full"><div className="w-full max-w-[390px] mb-2 flex items-center justify-between text-[10px] text-slate-400 px-2 font-mono"><span>CHRP POUCH RADIO</span><span>{radioConfig.name}</span></div>
          <PhoneContainer radioConfig={radioConfig} isTransmitting={isTransmitting} isReceiving={isReceiving} senderCallsign="ALPHA-01">
            <ChatFeed messages={messages} nodes={nodes} onOpenRouteInspector={setInspectedMessage} />
            <MessageComposer onSendMessage={handleSendMessage} isTransmitting={isTransmitting} recipientCallsign="ECHO-05 · BASE" />
          </PhoneContainer>
        </section>

        <section className="lg:col-span-7 space-y-5 min-w-0">
          <div id="topology"><MeshMap nodes={nodes} links={links} activePackets={activePackets} activeRoutePath={activeRoutePath} onToggleNodeStatus={toggleNode} onSelectNode={setSelectedNode} selectedNodeId={selectedNode?.id} /></div>
          <div id="network"><NetworkControls radioConfig={radioConfig} onSelectPreset={(preset: LoRaPreset) => setRadioConfig(RADIO_PRESETS[preset])} packetLossPct={packetLossPct} onChangeLossPct={setPacketLossPct} simSpeedMultiplier={simSpeedMultiplier} onChangeSimSpeed={setSimSpeedMultiplier} onTriggerDemoScenario={triggerScenario} onResetSimulation={reset} isTransmitting={isTransmitting} isPaused={isPaused} onTogglePause={() => setIsPaused(value => !value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Radio transmissions', value: totalSent, icon: Radio, color: 'text-cyan-300' },
              { label: 'Completed packet routes', value: totalDelivered, icon: Check, color: 'text-emerald-300' },
              { label: 'Lost attempts', value: totalDropped, icon: TriangleAlert, color: 'text-rose-300' },
              { label: 'Parity recoveries', value: fecRecoveries, icon: Shield, color: 'text-violet-300' },
            ].map(stat => <div key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 flex items-center gap-2"><stat.icon className={`w-3.5 h-3.5 ${stat.color}`} /><div><div className="text-base font-mono text-white">{stat.value}</div><div className="text-[9px] text-slate-400">{stat.label}</div></div></div>)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 flex justify-between text-[10px] text-slate-400"><span className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-amber-300" />Total radio bytes across all hops</span><span className="font-mono text-white">{radioBytes.toLocaleString()} B</span></div>
          <div id="telemetry"><PacketTracer activePackets={activePackets} eventLogs={eventLogs} totalSent={totalSent} totalDelivered={totalDelivered} totalDropped={totalDropped} fecRecoveries={fecRecoveries} nodes={nodes} /></div>
          <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 flex gap-2 text-[10px] leading-relaxed text-slate-300"><Info className="w-4 h-4 text-cyan-300 shrink-0" /><span>Audio uses the real Codec2 encoder and decoder loaded locally on first use. Images are real WebP files. Video is sent as timestamped WebP keyframes, not as continuous full‑motion video. A sender sees “Delivered” only after receiver reassembly, integrity verification, decoding, and a returned receipt.</span></div>
        </section>
      </main>

      <RouteInspectorModal message={inspectedMessage} nodes={nodes} onClose={() => setInspectedMessage(null)} />
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 px-6 py-3 text-[10px] text-slate-500 flex items-center justify-between"><span className="flex items-center gap-2"><Waves className="w-3 h-3" />Simulated LoRa · 230-byte MTU · six nodes</span><span>{radioConfig.bitrateBps.toLocaleString()} bps · {simSpeedMultiplier}× simulation speed</span></footer>
    </div>
  );
}
