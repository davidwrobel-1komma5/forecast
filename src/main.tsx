import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider } from "./data/store";
import { App } from "./ui/App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root-Element nicht gefunden.");

createRoot(container).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);
