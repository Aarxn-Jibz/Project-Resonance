/**
 * API client for the desynth CF Worker.
 *
 * All requests are relative to `VITE_API_URL` (defaults to empty string so
 * Vite's dev proxy handles them at `/api`, `/sse`, etc.).  Set
 * `VITE_API_URL=https://worker.example.com` in `.env.production` for the
 * CF Pages build.
 */

const BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Upload an audio file for stem separation.
 *
 * @param {File} file - WAV or MP3 file chosen by the user.
 * @returns {Promise<{job_id: string, cached: boolean, result?: object}>}
 *   `cached: true` means the file was already processed; `result` contains
 *   the existing D1 row.  `cached: false` means a new job was dispatched and
 *   `job_id` should be passed to `connectSSE` to stream progress.
 * @throws {Error} On HTTP errors or non-JSON responses.
 */
export async function uploadAudio(file) {
  const form = new FormData()
  form.append('audio', file)
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
    throw new Error(err.error ?? `Upload failed (${res.status})`)
  }
  return res.json()
}

/**
 * Open a Server-Sent Events connection to stream job status updates.
 *
 * Fires `onEvent` for every SSE message.  The stream closes automatically
 * once the status becomes `"complete"` or `"error"`.
 *
 * @param {string}   jobId   - Job UUID returned by `uploadAudio`.
 * @param {Function} onEvent - Called with `{ status: string, message?: string }`.
 * @returns {Function} A cleanup function that closes the EventSource.
 *   Call it when the component unmounts to avoid dangling connections.
 */
export function connectSSE(jobId, onEvent) {
  const source = new EventSource(`${BASE}/sse/${jobId}`)
  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch {
      onEvent({ status: 'error', message: 'Malformed SSE event' })
    }
  }
  source.onerror = () => {
    onEvent({ status: 'error', message: 'SSE connection lost' })
    source.close()
  }
  return () => source.close()
}

/**
 * Fetch the public R2 URLs and MIDI availability for a completed job.
 *
 * @param {string} jobId - Job UUID.
 * @returns {Promise<{
 *   job_id: string,
 *   stems: Record<string, string|null>,
 *   midi: Record<string, string|null>,
 *   has_midi: Record<string, boolean>
 * }>}
 * @throws {Error} If the job is not found (404) or on network errors.
 */
export async function getStems(jobId) {
  const res = await fetch(`${BASE}/api/stems/${jobId}`)
  if (!res.ok) throw new Error(`Failed to fetch stems (${res.status})`)
  return res.json()
}

/**
 * Fetch the public song library from D1.
 *
 * @param {object} [options]
 * @param {string} [options.search='']  - Substring to filter filenames by.
 * @param {number} [options.limit=20]   - Max rows to return (capped at 100).
 * @param {number} [options.offset=0]   - Pagination offset.
 * @returns {Promise<{songs: Array<{
 *   job_id: string,
 *   filename: string,
 *   timestamp: number,
 *   has_midi_vocals: 0|1,
 *   has_midi_bass: 0|1,
 *   has_midi_piano: 0|1
 * }>}>}
 */
export async function getLibrary({ search = '', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    ...(search && { search }),
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`${BASE}/api/library?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch library (${res.status})`)
  return res.json()
}
