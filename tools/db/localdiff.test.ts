import { describe, it, expect } from 'vitest';
import { norm, diffRecord } from './localdiff.ts';

describe('localdiff normalisation', () => {
  it('treats blank and null as equal, numbers and numeric strings as equal, ISO midnight as a date', () => {
    expect(norm('')).toBeNull();
    expect(norm('  ')).toBeNull();
    expect(norm('12')).toBe(12);
    expect(norm('2020-01-05T00:00:00.000Z')).toBe('2020-01-05');
  });
  it('compares camelCase file records to snake_case rows and ignores ids and timestamps', () => {
    const cols = new Set(['id', 'full_name', 'grade', 'created_at', 'company_number']);
    expect(diffRecord({ id: 1, fullName: 'A', grade: '5', createdAt: 'x', companyNumber: '' }, { id: 1, full_name: 'A', grade: 5, created_at: 'y', company_number: null }, cols)).toEqual([]);
    expect(diffRecord({ fullName: 'B' }, { full_name: 'A' }, cols)).toEqual(['full_name']);
  });
  it('ignores file fields that have no column', () => {
    expect(diffRecord({ derivedThing: 1 }, {}, new Set(['id']))).toEqual([]);
  });
});
