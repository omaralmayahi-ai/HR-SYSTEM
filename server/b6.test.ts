import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSharedSettingKey as serverIsShared } from './sharedSettingsKeys';
import { specializationWeeksOf, isSpecializationCourse } from './trainingSync';
import { calculateDegreeTrackSimulation, getAvailableSpecializationCredits } from '../src/lib/degreeTrackEngine';

describe('B6: مفاتيح الإعدادات المشتركة', () => {
  it('القائمة نفسها بالخادم والواجهة', async () => {
    vi.doMock('@/api/apiClient', () => ({ apiClient: {} }));
    const client = await import('../src/lib/sharedSettings.js');
    for (const k of ['ALLOWANCE_RULES_12', 'TEMPORARY_META_abc', 'PROMOTION_PATHS_MATRIX', 'hr_custom_issuers', 'hr_session_token', 'sidebar-collapsed', 'ALLOWANCE_RULES_', 'ALLOWANCE_RULES_../x', 'PENALTY_TYPES_PRESETS']) {
      expect(client.isSharedSettingKey(k)).toBe(serverIsShared(k));
    }
    expect(serverIsShared('ALLOWANCE_RULES_12')).toBe(true);
    expect(serverIsShared('hr_session_token')).toBe(false); // رمز الجلسة ما يُشارك أبداً
    expect(serverIsShared('PENALTY_TYPES_PRESETS')).toBe(false); // نسخة جدول بالقاعدة
    expect(serverIsShared('ALLOWANCE_RULES_../x')).toBe(false);
    expect(client.SHARED_SETTING_KEYS).toEqual((await import('./sharedSettingsKeys')).SHARED_SETTING_KEYS);
  });
});

describe('B6: مزامنة المتصفح مع الخادم', () => {
  class FakeStorage {
    m = new Map<string, string>();
    get length() { return this.m.size; }
    key(i: number) { return [...this.m.keys()][i] ?? null; }
    getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string) { this.m.set(k, String(v)); }
    removeItem(k: string) { this.m.delete(k); }
  }
  let ls: any; let puts: any[]; let server: any;
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    ls = new FakeStorage();
    (globalThis as any).Storage = FakeStorage;
    (globalThis as any).window = { localStorage: ls, dispatchEvent: () => true, addEventListener: () => {} };
    (globalThis as any).CustomEvent = class { constructor(public type: string, public init: any) {} };
    puts = [];
    server = { settings: {}, versions: {} };
    vi.doMock('@/api/apiClient', () => ({ apiClient: { sharedSettings: {
      getAll: async () => server,
      put: async (k: string, v: any, s: string, base: any) => { puts.push([k, v, s, base]); return { success: true, version: 'v2' }; },
    } } }));
  });

  it('الخادم يغلب، المحلي المختلف نسخة احتياطية، المحذوف يُحذف، والقديم يُنقل مرة وحدة', async () => {
    server = { settings: { ALLOWANCE_RULES_1: '{"server":1}', TEMPORARY_META_9: null }, versions: { ALLOWANCE_RULES_1: 'v1', TEMPORARY_META_9: 'v1' } };
    ls.setItem('ALLOWANCE_RULES_1', '{"local":1}');
    ls.setItem('TEMPORARY_META_9', 'old');           // محذوف بالخادم
    ls.setItem('ALLOWANCE_RULES_2', '{"only-local":2}');
    ls.setItem('hr_custom_issuers', '["جهة"]');
    ls.setItem('hr_session_token', 'secret');
    const mod = await import('../src/lib/sharedSettings.js');
    const r = await mod.hydrateSharedSettings('admin');
    expect(ls.getItem('ALLOWANCE_RULES_1')).toBe('{"server":1}');
    expect(ls.getItem('HR_LOCAL_BACKUP:ALLOWANCE_RULES_1')).toBe('{"local":1}');
    expect(ls.getItem('TEMPORARY_META_9')).toBeNull();
    expect(r.uploaded).toBe(2);
    await vi.runAllTimersAsync();
    expect(puts.map(p => [p[0], p[2]]).sort()).toEqual([['ALLOWANCE_RULES_2', 'imported-local-storage'], ['hr_custom_issuers', 'imported-local-storage']]);

    // دخول ثاني: ما يُعاد النقل
    puts = [];
    await mod.hydrateSharedSettings('admin');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([]);

    // كتابة لاحقة تنرسل ويا النسخة الأخيرة؛ رمز الجلسة ما ينرسل
    ls.setItem('ALLOWANCE_RULES_1', '{"edited":1}');
    ls.setItem('hr_session_token', 'x');
    ls.removeItem('ALLOWANCE_RULES_2');
    await vi.runAllTimersAsync();
    expect(puts).toEqual([['ALLOWANCE_RULES_1', '{"edited":1}', 'user', 'v1'], ['ALLOWANCE_RULES_2', null, 'user', 'v2']]);
  });

  it('غير المدير ما يرسل قواعد الرواتب ولا ينقلها', async () => {
    ls.setItem('ALLOWANCE_RULES_5', 'x');
    ls.setItem('hr_custom_issuers', '["أ"]');
    const mod = await import('../src/lib/sharedSettings.js');
    const statuses: any[] = [];
    mod.onSharedSettingsStatus(s => statuses.push(s));
    await mod.hydrateSharedSettings('user');
    ls.setItem('ALLOWANCE_RULES_6', 'y');
    await vi.runAllTimersAsync();
    expect(puts.map(p => p[0])).toEqual(['hr_custom_issuers']);
    expect(statuses.some(s => !s.ok && /للمدير فقط/.test(s.error))).toBe(true);
  });

  it('تعارض 409: يُحمَّل الأحدث ويُحفظ التعديل نسخة احتياطية', async () => {
    server = { settings: { PROMOTION_PATHS_MATRIX: 'A' }, versions: { PROMOTION_PATHS_MATRIX: 'v1' } };
    vi.doMock('@/api/apiClient', () => ({ apiClient: { sharedSettings: {
      getAll: async () => server,
      put: async () => { const e: any = new Error('conflict'); e.status = 409; e.data = { current: 'B', version: 'v3' }; throw e; },
    } } }));
    const mod = await import('../src/lib/sharedSettings.js');
    await mod.hydrateSharedSettings('admin');
    ls.setItem('PROMOTION_PATHS_MATRIX', 'MINE');
    await vi.runAllTimersAsync();
    expect(ls.getItem('PROMOTION_PATHS_MATRIX')).toBe('B');
    expect(ls.getItem('HR_LOCAL_BACKUP:PROMOTION_PATHS_MATRIX')).toBe('MINE');
  });
});

