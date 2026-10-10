export const RADIO_PACKET_MTU_BYTES = 230;
export const APP_PACKET_HEADER_BYTES = 24;
export const MEDIA_CHUNK_BYTES = RADIO_PACKET_MTU_BYTES - APP_PACKET_HEADER_BYTES;
export const XOR_GROUP_SIZE = 8;

export interface FecParityBlock {
  groupIndex: number;
  firstSequence: number;
  sourceSequences: number[];
  bytes: Uint8Array;
}

export interface PacketizedPayload {
  sourceChunks: Uint8Array[];
  parityBlocks: FecParityBlock[];
}

export function chunkBytes(bytes: Uint8Array, chunkSize = MEDIA_CHUNK_BYTES): Uint8Array[] {
  if (chunkSize <= 0 || chunkSize + APP_PACKET_HEADER_BYTES > RADIO_PACKET_MTU_BYTES) throw new RangeError('Chunk size exceeds the LoRa packet budget.');
  if (bytes.length === 0) return [new Uint8Array()];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) chunks.push(bytes.slice(offset, offset + chunkSize));
  return chunks;
}

export function createXorParity(chunks: Uint8Array[], groupSize = XOR_GROUP_SIZE): FecParityBlock[] {
  const blocks: FecParityBlock[] = [];
  for (let start = 0; start < chunks.length; start += groupSize) {
    const source = chunks.slice(start, start + groupSize);
    if (source.length < 2) continue;
    const length = Math.max(...source.map(chunk => chunk.length));
    const parity = new Uint8Array(length);
    source.forEach(chunk => chunk.forEach((byte, offset) => { parity[offset] ^= byte; }));
    blocks.push({ groupIndex: Math.floor(start / groupSize), firstSequence: start, sourceSequences: source.map((_, i) => start + i), bytes: parity });
  }
  return blocks;
}

export function recoverSingleMissingChunk(
  chunks: ReadonlyMap<number, Uint8Array>,
  parity: Uint8Array,
  sourceSequences: readonly number[],
  missingSequence: number,
): Uint8Array {
  if (!sourceSequences.includes(missingSequence)) throw new RangeError('Missing sequence is not part of this parity block.');
  if (sourceSequences.filter(sequence => !chunks.has(sequence)).length !== 1) throw new Error('XOR parity can recover exactly one missing source chunk per group.');
  const recovered = parity.slice();
  for (const sequence of sourceSequences) {
    if (sequence === missingSequence) continue;
    const source = chunks.get(sequence);
    if (!source) throw new Error('A source chunk needed for parity recovery is missing.');
    source.forEach((byte, offset) => { recovered[offset] ^= byte; });
  }
  return recovered;
}

export function assembleChunks(chunks: ReadonlyMap<number, Uint8Array>, count: number, totalLength: number): Uint8Array {
  if (count < 0 || totalLength < 0) throw new RangeError('Invalid transfer manifest.');
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (let sequence = 0; sequence < count; sequence++) {
    const chunk = chunks.get(sequence);
    if (!chunk) throw new Error(`Chunk ${sequence + 1} is still missing.`);
    const length = Math.min(chunk.length, totalLength - offset);
    output.set(chunk.subarray(0, length), offset);
    offset += length;
  }
  if (offset !== totalLength) throw new Error('The received chunks do not match the manifest length.');
  return output;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function bytesToHex(bytes: Uint8Array, count = 8): string {
  return [...bytes.subarray(0, count)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
