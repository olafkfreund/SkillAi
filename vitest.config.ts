import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Force NODE_ENV=test before workers fork. The Docker dev container exports
// NODE_ENV=production for the running app, which would otherwise propagate to
// vitest workers and cause React 19 to load `cjs/react.production.js` — which
// does not export `React.act`, breaking @testing-library/react.
process.env.NODE_ENV = 'test'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/db/migrations/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
