# Improve.ai (Dance Coach Demo)

Improve.ai is a gamified, browser-based dance coaching app that compares your movement against a target dance video in real time using pose landmarks.

## Features

- Real-time pose matching with MediaPipe Pose Landmarker
- Live actionable coaching + optional spoken cues with selectable voice style
- Mirror mode toggle
- Reference speed control (0.5x / 0.75x / 1x)
- Session analytics:
  - Accuracy-over-time chart
  - Click-to-jump replay from chart points
  - Body-part ranking
  - Weak-point timeline with replay jump
  - Detailed drill recommendations
  - PoseScript-style movement language summary
- Synchronized target/user replay
- Gamification (XP, levels, combo, badges)
- Leaderboard (global via backend, local fallback)
- Nemotron AI post-session report
  - Secure proxy mode (recommended)
  - Direct browser mode (demo fallback)

## Run locally (secure mode)

1. Copy `.env.example` to `.env` and set `NEMOTRON_API_KEY`.
2. Export env vars (or load from `.env`) and start server:

```bash
export NEMOTRON_API_KEY="nvapi-..."
npm start
```

3. Open `http://localhost:8787`.
4. In the app:
   - Keep Nemotron mode = `Secure proxy (recommended)`
   - Proxy base URL = `http://localhost:8787`

## Run as static-only demo

You can still open `index.html` directly or via GitHub Pages. In that case:

- Use Nemotron mode = `Direct browser call`
- Enter API key in the app UI for that session

## Technical notes

- Pose scoring uses normalized landmark alignment + weighted body-part accuracy.
- Real-time feedback blends:
  - semantic state mismatches (hands-up, squat, stance, torso lean)
  - joint-angle deltas (elbows, knees, shoulders)
  - point-level positional deviations
- Webcam sessions are recorded locally (if supported) for replay.

## API endpoint (proxy)

`POST /api/nemotron-feedback`

Request body:

```json
{
  "prompt": "..."
}
```

Response body:

```json
{
  "content": "..."
}
```

`GET /api/leaderboard`

`POST /api/leaderboard`

Request body:

```json
{
  "name": "Mariam",
  "score": 932,
  "avgScore": 84,
  "bestCombo": 12,
  "perfectHits": 20
}
```

## Deployment

### GitHub Pages (already configured)

Workflow: `.github/workflows/deploy.yml`.

1. Push to `main`.
2. In GitHub `Settings -> Pages`, set source to `GitHub Actions`.

### Secure backend on Render (free tier)

This repo includes `render.yaml` for one-click setup.

1. In Render, create a new Blueprint from this repo.
2. Add environment variable:
   - `NEMOTRON_API_KEY=<your nvapi key>`
3. Set `CORS_ORIGIN` to your frontend origin (recommended), for example:
   - `https://<your-user>.github.io`
   - or multiple origins: `https://<your-user>.github.io,https://<custom-domain>`
4. Deploy and copy your backend URL, e.g. `https://improveai-nemotron-proxy.onrender.com`.
5. In Improve.ai UI, keep mode `Secure proxy (recommended)` and set:
   - `Proxy Base URL=<your Render URL>`

### Secure backend on Railway (free trial/credits)

This repo includes `railway.json`.

1. Create a new Railway project from this repo.
2. Add env vars:
   - `NEMOTRON_API_KEY=<your nvapi key>`
   - `CORS_ORIGIN=https://<your-user>.github.io`
3. Deploy and use the provided public URL as `Proxy Base URL` in the app.

### Optional Vercel preview deploy

If you want a quick preview deployment, use:

```bash
vercel deploy -y
```
