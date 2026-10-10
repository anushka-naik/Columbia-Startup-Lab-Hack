import React, { useState } from 'react';
import { MeshMessage, MeshNode } from '../types/mesh';
import { CheckCheck, Clock, Route, AlertTriangle, Radio } from 'lucide-react';
export function ChatFeed({ messages, onOpenRouteInspector }: { messages: MeshMessage[]; nodes: MeshNode[]; onOpenRouteInspector: (m: MeshMessage) => void }) {
  const [audioError, setAudioError] = useState('');
  return <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 bg-white scroll-smooth">
    <p className="text-center text-[11px] text-zinc-500">Receiver view · only arrived bytes appear here</p>
    {!messages.length && <div className="py-10 px-4 text-center"><Radio className="w-8 h-8 text-blue-500 mx-auto mb-3" /><h2 className="text-sm font-semibold">A fresh connection.</h2><p className="text-xs leading-relaxed text-zinc-500 mt-2">Send a note, record your voice, or share a photo. Watch it find its way to base camp.</p></div>}
    {messages.map(msg => {
      const delivered = msg.status === 'delivered_verified';
      const failed = msg.status === 'failed' || msg.status === 'cancelled';
      const savings = Math.max(0, (1 - msg.compressedBytes / Math.max(1, msg.totalBytesRaw)) * 100);
      return <article key={msg.id} className="space-y-1.5">
        <div className="px-1 text-[11px] text-zinc-500 flex justify-between"><span>You → Base camp</span><span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
        <div className="rounded-2xl bg-blue-50/70 border border-blue-100 p-3 space-y-3">
          <div className="text-[11px] font-medium text-zinc-700">{msg.type === 'text' ? 'Message' : msg.type === 'voice' ? 'Voice note' : msg.type === 'video_burst' ? 'Video keyframes' : 'Photo'} <span className="text-zinc-400">· {msg.compressedBytes.toLocaleString()} B</span></div>
          {msg.type === 'text' && <p className="text-sm leading-relaxed break-words">{msg.receivedText ?? 'Waiting for all text chunks…'}</p>}
          {msg.type === 'voice' && <div className="space-y-2">
            {msg.receivedAudioUrl ? <audio controls preload="metadata" src={msg.receivedAudioUrl} className="w-full h-10" onError={() => setAudioError('This browser cannot play the received codec. Download the verified audio below.')} /> : <div className="py-4 text-xs text-zinc-500 text-center">Audio unlocks after reassembly and checksum verification.</div>}
            <p className="text-[10px] text-zinc-500">{msg.audioData?.durationSec.toFixed(1)} sec · {msg.codecLabel}</p>
            {audioError && msg.receivedAudioUrl && <p className="text-xs text-rose-600">{audioError} <a href={msg.receivedAudioUrl} download="received-voice" className="underline">Download</a></p>}
          </div>}
          {msg.type === 'image' && <div className="space-y-2">
            <div className="h-36 rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center">
              {msg.receivedImageUrl ? <img src={msg.receivedImageUrl} alt={`Received ${msg.previewWidth} pixel thumbnail`} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} /> : <span className="text-xs text-zinc-500">Waiting for the first complete layer…</span>}
            </div>
            <p className="text-[10px] text-zinc-500">{msg.previewWidth ? `${msg.previewWidth} × ${msg.previewWidth * 3 / 4} pixels received` : 'No image data decoded'} · lossy thumbnail</p>
          </div>}
          {msg.type === 'video_burst' && <div className="space-y-2"><div className="grid grid-cols-3 gap-1.5">{[0, 1, 2].map(i => <div key={i} className="bg-zinc-100 rounded-lg overflow-hidden">{msg.receivedVideoFrames?.[i] ? <><img src={msg.receivedVideoFrames[i].url} alt={`Received video frame ${i + 1}`} className="w-full aspect-[4/3] object-contain" style={{ imageRendering: 'pixelated' }} /><p className="text-center text-[10px] py-1">{(msg.receivedVideoFrames[i].timeMs / 1000).toFixed(1)}s</p></> : <div className="aspect-[4/3] flex items-center justify-center text-[10px] text-zinc-400">Waiting</div>}</div>)}</div><p className="text-[10px] text-zinc-500">{msg.receivedVideoFrames?.length ?? 0}/3 keyframes received · 32 × 24 each · no audio</p></div>}
          {msg.type !== 'text' && <p className="text-[10px] text-zinc-500">{savings.toFixed(1)}% smaller than {msg.type === 'voice' ? '16 kHz mono PCM equivalent' : 'the source file'} · headers included</p>}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-zinc-500"><span>{msg.packetsReceived}/{msg.totalPackets} chunks received</span><span>{delivered ? 'Receipt confirmed' : failed ? 'Transfer stopped' : msg.receiverVerified ? 'Awaiting receipt' : `~${msg.etaSecondsRemaining}s at playback speed`}</span></div>
            <div role="progressbar" aria-label="Chunks received" aria-valuemin={0} aria-valuemax={msg.totalPackets} aria-valuenow={msg.packetsReceived} className="h-1.5 rounded-full bg-blue-100 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${msg.packetsReceived / msg.totalPackets * 100}%` }} /></div>
          </div>
          <div className="flex justify-between gap-2 items-center text-[11px]">
            <span className={`flex items-center gap-1 ${delivered ? 'text-emerald-700' : failed ? 'text-rose-600' : 'text-blue-600'}`}>{delivered ? <CheckCheck className="w-3.5 h-3.5" /> : failed ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}{delivered ? 'Delivered & verified' : failed ? 'Not confirmed' : msg.receiverVerified ? 'Received · unconfirmed' : 'In transit'}</span>
            <button onClick={() => onOpenRouteInspector(msg)} className="flex items-center gap-1 text-blue-600 underline"><Route className="w-3 h-3" />Journey</button>
          </div>
          {failed && <p className="text-[11px] text-rose-600" role="status">{msg.statusDetail}</p>}
          <details className="text-[11px] text-zinc-500"><summary className="cursor-pointer">Packet details</summary><div className="grid grid-cols-8 gap-1 mt-2">{Array.from({ length: msg.totalPackets }, (_, i) => <span key={i} title={`Chunk ${i + 1}: ${msg.receivedChunks.has(i) ? 'received' : 'missing'}`} className={`text-center rounded py-1 ${msg.receivedChunks.has(i) ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100'}`}>{i + 1}</span>)}</div><p className="mt-2">{(msg.wireBytes ?? 0).toLocaleString()} frame bytes across all hops · {msg.retransmittedPacketsCount} data retries</p></details>
        </div>
      </article>;
    })}
  </div>;
}
