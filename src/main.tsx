import { createRoot } from "react-dom/client";
import App from "./App.tsx";

import "./index.css";
import "./styles/globalTheme.css";

import { registerSW } from "virtual:pwa-register";

/*
 * ============================================================
 * IYANJUPAY APPLICATION BOOT
 *
 * IMPORTANT:
 * React is mounted immediately.
 *
 * Service-worker registration is deliberately started AFTER
 * React has been mounted so PWA registration can never block
 * the application UI.
 * ============================================================
 */

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    "IyanjuPay application root element was not found.",
  );
}

createRoot(rootElement).render(<App />);

/*
 * ============================================================
 * PWA SERVICE WORKER
 *
 * Fire-and-forget.
 *
 * Nothing below is awaited by React.
 * ============================================================
 */

window.setTimeout(() => {
  try {
    registerSW({
      immediate: true,

      onRegisteredSW(swUrl, registration) {
        console.info(
          "IyanjuPay PWA service worker registered:",
          swUrl,
        );

        if (registration) {
          console.info(
            "IyanjuPay PWA service worker is active.",
          );
        }
      },

      onRegisterError(error) {
        /*
         * Service-worker failure must not affect the app.
         */
        console.warn(
          "IyanjuPay PWA service worker registration skipped:",
          error instanceof Error
            ? error.message
            : "unknown error",
        );
      },

      onOfflineReady() {
        console.info(
          "IyanjuPay is ready to work offline.",
        );
      },

      onNeedRefresh() {
        console.info(
          "A new IyanjuPay version is available.",
        );
      },
    });
  } catch (error) {
    /*
     * Never allow service-worker registration failure to
     * interfere with the already-mounted React application.
     */
    console.warn(
      "IyanjuPay service worker initialization skipped:",
      error instanceof Error
        ? error.message
        : "unknown error",
    );
  }
}, 0);
