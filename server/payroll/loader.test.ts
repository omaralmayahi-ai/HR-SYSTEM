// B8a2: نسخة المعاينة المقترحة تقص النسخ المتداخلة ولا تحذفها (مراجعة H3).
import { describe, it, expect } from 'vitest';
import { withProposedVersion } from './loader.ts';

describe('withProposedVersion', () => {
  const cur = { id: 1, validFrom: '2026-01-01', validTo: null, props: { status: 'فعّال', value: 1 } };
  it('النسخة المفتوحة تُقص لليوم السابق للمقترحة', () => {
    const vs = withProposedVersion([cur], '2026-03-16', null, { value: 2 });
    expect(vs.map(v => [v.id, v.validFrom, v.validTo])).toEqual([[-1, '2026-03-16', null], [1, '2026-01-01', '2026-03-15']]);
  });
  it('مقترحة محدودة بالوسط تُبقي الطرفين', () => {
    const vs = withProposedVersion([cur], '2026-03-10', '2026-03-20', { value: 2 });
    expect(vs.map(v => [v.id, v.validFrom, v.validTo])).toEqual([[-1, '2026-03-10', '2026-03-20'], [1, '2026-01-01', '2026-03-09'], [1, '2026-03-21', null]]);
  });
  it('نسخة غير متداخلة تبقى كما هي', () => {
    const old = { id: 2, validFrom: '2025-01-01', validTo: '2025-12-31', props: {} };
    expect(withProposedVersion([old], '2026-01-01', null, {}).find(v => v.id === 2)).toEqual(old);
  });
});
