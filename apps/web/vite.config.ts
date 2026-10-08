import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_URL = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3333';

export default defineConfig({
  plugins: [react()],
  server: {
    // Só na máquina local, como a API.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // O front chama /api/... e o Vite repassa para a API — sem CORS no dev.
    proxy: {
      '/api': API_URL,
    },
  },
  preview: {
    host: '127.0.0.1',
  },
});
