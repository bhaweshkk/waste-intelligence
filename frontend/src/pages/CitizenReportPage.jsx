import React, { useState, useRef, useCallback } from "react";
import { Camera, MapPin, AlertTriangle, CheckCircle2, Loader2, Upload, Trash2, Navigation, Flame } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

/* Real EXIF GPS parser (same hand-written JPEG/TIFF walker as before) */
function readIFDEntries(view, ifdOffset, little) {
  const count = view.getUint16(ifdOffset, little);
  const entries = {};
  for (let i = 0; i < count; i++) {
    const eo = ifdOffset + 2 + i * 12;
    entries[view.getUint16(eo, little)] = { type: view.getUint16(eo + 2, little), numValues: view.getUint32(eo + 4, little), valueOffset: eo + 8 };
  }
  return entries;
}
function readRationalArray(view, tiffStart, entry, little) {
  if (entry.type !== 5) return null;
  const dataOffset = tiffStart + view.getUint32(entry.valueOffset, little);
  const vals = [];
  for (let i = 0; i < entry.numValues; i++) {
    const num = view.getUint32(dataOffset + i * 8, little);
    const den = view.getUint32(dataOffset + i * 8 + 4, little);
    vals.push(den === 0 ? 0 : num / den);
  }
  return vals;
}
function parseTiffForGPS(view, tiffStart) {
  const little = view.getUint16(tiffStart, false) === 0x4949;
  const ifd0Offset = view.getUint32(tiffStart + 4, little);
  const ifd0 = readIFDEntries(view, tiffStart + ifd0Offset, little);
  const gpsPtr = ifd0[0x8825];
  if (!gpsPtr) return null;
  const gpsOffset = view.getUint32(gpsPtr.valueOffset, little);
  const gps = readIFDEntries(view, tiffStart + gpsOffset, little);
  const latEntry = gps[2], lonEntry = gps[4];
  if (!latEntry || !lonEntry) return null;
  const latRef = gps[1] ? String.fromCharCode(view.getUint8(gps[1].valueOffset)) : "N";
  const lonRef = gps[3] ? String.fromCharCode(view.getUint8(gps[3].valueOffset)) : "E";
  const latDMS = readRationalArray(view, tiffStart, latEntry, little);
  const lonDMS = readRationalArray(view, tiffStart, lonEntry, little);
  if (!latDMS || !lonDMS) return null;
  let lat = latDMS[0] + latDMS[1] / 60 + latDMS[2] / 3600;
  let lon = lonDMS[0] + lonDMS[1] / 60 + lonDMS[2] / 3600;
  if (latRef === "S") lat = -lat;
  if (lonRef === "W") lon = -lon;
  return { lat, lon };
}
function extractGPSFromJPEG(buf) {
  try {
    const view = new DataView(buf);
    if (view.getUint16(0, false) !== 0xffd8) return null;
    let offset = 2;
    while (offset < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return null;
      const marker = view.getUint8(offset + 1);
      offset += 2;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > view.byteLength) break;
      const size = view.getUint16(offset, false);
      if (marker === 0xe1) {
        const start = offset + 2;
        if (view.getUint32(start, false) === 0x45786966 && view.getUint16(start + 4, false) === 0x0000) {
          return parseTiffForGPS(view, start + 6);
        }
      }
      offset += size;
      if (marker === 0xda) break;
    }
    return null;
  } catch { return null; }
}

