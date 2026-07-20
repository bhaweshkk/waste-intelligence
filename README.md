# Waste Intelligence Suite — Full-Stack Edition

This is the real, full-stack version of the project: a FastAPI backend that
loads 4 trained models once and serves live inference, a SQLite database,
an on-demand Google OR-Tools solver, and a React frontend that talks to all
of it over HTTP. The earlier single-file version had every tool's "backend"
baked into embedded JSON inside the frontend — this version replaces that
with an actual server.

```
fullstack/
├── backend/     FastAPI + SQLAlchemy + trained models — see backend/README.md
└── frontend/    Vite + React, calls the backend over fetch()
```

## Quickstart (local)

**Terminal 1 — backend:**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Wait for `Backend ready: DB seeded, all 4 models loaded for live inference.`
(~30-50s on first run, mostly loading the two Keras models).

**Terminal 2 — frontend:**
```bash
cd frontend
npm install
cp .env.example .env      # defaults to http://127.0.0.1:8000, correct for local dev
npm run dev
```
Open the URL Vite prints (usually `http://127.0.0.1:5173`).

## What changed from the single-file version

| Before | Now |
|---|---|
| Predictions embedded as static JSON for a handful of precomputed scenarios | Live model inference on the backend for **any** input combination |
| CNN "results" were a fixed gallery of 30 pre-scored images | Real CNN inference on **whatever photo you upload** |
| OR-Tools solutions were 5 fixed scenarios, with a client-side heuristic fallback for anything else | Every solve is a **real, fresh OR-Tools run** — no fallback needed |
| Citizen reports / marketplace listings lived in `window.storage` (a Claude-artifact-only API) | Real SQLite persistence via a real REST API — works in any browser, anywhere |
| One ~1MB React file with everything inlined | A proper multi-file Vite project + a proper Python package, each independently deployable |

## Deploying this for real

The backend needs to run somewhere with a public URL (Render, Railway,
Fly.io, a VPS, etc. — see `backend/README.md` for specifics, including a
`Dockerfile`). The frontend is fully static after `npm run build` and can go
on Vercel, Netlify, Cloudflare Pages, or be served by the backend itself.
Point the frontend's `VITE_API_BASE_URL` at wherever the backend ends up.

## Honest limitations, unchanged from before

The bin networks (dispatcher, router) and the training labels behind the 4
models are still documented synthetic data — no live IoT bin-sensor feed or
public dumpster-photo dataset was reachable from the sandbox this was built
in. What's different now is that swapping in real data is a matter of
changing what feeds the training script and the seed script — the serving
architecture (FastAPI, SQLAlchemy, the trained-model-in-memory pattern)
doesn't need to change at all. See `backend/README.md` → "Swapping in real
data" for exactly where to plug it in.
