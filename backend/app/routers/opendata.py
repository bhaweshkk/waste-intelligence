import csv
import io
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models_db import OpenDataRecord

router = APIRouter(prefix="/api/opendata", tags=["opendata"])


@router.get("/sources")
def sources(db: Session = Depends(get_db)):
    rows = db.query(OpenDataRecord).all()
    by_source = {}
    for r in rows:
        by_source.setdefault(r.source, 0)
        by_source[r.source] += 1
    return {"total_records": len(rows), "sources": by_source}


@router.get("/cities")
def cities(db: Session = Depends(get_db)):
    rows = db.query(OpenDataRecord).all()
    by_city = {}
    for r in rows:
        by_city.setdefault(r.city, {"records": 0, "sources": set()})
        by_city[r.city]["records"] += 1
        by_city[r.city]["sources"].add(r.source)
    out = [{"city": c, "records": v["records"], "sources": sorted(v["sources"])} for c, v in sorted(by_city.items())]
    return {"count": len(out), "cities": out}


@router.get("/waste")
def waste(city: str | None = None, waste_type: str | None = None, year_from: int | None = None,
           year_to: int | None = None, source: str | None = None, format: str = "json",
           page: int = 1, per_page: int = 50, db: Session = Depends(get_db)):
    q = db.query(OpenDataRecord)
    if city: q = q.filter(OpenDataRecord.city.ilike(city))
    if waste_type: q = q.filter(OpenDataRecord.waste_type.ilike(waste_type))
    if year_from: q = q.filter(OpenDataRecord.year >= year_from)
    if year_to: q = q.filter(OpenDataRecord.year <= year_to)
    if source: q = q.filter(OpenDataRecord.source == source)

    total = q.count()
    per_page = min(per_page, 500)
    rows = q.offset((page - 1) * per_page).limit(per_page).all()
    records = [{"city": r.city, "waste_type": r.waste_type, "year": r.year, "tons_per_day": r.tons_per_day,
                "recycling_rate_pct": r.recycling_rate_pct, "source": r.source} for r in rows]

    if format == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["city", "waste_type", "year", "tons_per_day", "recycling_rate_pct", "source"])
        writer.writeheader()
        writer.writerows(records)
        return Response(buf.getvalue(), media_type="text/csv")

    return {"total": total, "page": page, "per_page": per_page, "results": records}


@router.get("/summary")
def summary(city: str | None = None, db: Session = Depends(get_db)):
    q = db.query(OpenDataRecord)
    if city:
        q = q.filter(OpenDataRecord.city.ilike(city))
    rows = q.all()
    if not rows:
        return {"error": "no matching records"}
    avg_rate = round(sum(r.recycling_rate_pct for r in rows) / len(rows), 2)
    total_tons = round(sum(r.tons_per_day for r in rows), 2)
    by_year = {}
    for r in rows:
        by_year.setdefault(r.year, []).append(r.recycling_rate_pct)
    trend = [{"year": y, "avg_recycling_rate_pct": round(sum(v) / len(v), 2)} for y, v in sorted(by_year.items())]
    return {"city": city or "ALL", "record_count": len(rows), "avg_recycling_rate_pct": avg_rate,
            "total_tons_per_day": total_tons, "trend_by_year": trend}
