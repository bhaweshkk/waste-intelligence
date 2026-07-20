import React, { useState, useRef } from "react";
import { Camera, ScanLine, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { PageHeader } from "../components/Common.jsx";

export default function ContaminationPage() {
  const { data: metrics } = useApi(() => api.contaminationMetrics(), []);
  const { data: binTypesData } = useApi(() => api.contaminationBinTypes(), []);
  const [binType, setBinType] = useState("Paper");
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
      const res = await api.contaminationScan(file, binType); // REAL multi-input CNN inference
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const binTypes = binTypesData?.bin_types || ["Paper", "Plastic", "Metal", "Glass"];

  return (
    <div>
      <PageHeader eyebrow="Trained CNN" title="Contamination Detector" desc="A multi-input CNN (image + declared bin type) scans your photo live on the backend and flags material that doesn't belong." />
      {metrics && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <span className="chip">Alert accuracy <b>{Math.round(metrics.alert_accuracy * 100)}%</b></span>
          <span className="chip">Contaminant ID <b>{Math.round(metrics.class_accuracy * 100)}%</b></span>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div className="panel">
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {binTypes.map((t) => (
              <button key={t} className="btn" style={{ flex: "1 1 45%", justifyContent: "center", ...(binType === t ? { background: "var(--saccent)", color: "#06131F" } : {}) }} onClick={() => setBinType(t)}>{t} bin</button>
            ))}
          </div>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed var(--sborder)", borderRadius: 12, padding: 26, textAlign: "center", cursor: "pointer", background: "var(--spanel-alt)" }}>
            <Camera size={26} color="var(--saccent)" />
            <p style={{ fontSize: 12.5, color: "var(--stext-muted)", marginTop: 8 }}>Upload a recycling bin photo</p>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          {preview && <img src={preview} alt="uploaded" style={{ width: "100%", marginTop: 12, borderRadius: 10, maxHeight: 220, objectFit: "contain" }} />}
        </div>
        <div className="panel">
          <h3><ScanLine size={12} /> Live scan result</h3>
          {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--stext-muted)", fontSize: 13 }}><Loader2 size={16} className="spin" /> Scanning on the backend\u2026</div>}
          {error && <div className="error-banner">{error}</div>}
          {!preview && !loading && <p style={{ color: "var(--stext-muted)", fontSize: 12.5 }}>Pick a bin type, upload a photo, get a real scan.</p>}
          {result && (
            <>
              <div className="error-banner" style={{ background: result.is_contaminated ? "rgba(232,93,110,0.15)" : "rgba(79,209,140,0.12)", borderColor: result.is_contaminated ? "rgba(232,93,110,0.4)" : "rgba(79,209,140,0.4)", color: result.is_contaminated ? "#FFC3CB" : "#B7EFCB", display: "flex", gap: 8, alignItems: "flex-start" }}>
                {result.is_contaminated ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
                <span>{result.is_contaminated ? <><b>Contamination alert:</b> {result.contamination_pct}% {result.dominant_contaminant} detected.</> : <><b>Clean:</b> {result.contamination_pct}% contamination, below threshold.</>}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--sborder)" }}><span style={{ color: "var(--stext-muted)" }}>Contamination</span><span className="mono">{result.contamination_pct}%</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}><span style={{ color: "var(--stext-muted)" }}>Dominant contaminant</span><span className="mono">{result.dominant_contaminant} ({Math.round(result.confidence * 100)}%)</span></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
