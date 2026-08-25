import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadAudio, pollStatus, getStems, getLibrary } from '../api.js'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// uploadAudio
// ---------------------------------------------------------------------------

describe('uploadAudio', () => {
  it('sends POST with FormData containing the file', async () => {
    const file = new File(['data'], 'test.wav', { type: 'audio/wav' })
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'j1', cached: false }),
    })

    await uploadAudio(file)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('/api/upload')
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    expect(opts.body.get('audio')).toBe(file)
  })

  it('returns parsed JSON on success', async () => {
    const payload = { job_id: 'j1', cached: false }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => payload })

    const result = await uploadAudio(new File(['x'], 'a.mp3'))
    expect(result).toEqual(payload)
  })

  it('returns cached result when server reports cache hit', async () => {
    const payload = { job_id: 'j1', cached: true, result: { filename: 'a.wav' } }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => payload })

    const result = await uploadAudio(new File(['x'], 'a.wav'))
    expect(result.cached).toBe(true)
    expect(result.result.filename).toBe('a.wav')
  })

  it('throws on HTTP error with server error message', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'File too large' }),
    })

    await expect(uploadAudio(new File(['x'], 'big.wav')))
      .rejects.toThrow('File too large')
  })

  it('throws generic message when server error body is not JSON', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') },
    })

    await expect(uploadAudio(new File(['x'], 'a.wav')))
      .rejects.toThrow('Server error 500')
  })

  it('throws generic message when server error has no error field', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ message: 'bad' }),
    })

    await expect(uploadAudio(new File(['x'], 'a.wav')))
      .rejects.toThrow('Upload failed (422)')
  })
})

// ---------------------------------------------------------------------------
// pollStatus
// ---------------------------------------------------------------------------

describe('pollStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onEvent immediately with first poll result', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'processing' }),
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 1000)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledWith({ status: 'processing' })
  })

  it('continues polling while status is processing', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'processing' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'complete' }) })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 500)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenLastCalledWith({ status: 'complete' })
  })

  it('stops polling when status is complete', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'complete' }) })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(500)

    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('stops polling when status is error', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', message: 'failed' }),
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ status: 'error', message: 'failed' })
  })

  it('cleanup function stops polling', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'processing' }) })

    const onEvent = vi.fn()
    const cleanup = pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledTimes(1)

    cleanup()
    await vi.advanceTimersByTimeAsync(500)
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('emits error event on fetch failure', async () => {
    fetch.mockRejectedValueOnce(new Error('Network down'))

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledWith({ status: 'error', message: 'Network down' })
  })

  it('handles non-JSON response gracefully', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error('bad json') },
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledWith({
      status: 'error',
      message: 'Unexpected response (200)',
    })
  })
})

// ---------------------------------------------------------------------------
// getStems
// ---------------------------------------------------------------------------

describe('getStems', () => {
  it('fetches stem data for a job', async () => {
    const payload = {
      job_id: 'j1',
      stems: { vocals: 'https://r2.dev/j1/vocals.flac' },
      midi: { vocals: { bpm: 120, notes: [] } },
      has_midi: { vocals: true, bass: false, piano: false },
    }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => payload })

    const result = await getStems('j1')
    expect(fetch).toHaveBeenCalledWith('/api/stems/j1')
    expect(result).toEqual(payload)
  })

  it('throws on 404', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 })

    await expect(getStems('nonexistent')).rejects.toThrow('Failed to fetch stems (404)')
  })

  it('throws on network error', async () => {
    fetch.mockRejectedValueOnce(new Error('fetch failed'))

    await expect(getStems('j1')).rejects.toThrow('fetch failed')
  })
})

// ---------------------------------------------------------------------------
// getLibrary
// ---------------------------------------------------------------------------

describe('getLibrary', () => {
  it('fetches library with default params', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary()
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
  })

  it('includes search query when provided', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ search: 'beatles' })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('search=beatles')
  })

  it('respects custom limit and offset', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ limit: 50, offset: 10 })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('limit=50')
    expect(url).toContain('offset=10')
  })

  it('omits search param when empty string', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ search: '' })
    const url = fetch.mock.calls[0][0]
    expect(url).not.toContain('search=')
  })

  it('throws on HTTP error', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 })

    await expect(getLibrary()).rejects.toThrow('Failed to fetch library (500)')
  })
})
