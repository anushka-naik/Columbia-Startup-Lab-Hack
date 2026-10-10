import React, { useEffect, useRef } from 'react';
import { MeshMessage, MeshNode } from '../types/mesh';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { CHUNK_BYTES, HEADER_BYTES } from '../utils/protocol';
export function RouteInspectorModal({ message, nodes, onClose }: { message: MeshMessage | null; nodes: MeshNode[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (message && !dialog.current?.open) dialog.current?.showModal(); if (!message) dialog.current?.close(); }, [message?.id]);
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }} className="m-auto w-[calc(100%_-_32px)] max-w-2xl rounded-3xl border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/30 backdrop:backdrop-blur-sm">
    {message && <div className="p-6 max-h-[85vh] overflow-y-auto text-zinc-900">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-blue-600">What actually crossed the mesh</p><h2 className="text-xl font-semibold mt-1">Your message’s journey</h2></div><button autoFocus aria-label="Close journey details" onClick={onClose} className="p-2 rounded-full bg-zinc-100"><X className="w-4 h-4" /></button></div>
      <div className="my-5 p-4 bg-zinc-50 rounded-2xl flex gap-3 items-start">{message.isCrcVerified ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />}<div><p className="text-sm">{message.statusDetail}</p><p className="mt-2 text-xs text-zinc-500">Message CRC-16: {message.crc16Checksum} · Receiver {message.receiverVerified ? 'verified' : 'not verified'} · Sender receipt {message.isCrcVerified ? 'confirmed' : 'not confirmed'}</p></div></div>
      <p className="text-xs text-zinc-500 mb-2">Last data route · {Math.max(0, message.routePath.length - 1)} hops</p>
      <p className="text-sm font-medium mb-4 break-words">{message.routePath.map(id => nodes.find(n => n.id === id)?.callsign ?? id).join(' → ') || 'No reachable route'}</p>
      <div className="space-y-2">{message.hopRecords.map(h => <div key={`${h.fromNodeId}-${h.toNodeId}`} className="flex flex-wrap gap-2 justify-between rounded-xl bg-zinc-50 p-3 text-xs"><span>{nodes.find(n => n.id === h.fromNodeId)?.callsign} → {nodes.find(n => n.id === h.toNodeId)?.callsign}</span><span className="text-zinc-500">{h.droppedCount} drops · {h.success ? 'data relayed' : 'no successful relay yet'}</span></div>)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">{[
        ['Encoded message', `${message.compressedBytes.toLocaleString()} B`],
        ['All-hop frame bytes', `${(message.wireBytes ?? 0).toLocaleString()} B`],
        ['Radio airtime', `${((message.radioAirtimeMs ?? 0) / 1000).toFixed(1)} sec`],
        ['Data frames', `${(message.dataWireBytes ?? 0).toLocaleString()} B`],
        ['Parity frames', `${(message.parityWireBytes ?? 0).toLocaleString()} B`],
        ['Probes & receipts', `${(message.controlWireBytes ?? 0).toLocaleString()} B`],
      ].map(([label, value]) => <div className="rounded-xl border border-zinc-200 p-3" key={label}><p className="text-[11px] text-zinc-500">{label}</p><p className="font-semibold tabular-nums mt-1">{value}</p></div>)}</div>
      <p className="text-xs leading-relaxed text-zinc-500 mt-3">All-hop totals include every attempted transmission, dropped frames, headers, retries, parity and receipts. Retransmissions account for {(message.retransmitWireBytes ?? 0).toLocaleString()} B of that total. Radio airtime includes an estimated physical overhead; frame bytes exclude physical preamble symbols. Playback speed does not change these totals.</p>
      <p className="text-xs text-zinc-500 mt-3">{message.codecLabel}. {message.type === 'voice' ? 'Comparison baseline: equivalent 16 kHz, 16-bit mono PCM, not the original recording file.' : message.type === 'image' ? 'Comparison baseline: source image file. Thumbnail quality is intentionally reduced.' : message.type === 'video_burst' ? 'Comparison baseline: source video file. Only three still frames from the first eight seconds are transmitted; motion and audio are discarded.' : 'Text is UTF-8; it is packetized without compression.'}</p>
      <h3 className="text-sm font-semibold mt-5 mb-2">Receiver buffer · {message.packetsReceived}/{message.totalPackets}</h3>
      <p className="text-xs text-zinc-500 mb-3">Each frame has an {HEADER_BYTES} B header and up to {CHUNK_BYTES} B of message data. Green means the receiver has these bytes; only a returned receipt confirms delivery to the sender.</p>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">{Array.from({ length: message.totalPackets }, (_, i) => <div key={i} className={`rounded-lg p-2 text-xs ${message.receivedChunks.has(i) ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}><p>Chunk {i + 1}</p><p className="text-[10px] mt-1">{Math.min(CHUNK_BYTES, message.compressedBytes - i * CHUNK_BYTES)} B · {message.receivedChunks.has(i) ? 'received' : 'missing'}</p></div>)}</div>
    </div>}
  </dialog>;
}
