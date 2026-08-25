import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SeparatorPanel from '../SeparatorPanel.jsx'
import * as api from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  uploadAudio: vi.fn(),
  pollStatus: vi.fn(),
  getStems: vi.fn(),
}))

describe('SeparatorPanel', () => {
  const defaultProps = {
    onStateChange: vi.fn(),
    onProgressChange: vi.fn(),
    onFileSelect: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the upload zone in idle state', () => {
    render(<SeparatorPanel {...defaultProps} />)
    expect(screen.getByText(/DRAG AUDIO FILE HERE/i)).toBeInTheDocument()
    expect(screen.getByText(/Latent Separation Engine/i)).toBeInTheDocument()
  })

  it('renders version badge', () => {
    render(<SeparatorPanel {...defaultProps} />)
    expect(screen.getByText(/V 2\.0\.0/)).toBeInTheDocument()
  })

  it('shows file name after file is selected via input', async () => {
    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['audio data'], 'test.mp3', { type: 'audio/mpeg' })
    const input = screen.getByDisplayValue('') // hidden file input
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    expect(screen.getByText('test.mp3')).toBeInTheDocument()
  })

  it('shows INITIALIZE SPLIT button after file selected', async () => {
    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    expect(screen.getByText(/INITIALIZE SPLIT/i)).toBeInTheDocument()
  })

  it('calls onStateChange with processing when upload starts', async () => {
    api.uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false })
    api.pollStatus.mockReturnValue(vi.fn())
    api.getStems.mockResolvedValue({ stems: {}, midi: {} })

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(defaultProps.onStateChange).toHaveBeenCalledWith('processing')
    })
  })

  it('calls onStateChange with error on upload failure', async () => {
    api.uploadAudio.mockRejectedValue(new Error('Upload failed'))

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(defaultProps.onStateChange).toHaveBeenCalledWith('error')
    })
  })

  it('shows error state with error message', async () => {
    api.uploadAudio.mockRejectedValue(new Error('Server down'))

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(screen.getByText(/Server down/)).toBeInTheDocument()
    })
  })

  it('shows RESET ENGINE button in error state', async () => {
    api.uploadAudio.mockRejectedValue(new Error('fail'))

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(screen.getByText(/RESET ENGINE/i)).toBeInTheDocument()
    })
  })

  it('reset clears all state back to idle', async () => {
    api.uploadAudio.mockRejectedValue(new Error('fail'))

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(screen.getByText(/RESET ENGINE/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/RESET ENGINE/i))

    expect(defaultProps.onStateChange).toHaveBeenCalledWith('idle')
    expect(screen.getByText(/DRAG AUDIO FILE HERE/i)).toBeInTheDocument()
  })

  it('handles cached upload result', async () => {
    api.uploadAudio.mockResolvedValue({ job_id: 'j1', cached: true, result: {} })
    api.getStems.mockResolvedValue({ stems: { vocals: 'url' }, midi: {} })

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(defaultProps.onStateChange).toHaveBeenCalledWith('complete')
    })
    expect(defaultProps.onFileSelect).toHaveBeenCalled()
  })

  it('accepts .mp3 file via drag and drop', () => {
    render(<SeparatorPanel {...defaultProps} />)

    const dropZone = screen.getByText(/DRAG AUDIO FILE HERE/i).closest('div')
    const file = new File(['data'], 'song.mp3', { type: 'audio/mpeg' })

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })

    expect(screen.getByText('song.mp3')).toBeInTheDocument()
  })

  it('rejects non-audio files via drag and drop', () => {
    render(<SeparatorPanel {...defaultProps} />)

    const dropZone = screen.getByText(/DRAG AUDIO FILE HERE/i).closest('div')
    const file = new File(['data'], 'image.png', { type: 'image/png' })

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    })

    expect(screen.getByText(/DRAG AUDIO FILE HERE/i)).toBeInTheDocument()
  })

  it('polls for status and handles complete event', async () => {
    let pollCallback
    api.uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false })
    api.pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return vi.fn()
    })
    api.getStems.mockResolvedValue({ stems: { vocals: 'url' }, midi: {} })

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(api.pollStatus).toHaveBeenCalled()
    })

    // Simulate complete event from poll
    pollCallback({ status: 'complete' })

    await waitFor(() => {
      expect(defaultProps.onStateChange).toHaveBeenCalledWith('complete')
    })
  })

  it('polls for status and handles error event', async () => {
    let pollCallback
    api.uploadAudio.mockResolvedValue({ job_id: 'j1', cached: false })
    api.pollStatus.mockImplementation((jobId, onEvent) => {
      pollCallback = onEvent
      return vi.fn()
    })

    render(<SeparatorPanel {...defaultProps} />)

    const file = new File(['data'], 'song.wav', { type: 'audio/wav' })
    const input = screen.getByDisplayValue('')
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    fireEvent.click(screen.getByText(/INITIALIZE SPLIT/i))

    await waitFor(() => {
      expect(api.pollStatus).toHaveBeenCalled()
    })

    pollCallback({ status: 'error', message: 'ML failed' })

    await waitFor(() => {
      expect(screen.getByText(/ML failed/)).toBeInTheDocument()
    })
  })

  it('does not call handleProcess when no file is selected', () => {
    render(<SeparatorPanel {...defaultProps} />)
    // No file input change, so no button should be visible
    expect(screen.queryByText(/INITIALIZE SPLIT/i)).not.toBeInTheDocument()
  })
})
