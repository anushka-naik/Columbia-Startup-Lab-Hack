/** Binary wire protocol. Every LoRa application frame, including its header, is <=230 B. */
export const MTU = 230;
export const HEADER_BYTES = 18;
export const CHUNK_BYTES = MTU - HEADER_BYTES;
export const MAX_CHUNKS = 256;
export type FrameKind = 'data' | 'parity' | 'probe' | 'ack';
const kinds: FrameKind[] = ['data', 'parity', 'probe', 'ack'];
export const crc16 = (bytes: Uint8Array): number => {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xa001 : 0);
  }
  return crc & 0xffff;
};
export const hexCrc = (crc: number) => `0x${crc.toString(16).padStart(4, '0').toUpperCase()}`;
export const concatBytes = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};
export interface Frame {
  kind: FrameKind; transfer: number; seq: number; total: number; length: number; checksum: number; body: Uint8Array;
}
export function serialize(frame: Frame): Uint8Array {
  if (frame.body.length > CHUNK_BYTES || frame.total < 1 || frame.total > MAX_CHUNKS) throw new Error('Frame exceeds the radio budget');
  const bytes = new Uint8Array(HEADER_BYTES + frame.body.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = 1; bytes[1] = kinds.indexOf(frame.kind);
  view.setUint32(2, frame.transfer); view.setUint16(6, frame.seq); view.setUint16(8, frame.total);
  view.setUint32(10, frame.length); view.setUint16(14, frame.checksum);
  bytes.set(frame.body, HEADER_BYTES);
  view.setUint16(16, crc16(concatBytes([bytes.slice(0, 16), frame.body])));
  return bytes;
}
export function parse(bytes: Uint8Array): Frame {
  if (bytes.length < HEADER_BYTES || bytes.length > MTU || bytes[0] !== 1 || !kinds[bytes[1]]) throw new Error('Invalid frame');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const body = bytes.slice(HEADER_BYTES);
  if (view.getUint16(16) !== crc16(concatBytes([bytes.slice(0, 16), body]))) throw new Error('Frame checksum mismatch');
  const total = view.getUint16(8), length = view.getUint32(10);
  if (!total || total > MAX_CHUNKS || total !== Math.max(1, Math.ceil(length / CHUNK_BYTES))) throw new Error('Invalid transfer size');
  return { kind: kinds[bytes[1]], transfer: view.getUint32(2), seq: view.getUint16(6), total, length, checksum: view.getUint16(14), body };
}
export function packetize(payload: Uint8Array, transfer: number): Frame[] {
  const total = Math.max(1, Math.ceil(payload.length / CHUNK_BYTES));
  if (total > MAX_CHUNKS) throw new Error(`Message exceeds ${MAX_CHUNKS * CHUNK_BYTES} bytes. Try a shorter clip.`);
  return Array.from({ length: total }, (_, seq) => ({ kind: 'data', transfer, seq, total, length: payload.length, checksum: crc16(payload), body: payload.slice(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES) }));
}
export function parityFrame(frames: Frame[]): Frame {
  const body = new Uint8Array(CHUNK_BYTES);
  for (const frame of frames) frame.body.forEach((byte, i) => { body[i] ^= byte; });
  return { ...frames[0], kind: 'parity', seq: frames.length, body };
}
/** Receiver owns only frames delivered over the simulated link. It never sees source media. */
export class Receiver {
  readonly chunks = new Map<number, Uint8Array>();
  private meta?: Frame;
  private parity?: Uint8Array;
  recovered = 0;
  verified = false;
  output?: Uint8Array;
  accept(wire: Uint8Array) {
    const frame = parse(wire);
    if (frame.kind === 'ack') throw new Error('Unexpected ACK');
    if (this.meta && (['transfer', 'total', 'length', 'checksum'] as const).some(k => this.meta![k] !== frame[k])) throw new Error('Transfer metadata mismatch');
    this.meta ??= frame;
    if (frame.kind === 'data') {
      const expected = Math.min(CHUNK_BYTES, frame.length - frame.seq * CHUNK_BYTES);
      if (frame.seq >= frame.total || frame.body.length !== expected) throw new Error('Invalid data chunk');
      this.chunks.set(frame.seq, frame.body.slice());
    } else if (frame.kind === 'parity') {
      if (frame.body.length !== CHUNK_BYTES) throw new Error('Invalid parity');
      this.parity = frame.body.slice();
    }
    if (this.parity && this.chunks.size === frame.total - 1) {
      const seq = Array.from({ length: frame.total }, (_, i) => i).find(i => !this.chunks.has(i))!;
      const recovered = this.parity.slice();
      for (const chunk of this.chunks.values()) chunk.forEach((b, i) => { recovered[i] ^= b; });
      this.chunks.set(seq, recovered.slice(0, Math.min(CHUNK_BYTES, frame.length - seq * CHUNK_BYTES)));
      this.recovered++;
    }
    if (this.chunks.size === frame.total) {
      const output = concatBytes(Array.from({ length: frame.total }, (_, i) => this.chunks.get(i)!));
      this.verified = output.length === frame.length && crc16(output) === frame.checksum;
      if (!this.verified) { this.output = undefined; throw new Error('Reassembled message checksum mismatch'); }
      this.output = output;
    }
    return frame;
  }
  prefix(): Uint8Array {
    const parts: Uint8Array[] = [];
    for (let i = 0; this.chunks.has(i); i++) parts.push(this.chunks.get(i)!);
    return concatBytes(parts);
  }
  ack(): Uint8Array {
    if (!this.meta) throw new Error('No transfer received');
    const body = new Uint8Array(1 + Math.ceil(this.meta.total / 8));
    body[0] = this.verified ? 1 : 0;
    for (const seq of this.chunks.keys()) body[1 + Math.floor(seq / 8)] |= 1 << (seq % 8);
    return serialize({ ...this.meta, kind: 'ack', seq: 0, body });
  }
}
export function readAck(wire: Uint8Array, expected: Frame) {
  const ack = parse(wire);
  if (ack.kind !== 'ack' || ack.transfer !== expected.transfer || ack.checksum !== expected.checksum || ack.length !== expected.length || ack.total !== expected.total || ack.body.length !== 1 + Math.ceil(expected.total / 8)) throw new Error('Invalid ACK');
  const received = new Set(Array.from({ length: ack.total }, (_, i) => i).filter(i => ack.body[1 + Math.floor(i / 8)] & (1 << (i % 8))));
  return { received, verified: ack.body[0] === 1 && received.size === ack.total };
}
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
