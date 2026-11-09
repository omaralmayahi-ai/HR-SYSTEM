import { describe, it, expect } from 'vitest';
import { SALARY_TABLE, PROMOTION_YEARS, ANNUAL_INCREMENTS, formatCurrency } from './salaryTable';

describe('Salaries Scale Modal & Print Data Integrity (سلم الرواتب المعتمد والطباعة)', () => {
  it('should contain full valid salary data for grades 1 through 10 and steps 1 through 11', () => {
    for (let grade = 1; grade <= 10; grade++) {
      expect(SALARY_TABLE[grade]).toBeDefined();
      for (let step = 1; step <= 11; step++) {
        const amount = SALARY_TABLE[grade][step];
        expect(amount).toBeGreaterThan(0);
        expect(typeof amount).toBe('number');
      }
    }
  });

  it('should contain valid promotion years and annual increments for standard civil service grades', () => {
    // Grade 1 has no higher promotion
    expect(PROMOTION_YEARS[1]).toBeNull();
    // Grades 2 to 5 require 5 years
    for (let g = 2; g <= 5; g++) {
      expect(PROMOTION_YEARS[g]).toBe(5);
    }
    // Grades 6 to 10 require 4 years
    for (let g = 6; g <= 10; g++) {
      expect(PROMOTION_YEARS[g]).toBe(4);
    }

    // Annual increments must be positive numbers for all grades 1 to 10
    for (let g = 1; g <= 10; g++) {
      expect(ANNUAL_INCREMENTS[g]).toBeGreaterThan(0);
    }
  });

  it('should format currency consistently in IQD format', () => {
    const formatted = formatCurrency(910000);
    expect(formatted).toContain('د.ع');
    expect(formatted).toContain('٩١٠');
  });

  it('should verify HTML generation for standalone isolated printing without outer UI', () => {
    const grades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

    let rowsHtml = '';
    grades.forEach(g => {
      const promo = PROMOTION_YEARS[g] ? `${PROMOTION_YEARS[g]} سنوات` : '—';
      const inc = ANNUAL_INCREMENTS[g] ? `${new Intl.NumberFormat('ar-IQ').format(ANNUAL_INCREMENTS[g])} د.ع` : '—';
      let stepCells = '';
      steps.forEach(s => {
        const amount = SALARY_TABLE[g]?.[s] || 0;
        stepCells += `<td>${amount > 0 ? new Intl.NumberFormat('ar-IQ').format(amount) : '—'}</td>`;
      });
      rowsHtml += `<tr><td>الدرجة ${g}</td><td>${promo}</td><td>${inc}</td>${stepCells}</tr>`;
    });

    expect(rowsHtml).toContain('الدرجة 1');
    expect(rowsHtml).toContain('الدرجة 10');
    expect(rowsHtml).toContain('٩١٠');
    expect(rowsHtml).not.toContain('undefined');
  });
});
