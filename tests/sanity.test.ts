import { describe, it, expect } from 'vitest';
import { KATS_ADDIN_VERSION } from '../src/index.js';

describe('sanity', () => {
  it('wiring works', () => {
    expect(1 + 1).toBe(2);
  });

  it('exports version constant', () => {
    expect(KATS_ADDIN_VERSION).toBe('0.0.0');
  });
});
