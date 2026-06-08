import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true, // accessible sur le réseau local (tests smartphone)
    // Autorise n'importe quel hôte → indispensable pour les tunnels (ngrok,
    // cloudflared, localtunnel) qui servent l'app via un domaine externe.
    allowedHosts: true,
    // Le client se connecte au Socket.io sur la même origine ; Vite relaie
    // /socket.io vers le backend. Ainsi un seul port (5173) suffit, que ce soit
    // en local, sur le LAN, ou via un tunnel.
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
