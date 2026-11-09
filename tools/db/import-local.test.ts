import { describe, it, expect } from 'vitest';
import { toRow } from './import-local.ts';

describe('import-local toRow', () => {
  const cols = new Map([['id', 'int4'], ['employee_id', 'int4'], ['level', 'text'], ['details', 'text'], ['meta', 'jsonb']]);
  it('maps camelCase to columns, drops id and unknown keys, blanks to null', () => {
    expect(toRow({ id: 9, employeeId: 3, level: '', unknownKey: 1 }, cols)).toEqual({ employee_id: 3, level: null });
  });
  it('stringifies objects for text columns but keeps them for jsonb', () => {
    expect(toRow({ details: { a: 1 }, meta: { b: 2 } }, cols)).toEqual({ details: '{"a":1}', meta: { b: 2 } });
  });
  it('prefers the first spelling of a column (camel then snake)', () => {
    expect(toRow({ employeeId: 1, employee_id: 2 }, cols)).toEqual({ employee_id: 1 });
  });
});
