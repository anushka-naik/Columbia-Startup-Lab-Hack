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
    <div className="panel p-5 sm:p-6 space-y-5 text-zinc-900">
      {/* Top Header & Telemetry Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-200 gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-600" />
          <h3 className="text-base font-semibold tracking-tight text-zinc-900">
            Along the way
          </h3>
        </div>

        {/* Real-time Counter Pills */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
          <span className="text-zinc-500">
            Hop TX: <strong className="text-zinc-900">{totalSent}</strong>
          </span>
          <span className="text-emerald-600">
            Messages: <strong>{totalDelivered}</strong>
          </span>
          <span className="text-rose-600">
            Dropped: <strong>{totalDropped}</strong>
          </span>
          <span className="text-blue-600">
            Recovered: <strong>{fecRecoveries}</strong>
          </span>
        </div>
      </div>

      {/* Active Packets in Flight */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-700">
            Messages in motion
          </span>
          <span className="tabular-nums text-zinc-500 text-[11px]">
            {activePackets.length} in flight
          </span>
        </div>

        {activePackets.length === 0 ? (
          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-center text-xs text-zinc-500 tabular-nums">
            All quiet. Send a message to see its journey.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {activePackets.map((pkt) => {
              const fromCall = nodeMap.get(pkt.currentHopNodeId)?.callsign || pkt.currentHopNodeId;
              const toCall = nodeMap.get(pkt.nextHopNodeId)?.callsign || pkt.nextHopNodeId;

              return (
                <div
                  key={pkt.packetId}
                  className={`p-2 rounded-lg border text-xs tabular-nums flex items-center justify-between ${
                    pkt.state === 'dropped'
                      ? 'bg-rose-50/40 border-rose-200 text-rose-600'
                      : pkt.type === 'fec_parity'
                      ? 'bg-blue-50/40 border-blue-200 text-blue-600'
                      : pkt.type === 'nack'
                      ? 'bg-blue-50/40 border-blue-200 text-blue-600'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                    <span className="font-semibold">
                      {pkt.type === 'fec_parity'
                        ? 'FEC_PARITY'
                        : pkt.type === 'nack'
                        ? 'ACK REQUEST'
                        : pkt.type === 'ack'
                        ? 'RECEIPT'
                        : `CHUNK #${pkt.seqIndex + 1}`}
                    </span>
                    <span className="text-[11px] text-zinc-500">({pkt.payloadBytes}B)</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-zinc-700">{fromCall}</span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                    <span className="text-blue-600">{toCall}</span>
                  </div>

                  <div className="text-[11px] text-right">
                    <span className="text-blue-600 font-semibold">{pkt.crc16}</span>
                    <span className="text-zinc-500 ml-1.5">Hop {pkt.hopIndex + 1}/{pkt.totalHops}</span>
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
          <span className="font-semibold text-zinc-700">
            Network activity
          </span>
          <span className="text-[11px] tabular-nums text-zinc-500">Live log</span>
        </div>

        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 tabular-nums text-[11px] h-32 overflow-y-auto space-y-1">
          {eventLogs.length === 0 ? (
            <div className="text-zinc-500">Radio idle. Awaiting transmission event...</div>
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
                      ? 'text-rose-600'
                      : isFec
                      ? 'text-blue-600 font-semibold'
                      : isSuccess
                      ? 'text-emerald-600'
                      : 'text-zinc-700'
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