function resizeToDataURL(file, maxDim = 480, quality = 0.62) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("decode failed"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const SEVERITIES = ["Overflowing", "Nearly full", "Partially full"];
const TIER_COLOR = { Critical: "#E8604C", High: "#F2A03D", Medium: "#F2D33D", Low: "#5C8B84" };

export default function CitizenReportPage() {
  const { data: reports, loading, error, reload } = useApi(() => api.citizenReports(), []);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [severity, setSeverity] = useState("Overflowing");
  const [note, setNote] = useState("");
  const [gpsStatus, setGpsStatus] = useState("idle");
  const [coord, setCoord] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const filteredReports = React.useMemo(() => {
    if (!reports) return [];
    return statusFilter === "All" ? reports : reports.filter((r) => r.status === statusFilter);
  }, [reports, statusFilter]);

  const handleFile = async (file) => {
    if (!file) return;
    setPhotoFile(file);
    setGpsStatus("reading-exif");
    setCoord(null);
    try { setPhotoPreview(await resizeToDataURL(file)); } catch { setPhotoPreview(null); }
    try {
      const buf = await file.arrayBuffer();
      const gps = extractGPSFromJPEG(buf);
      if (gps) { setCoord(gps); setGpsStatus("found"); return; }
    } catch { /* fall through */ }
    if (navigator.geolocation) {
      setGpsStatus("requesting-geo");
      navigator.geolocation.getCurrentPosition(
        (pos) => { setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGpsStatus("found"); },
        () => setGpsStatus("manual"),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else setGpsStatus("manual");
  };

  const submit = async () => {
    if (!coord) return;
    setSubmitting(true);
    try {
      await api.citizenCreateReport({ photo_data_url: photoPreview, severity, note, lat: coord.lat, lon: coord.lon });
      setPhotoFile(null); setPhotoPreview(null); setNote(""); setGpsStatus("idle"); setCoord(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      reload();
    } catch (e) {
      alert("Could not submit: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="Live Console" title="Citizen Photo-to-Report" desc="Real EXIF GPS extraction, persisted to the backend's SQLite database — the priority queue is computed fresh from real rows, not a browser-local cache." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
        <div className="panel">
          <h3>Report an overflowing bin</h3>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: "2px dashed var(--sborder)", borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", background: "var(--spanel-alt)" }}>
            <Camera size={24} color="var(--saccent)" />
            <p style={{ fontSize: 12, color: "var(--stext-muted)", marginTop: 6 }}>{photoFile ? photoFile.name : "Tap to choose a photo"}</p>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handleFile(e.target.files?.[0])} />
          </div>
          {photoPreview && <img src={photoPreview} alt="preview" style={{ width: "100%", borderRadius: 10, marginTop: 10, maxHeight: 200, objectFit: "cover" }} />}

          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            {SEVERITIES.map((s) => (
              <button key={s} className="btn" style={{ flex: 1, justifyContent: "center", ...(severity === s ? { background: "var(--saccent)", color: "#06131F" } : {}) }} onClick={() => setSeverity(s)}>{s}</button>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--stext-muted)" }}>
            {gpsStatus === "idle" && <div><MapPin size={12} /> Waiting for a photo\u2026</div>}
            {gpsStatus === "reading-exif" && <div><Loader2 size={12} className="spin" /> Reading photo location\u2026</div>}
            {gpsStatus === "requesting-geo" && <div><Navigation size={12} /> Requesting device location\u2026</div>}
            {gpsStatus === "found" && coord && <div style={{ color: "var(--saccent)" }}><CheckCircle2 size={12} /> {coord.lat.toFixed(5)}, {coord.lon.toFixed(5)}</div>}
            {gpsStatus === "manual" && <div><AlertTriangle size={12} /> No GPS available.</div>}
          </div>

          <textarea className="input" style={{ marginTop: 10, minHeight: 50 }} placeholder="Optional note" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} disabled={!photoPreview || !coord || submitting} onClick={submit}>
            {submitting ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {submitting ? "Submitting\u2026" : "Add to priority queue"}
          </button>
        </div>

        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>City priority queue</h3>
            <div style={{ display: "flex", gap: 6 }}>
              {["Pending", "Collected", "All"].map((s) => (
                <button key={s} className="btn" style={{ padding: "5px 10px", fontSize: 11, ...(statusFilter === s ? { background: "var(--saccent)", color: "#06131F" } : {}) }} onClick={() => setStatusFilter(s)}>{s}</button>
              ))}
            </div>
          </div>
          {loading && <Loading />}
          {error && <ErrorBanner error={error} onRetry={reload} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 440, overflowY: "auto" }}>
            {filteredReports.length === 0 && !loading && <p style={{ color: "var(--stext-muted)", fontSize: 12 }}>No {statusFilter.toLowerCase()} reports yet.</p>}
            {filteredReports.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: 10, borderRadius: 10, background: "var(--spanel-alt)", border: "1px solid var(--sborder)" }}>
                {r.photo && <img src={r.photo} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="chip" style={{ color: TIER_COLOR[r.tier], borderColor: TIER_COLOR[r.tier] + "60", padding: "2px 8px", fontSize: 10 }}>{r.tier} &middot; {r.score}</span>
                    {r.clusterCount > 0 && <span style={{ fontSize: 10, color: "var(--stext-muted)" }}><Flame size={10} /> {r.clusterCount} nearby</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--stext-muted)", marginTop: 3 }}>{r.coord.lat.toFixed(4)}, {r.coord.lon.toFixed(4)} &middot; {r.severity}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {r.status === "Pending" && (
                    <button className="btn" style={{ padding: 6 }} title="Mark collected" onClick={async () => { await api.citizenMarkCollected(r.id); reload(); }}><CheckCircle2 size={14} color="var(--saccent)" /></button>
                  )}
                  <button className="btn" style={{ padding: 6 }} title="Remove" onClick={async () => { await api.citizenDeleteReport(r.id); reload(); }}><Trash2 size={14} color="#E8604C" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
