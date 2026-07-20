import React, { useState, useRef } from "react";
import { Camera, Upload, Loader2, Layers } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { PageHeader } from "../components/Common.jsx";

export default function TypologyPage() {
  const { data: metrics } = useApi(() => api.typologyMetrics(), []);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const res = await api.typologyEstimate(file); // REAL CNN inference on the backend
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Trained CNN" title="Waste Typology Estimator" desc="Uploads run through the actual trained Keras CNN on the backend \u2014 real inference on your photo, not a lookup or a client-side heuristic." />
      {metrics && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <span className="chip">Fill MAE <b>{metrics.fill_mae}</b></span>
          <span className="chip">Material accuracy <b>{Math.round(metrics.material_accuracy * 100)}%</b></span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div className="panel">
          <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed var(--sborder)", borderRadius: 12, padding: 26, textAlign: "center", cursor: "pointer", background: "var(--spanel-alt)" }}>
            <Camera size={26} color="var(--saccent)" />
            <p style={{ fontSize: 12.5, color: "var(--stext-muted)", marginTop: 8 }}>Upload a top-down dumpster photo</p>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          {preview && <img src={preview} alt="uploaded" style={{ width: "100%", marginTop: 12, borderRadius: 10, maxHeight: 240, objectFit: "contain" }} />}
        </div>
        <div className="panel">
          <h3><Layers size={12} /> Live CNN result</h3>
          {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--stext-muted)", fontSize: 13 }}><Loader2 size={16} className="spin" /> Running inference on the backend\u2026</div>}
          {error && <div className="error-banner">{error}</div>}
          {!preview && !loading && <p style={{ color: "var(--stext-muted)", fontSize: 12.5 }}>Upload a photo to see a real prediction here.</p>}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sborder)" }}><span style={{ color: "var(--stext-muted)" }}>Material</span><span className="mono" style={{ fontWeight: 700 }}>{result.predicted_material} ({Math.round(result.confidence * 100)}%)</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sborder)" }}><span style={{ color: "var(--stext-muted)" }}>Fill level</span><span className="mono">{result.predicted_fill_pct}%</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sborder)" }}><span style={{ color: "var(--stext-muted)" }}>Volume</span><span className="mono">{result.volume_m3} m&sup3;</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sborder)" }}><span style={{ color: "var(--stext-muted)" }}>Mass</span><span className="mono">{result.mass_kg} kg</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}><span style={{ color: "var(--stext-muted)" }}>CO&#8322;e</span><span className="mono">{result.co2e_kg} kg</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
