import { describe, it, expect } from 'vitest';
import { scanTags } from '../../src/core/tag-scanner.js';
import { TagScanError } from '../../src/core/errors.js';

describe('scanTags', () => {
  it('returns empty array for text with no markers', () => {
    expect(scanTags('plain document body')).toEqual([]);
    expect(scanTags('')).toEqual([]);
  });

  it('pairs a single tag', () => {
    const text = 'before [[KATS_UTLAGG_START]]content[[KATS_UTLAGG_END]] after';
    const matches = scanTags(text);
    expect(matches).toHaveLength(1);
    const [match] = matches;
    expect(match?.name).toBe('UTLAGG');
    expect(match?.tag as unknown as string).toBe('KATS_UTLAGG');
    expect(text.slice(match?.contentStart, match?.contentEnd)).toBe('content');
    expect(text.slice(match?.startIndex, match?.endIndex)).toBe(
      '[[KATS_UTLAGG_START]]content[[KATS_UTLAGG_END]]',
    );
  });

  it('pairs multiple sibling tags in document order', () => {
    const text =
      '[[KATS_MOTTAGARE_START]]A[[KATS_MOTTAGARE_END]]middle' +
      '[[KATS_SIGNATUR_START]]B[[KATS_SIGNATUR_END]]';
    const matches = scanTags(text);
    expect(matches.map((m) => m.name)).toEqual(['MOTTAGARE', 'SIGNATUR']);
  });

  it('handles all eight real KATS tag names', () => {
    const tagNames = [
      'UTLAGGSSPECIFIKATION',
      'ARGRUPPERTIDERDATUMANTALSUMMA',
      'ARVODE',
      'ARVODE_TOTAL',
      'MOTTAGARE',
      'SIGNATUR',
      'YTTRANDE_SIGNATUR',
      'YTTRANDE_PARTER',
    ];
    const text = tagNames.map((n) => `[[KATS_${n}_START]]x[[KATS_${n}_END]]`).join(' ');
    const matches = scanTags(text);
    expect(matches.map((m) => m.name)).toEqual(tagNames);
  });

  it('preserves content including Swedish diacritics', () => {
    const text = '[[KATS_MOTTAGARE_START]]Åsa Östlund, förhandling[[KATS_MOTTAGARE_END]]';
    const [match] = scanTags(text);
    expect(text.slice(match?.contentStart, match?.contentEnd)).toBe('Åsa Östlund, förhandling');
  });

  it('allows empty content between tags', () => {
    const text = '[[KATS_SIGNATUR_START]][[KATS_SIGNATUR_END]]';
    const [match] = scanTags(text);
    expect(match?.contentStart).toBe(match?.contentEnd);
  });

  it('throws on an unclosed start tag', () => {
    const text = '[[KATS_UTLAGG_START]]content and no end';
    expect(() => scanTags(text)).toThrow(TagScanError);
  });

  it('throws on an end tag with no start', () => {
    const text = 'orphan [[KATS_UTLAGG_END]]';
    expect(() => scanTags(text)).toThrow(TagScanError);
  });

  it('throws on a duplicate start before the end', () => {
    const text = '[[KATS_UTLAGG_START]]a[[KATS_UTLAGG_START]]b[[KATS_UTLAGG_END]]';
    expect(() => scanTags(text)).toThrow(TagScanError);
  });

  it('throws on overlapping tags', () => {
    // A opens, B opens, A closes while B still open -> overlap
    const text = '[[KATS_ARVODE_START]][[KATS_UTLAGG_START]][[KATS_ARVODE_END]][[KATS_UTLAGG_END]]';
    expect(() => scanTags(text)).toThrow(TagScanError);
  });

  it('throws on multiple unclosed tags at end-of-document', () => {
    const text = '[[KATS_ARVODE_START]][[KATS_UTLAGG_START]]';
    expect(() => scanTags(text)).toThrow(TagScanError);
  });

  it('ignores unrelated bracket-like text', () => {
    const text = 'ref: [1] see [[not_kats]] and [[KATS_NOT_CLOSED';
    expect(scanTags(text)).toEqual([]);
  });

  it('indices are correct for rendering reinsertion', () => {
    const text = 'AB[[KATS_SIGNATUR_START]]C[[KATS_SIGNATUR_END]]D';
    const [match] = scanTags(text);
    expect(match?.startIndex).toBe(2);
    expect(text.slice(match?.startIndex, match?.endIndex)).toBe(
      '[[KATS_SIGNATUR_START]]C[[KATS_SIGNATUR_END]]',
    );
    expect(text.slice(0, match?.startIndex)).toBe('AB');
    expect(text.slice(match?.endIndex)).toBe('D');
  });
});
