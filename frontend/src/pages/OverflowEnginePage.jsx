import React, { useState, useCallback, useEffect } from "react";
import { Cloud, CloudRain, Sun, Thermometer, PartyPopper, Calendar, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

const WEATHERS = [
  { key: "Clear", icon: Sun }, { key: "Normal", icon: Cloud }, { key: "Rain", icon: CloudRain }, { key: "Heatwave", icon: Thermometer },
];
const TIER_COLOR = { Critical: "#E8604C", High: "#F2A03D", Medium: "#8B7CF6", Low: "#4FD18C" };

export default function OverflowEnginePage() {
  const { data: meta, loading: metaLoading, error: metaError } = useApi(() => api.overflowSectors(), []);
  const { data: metrics } = useApi(() => api.overflowMetrics(), []);
  const [isWeekend, setIsWeekend] = useState(false);
  const [isHoliday, setIsHoliday] = useState(false);
  const [eventFlag, setEventFlag] = useState(false);
  const [weather, setWeather] = useState("Normal");
  const [temp, setTemp] = useState(27);
  const [rainfall, setRainfall] = useState(0);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runPrediction = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.overflowPredictAll({
        day_of_week: isWeekend ? 6 : 2, is_weekend: isWeekend, is_holiday: isHoliday,
        weather, temp_c: Number(temp), rainfall_mm: Number(rainfall), event_flag: eventFlag,
      });
      setResults(res.results);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [isWeekend, isHoliday, eventFlag, weather, temp, rainfall]);

  useEffect(() => { if (meta) runPrediction(); }, [meta]); // eslint-disable-line

  return (
    <div>
      <PageHeader eyebrow="Trained ML Model" title="Predictive Overflow Engine" desc="Every scenario change below re-runs the real RandomForest model on the backend, live \u2014 there is no precomputed scenario table anymore." />
      {metrics && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span className="chip">R&sup2; <b>{metrics.r2}</b></span>
          <span className="chip">MAE <b>{metrics.mae}h</b></span>
          <span className="chip">Tier accuracy <b>{Math.round(metrics.accuracy * 100)}%</b></span>
        </div>
      )}
      {metaLoading && <Loading />}
      {metaError && <ErrorBanner error={metaError} />}
      {meta && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
          <div className="panel">
            <h3><Calendar size={12} /> Scenario</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              <button className="btn" style={!isWeekend ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setIsWeekend(false)}>Weekday</button>
              <button className="btn" style={isWeekend ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setIsWeekend(true)}>Weekend</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <button className="btn" style={{ flex: 1, justifyContent: "center", ...(isHoliday ? { background: "var(--saccent)", color: "#06131F" } : {}) }} onClick={() => setIsHoliday((v) => !v)}>Holiday</button>
              <button className="btn" style={{ flex: 1, justifyContent: "center", ...(eventFlag ? { background: "var(--saccent)", color: "#06131F" } : {}) }} onClick={() => setEventFlag((v) => !v)}><PartyPopper size={12} /> Event</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {WEATHERS.map((w) => {
                const Icon = w.icon;
                return (
                  <button key={w.key} className="btn" style={weather === w.key ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setWeather(w.key)}>
                    <Icon size={13} /> {w.key}
                  </button>
                );
              })}
            </div>
            <label style={{ fontSize: 10.5, color: "var(--stext-muted)" }}>Temperature &deg;C</label>
            <input className="input" type="number" value={temp} onChange={(e) => setTemp(e.target.value)} style={{ marginBottom: 8 }} />
            <label style={{ fontSize: 10.5, color: "var(--stext-muted)" }}>Rainfall mm</label>
            <input className="input" type="number" value={rainfall} onChange={(e) => setRainfall(e.target.value)} style={{ marginBottom: 12 }} />
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={runPrediction} disabled={loading}>
              {loading ? <Loader2 size={13} className="spin" /> : null} {loading ? "Scoring live\u2026" : "Run live prediction"}
            </button>
          </div>

          <div className="panel">
            <h3>Sectors ranked by overflow speed</h3>
            {error && <ErrorBanner error={error} onRetry={runPrediction} />}
            {!results && loading && <Loading label="Running the model on the backend\u2026" />}
            {results && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 480, overflowY: "auto" }}>
                {results.map((r, i) => (
                  <div key={r.sector} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, background: "var(--spanel-alt)" }}>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--stext-muted)", width: 24 }}>#{i + 1}</span>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLOR[r.predicted_risk_tier] }} />
                    <span style={{ flex: 1, fontSize: 12 }}>{r.sector}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--stext-muted)" }}>{r.predicted_hours_to_overflow}h &middot; {r.predicted_risk_tier}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
