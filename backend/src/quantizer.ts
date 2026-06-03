interface Note {
  pitch: number
  startTime: number
  duration: number
}

interface MidiData {
  bpm: number
  notes: Note[]
}

export function quantize(raw: string): MidiData {
  let data: MidiData
  try {
    data = JSON.parse(raw) as MidiData
  } catch {
    throw new Error('Quantizer received invalid JSON')
  }

  if (!data.bpm || data.bpm <= 0) {
    throw new Error(`Invalid BPM: ${data.bpm}`)
  }
  if (!Array.isArray(data.notes)) {
    throw new Error('MIDI data "notes" field must be an array')
  }

  const sixteenth = 60.0 / data.bpm / 4.0

  const notes = data.notes
    .filter(n => typeof n.pitch === 'number' && typeof n.startTime === 'number' && typeof n.duration === 'number')
    .map(n => {
      const snappedStart = Math.round(n.startTime / sixteenth) * sixteenth
      const snappedDuration = Math.max(
        Math.round(n.duration / sixteenth) * sixteenth,
        sixteenth,
      )
      return { ...n, startTime: snappedStart, duration: snappedDuration }
    })

  return { bpm: data.bpm, notes }
}
