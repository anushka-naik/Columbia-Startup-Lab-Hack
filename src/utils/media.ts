import { concatBytes } from './protocol';
export const MEDIA_HEADER = 16;
export type MediaKind = 'text' | 'voice' | 'image' | 'video_burst';
const kinds: MediaKind[] = ['text', 'voice', 'image', 'video_burst'];
const mimes = ['text/plain', 'audio/ogg', 'audio/webm', 'audio/mp4', 'image/rgb332'];
export interface PreparedMedia {
  bytes: Uint8Array; kind: MediaKind; rawBytes: number; durationSec: number; label: string;
}
export function wrapMedia(kind: MediaKind, data: Uint8Array, rawBytes: number, durationSec = 0, mime = 'text/plain'): PreparedMedia {
  const codec = mimes.indexOf(mime.split(';')[0]);
  if (codec < 0) throw new Error('Unsupported media format');
  const header = new Uint8Array(MEDIA_HEADER), v = new DataView(header.buffer);
  header[0] = 1; header[1] = kinds.indexOf(kind); header[2] = codec;
  v.setUint32(4, Math.round(durationSec * 1000)); v.setUint32(8, rawBytes); v.setUint32(12, data.length);
  return { bytes: concatBytes([header, data]), kind, rawBytes, durationSec, label: kind === 'voice' ? (codec === 3 ? 'Recorded audio · MP4' : 'Opus speech · container included') : kind === 'image' ? 'RGB332 · lossy 64 × 48 thumbnail' : 'UTF-8 text' };
}
export function inspectMedia(bytes: Uint8Array) {
  if (bytes.length < MEDIA_HEADER || bytes[0] !== 1 || !kinds[bytes[1]] || !mimes[bytes[2]]) throw new Error('Invalid media header');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { kind: kinds[bytes[1]], mime: mimes[bytes[2]], durationSec: v.getUint32(4) / 1000, rawBytes: v.getUint32(8), length: v.getUint32(12), data: bytes.slice(MEDIA_HEADER) };
}
export function decodeMedia(bytes: Uint8Array) {
  const media = inspectMedia(bytes);
  if (media.length !== media.data.length) throw new Error('Incomplete media');
  return media;
}
export function encodeText(text: string) {
  const bytes = new TextEncoder().encode(text);
  return wrapMedia('text', bytes, bytes.length);
}
// Progressive layers are self-contained pixel grids, not fabricated JPEG sizes.
export function encodePixelLayers(layers: { width: number; height: number; rgba: Uint8ClampedArray }[]) {
  return concatBytes(layers.map(({ width, height, rgba }) => {
    if (rgba.length !== width * height * 4 || width > 255 || height > 255) throw new Error('Invalid pixel layer');
    const bytes = new Uint8Array(2 + width * height);
    bytes[0] = width; bytes[1] = height;
    for (let i = 0; i < width * height; i++) bytes[i + 2] = (rgba[i * 4] & 224) | ((rgba[i * 4 + 1] >>> 3) & 28) | (rgba[i * 4 + 2] >>> 6);
    return bytes;
  }));
}
export function decodePixelLayers(data: Uint8Array) {
  const layers: { width: number; height: number; rgba: Uint8ClampedArray }[] = [];
  let offset = 0;
  while (offset + 2 <= data.length) {
    const width = data[offset], height = data[offset + 1];
    if (!width || !height || width > 64 || height > 48) throw new Error('Invalid thumbnail dimensions');
    const size = width * height;
    if (offset + 2 + size > data.length) break;
    const rgba = new Uint8ClampedArray(size * 4);
    for (let i = 0; i < size; i++) {
      const pixel = data[offset + 2 + i];
      rgba[i * 4] = Math.round((pixel >>> 5) * 255 / 7);
      rgba[i * 4 + 1] = Math.round(((pixel >>> 2) & 7) * 255 / 7);
      rgba[i * 4 + 2] = (pixel & 3) * 85; rgba[i * 4 + 3] = 255;
    }
    layers.push({ width, height, rgba }); offset += size + 2;
  }
  return layers;
}

export function encodeVideoFrames(frames: { timeMs: number; width: number; height: number; rgba: Uint8ClampedArray }[]) {
  if (frames.length < 1 || frames.length > 3) throw new Error('Video burst supports 1–3 frames');
  return concatBytes([new Uint8Array([frames.length]), ...frames.map(frame => {
    const time = new Uint8Array(4); new DataView(time.buffer).setUint32(0, frame.timeMs);
    return concatBytes([time, encodePixelLayers([frame])]);
  })]);
}
export function decodeVideoFrames(bytes: Uint8Array) {
  if (!bytes.length) return [];
  if (bytes[0] < 1 || bytes[0] > 3) throw new Error('Invalid video frame count');
  const frames: { timeMs: number; width: number; height: number; rgba: Uint8ClampedArray }[] = [];
  let offset = 1;
  for (let i = 0; i < bytes[0] && offset + 6 <= bytes.length; i++) {
    const timeMs = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const size = 2 + bytes[offset + 4] * bytes[offset + 5];
    if (offset + 4 + size > bytes.length) break;
    const layer = decodePixelLayers(bytes.slice(offset + 4, offset + 4 + size))[0];
    if (!layer) break;
    frames.push({ ...layer, timeMs }); offset += 4 + size;
  }
  return frames;
}
