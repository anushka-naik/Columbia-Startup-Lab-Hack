import React, { useState } from 'react';
import { MeshMessage, MeshNode } from '../types/mesh';
import { playTacticalVoice } from '../utils/audioCodec';
import {
  Play,
  Square,
  Volume2,
  CheckCheck,
  Clock,
  AlertTriangle,
  Route,
  ImageIcon,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface ChatFeedProps {
  messages: MeshMessage[];
  nodes: MeshNode[];
  onOpenRouteInspector: (message: MeshMessage) => void;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  nodes,
  onOpenRouteInspector,
}) => {
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const handlePlayAudio = (msg: MeshMessage) => {
    if (!msg.audioData) return;
    setPlayingAudioId(msg.id);
    playTacticalVoice(
      {
        durationSec: msg.audioData.durationSec,
        pitchTrack: [130, 135, 140, 138, 132, 128, 125],
        transcript: msg.textPayload,
      },
      () => {
        setPlayingAudioId(null);
      }
    );
  };

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3.5 scroll-smooth">
      {/* Off-Grid Channel Banner */}
      <div className="text-center my-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>DIRECT LORA POUCH MESH · AD-HOC ADDR 0x4B</span>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-center px-4 text-slate-400">
          <Route className="w-8 h-8 text-amber-400/60 mb-2" />
          <div className="text-xs font-semibold text-white">No active transmissions yet</div>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
            Record a voice note or send a recon photo below to simulate LoRa packet compression & relay.
          </p>
        </div>
      ) : (
        messages.map((msg) => {
          const isSender = msg.senderNodeId === 'node-alpha-01';
          const isDelivered = msg.status === 'delivered_verified';
          const isFailedOrLost = msg.status === 'packet_loss_recovering';

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSender ? 'items-end' : 'items-start'} max-w-full`}
            >
              {/* Message Header info */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 px-1 mb-1">
                <span className="font-semibold text-slate-300">{msg.senderCallsign}</span>
                <span>→</span>
                <span>{msg.receiverCallsign}</span>
                <span>·</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>

              {/* Bubble Body */}
              <div
                className={`w-[92%] sm:w-[86%] rounded-2xl p-3 border transition-all ${
                  isSender
                    ? 'bg-slate-900/90 border-slate-700/80 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-800 text-slate-100 shadow-md'
                }`}
              >
                {/* 1. TEXT PAYLOAD */}
                {msg.type === 'text' && (
                  <p className="text-xs leading-relaxed text-slate-100 font-sans break-words">
                    {msg.textPayload}
                  </p>
                )}

                {/* 2. VOICE PAYLOAD */}
                {msg.type === 'voice' && msg.audioData && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayAudio(msg)}
                          disabled={msg.packetsReceived === 0}
                          className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-amber-500/20"
                        >
                          {playingAudioId === msg.id ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>
                        <div>
                          <div className="text-xs font-semibold text-white flex items-center gap-1">
                            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                            <span>Voice Note</span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ({msg.audioData.durationSec.toFixed(1)}s)
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-cyan-300">
                            Codec2 700bps · LPC Formants
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-[10px] font-mono text-slate-400">
                        <div>{(msg.totalBytesRaw / 1024).toFixed(0)}KB → {msg.compressedBytes}B</div>
                        <div className="text-emerald-400">99.0% saved</div>
                      </div>
                    </div>

                    {/* Waveform Visualization Bars */}
                    <div className="h-7 bg-slate-950/70 rounded-lg p-1.5 flex items-center justify-between gap-0.5 border border-slate-800/60 overflow-hidden">
                      {msg.audioData.rawPcmWaveform.slice(0, 32).map((val, idx) => {
                        const isChunkLoaded = idx < (msg.packetsReceived / msg.totalPackets) * 32;
                        return (
                          <div
                            key={idx}
                            style={{ height: `${Math.max(15, val * 100)}%` }}
                            className={`w-1 rounded-full transition-all duration-300 ${
                              isChunkLoaded
                                ? 'bg-amber-400'
                                : 'bg-slate-700/50'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {msg.textPayload && (
                      <div className="text-[11px] text-slate-300 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                        "{msg.textPayload}"
                      </div>
                    )}
                  </div>
                )}

                {/* 3. IMAGE PAYLOAD (Progressive 4-Pass) */}
                {msg.type === 'image' && msg.imageData && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 font-semibold text-white">
                        <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{msg.imageData.description || 'Recon Photo'}</span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-300">
                        Pass {msg.imageData.currentPassIndex}/{msg.totalPackets}
                      </span>
                    </div>

                    {/* Progressive Image Container */}
                    <div className="relative w-full h-36 rounded-xl overflow-hidden bg-slate-950 border border-slate-800">
                      {msg.imageData.currentPassIndex === 0 ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                          <span className="animate-spin text-amber-400 mb-1">⏳</span>
                          <span>Awaiting Chunk #1 base preview...</span>
                        </div>
                      ) : (
                        <>
                          <img
                            src={
                              msg.imageData.progressivePasses[
                                Math.min(msg.imageData.currentPassIndex - 1, msg.imageData.progressivePasses.length - 1)
                              ] || msg.imageData.originalUrl
                            }
                            alt="Progressive Recon"
                            className={`w-full h-full object-cover transition-all duration-500 ${
                              msg.imageData.currentPassIndex === 1
                                ? 'filter blur-[3px] scale-105'
                                : msg.imageData.currentPassIndex === 2
                                ? 'filter blur-[1px]'
                                : 'filter-none'
                            }`}
                            referrerPolicy="no-referrer"
                          />

                          {/* Tactical Scanline HUD Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent pointer-events-none" />

                          {/* Resolution Badge */}
                          <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 border border-cyan-800/60">
                            {msg.imageData.currentPassIndex === 1 && 'PASS 1 · 16x12 COARSE'}
                            {msg.imageData.currentPassIndex === 2 && 'PASS 2 · 32x24 CHROMA'}
                            {msg.imageData.currentPassIndex === 3 && 'PASS 3 · 64x48 DETAIL'}
                            {msg.imageData.currentPassIndex >= 4 && 'PASS 4 · FULL RESOLUTION'}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{(msg.totalBytesRaw / 1024).toFixed(0)} KB → {msg.compressedBytes} B</span>
                      <span className="text-emerald-400">99.9% reduced</span>
                    </div>
                  </div>
                )}

                {/* 4. CHUNK MATRIX BAR (Visual 230-byte Slots) */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span>
                      Chunks: {msg.packetsReceived}/{msg.totalPackets} (230B MTU)
                    </span>
                    <span>
                      {isDelivered ? (
                        <span className="text-emerald-400 font-bold">100% ACK</span>
                      ) : (
                        <span className="text-amber-400">
                          ETA {msg.etaSecondsRemaining}s
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Visual Chunk Slots */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {Array.from({ length: msg.totalPackets }).map((_, idx) => {
                      const isChunkDelivered = msg.receivedChunks.has(idx);
                      const isRetrying = isFailedOrLost && !isChunkDelivered;

                      return (
                        <div
                          key={idx}
                          className={`h-2 rounded-sm transition-all duration-300 ${
                            isChunkDelivered
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-500/50'
                              : isRetrying
                              ? 'bg-rose-500 animate-pulse'
                              : idx === msg.packetsReceived
                              ? 'bg-amber-400 animate-pulse'
                              : 'bg-slate-800'
                          }`}
                          title={`Chunk #${idx} (230 bytes)`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 5. HONEST DELIVERY STATUS RIBBON */}
                <div className="mt-2.5 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 font-mono">
                    {isDelivered ? (
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>DELIVERED & VERIFIED</span>
                      </span>
                    ) : isFailedOrLost ? (
                      <span className="flex items-center gap-1 text-rose-400 font-bold animate-pulse">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>RETRYING LOST CHUNKS</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Clock className="w-3.5 h-3.5 animate-spin" />
                        <span>RELAYING IN TRANSIT</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => onOpenRouteInspector(msg)}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-mono text-[10px] underline decoration-cyan-500/50 transition-colors"
                  >
                    <Route className="w-3 h-3" />
                    <span>Inspect Route</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
