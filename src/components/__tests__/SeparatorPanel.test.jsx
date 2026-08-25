import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SeparatorPanel from '../SeparatorPanel.jsx'

// Mock only the API layer — render real component, real state
vi.mock('../../lib/api.js', () => ({
  uploadAudio: vi.fn(),
  pollStatus: vi.fn(),
  getStems: vi.fn(),
}))

import { uploadAudio, pollStatus, getStems } from '../../lib/api.js'

// Helper to create a File object
function makeFile(name = 'test.wav', size = 1024) {
  const f = new File(['x'.repeat(size)], name, { type: 'audio/wav' })
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Rendering states — test that the right UI is shown at each lifecycle stage
// ---------------------------------------------------------------------------

describe('SeparatorPanel rendering states', () => {
  it('shows upload zone in idle state', () => {
    render(<SeparatorPanel />)
    expect(screen.getByText(/DRAG AUDIO FILE HERE OR CLICK TO BROWSE/)).toBeInTheDocument()
    expect(screen.queryByText('INITIALIZE SPLIT')).not.toBeInTheDocument()
  })

  it('shows "INITIALIZE SPLIT" button only after a file is selected', async () => {
    render(<SeparatorPanel />)

    // No button before file selection
    expect(screen.queryByText('INITIALIZE SPLIT')).not.toBeInTheDocument()

    // Simulate file selection via the hidden input
    const input = document.querySelector('input[type="file"]')
    const file = makeFile('song.wav')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    // Button appears
    expect(screen.getByText('INITIALIZE SPLIT')).toBeInTheDocument()
    // File name is shown
    expect(screen.getByText('song.wav')).toBeInTheDocument()
  })

  it('shows file name in the upload zone after file selection', async () => {
    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')

    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile('my-track.mp3')] } })
    })

    expect(screen.getByText('my-track.mp3')).toBeInTheDocument()
  })

  it('hides upload zone and shows processing UI during processing', async () => {
    const user = userEvent.setup()
    // uploadAudio resolves, pollStatus never calls complete (stays processing)
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    pollStatus.mockReturnValue(() => {}) // cleanup function

    render(<SeparatorPanel />)

    // Select file
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    // Click process
    await user.click(screen.getByText('INITIALIZE SPLIT'))

    // Upload zone should be gone, processing text visible
    await waitFor(() => {
      expect(screen.queryByText('INITIALIZE SPLIT')).not.toBeInTheDocument()
    })
    expect(screen.getByText(/PROCESSING STEMS/)).toBeInTheDocument()
  })

  it('shows error state when upload fails', async () => {
    uploadAudio.mockRejectedValue(new Error('File too large (max 50MB)'))

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await waitFor(() => {
      expect(screen.getByText(/File too large/)).toBeInTheDocument()
    })
    expect(screen.queryByText('[ RESET ENGINE ]')).toBeInTheDocument()
  })

  it('shows processing log entries as they arrive', async () => {
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    pollStatus.mockReturnValue(() => {})

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await waitFor(() => {
      expect(screen.getByText('[SYS] Initializing neural deconstruction...')).toBeInTheDocument()
    })
    expect(screen.getByText('[SYS] Uploading audio payload...')).toBeInTheDocument()
    expect(screen.getByText(/\[SYS\] Job dispatched \(j1\)/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// handleDrop — file extension case sensitivity (REAL BUG)
// ---------------------------------------------------------------------------

describe('SeparatorPanel drag-and-drop', () => {
  function dropFile(filename) {
    const input = document.querySelector('input[type="file"]')
    const dropZone = input.parentElement

    const file = makeFile(filename)
    const dataTransfer = {
      files: [file],
      // jsdom doesn't support full DataTransfer, so we fire directly on the element
    }

    fireEvent.drop(dropZone, { dataTransfer })
    return file
  }

  it('accepts .wav files via drop', () => {
    render(<SeparatorPanel />)
    dropFile('track.wav')
    expect(screen.getByText('track.wav')).toBeInTheDocument()
  })

  it('accepts .mp3 files via drop', () => {
    render(<SeparatorPanel />)
    dropFile('track.mp3')
    expect(screen.getByText('track.mp3')).toBeInTheDocument()
  })

  it('BUG: rejects .MP3 files (uppercase) via drop', () => {
    // The code uses endsWith('.mp3') which is case-sensitive.
    // .MP3 files are silently rejected by drag-drop but accepted by the file input.
    render(<SeparatorPanel />)
    dropFile('track.MP3')
    expect(screen.queryByText('track.MP3')).not.toBeInTheDocument()
    expect(screen.getByText(/DRAG AUDIO FILE HERE/)).toBeInTheDocument()
  })

  it('BUG: rejects .WAV files (uppercase) via drop', () => {
    render(<SeparatorPanel />)
    dropFile('track.WAV')
    expect(screen.queryByText('track.WAV')).not.toBeInTheDocument()
  })

  it('rejects .ogg files via drop', () => {
    render(<SeparatorPanel />)
    dropFile('track.ogg')
    expect(screen.queryByText('track.ogg')).not.toBeInTheDocument()
  })

  it('rejects files with no extension via drop', () => {
    render(<SeparatorPanel />)
    dropFile('README')
    expect(screen.queryByText('README')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// handleProcess — upload → poll → complete flow
// ---------------------------------------------------------------------------

describe('SeparatorPanel upload flow', () => {
  it('calls uploadAudio with the selected file', async () => {
    const user = userEvent.setup()
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    pollStatus.mockReturnValue(() => {})

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    const file = makeFile('song.wav')
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    await user.click(screen.getByText('INITIALIZE SPLIT'))

    expect(uploadAudio).toHaveBeenCalledOnce()
    expect(uploadAudio).toHaveBeenCalledWith(file)
  })

  it('passes job_id to pollStatus after upload', async () => {
    uploadAudio.mockResolvedValue({ job_id: 'abc-123', cached: false, result: null })
    pollStatus.mockReturnValue(() => {})

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await waitFor(() => {
      expect(pollStatus).toHaveBeenCalledOnce()
    })
    expect(pollStatus.mock.calls[0][0]).toBe('abc-123')
  })

  it('calls onStateChange("processing") at start', async () => {
    const onStateChange = vi.fn()
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    pollStatus.mockReturnValue(() => {})

    render(<SeparatorPanel onStateChange={onStateChange} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    expect(onStateChange).toHaveBeenCalledWith('processing')
  })

  it('on complete event: calls getStems, onFileSelect, sets status to complete', async () => {
    const onFileSelect = vi.fn()
    const onStateChange = vi.fn()
    const stems = { vocals: 'v.wav', drums: 'd.wav', bass: 'b.wav', guitar: 'g.wav', piano: 'p.wav', other: 'o.wav' }
    const midi = { vocals: 'v.json', bass: 'b.json', piano: 'p.json' }

    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    getStems.mockResolvedValue({ stems, midi })

    // Capture the pollStatus callback so we can simulate events
    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {} // cleanup
    })

    render(<SeparatorPanel onFileSelect={onFileSelect} onStateChange={onStateChange} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    // Simulate the complete event
    await act(async () => {
      pollCallback({ status: 'complete' })
    })

    await waitFor(() => {
      expect(getStems).toHaveBeenCalledWith('j1')
    })
    expect(onFileSelect).toHaveBeenCalledWith(stems, midi)
    expect(onStateChange).toHaveBeenCalledWith('complete')
  })

  it('on complete event: getStems failure shows error state', async () => {
    const onStateChange = vi.fn()
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    getStems.mockRejectedValue(new Error('Stems not found (404)'))

    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {}
    })

    render(<SeparatorPanel onStateChange={onStateChange} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await act(async () => {
      pollCallback({ status: 'complete' })
    })

    await waitFor(() => {
      expect(screen.getByText(/Stems not found/)).toBeInTheDocument()
    })
    expect(onStateChange).toHaveBeenCalledWith('error')
  })

  it('on error event from poll: shows error state and message', async () => {
    const onStateChange = vi.fn()
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })

    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {}
    })

    render(<SeparatorPanel onStateChange={onStateChange} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await act(async () => {
      pollCallback({ status: 'error', message: 'OOM: CUDA out of memory' })
    })

    await waitFor(() => {
      expect(screen.getByText(/OOM: CUDA out of memory/)).toBeInTheDocument()
    })
    expect(onStateChange).toHaveBeenCalledWith('error')
  })

  it('on error event with no message uses fallback text', async () => {
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })

    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {}
    })

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await act(async () => {
      pollCallback({ status: 'error' })
    })

    await waitFor(() => {
      expect(screen.getByText(/Processing failed/)).toBeInTheDocument()
    })
  })

  it('on processing event: adds log entry', async () => {
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })

    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {}
    })

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await act(async () => {
      pollCallback({ status: 'processing' })
    })

    expect(screen.getByText(/Demucs separation in progress/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Cache hit path — edge case: cached=true but result has no stems
// ---------------------------------------------------------------------------

describe('SeparatorPanel cache hit path', () => {
  it('skips polling and calls getStems directly on cache hit', async () => {
    const onFileSelect = vi.fn()
    const stems = { vocals: 'v.wav', drums: 'd.wav', bass: 'b.wav', guitar: 'g.wav', piano: 'p.wav', other: 'o.wav' }

    uploadAudio.mockResolvedValue({
      job_id: 'cached-1',
      cached: true,
      result: { job_id: 'cached-1' }, // result is truthy but has no stems
    })
    getStems.mockResolvedValue({ stems, midi: {} })

    render(<SeparatorPanel onFileSelect={onFileSelect} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    // pollStatus should NOT be called on cache hit
    await waitFor(() => {
      expect(pollStatus).not.toHaveBeenCalled()
    })
    expect(getStems).toHaveBeenCalledWith('cached-1')
    expect(onFileSelect).toHaveBeenCalled()
    // UI transitions to 'complete' — upload zone should be hidden
    expect(screen.queryByText('INITIALIZE SPLIT')).not.toBeInTheDocument()
  })

  it('BUG: cache hit when result is null crashes _handleComplete', async () => {
    // If the API returns { cached: true, result: null }, the code enters the
    // cache path (line 47: cached && result) — but result is falsy, so it
    // doesn't enter the block. This test verifies that behavior.
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: true, result: null })
    pollStatus.mockReturnValue(() => {})

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    // cached=true but result=null → should NOT enter cache path, should poll
    await waitFor(() => {
      expect(pollStatus).toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// Reset engine
// ---------------------------------------------------------------------------

describe('SeparatorPanel reset', () => {
  it('reset button clears state and returns to idle', async () => {
    const onStateChange = vi.fn()
    uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false, result: null })
    getStems.mockResolvedValue({
      stems: { vocals: 'v.wav', drums: 'd.wav', bass: 'b.wav', guitar: 'g.wav', piano: 'p.wav', other: 'o.wav' },
      midi: {},
    })

    let pollCallback
    pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return () => {}
    })

    render(<SeparatorPanel onStateChange={onStateChange} />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    // Complete the flow
    await act(async () => {
      pollCallback({ status: 'complete' })
    })

    await waitFor(() => {
      expect(screen.getByText('[ RESET ENGINE ]')).toBeInTheDocument()
    })

    // Click reset
    await userEvent.setup().click(screen.getByText('[ RESET ENGINE ]'))

    // Should be back to idle with upload zone
    expect(screen.getByText(/DRAG AUDIO FILE HERE/)).toBeInTheDocument()
    expect(onStateChange).toHaveBeenCalledWith('idle')
  })

  it('reset after error returns to idle', async () => {
    uploadAudio.mockRejectedValue(new Error('Network error'))

    render(<SeparatorPanel />)
    const input = document.querySelector('input[type="file"]')
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await userEvent.setup().click(screen.getByText('INITIALIZE SPLIT'))

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeInTheDocument()
    })

    await userEvent.setup().click(screen.getByText('[ RESET ENGINE ]'))
    expect(screen.getByText(/DRAG AUDIO FILE HERE/)).toBeInTheDocument()
  })
})
