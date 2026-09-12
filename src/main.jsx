/**
 * Title        Plate Analyzer entry point
 * Purpose      Mounts <PlateAnalyzer /> into #root. Nothing else lives here.
 * Author       Jennifer Naomi Nguyen
 * Canonical    src/main.jsx
 * Updated      2026-09-11
 * Dependencies react, react-dom
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PlateAnalyzer from "./PlateAnalyzer.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PlateAnalyzer />
  </StrictMode>,
);
