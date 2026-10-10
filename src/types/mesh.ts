export type LoRaPreset = 'short_fast' | 'medium_fast' | 'long_fast' | 'extreme_slow';

export interface RadioConfig {
  preset: LoRaPreset;
  name: string;
  bitrateBps: number; // e.g. 21880, 5470, 1070, 250
  bandwidthKhz: number;
  spreadingFactor: number;
  codingRate: string;
  packetMtuBytes: number; // 230 bytes payload
  maxRangeKm: number;
}

export const RADIO_PRESETS: Record<LoRaPreset, RadioConfig> = {
  short_fast: {
    preset: 'short_fast',
    name: 'Fast (~22 kbps)',
    bitrateBps: 21880, // ~21.9 kbps
    bandwidthKhz: 250,
    spreadingFactor: 7,
    codingRate: '4/5',
    packetMtuBytes: 230,
    maxRangeKm: 3.5,
  },
  medium_fast: {
    preset: 'medium_fast',
    name: 'Balanced (~5.5 kbps)',
    bitrateBps: 5470, // ~5.4 kbps
    bandwidthKhz: 250,
    spreadingFactor: 9,
    codingRate: '4/5',
    packetMtuBytes: 230,
    maxRangeKm: 8.0,
  },
  long_fast: {
    preset: 'long_fast',
    name: 'Long range (~1 kbps)',
    bitrateBps: 1070, // ~1.07 kbps
    bandwidthKhz: 250,
    spreadingFactor: 11,
    codingRate: '4/5',
    packetMtuBytes: 230,
    maxRangeKm: 15.0,
  },
  extreme_slow: {
    preset: 'extreme_slow',
    name: 'Deep range (250 bps)',
    bitrateBps: 250, // ~250 bps
    bandwidthKhz: 125,
    spreadingFactor: 12,
    codingRate: '4/8',
    packetMtuBytes: 230,
    maxRangeKm: 35.0,
  },
};

export interface MeshNode {
  id: string;
  callsign: string;
  role: 'phone_sender' | 'phone_receiver' | 'relay_repeater' | 'solar_beacon';
  name: string;
  x: number; // Canvas coordinate
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
  baseLossPct: number; // e.g. 15%
}

export type MessageType = 'text' | 'voice' | 'image' | 'video_burst';

export type PacketState = 'queued' | 'transmitting' | 'relaying' | 'delivered' | 'dropped' | 'recovered_fec' | 'retrying';

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
  payloadBytes: number; // <= 230 bytes
  dataHexSnippet: string;
  crc16: string;
  crcValid: boolean;
  state: PacketState;
  routeHistory: string[]; // Node IDs visited
  sentAt: number;
  deliveredAt?: number;
  retryCount: number;
  // Raw payload chunk for reassembly
  chunkData?: string | Uint8Array;
}

export type DeliveryStatus =
  | 'composing'
  | 'queued'
  | 'transmitting'
  | 'relaying'
  | 'packet_loss_recovering'
  | 'partial_preview'
  | 'reassembling'
  | 'delivered_verified'
  | 'awaiting_ack'
  | 'failed'
  | 'cancelled';

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
  droppedTransmissions?: number;
  fecRecovered?: number;
  receivedVideoFrames?: { url: string; timeMs: number }[];
  receivedText?: string;
  receivedAudioUrl?: string;
  receivedImageUrl?: string;
  previewWidth?: number;
  receiverVerified?: boolean;
  wireBytes?: number;
  dataWireBytes?: number;
  parityWireBytes?: number;
  controlWireBytes?: number;
  retransmitWireBytes?: number;
  radioAirtimeMs?: number;
  transmissionCount?: number;
  codecLabel?: string;
  // Audio metadata
  audioData?: {
    durationSec: number;
    sampleRate: number;
    speechTokens: string; // Phonetic / formant representation
    rawPcmWaveform: number[]; // Normalized waveform values 0..1 for rendering
    frequencyHz: number[];
  };
  // Image metadata
  imageData?: {
    originalUrl?: string;
    description: string;
    progressivePasses: string[]; // Base64 or low-res data urls for pass 1, 2, 3, 4
    currentPassIndex: number; // 0 = none, 1 = coarse (chunk 1), 2 = mid, 3 = high, 4 = full
    vectorContours?: { x1: number; y1: number; x2: number; y2: number }[];
  };
  totalBytesRaw: number;
  compressedBytes: number;
  totalPackets: number;
  packetsReceived: number;
  receivedChunks: Map<number, LoRaPacket>; // seqIndex -> packet
  status: DeliveryStatus;
  statusDetail: string;
  etaSecondsRemaining: number;
  routePath: string[]; // e.g. ['alpha-01', 'relay-02', 'relay-03', 'echo-05']
  hopRecords: RouteHopRecord[];
  useFec: boolean;
  crc16Checksum: string;
  isCrcVerified: boolean;
  startTime: number;
  completedTime?: number;
  retransmittedPacketsCount: number;
}
