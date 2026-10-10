import { encodeVideoFrames, decodeVideoFrames, inspectMedia, wrapMedia } from './media';
export const DEMO_VIDEO = '/video/mountain-pan.mp4';
export async function prepareVideo(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error('Unable to load video');
  const blob = await response.blob();
  if (blob.size > 25 * 1024 * 1024) throw new Error('Please choose a video under 25 MB.');
  const url = URL.createObjectURL(blob), video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(event, done); video.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Video could not be decoded. Try an MP4 clip.')); };
    const timer = setTimeout(fail, 10000);
    video.addEventListener(event, done, { once: true }); video.addEventListener('error', fail, { once: true });
  });
  try {
    const loaded = waitFor('loadeddata'); video.src = url; await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video has no readable duration');
    const duration = Math.min(8, video.duration);
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 24;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable');
    const frames = [];
    for (const time of [0, duration / 2, Math.max(0, duration - .15)]) {
      if (Math.abs(video.currentTime - time) > .001) { const seeked = waitFor('seeked'); video.currentTime = time; await seeked; }
      const ratio = Math.max(32 / video.videoWidth, 24 / video.videoHeight);
      ctx.drawImage(video, (32 - video.videoWidth * ratio) / 2, (24 - video.videoHeight * ratio) / 2, video.videoWidth * ratio, video.videoHeight * ratio);
      frames.push({ timeMs: Math.round(time * 1000), width: 32, height: 24, rgba: ctx.getImageData(0, 0, 32, 24).data });
    }
    const prepared = wrapMedia('video_burst', encodeVideoFrames(frames), blob.size, duration, 'image/rgb332');
    prepared.label = 'Three 32 × 24 keyframes · no audio or full-motion video';
    return prepared;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
export function renderReceivedVideo(prefix: Uint8Array) {
  if (prefix.length < 16) return [];
  const media = inspectMedia(prefix); if (media.kind !== 'video_burst') return [];
  return decodeVideoFrames(media.data).map(frame => {
    const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height), 0, 0);
    return { url: canvas.toDataURL('image/png'), timeMs: frame.timeMs };
  });
}
