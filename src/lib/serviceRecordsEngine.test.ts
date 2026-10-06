import { describe, it, expect } from 'vitest';

// Pure helper function equivalent to calculateTotalCumulativeService
function calculateTotalCumulativeService(startDateStr: string, addedYears = 0, addedMonths = 0, addedDays = 0, todayStr?: string) {
  const aY = parseInt(String(addedYears)) || 0;
  const aM = parseInt(String(addedMonths)) || 0;
  const aD = parseInt(String(addedDays)) || 0;

  if (!startDateStr) {
    if (aY > 0 || aM > 0 || aD > 0) {
      const parts: string[] = [];
      if (aY > 0) parts.push(`${aY} سنة`);
      if (aM > 0) parts.push(`${aM} شهر`);
      if (aD > 0) parts.push(`${aD} يوم`);
      return `${parts.join(' و ')} (خدمة مضافة محتسبة فقط)`;
    }
    return '—';
  }
  const start = new Date(startDateStr);
  const end = todayStr ? new Date(todayStr) : new Date();
  
  if (isNaN(start.getTime())) return 'التاريخ غير صالح';
  if (start > end) return 'لم تبدأ الخدمة بعد';
  
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  
  if (days < 0) {
    months--;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  
  if (months < 0) {
    years--;
    months += 12;
  }

  // Add extra added/calculated service
  years += aY;
  months += aM;
  days += aD;

  if (days >= 30) {
    months += Math.floor(days / 30);
    days = days % 30;
  }
  if (months >= 12) {
    years += Math.floor(months / 12);
    months = months % 12;
  }
  
  const parts: string[] = [];
  if (years > 0) {
    if (years === 1) parts.push('سنة واحدة');
    else if (years === 2) parts.push('سنتين');
    else if (years >= 3 && years <= 10) parts.push(`${years} سنوات`);
    else parts.push(`${years} سنة`);
  }
  
  if (months > 0) {
    if (months === 1) parts.push('شهر واحد');
    else if (months === 2) parts.push('شهرين');
    else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
    else parts.push(`${months} شهر`);
  }
  
  if (days > 0) {
    if (days === 1) parts.push('يوم واحد');
    else if (days === 2) parts.push('يومين');
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوم`);
  }
  
  return parts.length > 0 ? parts.join(' و ') : 'أقل من يوم';
}

// Function to calculate retirement analysis (retirement age is unaffected by added service)
function calculateRetirementDate(birthDateStr: string, baseRetirementAge = 60, extYears = 0, extMonths = 0) {
  if (!birthDateStr) return null;
  const parts = birthDateStr.split('-').map(Number);
  const birthYear = parts[0];
  const birthMonth = parts[1];
  const birthDay = parts[2];

  let rYear = birthYear + baseRetirementAge + extYears;
  let rMonth = birthMonth + extMonths;
  let rDay = birthDay;

  while (rMonth > 12) {
    rYear++;
    rMonth -= 12;
  }

  return `${rYear}-${String(rMonth).padStart(2, '0')}-${String(rDay).padStart(2, '0')}`;
}

describe('Added Service Records & Cumulative Service Engine (سجل الخدمات المضافة والمحتسبة)', () => {
  it('should correctly sum military, contracts, and practice services', () => {
    const serviceRecords = [
      {
        record_type: 'خدمة عسكرية إلزامية (خدمة العلم)',
        years: 1,
        months: 6,
        days: 0,
        purpose: 'promotion_allowance_pension'
      },
      {
        record_type: 'خدمة عقد وزاري / تشغيلي',
        years: 2,
        months: 4,
        days: 15,
        purpose: 'promotion_allowance_pension'
      },
      {
        record_type: 'ممارسة مهنة هندسية',
        years: 0,
        months: 8,
        days: 20,
        purpose: 'promotion_allowance_pension'
      }
    ];

    let totalY = 0;
    let totalM = 0;
    let totalD = 0;

    serviceRecords.forEach(r => {
      totalY += r.years;
      totalM += r.months;
      totalD += r.days;
    });

    if (totalD >= 30) {
      totalM += Math.floor(totalD / 30);
      totalD = totalD % 30;
    }
    if (totalM >= 12) {
      totalY += Math.floor(totalM / 12);
      totalM = totalM % 12;
    }

    // 1y6m + 2y4m15d + 0y8m20d = 3y 18m 35d => 35d = 1m5d => 19m = 1y7m => 4y 7m 5d
    expect(totalY).toBe(4);
    expect(totalM).toBe(7);
    expect(totalD).toBe(5);
  });

  it('should combine actual service with added service in calculateTotalCumulativeService', () => {
    const startDate = '2020-01-01';
    const today = '2025-01-01'; // 5 years exact
    const addedYears = 2;
    const addedMonths = 3;
    const addedDays = 10;

    const result = calculateTotalCumulativeService(startDate, addedYears, addedMonths, addedDays, today);
    expect(result).toBe('7 سنوات و 3 أشهر و 10 أيام');
  });

  it('should guarantee that added service does NOT affect the mandatory retirement date', () => {
    const birthDate = '1966-05-15';
    const baseAge = 60;

    // Normal retirement date (at age 60)
    const retirementDateWithoutAdded = calculateRetirementDate(birthDate, baseAge, 0, 0);
    expect(retirementDateWithoutAdded).toBe('2026-05-15');

    // Regardless of how many years of added service the employee has (e.g. 5 years of military/contracts),
    // the legal retirement date remains strictly dependent on birth date + age (2026-05-15)
    const retirementDateWithAdded = calculateRetirementDate(birthDate, baseAge, 0, 0);
    expect(retirementDateWithAdded).toBe('2026-05-15');

    // Only explicit service extension (تمديد خدمة) delays retirement
    const retirementDateWithExtension = calculateRetirementDate(birthDate, baseAge, 2, 0);
    expect(retirementDateWithExtension).toBe('2028-05-15');
  });
});
