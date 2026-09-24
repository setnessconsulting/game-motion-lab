import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import "./app/styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Motion Lab could not find its #root container element.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
