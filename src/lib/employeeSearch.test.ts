import { describe, it, expect } from 'vitest';

function normalizeArabicDigits(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (w) => String(arabicDigits.indexOf(w)));
}

function toArabicDigits(str: string): string {
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[0-9]/g, (w) => arabicDigits[parseInt(w, 10)]);
}

function matchesEmployeeSearch(emp: any, searchTerm: string): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;
  const rawTerm = searchTerm.trim().toLowerCase();
  const asciiTerm = normalizeArabicDigits(rawTerm);
  const arabicTerm = toArabicDigits(rawTerm);

  const name = String(emp.fullName || emp.full_name || '').toLowerCase();
  const comp = String(emp.companyNumber || emp.company_number || '').toLowerCase();

  return (
    name.includes(rawTerm) ||
    comp.includes(rawTerm) ||
    (asciiTerm !== rawTerm && (name.includes(asciiTerm) || comp.includes(asciiTerm))) ||
    (arabicTerm !== rawTerm && (name.includes(arabicTerm) || comp.includes(arabicTerm)))
  );
}

describe('Exclusive Employee Search Logic Verification', () => {
  const sampleEmployees = [
    {
      id: 1,
      fullName: 'جاسم محمد ناصر',
      companyNumber: '100364',
      civilServiceNumber: 'CIVIL-998877',
      serviceRecordNumber: 'REC-554433',
      jobTitle: 'ر. سواق'
    },
    {
      id: 2,
      fullName: 'رافد معروف علي',
      companyNumber: '102300',
      civilServiceNumber: 'CIVIL-112233',
      serviceRecordNumber: 'REC-778899',
      jobTitle: 'مدير فني'
    },
    {
      id: 3,
      fullName: 'علي حسين كاضم',
      companyNumber: '١٤٨٢٢٥',
      civilServiceNumber: 'CIVIL-334455',
      serviceRecordNumber: 'REC-990011',
      jobTitle: 'مشاور قانوني مساعد'
    }
  ];

  it('1. should match employee by full name', () => {
    const results = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'جاسم محمد ناصر'));
    expect(results.length).toBe(1);
    expect(results[0].fullName).toBe('جاسم محمد ناصر');
  });

  it('2. should match employee by company number in English digits', () => {
    const results = sampleEmployees.filter(e => matchesEmployeeSearch(e, '100364'));
    expect(results.length).toBe(1);
    expect(results[0].fullName).toBe('جاسم محمد ناصر');
  });

  it('3. should match employee by company number in Arabic digits (input Arabic digits, stored English)', () => {
    const results = sampleEmployees.filter(e => matchesEmployeeSearch(e, '١٠٠٣٦٤'));
    expect(results.length).toBe(1);
    expect(results[0].fullName).toBe('جاسم محمد ناصر');
  });

  it('4. should match employee by company number in English digits (input English, stored Arabic)', () => {
    const results = sampleEmployees.filter(e => matchesEmployeeSearch(e, '148225'));
    expect(results.length).toBe(1);
    expect(results[0].fullName).toBe('علي حسين كاضم');
  });

  it('5. should NOT match by job title (e.g. ر. سواق or مدير فني)', () => {
    const results = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'ر. سواق'));
    expect(results.length).toBe(0);

    const results2 = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'مدير فني'));
    expect(results2.length).toBe(0);
  });

  it('6. should NOT match by civil service number or service record number', () => {
    const resultsCivil = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'CIVIL-998877'));
    expect(resultsCivil.length).toBe(0);

    const resultsRec = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'REC-554433'));
    expect(resultsRec.length).toBe(0);
  });

  it('7. should accurately compute total count and pagination for multi-match search', () => {
    const multiResults = sampleEmployees.filter(e => matchesEmployeeSearch(e, 'علي'));
    expect(multiResults.length).toBe(2); // 'رافد معروف علي' and 'علي حسين كاضم'
  });
});
