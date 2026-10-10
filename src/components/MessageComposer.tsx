import React, { useEffect, useRef, useState } from 'react';
import { MessageType } from '../types/mesh';
import { Codec2Mode, PRESET_VOICE_NOTES } from '../utils/audioCodec';
import { PRESET_PHOTOS } from '../utils/imageCodec';
import { Image as ImageIcon, LoaderCircle, Mic, Paperclip, Radio, Send, Shield, Square, Video, X } from 'lucide-react';

export interface SendMessageParams {
  type: MessageType;
  text: string;
  codecMode?: Codec2Mode;
  audioBlob?: Blob;
  imageBlob?: Blob;
  imageName?: string;
  videoBlob?: Blob;
  useFec: boolean;
}

interface MessageComposerProps {
  onSendMessage: (params: SendMessageParams) => Promise<void>;
  isTransmitting: boolean;
  recipientCallsign: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({ onSendMessage, isTransmitting, recipientCallsign }) => {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<Codec2Mode>('700');
  const [useFec, setUseFec] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [localError, setLocalError] = useState('');
  const [sending, setSending] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioParts = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const send = async (payload: SendMessageParams): Promise<boolean> => {
    setLocalError(''); setSending(true);
    try { await onSendMessage(payload); return true; }
    catch (error) { setLocalError(error instanceof Error ? error.message : 'Could not prepare this message.'); return false; }
    finally { setSending(false); }
  };

  const startRecording = async () => {
    setLocalError(''); setRecordedAudio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream; audioParts.current = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) audioParts.current.push(event.data); };
      recorder.onstop = () => {
        setRecordedAudio(new Blob(audioParts.current, { type: recorder.mimeType || 'audio/webm' }));
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null; setRecording(false);
      };
      recorder.start(200); setRecording(true);
      timerRef.current = window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 20000);
    } catch (error) { setLocalError(error instanceof Error ? error.message : 'Microphone access is unavailable.'); }
  };

  const stopRecording = () => {
    window.clearTimeout(timerRef.current);
    if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
  };

  const sendVoice = async (blob?: Blob) => {
    const payload = blob ?? recordedAudio;
    if (!payload) { setLocalError('Record a voice note or choose an audio file first.'); return; }
    if (await send({ type: 'voice', text: inputText.trim(), codecMode: mode, audioBlob: payload, useFec })) { setRecordedAudio(null); setInputText(''); }
  };

  const sendImage = async (blob: Blob, name: string) => {
    if (await send({ type: 'image', text: inputText.trim() || name, imageBlob: blob, imageName: name, useFec })) setInputText('');
  };

  const busy = isTransmitting || sending;

  return (
    <div className="relative border-t border-slate-800 bg-slate-950/95 p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>OFF GRID · TO {recipientCallsign}</span>
        <button onClick={() => setUseFec(!useFec)} aria-pressed={useFec} className={`inline-flex items-center gap-1 rounded border px-2 py-1 ${useFec ? 'border-emerald-800 bg-emerald-950/50 text-emerald-300' : 'border-slate-800 text-slate-400'}`}>
          <Shield className="w-3 h-3" /> XOR recovery {useFec ? 'on' : 'off'}
        </button>
      </div>

      <input ref={audioInput} type="file" accept="audio/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void sendVoice(file); event.target.value = ''; }} />
      <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void sendImage(file, file.name); event.target.value = ''; }} />
      <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void send({ type: 'video_burst', text: inputText.trim() || file.name, videoBlob: file, useFec }); event.target.value = ''; }} />

      <div className="flex items-center gap-1.5">
        <button onClick={() => void (recording ? stopRecording() : startRecording())} disabled={busy} title={recording ? 'Stop recording' : 'Record a voice note'} className={`w-8 h-8 rounded-lg flex items-center justify-center ${recording ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-500 text-slate-950'} disabled:opacity-40`}>
          {recording ? <Square className="w-3 h-3 fill-current" /> : <Mic className="w-4 h-4" />}
        </button>
        <button onClick={() => audioInput.current?.click()} disabled={busy} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-amber-300 disabled:opacity-40" title="Choose audio"><Paperclip className="w-3.5 h-3.5" /></button>
        <button onClick={() => photoInput.current?.click()} disabled={busy} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-cyan-300 disabled:opacity-40" title="Choose photo"><ImageIcon className="w-3.5 h-3.5" /></button>
        <button onClick={() => videoInput.current?.click()} disabled={busy} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-violet-300 disabled:opacity-40" title="Choose video for keyframe burst"><Video className="w-3.5 h-3.5" /></button>
        <select aria-label="Voice codec bitrate" value={mode} onChange={event => setMode(event.target.value as Codec2Mode)} className="h-8 flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-800 px-2 text-[10px] text-slate-200" disabled={busy}>
          {PRESET_VOICE_NOTES.map(preset => <option key={preset.id} value={preset.mode}>{preset.title}</option>)}
        </select>
      </div>

      {recordedAudio && <div className="flex items-center justify-between rounded-lg bg-amber-950/30 border border-amber-900/60 px-2.5 py-1.5 text-[10px] text-amber-200">
        <span>Recording ready · {(recordedAudio.size / 1024).toFixed(1)} KB source</span>
        <div className="flex gap-2"><button disabled={busy} onClick={() => void sendVoice()} className="font-bold disabled:opacity-50">Compress & send</button><button onClick={() => setRecordedAudio(null)} aria-label="Discard recording"><X className="w-3 h-3" /></button></div>
      </div>}

      <div className="flex gap-2">
        <input value={inputText} onChange={event => setInputText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && inputText.trim()) void send({ type: 'text', text: inputText.trim(), useFec }); }} placeholder="Message or optional media caption…" disabled={busy} className="flex-1 min-w-0 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 disabled:opacity-50" />
        <button onClick={() => void send({ type: 'text', text: inputText.trim(), useFec })} disabled={!inputText.trim() || busy} title="Send text" className="w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center disabled:opacity-30"><Send className="w-4 h-4" /></button>
      </div>

      {(recording || busy) && <div className="text-[10px] text-amber-300 font-mono flex items-center gap-1.5">{busy && <LoaderCircle className="w-3 h-3 animate-spin" />}{recording ? 'Recording · 20 second limit' : 'Preparing or transmitting media…'}</div>}
      {localError && <div role="alert" className="text-[10px] text-rose-300">{localError}</div>}
    </div>
  );
};
