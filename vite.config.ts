import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
  // Pre-bundle everything up front so the dev server doesn't discover dependencies page by
  // page and force a full reload each time (lazy-only libs are listed explicitly).
  optimizeDeps: {
    include: [
      '@date-fns/tz',
      '@hookform/resolvers/zod',
      '@radix-ui/react-slot',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      '@supabase/supabase-js',
      '@tanstack/react-query',
      'class-variance-authority',
      'clsx',
      'date-fns',
      'framer-motion',
      'lucide-react',
      'react-hook-form',
      'recharts',
      'sonner',
      'tailwind-merge',
      'zod',
      '@react-pdf/renderer',
      'write-excel-file/browser',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          supabase: ['@supabase/supabase-js'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
});
