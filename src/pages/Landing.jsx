/**
 * Landing — the public-facing homepage.
 *
 * A purely presentational page: animated hero section, floating artwork,
 * and a slide-in navigation overlay.  No data fetching.
 *
 * Nav overlay links:
 * - Home (`/`)
 * - Library (`/library`) — the public song catalogue
 * - The Chaos (`/chaos`) — lore / easter egg page
 * - Enter Lab (`/lab`) — the main workspace
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// Images
import headphonesImg from '../assets/headphones.jpg';
import cassetteImg from '../assets/cassette.jpg';
import logoImg from '../assets/logo.jpg'; // <-- Added logo import

export default function Landing() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#2a0845] via-[#120428] to-res-dark text-white font-display overflow-hidden relative">
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgwem0yMCAyMGgyMHYyMEgyMHptLTIwIDBoMjB2MjBIMHoiIGZpbGw9IiNmZmZmZmYwNSIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9zdmc+')] opacity-20 pointer-events-none" />

      {/* Navbar */}
      <nav className="relative z-10 flex justify-between items-center p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          {/* Replaced the yellow box with your logo */}
          <img src={logoImg} alt="Project Resonance Logo" className="w-14 h-14 object-contain rounded-sm" />
          <span className="font-bold tracking-[0.2em] text-sm">PROJECT RESONANCE</span>
        </div>
        <button 
          onClick={() => setIsMenuOpen(true)}
          className="w-10 h-10 border border-res-magenta/50 rounded-full flex items-center justify-center hover:bg-res-magenta/20 transition-colors z-50"
        >
          <span className="w-4 h-0.5 bg-res-yellow block relative after:absolute after:w-4 after:h-0.5 after:bg-res-yellow after:-top-1.5 before:absolute before:w-4 before:h-0.5 before:bg-res-yellow before:top-1.5" />
        </button>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex flex-col lg:flex-row items-center justify-between p-8 max-w-7xl mx-auto mt-12 h-full">
        
        {/* Left Column: Typography & CTAs */}
        <div className="lg:w-3/5 space-y-6">
          <div className="inline-block border border-res-magenta text-res-magenta text-xs font-mono px-4 py-1.5 rounded-full tracking-widest bg-res-magenta/10">
            <span className="w-2 h-2 inline-block bg-res-yellow rounded-full mr-2 animate-pulse" />
            ANALOG SOUL / DIGITAL MIND
          </div>

          <div className="leading-none select-none relative z-20">
            <h1 className="text-[10vw] lg:text-[140px] font-black italic text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] tracking-tighter">
              PROJE<span className="text-gray-200">CT</span>
            </h1>
            <h1 className="text-[10vw] lg:text-[140px] font-black italic text-res-yellow drop-shadow-[0_0_20px_rgba(212,255,0,0.5)] tracking-tighter -mt-6 lg:-mt-12">
              RESON<span className="text-[#a8cc00]">ANCE</span>
            </h1>
          </div>

          <h2 className="font-cursive text-5xl lg:text-7xl text-res-magenta font-normal -mt-4 lg:-mt-10 ml-4 lg:ml-8 relative z-30 transform -rotate-2">
            Dissecting sound into structure
          </h2>

          <p className="text-gray-300 max-w-md text-sm lg:text-base leading-relaxed tracking-wide pt-4">
            The ultimate Gen X audio engine. High-fidelity neural deconstruction
            meets retro-futuristic aesthetics. We isolate, transcribe, and reimagine
            music from the era of tape decks and studio cans.
          </p>

          <div className="flex gap-4 pt-8">
            <button 
              onClick={() => navigate('/lab')} 
              className="bg-res-yellow text-black font-bold tracking-widest px-8 py-4 text-sm hover:scale-105 transition-transform shadow-[0_0_20px_rgba(212,255,0,0.4)]"
            >
              ENTER THE LAB
            </button>
            <button 
              onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')} 
              className="border border-res-magenta text-res-magenta font-bold tracking-widest px-8 py-4 text-sm hover:bg-res-magenta/10 transition-colors"
            >
              WATCH VOD
            </button>
          </div>
        </div>

        {/* Right Column: Floating Artwork */}
        <div className="lg:w-2/5 relative mt-16 lg:mt-0 h-[500px] w-full flex justify-center items-center pointer-events-none">
          {/* Headphones Image - Removed mix-blend, brightened it up, kept the grayscale hover effect */}
          <motion.div 
            animate={{ y: [-10, 10, -10], rotate: [0, 2, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            className="w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] bg-[#1a0525] rounded-2xl border border-white/10 shadow-2xl relative z-10 overflow-hidden flex items-center justify-center shadow-res-magenta/20 pointer-events-auto"
          >
            <img 
              src={headphonesImg} 
              alt="Retro Headphones" 
              className="w-full h-full object-cover opacity-80 hover:opacity-100 grayscale hover:grayscale-0 transition-all duration-500" 
            />
          </motion.div>

          {/* Cassette Image - Added brightness-75 to darken it slightly so it isn't glaringly bright */}
          <motion.div 
            animate={{ y: [10, -10, 10], rotate: [5, 0, 5] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute top-10 right-0 lg:-right-10 w-48 h-48 bg-black rounded-lg shadow-2xl border border-white/20 flex items-center justify-center z-20 shadow-black/80 pointer-events-auto overflow-hidden"
          >
             <img 
               src={cassetteImg} 
               alt="Retro Cassette" 
               className="w-full h-full object-cover brightness-75 hover:brightness-100 transition-all duration-500" 
             />
          </motion.div>
        </div>
      </main>

      {/* Full-screen Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', ease: 'easeInOut', duration: 0.3 }}
            className="fixed inset-0 bg-res-dark/95 z-40 flex flex-col items-center justify-center backdrop-blur-md"
          >
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="absolute top-8 right-8 text-white font-mono text-xl hover:text-res-magenta"
            >
              [CLOSE]
            </button>
            <nav className="flex flex-col items-center gap-8 font-display text-3xl font-bold uppercase tracking-widest">
              <a href="/" className="text-white hover:text-res-yellow transition-colors" onClick={() => setIsMenuOpen(false)}>Home</a>
              <button
                onClick={() => { setIsMenuOpen(false); navigate('/library'); }}
                className="text-[#00f0ff] hover:text-white transition-colors tracking-[0.2em]"
              >
                Library
              </button>
              <a
                href="/chaos"
                onClick={() => setIsMenuOpen(false)}
                className="text-white hover:text-red-500 transition-colors uppercase tracking-[0.2em]"
              >
                The Chaos
              </a>
              <button
                onClick={() => { setIsMenuOpen(false); navigate('/lab'); }}
                className="text-res-yellow hover:text-white transition-colors"
              >
                Enter Lab
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Phase Text */}
      <div className="absolute right-0 bottom-32 origin-bottom-right -rotate-90 text-res-yellow font-mono text-xs tracking-[0.3em] opacity-50 hidden lg:block">
        PHASE 01-A
      </div>
    </div>
  );
}