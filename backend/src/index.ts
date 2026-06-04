/**
 * Desynth CF Worker — main entry point.
 *
 * Handles all API traffic between the React frontend and the Modal ML worker.
 * Deployed to Cloudflare Workers via `wrangler deploy`.
 *
 * Request flow (happy path)
 * -------------------------
 * 1. `POST /api/upload`
 *    - Validates file type and size.
 *    - SHA-256 hashes the file bytes and checks CF KV for a duplicate.
 *    - On cache miss: uploads the raw file to R2, writes job metadata to KV,
 *      fires the Modal `/separate` endpoint (non-blocking via `waitUntil`),
 *      returns `{job_id}` with HTTP 202.
 *    - On cache hit: returns the existing D1 row immediately.
 *
 * 2. `GET /api/status/:jobId`
 *    - Returns the current job status from KV as `{ status }`.
 *    - The frontend polls this endpoint every ~2.5 seconds; keeping each
 *      request short-lived avoids the CF free-tier CPU time limit.
 *
 * 3. `POST /webhook/complete`  (called by Modal, not the browser)
 *    - Authenticated with the shared `WEBHOOK_SECRET`.
 *    - Fetches each MIDI JSON file from R2, runs `quantize()`, and writes
 *      the result back to R2 as `*.quantized.json`.
 *    - Inserts a row into the D1 song library.
 *    - Writes `hash:<sha256>` → `job_id` in KV (permanent dedup entry).
 *    - Updates `job:<jobId>:status` to "complete" to unblock SSE subscribers.
 *
 * 4. `GET /api/library`    — paginated, searchable song listing from D1.
 * 5. `GET /api/stems/:jobId` — resolves R2 keys to public URLs for playback.
 *
 * CF bindings (configured in wrangler.toml)
 * ------------------------------------------
 * - `STEMS_BUCKET`  R2Bucket    — stores FLAC stems, MIDI JSON, quantized JSON
 * - `DEDUP_KV`      KVNamespace — job status + dedup hash index
 * - `LIBRARY_DB`    D1Database  — song library (searchable)
 *
 * Secrets (set via `wrangler secret put`)
 * ----------------------------------------
 * - `ML_WORKER_URL`  — Modal `/separate` endpoint URL
 * - `WEBHOOK_SECRET` — shared secret; same value must be in Modal secrets
 * - `R2_PUBLIC_URL`  — public base URL of the R2 bucket (no trailing slash)
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { quantize } from './quantizer.js'

type Env = {
  STEMS_BUCKET: R2Bucket
  DEDUP_KV: KVNamespace
  LIBRARY_DB: D1Database
  ML_WORKER_URL: string
  WEBHOOK_SECRET: string
  R2_PUBLIC_URL: string
}

const ALLOWED_EXTENSIONS = new Set(['.wav', '.mp3'])
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB

const app = new Hono<{ Bindings: Env }>()
app.use('*', cors())

// ---------------------------------------------------------------------------
// POST /api/upload
// ---------------------------------------------------------------------------

app.post('/api/upload', async (c) => {
  // Check Content-Length before buffering the body to reject obviously
  // oversized requests without loading them into Worker memory.
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > MAX_FILE_BYTES) {
    return c.json({ error: 'File too large (max 50MB)' }, 400)
  }

  let formData: FormData
  try {
    formData = await c.req.formData()
  } catch {
    return c.json({ error: 'Expected multipart/form-data' }, 400)
  }

  const file = formData.get('audio')
  if (!(file instanceof File)) {
    return c.json({ error: 'Missing audio field' }, 400)
  }

  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return c.json({ error: 'Only .wav and .mp3 allowed' }, 400)
  }

  if (file.size > MAX_FILE_BYTES) {
    return c.json({ error: 'File too large (max 50MB)' }, 400)
  }

  const fileBytes = await file.arrayBuffer()

  // SHA-256 dedup — same file bytes → same hash → same job result
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes)
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  const existingJobId = await c.env.DEDUP_KV.get(`hash:${hash}`)
  if (existingJobId) {
    const row = await c.env.LIBRARY_DB.prepare(
      'SELECT * FROM songs WHERE job_id = ?'
    ).bind(existingJobId).first()
    if (row) {
      return c.json({ job_id: existingJobId, cached: true, result: row })
    }
  }

  const jobId = crypto.randomUUID()
  // Strip path separators from the filename before storing it — the name is
  // used in search results and could otherwise be used for log injection.
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)

  await c.env.STEMS_BUCKET.put(`uploads/${jobId}${ext}`, fileBytes)

  // TTL 1 hour: if Modal never calls back, these ephemeral keys expire cleanly
  await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'processing', { expirationTtl: 3600 })
  await c.env.DEDUP_KV.put(`job:${jobId}:filename`, safeFilename, { expirationTtl: 3600 })
  await c.env.DEDUP_KV.put(`job:${jobId}:hash`, hash, { expirationTtl: 3600 })

  // Dispatch ML job without blocking the HTTP response.
  // Local dev sends file bytes directly; production sends job_id so Modal
  // downloads from R2 (avoids double-transfer of large audio files).
  const mlUrl = c.env.ML_WORKER_URL ?? ''
  const isLocalDev = mlUrl.includes('localhost') || mlUrl.includes('127.0.0.1')

  c.executionCtx.waitUntil(
    (async () => {
      try {
        let mlBody: BodyInit
        let mlHeaders: Record<string, string>

        if (isLocalDev) {
          const mlForm = new FormData()
          mlForm.append('file', new Blob([fileBytes], { type: file.type }), file.name)
          mlForm.append('job_id', jobId)
          mlBody = mlForm
          mlHeaders = { 'Authorization': `Bearer ${c.env.WEBHOOK_SECRET}` }
        } else {
          mlBody = JSON.stringify({ job_id: jobId, ext })
          mlHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${c.env.WEBHOOK_SECRET}`,
          }
        }

        await fetch(mlUrl, { method: 'POST', headers: mlHeaders, body: mlBody })
      } catch (err: unknown) {
        console.error('Failed to dispatch ML job:', (err as Error).message)
      }
    })()
  )

  return c.json({ job_id: jobId, cached: false }, 202)
})

// ---------------------------------------------------------------------------
// GET /api/status/:jobId
// ---------------------------------------------------------------------------

app.get('/api/status/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const status = await c.env.DEDUP_KV.get(`job:${jobId}:status`)
  if (!status) {
    return c.json({ status: 'error', message: 'Job not found' }, 404)
  }
  return c.json({ status })
})

// ---------------------------------------------------------------------------
// POST /webhook/complete
// ---------------------------------------------------------------------------

app.post('/webhook/complete', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  const enc = new TextEncoder()
  const expected = enc.encode(`Bearer ${c.env.WEBHOOK_SECRET}`)
  const actual = enc.encode(auth)
  const authorized =
    expected.byteLength === actual.byteLength &&
    crypto.subtle.timingSafeEqual(expected, actual)
  if (!authorized) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  type WebhookBody = {
    job_id: string
    status: 'complete' | 'error'
    message?: string
    stems?: Record<string, string>
    midi_json?: Record<string, string>
  }

  let body: WebhookBody
  try {
    body = await c.req.json<WebhookBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { job_id: jobId, status } = body

  if (status === 'error') {
    await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'error', { expirationTtl: 604800 })
    return c.json({ ok: true })
  }

  const stems = body.stems ?? {}
  const midiPaths = body.midi_json ?? {}

  // Quantize each MIDI JSON: fetch raw from R2, snap to grid, write back as
  // *.quantized.json so the frontend always gets grid-aligned note data.
  const quantizedMidi: Record<string, string> = {}
  for (const [stem, r2Key] of Object.entries(midiPaths)) {
    try {
      const obj = await c.env.STEMS_BUCKET.get(r2Key)
      if (!obj) continue
      const raw = await obj.text()
      const quantized = quantize(raw)
      const quantizedKey = r2Key.replace(/\.json$/, '.quantized.json')
      await c.env.STEMS_BUCKET.put(quantizedKey, JSON.stringify(quantized))
      quantizedMidi[stem] = quantizedKey
    } catch (err: unknown) {
      console.error(`Quantizer failed for ${stem}:`, (err as Error).message)
    }
  }

  const filename = (await c.env.DEDUP_KV.get(`job:${jobId}:filename`)) ?? 'unknown'
  const hash = (await c.env.DEDUP_KV.get(`job:${jobId}:hash`)) ?? ''

  await c.env.LIBRARY_DB.prepare(`
    INSERT OR REPLACE INTO songs
      (job_id, filename, input_hash, timestamp,
       stem_vocals, stem_drums, stem_bass, stem_guitar, stem_piano, stem_other,
       midi_vocals, midi_bass, midi_piano,
       has_midi_vocals, has_midi_bass, has_midi_piano)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobId, filename, hash, Date.now(),
    stems.vocals ?? null, stems.drums ?? null, stems.bass ?? null,
    stems.guitar ?? null, stems.piano ?? null, stems.other ?? null,
    quantizedMidi.vocals ?? null, quantizedMidi.bass ?? null, quantizedMidi.piano ?? null,
    quantizedMidi.vocals ? 1 : 0,
    quantizedMidi.bass ? 1 : 0,
    quantizedMidi.piano ? 1 : 0,
  ).run()

  // Permanent dedup entry — no TTL so re-uploads of the same file are always
  // served from the library without reprocessing
  await c.env.DEDUP_KV.put(`hash:${hash}`, jobId)
  // 7-day TTL: long enough that any open tab can still poll after a slow job;
  // the permanent dedup hash means re-uploads hit D1 before this key matters.
  await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'complete', { expirationTtl: 604800 })

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// GET /api/library
// ---------------------------------------------------------------------------

app.get('/api/library', async (c) => {
  const search = c.req.query('search') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100)
  const offset = Number(c.req.query('offset') ?? 0)

  // Escape SQL LIKE wildcards so user input is treated as a literal substring.
  const safeLike = `%${search.replace(/[%_\\]/g, '\\$&')}%`

  const { results } = await c.env.LIBRARY_DB.prepare(
    `SELECT job_id, filename, timestamp, has_midi_vocals, has_midi_bass, has_midi_piano
     FROM songs
     WHERE filename LIKE ? ESCAPE '\\'
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`
  ).bind(safeLike, limit, offset).all()

  return c.json({ songs: results })
})

// ---------------------------------------------------------------------------
// GET /api/stems/:jobId
// ---------------------------------------------------------------------------

app.get('/api/stems/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const row = await c.env.LIBRARY_DB.prepare(
    'SELECT * FROM songs WHERE job_id = ?'
  ).bind(jobId).first<Record<string, string | number | null>>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  // Convert R2 keys (relative paths) to full public URLs for the frontend.
  // The bucket is public, so no presigning is required.
  const base = c.env.R2_PUBLIC_URL.replace(/\/+$/, '')
  const toUrl = (key: string | null | undefined) =>
    key ? `${base}/${key}` : null

  // Fetch quantized MIDI JSON content from R2 and embed it in the response
  // so the frontend can render sheet music without a second round-trip.
  const midiKeyMap: Record<string, string | null | undefined> = {
    vocals: row.midi_vocals as string | null,
    bass:   row.midi_bass   as string | null,
    piano:  row.midi_piano  as string | null,
  }
  const midi: Record<string, unknown> = {}
  await Promise.all(
    Object.entries(midiKeyMap).map(async ([stem, key]) => {
      if (!key) return
      const obj = await c.env.STEMS_BUCKET.get(key)
      if (!obj) return
      try { midi[stem] = await obj.json() } catch { /* malformed — omit */ }
    }),
  )

  return c.json({
    job_id: jobId,
    stems: {
      vocals: toUrl(row.stem_vocals as string | null),
      drums:  toUrl(row.stem_drums  as string | null),
      bass:   toUrl(row.stem_bass   as string | null),
      guitar: toUrl(row.stem_guitar as string | null),
      piano:  toUrl(row.stem_piano  as string | null),
      other:  toUrl(row.stem_other  as string | null),
    },
    midi,
    has_midi: {
      vocals: !!row.has_midi_vocals,
      bass:   !!row.has_midi_bass,
      piano:  !!row.has_midi_piano,
    },
  })
})

export default app
