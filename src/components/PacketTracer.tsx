import React from 'react';
import { LoRaPacket, MeshNode } from '../types/mesh';
import { Terminal, ShieldCheck, AlertTriangle, ArrowRight, Zap, RefreshCw } from 'lucide-react';

interface PacketTracerProps {
  activePackets: LoRaPacket[];
  eventLogs: string[];
  totalSent: number;
  totalDelivered: number;
  totalDropped: number;
  fecRecoveries: number;
  nodes: MeshNode[];
}

export const PacketTracer: React.FC<PacketTracerProps> = ({
  activePackets,
  eventLogs,
  totalSent,
  totalDelivered,
  totalDropped,
  fecRecoveries,
  nodes,
}) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 text-slate-100">
      {/* Top Header & Telemetry Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            LoRa Packet Tracer & ARQ Telemetry
          </h3>
        </div>

        {/* Real-time Counter Pills */}
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-slate-400">
            Sent: <strong className="text-white">{totalSent}</strong>
          </span>
          <span className="text-emerald-400">
            Route completions: <strong>{totalDelivered}</strong>
          </span>
          <span className="text-rose-400">
            Dropped: <strong>{totalDropped}</strong>
          </span>
          <span className="text-amber-400">
            FEC Recovered: <strong>{fecRecoveries}</strong>
          </span>
        </div>
      </div>

      {/* Active Packets in Flight */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">
            In-Flight LoRa Packets (230-byte MTU)
          </span>
          <span className="font-mono text-slate-400 text-[11px]">
            {activePackets.length} Active in Airtime
          </span>
        </div>

        {activePackets.length === 0 ? (
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-center text-xs text-slate-400 font-mono">
            No active RF airtime transmissions. Ready to transmit.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {activePackets.map((pkt) => {
              const fromCall = nodeMap.get(pkt.currentHopNodeId)?.callsign || pkt.currentHopNodeId;
              const toCall = nodeMap.get(pkt.nextHopNodeId)?.callsign || pkt.nextHopNodeId;

              return (
                <div
                  key={pkt.packetId}
                  className={`p-2 rounded-lg border text-xs font-mono flex items-center justify-between ${
                    pkt.state === 'dropped'
                      ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                      : pkt.type === 'fec_parity'
                      ? 'bg-indigo-950/40 border-indigo-700 text-indigo-300'
                      : pkt.type === 'nack'
                      ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    <span className="font-bold">
                      {pkt.type === 'fec_parity'
                        ? 'FEC_PARITY'
                        : pkt.type === 'nack'
                        ? 'ARQ_NACK'
                        : `CHUNK #${pkt.seqIndex}`}
                    </span>
                    <span className="text-[10px] text-slate-400">({pkt.payloadBytes}B)</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-slate-300">{fromCall}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span className="text-amber-400">{toCall}</span>
                  </div>

                  <div className="text-[10px] text-right">
                    <span className="text-cyan-400 font-bold">{pkt.crc16}</span>
                    <span className="text-slate-400 ml-1.5">Hop {pkt.hopIndex + 1}/{pkt.totalHops}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Terminal Log Stream */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">
            Real-Time Network Event Console
          </span>
          <span className="text-[10px] font-mono text-slate-400">Hop-by-Hop Trace</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] h-32 overflow-y-auto space-y-1">
          {eventLogs.length === 0 ? (
            <div className="text-slate-500">Radio idle. Awaiting transmission event...</div>
          ) : (
            eventLogs.map((log, index) => {
              const isError = log.includes('DROP') || log.includes('CORRUPTED') || log.includes('NACK');
              const isSuccess = log.includes('DELIVERED') || log.includes('VERIFIED') || log.includes('RECOVERED');
              const isFec = log.includes('FEC');

              return (
                <div
                  key={index}
                  className={`leading-relaxed ${
                    isError
                      ? 'text-rose-400'
                      : isFec
                      ? 'text-indigo-400 font-bold'
                      : isSuccess
                      ? 'text-emerald-400'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
