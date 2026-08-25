import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import StemPlayer from '../StemPlayer.jsx'

const stemUrls = {
  vocals: 'https://r2.dev/j1/vocals.flac',
  drums: 'https://r2.dev/j1/drums.flac',
  bass: 'https://r2.dev/j1/bass.flac',
  guitar: 'https://r2.dev/j1/guitar.flac',
  piano: 'https://r2.dev/j1/piano.flac',
  other: 'https://r2.dev/j1/other.flac',
}

const midiData = {
  vocals: { bpm: 120, notes: [] },
  bass: { bpm: 120, notes: [] },
}

describe('StemPlayer', () => {
  beforeEach(() => {
    HTMLAudioElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    HTMLAudioElement.prototype.pause = vi.fn()
  })

  it('renders all 6 stem names', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    expect(screen.getByText(/VOCALS\.FLAC/)).toBeInTheDocument()
    expect(screen.getByText(/DRUMS\.FLAC/)).toBeInTheDocument()
    expect(screen.getByText(/BASS\.FLAC/)).toBeInTheDocument()
    expect(screen.getByText(/GUITAR\.FLAC/)).toBeInTheDocument()
    expect(screen.getByText(/PIANO\.FLAC/)).toBeInTheDocument()
    expect(screen.getByText(/OTHER\.FLAC/)).toBeInTheDocument()
  })

  it('shows LATENT_STEM_MIXER header', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    expect(screen.getByText(/LATENT_STEM_MIXER/)).toBeInTheDocument()
  })

  it('shows SYSTEM READY when audioSource is provided', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    expect(screen.getByText(/SYSTEM READY/)).toBeInTheDocument()
  })

  it('shows AWAITING SOURCE when audioSource is null', () => {
    render(<StemPlayer audioSource={null} />)
    expect(screen.getByText(/AWAITING SOURCE/)).toBeInTheDocument()
  })

  it('disables play button when no audioSource', () => {
    render(<StemPlayer audioSource={null} />)
    const playBtn = document.querySelector('button[disabled]')
    expect(playBtn).toBeInTheDocument()
    expect(playBtn).toBeDisabled()
  })

  it('enables play button when audioSource is provided', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const playBtn = document.querySelector('button:not([disabled])')
    expect(playBtn).toBeInTheDocument()
  })

  it('toggles play state on button click', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const playBtn = document.querySelector('button.rounded-full')

    fireEvent.click(playBtn)
    expect(playBtn).toBeInTheDocument()

    fireEvent.click(playBtn)
    expect(playBtn).toBeInTheDocument()
  })

  it('calls onPlayStateChange when toggling play', () => {
    const onPlayStateChange = vi.fn()
    render(<StemPlayer audioSource={stemUrls} onPlayStateChange={onPlayStateChange} />)

    const playBtn = document.querySelector('button.rounded-full')
    fireEvent.click(playBtn)
    expect(onPlayStateChange).toHaveBeenCalledWith(true)

    fireEvent.click(playBtn)
    expect(onPlayStateChange).toHaveBeenCalledWith(false)
  })

  it('shows volume sliders for each stem', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(6)
  })

  it('shows sheet music button only for stems with midiData', () => {
    render(<StemPlayer audioSource={stemUrls} midiData={midiData} />)
    const sheetBtns = screen.getAllByTitle('View Sheet Music')
    expect(sheetBtns).toHaveLength(2)
  })

  it('shows no sheet music buttons when midiData is null', () => {
    render(<StemPlayer audioSource={stemUrls} midiData={null} />)
    expect(screen.queryByTitle('View Sheet Music')).not.toBeInTheDocument()
  })

  it('calls onOpenSheet with stem id when sheet music button clicked', () => {
    const onOpenSheet = vi.fn()
    render(<StemPlayer audioSource={stemUrls} midiData={midiData} onOpenSheet={onOpenSheet} />)

    const sheetBtns = screen.getAllByTitle('View Sheet Music')
    fireEvent.click(sheetBtns[0])
    expect(onOpenSheet).toHaveBeenCalledWith('vocals')
  })

  it('shows PLAY ORIGINAL button when audioSource provided', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    expect(screen.getByText(/PLAY ORIGINAL/)).toBeInTheDocument()
  })

  it('does not show PLAY ORIGINAL when no audioSource', () => {
    render(<StemPlayer audioSource={null} />)
    expect(screen.queryByText(/PLAY ORIGINAL/)).not.toBeInTheDocument()
  })

  it('shows download buttons for all stems', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const downloadBtns = screen.getAllByTitle('Download Stem')
    expect(downloadBtns).toHaveLength(6)
  })

  it('sets initial volume to 0.8 for all stems', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const sliders = screen.getAllByRole('slider')
    sliders.forEach(slider => {
      expect(slider.value).toBe('0.8')
    })
  })

  it('exposes togglePlay via ref', () => {
    const ref = { current: null }
    render(<StemPlayer audioSource={stemUrls} ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(typeof ref.current.togglePlay).toBe('function')
  })

  it('ref togglePlay triggers play on all audio elements', () => {
    const ref = { current: null }
    render(<StemPlayer audioSource={stemUrls} ref={ref} />)

    ref.current.togglePlay()

    const audios = document.querySelectorAll('audio')
    audios.forEach(audio => {
      expect(audio.play).toHaveBeenCalled()
    })
  })

  it('ref togglePlay second call pauses all audio elements', () => {
    const ref = { current: null }
    const { rerender } = render(<StemPlayer audioSource={stemUrls} ref={ref} />)

    ref.current.togglePlay()
    rerender(<StemPlayer audioSource={stemUrls} ref={ref} />)

    ref.current.togglePlay()

    const audios = document.querySelectorAll('audio')
    audios.forEach(audio => {
      expect(audio.pause).toHaveBeenCalled()
    })
  })

  it('creates hidden audio elements with correct src', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const audios = document.querySelectorAll('audio')
    expect(audios).toHaveLength(6)

    const vocalsAudio = Array.from(audios).find(a => a.src.includes('vocals'))
    expect(vocalsAudio).toBeTruthy()
    expect(vocalsAudio.crossOrigin).toBe('anonymous')
  })

  it('audio elements have loop attribute', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const audios = document.querySelectorAll('audio')
    audios.forEach(audio => {
      expect(audio.loop).toBe(true)
    })
  })

  it('mute toggles volume between 0 and 0.8', () => {
    render(<StemPlayer audioSource={stemUrls} />)
    const muteButtons = screen.getAllByRole('button').filter(
      btn => btn.closest('.flex.items-center.gap-3.flex-1')
    )
    expect(muteButtons).toHaveLength(6)

    fireEvent.click(muteButtons[0])
    const sliders = screen.getAllByRole('slider')
    expect(sliders[0].value).toBe('0')

    fireEvent.click(muteButtons[0])
    expect(sliders[0].value).toBe('0.8')
  })
})
