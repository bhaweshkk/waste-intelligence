# Waste Intelligence Suite — Backend

A real FastAPI backend: 4 trained models loaded once at startup and queried
live, a SQLite database, and an on-demand Google OR-Tools solver. No endpoint
here returns precomputed/hardcoded data — every response is computed against
whatever is in the database or whatever the request asks for.

## What's real here

| Component | What it actually does |
|---|---|
| `/api/wits/*` | Trend regression + hazard anomaly detection, computed live from the real WITS dataset in SQLite |
| `/api/overflow/*` | scikit-learn RandomForest (regressor + classifier), loaded once, scored live per-request |
| `/api/dispatcher/*` | scikit-learn RandomForestRegressor, live inference across real bins in the DB, plus a real nearest-neighbor route |
| `/api/typology/estimate` | Real Keras CNN inference on your uploaded photo |
| `/api/contamination/scan` | Real multi-input Keras CNN (image + declared bin type) inference on your uploaded photo |
| `/api/router/solve` | Real Google OR-Tools `constraint_solver` CVRP solve, fresh for any threshold/truck-count |
| `/api/citizen/*` | Real CRUD against SQLite, with haversine clustering computed against actual stored rows |
| `/api/marketplace/*` | Real CRUD + a match-scoring engine computed fresh against the current DB state |
| `/api/opendata/*` | Real SQL queries with filtering/pagination/CSV export |

## Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Train and save all 4 models (takes a few minutes; only needed once —
# artifacts are already included under app/ml/artifacts/, so you can skip
# this unless you want to retrain from scratch or on real data)
python3 -m app.ml.train_all

# Run the server (also seeds the database on first startup)
uvicorn app.main:app --reload --port 8000
```

The first startup takes ~30-50 seconds (loading the two Keras models). Once
you see `Backend ready: DB seeded, all 4 models loaded for live inference.`
the API is live at `http://127.0.0.1:8000`. Interactive docs are auto-generated
at `http://127.0.0.1:8000/docs`.

## Swapping in real data

Everything here is seeded from the real WITS waste-management dataset, but
the **bin networks** (dispatcher + router) and the **ML training labels**
(overflow/dispatcher effect sizes, vision-model training images) are
documented, realistic synthetic stand-ins — because no live IoT bin-sensor
feed or public dumpster-photo dataset was reachable from the environment
this was built in. To go further:

- **Real bin sensors**: replace `seed_dispatcher_bins()` / `seed_router_bins()`
  in `app/seed_data.py` with a real feed, or add an endpoint that ingests
  live sensor pushes into `DispatcherBin.current_fill_pct`.
- **Real training photos**: point `load_real_dataset()` in
  `app/ml/train_all.py` (vision section) at a real labeled photo set and
  rerun `python3 -m app.ml.train_all` — the model architecture and API
  endpoints don't need to change.
- **Real historical fill/overflow logs**: replace the synthetic label
  generators in `train_overflow_engine()` / `train_dispatcher()` with real
  historical records and retrain.

## Deployment

This is a stateless FastAPI app (SQLite file + model artifacts on disk), so
it deploys to any container host:

**Render / Railway / Fly.io** — connect the repo, set the start command to
`uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and set
`requirements.txt` as the build spec. A `Dockerfile` is included below if
your platform wants one.

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Important**: SQLite's file (`app/data/app.db`) won't survive a redeploy on
most platforms' ephemeral filesystems. For anything beyond a demo, swap
`DATABASE_URL` in `app/database.py` for a managed Postgres instance (Render,
Railway, and Supabase all offer one) — the SQLAlchemy models don't need to
change, just the connection string.

Once deployed, update the frontend's `VITE_API_BASE_URL` to point at your
backend's public URL, and tighten `allow_origins` in `app/main.py` from `"*"`
to your actual frontend origin.
