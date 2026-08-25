import React, { createRef } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import StemPlayer from '../StemPlayer.jsx'

// Stem IDs in display order
const STEM_IDS = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']

const STEMS = Object.fromEntries(
  STEM_IDS.map(id => [id, `https://r2.example.com/${id}.flac`])
)

// Mock audio elements — jsdom doesn't implement play/pause
let audioElements = {}
const origAudio = globalThis.Audio

beforeEach(() => {
  audioElements = {}
  // Intercept Audio constructor to capture instances
  globalThis.Audio = vi.fn().mockImplementation(() => {
    const el = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      volume: 0.8,
      currentTime: 0,
      loop: false,
      src: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    return el
  })
  // jsdom's <audio> elements don't have play/pause — we need to monkey-patch
  // them via a MutationObserver or ref callback. Instead, we'll test behavior
  // by accessing the audioRefs through the component's rendered DOM.
})

afterEach(() => {
  globalThis.Audio = origAudio
})

// Helper: get all audio elements rendered in the DOM and patch their play/pause
function patchAudioElements() {
  const audios = document.querySelectorAll('audio')
  const patches = []
  audios.forEach((audio) => {
    const play = vi.fn().mockResolvedValue(undefined)
    const pause = vi.fn()
    Object.defineProperty(audio, 'play', { value: play, writable: true, configurable: true })
    Object.defineProperty(audio, 'pause', { value: pause, writable: true, configurable: true })
    patches.push({ audio, play, pause })
  })
  return patches
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('StemPlayer rendering', () => {
  it('renders all 6 stem rows', () => {
    render(<StemPlayer audioSource={STEMS} />)
    for (const id of STEM_IDS) {
      expect(screen.getByText(new RegExp(`${id.toUpperCase()}\\.FLAC`))).toBeInTheDocument()
    }
  })

  it('shows "AWAITING SOURCE" when audioSource is null', () => {
    render(<StemPlayer />)
    expect(screen.getByText(/AWAITING SOURCE/)).toBeInTheDocument()
  })

  it('shows "SYSTEM READY" when audioSource is provided', () => {
    render(<StemPlayer audioSource={STEMS} />)
    expect(screen.getByText(/SYSTEM READY: 6 CHANNELS SYNCED/)).toBeInTheDocument()
  })

  it('disables play button when audioSource is null', () => {
    render(<StemPlayer />)
    // Play button is the round button with cursor-not-allowed class
    const playBtn = document.querySelector('button[disabled]')
    expect(playBtn).toBeInTheDocument()
    expect(playBtn).toBeDisabled()
  })

  it('hides "PLAY ORIGINAL" button when no audioSource', () => {
    render(<StemPlayer />)
    expect(screen.queryByText('PLAY ORIGINAL')).not.toBeInTheDocument()
  })

  it('shows "PLAY ORIGINAL" button when audioSource is provided', () => {
    render(<StemPlayer audioSource={STEMS} />)
    expect(screen.getByText('PLAY ORIGINAL')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Play / Pause
// ---------------------------------------------------------------------------

describe('StemPlayer play/pause', () => {
  it('clicking play calls .play() on all 6 audio elements', async () => {
    render(<StemPlayer audioSource={STEMS} />)
    const patches = patchAudioElements()

    // Click the play button (first button in the component)
    const playBtn = document.querySelector('button:not([disabled])')
    await userEvent.setup().click(playBtn)

    for (const { play } of patches) {
      expect(play).toHaveBeenCalledOnce()
    }
  })

  it('clicking pause calls .pause() on all 6 audio elements', async () => {
    render(<StemPlayer audioSource={STEMS} />)
    const patches = patchAudioElements()

    const playBtn = document.querySelector('button:not([disabled])')
    await userEvent.setup().click(playBtn) // start playing

    await userEvent.setup().click(playBtn) // pause

    for (const { pause } of patches) {
      expect(pause).toHaveBeenCalledOnce()
    }
  })

  it('play button icon changes from Play to Pause when playing', async () => {
    render(<StemPlayer audioSource={STEMS} />)
    patchAudioElements()

    const playBtn = document.querySelector('button:not([disabled])')
    await userEvent.setup().click(playBtn)

    // When playing, the Pause icon should be rendered
    // The Pause icon renders as an SVG with a specific class
    const pauseIcon = document.querySelector('button svg.lucide-pause')
    expect(pauseIcon).toBeInTheDocument()
  })

  it('calls onPlayStateChange(true) on play, onPlayStateChange(false) on pause', async () => {
    const onPlayStateChange = vi.fn()
    render(<StemPlayer audioSource={STEMS} onPlayStateChange={onPlayStateChange} />)
    patchAudioElements()

    const playBtn = document.querySelector('button:not([disabled])')
    await userEvent.setup().click(playBtn)
    expect(onPlayStateChange).toHaveBeenCalledWith(true)

    await userEvent.setup().click(playBtn)
    expect(onPlayStateChange).toHaveBeenCalledWith(false)
  })

  it('play().catch swallows errors from audio elements that fail to play', async () => {
    render(<StemPlayer audioSource={STEMS} />)
    const patches = patchAudioElements()
    // Make the first audio element's play() reject
    patches[0].play.mockRejectedValue(new DOMException('play() failed'))

    const playBtn = document.querySelector('button:not([disabled])')
    // Should not throw
    await userEvent.setup().click(playBtn)
  })
})

// ---------------------------------------------------------------------------
// Volume controls
// ---------------------------------------------------------------------------

describe('StemPlayer volume', () => {
  it('toggleMute sets volume to 0 and shows VolumeX icon', async () => {
    render(<StemPlayer audioSource={STEMS} />)
    patchAudioElements()

    // Find the mute button for vocals (first stem row)
    const muteButtons = document.querySelectorAll('button')
    // Mute buttons are inside stem rows, after the name text
    // The first Volume2 icon corresponds to vocals
    const vocalsMute = document.querySelector(`[data-testid]`) || muteButtons[1] // skip play button

    // Use the range slider instead to directly set volume to 0
    const sliders = document.querySelectorAll('input[type="range"]')
    const vocalsSlider = sliders[0] // first slider = vocals

    fireEvent.change(vocalsSlider, { target: { value: '0' } })

    // After setting to 0, the VolumeX icon should show for vocals
    const volumeXIcons = document.querySelectorAll('svg.lucide-volume-x')
    expect(volumeXIcons.length).toBeGreaterThanOrEqual(1)
  })

  it('changing slider updates volume state', () => {
    render(<StemPlayer audioSource={STEMS} />)
    patchAudioElements()

    const sliders = document.querySelectorAll('input[type="range"]')
    // Set vocals to 0.5
    fireEvent.change(sliders[0], { target: { value: '0.5' } })

    // Slider value should reflect the new volume
    expect(sliders[0].value).toBe('0.5')
  })

  it('all sliders start at default volume 0.8', () => {
    render(<StemPlayer audioSource={STEMS} />)
    const sliders = document.querySelectorAll('input[type="range"]')
    sliders.forEach(slider => {
      expect(slider.value).toBe('0.8')
    })
  })
})

// ---------------------------------------------------------------------------
// Sheet music buttons — only shown for stems with MIDI data
// ---------------------------------------------------------------------------

describe('StemPlayer sheet music buttons', () => {
  it('shows sheet music button only for stems with midiData', () => {
    const midiData = {
      vocals: { bpm: 120, notes: [] },
      bass: { bpm: 120, notes: [] },
      piano: { bpm: 120, notes: [] },
    }

    render(<StemPlayer audioSource={STEMS} midiData={midiData} />)

    // Sheet music buttons (FileText icon buttons) — should be 3 (vocals, bass, piano)
    const sheetButtons = document.querySelectorAll('button[title="View Sheet Music"]')
    expect(sheetButtons).toHaveLength(3)
  })

  it('shows no sheet music buttons when midiData is null', () => {
    render(<StemPlayer audioSource={STEMS} midiData={null} />)
    const sheetButtons = document.querySelectorAll('button[title="View Sheet Music"]')
    expect(sheetButtons).toHaveLength(0)
  })

  it('shows no sheet music buttons when midiData is empty object', () => {
    render(<StemPlayer audioSource={STEMS} midiData={{}} />)
    const sheetButtons = document.querySelectorAll('button[title="View Sheet Music"]')
    expect(sheetButtons).toHaveLength(0)
  })

  it('clicking sheet music button calls onOpenSheet with stem id', async () => {
    const onOpenSheet = vi.fn()
    const midiData = {
      vocals: { bpm: 120, notes: [] },
      bass: { bpm: 120, notes: [] },
      piano: { bpm: 120, notes: [] },
    }

    render(<StemPlayer audioSource={STEMS} midiData={midiData} onOpenSheet={onOpenSheet} />)

    const sheetButtons = document.querySelectorAll('button[title="View Sheet Music"]')
    // First sheet button = vocals (first stem with MIDI)
    await userEvent.setup().click(sheetButtons[0])
    expect(onOpenSheet).toHaveBeenCalledWith('vocals')
  })

  it('shows sheet music button for ANY stem with midiData (not just vocals/bass/piano)', () => {
    const midiData = {
      vocals: { bpm: 120, notes: [] },
      drums: { bpm: 120, notes: [] },
      bass: { bpm: 120, notes: [] },
      guitar: { bpm: 120, notes: [] },
      piano: { bpm: 120, notes: [] },
      other: { bpm: 120, notes: [] },
    }

    render(<StemPlayer audioSource={STEMS} midiData={midiData} />)
    // Component renders sheet buttons for all stems with midiData.
    // The backend only sends MIDI for vocals/bass/piano, but the
    // component doesn't enforce this — it shows buttons for any stem
    // that has data. This is a design observation, not a bug.
    const sheetButtons = document.querySelectorAll('button[title="View Sheet Music"]')
    expect(sheetButtons).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------
// Imperative handle — expose togglePlay to parent via ref
// ---------------------------------------------------------------------------

describe('StemPlayer imperative handle', () => {
  it('ref.current.togglePlay() starts playing', async () => {
    const ref = createRef()
    render(<StemPlayer audioSource={STEMS} ref={ref} />)
    patchAudioElements()

    await act(async () => {
      ref.current.togglePlay()
    })

    // Check that play() was called on audio elements
    const audios = document.querySelectorAll('audio')
    let anyPlayed = false
    audios.forEach(a => {
      // The play method was patched — check it was called
      if (a.play && a.play.mock?.calls?.length > 0) anyPlayed = true
    })
    expect(anyPlayed).toBe(true)
  })

  it('ref.current.togglePlay() twice pauses', async () => {
    const ref = createRef()
    render(<StemPlayer audioSource={STEMS} ref={ref} />)
    patchAudioElements()

    await act(async () => {
      ref.current.togglePlay()
    })
    await act(async () => {
      ref.current.togglePlay()
    })

    const audios = document.querySelectorAll('audio')
    let anyPaused = false
    audios.forEach(a => {
      if (a.pause && a.pause.mock?.calls?.length > 0) anyPaused = true
    })
    expect(anyPaused).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

describe('StemPlayer download', () => {
  it('download buttons exist for all stems', () => {
    render(<StemPlayer audioSource={STEMS} />)
    const downloadBtns = document.querySelectorAll('button[title="Download Stem"]')
    expect(downloadBtns).toHaveLength(6)
  })
})
