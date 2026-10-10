import React, { useEffect, useRef, useState } from 'react';
import { Mic, Image as ImageIcon, Send, Shield, X, Square, Upload, Film } from 'lucide-react';
import { PRESET_VOICE_NOTES, prepareRecording } from '../utils/audioCodec';
import { PRESET_PHOTOS } from '../utils/imageCodec';
import { PreparedMedia } from '../utils/media';
export interface SendParams {
  type: 'text' | 'voice' | 'image' | 'video_burst'; text: string; useFec: boolean;
  customVideoUrl?: string; audioPresetId?: string; photoPresetId?: string; customPhotoUrl?: string; prepared?: PreparedMedia;
}
interface Props { onSendMessage: (params: SendParams) => void; isTransmitting: boolean; recipientCallsign: string }
export function MessageComposer({ onSendMessage, isTransmitting, recipientCallsign }: Props) {
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'voice' | 'image' | 'video' | null>(null);
  const [fec, setFec] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<PreparedMedia | null>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const uploadUrl = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(t => t.stop());
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
  }; }, []);
  const busy = isTransmitting || preparing || recording;
  const send = (params: Omit<SendParams, 'useFec'>) => { if (busy) return; onSendMessage({ ...params, useFec: fec }); setTab(null); };
  const startRecording = async () => {
    setError(''); setRecorded(null); setPreparing(true);
    try {
      if (!navigator.mediaDevices || typeof MediaRecorder === 'undefined') throw new Error('Recording is unavailable in this browser. Use the bundled voice note.');
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('No supported recording format. Use the bundled voice note.');
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
      if (!mounted.current) { input.getTracks().forEach(t => t.stop()); return; }
      stream.current = input;
      const rec = new MediaRecorder(input, { mimeType: mime, audioBitsPerSecond: 6000 });
      recorder.current = rec;
      const parts: Blob[] = []; const started = performance.now();
      rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      rec.onstop = async () => {
        input.getTracks().forEach(t => t.stop());
        if (stopTimer.current) clearTimeout(stopTimer.current);
        if (!mounted.current) return;
        setRecording(false); setPreparing(true);
        try {
          const media = await prepareRecording(new Blob(parts, { type: rec.mimeType }), (performance.now() - started) / 1000);
          if (media.bytes.length > 54000) throw new Error('This recording is too large. Try a shorter clip.');
          if (mounted.current) setRecorded(media);
        } catch (e) { if (mounted.current) setError((e as Error).message); }
        finally { if (mounted.current) setPreparing(false); }
      };
      rec.start(); setRecording(true);
      stopTimer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 8000);
    } catch (e) { setError((e as Error).message); stream.current?.getTracks().forEach(t => t.stop()); }
    finally { if (mounted.current) setPreparing(false); }
  };
  return <div className="border-t border-zinc-200 bg-zinc-50/90 p-3 space-y-3">
    {tab && <div className="bg-white border border-zinc-200 rounded-2xl p-3 space-y-3 max-h-64 overflow-y-auto">
      <div className="flex justify-between items-center text-xs font-semibold"><span>{tab === 'voice' ? 'A voice that travels' : tab === 'video' ? 'A few moments, in a few bytes' : 'Share a small view'}</span><button aria-label="Close media picker" onClick={() => setTab(null)} disabled={recording}><X className="w-4 h-4" /></button></div>
      {tab === 'voice' ? <>
        <p className="text-[11px] text-zinc-500">Real audio bytes. The sample is 6 kbps Opus; recordings use your browser’s codec and actual file size.</p>
        <button disabled={busy} onClick={() => send({ type: 'voice', text: 'Ridge check-in', audioPresetId: PRESET_VOICE_NOTES[0].id })} className="w-full text-left rounded-xl bg-blue-50 p-3 text-xs text-blue-700 disabled:opacity-40">Send sample · {PRESET_VOICE_NOTES[0].durationSec.toFixed(1)} seconds<br /><span className="text-[11px] text-zinc-500">Locally synthesized speech, encoded with Opus</span></button>
        <button disabled={isTransmitting || preparing} onClick={() => recording ? recorder.current?.stop() : void startRecording()} className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-zinc-100 text-xs disabled:opacity-40">{recording ? <Square className="w-3 h-3" /> : <Mic className="w-3 h-3" />}{recording ? 'Stop recording · max 8 sec' : preparing ? 'Preparing…' : 'Record your own'}</button>
        {recorded && <button disabled={busy} onClick={() => { send({ type: 'voice', text: 'Recorded voice note', prepared: recorded }); setRecorded(null); }} className="primary-button w-full">Send recording · {recorded.bytes.length.toLocaleString()} B</button>}
      </> : tab === 'video' ? <>
        <p className="text-[11px] text-zinc-500">Send three 32 × 24 keyframes from the first 8 seconds. A tiny storyboard, without audio or full-motion playback.</p>
        <button disabled={busy} onClick={() => send({ type: 'video_burst', text: 'Mountain camera pan' })} className="primary-button w-full">Send sample · mountain pan</button>
        <p className="text-[10px] text-zinc-400">Sample: a 4-second animated pan of the mountain photo.</p>
        <label className="flex gap-2 items-center text-xs text-blue-600 cursor-pointer"><Upload className="w-3 h-3" />Choose a video<input aria-label="Upload a video" type="file" accept="video/*" className="hidden" disabled={busy} onChange={e => {
          const file = e.target.files?.[0]; if (!file) return;
          if (file.size > 25 * 1024 * 1024) { setError('Choose a video under 25 MB.'); return; }
          if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
          uploadUrl.current = URL.createObjectURL(file); send({ type: 'video_burst', text: file.name, customVideoUrl: uploadUrl.current }); e.target.value = '';
        }} /></label>
      </> : <>
        <p className="text-[11px] text-zinc-500">A lossy thumbnail arrives in three layers: 16 × 12, 32 × 24, then 64 × 48. All 4,054 bytes cross the mesh.</p>
        <div className="grid grid-cols-2 gap-2">{PRESET_PHOTOS.map(photo => <button key={photo.id} disabled={busy} onClick={() => send({ type: 'image', text: photo.title, customPhotoUrl: photo.imageUrl })} className="text-left text-[11px] rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden disabled:opacity-40"><img src={photo.imageUrl} alt={photo.title} className="h-16 w-full object-cover" /><span className="block p-2">{photo.title}</span></button>)}</div>
        <label className="flex gap-2 items-center text-xs text-blue-600 cursor-pointer"><Upload className="w-3 h-3" />Choose your photo<input aria-label="Upload a photo" type="file" accept="image/*" className="hidden" disabled={busy} onChange={e => {
          const file = e.target.files?.[0]; if (!file) return;
          if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
          uploadUrl.current = URL.createObjectURL(file); send({ type: 'image', text: file.name, customPhotoUrl: uploadUrl.current }); e.target.value = '';
        }} /></label>
      </>}
      {error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
    </div>}
    <div className="flex justify-between gap-2 text-[11px]">
      <div className="flex gap-2"><button disabled={recording} aria-pressed={tab === 'voice'} onClick={() => setTab(tab === 'voice' ? null : 'voice')} className="flex items-center gap-1 text-blue-600"><Mic className="w-3.5 h-3.5" />Voice</button><button disabled={recording} aria-pressed={tab === 'image'} onClick={() => setTab(tab === 'image' ? null : 'image')} className="flex items-center gap-1 text-blue-600"><ImageIcon className="w-3.5 h-3.5" />Photo</button><button disabled={recording} aria-pressed={tab === 'video'} onClick={() => setTab(tab === 'video' ? null : 'video')} className="flex items-center gap-1 text-blue-600"><Film className="w-3.5 h-3.5" />Video</button></div>
      <button aria-pressed={fec} onClick={() => setFec(!fec)} title="One XOR parity frame can recover one missing data frame per message" className={`flex items-center gap-1 ${fec ? 'text-emerald-700' : 'text-zinc-500'}`}><Shield className="w-3 h-3" />XOR {fec ? 'on' : 'off'}</button>
    </div>
    <form className="flex gap-2 items-center" onSubmit={e => { e.preventDefault(); if (text.trim() && !busy) { send({ type: 'text', text: text.trim() }); setText(''); } }}>
      <input aria-label={`Message to ${recipientCallsign}`} value={text} onChange={e => setText(e.target.value)} maxLength={12000} placeholder="Message base camp…" className="flex-1 border border-zinc-200" disabled={busy} />
      <button type="submit" aria-label="Send message" disabled={busy || !text.trim()} className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center disabled:opacity-30"><Send className="w-4 h-4" /></button>
    </form>
  </div>;
}
