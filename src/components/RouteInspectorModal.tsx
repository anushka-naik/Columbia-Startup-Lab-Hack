import React from 'react';
import { ArrowDown, CheckCircle2, Clock3, HardDrive, Radio, ShieldCheck, X } from 'lucide-react';
import { MeshMessage, MeshNode } from '../types/mesh';

interface RouteInspectorModalProps { message: MeshMessage | null; nodes: MeshNode[]; onClose: () => void; }

export const RouteInspectorModal: React.FC<RouteInspectorModalProps> = ({ message, nodes, onClose }) => {
  if (!message) return null;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const elapsed = message.completedTime ? (message.completedTime - message.startTime) / 1000 : (Date.now() - message.startTime) / 1000;
  const route = message.routePath.map(id => byId.get(id)?.callsign ?? id);
  return <div role="dialog" aria-modal="true" aria-label="Transfer route and verification" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl text-slate-100">
      <div className="flex justify-between items-start border-b border-slate-800 pb-3"><div><div className="text-[10px] uppercase tracking-wider font-mono text-cyan-300">Transfer inspector</div><h2 className="mt-1 text-base font-bold">{message.type.replace('_', ' ')} · {message.id.slice(-8)}</h2></div><button onClick={onClose} aria-label="Close inspector" className="p-1.5 rounded-lg hover:bg-slate-800"><X className="w-4 h-4" /></button></div>
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-center gap-2 text-xs"><Radio className="w-4 h-4 text-amber-300" /><span className="font-mono">{message.senderCallsign}</span><ArrowDown className="w-3.5 h-3.5 text-slate-500" /><span className="font-mono">{message.receiverCallsign}</span></div><div className="mt-2 flex flex-wrap gap-1">{route.map((node, index) => <span key={`${node}-${index}`} className="rounded bg-slate-800 px-2 py-1 text-[10px] font-mono">{index ? '→ ' : ''}{node}</span>)}</div><div className="mt-2 text-[10px] text-slate-400">Route selected for the transfer. Packet traces record the forwarding hops and retries actually observed.</div></div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="flex gap-1.5 items-center text-[10px] text-slate-400"><HardDrive className="w-3.5 h-3.5" />Encoded wire bytes</div><div className="mt-1 font-mono text-lg">{message.compressedBytes.toLocaleString()} B</div><div className="text-[9px] text-slate-500">Manifest + media representation</div></div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="flex gap-1.5 items-center text-[10px] text-slate-400"><HardDrive className="w-3.5 h-3.5" />Source bytes</div><div className="mt-1 font-mono text-lg">{message.totalBytesRaw.toLocaleString()} B</div><div className="text-[9px] text-slate-500">Original PCM, photo, clip, or text</div></div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="text-[10px] text-slate-400">Data chunks at receiver</div><div className="mt-1 font-mono text-lg">{message.packetsReceived} / {message.totalPackets}</div><div className="text-[9px] text-slate-500">One chunk is 206 B maximum</div></div>
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="text-[10px] text-slate-400">Radio bytes sent</div><div className="mt-1 font-mono text-lg">{message.transmittedBytes.toLocaleString()} B</div><div className="text-[9px] text-slate-500">Across all attempted hops, including retries</div></div>
      </div>
      <div className="mt-3 rounded-xl bg-slate-950 border border-slate-800 p-3"><div className="flex gap-2 items-start">{message.isIntegrityVerified ? <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" /> : <Clock3 className="w-4 h-4 text-amber-300 mt-0.5" />}<div><div className="text-xs font-semibold">{message.statusDetail}</div><div className="mt-1 flex gap-1 items-center text-[10px] font-mono text-slate-400"><ShieldCheck className="w-3 h-3" />{message.integrityHashLabel} · {message.isIntegrityVerified ? 'payload SHA-256 verified and media decoded' : 'payload has not completed receiver verification'}</div></div></div></div>
      <div className="mt-3 flex justify-between text-[10px] text-slate-400"><span>Retransmissions: {message.retransmittedPacketsCount}</span><span>Elapsed: {Math.max(0, elapsed).toFixed(1)} s wall time</span></div>
      <button onClick={onClose} className="mt-4 w-full rounded-lg bg-slate-800 hover:bg-slate-700 py-2 text-xs font-semibold">Close</button>
    </div>
  </div>;
};
