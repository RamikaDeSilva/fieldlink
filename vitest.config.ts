import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@qvac/sdk'],
  },
  ssr: {
    external: ['@qvac/sdk'],
  },
  test: {
    server: {
      deps: {
        external: ['/@qvac\\/sdk/'],
      },
    },
    projects: [
      {
        test: {
          name: 'contract',
          include: ['packages/contract/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'triage',
          include: ['packages/triage/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'transport',
          include: ['packages/transport/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          include: ['apps/**/*.test.tsx'],
          exclude: ['apps/civilian/**'],
          environment: 'jsdom',
          setupFiles: ['./apps/test-setup.ts'],
        },
      },
      {
        test: {
          name: 'apps',
          include: ['apps/**/*.test.ts'],
          exclude: ['apps/civilian/**'],
          environment: 'node',
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'civilian',
          include: ['apps/civilian/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./apps/test-setup.ts'],
        },
      },
      {
        test: {
          name: 'evals',
          include: ['packages/evals/**/*.test.ts'],
          exclude: ['packages/evals/**/*.qvac.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['e2e/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
      {
        test: {
          name: 'evals-qvac',
          include: ['packages/evals/**/*.qvac.test.ts'],
          environment: 'node',
          testTimeout: 120_000,
        },
      },
    ],
  },
});
