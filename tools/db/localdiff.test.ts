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

import { compareObjectStore } from './localdiff.ts';

describe('compareObjectStore (review B2: B-1)', () => {
  it('flags course assignments that exist only in the file', () => {
    const r = compareObjectStore('inMemoryEmployeeAssignments', { '5': {}, '6': {} }, [{ employee_id: 5 }]);
    expect(r.missing).toBe(1);
  });
  it('flags a settings object when the table is empty', () => {
    expect(compareObjectStore('inMemoryExemptionRules', { rules: [1] }, []).missing).toBe(1);
  });
  it('reports differing keys of a single settings row', () => {
    const r = compareObjectStore('systemSettingsStore', { monthlyRegularLeaveDays: 3, maxRegularLeaveAccumulation: 200 }, [{ id: 1, monthly_regular_leave_days: 3, max_regular_leave_accumulation: 180 }]);
    expect(r.differ).toBe(1);
  });
});
