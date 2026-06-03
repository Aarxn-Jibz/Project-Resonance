/**
 * UploadZone — drag-and-drop audio upload widget (unused / legacy).
 *
 * This component was part of the original hackathon prototype.  It has been
 * superseded by `SeparatorPanel`, which handles the full upload lifecycle
 * including SSE status streaming and the 6-stem result display.
 *
 * The `onDrop` handler currently fakes a 3-second network delay and never
 * actually calls the backend — the real fetch call is commented out.  Do
 * not use this component in new code.
 *
 * @param {object}   props
 * @param {Function} [props.onUploadSuccess] - Called after the (simulated)
 *   upload completes.
 *
 * @deprecated Use `SeparatorPanel` instead.
 */
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, AudioLines, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for Tailwind class merging
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function UploadZone({ onUploadSuccess }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus(`Isolating frequencies in ${file.name}...`);

    // -------------------------------------------------------------
    // 🚨 HACKATHON BRIDGE: This is where we talk to Owner C's Go API
    // -------------------------------------------------------------
    const formData = new FormData();
    formData.append('audio', file);

    try {
      // TODO: Replace with your actual Go server URL later (e.g., http://localhost:8080/upload)
      // const response = await fetch('YOUR_GO_BACKEND_URL', {
      //   method: 'POST',
      //   body: formData,
      // });
      
      // Faking the network delay for the UI right now so you can see the loading state
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setUploadStatus('Extraction complete.');
      setIsUploading(false);
      
      // Trigger the parent component to move to the next step
      if(onUploadSuccess) onUploadSuccess();

    } catch (error) {
      console.error("Failed to upload to Go gateway:", error);
      setUploadStatus('Error: Connection to Go Gateway failed.');
      setIsUploading(false);
    }
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'audio/*': ['.wav', '.mp3'] },
    maxFiles: 1 
  });

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "w-full max-w-xl mx-auto p-12 border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative overflow-hidden group backdrop-blur-sm",
        isDragActive ? "border-res-yellow bg-res-yellow/10" : "border-res-magenta/50 bg-res-panel/50 hover:border-res-magenta hover:bg-res-magenta/10",
        isUploading && "pointer-events-none border-res-cyan/50 bg-res-cyan/5"
      )}
    >
      <input {...getInputProps()} />
      
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-current opacity-50" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-current opacity-50" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-current opacity-50" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-current opacity-50" />

      {isUploading ? (
        <div className="flex flex-col items-center text-res-cyan">
          <Loader2 className="w-12 h-12 mb-4 animate-spin" />
          <p className="font-mono text-sm animate-pulse">{uploadStatus}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-res-magenta/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            {isDragActive ? (
              <AudioLines className="w-8 h-8 text-res-yellow animate-bounce" />
            ) : (
              <UploadCloud className="w-8 h-8 text-res-magenta" />
            )}
          </div>
          <p className="font-display text-lg text-white mb-2">
            {isDragActive ? "Drop the needle..." : "Drag & Drop Audio File"}
          </p>
          <p className="font-mono text-xs text-gray-400">
            SUPPORTED: .WAV, .MP3 (MAX 15 SECONDS)
          </p>
        </div>
      )}
    </div>
  );
}