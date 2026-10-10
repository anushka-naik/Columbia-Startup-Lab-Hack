import React, { useState } from 'react';
import { ChrpPouchHardware } from './ChrpPouchHardware';
import { RadioConfig } from '../types/mesh';
import { Battery, FlipHorizontal, Signal, Radio } from 'lucide-react';

interface PhoneContainerProps {
  children: React.ReactNode;
  radioConfig: RadioConfig;
  isTransmitting: boolean;
  isReceiving: boolean;
  activePacketSnippet?: string;
  senderCallsign: string;
}

export const PhoneContainer: React.FC<PhoneContainerProps> = ({ children, radioConfig, isTransmitting, isReceiving }) => {
  const [isFlippedToHardware, setIsFlippedToHardware] = useState(false);
  return (
    <div className="phone-preview">
      <div className="phone-chassis">
        <div className="phone-screen">
          <div className="relative h-12 shrink-0 flex items-center justify-between px-7 text-[12px] font-semibold text-zinc-900">
            <span>9:41</span>
            <div className="absolute left-1/2 -translate-x-1/2 top-3 w-[92px] h-[25px] rounded-full bg-zinc-950" />
            <div className="flex items-center gap-1.5"><Signal className="w-3.5 h-3.5" /><Battery className="w-5 h-5" /></div>
          </div>
          <div className="conversation-header">
            <span className="w-8" aria-hidden="true" />
            <div className="flex-1 flex flex-col items-center gap-1">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600"><Radio className="w-5 h-5" /></div>
              <span className="text-[15px] font-semibold tracking-tight">Base camp</span>
              <span className="text-[11px] text-zinc-500">{isTransmitting ? 'Sending through the mesh…' : isReceiving ? 'Receiving a message…' : 'Echo 05 · Off-grid, together'}</span>
            </div>
            <button onClick={() => setIsFlippedToHardware(!isFlippedToHardware)} aria-label={isFlippedToHardware ? 'Show conversation' : 'Inspect Chrp hardware'} title={isFlippedToHardware ? 'Show conversation' : 'Inspect hardware'} className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center hover:bg-zinc-200"><FlipHorizontal className="w-4 h-4" /></button>
          </div>
          <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
            {isFlippedToHardware ? <ChrpPouchHardware radioConfig={radioConfig} isTransmitting={isTransmitting} isReceiving={isReceiving} batteryPct={94} onFlipBack={() => setIsFlippedToHardware(false)} /> : children}
          </div>
          <div className="flex justify-center py-2.5 bg-white"><div className="w-28 h-1 bg-zinc-900 rounded-full" /></div>
        </div>
      </div>
      <p className="text-center text-xs text-zinc-400 mt-5">Your phone. A little more possibility.</p>
    </div>
  );
};
