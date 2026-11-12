import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['sweetalert2'],
    exclude: ['lucide-react'],
  },
  build: {
    // Pages are lazy-loaded (see App.tsx), so each page downloads only the code it needs.
    rollupOptions: {
      output: {
        // Only React gets a named chunk (the entry needs it anyway, and it rarely changes, so it stays
        // cached across deploys). Charts, PDF and Excel are imported only by lazy-loaded pages, so Rollup
        // already splits them into on-demand chunks; naming them here would make Rollup pull shared helpers
        // into them and the entry would then preload them on every page.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const pkg = id.split("node_modules/").pop()!.split("/")[0];
          return ["react", "react-dom", "react-router", "react-router-dom", "scheduler"].includes(pkg) ? "vendor-react" : undefined;
        },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
