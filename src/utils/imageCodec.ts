import reconMountainPassImg from '../assets/images/recon_mountain_pass_1791647574640.jpg';
import reconBasecampImg from '../assets/images/recon_basecamp_1791647585935.jpg';

export interface EncodedImagePayload {
  bytes: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  originalBytes: number;
}

export interface EncodedVideoBurst {
  bytes: Uint8Array;
  originalBytes: number;
  frameCount: number;
  durationSec: number;
  mimeType: 'application/x-chrp-video-burst';
}

export const PRESET_PHOTOS = [
  { id: 'recon_mountain', title: 'Alpine Pass Recon (2,780m)', description: 'Alpine trail and ridge reconnaissance.', imageUrl: reconMountainPassImg },
  { id: 'recon_basecamp', title: 'Field Station Basecamp', description: 'Expedition basecamp and radio mast.', imageUrl: reconBasecampImg },
];

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The selected image could not be opened.')) };
    image.src = url;
  });
}

async function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
  if (!blob || blob.type !== type) throw new Error(`${type} encoding is not available in this browser.`);
  return blob;
}

async function resizeAndEncode(image: CanvasImageSource, width: number, height: number, byteBudget: number, type: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create an image encoder.');
  ctx.drawImage(image, 0, 0, width, height);
  let low = 0.08; let high = 0.95;
  let best = await canvasBlob(canvas, type, low);
  for (let i = 0; i < 7; i++) {
    const mid = (low + high) / 2;
    const candidate = await canvasBlob(canvas, type, mid);
    if (candidate.size <= byteBudget) { best = candidate; low = mid; }
    else high = mid;
  }
  return best;
}

export async function encodeImage(source: Blob, byteBudget = 1200, maxDimension = 128): Promise<EncodedImagePayload> {
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const type = 'image/webp';
  let budget = byteBudget;
  let blob = await resizeAndEncode(image, width, height, budget, type);
  if (blob.size > byteBudget) {
    const smallerScale = Math.sqrt(byteBudget / blob.size) * 0.86;
    const nextW = Math.max(32, Math.floor(width * smallerScale));
    const nextH = Math.max(24, Math.floor(height * smallerScale));
    budget = byteBudget;
    blob = await resizeAndEncode(image, nextW, nextH, budget, type);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type, width: nextW, height: nextH, originalBytes: source.size };
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type, width, height, originalBytes: source.size };
}

function waitForVideoEvent(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Timed out while reading the selected video.')), 10000);
    video.addEventListener(event, () => { window.clearTimeout(timeout); resolve(); }, { once: true });
    video.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('The selected video could not be decoded.')); }, { once: true });
  });
}

export async function encodeVideoBurst(source: Blob, byteBudgetPerFrame = 1100, maxFrames = 5): Promise<EncodedVideoBurst> {
  const objectUrl = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'metadata'; video.src = objectUrl;
  try {
    const metadata = waitForVideoEvent(video, 'loadedmetadata');
    video.load(); await metadata;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('The selected video has no readable duration.');
    const frameCount = Math.min(maxFrames, Math.max(2, Math.ceil(video.duration / 2)));
    const records: { timeMs: number; payload: EncodedImagePayload }[] = [];
    for (let i = 0; i < frameCount; i++) {
      const time = Math.min(Math.max(0, video.duration - 0.05), i * Math.max(0.5, video.duration / frameCount));
      if (Math.abs(video.currentTime - time) > 0.001) {
        const seeked = waitForVideoEvent(video, 'seeked');
        video.currentTime = time; await seeked;
      }
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 192 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not extract video frames in this browser.');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageBlob = await resizeAndEncode(canvas, canvas.width, canvas.height, byteBudgetPerFrame, 'image/webp');
      records.push({ timeMs: Math.round(time * 1000), payload: { bytes: new Uint8Array(await imageBlob.arrayBuffer()), mimeType: imageBlob.type, width: canvas.width, height: canvas.height, originalBytes: source.size } });
    }
    const headerBytes = 4 + 1 + records.length * 12;
    const length = headerBytes + records.reduce((sum, record) => sum + record.payload.bytes.length, 0);
    const bytes = new Uint8Array(length); const view = new DataView(bytes.buffer);
    bytes.set([67, 72, 86, 49], 0); bytes[4] = records.length;
    let cursor = 5;
    records.forEach(({ timeMs, payload }) => {
      view.setUint32(cursor, timeMs, false); view.setUint16(cursor + 4, payload.width, false); view.setUint16(cursor + 6, payload.height, false);
      view.setUint32(cursor + 8, payload.bytes.length, false); cursor += 12;
      bytes.set(payload.bytes, cursor); cursor += payload.bytes.length;
    });
    return { bytes, originalBytes: source.size, frameCount: records.length, durationSec: video.duration, mimeType: 'application/x-chrp-video-burst' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function decodeVideoBurst(bytes: Uint8Array): { timeMs: number; src: string; width: number; height: number }[] {
  if (bytes.length < 5 || bytes[0] !== 67 || bytes[1] !== 72 || bytes[2] !== 86 || bytes[3] !== 49) throw new Error('This is not a complete CHRP keyframe burst.');
  const count = bytes[4]; const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = []; let cursor = 5;
  for (let i = 0; i < count; i++) {
    if (cursor + 12 > bytes.length) throw new Error('The video burst is incomplete.');
    const timeMs = view.getUint32(cursor, false); const width = view.getUint16(cursor + 4, false);
    const height = view.getUint16(cursor + 6, false); const size = view.getUint32(cursor + 8, false); cursor += 12;
    if (cursor + size > bytes.length) throw new Error('The video burst is incomplete.');
    frames.push({ timeMs, src: URL.createObjectURL(new Blob([bytes.slice(cursor, cursor + size)], { type: 'image/webp' })), width, height });
    cursor += size;
  }
  if (cursor !== bytes.length) throw new Error('The video burst has unexpected trailing data.');
  return frames;
}
