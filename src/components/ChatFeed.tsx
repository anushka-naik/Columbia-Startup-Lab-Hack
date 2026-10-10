import React, { useEffect, useRef, useState } from 'react';
import { Activity, CheckCheck, Clock3, Image as ImageIcon, MapPinned, Mic, Radio, ShieldCheck, TriangleAlert, Video } from 'lucide-react';
import { MeshMessage, MeshNode } from '../types/mesh';
import { decodeVideoBurst } from '../utils/imageCodec';

interface ChatFeedProps {
  messages: MeshMessage[];
  nodes: MeshNode[];
  onOpenRouteInspector: (message: MeshMessage) => void;
}

const statusColor: Record<MeshMessage['status'], string> = {
  queued: 'text-slate-300', transmitting: 'text-amber-300', packet_loss_recovering: 'text-rose-300',
  reassembling: 'text-cyan-300', delivered_verified: 'text-emerald-300', paused: 'text-amber-300', failed: 'text-rose-300',
};

function RecoveredVideo({ message }: { message: MeshMessage }) {
  const [frames, setFrames] = useState<{ timeMs: number; src: string; width: number; height: number }[]>([]);
  const frameUrls = useRef<string[]>([]);
  useEffect(() => {
    if (!message.isIntegrityVerified || !message.receivedUrl) return;
    let stale = false;
    fetch(message.receivedUrl).then(response => response.arrayBuffer()).then(buffer => {
      const decoded = decodeVideoBurst(new Uint8Array(buffer));
      if (stale) decoded.forEach(frame => URL.revokeObjectURL(frame.src)); else { frameUrls.current = decoded.map(frame => frame.src); setFrames(decoded); }
    }).catch(() => setFrames([]));
    return () => { stale = true; frameUrls.current.forEach(URL.revokeObjectURL); frameUrls.current = []; };
  }, [message.id, message.receivedUrl, message.isIntegrityVerified]);

  return <div className="grid grid-cols-2 gap-1.5 rounded-lg overflow-hidden" aria-label="Video keyframe storyboard">
    {frames.map(frame => <figure key={`${frame.timeMs}-${frame.src}`} className="relative m-0"><img src={frame.src} alt={`Received video frame at ${(frame.timeMs / 1000).toFixed(1)} seconds`} className="w-full aspect-video object-cover bg-black" /><figcaption className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] text-white">{(frame.timeMs / 1000).toFixed(1)} s</figcaption></figure>)}
    {!frames.length && <div className="text-[10px] text-slate-400">Waiting for the full keyframe burst to arrive and verify.</div>}
  </div>;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({ messages, nodes, onOpenRouteInspector }) => {
  const onlineRelays = nodes.filter(node => node.isOnline).length;
  const mediaUrls = useRef(new Set<string>());
  useEffect(() => {
    const currentUrls = new Set(messages.flatMap(message => message.receivedUrl ? [message.receivedUrl] : []));
    mediaUrls.current.forEach(url => { if (!currentUrls.has(url)) URL.revokeObjectURL(url); });
    mediaUrls.current = currentUrls;
  }, [messages]);
  useEffect(() => () => mediaUrls.current.forEach(URL.revokeObjectURL), []);
  return <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 scroll-smooth">
    <div className="text-center"><span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-800 text-[10px] font-medium tracking-wide text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{onlineRelays} mesh nodes online</span></div>
    {!messages.length && <div className="h-40 flex flex-col items-center justify-center text-center px-4 text-slate-400"><MapPinned className="w-7 h-7 text-amber-400/60 mb-2" /><div className="text-xs font-semibold text-white">Nothing sent yet</div><p className="text-[10px] leading-relaxed mt-1 max-w-[230px]">Record a voice note, choose a photo or clip, or send a text. The preview appears after the receiver has the bytes.</p></div>}
    {messages.map(message => {
      const progress = message.totalPackets ? Math.min(1, message.packetsReceived / message.totalPackets) : 0;
      const complete = message.status === 'delivered_verified';
      const isSender = message.senderNodeId === 'node-alpha-01';
      const statusIcon = complete ? <CheckCheck className="w-3 h-3" /> : message.status === 'failed' ? <TriangleAlert className="w-3 h-3" /> : message.status === 'transmitting' || message.status === 'packet_loss_recovering' ? <Activity className="w-3 h-3 animate-pulse" /> : <Clock3 className="w-3 h-3" />;
      return <article key={message.id} className={`flex flex-col ${isSender ? 'items-end' : 'items-start'}`}>
        <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500 px-1 mb-1"><span>{message.senderCallsign}</span><span>→</span><span>{message.receiverCallsign}</span><span>·</span><span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div className="w-[94%] rounded-2xl p-3 border border-slate-800 bg-slate-900/90 text-white shadow-lg space-y-2">
          {message.type === 'text' && <p className="m-0 whitespace-pre-wrap break-words text-xs leading-relaxed">{message.isIntegrityVerified ? message.textPayload : 'Text is being carried in the radio packets…'}</p>}
          {message.transcript && <div className="rounded-lg border border-slate-700/80 bg-slate-950/70 px-2.5 py-2"><div className="text-[9px] uppercase tracking-wide text-cyan-300">Received note / caption</div><div className="mt-1 text-[11px] text-slate-100">{message.transcript}</div></div>}

          {message.type === 'voice' && <div className="space-y-2">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Mic className="w-4 h-4 text-amber-300" /><div><div className="text-xs font-semibold">Voice note</div><div className="text-[9px] font-mono text-slate-400">{message.codecLabel ?? 'Codec2 encoded audio'}</div></div></div><div className="text-[9px] font-mono text-right text-slate-400">{message.compressedBytes.toLocaleString()} wire B<br />{message.totalBytesRaw.toLocaleString()} PCM B</div></div>
            {message.receivedUrl && message.isIntegrityVerified ? <audio className="w-full h-9" controls preload="none" src={message.receivedUrl} aria-label="Verified audio reconstructed from received Codec2 packets" /> : <div className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-[10px] text-slate-400">{message.packetsReceived ? `${message.packetsReceived} packet${message.packetsReceived === 1 ? '' : 's'} received · audio will play after complete decode.` : 'No audio bytes confirmed at the receiver yet.'}</div>}
          </div>}

          {message.type === 'image' && <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold"><ImageIcon className="w-3.5 h-3.5 text-cyan-300" />Photo preview</div>
            {message.receivedUrl && message.isIntegrityVerified ? <img src={message.receivedUrl} alt={message.transcript || 'Photo preview reconstructed from radio packets'} className="w-full max-h-48 rounded-lg object-contain bg-black" /> : <div className="aspect-[4/3] rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-center px-5 text-[10px] text-slate-500">{message.packetsReceived ? 'Image packets received · the encoded image is not complete yet.' : 'The image appears after all required bytes arrive and decode.'}</div>}
            {message.isIntegrityVerified && message.mediaWidth && <div className="text-[9px] font-mono text-slate-400">Decoded {message.mediaWidth} × {message.mediaHeight} · {message.mediaMimeType}</div>}
          </div>}

          {message.type === 'video_burst' && <div className="space-y-2"><div className="flex items-center gap-1.5 text-xs font-semibold"><Video className="w-3.5 h-3.5 text-violet-300" />Video keyframe burst</div><RecoveredVideo message={message} /><div className="text-[9px] text-slate-400">Timestamped keyframes from the received clip · this view is a storyboard, not continuous video playback.</div></div>}

          <div className="space-y-1.5 border-t border-slate-800 pt-2">
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-400"><span>Data chunks at receiver · {message.packetsReceived}/{message.totalPackets}</span><span>{Math.round(progress * 100)}%</span></div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-400' : message.status === 'failed' ? 'bg-rose-400' : 'bg-amber-400'}`} style={{ width: `${progress * 100}%` }} /></div>
            <div className={`flex items-start gap-1 text-[9px] leading-relaxed ${statusColor[message.status]}`}>{complete ? <ShieldCheck className="w-3 h-3 shrink-0 mt-0.5" /> : statusIcon}<span>{message.statusDetail}</span></div>
            {!complete && message.totalPackets > 0 && message.etaSecondsRemaining > 0 && <div className="text-[9px] font-mono text-slate-400">Expected ~{message.etaSecondsRemaining}s remaining at current radio rate · {message.routePath.length - 1} hops</div>}
            {message.useFec && <div className="text-[9px] text-violet-300">XOR parity enabled · {message.retransmittedPacketsCount} data retransmissions</div>}
            <button onClick={() => onOpenRouteInspector(message)} className="flex items-center gap-1 text-[9px] text-cyan-300 hover:text-cyan-200"><Radio className="w-3 h-3" />Inspect route and byte accounting</button>
          </div>
        </div>
      </article>;
    })}
  </div>;
};
