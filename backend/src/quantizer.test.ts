/**
 * Unit tests for quantizer.ts.
 *
 * All tests are pure (no I/O, no CF bindings) and run with the standard
 * Vitest runner: `bun test` or `npx vitest run`.
 *
 * Sixteenth note duration at BPM 120 used throughout: 60/120/4 = 0.125 s.
 */
import { describe, it, expect } from 'vitest'
import { quantize } from './quantizer.js'

const bpm = 120
// sixteenth = 60/120/4 = 0.125s

function makeRaw(notes: object[], bpmOverride = bpm): string {
  return JSON.stringify({ bpm: bpmOverride, notes })
}

describe('quantize()', () => {
  // --- Grid snapping ---
  it('snaps start times to the nearest sixteenth grid', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.13, duration: 0.25 }])
    const result = quantize(raw)
    expect(result.notes[0].startTime).toBeCloseTo(0.125)
  })

  it('snaps duration to the nearest sixteenth grid', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.37 }])
    const result = quantize(raw)
    expect(result.notes[0].duration).toBeCloseTo(0.375)
  })

  it('promotes sub-sixteenth notes to minimum one sixteenth', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.01 }])
    const result = quantize(raw)
    expect(result.notes[0].duration).toBeCloseTo(0.125)
  })

  it('preserves pitch and passes through correctly typed fields', () => {
    const raw = makeRaw([{ pitch: 69, startTime: 0.0, duration: 0.5 }])
    const result = quantize(raw)
    expect(result.notes[0].pitch).toBe(69)
  })

  it('returns the original bpm', () => {
    const raw = makeRaw([], 90)
    expect(quantize(raw).bpm).toBe(90)
  })

  it('returns empty notes array when input notes are empty', () => {
    const raw = makeRaw([])
    expect(quantize(raw).notes).toHaveLength(0)
  })

  // --- Filtering ---
  it('filters out notes with non-numeric fields', () => {
    const raw = JSON.stringify({
      bpm: 120,
      notes: [
        { pitch: 60, startTime: 0, duration: 0.25 },
        { pitch: 'C4', startTime: 0.25, duration: 0.25 },
        { pitch: 62, startTime: '0.5', duration: 0.25 },
      ],
    })
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].pitch).toBe(60)
  })

  it('filters out notes with NaN fields', () => {
    const raw = JSON.stringify({
      bpm: 120,
      notes: [
        { pitch: NaN, startTime: 0, duration: 0.25 },
        { pitch: 60, startTime: 0, duration: 0.25 },
      ],
    })
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].pitch).toBe(60)
  })

  it('filters out notes with undefined fields', () => {
    const raw = JSON.stringify({
      bpm: 120,
      notes: [
        { pitch: 60, startTime: undefined, duration: 0.25 },
        { pitch: 60, startTime: 0, duration: 0.25 },
      ],
    })
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
  })

  it('filters out notes with null fields', () => {
    const raw = JSON.stringify({
      bpm: 120,
      notes: [
        { pitch: null, startTime: 0, duration: 0.25 },
        { pitch: 60, startTime: 0, duration: 0.25 },
      ],
    })
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
  })

  // --- Error cases ---
  it('throws on BPM = 0', () => {
    expect(() => quantize(makeRaw([], 0))).toThrow('Invalid BPM')
  })

  it('throws on negative BPM', () => {
    expect(() => quantize(makeRaw([], -120))).toThrow('Invalid BPM')
  })

  it('throws when bpm field is missing', () => {
    expect(() => quantize(JSON.stringify({ notes: [] }))).toThrow('Invalid BPM')
  })

  it('throws when notes is not an array', () => {
    expect(() => quantize(JSON.stringify({ bpm: 120, notes: { a: 1 } }))).toThrow('array')
  })

  it('throws on malformed JSON', () => {
    expect(() => quantize('{ not valid json')).toThrow('invalid JSON')
  })

  it('throws on Infinity BPM', () => {
    expect(() => quantize(makeRaw([], Infinity))).toThrow('Invalid BPM')
  })

  it('throws on NaN BPM', () => {
    expect(() => quantize(makeRaw([], NaN))).toThrow('Invalid BPM')
  })

  // --- Boundary cases ---
  it('note exactly on sixteenth boundary is unchanged', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.25, duration: 0.125 }])
    const result = quantize(raw)
    expect(result.notes[0].startTime).toBeCloseTo(0.25)
    expect(result.notes[0].duration).toBeCloseTo(0.125)
  })

  it('note with zero duration is promoted to minimum', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0 }])
    const result = quantize(raw)
    expect(result.notes[0].duration).toBeCloseTo(0.125)
  })

  it('handles very large BPM (300)', () => {
    const sixteenth = 60 / 300 / 4
    const raw = makeRaw([{ pitch: 60, startTime: 0.05, duration: 0.03 }], 300)
    const result = quantize(raw)
    expect(result.bpm).toBe(300)
    expect(result.notes[0].startTime).toBeCloseTo(Math.round(0.05 / sixteenth) * sixteenth)
    expect(result.notes[0].duration).toBeCloseTo(Math.max(Math.round(0.03 / sixteenth) * sixteenth, sixteenth))
  })

  it('handles floating-point BPM (128.5)', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.3 }], 128.5)
    const result = quantize(raw)
    expect(result.bpm).toBe(128.5)
    expect(result.notes).toHaveLength(1)
  })

  it('handles very low BPM (30)', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.5 }], 30)
    const result = quantize(raw)
    expect(result.bpm).toBe(30)
    expect(result.notes).toHaveLength(1)
  })

  it('processes multiple notes independently', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: 0.0, duration: 0.13 },
      { pitch: 64, startTime: 0.13, duration: 0.26 },
      { pitch: 67, startTime: 0.39, duration: 0.13 },
    ])
    const result = quantize(raw)
    expect(result.notes).toHaveLength(3)
    expect(result.notes[0].pitch).toBe(60)
    expect(result.notes[1].pitch).toBe(64)
    expect(result.notes[2].pitch).toBe(67)
  })

  it('snaps start time backward when closer to lower grid', () => {
    // 0.06 is closer to 0.0625 (half of 0.125) than to 0
    const raw = makeRaw([{ pitch: 60, startTime: 0.06, duration: 0.125 }])
    const result = quantize(raw)
    // 0.06 / 0.125 = 0.48 → rounds to 0 → 0 * 0.125 = 0
    expect(result.notes[0].startTime).toBeCloseTo(0)
  })

  it('snaps start time forward when closer to upper grid', () => {
    // 0.09 is closer to 0.125 than to 0
    const raw = makeRaw([{ pitch: 60, startTime: 0.09, duration: 0.125 }])
    const result = quantize(raw)
    // 0.09 / 0.125 = 0.72 → rounds to 1 → 1 * 0.125 = 0.125
    expect(result.notes[0].startTime).toBeCloseTo(0.125)
  })

  it('all notes have valid numeric fields after quantization', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: 0.01, duration: 0.02 },
      { pitch: 72, startTime: 0.99, duration: 0.51 },
    ])
    const result = quantize(raw)
    result.notes.forEach(note => {
      expect(typeof note.pitch).toBe('number')
      expect(typeof note.startTime).toBe('number')
      expect(typeof note.duration).toBe('number')
      expect(Number.isFinite(note.startTime)).toBe(true)
      expect(Number.isFinite(note.duration)).toBe(true)
      expect(note.duration).toBeGreaterThanOrEqual(0.125)
    })
  })
})
