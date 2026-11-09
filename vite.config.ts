import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

// Relative base, damit der Build unter https://<user>.github.io/<repo>/ funktioniert.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
