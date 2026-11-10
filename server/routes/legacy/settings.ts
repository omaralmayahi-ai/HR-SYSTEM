// server/routes/legacy/settings.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerSettingsRoutes(app: Express, deps: any) {
  const {
    db, eq, executeMonthlyLeaveAccrual, isDbConnectionFailure, mem, pool,
    requireAdmin, requireAuth, resolveAccrualParams, respondIfDbWriteError, saveLocalDb, schema,
    sendRouteError,
  } = deps;

  app.get('/api/settings/public', (req, res) => {
    // Refresh from DB asynchronously without blocking health checks / login page
    db.select().from(schema.systemSettings).limit(1).then(([dbSettings]) => {
      if (dbSettings) {
        mem.systemSettingsStore = { ...mem.systemSettingsStore, ...dbSettings };
      }
    }).catch(() => {});

    res.json({
      platformName: mem.systemSettingsStore.platformName,
      beneficiaryName: mem.systemSettingsStore.beneficiaryName,
      copyrightText: mem.systemSettingsStore.copyrightText,
      primaryColor: mem.systemSettingsStore.primaryColor,
      secondaryColor: mem.systemSettingsStore.secondaryColor,
      activeTheme: mem.systemSettingsStore.activeTheme || 'governmental',
      fontFamily: mem.systemSettingsStore.fontFamily || 'Cairo',
      logoUrl: mem.systemSettingsStore.logoUrl
    });
  });

  app.get('/api/settings', requireAuth, async (req, res) => {
    try {
      let [dbSettings] = await db.select().from(schema.systemSettings).limit(1);
      if (dbSettings) {
        mem.systemSettingsStore = { ...mem.systemSettingsStore, ...dbSettings };
      }
    } catch {
      // Fallback to in-memory/local_storage settings
    }
    res.json(mem.systemSettingsStore);
  });

  app.put('/api/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id, createdAt, updatedAt, ...data } = req.body || {};
      mem.systemSettingsStore = { ...mem.systemSettingsStore, ...data };
      try {
        const [existing] = await db.select().from(schema.systemSettings).limit(1);
        if (!existing) {
          await db.insert(schema.systemSettings).values(data);
        } else {
          await db.update(schema.systemSettings)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.systemSettings.id, existing.id));
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update settings');
      }
      saveLocalDb();
      res.json(mem.systemSettingsStore);
    } catch (err: any) {
      sendRouteError(res, err);
    }
  });

  // Leave Accrual Dedicated Endpoints
  app.get('/api/leave-accrual/status', requireAuth, async (req, res) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let runs: any[] | null = null;
    try {
      const r = await pool.query('SELECT month, executed_at, employees_count, regular_days_added, sick_days_added, triggered_by FROM leave_accrual_runs ORDER BY month DESC LIMIT 60');
      runs = r.rows;
    } catch (statusErr) {
      if (!isDbConnectionFailure(statusErr)) return sendRouteError(res, statusErr, 'قراءة حالة الترحيل الشهري');
    }
    const params = resolveAccrualParams(mem.systemSettingsStore);
    const logs = runs
      ? runs.map((r: any, i: number) => ({ id: i + 1, month: r.month, employeesCount: r.employees_count, regularDaysAdded: r.regular_days_added, sickDaysAdded: r.sick_days_added, timestamp: r.executed_at, triggeredBy: r.triggered_by, status: 'ناجح' }))
      : mem.leaveAccrualLogs;
    const isAccruedForCurrentMonth = runs ? runs.some((r: any) => r.month === currentMonth) : mem.systemSettingsStore.lastLeaveAccrualMonth === currentMonth;
    res.json({
      currentMonth,
      isAccruedForCurrentMonth,
      lastLeaveAccrualMonth: (runs && runs[0]?.month) || mem.systemSettingsStore.lastLeaveAccrualMonth || '',
      lastLeaveAccrualDate: (runs && runs[0]?.executed_at) || mem.systemSettingsStore.lastLeaveAccrualDate || '',
      monthlyRegularLeaveDays: params.regularDays,
      monthlySickLeaveDays: params.sickDays,
      maxRegularLeaveAccumulation: params.regularCap,
      maxSickLeaveAccumulation: params.sickCap,
      autoMonthlyLeaveAccrual: mem.systemSettingsStore.autoMonthlyLeaveAccrual !== false,
      logs
    });
  });

  app.post('/api/leave-accrual/execute', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { month } = req.body || {};
      // ملاحظة: خيار force أُلغي — الشهر يُرحَّل مرة واحدة فقط (يُسجَّل في leave_accrual_runs).
      const actor = req.user?.username ? `مسؤول (يدوياً): ${req.user.username}` : 'مسؤول الموارد البشرية (يدوياً)';
      const result: any = await executeMonthlyLeaveAccrual(month, actor);
      if (result?.offline) return res.status(503).json({ error: result.message, code: 'DB_UNAVAILABLE' });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'تنفيذ الترحيل الشهري للإجازات');
    }
  });
}
