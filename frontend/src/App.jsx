import React from "react";
import { HashRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import {
  Home, LayoutGrid, Recycle, Camera, ArrowRightLeft, TrendingDown, Truck,
  ScanLine, ShieldAlert, Database, Route as RouteIcon,
} from "lucide-react";

import HomePage from "./pages/HomePage.jsx";
import WitsPage from "./pages/WitsPage.jsx";
import CitizenReportPage from "./pages/CitizenReportPage.jsx";
import MarketplacePage from "./pages/MarketplacePage.jsx";
import OverflowEnginePage from "./pages/OverflowEnginePage.jsx";
import DispatcherPage from "./pages/DispatcherPage.jsx";
import TypologyPage from "./pages/TypologyPage.jsx";
import ContaminationPage from "./pages/ContaminationPage.jsx";
import OpenDataApiPage from "./pages/OpenDataApiPage.jsx";
import RouterPage from "./pages/RouterPage.jsx";

export const TOOLS = [
  { path: "/wits", label: "WITS Console", icon: Recycle, accent: "#00E5B0", category: "Core Platform", element: <WitsPage /> },
  { path: "/citizen-report", label: "Photo Report", icon: Camera, accent: "#4FD1C5", category: "Citizen & Community", element: <CitizenReportPage /> },
  { path: "/marketplace", label: "Marketplace", icon: ArrowRightLeft, accent: "#E8A33D", category: "Citizen & Community", element: <MarketplacePage /> },
  { path: "/overflow-engine", label: "Overflow Engine", icon: TrendingDown, accent: "#8B7CF6", category: "Predictive AI", element: <OverflowEnginePage /> },
  { path: "/dispatcher", label: "Dispatcher", icon: Truck, accent: "#4FD18C", category: "Predictive AI", element: <DispatcherPage /> },
  { path: "/typology", label: "Typology CNN", icon: ScanLine, accent: "#52C4B0", category: "Computer Vision", element: <TypologyPage /> },
  { path: "/contamination", label: "Contamination", icon: ShieldAlert, accent: "#E85D6E", category: "Computer Vision", element: <ContaminationPage /> },
  { path: "/open-data-api", label: "Data API", icon: Database, accent: "#4FA8E8", category: "Data & Logistics", element: <OpenDataApiPage /> },
  { path: "/router", label: "Route Optimizer", icon: RouteIcon, accent: "#F2A03D", category: "Data & Logistics", element: <RouterPage /> },
];

const CATEGORIES = ["Core Platform", "Citizen & Community", "Predictive AI", "Computer Vision", "Data & Logistics"];

function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-logo"><LayoutGrid size={16} /></div>
        <div>
          <div className="sidebar-brand-text">Waste Intelligence Suite</div>
          <div className="sidebar-brand-sub">9 tools &middot; live backend</div>
        </div>
      </div>
      <div className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => "nav-item" + (isActive ? " active" : "")} style={{ marginBottom: 10 }}>
          <span className="nav-item-icon" style={{ background: "#4FA8E81E", color: "#4FA8E8" }}><Home size={12} /></span>
          Overview
        </NavLink>
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="nav-cat-label">{cat}</div>
            {TOOLS.filter((t) => t.category === cat).map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.path} to={t.path}
                  className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
                  style={{ "--item-accent": t.accent }}
                >
                  <span className="nav-item-icon" style={{ background: t.accent + "1E", color: t.accent }}><Icon size={12} /></span>
                  {t.label}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />
        <div className="orb orb-3" aria-hidden="true" />
        <Sidebar />
        <div className="main-area">
          <div className="main-content">
            <Routes>
              <Route path="/" element={<HomePage />} />
              {TOOLS.map((t) => (
                <Route key={t.path} path={t.path} element={t.element} />
              ))}
            </Routes>
          </div>
        </div>
      </div>
    </HashRouter>
  );
}
