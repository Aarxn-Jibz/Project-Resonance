/**
 * MIDI note quantizer.
 *
 * Converts raw Basic Pitch JSON output (floating-point note timings) into
 * a grid-snapped representation where every note start time and duration
 * is an exact multiple of a sixteenth note at the track's BPM.
 *
 * This runs in the CF Worker (not the ML worker) so that musical
 * post-processing stays in TypeScript and the Python side only needs to
 * produce valid pitch / timing data.
 */

/** A single quantized MIDI note. */
interface Note {
  pitch: number
  startTime: number
  duration: number
}

/** Root structure produced by Basic Pitch and consumed by the frontend. */
interface MidiData {
  bpm: number
  notes: Note[]
}

/**
 * Snap all note times in a raw Basic Pitch JSON string to a sixteenth-note grid.
 *
 * Algorithm:
 * - Compute the sixteenth-note duration in seconds: `60 / bpm / 4`.
 * - For each note, round `startTime` and `duration` to the nearest multiple
 *   of that unit.
 * - Enforce a minimum duration of one sixteenth (so extremely short notes
 *   are promoted rather than collapsed to zero).
 * - Notes with non-numeric `pitch`, `startTime`, or `duration` fields are
 *   silently filtered out (these can appear if the ML model hallucinates
 *   a malformed note object).
 *
 * @param raw - JSON string with shape `{ bpm: number, notes: Note[] }`.
 * @returns Quantized `MidiData` object.
 * @throws {Error} If `raw` is not valid JSON.
 * @throws {Error} If `bpm` is missing, zero, or negative.
 * @throws {Error} If `notes` is not an array.
 */
export function quantize(raw: string): MidiData {
  let data: MidiData
  try {
    data = JSON.parse(raw) as MidiData
  } catch {
    throw new Error('Quantizer received invalid JSON')
  }

  if (!Number.isFinite(data.bpm) || data.bpm <= 0) {
    throw new Error(`Invalid BPM: ${data.bpm}`)
  }
  if (!Array.isArray(data.notes)) {
    throw new Error('MIDI data "notes" field must be an array')
  }

  const sixteenth = 60.0 / data.bpm / 4.0

  const notes = data.notes
    // Filter out notes with missing or wrong-typed fields before any math
    .filter(n =>
      typeof n.pitch === 'number' &&
      typeof n.startTime === 'number' &&
      typeof n.duration === 'number'
    )
    .map(n => {
      const snappedStart = Math.round(n.startTime / sixteenth) * sixteenth
      const snappedDuration = Math.max(
        Math.round(n.duration / sixteenth) * sixteenth,
        sixteenth, // minimum: one sixteenth note
      )
      return { ...n, startTime: snappedStart, duration: snappedDuration }
    })

  return { bpm: data.bpm, notes }
}
