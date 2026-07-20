import math
import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models_db import CitizenReport

router = APIRouter(prefix="/api/citizen", tags=["citizen"])

SEVERITY_BASE = {"Overflowing": 68, "Nearly full": 42, "Partially full": 20}


def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlmb = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


class ReportCreate(BaseModel):
    photo_data_url: str | None = None
    severity: str
    note: str = ""
    lat: float
    lon: float


@router.get("/reports")
def list_reports(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(CitizenReport)
    if status and status != "All":
        q = q.filter(CitizenReport.status == status)
    reports = q.order_by(CitizenReport.score.desc()).all()
    return [_serialize(r) for r in reports]


@router.post("/reports")
def create_report(payload: ReportCreate, db: Session = Depends(get_db)):
    if payload.severity not in SEVERITY_BASE:
        raise HTTPException(400, f"severity must be one of {list(SEVERITY_BASE.keys())}")

    # real clustering: count existing PENDING reports within 150m, computed
    # against the actual database, not a static in-memory array
    pending = db.query(CitizenReport).filter(CitizenReport.status == "Pending").all()
    cluster_count = sum(
        1 for r in pending if haversine_m(payload.lat, payload.lon, r.lat, r.lon) <= 150
    )
    base = SEVERITY_BASE[payload.severity]
    score = max(0, min(100, base + min(cluster_count * 12, 30)))
    if score >= 80: tier = "Critical"
    elif score >= 55: tier = "High"
    elif score >= 30: tier = "Medium"
    else: tier = "Low"

    report = CitizenReport(
        photo_data_url=payload.photo_data_url, severity=payload.severity, note=payload.note,
        lat=payload.lat, lon=payload.lon, score=score, tier=tier, cluster_count=cluster_count, status="Pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _serialize(report)


@router.patch("/reports/{report_id}/collect")
def mark_collected(report_id: int, db: Session = Depends(get_db)):
    report = db.query(CitizenReport).get(report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    report.status = "Collected"
    report.collected_at = datetime.datetime.utcnow()
    db.commit()
    return _serialize(report)


@router.delete("/reports/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    report = db.query(CitizenReport).get(report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    db.delete(report)
    db.commit()
    return {"deleted": True}


def _serialize(r: CitizenReport):
    return {
        "id": r.id, "photo": r.photo_data_url, "severity": r.severity, "note": r.note,
        "coord": {"lat": r.lat, "lon": r.lon}, "score": r.score, "tier": r.tier,
        "clusterCount": r.cluster_count, "status": r.status,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }
