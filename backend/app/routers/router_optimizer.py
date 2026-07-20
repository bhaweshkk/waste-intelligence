import math
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from fastapi import Depends
from ortools.constraint_solver import routing_enums_pb2, pywrapcp

from app.database import get_db
from app.models_db import RouterBin

router = APIRouter(prefix="/api/router", tags=["router"])

DEPOT = {"id": "DEPOT", "lat": 19.0760, "lon": 72.8777, "label": "Municipal Yard"}


class SolveRequest(BaseModel):
    threshold: float = 80
    n_trucks: int = 3
    max_stops_per_truck: int = 10


def haversine_km(a, b):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(math.radians, [a["lat"], a["lon"], b["lat"], b["lon"]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def build_distance_matrix(nodes):
    n = len(nodes)
    mat = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i != j:
                mat[i][j] = int(round(haversine_km(nodes[i], nodes[j]) * 1000))
    return mat


def solve_cvrp(filtered_bins, n_trucks, max_stops):
    """Real Google OR-Tools solve — runs fresh for whatever bins/params
    the request sends, not looked up from a fixed set of scenarios."""
    nodes = [DEPOT] + filtered_bins
    n = len(nodes)
    if n_trucks < 1 or n < 2:
        return {"status": "NO_BINS", "routes": [], "total_distance_km": 0, "n_trucks_used": 0}

    dist_matrix = build_distance_matrix(nodes)
    manager = pywrapcp.RoutingIndexManager(n, n_trucks, 0)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        return dist_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    transit_idx = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_idx)

    def demand_callback(from_index):
        return 0 if manager.IndexToNode(from_index) == 0 else 1

    demand_idx = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(demand_idx, 0, [max_stops] * n_trucks, True, "Capacity")

    routing.AddDimension(transit_idx, 0, 200_000_000, True, "Distance")
    routing.GetDimensionOrDie("Distance").SetGlobalSpanCostCoefficient(100)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromSeconds(2)

    solution = routing.SolveWithParameters(params)
    if solution is None:
        return {"status": "INFEASIBLE", "routes": [], "total_distance_km": 0, "n_trucks_used": 0}

    routes, total_m = [], 0
    for v in range(n_trucks):
        index = routing.Start(v)
        stops, dist_m = [], 0
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node != 0:
                stops.append(nodes[node]["id"])
            prev = index
            index = solution.Value(routing.NextVar(index))
            dist_m += routing.GetArcCostForVehicle(prev, index, v)
        if stops:
            routes.append({"truck": f"Truck-{v + 1}", "stops": stops, "distance_km": round(dist_m / 1000, 2)})
        total_m += dist_m

    status_map = {0: "NOT_SOLVED", 1: "SUCCESS", 2: "FAIL", 3: "FAIL_TIMEOUT", 4: "INVALID"}
    return {"status": status_map.get(routing.status(), str(routing.status())), "routes": routes,
            "total_distance_km": round(total_m / 1000, 2), "n_trucks_used": len(routes)}


@router.get("/bins")
def list_bins(db: Session = Depends(get_db)):
    bins = db.query(RouterBin).all()
    return {"depot": DEPOT, "bins": [{"id": b.bin_id, "lat": b.lat, "lon": b.lon, "fill_pct": b.fill_pct} for b in bins]}


@router.post("/solve")
def solve(req: SolveRequest, db: Session = Depends(get_db)):
    bins = db.query(RouterBin).filter(RouterBin.fill_pct >= req.threshold).all()
    filtered = [{"id": b.bin_id, "lat": b.lat, "lon": b.lon} for b in bins]
    if not filtered:
        return {"status": "NO_BINS", "routes": [], "total_distance_km": 0, "n_trucks_used": 0, "n_bins_filtered": 0}
    result = solve_cvrp(filtered, req.n_trucks, req.max_stops_per_truck)
    result["n_bins_filtered"] = len(filtered)
    return result
