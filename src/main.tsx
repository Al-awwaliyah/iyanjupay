import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { registerSW } from "virtual:pwa-register";

// ============================================================
// IYANJUPAY PWA SERVICE WORKER
// ============================================================

registerSW({
  immediate: true,

  onRegisteredSW(swUrl, registration) {
    console.log(
      "IyanjuPay PWA service worker registered:",
      swUrl
    );

    if (registration) {
      console.log(
        "IyanjuPay PWA registration:",
        registration
      );
    }
  },

  onRegisterError(error) {
    console.error(
      "IyanjuPay PWA service worker registration failed:",
      error
    );
  },

  onOfflineReady() {
    console.log(
      "IyanjuPay is ready to work offline."
    );
  },

  onNeedRefresh() {
    console.log(
      "A new version of IyanjuPay is available."
    );
  },
});

// ============================================================
// REACT
// ============================================================

createRoot(
  document.getElementById("root")!
).render(
  <App />
);
