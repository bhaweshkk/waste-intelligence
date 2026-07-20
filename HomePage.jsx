import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TOOLS } from "../App.jsx";
import { PageHeader } from "../components/Common.jsx";

const CATEGORIES = ["Core Platform", "Citizen & Community", "Predictive AI", "Computer Vision", "Data & Logistics"];

export default function HomePage() {
  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader
        eyebrow="Waste Intelligence Suite"
        title="Nine tools, one real backend"
        desc="Every prediction, scan, and route here is computed live by the FastAPI backend — trained models loaded once at startup, a real SQLite database, and an on-demand Google OR-Tools solver. Nothing on this page is precomputed JSON."
      />
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <div className="chip">4 <b>trained models</b> loaded server-side</div>
        <div className="chip">1 <b>OR-Tools</b> solver, on demand</div>
        <div className="chip">1 <b>SQLite</b> database</div>
        <div className="chip">2 <b>CNNs</b> doing real image inference</div>
      </div>

      {CATEGORIES.map((cat) => (
        <div key={cat} style={{ marginBottom: 26 }}>
          <h2 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--stext-muted)", margin: "0 0 12px" }}>{cat}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {TOOLS.filter((t) => t.category === cat).map((t) => {
              const Icon = t.icon;
              return (
                <Link key={t.path} to={t.path} className="panel" style={{ display: "flex", gap: 12, alignItems: "flex-start", textDecoration: "none", cursor: "pointer" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: t.accent + "22", color: t.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={19} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--stext)" }}>{t.label}</div>
                  </div>
                  <ChevronRight size={16} color="var(--stext-muted)" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
