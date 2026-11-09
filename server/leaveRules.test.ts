import { describe, it, expect, vi } from 'vitest';
import { resolveAccrualParams, accrueBalance, isValidAccrualMonth, ACCRUAL_UPDATE_SQL, ACCRUAL_CLAIM_SQL } from './leaveAccrual';
import { normalizeLeaveStatus, isApprovedLeaveStatus, leaveStatusVariants, toEngineLeave, LEAVE_STATUS } from './leaveStatus';
import { isPassingEnrollmentResult, buildTrainingCourseFromEnrollment, syncEnrollmentToTrainingCourses } from './trainingSync';

describe('leave accrual rules', () => {
  it('defaults to 3 days/month ordinary leave and a 180-day cap', () => {
    const p = resolveAccrualParams({});
    expect(p.regularDays).toBe(3);
    expect(p.regularCap).toBe(180);
    expect(p.sickDays).toBe(2.5);
  });
  it('never allows the ordinary cap above the legal 180 days', () => {
    expect(resolveAccrualParams({ maxRegularLeaveAccumulation: 10000 }).regularCap).toBe(180);
    expect(resolveAccrualParams({ maxRegularLeaveAccumulation: 120 }).regularCap).toBe(120);
  });
  it('accrues as decimals without integer rounding drift', () => {
    let bal = 0;
    for (let m = 0; m < 12; m++) bal = accrueBalance(bal, 2.5, 180);
    expect(bal).toBe(30); // Math.round(cur + 2.5) used to give 36
    expect(accrueBalance(10.25, 3, 180)).toBe(13.25);
  });
  it('caps at 180 and never reduces a balance already above the cap', () => {
    expect(accrueBalance(178, 3, 180)).toBe(180);
    expect(accrueBalance(392, 3, 180)).toBe(392);
  });
  it('validates the month key and keeps the claim idempotent in SQL', () => {
    expect(isValidAccrualMonth('2026-11')).toBe(true);
    expect(isValidAccrualMonth('2026-13')).toBe(false);
    expect(isValidAccrualMonth(undefined)).toBe(false);
    expect(ACCRUAL_CLAIM_SQL).toMatch(/ON CONFLICT \(month\) DO NOTHING/);
    expect(ACCRUAL_UPDATE_SQL).not.toMatch(/ROUND\([^)]*\)::integer/);
  });
});

describe('leave status vocabulary', () => {
  it('maps all legacy approval spellings to «معتمد»', () => {
    for (const v of ['معتمد', 'مقبولة', 'موافق_عليها', 'approved', ' مقبولة ']) {
      expect(normalizeLeaveStatus(v)).toBe(LEAVE_STATUS.APPROVED);
      expect(isApprovedLeaveStatus(v)).toBe(true);
    }
    expect(isApprovedLeaveStatus('معلق')).toBe(false);
    expect(normalizeLeaveStatus('مرفوضة')).toBe('مرفوض');
    expect(normalizeLeaveStatus('')).toBeNull();
  });
  it('lists stored variants for SQL filters', () => {
    expect(leaveStatusVariants('معتمد')).toEqual(expect.arrayContaining(['معتمد', 'مقبولة', 'موافق_عليها']));
    expect(leaveStatusVariants('معلق')).toContain('معلق');
  });
  it('translates approved leaves for the promotion engine vocabulary', () => {
    expect(toEngineLeave({ status: 'معتمد' }).status).toBe('approved');
    expect(toEngineLeave({ status: 'معلق' }).status).toBe('معلق');
  });
});

describe('training enrolment sync', () => {
  it('accepts both result vocabularies', () => {
    expect(isPassingEnrollmentResult('ناجح')).toBe(true);
    expect(isPassingEnrollmentResult('اجتاز')).toBe(true);
    expect(isPassingEnrollmentResult('مشارك')).toBe(true);
    expect(isPassingEnrollmentResult('راسب')).toBe(false);
    expect(isPassingEnrollmentResult(null)).toBe(false);
  });
  it('builds a row keyed by the source training', () => {
    const row = buildTrainingCourseFromEnrollment({ id: 7, courseName: 'دورة', days: 5, startDate: '2026-01-01' }, { employeeId: 3, result: 'ناجح', score: 88 });
    expect(row.sourceTrainingId).toBe(7);
    expect(row.employeeId).toBe(3);
    expect(row.average).toBe('88');
  });

  function fakeTx(existing: any[], course: any) {
    const calls: string[] = [];
    const chain = (result: any) => {
      const p: any = Promise.resolve(result);
      p.where = () => chain(result);
      p.limit = () => Promise.resolve(result);
      return p;
    };
    let selectCount = 0;
    const tx = {
      select: () => ({ from: () => chain(selectCount++ === 0 ? existing : [course]) }),
      insert: () => ({ values: (v: any) => { calls.push('insert'); return Promise.resolve(v); } }),
      update: () => ({ set: () => ({ where: () => { calls.push('update'); return Promise.resolve(); } }) }),
      delete: () => ({ where: () => { calls.push('delete'); return Promise.resolve(); } })
    };
    return { tx, calls };
  }
  const schema = { trainingCourses: { employeeId: 'e', sourceTrainingId: 's', id: 'i' }, trainings: { id: 'tid' } };
  const ops = { eq: vi.fn(() => true), and: vi.fn(() => true) };

  it('inserts once, then updates on later edits (no duplicates)', async () => {
    const first = fakeTx([], { id: 1, courseName: 'c' });
    expect((await syncEnrollmentToTrainingCourses(first.tx, schema, ops, { employeeId: 2, trainingId: 1, result: 'ناجح' })).action).toBe('inserted');
    const second = fakeTx([{ id: 9 }], { id: 1, courseName: 'c' });
    expect((await syncEnrollmentToTrainingCourses(second.tx, schema, ops, { employeeId: 2, trainingId: 1, result: 'ناجح' })).action).toBe('updated');
    expect(second.calls).toEqual(['update']);
  });
  it('removes the synced row when the result is changed to a fail', async () => {
    const t = fakeTx([{ id: 9 }], null);
    expect((await syncEnrollmentToTrainingCourses(t.tx, schema, ops, { employeeId: 2, trainingId: 1, result: 'راسب' })).action).toBe('removed');
  });
});
