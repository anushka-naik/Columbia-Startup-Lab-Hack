import React, { useState } from 'react';
import { MessageType } from '../types/mesh';
import { PRESET_VOICE_NOTES } from '../utils/audioCodec';
import { PRESET_PHOTOS } from '../utils/imageCodec';
import {
  Send,
  Mic,
  Image as ImageIcon,
  Shield,
  Radio,
  FileText,
  ChevronUp,
  X,
  Volume2,
} from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (params: {
    type: MessageType;
    text: string;
    audioPresetId?: string;
    photoPresetId?: string;
    customPhotoUrl?: string;
    useFec: boolean;
  }) => void;
  isTransmitting: boolean;
  recipientCallsign: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  isTransmitting,
  recipientCallsign,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeMediaTab, setActiveMediaTab] = useState<'none' | 'voice' | 'photo'>('none');
  const [selectedVoicePreset, setSelectedVoicePreset] = useState<string>(PRESET_VOICE_NOTES[0].id);
  const [selectedPhotoPreset, setSelectedPhotoPreset] = useState<string>(PRESET_PHOTOS[0].id);
  const [useFec, setUseFec] = useState<boolean>(true); // Default ON to show robust network survival!

  const handleSendText = () => {
    if (!inputText.trim() || isTransmitting) return;
    onSendMessage({
      type: 'text',
      text: inputText.trim(),
      useFec,
    });
    setInputText('');
  };

  const handleSendVoice = () => {
    if (isTransmitting) return;
    const preset = PRESET_VOICE_NOTES.find(p => p.id === selectedVoicePreset) || PRESET_VOICE_NOTES[0];
    onSendMessage({
      type: 'voice',
      text: preset.transcript,
      audioPresetId: preset.id,
      useFec,
    });
    setActiveMediaTab('none');
  };

  const handleSendPhoto = () => {
    if (isTransmitting) return;
    const preset = PRESET_PHOTOS.find(p => p.id === selectedPhotoPreset) || PRESET_PHOTOS[0];
    onSendMessage({
      type: 'image',
      text: preset.description,
      photoPresetId: preset.id,
      customPhotoUrl: preset.imageUrl,
      useFec,
    });
    setActiveMediaTab('none');
  };

  return (
    <div className="relative border-t border-slate-800 bg-slate-950/95 p-3 flex flex-col gap-2">
      {/* Media Tray Drawer (Slide-up when Voice or Photo tab active) */}
      {activeMediaTab !== 'none' && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-mono font-semibold text-amber-400">
              {activeMediaTab === 'voice' ? 'Micro-Speech Voice Encoder' : 'Progressive Recon Photo Encoder'}
            </span>
            <button
              onClick={() => setActiveMediaTab('none')}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Voice Presets */}
          {activeMediaTab === 'voice' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-300">
                Encodes speech using Codec2 / LPC Formants into <strong className="text-amber-400">two 230-byte LoRa packets (460B)</strong>.
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_VOICE_NOTES.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedVoicePreset(preset.id)}
                    className={`p-2 rounded-lg text-left text-xs transition-colors border ${
                      selectedVoicePreset === preset.id
                        ? 'bg-amber-950/50 border-amber-600 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{preset.title}</span>
                      <span className="text-[10px] font-mono text-amber-400">{preset.durationSec}s</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      "{preset.transcript}"
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSendVoice}
                disabled={isTransmitting}
                className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Compress & Transmit Voice Note (460 Bytes)</span>
              </button>
            </div>
          )}

          {/* Photo Presets */}
          {activeMediaTab === 'photo' && (
            <div className="space-y-2">
              <div className="text-[11px] text-slate-300">
                Squeezes 1.2MB image into <strong className="text-cyan-400">4 progressive chunks of 230 bytes (920B)</strong>.
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PHOTOS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedPhotoPreset(preset.id)}
                    className={`relative rounded-lg overflow-hidden border p-1 text-left transition-colors ${
                      selectedPhotoPreset === preset.id
                        ? 'border-cyan-400 ring-1 ring-cyan-400 bg-slate-800'
                        : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                    }`}
                  >
                    <img
                      src={preset.imageUrl}
                      alt={preset.title}
                      className="w-full h-16 object-cover rounded"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-[10px] font-semibold text-white mt-1 truncate">
                      {preset.title}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSendPhoto}
                disabled={isTransmitting}
                className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20 disabled:opacity-50"
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Compress & Transmit Progressive Photo (920 Bytes)</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Options Row (FEC toggle & Media buttons) */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveMediaTab(activeMediaTab === 'voice' ? 'none' : 'voice')}
            className={`px-2 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1 transition-colors ${
              activeMediaTab === 'voice'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Mic className="w-3 h-3 text-amber-400" />
            <span>Voice</span>
          </button>

          <button
            onClick={() => setActiveMediaTab(activeMediaTab === 'photo' ? 'none' : 'photo')}
            className={`px-2 py-1 rounded-md border text-[11px] font-medium flex items-center gap-1 transition-colors ${
              activeMediaTab === 'photo'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <ImageIcon className="w-3 h-3 text-cyan-400" />
            <span>Photo</span>
          </button>
        </div>

        {/* FEC Parity Checkbox Button */}
        <button
          onClick={() => setUseFec(!useFec)}
          title="Forward Error Correction adds 1 parity packet for single-packet instant recovery without ARQ round-trip delay"
          className={`px-2 py-0.5 rounded text-[10px] font-mono border flex items-center gap-1 transition-colors ${
            useFec
              ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>FEC Parity: {useFec ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {/* Main Text Input Field & Send Trigger */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendText();
          }}
          placeholder={`Direct message to ${recipientCallsign}...`}
          disabled={isTransmitting}
          className="flex-1 px-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/60 transition-colors disabled:opacity-50"
        />

        <button
          onClick={handleSendText}
          disabled={!inputText.trim() || isTransmitting}
          className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-amber-500/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
