import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Stub the same build-time defines that vite.config.ts injects, so
  // src/index.ts (and any consumer of these globals) compiles under
  // vitest without ReferenceError. Values intentionally don't try to
  // mimic real git state — tests should not depend on them.
  define: {
    __KATS_GIT_DESCRIBE__: JSON.stringify('test'),
    __KATS_GIT_BRANCH__: JSON.stringify('test'),
    __KATS_BUILD_KIND__: JSON.stringify('test'),
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/index.ts',
        // Adapter & UI layers depend on Office.js / browser DOM and
        // need an integration harness to exercise. Excluded from the
        // floor so the floor reflects pure-logic coverage only.
        'src/adapters/**',
        'src/ui/**',
        'src/app/orchestrator.ts',
        'src/app/storage.ts',
        'src/app/headers-footers/**',
        'src/index.ts',
      ],
      // Floors are scoped narrowly so adding new domain logic without
      // tests fails CI immediately. Raise these over time as coverage
      // climbs. See CLAUDE.md → "Test discipline".
      thresholds: {
        'src/domain/**': {
          statements: 95,
          lines: 95,
          branches: 90,
          functions: 95,
        },
        'src/core/**': {
          statements: 90,
          lines: 90,
          branches: 85,
          functions: 90,
        },
        'src/processors/**/transform.ts': {
          statements: 95,
          lines: 95,
          branches: 85,
          functions: 95,
        },
      },
    },
  },
});
