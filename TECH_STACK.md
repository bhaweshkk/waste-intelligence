# Waste Intelligence Suite — Complete Tech Stack & Architecture

A reference document covering everything used to build this project: languages, frameworks, libraries, ML models, database, algorithms, and deployment.

---

## 1. High-Level Architecture

```
┌─────────────────────┐         HTTP/JSON          ┌──────────────────────┐
│   React Frontend     │ ───────────────────────►  │   FastAPI Backend     │
│   (Vite, port 5173)  │ ◄───────────────────────  │   (Uvicorn, port 8000)│
└─────────────────────┘                             └───────────┬──────────┘
                                                                  │
                                    ┌─────────────────────────────┼─────────────────────────────┐
                                    │                              │                              │
                            ┌───────▼────────┐          ┌─────────▼────────┐          ┌──────────▼─────────┐
                            │  SQLite DB       │          │  Trained Models    │          │  Google OR-Tools     │
                            │  (SQLAlchemy)    │          │  (loaded once at   │          │  (solved on demand)  │
                            │                  │          │   startup)         │          │                      │
                            └──────────────────┘          └────────────────────┘          └──────────────────────┘
```

Standard client-server split: a static frontend that never touches data directly, and a backend that owns all computation, persistence, and model inference. No business logic lives in embedded JSON or browser storage.

---

## 2. Backend Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Language | Python | 3.11 | |
| Web framework | **FastAPI** | 0.115 | Async REST API, automatic OpenAPI docs at `/docs` |
| ASGI server | **Uvicorn** | 0.30 | Runs the FastAPI app |
| ORM | **SQLAlchemy** | 2.0 | Database models + query layer |
| Database | **SQLite** | (stdlib) | File-based relational DB (`app/data/app.db`) |
| Validation | **Pydantic** | 2.9 | Request/response schema validation (built into FastAPI) |
| File uploads | **python-multipart** | 0.0.9 | Handles image upload form-data |
| Data wrangling | **pandas**, **numpy** | 2.2 / 1.26 | Feature engineering for ML inference |
| Spreadsheet reading | **openpyxl** | 3.1 | Reads the source `.xlsx` waste dataset |
| Classical ML | **scikit-learn** | 1.5 | RandomForest models |
| Model serialization | **joblib** | 1.4 | Saves/loads the scikit-learn pipelines |
| Deep learning | **TensorFlow / Keras** (CPU) | 2.17 | CNN training + inference |
| Image processing | **Pillow (PIL)** | 10.4 | Image decode/resize for CNN input |
| Combinatorial optimization | **Google OR-Tools** | 9.11 (`constraint_solver`) | Vehicle Routing Problem (CVRP) solver |

**Why FastAPI over Flask:** async support, automatic request validation via Pydantic, and free interactive API docs — relevant once there are 9 tools' worth of endpoints to keep straight.

---

## 3. Frontend Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Build tool | **Vite** | 5.4 | Dev server + production bundler |
| UI library | **React** | 18.3 | Component model, hooks |
| Routing | **react-router-dom** | 6.26 (`HashRouter`) | Client-side navigation between the 9 tools |
| Charts | **Recharts** | 2.12 | Line/bar charts (WITS trend, feature importance) |
| Icons | **lucide-react** | 0.383 | Icon set used throughout |
| Styling | Plain CSS (`styles.css`) + inline styles | — | No CSS framework; hand-written design system with CSS custom properties |
| Fonts | **IBM Plex Sans / IBM Plex Mono** | — | Loaded via Google Fonts |
| HTTP client | Native `fetch()` | — | Wrapped in a small `api.js` client, no axios dependency |

**Why no CSS framework:** a small, purpose-built set of reusable classes (`.panel`, `.chip`, `.btn`, `.input`) covers everything 9 dashboard-style pages need, without pulling in Tailwind's build step for a project this size.

**Why HashRouter over BrowserRouter:** works correctly when served from a static file host or subpath with zero server-side routing configuration required.

---

## 4. The Database (SQLite via SQLAlchemy)

Six tables, created automatically on first run (`Base.metadata.create_all`):

| Table | Rows (seeded) | Purpose |
|---|---|---|
| `wits_city_year` | 170 | Real waste dataset, aggregated to city×year (recycling rate, tonnage, hazardous tonnage) |
| `open_data_records` | 1,190 | The same dataset re-ingested through 3 differently-shaped mock "portal" formats and standardized into one schema |
| `dispatcher_bins` | 135 | Mock bin network (45 bins × 3 cities) with live-updatable fill levels |
| `router_bins` | 70 | Separate mock bin network for the route-optimizer demo |
| `citizen_reports` | grows at runtime | User-submitted bin-overflow reports (photo, GPS, severity, computed priority score) |
| `marketplace_listings` | grows at runtime | Supply/demand waste-material listings |

Real primary keys, foreign-key-free simple schema (each tool owns its table), timestamps on mutable records.

---

## 5. The Machine Learning / Deep Learning

Trained once via `python -m app.ml.train_all`, saved as loadable artifacts, loaded into memory at server startup (`app/ml/registry.py`), and queried live per-request — not precomputed.

