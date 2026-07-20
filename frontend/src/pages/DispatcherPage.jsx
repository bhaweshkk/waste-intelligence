import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Truck, MapPin, Route as RouteIcon, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

const CITIES = ["Mumbai", "Delhi", "Bengaluru"];

function riskColor(score) {
  if (score >= 80) return "#E8604C";
  if (score >= 55) return "#F2A03D";
  if (score >= 30) return "#F2D33D";
  return "#4FD18C";
}

export default function DispatcherPage() {
  const { data: metrics } = useApi(() => api.dispatcherMetrics(), []);
  const [city, setCity] = useState("Mumbai");
  const [weekend, setWeekend] = useState(false);
  const [weather, setWeather] = useState("Normal");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedBin, setSelectedBin] = useState(null);

  const run = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.dispatcherPredictScenario({
        next_day_of_week: weekend ? 6 : 2, next_is_weekend: weekend, next_is_holiday: false,
        next_weather: weather, next_temp_c: weather === "Heatwave" ? 42 : weather === "Rain" ? 24 : 27,
        next_rainfall_mm: weather === "Rain" ? 25 : 0, next_event_flag: false, city, risk_threshold: 55,
      });
      setResult(res);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [city, weekend, weather]);

  useEffect(() => { run(); }, [run]);

  const route = result?.routes?.[city];
  const ranked = useMemo(() => (result ? result.bins.slice().sort((a, b) => b.risk_score - a.risk_score) : []), [result]);
  const dispatchBins = ranked.filter((b) => b.risk_score >= 55);
  const selected = selectedBin ? ranked.find((b) => b.bin_id === selectedBin) : ranked[0];

  return (
    <div>
      <PageHeader eyebrow="Trained ML Model" title="Predictive Dispatcher" desc="Predicts tomorrow's fill level for every real bin in the database, live, then computes a fresh nearest-neighbor route from the risk scores." />
      {metrics && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <span className="chip">MAE <b>{metrics.mae}pts</b></span>
          <span className="chip">R&sup2; <b>{metrics.r2}</b></span>
        </div>
      )}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {CITIES.map((c) => <button key={c} className="btn" style={city === c ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setCity(c)}>{c}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={!weekend ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setWeekend(false)}>Weekday</button>
          <button className="btn" style={weekend ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setWeekend(true)}>Weekend</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["Normal", "Rain", "Heatwave"].map((w) => <button key={w} className="btn" style={weather === w ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setWeather(w)}>{w}</button>)}
        </div>
        {loading && <Loader2 size={16} className="spin" color="var(--saccent)" />}
      </div>

      {error && <ErrorBanner error={error} onRetry={run} />}
      {!result && loading && <Loading />}
      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
          <div className="panel">
            <h3><MapPin size={12} /> Selected bin</h3>
            {selected && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="mono" style={{ fontWeight: 700 }}>{selected.bin_id}</span>
                  <span className="chip" style={{ color: riskColor(selected.risk_score), borderColor: riskColor(selected.risk_score) + "60" }}>Risk {selected.risk_score}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--stext-muted)", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span>Type: {selected.bin_type} &middot; {selected.capacity_l}L</span>
                  <span>Current fill: {selected.current_fill_pct}% &rarr; Predicted: {selected.predicted_fill_pct}%</span>
                </div>
              </div>
            )}
            <h3><RouteIcon size={12} /> Dispatch route ({route?.stops.length || 0} stops, {route?.total_km || 0} km)</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
              {dispatchBins.map((b, i) => (
                <div key={b.bin_id} onClick={() => setSelectedBin(b.bin_id)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 9px", borderRadius: 7, background: "var(--spanel-alt)", cursor: "pointer", border: selectedBin === b.bin_id ? "1px solid var(--saccent)" : "1px solid transparent" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--saccent)" }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 11.5 }}>{b.bin_id} &middot; {b.bin_type}</span>
                  <span className="mono" style={{ fontSize: 11, color: riskColor(b.risk_score) }}>{b.risk_score}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <h3><Truck size={12} /> All {city} bins</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 460, overflowY: "auto" }}>
              {ranked.map((b) => (
                <div key={b.bin_id} onClick={() => setSelectedBin(b.bin_id)} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, padding: "4px 6px", borderRadius: 6, cursor: "pointer", background: b.bin_id === selected?.bin_id ? "var(--spanel-alt)" : "transparent" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: riskColor(b.risk_score) }} />
                  <span style={{ flex: 1 }}>{b.bin_id}</span>
                  <span className="mono" style={{ color: "var(--stext-muted)" }}>{b.predicted_fill_pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
