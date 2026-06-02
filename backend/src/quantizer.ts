interface Note {
  pitch: number
  startTime: number
  duration: number
  confidence: number
}

interface MidiData {
  bpm: number
  notes: Note[]
}

export function quantize(raw: string, confidenceThreshold: number): MidiData {
  const data: MidiData = JSON.parse(raw)
  const sixteenth = 60.0 / data.bpm / 4.0

  const notes = (data.notes ?? [])
    .filter(n => n.confidence >= confidenceThreshold && n.duration >= sixteenth / 2)
    .map(n => {
      const snappedStart = Math.round(n.startTime / sixteenth) * sixteenth
      const snappedDuration = Math.max(
        Math.round(n.duration / sixteenth) * sixteenth,
        sixteenth
      )
      return { ...n, startTime: snappedStart, duration: snappedDuration }
    })

  return { bpm: data.bpm, notes }
}
