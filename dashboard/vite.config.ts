import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const target = 'http://localhost:3000';
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../server/public/app', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': target, '/g': target, '/uploads': target, '/sdk': target } },
});
