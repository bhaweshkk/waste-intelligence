import React, { useState } from "react";
import { Recycle, Package, TrendingUp, Search, Mail, Building2, MapPin, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../api.js";
import { useApi } from "../hooks.js";
import { Loading, ErrorBanner, PageHeader } from "../components/Common.jsx";

const CATEGORIES = ["Wood & Timber Scraps", "Metal Scrap", "Plastic Regrind", "Textile Offcuts", "Paper & Cardboard",
  "Organic / Compostable", "Construction Debris", "E-Waste Components", "Chemical / Solvent Byproduct", "Glass Cullet", "Other"];
const UNITS = ["kg", "tons", "units", "litres"];

export default function MarketplacePage() {
  const [tab, setTab] = useState("browse");
  const [browseType, setBrowseType] = useState("supply");
  const { data: listings, loading, error, reload } = useApi(() => api.marketplaceListings({ type: browseType }), [browseType]);
  const [matchesFor, setMatchesFor] = useState(null);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState({ type: "supply", company: "", material: "", category: CATEGORIES[0], quantity: "", unit: "kg", city: "", price_per_unit: "", email: "", notes: "" });
  const [posting, setPosting] = useState(false);

  const openMatches = async (id) => {
    setMatchesFor(id);
    setMatches(await api.marketplaceMatches(id));
  };

  const submit = async () => {
    if (!form.company || !form.material || !form.quantity || !form.city || !form.email) return;
    setPosting(true);
    try {
      await api.marketplaceCreate({ ...form, quantity: parseFloat(form.quantity), price_per_unit: parseFloat(form.price_per_unit) || 0 });
      setForm({ ...form, company: "", material: "", quantity: "", city: "", price_per_unit: "", email: "", notes: "" });
      setBrowseType(form.type);
      setTab("browse");
      reload();
    } finally { setPosting(false); }
  };

  const contactHref = (l) => `mailto:${l.email}?subject=${encodeURIComponent("Waste Marketplace: interest in " + l.material)}&body=${encodeURIComponent(`Hi ${l.company},\n\nI saw your listing for ${l.quantity} ${l.unit} of ${l.material} (${l.city}) on the marketplace.\n\nThanks,`)}`;

  return (
    <div>
      <PageHeader eyebrow="Live Console" title="Digital Waste Marketplace" desc="Real listings persisted to the backend; match scores are computed server-side against every opposite-type listing currently in the database." />
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" style={tab === "browse" ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setTab("browse")}><Search size={13} /> Browse</button>
        <button className="btn" style={tab === "post" ? { background: "var(--saccent)", color: "#06131F" } : {}} onClick={() => setTab("post")}><Recycle size={13} /> Post a listing</button>
      </div>

      {tab === "browse" ? (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button className="btn" style={browseType === "supply" ? { background: "#5FB88A", color: "#0A1F14" } : {}} onClick={() => setBrowseType("supply")}><Package size={13} /> Supply</button>
            <button className="btn" style={browseType === "demand" ? { background: "#5B9BD8", color: "#0A1A2B" } : {}} onClick={() => setBrowseType("demand")}><TrendingUp size={13} /> Demand</button>
          </div>
          {loading && <Loading />}
          {error && <ErrorBanner error={error} onRetry={reload} />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px,1fr))", gap: 12 }}>
            {listings && listings.length === 0 && <p style={{ color: "var(--stext-muted)", fontSize: 12.5 }}>No {browseType} listings yet. Be the first to post one.</p>}
            {listings && listings.map((l) => (
              <div key={l.id} className="panel">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.material}</div>
                  <span className="chip" style={{ padding: "1px 8px", fontSize: 9.5, textTransform: "uppercase" }}>{l.type}</span>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--saccent)", marginBottom: 8 }}>{l.category}</div>
                <div style={{ fontSize: 11.5, color: "var(--stext-muted)", display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                  <span><Building2 size={11} /> {l.company}</span>
                  <span><MapPin size={11} /> {l.city}</span>
                  <span className="mono">{l.quantity} {l.unit}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} onClick={() => openMatches(l.id)}><Sparkles size={12} /> Matches</button>
                  <a className="btn btn-primary" style={{ flex: 1, justifyContent: "center", fontSize: 11 }} href={contactHref(l)}><Mail size={12} /> Contact</a>
                  <button className="btn" style={{ padding: 8 }} onClick={async () => { await api.marketplaceDelete(l.id); reload(); }}><Trash2 size={13} color="#E8604C" /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="panel" style={{ maxWidth: 480 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button className="btn" style={{ flex: 1, justifyContent: "center", ...(form.type === "supply" ? { background: "#5FB88A", color: "#0A1F14" } : {}) }} onClick={() => setForm({ ...form, type: "supply" })}>I have waste</button>
            <button className="btn" style={{ flex: 1, justifyContent: "center", ...(form.type === "demand" ? { background: "#5B9BD8", color: "#0A1A2B" } : {}) }} onClick={() => setForm({ ...form, type: "demand" })}>I need material</button>
          </div>
          <input className="input" style={{ marginBottom: 8 }} placeholder="Company name" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="Material" value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="input" type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select>
            <input className="input" type="number" placeholder="Price/unit" value={form.price_per_unit} onChange={(e) => setForm({ ...form, price_per_unit: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="input" type="email" placeholder="Contact email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <textarea className="input" style={{ marginBottom: 10, minHeight: 50 }} placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={posting} onClick={submit}>{posting ? "Posting\u2026" : "Post listing"}</button>
        </div>
      )}

      {matchesFor && (
        <div onClick={() => setMatchesFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(4,6,10,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: 440, maxWidth: "90vw", maxHeight: "70vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Matches</h3>
              <button className="btn" style={{ padding: 5 }} onClick={() => setMatchesFor(null)}><X size={14} /></button>
            </div>
            {matches.length === 0 && <p style={{ color: "var(--stext-muted)", fontSize: 12 }}>No matches yet.</p>}
            {matches.map((m) => (
              <div key={m.listing.id} style={{ border: "1px solid var(--sborder)", borderRadius: 10, padding: 10, marginBottom: 8, background: "var(--spanel-alt)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.listing.material}</div>
                  <span className="mono" style={{ color: "var(--saccent)", fontSize: 11, fontWeight: 700 }}>{m.score}% match</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--stext-muted)" }}>{m.listing.company} &middot; {m.listing.city}</div>
                <a className="btn btn-primary" style={{ marginTop: 8, justifyContent: "center", display: "flex" }} href={contactHref(m.listing)}><Mail size={12} /> Contact {m.listing.company}</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
