import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Content Security Policy — applied in both dev server and preview.
// This limits XSS blast radius: an injected script can't exfiltrate
// localStorage health data to an arbitrary external host.
//
// Permitted connections:
//   - 'self'                        — same-origin API / HMR
//   - https://api.anthropic.com     — Dr. Aria / progress reports
//
// 'unsafe-inline' for style-src is required because the app uses inline
// React style objects throughout. Script-src intentionally omits it.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'self' https://api.anthropic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

function cspPlugin() {
  return {
    name: "csp-headers",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Content-Security-Policy", CSP);
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Content-Security-Policy", CSP);
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "no-referrer");
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  server: {
    port: parseInt(process.env.PORT) || 5175,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["phonemizer", "espeak-ng"],
  },
});