### 5.1 Predictive Overflow Engine
- **Model:** `RandomForestRegressor` + `RandomForestClassifier` (scikit-learn), 100 trees, max depth 9
- **Pipeline:** `ColumnTransformer` (one-hot encode sector + weather) → `RandomForest`
- **Features:** day of week, weekend flag, holiday flag, temperature, rainfall, local-event flag, sector, weather condition
- **Target:** hours-to-overflow (regression) + risk tier Critical/High/Medium/Low (classification)
- **Training data:** 9,000 synthetic labeled rows, generated with documented effect sizes (weekends -25% hours, holidays -30%, rain -15%, etc.), sector baseline derived from real dataset volume
- **Measured performance:** MAE 2.90 hours, R² 0.613, tier accuracy 68%

### 5.2 Predictive Dispatcher
- **Model:** `RandomForestRegressor`, 100 trees, max depth 10
- **Features:** current fill %, tomorrow's day-of-week/weekend/holiday/weather/temp/rainfall/event flag, bin capacity, bin type
- **Target:** next-day fill percentage
- **Training data:** a full simulated year (365 days × 60 bins) of sawtooth fill-and-collect history
- **Measured performance:** MAE 8.75 percentage points, R² 0.653
- **Companion algorithm:** real nearest-neighbor route construction (haversine distance) over the model's own risk-ranked bins

### 5.3 Waste Typology Estimator
- **Model:** Keras CNN, 3 convolutional blocks (16→32→64 filters) + dense head, **two output heads**: fill-fraction (regression, sigmoid) and dominant-material (5-way softmax: Plastic/Organic/Metal/Cardboard/Mixed)
- **Input:** 80×80 RGB image
- **Training data:** 2,600 procedurally generated synthetic top-down dumpster images (documented visual signatures per material — color palettes, blob textures, glare speckles)
- **Measured performance:** fill MAE 0.144 (14.4 percentage points), material accuracy 81.8%
- **Downstream calc:** predicted fill × dumpster volume × material bulk-density lookup → mass (kg) → × emission factor → CO₂e estimate

### 5.4 Contamination Detector
- **Model:** Keras CNN, **multi-input**: image branch (3 conv blocks) + a small dense branch for the bin's declared type, concatenated before two heads (contamination %, dominant contaminant class)
- **Input:** 80×80 RGB image + one-hot bin type (Paper/Plastic/Metal/Glass)
- **Training data:** 2,600 synthetic images, ~32% clean / rest with 1–2 wrong-material contaminants at 15–65% area
- **Measured performance:** contamination % MAE 14.6 points, contaminant-class accuracy 60%, **binary alert accuracy 80.5%** (the operationally meaningful number — contaminated vs. clean)

### 5.5 Dynamic Waste Router (not ML — classical operations research)
- **Solver:** Google OR-Tools `pywrapcp.RoutingModel`
- **Problem type:** Capacitated Vehicle Routing Problem (CVRP)
- **Configuration:** `PATH_CHEAPEST_ARC` initial solution strategy, `GUIDED_LOCAL_SEARCH` metaheuristic, 2-second time limit, capacity dimension (max stops/truck) + span-cost balancing so routes come out even instead of one truck taking everything
- **Distance metric:** haversine (real great-circle distance from lat/lon)

**Honesty note baked into the product itself:** every model page states plainly that training labels are documented synthetic data (no public bin-sensor feed or contamination-photo dataset was reachable from the build environment), with a marked path (`load_real_dataset()` stubs) for swapping in real data without touching the serving code.

---

## 6. Algorithms Implemented By Hand (no library)

| Algorithm | Where | Why hand-written |
|---|---|---|
| **EXIF/TIFF GPS parser** | Citizen Photo-to-Report (frontend) | Extracts real GPS coordinates from a JPEG's binary APP1 segment — walks the TIFF IFD structure manually rather than pulling in a library, verified against a real `piexif`-generated test image (accurate to ~2m) |
| **Haversine distance** | Dispatcher, Router, Citizen Report | Great-circle distance between lat/lon pairs, used for clustering and routing |
| **Nearest-neighbor route construction** | Dispatcher | Greedy TSP heuristic for the dispatch route |
| **Marketplace match scoring** | Marketplace | Weighted scoring: category match (55pts) + city match (25pts) + quantity-ratio fit (≤20pts) |
| **Linear regression (least squares)** | WITS Console | Per-city recycling-rate trend line, R² for confidence, computed server-side |
| **Fiscal-year string parsing** | Open Data API seed | Converts `"FY2020-21"`-style strings to a calendar year |

---

## 7. REST API Surface (FastAPI, prefix `/api`)

