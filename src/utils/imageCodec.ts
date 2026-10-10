import reconMountainPassImg from '../assets/images/recon_mountain_pass_1791647574640.jpg';
import reconBasecampImg from '../assets/images/recon_basecamp_1791647585935.jpg';
import { decodePixelLayers, encodePixelLayers, inspectMedia, wrapMedia } from './media';
export const PRESET_PHOTOS = [
  { id: 'recon_mountain', title: 'The mountain pass', description: 'Mountain pass', imageUrl: reconMountainPassImg },
  { id: 'recon_basecamp', title: 'Back at base camp', description: 'Base camp', imageUrl: reconBasecampImg },
];
export async function prepareImage(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error('Unable to load image');
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const layers = [16, 32, 64].map(width => {
      const height = width * 3 / 4;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is unavailable');
      // Center-crop to 4:3 instead of stretching the original photograph.
      const ratio = Math.max(width / bitmap.width, height / bitmap.height);
      ctx.drawImage(bitmap, (width - bitmap.width * ratio) / 2, (height - bitmap.height * ratio) / 2, bitmap.width * ratio, bitmap.height * ratio);
      return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
    });
    return wrapMedia('image', encodePixelLayers(layers), blob.size, 0, 'image/rgb332');
  } finally { bitmap.close(); }
}
/** Only a contiguous prefix of received packets can reveal a complete thumbnail layer. */
export function renderReceivedPreview(prefix: Uint8Array) {
  if (prefix.length < 16) return undefined;
  const media = inspectMedia(prefix);
  if (media.kind !== 'image') return undefined;
  const layers = decodePixelLayers(media.data);
  const layer = layers.at(-1);
  if (!layer) return undefined;
  const canvas = document.createElement('canvas'); canvas.width = layer.width; canvas.height = layer.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(layer.rgba), layer.width, layer.height), 0, 0);
  return { url: canvas.toDataURL('image/png'), width: layer.width, layers: layers.length };
}
