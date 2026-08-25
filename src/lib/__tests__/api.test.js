import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadAudio, pollStatus, getStems, getLibrary } from '../api.js'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// uploadAudio — tests the actual error handling paths
// ---------------------------------------------------------------------------

describe('uploadAudio', () => {
  it('sends a FormData POST with the file attached', async () => {
    const file = new File(['audio-bytes'], 'test.wav', { type: 'audio/wav' })
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ job_id: 'j1', cached: false }),
    })

    await uploadAudio(file)

    expect(fetch).toHaveBeenCalledOnce()
    const [url, opts] = fetch.mock.calls[0]
    expect(url).toBe('/api/upload')
    expect(opts.method).toBe('POST')
    // Verify the FormData actually contains the file
    expect(opts.body).toBeInstanceOf(FormData)
    expect(opts.body.get('audio')).toBe(file)
  })

  it('throws with the server error message when response is not ok', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'File too large (max 50MB)' }),
    })

    await expect(uploadAudio(new File(['x'], 'big.wav')))
      .rejects.toThrow('File too large (max 50MB)')
  })

  it('falls back to status code when server error body is not JSON', async () => {
    // This is the real path: server returns HTML error page or empty body
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json') },
    })

    await expect(uploadAudio(new File(['x'], 'a.wav')))
      .rejects.toThrow('Server error 502')
  })

  it('uses err.error field when present, not err.message', async () => {
    // Server returns { error: "Specific message" } — the code should use err.error
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: 'Only .wav and .mp3 allowed', message: 'ignored' }),
    })

    await expect(uploadAudio(new File(['x'], 'a.ogg')))
      .rejects.toThrow('Only .wav and .mp3 allowed')
  })

  it('throws "Upload failed (status)" when error body has no error field', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 418,
      json: async () => ({ something: 'else' }),
    })

    await expect(uploadAudio(new File(['x'], 'a.wav')))
      .rejects.toThrow('Upload failed (418)')
  })

  it('propagates network errors unchanged', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(uploadAudio(new File(['x'], 'a.wav')))
      .rejects.toThrow('Failed to fetch')
  })

  it('returns the full JSON body on success', async () => {
    const payload = { job_id: 'abc-123', cached: false }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => payload })

    const result = await uploadAudio(new File(['x'], 'a.wav'))
    expect(result).toEqual(payload)
  })
})

// ---------------------------------------------------------------------------
// pollStatus — tests the actual polling contract and race conditions
// ---------------------------------------------------------------------------

