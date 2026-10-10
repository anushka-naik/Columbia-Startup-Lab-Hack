/** Decode only the verified receiver bytes. WAV is a local playback representation;
 * the mesh still carries the original compressed Opus file. */
export async function decodeOpusForPlayback(bytes: Uint8Array) {
  if (new TextDecoder().decode(bytes.subarray(0, 4)) !== 'OggS') throw new Error('Invalid Ogg audio');
  const { OggOpusDecoder } = await import('ogg-opus-decoder');
  const decoder = new OggOpusDecoder();
  try {
    await decoder.ready;
    const decoded = await decoder.decodeFile(bytes);
    if (decoded.errors.length || !decoded.samplesDecoded || !decoded.channelData.length) throw new Error('Unable to decode received Opus audio');
    return encodeWav(decoded.channelData, decoded.sampleRate);
  } finally {
    decoder.free();
  }
}

export function encodeWav(channels: Float32Array[], sampleRate: number) {
  const samples = channels[0]?.length ?? 0;
  if (!samples || !channels.length || channels.some(c => c.length !== samples)) throw new Error('Invalid audio samples');
  const blockAlign = channels.length * 2;
  const bytes = new Uint8Array(44 + samples * blockAlign);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  for (let i = 0; i < samples; i++) for (let channel = 0; channel < channels.length; channel++) {
    const sample = Math.max(-1, Math.min(1, channels[channel][i]));
    view.setInt16(44 + (i * channels.length + channel) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}
