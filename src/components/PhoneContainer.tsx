import React, { useState } from 'react';
import { ChrpPouchHardware } from './ChrpPouchHardware';
import { RadioConfig } from '../types/mesh';
import { FlipHorizontal } from 'lucide-react';

interface PhoneContainerProps {
  children: React.ReactNode;
  radioConfig: RadioConfig;
  isTransmitting: boolean;
  isReceiving: boolean;
  activePacketSnippet?: string;
  senderCallsign: string;
}

export const PhoneContainer: React.FC<PhoneContainerProps> = ({
  children,
  radioConfig,
  isTransmitting,
  isReceiving,
  activePacketSnippet,
  senderCallsign,
}) => {
  const [isFlippedToHardware, setIsFlippedToHardware] = useState(false);

  return (
    <div className="relative flex flex-col items-center justify-center p-0 sm:p-4">
      {/* iPhone Outer Chassis Frame */}
      <div className="relative w-full max-w-[min(390px,calc(100vw-24px))] h-[min(680px,calc(100svh-112px))] min-h-[560px] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-[4px] border-slate-700 shadow-black/15 flex flex-col overflow-hidden">
        {/* Antenna Stub visualization on top-left of the phone */}
        <div className="absolute -top-3 left-10 w-4 h-5 bg-gradient-to-t from-slate-700 to-slate-900 rounded-t-sm border-t border-slate-600 flex items-center justify-center">
          <span className="w-1.5 h-1 bg-amber-400/80 rounded-full" />
        </div>

        {/* Phone Screen Container */}
        <div className="relative w-full h-full bg-slate-950 rounded-[40px] overflow-hidden flex flex-col border border-slate-800/80 shadow-inner">
          {/* iOS Status Bar */}
          <div className="relative z-30 flex h-12 shrink-0 items-center justify-between px-5 pt-1 text-xs select-none">
            <span className="font-semibold text-slate-100 tracking-tight tabular-nums">09:41</span>

            {/* Quiet Dynamic Island indicator for the off-grid link. */}
            <div aria-live="polite" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-7 min-w-[88px] rounded-full bg-black px-3 flex items-center justify-center gap-2 shadow-sm">
              <span className={`h-1.5 w-1.5 rounded-full ${isTransmitting ? 'bg-amber-400 animate-pulse' : isReceiving ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-[9px] font-semibold tracking-[0.08em] text-white">
                {isTransmitting ? 'SENDING' : isReceiving ? 'RECEIVING' : 'MESH'}
              </span>
            </div>

            <button
              onClick={() => setIsFlippedToHardware(!isFlippedToHardware)}
              title="Flip phone to inspect CHRP Hardware Module"
              aria-label={isFlippedToHardware ? 'Return to phone screen' : 'Inspect CHRP pouch'}
              className="relative z-10 flex items-center gap-1.5 rounded-full border border-slate-800 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-sm hover:bg-slate-800"
            >
              <FlipHorizontal className="h-3 w-3 text-cyan-400" />
              <span>{isFlippedToHardware ? 'Screen' : 'Pouch'}</span>
            </button>
          </div>

          {/* Body Content: Either Screen (Chat) or Back (Hardware Pouch) */}
          <div className="relative flex-1 overflow-hidden flex flex-col">
            {isFlippedToHardware ? (
              <ChrpPouchHardware
                radioConfig={radioConfig}
                isTransmitting={isTransmitting}
                isReceiving={isReceiving}
                batteryPct={94}
                onFlipBack={() => setIsFlippedToHardware(false)}
              />
            ) : (
              children
            )}
          </div>

          {/* iOS Bottom Home Indicator Bar */}
          <div className="w-full py-1.5 flex justify-center bg-slate-950/80 backdrop-blur-sm pointer-events-none">
            <div className="w-32 h-1 bg-slate-600 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
