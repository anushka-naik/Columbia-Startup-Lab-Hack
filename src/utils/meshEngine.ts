/**
 * LoRa Mesh Simulator Engine
 * Implements hop-by-hop packet transmission, Selective Repeat ARQ,
 * FEC parity recovery, link physics (RSSI, SNR, latency), and truthful delivery tracking.
 */

import { RADIO_PRESETS } from '../types/mesh.ts';
import type {
  LoRaPacket,
  LoRaPreset,
  MeshLink,
  MeshMessage,
  MeshNode,
  RadioConfig,
  RouteHopRecord,
} from '../types/mesh.ts';

export interface SimulationState {
  nodes: MeshNode[];
  links: MeshLink[];
  activePackets: LoRaPacket[]; // In-flight packets
  messages: MeshMessage[];
  radioConfig: RadioConfig;
  globalLossRatePct: number; // 0 to 40%
  simSpeedMultiplier: number; // 1x, 2x, 5x, 10x
  isPaused: boolean;
  totalPacketsSent: number;
  totalPacketsDelivered: number;
  totalPacketsDropped: number;
  totalBytesTransmitted: number;
  fecRecoveriesCount: number;
  lastEventLog: string[];
}

export const INITIAL_NODES: MeshNode[] = [
  {
    id: 'node-alpha-01',
    callsign: 'ALPHA-01',
    name: 'Ridge Search Team',
    role: 'phone_sender',
    x: 100,
    y: 130,
    elevationM: 2840,
    batteryPct: 91,
    isOnline: true,
    rfPowerDbm: 22,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
  {
    id: 'node-relay-02',
    callsign: 'RELAY-02',
    name: 'Streifen Pass Mast',
    role: 'relay_repeater',
    x: 270,
    y: 180,
    elevationM: 2780,
    batteryPct: 98,
    isOnline: true,
    rfPowerDbm: 27,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
  {
    id: 'node-relay-03',
    callsign: 'RELAY-03',
    name: 'Canyon Gorge Repeater',
    role: 'relay_repeater',
    x: 440,
    y: 280,
    elevationM: 2150,
    batteryPct: 84,
    isOnline: true,
    rfPowerDbm: 24,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
  {
    id: 'node-solar-04',
    callsign: 'SOLAR-04',
    name: 'North Ridge Solar Relay',
    role: 'solar_beacon',
    x: 390,
    y: 90,
    elevationM: 2950,
    batteryPct: 100,
    isOnline: true,
    rfPowerDbm: 28,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
  {
    id: 'node-echo-05',
    callsign: 'ECHO-05',
    name: 'Alpine Base Station',
    role: 'phone_receiver',
    x: 620,
    y: 200,
    elevationM: 1820,
    batteryPct: 96,
    isOnline: true,
    rfPowerDbm: 30,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
  {
    id: 'node-nomad-06',
    callsign: 'NOMAD-06',
    name: 'Bravo Patrol Unit',
    role: 'phone_receiver',
    x: 210,
    y: 330,
    elevationM: 2280,
    batteryPct: 78,
    isOnline: true,
    rfPowerDbm: 22,
    packetsRelayed: 0,
    packetsDropped: 0,
  },
];

export const INITIAL_LINKS: MeshLink[] = [
  { fromNodeId: 'node-alpha-01', toNodeId: 'node-relay-02', distanceKm: 2.1, rssiDbm: -82, snrDb: 6.5, baseLossPct: 8 },
  { fromNodeId: 'node-alpha-01', toNodeId: 'node-nomad-06', distanceKm: 2.7, rssiDbm: -88, snrDb: 4.8, baseLossPct: 10 },
  { fromNodeId: 'node-relay-02', toNodeId: 'node-relay-03', distanceKm: 2.8, rssiDbm: -98, snrDb: -1.5, baseLossPct: 20 },
  { fromNodeId: 'node-relay-03', toNodeId: 'node-solar-04', distanceKm: 2.2, rssiDbm: -91, snrDb: 2.8, baseLossPct: 14 },
  { fromNodeId: 'node-solar-04', toNodeId: 'node-echo-05', distanceKm: 3.2, rssiDbm: -94, snrDb: 2.1, baseLossPct: 15 },
  { fromNodeId: 'node-nomad-06', toNodeId: 'node-relay-03', distanceKm: 2.9, rssiDbm: -95, snrDb: 1.1, baseLossPct: 18 },
];

export function findRoutePath(fromId: string, toId: string, nodes: MeshNode[], links: MeshLink[], radio?: RadioConfig): string[] {
  const onlineNodeIds = new Set(nodes.filter(n => n.isOnline).map(n => n.id));
  if (!onlineNodeIds.has(fromId) || !onlineNodeIds.has(toId)) return [];
  if (fromId === toId) return [fromId];

  // Adjacency
  const adj: Record<string, string[]> = {};
  links.forEach(link => {
    const withinRange = !radio || link.distanceKm <= radio.maxRangeKm;
    if (withinRange && onlineNodeIds.has(link.fromNodeId) && onlineNodeIds.has(link.toNodeId)) {
      if (!adj[link.fromNodeId]) adj[link.fromNodeId] = [];
      if (!adj[link.toNodeId]) adj[link.toNodeId] = [];
      adj[link.fromNodeId].push(link.toNodeId);
      adj[link.toNodeId].push(link.fromNodeId);
    }
  });

  const bestCost = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set<string>([fromId]);
  while (pending.size) {
    const curr = [...pending].sort((a, b) => (bestCost.get(a) ?? Infinity) - (bestCost.get(b) ?? Infinity))[0];
    pending.delete(curr);
    if (curr === toId) break;
    for (const next of adj[curr] ?? []) {
      const link = getLinkBetween(curr, next, links);
      const cost = (bestCost.get(curr) ?? Infinity) + link.distanceKm * (1 + link.baseLossPct / 50);
      if (cost < (bestCost.get(next) ?? Infinity)) {
        bestCost.set(next, cost); previous.set(next, curr); pending.add(next);
      }
    }
  }
  if (!previous.has(toId)) return [];
  const route = [toId];
  while (route[0] !== fromId) {
    const parent = previous.get(route[0]);
    if (!parent) return [];
    route.unshift(parent);
  }
  return route;
}

export function getLinkBetween(fromId: string, toId: string, links: MeshLink[]): MeshLink {
  const found = links.find(
    l => (l.fromNodeId === fromId && l.toNodeId === toId) || (l.fromNodeId === toId && l.toNodeId === fromId)
  );
  if (found) return found;
  return {
    fromNodeId: fromId,
    toNodeId: toId,
    distanceKm: 2.5,
    rssiDbm: -92,
    snrDb: 3.0,
    baseLossPct: 15,
  };
}

export function calculatePacketAirtimeMs(payloadBytes: number, radio: RadioConfig): number {
  const sf = radio.spreadingFactor;
  const bandwidth = radio.bandwidthKhz * 1000;
  const codingRateIndex = radio.codingRate === '4/8' ? 4 : radio.codingRate === '4/7' ? 3 : radio.codingRate === '4/6' ? 2 : 1;
  const symbolSeconds = (2 ** sf) / bandwidth;
  const lowDataRateOptimization = symbolSeconds > 0.016 ? 1 : 0;
  const numerator = 8 * payloadBytes - 4 * sf + 28 + 16;
  const denominator = 4 * (sf - 2 * lowDataRateOptimization);
  const payloadSymbols = 8 + Math.max(Math.ceil(numerator / denominator) * (codingRateIndex + 4), 0);
  const preambleSymbols = 16 + 4.25;
  return Math.max(1, Math.round((preambleSymbols + payloadSymbols) * symbolSeconds * 1000));
}

export function generateCrc16(data: Uint8Array): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return `0x${(crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}
