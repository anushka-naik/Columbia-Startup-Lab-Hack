import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeOpusForPlayback } from '../src/utils/audioPlayback';
import { CHUNK_BYTES, MTU, Receiver, crc16, packetize, parityFrame, serialize, parse, seededRandom } from '../src/utils/protocol';
import { runTransfer, TransportOptions } from '../src/utils/transport';
import { INITIAL_NODES, INITIAL_LINKS, findRoutePath } from '../src/utils/meshEngine';
import { RADIO_PRESETS } from '../src/types/mesh';
import { encodeText, decodeMedia, encodePixelLayers, decodePixelLayers, wrapMedia, encodeVideoFrames, decodeVideoFrames } from '../src/utils/media';
const payload = Uint8Array.from({ length: 905 }, (_, i) => (i * 13) % 256);
const network = () => ({ nodes: INITIAL_NODES, links: INITIAL_LINKS });
const options = (overrides: Partial<TransportOptions> = {}): TransportOptions => ({ payload, transfer: 1, source: 'node-alpha-01', target: 'node-echo-05', network, radio: RADIO_PRESETS.medium_fast, lossPct: 20, speed: 5, fec: true, random: seededRandom(42), wait: async () => {}, ...overrides });

test('verified received Opus speech becomes playable PCM WAV without changing mesh bytes', async () => {
  const ogg = new Uint8Array(readFileSync(new URL('../public/audio/ridge.ogg', import.meta.url)));
  const media = wrapMedia('voice', ogg, 140944, 4.4045, 'audio/ogg');
  const transfer = await runTransfer(options({ payload: media.bytes }));
  assert.equal(transfer.delivered, true);
  const received = decodeMedia(transfer.receiver.output!).data;
  const wav = await decodeOpusForPlayback(received);
  const view = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(wav.slice(8, 12)), 'WAVE');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 48000);
  const duration = view.getUint32(40, true) / view.getUint32(28, true);
  assert.ok(duration > 4.3 && duration < 4.5);
  assert.ok(wav.slice(44).some(byte => byte !== 0), 'decoded speech contains sound');
  assert.deepEqual(received, ogg);
  assert.equal(media.bytes.length, 3680);
  await assert.rejects(decodeOpusForPlayback(new Uint8Array([0, 1, 2])), /Invalid Ogg/);
});

