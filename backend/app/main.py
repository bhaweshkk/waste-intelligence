from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.seed_data import run_seed
from app.ml.registry import preload_all
from app.routers import wits, citizen, marketplace, overflow, dispatcher, typology, contamination, opendata, router_optimizer

app = FastAPI(title="Waste Intelligence Suite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your real frontend origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    run_seed()
    preload_all()
    print("Backend ready: DB seeded, all 4 models loaded for live inference.")


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(wits.router)
app.include_router(citizen.router)
app.include_router(marketplace.router)
app.include_router(overflow.router)
app.include_router(dispatcher.router)
app.include_router(typology.router)
app.include_router(contamination.router)
app.include_router(opendata.router)
app.include_router(router_optimizer.router)
