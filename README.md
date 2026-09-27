# Chain of Custody — SecOps Hackathon

Cyber-risk triage for small agri-food and logistics businesses. The app lives in [FE/](FE/README.md) and its API in [BE/](BE/README.md).

```bash
cd BE && DATABASE_URL=postgresql://... uv run uvicorn app.main:app --reload --port 8000
cd FE && npm ci && VITE_API_URL=http://127.0.0.1:8000 npm run dev
```
