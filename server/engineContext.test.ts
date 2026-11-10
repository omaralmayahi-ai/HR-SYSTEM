import { describe, it, expect } from 'vitest';
import { bothCases, loadAllEngineContexts } from './engineContext.ts';

// قاعدة وهمية: كل select().from(table) يعيد صفوف ذلك الجدول
function fakeDb(tables: Record<string, any[]>) {
  const q = (rows: any[]) => ({ where: () => Promise.resolve(rows), limit: () => Promise.resolve(rows.slice(0, 1)), then: (f: any, r: any) => Promise.resolve(rows).then(f, r) });
  return { select: () => ({ from: (t: any) => q(tables[t.__name] || []) }) };
}
const schemaProxy = new Proxy({}, { get: (_t, name: string) => ({ __name: name, employeeId: name + '.employeeId', id: name + '.id' }) });

describe('engineContext', () => {
  it('bothCases adds snake_case keys without overwriting existing ones', () => {
    expect(bothCases({ penaltyType: 'توبيخ', penalty_type: 'x' })).toEqual({ penaltyType: 'توبيخ', penalty_type: 'x' });
    expect(bothCases({ penaltyDate: '2025-06-01' })).toEqual({ penaltyDate: '2025-06-01', penalty_date: '2025-06-01' });
  });

  it('loadAllEngineContexts groups every per-employee table by employee', async () => {
    const db = fakeDb({
      employees: [{ id: 1, fullName: 'أ' }, { id: 2, fullName: 'ب' }],
      penalties: [{ id: 10, employeeId: 2, penaltyType: 'توبيخ' }],
      leaveRequests: [{ id: 20, employeeId: 1 }, { id: 21, employeeId: 1 }],
      gradePromotionRules: [{ grade: 7, promotionYears: 4 }],
    });
    const bulk = await loadAllEngineContexts(db, schemaProxy);
    expect(bulk.employees).toHaveLength(2);
    expect(bulk.get(2).penalties.map((p: any) => p.penalty_type)).toEqual(['توبيخ']);
    expect(bulk.get(1).penalties).toEqual([]);
    expect(bulk.get(1).leaves).toHaveLength(2);
    expect(bulk.get(1).gradeRules[0].promotion_years).toBe(4);
    expect(bulk.get(3).employee).toBeNull();
  });
});
