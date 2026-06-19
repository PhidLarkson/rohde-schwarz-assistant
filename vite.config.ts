import { optimizeGLTF } from "@iwsdk/vite-plugin-gltf-optimizer";
import { injectIWER } from "@iwsdk/vite-plugin-iwer";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, type Plugin } from "vite";
import fs from "fs";
import path from "path";
import { networkInterfaces } from "os";

function getNetworkUrl(port: number, protocol: string): string | null {
  const nets = networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    if (!ifaces) continue;
    for (const iface of ifaces) {
      if (iface.family === "IPv4" && !iface.internal) {
        return `${protocol}://${iface.address}:${port}`;
      }
    }
  }
  return null;
}

function qrTerminal(): Plugin {
  return {
    name: "qr-terminal",
    configureServer(server) {
      server.httpServer?.once("listening", async () => {
        const addr = server.httpServer?.address();
        if (!addr || typeof addr === "string") return;
        const protocol = server.config.server.https ? "https" : "http";
        const url = getNetworkUrl(addr.port, protocol);
        if (!url) return;

        try {
          const { default: QRCode } = await import("qrcode");
          const qr = await QRCode.toString(url, {
            type: "terminal",
            small: true,
          });
          console.log("\n📱 Scan to open on another device:\n");
          console.log(qr);
          console.log(`  → ${url}\n`);
        } catch {
          console.log(`\n📱 Network URL: ${url}\n`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    qrTerminal(),
    injectIWER({
      device: "metaQuest3",
      activation: "localhost",
      verbose: true,
      sem: {
        defaultScene: "living_room",
      },
    }),

    compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
    optimizeGLTF({
      level: "medium",
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 8081,
    open: true,
    // Prefer local HTTPS certs when available (for WebXR on Quest),
    // otherwise fall back to plain HTTP for local development.
    https: (() => {
      const keyPath = path.resolve(__dirname, "localhost+3-key.pem");
      const certPath = path.resolve(__dirname, "localhost+3.pem");
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      }
      console.warn("HTTPS certs not found; running dev server without HTTPS.");
      return false;
    })(),
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.NODE_ENV !== "production",
    target: "esnext",
    rollupOptions: { input: "./index.html" },
  },
  esbuild: { target: "esnext" },
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },
  publicDir: "public",
  base: "./",
});
