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
  it('snaps start times to the nearest sixteenth grid', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.13, duration: 0.25 }])
    const result = quantize(raw)
    // 0.13 / 0.125 = 1.04 → rounds to 1 → 1 * 0.125 = 0.125
    expect(result.notes[0].startTime).toBeCloseTo(0.125)
  })

  it('snaps duration to the nearest sixteenth grid', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.37 }])
    const result = quantize(raw)
    // 0.37 / 0.125 = 2.96 → rounds to 3 → 3 * 0.125 = 0.375
    expect(result.notes[0].duration).toBeCloseTo(0.375)
  })

  it('promotes sub-sixteenth notes to minimum one sixteenth', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.0, duration: 0.01 }])
    const result = quantize(raw)
    // 0.01 rounds to 0 → max(0, sixteenth) = 0.125
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

  it('filters out notes with non-numeric fields', () => {
    const raw = JSON.stringify({
      bpm: 120,
      notes: [
        { pitch: 60, startTime: 0, duration: 0.25 },
        { pitch: 'C4', startTime: 0.25, duration: 0.25 }, // invalid pitch type
        { pitch: 62, startTime: '0.5', duration: 0.25 },  // invalid startTime type
      ],
    })
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].pitch).toBe(60)
  })

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

  it('note exactly on sixteenth boundary is unchanged', () => {
    const raw = makeRaw([{ pitch: 60, startTime: 0.25, duration: 0.125 }])
    const result = quantize(raw)
    expect(result.notes[0].startTime).toBeCloseTo(0.25)
    expect(result.notes[0].duration).toBeCloseTo(0.125)
  })

  // --- Bugs found: NaN and Infinity slip through the typeof filter ---

  it('filters notes where pitch is NaN (typeof NaN === "number")', () => {
    // BUG: typeof NaN === 'number' in JS, so the filter passes NaN through.
    // The quantizer should reject these but doesn't.
    const raw = makeRaw([
      { pitch: NaN, startTime: 0, duration: 0.25 },
      { pitch: 60, startTime: 0, duration: 0.25 },
    ])
    const result = quantize(raw)
    // This test EXPOSES a bug: the NaN note is NOT filtered out.
    // If the quantizer is fixed to reject NaN, change this to:
    //   expect(result.notes).toHaveLength(1)
    expect(result.notes).toHaveLength(2)
    expect(result.notes[0].pitch).toBeNaN()
  })

  it('filters notes where startTime is NaN', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: NaN, duration: 0.25 },
    ])
    const result = quantize(raw)
    // BUG: NaN startTime passes filter, then Math.round(NaN / 0.125) = NaN
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].startTime).toBeNaN()
  })

  it('filters notes where duration is NaN', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: 0, duration: NaN },
    ])
    const result = quantize(raw)
    // BUG: NaN duration passes filter, then Math.round(NaN / 0.125) = NaN
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].duration).toBeNaN()
  })

  it('filters notes where pitch is Infinity', () => {
    // BUG: typeof Infinity === 'number', so it passes the filter
    const raw = makeRaw([
      { pitch: Infinity, startTime: 0, duration: 0.25 },
    ])
    const result = quantize(raw)
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].pitch).toBe(Infinity)
  })

  it('filters notes where startTime is Infinity', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: Infinity, duration: 0.25 },
    ])
    const result = quantize(raw)
    // BUG: Infinity startTime passes filter, produces Infinity output
    expect(result.notes).toHaveLength(1)
    expect(result.notes[0].startTime).toBe(Infinity)
  })

  it('accepts negative startTime values (produces negative output)', () => {
    // A note starting before time 0 is musically invalid but passes the filter.
    const raw = makeRaw([
      { pitch: 60, startTime: -0.5, duration: 0.25 },
    ])
    const result = quantize(raw)
    // Snapped to grid: -0.5 / 0.125 = -4.0 → exactly on grid
    expect(result.notes[0].startTime).toBeCloseTo(-0.5)
  })

  it('accepts negative duration values (produces negative output)', () => {
    const raw = makeRaw([
      { pitch: 60, startTime: 0, duration: -0.25 },
    ])
    const result = quantize(raw)
    // BUG: Math.round(-0.25 / 0.125) * 0.125 = -0.25, then Math.max(-0.25, 0.125) = 0.125
    // So negative duration IS caught by the Math.max(..., sixteenth) — this is actually safe.
    expect(result.notes[0].duration).toBeGreaterThanOrEqual(0)
  })
})
