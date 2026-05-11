import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { App } from "./App.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
