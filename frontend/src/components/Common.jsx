import React from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "../api.js";

export function Loading({ label = "Loading from the live backend\u2026" }) {
  return (
    <div className="loading-row">
      <Loader2 size={15} className="spin" />
      {label}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  return (
    <div className="error-banner">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div><b>Couldn't reach the backend:</b> {error}</div>
          <div style={{ marginTop: 4, opacity: 0.8 }}>
            Checked <span className="mono">{API_BASE_URL}</span> &mdash; make sure the FastAPI server is running (see backend/README.md).
          </div>
          {onRetry && (
            <button className="btn" style={{ marginTop: 8 }} onClick={onRetry}>Retry</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, desc }) {
  return (
    <div className="page-header">
      <p className="page-eyebrow">{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-desc">{desc}</p>
    </div>
  );
}
