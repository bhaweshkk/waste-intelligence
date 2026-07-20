from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd

from app.ml.registry import get_overflow_models

router = APIRouter(prefix="/api/overflow", tags=["overflow"])


class OverflowRequest(BaseModel):
    sector: str
    day_of_week: int = 2
    is_weekend: bool = False
    is_holiday: bool = False
    weather: str = "Normal"
    temp_c: float = 27
    rainfall_mm: float = 0
    event_flag: bool = False


class OverflowScenarioRequest(BaseModel):
    day_of_week: int = 2
    is_weekend: bool = False
    is_holiday: bool = False
    weather: str = "Normal"
    temp_c: float = 27
    rainfall_mm: float = 0
    event_flag: bool = False


@router.get("/sectors")
def list_sectors():
    _, _, meta = get_overflow_models()
    return {"sectors": meta["sectors"], "weather_options": meta["weather_options"]}


@router.get("/metrics")
def get_metrics():
    _, _, meta = get_overflow_models()
    return meta["metrics"]


@router.post("/predict")
def predict(req: OverflowRequest):
    reg, clf, meta = get_overflow_models()
    if req.sector not in meta["sectors"]:
        raise HTTPException(400, f"Unknown sector '{req.sector}'. Try one of: {meta['sectors'][:5]}...")

    row = pd.DataFrame([{
        "day_of_week": req.day_of_week, "is_weekend": int(req.is_weekend), "is_holiday": int(req.is_holiday),
        "temp_c": req.temp_c, "rainfall_mm": req.rainfall_mm, "event_flag": int(req.event_flag),
        "sector": req.sector, "weather": req.weather,
    }])
    # REAL model inference — this exact (sector, weather, day) combination
    # was very likely never precomputed anywhere; it's scored live.
    pred_hours = float(reg.predict(row)[0])
    pred_tier = str(clf.predict(row)[0])
    tier_probs = clf.predict_proba(row)[0]
    confidence = float(max(tier_probs))

    return {
        "sector": req.sector,
        "predicted_hours_to_overflow": round(pred_hours, 1),
        "predicted_risk_tier": pred_tier,
        "confidence": round(confidence, 3),
        "inputs_used": req.dict(),
    }


@router.post("/predict-all-sectors")
def predict_all_sectors(req: OverflowScenarioRequest):
    """Same live scenario, scored across every sector at once — this is
    what powers the ranked risk view, computed on demand."""
    reg, clf, meta = get_overflow_models()
    rows = pd.DataFrame([{
        "day_of_week": req.day_of_week, "is_weekend": int(req.is_weekend), "is_holiday": int(req.is_holiday),
        "temp_c": req.temp_c, "rainfall_mm": req.rainfall_mm, "event_flag": int(req.event_flag),
        "sector": s, "weather": req.weather,
    } for s in meta["sectors"]])
    hours = reg.predict(rows)
    tiers = clf.predict(rows)
    results = [
        {"sector": s, "predicted_hours_to_overflow": round(float(h), 1), "predicted_risk_tier": str(t)}
        for s, h, t in zip(meta["sectors"], hours, tiers)
    ]
    results.sort(key=lambda r: r["predicted_hours_to_overflow"])
    return {"scenario": req.dict(), "results": results}
