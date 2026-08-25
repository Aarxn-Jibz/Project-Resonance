import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import TimbreDesign from '../TimbreDesign.jsx'

describe('TimbreDesign', () => {
  it('shows "Timbre Design" title in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText('Timbre')).toBeInTheDocument()
    expect(screen.getByText('Design')).toBeInTheDocument()
  })

  it('shows "Sonic Fracture" title in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText('Sonic')).toBeInTheDocument()
    expect(screen.getByText('Fracture')).toBeInTheDocument()
  })

  it('shows SIDE B label in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/SIDE B/i)).toBeInTheDocument()
  })

  it('shows STEMS // DECOUPLED in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/STEMS \/\/ DECOUPLED/i)).toBeInTheDocument()
  })

  it('shows idle subtitle', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/latent space meets the dance floor/i)).toBeInTheDocument()
  })

  it('shows complete subtitle', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/Audio components successfully isolated/i)).toBeInTheDocument()
  })

  it('shows REAL-TIME TELEMETRY in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/REAL-TIME TELEMETRY/)).toBeInTheDocument()
  })

  it('shows STEM TELEMETRY in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/STEM TELEMETRY/)).toBeInTheDocument()
  })

  it('shows marketing copy in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/Groovy Manifold/i)).toBeInTheDocument()
    expect(screen.getByText(/Hyper-Retro Fluidity/i)).toBeInTheDocument()
    expect(screen.getByText(/Vibrant Synthesis/i)).toBeInTheDocument()
  })

  it('does not show marketing copy in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.queryByText(/Groovy Manifold/i)).not.toBeInTheDocument()
  })

  it('shows LATENT_CORE_01 label in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/LATENT_CORE_01/)).toBeInTheDocument()
  })

  it('shows ISOLATION_MATRIX_ACTIVE in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/ISOLATION_MATRIX_ACTIVE/)).toBeInTheDocument()
  })

  it('renders the play button inside the sphere', () => {
    render(<TimbreDesign engineState="idle" />)
    // The play button is inside the sphere - it's a button element
    const buttons = document.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('shows floating node labels in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText('PITCH_NODE_A')).toBeInTheDocument()
    expect(screen.getByText('KEY_MOD_04')).toBeInTheDocument()
    expect(screen.getByText('HARMONIC_STRATA')).toBeInTheDocument()
  })

  it('shows stem names on nodes in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText('VOCAL_STEM.WAV')).toBeInTheDocument()
    expect(screen.getByText('DRUM_TRANSIENTS.WAV')).toBeInTheDocument()
    expect(screen.getByText('BASS_HARMONICS.WAV')).toBeInTheDocument()
  })

  it('renders without audioSource', () => {
    render(<TimbreDesign engineState="complete" audioSource={null} />)
    expect(screen.getByText(/Sonic/)).toBeInTheDocument()
  })

  it('renders with audioSource and shows StemPlayer', () => {
    const audioSource = {
      vocals: 'https://r2.dev/vocals.flac',
      drums: 'https://r2.dev/drums.flac',
      bass: 'https://r2.dev/bass.flac',
      guitar: 'https://r2.dev/guitar.flac',
      piano: 'https://r2.dev/piano.flac',
      other: 'https://r2.dev/other.flac',
    }
    render(<TimbreDesign engineState="complete" audioSource={audioSource} />)
    expect(screen.getByText(/LATENT_STEM_MIXER/)).toBeInTheDocument()
  })

  it('shows GROOVE_INDEX in idle state', () => {
    render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/GROOVE_INDEX/)).toBeInTheDocument()
  })

  it('shows SEPARATION_CONFIDENCE in complete state', () => {
    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/SEPARATION_CONFIDENCE/)).toBeInTheDocument()
  })

  it('shows BPM_SYNC in both states', () => {
    const { unmount } = render(<TimbreDesign engineState="idle" />)
    expect(screen.getByText(/BPM_SYNC/)).toBeInTheDocument()
    unmount()

    render(<TimbreDesign engineState="complete" />)
    expect(screen.getByText(/BPM_SYNC/)).toBeInTheDocument()
  })
})
