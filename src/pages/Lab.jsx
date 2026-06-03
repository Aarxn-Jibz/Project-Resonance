/**
 * Lab — the main stem separation workspace.
 *
 * Owns all shared state for a processing session:
 * - `engineState`   — drives layout transitions and status text in the nav bar.
 * - `audioURL`      — stem URL map (`{vocals, drums, …}`) forwarded to `TimbreDesign`.
 * - `midiData`      — quantized MIDI map (`{vocals, bass, piano}`) forwarded to
 *   `StemPlayer` inside `TimbreDesign`.
 * - `activeSheetStem` — which stem's sheet music modal is open (`null` = closed).
 *
 * Layout behaviour
 * ----------------
 * Before completion, `SeparatorPanel` is centred on the page.  After
 * completion, the layout transitions to a side-by-side view: `TimbreDesign`
 * (with `StemPlayer`) on the left and a compact `SeparatorPanel` on the right.
 * Both panels are blurred when a `SheetMusicModal` is open.
 *
 * Navigation from Library
 * -----------------------
 * When the user selects a song from `/library`, React Router passes
 * `location.state = { stems, midi, hasMidi }`.  The page initialises
 * directly into `complete` state using those pre-loaded values.
 */
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import TimbreDesign from '../components/TimbreDesign';
import SeparatorPanel from '../components/SeparatorPanel';
import SheetMusicModal from '../components/SheetMusicModal';

export default function Lab() {
  const location = useLocation();
  const preloaded = location.state; // set when navigating from Library

  const [engineState, setEngineState] = useState(preloaded ? 'complete' : 'idle');
  const [progress, setProgress] = useState(0);
  const [audioURL, setAudioURL] = useState(preloaded?.stems ?? null);
  const [midiData, setMidiData] = useState(preloaded?.midi ?? null);

  const [activeSheetStem, setActiveSheetStem] = useState(null);

  const isDone = engineState === 'complete';

  const onStemsReady = (receivedStems, receivedMidi) => {
    setAudioURL(receivedStems);
    setMidiData(receivedMidi);
  };


  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-white flex flex-col font-display relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      {/* Nav */}
      <nav className="w-full p-6 flex justify-between items-center z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isDone ? 'bg-green-500 animate-pulse' : 'bg-res-yellow'}`} />
          <span className="font-mono text-xs tracking-[0.3em] font-bold">
            {isDone ? 'RESONANCE_STEMS_READY' : 'RESONANCE_SYSTEM_ACTIVE'}
          </span>
        </div>

        {/* Right side Terminate Button */}
        <button
          onClick={() => window.location.href = '/'}
          className="font-mono text-xs tracking-[0.2em] text-gray-400 border border-gray-600 px-4 py-2 hover:text-white hover:border-white hover:bg-white/5 transition-all uppercase"
        >
          [ Terminate ]
        </button>
      </nav>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full relative p-6 overflow-y-auto overflow-x-hidden">

        {/* The Split Container */}
        <div className={`flex transition-all duration-1000 ease-in-out gap-10 max-w-[1600px] mx-auto 
          ${isDone ? 'flex-row items-start' : 'flex-col items-center justify-center min-h-[70vh]'}`}
        >

          {/* LEFT SIDE: The Sphere/Players */}
          <div className={`transition-all duration-1000 flex-1 ${isDone ? 'opacity-100' : 'opacity-0 scale-95 pointer-events-none absolute'} ${activeSheetStem ? 'blur-sm pointer-events-none opacity-40' : ''}`}>
            <TimbreDesign
              engineState={engineState}
              engineProgress={progress}
              audioSource={audioURL}
              midiData={midiData}
              onOpenSheet={setActiveSheetStem}
            />
          </div>

          {/* RIGHT SIDE (or Center): The Engine Panel */}
          <div className={`transition-all duration-1000 ease-in-out flex-shrink-0 z-20 
            ${isDone ? 'w-[450px] mt-10' : 'w-full max-w-xl'} 
            ${activeSheetStem ? 'blur-md opacity-20 pointer-events-none' : ''}`}
          >
            <SeparatorPanel
              onStateChange={setEngineState}
              onProgressChange={setProgress}
              onFileSelect={onStemsReady}
            />
          </div>

        </div>
      </main>

      {/* Bottom Bar */}
      <footer className="w-full p-4 border-t border-white/5 bg-black/50 backdrop-blur-md flex justify-between font-mono text-[9px] text-gray-500 z-50">
        <div>STATUS: {engineState.toUpperCase()}</div>
        <div>MEM_ALLOC: 4.2GB</div>
      </footer>

      {/* Render Modal at the absolute top level mapping down into the specific stem */}
      <SheetMusicModal
        isOpen={activeSheetStem !== null}
        onClose={() => setActiveSheetStem(null)}
        stemName={activeSheetStem}
        midiData={activeSheetStem ? midiData[activeSheetStem] : null}
      />
    </div>
  );
}