import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes the server to the Docker network (0.0.0.0)
    port: 5173,
    watch: {
      usePolling: true, // Crucial for detecting file saves in Docker volumes
    },
    hmr: {
      clientPort: 80, // Forces the browser to route the HMR WebSocket through Nginx (port 80)
    },
  },
});
