from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models_db import MarketplaceListing

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


class ListingCreate(BaseModel):
    type: str  # supply | demand
    company: str
    material: str
    category: str
    quantity: float
    unit: str
    city: str
    price_per_unit: float = 0
    email: str
    notes: str = ""


def normalize_qty(qty, unit):
    return qty * 1000 if unit.lower() == "tons" else qty


def score_match(a: MarketplaceListing, b: MarketplaceListing):
    if a.type == b.type:
        return 0
    score = 0
    if a.category == b.category:
        score += 55
    elif b.category.split(" ")[0].lower() in a.category.lower():
        score += 25
    else:
        return 0
    if a.city.strip().lower() == b.city.strip().lower():
        score += 25
    if a.unit == b.unit:
        qa, qb = normalize_qty(a.quantity, a.unit), normalize_qty(b.quantity, b.unit)
        ratio = min(qa, qb) / max(qa, qb) if max(qa, qb) else 0
        score += round(ratio * 20)
    else:
        score += 8
    return min(100, score)


@router.get("/listings")
def list_listings(type: str | None = None, category: str | None = None, q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(MarketplaceListing)
    if type:
        query = query.filter(MarketplaceListing.type == type)
    if category:
        query = query.filter(MarketplaceListing.category == category)
    listings = query.order_by(MarketplaceListing.created_at.desc()).all()
    if q:
        ql = q.lower()
        listings = [l for l in listings if ql in l.material.lower() or ql in l.company.lower() or ql in l.city.lower()]
    return [_serialize(l) for l in listings]


@router.post("/listings")
def create_listing(payload: ListingCreate, db: Session = Depends(get_db)):
    listing = MarketplaceListing(**payload.dict())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return _serialize(listing)


@router.delete("/listings/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.query(MarketplaceListing).get(listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    db.delete(listing)
    db.commit()
    return {"deleted": True}


@router.get("/listings/{listing_id}/matches")
def get_matches(listing_id: int, db: Session = Depends(get_db)):
    """Real matching engine, computed fresh against the current DB state
    every time — not a cached or precomputed pairing."""
    listing = db.query(MarketplaceListing).get(listing_id)
    if not listing:
        raise HTTPException(404, "Listing not found")
    opposite = db.query(MarketplaceListing).filter(MarketplaceListing.type != listing.type).all()
    scored = [{"listing": _serialize(o), "score": score_match(listing, o)} for o in opposite]
    scored = [m for m in scored if m["score"] > 0]
    scored.sort(key=lambda m: -m["score"])
    return scored


def _serialize(l: MarketplaceListing):
    return {
        "id": l.id, "type": l.type, "company": l.company, "material": l.material, "category": l.category,
        "quantity": l.quantity, "unit": l.unit, "city": l.city, "pricePerUnit": l.price_per_unit,
        "email": l.email, "notes": l.notes, "createdAt": l.created_at.isoformat() if l.created_at else None,
    }
