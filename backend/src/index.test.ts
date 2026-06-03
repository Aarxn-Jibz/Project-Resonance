import { describe, it, expect, beforeEach } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test'

// Apply the D1 migration before tests run
beforeEach(async () => {
  await env.LIBRARY_DB.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      job_id TEXT PRIMARY KEY, filename TEXT NOT NULL, input_hash TEXT NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL,
      stem_vocals TEXT, stem_drums TEXT, stem_bass TEXT, stem_guitar TEXT,
      stem_piano TEXT, stem_other TEXT,
      midi_vocals TEXT, midi_bass TEXT, midi_piano TEXT,
      has_midi_vocals INTEGER NOT NULL DEFAULT 0,
      has_midi_bass INTEGER NOT NULL DEFAULT 0,
      has_midi_piano INTEGER NOT NULL DEFAULT 0
    )
  `)
})

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------

describe('POST /api/upload', () => {
  it('returns 400 when no audio field', async () => {
    const form = new FormData()
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/missing audio/i)
  })

  it('returns 400 for disallowed extension', async () => {
    const form = new FormData()
    form.append('audio', new File(['data'], 'track.ogg', { type: 'audio/ogg' }))
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/only .wav and .mp3/i)
  })

  it('returns 202 with job_id for a valid wav upload', async () => {
    const form = new FormData()
    // Minimal WAV header bytes to pass extension check
    form.append('audio', new File([new Uint8Array(100)], 'song.wav', { type: 'audio/wav' }))
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(202)
    const body = await res.json() as { job_id: string; cached: boolean }
    expect(typeof body.job_id).toBe('string')
    expect(body.cached).toBe(false)
  })

  it('returns cached result when same file uploaded twice', async () => {
    const bytes = new Uint8Array(100).fill(42)
    const upload = async () => {
      const form = new FormData()
      form.append('audio', new File([bytes], 'song.mp3', { type: 'audio/mpeg' }))
      return SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    }

    const first = await upload()
    expect(first.status).toBe(202)
    const { job_id } = await first.json() as { job_id: string }

    // Seed KV and D1 to simulate a completed first job
    await env.DEDUP_KV.put(`hash:${await computeHash(bytes)}`, job_id)
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind(job_id, 'song.mp3', await computeHash(bytes), Date.now()).run()

    const second = await upload()
    const body = await second.json() as { cached: boolean }
    expect(body.cached).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// POST /webhook/complete
// ---------------------------------------------------------------------------

describe('POST /webhook/complete', () => {
  it('returns 401 for missing/wrong secret', async () => {
    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer wrong-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: 'x', status: 'complete', stems: {}, midi_json: {} }),
    })
    expect(res.status).toBe(401)
  })

  it('writes D1 row and KV entries on valid completion', async () => {
    const jobId = crypto.randomUUID()

    // Pre-seed job metadata in KV
    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')
    await env.DEDUP_KV.put(`job:${jobId}:filename`, 'test.wav')
    await env.DEDUP_KV.put(`job:${jobId}:hash`, 'abc123')

    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'complete',
        stems: { vocals: `${jobId}/vocals.flac`, drums: `${jobId}/drums.flac` },
        midi_json: {},
      }),
    })
    expect(res.status).toBe(200)

    const status = await env.DEDUP_KV.get(`job:${jobId}:status`)
    expect(status).toBe('complete')

    const row = await env.LIBRARY_DB.prepare('SELECT * FROM songs WHERE job_id = ?').bind(jobId).first()
    expect(row).not.toBeNull()
    expect((row as Record<string, unknown>).filename).toBe('test.wav')
  })
})

// ---------------------------------------------------------------------------
// GET /api/library
// ---------------------------------------------------------------------------

describe('GET /api/library', () => {
  it('returns empty songs array when library is empty', async () => {
    const res = await SELF.fetch('http://worker/api/library')
    expect(res.status).toBe(200)
    const body = await res.json() as { songs: unknown[] }
    expect(Array.isArray(body.songs)).toBe(true)
  })

  it('returns matching songs for a search query', async () => {
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind('job-1', 'beatles_abbey.mp3', 'hash1', Date.now()).run()

    const res = await SELF.fetch('http://worker/api/library?search=beatles')
    const body = await res.json() as { songs: Array<{ filename: string }> }
    expect(body.songs.length).toBeGreaterThan(0)
    expect(body.songs[0].filename).toBe('beatles_abbey.mp3')
  })
})

// ---------------------------------------------------------------------------
// GET /api/stems/:jobId
// ---------------------------------------------------------------------------

describe('GET /api/stems/:jobId', () => {
  it('returns 404 for unknown job', async () => {
    const res = await SELF.fetch('http://worker/api/stems/nonexistent-job')
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeHash(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
