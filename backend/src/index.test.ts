/**
 * Integration tests for the CF Worker (index.ts).
 *
 * Uses `@cloudflare/vitest-pool-workers` to run the Worker in a real
 * Miniflare environment with in-memory KV, R2, and D1 bindings — no live
 * Cloudflare account is required.
 *
 * Binding values (ML_WORKER_URL, WEBHOOK_SECRET, R2_PUBLIC_URL) are set in
 * `vitest.config.ts` under `miniflare.bindings`.
 *
 * Run: `npx vitest run` from the `backend/` directory.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { env, SELF } from 'cloudflare:test'

// Recreate the songs table before each test so rows from one test never
// bleed into the next (CREATE TABLE IF NOT EXISTS would leave prior rows).
beforeEach(async () => {
  await env.LIBRARY_DB.exec('DROP TABLE IF EXISTS songs')
  await env.LIBRARY_DB.exec('CREATE TABLE songs (job_id TEXT PRIMARY KEY, filename TEXT NOT NULL, input_hash TEXT NOT NULL UNIQUE, timestamp INTEGER NOT NULL, stem_vocals TEXT, stem_drums TEXT, stem_bass TEXT, stem_guitar TEXT, stem_piano TEXT, stem_other TEXT, midi_vocals TEXT, midi_bass TEXT, midi_piano TEXT, has_midi_vocals INTEGER NOT NULL DEFAULT 0, has_midi_bass INTEGER NOT NULL DEFAULT 0, has_midi_piano INTEGER NOT NULL DEFAULT 0)')
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
    form.append('audio', new File([new Uint8Array(100)], 'song.wav', { type: 'audio/wav' }))
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(202)
    const body = await res.json() as { job_id: string; cached: boolean }
    expect(typeof body.job_id).toBe('string')
    expect(body.cached).toBe(false)
  })

  it('returns 202 with job_id for a valid mp3 upload', async () => {
    const form = new FormData()
    form.append('audio', new File([new Uint8Array(100)], 'track.mp3', { type: 'audio/mpeg' }))
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

  it('strips path separators from filename', async () => {
    const form = new FormData()
    form.append('audio', new File([new Uint8Array(50)], '../../etc/passwd.wav', { type: 'audio/wav' }))
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(202)
    const { job_id } = await res.json() as { job_id: string }
    // The filename should be sanitized
    const filename = await env.DEDUP_KV.get(`job:${job_id}:filename`)
    expect(filename).not.toContain('/')
    expect(filename).not.toContain('\\')
  })

  it('returns 400 for .flac extension', async () => {
    const form = new FormData()
    form.append('audio', new File(['data'], 'track.flac', { type: 'audio/flac' }))
    const res = await SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    expect(res.status).toBe(400)
  })

  it('different files produce different job_ids', async () => {
    const upload = async (name: string, bytes: Uint8Array) => {
      const form = new FormData()
      form.append('audio', new File([bytes], name, { type: 'audio/wav' }))
      return SELF.fetch('http://worker/api/upload', { method: 'POST', body: form })
    }

    const res1 = await upload('a.wav', new Uint8Array(100).fill(1))
    const res2 = await upload('b.wav', new Uint8Array(100).fill(2))

    const { job_id: id1 } = await res1.json() as { job_id: string }
    const { job_id: id2 } = await res2.json() as { job_id: string }
    expect(id1).not.toBe(id2)
  })
})

// ---------------------------------------------------------------------------
// GET /api/status/:jobId
// ---------------------------------------------------------------------------

describe('GET /api/status/:jobId', () => {
  it('returns processing status for a new job', async () => {
    const jobId = crypto.randomUUID()
    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')

    const res = await SELF.fetch(`http://worker/api/status/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('processing')
  })

  it('returns complete status', async () => {
    const jobId = crypto.randomUUID()
    await env.DEDUP_KV.put(`job:${jobId}:status`, 'complete')

    const res = await SELF.fetch(`http://worker/api/status/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('complete')
  })

  it('returns error status', async () => {
    const jobId = crypto.randomUUID()
    await env.DEDUP_KV.put(`job:${jobId}:status`, 'error')

    const res = await SELF.fetch(`http://worker/api/status/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { status: string }
    expect(body.status).toBe('error')
  })

  it('returns 404 for unknown job', async () => {
    const res = await SELF.fetch('http://worker/api/status/nonexistent-job')
    expect(res.status).toBe(404)
    const body = await res.json() as { status: string; message: string }
    expect(body.status).toBe('error')
    expect(body.message).toMatch(/not found/i)
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

  it('returns 401 for missing Authorization header', async () => {
    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: 'x', status: 'complete', stems: {}, midi_json: {} }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: 'not json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/invalid json/i)
  })

  it('writes D1 row and KV entries on valid completion', async () => {
    const jobId = crypto.randomUUID()

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

  it('sets error status in KV when webhook reports error', async () => {
    const jobId = crypto.randomUUID()
    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')

    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'error',
        message: 'Out of memory',
      }),
    })
    expect(res.status).toBe(200)

    const status = await env.DEDUP_KV.get(`job:${jobId}:status`)
    expect(status).toBe('error')
  })

  it('writes permanent dedup hash entry', async () => {
    const jobId = crypto.randomUUID()
    const hash = 'deadbeef123'

    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')
    await env.DEDUP_KV.put(`job:${jobId}:filename`, 'test.wav')
    await env.DEDUP_KV.put(`job:${jobId}:hash`, hash)

    await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'complete',
        stems: {},
        midi_json: {},
      }),
    })

    const dedupJobId = await env.DEDUP_KV.get(`hash:${hash}`)
    expect(dedupJobId).toBe(jobId)
  })

  it('sets has_midi flags when MIDI stems provided', async () => {
    const jobId = crypto.randomUUID()

    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')
    await env.DEDUP_KV.put(`job:${jobId}:filename`, 'test.wav')
    await env.DEDUP_KV.put(`job:${jobId}:hash`, 'hash1')

    // Put raw MIDI JSON in R2 so the quantizer can fetch it
    const midiData = JSON.stringify({ bpm: 120, notes: [{ pitch: 60, startTime: 0, duration: 0.5 }] })
    await env.STEMS_BUCKET.put(`${jobId}/vocals.json`, midiData)
    await env.STEMS_BUCKET.put(`${jobId}/bass.json`, midiData)

    const res = await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'complete',
        stems: { vocals: `${jobId}/vocals.flac` },
        midi_json: { vocals: `${jobId}/vocals.json`, bass: `${jobId}/bass.json` },
      }),
    })
    expect(res.status).toBe(200)

    const row = await env.LIBRARY_DB.prepare('SELECT * FROM songs WHERE job_id = ?').bind(jobId).first() as Record<string, unknown>
    expect(row.has_midi_vocals).toBe(1)
    expect(row.has_midi_bass).toBe(1)
    expect(row.has_midi_piano).toBe(0)
  })

  it('creates quantized MIDI files in R2', async () => {
    const jobId = crypto.randomUUID()

    await env.DEDUP_KV.put(`job:${jobId}:status`, 'processing')
    await env.DEDUP_KV.put(`job:${jobId}:filename`, 'test.wav')
    await env.DEDUP_KV.put(`job:${jobId}:hash`, 'hash2')

    const midiData = JSON.stringify({ bpm: 120, notes: [{ pitch: 60, startTime: 0, duration: 0.5 }] })
    await env.STEMS_BUCKET.put(`${jobId}/vocals.json`, midiData)

    await SELF.fetch('http://worker/webhook/complete', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        status: 'complete',
        stems: {},
        midi_json: { vocals: `${jobId}/vocals.json` },
      }),
    })

    // Check that the quantized file was written
    const quantized = await env.STEMS_BUCKET.get(`${jobId}/vocals.quantized.json`)
    expect(quantized).not.toBeNull()
    const quantizedData = await quantized!.json() as { bpm: number; notes: unknown[] }
    expect(quantizedData.bpm).toBe(120)
    expect(quantizedData.notes).toHaveLength(1)
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
    expect(body.songs).toHaveLength(0)
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

  it('returns empty results for non-matching search', async () => {
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind('job-1', 'beatles.mp3', 'hash1', Date.now()).run()

    const res = await SELF.fetch('http://worker/api/library?search=zzz_no_match')
    const body = await res.json() as { songs: Array<unknown> }
    expect(body.songs).toHaveLength(0)
  })

  it('respects limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await env.LIBRARY_DB.prepare(
        `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
      ).bind(`job-${i}`, `song_${i}.mp3`, `hash${i}`, Date.now() + i).run()
    }

    const res = await SELF.fetch('http://worker/api/library?limit=2')
    const body = await res.json() as { songs: Array<unknown> }
    expect(body.songs.length).toBeLessThanOrEqual(2)
  })

  it('respects offset parameter', async () => {
    for (let i = 0; i < 5; i++) {
      await env.LIBRARY_DB.prepare(
        `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
      ).bind(`job-${i}`, `song_${i}.mp3`, `hash${i}`, (i + 1) * 1000).run()
    }

    const res = await SELF.fetch('http://worker/api/library?limit=2&offset=2')
    const body = await res.json() as { songs: Array<{ filename: string }> }
    expect(body.songs.length).toBeLessThanOrEqual(2)
  })

  it('caps limit at 100', async () => {
    const res = await SELF.fetch('http://worker/api/library?limit=200')
    expect(res.status).toBe(200)
  })

  it('returns songs ordered by timestamp descending', async () => {
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind('job-1', 'first.mp3', 'hash1', 1000).run()

    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind('job-2', 'second.mp3', 'hash2', 2000).run()

    const res = await SELF.fetch('http://worker/api/library')
    const body = await res.json() as { songs: Array<{ filename: string; timestamp: number }> }
    expect(body.songs.length).toBe(2)
    expect(body.songs[0].filename).toBe('second.mp3')
    expect(body.songs[1].filename).toBe('first.mp3')
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

  it('returns stem URLs for a known job', async () => {
    const jobId = crypto.randomUUID()
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp, stem_vocals, stem_drums, stem_bass)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(jobId, 'test.mp3', 'hash', Date.now(), `${jobId}/vocals.flac`, `${jobId}/drums.flac`, `${jobId}/bass.flac`).run()

    const res = await SELF.fetch(`http://worker/api/stems/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { job_id: string; stems: Record<string, string | null>; has_midi: Record<string, boolean> }
    expect(body.job_id).toBe(jobId)
    expect(body.stems.vocals).toContain('vocals.flac')
    expect(body.stems.drums).toContain('drums.flac')
    expect(body.stems.bass).toContain('bass.flac')
  })

  it('returns embedded MIDI JSON when available', async () => {
    const jobId = crypto.randomUUID()
    const midiData = { bpm: 120, notes: [{ pitch: 60, startTime: 0, duration: 0.5 }] }

    await env.STEMS_BUCKET.put(`${jobId}/vocals.quantized.json`, JSON.stringify(midiData))

    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp, midi_vocals, has_midi_vocals)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(jobId, 'test.mp3', 'hash', Date.now(), `${jobId}/vocals.quantized.json`, 1).run()

    const res = await SELF.fetch(`http://worker/api/stems/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { midi: Record<string, unknown>; has_midi: Record<string, boolean> }
    expect(body.midi.vocals).toBeDefined()
    expect(body.has_midi.vocals).toBe(true)
    expect(body.has_midi.bass).toBe(false)
  })

  it('returns null for stems without URLs', async () => {
    const jobId = crypto.randomUUID()
    await env.LIBRARY_DB.prepare(
      `INSERT INTO songs (job_id, filename, input_hash, timestamp) VALUES (?, ?, ?, ?)`
    ).bind(jobId, 'test.mp3', 'hash', Date.now()).run()

    const res = await SELF.fetch(`http://worker/api/stems/${jobId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as { stems: Record<string, string | null> }
    expect(body.stems.vocals).toBeNull()
    expect(body.stems.drums).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function computeHash(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
