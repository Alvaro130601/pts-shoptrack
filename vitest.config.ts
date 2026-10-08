import { defineConfig } from 'vitest/config';

// vite.config.ts usa root 'web'; los tests de reglas y fuentes viven en tests/ en la raíz.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
