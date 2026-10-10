export type LoRaPreset = 'short_fast' | 'medium_fast' | 'long_fast' | 'extreme_slow';

export interface RadioConfig {
  preset: LoRaPreset;
  name: string;
  bitrateBps: number;
  bandwidthKhz: number;
  spreadingFactor: number;
  codingRate: string;
  packetMtuBytes: number;
  maxRangeKm: number;
}

export const RADIO_PRESETS: Record<LoRaPreset, RadioConfig> = {
  short_fast: {
    preset: 'short_fast', name: 'Short Turbo (SF7, BW 500kHz)', bitrateBps: 21880,
    bandwidthKhz: 500, spreadingFactor: 7, codingRate: '4/5', packetMtuBytes: 230, maxRangeKm: 3.5,
  },
  medium_fast: {
    preset: 'medium_fast', name: 'Medium Fast (SF9, BW 250kHz)', bitrateBps: 3520,
    bandwidthKhz: 250, spreadingFactor: 9, codingRate: '4/5', packetMtuBytes: 230, maxRangeKm: 8,
  },
  long_fast: {
    preset: 'long_fast', name: 'Long Fast (SF11, BW 250kHz)', bitrateBps: 1070,
    bandwidthKhz: 250, spreadingFactor: 11, codingRate: '4/5', packetMtuBytes: 230, maxRangeKm: 15,
  },
  extreme_slow: {
    preset: 'extreme_slow', name: 'Long Moderate (SF11, BW 125kHz)', bitrateBps: 340,
    bandwidthKhz: 125, spreadingFactor: 11, codingRate: '4/8', packetMtuBytes: 230, maxRangeKm: 35,
  },
};

export interface MeshNode {
  id: string;
  callsign: string;
  role: 'phone_sender' | 'phone_receiver' | 'relay_repeater' | 'solar_beacon';
  name: string;
  x: number;
  y: number;
  elevationM: number;
  batteryPct: number;
  isOnline: boolean;
  rfPowerDbm: number;
  packetsRelayed: number;
  packetsDropped: number;
}

export interface MeshLink {
  fromNodeId: string;
  toNodeId: string;
  distanceKm: number;
  rssiDbm: number;
  snrDb: number;
  baseLossPct: number;
}

export type MessageType = 'text' | 'voice' | 'image' | 'video_burst';
export type PacketState = 'queued' | 'transmitting' | 'relaying' | 'delivered' | 'dropped' | 'recovered_fec' | 'retrying';
export type DeliveryStatus = 'queued' | 'transmitting' | 'packet_loss_recovering' | 'reassembling' | 'delivered_verified' | 'paused' | 'failed';

export interface LoRaPacket {
  packetId: string;
  messageId: string;
  seqIndex: number;
  totalChunks: number;
  type: MessageType | 'ack' | 'nack' | 'fec_parity';
  isFecParity?: boolean;
  sourceNodeId: string;
  targetNodeId: string;
  currentHopNodeId: string;
  nextHopNodeId: string;
  hopIndex: number;
  totalHops: number;
  payloadBytes: number;
  dataHexSnippet: string;
  crc16: string;
  crcValid: boolean;
  state: PacketState;
  routeHistory: string[];
  sentAt: number;
  deliveredAt?: number;
  retryCount: number;
  chunkData?: Uint8Array;
}

export interface RouteHopRecord {
  fromNodeId: string;
  toNodeId: string;
  rssiDbm: number;
  snrDb: number;
  latencyMs: number;
  droppedCount: number;
  success: boolean;
}

export interface MeshMessage {
  id: string;
  senderNodeId: string;
  receiverNodeId: string;
  senderCallsign: string;
  receiverCallsign: string;
  timestamp: number;
  type: MessageType;
  textPayload?: string;
  transcript?: string;
  totalBytesRaw: number;
  compressedBytes: number;
  totalPackets: number;
  packetsReceived: number;
  receivedChunks: Map<number, LoRaPacket>;
  status: DeliveryStatus;
  statusDetail: string;
  etaSecondsRemaining: number;
  routePath: string[];
  hopRecords: RouteHopRecord[];
  useFec: boolean;
  integrityHashLabel: string;
  isIntegrityVerified: boolean;
  startTime: number;
  completedTime?: number;
  retransmittedPacketsCount: number;
  transmittedBytes: number;
  sourceUrl?: string;
  receivedUrl?: string;
  mediaMimeType?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  codecLabel?: string;
  isPartial?: boolean;
}
