import math
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from fastapi import Depends
import pandas as pd

from app.database import get_db
from app.models_db import DispatcherBin
from app.ml.registry import get_dispatcher_model

router = APIRouter(prefix="/api/dispatcher", tags=["dispatcher"])


class DispatchScenario(BaseModel):
    next_day_of_week: int = 2
    next_is_weekend: bool = False
    next_is_holiday: bool = False
    next_weather: str = "Normal"
    next_temp_c: float = 27
    next_rainfall_mm: float = 0
    next_event_flag: bool = False
    city: str | None = None
    risk_threshold: float = 55.0


def haversine_km(a, b):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def nearest_neighbor_route(depot, stops):
    remaining = stops[:]
    route, current, total_km = [], depot, 0.0
    while remaining:
        dists = [haversine_km(current, (s["lat"], s["lon"])) for s in remaining]
        j = min(range(len(dists)), key=lambda i: dists[i])
        total_km += dists[j]
        current = (remaining[j]["lat"], remaining[j]["lon"])
        route.append(remaining.pop(j))
    return route, round(total_km, 2)


def risk_score(pred_fill_pct):
    x = pred_fill_pct / 100
    return round(min(100, 100 * (x ** 1.8) * 1.6), 1)


DEPOTS = {"Mumbai": (19.06, 72.87), "Delhi": (28.60, 77.19), "Bengaluru": (12.96, 77.58)}


@router.get("/bins")
def list_bins(db: Session = Depends(get_db)):
    bins = db.query(DispatcherBin).all()
    return [{"bin_id": b.bin_id, "city": b.city, "lat": b.lat, "lon": b.lon, "bin_type": b.bin_type,
             "capacity_l": b.capacity_l, "current_fill_pct": b.current_fill_pct} for b in bins]


@router.get("/metrics")
def metrics():
    _, meta = get_dispatcher_model()
    return meta["metrics"]


@router.post("/predict-scenario")
def predict_scenario(scenario: DispatchScenario, db: Session = Depends(get_db)):
    """Real live inference across every bin's CURRENT stored fill level —
    any city/weather/threshold combination, not a fixed scenario list."""
    reg, meta = get_dispatcher_model()
    q = db.query(DispatcherBin)
    if scenario.city:
        q = q.filter(DispatcherBin.city == scenario.city)
    bins = q.all()
    if not bins:
        raise HTTPException(404, "No bins found for this city")

    rows = pd.DataFrame([{
        "fill_pct": b.current_fill_pct, "next_day_of_week": scenario.next_day_of_week,
        "next_is_weekend": int(scenario.next_is_weekend), "next_is_holiday": int(scenario.next_is_holiday),
        "next_temp_c": scenario.next_temp_c, "next_rainfall_mm": scenario.next_rainfall_mm,
        "next_event_flag": int(scenario.next_event_flag), "capacity_l": b.capacity_l,
        "bin_type": b.bin_type, "next_weather": scenario.next_weather,
    } for b in bins])
    preds = reg.predict(rows)

    results = []
    for b, pred in zip(bins, preds):
        results.append({
            "bin_id": b.bin_id, "city": b.city, "lat": b.lat, "lon": b.lon, "bin_type": b.bin_type,
            "capacity_l": b.capacity_l, "current_fill_pct": b.current_fill_pct,
            "predicted_fill_pct": round(float(pred), 1), "risk_score": risk_score(float(pred)),
        })
    results.sort(key=lambda r: -r["risk_score"])

    routes = {}
    for city, depot in DEPOTS.items():
        city_bins = [r for r in results if r["city"] == city and r["risk_score"] >= scenario.risk_threshold][:10]
        if city_bins:
            route, total_km = nearest_neighbor_route(depot, [dict(b) for b in city_bins])
            routes[city] = {"stops": [b["bin_id"] for b in route], "total_km": total_km, "depot": depot}
        else:
            routes[city] = {"stops": [], "total_km": 0.0, "depot": depot}

    return {"bins": results, "routes": routes}
