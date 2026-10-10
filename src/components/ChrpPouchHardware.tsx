import React from 'react';
import chrpPouchImg from '../assets/images/chrp_hardware_module_1791647595357.jpg';
import { RadioConfig } from '../types/mesh';
import { Radio, Zap, Shield, Battery, Cpu, Activity, Info } from 'lucide-react';

interface ChrpPouchHardwareProps {
  radioConfig: RadioConfig;
  isTransmitting: boolean;
  isReceiving: boolean;
  batteryPct: number;
  onFlipBack: () => void;
}

export const ChrpPouchHardware: React.FC<ChrpPouchHardwareProps> = ({
  radioConfig,
  isTransmitting,
  isReceiving,
  batteryPct,
  onFlipBack,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 p-4 overflow-y-auto select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <span className="text-xs uppercase tracking-wider text-amber-400 font-mono font-semibold">
            Hardware Attachment
          </span>
          <h2 className="text-sm font-bold text-white tracking-tight">
            CHRP MagSafe LoRa Pouch
          </h2>
        </div>
        <button
          onClick={onFlipBack}
          className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 transition-colors"
        >
          View Phone Screen
        </button>
      </div>

      {/* Hardware Render Photo */}
      <div className="relative mt-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 group">
        <img
          src={chrpPouchImg}
          alt="CHRP LoRa pouch mounted on smartphone"
          className="w-full h-48 object-cover object-center group-hover:scale-105 transition-transform duration-500"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent pointer-events-none" />

        {/* Live Active LED Indicators on Image */}
        <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full border border-slate-700">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                isTransmitting ? 'bg-amber-400 animate-ping' : 'bg-amber-400/30'
              }`}
            />
            <span className="text-[10px] font-mono text-slate-300">TX</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-colors ${
                isReceiving ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-400/30'
              }`}
            />
            <span className="text-[10px] font-mono text-slate-300">RX</span>
          </div>
        </div>

        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-slate-300">
          <span className="text-white font-medium">Model: CHRP Mark II Alpha</span>
          <span className="text-amber-400">915.000 MHz ISM</span>
        </div>
      </div>

      {/* Hardware Specifications Grid */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>RF Transceiver</span>
          </div>
          <div className="text-xs font-mono font-semibold text-white">Semtech SX1262</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            +22 dBm (160 mW) PA
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>Preset Modulation</span>
          </div>
          <div className="text-xs font-mono font-semibold text-cyan-300 truncate">
            {radioConfig.preset.replace('_', ' ').toUpperCase()}
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            {radioConfig.bitrateBps} bps · SF{radioConfig.spreadingFactor}
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Battery className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pouch Battery</span>
          </div>
          <div className="text-xs font-mono font-semibold text-emerald-400 tabular-nums">
            {batteryPct}% (2,400 mAh)
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            ~72h standby / 18h TX
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80">
          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mb-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Payload Packet MTU</span>
          </div>
          <div className="text-xs font-mono font-semibold text-white tabular-nums">
            230 Bytes / Chunk
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            LoRa standard frame
          </div>
        </div>
      </div>

      {/* How it works note */}
      <div className="mt-3 p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
        <div className="flex items-center gap-1.5 font-semibold text-white mb-1">
          <Info className="w-3.5 h-3.5 text-amber-400" />
          <span>The CHRP Off-Grid Architecture</span>
        </div>
        The modular pouch snaps magnetically onto the iPhone, interfacing via ultra-low-energy BLE
        or NFC. When cellular and WiFi drop completely to zero, CHRP routes your voice, images, and
        text across the ad-hoc peer-to-peer LoRa mesh up to 15+ kilometers without infrastructure.
      </div>
    </div>
  );
};
