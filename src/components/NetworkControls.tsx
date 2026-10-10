import React from 'react';
import { LoRaPreset, RADIO_PRESETS, RadioConfig } from '../types/mesh';
import {
  Sliders,
  Radio,
  Zap,
  Gauge,
  ShieldAlert,
  PlayCircle,
  RotateCcw,
  FastForward,
} from 'lucide-react';

interface NetworkControlsProps {
  radioConfig: RadioConfig;
  onSelectPreset: (preset: LoRaPreset) => void;
  packetLossPct: number;
  onChangeLossPct: (pct: number) => void;
  simSpeedMultiplier: number;
  onChangeSimSpeed: (speed: number) => void;
  onTriggerDemoScenario: (scenario: 'voice_loss' | 'progressive_recon' | 'fec_recovery' | 'extreme_slow') => void;
  onResetSimulation: () => void;
  isTransmitting: boolean;
}

export const NetworkControls: React.FC<NetworkControlsProps> = ({
  radioConfig,
  onSelectPreset,
  packetLossPct,
  onChangeLossPct,
  simSpeedMultiplier,
  onChangeSimSpeed,
  onTriggerDemoScenario,
  onResetSimulation,
  isTransmitting,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            Mesh Physical Layer & Demo Scenarios
          </h3>
        </div>
        <button
          onClick={onResetSimulation}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* 1-Click Judge Demo Scenarios (HERO SECTION FOR JUDGES) */}
      <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono uppercase font-bold text-amber-400 flex items-center gap-1.5">
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Judge Demo Scenarios (1-Click Run)</span>
          </span>
          <span className="text-[10px] font-mono text-slate-400">Track 1 Requirements</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => onTriggerDemoScenario('voice_loss')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-slate-900 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-bold text-white group-hover:text-amber-300">
              01. Voice Note + 20% Loss
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Sends 460B voice clip across 3 hops. Recovers dropped chunk via ARQ NACK.
            </div>
          </button>

          <button
            onClick={() => onTriggerDemoScenario('progressive_recon')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-slate-900 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-bold text-white group-hover:text-cyan-300">
              02. Progressive Recon Photo
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              4 passes @ 230B. Chunk 1 renders instant blurry preview, then sharpens.
            </div>
          </button>

          <button
            onClick={() => onTriggerDemoScenario('fec_recovery')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-slate-900 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-bold text-white group-hover:text-emerald-300">
              03. FEC Parity Instant Recovery
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Packet #2 lost in canyon; reconstructed mathematically without NACK wait.
            </div>
          </button>
        </div>
      </div>

      {/* LoRa Modulation Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" />
            <span>LoRa Radio Preset Modulation</span>
          </span>
          <span className="font-mono text-cyan-400 text-[11px]">
            {radioConfig.bitrateBps >= 1000 ? `${(radioConfig.bitrateBps / 1000).toFixed(1)} kbps` : `${radioConfig.bitrateBps} bps`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(RADIO_PRESETS) as LoRaPreset[]).map((key) => {
            const p = RADIO_PRESETS[key];
            const isSelected = radioConfig.preset === key;

            return (
              <button
                key={key}
                onClick={() => onSelectPreset(key)}
                className={`p-2 rounded-xl text-left border transition-all ${
                  isSelected
                    ? 'bg-cyan-950/50 border-cyan-400 text-white shadow-sm ring-1 ring-cyan-400/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-[11px] font-bold truncate">{p.name.split(' (')[0]}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  {p.bitrateBps >= 1000 ? `${(p.bitrateBps / 1000).toFixed(1)} kbps` : `${p.bitrateBps} bps`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sliders: Packet Loss & Simulation Speed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        {/* Packet Loss Slider */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Hop Packet Loss Rate</span>
            </span>
            <span className="font-mono font-bold text-rose-400">{packetLossPct}%</span>
          </div>

          <input
            type="range"
            min="0"
            max="40"
            step="5"
            value={packetLossPct}
            onChange={(e) => onChangeLossPct(Number(e.target.value))}
            className="w-full accent-rose-500 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>0% Ideal</span>
            <span className="text-amber-400 font-bold">20% Track Target</span>
            <span>40% Severe</span>
          </div>
        </div>

        {/* Simulation Speed */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <FastForward className="w-3.5 h-3.5 text-indigo-400" />
              <span>Simulation Clock Warp</span>
            </span>
            <span className="font-mono font-bold text-indigo-400">{simSpeedMultiplier}x Realtime</span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 5, 10].map((spd) => (
              <button
                key={spd}
                onClick={() => onChangeSimSpeed(spd)}
                className={`py-1 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                  simSpeedMultiplier === spd
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
          <div className="text-[10px] text-slate-400">
            Fast-forward allows inspecting 1 kbps slow transmissions without waiting 60s.
          </div>
        </div>
      </div>
    </div>
  );
};
