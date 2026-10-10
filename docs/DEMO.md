# A short, defensible demo

**Opening:** “LoRa makes every byte expensive. We choose a representation that fits: Opus speech, small progressive photos, and a three-frame video storyboard.”

**Press Run live demo:** “These are real encoded bytes. Every frame is at most 230 bytes, including our header. We’re crossing three hops with 20% independent loss at each hop. Playback is accelerated 5×; the airtime counter still shows unaccelerated radio time.”

**Open Journey:** “Compressed size alone is misleading. We count every hop attempt, including dropped frames, parity, retries and return receipts. The receiver reassembles and CRC-checks the message. The sender waits for the receipt to get back before saying delivered.”

**Show a failure:** Turn the base node offline, send text, and show “Not confirmed.” Turn it back online and send again. Reset cancels timers; it does not leave invisible transfers delivering messages later.

**Show video:** “We don’t promise full-motion video at this bandwidth. Three timestamped keyframes cost 2,339 bytes. Each appears only after that frame’s bytes arrive.”

## Things to answer plainly

- **Speech codec?** Real Opus, not Codec2. Bundled speech uses a 6 kbps target; container overhead is included in the measured 3,680-byte message. Live recording uses browser-supported audio encoding and measured size.
- **Image reconstruction?** Received RGB332 pixels, never the original image URL. Final image is a 64×48 lossy thumbnail, not a restored high-resolution photo.
- **FEC?** One XOR parity frame for one missing chunk in a message. ARQ handles other losses. It is not Reed–Solomon.
- **Delivery guarantee?** No absolute guarantee under arbitrary loss. Retries are bounded; failure stays unconfirmed. A received message with a lost receipt is shown separately from confirmed delivery.
- **Timing?** Approximate bitrate plus physical overhead on a serialized channel. No collision/interference model. The ETA is an estimate at the selected playback speed.
- **Tests?** `npm test` exercises actual wire serialization, corruption rejection, lost receipts, duplicates, out-of-order arrival, FEC prerequisites, UTF-8 chunking, partial image/video decoding, range/disconnection, cancellation, byte accounting and seeded loss runs.

## Current automated results

At 20% independent loss per hop on the default three-hop topology:

| Payload | Encoded bytes | Confirmed across seeds 1–100 | Mean all-hop frame bytes |
|---|---:|---:|---:|
| Actual bundled Opus speech | 3,680 | 100/100 | 29,185 |
| Three-layer thumbnail payload | 4,054 | 100/100 | 34,284 |

These are bounded simulations, not a guarantee or a hardware benchmark. Reliability tests bypass wall-clock waiting but use the same packet protocol, byte accounting, loss draws, and receipt handling as the app. Thumbnail stress tests use deterministic pixel data of the same format and size as the app’s encoded photos. Separate tests cover complete received-layer decoding.

The default seeded demo uses 23,966 all-hop frame bytes for voice (seed 42) and 21,694 for the thumbnail (seed 73). Quality and network overhead are part of the tradeoff; neither is hidden behind a compressed-size headline.
