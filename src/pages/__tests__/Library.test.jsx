import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Library from '../Library.jsx'
import * as api from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  getLibrary: vi.fn(),
  getStems: vi.fn(),
}))

const mockSongs = [
  {
    job_id: 'j1',
    filename: 'beatles_abbey.mp3',
    timestamp: 1700000000000,
    has_midi_vocals: 1,
    has_midi_bass: 0,
    has_midi_piano: 1,
  },
  {
    job_id: 'j2',
    filename: 'pink_floyd.mp3',
    timestamp: 1700100000000,
    has_midi_vocals: 0,
    has_midi_bass: 1,
    has_midi_piano: 0,
  },
]

function renderLibrary() {
  return render(
    <MemoryRouter>
      <Library />
    </MemoryRouter>
  )
}

describe('Library', () => {
  beforeEach(() => {
    api.getLibrary.mockResolvedValue({ songs: mockSongs })
    api.getStems.mockResolvedValue({
      stems: { vocals: 'url' },
      midi: {},
      has_midi: {},
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    renderLibrary()
    expect(screen.getByText(/LOADING/i)).toBeInTheDocument()
  })

  it('renders songs after loading', async () => {
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('beatles_abbey.mp3')).toBeInTheDocument()
    })
    expect(screen.getByText('pink_floyd.mp3')).toBeInTheDocument()
  })

  it('shows empty state when no songs', async () => {
    api.getLibrary.mockResolvedValue({ songs: [] })
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText(/NO SONGS PROCESSED YET/i)).toBeInTheDocument()
    })
  })

  it('shows error state on fetch failure', async () => {
    api.getLibrary.mockRejectedValue(new Error('Network error'))
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    })
  })

  it('displays MIDI availability badges', async () => {
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('VOC')).toBeInTheDocument()
    })
    expect(screen.getByText('PIANO')).toBeInTheDocument()
    expect(screen.getByText('BASS')).toBeInTheDocument()
  })

  it('calls getLibrary on mount', async () => {
    renderLibrary()
    await waitFor(() => {
      expect(api.getLibrary).toHaveBeenCalled()
    })
  })

  it('shows "NO RESULTS FOUND" when search returns empty after debounce', async () => {
    api.getLibrary.mockResolvedValueOnce({ songs: mockSongs }).mockResolvedValueOnce({ songs: [] })

    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('beatles_abbey.mp3')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/SEARCH SONGS/i)
    await user.type(input, 'zzz')

    await waitFor(() => {
      expect(screen.getByText(/NO RESULTS FOUND/i)).toBeInTheDocument()
    })
  })

  it('has a back button', async () => {
    renderLibrary()
    const backBtn = screen.getByText(/\[ Back \]/i)
    expect(backBtn).toBeInTheDocument()
  })

  it('shows search input', async () => {
    renderLibrary()
    expect(screen.getByPlaceholderText(/SEARCH SONGS/i)).toBeInTheDocument()
  })

  it('selecting a song calls getStems and navigates', async () => {
    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('beatles_abbey.mp3')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText('beatles_abbey.mp3'))

    await waitFor(() => {
      expect(api.getStems).toHaveBeenCalledWith('j1')
    })
  })

  it('shows error when getStems fails on song select', async () => {
    api.getStems.mockRejectedValueOnce(new Error('fetch failed'))

    renderLibrary()
    await waitFor(() => {
      expect(screen.getByText('beatles_abbey.mp3')).toBeInTheDocument()
    })

    const user = userEvent.setup()
    await user.click(screen.getByText('beatles_abbey.mp3'))

    await waitFor(() => {
      expect(screen.getByText(/fetch failed/)).toBeInTheDocument()
    })
  })
})
