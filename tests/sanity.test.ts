import { describe, it, expect } from 'vitest';
import { KATS_ADDIN_VERSION, KATS_BUILD_KIND, KATS_GIT_BRANCH } from '../src/index.js';

describe('sanity', () => {
  it('wiring works', () => {
    expect(1 + 1).toBe(2);
  });

  it('exports build-stamped version constants (vitest stubs)', () => {
    // vitest.config.ts injects 'test' for all three; the values
    // themselves don't matter, just that the defines made it through.
    expect(KATS_ADDIN_VERSION).toBe('test');
    expect(KATS_GIT_BRANCH).toBe('test');
    expect(KATS_BUILD_KIND).toBe('test');
  });
});