test('UTF-8 text is chunked within the 230-byte wire budget and reassembled out of order', () => {
  const text = 'Hello 🌎 你好 '.repeat(150), media = encodeText(text);
  const frames = packetize(media.bytes, 1), receiver = new Receiver();
  assert.ok(frames.length > 1);
  for (const frame of frames.reverse()) { assert.ok(serialize(frame).length <= MTU); receiver.accept(serialize(frame)); receiver.accept(serialize(frame)); }
  assert.equal(receiver.verified, true);
  assert.equal(new TextDecoder().decode(decodeMedia(receiver.output!).data), text);
  assert.equal(receiver.chunks.size, frames.length);
});
test('receiver rejects corrupt wire data and mismatched transfer metadata', () => {
  const frames = packetize(payload, 1), bad = serialize(frames[0]); bad[20] ^= 1;
  const receiver = new Receiver();
  assert.throws(() => receiver.accept(bad), /checksum/); assert.equal(receiver.chunks.size, 0);
  receiver.accept(serialize(frames[0]));
  assert.throws(() => receiver.accept(serialize({ ...frames[1], transfer: 2 })), /metadata/);
});
test('whole-message checksum rejects internally inconsistent but frame-valid data', () => {
  const frames = packetize(payload, 1), receiver = new Receiver();
  frames[0].body[0] ^= 1;
  assert.throws(() => frames.forEach(f => receiver.accept(serialize(f))), /Reassembled/);
  assert.equal(receiver.verified, false); assert.equal(receiver.output, undefined);
});
test('XOR needs received parity and exactly one missing chunk, including a short last chunk', () => {
  const frames = packetize(payload, 1), receiver = new Receiver();
  frames.slice(0, -2).forEach(f => receiver.accept(serialize(f)));
  receiver.accept(serialize(parityFrame(frames)));
  assert.equal(receiver.recovered, 0); assert.equal(receiver.verified, false);
  receiver.accept(serialize(frames.at(-2)!));
  assert.equal(receiver.recovered, 1); assert.deepEqual(receiver.output, payload);
  const noParity = new Receiver(); frames.slice(1).forEach(f => noParity.accept(serialize(f)));
  assert.equal(noParity.verified, false); assert.equal(noParity.recovered, 0);
});
test('default route has three hops; disconnected and out-of-range routes do not exist', () => {
  assert.equal(findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES, INITIAL_LINKS).length - 1, 3);
  assert.deepEqual(findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES, INITIAL_LINKS, 1), []);
  assert.deepEqual(findRoutePath('node-alpha-01', 'node-echo-05', INITIAL_NODES.map(n => ({ ...n, isOnline: n.id !== 'node-echo-05' })), INITIAL_LINKS), []);
});
test('zero-loss accounting includes each hop, parity, probe, ACK and header', async () => {
  const result = await runTransfer(options({ lossPct: 0 }));
  const frames = packetize(payload, 1);
  const dataBytes = frames.reduce((n, f) => n + serialize(f).length, 0) * 3;
  assert.equal(result.delivered, true); assert.deepEqual(result.receiver.output, payload);
  assert.equal(result.stats.dataWireBytes, dataBytes);
  assert.equal(result.stats.parityWireBytes, 230 * 3);
  assert.equal(result.stats.controlWireBytes, (18 + 18 + 1 + Math.ceil(frames.length / 8)) * 3);
  assert.equal(result.stats.wireBytes, result.stats.dataWireBytes + result.stats.parityWireBytes + result.stats.controlWireBytes);
  assert.equal(result.stats.retries, 0);
});
test('lossy three-hop transfer reassembles actual bytes and returns verified receipt', async () => {
  const result = await runTransfer(options());
  assert.equal(result.delivered, true); assert.ok(result.stats.dropped > 0);
  assert.deepEqual(result.receiver.output, payload); assert.ok(result.stats.retries > 0);
});
test('lost ACK cannot produce delivered status even when receiver has every byte', async () => {
  const result = await runTransfer(options({ lossPct: 0, maxRounds: 3, mutateWire: (wire, frame) => { if (frame.kind === 'ack') wire[18] ^= 1; return wire; } }));
  assert.equal(result.receiver.verified, true); assert.equal(result.delivered, false);
  assert.ok(result.stats.retries > 0);
});
test('100% loss terminates unconfirmed and offline recipient is a real failure', async () => {
  const result = await runTransfer(options({ lossPct: 100, maxRounds: 2 }));
  assert.equal(result.delivered, false); assert.equal(result.receiver.chunks.size, 0);
  await assert.rejects(runTransfer(options({ network: () => ({ nodes: INITIAL_NODES.map(n => ({ ...n, isOnline: n.id !== 'node-echo-05' })), links: INITIAL_LINKS }) })), /No route/);
});
test('cancellation stops in-flight work before receiver delivery', async () => {
  const abort = new AbortController(); let transmissions = 0;
  await assert.rejects(runTransfer(options({ signal: abort.signal, wait: async () => { abort.abort(); }, onEvent: e => { if (e.kind === 'tx') transmissions++; } })), /Cancelled/);
  assert.equal(transmissions, 1);
});
test('routing responds to live node changes and never invents a link', async () => {
  let nodes = INITIAL_NODES.map(n => ({ ...n }));
  const routes: string[][] = [];
  const result = await runTransfer(options({ lossPct: 0, network: () => ({ nodes, links: INITIAL_LINKS }), onEvent: e => {
    if (e.kind === 'receive') nodes = nodes.map(n => n.id === 'node-relay-02' ? { ...n, isOnline: false } : n);
    if (e.kind === 'tx') routes.push(e.route!);
  } }));
  assert.equal(result.delivered, true); assert.ok(routes.some(r => !r.includes('node-relay-02')));
});
test('image layers decode only when their bytes arrive and reflect source pixels', () => {
  const rgba = new Uint8ClampedArray(16 * 12 * 4).fill(255);
  const encoded = encodePixelLayers([{ width: 16, height: 12, rgba }]);
  assert.equal(encoded.length, 194); assert.equal(decodePixelLayers(encoded.slice(0, -1)).length, 0);
  assert.deepEqual(decodePixelLayers(encoded)[0].rgba, rgba);
  rgba.fill(0); assert.notDeepEqual(encodePixelLayers([{ width: 16, height: 12, rgba }]), encoded);
});
test('actual Opus demo bytes survive the seeded 20% loss transport', async () => {
  const ogg = new Uint8Array(readFileSync(new URL('../public/audio/ridge.ogg', import.meta.url)));
  assert.equal(new TextDecoder().decode(ogg.slice(0, 4)), 'OggS'); assert.ok(ogg.length > 1000);
  const media = wrapMedia('voice', ogg, 140944, 4.4045, 'audio/ogg');
  const result = await runTransfer(options({ payload: media.bytes, random: seededRandom(42) }));
  assert.equal(result.delivered, true); assert.deepEqual(decodeMedia(result.receiver.output!).data, ogg);
  console.log(`Voice demo: ${media.bytes.length} payload B, ${result.stats.wireBytes} wire B, ${result.stats.dropped} dropped hops, ${result.stats.retries} retries`);
});
test('100 seeded 20% loss runs measure reliability without allowing false delivery', async () => {
  let delivered = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const result = await runTransfer(options({ random: seededRandom(seed) }));
    if (result.delivered) { delivered++; assert.deepEqual(result.receiver.output, payload); }
  }
  console.log(`Reliability: ${delivered}/100 confirmed at 20% independent per-hop loss`);
  assert.ok(delivered >= 95);
});


