import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        id: "/",
        name: "KM Cash Keeper - CRA Tax Tracker",
        short_name: "KM Cash Keeper",
        description: "Track vehicle expenses and mileage for CRA Form T2125. Built for Canadian self-employed delivery drivers. Log trips, scan receipts, and generate audit-ready reports.",
        theme_color: "#141619",
        background_color: "#141619",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        dir: "ltr",
        lang: "en-CA",
        categories: ["finance", "productivity", "business"],
        prefer_related_applications: false,
        related_applications: [],
        iarc_rating_id: "",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Add Trip",
            short_name: "Trip",
            description: "Log a new business trip",
            url: "/trips?action=add",
            icons: [{ src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }],
          },
          {
            name: "Add Expense",
            short_name: "Expense",
            description: "Log a new vehicle expense",
            url: "/expenses?action=add",
            icons: [{ src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }],
          },
          {
            name: "View Reports",
            short_name: "Reports",
            description: "View tax reports",
            url: "/reports",
            icons: [{ src: "pwa-512x512.png", sizes: "512x512", type: "image/png" }],
          },
        ],
        launch_handler: {
          client_mode: ["navigate-existing", "auto"],
        },
        handle_links: "preferred",
        edge_side_panel: {
          preferred_width: 400,
        },
        file_handlers: [
          {
            action: "/backup",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
        protocol_handlers: [
          {
            protocol: "web+kmcash",
            url: "/?source=%s",
          },
        ],
        share_target: {
          action: "/backup",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            files: [
              {
                name: "backup",
                accept: ["application/json", ".json"],
              },
            ],
          },
        },
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
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