describe('pollStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onEvent immediately (first tick, no delay)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'processing' }),
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 1000)

    // The first tick is synchronous — tick() is called immediately.
    // But it's async, so we need to flush microtasks.
    await vi.advanceTimersByTimeAsync(0)

    expect(onEvent).toHaveBeenCalledOnce()
    expect(onEvent).toHaveBeenCalledWith({ status: 'processing' })
  })

  it('does NOT call onEvent again after complete', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'complete' }),
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledTimes(1)

    // Advance past several poll intervals — should NOT poll again
    await vi.advanceTimersByTimeAsync(500)
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onEvent again after error status', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'error', message: 'OOM' }),
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(500)

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ status: 'error', message: 'OOM' })
  })

  it('continues polling while status is "processing"', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'processing' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'processing' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'complete' }) })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 200)

    await vi.advanceTimersByTimeAsync(0)      // tick 1
    await vi.advanceTimersByTimeAsync(200)     // tick 2
    await vi.advanceTimersByTimeAsync(200)     // tick 3

    expect(onEvent).toHaveBeenCalledTimes(3)
    expect(onEvent).toHaveBeenLastCalledWith({ status: 'complete' })
  })

  it('cleanup stops polling — no more ticks fire', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ status: 'processing' }) })

    const onEvent = vi.fn()
    const cleanup = pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    expect(onEvent).toHaveBeenCalledTimes(1)

    cleanup()

    await vi.advanceTimersByTimeAsync(1000)
    // Still only 1 call — cleanup prevented the setTimeout from scheduling more
    expect(onEvent).toHaveBeenCalledTimes(1)
  })

  it('cleanup clears an in-flight timer (not yet fired)', async () => {
    // Slow fetch that takes longer than the poll interval
    let resolveFetch
    fetch.mockReturnValueOnce(new Promise(r => { resolveFetch = r }))

    const onEvent = vi.fn()
    const cleanup = pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0) // first tick started, fetch in-flight
    cleanup() // cancel before fetch resolves

    // Resolve the fetch after cleanup
    resolveFetch({ ok: true, json: async () => ({ status: 'processing' }) })
    await vi.advanceTimersByTimeAsync(0)

    // onEvent should NOT have been called because cleanup set active=false
    // before the fetch resolved and the second `if (!active) return` check ran.
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('does NOT fire onEvent if cleanup runs between fetch resolve and callback', async () => {
    // This is the REAL race condition: fetch resolves, but before onEvent fires,
    // cleanup() is called. The `if (!active) return` guard on line 58 should catch this.
    let resolveFetch
    fetch.mockReturnValueOnce(new Promise(r => { resolveFetch = r }))

    const onEvent = vi.fn()
    const cleanup = pollStatus('j1', onEvent, 1000)

    await vi.advanceTimersByTimeAsync(0) // tick started

    // Resolve the fetch — this will resolve the promise chain
    resolveFetch({ ok: true, json: async () => ({ status: 'processing' }) })

    // Immediately cleanup before microtasks complete
    cleanup()

    await vi.advanceTimersByTimeAsync(0)

    // The bug: if the second `if (!active) return` guard is missing,
    // onEvent fires even after cleanup. With the guard, it should not.
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('emits error event on fetch network failure', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)

    expect(onEvent).toHaveBeenCalledOnce()
    expect(onEvent).toHaveBeenCalledWith({
      status: 'error',
      message: 'Failed to fetch',
    })
  })

  it('handles non-JSON response gracefully (res.json() rejects)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => { throw new Error('Unexpected response (200)') },
    })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)

    expect(onEvent).toHaveBeenCalledOnce()
    expect(onEvent).toHaveBeenCalledWith({
      status: 'error',
      message: 'Unexpected response (200)',
    })
  })

  it('stops polling on "error" status (same as "complete")', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'processing' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'error', message: 'fail' }) })

    const onEvent = vi.fn()
    pollStatus('j1', onEvent, 100)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(500)

    expect(onEvent).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// getStems — tests the actual HTTP contract
// ---------------------------------------------------------------------------

describe('getStems', () => {
  it('fetches from the correct URL', async () => {
    const payload = { job_id: 'j1', stems: {}, midi: {}, has_midi: {} }
    fetch.mockResolvedValueOnce({ ok: true, json: async () => payload })

    const result = await getStems('j1')
    expect(fetch).toHaveBeenCalledWith('/api/stems/j1')
    expect(result).toEqual(payload)
  })

  it('throws on 404 with status code', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404 })
    await expect(getStems('nope')).rejects.toThrow('Failed to fetch stems (404)')
  })

  it('throws on 500 with status code', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(getStems('j1')).rejects.toThrow('Failed to fetch stems (500)')
  })

  it('propagates network errors', async () => {
    fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(getStems('j1')).rejects.toThrow('offline')
  })
})

// ---------------------------------------------------------------------------
// getLibrary — tests query parameter construction
// ---------------------------------------------------------------------------

describe('getLibrary', () => {
  it('builds URL with default params (no search)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary()
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('limit=20')
    expect(url).toContain('offset=0')
    expect(url).not.toContain('search=')
  })

  it('includes search param only when non-empty', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ search: 'beatles' })
    expect(fetch.mock.calls[0][0]).toContain('search=beatles')
  })

  it('omits search when empty string', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ search: '' })
    expect(fetch.mock.calls[0][0]).not.toContain('search=')
  })

  it('omits search when not provided', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ limit: 10 })
    expect(fetch.mock.calls[0][0]).not.toContain('search=')
  })

  it('passes through custom limit and offset', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ songs: [] }) })

    await getLibrary({ limit: 50, offset: 10 })
    const url = fetch.mock.calls[0][0]
    expect(url).toContain('limit=50')
    expect(url).toContain('offset=10')
  })

  it('throws on HTTP error with status code', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(getLibrary()).rejects.toThrow('Failed to fetch library (503)')
  })
})
