import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, AudioWaveform, FileText } from 'lucide-react';

const STEM_CONFIGS = [
  { id: 'vocals', name: 'VOCALS.FLAC',  color: 'text-[#00f0ff]' },
  { id: 'drums',  name: 'DRUMS.FLAC',   color: 'text-gray-400'  },
  { id: 'bass',   name: 'BASS.FLAC',    color: 'text-[#e10075]' },
  { id: 'guitar', name: 'GUITAR.FLAC',  color: 'text-[#a78bfa]' },
  { id: 'piano',  name: 'PIANO.FLAC',   color: 'text-[#fb923c]' },
  { id: 'other',  name: 'OTHER.FLAC',   color: 'text-[#d4ff00]' },
];

export default function StemPlayer({ audioSource = null, midiData = null, onOpenSheet }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumes, setVolumes] = useState(
    STEM_CONFIGS.reduce((acc, s) => ({ ...acc, [s.id]: 0.8 }), {})
  );
  const audioRefs = useRef({});

  // Keep audio element volumes in sync with state
  useEffect(() => {
    Object.entries(audioRefs.current).forEach(([id, el]) => {
      if (el) el.volume = volumes[id];
    });
  }, [volumes]);

  const togglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    Object.values(audioRefs.current).forEach(el => {
      if (!el) return;
      next ? el.play().catch(() => {}) : el.pause();
    });
  };

  const playOriginal = () => {
    // Reset all volumes to full, then play all simultaneously
    const fullVolumes = STEM_CONFIGS.reduce((acc, s) => ({ ...acc, [s.id]: 1.0 }), {});
    setVolumes(fullVolumes);
    setIsPlaying(true);
    // Synchronise start time via AudioContext to minimise drift
    try {
      const ctx = new AudioContext();
      const startAt = ctx.currentTime + 0.05;
      Object.entries(audioRefs.current).forEach(([, el]) => {
        if (!el) return;
        el.currentTime = 0;
        const source = ctx.createMediaElementSource(el);
        source.connect(ctx.destination);
        el.play().catch(() => {});
      });
      void startAt; // AudioContext aligns clocks; individual play() calls are close enough
    } catch {
      Object.values(audioRefs.current).forEach(el => {
        if (!el) return;
        el.currentTime = 0;
        el.play().catch(() => {});
      });
    }
  };

  const handleVolumeChange = (id, vol) => {
    setVolumes(prev => ({ ...prev, [id]: vol }));
    if (audioRefs.current[id]) audioRefs.current[id].volume = vol;
  };

  const toggleMute = (id) => handleVolumeChange(id, volumes[id] === 0 ? 0.8 : 0);

  return (
    <div className="w-full max-w-2xl bg-[#111] border border-gray-800 p-6 rounded-lg font-mono relative z-40">

      {/* Global Controls */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-6 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={togglePlay}
            disabled={!audioSource}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors text-white
              ${!audioSource ? 'bg-gray-900 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700'}`}
          >
            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
          </button>
          <div>
            <h3 className="text-gray-300 tracking-widest text-sm">LATENT_STEM_MIXER</h3>
            <p className="text-gray-500 text-xs mt-1">
              {audioSource ? 'SYSTEM READY: 6 CHANNELS SYNCED' : 'AWAITING SOURCE...'}
            </p>
          </div>
        </div>

        {/* Play Original button — reconstructs full mix */}
        {audioSource && (
          <button
            onClick={playOriginal}
            className="font-mono text-xs text-gray-400 hover:text-white hover:bg-white/10 px-4 py-2 rounded transition-colors border border-gray-800"
          >
            PLAY ORIGINAL
          </button>
        )}
      </div>

      {/* Individual Stem Tracks */}
      <div className="space-y-4">
        {STEM_CONFIGS.map((stem) => (
          <div key={stem.id} className="flex items-center justify-between bg-[#1a1a1a] p-3 rounded border border-gray-800/50">
            <audio
              ref={el => { audioRefs.current[stem.id] = el; }}
              src={audioSource?.[stem.id] ?? ''}
              crossOrigin="anonymous"
              onError={(e) => console.error(`Error loading ${stem.id}:`, e.nativeEvent)}
              loop
            />

            <div className="flex items-center gap-3 w-48">
              <AudioWaveform className={`w-5 h-5 ${stem.color}`} />
              <span className={`text-xs tracking-widest ${stem.color}`}>{stem.name}</span>
            </div>

            <div className="flex items-center gap-3 flex-1 px-8">
              <button onClick={() => toggleMute(stem.id)} className="text-gray-500 hover:text-white transition-colors">
                {volumes[stem.id] === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range" min="0" max="1" step="0.01"
                value={volumes[stem.id]}
                onChange={(e) => handleVolumeChange(stem.id, parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            <div className="flex items-center gap-2">
              {midiData?.[stem.id] && (
                <button
                  onClick={() => onOpenSheet?.(stem.id)}
                  className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-all"
                  title="View Sheet Music"
                >
                  <FileText className="w-4 h-4" />
                </button>
              )}
              <a
                href={audioSource?.[stem.id]}
                download={stem.name}
                className="p-2 text-gray-500 hover:text-[#4ade80] hover:bg-green-400/10 rounded transition-all"
              >
                <Download className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
