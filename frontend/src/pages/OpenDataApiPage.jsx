import React, { useState, useMemo } from "react";
import { Database, Download } from "lucide-react";
import { api, API_BASE_URL } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

export default function OpenDataApiPage() {
  const { data: sources, loading: sourcesLoading, error: sourcesError } = useApi(() => api.opendataSources(), []);
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const { data: waste, loading, error, reload } = useApi(() => api.opendataWaste({ city: city || undefined, page, per_page: 8 }), [city, page]);

  const downloadCsv = () => {
    window.open(`${API_BASE_URL}/api/opendata/waste?format=csv&per_page=500${city ? `&city=${city}` : ""}`, "_blank");
  };

  return (
    <div>
      <PageHeader eyebrow="Data Pipeline + API" title="Open Waste Data API" desc="Real REST endpoints backed by SQLite, seeded from three differently-shaped source formats standardized into one schema." />
      {sourcesLoading && <Loading />}
      {sourcesError && <ErrorBanner error={sourcesError} />}
      {sources && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span className="chip"><b>{sources.total_records.toLocaleString()}</b> standardized records</span>
          {Object.entries(sources.sources).map(([k, v]) => <span key={k} className="chip">{k}: <b>{v}</b></span>)}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
        <input className="input" style={{ maxWidth: 220 }} placeholder="Filter by city\u2026" value={city} onChange={(e) => { setCity(e.target.value); setPage(1); }} />
        <button className="btn" onClick={downloadCsv}><Download size={13} /> Export CSV</button>
      </div>
      {loading && <Loading />}
      {error && <ErrorBanner error={error} onRetry={reload} />}
      {waste && (
        <div className="panel">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--stext-muted)", fontSize: 10.5 }}>
                <th style={{ padding: "6px 8px" }}>City</th><th>Waste type</th><th>Year</th><th>Tons/day</th><th>Recycling %</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {waste.results.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--sborder)" }}>
                  <td style={{ padding: "6px 8px" }}>{r.city}</td><td>{r.waste_type}</td><td className="mono">{r.year}</td>
                  <td className="mono">{r.tons_per_day}</td><td className="mono">{r.recycling_rate_pct}%</td><td style={{ fontSize: 10.5 }}>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span style={{ fontSize: 11.5, color: "var(--stext-muted)" }}>Page {page} &middot; {waste.total} total</span>
            <button className="btn" disabled={page * 8 >= waste.total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
