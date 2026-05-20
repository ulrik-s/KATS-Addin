/**
 * Mutation testing config for Stryker.
 *
 * Scope: pure domain + processor transforms. Adapter / UI layers are
 * out (they need an integration host) and so are schemas (zod
 * generators — mutations there mostly produce noise).
 *
 * Run via `yarn test:mutation`. Reports land in `reports/mutation/`
 * (HTML) and `coverage/mutation/` (clear-text on stdout).
 *
 * Thresholds are advisory only (`break: null`) until we have a
 * baseline. Once a baseline run completes, raise `break` to the
 * current floor minus 5 % so regressions fail CI.
 *
 * See `CLAUDE.md` → "Test discipline" for when to run mutation
 * testing during day-to-day development.
 */
export default {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',
  packageManager: 'yarn',
  testRunner: 'vitest',
  // Yarn PnP doesn't expose Stryker plugins via the normal
  // node_modules-based plugin discovery; declare them explicitly.
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: {
    configFile: 'vitest.config.ts',
  },
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },
  mutate: [
    'src/domain/**/*.ts',
    'src/processors/*/transform.ts',
    // Exclusions: generated artifacts + data tables (mutating numeric
    // constants there produces meaningless failures).
    '!src/domain/users.data.ts',
    '!src/app/headers-footers/canonical-images.generated.ts',
    '!src/**/*.test.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  // Concurrency: Stryker auto-detects but capping helps on CI runners.
  concurrency: 4,
  // Vitest itself is fast; default timeout suffices.
  timeoutMS: 60_000,
};
