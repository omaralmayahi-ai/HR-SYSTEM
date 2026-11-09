import { describe, it, expect } from 'vitest';
import { normalizeHeader, getColValue, getColRaw, toIsoDate, defaultDuplicateAction } from './importParsing';

describe('importParsing', () => {
  it('exact header match: «الحالة» does not match «الحالة الاجتماعية»', () => {
    const row = { 'الحالة الاجتماعية': 'متزوج' };
    expect(getColValue(row, ['حالة الموظف', 'الحالة'])).toBe('');
    expect(getColValue({ 'الحالة': 'مستمر', 'الحالة الاجتماعية': 'متزوج' }, ['الحالة'])).toBe('مستمر');
  });

  it('normalizes spaces, hamza and punctuation', () => {
    expect(normalizeHeader(' الاسم  الأول * ')).toBe(normalizeHeader('الاسم الاول'));
    expect(getColValue({ 'القسم / الدائرة': 'قسم ١' }, ['القسم/الدائرة'])).toBe('قسم ١');
  });

  it('converts Excel serial numbers to ISO without timezone shift', () => {
    expect(toIsoDate(45375).value).toBe('2024-03-24');
    expect(toIsoDate(41357).value).toBe('2013-03-24');
    expect(toIsoDate(1).value).toBe(''); // خارج المدى ⇒ خطأ
    expect(toIsoDate(1).error).toBeTruthy();
  });

  it('parses text dates (ISO and Iraqi d/m/y) and rejects garbage', () => {
    expect(toIsoDate('2013-3-4').value).toBe('2013-03-04');
    expect(toIsoDate('24/03/2013').value).toBe('2013-03-24');
    expect(toIsoDate('2013/02/30').error).toBeTruthy();
    expect(toIsoDate('Sun Mar 24 2013 00:00:00 GMT+0300').error).toBeTruthy();
    expect(toIsoDate('').value).toBe('');
    expect(toIsoDate('').error).toBeNull();
  });

  it('Date objects use local calendar components', () => {
    expect(toIsoDate(new Date(2013, 2, 24)).value).toBe('2013-03-24');
  });

  it('getColRaw keeps raw numbers for date conversion', () => {
    expect(getColRaw({ 'تاريخ الميلاد': 32456 }, ['تاريخ الميلاد'])).toBe(32456);
  });

  it('duplicates default to skip', () => {
    expect(defaultDuplicateAction(true)).toBe('skip');
    expect(defaultDuplicateAction(false)).toBe('insert');
  });
});
