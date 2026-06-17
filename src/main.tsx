import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

if ("serviceWorker" in navigator && !isLocalhost) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.update().catch(() => undefined);
        if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      })
      .catch(() => {
        // O app continua funcionando normalmente se o navegador bloquear PWA.
      });
  });
} else if ("serviceWorker" in navigator && isLocalhost) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  caches.keys().then((keys) => {
    keys.forEach((key) => caches.delete(key));
  });
}
