import { MeshNode, MeshLink, RadioConfig } from '../types/mesh';
import { calculatePacketAirtimeMs, findRoutePath, getLinkBetween } from './meshEngine';
import { Frame, Receiver, packetize, parityFrame, parse, readAck, serialize } from './protocol';

export interface TransportStats {
  wireBytes: number; dataWireBytes: number; parityWireBytes: number; controlWireBytes: number;
  retransmitWireBytes: number; radioAirtimeMs: number; transmissionCount: number; dropped: number; retries: number;
}
export interface TransportEvent {
  kind: 'tx' | 'drop' | 'hop' | 'receive' | 'ack' | 'retry';
  frame?: Frame; from?: string; to?: string; route?: string[]; hop?: number;
  receiver: Receiver; stats: TransportStats; message: string;
}
export interface TransportOptions {
  payload: Uint8Array; transfer: number; source: string; target: string;
  network: () => { nodes: MeshNode[]; links: MeshLink[] };
  radio: RadioConfig; lossPct: number; speed: number; fec: boolean;
  random?: () => number; signal?: AbortSignal; maxRounds?: number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onEvent?: (event: TransportEvent) => void;
  // Test hook models corrupt bytes in transit; the receiver still validates the wire CRC.
  mutateWire?: (wire: Uint8Array, frame: Frame) => Uint8Array;
}
export const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new Error('Cancelled')); return; }
  const abort = () => { clearTimeout(timer); reject(new Error('Cancelled')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
/** Serialized half-duplex channel; selective-repeat end-to-end ARQ and one XOR parity block.
 * ACK requests and bitmap ACKs use the same lossy multi-hop transport as media.
 */
export async function runTransfer(options: TransportOptions) {
  const { payload, source, target, radio, signal } = options;
  const frames = packetize(payload, options.transfer);
  const receiver = new Receiver();
  const stats: TransportStats = { wireBytes: 0, dataWireBytes: 0, parityWireBytes: 0, controlWireBytes: 0, retransmitWireBytes: 0, radioAirtimeMs: 0, transmissionCount: 0, dropped: 0, retries: 0 };
  const random = options.random ?? Math.random, wait = options.wait ?? pause;
  let acknowledged = new Set<number>();
  const check = () => { if (signal?.aborted) throw new Error('Cancelled'); };
  const emit = (event: Omit<TransportEvent, 'receiver' | 'stats'>) => options.onEvent?.({ ...event, receiver, stats: { ...stats } });
  const send = async (wire: Uint8Array, reverse: boolean, retry: boolean) => {
    check();
    const frame = parse(wire);
    const network = options.network();
    const route = findRoutePath(reverse ? target : source, reverse ? source : target, network.nodes, network.links, radio.maxRangeKm);
    if (!route.length) throw new Error('No route: a required node is offline or out of range.');
    for (let hop = 0; hop < route.length - 1; hop++) {
      check();
      const current = options.network();
      const from = route[hop], to = route[hop + 1];
      const link = getLinkBetween(from, to, current.links);
      if (![from, to].every(id => current.nodes.some(n => n.id === id && n.isOnline)) || link.distanceKm > radio.maxRangeKm) return null;
      const airtime = calculatePacketAirtimeMs(wire.length, radio);
      stats.wireBytes += wire.length;
      stats.radioAirtimeMs += airtime;
      stats.transmissionCount++;
      if (frame.kind === 'data') stats.dataWireBytes += wire.length;
      else if (frame.kind === 'parity') stats.parityWireBytes += wire.length;
      else stats.controlWireBytes += wire.length;
      if (retry) stats.retransmitWireBytes += wire.length;
      emit({ kind: 'tx', frame, from, to, route, hop, message: `${frame.kind.toUpperCase()} ${frame.seq + 1} · ${wire.length} B · ${from} → ${to}` });
      await wait(airtime / options.speed, signal);
      check();
      const afterHop = options.network();
      if (![from, to].every(id => afterHop.nodes.some(n => n.id === id && n.isOnline))) {
        stats.dropped++;
        emit({ kind: 'drop', frame, from, to, route, hop, message: `DROP ${frame.kind}: endpoint went offline during transmission` });
        return null;
      }
      if (random() < options.lossPct / 100) {
        stats.dropped++;
        emit({ kind: 'drop', frame, from, to, route, hop, message: `DROP ${frame.kind} ${frame.seq + 1} at ${to}` });
        return null;
      }
      emit({ kind: 'hop', frame, from, to, route, hop, message: `Relayed ${frame.kind} ${frame.seq + 1}` });
    }
    return options.mutateWire ? options.mutateWire(wire.slice(), frame) : wire.slice();
  };
  const receive = (wire: Uint8Array | null) => {
    if (!wire) return;
    try {
      receiver.accept(wire);
      emit({ kind: 'receive', message: `${receiver.chunks.size}/${frames.length} chunks received${receiver.recovered ? ` · ${receiver.recovered} recovered by XOR` : ''}${receiver.verified ? ' · receiver checksum VERIFIED' : ''}` });
    } catch (error) {
      emit({ kind: 'drop', message: `CORRUPTED: ${(error as Error).message}` });
    }
  };
  const sent = new Set<number>();
  for (let round = 0; round < (options.maxRounds ?? 18); round++) {
    check();
    for (const frame of frames) {
      if (acknowledged.has(frame.seq)) continue;
      const retry = sent.has(frame.seq);
      if (retry) { stats.retries++; emit({ kind: 'retry', frame, message: `RETRY missing chunk ${frame.seq + 1}` }); }
      sent.add(frame.seq);
      receive(await send(serialize(frame), false, retry));
    }
    if (options.fec && acknowledged.size < frames.length) receive(await send(serialize(parityFrame(frames)), false, round > 0));
    // Retry the small receipt exchange before retransmitting a potentially large media batch.
    for (let attempt = 0; attempt < 3; attempt++) {
      const probe = await send(serialize({ ...frames[0], kind: 'probe', body: new Uint8Array() }), false, round > 0 || attempt > 0);
      if (!probe) continue;
      receive(probe);
      if (!receiver.chunks.size && !receiver.verified) continue;
      const ackWire = await send(receiver.ack(), true, round > 0 || attempt > 0);
      if (!ackWire) continue;
      try {
        const ack = readAck(ackWire, frames[0]);
        acknowledged = ack.received;
        emit({ kind: 'ack', message: `ACK ${ack.received.size}/${frames.length}${ack.verified ? ' · sender received verified delivery receipt' : ''}` });
        if (ack.verified) return { delivered: true, receiver, stats };
        break;
      } catch {
        emit({ kind: 'drop', message: 'CORRUPTED ACK discarded' });
      }
    }
  }
  return { delivered: false, receiver, stats };
}
