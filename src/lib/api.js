const BASE = import.meta.env.VITE_API_URL ?? ''

export async function uploadAudio(file) {
  const form = new FormData()
  form.append('audio', file)
  const res = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
    throw new Error(err.error ?? `Upload failed (${res.status})`)
  }
  return res.json() // { job_id, cached, result? }
}

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

export async function getStems(jobId) {
  const res = await fetch(`${BASE}/api/stems/${jobId}`)
  if (!res.ok) throw new Error(`Failed to fetch stems (${res.status})`)
  return res.json() // { job_id, stems, midi, has_midi }
}

export async function getLibrary({ search = '', limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({
    ...(search && { search }),
    limit: String(limit),
    offset: String(offset),
  })
  const res = await fetch(`${BASE}/api/library?${params}`)
  if (!res.ok) throw new Error(`Failed to fetch library (${res.status})`)
  return res.json() // { songs: [...] }
}
