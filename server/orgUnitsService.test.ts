import { describe, it, expect } from 'vitest';
import { unitPaths, resolveOrgUnitId, descendantsOf } from './orgUnitsService';

const units = [
  { id: 1, name: 'هيئة الموارد', parentId: null },
  { id: 2, name: 'قسم الأفراد', parentId: 1 },
  { id: 3, name: 'شعبة الملفات', parentId: 2 },
  { id: 4, name: 'هيئة المالية', parentId: null },
  { id: 5, name: 'شعبة الملفات', parentId: 4 }, // نفس الاسم تحت جهة ثانية
  { id: 6, name: 'يتيمة', parentId: 99 },       // أبوها مفقود = جذر (كالواجهة)
];

describe('orgUnitsService (B5)', () => {
  it('المسار الكامل مطابق لـ getHierarchyChain بالواجهة', () => {
    const p = unitPaths(units);
    expect(p.get(3)).toBe('هيئة الموارد / قسم الأفراد / شعبة الملفات');
    expect(p.get(6)).toBe('يتيمة');
  });
  it('يربط بالمسار أولاً، ثم باسم وحيد، ويترك الملتبس فارغاً', () => {
    expect(resolveOrgUnitId(units, 'شعبة الملفات', 'هيئة المالية / شعبة الملفات')).toBe(5);
    expect(resolveOrgUnitId(units, 'شعبة الملفات', '')).toBeNull(); // اسم مكرر بلا مسار
    expect(resolveOrgUnitId(units, 'قسم الأفراد', 'نص قديم')).toBe(2);
    expect(resolveOrgUnitId(units, '', '')).toBeNull();
  });
  it('الفروع كلها (لمنع الحلقة والإنهاء الجماعي)', () => {
    expect(descendantsOf(units, 1).sort()).toEqual([2, 3]);
    expect(descendantsOf(units, 3)).toEqual([]);
  });
  it('ما يعلك بحلقة', () => {
    const loop = [{ id: 1, name: 'أ', parentId: 2 }, { id: 2, name: 'ب', parentId: 1 }];
    expect(() => unitPaths(loop)).not.toThrow();
  });
});

describe('attachOrgUnit (B5)', async () => {
  const { attachOrgUnit } = await import('./orgUnitsService');
  const fakeDb: any = { select: () => ({ from: () => ({ where: async () => [{ validTo: null }] }) }) };
  const opts = (cur: number | null) => ({ currentOrgUnitId: cur, units });
  it('نفس الوحدة: ما يمس النصين', async () => {
    const t: any = { section: 'نص قديم', orgUnitId: 2 };
    await attachOrgUnit(fakeDb, {}, t, { org_unit_id: 2, section: 'نص قديم' }, opts(2));
    expect(t).toEqual({ section: 'نص قديم' });
  });
  it('وحدة جديدة: يشتق النصين', async () => {
    const t: any = {};
    await attachOrgUnit(fakeDb, { orgUnits: {} }, t, { org_unit_id: 3 }, opts(2));
    expect(t).toEqual({ orgUnitId: 3, department: 'شعبة الملفات', section: 'هيئة الموارد / قسم الأفراد / شعبة الملفات' });
  });
  it('null صريح يفك الربط', async () => {
    const t: any = {};
    await attachOrgUnit(fakeDb, {}, t, { org_unit_id: null, department: 'لم يحدد بعد' }, opts(2));
    expect(t.orgUnitId).toBeNull();
  });
  it('نص ملتبس ما يمسح الربط الموجود', async () => {
    const t: any = { orgUnitId: 9 };
    await attachOrgUnit(fakeDb, {}, t, { department: 'شعبة الملفات' }, opts(2));
    expect('orgUnitId' in t).toBe(false);
  });
});
