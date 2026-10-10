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
    <div className="panel p-5 sm:p-6 space-y-5 text-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h3 className="text-base font-semibold tracking-tight text-zinc-900">
            Make it your own
          </h3>
        </div>
        <button
          onClick={onResetSimulation}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* 1-Click Judge Demo Scenarios (HERO SECTION FOR JUDGES) */}
      <div className="p-3 rounded-xl bg-zinc-50 border border-blue-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] tabular-nums  font-semibold text-blue-600 flex items-center gap-1.5">
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Give it a try</span>
          </span>
          <span className="text-[11px] tabular-nums text-zinc-500">Repeatable 20% loss</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => onTriggerDemoScenario('voice_loss')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-white hover:bg-blue-50/40 border border-zinc-200 hover:border-blue-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-semibold text-zinc-900 group-hover:text-blue-600">
              Send a voice note
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              Real Opus audio across 3 hops with 20% loss. Missing chunks are retried.
            </div>
          </button>

          <button
            onClick={() => onTriggerDemoScenario('progressive_recon')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-white hover:bg-blue-50/40 border border-zinc-200 hover:border-blue-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-semibold text-zinc-900 group-hover:text-blue-600">
              Share the view
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              Watch a photo arrive in layers, a little clearer with each one.
            </div>
          </button>

          <button
            onClick={() => onTriggerDemoScenario('fec_recovery')}
            disabled={isTransmitting}
            className="p-2.5 rounded-lg text-left bg-white hover:bg-emerald-50/40 border border-zinc-200 hover:border-emerald-500/50 transition-all disabled:opacity-50 group"
          >
            <div className="text-xs font-semibold text-zinc-900 group-hover:text-emerald-600">
              Stay connected
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
              One received XOR parity frame can rebuild one missing data chunk.
            </div>
          </button>
        </div>
      </div>

      {/* LoRa Modulation Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-blue-600" />
            <span>Range & speed</span>
          </span>
          <span className="tabular-nums text-blue-600 text-[11px]">
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
                aria-pressed={isSelected}
                disabled={isTransmitting}
                onClick={() => onSelectPreset(key)}
                className={`p-2 rounded-xl text-left border transition-all ${
                  isSelected
                    ? 'bg-blue-50/50 border-blue-400 text-zinc-900 shadow-sm ring-1 ring-blue-400/40'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <div className="text-[11px] font-semibold truncate">{p.name.split(' (')[0]}</div>
                <div className="text-[11px] tabular-nums text-zinc-500 mt-0.5">
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
        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Packet loss</span>
            </span>
            <span className="tabular-nums font-semibold text-rose-600">{packetLossPct}%</span>
          </div>

          <input
            disabled={isTransmitting}
            aria-label="Packet loss percentage"
            type="range"
            min="0"
            max="40"
            step="5"
            value={packetLossPct}
            onChange={(e) => onChangeLossPct(Number(e.target.value))}
            className="w-full accent-blue-600 bg-zinc-100 h-1.5 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
            <span>0% loss</span>
            <span className="text-blue-600 font-semibold">20% per hop</span>
            <span>40% loss</span>
          </div>
        </div>

        {/* Simulation Speed */}
        <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-700 flex items-center gap-1.5">
              <FastForward className="w-3.5 h-3.5 text-blue-600" />
              <span>Playback speed</span>
            </span>
            <span className="tabular-nums font-semibold text-blue-600">{simSpeedMultiplier}x Realtime</span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[0.5, 1, 2, 5, 10].map((spd) => (
              <button
                key={spd}
                aria-pressed={simSpeedMultiplier === spd}
                disabled={isTransmitting}
                onClick={() => onChangeSimSpeed(spd)}
                className={`py-1 text-xs tabular-nums font-semibold rounded-lg border transition-colors ${
                  simSpeedMultiplier === spd
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
          <div className="text-[11px] text-zinc-500">
            Playback speed does not change measured radio airtime or byte totals.
          </div>
        </div>
      </div>
    </div>
  );
};
