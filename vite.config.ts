import { defineConfig } from 'vitest/config';

// base './' so the static dist/ works from a project sub-path (GitHub Pages) or from the root.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
});
