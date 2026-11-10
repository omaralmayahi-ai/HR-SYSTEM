import { describe, it, expect } from 'vitest';
import { mapKeys, camelToSnake, snakeToCamel } from './caseMap.ts';
describe('caseMap', () => {
  it('round-trips nested keys and keeps dates', () => {
    const d = new Date(0);
    const o = mapKeys({ fullName: 'x', nested: [{ orderDate: d }] }, camelToSnake);
    expect(o).toEqual({ full_name: 'x', nested: [{ order_date: d }] });
    expect(mapKeys(o, snakeToCamel)).toEqual({ fullName: 'x', nested: [{ orderDate: d }] });
  });
});
