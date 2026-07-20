from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
import numpy as np

from app.database import get_db
from app.models_db import WitsCityYear

router = APIRouter(prefix="/api/wits", tags=["wits"])


def linreg(points):
    n = len(points)
    sumX = sum(p[0] for p in points)
    sumY = sum(p[1] for p in points)
    sumXY = sum(p[0] * p[1] for p in points)
    sumXX = sum(p[0] * p[0] for p in points)
    denom = n * sumXX - sumX * sumX
    slope = (n * sumXY - sumX * sumY) / denom if denom else 0
    intercept = (sumY - slope * sumX) / n
    meanY = sumY / n
    ssTot = sum((p[1] - meanY) ** 2 for p in points)
    ssRes = sum((p[1] - (slope * p[0] + intercept)) ** 2 for p in points)
    r2 = max(0, 1 - ssRes / ssTot) if ssTot else 0
    return slope, intercept, r2


def tier_of(rate):
    if rate < 40: return {"key": "Critical", "rank": 0, "color": "#E8604C"}
    if rate < 60: return {"key": "Watch", "rank": 1, "color": "#F2B84B"}
    if rate < 75: return {"key": "Stable", "rank": 2, "color": "#38B6A6"}
    return {"key": "Lead", "rank": 3, "color": "#34D399"}


@router.get("/cities")
def list_cities(db: Session = Depends(get_db)):
    """Real per-city trend regression + hazard anomaly detection,
    computed live against whatever is currently in the database."""
    cities = [c[0] for c in db.query(WitsCityYear.city).distinct().all()]
    all_rows = db.query(WitsCityYear).all()
    all_ratios = [r.hazardous_tons / r.total_tons for r in all_rows if r.total_tons > 0]
    global_mean = float(np.mean(all_ratios)) if all_ratios else 0
    global_std = float(np.std(all_ratios)) if all_ratios else 0

    results = []
    for city in cities:
        rows = db.query(WitsCityYear).filter(WitsCityYear.city == city).order_by(WitsCityYear.year).all()
        if not rows:
            continue
        points = [(i, r.avg_recycling_rate) for i, r in enumerate(rows)]
        slope, intercept, r2 = linreg(points)
        latest = rows[-1]
        predicted_rate = max(0, min(100, slope * len(rows) + intercept))
        current_tier = tier_of(latest.avg_recycling_rate)
        predicted_tier = tier_of(predicted_rate)
        trend = "Improving" if slope > 0.8 else "Declining" if slope < -0.8 else "Flat"
        confidence = round(max(40, min(97, 40 + 55 * r2)))
        early_warning = predicted_tier["rank"] < current_tier["rank"]

        ratios = [r.hazardous_tons / r.total_tons if r.total_tons > 0 else 0 for r in rows]
        ratio_mean, ratio_std = float(np.mean(ratios)), float(np.std(ratios))
        latest_ratio = ratios[-1]
        z = (latest_ratio - ratio_mean) / ratio_std if ratio_std else 0
        hazard_flag = z > 1.0 or latest_ratio > global_mean + global_std

        results.append({
            "city": city, "latestRate": latest.avg_recycling_rate, "latestYear": latest.year,
            "currentTier": current_tier, "predictedRate": round(predicted_rate, 1), "predictedTier": predicted_tier,
            "trend": trend, "slope": round(slope, 2), "confidencePct": confidence, "earlyWarning": early_warning,
            "hazardFlag": hazard_flag, "hazardZ": round(z, 2), "latestRatio": round(latest_ratio, 4),
            "popDensity": latest.pop_density,
            "series": [{"year": r.year, "actual": r.avg_recycling_rate} for r in rows],
        })
    results.sort(key=lambda r: (r["currentTier"]["rank"], r["latestRate"]))
    return results


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    avg = db.query(func.avg(WitsCityYear.avg_recycling_rate)).scalar()
    n_cities = db.query(WitsCityYear.city).distinct().count()
    n_records = db.query(WitsCityYear).count()
    return {"datasetAvgRate": round(avg or 0, 1), "cityCount": n_cities, "recordCount": n_records}
