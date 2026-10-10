import { wrapMedia } from './media';

/** This bundled fixture is real speech, synthesized locally then encoded as 6 kbps Opus.
 * All Ogg headers and Opus bytes are transported. No transcript is used for receiver playback.
 */
export const PRESET_VOICE_NOTES = [{
  id: 'ridge', title: 'A check-in from the ridge', durationSec: 4.4045,
  transcript: 'Base camp, this is Alpha. We reached the ridge. Everyone is safe.',
  url: '/audio/ridge.ogg',
}];
export async function prepareVoice(id = 'ridge') {
  const preset = PRESET_VOICE_NOTES.find(p => p.id === id) ?? PRESET_VOICE_NOTES[0];
  const response = await fetch(preset.url);
  if (!response.ok) throw new Error('Unable to load voice sample');
  const data = new Uint8Array(await response.arrayBuffer());
  return wrapMedia('voice', data, Math.round(preset.durationSec * 16000 * 2), preset.durationSec, 'audio/ogg');
}
export async function prepareRecording(blob: Blob, durationSec: number) {
  return wrapMedia('voice', new Uint8Array(await blob.arrayBuffer()), Math.round(durationSec * 16000 * 2), durationSec, blob.type);
}
