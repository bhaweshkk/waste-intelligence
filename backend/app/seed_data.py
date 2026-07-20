"""Populates the database on first run. Uses the real WITS dataset for
city/open-data records; bins are seeded as a realistic mock network
(documented as such) since no live IoT bin-sensor feed exists yet —
see the README for how to point this at a real feed."""
import os
import re
import csv
import json
import random
from collections import defaultdict

import numpy as np
import openpyxl

from app.database import Base, engine, SessionLocal
from app.models_db import WitsCityYear, OpenDataRecord, DispatcherBin, RouterBin

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
XLSX_PATH = os.path.join(DATA_DIR, "wits_dataset.xlsx")

random.seed(5)
np.random.seed(5)


def load_raw_rows():
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True)
    ws = wb["Cleaned Data"]
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    cols = ["City", "WasteType", "Tons", "RecyclingRate", "PopDensity", "EffScore",
            "Disposal", "Cost", "Campaigns", "Landfill", "LandfillCap", "Year", "Lat", "Lon"]
    return [dict(zip(cols, r)) for r in rows]


def seed_wits(db, raw_rows):
    if db.query(WitsCityYear).count() > 0:
        return
    agg = defaultdict(lambda: {"rates": [], "total": 0.0, "haz": 0.0, "pop": None})
    for r in raw_rows:
        key = (r["City"], r["Year"])
        a = agg[key]
        a["rates"].append(r["RecyclingRate"])
        a["total"] += r["Tons"]
        if r["WasteType"] == "Hazardous":
            a["haz"] += r["Tons"]
        a["pop"] = r["PopDensity"]
    for (city, year), a in agg.items():
        db.add(WitsCityYear(city=city, year=int(year), avg_recycling_rate=round(sum(a["rates"]) / len(a["rates"]), 2),
                             total_tons=round(a["total"], 1), hazardous_tons=round(a["haz"], 1), pop_density=a["pop"]))
    db.commit()
    print(f"[seed] WITS: {db.query(WitsCityYear).count()} city-year rows")


def fiscal_year_to_calendar(fy):
    m = re.search(r"FY(\d{4})-(\d{2})", fy)
    if not m:
        return None
    start = int(m.group(1))
    end_suffix = int(m.group(2))
    century = start - (start % 100)
    end = century + end_suffix
    return end if end >= start else end + 100


def seed_opendata(db, raw_rows):
    if db.query(OpenDataRecord).count() > 0:
        return
    # Portal A: native format (already close to canonical)
    for r in raw_rows:
        db.add(OpenDataRecord(city=r["City"].strip(), waste_type=r["WasteType"].strip(), year=int(r["Year"]),
                               tons_per_day=round(float(r["Tons"]), 2), recycling_rate_pct=round(float(r["RecyclingRate"]), 1),
                               source="nagarpalika_open_data"))
    # Portal B: simulate a JSON/kg/quarter export from the 2023 subset
    subset_b = [r for r in raw_rows if r["Year"] == 2023]
    for r in subset_b:
        db.add(OpenDataRecord(city=r["City"].strip(), waste_type=r["WasteType"].strip(), year=2023,
                               tons_per_day=round(r["Tons"] * 1000 / 1000, 2), recycling_rate_pct=round(r["RecyclingRate"], 1),
                               source="swachh_dashboard_api"))
    # Portal C: simulate a CSV/fiscal-year export from the 2021 subset
    subset_c = [r for r in raw_rows if r["Year"] == 2021]
    for r in subset_c:
        year = fiscal_year_to_calendar("FY2020-21")
        db.add(OpenDataRecord(city=r["City"].strip(), waste_type=r["WasteType"].strip(), year=year,
                               tons_per_day=round(r["Tons"], 2), recycling_rate_pct=round(r["RecyclingRate"], 1),
                               source="municipal_ward_csv"))
    db.commit()
    print(f"[seed] OpenData: {db.query(OpenDataRecord).count()} records")


def seed_dispatcher_bins(db):
    if db.query(DispatcherBin).count() > 0:
        return
    city_centers = {"Mumbai": (19.0760, 72.8777), "Delhi": (28.6139, 77.2090), "Bengaluru": (12.9716, 77.5946)}
    bin_types = ["General", "Recycling", "Organic"]
    capacities = {"General": 1100, "Recycling": 660, "Organic": 240}
    i = 0
    for city, (lat0, lon0) in city_centers.items():
        for _ in range(45):
            btype = random.choices(bin_types, weights=[0.5, 0.3, 0.2])[0]
            db.add(DispatcherBin(
                bin_id=f"BIN-{i:04d}", city=city, lat=round(lat0 + np.random.uniform(-0.027, 0.027), 5),
                lon=round(lon0 + np.random.uniform(-0.027, 0.027), 5), bin_type=btype, capacity_l=capacities[btype],
                current_fill_pct=round(float(np.random.uniform(10, 95)), 1),
            ))
            i += 1
    db.commit()
    print(f"[seed] Dispatcher bins: {db.query(DispatcherBin).count()}")


def seed_router_bins(db):
    if db.query(RouterBin).count() > 0:
        return
    depot = (19.0760, 72.8777)
    for i in range(70):
        lat = depot[0] + np.random.uniform(-0.05, 0.05)
        lon = depot[1] + np.random.uniform(-0.05, 0.05)
        fill = float(np.clip(np.random.beta(2.2, 1.6) * 100, 2, 100))
        db.add(RouterBin(bin_id=f"RBIN-{i:03d}", lat=round(lat, 5), lon=round(lon, 5), fill_pct=round(fill, 1)))
    db.commit()
    print(f"[seed] Router bins: {db.query(RouterBin).count()}")


def run_seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        raw_rows = load_raw_rows()
        seed_wits(db, raw_rows)
        seed_opendata(db, raw_rows)
        seed_dispatcher_bins(db)
        seed_router_bins(db)
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