describe('B6 (ق-13): رصيد دورات الاختصاص', () => {
  it('الأسابيع من مدة الدورة', () => {
    expect(specializationWeeksOf({ durationValue: 10, durationUnit: 'بالأيام' })).toBe(2);
    expect(specializationWeeksOf({ durationValue: 2, durationUnit: 'بالأسابيع' })).toBe(2);
    expect(specializationWeeksOf({ durationValue: 1, durationUnit: 'بالأشهر' })).toBe(4);
    expect(specializationWeeksOf({ durationValue: 3, durationUnit: 'بالأيام' })).toBe(1);
    expect(specializationWeeksOf({ durationValue: 0, days: 15 })).toBe(3);
    expect(isSpecializationCourse({ category: 'اختصاص' })).toBe(true);
    expect(isSpecializationCourse({ category: 'إدارية' })).toBe(false);
  });

  it('الرصيد الملغى ما يُحتسب', () => {
    const credits = [{ employeeId: 1, weeks: 2 }, { employeeId: 1, weeks: 2, isCancelled: true }, { employeeId: 2, weeks: 9 }] as any;
    expect(getAvailableSpecializationCredits(1, credits).totalWeeks).toBe(2);
  });

  it('أسابيع الترفيع إعداد: نفس الرصيد يعطي ترفيعات أقل إذا زادت الأسابيع المطلوبة', () => {
    // شهادة بعد 6 سنوات خدمة: 3 دورات محاكاة (كل 24 شهراً)، والرصيد 4 أسابيع
    const snap: any = { id: 1, employeeId: 1, qualificationId: 1, status: 'نشط', baselineGrade: 8, baselineStep: 1,
      actualGradeBefore: 8, actualStepBefore: 1, graduationDateUsed: '2015-01-01', orderDate: '2021-06-01' };
    const credits: any = [{ employeeId: 1, weeks: 4 }];
    const at2 = calculateDegreeTrackSimulation(snap, { specializationCredits: credits, today: '2021-06-02' });
    const at4 = calculateDegreeTrackSimulation(snap, { specializationCredits: credits, today: '2021-06-02', weeksPerPromotion: 4 });
    const granted = (r: any) => r.simulationSteps.filter((s: any) => s.weeksConsumed > 0).length;
    expect(at2.simulationSteps.length).toBeGreaterThan(0);
    expect(granted(at2)).toBe(2);
    expect(granted(at4)).toBe(1);
    expect(at4.simulationSteps.every((s: any) => s.weeksConsumed === 0 || s.weeksConsumed === 4)).toBe(true);
  });
});
