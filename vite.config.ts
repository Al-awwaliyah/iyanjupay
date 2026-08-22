import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "iyanjupay-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },

  plugins: [
    react(),

    mode === "development" &&
      componentTagger(),

    VitePWA({
      registerType: "autoUpdate",

      manifest: {
        name: "IyanjuPay",
        short_name: "IyanjuPay",
        description:
          "Your trusted payment solution in Nigeria",

        start_url: "/",
        display: "standalone",

        background_color: "#FFFFFF",
        theme_color: "#082A63",

        orientation: "portrait-primary",

        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
