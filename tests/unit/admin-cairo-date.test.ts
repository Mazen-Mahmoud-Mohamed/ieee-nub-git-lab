import { describe, expect, it } from 'vitest';
import { cairoDayBoundary } from '../../src/features/instructor/cairoDate';
describe('Cairo calendar date boundaries', () => {
  it('uses the exact protected November 13 cutoff and an exclusive next-day boundary', () => {
    expect(cairoDayBoundary('2026-11-13')).toBe('2026-11-12T22:00:00.000Z');
    expect(cairoDayBoundary('2026-11-13', true)).toBe('2026-11-13T22:00:00.000Z');
  });
  it('handles summer time and a midnight skipped by the Cairo DST transition', () => {
    expect(cairoDayBoundary('2026-07-15')).toBe('2026-07-14T21:00:00.000Z');
    expect(cairoDayBoundary('2026-04-24')).toBe('2026-04-23T22:00:00.000Z');
  });
  it('rejects invalid calendar dates', () => {
    expect(() => cairoDayBoundary('2026-02-30')).toThrow();
  });
});
