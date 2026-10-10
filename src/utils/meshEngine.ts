/**
 * LoRa Mesh Simulator Engine
 * Static illustrative topology, range-aware routing, and approximate airtime.
 * The byte transport, ARQ and XOR recovery live in transport.ts and protocol.ts.
 */

import { MeshLink, MeshNode, RadioConfig } from '../types/mesh';

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
  { fromNodeId: 'node-alpha-01', toNodeId: 'node-solar-04', distanceKm: 3.4, rssiDbm: -92, snrDb: 3.2, baseLossPct: 12 },
  { fromNodeId: 'node-alpha-01', toNodeId: 'node-nomad-06', distanceKm: 2.7, rssiDbm: -88, snrDb: 4.8, baseLossPct: 10 },
  { fromNodeId: 'node-relay-02', toNodeId: 'node-relay-03', distanceKm: 2.8, rssiDbm: -98, snrDb: -1.5, baseLossPct: 20 },
  { fromNodeId: 'node-relay-02', toNodeId: 'node-solar-04', distanceKm: 1.9, rssiDbm: -79, snrDb: 8.2, baseLossPct: 5 },
  { fromNodeId: 'node-solar-04', toNodeId: 'node-relay-03', distanceKm: 3.2, rssiDbm: -94, snrDb: 2.1, baseLossPct: 15 },
  { fromNodeId: 'node-relay-03', toNodeId: 'node-echo-05', distanceKm: 2.4, rssiDbm: -89, snrDb: 4.0, baseLossPct: 12 },
  { fromNodeId: 'node-nomad-06', toNodeId: 'node-relay-03', distanceKm: 2.9, rssiDbm: -95, snrDb: 1.1, baseLossPct: 18 },
];

export function findRoutePath(fromId: string, toId: string, nodes: MeshNode[], links: MeshLink[], maxRangeKm = Infinity): string[] {
  // Shortest-hop BFS over real links within the configured range and online endpoints.
  const onlineNodeIds = new Set(nodes.filter(n => n.isOnline).map(n => n.id));
  if (!onlineNodeIds.has(fromId) || !onlineNodeIds.has(toId)) return [];

  // Adjacency
  const adj: Record<string, string[]> = {};
  links.forEach(link => {
    if (link.distanceKm <= maxRangeKm && onlineNodeIds.has(link.fromNodeId) && onlineNodeIds.has(link.toNodeId)) {
      if (!adj[link.fromNodeId]) adj[link.fromNodeId] = [];
      if (!adj[link.toNodeId]) adj[link.toNodeId] = [];
      adj[link.fromNodeId].push(link.toNodeId);
      adj[link.toNodeId].push(link.fromNodeId);
    }
  });

  const queue: string[][] = [[fromId]];
  const visited = new Set<string>([fromId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const curr = path[path.length - 1];
    if (curr === toId) return path;

    const neighbors = adj[curr] || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }

  // Disconnection is a failure, never a fabricated route.
  return [];
}

export function getLinkBetween(fromId: string, toId: string, links: MeshLink[]): MeshLink {
  const found = links.find(
    l => (l.fromNodeId === fromId && l.toNodeId === toId) || (l.fromNodeId === toId && l.toNodeId === fromId)
  );
  if (found) return found;
  throw new Error('No radio link between these nodes');
}

export function calculatePacketAirtimeMs(payloadBytes: number, radio: RadioConfig): number {
  // LoRa airtime formula approximation
  // Time = (Preamble + Payload) / Bitrate
  const bits = (payloadBytes + 16) * 8; // Include LoRa physical header & CRC
  const rawMs = (bits / radio.bitrateBps) * 1000;
  // Guard interval / preamble turnaround ~ 30-50ms
  return Math.max(80, Math.round(rawMs + 40));
}

export function generateCrc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i);
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
