/**
 * Library — public song catalogue.
 *
 * Displays every song that has been processed by the ML pipeline, sourced
 * from the D1 `songs` table via `GET /api/library`.  The list is visible
 * to all users (no auth) and grows automatically as new songs are processed.
 *
 * Features
 * --------
 * - Debounced search (300 ms) filters by filename via the `?search=` query param.
 * - Each row shows MIDI availability badges (VOC / BASS / PIANO) so users
 *   know before opening a song whether sheet music is available.
 * - Clicking a row calls `GET /api/stems/:jobId` and navigates to `/lab`
 *   with the stem and MIDI data pre-populated in `location.state`, skipping
 *   the upload step.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Music, FileText, Loader2 } from 'lucide-react';
import { getLibrary, getStems } from '../lib/api.js';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Library() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debouncedSearch = useDebounce(search, 300);

  const fetchSongs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLibrary({ search: debouncedSearch });
      setSongs(data.songs ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchSongs(); }, [fetchSongs]);

  const handleSelect = async (jobId) => {
    try {
      const data = await getStems(jobId);
      navigate('/lab', { state: { stems: data.stems, midi: data.midi, hasMidi: data.has_midi } });
    } catch (e) {
      console.error('Failed to load stems:', e);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0a] text-white font-mono">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.03)_0%,transparent_70%)] pointer-events-none" />

      {/* Nav */}
      <nav className="w-full p-6 flex justify-between items-center z-50 relative">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-res-yellow" />
          <span className="font-mono text-xs tracking-[0.3em] font-bold">RESONANCE_LIBRARY</span>
        </div>
        <button
          onClick={() => navigate('/')}
          className="font-mono text-xs tracking-[0.2em] text-gray-400 border border-gray-600 px-4 py-2 hover:text-white hover:border-white hover:bg-white/5 transition-all uppercase"
        >
          [ Back ]
        </button>
      </nav>

      <main className="max-w-4xl mx-auto px-6 pb-16 relative z-10">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="SEARCH SONGS..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#111] border border-gray-800 text-white font-mono text-sm pl-11 pr-4 py-3 rounded-lg focus:outline-none focus:border-[#00f0ff] transition-colors tracking-widest placeholder-gray-600"
          />
        </div>

        {/* Song list */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-gray-500 gap-3">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs tracking-widest">LOADING...</span>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-xs tracking-widest text-center py-8">[ERROR] {error}</div>
        )}

        {!loading && !error && songs.length === 0 && (
          <div className="text-gray-600 text-xs tracking-widest text-center py-16">
            {search ? 'NO RESULTS FOUND.' : 'NO SONGS PROCESSED YET.'}
          </div>
        )}

        <div className="space-y-3">
          {songs.map((song, i) => (
            <motion.button
              key={song.job_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => handleSelect(song.job_id)}
              className="w-full bg-[#111] border border-gray-800 hover:border-[#00f0ff]/50 hover:bg-[#1a1a1a] p-4 rounded-lg text-left transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Music className="w-4 h-4 text-gray-500 group-hover:text-[#00f0ff] transition-colors" />
                  <span className="text-sm text-gray-200 tracking-wide truncate max-w-xs">
                    {song.filename}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  {/* MIDI availability indicators */}
                  <div className="flex items-center gap-2">
                    {song.has_midi_vocals ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#00f0ff]/70">
                        <FileText className="w-3 h-3" /> VOC
                      </span>
                    ) : null}
                    {song.has_midi_bass ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#e10075]/70">
                        <FileText className="w-3 h-3" /> BASS
                      </span>
                    ) : null}
                    {song.has_midi_piano ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#fb923c]/70">
                        <FileText className="w-3 h-3" /> PIANO
                      </span>
                    ) : null}
                  </div>

                  <span className="text-[10px] text-gray-600">
                    {new Date(song.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </main>
    </div>
  );
}
