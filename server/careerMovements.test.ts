import { describe, it, expect } from 'vitest';
import { isIsoDate, todayBaghdad, normalizeFieldValue, knownStartDate, isTrackedField } from './careerMovements';

describe('careerMovements: دوال مساعدة (B4b)', () => {
  it('التاريخ بصيغة صحيحة وموجود فعلاً', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026/02/01')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
  it('اليوم بتوقيت بغداد (UTC+3)', () => {
    expect(todayBaghdad(new Date('2026-11-10T21:30:00Z'))).toBe('2026-11-11');
    expect(todayBaghdad(new Date('2026-11-10T20:59:00Z'))).toBe('2026-11-10');
  });
  it('تحويل القيم والتحقق منها', () => {
    expect(normalizeFieldValue('grade', '7')).toBe(7);
    expect(normalizeFieldValue('grade', 11)).toBe(11); // B8a0: الدرجات 11–13 بالسلّم
    expect(() => normalizeFieldValue('grade', 14)).toThrow();
    expect(normalizeFieldValue('org_unit_id', '12')).toBe(12);
    expect(() => normalizeFieldValue('org_unit_id', 'x')).toThrow();
    expect(normalizeFieldValue('free_transport', 'نعم')).toBe(true);
    expect(normalizeFieldValue('free_transport', false)).toBe(false);
    expect(() => normalizeFieldValue('step', 0)).toThrow();
    expect(normalizeFieldValue('step', 11)).toBe(11);
    expect(normalizeFieldValue('job_title', '  مهندس ')).toBe('مهندس');
    expect(normalizeFieldValue('department', '')).toBeNull();
  });
  it('سجل الأساس ما يخترع تاريخاً (ق-4)', () => {
    expect(knownStartDate('grade', { gradeDate: '2020-01-01' })).toBe('2020-01-01');
    expect(knownStartDate('grade', { gradeDate: 'خطأ', lastPromotionDate: '2019-05-05T00:00:00' })).toBe('2019-05-05');
    expect(knownStartDate('step', {})).toBeNull();
    expect(knownStartDate('job_title', { appointmentDate: '2010-01-01' })).toBeNull();
  });
  it('الحقول المتتبعة فقط', () => {
    expect(isTrackedField('grade')).toBe(true);
    expect(isTrackedField('salary')).toBe(false);
    expect(isTrackedField('constructor')).toBe(false);
  });
});

import { payFieldsChanged } from './careerMovements.ts';
describe('B8a0: حقول الرواتب', () => {
  it('يتعرّف على تغيير حقل رواتب فعلي فقط', () => {
    const cur = { grade: 7, step: 1, educationLevel: 'بكالوريوس', maritalStatus: 'أعزب', phone: '1' };
    expect(payFieldsChanged(cur, { grade: 7, step: '1', educationLevel: 'بكالوريوس', phone: '2' })).toEqual([]);
    expect(payFieldsChanged(cur, { grade: 8, maritalStatus: 'متزوج' })).toEqual(['grade', 'marital_status']);
    expect(payFieldsChanged({ workLocation: null }, { workLocation: '' })).toEqual([]);
    // أول إدخال لحقل فارغ = إكمال بيانات، مو تغيير
    expect(payFieldsChanged({ maritalStatus: null, grade: null }, { maritalStatus: 'أعزب', grade: 1 })).toEqual([]);
  });
});
