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
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
});
