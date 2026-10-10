import classicCoreURL from '@uimaxbai/ffmpeg-core-codec2/dist/ffmpeg-core.js?url';
import codecWasmURL from '@uimaxbai/ffmpeg-core-codec2/dist/ffmpeg-core.wasm?url';
import codecWorkerURL from '@uimaxbai/ffmpeg-core-codec2/dist/ffmpeg-core.worker.js?url';
import { createFFmpeg, type FFmpeg } from '@ffmpeg/ffmpeg';

export type Codec2Mode = '700' | '1200' | '3200';

export interface EncodedAudioPayload {
  bytes: Uint8Array;
  pcmBytes: number;
  durationSec: number;
  sampleRate: number;
  mode: Codec2Mode;
  waveform: number[];
  mimeType: 'audio/x-c2';
}

let ffmpegPromise: Promise<FFmpeg> | undefined;

async function getFFmpeg(onLog?: (message: string) => void): Promise<FFmpeg> {
  if (!crossOriginIsolated) {
    throw new Error('The local Codec2 runtime needs cross-origin isolation. Restart the app using the included Vite server.');
  }
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = createFFmpeg({
        corePath: classicCoreURL,
        wasmPath: codecWasmURL,
        workerPath: codecWorkerURL,
        log: Boolean(onLog),
        logger: ({ message }) => onLog?.(message),
      });
      await ffmpeg.load();
      return ffmpeg;
    })();
  }
  try { return await ffmpegPromise; }
  catch (error) { ffmpegPromise = undefined; throw error; }
}

function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const put = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  put(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); put(8, 'WAVE'); put(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); put(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  return new Uint8Array(buffer);
}

function resampleMono(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;
  const length = Math.max(1, Math.floor(samples.length * toRate / fromRate));
  const output = new Float32Array(length);
  const ratio = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const at = i * ratio;
    const left = Math.floor(at);
    const mix = at - left;
    output[i] = (samples[left] ?? 0) * (1 - mix) + (samples[Math.min(left + 1, samples.length - 1)] ?? 0) * mix;
  }
  return output;
}

export async function encodeCodec2(source: Blob, mode: Codec2Mode, onLog?: (message: string) => void): Promise<EncodedAudioPayload> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await source.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const samples = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / decoded.numberOfChannels;
    }
    const samples8k = resampleMono(mono, decoded.sampleRate, 8000);
    const wav = toWav(samples8k, 8000);
    const ffmpeg = await getFFmpeg(onLog);
    const input = `voice-${crypto.randomUUID()}.wav`;
    const output = input.replace('.wav', '.c2');
    ffmpeg.FS('writeFile', input, wav);
    const codecMode = mode === '700' ? '700C' : mode;
    await ffmpeg.run('-hide_banner', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '8000', '-c:a', 'codec2', '-mode', codecMode, output);
    const bytes = ffmpeg.FS('readFile', output);
    const waveform: number[] = [];
    const window = Math.max(1, Math.floor(samples8k.length / 48));
    for (let i = 0; i < samples8k.length; i += window) {
      let peak = 0;
      for (let j = i; j < Math.min(samples8k.length, i + window); j++) peak = Math.max(peak, Math.abs(samples8k[j]));
      waveform.push(peak);
    }
    ffmpeg.FS('unlink', input); ffmpeg.FS('unlink', output);
    return { bytes, pcmBytes: samples8k.byteLength * 2, durationSec: samples8k.length / 8000, sampleRate: 8000, mode, waveform, mimeType: 'audio/x-c2' };
  } finally {
    await context.close();
  }
}

export async function decodeCodec2(bytes: Uint8Array): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const input = `received-${crypto.randomUUID()}.c2`;
  const output = input.replace('.c2', '.wav');
  ffmpeg.FS('writeFile', input, bytes);
  await ffmpeg.run('-hide_banner', '-loglevel', 'error', '-i', input, '-ac', '1', '-ar', '8000', '-c:a', 'pcm_s16le', output);
  const decoded = ffmpeg.FS('readFile', output);
  const result = new Blob([decoded as Uint8Array<ArrayBuffer>], { type: 'audio/wav' });
  ffmpeg.FS('unlink', input); ffmpeg.FS('unlink', output);
  return result;
}

export const PRESET_VOICE_NOTES = [
  { id: 'compact', title: 'Compact · Codec2 700 bps', mode: '700' as const },
  { id: 'balanced', title: 'Balanced · Codec2 1200 bps', mode: '1200' as const },
  { id: 'clear', title: 'Higher clarity · Codec2 3200 bps', mode: '3200' as const },
];
