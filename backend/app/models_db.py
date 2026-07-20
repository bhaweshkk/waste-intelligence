import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text
from app.database import Base


class CitizenReport(Base):
    __tablename__ = "citizen_reports"
    id = Column(Integer, primary_key=True, index=True)
    photo_data_url = Column(Text, nullable=True)
    severity = Column(String, nullable=False)
    note = Column(String, default="")
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    score = Column(Float, nullable=False)
    tier = Column(String, nullable=False)
    cluster_count = Column(Integer, default=0)
    status = Column(String, default="Pending")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    collected_at = Column(DateTime, nullable=True)


class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"
    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False)  # supply | demand
    company = Column(String, nullable=False)
    material = Column(String, nullable=False)
    category = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    city = Column(String, nullable=False)
    price_per_unit = Column(Float, default=0)
    email = Column(String, nullable=False)
    notes = Column(String, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DispatcherBin(Base):
    __tablename__ = "dispatcher_bins"
    id = Column(Integer, primary_key=True, index=True)
    bin_id = Column(String, unique=True, index=True)
    city = Column(String, nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    bin_type = Column(String, nullable=False)
    capacity_l = Column(Integer, nullable=False)
    current_fill_pct = Column(Float, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


class RouterBin(Base):
    __tablename__ = "router_bins"
    id = Column(Integer, primary_key=True, index=True)
    bin_id = Column(String, unique=True, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    fill_pct = Column(Float, nullable=False)


class OpenDataRecord(Base):
    __tablename__ = "open_data_records"
    id = Column(Integer, primary_key=True, index=True)
    city = Column(String, nullable=False)
    waste_type = Column(String, nullable=False)
    year = Column(Integer, nullable=False)
    tons_per_day = Column(Float, nullable=False)
    recycling_rate_pct = Column(Float, nullable=False)
    source = Column(String, nullable=False)


class WitsCityYear(Base):
    __tablename__ = "wits_city_year"
    id = Column(Integer, primary_key=True, index=True)
    city = Column(String, nullable=False, index=True)
    year = Column(Integer, nullable=False)
    avg_recycling_rate = Column(Float, nullable=False)
    total_tons = Column(Float, nullable=False)
    hazardous_tons = Column(Float, nullable=False)
    pop_density = Column(Float, nullable=True)
