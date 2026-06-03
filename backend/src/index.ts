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
const MAX_FILE_BYTES = 50 * 1024 * 1024

const app = new Hono<{ Bindings: Env }>()
app.use('*', cors())

// ---------------------------------------------------------------------------
// Upload — hash → dedup check → R2 upload → spawn Modal job
// ---------------------------------------------------------------------------

app.post('/api/upload', async (c) => {
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
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBytes)
  const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Dedup check
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
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)

  // Store upload in R2 for Modal to pick up
  await c.env.STEMS_BUCKET.put(`uploads/${jobId}${ext}`, fileBytes)

  // Track job status in KV — TTL 1 hour
  await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'processing', { expirationTtl: 3600 })
  await c.env.DEDUP_KV.put(`job:${jobId}:filename`, safeFilename, { expirationTtl: 3600 })
  await c.env.DEDUP_KV.put(`job:${jobId}:hash`, hash, { expirationTtl: 3600 })

  // Dispatch to ML worker.
  // In production (Modal): send job_id + ext, Modal downloads file from R2.
  // In local dev: send file bytes directly since Miniflare R2 isn't an HTTP server.
  const isLocalDev = c.env.ML_WORKER_URL.includes('localhost') || c.env.ML_WORKER_URL.includes('127.0.0.1')

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

        await fetch(c.env.ML_WORKER_URL, { method: 'POST', headers: mlHeaders, body: mlBody })
      } catch (err: unknown) {
        console.error('Failed to dispatch ML job:', (err as Error).message)
      }
    })()
  )

  return c.json({ job_id: jobId, cached: false }, 202)
})

// ---------------------------------------------------------------------------
// SSE — streams job status to frontend
// ---------------------------------------------------------------------------

app.get('/sse/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      while (true) {
        const status = await c.env.DEDUP_KV.get(`job:${jobId}:status`)

        if (!status) {
          send({ status: 'error', message: 'Job not found' })
          break
        }

        send({ status })

        if (status === 'complete' || status === 'error') {
          break
        }

        // Poll every 2 seconds until done
        await new Promise<void>(resolve => setTimeout(resolve, 2000))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// ---------------------------------------------------------------------------
// Webhook — Modal calls this when processing is complete
// ---------------------------------------------------------------------------

app.post('/webhook/complete', async (c) => {
  const auth = c.req.header('Authorization') ?? ''
  if (auth !== `Bearer ${c.env.WEBHOOK_SECRET}`) {
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
    await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'error', { expirationTtl: 3600 })
    return c.json({ ok: true })
  }

  const stems = body.stems ?? {}
  const midiPaths = body.midi_json ?? {}

  // Fetch, quantize, and re-upload each MIDI JSON
  const quantizedMidi: Record<string, string> = {}
  for (const [stem, r2Key] of Object.entries(midiPaths)) {
    try {
      const obj = await c.env.STEMS_BUCKET.get(r2Key)
      if (!obj) continue
      const raw = await obj.text()
      const quantized = quantize(raw)
      const quantizedKey = r2Key.replace('.json', '.quantized.json')
      await c.env.STEMS_BUCKET.put(quantizedKey, JSON.stringify(quantized))
      quantizedMidi[stem] = quantizedKey
    } catch (err: unknown) {
      console.error(`Quantizer failed for ${stem}:`, (err as Error).message)
    }
  }

  const filename = (await c.env.DEDUP_KV.get(`job:${jobId}:filename`)) ?? 'unknown'
  const hash = (await c.env.DEDUP_KV.get(`job:${jobId}:hash`)) ?? ''

  // Insert into D1 song library
  await c.env.LIBRARY_DB.prepare(`
    INSERT OR REPLACE INTO songs
      (job_id, filename, input_hash, timestamp,
       stem_vocals, stem_drums, stem_bass, stem_guitar, stem_piano, stem_other,
       midi_vocals, midi_bass, midi_piano,
       has_midi_vocals, has_midi_bass, has_midi_piano)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobId,
    filename,
    hash,
    Date.now(),
    stems.vocals ?? null,
    stems.drums ?? null,
    stems.bass ?? null,
    stems.guitar ?? null,
    stems.piano ?? null,
    stems.other ?? null,
    quantizedMidi.vocals ?? null,
    quantizedMidi.bass ?? null,
    quantizedMidi.piano ?? null,
    quantizedMidi.vocals ? 1 : 0,
    quantizedMidi.bass ? 1 : 0,
    quantizedMidi.piano ? 1 : 0,
  ).run()

  // Persist dedup hash → job mapping (permanent, no TTL)
  await c.env.DEDUP_KV.put(`hash:${hash}`, jobId)

  // Mark job complete for SSE subscribers
  await c.env.DEDUP_KV.put(`job:${jobId}:status`, 'complete', { expirationTtl: 3600 })

  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Library — public song listing with optional search
// ---------------------------------------------------------------------------

app.get('/api/library', async (c) => {
  const search = c.req.query('search') ?? ''
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100)
  const offset = Number(c.req.query('offset') ?? 0)

  const { results } = await c.env.LIBRARY_DB.prepare(
    `SELECT job_id, filename, timestamp, has_midi_vocals, has_midi_bass, has_midi_piano
     FROM songs
     WHERE filename LIKE ?
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`
  ).bind(`%${search}%`, limit, offset).all()

  return c.json({ songs: results })
})

// ---------------------------------------------------------------------------
// Stems — return public R2 URLs for a completed job
// ---------------------------------------------------------------------------

app.get('/api/stems/:jobId', async (c) => {
  const jobId = c.req.param('jobId')
  const row = await c.env.LIBRARY_DB.prepare(
    'SELECT * FROM songs WHERE job_id = ?'
  ).bind(jobId).first<Record<string, string | number | null>>()

  if (!row) {
    return c.json({ error: 'Job not found' }, 404)
  }

  const base = c.env.R2_PUBLIC_URL.replace(/\/+$/, '')
  const toUrl = (key: string | null | undefined) =>
    key ? `${base}/${key}` : null

  return c.json({
    job_id: jobId,
    stems: {
      vocals: toUrl(row.stem_vocals as string | null),
      drums: toUrl(row.stem_drums as string | null),
      bass: toUrl(row.stem_bass as string | null),
      guitar: toUrl(row.stem_guitar as string | null),
      piano: toUrl(row.stem_piano as string | null),
      other: toUrl(row.stem_other as string | null),
    },
    midi: {
      vocals: toUrl(row.midi_vocals as string | null),
      bass: toUrl(row.midi_bass as string | null),
      piano: toUrl(row.midi_piano as string | null),
    },
    has_midi: {
      vocals: !!row.has_midi_vocals,
      bass: !!row.has_midi_bass,
      piano: !!row.has_midi_piano,
    },
  })
})

export default app
