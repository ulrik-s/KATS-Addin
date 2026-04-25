import { describe, it, expect } from 'vitest';
import {
  combineDateAndTime,
  elapsedMinutesClamped,
  extractHearingTime,
  isTaxaHearingLine,
} from '../../src/domain/hearing-time.js';

describe('extractHearingTime', () => {
  it('extracts HH:MM from a typical hearing line', () => {
    expect(extractHearingTime('medverkat vid förhandling från kl. 14:30')).toEqual({
      hour: 14,
      minute: 30,
    });
  });

  it('handles huvudförhandling', () => {
    expect(extractHearingTime('medverkat vid huvudförhandling från kl. 09:00')).toEqual({
      hour: 9,
      minute: 0,
    });
  });

  it('accepts period as time separator', () => {
    expect(extractHearingTime('medverkat vid förhandling från kl. 09.00')).toEqual({
      hour: 9,
      minute: 0,
    });
  });

  it('treats missing minutes as 00', () => {
    expect(extractHearingTime('medverkat vid förhandling från 15')).toEqual({
      hour: 15,
      minute: 0,
    });
  });

  it('matches diacritic-stripped legacy text (loose regex)', () => {
    expect(extractHearingTime('medverkat vid forhandling fran kl. 14:30')).toEqual({
      hour: 14,
      minute: 30,
    });
  });

  it('matches NFD-normalized input', () => {
    expect(extractHearingTime('medverkat vid fo\u0308rhandling fra\u0308n kl. 14:30')).toEqual({
      hour: 14,
      minute: 30,
    });
  });

  it('returns undefined when no hearing pattern present', () => {
    expect(extractHearingTime('regular description')).toBeUndefined();
    expect(extractHearingTime('förhandling igår')).toBeUndefined();
  });

  it('rejects out-of-range hours', () => {
    expect(extractHearingTime('medverkat vid förhandling från kl. 25:30')).toBeUndefined();
  });

  it('rejects out-of-range minutes', () => {
    expect(extractHearingTime('medverkat vid förhandling från kl. 14:70')).toBeUndefined();
  });

  it('case-insensitive', () => {
    expect(extractHearingTime('MEDVERKAT VID FÖRHANDLING FRÅN KL. 09:00')).toEqual({
      hour: 9,
      minute: 0,
    });
  });
});

describe('isTaxaHearingLine', () => {
  it('detects "enligt taxa" tail after the hearing', () => {
    expect(isTaxaHearingLine('medverkat vid förhandling från kl. 09:00, enligt taxa')).toBe(true);
  });

  it('accepts no comma between time and "enligt taxa"', () => {
    expect(isTaxaHearingLine('medverkat vid förhandling från 09:00 enligt taxa')).toBe(true);
  });

  it('rejects when "enligt taxa" is far from the time', () => {
    expect(
      isTaxaHearingLine(
        'medverkat vid förhandling från kl. 09:00. Some unrelated text. enligt taxa.',
      ),
    ).toBe(false);
  });

  it('rejects when only hearing line without taxa', () => {
    expect(isTaxaHearingLine('medverkat vid förhandling från kl. 09:00')).toBe(false);
  });

  it('matches diacritic-stripped form', () => {
    expect(isTaxaHearingLine('medverkat vid forhandling fran 09:00 enligt taxa')).toBe(true);
  });
});

describe('elapsedMinutesClamped', () => {
  it('returns simple positive difference', () => {
    const start = new Date(2026, 3, 25, 9, 0);
    const now = new Date(2026, 3, 25, 11, 30);
    expect(elapsedMinutesClamped(start, now)).toBe(150);
  });

  it('wraps to 24h when now is before start (drafted ahead-of-time)', () => {
    const start = new Date(2026, 3, 25, 14, 0);
    const now = new Date(2026, 3, 25, 13, 0); // 1 hour earlier
    // 24*60 - 60 = 1380
    expect(elapsedMinutesClamped(start, now)).toBe(23 * 60);
  });

  it('clamps very large windows to 1440', () => {
    const start = new Date(2026, 3, 1, 9, 0);
    const now = new Date(2026, 3, 25, 9, 0);
    expect(elapsedMinutesClamped(start, now)).toBe(24 * 60);
  });
});

describe('combineDateAndTime', () => {
  it('builds a local-time Date with the given hour/minute', () => {
    const date = new Date(2026, 3, 25);
    const result = combineDateAndTime(date, { hour: 9, minute: 30 });
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(25);
    expect(result.getHours()).toBe(9);
    expect(result.getMinutes()).toBe(30);
  });
});
