import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Local-only: serve and preview bind loopback. No proxy, no external origins.
// Single self-contained index.html: opens over file:// (literally zero requests)
// and over loopback preview/dev with the same bytes.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile({ useRecommendedBuildConfig: true })],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
