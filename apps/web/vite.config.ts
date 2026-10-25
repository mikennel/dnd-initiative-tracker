import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = `http://localhost:${process.env.SERVER_PORT ?? 5175}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // reachable from the LAN (tablet / TV) in dev too
    port: 5173,
    proxy: {
      '/api': server,
      '/ws': { target: server.replace('http', 'ws'), ws: true },
    },
  },
});
