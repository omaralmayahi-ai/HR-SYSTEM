import { describe, it, expect } from 'vitest';
import {
  normalizeCourseStatus, uiCourseStatus, toDbCourseStatus,
  normalizeEnrollmentResult, isPassingResult,
  resolveCoursePassingScore, computeEnrollmentGrade, nextCertificateNumber,
} from './governingCoursesEngine';

describe('Training vocabulary (حالة الدورة ونتيجة المتدرب)', () => {
  it('maps legacy UI statuses to DB values', () => {
    expect(normalizeCourseStatus('منفذة')).toBe('منتهي');
    expect(normalizeCourseStatus('غير منفذة')).toBe('مخطط');
    expect(normalizeCourseStatus('ملغاة')).toBe('ملغى');
    expect(normalizeCourseStatus('')).toBe('مخطط');
    expect(normalizeCourseStatus('جاري')).toBe('جاري');
  });

  it('plan execution counts executed courses after mapping', () => {
    const courses = ['منفذة', 'منتهي', 'غير منفذة', 'ملغاة'].map(s => ({ status: normalizeCourseStatus(s) }));
    expect(courses.filter(c => c.status === 'منتهي').length).toBe(2);
  });

  it('UI label round trip keeps جاري when label unchanged', () => {
    expect(uiCourseStatus('جاري')).toBe('منفذة');
    expect(toDbCourseStatus('منفذة', 'جاري')).toBe('جاري');
    expect(toDbCourseStatus('منفذة', 'مخطط')).toBe('منتهي');
    expect(toDbCourseStatus('ملغاة')).toBe('ملغى');
  });

  it('maps legacy results to DB pass values', () => {
    expect(normalizeEnrollmentResult('ناجح')).toBe('اجتاز');
    expect(normalizeEnrollmentResult('راسب')).toBe('لم يجتز');
    expect(isPassingResult('ناجح')).toBe(true);
    expect(isPassingResult('مشارك')).toBe(false);
  });
});

describe('Passing score from governing course', () => {
  const gov = [{ id: 3, course_name: 'دورة السلامة المهنية', min_passing_score: 70 }];
  it('uses min_passing_score of the matching governing course', () => {
    expect(resolveCoursePassingScore({ course_name: 'دورة السلامة المهنية' }, gov)).toBe(70);
    expect(resolveCoursePassingScore({ governing_course_id: 3, course_name: 'أخرى' }, gov)).toBe(70);
  });
  it('falls back to 60 (not 50)', () => {
    expect(resolveCoursePassingScore({ course_name: 'دورة عامة' }, gov)).toBe(60);
    expect(computeEnrollmentGrade(55).result).toBe('لم يجتز');
    expect(computeEnrollmentGrade(55).rating).toBe('مقبول');
    expect(computeEnrollmentGrade(60).result).toBe('اجتاز');
    expect(computeEnrollmentGrade(65, 70).result).toBe('لم يجتز');
    expect(computeEnrollmentGrade('').result).toBe('-');
  });
});

describe('Certificate numbers', () => {
  it('are sequential per year', () => {
    expect(nextCertificateNumber([], 2026)).toBe('CERT-2026-0001');
    expect(nextCertificateNumber(['CERT-2026-0001', 'CERT-2026-0007', 'CERT-2025-0099', 'CERT-12-3456'], 2026)).toBe('CERT-2026-0008');
    expect(nextCertificateNumber(['CERT-2025-0099'], 2025)).toBe('CERT-2025-0100');
  });
});
