import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ServerWebSocket } from 'bun'
import { quantize } from './quantizer.js'
import { mkdir } from 'node:fs/promises'

const PORT = Number(process.env.PORT ?? 3000)
const ML_WORKER_URL = (process.env.ML_WORKER_URL ?? 'http://localhost:8000').replace(/\/+$/, '')
const UPLOAD_DIR = './temp_audio'

await mkdir(UPLOAD_DIR, { recursive: true })

// WS client pool
const clients = new Set<ServerWebSocket<unknown>>()

function broadcast(type: string, message: string, data?: unknown) {
  const payload = JSON.stringify({ type, message, ...(data !== undefined && { data }) })
  for (const ws of clients) {
    try {
      ws.send(payload)
    } catch {
      clients.delete(ws)
    }
  }
}

const app = new Hono()
app.use('*', cors())

app.post('/api/upload', async (c) => {
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

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext !== 'wav' && ext !== 'mp3') {
    return c.json({ error: 'Only .wav and .mp3 allowed' }, 400)
  }

  if (file.size > 50 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 50MB)' }, 400)
  }

  // Save to disk
  const savePath = `${UPLOAD_DIR}/${Date.now()}_${file.name}`
  await Bun.write(savePath, file)

  broadcast('status', 'Upload complete. Sending to AI Worker...')

  // Forward to Python ML worker
  let respData: any
  try {
    const form = new FormData()
    form.append('file', file)
    const pyResp = await fetch(`${ML_WORKER_URL}/separate`, { method: 'POST', body: form })
    if (!pyResp.ok) throw new Error(`ML worker error ${pyResp.status}: ${await pyResp.text()}`)
    respData = await pyResp.json()
  } catch (err: any) {
    console.error('ML Worker error:', err.message)
    broadcast('status', 'Error: AI Worker offline.')
    return c.json({ error: 'AI Worker failed' }, 500)
  }

  // Rewrite stem audio URLs to absolute paths
  if (respData.stems && typeof respData.stems === 'object') {
    for (const key of Object.keys(respData.stems)) {
      const val = respData.stems[key]
      if (typeof val === 'string' && val !== '') {
        respData.stems[key] = ML_WORKER_URL + val
      }
    }
  }

  // Download + quantize per-stem MIDI
  if (respData.midi_json && typeof respData.midi_json === 'object') {
    const quantizedMidi: Record<string, unknown> = {}
    for (const [stem, midiPath] of Object.entries(respData.midi_json)) {
      if (typeof midiPath !== 'string' || !midiPath) continue
      try {
        const r = await fetch(ML_WORKER_URL + midiPath)
        if (!r.ok) continue
        const raw = await r.text()
        quantizedMidi[stem] = quantize(raw, 0.5)
      } catch (err: any) {
        console.error(`Quantizer failed for ${stem}:`, err.message)
      }
    }
    if (Object.keys(quantizedMidi).length > 0) {
      respData.quantized_midi = quantizedMidi
    }
  }

  broadcast('status', 'AI Worker processing complete.')
  return c.json(respData)
})

Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req)
      if (upgraded) return undefined
      return new Response('WebSocket upgrade failed', { status: 500 })
    }
    return app.fetch(req)
  },
  websocket: {
    open(ws) {
      clients.add(ws)
      console.log('Frontend connected via WebSocket')
    },
    close(ws) {
      clients.delete(ws)
      console.log('Frontend disconnected')
    },
    message() {},
  },
})

console.log(`Desynth backend (Bun + Hono) running on http://localhost:${PORT}`)
