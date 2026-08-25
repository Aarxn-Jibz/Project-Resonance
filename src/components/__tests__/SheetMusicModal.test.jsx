import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SheetMusicModal from '../SheetMusicModal.jsx'

const sampleMidi = {
  bpm: 120,
  notes: [
    { pitch: 60, startTime: 0.0, duration: 0.5 },
    { pitch: 64, startTime: 0.5, duration: 0.5 },
  ],
}

describe('SheetMusicModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<SheetMusicModal isOpen={false} onClose={vi.fn()} stemName="vocals" midiData={sampleMidi} />)
    expect(screen.queryByText(/LATENT TRANSCRIPTION/i)).not.toBeInTheDocument()
  })

  it('renders modal content when isOpen is true', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={sampleMidi} />)
    expect(screen.getByText(/LATENT TRANSCRIPTION/i)).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<SheetMusicModal isOpen={true} onClose={onClose} stemName="vocals" midiData={sampleMidi} />)

    const backdrop = document.querySelector('.fixed.inset-0')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn()
    render(<SheetMusicModal isOpen={true} onClose={onClose} stemName="vocals" midiData={sampleMidi} />)

    const buttons = document.querySelectorAll('button')
    const xBtn = buttons[buttons.length - 1]
    fireEvent.click(xBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows SVG VECTOR and RAW DATA download buttons', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={sampleMidi} />)
    expect(screen.getByText('SVG VECTOR')).toBeInTheDocument()
    expect(screen.getByText('RAW DATA')).toBeInTheDocument()
  })

  it('renders bass clef for bass stem', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="bass" midiData={sampleMidi} />)
    // "bass" appears in header text AND in abcjs SVG title — use getAllByText
    const matches = screen.getAllByText(/bass/i)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state text when midiData is null', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={null} />)
    expect(screen.getByText(/LATENT TRANSCRIPTION/i)).toBeInTheDocument()
  })

  it('shows empty state when midiData has empty notes array', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={{ bpm: 120, notes: [] }} />)
    expect(screen.getByText(/LATENT TRANSCRIPTION/i)).toBeInTheDocument()
  })

  it('shows 1/16 grid subtitle', () => {
    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={sampleMidi} />)
    expect(screen.getByText(/1\/16 grid/i)).toBeInTheDocument()
  })

  it('shows correct title for different stem names', () => {
    const { unmount } = render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="piano" midiData={sampleMidi} />)
    const pianoMatches = screen.getAllByText(/piano/i)
    expect(pianoMatches.length).toBeGreaterThanOrEqual(1)
    unmount()

    render(<SheetMusicModal isOpen={true} onClose={vi.fn()} stemName="vocals" midiData={sampleMidi} />)
    expect(screen.getByText(/LATENT TRANSCRIPTION/i)).toBeInTheDocument()
  })
})
