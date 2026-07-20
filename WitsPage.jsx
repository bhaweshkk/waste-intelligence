import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Search, AlertTriangle, ShieldAlert, TrendingUp, TrendingDown, Minus, MapPin } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

function TrendIcon({ trend }) {
  if (trend === "Improving") return <TrendingUp size={13} />;
  if (trend === "Declining") return <TrendingDown size={13} />;
  return <Minus size={13} />;
}

export default function WitsPage() {
  const { data: cities, loading, error, reload } = useApi(() => api.witsCities(), []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    if (!cities) return [];
    const q = query.toLowerCase();
    return cities.filter((c) => c.city.toLowerCase().includes(q));
  }, [cities, query]);

  const activeCity = selected || (filtered.length ? filtered[0].city : null);
  const activeData = cities?.find((c) => c.city === activeCity);

  return (
    <div>
      <PageHeader eyebrow="Live Console" title="WITS Console" desc="Predictive city tiering, computed server-side from the real dataset in the database — trend regression + hazard anomaly detection run fresh on every request." />
      {loading && <Loading />}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {cities && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <div className="panel">
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: "var(--stext-muted)" }} />
              <input className="input" style={{ paddingLeft: 28 }} placeholder="Search city\u2026" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div style={{ maxHeight: 480, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered.map((c) => (
                <button key={c.city} onClick={() => setSelected(c.city)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
                           background: c.city === activeCity ? "var(--spanel-alt)" : "transparent", color: "var(--stext)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.currentTier.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5 }}>{c.city}</span>
                  {c.hazardFlag && <ShieldAlert size={12} color="#E8604C" />}
                  <span className="mono" style={{ fontSize: 11, color: "var(--stext-muted)" }}>{c.latestRate.toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>

          {activeData && (
            <div className="panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 19, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={16} color="var(--saccent)" />{activeData.city}</div>
                  <div style={{ fontSize: 11.5, color: "var(--stext-muted)", marginTop: 4, display: "flex", gap: 12 }}>
                    {activeData.popDensity != null && <span>Pop. density: <b className="mono" style={{ color: "var(--stext)" }}>{activeData.popDensity}</b>/km&sup2;</span>}
                    <span>Trend: <TrendIcon trend={activeData.trend} /> {activeData.trend}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="chip" style={{ color: activeData.currentTier.color, borderColor: activeData.currentTier.color + "60" }}>{activeData.currentTier.key} &middot; {activeData.latestRate.toFixed(1)}%</span>
                  <span style={{ color: "var(--stext-muted)" }}>&rarr;</span>
                  <span className="chip" style={{ color: activeData.predictedTier.color, borderColor: activeData.predictedTier.color + "60" }}>Predicted {activeData.predictedTier.key} &middot; {activeData.predictedRate.toFixed(1)}%</span>
                </div>
              </div>

              {activeData.earlyWarning && (
                <div className="error-banner" style={{ background: "rgba(232,96,76,0.1)" }}>
                  <AlertTriangle size={13} style={{ marginRight: 6 }} />Early-warning: predicted downgrade to {activeData.predictedTier.key} next cycle.
                </div>
              )}
              {activeData.hazardFlag && (
                <div className="error-banner" style={{ background: "rgba(242,184,75,0.1)", borderColor: "rgba(242,184,75,0.4)", color: "#FCE4B0" }}>
                  <ShieldAlert size={13} style={{ marginRight: 6 }} />Hazardous-risk flag: ratio {(activeData.latestRatio * 100).toFixed(1)}% (z={activeData.hazardZ}).
                </div>
              )}

              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={activeData.series} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232936" />
                  <XAxis dataKey="year" tick={{ fill: "#838EA3", fontSize: 11 }} axisLine={{ stroke: "#232936" }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#838EA3", fontSize: 11 }} axisLine={{ stroke: "#232936" }} tickLine={false} />
                  <ReferenceLine y={40} stroke="#E8604C" strokeDasharray="2 4" strokeOpacity={0.4} />
                  <ReferenceLine y={75} stroke="#34D399" strokeDasharray="2 4" strokeOpacity={0.4} />
                  <Tooltip contentStyle={{ background: "#12161F", border: "1px solid #232936", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="actual" stroke="#00E5B0" strokeWidth={2.5} dot={{ r: 3.5 }} />
                </LineChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 10.5, color: "var(--stext-muted)", marginTop: 6 }}>Confidence: {activeData.confidencePct}% &middot; slope {activeData.slope > 0 ? "+" : ""}{activeData.slope} pts/yr</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
