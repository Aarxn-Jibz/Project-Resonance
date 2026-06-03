# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repositories

This project spans two sibling repos under the same parent directory:

- `desynth/` — Frontend (React/Vite) + Backend (Bun/Hono). This repo.
- `desynth-ml/` — ML worker (Python/FastAPI + Demucs + Basic Pitch). At `../desynth-ml/`.

---

## Commands

### Frontend (root)
```bash
npm run dev        # Vite dev server → http://localhost:5173
npm run build      # Production build → dist/
npm run lint       # ESLint (jsx files only)
npm run preview    # Preview production build locally
```

### Backend (`backend/`)
```bash
bun run dev        # Dev server with --watch → http://localhost:3000
bun run start      # Production server
```

### ML Worker (`../desynth-ml/`)
```bash
./scripts/run_local.sh              # uvicorn with --reload → http://localhost:8000
pytest                              # Run all tests
pytest tests/test_contract.py       # Run specific test file
pytest -k "test_health"             # Run single test by name
```

---

## Architecture

### Request Flow

```
Browser → CF Pages (static React build)
       → CF Worker (Hono, /api/upload + /sse/:jobId)
       → Modal ML Worker (FastAPI, /separate)
       → R2 (FLAC stems + MIDI JSON stored directly by Modal)
       → CF D1 (song library + job metadata)
       → CF KV (SHA-256 hash → job_id dedup index)
```

**Async job pattern**: The CF Worker accepts the upload, hashes the file (SHA-256 dedup check via KV), stores it in R2, kicks off the Modal job, and returns a `job_id` immediately. The frontend opens an SSE connection to `/sse/:jobId` which polls KV for status. Modal webhooks back to the Worker on completion; the Worker runs quantization and writes final results to D1.

### Backend (`backend/src/`)

- **`index.ts`** — Single Hono app. One route (`POST /api/upload`) proxies to the ML worker, rewrites stem URLs to absolute, fetches and quantizes per-stem MIDI JSON, broadcasts status via WebSocket. Also upgrades `/ws` connections using Bun's native WS API.
- **`quantizer.ts`** — Pure function `quantize(raw: string, threshold: number): MidiData`. Parses raw MIDI JSON, filters notes by confidence, snaps start times and durations to the nearest sixteenth-note grid. No side effects, no I/O.

The backend is currently Bun-specific (`Bun.serve`, `Bun.write`, `ServerWebSocket`). **It is being migrated to CF Workers** — these APIs will be replaced with the Hono CF Workers adapter, SSE, and R2.

### ML Worker (`../desynth-ml/app/`)

- **`main.py`** — FastAPI app with one route (`POST /separate`). Orchestrates the full pipeline: save upload → validate duration → run Demucs → run Basic Pitch on tonal stems → return stem paths + MIDI JSON paths.
- **`pipeline/demucs_runner.py`** — Runs `demucs` CLI via subprocess. OOM retry loop: tries segment sizes `[7, 6, 5]`, retrying on "CUDA out of memory" in stderr.
- **`pipeline/basic_pitch.py`** — Runs `basic-pitch` CLI via subprocess, parses the output `.mid` with `pretty_midi`, writes a `{bpm, notes[]}` JSON file next to the stems.
- **`pipeline/audio_utils.py`** — Duration validation via `ffprobe` subprocess.
- **`config.py`** — All tuneable constants. `SEGMENT_SIZES`, `OVERLAP`, `MODEL_NAME`, `MAX_DURATION_SECONDS` live here.

The ML worker is being **migrated to Modal**. The Dockerfile and ngrok scripts are the current local/Colab deployment mechanism and will be replaced. Modal image will use `modal.Image` builder (not `from_dockerfile`) to get CUDA-enabled PyTorch.

### Frontend (`src/`)

- **`pages/Lab.jsx`** — Main workspace. Owns all state: `engineState`, `audioURL` (stem URLs keyed by stem name), `midiData` (quantized MIDI per stem), `activeSheetStem` (which sheet music modal is open). Passes down via props.
- **`components/SeparatorPanel.jsx`** — Upload form and processing log. Calls `POST http://localhost:3000/api/upload`, calls `onFileSelect(data.stems, data.quantized_midi)` on success.
- **`components/StemPlayer.jsx`** — 4-channel mixer. Individual `<audio>` elements per stem, synced play/pause via `audioRefs`. Shows sheet music button only when `midiData[stem.id]` is truthy.
- **`components/SheetMusicModal.jsx`** — Converts `{bpm, notes[]}` MIDI JSON to ABC notation string (`rawMidiToABC`), renders with `abcjs`. Offers SVG and raw JSON download.
- **`components/TimbreDesign.jsx`** — Visual wrapper around `StemPlayer`.

### Stem model & MIDI scope

- **Model**: `htdemucs_6s` — 6 stems: vocals, drums, bass, guitar, piano, other.
- **Basic Pitch runs on**: vocals, bass, piano only. Guitar, drums, other get audio only.
- **Confidence**: currently hardcoded to `0.9` in `basic_pitch.py` — the quantizer's `>= 0.5` threshold is a no-op until this is wired to real per-note confidence.

### Storage layout (R2)

```
{job_id}/vocals.flac
{job_id}/drums.flac
{job_id}/bass.flac
{job_id}/guitar.flac
{job_id}/piano.flac
{job_id}/other.flac
{job_id}/vocals.json    ← quantized MIDI
{job_id}/bass.json
{job_id}/piano.json
```

### D1 schema (song library)

One table `songs`: `job_id`, `filename`, `input_hash` (SHA-256), `timestamp`, R2 keys for all 6 stems, boolean columns `has_midi_vocals / has_midi_bass / has_midi_piano`.

### Tailwind custom tokens

`res-yellow`, `res-magenta` are the two brand accent colours used throughout. Dark background is `#0a0a0a`.

---

## Known issues being fixed in the current refactor

See conversation history for the full 61-issue audit. The highest-priority ones that affect correctness:

- `quantizer.ts`: BPM=0 or missing causes NaN in all note times — no guard exists yet.
- `basic_pitch.py`: confidence hardcoded, `estimate_tempo()` returns single global BPM, subprocess return codes not checked.
- `main.py`: `async def separate` blocks the event loop via synchronous `subprocess.run`.
- `Dockerfile`: `pip install torch` installs CPU-only — needs CUDA index URL.
- `CORS_ORIGINS="*"` + `allow_credentials=True` is spec-invalid in Starlette.
- Sheet music bar lines are by note index, not beat duration. Bass clef syntax is `K:C bass` (wrong) — should be `K:C clef=bass`.
