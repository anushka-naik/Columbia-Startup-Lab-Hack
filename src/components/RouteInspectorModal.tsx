import React from 'react';
import { MeshMessage, MeshNode } from '../types/mesh';
import { X, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Cpu, HardDrive } from 'lucide-react';

interface RouteInspectorModalProps {
  message: MeshMessage | null;
  nodes: MeshNode[];
  onClose: () => void;
}

export const RouteInspectorModal: React.FC<RouteInspectorModalProps> = ({
  message,
  nodes,
  onClose,
}) => {
  if (!message) return null;

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const compressionRatio = ((1 - message.compressedBytes / Math.max(1, message.totalBytesRaw)) * 100).toFixed(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="text-xs font-mono uppercase text-amber-400 font-semibold">
              Telemetry & Route Inspector
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight mt-0.5">
              Message ID: #{message.id.slice(-6).toUpperCase()} · {message.type.toUpperCase()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Honest Delivery Status Banner */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {message.status === 'delivered_verified' ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-400 animate-pulse shrink-0" />
            )}
            <div>
              <div className="text-xs uppercase font-mono font-semibold text-slate-400">
                Network Status Verification
              </div>
              <div className="text-sm font-semibold text-white">
                {message.statusDetail}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-mono text-slate-400">CRC-16 Checksum</div>
            <div className="text-xs font-mono font-bold text-cyan-400">
              {message.crc16Checksum} {message.isCrcVerified ? '· VALID' : '· IN PROGRESS'}
            </div>
          </div>
        </div>

        {/* Hop-by-Hop Radio Route Pipeline */}
        <div className="mt-5">
          <h4 className="text-xs uppercase font-mono font-semibold text-slate-400 mb-3">
            Physical RF Path ({message.routePath.length - 1} Hops)
          </h4>
          <div className="flex flex-col gap-2">
            {message.routePath.map((nodeId, idx) => {
              const node = nodeMap.get(nodeId);
              const isLast = idx === message.routePath.length - 1;
              const hopRecord = message.hopRecords[idx];

              return (
                <div key={nodeId} className="flex flex-col">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/80 border border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-800 text-xs font-mono font-bold flex items-center justify-center text-amber-400">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {node?.callsign || nodeId}
                        </div>
                        <div className="text-xs text-slate-400">
                          {node?.name} · Elev {node?.elevationM}m
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-right">
                      {idx === 0 && <span className="text-amber-400">ORIGIN SENDER</span>}
                      {isLast && (
                        <span className="text-emerald-400 font-semibold">
                          FINAL RECIPIENT
                        </span>
                      )}
                      {!isLast && hopRecord && (
                        <div>
                          <div className="text-slate-300">
                            RSSI {hopRecord.rssiDbm} dBm · SNR {hopRecord.snrDb} dB
                          </div>
                          {hopRecord.droppedCount > 0 ? (
                            <div className="text-rose-400 font-bold">
                              {hopRecord.droppedCount} Pkt Dropped & Retried (ARQ)
                            </div>
                          ) : (
                            <div className="text-emerald-400">Link 100% Clean</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {!isLast && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="w-4 h-4 text-slate-500 rotate-90" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Byte Accounting & Squeeze Ratio */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
              <span>Original Payload</span>
            </div>
            <div className="text-lg font-mono font-bold text-white tabular-nums">
              {(message.totalBytesRaw / 1024).toFixed(1)} KB
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Uncompressed media</div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>LoRa Compressed</span>
            </div>
            <div className="text-lg font-mono font-bold text-amber-400 tabular-nums">
              {message.compressedBytes} B
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {message.totalPackets} packets @ 230B
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Compression Ratio</span>
            </div>
            <div className="text-lg font-mono font-bold text-emerald-400 tabular-nums">
              {compressionRatio}%
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Bandwidth saved</div>
          </div>
        </div>

        {/* Chunk Inspection Grid */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase font-mono font-semibold text-slate-400">
              LoRa Packet MTU Breakdown (230-byte chunks)
            </span>
            <span className="text-xs font-mono text-slate-400">
              Retransmissions: {message.retransmittedPacketsCount}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Array.from({ length: message.totalPackets }).map((_, i) => {
              const chunkReceived = message.receivedChunks.has(i);
              return (
                <div
                  key={i}
                  className={`p-2.5 rounded-lg border text-xs font-mono ${
                    chunkReceived
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">Chunk #{i}</span>
                    <span className="text-[10px]">230B</span>
                  </div>
                  <div className="text-[10px] mt-1">
                    {chunkReceived ? '✓ Delivered & CRC OK' : '⏳ In Transit / Queued'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
