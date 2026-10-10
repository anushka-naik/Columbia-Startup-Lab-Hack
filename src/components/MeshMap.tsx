import React, { useEffect, useRef, useState } from 'react';
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
}

export const MeshMap: React.FC<MeshMapProps> = ({
  nodes,
  links,
  activePackets,
  activeRoutePath,
  onToggleNodeStatus,
  onSelectNode,
  selectedNodeId,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [showTopoLines, setShowTopoLines] = useState(true);
  const [mapScale, setMapScale] = useState({ scale: 1, offsetY: 0 });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const resizeObserver = new ResizeObserver(([entry]) => {
      const scale = Math.min(entry.contentRect.width / 760, entry.contentRect.height / 380);
      setMapScale({ scale, offsetY: (entry.contentRect.height - 380 * scale) / 2 });
    });
    resizeObserver.observe(map);
    return () => resizeObserver.disconnect();
  }, []);

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
      className="relative w-full h-[380px] bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden select-none"
    >
      {/* Topographic Background Contour Lines Grid (SVG) */}
      <svg viewBox="0 0 760 380" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none opacity-25">
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
            <path d="M 120 300 Q 300 240 500 320 Q 650 360 750 310" stroke="#5ac8fa" strokeWidth="0.8" strokeDasharray="4 2" />
          </g>
        )}
      </svg>

      {/* Top Map HUD Bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800">
          <Mountain className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white tracking-tight">
            Alpine Sector 7 Mesh Topography
          </span>
          <span className="text-[10px] font-mono text-slate-400">· 915 MHz ISM Band</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTopoLines(!showTopoLines)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-800 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Contours: {showTopoLines ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Mesh Radio Links Lines (SVG) */}
      <svg viewBox="0 0 760 380" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 w-full h-full pointer-events-none z-10">
        {links.map((link, idx) => {
          const fromNode = nodes.find(n => n.id === link.fromNodeId);
          const toNode = nodes.find(n => n.id === link.toNodeId);
          if (!fromNode || !toNode) return null;

          const isActiveHop = isLinkInActiveRoute(fromNode.id, toNode.id);
          const isBothOnline = fromNode.isOnline && toNode.isOnline;

          let strokeColor = '#c7c7cc'; // offline
          if (isBothOnline) {
            if (isActiveHop) strokeColor = '#007aff'; // active hop blue
            else if (link.rssiDbm > -90) strokeColor = '#34c759'; // strong green
            else if (link.rssiDbm > -105) strokeColor = '#5ac8fa'; // medium cyan
            else strokeColor = '#ff3b30'; // weak red
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
                fill="#6e6e73"
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
                fill="#4b9cff"
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
                fill="#007aff"
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
              style={{ left: `${node.x * mapScale.scale}px`, top: `${mapScale.offsetY + node.y * mapScale.scale}px` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto flex flex-col items-center group cursor-pointer"
              onClick={() => onSelectNode(node)}
            >
              {/* Node Beacon Marker */}
              <div
                className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  !node.isOnline
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 opacity-60'
                    : isSelected
                    ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/30 shadow-lg'
                    : isInActiveRoute
                    ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/40 animate-pulse'
                    : node.role === 'phone_sender' || node.role === 'phone_receiver'
                    ? 'bg-cyan-600 text-white border border-cyan-400'
                    : 'bg-slate-800 text-white border border-slate-600'
                }`}
              >
                <Radio className="w-4 h-4" />

                {/* Battery micro indicator */}
                <span
                  className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-slate-950 ${
                    node.batteryPct > 50 ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
              </div>

              {/* Node Callsign & Elevation Label */}
              <div className="mt-1 flex flex-col items-center bg-slate-950/90 backdrop-blur-md px-1.5 py-0.5 rounded border border-slate-800 shadow-md">
                <span className="text-[10px] font-mono font-bold text-white tracking-tight">
                  {node.callsign}
                </span>
                <span className="text-[8px] font-mono text-slate-400">
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
          <div className="absolute top-14 right-3 z-30 w-56 p-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-2xl text-xs space-y-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="font-mono font-bold text-white">{selNode.callsign}</span>
              </div>
              <button
                onClick={() => onToggleNodeStatus(selNode.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
                  selNode.isOnline
                    ? 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800'
                }`}
              >
                {selNode.isOnline ? 'Turn Offline' : 'Turn Online'}
              </button>
            </div>

            <div className="space-y-1 text-[11px] font-mono text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Location:</span>
                <span className="text-white truncate max-w-[110px]">{selNode.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Elevation:</span>
                <span className="text-white">{selNode.elevationM}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">RF Output:</span>
                <span className="text-amber-400">+{selNode.rfPowerDbm} dBm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Battery:</span>
                <span className="text-emerald-400">{selNode.batteryPct}%</span>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 pt-1 border-t border-slate-800 leading-tight">
              {selNode.isOnline
                ? 'Relaying packets across LoRa mesh.'
                : 'Node disabled. Packets will dynamically reroute.'}
            </div>
          </div>
        );
      })()}

      {/* Bottom Map Legend Bar */}
      <div className="absolute bottom-2.5 left-3 right-3 z-20 flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Strong Link (&gt;-90dBm)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Medium Link</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Active Hop Route</span>
          </span>
        </div>

        <div className="text-slate-300">
          Tip: Click any node to inspect telemetry or toggle offline
        </div>
      </div>
    </div>
  );
};
