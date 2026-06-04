/**
 * SheetMusicModal — renders quantized MIDI data as ABC notation sheet music.
 *
 * Converts the `{ bpm, notes }` JSON produced by the CF Worker quantizer
 * into an ABC notation string, then hands it to `abcjs` for SVG rendering.
 *
 * ABC conversion notes
 * --------------------
 * - Time signature is assumed to be 4/4; the unit note length is 1/16.
 * - Bar lines are inserted by accumulating sixteenth-note units and
 *   inserting a `|` every 16 units (= one 4/4 bar), rather than by note
 *   count — the earlier index-based approach produced wrong bar lengths
 *   for variable-duration notes.
 * - Rests are synthesised from the gap between `currentTime` and the next
 *   note's `startTime` (with a 50 ms float-rounding tolerance).
 * - Pitches outside MIDI 21–108 (piano range) are rendered as rests.
 * - Bass clef is declared as `K:C clef=bass` (not `K:C bass`, which is
 *   invalid ABC syntax and caused abcjs to fall back to treble clef).
 *
 * Downloads
 * ---------
 * - "SVG VECTOR" serialises the abcjs-generated SVG DOM node to a file.
 * - "RAW DATA" downloads the original `midiData` object as JSON.
 *
 * @param {object}       props
 * @param {boolean}      props.isOpen    - Whether the modal is visible.
 * @param {Function}     props.onClose   - Called when the backdrop or × is clicked.
 * @param {string|null}  props.stemName  - Stem identifier used in the title
 *   and to select treble vs bass clef (`"bass"` → bass clef).
 * @param {object|null}  props.midiData  - Quantized MIDI object
 *   `{ bpm: number, notes: Array<{pitch, startTime, duration}> }`.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, FileAudio } from 'lucide-react';
import abcjs from 'abcjs';

/**
 * Super basic Hackathon-level MIDI to ABC notation converter.
 * Maps raw Go math into western staff strings.
 */
function rawMidiToABC(midiData, stemName) {
    if (!midiData || !midiData.notes || midiData.notes.length === 0) {
        return `X:1\nT:No Data\nM:4/4\nL:1/4\nK:C\n|]`;
    }

    // Map MIDI notes properly to ABC octave formats
    const pitchClassUpper = {
        0: "C", 1: "^C", 2: "D", 3: "^D", 4: "E", 5: "F", 6: "^F", 7: "G", 8: "^G", 9: "A", 10: "^A", 11: "B"
    };
    const pitchClassLower = {
        0: "c", 1: "^c", 2: "d", 3: "^d", 4: "e", 5: "f", 6: "^f", 7: "g", 8: "^g", 9: "a", 10: "^a", 11: "b"
    };

    let abcString = `X:1\n`;
    abcString += `T:${stemName.toUpperCase()} TRANSCRIPTION\n`;
    abcString += `M:4/4\n`; // Assuming 4/4 sync
    abcString += `L:1/16\n`; // Assuming 16th note grid from Go
    abcString += `Q:1/4=${Math.round(midiData.bpm || 120)}\n`;
    abcString += `K:C${stemName.toLowerCase() === 'bass' ? ' clef=bass' : ''}\n`;

    let notesString = "";
    let currentTime = 0;
    let beatAccumulator = 0; // tracks sixteenth-note units within the current bar

    // Sixteenth note duration in seconds
    const sixteenth = (60.0 / (midiData.bpm || 120)) / 4.0;

    // Emit `token` (e.g. "z" or "A") repeated across bar boundaries.
    // Rests spanning multiple bars are split into per-bar chunks so the ABC
    // bar-line tokens appear at the correct positions.  Notes are tied across
    // bar lines with "-".
    const emitToken = (token, units, isRest) => {
        let rem = units;
        while (rem > 0) {
            const space = 16 - beatAccumulator;
            const chunk = Math.min(rem, space);
            notesString += `${token}${chunk}`;
            rem -= chunk;
            beatAccumulator += chunk;
            if (beatAccumulator >= 16) {
                if (!isRest && rem > 0) notesString += "-"; // tie note across bar
                notesString += " | ";
                beatAccumulator = 0;
            } else {
                notesString += " ";
            }
        }
    };

    midiData.notes.forEach((note) => {
        // 1. Calculate RESTS (if note startTime > currentTime)
        if (note.startTime > currentTime + 0.05) { // 50ms tolerance for float rounding
            const restDurationSec = note.startTime - currentTime;
            const restSixteenths = Math.max(1, Math.round(restDurationSec / sixteenth));
            emitToken("z", restSixteenths, true);
        }

        // 2. Map PITCH
        let durationSixteenths;
        if (typeof note.pitch !== 'number' || isNaN(note.pitch) || note.pitch < 21 || note.pitch > 108) {
            // Non-musical pitch — render as rest
            durationSixteenths = Math.max(1, Math.round(note.duration / sixteenth));
            emitToken("z", durationSixteenths, true);
        } else {
            const pitchClass = note.pitch % 12;
            const octave = Math.floor(note.pitch / 12) - 1; // Middle C (MIDI 60) = octave 4

            let abcNote = "";
            if (octave >= 5) {
                abcNote = pitchClassLower[pitchClass];
                for (let i = 5; i < octave; i++) abcNote += "'";
            } else if (octave === 4) {
                abcNote = pitchClassUpper[pitchClass];
            } else {
                abcNote = pitchClassUpper[pitchClass];
                for (let i = octave; i < 4; i++) abcNote += ",";
            }

            // 3. Map DURATION
            durationSixteenths = Math.max(1, Math.round(note.duration / sixteenth));
            emitToken(abcNote, durationSixteenths, false);
        }

        currentTime = note.startTime + note.duration;
    });

    abcString += notesString + "|]\n";
    return abcString;
}

