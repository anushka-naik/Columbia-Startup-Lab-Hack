# Chrp · Off-grid messaging simulator

An iPhone-style demo that transports **actual text, Opus audio, progressive thumbnail pixels, and video keyframes** over a six-node simulated mesh. The default source-to-base route crosses three hops.

```sh
npm install
npm run dev       # http://localhost:3000
npm test          # deterministic protocol / reliability tests
npm run lint      # TypeScript
npm run build
```

## Run the judging demo

1. Click **Reset**, then **Run live demo**. It sends real spoken audio and a photo sequentially, with 20% independent loss at every hop, XOR recovery enabled, and 0.5× playback for easier hop-by-hop viewing. Seeds 42 and 73 make the packet losses repeatable on the default topology.
2. Watch the receiver buffer. Audio only unlocks after full reassembly and CRC verification. Images appear only when a complete pixel layer has arrived.
3. Open **Journey**. Show the encoded size, all-hop byte cost, airtime, retries, missing chunks, receiver checksum, and sender receipt separately.
4. Select **ECHO-05** on the map and turn it offline. Send another message. It must stay unconfirmed. Turn it online to send again. Disconnects are never replaced by fabricated routes.
5. Try **Voice → Record your own**, **Photo → Choose your photo**, or **Video → Send sample**. Recording requires microphone permission. Uploaded photos and videos are processed locally.

See [the demo notes](docs/DEMO.md) for the implementation and limitations to describe to judges.

## What is real

- Every serialized frame is at most **230 bytes**, including an 18-byte transfer/sequence/CRC header. Each data frame carries up to 212 message bytes.
- A receiver owns its own byte buffers. It never receives a source URL, original media object, sender transcript, or precomputed preview.
- Each frame is CRC-checked. Completed messages are separately CRC-checked after ordered reassembly.
- Selective-repeat ARQ resends chunks missing from a received bitmap ACK. Probe and ACK frames travel over the same lossy, multi-hop links as data. The sender cannot declare delivery without a verified receipt.
- One optional XOR parity frame can recover **one** missing data frame. It works only after parity and all other data frames have arrived. Multiple losses require ARQ.
- Offline endpoints and range limits affect routing. Each new packet recomputes its path; a broken in-flight hop is dropped. Failed/cancelled transfers remain unconfirmed. Reset cancels pending work and clears receiver buffers.
- Byte totals count actual frame lengths on **each attempted hop**, including lost frames, headers, retries, parity, probes, and receipts. Physical preamble symbols are reflected in the airtime approximation, not reported as application-frame bytes.

## Media formats

| Media | Encoding | Encoded message size |
|---|---|---:|
| Text | UTF-8 + media header | Actual UTF-8 length + 16 B |
| Demo voice | 4.4-second spoken fixture, 6 kbps Opus in Ogg | 3,680 B including container and media header |
| Photo | Three RGB332 pixel layers, 16×12 → 32×24 → 64×48 | 4,054 B |
| Video | Three timestamped 32×24 RGB332 keyframes from the first 8 seconds | 2,339 B |

Voice recording requests 6 kbps Opus where available; the browser may choose a higher bitrate. MP4 is a fallback. The **actual** recorded container size is transported and shown. Playback depends on the browser codec support; a verified-file download is offered if playback fails.

The Opus demo was synthesized with the installed macOS Samantha voice, then encoded with FFmpeg/libopus. It is a real encoded speech fixture, not microphone input. The video fixture is a four-second animated pan over the bundled mountain photo. It demonstrates keyframe transport, not a live camera stream.

## Model boundaries

This is a software simulation, not a Meshtastic-compatible firmware implementation. Radios use configured bitrate/range presets, a serialized half-duplex channel, an approximate physical overhead, and independent per-hop packet loss. RSSI/elevation are illustrative topology metadata, not a propagation solver. There is no contention, interference, fading, encryption, regulatory duty-cycle model, or live hardware connection. CRC detects accidental corruption; it is not authentication.

Thumbnails deliberately discard most image detail. Video sends a storyboard and discards audio/motion. Audio savings compare the encoded container against equivalent 16 kHz/16-bit mono PCM. Photo/video savings compare against source file size. These quality reductions are disclosed in the UI.

All media processing and simulated transfers happen in the browser. A local server serves the app and demo fixtures; no AI service or cloud API is required for the demo.
