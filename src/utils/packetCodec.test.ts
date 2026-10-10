import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_PACKET_HEADER_BYTES, MEDIA_CHUNK_BYTES, RADIO_PACKET_MTU_BYTES, assembleChunks, chunkBytes, createXorParity, recoverSingleMissingChunk, sha256Hex } from './packetCodec.ts';

test('packet chunking respects the 230-byte radio MTU and preserves bytes', () => {
  const input = Uint8Array.from({ length: MEDIA_CHUNK_BYTES * 2 + 17 }, (_, i) => i % 251);
  const chunks = chunkBytes(input);
  assert.equal(MEDIA_CHUNK_BYTES + APP_PACKET_HEADER_BYTES, RADIO_PACKET_MTU_BYTES);
  assert.ok(chunks.every(chunk => chunk.length + APP_PACKET_HEADER_BYTES <= RADIO_PACKET_MTU_BYTES));
  assert.deepEqual(assembleChunks(new Map(chunks.map((chunk, index) => [index, chunk])), chunks.length, input.length), input);
});

test('XOR parity reconstructs one missing chunk in a group', () => {
  const chunks = [
    Uint8Array.from([1, 2, 3, 4]),
    Uint8Array.from([9, 8, 7]),
    Uint8Array.from([5, 5, 5, 5]),
  ];
  const parity = createXorParity(chunks, 3)[0];
  const available = new Map([[0, chunks[0]], [2, chunks[2]]]);
  const recovered = recoverSingleMissingChunk(available, parity.bytes, parity.sourceSequences, 1);
  assert.deepEqual(recovered.slice(0, chunks[1].length), chunks[1]);
});

test('XOR recovery refuses groups with more than one missing chunk', () => {
  const chunks = [Uint8Array.of(1), Uint8Array.of(2), Uint8Array.of(3)];
  const parity = createXorParity(chunks, 3)[0];
  assert.throws(() => recoverSingleMissingChunk(new Map([[0, chunks[0]]]), parity.bytes, parity.sourceSequences, 1), /exactly one/);
});

test('assembly fails closed when any sequence is missing', () => {
  assert.throws(() => assembleChunks(new Map([[0, Uint8Array.of(1)]]), 2, 2), /still missing/);
});

test('SHA-256 is deterministic and standards-compatible', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
