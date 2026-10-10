import React, { useState } from 'react';
import { ChrpPouchHardware } from './ChrpPouchHardware';
import { RadioConfig } from '../types/mesh';
import { Radio, Battery, WifiOff, FlipHorizontal, Signal } from 'lucide-react';

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
    <div className="relative flex flex-col items-center justify-center p-2 sm:p-4">
      {/* iPhone Outer Chassis Frame */}
      <div className="relative w-full max-w-[390px] h-[780px] bg-slate-900 rounded-[50px] p-3 shadow-2xl border-[4px] border-slate-700 shadow-black/80 flex flex-col overflow-hidden">
        {/* Antenna Stub visualization on top-left of the phone */}
        <div className="absolute -top-3 left-10 w-4 h-5 bg-gradient-to-t from-slate-700 to-slate-900 rounded-t-sm border-t border-slate-600 flex items-center justify-center">
          <span className="w-1.5 h-1 bg-amber-400/80 rounded-full" />
        </div>

        {/* Hardware / Screen Flip Pill Button on frame */}
        <button
          onClick={() => setIsFlippedToHardware(!isFlippedToHardware)}
          title="Flip phone to inspect CHRP Hardware Module"
          className="absolute top-5 right-7 z-40 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-600/80 text-[11px] font-medium shadow-md transition-all active:scale-95"
        >
          <FlipHorizontal className="w-3 h-3 text-amber-400" />
          <span>{isFlippedToHardware ? 'Screen' : 'Pouch'}</span>
        </button>

        {/* Phone Screen Container */}
        <div className="relative w-full h-full bg-slate-950 rounded-[40px] overflow-hidden flex flex-col border border-slate-800/80 shadow-inner">
          {/* iOS Status Bar */}
          <div className="relative z-30 flex items-center justify-between px-6 pt-3 pb-1 text-xs select-none">
            {/* Time & Carrier */}
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white tracking-tight">09:41</span>
              <div className="flex items-center gap-1 text-[10px] text-amber-400 font-mono ml-2">
                <WifiOff className="w-3 h-3 text-rose-400" />
                <span className="text-slate-400">NO CELL</span>
              </div>
            </div>

            {/* Dynamic Island / LoRa Activity Bar */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2 w-28 h-6 bg-black rounded-full border border-slate-800 flex items-center justify-between px-2.5 shadow-md">
              <div className="flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isTransmitting
                      ? 'bg-amber-400 animate-ping'
                      : isReceiving
                      ? 'bg-emerald-400 animate-pulse'
                      : 'bg-slate-600'
                  }`}
                />
                <span className="text-[9px] font-mono font-bold text-slate-300">
                  {isTransmitting ? 'LORA TX' : isReceiving ? 'LORA RX' : 'CHRP MESH'}
                </span>
              </div>
              <Radio className="w-3 h-3 text-amber-400" />
            </div>

            {/* Battery & Radio Signal */}
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-[10px] font-mono text-cyan-400">915MHz</span>
              <Battery className="w-4 h-4 text-emerald-400" />
            </div>
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
