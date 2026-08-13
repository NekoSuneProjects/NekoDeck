import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const legacyLucideFix = {
  name: 'nekodeck-legacy-lucide-fix',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/src/App.jsx')) return null;
    return code
      .replace('Palette, Plus, PlusMinus, RefreshCw', 'Palette, Plus, RefreshCw')
      .replace('NotebookPen, PlusMinus, Timer', 'NotebookPen, PlusMinus: Plus, Timer');
  }
};

export default defineConfig({
  plugins: [legacyLucideFix, react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3210' }
  },
  build: { outDir: 'dist', sourcemap: true }
});
