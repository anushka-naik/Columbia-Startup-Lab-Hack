import React, { useRef, useState } from 'react';
import { MeshLink, MeshNode, LoRaPacket } from '../types/mesh';
import {
  Radio,
  Battery,
  Mountain,
  Wifi,
  Power,
  Zap,
  Layers,
  Sparkles,
} from 'lucide-react';

interface MeshMapProps {
  nodes: MeshNode[];
  links: MeshLink[];
  activePackets: LoRaPacket[];
  activeRoutePath: string[];
  onToggleNodeStatus: (nodeId: string) => void;
  onSelectNode: (node: MeshNode) => void;
  selectedNodeId?: string;
  maxRangeKm?: number;
}

export const MeshMap: React.FC<MeshMapProps> = ({
  nodes,
  links,
  activePackets,
  activeRoutePath,
  onToggleNodeStatus,
  onSelectNode,
  selectedNodeId,
  maxRangeKm = Infinity,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [showTopoLines, setShowTopoLines] = useState(true);

  // Helper to determine if link is part of current active route
  const isLinkInActiveRoute = (fromId: string, toId: string) => {
    for (let i = 0; i < activeRoutePath.length - 1; i++) {
      if (
        (activeRoutePath[i] === fromId && activeRoutePath[i + 1] === toId) ||
        (activeRoutePath[i] === toId && activeRoutePath[i + 1] === fromId)
      ) {
        return true;
      }
    }
    return false;
  };

  return (
    <div
      ref={mapRef}
      className="mesh-map relative w-full h-[420px] rounded-[24px] border border-zinc-200 overflow-hidden select-none"
    >
      {/* Topographic Background Contour Lines Grid (SVG) */}
      <svg viewBox="0 0 740 400" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none opacity-25">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {showTopoLines && (
          <g fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="3 3">
            {/* Mountain Ridge Contour Lines */}
            <ellipse cx="270" cy="180" rx="140" ry="85" />
            <ellipse cx="270" cy="180" rx="95" ry="55" />
            <ellipse cx="270" cy="180" rx="50" ry="30" />

            {/* North Ridge Elevation Peak */}
            <circle cx="390" cy="90" r="70" />
            <circle cx="390" cy="90" r="45" />

            {/* Canyon Depression Valley */}
            <path d="M 120 300 Q 300 240 500 320 Q 650 360 750 310" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="4 2" />
          </g>
        )}
      </svg>

      {/* Top Map HUD Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-200">
          <Mountain className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-semibold text-zinc-900 tracking-tight">
            The alpine network
          </span>
          <span className="text-[11px] tabular-nums text-zinc-500"></span>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-pressed={showTopoLines}
            onClick={() => setShowTopoLines(!showTopoLines)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/90 hover:bg-zinc-100 text-zinc-700 text-[11px] font-medium border border-zinc-200 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Terrain: {showTopoLines ? 'on' : 'off'}</span>
          </button>
        </div>
      </div>

      {/* Mesh Radio Links Lines (SVG) */}
      <svg viewBox="0 0 740 400" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {links.map((link, idx) => {
          const fromNode = nodes.find(n => n.id === link.fromNodeId);
          const toNode = nodes.find(n => n.id === link.toNodeId);
          if (!fromNode || !toNode) return null;

          const isActiveHop = isLinkInActiveRoute(fromNode.id, toNode.id);
          const isBothOnline = fromNode.isOnline && toNode.isOnline && link.distanceKm <= maxRangeKm;

          let strokeColor = '#334155'; // offline
          if (isBothOnline) {
            if (isActiveHop) strokeColor = '#0071e3'; // active hop amber
            else if (link.rssiDbm > -90) strokeColor = '#10b981'; // strong green
            else if (link.rssiDbm > -105) strokeColor = '#06b6d4'; // medium cyan
            else strokeColor = '#f43f5e'; // weak red
          }

          const midX = (fromNode.x + toNode.x) / 2;
          const midY = (fromNode.y + toNode.y) / 2;

          return (
            <g key={idx}>
              {/* Radio Link Line */}
              <line
                x1={fromNode.x}
                y1={fromNode.y}
                x2={toNode.x}
                y2={toNode.y}
                stroke={strokeColor}
                strokeWidth={isActiveHop ? 2.5 : 1.2}
                strokeDasharray={isBothOnline ? (isActiveHop ? 'none' : '4 3') : '2 4'}
                opacity={isBothOnline ? (isActiveHop ? 1 : 0.6) : 0.2}
              />

              {/* Link Distance & RSSI Tag in Middle */}
              {isBothOnline && (
                <text
                  x={midX}
                  y={midY - 4}
                  fill="#71717a"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                  className="bg-black/80"
                >
                  {link.distanceKm}km · {link.rssiDbm}dBm
                </text>
              )}
            </g>
          );
        })}

        {/* Animated Flying LoRa Packet Wave Pulses */}
        {activePackets.map((pkt) => {
          const fromNode = nodes.find(n => n.id === pkt.currentHopNodeId);
          const toNode = nodes.find(n => n.id === pkt.nextHopNodeId);
          if (!fromNode || !toNode) return null;

          return (
            <g key={pkt.packetId}>
              {/* Animated radio pulse circle along the vector */}
              <circle
                r="6"
                fill="#66aaff"
                className="animate-ping"
                style={{
                  cx: (fromNode.x + toNode.x) / 2,
                  cy: (fromNode.y + toNode.y) / 2,
                }}
              />
              <circle
                cx={(fromNode.x + toNode.x) / 2}
                cy={(fromNode.y + toNode.y) / 2}
                r="4"
                fill="#0071e3"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          );
        })}
      </svg>

      {/* Nodes Rendered on Map */}
      <div className="absolute inset-0 pointer-events-none z-20">
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isInActiveRoute = activeRoutePath.includes(node.id);

          return (
            <div
              key={node.id}
              style={{ left: `${node.x / 740 * 100}%`, top: `${node.y / 400 * 100}%` }}
              role="button" tabIndex={0} aria-label={`Inspect ${node.callsign}`} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectNode(node); } }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center group cursor-pointer"
              onClick={() => onSelectNode(node)}
            >
              {/* Node Beacon Marker */}
              <div
                className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  !node.isOnline
                    ? 'bg-zinc-100 text-zinc-500 border border-zinc-300 opacity-60'
                    : isSelected
                    ? 'bg-blue-600 text-white ring-4 ring-blue-500/30 shadow-lg'
                    : isInActiveRoute
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400/40 '
                    : node.role === 'phone_sender' || node.role === 'phone_receiver'
                    ? 'bg-blue-600 text-white border border-blue-400'
                    : 'bg-zinc-100 text-zinc-900 border border-zinc-300'
                }`}
              >
                <Radio className="w-4 h-4" />

                {/* Battery micro indicator */}
                <span
                  className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-zinc-200 ${
                    node.batteryPct > 50 ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
              </div>

              {/* Node Callsign & Elevation Label */}
              <div className="mt-1 flex flex-col items-center bg-zinc-50/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-zinc-200 shadow-sm">
                <span className="text-[11px] tabular-nums font-semibold text-zinc-900 tracking-tight">
                  {node.callsign}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-500">
                  {node.elevationM}m · {node.isOnline ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Telemetry HUD Card */}
      {selectedNodeId && (() => {
        const selNode = nodes.find(n => n.id === selectedNodeId);
        if (!selNode) return null;

        return (
          <div className="absolute bottom-14 right-3 z-30 w-44 p-2.5 rounded-xl bg-white/95 backdrop-blur-md border border-zinc-300/80 shadow-lg text-xs space-y-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="tabular-nums font-semibold text-zinc-900">{selNode.callsign}</span>
              </div>
              <button
                onClick={() => onToggleNodeStatus(selNode.id)}
                className={`px-2 py-0.5 rounded text-[11px] tabular-nums font-semibold transition-colors ${
                  selNode.isOnline
                    ? 'bg-rose-50/60 hover:bg-rose-50/80 text-rose-600 border border-rose-200'
                    : 'bg-emerald-50/60 hover:bg-emerald-50/80 text-emerald-600 border border-emerald-200'
                }`}
              >
                {selNode.isOnline ? 'Turn Offline' : 'Turn Online'}
              </button>
            </div>

            <div className="space-y-1 text-[11px] tabular-nums text-zinc-700">
              <div className="flex justify-between">
                <span className="text-zinc-500">Location:</span>
                <span className="text-zinc-900 truncate max-w-[110px]">{selNode.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Elevation:</span>
                <span className="text-zinc-900">{selNode.elevationM}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">RF Output:</span>
                <span className="text-blue-600">+{selNode.rfPowerDbm} dBm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Battery:</span>
                <span className="text-emerald-600">{selNode.batteryPct}%</span>
              </div>
            </div>

            <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-200 leading-tight">
              {selNode.isOnline
                ? 'Relaying packets across LoRa mesh.'
                : 'Node disabled. Packets will dynamically reroute.'}
            </div>
          </div>
        );
      })()}

      {/* Bottom Map Legend Bar */}
      <div className="absolute bottom-2.5 left-3 right-3 z-20 flex items-center justify-between text-[11px] tabular-nums text-zinc-500 bg-zinc-50/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-zinc-200">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Strong</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Available</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Your route</span>
          </span>
        </div>

        <div className="hidden xl:block text-zinc-700">
          Select a node · range is modeled
        </div>
      </div>
    </div>
  );
};
