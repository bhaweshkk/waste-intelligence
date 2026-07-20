import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Truck, Filter, CheckCircle2, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

const TRUCK_COLORS = ["#4FA8E8", "#E8A33D", "#5FB88A", "#E8604C", "#B08CE0", "#4FD1C5"];

export default function RouterPage() {
  const { data: binData, loading: binsLoading, error: binsError } = useApi(() => api.routerBins(), []);
  const [threshold, setThreshold] = useState(80);
  const [nTrucks, setNTrucks] = useState(3);
  const [solution, setSolution] = useState(null);
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState(null);

  const solve = useCallback(async () => {
    setSolving(true); setError(null);
    try {
      const res = await api.routerSolve({ threshold, n_trucks: nTrucks, max_stops_per_truck: 10 });
      setSolution(res);
    } catch (e) { setError(e.message); } finally { setSolving(false); }
  }, [threshold, nTrucks]);

  useEffect(() => { solve(); }, [solve]);

  const binById = useMemo(() => {
    if (!binData) return {};
    return Object.fromEntries(binData.bins.map((b) => [b.id, b]));
  }, [binData]);

  return (
    <div>
      <PageHeader eyebrow="Real Solver" title="Dynamic Waste Router" desc="Filters live bin fill-levels above your threshold and solves a real Google OR-Tools vehicle-routing problem on the backend \u2014 fresh, for any threshold/truck-count you pick." />
      {binsLoading && <Loading />}
      {binsError && <ErrorBanner error={binsError} />}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Filter size={12} color="var(--stext-muted)" />
          {[60, 70, 80, 90].map((t) => <button key={t} className="btn" style={threshold === t ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setThreshold(t)}>{t}%+</button>)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Truck size={12} color="var(--stext-muted)" />
          {[2, 3, 4, 5].map((t) => <button key={t} className="btn" style={nTrucks === t ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setNTrucks(t)}>{t}</button>)}
        </div>
        {solving && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--stext-muted)" }}><Loader2 size={13} className="spin" /> Solving with OR-Tools\u2026</span>}
        {solution?.status === "SUCCESS" && !solving && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "#7FD9A0" }}><CheckCircle2 size={13} /> Solved</span>}
      </div>

      {error && <ErrorBanner error={error} onRetry={solve} />}
      {solution && (
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <span className="chip"><b>{solution.n_bins_filtered}</b> bins over {threshold}%</span>
            <span className="chip"><b>{solution.n_trucks_used}</b> trucks used</span>
            <span className="chip">Total <b>{solution.total_distance_km} km</b></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {solution.routes.map((r, i) => (
              <div key={r.truck} style={{ border: "1px solid var(--sborder)", borderRadius: 10, padding: 10, background: "var(--spanel-alt)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: TRUCK_COLORS[i % TRUCK_COLORS.length] }} />{r.truck}
                  </span>
                  <span className="mono" style={{ fontSize: 11.5 }}>{r.distance_km} km</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--stext-muted)", marginTop: 6, wordBreak: "break-word" }}>{r.stops.join(" \u2192 ")}</div>
              </div>
            ))}
            {solution.routes.length === 0 && <p style={{ color: "var(--stext-muted)", fontSize: 12.5 }}>No bins meet this threshold.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
