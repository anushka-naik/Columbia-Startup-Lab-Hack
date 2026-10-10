# CHRP Off-Grid Mesh Messenger

A browser-only demonstration of text, voice, photos, and video keyframe bursts over a simulated LoRa mesh. The radio and nodes are simulated; this app does not connect to Meshtastic hardware.

## Run locally

```sh
npm install
npm run dev
```

The Vite development and preview servers add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. These headers enable the locally bundled Codec2 WebAssembly worker. A production static host must send the same headers. Voice encoding and decoding load the Codec2 runtime on first use; the wasm asset is about 26 MB, while the initial app bundle stays small.

## Media path

- **Voice:** microphone recordings or audio files are mixed to mono, resampled to 8 kHz, encoded with Codec2, and decoded at the receiving end. The compact profile selects Codec2 700C; balanced and higher-clarity profiles select 1200 and 3200 bps. The optional sender note is sent in the manifest; no speech-to-text model is claimed or required.
- **Images:** the source photo is resized to at most 144 pixels on its longest edge and encoded as a real WebP preview under a 1,350-byte image budget when the source allows. The receiver displays it only after reassembly, SHA-256 verification, and successful image decode.
- **Video:** uploads become up to five timestamped WebP keyframes in a compact storyboard. This is explicitly a keyframe summary, not continuous video playback.
- **Text:** content stays hidden in the message view until the receiver has the complete, verified message.

## Mesh and delivery

Six virtual radios appear on the map. The default route relays through five distinct nodes over four hops; the sixth node provides an alternate route. Radio presets use distinct spreading factors, bandwidths, range limits, and Semtech airtime estimates. The loss slider applies an independent packet-loss chance at each hop. Simulation speed scales wall-clock airtime for demos.

Packets use a 230-byte modeled MTU with a 24-byte app header and up to 206 bytes of payload. Optional XOR parity covers groups of up to eight source chunks and can recover one missing chunk in a group. The sender then selectively retries any remaining gaps, with up to six whole-route attempts per packet. The receiver reassembles in sequence, checks the SHA-256 digest, decodes the media, and sends a receipt back over the reverse route. The app says **Delivered** only when that receipt returns; receiver verification and sender confirmation are separate states.

The dedicated FEC demo sets background loss to 0% and deliberately erases one source packet, so the XOR recovery can be inspected directly. The photo and voice demos use the configured 20% independent per-hop loss.

## Checks

```sh
npm run lint
npm run test
npm run build
```

The tests cover the 230-byte packet budget, byte-preserving reassembly, XOR recovery and failure cases, SHA-256, CRC-16, route selection, and offline/range behavior.
