import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Ensure a service worker is registered in production builds so PWA audits
// (e.g. PWABuilder) can detect it reliably.
if (import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
