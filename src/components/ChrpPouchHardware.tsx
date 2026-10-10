import React from 'react';
import chrpPouchImg from '../assets/images/chrp_hardware_module_1791647595357.jpg';
import { RadioConfig } from '../types/mesh';
import { Radio } from 'lucide-react';
interface Props { radioConfig: RadioConfig; isTransmitting: boolean; isReceiving: boolean; batteryPct: number; onFlipBack: () => void }
export function ChrpPouchHardware({ radioConfig, isTransmitting, isReceiving, onFlipBack }: Props) {
  return <div className="p-4 space-y-4 overflow-y-auto text-zinc-900">
    <div className="flex items-center justify-between"><div><p className="text-[11px] text-blue-600">Hardware concept</p><h2 className="text-sm font-semibold">The Chrp pouch</h2></div><button onClick={onFlipBack} className="text-xs text-blue-600">Back to messages</button></div>
    <img src={chrpPouchImg} alt="Illustrative concept of a radio module behind a phone" className="rounded-2xl w-full h-40 object-cover" />
    <p className="text-[11px] text-zinc-500">Illustrative concept image. Hardware design and specifications belong to CHRP; this app simulates the software.</p>
    <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-3 space-y-3 text-xs">
      <div className="flex gap-2 items-center font-semibold"><Radio className="w-4 h-4 text-blue-600" />Simulated radio</div>
      <div className="flex justify-between"><span>State</span><span>{isReceiving ? 'Receiving receipt' : isTransmitting ? 'Sending' : 'Idle'}</span></div>
      <div className="flex justify-between"><span>Configured bitrate</span><span>{radioConfig.bitrateBps.toLocaleString()} bps</span></div>
      <div className="flex justify-between"><span>Modeled range limit</span><span>{radioConfig.maxRangeKm} km</span></div>
      <div className="flex justify-between"><span>Maximum frame</span><span>230 B</span></div>
      <div className="flex justify-between"><span>Header / message data</span><span>18 B / up to 212 B</span></div>
    </div>
    <p className="text-xs text-zinc-500 leading-relaxed">The pouch turns a phone into an off-grid radio. Here, virtual phones relay actual encoded bytes, without a server carrying messages between them.</p>
  </div>;
}