```
GET   /api/health

GET   /api/wits/cities
GET   /api/wits/summary

GET   /api/overflow/sectors
GET   /api/overflow/metrics
POST  /api/overflow/predict                  { sector, weather, ... }
POST  /api/overflow/predict-all-sectors       { weather, ... }

GET   /api/dispatcher/bins
GET   /api/dispatcher/metrics
POST  /api/dispatcher/predict-scenario        { city, weather, risk_threshold, ... }

POST  /api/typology/estimate                  multipart image upload
GET   /api/typology/metrics

POST  /api/contamination/scan                 multipart image + bin_type
GET   /api/contamination/metrics
GET   /api/contamination/bin-types

GET   /api/router/bins
POST  /api/router/solve                       { threshold, n_trucks, max_stops_per_truck }

GET    /api/citizen/reports
POST   /api/citizen/reports
PATCH  /api/citizen/reports/{id}/collect
DELETE /api/citizen/reports/{id}

GET    /api/marketplace/listings
POST   /api/marketplace/listings
DELETE /api/marketplace/listings/{id}
GET    /api/marketplace/listings/{id}/matches

GET   /api/opendata/sources
GET   /api/opendata/cities
GET   /api/opendata/waste           (supports ?format=csv)
GET   /api/opendata/summary
```

Auto-generated interactive docs at `/docs` (Swagger UI) and `/redoc`.

---

## 8. Frontend Project Structure

```
frontend/
├── index.html
├── vite.config.js
├── package.json
├── .env.example              # VITE_API_BASE_URL
└── src/
    ├── main.jsx               # React entry point
    ├── App.jsx                 # Router + sidebar shell, tool registry
    ├── api.js                  # Single fetch client, one function per endpoint
    ├── hooks.js                 # useApi() — shared loading/error/data state
    ├── styles.css                # Design system (CSS variables, .panel/.chip/.btn/.input)
    ├── components/
    │   └── Common.jsx            # <Loading/>, <ErrorBanner/>, <PageHeader/>
    └── pages/                    # One file per tool, 9 total
        ├── HomePage.jsx
        ├── WitsPage.jsx
        ├── CitizenReportPage.jsx
        ├── MarketplacePage.jsx
        ├── OverflowEnginePage.jsx
        ├── DispatcherPage.jsx
        ├── TypologyPage.jsx
        ├── ContaminationPage.jsx
        ├── OpenDataApiPage.jsx
        └── RouterPage.jsx
```

## 9. Backend Project Structure

```
backend/
├── requirements.txt
├── README.md
└── app/
    ├── main.py                   # FastAPI app, CORS, startup hooks, router mounting
    ├── database.py                # SQLAlchemy engine/session
    ├── models_db.py                 # ORM table definitions
    ├── seed_data.py                  # Populates DB from the real dataset + mock bin networks
    ├── data/
    │   └── wits_dataset.xlsx          # The real source dataset (850 records, 34 cities)
    ├── ml/
    │   ├── train_all.py                # Trains + saves all 4 models
    │   ├── registry.py                  # Loads artifacts once, serves them to routers
    │   └── artifacts/                    # Saved .joblib / .keras files + metrics JSON
    └── routers/                       # One file per tool's endpoints
        ├── wits.py, overflow.py, dispatcher.py, typology.py,
        ├── contamination.py, citizen.py, marketplace.py,
        └── opendata.py, router_optimizer.py
```

---

## 10. Design System (Frontend Visuals)

- **Palette:** dark theme, `#0A0D12` base background, per-tool accent colors (teal, violet, amber, red, blue, orange) carried over from the nav into each page's charts/badges
- **Typography:** IBM Plex Sans (UI text), IBM Plex Mono (numbers, code, IDs)
- **Depth cues:** layered box-shadows, `backdrop-filter: blur()` on the sidebar, gradient-bordered cards
- **Motion:** CSS keyframe animations for ambient background orbs, entrance fades, and loading spinners — all wrapped in `@media (prefers-reduced-motion: reduce)` guards

---

## 11. Deployment Path (documented, not yet hosted)

| Piece | Where it can go | Notes |
|---|---|---|
| Backend | Render / Railway / Fly.io / any Docker host | `Dockerfile` included in `backend/README.md`; needs the model artifacts (~27MB) shipped alongside the code |
| Database | SQLite file for demos; swap to managed Postgres for production | Only `DATABASE_URL` in `database.py` needs to change — SQLAlchemy models are portable |
| Frontend | Vercel / Netlify / Cloudflare Pages / static hosting on the backend itself | Fully static after `npm run build`; just needs `VITE_API_BASE_URL` pointed at the deployed backend |

**Not yet done:** actually deploying either piece to a public URL — this sandbox's network egress is restricted to package registries, so there's no way to stand up a publicly reachable server from here. Everything above was built and verified locally (real HTTP requests, real headless-browser end-to-end tests) but needs you to run the deploy step.

---

## 12. Testing Performed

Every claim of "real" in this project was checked, not assumed:
- Backend endpoints hit with `curl` while the server ran live, including varying scenario inputs to confirm predictions actually change (not cached/looked-up)
- CNN endpoints tested with a real generated JPEG, confirming correct material classification
- Frontend built with `vite build` and checked for compile errors
- Full end-to-end test with a **headless Chromium browser (Playwright)** driving the real frontend against the real running backend — navigation, live predictions, image upload, marketplace posting, and OR-Tools solving all exercised and confirmed working, catching and fixing two real bugs (a missing-field validation error and an overly slow solver timeout) in the process
