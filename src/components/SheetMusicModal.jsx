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

    midiData.notes.forEach((note) => {
        // 1. Calculate RESTS (if note startTime > currentTime)
        if (note.startTime > currentTime + 0.05) { // 50ms tolerance for float rounding
            const restDurationSec = note.startTime - currentTime;
            const restSixteenths = Math.max(1, Math.round(restDurationSec / sixteenth));
            notesString += `z${restSixteenths} `;
            beatAccumulator += restSixteenths;
        }

        // 2. Map PITCH
        let durationSixteenths;
        if (typeof note.pitch !== 'number' || isNaN(note.pitch) || note.pitch < 21 || note.pitch > 108) {
            // Non-musical pitch — render as rest
            durationSixteenths = Math.max(1, Math.round(note.duration / sixteenth));
            notesString += `z${durationSixteenths} `;
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
            notesString += `${abcNote}${durationSixteenths} `;
        }

        // 4. Bar lines — insert when accumulated beat count reaches one full 4/4 bar (16 sixteenths)
        beatAccumulator += durationSixteenths;
        if (beatAccumulator >= 16) {
            notesString += "| ";
            beatAccumulator -= 16;
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
                                    Quantized natively via Go gateway. Confidence interval applied.
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