test('three progressive image layers survive the judge demo seed with exact byte reconstruction', async () => {
  const layers = [16, 32, 64].map(width => ({ width, height: width * 3 / 4, rgba: Uint8ClampedArray.from({ length: width * width * 3 }, (_, i) => i % 256) }));
  const media = wrapMedia('image', encodePixelLayers(layers), 1234567, 0, 'image/rgb332');
  assert.equal(media.bytes.length, 4054);
  const result = await runTransfer(options({ payload: media.bytes, random: seededRandom(73) }));
  assert.equal(result.delivered, true);
  assert.deepEqual(result.receiver.output, media.bytes);
  assert.equal(decodePixelLayers(decodeMedia(result.receiver.output!).data).length, 3);
  console.log(`Photo demo: ${media.bytes.length} payload B, ${result.stats.wireBytes} wire B, ${result.stats.dropped} dropped hops`);
});
test('video storyboard transports timestamps and pixels, revealing only complete frames', async () => {
  const frames = [0, 2000, 3850].map(timeMs => ({ timeMs, width: 32, height: 24, rgba: new Uint8ClampedArray(32 * 24 * 4).fill(timeMs === 0 ? 0 : 255) }));
  const body = encodeVideoFrames(frames);
  assert.equal(decodeVideoFrames(body.slice(0, 500)).length, 0);
  assert.equal(decodeVideoFrames(body.slice(0, 800)).length, 1);
  const media = wrapMedia('video_burst', body, 20000, 4, 'image/rgb332');
  assert.equal(media.bytes.length, 2339);
  const result = await runTransfer(options({ payload: media.bytes }));
  assert.equal(result.delivered, true);
  const decoded = decodeVideoFrames(decodeMedia(result.receiver.output!).data);
  assert.deepEqual(decoded.map(f => f.timeMs), [0, 2000, 3850]);
  assert.equal(decoded[2].rgba[0], 255);
});
test('changing a destination offline during airtime prevents arrival', async () => {
  let nodes = INITIAL_NODES;
  await assert.rejects(runTransfer(options({ lossPct: 0, network: () => ({ nodes, links: INITIAL_LINKS }), wait: async () => {
    nodes = nodes.map(n => n.id === 'node-echo-05' ? { ...n, isOnline: false } : n);
  } })), /No route/);
});

test('a destination going offline on the final hop cannot receive that frame', async () => {
  let nodes = INITIAL_NODES, hop = 0, arrivals = 0;
  await assert.rejects(runTransfer(options({ lossPct: 0, network: () => ({ nodes, links: INITIAL_LINKS }), wait: async () => {
    if (++hop === 3) nodes = nodes.map(n => n.id === 'node-echo-05' ? { ...n, isOnline: false } : n);
  }, onEvent: e => { if (e.kind === 'receive') arrivals++; } })), /No route/);
  assert.equal(arrivals, 0);
});

test('judge-sized voice and photo messages across 100 seeds each', async () => {
  const audio = wrapMedia('voice', new Uint8Array(readFileSync(new URL('../public/audio/ridge.ogg', import.meta.url))), 140944, 4.4045, 'audio/ogg');
  const pixels = encodePixelLayers([16, 32, 64].map(width => ({ width, height: width * 3 / 4, rgba: new Uint8ClampedArray(width * width * 3).fill(255) })));
  const photo = wrapMedia('image', pixels, 1234567, 0, 'image/rgb332');
  for (const media of [audio, photo]) {
    let success = 0, wireBytes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const result = await runTransfer(options({ payload: media.bytes, random: seededRandom(seed) }));
      if (result.delivered) { success++; assert.deepEqual(result.receiver.output, media.bytes); }
      wireBytes += result.stats.wireBytes;
    }
    console.log(`${media.kind} stress: ${success}/100 confirmed; mean all-hop frame bytes ${Math.round(wireBytes / 100)}`);
    assert.ok(success >= 98);
  }
});

test('playback speed scales waiting time without altering bytes, loss, or radio airtime', async () => {
  let normalWait = 0, acceleratedWait = 0;
  const normal = await runTransfer(options({ speed: 1, wait: async ms => { normalWait += ms; } }));
  const fast = await runTransfer(options({ speed: 10, wait: async ms => { acceleratedWait += ms; } }));
  assert.deepEqual(normal.stats, fast.stats);
  assert.equal(normalWait, normal.stats.radioAirtimeMs);
  assert.ok(Math.abs(normalWait / 10 - acceleratedWait) < .001);
});
