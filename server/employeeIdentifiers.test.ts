import { describe, it, expect } from 'vitest';
import { normalizeEmployeeIdentifiers } from './employeeIdentifiers.ts';

describe('normalizeEmployeeIdentifiers', () => {
  it('turns blank identifiers into null and trims real ones', () => {
    expect(normalizeEmployeeIdentifiers({ companyNumber: ' 100001 ', civilServiceNumber: '', employeeIdNumber: '   ' }))
      .toEqual({ companyNumber: '100001', civilServiceNumber: null, employeeIdNumber: null });
  });
  it('leaves absent keys absent (partial updates do not clear identifiers)', () => {
    expect(normalizeEmployeeIdentifiers({ fullName: 'x' })).toEqual({ fullName: 'x' });
  });
  it('keeps numeric identifiers as trimmed strings', () => {
    expect(normalizeEmployeeIdentifiers({ civilServiceNumber: 555 as any })).toEqual({ civilServiceNumber: '555' });
  });
});
