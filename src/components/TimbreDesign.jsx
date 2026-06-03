/**
 * TimbreDesign — the animated visualiser and stem player container.
 *
 * Renders in two modes controlled by `engineState`:
 *
 * **idle / processing** — shows the rotating sphere with three draggable
 * floating nodes (Vocals, Drums, Bass) and a telemetry readout panel.
 * Dragging a node over the sphere core changes the sphere's glow colour.
 * The copy section below the sphere shows marketing/lore text.
 *
 * **complete** — the copy section is replaced by a `StemPlayer` (the
 * 6-channel stem mixer), and the sphere transitions to a green "isolation
 * active" state.  A hidden `<audio>` element wired to `audioSource` drives
 * the sphere's built-in play/pause control (plays the first stem or a
 * combined file; separate from the individual channel mixer).
 *
 * The telemetry values (GLOW_INTENSITY) fluctuate on a timer to give the
 * impression of live signal monitoring — they are decorative and not wired
 * to real audio analysis.
 *
 * @param {object}      props
 * @param {string}      [props.engineState='idle'] - One of `'idle'`,
 *   `'processing'`, `'complete'`, `'error'`.
 * @param {number}      [props.engineProgress=0]   - Reserved; not currently
 *   used for a visual progress indicator.
 * @param {object|null} [props.audioSource]         - Stem URL map passed
 *   directly to `StemPlayer`.
 * @param {object|null} [props.midiData]            - Quantized MIDI map
 *   passed to `StemPlayer`.
 * @param {Function}    [props.onOpenSheet]         - Forwarded to `StemPlayer`
 *   for the sheet music button callback.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Music, Square, Layers, Play } from 'lucide-react'; // Added Play
import StemPlayer from './StemPlayer';

// Added audioSource prop to receive the file URL from Lab.jsx
export default function TimbreDesign({ engineState = 'idle', engineProgress = 0, stems = null, audioSource = null, midiData = null, onOpenSheet }) {
  const isComplete = engineState === 'complete';

  const [activeGlow, setActiveGlow] = useState(null);
  const coreRef = useRef(null);

  // --- AUDIO LOGIC ---
  const masterAudioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlayback = () => {
    if (!masterAudioRef.current || !audioSource) return;

    if (isPlaying) {
      masterAudioRef.current.pause();
    } else {
      masterAudioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Reset play state if source changes
  useEffect(() => {
    setIsPlaying(false);
  }, [audioSource]);
  // -------------------

  const [telemetry, setTelemetry] = useState({
    glow: 88.4,
    groove: 0.92,
    bpm: 128.00
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTelemetry(prev => ({
        ...prev,
        glow: (88 + Math.random() * 2).toFixed(1)
      }));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const handleDrag = (info, color) => {
    if (!coreRef.current) return;
    const rect = coreRef.current.getBoundingClientRect();
    const { x, y } = info.point;
    const isInside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

    if (isInside) {
      setActiveGlow(color);
    } else if (activeGlow === color) {
      setActiveGlow(null);
    }
  };

  let sphereBorder = isComplete ? 'border-green-400/50' : 'border-res-yellow/20';
  let sphereShadow = isComplete
    ? 'shadow-[0_0_150px_rgba(74,222,128,0.4),inset_0_-20px_60px_rgba(0,0,0,0.9)]'
    : 'shadow-[0_0_150px_rgba(212,255,0,0.3),inset_0_-20px_60px_rgba(0,0,0,0.9)]';
  let bloomBg = isComplete ? 'bg-green-400/20' : 'bg-res-yellow/10';

  if (activeGlow) {
    if (activeGlow === 'cyan') {
      sphereBorder = 'border-[#00f0ff]/80';
      sphereShadow = 'shadow-[0_0_150px_rgba(0,240,255,0.6),inset_0_-20px_60px_rgba(0,0,0,0.9)]';
      bloomBg = 'bg-[#00f0ff]/30';
    } else if (activeGlow === 'magenta') {
      sphereBorder = 'border-[#e10075]/80';
      sphereShadow = 'shadow-[0_0_150px_rgba(225,0,117,0.6),inset_0_-20px_60px_rgba(0,0,0,0.9)]';
      bloomBg = 'bg-[#e10075]/30';
    } else if (activeGlow === 'gray') {
      sphereBorder = 'border-gray-400/80';
      sphereShadow = 'shadow-[0_0_150px_rgba(156,163,175,0.6),inset_0_-20px_60px_rgba(0,0,0,0.9)]';
      bloomBg = 'bg-gray-400/30';
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="w-full flex flex-col items-center pt-8 pb-32 relative z-20">

      {/* Hidden Master Audio Element */}
      <audio ref={masterAudioRef} src={audioSource} onEnded={() => setIsPlaying(false)} />

      <div className="w-full flex justify-between items-center max-w-6xl mb-8 px-8 flex-shrink-0">
        <div className={`tracking-[0.3em] text-xs font-mono border-b pb-1 ${isComplete ? 'text-green-400 border-green-400' : 'text-res-yellow border-res-yellow'}`}>
          {isComplete ? 'STEMS // DECOUPLED' : 'SIDE B — TRACK 06'}
        </div>
      </div>

      <div className="text-center mb-12 flex-shrink-0">
        <h1 className="text-7xl font-bold italic text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          {isComplete ? 'Sonic ' : 'Timbre '}
          <span className="font-cursive text-res-magenta font-normal normal-case text-8xl -ml-4">
            {isComplete ? 'Fracture' : 'Design'}
          </span>
        </h1>
        <p className={`${isComplete ? 'text-green-400' : 'text-res-yellow'} mt-2 font-mono text-sm tracking-widest transition-colors`}>
          {isComplete ? 'Audio components successfully isolated.' : 'Where the latent space meets the dance floor.'}
        </p>
      </div>

      <div className={`relative w-full max-w-4xl flex items-center justify-center transition-all duration-700 flex-shrink-0 ${isComplete ? 'h-[300px] mb-8' : 'h-[400px] mb-20'}`}>

        <motion.div
          ref={coreRef}
          animate={{ rotate: 360 }}
          transition={{ duration: isComplete ? 30 : 60, repeat: Infinity, ease: "linear" }}
          className={`w-80 h-80 rounded-full flex flex-col items-center justify-center relative z-10 overflow-hidden bg-gradient-to-br from-gray-100 via-gray-300 to-gray-900 border-2 transition-all duration-500 ${sphereBorder} ${sphereShadow}`}
        >
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGgyMHYyMEgweiIgZmlsbD0ibm9uZSIvPjxwYXRoIGQ9Ik0wIDE5aDIwTTAgOWhVMiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZDRmZjAwIiBzdHJva2Utb3BhY2l0eT0iMC40IiBzdHJva2Utd2lkdGg9IjEiLz48L3N2Zz4=')] opacity-80 mix-blend-overlay rounded-full scale-[1.8]" />
          <div className={`absolute inset-0 blur-2xl rounded-full transition-colors duration-500 ${bloomBg}`} />

          {/* Main Playback Control inside the Sphere */}
          <button
            onClick={togglePlayback}
            className="relative z-30 bg-black/40 p-6 rounded-full border border-white/20 hover:scale-110 transition-transform backdrop-blur-md group"
          >
            {isPlaying ? (
              <Square className="w-8 h-8 text-white fill-white" />
            ) : (
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            )}
          </button>
        </motion.div>

        <div className={`absolute -bottom-8 font-mono tracking-[0.3em] text-sm font-bold z-20 border-b pb-1 transition-colors ${isComplete && !activeGlow ? 'text-green-400 border-green-400' : (activeGlow ? `text-white border-white` : 'text-res-magenta border-res-magenta')}`}>
          {isComplete ? 'ISOLATION_MATRIX_ACTIVE' : 'LATENT_CORE_01'}
        </div>

        {/* Floating Node 1: Vocals (Cyan) */}
        <motion.div
          drag
          dragConstraints={{ left: -300, right: 300, top: -200, bottom: 200 }}
          onDrag={(e, info) => handleDrag(info, 'cyan')}
          animate={{ y: [0, -15, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-10 left-[20%] flex flex-col items-center cursor-grab active:cursor-grabbing z-30"
        >
          <Music className="w-12 h-12 text-[#00f0ff] drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
          <span className="font-mono text-[10px] text-[#00f0ff] mt-2 tracking-widest bg-black/50 px-2 py-1 rounded border border-[#00f0ff]/30">
            {isComplete ? 'VOCAL_STEM.WAV' : 'PITCH_NODE_A'}
          </span>
        </motion.div>

        {/* Floating Node 2: Drums (Gray) */}
        <motion.div
          drag
          dragConstraints={{ left: -300, right: 300, top: -200, bottom: 200 }}
          onDrag={(e, info) => handleDrag(info, 'gray')}
          animate={{ y: [0, 20, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-10 left-[15%] flex flex-col items-center cursor-grab active:cursor-grabbing z-30"
        >
          <div className="w-8 h-20 bg-gray-500/50 backdrop-blur-md border border-gray-400 transform -rotate-45 shadow-[0_0_10px_rgba(156,163,175,0.5)]" />
          <span className="font-mono text-[10px] text-gray-400 mt-2 tracking-widest bg-black/50 px-2 py-1 rounded border border-gray-500/30">
            {isComplete ? 'DRUM_TRANSIENTS.WAV' : 'KEY_MOD_04'}
          </span>
        </motion.div>

        {/* Floating Node 3: Bass/Instruments (Magenta) */}
        <motion.div
          drag
          dragConstraints={{ left: -300, right: 300, top: -200, bottom: 200 }}
          onDrag={(e, info) => handleDrag(info, 'magenta')}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute bottom-12 right-[20%] flex flex-col items-center cursor-grab active:cursor-grabbing z-30"
        >
          <Layers className="w-12 h-12 text-res-magenta drop-shadow-[0_0_15px_rgba(225,0,117,0.8)]" />
          <span className="font-mono text-[10px] text-res-magenta mt-2 tracking-widest bg-black/50 px-2 py-1 rounded border border-res-magenta/30">
            {isComplete ? 'BASS_HARMONICS.WAV' : 'HARMONIC_STRATA'}
          </span>
        </motion.div>

        {/* Telemetry Box */}
        <div className="absolute top-10 right-0 border border-[#333] bg-res-panel/80 p-6 backdrop-blur-sm w-64 z-20 pointer-events-none">
          <h3 className="text-res-yellow text-[10px] font-mono mb-6 flex items-center justify-between tracking-widest">
            {isComplete ? 'STEM TELEMETRY' : 'REAL-TIME TELEMETRY'}
            <span className={`w-2 h-2 rounded-full animate-pulse ${isComplete && !activeGlow ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : (activeGlow === 'cyan' ? 'bg-[#00f0ff] shadow-[0_0_8px_#00f0ff]' : activeGlow === 'gray' ? 'bg-gray-400 shadow-[0_0_8px_gray]' : 'bg-res-magenta shadow-[0_0_8px_#e10075]')}`} />
          </h3>
          <div className="space-y-4 font-mono text-[11px] tracking-wider">
            <div className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-500">GLOW_INTENSITY</span>
              <span className={activeGlow === 'cyan' ? 'text-[#00f0ff]' : activeGlow === 'magenta' ? 'text-[#e10075]' : activeGlow === 'gray' ? 'text-gray-400' : (isComplete ? 'text-[#4ade80]' : 'text-res-magenta')}>
                {activeGlow ? 'MAX' : (isComplete ? '100.0' : telemetry.glow)}%
              </span>
            </div>
            <div className="flex justify-between border-b border-gray-800 pb-2">
              <span className="text-gray-500">{isComplete ? 'SEPARATION_CONFIDENCE' : 'GROOVE_INDEX'}</span>
              <span className="text-res-yellow">{isComplete ? '0.99' : telemetry.groove}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">BPM_SYNC</span>
              <span className="text-[#4ade80]">{telemetry.bpm}</span>
            </div>
          </div>
        </div>
      </div>

      {!isComplete ? (
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-12 px-8 mt-4 flex-shrink-0">
          <div>
            <h4 className="text-gray-500 font-mono text-4xl mb-2 opacity-50 italic">01</h4>
            <h3 className="text-res-yellow font-display text-xl mb-4">The Groovy Manifold</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Gen X sensibilities meet future-tech. We treat audio data like a disco dance floor—vibrant, multi-dimensional, and always moving to the beat.
            </p>
          </div>
          <div>
            <h4 className="text-res-magenta font-mono text-4xl mb-2 opacity-50 italic">02</h4>
            <h3 className="text-res-magenta font-display text-xl mb-4 italic">Hyper-Retro Fluidity</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Our 3D objects aren't just for show. They represent the actual harmonic components morphing through the silver-mirrored lens of the latent space.
            </p>
          </div>
          <div>
            <h4 className="text-res-yellow font-mono text-4xl mb-2 opacity-50 italic">03</h4>
            <h3 className="text-res-yellow font-display text-xl mb-4 italic">Vibrant Synthesis</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Navigation is intuitive. Spin the sphere to interpolate between analog warmth and digital precision in a seamless, glowing transition.
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="w-full max-w-5xl flex justify-center mt-4 px-8 flex-shrink-0"
        >
          {/* Passing audioSource into the StemPlayer (which contains your sliders) */}
          <StemPlayer audioSource={audioSource} midiData={midiData} onOpenSheet={onOpenSheet} />
        </motion.div>
      )}
    </motion.div>
  );
}