export default function SheetMusicModal({ isOpen, onClose, stemName, midiData }) {
    const paperRef = useRef(null);
    const [abcContent, setAbcContent] = useState("");

    useEffect(() => {
        if (isOpen && midiData) {
            const abc = rawMidiToABC(midiData, stemName);
            setAbcContent(abc);
        }
    }, [isOpen, midiData, stemName]);

    // Render the ABCJS whenever the content updates
    useEffect(() => {
        if (isOpen && paperRef.current && abcContent) {
            abcjs.renderAbc(paperRef.current, abcContent, {
                responsive: "resize",
                add_classes: true, // Allows CSS targeting
                paddingtop: 20,
                paddingbottom: 20,
                staffwidth: 740,
                wrap: {
                    minSpacing: 1.8,
                    maxSpacing: 2.7,
                    preferredMeasuresPerLine: 4,
                },
                foregroundColor: "#E5E7EB", // text-gray-200
            });
        }
    }, [isOpen, abcContent]);

    // Download raw MIDI logic via Blob
    const handleDownloadMIDI = () => {
        if (!midiData) return;
        const jsonString = JSON.stringify(midiData, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${stemName}_transcription.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Download Sheet Music as an SVG vector image
    const handleDownloadSVG = () => {
        if (!paperRef.current) return;

        // Find the injected SVG element created by abcjs
        const svgElement = paperRef.current.querySelector('svg');
        if (!svgElement) return;

        // Serialize the DOM node into a raw XML string
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(svgElement);

        // Add XML namespace if missing
        if (!svgString.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
            svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Create Blob and trigger download
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${stemName}_sheet_music.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <React.Fragment>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999]"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl bg-[#111] border border-gray-800 rounded-xl shadow-2xl z-[1000] overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* 
                            Crucial scoped styles for abcjs SVGs
                            Forces the black paths/text to light gray for dark mode compatibility 
                        */}
                        <style>{`
                            .abc-container svg {
                                background: transparent !important;
                            }
                            .abc-container svg path {
                                fill: #E5E7EB !important;
                                stroke: #E5E7EB !important;
                            }
                            .abc-container svg text {
                                fill: #E5E7EB !important;
                            }
                            .abc-container svg rect {
                                fill: transparent !important;
                            }
                        `}</style>

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-800 bg-[#0a0a0a]">
                            <div>
                                <h2 className="text-xl font-display font-bold text-white uppercase tracking-widest flex items-center gap-3">
                                    <FileAudio className={`w-5 h-5 ${stemName === 'vocals' ? 'text-[#00f0ff]' : 'text-[#e10075]'}`} />
                                    LATENT TRANSCRIPTION: {stemName}
                                </h2>
                                <p className="font-mono text-xs text-gray-500 mt-1">
                                    Quantized via CF Worker · 1/16 grid
                                </p>
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleDownloadSVG}
                                    className="flex items-center gap-2 font-mono text-xs text-gray-400 hover:text-white hover:bg-white/10 px-4 py-2 rounded transition-colors border border-gray-800"
                                >
                                    <Download className="w-4 h-4" />
                                    SVG VECTOR
                                </button>
                                <button
                                    onClick={handleDownloadMIDI}
                                    className="flex items-center gap-2 font-mono text-xs bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    RAW DATA
                                </button>
                                <button
                                    onClick={onClose}
                                    className="text-gray-500 hover:text-white transition-colors p-2"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Scrollable Notation Body */}
                        <div className="p-8 overflow-y-auto bg-[#1a1a1a] flex-1">
                            <div
                                ref={paperRef}
                                className="w-full bg-transparent abc-container"
                            />
                        </div>
                    </motion.div>
                </React.Fragment>
            )}
        </AnimatePresence>
    );
}
