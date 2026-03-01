# Improve.ai

Improve.ai uses:
- A custom landing page at `/` (current design in `index.html` + `landing.css` + `landing.js`)
- The restored `dance-coach-ai-restored` app as the working dance studio at `/app.html` (React + Vite)
- A Python FastAPI backend with PoseScript-style analysis and Nemotron feedback

## Local development

### Frontend

```bash
npm install
npm run dev
```

- Landing: `http://localhost:5174/`
- App: `http://localhost:5174/app.html`

### Backend (optional, recommended for AI feedback)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

The Vite dev server proxies these routes to the backend:
- `/api/feedback`
- `/api/describe`
- `/api/correct`
- `/api/health`

## Deployment

## Vercel (single deploy)

This repo includes:
- `vercel.json`
- `api/index.py` (ASGI entrypoint)
- `requirements.txt`

So frontend + backend deploy together on Vercel.

Set env vars in Vercel project settings:
- `VITE_NEMOTRON_API_KEY` (backend key)
- `ALLOWED_ORIGINS` (optional, comma-separated)

## GitHub Pages (frontend only)

Workflow: `.github/workflows/deploy.yml`.

Set repository variable:
- `VITE_API_BASE_URL` pointing to your deployed backend URL (if not using same-origin backend)

## Notes

- Backend exposes both prefixed and non-prefixed routes (`/feedback` and `/api/feedback`) for compatibility across hosts.
- PoseScript-style feedback generation is implemented in `backend/pose_descriptor.py` and combined with Nemotron in `backend/server.py`.
