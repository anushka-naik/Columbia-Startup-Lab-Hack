import React, { useEffect, useState } from 'react';
import { decodeOpusForPlayback } from '../utils/audioPlayback';

export function ReceivedAudioPlayer({ source }: { source: string }) {
  const [playback, setPlayback] = useState<{ source: string; url?: string; error?: string }>();
  useEffect(() => {
    const abort = new AbortController();
    let localUrl: string | undefined;
    async function prepare() {
      try {
        const response = await fetch(source, { signal: abort.signal });
        if (!response.ok) throw new Error('Received audio is unavailable');
        const blob = await response.blob();
        let url = source;
        if (blob.type.split(';')[0] === 'audio/ogg') {
          const wav = await decodeOpusForPlayback(new Uint8Array(await blob.arrayBuffer()));
          if (abort.signal.aborted) return;
          localUrl = URL.createObjectURL(new Blob([new Uint8Array(wav)], { type: 'audio/wav' }));
          url = localUrl;
        }
        if (!abort.signal.aborted) setPlayback({ source, url });
      } catch {
        if (!abort.signal.aborted) setPlayback({ source, error: 'Audio playback is unavailable. You can download the verified recording.' });
      }
    }
    void prepare();
    return () => { abort.abort(); if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [source]);
  const current = playback?.source === source ? playback : undefined;
  return <>
    {current?.url ? <audio key={current.url} aria-label="Received voice note" controls preload="metadata" src={current.url} className="w-full h-10" onError={() => setPlayback({ source, error: 'Audio playback is unavailable. You can download the verified recording.' })} /> : !current?.error && <p className="text-xs text-zinc-500" role="status">Preparing received audio…</p>}
    {current?.error && <p className="text-xs text-rose-600" role="status">{current.error} <a href={source} download="received-voice" className="underline">Download</a></p>}
  </>;
}
