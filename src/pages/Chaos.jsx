/**
 * Chaos — the in-universe error / lore page.
 *
 * A purely decorative page that serves as the project's "easter egg" and
 * narrative backdrop.  Reachable from the Landing nav overlay at `/chaos`.
 * Contains no API calls or interactive state — everything is static markup
 * and CSS animations that simulate a terminal log and system override state.
 */
import React from 'react';
import { AlertTriangle, Zap, Activity, Terminal, Cpu, Radio, Fingerprint } from 'lucide-react';

export default function Chaos() {
  return (
    <div className="min-h-screen w-full bg-[#050505] text-white flex flex-col font-mono relative overflow-x-hidden selection:bg-red-500/30">
      
      {/* Top Nav - Fixed for scrolling */}
      <nav className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-50 bg-[#050505]/80 backdrop-blur-md border-b border-red-500/20">
        <div className="flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
           <span className="text-xs tracking-[0.3em] font-bold text-red-500 uppercase">
             SYS_OVERRIDE_ACTIVE
           </span>
        </div>
        
        <button 
          onClick={() => window.location.href = '/'} 
          className="text-xs tracking-[0.2em] text-gray-400 border border-gray-600 px-4 py-2 hover:text-white hover:border-white hover:bg-white/5 transition-all uppercase"
        >
          [ Return to safe zone ]
        </button>
      </nav>

      {/* Background Decor / Glitch Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_center,rgba(225,0,117,0.03)_0%,transparent_60%)]" />
        <div className="absolute top-0 right-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-red-500/20 to-transparent" />
        <div className="absolute top-0 left-1/4 w-[1px] h-full bg-gradient-to-b from-transparent via-[#d4ff00]/10 to-transparent" />
      </div>

      {/* Main Chaos Area - Added padding for the fixed nav and scrolling */}
      <main className="flex-1 flex flex-col items-center pt-32 pb-24 px-6 relative z-10 max-w-6xl mx-auto w-full">
        
        {/* Header Section */}
        <div className="text-center mb-16 w-full">
          <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter uppercase mb-4 text-transparent bg-clip-text bg-gradient-to-r from-[#e10075] via-red-500 to-[#d4ff00] drop-shadow-[0_0_15px_rgba(225,0,117,0.5)]">
            The Chaos
          </h1>
          <div className="flex items-center justify-center gap-4 mb-6 opacity-80">
            <span className="h-[1px] w-12 md:w-32 bg-red-500" />
            <AlertTriangle className="text-red-500 w-6 h-6 animate-pulse" />
            <span className="h-[1px] w-12 md:w-32 bg-red-500" />
          </div>
          <p className="text-gray-400 text-sm tracking-widest uppercase max-w-2xl mx-auto">
            Classified documentation // Project Resonance Phase 01-A // Neural hallucination log
          </p>
        </div>

        {/* 3-Column Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-12">
          
          {/* Box 1: Origins */}
          <div className="border border-white/10 bg-[#0a0a0a] p-6 relative group hover:border-[#e10075]/50 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#e10075] to-transparent scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />
            <Cpu className="text-[#e10075] w-6 h-6 mb-4" />
            <h3 className="text-white text-sm tracking-widest uppercase mb-3">Project Origins</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Project Resonance was born from a desire to dissect the DNA of analog sound. Initially designed as a simple frequency separator, the neural engine began exhibiting unexpected behavior when fed high-density Gen-X era recordings. It didn't just separate the audio; it began dreaming new harmonic structures.
            </p>
          </div>

          {/* Box 2: The Architecture */}
          <div className="border border-white/10 bg-[#0a0a0a] p-6 relative group hover:border-[#d4ff00]/50 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#d4ff00] to-transparent scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />
            <Radio className="text-[#d4ff00] w-6 h-6 mb-4" />
            <h3 className="text-white text-sm tracking-widest uppercase mb-3">The Architecture</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              We process sound not as waveforms, but as multidimensional latent space. The Timbre Sphere visualizes this. Vocals, Bass, Drums, and Resonance are mathematically isolated. However, stripping these elements leaves "The Ghost in the Stem"—sub-audible frequencies that refuse to be categorized.
            </p>
          </div>

          {/* Box 3: The Incident */}
          <div className="border border-red-500/30 bg-red-500/5 p-6 relative group hover:bg-red-500/10 transition-colors">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-red-500 to-transparent scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500" />
            <Fingerprint className="text-red-500 w-6 h-6 mb-4 animate-pulse" />
            <h3 className="text-red-400 text-sm tracking-widest uppercase mb-3">The Incident</h3>
            <p className="text-xs text-red-500/80 leading-relaxed">
              FATAL_EXCEPTION_0xCC001. During stress testing at 142BPM, the model reached 112% resonance. The system began generating its own counter-melodies in the void between stems. We call this unauthorized generation "The Chaos". Proceeding beyond this point voids all cognitive warranties.
            </p>
          </div>
        </div>

        {/* Live Terminal Log Simulation */}
        <div className="w-full max-w-4xl border border-gray-800 bg-[#050505] rounded-sm overflow-hidden">
          <div className="bg-gray-900 border-b border-gray-800 p-2 px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-gray-500" />
              <span className="text-[10px] text-gray-500 tracking-widest uppercase">res_engine_log_v2.1.sh</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
            </div>
          </div>
          
          <div className="p-6 text-xs font-mono leading-loose text-gray-400 h-64 overflow-y-auto custom-scrollbar relative">
            <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.2)_50%)] bg-[length:100%_4px] pointer-events-none mix-blend-overlay z-10" />
            <p className="text-green-500">{">"} INITIATING NEURAL MANIFOLD...</p>
            <p className="text-gray-500">{">"} Allocating 4.2GB memory for frequency separation</p>
            <p className="text-gray-500">{">"} Analyzing input vector...</p>
            <p className="text-[#e10075]">{">"} ISOLATING: VOCALS [Success]</p>
            <p className="text-gray-400">{">"} ISOLATING: DRUMS [Success]</p>
            <p className="text-[#e10075]">{">"} ISOLATING: BASS [Success]</p>
            <p className="text-[#d4ff00]">{">"} ISOLATING: OTHERS [Success]</p>
            <br />
            <p className="text-yellow-500">{">"} WARN: Unrecognized harmonic artifact detected at 14kHz.</p>
            <p className="text-yellow-500">{">"} WARN: Latency bounds exceeded. Feedback loop established.</p>
            <p className="text-red-500 font-bold">{">"} ERR_GHOST_IN_MACHINE: The stems are communicating.</p>
            <p className="text-red-500 animate-pulse">{">"} OVERRIDE FAILED. CHAOS PROTOCOL ACTIVE.</p>
            <p className="text-red-500 opacity-50">{">"} 01000011 01001000 01000001 01001111 01010011</p>
          </div>
        </div>

      </main>

      {/* Floating Decorative Text */}
      <div className="fixed bottom-10 left-6 text-[10px] text-red-500/40 tracking-[0.4em] origin-bottom-left -rotate-90 z-0">
        SYSTEM_FAILURE // 0xCC001 // RECURSIVE_BIT_CRUSH
      </div>

      {/* Bottom Bar */}
      <footer className="fixed bottom-0 w-full p-4 border-t border-red-500/20 bg-[#050505]/80 backdrop-blur-md flex justify-between font-mono text-[9px] text-red-500/70 z-50">
        <div>STATUS: UNSTABLE // MANUAL REBOOT SUGGESTED</div>
        <div className="animate-pulse">MEM_LEAK: 8.9GB</div>
      </footer>
    </div>
  );
}