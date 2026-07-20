const BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail;
    try {
      const body = await res.json();
      detail = body.detail;
      if (Array.isArray(detail)) {
        detail = detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
      }
    } catch {
      detail = res.statusText;
    }
    throw new Error(detail || `Request failed: ${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : res.text();
}

export const api = {
  // WITS
  witsCities: () => request("/api/wits/cities"),
  witsSummary: () => request("/api/wits/summary"),

  // Overflow Engine
  overflowSectors: () => request("/api/overflow/sectors"),
  overflowMetrics: () => request("/api/overflow/metrics"),
  overflowPredictAll: (scenario) =>
    request("/api/overflow/predict-all-sectors", { method: "POST", body: JSON.stringify(scenario) }),

  // Dispatcher
  dispatcherBins: () => request("/api/dispatcher/bins"),
  dispatcherMetrics: () => request("/api/dispatcher/metrics"),
  dispatcherPredictScenario: (scenario) =>
    request("/api/dispatcher/predict-scenario", { method: "POST", body: JSON.stringify(scenario) }),

  // Typology (real CNN upload)
  typologyMetrics: () => request("/api/typology/metrics"),
  typologyEstimate: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/typology/estimate", { method: "POST", body: fd });
  },

  // Contamination (real CNN upload)
  contaminationMetrics: () => request("/api/contamination/metrics"),
  contaminationBinTypes: () => request("/api/contamination/bin-types"),
  contaminationScan: (file, binType) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("bin_type", binType);
    return request("/api/contamination/scan", { method: "POST", body: fd });
  },

  // Router (real OR-Tools)
  routerBins: () => request("/api/router/bins"),
  routerSolve: (params) => request("/api/router/solve", { method: "POST", body: JSON.stringify(params) }),

  // Citizen reports
  citizenReports: (status) => request(`/api/citizen/reports${status ? `?status=${status}` : ""}`),
  citizenCreateReport: (payload) => request("/api/citizen/reports", { method: "POST", body: JSON.stringify(payload) }),
  citizenMarkCollected: (id) => request(`/api/citizen/reports/${id}/collect`, { method: "PATCH" }),
  citizenDeleteReport: (id) => request(`/api/citizen/reports/${id}`, { method: "DELETE" }),

  // Marketplace
  marketplaceListings: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/marketplace/listings${qs ? `?${qs}` : ""}`);
  },
  marketplaceCreate: (payload) => request("/api/marketplace/listings", { method: "POST", body: JSON.stringify(payload) }),
  marketplaceDelete: (id) => request(`/api/marketplace/listings/${id}`, { method: "DELETE" }),
  marketplaceMatches: (id) => request(`/api/marketplace/listings/${id}/matches`),

  // Open Data API
  opendataSources: () => request("/api/opendata/sources"),
  opendataCities: () => request("/api/opendata/cities"),
  opendataWaste: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/opendata/waste${qs ? `?${qs}` : ""}`);
  },
  opendataSummary: (city) => request(`/api/opendata/summary${city ? `?city=${city}` : ""}`),
};

export { BASE as API_BASE_URL };
