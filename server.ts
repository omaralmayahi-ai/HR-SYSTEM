// server.ts
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, schema, eq, and, or, desc, asc, getSchemaHealth, pool, createPool } from './src/db/index.ts';
import { runMigrations, getMigrationStatus } from './server/migrate.ts';
import { normalizeEmployeeIdentifiers } from './server/employeeIdentifiers.ts';
import { createDbGate } from './server/dbGate.ts';
import { loadEngineContext, loadAllEngineContexts, bothCases, type LoadedEngineContext } from './server/engineContext.ts';
import type { RouteContext } from './server/context.ts';
import { registerTrainerRoutes } from './server/routes/trainers.ts';
import { registerWorkLocationRoutes } from './server/routes/workLocations.ts';
import { registerLookupRoutes } from './server/routes/lookups.ts';
import { registerAnnualPlanRoutes } from './server/routes/annualPlans.ts';
import { registerSalaryRoutes } from './server/routes/salaries.ts';
import { registerAttendanceRoutes } from './server/routes/attendance.ts';
import { registerOrgUnitRoutes } from './server/routes/orgUnits.ts';
import { registerSettingsListRoutes } from './server/routes/settingsLists.ts';
import { camelToSnake, snakeToCamel, mapKeys } from './server/util/caseMap.ts';
import { getExistingColumns as getExistingColumnsFrom } from './server/util/dbColumns.ts';
import { getTableColumns, ilike, ne, isNull, isNotNull, gt, inArray, not, sql, count as sqlCount } from 'drizzle-orm';
import { requireAuth, requireAdmin, requireWriter, AuthRequest, JWT_SECRET, getJwtSecret } from './src/middleware/auth.ts';
import { seedAdminUser } from './src/db/users.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SALARY_TABLE } from './src/lib/salaryTable.js';
import { encryptData, decryptData, validateEncryptionKeyConfig } from './src/lib/cryptoStorage.ts';
import { recalculateEligibilitySync, EngineContextData, formatDateString, isDateOnOrAfter } from './src/lib/promotionEngine.ts';
import { calculateDegreeTrackSimulation, processDegreeTrackSettlement, processBatchDegreeTrackAutoSettlement } from './src/lib/degreeTrackEngine.ts';
import { extractDelayReasonsFromContext, syncPromotionDelayReasons } from './src/lib/promotionDelayReasonsEngine.ts';
import { checkReferentialUsage, isDbConnectionFailure, validateEmployeeImportRow } from './src/lib/referentialIntegrity.ts';
import { respondIfDbWriteError, sendRouteError, HttpError, classifyDbError, setDbConnectionFailureListener } from './server/dbErrors.ts';
import { installRouteRegistry } from './server/routeRegistry.ts';
import { syncEnrollmentToTrainingCourses } from './server/trainingSync.ts';
import { resolveAccrualParams, accrueBalance, isValidAccrualMonth, ACCRUAL_ELIGIBLE_STATUSES, ACCRUAL_UPDATE_SQL, ACCRUAL_CLAIM_SQL, LEGAL_MONTHLY_REGULAR_LEAVE_DAYS, LEGAL_MAX_REGULAR_LEAVE_ACCUMULATION, DEFAULT_MONTHLY_SICK_LEAVE_DAYS, DEFAULT_MAX_SICK_LEAVE_ACCUMULATION } from './server/leaveAccrual.ts';
import { LEAVE_STATUS, normalizeLeaveStatus, isApprovedLeaveStatus, isRejectedOrCancelledLeaveStatus, leaveStatusVariants, toEngineLeave } from './server/leaveStatus.ts';


const currentFilename = typeof __filename !== 'undefined' ? __filename : '';
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : (currentFilename ? path.dirname(currentFilename) : process.cwd());

async function startServer() {
  validateEncryptionKeyConfig();
  getJwtSecret();
  // تشخيص اتصال قاعدة البيانات (مؤقت): يطبع سبب فشل الاتصال الحقيقي بوضوح في الطرفية عند الإقلاع،
  // بدل رسالة 'Database offline' العامة التي لا تحدد السبب.
  try {
    await pool.query("SELECT 1");
    console.log('[DB-CHECK] الاتصال بقاعدة البيانات ناجح -', 'host=' + process.env.SQL_HOST, 'port=' + process.env.SQL_PORT, 'db=' + process.env.SQL_DB_NAME, 'user=' + process.env.SQL_USER);
  } catch (dbCheckErr: any) {
    console.error('[DB-CHECK] فشل الاتصال بقاعدة البيانات ==========================');
    console.error('[DB-CHECK] host=' + process.env.SQL_HOST, 'port=' + process.env.SQL_PORT, 'db=' + process.env.SQL_DB_NAME, 'user=' + process.env.SQL_USER);
    console.error('[DB-CHECK] error.message:', dbCheckErr?.message);
    console.error('[DB-CHECK] error.code:', dbCheckErr?.code);
    console.error('[DB-CHECK] error.cause:', dbCheckErr?.cause?.message || dbCheckErr?.cause);
    console.error('[DB-CHECK] ==========================================================');
  }
  // B1: الترحيلات (تتضمن خطوة التبنّي التي تشغّل ensureSchema مرة واحدة لكل قاعدة)
  {
    const first = await runMigrations();
    // القاعدة غير متاحة عند الإقلاع: إعادة المحاولة في الخلفية بدل انتظار إعادة تشغيل قد لا تحدث
    if (first.status === 'offline') {
      let delay = 30_000;
      const retry = async () => {
        const st = await runMigrations();
        if (st.status === 'offline') { delay = Math.min(delay * 2, 10 * 60_000); setTimeout(retry, delay).unref(); }
      };
      setTimeout(retry, delay).unref();
    }
  }
  const app = express();
  // يمنع تسجيل نفس METHOD+PATH مرتين (النسخة الثانية تكون ميتة دائماً في Express)
  const routeRegistry = installRouteRegistry(app);
  const PORT = Number(process.env.PORT) || 5000;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // B2d (ق-2): بوابة انقطاع القاعدة. الصحة من مجمّع مستقل باتصال واحد (لا يتأثر بازدحام المجمّع الرئيسي).
  const healthPool = createPool({ max: 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 60000 });
  const dbGate = createDbGate(async () => { await healthPool.query('SELECT 1'); return true; });
  setDbConnectionFailureListener(() => dbGate.invalidate());
  app.get('/api/health', async (_req, res) => {
    const up = await dbGate.isUp();
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'db_unavailable', db: up ? 'up' : 'down', migrations: getMigrationStatus().status });
  });
  app.use('/api', dbGate.middleware);

  // B3: سياق مسارات المجالات المنقولة إلى server/routes/
  const routeCtx: RouteContext = { db, schema, pool, requireAuth, requireWriter, requireAdmin, sendRouteError, respondIfDbWriteError };

  // System Settings Store & API
  let systemSettingsStore: any = {
    platformName: 'نظام إدارة شؤون الموظفين والرواتب',
    beneficiaryName: 'وزارة الموارد البشرية العراقية',
    copyrightText: 'جميع الحقوق محفوظة © 2026',
    primaryColor: '#1B3A6B',
    secondaryColor: '#C8960C',
    logoUrl: 'https://img.icons8.com/color/96/gender-neutral-user.png',
    fontFamily: 'Cairo',
    retirementAge: 60,
    retirementNotificationDays: 180,
    maxChildrenCount: 4,
    monthlyRegularLeaveDays: LEGAL_MONTHLY_REGULAR_LEAVE_DAYS, // م43: يوم عن كل 10 أيام خدمة = 3 أيام شهرياً
    monthlySickLeaveDays: DEFAULT_MONTHLY_SICK_LEAVE_DAYS, // 30 يوماً براتب تام في السنة = 2.5 شهرياً
    maxRegularLeaveAccumulation: LEGAL_MAX_REGULAR_LEAVE_ACCUMULATION, // م43: سقف التراكم 180 يوماً
    maxSickLeaveAccumulation: DEFAULT_MAX_SICK_LEAVE_ACCUMULATION,
    autoMonthlyLeaveAccrual: true, // زيادة أرصدة الإجازات تلقائياً شهرياً
    lastLeaveAccrualMonth: '',
    lastLeaveAccrualDate: ''
  };

  // Leave Accrual Logs Store
  let leaveAccrualLogs: any[] = [];

  // Monthly Leave Accrual Execution Function
  // - الأيام والسقف من الإعدادات مع القيم القانونية الافتراضية (3 أيام/شهر، سقف 180) — server/leaveAccrual.ts
  // - تخزين عشري (منزلتان) بلا تقريب إلى عدد صحيح
  // - منع التكرار في قاعدة البيانات نفسها: صف لكل شهر في leave_accrual_runs، داخل معاملة واحدة مع التحديث
  // - لا يوجد «إجبار» لإعادة ترحيل شهر نُفِّذ سابقاً (كان يضاعف الأرصدة)
  async function executeMonthlyLeaveAccrual(targetMonth?: string, triggeredBy = 'النظام الآلي (ترحيل شهري)') {
    const currentMonth = targetMonth || new Date().toISOString().slice(0, 7); // e.g. '2026-08'
    if (!isValidAccrualMonth(currentMonth)) {
      throw new HttpError(400, 'صيغة الشهر غير صحيحة (المطلوب YYYY-MM)');
    }

    let dbAvailable = true;
    try {
      const [dbSettings] = await db.select().from(schema.systemSettings).limit(1);
      if (dbSettings) {
        systemSettingsStore = { ...systemSettingsStore, ...dbSettings };
      }
    } catch (settingsErr) {
      if (!isDbConnectionFailure(settingsErr)) throw settingsErr;
      dbAvailable = false;
    }

    const params = resolveAccrualParams(systemSettingsStore);
    const accrualDate = new Date().toISOString();
    let processedCount = 0;
    let alreadyExecuted = false;

    if (dbAvailable) {
      let client: any = null;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const claim = await client.query(ACCRUAL_CLAIM_SQL, [currentMonth, params.regularDays, params.sickDays, triggeredBy]);
        if (!claim.rowCount) {
          await client.query('ROLLBACK');
          alreadyExecuted = true;
        } else {
          const upd = await client.query(ACCRUAL_UPDATE_SQL, [params.regularDays, params.regularCap, params.sickDays, params.sickCap]);
          processedCount = upd.rowCount || 0;
          await client.query('UPDATE leave_accrual_runs SET employees_count = $1 WHERE month = $2', [processedCount, currentMonth]);
          const st = await client.query('UPDATE system_settings SET last_leave_accrual_month = $1, last_leave_accrual_date = $2', [currentMonth, accrualDate]);
          if (!st.rowCount) {
            await client.query('INSERT INTO system_settings (last_leave_accrual_month, last_leave_accrual_date) VALUES ($1, $2)', [currentMonth, accrualDate]);
          }
          await client.query('COMMIT');
        }
      } catch (accErr) {
        if (client) await client.query('ROLLBACK').catch((rbErr: any) => console.error('[LEAVE-ACCRUAL] ROLLBACK failed:', rbErr?.message));
        if (!isDbConnectionFailure(accErr)) throw accErr;
        dbAvailable = false;
      } finally {
        if (client) client.release();
      }
    }

    if (!dbAvailable) {
      // B2d (ق-2، مراجعة B2: M3): لا ترحيل في الذاكرة. الشهر لا يُعلَّم منفّذاً، والمهمة الساعية تعيد المحاولة.
      console.warn(`[LEAVE-ACCRUAL] قاعدة البيانات غير متاحة؛ لم يُرحَّل شهر ${currentMonth}، ستُعاد المحاولة.`);
      return {
        success: false,
        offline: true,
        month: currentMonth,
        message: `قاعدة البيانات غير متاحة؛ لم يُطبَّق ترحيل شهر ${currentMonth}. سيُعاد تلقائياً عند عودة القاعدة.`
      };
    }

    if (alreadyExecuted) {
      return {
        success: true,
        alreadyExecuted: true,
        month: currentMonth,
        message: `تم ترحيل وتطبيق الزيادة الشهرية لشهر ${currentMonth} مسبقاً`
      };
    }

    systemSettingsStore.lastLeaveAccrualMonth = currentMonth;
    systemSettingsStore.lastLeaveAccrualDate = accrualDate;

    const logEntry = {
      id: leaveAccrualLogs.length + 1,
      month: currentMonth,
      employeesCount: processedCount,
      regularDaysAdded: params.regularDays,
      sickDaysAdded: params.sickDays,
      timestamp: accrualDate,
      triggeredBy,
      status: dbAvailable ? 'ناجح' : 'ناجح (تخزين احتياطي - بلا اتصال)'
    };
    leaveAccrualLogs.unshift(logEntry);

    const details = `تم تطبيق الزيادة الشهرية لشهر ${currentMonth} على ${processedCount} موظفاً (اعتيادية: +${params.regularDays} يوم بسقف ${params.regularCap}، مرضية: +${params.sickDays} يوم)`;
    systemLogsStore.unshift({ id: systemLogsStore.length + 1, action: 'زيادة الأرصدة الشهرية للإجازات', user: 'النظام الآلي', details, timestamp: accrualDate });
    if (dbAvailable) {
      try {
        await db.insert(schema.activityLogs).values({ action: 'زيادة الأرصدة الشهرية للإجازات', userEmail: triggeredBy, details });
      } catch (logErr: any) {
        console.warn('[ACTIVITY-LOG] تعذّر تسجيل الترحيل الشهري:', logErr?.message);
      }
    }

    saveLocalDb();

    return {
      success: true,
      month: currentMonth,
      employeesCount: processedCount,
      regularDaysAdded: params.regularDays,
      sickDaysAdded: params.sickDays,
      regularCap: params.regularCap,
      date: accrualDate,
      offline: !dbAvailable
    };
  }

  app.get('/api/settings/public', (req, res) => {
    // Refresh from DB asynchronously without blocking health checks / login page
    db.select().from(schema.systemSettings).limit(1).then(([dbSettings]) => {
      if (dbSettings) {
        systemSettingsStore = { ...systemSettingsStore, ...dbSettings };
      }
    }).catch(() => {});

    res.json({
      platformName: systemSettingsStore.platformName,
      beneficiaryName: systemSettingsStore.beneficiaryName,
      copyrightText: systemSettingsStore.copyrightText,
      primaryColor: systemSettingsStore.primaryColor,
      secondaryColor: systemSettingsStore.secondaryColor,
      activeTheme: systemSettingsStore.activeTheme || 'governmental',
      fontFamily: systemSettingsStore.fontFamily || 'Cairo',
      logoUrl: systemSettingsStore.logoUrl
    });
  });

  app.get('/api/settings', requireAuth, async (req, res) => {
    try {
      let [dbSettings] = await db.select().from(schema.systemSettings).limit(1);
      if (dbSettings) {
        systemSettingsStore = { ...systemSettingsStore, ...dbSettings };
      }
    } catch {
      // Fallback to in-memory/local_storage settings
    }
    res.json(systemSettingsStore);
  });

  app.put('/api/settings', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { id, createdAt, updatedAt, ...data } = req.body || {};
      systemSettingsStore = { ...systemSettingsStore, ...data };
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
      res.json(systemSettingsStore);
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
    const params = resolveAccrualParams(systemSettingsStore);
    const logs = runs
      ? runs.map((r: any, i: number) => ({ id: i + 1, month: r.month, employeesCount: r.employees_count, regularDaysAdded: r.regular_days_added, sickDaysAdded: r.sick_days_added, timestamp: r.executed_at, triggeredBy: r.triggered_by, status: 'ناجح' }))
      : leaveAccrualLogs;
    const isAccruedForCurrentMonth = runs ? runs.some((r: any) => r.month === currentMonth) : systemSettingsStore.lastLeaveAccrualMonth === currentMonth;
    res.json({
      currentMonth,
      isAccruedForCurrentMonth,
      lastLeaveAccrualMonth: (runs && runs[0]?.month) || systemSettingsStore.lastLeaveAccrualMonth || '',
      lastLeaveAccrualDate: (runs && runs[0]?.executed_at) || systemSettingsStore.lastLeaveAccrualDate || '',
      monthlyRegularLeaveDays: params.regularDays,
      monthlySickLeaveDays: params.sickDays,
      maxRegularLeaveAccumulation: params.regularCap,
      maxSickLeaveAccumulation: params.sickCap,
      autoMonthlyLeaveAccrual: systemSettingsStore.autoMonthlyLeaveAccrual !== false,
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

  // System Logs Store & API
  const systemLogsStore: any[] = [];
  app.get('/api/logs', requireAuth, async (req, res) => {
    try {
      const dbLogs = await db.select()
        .from(schema.activityLogs)
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(100);
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(dbLogs.map(l => ({
          id: l.id,
          action: l.action,
          user: l.userEmail,
          userEmail: l.userEmail,
          details: l.details,
          timestamp: l.createdAt,
          createdAt: l.createdAt
        })));
      }
    } catch {
      // Fallback to in-memory logs
    }
    res.json(systemLogsStore);
  });
  app.post('/api/logs', requireAuth, requireWriter, async (req: AuthRequest, res) => {
    const userActor = req.user?.username || req.user?.email || 'admin';
    const logItem = { 
      id: systemLogsStore.length + 1, 
      ...req.body, 
      user: userActor, 
      userEmail: userActor,
      timestamp: new Date().toISOString() 
    };
    systemLogsStore.unshift(logItem);
    try {
      await db.insert(schema.activityLogs).values({
        action: String(req.body?.action || 'عملية نظام'),
        userEmail: userActor,
        details: req.body?.details ? String(req.body.details) : null
      });
    } catch {
      // Fallback to in-memory log store
    }
    saveLocalDb();
    res.json(logItem);
  });

  // Bounded Dual-Layer Login Rate Limiter (Per-IP and Per-Account)
  const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  const MAX_IP_FAILURES = 40;
  const MAX_ACCOUNT_FAILURES = 10;
  const MAX_RATE_LIMIT_KEYS = 5000;
  const loginFailuresMap = new Map<string, { count: number; resetAt: number }>();

  function getRateLimitRecord(key: string, now: number) {
    const existing = loginFailuresMap.get(key);
    if (!existing || now >= existing.resetAt) {
      return null;
    }
    return existing;
  }

  function recordLoginFailure(key: string, now: number) {
    if (loginFailuresMap.size >= MAX_RATE_LIMIT_KEYS && !loginFailuresMap.has(key)) {
      for (const [k, v] of loginFailuresMap.entries()) {
        if (now >= v.resetAt) loginFailuresMap.delete(k);
      }
      if (loginFailuresMap.size >= MAX_RATE_LIMIT_KEYS) {
        const oldestKey = loginFailuresMap.keys().next().value;
        if (oldestKey) loginFailuresMap.delete(oldestKey);
      }
    }
    const existing = loginFailuresMap.get(key);
    if (!existing || now >= existing.resetAt) {
      loginFailuresMap.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    } else {
      existing.count += 1;
    }
  }

  // Custom Authentication Endpoints
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      const now = Date.now();
      const clientIp = String(req.ip || req.socket?.remoteAddress || 'unknown');
      const normalizedUser = String(username).trim().toLowerCase();
      const ipKey = `ip:${clientIp}`;
      const acctKey = `acct:${clientIp}:${normalizedUser}`;

      const ipRec = getRateLimitRecord(ipKey, now);
      const acctRec = getRateLimitRecord(acctKey, now);
      if ((ipRec && ipRec.count >= MAX_IP_FAILURES) || (acctRec && acctRec.count >= MAX_ACCOUNT_FAILURES)) {
        return res.status(429).json({
          error: 'تم تجاوز الحد المسموح لمحاولات تسجيل الدخول الفاشلة. يرجى الانتظار 15 دقيقة قبل المحاولة مجدداً.'
        });
      }

      let user: any = null;
      try {
        const usersList = await db.select()
          .from(schema.users)
          .where(eq(schema.users.username, username))
          .limit(1);
        user = usersList[0];
      } catch (dbErr) {
        console.error('Database query error during login:', dbErr);
        return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً. يرجى التحقق من خدمة PostgreSQL.' });
      }

      if (!user || !user.password) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      const isBcryptHash = user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$');
      if (!isBcryptHash) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        recordLoginFailure(ipKey, now);
        recordLoginFailure(acctKey, now);
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      loginFailuresMap.delete(acctKey);

      // Generate cryptographically signed JWT token of user info
      const token = jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email
      }, getJwtSecret(), { expiresIn: '7d' });

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          email: user.email
        }
      });
    } catch (error: any) {
      console.error('Error in login:', error);
      res.status(500).json({ error: 'حدث خطأ أثناء تسجيل الدخول' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(req.user);
    } catch (error: any) {
      sendRouteError(res, error);
    }
  });

  // Users Management API
  const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
  let inMemoryUsers: any[] = [
    {
      id: 1,
      username: 'admin',
      name: 'مدير النظام الافتراضي (Admin)',
      role: 'admin',
      email: 'admin@hr.gov.iq',
      created_at: new Date().toISOString()
    }
  ];

  app.get('/api/auth/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const allUsers = await db.select({
        id: schema.users.id,
        username: schema.users.username,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt
      }).from(schema.users).orderBy(asc(schema.users.id));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(allUsers);
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json(inMemoryUsers.map(({ password, ...safeUser }) => safeUser));
  });

  app.post('/api/auth/users', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const { username, password, name, email, role } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ error: 'الاسم واسم المستخدم وكلمة المرور مطلوبة' });
      }

      try {
        const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
        if (existing) {
          return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً' });
        }

        if (BCRYPT_HASH_RE.test(String(password).trim())) {
          return res.status(400).json({ error: 'كلمة المرور يجب أن تكون نصاً صريحاً جديداً' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const [newUser] = await db.insert(schema.users).values({
          username,
          password: hashedPassword,
          name,
          email,
          role: role || 'user'
        }).returning();

        if (newUser) {
          return res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            createdAt: newUser.createdAt
          });
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for creating user');
      }

      const existingMem = inMemoryUsers.find(u => u.username === username);
      if (existingMem) {
        return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً' });
      }

      const newMemUser = {
        id: inMemoryUsers.length + 1,
        username,
        name,
        email: email || '',
        role: role || 'user',
        created_at: new Date().toISOString()
      };
      inMemoryUsers.push(newMemUser);
      res.status(201).json(newMemUser);
    } catch (error: any) {
      console.error('Error creating user:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/auth/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف المستخدم غير صالح' });
      }

      const { username, password, name, email, role } = req.body;
      
      try {
        if (username) {
          const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
          if (existing && existing.id !== id) {
            return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً لمستخدم آخر' });
          }
        }

        const [currentUserToEdit] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
        if (currentUserToEdit && currentUserToEdit.username === 'admin' && username && username !== 'admin') {
          return res.status(400).json({ error: 'لا يمكن تغيير اسم مستخدم مدير النظام الرئيسي (admin)' });
        }
        if (currentUserToEdit && currentUserToEdit.username === 'admin' && role && role !== 'admin') {
          return res.status(400).json({ error: 'لا يمكن سحب صلاحية مدير النظام من الحساب الرئيسي' });
        }

        const updateData: any = {};
        if (username) updateData.username = username;
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (role) updateData.role = role;
        // تُشفَّر كلمة المرور فقط إذا أُرسلت كلمة جديدة نصية؛ إن أعادت الواجهة القيمة المشفّرة القديمة
        // (bcrypt hash) تُتجاهل، فلا يُعاد تشفير الـ hash ولا يُقفل حساب المستخدم.
        if (typeof password === 'string' && password.trim() && !BCRYPT_HASH_RE.test(password.trim())) {
          updateData.password = await bcrypt.hash(password, 10);
        }
        if (Object.keys(updateData).length === 0) {
          const [cur] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
          if (!cur) return res.status(404).json({ error: 'المستخدم غير موجود' });
          const { password: _pw, ...safeCur } = cur as any;
          return res.json(safeCur);
        }

        const [updatedUser] = await db.update(schema.users)
          .set(updateData)
          .where(eq(schema.users.id, id))
          .returning();

        if (updatedUser) {
          return res.json({
            id: updatedUser.id,
            username: updatedUser.username,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            createdAt: updatedUser.createdAt
          });
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for updating user');
      }

      const memIdx = inMemoryUsers.findIndex(u => u.id === id);
      if (memIdx !== -1) {
        inMemoryUsers[memIdx] = {
          ...inMemoryUsers[memIdx],
          username: username || inMemoryUsers[memIdx].username,
          name: name !== undefined ? name : inMemoryUsers[memIdx].name,
          email: email !== undefined ? email : inMemoryUsers[memIdx].email,
          role: role || inMemoryUsers[memIdx].role
        };
        return res.json(inMemoryUsers[memIdx]);
      }

      res.json({ id, username, name, email, role });
    } catch (error: any) {
      console.error('Error updating user:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/auth/users/:id', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء هذه العملية' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف المستخدم غير صالح' });
      }

      try {
        const [userToDelete] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
        if (userToDelete && userToDelete.username === 'admin') {
          return res.status(400).json({ error: 'لا يمكن حذف حساب مدير النظام الرئيسي' });
        }
        await db.delete(schema.users).where(eq(schema.users.id, id));
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حذف السجل')) return;
        console.warn('Database fallback for deleting user');
      }

      inMemoryUsers = inMemoryUsers.filter(u => u.id !== id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      sendRouteError(res, error);
    }
  });

  // B3: camelToSnake / snakeToCamel / mapKeys نُقلت إلى server/util/caseMap.ts

  // Helper to ensure employee name fields and full_name are in sync
  function processEmployeeNameData(mappedData: any, isCreate = false) {
    const hasFirstName = mappedData.firstName !== undefined;
    const hasFatherName = mappedData.fatherName !== undefined;
    const hasGrandfatherName = mappedData.grandfatherName !== undefined;
    const hasGreatGrandfatherName = mappedData.greatGrandfatherName !== undefined;
    const hasFullName = mappedData.fullName !== undefined;

    // If updating and no name parameters were passed, leave name fields untouched
    if (!isCreate && !hasFirstName && !hasFatherName && !hasGrandfatherName && !hasGreatGrandfatherName && !hasFullName) {
      return;
    }

    const nameParts = [mappedData.firstName, mappedData.fatherName, mappedData.grandfatherName, mappedData.greatGrandfatherName].filter(Boolean);
    if (nameParts.length > 0) {
      mappedData.fullName = nameParts.join(' ');
    } else if (mappedData.fullName && mappedData.fullName !== 'غير محدد') {
      const parts = mappedData.fullName.trim().split(/\s+/);
      if (!mappedData.firstName) mappedData.firstName = parts[0] || '';
      if (!mappedData.fatherName) mappedData.fatherName = parts[1] || '';
      if (!mappedData.grandfatherName) mappedData.grandfatherName = parts[2] || '';
      if (!mappedData.greatGrandfatherName) mappedData.greatGrandfatherName = parts.slice(3).join(' ') || '';
    } else if (isCreate) {
      mappedData.fullName = 'غير محدد';
    }
  }

  function processEmployeeEducationData(mappedData: any) {
    if (mappedData.university || mappedData.institution) {
      const univ = mappedData.university || mappedData.institution;
      mappedData.university = univ;
      mappedData.institution = univ;
    }
    if (mappedData.graduationYear !== undefined || mappedData.graduation_year !== undefined) {
      const yrVal = mappedData.graduationYear ?? mappedData.graduation_year;
      const yr = yrVal ? parseInt(String(yrVal)) : null;
      mappedData.graduationYear = isNaN(yr as number) ? null : yr;
    }
    if (mappedData.educationOrder || mappedData.education_order || mappedData.evaluationOrder || mappedData.evaluation_order || mappedData.equationNumber) {
      const ord = mappedData.educationOrder || mappedData.education_order || mappedData.evaluationOrder || mappedData.evaluation_order || mappedData.equationNumber;
      mappedData.educationOrder = ord;
      mappedData.evaluationOrder = ord;
    }
  }

  // --- In-Memory Stores for Employee Sub-Entities ---
  let inMemoryQualifications: any[] = [];
  let inMemoryJobAssignments: any[] = [
    {
      id: 1,
      employee_id: 1,
      order_number: 'TEST-0001',
      assignment_order: 'TEST-0001',
      order_date: '2020-01-01',
      assignment_date: '2020-01-01',
      action_type: 'تكليف',
      assignment_type: 'تكليف',
      primary_responsibility: 'بلا مسؤولية',
      acting_responsibility: 'بلا وكالة',
      deputy_level: 'لا يوجد',
      job_title: 'مبرمج',
      department: 'قسم تجريبي',
      section: 'شعبة تجريبية',
      service_type: 'دائم',
      notes: 'سجل تجريبي وهمي',
      responsibility: 'بلا مسؤولية',
      created_at: new Date().toISOString()
    }
  ];
  let inMemoryCareerHistories: any[] = [];
  let inMemoryPromotions: any[] = [];
  let inMemorySalaryAllowances: any[] = [];
  let inMemoryAnnualEvaluations: any[] = [];
  let inMemoryTrainingCourses: any[] = [];
  let inMemoryTransfers: any[] = [];
  let inMemoryRetirements: any[] = [];
  let inMemoryDocuments: any[] = [];
  let inMemoryLeaves: any[] = [];
  let inMemoryPenalties: any[] = [];
  let inMemoryAppreciations: any[] = [];
  let inMemoryPerformanceEvaluations: any[] = [];
  let inMemoryPromotionDelayReasons: any[] = [];
  let inMemoryDegreeTrackSnapshots: any[] = [];
  let inMemoryDegreeTrackSimulationSteps: any[] = [];
  let inMemorySpecializationCredits: any[] = [];
  let inMemoryServiceRecords: any[] = [];
  let inMemoryServiceCredits: any[] = [];

  const genericMemoryStores: Record<string, any[]> = {
    'career': inMemoryCareerHistories,
    'job-assignments': inMemoryJobAssignments,
    'qualifications': inMemoryQualifications,
    'promotions': inMemoryPromotions,
    'salary-allowances': inMemorySalaryAllowances,
    'annual-evaluations': inMemoryAnnualEvaluations,
    'training-courses': inMemoryTrainingCourses,
    'transfers': inMemoryTransfers,
    'retirements': inMemoryRetirements,
    'documents': inMemoryDocuments,
    'service-records': inMemoryServiceRecords,
    'service-credits': inMemoryServiceCredits,
    'leaves': inMemoryLeaves,
    'penalties': inMemoryPenalties,
    'appreciations': inMemoryAppreciations,
    'performance': inMemoryPerformanceEvaluations,
    'degree-track-snapshots': inMemoryDegreeTrackSnapshots,
    'degree-track-simulation-steps': inMemoryDegreeTrackSimulationSteps,
    'specialization-credits': inMemorySpecializationCredits,
    'promotion-delay-reasons': inMemoryPromotionDelayReasons,
    'promotion_delay_reasons': inMemoryPromotionDelayReasons
  };

  function syncEmployeeRecord(emp: any, action: 'insert' | 'update' | 'delete') {
    if (!emp) return;
    const empId = parseInt(String(emp.id));
    if (isNaN(empId)) return;

    if (action === 'delete') {
      inMemoryEmployees = inMemoryEmployees.filter((e: any) => parseInt(String(e.id)) !== empId);
    } else if (action === 'update') {
      const idx = inMemoryEmployees.findIndex((e: any) => parseInt(String(e.id)) === empId);
      if (idx !== -1) {
        inMemoryEmployees[idx] = { ...inMemoryEmployees[idx], ...emp, id: empId, updatedAt: new Date().toISOString(), updated_at: new Date().toISOString() };
      } else {
        inMemoryEmployees.push({ ...emp, id: empId });
      }
    } else if (action === 'insert') {
      const idx = inMemoryEmployees.findIndex((e: any) => parseInt(String(e.id)) === empId);
      if (idx !== -1) {
        inMemoryEmployees[idx] = { ...inMemoryEmployees[idx], ...emp, id: empId };
      } else {
        inMemoryEmployees.push({ ...emp, id: empId });
      }
    }
    saveLocalDb();
  }

  function syncEntityRecord(endpoint: string, item: any, action: 'insert' | 'update' | 'delete') {
    if (!endpoint || !item) return;
    genericMemoryStores[endpoint] = genericMemoryStores[endpoint] || [];
    const list = genericMemoryStores[endpoint];
    const itemId = String(item.id);

    if (action === 'delete') {
      genericMemoryStores[endpoint] = list.filter((r: any) => String(r.id) !== itemId);
    } else if (action === 'update') {
      const idx = list.findIndex((r: any) => String(r.id) === itemId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...item };
      } else {
        list.push(item);
      }
    } else if (action === 'insert') {
      const idx = list.findIndex((r: any) => String(r.id) === itemId);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...item };
      } else {
        list.push(item);
      }
    }

    // Mirror to named memory stores
    if (endpoint === 'qualifications') inMemoryQualifications = genericMemoryStores['qualifications'];
    if (endpoint === 'job-assignments') inMemoryJobAssignments = genericMemoryStores['job-assignments'];
    if (endpoint === 'promotions') inMemoryPromotions = genericMemoryStores['promotions'];
    if (endpoint === 'salary-allowances') inMemorySalaryAllowances = genericMemoryStores['salary-allowances'];
    if (endpoint === 'annual-evaluations') inMemoryAnnualEvaluations = genericMemoryStores['annual-evaluations'];
    if (endpoint === 'training-courses') inMemoryTrainingCourses = genericMemoryStores['training-courses'];
    if (endpoint === 'transfers') inMemoryTransfers = genericMemoryStores['transfers'];
    if (endpoint === 'retirements') inMemoryRetirements = genericMemoryStores['retirements'];
    if (endpoint === 'documents') inMemoryDocuments = genericMemoryStores['documents'];
    if (endpoint === 'service-records') inMemoryServiceRecords = genericMemoryStores['service-records'];
    if (endpoint === 'service-credits') inMemoryServiceCredits = genericMemoryStores['service-credits'];
    if (endpoint === 'leaves') inMemoryLeaves = genericMemoryStores['leaves'];
    if (endpoint === 'penalties') inMemoryPenalties = genericMemoryStores['penalties'];
    if (endpoint === 'appreciations') inMemoryAppreciations = genericMemoryStores['appreciations'];
    if (endpoint === 'performance') inMemoryPerformanceEvaluations = genericMemoryStores['performance'];
    if (endpoint === 'career') inMemoryCareerHistories = genericMemoryStores['career'];
    if (endpoint === 'degree-track-snapshots') inMemoryDegreeTrackSnapshots = genericMemoryStores['degree-track-snapshots'];
    if (endpoint === 'degree-track-simulation-steps') inMemoryDegreeTrackSimulationSteps = genericMemoryStores['degree-track-simulation-steps'];
    if (endpoint === 'specialization-credits') inMemorySpecializationCredits = genericMemoryStores['specialization-credits'];
    if (endpoint === 'promotion-delay-reasons' || endpoint === 'promotion_delay_reasons') {
      inMemoryPromotionDelayReasons = genericMemoryStores['promotion-delay-reasons'];
      genericMemoryStores['promotion_delay_reasons'] = inMemoryPromotionDelayReasons;
    }

    saveLocalDb();
  }

  async function syncEmployeeQualificationFromEmployee(employeeId: number, mappedData: any) {
    if (!employeeId || isNaN(employeeId)) return;
    try {
      const level = mappedData.educationLevel || mappedData.education_level || mappedData.level;
      const spec = mappedData.specialization !== undefined ? mappedData.specialization : '';
      const univ = mappedData.university || mappedData.institution || '';
      const country = mappedData.country || '';
      const gradYearVal = mappedData.graduationYear ?? mappedData.graduation_year;
      const gradYear = gradYearVal ? parseInt(String(gradYearVal)) : null;
      const eduOrder = mappedData.educationOrder || mappedData.education_order || mappedData.evaluationOrder || mappedData.evaluation_order || mappedData.equationNumber || mappedData.equation_number || '';

      if (!level && !spec && !univ && !gradYear && !eduOrder) return;

      try {
        const activeQuals = await db.select()
          .from(schema.qualifications)
          .where(and(
            eq(schema.qualifications.employeeId, employeeId),
            eq(schema.qualifications.isActive, true)
          ))
          .orderBy(desc(schema.qualifications.createdAt), desc(schema.qualifications.id));

        if (activeQuals.length > 0) {
          const topQual = activeQuals[0];
          const updateData: any = {};
          if (level) updateData.level = level;
          if (spec !== undefined) updateData.specialization = spec;
          if (univ !== undefined) updateData.university = univ;
          if (country !== undefined) updateData.country = country;
          if (gradYear) updateData.graduationYear = gradYear;
          if (eduOrder !== undefined) updateData.equationNumber = eduOrder;

          if (Object.keys(updateData).length > 0) {
            await db.update(schema.qualifications)
              .set(updateData)
              .where(eq(schema.qualifications.id, topQual.id));
          }
        } else if (level) {
          await db.insert(schema.qualifications).values({
            employeeId,
            level,
            specialization: spec,
            university: univ,
            country: country,
            graduationYear: gradYear || 0,
            equationNumber: eduOrder,
            isActive: true
          });
        }
      } catch (dbErr) {
        console.warn('Database fallback for sync qualification');
      }

      // Ensure both genericMemoryStores['qualifications'] and inMemoryQualifications are updated or created
      genericMemoryStores['qualifications'] = genericMemoryStores['qualifications'] || inMemoryQualifications;
      const store = genericMemoryStores['qualifications'];
      const idx = store.findIndex(q => (String(q.employee_id) === String(employeeId) || String(q.employeeId) === String(employeeId)) && (q.is_active !== false && q.isActive !== false));
      if (idx !== -1) {
        store[idx] = {
          ...store[idx],
          level: level || store[idx].level,
          education_level: level || store[idx].education_level,
          specialization: spec !== undefined ? spec : store[idx].specialization,
          university: univ !== undefined ? univ : store[idx].university,
          institution: univ !== undefined ? univ : store[idx].institution,
          country: country !== undefined ? country : store[idx].country,
          graduation_year: gradYear || store[idx].graduation_year,
          graduationYear: gradYear || store[idx].graduationYear,
          equation_number: eduOrder || store[idx].equation_number,
          equationNumber: eduOrder || store[idx].equationNumber,
          evaluation_order: eduOrder || store[idx].evaluation_order,
          evaluationOrder: eduOrder || store[idx].evaluationOrder,
          education_order: eduOrder || store[idx].education_order,
          educationOrder: eduOrder || store[idx].educationOrder,
          is_active: true,
          isActive: true
        };
      } else if (level) {
        const newId = (store.reduce((max: number, q: any) => Math.max(max, parseInt(q.id) || 0), 0) || 0) + 1;
        store.push({
          id: newId,
          employee_id: employeeId,
          employeeId,
          level,
          education_level: level,
          specialization: spec,
          university: univ,
          institution: univ,
          country: country,
          graduation_year: gradYear || 0,
          graduationYear: gradYear || 0,
          equation_number: eduOrder,
          equationNumber: eduOrder,
          evaluation_order: eduOrder,
          evaluationOrder: eduOrder,
          education_order: eduOrder,
          educationOrder: eduOrder,
          is_active: true,
          isActive: true,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      }
      inMemoryQualifications = store;
      genericMemoryStores['qualifications'] = store;
    } catch (err) {
      console.error('Error syncing qualification from employee:', err);
    }
  }

  function normalizeEmployeePayload(data: any) {
    if (!data || typeof data !== 'object') return data;
    const normalized: any = {};
    for (const [k, v] of Object.entries(data)) {
      const camel = snakeToCamel(k);
      if (normalized[camel] === undefined) {
        normalized[camel] = v;
      }
    }
    // If snake_case key is explicitly provided, it takes precedence (since forms operate in snake_case)
    for (const [k, v] of Object.entries(data)) {
      if (k.includes('_')) {
        normalized[snakeToCamel(k)] = v;
      }
    }
    return normalized;
  }

  function sanitizeEmployeeData(mappedData: any) {
    const allowedKeys = new Set(Object.keys(getTableColumns(schema.employees)));
    const clean: any = {};
    for (const [k, v] of Object.entries(mappedData)) {
      if (allowedKeys.has(k) && k !== 'id' && k !== 'createdAt') {
        clean[k] = v;
      }
    }
    normalizeEmployeeIdentifiers(clean);
    return clean;
  }

  // رقم الشركة: المعرّف الفريد الأساسي للموظف.
  // القاعدة: 6 أرقام فقط لجميع الموظفين، باستثناء أصحاب صفة "عقد" أو "أجر يومي"
  // المسموح لهم إدخال حروف ضمن رقم الشركة (مثال: أرقام عقود تحوي حروفاً).
  const LETTER_EXEMPT_SERVICE_TYPES = new Set(['عقد', 'أجر يومي']);

  function validateCompanyNumberFormat(companyNumber: any, serviceType: any): { isValid: boolean; error?: string } {
    const value = (companyNumber === null || companyNumber === undefined) ? '' : String(companyNumber).trim();
    if (!value) {
      return { isValid: false, error: 'رقم الشركة إلزامي ولا يمكن ترك الحقل فارغاً' };
    }
    const isExempt = LETTER_EXEMPT_SERVICE_TYPES.has(String(serviceType || '').trim());
    if (isExempt) {
      // يُسمح بالحروف والأرقام للموظفين بصفة عقد أو أجر يومي، ضمن طول معقول
      if (!/^[A-Za-z0-9ء-ي\-\/]{3,20}$/.test(value)) {
        return { isValid: false, error: 'رقم الشركة لموظفي العقد/الأجر اليومي يجب أن يتكون من 3 إلى 20 محرفاً (حروف أو أرقام)' };
      }
      return { isValid: true };
    }
    if (!/^\d{6}$/.test(value)) {
      return { isValid: false, error: 'رقم الشركة يجب أن يتكون من 6 أرقام بالضبط (يُسمح بالحروف فقط لموظفي العقد أو الأجر اليومي)' };
    }
    return { isValid: true };
  }

  async function findEmployeeByCompanyNumber(companyNumber: string, excludeId?: number) {
    const value = String(companyNumber).trim();
    try {
      const rows = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, value));
      const dbMatch = rows.find(r => excludeId === undefined || parseInt(String(r.id)) !== excludeId);
      if (dbMatch) return dbMatch;
    } catch (err) {
      console.warn('Database fallback for company number duplicate check');
    }
    const memMatch = inMemoryEmployees.find(e => {
      const cn = (e.companyNumber !== undefined ? e.companyNumber : e.company_number);
      if (!cn || String(cn).trim() !== value) return false;
      if (excludeId !== undefined && parseInt(String(e.id)) === excludeId) return false;
      return true;
    });
    return memMatch || null;
  }

  // الرقم الوظيفي (رقم وزارة التخطيط): رقم فريد أيضاً، لكن الاعتماد الأساسي في النظام على رقم الشركة.
  // يُسمح بترك هذا الحقل بقيمة "سيتم تسجيله لاحقاً" (PENDING_VALUE من الواجهة) عندما لا تتوفر البيانات بعد،
  // وفي هذه الحالة لا يُطبَّق فحص التفرد عليه.
  const PENDING_VALUE_SENTINEL = 'سيتم تسجيله لاحقاً';

  async function findEmployeeByCivilServiceNumber(civilServiceNumber: string, excludeId?: number) {
    const value = String(civilServiceNumber).trim();
    if (!value || value === PENDING_VALUE_SENTINEL) return null;
    try {
      const rows = await db.select().from(schema.employees).where(eq(schema.employees.civilServiceNumber, value));
      const dbMatch = rows.find(r => excludeId === undefined || parseInt(String(r.id)) !== excludeId);
      if (dbMatch) return dbMatch;
    } catch (err) {
      console.warn('Database fallback for civil service number duplicate check');
    }
    const memMatch = inMemoryEmployees.find(e => {
      const csn = (e.civilServiceNumber !== undefined ? e.civilServiceNumber : e.civil_service_number);
      if (!csn || String(csn).trim() !== value) return false;
      if (String(csn).trim() === PENDING_VALUE_SENTINEL) return false;
      if (excludeId !== undefined && parseInt(String(e.id)) === excludeId) return false;
      return true;
    });
    return memMatch || null;
  }

  // رقم الإضبارة (service_record_number): فريد أيضاً؛ يُفحص على الخادم (الواجهة لم تعد تحمّل كل الموظفين لفحصه).
  async function findEmployeeByServiceRecordNumber(serviceRecordNumber: any, excludeId?: number) {
    const value = String(serviceRecordNumber ?? '').trim();
    if (!value || value === PENDING_VALUE_SENTINEL) return null;
    try {
      const rows = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.serviceRecordNumber, value));
      const dbMatch = rows.find(r => excludeId === undefined || parseInt(String(r.id)) !== excludeId);
      return dbMatch || null;
    } catch (err) {
      if (!isDbConnectionFailure(err)) throw err;
    }
    return inMemoryEmployees.find(e => {
      const v = e.serviceRecordNumber !== undefined ? e.serviceRecordNumber : e.service_record_number;
      if (!v || String(v).trim() !== value) return false;
      return !(excludeId !== undefined && parseInt(String(e.id)) === excludeId);
    }) || null;
  }

  // رقم هوية الموظف: يُنشأ تلقائياً بالكامل من الخادم عند إضافة الموظف (لا يُدخله موظف الـHR يدوياً إطلاقاً)،
  // ويجب أن يبقى فريداً دوماً. يُستخدم كمعرّف الهوية الرقمية للموظف ورمز الوصول السريع (QR).
  const EMPLOYEE_ID_NUMBER_SEED = 500001;

  async function findEmployeeByEmployeeIdNumber(employeeIdNumber: string, excludeId?: number) {
    const value = String(employeeIdNumber).trim();
    if (!value) return null;
    try {
      const rows = await db.select().from(schema.employees).where(eq(schema.employees.employeeIdNumber, value));
      const dbMatch = rows.find(r => excludeId === undefined || parseInt(String(r.id)) !== excludeId);
      if (dbMatch) return dbMatch;
    } catch (err) {
      console.warn('Database fallback for employee ID number duplicate check');
    }
    const memMatch = inMemoryEmployees.find(e => {
      const ein = (e.employeeIdNumber !== undefined ? e.employeeIdNumber : e.employee_id_number);
      if (!ein || String(ein).trim() !== value) return false;
      if (excludeId !== undefined && parseInt(String(e.id)) === excludeId) return false;
      return true;
    });
    return memMatch || null;
  }

  async function generateUniqueEmployeeIdNumber(): Promise<string> {
    let maxSeq = EMPLOYEE_ID_NUMBER_SEED - 1;
    const collectFrom = (list: any[]) => {
      for (const e of list || []) {
        const raw = e.employeeIdNumber !== undefined ? e.employeeIdNumber : e.employee_id_number;
        const num = parseInt(String(raw || '').replace(/\D/g, ''), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    };
    try {
      const rows = await db.select().from(schema.employees);
      collectFrom(rows);
    } catch (err) {
      console.warn('Database fallback while generating employee_id_number');
    }
    collectFrom(inMemoryEmployees);

    let candidate = String(maxSeq + 1);
    let guard = 0;
    while (await findEmployeeByEmployeeIdNumber(candidate) && guard < 1000) {
      maxSeq++;
      candidate = String(maxSeq + 1);
      guard++;
    }
    return candidate;
  }

  function enhanceEmployeeRecord(emp: any) {
    if (!emp) return emp;
    const mapped = mapKeys(emp, camelToSnake);
    if ((!mapped.full_name || mapped.full_name === 'غير محدد') && (mapped.first_name || mapped.father_name)) {
      const nameParts = [mapped.first_name, mapped.father_name, mapped.grandfather_name, mapped.great_grandfather_name].filter(Boolean);
      if (nameParts.length > 0) {
        mapped.full_name = nameParts.join(' ');
      }
    } else if (!mapped.first_name && mapped.full_name && mapped.full_name !== 'غير محدد') {
      const parts = (mapped.full_name || '').trim().split(/\s+/);
      mapped.first_name = parts[0] || '';
      mapped.father_name = parts[1] || '';
      mapped.grandfather_name = parts[2] || '';
      mapped.great_grandfather_name = parts.slice(3).join(' ') || '';
    }

    mapped.photo = mapped.photo || emp.photo || '';
    mapped.initial_regular_leave_balance = mapped.initial_regular_leave_balance !== undefined ? mapped.initial_regular_leave_balance : (emp.initialRegularLeaveBalance !== undefined ? emp.initialRegularLeaveBalance : 0);
    mapped.initial_sick_leave_balance = mapped.initial_sick_leave_balance !== undefined ? mapped.initial_sick_leave_balance : (emp.initialSickLeaveBalance !== undefined ? emp.initialSickLeaveBalance : 0);

    // Ensure education fields are explicitly provided in snake_case format
    mapped.education_level = mapped.education_level || emp.educationLevel || '';
    mapped.specialization = mapped.specialization || emp.specialization || '';
    mapped.university = mapped.university || mapped.institution || emp.university || emp.institution || '';
    mapped.institution = mapped.institution || mapped.university || emp.institution || emp.university || '';
    mapped.graduation_year = mapped.graduation_year || emp.graduationYear || '';
    mapped.education_order = mapped.education_order || mapped.evaluation_order || emp.educationOrder || emp.evaluationOrder || '';
    mapped.evaluation_order = mapped.evaluation_order || mapped.education_order || emp.evaluationOrder || emp.educationOrder || '';

    // Ensure job title is explicitly synced and linked with the latest title name from job titles directory
    let jt = emp.jobTitle || emp.job_title || mapped.job_title || mapped.jobTitle || '';
    const jId = emp.jobTitleId || emp.job_title_id || mapped.job_title_id || mapped.jobTitleId;
    if (jId && Array.isArray(jobTitlesCache.list)) {
      const matchById = jobTitlesCache.list.find(t => parseInt(String(t.id)) === parseInt(String(jId)));
      if (matchById && matchById.name) {
        jt = matchById.name;
      }
    }
    mapped.job_title = jt;
    mapped.jobTitle = jt;
    mapped.job_title_id = jId;
    mapped.jobTitleId = jId;

    // Ensure spouse and children details are preserved and synced
    mapped.spouse_names = mapped.spouse_names || emp.spouseNames || emp.spouse_names || '';
    mapped.spouses_data = mapped.spouses_data || emp.spousesData || emp.spouses_data || '';
    mapped.children_details = mapped.children_details || emp.childrenDetails || emp.children_details || '';
    mapped.spouseNames = mapped.spouse_names;
    mapped.spousesData = mapped.spouses_data;
    mapped.childrenDetails = mapped.children_details;

    // Ensure promotion & increment date fields are preserved and synced
    // لا تُشتق تواريخ آخر ترفيع/علاوة من تاريخ الدرجة أو التعيين: القيمة غير المسجلة تبقى null
    // (تعرضها الواجهة «غير معروف») حتى لا يحسب محرك الاستحقاق من تاريخ مختلق.
    const lastPromo = emp.lastPromotionDate || emp.last_promotion_date || mapped.last_promotion_date || mapped.lastPromotionDate || null;
    const lastIncr = emp.lastIncrementDate || emp.last_increment_date || mapped.last_increment_date || mapped.lastIncrementDate || null;
    const nextPromo = emp.nextPromotionDueDate || emp.next_promotion_due_date || mapped.next_promotion_due_date || mapped.nextPromotionDueDate || null;
    const nextIncr = emp.nextIncrementDueDate || emp.next_increment_due_date || mapped.next_increment_due_date || mapped.nextIncrementDueDate || null;

    mapped.last_promotion_date = lastPromo;
    mapped.lastPromotionDate = lastPromo;
    mapped.last_increment_date = lastIncr;
    mapped.lastIncrementDate = lastIncr;
    mapped.next_promotion_due_date = nextPromo;
    mapped.nextPromotionDueDate = nextPromo;
    mapped.next_increment_due_date = nextIncr;
    mapped.nextIncrementDueDate = nextIncr;

    return mapped;
  }

  // --- In-Memory Stores for Job Titles (دليل العناوين الوظيفية والمهنية) ---
  // B3/إصلاح: ذاكرة العناوين صارت «نسخة مخبأة من القاعدة» تُحمَّل عند الإقلاع وتُحدَّث مع كل كتابة.
  // قبلها كانت قائمة الكود الافتراضية بمعرّفات لا تطابق القاعدة ← عنوان خاطئ يُعرض لمن له job_title_id.
  const jobTitlesCache: { list: any[] } = { list: [] };
  jobTitlesCache.list = [
    { id: 1, name: 'رئيس مهندسين أقدم', category: 'هندسي', min_grade: 1, minGrade: 1, min_step: 1, minStep: 1, status: 'فعال', notes: 'الدرجة الأولى والثانية' },
    { id: 2, name: 'رئيس مهندسين', category: 'هندسي', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: 'الدرجة الثالثة' },
    { id: 3, name: 'مهندس أقدم', category: 'هندسي', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: 'الدرجة الرابعة' },
    { id: 4, name: 'مهندس', category: 'هندسي', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: 'الدرجة الخامسة' },
    { id: 5, name: 'معاون مهندس', category: 'هندسي', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: 'الدرجة السابعة' },
    { id: 6, name: 'رئيس مبرمجين أقدم', category: 'حاسبات وتقنية', min_grade: 1, minGrade: 1, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 7, name: 'رئيس مبرمجين', category: 'حاسبات وتقنية', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 8, name: 'معاون رئيس مبرمجين', category: 'حاسبات وتقنية', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 9, name: 'مبرمج أقدم', category: 'حاسبات وتقنية', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 10, name: 'مبرمج', category: 'حاسبات وتقنية', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 11, name: 'معاون مبرمج', category: 'حاسبات وتقنية', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 12, name: 'رئيس محللي نظم', category: 'حاسبات وتقنية', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 13, name: 'محلل نظم أقدم', category: 'حاسبات وتقنية', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 14, name: 'محلل نظم', category: 'حاسبات وتقنية', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 15, name: 'رئيس محاسبين أقدم', category: 'مالي', min_grade: 1, minGrade: 1, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 16, name: 'رئيس محاسبين', category: 'مالي', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 17, name: 'محاسب أقدم', category: 'مالي', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 18, name: 'محاسب', category: 'مالي', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 19, name: 'معاون محاسب', category: 'مالي', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 20, name: 'رئيس مدققين', category: 'مالي', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 21, name: 'مدقق أقدم', category: 'مالي', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 22, name: 'مدقق', category: 'مالي', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 23, name: 'رئيس مشاورين قانونيين', category: 'قانوني', min_grade: 2, minGrade: 2, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 24, name: 'مشاور قانوني أقدم', category: 'قانوني', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 25, name: 'مشاور قانوني', category: 'قانوني', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 26, name: 'قانوني', category: 'قانوني', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 27, name: 'معاون قانوني', category: 'قانوني', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 28, name: 'رئيس إداريين أقدم', category: 'إداري', min_grade: 2, minGrade: 2, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 29, name: 'رئيس إداريين', category: 'إداري', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 30, name: 'إداري أقدم', category: 'إداري', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 31, name: 'إداري', category: 'إداري', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 32, name: 'معاون إداري', category: 'إداري', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 33, name: 'رئيس باحثين', category: 'إداري', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 34, name: 'باحث أقدم', category: 'إداري', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 35, name: 'باحث', category: 'إداري', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 36, name: 'معاون باحث', category: 'إداري', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 37, name: 'رئيس فنيين أقدم', category: 'فني', min_grade: 3, minGrade: 3, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 38, name: 'رئيس فنيين', category: 'فني', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 39, name: 'فني أقدم', category: 'فني', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 40, name: 'فني', category: 'فني', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 41, name: 'معاون فني', category: 'فني', min_grade: 8, minGrade: 8, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 42, name: 'رئيس حرفيين', category: 'مهني وحرفي', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 43, name: 'حرفي أقدم', category: 'مهني وحرفي', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 44, name: 'حرفي', category: 'مهني وحرفي', min_grade: 8, minGrade: 8, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 45, name: 'طبيب اختصاص', category: 'طبي وصحي', min_grade: 2, minGrade: 2, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 46, name: 'طبيب ممارس', category: 'طبي وصحي', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 47, name: 'طبيب مقيم أقدم', category: 'طبي وصحي', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 48, name: 'ممرض جامعي أقدم', category: 'طبي وصحي', min_grade: 4, minGrade: 4, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 49, name: 'ممرض ماهر', category: 'طبي وصحي', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 50, name: 'سائق أول', category: 'خدمات', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 51, name: 'سائق', category: 'خدمات', min_grade: 8, minGrade: 8, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 52, name: 'حارس أقدم', category: 'أمن وحماية', min_grade: 7, minGrade: 7, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 53, name: 'حارس', category: 'أمن وحماية', min_grade: 8, minGrade: 8, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 54, name: 'رئيس كتبة', category: 'إداري', min_grade: 5, minGrade: 5, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 55, name: 'كاتب أقدم', category: 'إداري', min_grade: 6, minGrade: 6, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 56, name: 'كاتب', category: 'إداري', min_grade: 8, minGrade: 8, min_step: 1, minStep: 1, status: 'فعال', notes: '' },
    { id: 57, name: 'معاون كاتب', category: 'إداري', min_grade: 9, minGrade: 9, min_step: 1, minStep: 1, status: 'فعال', notes: '' }
  ];

  // العنوان الوظيفي يجب أن يكون من الدليل المعتمد (job_titles). لم يعد النظام يُنشئ عنواناً تلقائياً
  // من أي نص حر يُكتب في استمارة الموظف؛ العنوان غير المعروف يُرفض برسالة واضحة.
  const normalizeJobTitleName = (text: any) => String(text || '')
    .replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه')
    .replace(/[\u064B-\u065F]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

  async function loadJobTitleDirectory(): Promise<any[]> {
    try {
      const rows = await db.select().from(schema.jobTitles);
      if (rows && rows.length > 0) return rows;
    } catch (err) {
      if (!isDbConnectionFailure(err)) throw err;
    }
    return jobTitlesCache.list || [];
  }

  /** يعيد رسالة خطأ إن كان العنوان غير موجود أو معطلاً في الدليل، وإلا null مع السجل المطابق. */
  async function checkJobTitleInDirectory(rawTitle: any): Promise<{ error: string | null; match: any | null }> {
    const clean = String(rawTitle || '').trim();
    if (!clean) return { error: null, match: null };
    const directory = await loadJobTitleDirectory();
    const norm = normalizeJobTitleName(clean);
    const match = directory.find(t => t && t.name && normalizeJobTitleName(t.name) === norm) || null;
    if (!match) {
      return { error: `العنوان الوظيفي «${clean}» غير موجود في دليل العناوين الوظيفية المعتمد. أضِفه أولاً من إعدادات العناوين الوظيفية ثم أعد الحفظ.`, match: null };
    }
    if (match.status === 'معطل' || match.status === 'غير فعال') {
      return { error: `العنوان الوظيفي «${clean}» معطّل في دليل العناوين الوظيفية ولا يمكن إسناده.`, match };
    }
    return { error: null, match };
  }

  // بذرة تجريبية وهمية بالكامل (لا تمثل أي شخص حقيقي) تظهر فقط في وضع عدم الاتصال بقاعدة البيانات.
  // إصلاح عاجل: أُزيل «موظف تجريبي أول وهمي» (id 1) — كان يُقدَّم على الموظف الحقيقي رقم 1 في المسارات التي تبحث في الذاكرة أولاً
  let inMemoryEmployees: any[] = [];

  async function updateEmployeeCentralRecord(employeeId: number, partialData: any) {
    if (!employeeId || isNaN(employeeId)) return;
    try {
      const dbPayload: any = {};
      const allowedDbColumns = new Set(Object.keys(getTableColumns(schema.employees)));
      for (const [k, v] of Object.entries(partialData)) {
        const camelKey = snakeToCamel(k);
        if (allowedDbColumns.has(camelKey) && camelKey !== 'id') {
          dbPayload[camelKey] = v;
        }
      }
      if (Object.keys(dbPayload).length > 0) {
        dbPayload.updatedAt = new Date();
        // إصلاح عاجل: فشل الحفظ لا يُبتلع (كان يُكمل كأن السجل حُفظ)
        await db.update(schema.employees).set(dbPayload).where(eq(schema.employees.id, employeeId));
      }
    } catch (e) {
      console.error('Error updating central employee in DB:', e);
      throw e;
    }

    // Also update in-memory employee record
    const idx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === employeeId);
    if (idx !== -1) {
      const current = inMemoryEmployees[idx];
      const updated = { ...current };
      for (const [k, v] of Object.entries(partialData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        updated[k] = v;
        updated[camelKey] = v;
        updated[snakeKey] = v;
      }
      updated.updatedAt = new Date().toISOString();
      updated.updated_at = new Date().toISOString();
      inMemoryEmployees[idx] = updated;
      saveLocalDb();
    }
  }

  // صحة تجهيز مخطط قاعدة البيانات: أوامر DDL التي فشلت عند الإقلاع (للمسؤول فقط)
  app.get('/api/admin/schema-health', requireAuth, requireAdmin, async (req, res) => {
    res.json({ ...getSchemaHealth(), migrations: getMigrationStatus() });
  });

  // B2e: أُزيل POST /api/admin/reload-local-db (التخزين البديل متقاعد)

  // Employees API
  // مراجعة صفحة الموظفين (31-08-2026): بناء شروط الفلترة من جهة الخادم لمسار GET /api/employees
  // المرقّم صفحياً - يُطابق منطق الفلاتر الـ20 المطبَّقة سابقاً في src/pages/Employees.jsx حرفياً،
  // لضمان عدم اختلاف نتائج الفلترة بين النسخة القديمة (فلترة على المتصفح) والجديدة (فلترة في قاعدة
  // البيانات)، تمهيداً لتحمّل النظام 10-20 ألف قيد موظف بأداء سريع بدل تحميل كل السجلات دفعة واحدة.
  // PENDING_VALUE_SENTINEL معرَّف مسبقاً أعلاه في الملف (استخدام مشترك)
  const INCOMPLETE_DATA_COLUMNS = [
    schema.employees.nationalId,
    schema.employees.residenceCard,
    schema.employees.rationCard,
    schema.employees.passportNumber,
    schema.employees.address,
    schema.employees.phone,
    schema.employees.email,
    schema.employees.photo,
    schema.employees.appointmentOrder,
    schema.employees.serviceRecordNumber,
    schema.employees.educationOrder,
  ];

  async function buildEmployeeFilterConditions(q: any): Promise<any[]> {
    const conditions: any[] = [];

    // 1. البحث النصي (الاسم الكامل، الرقم الوظيفي، رقم الإضبارة، العنوان الوظيفي)
    if (q.search && String(q.search).trim()) {
      const term = `%${String(q.search).trim()}%`;
      conditions.push(or(
        ilike(schema.employees.fullName, term),
        ilike(schema.employees.civilServiceNumber, term),
        ilike(schema.employees.serviceRecordNumber, term),
        ilike(schema.employees.jobTitle, term)
      ));
    }

    // 2-5. حقول مطابقة مباشرة بسيطة
    const directEqFilters: Array<[any, string | undefined]> = [
      [schema.employees.gender, q.gender],
      [schema.employees.religion, q.religion],
      [schema.employees.ethnicity, q.ethnicity],
      [schema.employees.maritalStatus, q.marital_status],
      [schema.employees.jobTitle, q.job_title],
      [schema.employees.workLocation, q.work_location],
      [schema.employees.workNature, q.work_nature],
      [schema.employees.educationLevel, q.education],
      [schema.employees.workShiftType, q.work_shift_type],
      [schema.employees.serviceType, q.service_type],
    ];
    for (const [col, val] of directEqFilters) {
      if (val !== undefined && val !== null && val !== 'all' && String(val).trim() !== '') {
        conditions.push(eq(col, String(val)));
      }
    }

    // 6. المسؤولية الأساسية
    if (q.primary_resp && q.primary_resp !== 'all') {
      if (q.primary_resp === 'none') {
        conditions.push(or(isNull(schema.employees.primaryResponsibility), eq(schema.employees.primaryResponsibility, 'بلا مسؤولية')));
      } else {
        conditions.push(eq(schema.employees.primaryResponsibility, String(q.primary_resp)));
      }
    }

    // 7. المسؤولية بالوكالة
    if (q.acting_resp && q.acting_resp !== 'all') {
      if (q.acting_resp === 'has_acting') {
        conditions.push(and(isNotNull(schema.employees.actingResponsibility), ne(schema.employees.actingResponsibility, 'بلا وكالة'), ne(schema.employees.actingResponsibility, '')));
      } else if (q.acting_resp === 'no_acting') {
        conditions.push(or(isNull(schema.employees.actingResponsibility), eq(schema.employees.actingResponsibility, 'بلا وكالة'), eq(schema.employees.actingResponsibility, '')));
      } else {
        conditions.push(eq(schema.employees.actingResponsibility, String(q.acting_resp)));
      }
    }

    // 8. درجة الوكيل / صفة الوكالة
    if (q.deputy_level && q.deputy_level !== 'all') {
      if (q.deputy_level === 'general') {
        conditions.push(or(
          and(isNotNull(schema.employees.actingResponsibility), ne(schema.employees.actingResponsibility, 'بلا وكالة'), ne(schema.employees.actingResponsibility, '')),
          and(isNotNull(schema.employees.deputyLevel), ne(schema.employees.deputyLevel, 'لا يوجد'), ne(schema.employees.deputyLevel, '')),
          and(isNotNull(schema.employees.deputyStatus), ne(schema.employees.deputyStatus, 'لا يوجد'), ne(schema.employees.deputyStatus, ''))
        ));
      } else {
        conditions.push(or(eq(schema.employees.deputyLevel, String(q.deputy_level)), eq(schema.employees.deputyStatus, String(q.deputy_level))));
      }
    }

    // 9. نوع التشكيل الهيكلي (يعتمد على جدول org_units لتحديد الجهات المطابقة)
    if (q.org_type && q.org_type !== 'all') {
      let matchingNames: string[] = [];
      try {
        const units = await db.select({ name: schema.orgUnits.name }).from(schema.orgUnits).where(eq(schema.orgUnits.type, String(q.org_type)));
        matchingNames = units.map(u => u.name).filter(Boolean) as string[];
      } catch { /* تجاهل - سيُستخدم الاحتياطي أدناه */ }
      if (matchingNames.length > 0) {
        conditions.push(or(
          inArray(schema.employees.section, matchingNames),
          and(or(isNull(schema.employees.section), eq(schema.employees.section, '')), inArray(schema.employees.department, matchingNames))
        ));
      } else {
        conditions.push(or(
          ilike(schema.employees.section, `%${q.org_type}%`),
          ilike(schema.employees.department, `%${q.org_type}%`)
        ));
      }
    }

    // 10. جهة العمل / القسم / الشعبة (مطابقة دقيقة على القسم أو الشعبة)
    if (q.org_unit && q.org_unit !== 'all') {
      conditions.push(or(eq(schema.employees.department, String(q.org_unit)), eq(schema.employees.section, String(q.org_unit))));
    }

    // 12. حالة الموظف (مع معالجة خاصة لحالة "متقاعد" لتشمل "متقاعد مع تمديد")
    if (q.status && q.status !== 'all') {
      if (q.status === 'متقاعد') {
        conditions.push(or(eq(schema.employees.status, 'متقاعد'), eq(schema.employees.status, 'متقاعد مع تمديد')));
      } else {
        conditions.push(eq(schema.employees.status, String(q.status)));
      }
    }

    // 12b. تمديد خدمة التقاعد
    if (q.extension && q.extension !== 'all') {
      const hasExtCond = or(
        gt(schema.employees.retirementExtensionYears, 0),
        gt(schema.employees.retirementExtensionMonths, 0),
        and(isNotNull(schema.employees.retirementExtensionOrderNumber), ne(schema.employees.retirementExtensionOrderNumber, ''))
      );
      if (q.extension === 'has_extension') {
        conditions.push(hasExtCond);
      } else if (q.extension === 'no_extension') {
        conditions.push(not(hasExtCond));
      } else if (q.extension === 'retired_extended') {
        conditions.push(and(
          or(eq(schema.employees.status, 'متقاعد'), eq(schema.employees.status, 'متقاعد مع تمديد')),
          hasExtCond
        ));
      }
    }

    // 15-16. الدرجة والمرحلة الوظيفية
    if (q.grade && q.grade !== 'all') {
      const g = parseInt(String(q.grade));
      if (!Number.isNaN(g)) conditions.push(eq(schema.employees.grade, g));
    }
    if (q.step && q.step !== 'all') {
      const s = parseInt(String(q.step));
      if (!Number.isNaN(s)) conditions.push(eq(schema.employees.step, s));
    }

    // 19. نظام المناوبة المحدد (بالمعرّف أو بالاسم المطابق)
    if (q.shift_system && q.shift_system !== 'all') {
      let sysName: string | null = null;
      try {
        const [sys] = await db.select({ name: schema.shiftSystems.name }).from(schema.shiftSystems).where(eq(schema.shiftSystems.id, parseInt(String(q.shift_system))));
        sysName = sys?.name || null;
      } catch { /* تجاهل */ }
      const idVal = parseInt(String(q.shift_system));
      const orConds = [];
      if (!Number.isNaN(idVal)) orConds.push(eq(schema.employees.shiftSystemId, idVal));
      if (sysName) orConds.push(eq(schema.employees.shiftSystemName, sysName));
      else orConds.push(eq(schema.employees.shiftSystemName, String(q.shift_system)));
      conditions.push(or(...orConds));
    }

    // 20. اكتمال البيانات (وجود قيمة "سيتم تسجيله لاحقاً" في أي حقل من الحقول القابلة للتأجيل)
    if (q.data_completeness && q.data_completeness !== 'all') {
      // ملاحظة مهمة: eq(col, X) على عمود NULL تُقيَّم إلى NULL في SQL (وليس false)، وبالتالي
      // not(or(...)) كانت تستثني بصمت أي موظف لديه عمود NULL واحد فقط من كل من 'مكتمل' و'غير مكتمل'
      // معاً. الحل: تغليف كل شرط مساواة بـ isNotNull أولاً، ليُقيَّم بوضوح إلى false (لا NULL) على
      // الأعمدة الفارغة، فتصبح not(or(...)) صحيحة منطقياً بشكل كامل (كل موظف يقع في فئة واحدة بالضبط).
      const incompleteConds = [
        ...INCOMPLETE_DATA_COLUMNS.map(col => and(isNotNull(col), eq(col, PENDING_VALUE_SENTINEL))),
        and(isNotNull(schema.employees.spousesData), ilike(schema.employees.spousesData, `%${PENDING_VALUE_SENTINEL}%`)),
        and(isNotNull(schema.employees.childrenDetails), ilike(schema.employees.childrenDetails, `%${PENDING_VALUE_SENTINEL}%`)),
      ];
      const incompleteCond = or(...incompleteConds);
      if (q.data_completeness === 'incomplete') {
        conditions.push(incompleteCond);
      } else if (q.data_completeness === 'complete') {
        conditions.push(not(incompleteCond));
      }
    }

    return conditions;
  }

  const EMPLOYEE_SORT_COLUMNS: Record<string, any> = {
    id: schema.employees.id,
    created_at: schema.employees.createdAt,
    full_name: schema.employees.fullName,
    company_number: schema.employees.companyNumber,
    civil_service_number: schema.employees.civilServiceNumber,
    grade: schema.employees.grade,
    step: schema.employees.step,
    status: schema.employees.status,
  };

  app.get('/api/employees', requireAuth, async (req, res) => {

    // مسار الترقيم والفلترة من جهة الخادم: يُفعَّل فقط عند وجود معامل page في الطلب، حفاظاً على
    // التوافق التام مع كل الاستدعاءات القديمة الأخرى في النظام (الحضور، الرواتب، التقارير...) التي
    // تستدعي هذا المسار بلا معاملات وتتوقع القائمة الكاملة كما كانت دوماً.
    if (req.query.page !== undefined) {
      try {
        const page = Math.max(1, parseInt(String(req.query.page)) || 1);
        const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize)) || 50));
        const sortCol = EMPLOYEE_SORT_COLUMNS[String(req.query.sortBy)] || schema.employees.id;
        const sortDir = String(req.query.sortDir) === 'desc' ? desc : asc;

        const conditions = await buildEmployeeFilterConditions(req.query);
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        let rows: any[] = [];
        let total = 0;
        try {
          const [{ value: totalCount }] = whereClause
            ? await db.select({ value: sqlCount() }).from(schema.employees).where(whereClause)
            : await db.select({ value: sqlCount() }).from(schema.employees);
          total = Number(totalCount) || 0;

          // مهم: .where() يجب أن يُستدعى مباشرة بعد .from() وقبل .orderBy()/.limit()/.offset() -
          // بناء الاستعلام بترتيب مختلف يفشل بصمت في Drizzle ويؤدي لسقوط الاستعلام كاملاً إلى catch (dbErr)
          rows = whereClause
            ? await db.select().from(schema.employees).where(whereClause).orderBy(sortDir(sortCol)).limit(pageSize).offset((page - 1) * pageSize)
            : await db.select().from(schema.employees).orderBy(sortDir(sortCol)).limit(pageSize).offset((page - 1) * pageSize);
        } catch (dbErr: any) {
          console.warn('Database fallback for paginated employees list:', dbErr?.message);
          // احتياطي: فلترة/ترقيم على نسخة الذاكرة عند فشل الاستعلام المباشر لقاعدة البيانات
          rows = inMemoryEmployees.slice((page - 1) * pageSize, page * pageSize);
          total = inMemoryEmployees.length;
        }

        return res.json({
          data: rows.map(enhanceEmployeeRecord),
          total,
          page,
          pageSize,
        });
      } catch (error: any) {
        console.error('Error in paginated employees list:', error);
        return sendRouteError(res, error);
      }
    }

    const statusFilter = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
    try {
      const allEmployees = statusFilter
        ? await db.select().from(schema.employees).where(eq(schema.employees.status, statusFilter)).orderBy(desc(schema.employees.createdAt))
        : await db.select().from(schema.employees).orderBy(desc(schema.employees.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(allEmployees.map(enhanceEmployeeRecord));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const memList = statusFilter
      ? inMemoryEmployees.filter(e => String(e.status || 'مستمر') === statusFilter)
      : inMemoryEmployees;
    res.json(memList.map(enhanceEmployeeRecord));
  });

  app.post('/api/employees', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = normalizeEmployeePayload(req.body);
      const mappedData = mapKeys(data, snakeToCamel);
      processEmployeeNameData(mappedData, true);
      processEmployeeEducationData(mappedData);

      // رقم الشركة: تحقق من الصيغة أولاً (6 أرقام، أو حروف مسموحة لعقد/أجر يومي)
      const companyNumberCheck = validateCompanyNumberFormat(mappedData.companyNumber, mappedData.serviceType);
      if (!companyNumberCheck.isValid) {
        return res.status(400).json({ error: companyNumberCheck.error });
      }
      // منع تكرار رقم الشركة بين الموظفين
      const duplicateEmployee = await findEmployeeByCompanyNumber(mappedData.companyNumber);
      if (duplicateEmployee) {
        return res.status(400).json({ error: `رقم الشركة (${String(mappedData.companyNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }

      // الرقم الوظيفي (رقم وزارة التخطيط): منع التكرار إن أُدخل فعلياً (ليس فارغاً وليس "سيتم تسجيله لاحقاً")
      if (mappedData.civilServiceNumber) {
        const duplicateCivilServiceNumber = await findEmployeeByCivilServiceNumber(mappedData.civilServiceNumber);
        if (duplicateCivilServiceNumber) {
          return res.status(400).json({ error: `الرقم الوظيفي (${String(mappedData.civilServiceNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      }

      if (mappedData.serviceRecordNumber) {
        const dupRecord = await findEmployeeByServiceRecordNumber(mappedData.serviceRecordNumber);
        if (dupRecord) {
          return res.status(400).json({ error: `رقم الإضبارة (${String(mappedData.serviceRecordNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      }

      // رقم هوية الموظف: يُنشأ تلقائياً دوماً عند الإضافة (يتجاهل أي قيمة قد تُرسل من الواجهة لهذا الحقل تحديداً)
      mappedData.employeeIdNumber = await generateUniqueEmployeeIdNumber();

      const cleanData = sanitizeEmployeeData(mappedData);

      if (mappedData.jobTitle || data.job_title) {
        const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
        const titleCheck = await checkJobTitleInDirectory(rawTitle);
        if (titleCheck.error) {
          return res.status(400).json({ error: titleCheck.error });
        }
        if (titleCheck.match) {
          mappedData.jobTitle = titleCheck.match.name;
          cleanData.jobTitle = titleCheck.match.name;
          mappedData.jobTitleId = titleCheck.match.id;
        }
      }

      let insertedFromDb: any = null;
      try {
        const [newEmployee] = await db.insert(schema.employees).values(cleanData).returning();
        if (newEmployee && newEmployee.id) {
          insertedFromDb = newEmployee;
        }
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'إضافة الموظف')) return;
      }

      const newId = insertedFromDb?.id || (inMemoryEmployees.length > 0 ? Math.max(...inMemoryEmployees.map(e => parseInt(String(e.id)) || 0)) + 1 : 1);
      const memEmployee: any = {
        id: newId,
        createdAt: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      for (const [k, v] of Object.entries(mappedData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        memEmployee[k] = v;
        memEmployee[camelKey] = v;
        memEmployee[snakeKey] = v;
      }
      for (const [k, v] of Object.entries(cleanData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        memEmployee[k] = v;
        memEmployee[camelKey] = v;
        memEmployee[snakeKey] = v;
      }
      if (insertedFromDb) {
        for (const [k, v] of Object.entries(insertedFromDb)) {
          const camelKey = snakeToCamel(k);
          const snakeKey = camelToSnake(k);
          memEmployee[k] = v;
          memEmployee[camelKey] = v;
          memEmployee[snakeKey] = v;
        }
      }

      syncEmployeeRecord(memEmployee, 'insert');
      await syncEmployeeQualificationFromEmployee(newId, mappedData);
      saveLocalDb();
      res.status(201).json(enhanceEmployeeRecord(memEmployee));
    } catch (error: any) {
      console.error('Error creating employee:', error);
      sendRouteError(res, error);
    }
  });

  app.post('/api/employees/bulk-import', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { employees } = req.body;
      if (!Array.isArray(employees) || employees.length === 0) {
        return res.status(400).json({ error: 'لم يتم تزويد قائمة موظفين صالحة للترحيل' });
      }

      // إصلاح عاجل: قوائم التحقق من القاعدة لا من الذاكرة (فارغة بعد B2e)
      const [ljt, led, lss] = await Promise.all([
        db.select().from(schema.jobTitles), db.select().from(schema.educationDegrees), db.select().from(schema.shiftSystems),
      ]);
      const lookupData = {
        jobTitles: ljt.map(bothCases),
        educationDegrees: led.map(bothCases),
        shiftSystems: lss.map(bothCases),
        salaryScaleMap: SALARY_TABLE
      };

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const rejectedRows: any[] = [];
      const processedEmployees: any[] = [];

      for (let idx = 0; idx < employees.length; idx++) {
        const empItem = employees[idx];
        const rowNum = empItem.excelRowNumber || empItem.rowNumber || (idx + 2);
        const action = empItem.action || (empItem.overwrite ? 'update' : 'insert');
        if (action === 'skip') {
          skippedCount++;
          continue;
        }

        const empData = empItem.data || empItem;
        const mappedData = mapKeys(empData, snakeToCamel);
        delete mappedData.id;
        delete mappedData.createdAt;

        // Perform strict validation against authoritative settings tables
        const valResult = validateEmployeeImportRow(mappedData, lookupData);
        if (!valResult.isValid) {
          rejectedRows.push({
            rowNumber: rowNum,
            name: mappedData.fullName || mappedData.firstName || empData.full_name || empData.first_name || 'موظف',
            companyNumber: mappedData.companyNumber || empData.company_number || '',
            reason: valResult.errors.join(' | '),
            errors: valResult.errors
          });
          continue; // Skip this row and do NOT reject the whole file!
        }

        processEmployeeNameData(mappedData, true);
        processEmployeeEducationData(mappedData);

        // لا تُختلق قيم افتراضية للحالة أو نوع الخدمة أو الجنس: الحقل الفارغ يبقى فارغاً («بيانات ناقصة»).

        const cleanData = sanitizeEmployeeData(mappedData);
        let handled = false;

        try {
          const companyNum = mappedData.companyNumber ? String(mappedData.companyNumber).trim() : null;
          const civilNum = mappedData.civilServiceNumber ? String(mappedData.civilServiceNumber).trim() : null;

          let existingEmp = null;
          if (companyNum) {
            const [found] = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, companyNum));
            existingEmp = found;
          }
          if (!existingEmp && civilNum) {
            const [found] = await db.select().from(schema.employees).where(eq(schema.employees.civilServiceNumber, civilNum));
            existingEmp = found;
          }

          if (existingEmp && action === 'update') {
            const [updated] = await db.update(schema.employees)
              .set(cleanData)
              .where(eq(schema.employees.id, existingEmp.id))
              .returning();

            handled = true;
            updatedCount++;
            if (updated) {
              await syncEmployeeQualificationFromEmployee(updated.id, mappedData);
              syncEmployeeRecord(updated, 'update');
              processedEmployees.push(enhanceEmployeeRecord(updated));
              handled = true;
            }
          } else {
            const [inserted] = await db.insert(schema.employees).values(cleanData).returning();
            handled = true;
            insertedCount++;

            if (inserted) {
              await syncEmployeeQualificationFromEmployee(inserted.id, mappedData);
              syncEmployeeRecord(inserted, 'insert');
              processedEmployees.push(enhanceEmployeeRecord(inserted));
              handled = true;
            }
          }
        } catch (dbErr) {
          if (!isDbConnectionFailure(dbErr)) {
            // خطأ بيانات حقيقي (تكرار، قيد، صيغة): يُرفض الصف ولا يُحسب ضمن المُدرَجين ولا يُكتب في الذاكرة.
            const classified = classifyDbError(dbErr, 'حفظ الصف');
            console.error(`[DB-ERROR] bulk import row ${rowNum}:`, (dbErr as any)?.cause?.message || (dbErr as any)?.message);
            rejectedRows.push({
              rowNumber: rowNum,
              name: mappedData.fullName || mappedData.firstName || empData.full_name || empData.first_name || 'موظف',
              companyNumber: mappedData.companyNumber || empData.company_number || '',
              reason: classified.message,
              errors: [classified.message]
            });
            continue;
          }
          console.warn('Database fallback (offline) for bulk import item');
        }

        if (!handled) {
          const newId = inMemoryEmployees.length > 0 ? Math.max(...inMemoryEmployees.map(e => e.id || 0)) + 1 : 1;
          const memEmp = { id: newId, ...cleanData, createdAt: new Date().toISOString() };
          syncEmployeeRecord(memEmp, 'insert');
          await syncEmployeeQualificationFromEmployee(newId, mappedData);
          processedEmployees.push(enhanceEmployeeRecord(memEmp));
          insertedCount++;
        }
      }

      saveLocalDb();
      res.json({
        success: true,
        totalCount: employees.length,
        acceptedCount: processedEmployees.length,
        rejectedCount: rejectedRows.length,
        insertedCount,
        updatedCount,
        skippedCount,
        rejectedRows,
        employees: processedEmployees
      });
    } catch (error: any) {
      console.error('Error in bulk import:', error);
      sendRouteError(res, error, 'ترحيل الموظفين');
    }
  });

  // إحصائية عدد الموظفين ضمن كل حالة (لبطاقات التنقل بين الحالات في صفحة الموظفين)
  // ملاحظة: يجب أن يُسجَّل هذا المسار قبل app.get('/api/employees/:id') وإلا سيُفسَّر
  // "status-counts" كمعرّف موظف (:id) لأن Express يطابق المسارات بترتيب التسجيل.
  app.get('/api/employees/status-counts', requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select({ status: schema.employees.status, count: sqlCount() })
        .from(schema.employees)
        .groupBy(schema.employees.status);
      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const key = r.status || 'غير محدد';
        const n = Number(r.count) || 0;
        counts[key] = (counts[key] || 0) + n;
        total += n;
      }
      return res.json({ counts, total });
    } catch (error: any) {
      console.warn('Database fallback for employee status counts:', error?.message);
      const counts: Record<string, number> = {};
      for (const e of inMemoryEmployees) {
        const key = e.status || e.Status || 'غير محدد';
        counts[key] = (counts[key] || 0) + 1;
      }
      return res.json({ counts, total: inMemoryEmployees.length });
    }
  });

  app.get('/api/employees/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    try {
      const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      if (employee) {
        return res.json(enhanceEmployeeRecord(employee));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const memEmp = inMemoryEmployees.find(e => parseInt(String(e.id)) === id);
    if (memEmp) {
      return res.json(enhanceEmployeeRecord(memEmp));
    }
    res.status(404).json({ error: 'الموظف غير موجود' });
  });

  app.put('/api/employees/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    const data = normalizeEmployeePayload(req.body);
    const mappedData = mapKeys(data, snakeToCamel);
    processEmployeeNameData(mappedData, false);
    processEmployeeEducationData(mappedData);

    // رقم الشركة: تحقق من الصيغة والتفرد عند التعديل أيضاً (إن أُرسل الحقل ضمن التحديث)
    if (mappedData.companyNumber !== undefined) {
      const companyNumberCheck = validateCompanyNumberFormat(mappedData.companyNumber, mappedData.serviceType);
      if (!companyNumberCheck.isValid) {
        return res.status(400).json({ error: companyNumberCheck.error });
      }
      const duplicateEmployee = await findEmployeeByCompanyNumber(mappedData.companyNumber, id);
      if (duplicateEmployee) {
        return res.status(400).json({ error: `رقم الشركة (${String(mappedData.companyNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }
    }

    // الرقم الوظيفي (رقم وزارة التخطيط): يُمنع إدخال رقم مستخدم لموظف آخر، لكن فقط إذا تغيّر الرقم.
    // قرار 2026-11-09: المعرّف الموثوق هو رقم الشركة؛ الرقم الوظيفي غير مفروض فريداً في القاعدة
    // (توجد تكرارات قديمة)، فلا يُقفل تعديل بقية بيانات موظف يحمل رقماً مكرراً قديماً.
    let civilUnchanged = false;
    if (mappedData.civilServiceNumber !== undefined && mappedData.civilServiceNumber) {
      try {
        const [cur] = await db.select({ csn: schema.employees.civilServiceNumber }).from(schema.employees).where(eq(schema.employees.id, id));
        civilUnchanged = !!cur && String(cur.csn ?? '').trim() === String(mappedData.civilServiceNumber).trim();
      } catch { /* القاعدة غير متاحة: يُطبَّق الفحص كالمعتاد */ }
    }
    if (!civilUnchanged && mappedData.civilServiceNumber !== undefined && mappedData.civilServiceNumber) {
      const duplicateCivilServiceNumber = await findEmployeeByCivilServiceNumber(mappedData.civilServiceNumber, id);
      if (duplicateCivilServiceNumber) {
        return res.status(400).json({ error: `الرقم الوظيفي (${String(mappedData.civilServiceNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }
    }

    if (mappedData.serviceRecordNumber) {
      try {
        const dupRecord = await findEmployeeByServiceRecordNumber(mappedData.serviceRecordNumber, id);
        if (dupRecord) {
          return res.status(400).json({ error: `رقم الإضبارة (${String(mappedData.serviceRecordNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
        }
      } catch (dupErr) {
        return sendRouteError(res, dupErr, 'التحقق من رقم الإضبارة');
      }
    }

    // رقم هوية الموظف: يُنشأ تلقائياً مرة واحدة فقط عند الإضافة، ولا يُسمح بتعديله يدوياً عبر واجهة التعديل إطلاقاً
    delete mappedData.employeeIdNumber;

    const cleanData = sanitizeEmployeeData(mappedData);

    if (mappedData.jobTitle || data.job_title) {
      const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
      // يُفحص العنوان مقابل الدليل فقط إذا تغيّر عن العنوان المحفوظ حالياً (السجلات القديمة لا تُقفل).
      let currentTitle = '';
      try {
        const [cur] = await db.select({ jobTitle: schema.employees.jobTitle }).from(schema.employees).where(eq(schema.employees.id, id));
        currentTitle = String(cur?.jobTitle || '').trim();
      } catch (curErr) {
        if (!isDbConnectionFailure(curErr)) return sendRouteError(res, curErr, 'تعديل الموظف');
        const memCur = inMemoryEmployees.find(e => parseInt(String(e.id)) === id);
        currentTitle = String(memCur?.jobTitle || memCur?.job_title || '').trim();
      }
      if (normalizeJobTitleName(rawTitle) !== normalizeJobTitleName(currentTitle)) {
        let titleCheck: { error: string | null; match: any | null };
        try {
          titleCheck = await checkJobTitleInDirectory(rawTitle);
        } catch (dirErr) {
          return sendRouteError(res, dirErr, 'التحقق من العنوان الوظيفي');
        }
        if (titleCheck.error) {
          return res.status(400).json({ error: titleCheck.error });
        }
        if (titleCheck.match) {
          mappedData.jobTitle = titleCheck.match.name;
          cleanData.jobTitle = titleCheck.match.name;
          mappedData.jobTitleId = titleCheck.match.id;
        }
      }
    }

    let updatedFromDb: any = null;
    let dbAnswered = false;
    try {
      const [updatedEmployee] = Object.keys(cleanData).length > 0
        ? await db.update(schema.employees).set(cleanData).where(eq(schema.employees.id, id)).returning()
        : await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      dbAnswered = true;

      if (updatedEmployee && updatedEmployee.id) {
        updatedFromDb = updatedEmployee;
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل بيانات الموظف')) return;
    }
    if (dbAnswered && !updatedFromDb) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    const idx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === id);
    let updatedRecord: any = null;
    if (idx !== -1) {
      const current = inMemoryEmployees[idx];
      updatedRecord = { ...current };
      for (const [k, v] of Object.entries(mappedData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        updatedRecord[k] = v;
        updatedRecord[camelKey] = v;
        updatedRecord[snakeKey] = v;
      }
      for (const [k, v] of Object.entries(cleanData)) {
        const camelKey = snakeToCamel(k);
        const snakeKey = camelToSnake(k);
        updatedRecord[k] = v;
        updatedRecord[camelKey] = v;
        updatedRecord[snakeKey] = v;
      }
      if (updatedFromDb) {
        for (const [k, v] of Object.entries(updatedFromDb)) {
          const camelKey = snakeToCamel(k);
          const snakeKey = camelToSnake(k);
          updatedRecord[k] = v;
          updatedRecord[camelKey] = v;
          updatedRecord[snakeKey] = v;
        }
      }
      updatedRecord.updatedAt = new Date().toISOString();
      updatedRecord.updated_at = new Date().toISOString();
      inMemoryEmployees[idx] = updatedRecord;
    } else {
      updatedRecord = { id, ...mappedData, ...cleanData, ...(updatedFromDb || {}) };
      inMemoryEmployees.push(updatedRecord);
    }

    await syncEmployeeQualificationFromEmployee(id, mappedData);
    saveLocalDb();
    res.json(enhanceEmployeeRecord(updatedRecord));
  });

  // ==================== نظام الأرشفة الشاملة عند حذف الموظف (1 أيلول 2026) ====================
  // بطلب دقيق من الإدارة: عند حذف حساب موظف — حتى لو كان مرتبطاً بسجلات أخرى — يُنقل هو وجميع
  // سجلاته المرتبطة بالنظام دفعة واحدة إلى أرشيف المحذوفات، بدلاً من منع الحذف كما كان سابقاً.
  // من الأرشيف: إما استعادة كاملة لكل شيء كما كان قبل الحذف تماماً، أو حذف نهائي لا رجعة فيه.
  // خلال بقائه في الأرشيف، الموظف وكل بياناته وملفاته محذوفون فعلياً من الجداول الحية (ولا يوجد
  // سواهم إلا كنسخة JSON كاملة داخل archived_items)، وهذا يضمن تلقائياً أنه لا يمكن لأي جزء من
  // النظام إضافة/تعديل/حذف أي شيء يخصه، وأنه محجوب بالكامل عن كل صفحات النظام أثناء الأرشفة.

  // كل الجداول المرتبطة بالموظف مباشرة عبر عمود employee_id مع قيد cascade فعلي في قاعدة البيانات:
  // حذف صف الموظف يحذفها تلقائياً؛ نجمعها هنا فقط لالتقاط نسخة منها قبل الحذف ولإعادة إدراجها لاحقاً
  // عند الاستعادة (بنفس المعرّفات الأصلية).
  const EMPLOYEE_CASCADE_TABLES: { key: string; table: any; column: any; memKey?: string }[] = [
    { key: 'careerHistories', table: schema.careerHistories, column: schema.careerHistories.employeeId, memKey: 'career' },
    { key: 'leaveRequests', table: schema.leaveRequests, column: schema.leaveRequests.employeeId, memKey: 'leaves' },
    { key: 'penalties', table: schema.penalties, column: schema.penalties.employeeId, memKey: 'penalties' },
    { key: 'appreciations', table: schema.appreciations, column: schema.appreciations.employeeId, memKey: 'appreciations' },
    { key: 'performanceEvaluations', table: schema.performanceEvaluations, column: schema.performanceEvaluations.employeeId, memKey: 'performance' },
    { key: 'trainingEnrollments', table: schema.trainingEnrollments, column: schema.trainingEnrollments.employeeId },
    { key: 'salaryRecords', table: schema.salaryRecords, column: schema.salaryRecords.employeeId },
    { key: 'attendance', table: schema.attendance, column: schema.attendance.employeeId },
    { key: 'qualifications', table: schema.qualifications, column: schema.qualifications.employeeId, memKey: 'qualifications' },
    { key: 'jobAssignments', table: schema.jobAssignments, column: schema.jobAssignments.employeeId, memKey: 'job-assignments' },
    { key: 'promotionsIncrements', table: schema.promotionsIncrements, column: schema.promotionsIncrements.employeeId, memKey: 'promotions' },
    { key: 'salaryAllowances', table: schema.salaryAllowances, column: schema.salaryAllowances.employeeId, memKey: 'salary-allowances' },
    { key: 'annualEvaluations', table: schema.annualEvaluations, column: schema.annualEvaluations.employeeId, memKey: 'annual-evaluations' },
    { key: 'trainingCourses', table: schema.trainingCourses, column: schema.trainingCourses.employeeId, memKey: 'training-courses' },
    { key: 'transfers', table: schema.transfers, column: schema.transfers.employeeId, memKey: 'transfers' },
    { key: 'retirements', table: schema.retirements, column: schema.retirements.employeeId, memKey: 'retirements' },
    { key: 'documents', table: schema.documents, column: schema.documents.employeeId, memKey: 'documents' },
    { key: 'serviceRecords', table: schema.serviceRecords, column: schema.serviceRecords.employeeId, memKey: 'service-records' },
    { key: 'employeeCommendations', table: schema.employeeCommendations, column: schema.employeeCommendations.employeeId },
    { key: 'serviceCredits', table: schema.serviceCredits, column: schema.serviceCredits.employeeId, memKey: 'service-credits' },
    { key: 'degreeTrackSnapshots', table: schema.degreeTrackSnapshots, column: schema.degreeTrackSnapshots.employeeId, memKey: 'degree-track-snapshots' },
    { key: 'specializationCourseCredits', table: schema.specializationCourseCredits, column: schema.specializationCourseCredits.employeeId, memKey: 'specialization-credits' },
    { key: 'promotionDelayReasons', table: schema.promotionDelayReasons, column: schema.promotionDelayReasons.employeeId, memKey: 'promotion-delay-reasons' },
  ];

  // جداول مرتبطة بالموظف لكنها بلا قيد cascade فعلي في قاعدة البيانات، فتحتاج معالجة يدوية صريحة:
  // - trainers: ملف "مدرّب داخلي" اختياري للموظف؛ قد تُشير إليه دورات تدريبية سُجّلت لموظفين آخرين
  //   عبر trainings.trainer_id، لكن اسم المدرب محفوظ بشكل منفصل ومكرَّر (trainer_name) داخل كل دورة،
  //   فأرشفة/حذف ملف المدرب لا تُفقد الموظفين الآخرين أي بيانات أو سجلات تخصهم — هذا هو "الملف
  //   المشترك مع موظفين آخرين" الوحيد المكتشف في قاعدة البيانات الحالية.
  // - governingCourseEmployeeAssignments: يستخدم employee_id كنص وليس مفتاحاً خارجياً حقيقياً.
  async function checkEmployeeRelatedRecords(employeeId: number): Promise<{ canProceed: boolean; message?: string; breakdown?: Record<string, number> }> {
    const checks: { label: string; table: any; column: any; memArray?: any[] }[] = [
      { label: 'قسائم رواتب', table: schema.salaryRecords, column: schema.salaryRecords.employeeId },
      { label: 'طلبات إجازة', table: schema.leaveRequests, column: schema.leaveRequests.employeeId, memArray: inMemoryLeaves },
      { label: 'عقوبات إدارية', table: schema.penalties, column: schema.penalties.employeeId, memArray: inMemoryPenalties },
      { label: 'كتب شكر وتقدير', table: schema.appreciations, column: schema.appreciations.employeeId, memArray: inMemoryAppreciations },
      { label: 'تقييمات أداء سنوية', table: schema.performanceEvaluations, column: schema.performanceEvaluations.employeeId, memArray: inMemoryPerformanceEvaluations },
      { label: 'مؤهلات دراسية', table: schema.qualifications, column: schema.qualifications.employeeId, memArray: inMemoryQualifications },
      { label: 'سجلات تكليف وظيفي', table: schema.jobAssignments, column: schema.jobAssignments.employeeId, memArray: inMemoryJobAssignments },
      { label: 'سجلات تنقلات', table: schema.transfers, column: schema.transfers.employeeId, memArray: inMemoryTransfers },
      { label: 'سجلات تقاعد', table: schema.retirements, column: schema.retirements.employeeId, memArray: inMemoryRetirements },
      { label: 'مستندات ومرفقات', table: schema.documents, column: schema.documents.employeeId, memArray: inMemoryDocuments },
      { label: 'سجلات احتساب خدمة / تمديد', table: schema.serviceRecords, column: schema.serviceRecords.employeeId, memArray: inMemoryServiceRecords },
    ];

    const breakdown: Record<string, number> = {};
    for (const check of checks) {
      let count = 0;
      try {
        const rows = await db.select().from(check.table).where(eq(check.column, employeeId));
        count = rows.length;
      } catch (err) {
        count = 0;
      }
      if (count === 0 && Array.isArray(check.memArray)) {
        count = check.memArray.filter((item: any) =>
          parseInt(String(item.employee_id ?? item.employeeId ?? '0')) === employeeId
        ).length;
      }
      if (count > 0) breakdown[check.label] = count;
    }

    if (Object.keys(breakdown).length === 0) {
      return { canProceed: true };
    }

    const summary = Object.entries(breakdown).map(([label, count]) => `${label} (${count})`).join('، ');
    // ملاحظة: هذا الفحص لم يعد يُستخدم لمنع الحذف (انظر التحديث أعلاه بتاريخ 1 أيلول 2026)، بل فقط
    // لعرض ملخّص السجلات المنقولة إلى الأرشيف مع الموظف في استجابة الحذف.
    return {
      canProceed: true,
      message: `تم نقل الموظف إلى الأرشيف مع السجلات المرتبطة به: ${summary}`,
      breakdown
    };
  }

  // التقاط نسخة كاملة من كل السجلات المرتبطة بالموظف في كل مفاصل النظام قبل حذفها، لتُحفظ ضمن
  // بيانات الأرشيف (data) وتُستخدم لاحقاً في الاستعادة الكاملة إن طُلبت.
  async function buildEmployeeCascadeSnapshot(employeeId: number): Promise<Record<string, any[]>> {
    const related: Record<string, any[]> = {};

    for (const cfg of EMPLOYEE_CASCADE_TABLES) {
      // B3/إصلاح: فشل القراءة يُوقف الأرشفة (كان يُبتلع فيُحذف الموظف بأرشيف ناقص)، ولا رجوع للذاكرة
      const rows: any[] = await db.select().from(cfg.table).where(eq(cfg.column, employeeId));
      related[cfg.key] = rows || [];
    }

    // خطوات محاكاة مسار الشهادات (degree_track_simulation_steps) ترتبط بلقطة المسار (snapshot) وليس بالموظف مباشرة
    const snapshotIds = (related['degreeTrackSnapshots'] || []).map((s: any) => s.id).filter((v: any) => v != null);
    let simulationSteps: any[] = [];
    if (snapshotIds.length > 0) {
      simulationSteps = await db.select().from(schema.degreeTrackSimulationSteps).where(inArray(schema.degreeTrackSimulationSteps.snapshotId, snapshotIds));
    }
    related['degreeTrackSimulationSteps'] = simulationSteps;

    let trainerRows: any[] = [];
    trainerRows = await db.select().from(schema.trainers).where(eq(schema.trainers.employeeId, employeeId)) // B3/إصلاح: لا ابتلاع للخطأ
    related['trainers'] = trainerRows || [];

    let governingRows: any[] = [];
    governingRows = await db.select().from(schema.governingCourseEmployeeAssignments).where(eq(schema.governingCourseEmployeeAssignments.employeeId, String(employeeId))) // B3/إصلاح: لا ابتلاع للخطأ
    related['governingCourseEmployeeAssignments'] = governingRows || [];

    return related;
  }

  // حذف كل أثر للموظف من مخازن الذاكرة المؤقتة (النسخة الاحتياطية التي يعمل عليها النظام عند تعذّر
  // الاتصال الفعلي بقاعدة البيانات)، بما يضمن حجبه الكامل عن كل صفحات النظام أثناء بقائه في الأرشيف.
  function removeEmployeeFromMemoryStores(employeeId: number) {
    Object.keys(genericMemoryStores).forEach(key => {
      if (Array.isArray(genericMemoryStores[key])) {
        genericMemoryStores[key] = genericMemoryStores[key].filter(
          (item: any) => parseInt(String(item.employee_id ?? item.employeeId ?? '0')) !== employeeId
        );
      }
    });
    // خطوات محاكاة مسار الشهادات ترتبط بلقطة (snapshot_id) لا بالموظف مباشرة؛ بعد حذف لقطاته أعلاه
    // نحذف أي خطوات محاكاة يتيمة تابعة لها احتياطاً
    if (Array.isArray(genericMemoryStores['degree-track-simulation-steps'])) {
      const remainingSnapshotIds = new Set(
        (genericMemoryStores['degree-track-snapshots'] || []).map((s: any) => parseInt(String(s.id)))
      );
      genericMemoryStores['degree-track-simulation-steps'] = genericMemoryStores['degree-track-simulation-steps'].filter(
        (item: any) => remainingSnapshotIds.has(parseInt(String(item.snapshot_id ?? item.snapshotId ?? '0')))
      );
    }
  }

  app.delete('/api/employees/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // جلب نسخة كاملة من بيانات الموظف قبل الحذف لأرشفتها: الحذف هنا ليس نهائياً، بل نقل — هو وجميع
    // سجلاته المرتبطة بكل مفاصل النظام دفعة واحدة — إلى أرشيف المحذوفات (archived_items)، حسب طلب
    // دقيق بتاريخ 1 أيلول 2026: لم يعد الحذف يُمنع لوجود سجلات مرتبطة، بل تُنقل معه جميعها للأرشيف،
    // ومن هناك إما استعادة كاملة أو حذف نهائي لا رجعة فيه.
    let employeeSnapshot: any = null;
    try {
      const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      if (employee) employeeSnapshot = employee;
    } catch (error: any) {
      console.warn('Database fallback for employee snapshot before archive');
    }
    if (!employeeSnapshot) {
      employeeSnapshot = inMemoryEmployees.find((e: any) => parseInt(String(e.id)) === id) || null;
    }
    if (!employeeSnapshot) {
      return res.status(404).json({ error: 'الموظف غير موجود' });
    }

    // التقاط ملخّص وصفي (لعرضه فقط في الاستجابة) + نسخة كاملة من كل السجلات المرتبطة قبل حذف أي شيء
    const relatedCheck = await checkEmployeeRelatedRecords(id);
    const relatedSnapshot = await buildEmployeeCascadeSnapshot(id);

    let archivedRowId: number | null = null;
    try {
      const [archivedRow] = await db.insert(schema.archivedItems).values({
        entityType: 'employee',
        entityId: id,
        entityLabel: employeeSnapshot.fullName || employeeSnapshot.full_name || `موظف #${id}`,
        data: JSON.stringify({ employee: employeeSnapshot, related: relatedSnapshot }),
        deletedBy: req.user?.username || req.user?.email || null,
        deletedByName: (req.user as any)?.fullName || (req.user as any)?.name || req.user?.username || req.user?.email || null,
      }).returning({ id: schema.archivedItems.id });
      archivedRowId = archivedRow?.id ?? null;
    } catch (archiveError: any) {
      console.error('CRITICAL: failed to archive employee before delete, aborting delete:', archiveError?.message);
      return res.status(500).json({ error: 'تعذّر نقل الموظف إلى أرشيف المحذوفات؛ تم إلغاء عملية الحذف حفاظاً على سلامة البيانات. الرجاء المحاولة لاحقاً.' });
    }

    // حذف فعلي داخل معاملة واحدة (transaction): يُحذف صراحةً كل جدول من الجداول الـ23 المرتبطة
    // بالموظف (EMPLOYEE_CASCADE_TABLES) يدوياً بالكود، دون أي اعتماد على قيد cascade في قاعدة
    // البيانات — فحسب تدقيق حي أُجري بتاريخ 2 أيلول 2026، فقط 11 من أصل 23 جدولاً تملك فعلياً قيد
    // "ON DELETE CASCADE" حقيقياً في قاعدة البيانات الفعلية (رغم أن schema.ts يُعرّف هذا القيد على
    // الجداول الـ23 كلها)؛ الجداول الـ12 الباقية (career_histories, leave_requests, penalties,
    // appreciations, performance_evaluations, training_enrollments, salary_records, attendance,
    // qualifications, job_assignments, employee_commendations, service_records) عمودها عادي بلا
    // أي قيد مفتاح خارجي إطلاقاً. الاعتماد على الافتراض السابق كان يترك سجلات هذه الجداول الـ12
    // حيّة يتيمة بعد حذف الموظف (تسبب تحديداً في فشل الاستعادة لاحقاً بخطأ تكرار مفتاح أساسي عند
    // إعادة إدراجها بنفس معرّفاتها). الحذف الصريح هنا مأمون تماماً حتى للجداول التي تملك cascade
    // فعلياً (حذف صفر صف هو ببساطة عملية لا تُغيّر شيئاً). كذلك تُحذف يدوياً الجداول التي لا تملك
    // قيد cascade فعلياً أصلاً (trainers, governingCourseEmployeeAssignments) حتى تكون عملية الحجب
    // شاملة فعلاً كما طُلب.
    let deleteConfirmed = false;
    let deleteErrorDetail: string | null = null;
    try {
      await db.transaction(async (tx) => {
        // خطوات محاكاة مسار الشهادات ترتبط بلقطة (snapshot_id) لا بالموظف مباشرة، فيجب حذفها قبل
        // حذف لقطات المسار نفسها (degreeTrackSnapshots) لتفادي أي تعارض في ترتيب الحذف
        const snapshotIds = (relatedSnapshot['degreeTrackSnapshots'] || []).map((s: any) => s.id).filter((v: any) => v != null);
        if (snapshotIds.length > 0) {
          await tx.delete(schema.degreeTrackSimulationSteps).where(inArray(schema.degreeTrackSimulationSteps.snapshotId, snapshotIds));
        }
        for (const cfg of EMPLOYEE_CASCADE_TABLES) {
          await tx.delete(cfg.table).where(eq(cfg.column, id));
        }
        await tx.delete(schema.trainers).where(eq(schema.trainers.employeeId, id));
        await tx.delete(schema.governingCourseEmployeeAssignments).where(eq(schema.governingCourseEmployeeAssignments.employeeId, String(id)));
        const deletedRows = await tx.delete(schema.employees).where(eq(schema.employees.id, id)).returning({ id: schema.employees.id });
        deleteConfirmed = Array.isArray(deletedRows) && deletedRows.length > 0;
        if (!deleteConfirmed) {
          throw new Error('EMPLOYEE_DELETE_NOT_CONFIRMED');
        }
      });
    } catch (error: any) {
      deleteErrorDetail = error?.cause?.message || error?.message || String(error);
      console.warn('Database fallback / rollback for cascade delete employee:', deleteErrorDetail);
      deleteConfirmed = false;
    }

    if (!deleteConfirmed) {
      try {
        const [stillThere] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, id));
        if (stillThere) {
          if (archivedRowId) {
            try { await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, archivedRowId)); } catch {}
          }
          return res.status(500).json({ error: 'تعذّر حذف قيد الموظف وسجلاته فعلياً من قاعدة البيانات؛ تم التراجع عن نقله إلى الأرشيف حفاظاً على تطابق البيانات.' + (deleteErrorDetail ? (' التفاصيل: ' + deleteErrorDetail) : '') });
        }
      } catch (verifyError: any) {
        console.warn('Could not verify employee deletion, proceeding with in-memory sync:', verifyError?.message);
      }
    }

    syncEmployeeRecord({ id }, 'delete');
    removeEmployeeFromMemoryStores(id);

    saveLocalDb();
    res.json({ success: true, archived: true, relatedRecords: relatedCheck.breakdown || {} });
  });

  // ==================== أرشيف المحذوفات (Soft Delete Archive) ====================
  // عند حذف أي سجل مدعوم (الموظفون حالياً)، يُنقل هو وجميع سجلاته المرتبطة إلى هذا الأرشيف بدلاً من
  // حذفه نهائياً. مدير النظام يستطيع من نافذة الإعدادات استعراض الأرشيف، استعادة أي سجل منه بكل
  // تفاصيله بنفس معرّفاته الأصلية، أو تأكيد حذفه بشكل نهائي ولا رجعة فيه.

  app.get('/api/archive', requireAuth, requireAdmin, async (req, res) => {
    try {
      const entityType = req.query.entity_type as string | undefined;
      let query = db.select().from(schema.archivedItems);
      if (entityType) {
        query = db.select().from(schema.archivedItems).where(eq(schema.archivedItems.entityType, entityType)) as any;
      }
      const rows = await query.orderBy(desc(schema.archivedItems.createdAt));
      return res.json(rows.map((r: any) => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error listing archived items:', error?.message);
      return res.status(500).json({ error: 'تعذّر تحميل أرشيف المحذوفات' });
    }
  });

  // خريطة (جدول Drizzle <- مفتاح في بيانات الأرشيف) لكل الجداول المرتبطة بالموظف، تُستخدم عند
  // الاستعادة لإعادة إدراج كل سجل بنفس معرّفه الأصلي. الترتيب هنا مهم: يجب إدراج لقطات مسار
  // الشهادات (degreeTrackSnapshots) قبل خطوات محاكاتها (degreeTrackSimulationSteps) لأن الأخيرة
  // ترتبط بها عبر مفتاح خارجي داخلي.
  const EMPLOYEE_RESTORE_ORDER: string[] = [
    'degreeTrackSnapshots', 'degreeTrackSimulationSteps',
    'careerHistories', 'leaveRequests', 'penalties', 'appreciations', 'performanceEvaluations',
    'trainingEnrollments', 'salaryRecords', 'attendance', 'qualifications', 'jobAssignments',
    'promotionsIncrements', 'salaryAllowances', 'annualEvaluations', 'trainingCourses',
    'transfers', 'retirements', 'documents', 'serviceRecords', 'employeeCommendations',
    'serviceCredits', 'specializationCourseCredits', 'promotionDelayReasons',
    'trainers', 'governingCourseEmployeeAssignments',
  ];
  const EMPLOYEE_RESTORE_TABLE_BY_KEY: Record<string, any> = {
    careerHistories: schema.careerHistories, leaveRequests: schema.leaveRequests, penalties: schema.penalties,
    appreciations: schema.appreciations, performanceEvaluations: schema.performanceEvaluations,
    trainingEnrollments: schema.trainingEnrollments, salaryRecords: schema.salaryRecords, attendance: schema.attendance,
    qualifications: schema.qualifications, jobAssignments: schema.jobAssignments, promotionsIncrements: schema.promotionsIncrements,
    salaryAllowances: schema.salaryAllowances, annualEvaluations: schema.annualEvaluations, trainingCourses: schema.trainingCourses,
    transfers: schema.transfers, retirements: schema.retirements, documents: schema.documents, serviceRecords: schema.serviceRecords,
    employeeCommendations: schema.employeeCommendations, serviceCredits: schema.serviceCredits,
    degreeTrackSnapshots: schema.degreeTrackSnapshots, degreeTrackSimulationSteps: schema.degreeTrackSimulationSteps,
    specializationCourseCredits: schema.specializationCourseCredits, promotionDelayReasons: schema.promotionDelayReasons,
    trainers: schema.trainers, governingCourseEmployeeAssignments: schema.governingCourseEmployeeAssignments,
  };
  // خريطة (مفتاح بيانات الأرشيف <- اسم مخزن الذاكرة المؤقتة) لمزامنة الاستعادة مع الطبقة الاحتياطية
  const EMPLOYEE_RESTORE_MEMKEY_BY_KEY: Record<string, string> = {
    careerHistories: 'career', leaveRequests: 'leaves', penalties: 'penalties', appreciations: 'appreciations',
    performanceEvaluations: 'performance', qualifications: 'qualifications', jobAssignments: 'job-assignments',
    promotionsIncrements: 'promotions', salaryAllowances: 'salary-allowances', annualEvaluations: 'annual-evaluations',
    trainingCourses: 'training-courses', transfers: 'transfers', retirements: 'retirements', documents: 'documents',
    serviceRecords: 'service-records', serviceCredits: 'service-credits', degreeTrackSnapshots: 'degree-track-snapshots',
    degreeTrackSimulationSteps: 'degree-track-simulation-steps', specializationCourseCredits: 'specialization-credits',
    promotionDelayReasons: 'promotion-delay-reasons',
  };

  app.post('/api/archive/:id/restore', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    try {
      const [row] = await db.select().from(schema.archivedItems).where(eq(schema.archivedItems.id, id));
      if (!row) {
        return res.status(404).json({ error: 'السجل غير موجود في الأرشيف' });
      }

      if (row.entityType !== 'employee') {
        return res.status(400).json({ error: `استعادة نوع السجلات (${row.entityType}) غير مدعومة حالياً` });
      }

      const parsed = JSON.parse(row.data);
      // توافق مع السجلات المؤرشفة قبل تحديث 1 أيلول 2026: كانت data تحتوي وقتها على كائن الموظف
      // مباشرة دون سجلاته المرتبطة (لأن الحذف كان يُمنع أصلاً عند وجود أي سجلات مرتبطة سابقاً)
      const isLegacyFormat = !parsed.employee && !parsed.related;
      const snapshot = isLegacyFormat ? parsed : parsed.employee;
      const related: Record<string, any[]> = isLegacyFormat ? {} : (parsed.related || {});

      // منع الاستعادة إذا كان هناك موظف حالياً يحمل نفس المعرّف أو نفس رقم الشركة (تضارب بيانات)
      const [existingById] = await db.select().from(schema.employees).where(eq(schema.employees.id, row.entityId));
      if (existingById) {
        return res.status(400).json({ error: 'يوجد موظف آخر مسجَّل حالياً بنفس المعرّف، تعذّرت الاستعادة' });
      }
      if (snapshot.companyNumber) {
        const [existingByCompanyNumber] = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, snapshot.companyNumber));
        if (existingByCompanyNumber) {
          return res.status(400).json({ error: `رقم الشركة (${snapshot.companyNumber}) مستخدم حالياً من قبل موظف آخر، تعذّرت الاستعادة` });
        }
      }

      const restoreData: any = { ...snapshot, id: row.entityId };
      delete restoreData.createdAt;
      delete restoreData.created_at;

      // إدراج صف الموظف نفسه: هذه الخطوة وحدها حرجة ويجب أن تنجح لتُعتبر الاستعادة ناجحة
      await db.insert(schema.employees).values(restoreData);

      // إدراج كل جدول من الجداول المرتبطة بمعاملة (transaction) مستقلة خاصة به: فشل جدول واحد فقط
      // (كحالات انحراف تعريف الأعمدة القديمة والموثّقة سابقاً بين schema.ts وقاعدة البيانات الفعلية
      // — مثال حي: عمود course_type في training_courses معرَّف في schema.ts لكنه غير موجود فعلياً في
      // الجدول الحي) لا يجوز أن يُسقط استعادة بقية بيانات الموظف بأكملها. هذا يطابق تماماً الفلسفة
      // المعتمدة في بقية نقاط النظام: قاعدة البيانات طبقة "أفضل جهد"، ومخزن الذاكرة المؤقتة (الذي
      // تُزامَن معه كل السجلات المستعادة أدناه بلا استثناء) هو مصدر الحقيقة الفعلي الذي يعمل عليه
      // النظام عند تعذّر الكتابة الحية — تماماً كما كان الحال قبل حذف الموظف أصلاً.
      const dbPersistFailures: Record<string, string> = {};
      for (const key of EMPLOYEE_RESTORE_ORDER) {
        const table = EMPLOYEE_RESTORE_TABLE_BY_KEY[key];
        const rows = (related[key] || []).map((r: any) => {
          const clean = { ...r };
          delete clean.createdAt; delete clean.created_at;
          delete clean.updatedAt; delete clean.updated_at;
          return clean;
        });
        if (table && rows.length > 0) {
          try {
            await db.transaction(async (tx) => {
              // تنظيف احتياطي: حذف أي صف حي قد يحمل نفس المعرّف مسبقاً قبل إعادة الإدراج. هذا يحمي
              // من حالة أرشيف قديم/تالف (كالثغرة التي كانت موجودة قبل 2 أيلول 2026 حين لم تكن بعض
              // الجداول تُحذف فعلياً عند الأرشفة، فتبقى نسخ يتيمة حيّة بنفس المعرّفات) دون أي خطر على
              // بيانات موظفين آخرين، لأن هذه المعرّفات (id) خاصة حصراً بسجلات هذا الموظف المؤرشف.
              const restoreIds = rows.map((r: any) => r.id).filter((v: any) => v != null);
              if (restoreIds.length > 0) {
                await tx.delete(table).where(inArray(table.id, restoreIds));
              }
              await tx.insert(table).values(rows);
            });
          } catch (tableError: any) {
            const tableDetail = tableError?.cause?.message || tableError?.message || String(tableError);
            console.warn(`Database fallback for restoring "${key}" (kept in memory layer only):`, tableDetail);
            dbPersistFailures[key] = tableDetail;
          }
        }
      }

      // مزامنة مخازن الذاكرة المؤقتة: إعادة الموظف وكل سجلاته المرتبطة كما كانت قبل الحذف تماماً
      syncEmployeeRecord(mapKeys(restoreData, snakeToCamel), 'insert');
      for (const [tableKey, memKey] of Object.entries(EMPLOYEE_RESTORE_MEMKEY_BY_KEY)) {
        const rows = related[tableKey] || [];
        if (rows.length === 0) continue;
        genericMemoryStores[memKey] = genericMemoryStores[memKey] || [];
        for (const r of rows) {
          genericMemoryStores[memKey].push({ ...mapKeys(r, snakeToCamel), ...mapKeys(r, camelToSnake) });
        }
      }
      // إعادة ربط أسماء المتغيرات المسمّاة بمخازنها العامة (نفس نمط syncEntityRecord أعلاه)
      inMemoryCareerHistories = genericMemoryStores['career'];
      inMemoryLeaves = genericMemoryStores['leaves'];
      inMemoryPenalties = genericMemoryStores['penalties'];
      inMemoryAppreciations = genericMemoryStores['appreciations'];
      inMemoryPerformanceEvaluations = genericMemoryStores['performance'];
      inMemoryQualifications = genericMemoryStores['qualifications'];
      inMemoryJobAssignments = genericMemoryStores['job-assignments'];
      inMemoryPromotions = genericMemoryStores['promotions'];
      inMemorySalaryAllowances = genericMemoryStores['salary-allowances'];
      inMemoryAnnualEvaluations = genericMemoryStores['annual-evaluations'];
      inMemoryTrainingCourses = genericMemoryStores['training-courses'];
      inMemoryTransfers = genericMemoryStores['transfers'];
      inMemoryRetirements = genericMemoryStores['retirements'];
      inMemoryDocuments = genericMemoryStores['documents'];
      inMemoryServiceRecords = genericMemoryStores['service-records'];
      inMemoryServiceCredits = genericMemoryStores['service-credits'];
      inMemoryDegreeTrackSnapshots = genericMemoryStores['degree-track-snapshots'];
      inMemoryDegreeTrackSimulationSteps = genericMemoryStores['degree-track-simulation-steps'];
      inMemorySpecializationCredits = genericMemoryStores['specialization-credits'];
      inMemoryPromotionDelayReasons = genericMemoryStores['promotion-delay-reasons'];
      genericMemoryStores['promotion_delay_reasons'] = inMemoryPromotionDelayReasons;

      await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, id));
      saveLocalDb();

      if (Object.keys(dbPersistFailures).length > 0) {
        console.warn('Restore completed with partial DB persistence for employee', row.entityId, '- tables kept in memory layer only:', Object.keys(dbPersistFailures).join(', '));
      }
      res.json({ success: true, restoredId: row.entityId, dbPersistFailures: Object.keys(dbPersistFailures) });
    } catch (error: any) {
      const detail = error?.cause?.message || error?.message || String(error);
      console.error('Error restoring archived item:', detail);
      res.status(500).json({ error: 'تعذّرت استعادة السجل من الأرشيف: ' + detail });
    }
  });

  app.delete('/api/archive/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }
    try {
      // ملاحظة (تحديث 1 أيلول 2026): الأرشفة (الحذف الأول) تنقل الموظف وكل سجلاته المرتبطة فعلياً
      // خارج الجداول الحية إلى داخل هذا السجل المؤرشف (data) كنسخة JSON كاملة. لذلك "الحذف النهائي"
      // هنا يعني إتلاف هذه النسخة الاحتياطية نفسها بشكل نهائي ولا رجعة فيه — وهذا يحقق تلقائياً ما
      // طُلب: أي ملف كان مشتركاً مع موظفين آخرين (كملف "مدرّب" داخلي مرتبط بدورات تدريبية سُجّلت
      // لموظفين آخرين) سبق حذفه من الجداول الحية عند الأرشفة، بينما تبقى بيانات وسجلات الموظفين
      // الآخرين المرتبطة به (كاسم المدرّب المحفوظ ضمن كل دورة تدريبية) محفوظة دون أي مساس بها.
      const deletedRows = await db.delete(schema.archivedItems).where(eq(schema.archivedItems.id, id)).returning({ id: schema.archivedItems.id });
      if (!deletedRows || deletedRows.length === 0) {
        return res.status(404).json({ error: 'السجل غير موجود في الأرشيف' });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error permanently deleting archived item:', error?.message);
      res.status(500).json({ error: 'تعذّر الحذف النهائي للسجل من الأرشيف' });
    }
  });

  // Leave Requests API
  // الحالة موحّدة: معلق / معتمد / مرفوض / ملغى (انظر server/leaveStatus.ts)؛ القيم القديمة
  // («مقبولة»، «موافق_عليها»، approved...) تُقرأ كـ«معتمد» وتُعاد بالقيمة الموحدة.
  const presentLeave = (r: any) => {
    const out = mapKeys(r, camelToSnake);
    if (out && out.status !== undefined) out.status = normalizeLeaveStatus(out.status);
    return out;
  };

  app.get('/api/leaves', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    const statusParam = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
    const statusVariants = statusParam ? leaveStatusVariants(statusParam) : [];
    try {
      const conds: any[] = [];
      if (employeeId && !isNaN(employeeId)) conds.push(eq(schema.leaveRequests.employeeId, employeeId));
      if (statusParam) {
        // حالة فارغة/NULL في السجلات القديمة تُعامل «معلق»
        conds.push(normalizeLeaveStatus(statusParam) === LEAVE_STATUS.PENDING
          ? or(inArray(schema.leaveRequests.status, statusVariants), isNull(schema.leaveRequests.status), eq(schema.leaveRequests.status, ''))
          : inArray(schema.leaveRequests.status, statusVariants));
      }
      const leaves = conds.length > 0
        ? await db.select().from(schema.leaveRequests).where(and(...conds)).orderBy(desc(schema.leaveRequests.createdAt))
        : await db.select().from(schema.leaveRequests).orderBy(desc(schema.leaveRequests.createdAt));
      return res.json(leaves.map(presentLeave));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة طلبات الإجازة'); // B2d: لا قراءة من الذاكرة
    }
    let memList = genericMemoryStores['leaves'] || inMemoryLeaves || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    if (statusParam) {
      const wanted = normalizeLeaveStatus(statusParam);
      memList = memList.filter(item => (normalizeLeaveStatus(item.status) || LEAVE_STATUS.PENDING) === wanted);
    }
    res.json(memList.map(presentLeave));
  });

  // خصم الرصيد (في السجل المركزي) يحدث مرة واحدة فقط عند انتقال الطلب إلى «معتمد»، لا عند تقديمه معلقاً،
  // ويُعاد الرصيد عند رفض/إلغاء/حذف طلب كان معتمداً. direction: -1 خصم، +1 إعادة.
  async function adjustLeaveBalance(employeeId: number, days: number, leaveType: any, direction: -1 | 1) {
    if (!employeeId || !(days > 0)) return;
    // إصلاح عاجل: الرصيد الحالي من القاعدة (كان من الذاكرة ← لا خصم إطلاقاً بعد B2e)
    const [dbEmp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!dbEmp) return;
    const emp: any = bothCases(dbEmp);
    const lType = String(leaveType || '').toLowerCase();
    if (lType.includes('مرض') || lType.includes('sick')) {
      const cur = parseFloat(String(emp.sick_leave_balance ?? emp.sickLeaveBalance ?? emp.initial_sick_leave_balance ?? 0)) || 0;
      await updateEmployeeCentralRecord(employeeId, { sickLeaveBalance: Math.max(0, Number((cur + direction * days).toFixed(2))) });
    } else {
      const cur = parseFloat(String(emp.regular_leave_balance ?? emp.regularLeaveBalance ?? emp.initial_regular_leave_balance ?? 0)) || 0;
      await updateEmployeeCentralRecord(employeeId, { regularLeaveBalance: Math.max(0, Number((cur + direction * days).toFixed(2))) });
    }
  }
  const deductLeaveBalanceOnApproval = (employeeId: number, days: number, leaveType: any) => adjustLeaveBalance(employeeId, days, leaveType, -1);

  app.post('/api/leaves', requireAuth, async (req: AuthRequest, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseFloat(mappedData.daysCount);
      }
      if (mappedData.remainingBalance !== undefined && mappedData.remainingBalance !== null) {
        mappedData.remainingBalance = parseFloat(mappedData.remainingBalance);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'يجب تحديد الموظف (employee_id) لطلب الإجازة' });
      }

      mappedData.status = normalizeLeaveStatus(mappedData.status) || LEAVE_STATUS.PENDING;
      // صاحب دور «موظف» يقدّم طلباً فقط ولا يعتمده لنفسه
      if (req.user?.role === 'employee') mappedData.status = LEAVE_STATUS.PENDING;

      const validCols = new Set(Object.keys(getTableColumns(schema.leaveRequests)));
      const dbData: any = {};
      for (const [k, v] of Object.entries(mappedData)) if (validCols.has(k)) dbData[k] = v;

      let newLeave: any = null;
      try {
        const [inserted] = await db.insert(schema.leaveRequests).values(dbData).returning();
        newLeave = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ طلب الإجازة')) return;
      }

      if (mappedData.status === LEAVE_STATUS.APPROVED) {
        await deductLeaveBalanceOnApproval(mappedData.employeeId, mappedData.daysCount || 0, mappedData.leaveType);
      }

      const newId = newLeave?.id || (genericMemoryStores['leaves']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = { ...mapKeys(req.body, camelToSnake), status: mappedData.status };
      const memRecord = { ...cleanSnake, ...(newLeave ? mapKeys(newLeave, camelToSnake) : {}), id: newId, created_at: newLeave?.createdAt || new Date().toISOString() };
      syncEntityRecord('leaves', memRecord, 'insert');

      res.status(201).json(presentLeave(newLeave || memRecord));
    } catch (error: any) {
      console.error('Error creating leave:', error);
      sendRouteError(res, error, 'حفظ طلب الإجازة');
    }
  });

  app.put('/api/leaves/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرّف طلب الإجازة غير صالح' });
      }
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseFloat(mappedData.daysCount);
      }
      if (mappedData.status !== undefined) {
        mappedData.status = normalizeLeaveStatus(mappedData.status) || LEAVE_STATUS.PENDING;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      const validCols = new Set(Object.keys(getTableColumns(schema.leaveRequests)));
      const dbData: any = {};
      for (const [k, v] of Object.entries(mappedData)) if (validCols.has(k)) dbData[k] = v;

      const memPrev = (genericMemoryStores['leaves'] || []).find(r => String(r.id) === String(id));
      let previous: any = memPrev ? mapKeys(memPrev, snakeToCamel) : null;
      let updatedLeave: any = null;
      let dbAnswered = false;
      try {
        updatedLeave = await db.transaction(async (tx) => {
          const [prev] = await tx.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
          if (!prev) return null;
          previous = prev;
          if (Object.keys(dbData).length === 0) return prev;
          const [updated] = await tx.update(schema.leaveRequests)
            .set(dbData)
            .where(eq(schema.leaveRequests.id, id))
            .returning();
          return updated;
        });
        dbAnswered = true;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل طلب الإجازة')) return;
      }
      if (dbAnswered && !updatedLeave) {
        return res.status(404).json({ error: 'طلب الإجازة غير موجود' });
      }

      const merged = { ...(previous || {}), ...mappedData, ...(updatedLeave || {}) };
      const wasApproved = isApprovedLeaveStatus(previous?.status);
      const nowApproved = isApprovedLeaveStatus(merged.status);
      if (!wasApproved && nowApproved) {
        await deductLeaveBalanceOnApproval(parseInt(String(merged.employeeId)), parseFloat(String(merged.daysCount || 0)) || 0, merged.leaveType);
      } else if (wasApproved && isRejectedOrCancelledLeaveStatus(merged.status)) {
        await adjustLeaveBalance(parseInt(String(merged.employeeId)), parseFloat(String(merged.daysCount || 0)) || 0, merged.leaveType, 1);
      }

      const cleanSnake = { ...mapKeys(req.body, camelToSnake), ...(mappedData.status !== undefined ? { status: mappedData.status } : {}) };
      const memRecord = { ...cleanSnake, ...(updatedLeave ? mapKeys(updatedLeave, camelToSnake) : {}), id };
      syncEntityRecord('leaves', memRecord, 'update');

      res.json(presentLeave(updatedLeave || memRecord));
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      sendRouteError(res, error, 'تعديل طلب الإجازة');
    }
  });

  app.delete('/api/leaves/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف طلب الإجازة غير صالح' });
      const memPrev = (genericMemoryStores['leaves'] || []).find(r => String(r.id) === String(id));
      let removed: any = memPrev ? mapKeys(memPrev, snakeToCamel) : null;
      try {
        const rows = await db.delete(schema.leaveRequests).where(eq(schema.leaveRequests.id, id)).returning();
        if (rows[0]) removed = rows[0];
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف طلب الإجازة')) return;
      }
      if (removed && isApprovedLeaveStatus(removed.status)) {
        await adjustLeaveBalance(parseInt(String(removed.employeeId)), parseFloat(String(removed.daysCount || 0)) || 0, removed.leaveType, 1);
      }
      syncEntityRecord('leaves', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting leave:', error);
      sendRouteError(res, error, 'حذف طلب الإجازة');
    }
  });

  // Penalties API
  app.get('/api/penalties', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.penalties);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.penalties).where(eq(schema.penalties.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.penalties.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['penalties'] || inMemoryPenalties || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/penalties', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        const dc = parseInt(String(mappedData.daysCount));
        if (mappedData.daysCount !== null && String(mappedData.daysCount).trim() !== '' && (isNaN(dc) || dc < 0)) {
          return res.status(400).json({ error: 'عدد أيام القطع يجب أن يكون رقماً صحيحاً موجباً' });
        }
        mappedData.daysCount = isNaN(dc) ? null : dc;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'يجب تحديد الموظف (employee_id) للعقوبة' });
      }

      let newPenalty: any = null;
      try {
        const [inserted] = await db.insert(schema.penalties).values(mappedData).returning();
        newPenalty = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create penalty');
      }

      const newId = newPenalty?.id || (genericMemoryStores['penalties']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('penalties', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.status(201).json(mapKeys(newPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/penalties/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        const dc = parseInt(String(mappedData.daysCount));
        if (mappedData.daysCount !== null && String(mappedData.daysCount).trim() !== '' && (isNaN(dc) || dc < 0)) {
          return res.status(400).json({ error: 'عدد أيام القطع يجب أن يكون رقماً صحيحاً موجباً' });
        }
        mappedData.daysCount = isNaN(dc) ? null : dc;
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedPenalty: any = null;
      try {
        const [updated] = await db.update(schema.penalties).set(mappedData).where(eq(schema.penalties.id, id)).returning();
        updatedPenalty = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update penalty');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('penalties', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.json(mapKeys(updatedPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/penalties/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['penalties'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.penalties).where(eq(schema.penalties.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete penalty');
      }
      syncEntityRecord('penalties', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(logRecalcError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting penalty:', error);
      sendRouteError(res, error);
    }
  });

  // Appreciations API (كتب الشكر والتقدير)
  app.get('/api/appreciations', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.appreciations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.appreciations).where(eq(schema.appreciations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.appreciations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['appreciations'] || inMemoryAppreciations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/appreciations', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      let newAppreciation: any = null;
      try {
        const [inserted] = await db.insert(schema.appreciations).values(mappedData).returning();
        newAppreciation = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create appreciation');
      }

      const newId = newAppreciation?.id || (genericMemoryStores['appreciations']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('appreciations', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.status(201).json(mapKeys(newAppreciation || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating appreciation:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/appreciations/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedApprec: any = null;
      try {
        const [updated] = await db.update(schema.appreciations).set(mappedData).where(eq(schema.appreciations.id, id)).returning();
        updatedApprec = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update appreciation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('appreciations', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(logRecalcError);
      }

      res.json(mapKeys(updatedApprec || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating appreciation:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/appreciations/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['appreciations'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.appreciations).where(eq(schema.appreciations.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete appreciation');
      }
      syncEntityRecord('appreciations', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(logRecalcError);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting appreciation:', error);
      sendRouteError(res, error);
    }
  });

  // Performance Evaluations API
  app.get('/api/performance', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      const statusParam = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const conds: any[] = [];
      if (employeeId && !isNaN(employeeId)) conds.push(eq(schema.performanceEvaluations.employeeId, employeeId));
      if (statusParam) conds.push(eq(schema.performanceEvaluations.status, statusParam));
      const results = conds.length > 0
        ? await db.select().from(schema.performanceEvaluations).where(and(...conds)).orderBy(desc(schema.performanceEvaluations.createdAt))
        : await db.select().from(schema.performanceEvaluations).orderBy(desc(schema.performanceEvaluations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['performance'] || inMemoryPerformanceEvaluations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    if (req.query.status && req.query.status !== 'all') {
      memList = memList.filter(item => String(item.status || 'مرفوع للاعتماد') === String(req.query.status));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/performance', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.totalScore !== undefined) {
        mappedData.totalScore = parseInt(mappedData.totalScore);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      const evalYear = String(mappedData.year || (mappedData.evaluationDate ? new Date(mappedData.evaluationDate).getFullYear() : new Date().getFullYear()));

      // Check if duplicate evaluation exists for same employee in same year
      let existingEval = false;
      try {
        const existing = await db.select().from(schema.performanceEvaluations).where(
          and(
            eq(schema.performanceEvaluations.employeeId, mappedData.employeeId),
            eq(schema.performanceEvaluations.year, evalYear)
          )
        );
        if (existing.length > 0) existingEval = true;
      } catch (e) {
        const memList = genericMemoryStores['performance'] || inMemoryPerformanceEvaluations || [];
        existingEval = memList.some(r => parseInt(String(r.employee_id || r.employeeId)) === mappedData.employeeId && String(r.year) === evalYear);
      }

      if (existingEval) {
        return res.status(400).json({
          error: `الموظف لديه تقييم أداء مسجل سابقاً لسنة ${evalYear}. لا يُسمح بإدخال أكثر من تقييم واحد للموظف خلال نفس السنة التقييمية.`
        });
      }

      let newEval: any = null;
      try {
        const [inserted] = await db.insert(schema.performanceEvaluations).values(mappedData).returning();
        newEval = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create performance evaluation');
      }

      const newId = newEval?.id || (genericMemoryStores['performance']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, year: evalYear, created_at: new Date().toISOString() };
      syncEntityRecord('performance', memRecord, 'insert');

      res.status(201).json(mapKeys(newEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  app.put('/api/performance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedEval: any = null;
      try {
        const [updated] = await db.update(schema.performanceEvaluations)
          .set(mappedData)
          .where(eq(schema.performanceEvaluations.id, id))
          .returning();
        updatedEval = updated;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'تعديل السجل')) return;
        console.warn('Database fallback for update performance evaluation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('performance', memRecord, 'update');

      res.json(mapKeys(updatedEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/performance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      try {
        await db.delete(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete performance evaluation');
      }
      syncEntityRecord('performance', { id }, 'delete');
      res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
    } catch (error: any) {
      console.error('Error deleting performance evaluation:', error);
      sendRouteError(res, error);
    }
  });

  // Career Histories API
  app.get('/api/career', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    if (!employeeId || isNaN(employeeId)) {
      return res.status(400).json({ error: 'Missing or invalid employeeId' });
    }
    try {
      const results = await db.select()
        .from(schema.careerHistories)
        .where(eq(schema.careerHistories.employeeId, employeeId))
        .orderBy(desc(schema.careerHistories.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const store = genericMemoryStores['career'] || inMemoryCareerHistories || [];
    const filtered = store.filter(item => parseInt(String(item.employee_id || item.employeeId)) === employeeId);
    res.json(filtered.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/career', requireAuth, requireWriter, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      let newHistory: any = null;
      try {
        const [inserted] = await db.insert(schema.careerHistories).values(mappedData).returning();
        newHistory = inserted;
      } catch (dbErr) {
        if (respondIfDbWriteError(res, dbErr, 'حفظ السجل')) return;
        console.warn('Database fallback for create career history');
      }

      const newId = newHistory?.id || (genericMemoryStores['career']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('career', memRecord, 'insert');

      res.status(201).json(mapKeys(newHistory || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating career history:', error);
      sendRouteError(res, error);
    }
  });

  app.delete('/api/career/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      try {
        await db.delete(schema.careerHistories).where(eq(schema.careerHistories.id, id));
      } catch (error: any) {
        if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
        console.warn('Database fallback for delete career history');
      }
      syncEntityRecord('career', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting career history:', error);
      sendRouteError(res, error);
    }
  });

  function enhanceTrainingRecord(c: any) {
    if (!c) return c;
    const mapped = mapKeys(c, camelToSnake);
    mapped.courseName = c.courseName || mapped.course_name;
    mapped.course_name = mapped.course_name || c.courseName;
    mapped.startDate = c.startDate || mapped.start_date;
    mapped.start_date = mapped.start_date || c.startDate;
    mapped.endDate = c.endDate || mapped.end_date;
    mapped.end_date = mapped.end_date || c.endDate;
    mapped.courseType = c.courseType || mapped.course_type;
    mapped.course_type = mapped.course_type || c.courseType;
    mapped.locationType = c.locationType || mapped.location_type;
    mapped.location_type = mapped.location_type || c.locationType;
    mapped.trainerId = c.trainerId ?? mapped.trainer_id;
    mapped.trainer_id = mapped.trainer_id ?? c.trainerId;
    mapped.trainerName = c.trainerName || mapped.trainer_name;
    mapped.trainer_name = mapped.trainer_name || c.trainerName;
    mapped.orderNumber = c.orderNumber || mapped.order_number;
    mapped.order_number = mapped.order_number || c.orderNumber;
    mapped.courseCode = c.courseCode || mapped.course_code;
    mapped.course_code = mapped.course_code || c.courseCode;
    mapped.isOutsidePlan = c.isOutsidePlan ?? mapped.is_outside_plan ?? false;
    mapped.is_outside_plan = mapped.is_outside_plan ?? c.isOutsidePlan ?? false;
    mapped.targetAudience = c.targetAudience || mapped.target_audience;
    mapped.target_audience = mapped.target_audience || c.targetAudience;
    mapped.durationValue = c.durationValue ?? mapped.duration_value ?? c.days ?? 1;
    mapped.duration_value = mapped.duration_value ?? c.durationValue ?? c.days ?? 1;
    mapped.durationUnit = c.durationUnit || mapped.duration_unit || 'بالأيام';
    mapped.duration_unit = mapped.duration_unit || c.durationUnit || 'بالأيام';
    mapped.outsidePlanReason = c.outsidePlanReason || mapped.outside_plan_reason;
    mapped.outside_plan_reason = mapped.outside_plan_reason || c.outsidePlanReason;
    mapped.trainerRating = c.trainerRating || mapped.trainer_rating;
    mapped.trainer_rating = mapped.trainer_rating || c.trainerRating;
    mapped.courseFeedback = c.courseFeedback || mapped.course_feedback;
    mapped.course_feedback = mapped.course_feedback || c.courseFeedback;
    return mapped;
  }

  function enhanceEnrollmentRecord(e: any) {
    if (!e) return e;
    const mapped = mapKeys(e, camelToSnake);
    mapped.trainingId = e.trainingId ?? mapped.training_id;
    mapped.training_id = mapped.training_id ?? e.trainingId;
    mapped.employeeId = e.employeeId ?? mapped.employee_id;
    mapped.employee_id = mapped.employee_id ?? e.employeeId;
    mapped.isExternalParticipant = e.isExternalParticipant ?? mapped.is_external_participant;
    mapped.is_external_participant = mapped.is_external_participant ?? e.isExternalParticipant;
    mapped.externalParticipantName = e.externalParticipantName || mapped.external_participant_name;
    mapped.external_participant_name = mapped.external_participant_name || e.externalParticipantName;
    mapped.externalParticipantEntity = e.externalParticipantEntity || mapped.external_participant_entity;
    mapped.external_participant_entity = mapped.external_participant_entity || e.externalParticipantEntity;
    mapped.externalParticipantPhone = e.externalParticipantPhone || mapped.external_participant_phone;
    mapped.external_participant_phone = mapped.external_participant_phone || e.externalParticipantPhone;
    mapped.certificateNumber = e.certificateNumber || mapped.certificate_number;
    mapped.certificate_number = mapped.certificate_number || e.certificateNumber;
    mapped.certificateType = e.certificateType || mapped.certificate_type || 'شهادة مشاركة';
    mapped.certificate_type = mapped.certificate_type || e.certificateType || 'شهادة مشاركة';
    mapped.certificateIssueDate = e.certificateIssueDate || mapped.certificate_issue_date;
    mapped.certificate_issue_date = mapped.certificate_issue_date || e.certificateIssueDate;
    mapped.trainerRating = e.trainerRating || mapped.trainer_rating;
    mapped.trainer_rating = mapped.trainer_rating || e.trainerRating;
    mapped.courseFeedback = e.courseFeedback || mapped.course_feedback;
    mapped.course_feedback = mapped.course_feedback || e.courseFeedback;
    mapped.enrollmentDate = e.enrollmentDate || mapped.enrollment_date;
    mapped.enrollment_date = mapped.enrollment_date || e.enrollmentDate;
    return mapped;
  }

  // In-memory stores for training & enrollments fallback
  let inMemoryTrainings: any[] = [];
  let inMemoryEnrollments: any[] = [];
  let inMemoryAttendance: any[] = [];

  // Training Courses API
  app.get('/api/trainings', requireAuth, async (req, res) => {
    try {
      const track = req.query.track as string;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const statusParam = req.query.status && req.query.status !== 'all' ? String(req.query.status) : null;
      const conds: any[] = [];
      if (track) conds.push(eq(schema.trainings.track, track));
      if (year) conds.push(eq(schema.trainings.year, year));
      if (statusParam) conds.push(eq(schema.trainings.status, statusParam));
      const courses = conds.length > 0
        ? await db.select().from(schema.trainings).where(and(...conds)).orderBy(desc(schema.trainings.startDate))
        : await db.select().from(schema.trainings).orderBy(desc(schema.trainings.startDate));
      return res.json(courses.map(enhanceTrainingRecord));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const track = req.query.track as string;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    let list = inMemoryTrainings;
    if (track) list = list.filter(c => c.track === track);
    if (year) list = list.filter(c => c.year === year);
    if (req.query.status && req.query.status !== 'all') list = list.filter(c => String(c.status || '') === String(req.query.status));
    res.json(list.map(enhanceTrainingRecord));
  });

  app.post('/api/trainings', requireAuth, requireWriter, async (req, res) => {
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainerId !== undefined && data.trainerId !== null) {
      if (typeof data.trainerId === 'string') {
        data.trainerId = data.trainerId.trim() ? parseInt(data.trainerId) || null : null;
      } else if (typeof data.trainerId === 'number' && isNaN(data.trainerId)) {
        data.trainerId = null;
      }
    } else {
      data.trainerId = null;
    }
    if (data.year !== undefined) data.year = parseInt(data.year) || 2026;
    if (data.days !== undefined) data.days = parseInt(data.days) || 1;
    if (data.hours !== undefined) data.hours = parseInt(data.hours) || 0;

    let newCourse: any = null;
    try {
      const [inserted] = await db.insert(schema.trainings).values(data).returning();
      newCourse = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create training course');
    }
    const newId = newCourse?.id || (inMemoryTrainings.reduce((max, c) => Math.max(max, parseInt(c.id) || 0), 0) || 0) + 1;
    const memCourse = { id: newId, ...data, ...(newCourse || {}), created_at: new Date().toISOString() };
    const existingIdx = inMemoryTrainings.findIndex(c => parseInt(String(c.id)) === newId);
    if (existingIdx !== -1) {
      inMemoryTrainings[existingIdx] = memCourse;
    } else {
      inMemoryTrainings.push(memCourse);
    }
    saveLocalDb();
    res.status(201).json(enhanceTrainingRecord(memCourse));
  });

  app.put('/api/trainings/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainerId !== undefined && data.trainerId !== null) {
      if (typeof data.trainerId === 'string') {
        data.trainerId = data.trainerId.trim() ? parseInt(data.trainerId) || null : null;
      } else if (typeof data.trainerId === 'number' && isNaN(data.trainerId)) {
        data.trainerId = null;
      }
    }
    if (data.year !== undefined) data.year = parseInt(data.year) || 2026;
    if (data.days !== undefined) data.days = parseInt(data.days) || 1;
    if (data.hours !== undefined) data.hours = parseInt(data.hours) || 0;

    let updatedFromDb: any = null;
    try {
      const [updated] = await db.update(schema.trainings).set(data).where(eq(schema.trainings.id, id)).returning();
      updatedFromDb = updated;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update training');
    }
    const idx = inMemoryTrainings.findIndex(c => parseInt(String(c.id)) === id);
    let record: any;
    if (idx !== -1) {
      inMemoryTrainings[idx] = { ...inMemoryTrainings[idx], ...data, ...(updatedFromDb || {}) };
      record = inMemoryTrainings[idx];
    } else {
      record = { id, ...data, ...(updatedFromDb || {}) };
      inMemoryTrainings.push(record);
    }
    saveLocalDb();
    res.json(enhanceTrainingRecord(record));
  });

  app.delete('/api/trainings/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.trainings).where(eq(schema.trainings.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete training');
    }
    inMemoryTrainings = inMemoryTrainings.filter(c => parseInt(String(c.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // Training Enrollments API
  app.get('/api/trainings/enrollments', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      const trainingId = req.query.trainingId ? parseInt(req.query.trainingId as string) : undefined;
      let query = db.select().from(schema.trainingEnrollments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.employeeId, employeeId)) as any;
      } else if (trainingId && !isNaN(trainingId)) {
        query = db.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.trainingId, trainingId)) as any;
      }
      const enrollments = await query.orderBy(desc(schema.trainingEnrollments.createdAt));
      return res.json(enrollments.map(enhanceEnrollmentRecord));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
    const trainingId = req.query.trainingId ? parseInt(req.query.trainingId as string) : undefined;
    let list = inMemoryEnrollments;
    if (employeeId) list = list.filter(e => e.employeeId === employeeId || e.employee_id === employeeId);
    if (trainingId) list = list.filter(e => e.trainingId === trainingId || e.training_id === trainingId);
    res.json(list.map(enhanceEnrollmentRecord));
  });

  app.post('/api/trainings/enroll', requireAuth, requireWriter, async (req, res) => {
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;
    data.enrollmentDate = data.enrollmentDate || new Date().toISOString().split('T')[0];

    let newEnroll: any = null;
    try {
      newEnroll = await db.transaction(async (tx) => {
        const [inserted] = await tx.insert(schema.trainingEnrollments).values(data).returning();
        if (inserted) await syncEnrollmentToTrainingCourses(tx, schema, { eq, and }, inserted);
        return inserted;
      });
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تسجيل المتدرب في الدورة')) return;
    }

    const newId = newEnroll?.id || (inMemoryEnrollments.reduce((max, e) => Math.max(max, parseInt(e.id) || 0), 0) || 0) + 1;
    const memEnroll = { id: newId, ...data, ...(newEnroll || {}), created_at: new Date().toISOString() };
    const existingIdx = inMemoryEnrollments.findIndex(e => parseInt(String(e.id)) === newId);
    if (existingIdx !== -1) {
      inMemoryEnrollments[existingIdx] = memEnroll;
    } else {
      inMemoryEnrollments.push(memEnroll);
    }
    saveLocalDb();
    res.status(201).json(enhanceEnrollmentRecord(memEnroll));
  });

  app.put('/api/trainings/enrollments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;

    let updatedFromDb: any = null;
    let dbAnswered = false;
    try {
      // تعديل التسجيل ومزامنة نتيجته إلى دورات الموظف (upsert بالموظف + الدورة) في معاملة واحدة
      updatedFromDb = await db.transaction(async (tx) => {
        const [updated] = await tx.update(schema.trainingEnrollments).set(data).where(eq(schema.trainingEnrollments.id, id)).returning();
        if (updated) await syncEnrollmentToTrainingCourses(tx, schema, { eq, and }, updated);
        return updated;
      });
      dbAnswered = true;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل نتيجة المتدرب')) return;
    }
    if (dbAnswered && !updatedFromDb) {
      return res.status(404).json({ error: 'سجل التسجيل في الدورة غير موجود' });
    }

    const idx = inMemoryEnrollments.findIndex(e => parseInt(String(e.id)) === id);
    let record: any;
    if (idx !== -1) {
      inMemoryEnrollments[idx] = { ...inMemoryEnrollments[idx], ...data, ...(updatedFromDb || {}) };
      record = inMemoryEnrollments[idx];
    } else {
      record = { id, ...data, ...(updatedFromDb || {}) };
      inMemoryEnrollments.push(record);
    }
    saveLocalDb();
    res.json(enhanceEnrollmentRecord(record));
  });

  app.delete('/api/trainings/enrollments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete enrollment');
    }
    inMemoryEnrollments = inMemoryEnrollments.filter(e => parseInt(String(e.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // B3: getExistingColumns نُقلت إلى server/util/dbColumns.ts
  const getExistingColumns = (tableName: string) => getExistingColumnsFrom(pool, tableName);

  // Trainers API (دليل المدربين) — B3: server/routes/trainers.ts
  registerTrainerRoutes(app, routeCtx);

  // Annual Training Plans API — B3: server/routes/annualPlans.ts
  registerAnnualPlanRoutes(app, routeCtx);

  // Salaries API — B3: server/routes/salaries.ts
  registerSalaryRoutes(app, routeCtx);

  // Attendance API — B3: server/routes/attendance.ts
  registerAttendanceRoutes(app, routeCtx);

  // Organizational Units API — B3: server/routes/orgUnits.ts
  registerOrgUnitRoutes(app, routeCtx);

  // قوائم الإعدادات — B3: server/routes/settingsLists.ts
  const settingsLists = registerSettingsListRoutes(app, {
    SALARY_TABLE, asc, bothCases, camelToSnake, checkReferentialUsage, db, desc, eq, inMemoryEmployees, jobTitlesCache,
    logRecalcError, mapKeys, registerLookupRoutes, registerWorkLocationRoutes, requireAdmin, requireAuth, requireWriter,
    respondIfDbWriteError, routeCtx, saveLocalDb, schema, sendRouteError, snakeToCamel, sql, triggerRecalculateEligibility,
  });
  const { buildRefContext, CANONICAL_SEED_FORMS } = settingsLists;

  // --- New Iraqi Civil Service Modules Endpoints ---

  // Helper to determine the new Job Title when promoting an employee to targetGrade within their career category/track
  function findMatchingJobTitleForPromotion(emp: any, targetGrade: number, jobTitlesList: any[]) {
    if (!emp || !targetGrade || !Array.isArray(jobTitlesList)) return null;

    const currentTitleName = String(emp.jobTitle || emp.job_title || '').trim();
    const currentTitleObj = jobTitlesList.find(t => 
      (t.name && String(t.name).trim() === currentTitleName) || 
      (emp.jobTitleId && String(t.id) === String(emp.jobTitleId))
    );

    const category = currentTitleObj?.category || emp.track_category || emp.trackCategory || 'عام';

    // 1. First priority: Same category matching targetGrade
    const exactCategoryMatches = jobTitlesList.filter(t => 
      (t.status === 'فعال' || !t.status) &&
      t.category === category &&
      (parseInt(t.minGrade || t.min_grade) === targetGrade)
    );
    if (exactCategoryMatches.length === 1) {
      return exactCategoryMatches[0];
    }
    if (exactCategoryMatches.length > 1) {
      // Try matching career sub-family (e.g. 'مبرمج' vs 'محلل نظم', 'محاسب' vs 'مدقق')
      if (currentTitleName) {
        const words = currentTitleName.split(/\s+/);
        const keyword = words.find(w => !['رئيس', 'معاون', 'أقدم', 'مساعد'].includes(w));
        if (keyword) {
          const matchWithKeyword = exactCategoryMatches.find(t => t.name && t.name.includes(keyword));
          if (matchWithKeyword) return matchWithKeyword;
        }
      }
      return exactCategoryMatches[0];
    }

    // 2. Second priority: If currentTitleObj had a nextTitleId configured and its minGrade matches
    if (currentTitleObj?.nextTitleId || currentTitleObj?.next_title_id) {
      const nextId = parseInt(currentTitleObj.nextTitleId || currentTitleObj.next_title_id);
      const nextObj = jobTitlesList.find(t => t.id === nextId);
      if (nextObj && (parseInt(nextObj.minGrade || nextObj.min_grade) === targetGrade)) {
        return nextObj;
      }
    }

    // 3. Third priority: Any title with the same keyword across categories
    if (currentTitleName) {
      const words = currentTitleName.split(/\s+/);
      const keyword = words.find(w => !['رئيس', 'معاون', 'أقدم', 'مساعد'].includes(w));
      if (keyword) {
        const familyMatch = jobTitlesList.find(t => 
          (t.status === 'فعال' || !t.status) &&
          t.name && t.name.includes(keyword) &&
          (parseInt(t.minGrade || t.min_grade) === targetGrade)
        );
        if (familyMatch) return familyMatch;
      }
    }

    return null;
  }

  // Helper to sync employee primary education_level with the latest active qualification
  async function syncEmployeeEducationQualification(employeeId: number) {
    if (!employeeId || isNaN(employeeId)) return;
    try {
      let latestActive: any = null;
      try {
        const activeQuals = await db.select()
          .from(schema.qualifications)
          .where(and(
            eq(schema.qualifications.employeeId, employeeId),
            eq(schema.qualifications.isActive, true)
          ))
          .orderBy(desc(schema.qualifications.graduationYear), desc(schema.qualifications.createdAt), desc(schema.qualifications.id));
        if (activeQuals.length > 0) latestActive = activeQuals[0];
      } catch (dbErr) {
        console.warn('Database fallback for sync qualification list');
      }

      if (!latestActive) {
        const memActive = inMemoryQualifications
          .filter(q => (q.employee_id === employeeId || q.employeeId === employeeId) && (q.is_active !== false && q.isActive !== false))
          .sort((a, b) => {
            const yDiff = parseInt(b.graduation_year || b.graduationYear || '0') - parseInt(a.graduation_year || a.graduationYear || '0');
            if (yDiff !== 0) return yDiff;
            return (parseInt(b.id) || 0) - (parseInt(a.id) || 0);
          });
        if (memActive.length > 0) latestActive = memActive[0];
      }

      if (latestActive) {
        const ord = latestActive.equationNumber || latestActive.equation_number || latestActive.evaluation_order || latestActive.evaluationOrder || latestActive.education_order || latestActive.educationOrder || '';
        await updateEmployeeCentralRecord(employeeId, {
          educationLevel: latestActive.level || latestActive.education_level,
          education_level: latestActive.level || latestActive.education_level,
          specialization: latestActive.specialization || '',
          university: latestActive.university || latestActive.institution || '',
          institution: latestActive.university || latestActive.institution || '',
          graduationYear: latestActive.graduationYear || latestActive.graduation_year || null,
          graduation_year: latestActive.graduationYear || latestActive.graduation_year || null,
          educationOrder: ord,
          education_order: ord,
          evaluationOrder: ord,
          evaluation_order: ord,
        });
      } else {
        await updateEmployeeCentralRecord(employeeId, {
          educationLevel: 'بدون',
          education_level: 'بدون',
          educationOrder: '',
          education_order: '',
          evaluationOrder: '',
          evaluation_order: '',
        });
      }
    } catch (err) {
      console.error('Error syncing employee education qualification:', err);
    }
  }

  // 1. Qualifications API
  app.get('/api/qualifications', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.qualifications);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.qualifications).where(eq(schema.qualifications.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.qualifications.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        const resultsMapped = results.map(r => ({
          ...r,
          education_level: r.level,
          level: r.level,
          institution: r.university,
          university: r.university,
          graduation_year: r.graduationYear,
          graduationYear: r.graduationYear,
          evaluation_order: r.equationNumber || '',
          evaluationOrder: r.equationNumber || '',
          equation_number: r.equationNumber || '',
          equationNumber: r.equationNumber || '',
          education_order: r.equationNumber || '',
          educationOrder: r.equationNumber || '',
          is_active: r.isActive ?? true,
          isActive: r.isActive ?? true,
        }));
        return res.json(resultsMapped);
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }

    let list = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    if (employeeId) {
      list = list.filter(q => parseInt(String(q.employee_id || q.employeeId)) === employeeId);
    }
    res.json(list.map(q => {
      const emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === parseInt(String(q.employee_id || q.employeeId)));
      let ord = q.equation_number || q.equationNumber || q.evaluation_order || q.evaluationOrder || q.education_order || q.educationOrder || '';
      if ((!ord || ord === 'لا يوجد' || ord === 'غير متوفر') && emp && (q.education_level === emp.education_level || q.level === emp.education_level || list.length === 1)) {
        const empOrd = emp.education_order || emp.educationOrder || emp.evaluation_order || emp.evaluationOrder || emp.equation_number || emp.equationNumber || '';
        if (empOrd && empOrd !== 'لا يوجد' && empOrd !== 'غير متوفر') {
          ord = empOrd;
        }
      }
      return {
        ...q,
        education_level: q.level || q.education_level,
        level: q.level || q.education_level,
        institution: q.university || q.institution,
        university: q.university || q.institution,
        graduation_year: q.graduation_year || q.graduationYear,
        graduationYear: q.graduation_year || q.graduationYear,
        evaluation_order: ord,
        evaluationOrder: ord,
        equation_number: ord,
        equationNumber: ord,
        education_order: ord,
        educationOrder: ord,
        is_active: q.is_active !== false && q.isActive !== false,
        isActive: q.is_active !== false && q.isActive !== false,
      };
    }));
  });

  app.post('/api/qualifications', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
    
    const level = data.level || data.education_level || data.educationLevel || 'بكالوريوس';
    const isActiveVal = data.is_active !== undefined ? Boolean(data.is_active) : (data.isActive !== undefined ? Boolean(data.isActive) : true);
    const orderNum = data.equation_number || data.equationNumber || data.evaluation_order || data.evaluationOrder || data.education_order || data.educationOrder || data.order_number || data.orderNumber || '';
    const orderDate = data.equation_date || data.equationDate || data.order_date || data.orderDate || '';

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.qualifications).values({
        employeeId,
        level,
        specialization: data.specialization,
        subSpecialization: data.sub_specialization || data.subSpecialization,
        university: data.university || data.institution,
        country: data.country || 'العراق',
        graduationYear: parseInt(data.graduation_year || data.graduationYear || '0'),
        average: data.average,
        grade: data.grade,
        equationNumber: orderNum,
        equationDate: orderDate,
        isActive: isActiveVal,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create qualification');
    }

    const store = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    const newId = record?.id || (store.reduce((max, q) => Math.max(max, parseInt(q.id) || 0), 0) || 0) + 1;
    const memItem = {
      id: newId,
      employee_id: employeeId,
      employeeId,
      level,
      education_level: level,
      specialization: data.specialization || '',
      sub_specialization: data.sub_specialization || '',
      university: data.university || data.institution || '',
      institution: data.university || data.institution || '',
      country: data.country || 'العراق',
      graduation_year: parseInt(data.graduation_year || data.graduationYear || '0'),
      graduationYear: parseInt(data.graduation_year || data.graduationYear || '0'),
      average: data.average || '',
      grade: data.grade || '',
      equation_number: orderNum,
      equationNumber: orderNum,
      evaluation_order: orderNum,
      evaluationOrder: orderNum,
      education_order: orderNum,
      educationOrder: orderNum,
      equation_date: orderDate,
      is_active: isActiveVal,
      isActive: isActiveVal,
      created_at: new Date().toISOString()
    };
    syncEntityRecord('qualifications', memItem, 'insert');
    await syncEmployeeEducationQualification(employeeId);

    const recordMapped = {
      ...memItem,
      ...(record || {}),
      education_level: record?.level || level,
      level: record?.level || level,
      institution: record?.university || memItem.university,
      university: record?.university || memItem.university,
      graduation_year: record?.graduationYear || memItem.graduation_year,
      graduationYear: record?.graduationYear || memItem.graduation_year,
      evaluation_order: record?.equationNumber || orderNum,
      evaluationOrder: record?.equationNumber || orderNum,
      equation_number: record?.equationNumber || orderNum,
      equationNumber: record?.equationNumber || orderNum,
      education_order: record?.equationNumber || orderNum,
      educationOrder: record?.equationNumber || orderNum,
      is_active: record?.isActive ?? isActiveVal,
      isActive: record?.isActive ?? isActiveVal,
    };
    res.status(201).json(recordMapped);
  });

  app.put('/api/qualifications/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    const orderNum = data.equation_number ?? data.equationNumber ?? data.evaluation_order ?? data.evaluationOrder ?? data.education_order ?? data.educationOrder ?? data.order_number ?? data.orderNumber;
    const orderDt = data.equation_date ?? data.equationDate ?? data.order_date ?? data.orderDate;

    let updatedRec: any = null;
    try {
      const updateValues: any = {};
      if (data.level || data.education_level) updateValues.level = data.level || data.education_level;
      if (data.specialization !== undefined) updateValues.specialization = data.specialization;
      if (data.sub_specialization || data.subSpecialization) updateValues.subSpecialization = data.sub_specialization || data.subSpecialization;
      if (data.university || data.institution) updateValues.university = data.university || data.institution;
      if (data.country !== undefined) updateValues.country = data.country;
      if (data.graduation_year || data.graduationYear) updateValues.graduationYear = parseInt(data.graduation_year || data.graduationYear);
      if (data.is_active !== undefined) updateValues.isActive = Boolean(data.is_active);
      if (data.isActive !== undefined) updateValues.isActive = Boolean(data.isActive);
      if (orderNum !== undefined) updateValues.equationNumber = orderNum;
      if (orderDt !== undefined) updateValues.equationDate = orderDt;

      const [updated] = await db.update(schema.qualifications)
        .set(updateValues)
        .where(eq(schema.qualifications.id, id))
        .returning();
      updatedRec = updated;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update qualification');
    }

    const store = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    const existing = store.find(q => parseInt(String(q.id)) === id);
    const resolvedOrder = orderNum !== undefined ? orderNum : (existing?.equation_number || existing?.evaluation_order || '');
    const memItem = {
      ...(existing || {}),
      ...data,
      id,
      level: data.education_level || data.level || existing?.level,
      education_level: data.education_level || data.level || existing?.education_level,
      university: data.institution || data.university || existing?.university,
      institution: data.institution || data.university || existing?.institution,
      graduation_year: data.graduation_year || data.graduationYear || existing?.graduation_year,
      graduationYear: data.graduation_year || data.graduationYear || existing?.graduationYear,
      equation_number: resolvedOrder,
      equationNumber: resolvedOrder,
      evaluation_order: resolvedOrder,
      evaluationOrder: resolvedOrder,
      education_order: resolvedOrder,
      educationOrder: resolvedOrder,
    };
    syncEntityRecord('qualifications', memItem, 'update');

    const empId = parseInt(String(updatedRec?.employeeId || memItem.employee_id || memItem.employeeId));
    if (empId) {
      await syncEmployeeEducationQualification(empId);
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    res.json({
      ...memItem,
      ...(updatedRec || {}),
      education_level: updatedRec?.level || memItem.level,
      level: updatedRec?.level || memItem.level,
      institution: updatedRec?.university || memItem.university,
      university: updatedRec?.university || memItem.university,
      graduation_year: updatedRec?.graduationYear || memItem.graduation_year,
      graduationYear: updatedRec?.graduationYear || memItem.graduation_year,
      evaluation_order: updatedRec?.equationNumber || resolvedOrder,
      evaluationOrder: updatedRec?.equationNumber || resolvedOrder,
      equation_number: updatedRec?.equationNumber || resolvedOrder,
      equationNumber: updatedRec?.equationNumber || resolvedOrder,
      education_order: updatedRec?.equationNumber || resolvedOrder,
      educationOrder: updatedRec?.equationNumber || resolvedOrder,
      is_active: updatedRec?.isActive ?? (memItem.is_active !== false && memItem.isActive !== false),
      isActive: updatedRec?.isActive ?? (memItem.is_active !== false && memItem.isActive !== false),
    });
  });

  app.patch('/api/qualifications/:id/toggle', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    let updatedRec: any = null;
    let empId: number = 0;
    try {
      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length > 0) {
        empId = existing[0].employeeId;
        const newActiveState = !(existing[0].isActive ?? true);
        const [updated] = await db.update(schema.qualifications)
          .set({ isActive: newActiveState })
          .where(eq(schema.qualifications.id, id))
          .returning();
        updatedRec = updated;
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for toggle qualification');
    }

    const store = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    const existing = store.find(q => parseInt(String(q.id)) === id);
    if (existing) {
      const currentActive = existing.is_active !== false && existing.isActive !== false;
      const newActive = !currentActive;
      existing.is_active = newActive;
      existing.isActive = newActive;
      if (!empId) empId = parseInt(String(existing.employee_id || existing.employeeId));
      syncEntityRecord('qualifications', existing, 'update');
    }

    if (empId) {
      await syncEmployeeEducationQualification(empId);
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    if (updatedRec) {
      return res.json({
        ...updatedRec,
        education_level: updatedRec.level,
        level: updatedRec.level,
        institution: updatedRec.university,
        university: updatedRec.university,
        graduation_year: updatedRec.graduationYear,
        graduationYear: updatedRec.graduationYear,
        evaluation_order: updatedRec.equationNumber || '',
        evaluationOrder: updatedRec.equationNumber || '',
        equation_number: updatedRec.equationNumber || '',
        equationNumber: updatedRec.equationNumber || '',
        education_order: updatedRec.equationNumber || '',
        educationOrder: updatedRec.equationNumber || '',
        is_active: updatedRec.isActive ?? true,
        isActive: updatedRec.isActive ?? true,
      });
    }

    if (existing) return res.json(existing);
    res.status(404).json({ error: 'Qualification not found' });
  });

  app.delete('/api/qualifications/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    let empId: number = 0;
    try {
      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length > 0) {
        empId = existing[0].employeeId;
        await db.delete(schema.qualifications).where(eq(schema.qualifications.id, id));
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete qualification');
    }

    const store = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    const memItem = store.find(q => parseInt(String(q.id)) === id);
    if (!empId && memItem) empId = parseInt(String(memItem.employee_id || memItem.employeeId));

    syncEntityRecord('qualifications', { id }, 'delete');

    if (empId) {
      await syncEmployeeEducationQualification(empId);
      triggerRecalculateEligibility(empId).catch(logRecalcError);
    }
    saveLocalDb();

    res.json({ success: true });
  });


  // 2. Job Assignments API
  app.get('/api/job-assignments', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.jobAssignments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.jobAssignments).where(eq(schema.jobAssignments.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.jobAssignments.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['job-assignments'] || inMemoryJobAssignments || [];
    if (employeeId) list = list.filter(j => parseInt(String(j.employee_id || j.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/job-assignments', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.jobAssignments).values({
        employeeId,
        grade: data.grade || 'العاشرة',
        step: parseInt(data.step || '1'),
        jobTitle: data.job_title || data.jobTitle || 'موظف',
        division: data.division,
        department: data.department,
        section: data.section,
        confirmationDate: data.confirmation_date || data.confirmationDate || new Date().toISOString().split('T')[0],
        assignmentType: data.assignment_type || data.assignmentType || 'تعيين',
        actionType: data.action_type || data.actionType || 'تكليف',
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        responsibility: data.responsibility || data.primary_responsibility || data.primaryResponsibility || 'بلا مسؤولية',
        primaryResponsibility: data.primary_responsibility || data.primaryResponsibility || data.responsibility || 'بلا مسؤولية',
        actingResponsibility: data.acting_responsibility || data.actingResponsibility || 'بلا وكالة',
        actingEndDate: data.acting_end_date || data.actingEndDate || null,
        deputyLevel: data.deputy_level || data.deputyLevel || 'لا يوجد',
        serviceType: data.service_type || data.serviceType || 'دائم',
        notes: data.notes || '',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create job assignment');
    }

    // Sync with Central Employee Record
    const empUpdate: any = {};
    if (data.job_title || data.jobTitle) empUpdate.jobTitle = data.job_title || data.jobTitle;
    if (data.department) empUpdate.department = data.department;
    if (data.section) empUpdate.section = data.section;
    if (data.responsibility || data.primary_responsibility || data.primaryResponsibility) {
      empUpdate.jobResponsibility = data.primary_responsibility || data.primaryResponsibility || data.responsibility;
      empUpdate.primaryResponsibility = data.primary_responsibility || data.primaryResponsibility || data.responsibility;
    }
    if (data.acting_responsibility || data.actingResponsibility) {
      empUpdate.actingResponsibility = data.acting_responsibility || data.actingResponsibility;
    }
    if (data.deputy_level || data.deputyLevel) {
      empUpdate.deputyLevel = data.deputy_level || data.deputyLevel;
    }
    if (data.grade) empUpdate.grade = data.grade;
    if (data.step) empUpdate.step = parseInt(data.step);
    if (data.confirmation_date || data.confirmationDate) empUpdate.currentAppointmentDate = data.confirmation_date || data.confirmationDate;
    if (data.order_number || data.orderNumber) empUpdate.appointmentOrder = data.order_number || data.orderNumber;
    await updateEmployeeCentralRecord(employeeId, empUpdate);

    const store = genericMemoryStores['job-assignments'] || inMemoryJobAssignments || [];
    const newId = record?.id || (store.reduce((max, j) => Math.max(max, parseInt(j.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('job-assignments', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/job-assignments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.jobAssignments).set(mappedData).where(eq(schema.jobAssignments.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update job assignment');
    }
    const memItem = { id, ...data };
    syncEntityRecord('job-assignments', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/job-assignments/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.jobAssignments).where(eq(schema.jobAssignments.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete job assignment');
    }
    syncEntityRecord('job-assignments', { id }, 'delete');
    res.json({ success: true });
  });


  // 3. Promotions & Increments API
  app.get('/api/promotions', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.promotionsIncrements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.promotionsIncrements.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['promotions'] || inMemoryPromotions || [];
    if (employeeId) list = list.filter(p => parseInt(String(p.employee_id || p.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/promotions', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.promotionsIncrements).values({
        employeeId,
        movementType: data.movement_type || data.movementType,
        gradeBefore: data.grade_before || data.gradeBefore,
        gradeAfter: data.grade_after || data.gradeAfter,
        stepBefore: data.step_before ? parseInt(data.step_before) : (data.stepBefore ? parseInt(data.stepBefore) : null),
        stepAfter: data.step_after ? parseInt(data.step_after) : (data.stepAfter ? parseInt(data.stepAfter) : null),
        dueDate: data.due_date || data.dueDate || new Date().toISOString().split('T')[0],
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        seniorityMonths: data.seniority_months ? parseInt(data.seniority_months) : (data.seniorityMonths ? parseInt(data.seniorityMonths) : null),
        seniorityReason: data.seniority_reason || data.seniorityReason,
        managerRecommendation: data.manager_recommendation || data.managerRecommendation || 'لا',
        directorApproval: data.director_approval || data.directorApproval || 'لا',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create promotion');
    }

    // Sync Grade, Step and Date with Central Employee Record
    const movementType = String(data.movement_type || data.movementType || '').trim();
    const actionDate = data.order_date || data.orderDate || data.due_date || data.dueDate;

    const empUpdate: any = {};
    if (data.grade_after || data.gradeAfter) empUpdate.grade = data.grade_after || data.gradeAfter;
    if (data.step_after || data.stepAfter) empUpdate.step = parseInt(data.step_after || data.stepAfter);
    if (actionDate) {
      empUpdate.gradeDate = actionDate;
    }

    if (movementType.includes('ترفيع')) {
      if (actionDate) empUpdate.lastPromotionDate = actionDate;
      const targetGradeNum = parseInt(String(data.grade_after || data.gradeAfter));
      if (!isNaN(targetGradeNum)) {
        // إصلاح عاجل: الموظف والعناوين من القاعدة (كانت من الذاكرة ← لا يُحدَّث العنوان بعد الترفيع)
        const [curEmpRow] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
        const titlesNow = (await db.select().from(schema.jobTitles)).map(bothCases);
        const curEmp: any = curEmpRow ? bothCases(curEmpRow) : null;
        const resolvedTitle = findMatchingJobTitleForPromotion(curEmp, targetGradeNum, titlesNow.length ? titlesNow : jobTitlesCache.list);
        if (resolvedTitle) {
          empUpdate.jobTitle = resolvedTitle.name;
          empUpdate.job_title = resolvedTitle.name;
          empUpdate.jobTitleId = resolvedTitle.id;
          empUpdate.job_title_id = resolvedTitle.id;
        }
      }
    } else if (movementType.includes('علاوة')) {
      if (actionDate) empUpdate.lastIncrementDate = actionDate;
    } else {
      if (actionDate) {
        empUpdate.lastPromotionDate = actionDate;
        empUpdate.lastIncrementDate = actionDate;
      }
    }
    await updateEmployeeCentralRecord(employeeId, empUpdate);

    const store = genericMemoryStores['promotions'] || inMemoryPromotions || [];
    const newId = record?.id || (store.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('promotions', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/promotions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.promotionsIncrements).set(mappedData).where(eq(schema.promotionsIncrements.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update promotion');
    }
    const memItem = { id, ...data };
    syncEntityRecord('promotions', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/promotions/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete promotion');
    }
    syncEntityRecord('promotions', { id }, 'delete');
    res.json({ success: true });
  });


  // 4. Salary Allowances API
  app.get('/api/salary-allowances', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.salaryAllowances);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.salaryAllowances).where(eq(schema.salaryAllowances.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.salaryAllowances.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(results.map(r => ({
          ...r,
          allowance_type: r.allowanceType,
          order_number: r.orderNumber,
          employee_id: r.employeeId,
        })));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['salary-allowances'] || inMemorySalaryAllowances || [];
    if (employeeId) list = list.filter(s => parseInt(String(s.employee_id || s.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/salary-allowances', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const values = {
        employeeId,
        baseSalary: data.base_salary || data.baseSalary,
        costOfLiving: data.cost_of_living || data.costOfLiving,
        positionAllowance: data.position_allowance || data.positionAllowance,
        degreeAllowance: data.degree_allowance || data.degreeAllowance,
        hazardTransport: data.hazard_transport || data.hazardTransport,
        universityTechnical: data.university_technical || data.universityTechnical,
        retirementDeduction: data.retirement_deduction || data.retirementDeduction,
        taxDeduction: data.tax_deduction || data.taxDeduction,
        insuranceDeduction: data.insurance_deduction || data.insuranceDeduction,
        loansDeduction: data.loans_deduction || data.loansDeduction,
        netSalary: data.net_salary || data.netSalary,
        bankAccount: data.bank_account || data.bankAccount,
        bankName: data.bank_name || data.bankName,
        allowanceType: data.allowance_type || data.allowanceType,
        percentage: data.percentage !== undefined ? parseInt(data.percentage) : null,
        amount: data.amount !== undefined ? parseInt(data.amount) : null,
        orderNumber: data.order_number || data.orderNumber,
        status: data.status || 'مستمر',
      };

      const [inserted] = await db.insert(schema.salaryAllowances).values(values).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create salary allowance');
    }

    const store = genericMemoryStores['salary-allowances'] || inMemorySalaryAllowances || [];
    const newId = record?.id || (store.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('salary-allowances', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/salary-allowances/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.salaryAllowances).set(mappedData).where(eq(schema.salaryAllowances.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update salary allowance');
    }
    const memItem = { id, ...data };
    syncEntityRecord('salary-allowances', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/salary-allowances/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.salaryAllowances).where(eq(schema.salaryAllowances.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete salary allowance');
    }
    syncEntityRecord('salary-allowances', { id }, 'delete');
    res.json({ success: true });
  });


  // 5. Annual Evaluations API
  app.get('/api/annual-evaluations', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.annualEvaluations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.annualEvaluations).where(eq(schema.annualEvaluations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.annualEvaluations.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['annual-evaluations'] || inMemoryAnnualEvaluations || [];
    if (employeeId) list = list.filter(e => parseInt(String(e.employee_id || e.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/annual-evaluations', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.annualEvaluations).values({
        employeeId,
        year: parseInt(data.year || '2026'),
        grade: data.grade || 'كفوء',
        evaluationAuthority: data.evaluation_authority || data.evaluationAuthority,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        requiredCourses: data.required_courses || data.requiredCourses,
        employeeOpinion: data.employee_opinion || data.employeeOpinion,
        notes: data.notes,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create annual evaluation');
    }

    const store = genericMemoryStores['annual-evaluations'] || inMemoryAnnualEvaluations || [];
    const newId = record?.id || (store.reduce((max, e) => Math.max(max, parseInt(e.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('annual-evaluations', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/annual-evaluations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.annualEvaluations).set(mappedData).where(eq(schema.annualEvaluations.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update annual evaluation');
    }
    const memItem = { id, ...data };
    syncEntityRecord('annual-evaluations', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/annual-evaluations/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.annualEvaluations).where(eq(schema.annualEvaluations.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete annual evaluation');
    }
    syncEntityRecord('annual-evaluations', { id }, 'delete');
    res.json({ success: true });
  });


  // 6. Training Courses API
  app.get('/api/training-courses', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.trainingCourses);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingCourses).where(eq(schema.trainingCourses.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.trainingCourses.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['training-courses'] || inMemoryTrainingCourses || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/training-courses', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.trainingCourses).values({
        employeeId,
        courseName: data.course_name || data.courseName || '',
        courseType: data.course_type || data.courseType || 'حضوري',
        provider: data.provider || '',
        location: data.location || 'داخل العراق',
        startDate: data.start_date || data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.end_date || data.endDate || new Date().toISOString().split('T')[0],
        durationDays: parseInt(data.duration_days || data.durationDays || '1'),
        average: data.average,
        grade: data.grade,
        rank: data.rank,
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create training course');
    }

    const store = genericMemoryStores['training-courses'] || inMemoryTrainingCourses || [];
    const newId = record?.id || (store.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('training-courses', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/training-courses/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.trainingCourses).set(mappedData).where(eq(schema.trainingCourses.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update training course');
    }
    const memItem = { id, ...data };
    syncEntityRecord('training-courses', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/training-courses/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.trainingCourses).where(eq(schema.trainingCourses.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete training course');
    }
    syncEntityRecord('training-courses', { id }, 'delete');
    res.json({ success: true });
  });


  // 7. Transfers API
  app.get('/api/transfers', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.transfers);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.transfers).where(eq(schema.transfers.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.transfers.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['transfers'] || inMemoryTransfers || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/transfers', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.transfers).values({
        employeeId,
        transferType: data.transfer_type || data.transferType || 'نقل داخلي',
        fromEntity: data.from_entity || data.fromEntity || '',
        toEntity: data.to_entity || data.toEntity || '',
        startDate: data.start_date || data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.end_date || data.endDate,
        orderNumber: data.order_number || data.orderNumber || '',
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create transfer');
    }

    // Sync transfer target department / work location with central employee record
    const toTarget = data.to_entity || data.toEntity || '';
    if (toTarget) {
      await updateEmployeeCentralRecord(employeeId, {
        department: toTarget,
        workLocation: toTarget
      });
    }

    const store = genericMemoryStores['transfers'] || inMemoryTransfers || [];
    const newId = record?.id || (store.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('transfers', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/transfers/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    let updatedRec: any = null;
    try {
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      const [updated] = await db.update(schema.transfers).set(mappedData).where(eq(schema.transfers.id, id)).returning();
      updatedRec = updated;
    } catch (err) {
      if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      console.warn('Database fallback for update transfer');
    }
    const memItem = { id, ...data };
    syncEntityRecord('transfers', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/transfers/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete transfer');
    }
    syncEntityRecord('transfers', { id }, 'delete');
    res.json({ success: true });
  });


  // 8. Retirements API
  app.get('/api/retirements', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.retirements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.retirements.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['retirements'] || inMemoryRetirements || [];
    if (employeeId) list = list.filter(r => parseInt(String(r.employee_id || r.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/retirements', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [existing] = await db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId));
      const values = {
        employeeId,
        retirementDate: data.retirement_date || data.retirementDate || new Date().toISOString().split('T')[0],
        reason: data.reason || 'بلوغ السن القانونية',
        serviceDuration: data.service_duration || data.serviceDuration,
        pensionAmount: data.pension_amount || data.pensionAmount,
        pensionOrderNumber: data.pension_order_number || data.pensionOrderNumber,
        pensionOrderDate: data.pension_order_date || data.pensionOrderDate,
      };

      if (existing) {
        [record] = await db.update(schema.retirements)
          .set(values)
          .where(eq(schema.retirements.id, existing.id))
          .returning();
      } else {
        [record] = await db.insert(schema.retirements).values(values).returning();
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for create/update retirement');
    }

    // Sync retirement status with central employee record
    await updateEmployeeCentralRecord(employeeId, {
      status: 'متقاعد',
      retirementNumber: data.pension_order_number || data.pensionOrderNumber || 'إحالة إلى التقاعد'
    });

    const store = genericMemoryStores['retirements'] || inMemoryRetirements || [];
    const existingIdx = store.findIndex(r => parseInt(String(r.employee_id || r.employeeId)) === employeeId);
    const newId = record?.id || (existingIdx !== -1 ? store[existingIdx].id : ((store.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1));
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('retirements', memItem, existingIdx !== -1 ? 'update' : 'insert');

    res.json(mapKeys(record || memItem, camelToSnake));
  });

  app.delete('/api/retirements/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.retirements).where(eq(schema.retirements.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete retirement');
    }
    syncEntityRecord('retirements', { id }, 'delete');
    res.json({ success: true });
  });


  // 9. Documents API
  app.get('/api/documents', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.documents);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.documents).where(eq(schema.documents.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.documents.createdAt));
      return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = genericMemoryStores['documents'] || inMemoryDocuments || [];
    if (employeeId) list = list.filter(d => parseInt(String(d.employee_id || d.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/documents', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let record: any = null;
    try {
      const [inserted] = await db.insert(schema.documents).values({
        employeeId,
        docType: data.doc_type || data.docType || 'أخرى',
        filePath: data.file_path || data.filePath || '',
        entryDate: data.entry_date || data.entryDate || new Date().toISOString().split('T')[0],
      }).returning();
      record = inserted;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create document');
    }

    const store = genericMemoryStores['documents'] || inMemoryDocuments || [];
    const newId = record?.id || (store.reduce((max, d) => Math.max(max, parseInt(d.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('documents', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.delete('/api/documents/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.documents).where(eq(schema.documents.id, id));
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete document');
    }
    syncEntityRecord('documents', { id }, 'delete');
    res.json({ success: true });
  });

  // --- Service Records (احتساب الخدمة وتمديد الخدمة) API ---
  app.get('/api/service-records', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.serviceRecords);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.serviceRecords.createdAt));
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        return res.json(results.map(r => ({
          ...r,
          employee_id: r.employeeId,
          record_type: r.recordType,
          order_number: r.orderNumber,
          order_date: r.orderDate,
          created_at: r.createdAt
        })));
      }
    } catch (error: any) {
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    let list = inMemoryServiceRecords;
    if (employeeId) list = list.filter(r => r.employee_id === employeeId || r.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/service-records', requireAuth, requireWriter, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    const recordType = data.record_type || data.recordType || 'احتساب خدمة';
    const orderNumber = data.order_number || data.orderNumber || '';
    const orderDate = data.order_date || data.orderDate || '';
    const years = parseInt(data.years) || 0;
    const months = parseInt(data.months) || 0;
    const days = parseInt(data.days) || 0;
    const reason = data.reason || '';

    let record = null;
    try {
      const [inserted] = await db.insert(schema.serviceRecords).values({
        employeeId,
        recordType,
        orderNumber,
        orderDate,
        years,
        months,
        days,
        purpose: data.purpose || 'promotion_allowance_pension',
        reason,
        notes: data.notes || '',
      }).returning();
      record = inserted;

      // Sync employee record if record type is extension
      if (recordType === 'تمديد خدمة') {
        const emp = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
        if (emp.length > 0) {
          const currentEmp = emp[0];
          const newStatus = currentEmp.status === 'متقاعد' ? 'متقاعد مع تمديد' : (currentEmp.status || 'مستمر');
          await db.update(schema.employees).set({
            retirementExtensionOrderNumber: orderNumber,
            retirementExtensionOrderDate: orderDate,
            retirementExtensionYears: years,
            retirementExtensionMonths: months,
            retirementExtensionNote: reason,
            status: newStatus,
          }).where(eq(schema.employees.id, employeeId));
        }
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حفظ السجل')) return;
      console.warn('Database fallback for create service record');
    }

    const newId = inMemoryServiceRecords.length > 0 ? Math.max(...inMemoryServiceRecords.map(r => r.id || 0)) + 1 : 1;
    const memRecord = {
      id: record?.id || newId,
      employee_id: employeeId,
      employeeId,
      record_type: recordType,
      recordType,
      order_number: orderNumber,
      orderNumber,
      order_date: orderDate,
      orderDate,
      years,
      months,
      days,
      purpose: data.purpose || 'promotion_allowance_pension',
      reason,
      notes: data.notes || '',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    inMemoryServiceRecords.push(memRecord);
    saveLocalDb();

    triggerRecalculateEligibility(employeeId).catch(logRecalcError);
    const formatted = record ? {
      ...record,
      employee_id: record.employeeId,
      record_type: record.recordType,
      order_number: record.orderNumber,
      order_date: record.orderDate,
      created_at: record.createdAt
    } : memRecord;
    res.json(formatted);
  });

  app.put('/api/service-records/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;
    const updateData: any = {};
    if (data.record_type !== undefined || data.recordType !== undefined) {
      updateData.recordType = data.record_type || data.recordType;
    }
    if (data.order_number !== undefined || data.orderNumber !== undefined) {
      updateData.orderNumber = data.order_number || data.orderNumber;
    }
    if (data.order_date !== undefined || data.orderDate !== undefined) {
      updateData.orderDate = data.order_date || data.orderDate;
    }
    if (data.years !== undefined) updateData.years = parseInt(data.years) || 0;
    if (data.months !== undefined) updateData.months = parseInt(data.months) || 0;
    if (data.days !== undefined) updateData.days = parseInt(data.days) || 0;
    if (data.purpose !== undefined) updateData.purpose = data.purpose;
    if (data.reason !== undefined) updateData.reason = data.reason;
    if (data.notes !== undefined) updateData.notes = data.notes;

    let updated = null;
    try {
      const [resDb] = await db.update(schema.serviceRecords)
        .set(updateData)
        .where(eq(schema.serviceRecords.id, id))
        .returning();
      updated = resDb;
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'تعديل السجل')) return;
      console.warn('Database fallback for update service record');
    }

    const idx = inMemoryServiceRecords.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryServiceRecords[idx] = {
        ...inMemoryServiceRecords[idx],
        ...updateData,
        ...data,
        id
      };
      saveLocalDb();
      if (!updated) updated = inMemoryServiceRecords[idx];
    }

    if (updated?.employeeId || updated?.employee_id) {
      triggerRecalculateEligibility(updated.employeeId || updated.employee_id).catch(logRecalcError);
    }
    const formatted = updated ? {
      ...updated,
      employee_id: updated.employeeId || updated.employee_id,
      record_type: updated.recordType || updated.record_type,
      order_number: updated.orderNumber || updated.order_number,
      order_date: updated.orderDate || updated.order_date,
      created_at: updated.createdAt || updated.created_at
    } : updated;
    res.json(formatted);
  });

  app.delete('/api/service-records/:id', requireAuth, requireWriter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    
    let recordToDelete = inMemoryServiceRecords.find(r => r.id === id);
    try {
      const existing = await db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));
      if (existing.length > 0) {
        recordToDelete = existing[0];
        await db.delete(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));

        if (recordToDelete.recordType === 'تمديد خدمة') {
          const remainingExts = await db.select().from(schema.serviceRecords).where(and(
            eq(schema.serviceRecords.employeeId, recordToDelete.employeeId),
            eq(schema.serviceRecords.recordType, 'تمديد خدمة')
          ));

          if (remainingExts.length === 0) {
            await db.update(schema.employees).set({
              retirementExtensionOrderNumber: null,
              retirementExtensionOrderDate: null,
              retirementExtensionYears: 0,
              retirementExtensionMonths: 0,
              retirementExtensionNote: null,
            }).where(eq(schema.employees.id, recordToDelete.employeeId));
          } else {
            const latest = remainingExts[remainingExts.length - 1];
            await db.update(schema.employees).set({
              retirementExtensionOrderNumber: latest.orderNumber,
              retirementExtensionOrderDate: latest.orderDate,
              retirementExtensionYears: latest.years,
              retirementExtensionMonths: latest.months,
              retirementExtensionNote: latest.reason || latest.notes,
            }).where(eq(schema.employees.id, recordToDelete.employeeId));
          }
        }
      }
    } catch (error: any) {
      if (respondIfDbWriteError(res, error, 'حذف السجل')) return;
      console.warn('Database fallback for delete service record');
    }

    inMemoryServiceRecords = inMemoryServiceRecords.filter(r => r.id !== id);
    saveLocalDb();

    if (recordToDelete?.employeeId || recordToDelete?.employee_id) {
      triggerRecalculateEligibility(recordToDelete.employeeId || recordToDelete.employee_id).catch(logRecalcError);
    }
    res.json({ success: true });
  });


  // --- Governing Training Courses API (الدورات التدريبية الحاكمة للموظفين) ---
  const DEFAULT_GOVERNING_COURSES = [
    // الدرجة 2 (للترفيع إلى الدرجة 1)
    { grade: 2, courseName: 'دورة اختصاص متقدمة (حتمية ترفيع 2←1)', courseType: 'تخصصية', durationDays: 10, durationHours: 40, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص متقدمة مدتها أسبوعان (10 أيام تدريبية) حتمية للترفيع للدرجة الأولى' },
    { grade: 2, courseName: 'دورة إدارية متقدمة / إدارة وقيادة', courseType: 'قيادية وإشرافية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة إدارية متقدمة أو إدارة وقيادة (أسبوع على الأقل) حتمية للترفيع للدرجة الأولى' },
    { grade: 2, courseName: 'دورة تفاوض (أو كتاب رسمي مؤيد للجان/اجتماعات خارجية)', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة تفاوض حتمية — يمكن تعويضها بلجان أو اجتماعات مع شركات أجنبية بكتاب رسمي مؤيد' },

    // الدرجة 3 (للترفيع إلى الدرجة 2)
    { grade: 3, courseName: 'دورة اختصاص (حتمية ترفيع 3←2)', courseType: 'تخصصية', durationDays: 10, durationHours: 40, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوعين (10 أيام)' },
    { grade: 3, courseName: 'دورة إدارية متقدمة / حاسبة / لغة إنكليزية (مجموع شهر)', courseType: 'إدارية', durationDays: 30, durationHours: 120, isRequiredForPromotion: true, minPassingScore: 60, description: '(إدارية متقدمة أو حاسبة أو لغة إنكليزية) بمجموع شهر تدريبي. بديل كامل: للعنوان الإداري (مدير/مدير أقدم) دورة واحدة ≥ شهر تغني عن كل الحتميات' },

    // الدرجة 4 (للترفيع إلى الدرجة 3)
    { grade: 4, courseName: 'دورة اختصاص (حتمية ترفيع 4←3)', courseType: 'تخصصية', durationDays: 10, durationHours: 40, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوعين (10 أيام)' },
    { grade: 4, courseName: 'دورة إدارية متقدمة / حاسبة / لغة إنكليزية (مجموع شهر)', courseType: 'إدارية', durationDays: 30, durationHours: 120, isRequiredForPromotion: true, minPassingScore: 60, description: '(إدارية متقدمة أو حاسبة أو لغة إنكليزية) بمجموع شهر تدريبي. بديل كامل: للعنوان الإداري (مدير/مدير أقدم) دورة واحدة ≥ شهر تغني عن كل الحتميات' },

    // الدرجة 5 (للترفيع إلى الدرجة 4)
    { grade: 5, courseName: 'دورة اختصاص (حتمية ترفيع 5←4)', courseType: 'تخصصية', durationDays: 10, durationHours: 40, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوعين (10 أيام)' },
    { grade: 5, courseName: 'دورة إدارية أو حاسبة', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة إدارية أو حاسبة لمدة أسبوع' },
    { grade: 5, courseName: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)', courseType: 'سلامة وبيئة (HSE)', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)' },

    // الدرجة 6 (للترفيع إلى الدرجة 5)
    { grade: 6, courseName: 'دورة اختصاص (حتمية ترفيع 6←5)', courseType: 'تخصصية', durationDays: 10, durationHours: 40, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوعين (10 أيام)' },
    { grade: 6, courseName: 'دورة إدارية أو حاسبة', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة إدارية أو حاسبة لمدة أسبوع' },
    { grade: 6, courseName: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)', courseType: 'سلامة وبيئة (HSE)', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)' },

    // الدرجة 7 (للترفيع إلى الدرجة 6)
    { grade: 7, courseName: 'دورة اختصاص (حتمية ترفيع 7←6)', courseType: 'تخصصية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوع' },
    { grade: 7, courseName: 'دورة إدارية', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة إدارية لمدة أسبوع' },
    { grade: 7, courseName: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)', courseType: 'سلامة وبيئة (HSE)', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة H.S.E لمدة أسبوع' },
    { grade: 7, courseName: 'دورة حاسبة', courseType: 'حاسوب', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة حاسبة لمدة أسبوع' },

    // الدرجة 8 (للترفيع إلى الدرجة 7)
    { grade: 8, courseName: 'دورة اختصاص (حتمية ترفيع 8←7)', courseType: 'تخصصية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة اختصاص لمدة أسبوع' },
    { grade: 8, courseName: 'دورة إدارية', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة إدارية لمدة أسبوع' },
    { grade: 8, courseName: 'دورة السلامة والصحة المهنية والبيئة (H.S.E)', courseType: 'سلامة وبيئة (HSE)', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة H.S.E لمدة أسبوع' },
    { grade: 8, courseName: 'دورة حاسبة', courseType: 'حاسوب', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة حاسبة لمدة أسبوع' },

    // الدرجة 9 (للترفيع إلى الثامنة)
    { grade: 9, courseName: 'دورة تأهيل الوظيفة العامة والمهارات الأساسية', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة تأهيل الموظف المبتدئ والأنظمة الوظيفية' },

    // الدرجة 10 (للترفيع إلى التاسعة)
    { grade: 10, courseName: 'أساسيات الوظيفة العامة والأنظمة الإدارية', courseType: 'إدارية', durationDays: 5, durationHours: 20, isRequiredForPromotion: true, minPassingScore: 60, description: 'دورة أساسيات الوظيفة والخدمة المدنية' },
  ];

  let inMemoryGoverningCourses = DEFAULT_GOVERNING_COURSES.map((item, idx) => ({
    id: idx + 1,
    grade: item.grade,
    courseName: item.courseName,
    course_name: item.courseName,
    courseType: item.courseType,
    course_type: item.courseType,
    durationDays: item.durationDays,
    duration_days: item.durationDays,
    durationHours: item.durationHours,
    duration_hours: item.durationHours,
    isRequiredForPromotion: item.isRequiredForPromotion,
    is_required_for_promotion: item.isRequiredForPromotion,
    minPassingScore: item.minPassingScore,
    min_passing_score: item.minPassingScore,
    description: item.description,
    status: 'فعال',
    createdAt: new Date().toISOString()
  }));

  async function ensureGoverningCoursesTable() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS governing_courses (
          id SERIAL PRIMARY KEY,
          grade INTEGER NOT NULL,
          course_name TEXT NOT NULL,
          course_type TEXT DEFAULT 'تخصصية',
          duration_days INTEGER DEFAULT 5,
          duration_hours INTEGER DEFAULT 20,
          is_required_for_promotion BOOLEAN DEFAULT TRUE,
          min_passing_score INTEGER DEFAULT 60,
          description TEXT,
          status TEXT DEFAULT 'فعال',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `).catch(() => {});
      const cols = [
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "courseName" TEXT`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "courseType" TEXT`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "durationDays" INTEGER`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "durationHours" INTEGER`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "isRequiredForPromotion" BOOLEAN`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "minPassingScore" INTEGER`,
        `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
      ];
      for (const col of cols) {
        await pool.query(col).catch(() => {});
      }
    } catch (e) {
      // Ignore DB permission or creation errors silently
    }
  }

  app.get('/api/governing-courses', requireAuth, async (req, res) => {
    const gradeQuery = req.query.grade ? parseInt(req.query.grade as string) : undefined;
    try {
      await ensureGoverningCoursesTable();
      let query = db.select().from(schema.governingCourses);
      if (gradeQuery && !isNaN(gradeQuery)) {
        query = db.select().from(schema.governingCourses).where(eq(schema.governingCourses.grade, gradeQuery)) as any;
      }
      let results = await query.orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id));

      if (results.length === 0 && (!gradeQuery || isNaN(gradeQuery))) {
        await db.insert(schema.governingCourses).values(DEFAULT_GOVERNING_COURSES as any).catch(() => {});
        results = await db.select().from(schema.governingCourses).orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id)).catch(() => []);
      }

      if (results.length > 0) {
        const mapped = results.map(r => ({
          id: r.id,
          grade: r.grade,
          courseName: r.courseName || (r as any).course_name,
          course_name: r.courseName || (r as any).course_name,
          courseType: r.courseType || (r as any).course_type || 'تخصصية',
          course_type: r.courseType || (r as any).course_type || 'تخصصية',
          durationDays: r.durationDays !== undefined && r.durationDays !== null ? r.durationDays : ((r as any).duration_days || 5),
          duration_days: r.durationDays !== undefined && r.durationDays !== null ? r.durationDays : ((r as any).duration_days || 5),
          durationHours: r.durationHours !== undefined && r.durationHours !== null ? r.durationHours : ((r as any).duration_hours || 20),
          duration_hours: r.durationHours !== undefined && r.durationHours !== null ? r.durationHours : ((r as any).duration_hours || 20),
          isRequiredForPromotion: r.isRequiredForPromotion !== undefined && r.isRequiredForPromotion !== null ? r.isRequiredForPromotion : ((r as any).is_required_for_promotion ?? true),
          is_required_for_promotion: r.isRequiredForPromotion !== undefined && r.isRequiredForPromotion !== null ? r.isRequiredForPromotion : ((r as any).is_required_for_promotion ?? true),
          minPassingScore: r.minPassingScore !== undefined && r.minPassingScore !== null ? r.minPassingScore : ((r as any).min_passing_score || 60),
          min_passing_score: r.minPassingScore !== undefined && r.minPassingScore !== null ? r.minPassingScore : ((r as any).min_passing_score || 60),
          description: r.description,
          status: r.status || 'فعال',
          createdAt: r.createdAt
        }));

        return res.json(mapped);
      }
    } catch (error: any) {
      // Quiet fallback to in-memory store if DB query fails or table does not exist
    }

    // Graceful fallback to memory store
    let filteredMemory = inMemoryGoverningCourses;
    if (gradeQuery && !isNaN(gradeQuery)) {
      filteredMemory = inMemoryGoverningCourses.filter(c => c.grade === gradeQuery);
    }
    return res.json(filteredMemory);
  });

  app.post('/api/governing-courses', requireAuth, requireAdmin, async (req, res) => {
    const data = req.body;
    const grade = parseInt(data.grade);
    if (isNaN(grade)) return res.status(400).json({ error: 'الدرجة الوظيفية مطلوبة بشكل صحيح' });
    if (!data.courseName && !data.course_name) return res.status(400).json({ error: 'اسم الدورة الحاكمة مطلوب' });

    const courseName = data.courseName || data.course_name;
    const courseType = data.courseType || data.course_type || 'تخصصية';
    const durationDays = parseInt(data.durationDays || data.duration_days || '5');
    const durationHours = parseInt(data.durationHours || data.duration_hours || '20');
    const isRequiredForPromotion = data.isRequiredForPromotion !== undefined ? Boolean(data.isRequiredForPromotion) : (data.is_required_for_promotion !== undefined ? Boolean(data.is_required_for_promotion) : true);
    const minPassingScore = parseInt(data.minPassingScore || data.min_passing_score || '60');
    const description = data.description || '';
    const status = data.status || 'فعال';

    try {
      await ensureGoverningCoursesTable();
      const values = {
        grade,
        courseName,
        courseType,
        durationDays,
        durationHours,
        isRequiredForPromotion,
        minPassingScore,
        description,
        status
      };

      const [inserted] = await db.insert(schema.governingCourses).values(values as any).returning();
      if (inserted) {
        return res.json(inserted);
      }
    } catch (error: any) {
      // Quiet fallback
    }

    const newMemoryItem = {
      id: Date.now(),
      grade,
      courseName,
      course_name: courseName,
      courseType,
      course_type: courseType,
      durationDays,
      duration_days: durationDays,
      durationHours,
      duration_hours: durationHours,
      isRequiredForPromotion,
      is_required_for_promotion: isRequiredForPromotion,
      minPassingScore,
      min_passing_score: minPassingScore,
      description,
      status,
      createdAt: new Date().toISOString()
    };
    inMemoryGoverningCourses.push(newMemoryItem);
    return res.json(newMemoryItem);
  });

  app.put('/api/governing-courses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;

    if (data.status === 'غير فعال' || data.status === 'معطل') {
      const refCheck = checkReferentialUsage('governing_courses', id, true, await buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    const updateValues: any = {};
    if (data.grade !== undefined) updateValues.grade = parseInt(data.grade);
    if (data.courseName !== undefined || data.course_name !== undefined) updateValues.courseName = data.courseName || data.course_name;
    if (data.courseType !== undefined || data.course_type !== undefined) updateValues.courseType = data.courseType || data.course_type;
    if (data.durationDays !== undefined || data.duration_days !== undefined) updateValues.durationDays = parseInt(data.durationDays || data.duration_days);
    if (data.durationHours !== undefined || data.duration_hours !== undefined) updateValues.durationHours = parseInt(data.durationHours || data.duration_hours);
    if (data.isRequiredForPromotion !== undefined) updateValues.isRequiredForPromotion = Boolean(data.isRequiredForPromotion);
    if (data.is_required_for_promotion !== undefined) updateValues.isRequiredForPromotion = Boolean(data.is_required_for_promotion);
    if (data.minPassingScore !== undefined || data.min_passing_score !== undefined) updateValues.minPassingScore = parseInt(data.minPassingScore || data.min_passing_score);
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.status !== undefined) updateValues.status = data.status;

    try {
      await ensureGoverningCoursesTable();
      const [updated] = await db.update(schema.governingCourses)
        .set(updateValues)
        .where(eq(schema.governingCourses.id, id))
        .returning();

      if (updated) {
        return res.json(updated);
      }
    } catch (error: any) {
      // Quiet fallback
    }

    const idx = inMemoryGoverningCourses.findIndex(c => c.id === id);
    if (idx !== -1) {
      inMemoryGoverningCourses[idx] = {
        ...inMemoryGoverningCourses[idx],
        ...updateValues,
        course_name: updateValues.courseName || inMemoryGoverningCourses[idx].courseName,
        course_type: updateValues.courseType || inMemoryGoverningCourses[idx].courseType,
        duration_days: updateValues.durationDays !== undefined ? updateValues.durationDays : inMemoryGoverningCourses[idx].durationDays,
        duration_hours: updateValues.durationHours !== undefined ? updateValues.durationHours : inMemoryGoverningCourses[idx].durationHours,
        is_required_for_promotion: updateValues.isRequiredForPromotion !== undefined ? updateValues.isRequiredForPromotion : inMemoryGoverningCourses[idx].isRequiredForPromotion,
        min_passing_score: updateValues.minPassingScore !== undefined ? updateValues.minPassingScore : inMemoryGoverningCourses[idx].minPassingScore,
      };
      return res.json(inMemoryGoverningCourses[idx]);
    }
    return res.status(404).json({ error: 'Governing course not found' });
  });

  app.delete('/api/governing-courses/:id', requireAuth, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const refCheck = checkReferentialUsage('governing_courses', id, false, await buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await ensureGoverningCoursesTable();
      await db.delete(schema.governingCourses).where(eq(schema.governingCourses.id, id));
    } catch (error: any) {
      // Quiet fallback
    }

    inMemoryGoverningCourses = inMemoryGoverningCourses.filter(c => c.id !== id);
    return res.json({ success: true });
  });

  app.post('/api/governing-courses/reset-defaults', requireAuth, requireAdmin, async (req, res) => {
    try {
      await ensureGoverningCoursesTable();
      // إعادة الضبط داخل معاملة وبطريقة upsert (بالدرجة + اسم الدورة): تُحدَّث الدورات الافتراضية
      // الموجودة وتُضاف الناقصة، دون حذف الجدول كاملاً (تبقى المعرّفات ثابتة ولا تضيع البيانات عند الفشل).
      const results = await db.transaction(async (tx) => {
        const existing = await tx.select().from(schema.governingCourses);
        for (const item of DEFAULT_GOVERNING_COURSES as any[]) {
          const match = existing.find(r => r.grade === item.grade && String(r.courseName || '').trim() === String(item.courseName).trim());
          if (match) {
            await tx.update(schema.governingCourses).set({ ...item, status: 'فعال' }).where(eq(schema.governingCourses.id, match.id));
          } else {
            await tx.insert(schema.governingCourses).values({ ...item, status: 'فعال' });
          }
        }
        return tx.select().from(schema.governingCourses).orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id));
      });
      try {
        await db.insert(schema.activityLogs).values({ action: 'إعادة ضبط الدورات الحاكمة', userEmail: (req as AuthRequest).user?.username || 'admin', details: `upsert لـ ${DEFAULT_GOVERNING_COURSES.length} دورة افتراضية` });
      } catch (logErr: any) {
        console.warn('[ACTIVITY-LOG] تعذّر تسجيل إعادة ضبط الدورات الحاكمة:', logErr?.message);
      }
      return res.json(results);
    } catch (error: any) {
      return sendRouteError(res, error, 'إعادة ضبط الدورات الحاكمة'); // B2d: لا قراءة من الذاكرة
    }

    inMemoryGoverningCourses = DEFAULT_GOVERNING_COURSES.map((item, idx) => ({
      id: idx + 1,
      grade: item.grade,
      courseName: item.courseName,
      course_name: item.courseName,
      courseType: item.courseType,
      course_type: item.courseType,
      durationDays: item.durationDays,
      duration_days: item.durationDays,
      durationHours: item.durationHours,
      duration_hours: item.durationHours,
      isRequiredForPromotion: item.isRequiredForPromotion,
      is_required_for_promotion: item.isRequiredForPromotion,
      minPassingScore: item.minPassingScore,
      min_passing_score: item.minPassingScore,
      description: item.description,
      status: 'فعال',
      createdAt: new Date().toISOString()
    }));

    return res.json(inMemoryGoverningCourses);
  });

  // --- Governing Course Exemption Rules & Employee Assignments ---
  let inMemoryExemptionRules = {
    rules: [
      {
        id: 'rule_higher_degrees',
        title: 'إعفاء حملة الشهادات العليا (دكتوراه، ماجستير، دبلوم عالي معادل)',
        qualifications: ['دكتوراه', 'ماجستير', 'دبلوم عالي'],
        grades: ['الكل'],
        exemptionType: 'كامل',
        isExempt: true,
        legalBasis: 'إعفاء تام من جميع الدورات الحاكمة المخصصة للترقية استناداً لضوابط واحتساب الشهادات العليا',
        category: 'qualification',
      },
      {
        id: 'rule_middle_school_and_below',
        title: 'إعفاء مؤهلات المتوسطة فما دون (متوسطة، ابتدائية، يقرأ ويكتب، بدون مؤهل)',
        qualifications: ['متوسطة فما دون', 'متوسطة', 'ابتدائية', 'بدون مؤهل'],
        grades: ['الكل'],
        exemptionType: 'كامل',
        isExempt: true,
        legalBasis: 'إعفاء حاملي شهادات المتوسطة فما دون من الالتزام بالدورات الحاكمة لأغراض الترقية والترفيع الوظيفي',
        category: 'qualification',
      },
      {
        id: 'rule_special_grades_and_leadership',
        title: 'استثناء الدرجات الخاصة والعليا والعناوين الإدارية القيادية',
        qualifications: ['الكل'],
        grades: ['1', 'الخاصة_أ', 'الخاصة_ب', 'المناصب_القيادية'],
        exemptionType: 'دورة_بديلة',
        isExempt: true,
        legalBasis: 'دورة واحدة في التطوير القيادي والمؤسسي أو إدارة مكتبية تغني عن الحتميات المتعددة المقررة للدرجة',
        category: 'grade',
      },
      {
        id: 'rule_service_25_years',
        title: 'استثناء ذوي الخدمة الوظيفية الطويلة (25 سنة فما فوق)',
        qualifications: ['الكل'],
        grades: ['الكل'],
        exemptionType: 'استثناء_خدمة',
        isExempt: true,
        legalBasis: 'إعفاء من دورات H.S.E والحاسوب والتركيز على الدورات التخصصية أو القيادية حسب طبيعة العمل',
        category: 'general',
      },
      {
        id: 'rule_bachelor_and_diploma',
        title: 'شمول حاملي البكالوريوس والدبلوم والإعدادية بالدورات الحاكمة',
        qualifications: ['بكالوريوس', 'دبلوم', 'إعدادية'],
        grades: ['الكل'],
        exemptionType: 'لا_يوجد_إعفاء',
        isExempt: false,
        legalBasis: 'مشمول بكافة الحتميات المقررة حسب جدول الدرجة الوظيفية لأغراض الترفيع',
        category: 'qualification',
      },
    ],
    qualificationsExemptions: [
      { id: 'phd', name: 'الدكتوراه', isExempt: true, exemptionType: 'كامل', notes: 'إعفاء تام من جميع الدورات الحاكمة المخصصة للترفيع' },
      { id: 'master', name: 'الماجستير', isExempt: true, exemptionType: 'جزئي', notes: 'إعفاء من دورات الاختصاص وتخفيض 50% من الساعات الإدارية' },
      { id: 'higher_diploma', name: 'الدبلوم العالي', isExempt: true, exemptionType: 'كامل', notes: 'معادل للماجستير - إعفاء من حتميات الترفيع' },
      { id: 'bachelor', name: 'البكالوريوس', isExempt: false, exemptionType: 'لا يوجد إعفاء', notes: 'مشمول بكافة الحتميات المقررة للدرجة الوظيفية' },
      { id: 'diploma', name: 'الدبلوم', isExempt: false, exemptionType: 'لا يوجد إعفاء', notes: 'مشمول بكافة الحتميات المقررة للدرجة الوظيفية' },
      { id: 'middle_school_below', name: 'المتوسطة فما دون', isExempt: true, exemptionType: 'كامل', notes: 'إعفاء تام من الدورات الحاكمة لأغراض الترقية' },
    ],
    gradeTitleExemptions: [
      { id: 'special_grades', name: 'الدرجات الخاصة (العليا أ و ب) والعناوين القيادية', isExempt: true, exemptionType: 'كامل', notes: 'إعفاء تام أو دورة قيادية واحدة بديلة' },
      { id: 'grade_1', name: 'الدرجة الأولى / كبار الموظفين', isExempt: true, exemptionType: 'دورة_بديلة', notes: 'دورة واحدة في التطوير القيادي والمؤسسي تغني عن الحتميات المتعددة' },
      { id: 'manager_title', name: 'العنوان الإداري (مدير / مدير أقدم / رئيس مهندسين)', isExempt: true, exemptionType: 'بديل_كامل', notes: 'دورة واحدة لمدة شهر تغني عن كامل الدورات الحاكمة المحددة للدرجة' },
      { id: 'service_25_years', name: 'الخدمة الوظيفية 25 سنة فما فوق', isExempt: true, exemptionType: 'استثناء_خدمة', notes: 'إعفاء من دورات H.S.E والحاسوب والتركيز على دورات القيادة فقط' },
    ],
    autoApplyRules: true,
  };

  let inMemoryEmployeeAssignments: Record<string, any> = {};

  app.get('/api/governing-courses/exemption-rules', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.governingCourseExemptionRules)
        .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));
      if (records && records.length > 0) {
        const row = records[0];
        const parsed = {
          rules: row.rules ? JSON.parse(row.rules) : inMemoryExemptionRules.rules,
          qualificationsExemptions: row.qualificationsExemptions ? JSON.parse(row.qualificationsExemptions) : inMemoryExemptionRules.qualificationsExemptions,
          gradeTitleExemptions: row.gradeTitleExemptions ? JSON.parse(row.gradeTitleExemptions) : inMemoryExemptionRules.gradeTitleExemptions,
          autoApplyRules: row.autoApplyRules ?? true,
        };
        inMemoryExemptionRules = parsed;
        return res.json(parsed);
      }
    } catch (err) {
      return sendRouteError(res, err, 'قراءة قواعد الإعفاء');
    }
    // لا صف بعد: القواعد الافتراضية الموثقة في الكود
    return res.json(inMemoryExemptionRules);
  });

  app.post('/api/governing-courses/exemption-rules', requireAuth, requireAdmin, async (req, res) => {
    const data = req.body;
    const merged = { ...inMemoryExemptionRules, ...data };

    try {
      const rulesJson = JSON.stringify(merged.rules || []);
      const qualsJson = JSON.stringify(merged.qualificationsExemptions || []);
      const gradeJson = JSON.stringify(merged.gradeTitleExemptions || []);
      const autoApply = merged.autoApplyRules !== false;

      const existing = await db.select().from(schema.governingCourseExemptionRules)
        .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));

      if (existing && existing.length > 0) {
        await db.update(schema.governingCourseExemptionRules)
          .set({
            rules: rulesJson,
            qualificationsExemptions: qualsJson,
            gradeTitleExemptions: gradeJson,
            autoApplyRules: autoApply,
            updatedAt: new Date(),
          })
          .where(eq(schema.governingCourseExemptionRules.configKey, 'default_exemption_rules'));
      } else {
        await db.insert(schema.governingCourseExemptionRules).values({
          configKey: 'default_exemption_rules',
          rules: rulesJson,
          qualificationsExemptions: qualsJson,
          gradeTitleExemptions: gradeJson,
          autoApplyRules: autoApply,
        });
      }
    } catch (err) {
      // B2: لا نجاح كاذب — الحفظ فشل فلا يُعاد كأنه نجح
      return sendRouteError(res, err, 'حفظ قواعد الإعفاء');
    }

    inMemoryExemptionRules = merged;
    return res.json(merged);
  });

  // --- Promotion Paths & Required Governing Courses Matrix ---
  let inMemoryPromotionPathsMatrix: any[] = [
    {
      id: 'mat_2_1',
      trackName: 'الثانية ← الأولى',
      fromGrade: 2,
      toGrade: 1,
      requiredCoursesText: '1) اختصاص متقدمة (أسبوعين - 10 أيام)\n2) إدارية متقدمة / إدارة وقيادة (أسبوع على الأقل)\n3) تفاوض — يمكن تعويضها بلجان/اجتماعات مع شركات أجنبية بكتاب رسمي مؤيد',
      alternativeText: 'دورة تطويرية قيادية عليا معتمدة',
      notes: 'الدرجة 2 إلى 1 (التطوير القيادي المتقدم)'
    },
    {
      id: 'mat_3_2',
      trackName: 'الثالثة ← الثانية',
      fromGrade: 3,
      toGrade: 2,
      requiredCoursesText: '1) اختصاص (أسبوعين - 10 أيام)\n2) (إدارية متقدمة) أو (حاسبة) أو (لغة إنكليزية) بمجموع شهر تدريبي',
      alternativeText: '💡 بديل كامل: للعنوان الإداري (مدير / مدير أقدم) دورة واحدة ≥ شهر تغني عن كل الحتميات',
      notes: 'الدرجة 3 إلى 2'
    },
    {
      id: 'mat_4_3',
      trackName: 'الرابعة ← الثالثة',
      fromGrade: 4,
      toGrade: 3,
      requiredCoursesText: 'نفس متطلبات الترفيع (3 ← 2): دورة اختصاص (أسبوعين) + (إدارية متقدمة/حاسبة/إنكليزي مجموع شهر) أو البديل الإداري الكامل',
      alternativeText: '💡 بديل كامل: للعنوان الإداري دورة تدريبية واحدة مدتها شهر فأكثر',
      notes: 'الدرجة 4 إلى 3'
    },
    {
      id: 'mat_5_4',
      trackName: 'الخامسة ← الرابعة',
      fromGrade: 5,
      toGrade: 4,
      requiredCoursesText: '1) اختصاص (أسبوعين)\n2) إدارية أو حاسبة (أسبوع)\n3) السلامة والصحة المهنية والبيئة (H.S.E)',
      alternativeText: '',
      notes: 'الدرجة 5 إلى 4'
    },
    {
      id: 'mat_6_5',
      trackName: 'السادسة ← الخامسة',
      fromGrade: 6,
      toGrade: 5,
      requiredCoursesText: 'نفس متطلبات الترفيع (5 ← 4): دورة اختصاص (أسبوعين) + إدارية/حاسبة (أسبوع) + H.S.E',
      alternativeText: '',
      notes: 'الدرجة 6 إلى 5'
    },
    {
      id: 'mat_7_6',
      trackName: 'السابعة ← السادسة',
      fromGrade: 7,
      toGrade: 6,
      requiredCoursesText: '1) اختصاص (أسبوع)   2) إدارية (أسبوع)\n3) H.S.E (أسبوع)   4) حاسبة (أسبوع)',
      alternativeText: '',
      notes: 'الدرجة 7 إلى 6'
    },
    {
      id: 'mat_8_7',
      trackName: 'الثامنة ← السابعة',
      fromGrade: 8,
      toGrade: 7,
      requiredCoursesText: 'نفس متطلبات الترفيع (7 ← 6): اختصاص (أسبوع) + إدارية (أسبوع) + H.S.E + حاسبة',
      alternativeText: '',
      notes: 'الدرجة 8 إلى 7'
    }
  ];

  // B2: الإعدادات الكاملة في جدول app_settings_documents (كانت في الذاكرة فقط وتضيع عند إعادة التشغيل).
  // لا صف بعد ← تُعاد القيمة الافتراضية الموثقة في الكود (لا تُكتب حتى يحفظ المسؤول).
  async function readSettingsDoc(key: string, fallback: any) {
    const [row] = await db.select().from(schema.appSettingsDocuments).where(eq(schema.appSettingsDocuments.key, key));
    return row ? row.value : fallback;
  }
  async function writeSettingsDoc(key: string, value: any, user: string | null) {
    const [row] = await db.insert(schema.appSettingsDocuments)
      .values({ key, value, source: 'user', updatedAt: new Date(), updatedBy: user })
      .onConflictDoUpdate({ target: schema.appSettingsDocuments.key, set: { value, source: 'user', updatedAt: new Date(), updatedBy: user } })
      .returning();
    return row.value;
  }

  app.get('/api/governing-courses/matrix', requireAuth, async (req, res) => {
    try {
      res.json(await readSettingsDoc('promotion_paths_matrix', inMemoryPromotionPathsMatrix));
    } catch (err) {
      sendRouteError(res, err, 'قراءة مصفوفة مسارات الترفيع');
    }
  });

  app.post('/api/governing-courses/matrix', requireAuth, requireAdmin, async (req: any, res) => {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'بيانات المصفوفة غير صالحة' });
    try {
      res.json(await writeSettingsDoc('promotion_paths_matrix', req.body, req.user?.username || null));
    } catch (err) {
      sendRouteError(res, err, 'حفظ مصفوفة مسارات الترفيع');
    }
  });

  // --- Grade Requirements for Promotion Training Packs (تصنيفات وساعات وأيام الحتميات للدرجات) ---
  let inMemoryGradeRequirements: Record<string, any[]> = {
    '8': [
      { id: 'gr_8_1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص للدرجة 8' },
      { id: 'gr_8_2', category: 'إدارية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة إدارية' },
      { id: 'gr_8_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة' },
      { id: 'gr_8_4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'حاسبة وتطبيقات مكتبية' }
    ],
    '7': [
      { id: 'gr_7_1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص للدرجة 7' },
      { id: 'gr_7_2', category: 'إدارية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة إدارية' },
      { id: 'gr_7_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة' },
      { id: 'gr_7_4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'حاسبة وتطبيقات مكتبية' }
    ],
    '6': [
      { id: 'gr_6_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص (أسبوعين - 10 أيام)' },
      { id: 'gr_6_2', category: 'إدارية أو حاسوب', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية أو حاسبة (أسبوع)' },
      { id: 'gr_6_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة (أسبوع)' }
    ],
    '5': [
      { id: 'gr_5_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص (أسبوعين - 10 أيام)' },
      { id: 'gr_5_2', category: 'إدارية أو حاسوب', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية أو حاسبة (أسبوع)' },
      { id: 'gr_5_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة (أسبوع)' }
    ],
    '4': [
      { id: 'gr_4_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص (أسبوعين - 10 أيام)' },
      { id: 'gr_4_2', category: 'إدارية متقدمة أو حاسوب أو لغة إنكليزية', requiredDays: 20, requiredHours: 80, isMandatory: true, alternativeTo: 'بديل إداري', notes: 'مجموع شهر تدريبي (20 يوم / 80 ساعة)' }
    ],
    '3': [
      { id: 'gr_3_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص (أسبوعين - 10 أيام)' },
      { id: 'gr_3_2', category: 'إدارية متقدمة أو حاسوب أو لغة إنكليزية', requiredDays: 20, requiredHours: 80, isMandatory: true, alternativeTo: 'بديل إداري', notes: 'مجموع شهر تدريبي (20 يوم / 80 ساعة) أو بديل إداري كامل' }
    ],
    '2': [
      { id: 'gr_2_1', category: 'اختصاص متقدمة', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'اختصاص متقدمة (أسبوعين - 10 أيام)' },
      { id: 'gr_2_2', category: 'إدارية متقدمة / إدارة وقيادة', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية متقدمة أو قيادة (أسبوع على الأقل)' },
      { id: 'gr_2_3', category: 'تفاوض ولجان خارجية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: 'لجان واجتماعات شركات أجنبية', notes: 'تفاوض أو تعويض بلجان رسمية مؤيدة' }
    ]
  };

  app.get('/api/governing-courses/grade-requirements', requireAuth, async (req, res) => {
    try {
      res.json(await readSettingsDoc('grade_requirements', inMemoryGradeRequirements));
    } catch (err) {
      sendRouteError(res, err, 'قراءة متطلبات الدرجات');
    }
  });

  app.post('/api/governing-courses/grade-requirements', requireAuth, requireAdmin, async (req: any, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(400).json({ error: 'بيانات متطلبات الدرجات غير صالحة' });
    try {
      res.json(await writeSettingsDoc('grade_requirements', req.body, req.user?.username || null));
    } catch (err) {
      sendRouteError(res, err, 'حفظ متطلبات الدرجات');
    }
  });

  app.get('/api/governing-courses/employee-assignments', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.governingCourseEmployeeAssignments);
      { // B2f: نتيجة القاعدة تُعاد كما هي ولو فارغة (لا قيم افتراضية من الذاكرة)
        const resultMap: Record<string, any> = {};
        for (const row of records) {
          resultMap[row.employeeId] = {
            employeeId: row.employeeId,
            status: row.status || 'مشمول',
            exemptionReason: row.exemptionReason || '',
            exemptionOrderNumber: row.exemptionOrderNumber || '',
            exemptionOrderDate: row.exemptionOrderDate || '',
            assignedCourses: row.assignedCourses ? JSON.parse(row.assignedCourses) : [],
            courseProgress: row.courseProgress ? JSON.parse(row.courseProgress) : {},
            notes: row.notes || '',
            updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString()
          };
        }
        inMemoryEmployeeAssignments = resultMap;
        return res.json(resultMap);
      }
    } catch (err) {
      console.error('Error reading employee assignments from database:', err);
    }
    return res.json(inMemoryEmployeeAssignments);
  });

  app.post('/api/governing-courses/employee-assignments', requireAuth, requireWriter, async (req, res) => {
    const { employeeId, status, exemptionReason, exemptionOrderNumber, exemptionOrderDate, assignedCourses, courseProgress, notes } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'Employee ID is required' });

    const empIdStr = String(employeeId);
    const assignmentObj = {
      employeeId: empIdStr,
      status: status || 'مشمول',
      exemptionReason: exemptionReason || '',
      exemptionOrderNumber: exemptionOrderNumber || '',
      exemptionOrderDate: exemptionOrderDate || '',
      assignedCourses: assignedCourses || [],
      courseProgress: courseProgress || {},
      notes: notes || '',
      updatedAt: new Date().toISOString()
    };

    inMemoryEmployeeAssignments[empIdStr] = assignmentObj;

    try {
      const existing = await db.select().from(schema.governingCourseEmployeeAssignments)
        .where(eq(schema.governingCourseEmployeeAssignments.employeeId, empIdStr));

      if (existing && existing.length > 0) {
        await db.update(schema.governingCourseEmployeeAssignments)
          .set({
            status: assignmentObj.status,
            exemptionReason: assignmentObj.exemptionReason,
            exemptionOrderNumber: assignmentObj.exemptionOrderNumber,
            exemptionOrderDate: assignmentObj.exemptionOrderDate,
            assignedCourses: JSON.stringify(assignmentObj.assignedCourses),
            courseProgress: JSON.stringify(assignmentObj.courseProgress),
            notes: assignmentObj.notes,
            updatedAt: new Date(),
          })
          .where(eq(schema.governingCourseEmployeeAssignments.employeeId, empIdStr));
      } else {
        await db.insert(schema.governingCourseEmployeeAssignments).values({
          employeeId: empIdStr,
          status: assignmentObj.status,
          exemptionReason: assignmentObj.exemptionReason,
          exemptionOrderNumber: assignmentObj.exemptionOrderNumber,
          exemptionOrderDate: assignmentObj.exemptionOrderDate,
          assignedCourses: JSON.stringify(assignmentObj.assignedCourses),
          courseProgress: JSON.stringify(assignmentObj.courseProgress),
          notes: assignmentObj.notes,
        });
      }
    } catch (err) {
      console.error('Error persisting employee assignment to database:', err);
    }

    saveLocalDb();
    return res.json(assignmentObj);
  });

  // --- Generic Sub-Entities API for Employee Details ---
  const genericEntitiesMap: Record<string, keyof typeof schema> = {
    'career': 'careerHistories',
    'qualifications': 'qualifications',
    'job-assignments': 'jobAssignments',
    'promotions': 'promotions',
    'salary-allowances': 'salaryAllowances',
    'annual-evaluations': 'annualEvaluations',
    'training-courses': 'trainingCourses',
    'transfers': 'transfers',
    'retirements': 'retirements',
    'documents': 'documents',
    'service-records': 'serviceRecords',
    'service-credits': 'serviceCredits',
    'leaves': 'leaveRequests',
    'penalties': 'penalties',
    'appreciations': 'appreciations',
    'performance': 'performanceEvaluations',
    'degree-track-snapshots': 'degreeTrackSnapshots',
    'degree-track-simulation-steps': 'degreeTrackSimulationSteps',
    'specialization-credits': 'specializationCourseCredits',
    'promotion-delay-reasons': 'promotionDelayReasons',
    'promotion_delay_reasons': 'promotionDelayReasons'
  };

  // --- Local Disk Persistence Engine ---
  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const DATA_FILE = path.join(DATA_DIR, 'local_storage.json');

  function ensureDataDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {}
  }

  // B3: flushLocalDbSync أُزيلت (كود ميت بعد تقاعد التخزين البديل في B2e).

  // B2e (ق-1، ق-2): التخزين البديل متقاعد. القاعدة هي المصدر الوحيد؛ لا يُكتب الملف بعد اليوم.
  // تبقى الدالة بلا أثر لأن 86 موضعاً يستدعيها؛ تُزال مع المخازن نفسها في B3.
  function saveLocalDb() { /* متقاعد */ }

  // B2e: loadLocalDb أُزيلت — كانت تعيد كتابة الملف عند فشل فك التشفير وتملأ قيماً مختلقة أثناء التحميل (مراجعة B2: M7، M9).

  // B2e: لا تحميل من local_storage.json عند الإقلاع. الإعدادات تُقرأ من القاعدة.
  try {
    const [dbSettings] = await db.select().from(schema.systemSettings).limit(1);
    if (dbSettings) systemSettingsStore = { ...systemSettingsStore, ...dbSettings };
  } catch (setErr: any) {
    console.warn('[SETTINGS] تعذّر تحميل إعدادات النظام من القاعدة عند الإقلاع:', setErr?.message || setErr);
  }
  // B3/إصلاح: نسخة العناوين الوظيفية من القاعدة (تُستعمل في العرض وحل العنوان عند الترفيع)
  try {
    const titleRows = await db.select().from(schema.jobTitles);
    if (titleRows.length) jobTitlesCache.list = titleRows.map((t: any) => ({ ...bothCases(t), min_grade: t.minGrade, min_step: t.minStep }));
  } catch (jtErr: any) {
    console.warn('[JOB-TITLES] تعذّر تحميل العناوين الوظيفية من القاعدة عند الإقلاع:', jtErr?.message || jtErr);
  }
  if (fs.existsSync(DATA_FILE)) {
    console.warn('[LOCAL-STORAGE] الملف data/local_storage.json ما زال موجوداً لكنه لم يعد يُقرأ أو يُكتب. بعد التأكد من النقل: control-app.bat retirelocal');
  }

  // Automatic periodic check for monthly leave accrual
  setTimeout(() => {
    if (systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
      executeMonthlyLeaveAccrual().catch((accErr: any) => console.error('[LEAVE-ACCRUAL] فشل الترحيل الشهري التلقائي:', accErr?.message || accErr));
    }
  }, 3000);
  setInterval(() => {
    if (systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
      executeMonthlyLeaveAccrual().catch((accErr: any) => console.error('[LEAVE-ACCRUAL] فشل الترحيل الشهري التلقائي:', accErr?.message || accErr));
    }
  }, 1000 * 60 * 60);

  // Central Promotion and Increment Recalculation Trigger
  async function loadPenaltyTypesForEngine(): Promise<any[] | undefined> {
    try {
      const rows = await db.select().from(schema.penaltyTypes);
      if (rows.length > 0) return rows;
    } catch (ptErr) {
      if (!isDbConnectionFailure(ptErr)) throw ptErr;
    }
    // إصلاح عاجل: لا رجوع لقائمة الذاكرة (تأخيرها 0 للتوبيخ والإنذار، خلاف قانون الانضباط 14/1991).
    // undefined ⇒ المحرك يستعمل DEFAULT_PENALTY_DELAYS القانونية.
    return undefined;
  }

  function logRecalcError(err: any) {
    console.error('[ELIGIBILITY] فشلت إعادة احتساب الاستحقاق:', err?.message || err);
  }

  async function triggerRecalculateEligibility(employeeId: number | string, preloaded?: LoadedEngineContext) {
    if (!employeeId) return null;
    const empIdNum = parseInt(String(employeeId));
    if (isNaN(empIdNum)) return null;

    // إصلاح عاجل (مراجعة B3: Blocker): كل مدخلات المحرك من القاعدة، لا من مخازن الذاكرة
    // (كانت فارغة بعد B2e، ومتأخرة قبله). فشل القراءة يُرمى: لا احتساب على بيانات ناقصة.
    const loaded = preloaded || await loadEngineContext(db, schema, empIdNum);
    const emp: any = loaded.employee;
    if (!emp) return null;
    const { penalties, attendances, evaluations, serviceCredits, qualifications, specializationCredits } = loaded;
    const commendations = loaded.commendations;
    const leaves = loaded.leaves.map(toEngineLeave);
    const degreeTrackSnapshots = loaded.degreeTrackSnapshots;
    const commendationRulesNow = loaded.commendationRules || settingsLists.getCommendationRulesSettings();

    const context: EngineContextData = {
      commendations,
      penalties,
      attendances,
      evaluations,
      leaves,
      serviceCredits,
      qualifications,
      degreeTrackSnapshots,
      specializationCredits,
      // الدورات الحاكمة: من القاعدة؛ إن كان الجدول فارغاً فالقائمة الافتراضية الموثّقة
      governingCourses: loaded.governingCourses.length ? loaded.governingCourses : inMemoryGoverningCourses,
      governingAssignments: loaded.governingAssignments,
      // قواعد الترفيع: من القاعدة؛ إن كانت فارغة فالقواعد القانونية الافتراضية
      gradeRules: loaded.gradeRules.length ? loaded.gradeRules : settingsLists.getGradePromotionRulesDefaults(),
      // أنواع العقوبات من الإعدادات (جدول penalty_types) بدل الجدول الثابت في المحرك
      penaltyTypes: await loadPenaltyTypesForEngine()
    } as EngineContextData;

    const fullResult = recalculateEligibilitySync(emp, context);

    // Check Degree Recognition Track & Deficit Auto-Settlement
    const activeDegreeSnapshot = degreeTrackSnapshots.find(
      (s: any) => s.status === 'نشط' || !s.status
    );

    let activeDegreeSimResult: any = undefined;

    if (activeDegreeSnapshot) {
      try {
        const simResult = calculateDegreeTrackSimulation(activeDegreeSnapshot, {
          specializationCredits,
          penalties,
          leaves,
          attendances
        });
        activeDegreeSimResult = simResult;

        const isAutoSettlementEnabled = commendationRulesNow.degreeTrackAutoSettlement === true ||
          commendationRulesNow.degree_track_auto_settlement === true;

        if (isAutoSettlementEnabled && simResult.hasDeficit && simResult.realTimeNextPromotion?.isEligible) {
          const settlementRes = processDegreeTrackSettlement(emp, activeDegreeSnapshot, simResult, {
            autoSettlementEnabled: true
          });

          if (settlementRes.settled && settlementRes.updatedEmployee && settlementRes.approvalRecord) {
            // Update employee last_promotion_date in memory
            const settlementDate = settlementRes.updatedEmployee.lastPromotionDate;
            const updatedEmpMemIdx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empIdNum);
            if (updatedEmpMemIdx !== -1) {
              inMemoryEmployees[updatedEmpMemIdx].lastPromotionDate = settlementDate;
              inMemoryEmployees[updatedEmpMemIdx].last_promotion_date = settlementDate;
            }

            // Update snapshot to 'مكتمل'
            activeDegreeSnapshot.status = 'مكتمل';
            const snapIdx = (genericMemoryStores['degree-track-snapshots'] || []).findIndex(s => s.id === activeDegreeSnapshot.id);
            if (snapIdx !== -1) {
              genericMemoryStores['degree-track-snapshots'][snapIdx].status = 'مكتمل';
            }

            // Insert into promotions_increments in memory
            const approvalRec = settlementRes.approvalRecord;
            const newPromoId = (genericMemoryStores['promotions'] || []).length + 1;
            const promoMemItem = {
              id: newPromoId,
              employee_id: empIdNum,
              employeeId: empIdNum,
              movement_type: approvalRec.movementType,
              movementType: approvalRec.movementType,
              grade_before: approvalRec.gradeBefore,
              gradeBefore: approvalRec.gradeBefore,
              grade_after: approvalRec.gradeAfter,
              gradeAfter: approvalRec.gradeAfter,
              step_before: approvalRec.stepBefore,
              stepBefore: approvalRec.stepBefore,
              step_after: approvalRec.stepAfter,
              stepAfter: approvalRec.stepAfter,
              due_date: approvalRec.dueDate,
              dueDate: approvalRec.dueDate,
              order_number: null,
              orderNumber: null,
              order_date: approvalRec.orderDate,
              orderDate: approvalRec.orderDate,
              approved_by: 'نظام آلي — تسوية تلقائية',
              approvedBy: 'نظام آلي — تسوية تلقائية',
              notes: approvalRec.notes,
              created_at: new Date().toISOString()
            };
            genericMemoryStores['promotions'].push(promoMemItem);

            // DB Updates with safe isolation
            try {
              await db.update(schema.employees)
                .set({ lastPromotionDate: settlementDate })
                .where(eq(schema.employees.id, empIdNum));
            } catch (e) {}

            try {
              await db.update(schema.degreeTrackSnapshots)
                .set({ status: 'مكتمل' })
                .where(eq(schema.degreeTrackSnapshots.id, activeDegreeSnapshot.id));
            } catch (e) {}

            try {
              await db.insert(schema.promotionsIncrements).values({
                employeeId: empIdNum,
                movementType: approvalRec.movementType,
                gradeBefore: String(approvalRec.gradeBefore),
                gradeAfter: String(approvalRec.gradeAfter),
                stepBefore: approvalRec.stepBefore,
                stepAfter: approvalRec.stepAfter,
                dueDate: approvalRec.dueDate,
                orderNumber: null,
                orderDate: approvalRec.orderDate,
                approvedBy: 'نظام آلي — تسوية تلقائية',
                notes: approvalRec.notes
              });
            } catch (e) {}

            console.log(`[DEGREE_TRACK_AUTO_SETTLED] Employee #${empIdNum} settled automatically on ${settlementDate}`);
          }
        }
      } catch (degreeErr: any) {
        console.error(`[DEGREE_TRACK_SETTLEMENT_ISOLATED_ERROR] Employee #${empIdNum}:`, degreeErr?.message || degreeErr);
      }
    }

    // Update employee record in-memory & database
    const promoDue = fullResult.promotion.nextPromotionDueDate;
    const incrDue = fullResult.increment.nextIncrementDueDate;

    const memIdx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empIdNum);
    if (memIdx !== -1) {
      inMemoryEmployees[memIdx] = {
        ...inMemoryEmployees[memIdx],
        nextPromotionDueDate: promoDue,
        next_promotion_due_date: promoDue,
        nextIncrementDueDate: incrDue,
        next_increment_due_date: incrDue,
        promotionEligibilityStatus: fullResult.promotion.eligibilityStatus,
        promotion_eligibility_status: fullResult.promotion.eligibilityStatus,
        incrementEligibilityStatus: fullResult.increment.eligibilityStatus,
        increment_eligibility_status: fullResult.increment.eligibilityStatus
      };
    }

    try {
      await db.update(schema.employees)
        .set({
          nextPromotionDueDate: promoDue,
          nextIncrementDueDate: incrDue,
        })
        .where(eq(schema.employees.id, empIdNum));
    } catch (e) {}

    // Sync Promotion Delay Reasons (Phase 4: Transparency & Reminders)
    try {
      const rawReasons = extractDelayReasonsFromContext(emp, fullResult, context, activeDegreeSimResult);
      // أسباب التأخير الحالية لهذا الموظف من القاعدة (لا من الذاكرة) حتى لا تُكرَّر عند كل احتساب
      const delaySyncRes = syncPromotionDelayReasons(
        empIdNum,
        rawReasons,
        loaded.delayReasons,
        commendationRulesNow
      );

      // DB sync with safe isolation
      try {
        for (const addedItem of delaySyncRes.added) {
          await db.insert(schema.promotionDelayReasons).values({
            employeeId: addedItem.employeeId,
            reasonType: addedItem.reasonType,
            description: addedItem.description,
            affects: addedItem.affects,
            isHidden: addedItem.isHidden,
            reminderDate: addedItem.reminderDate,
            isAutoReminder: addedItem.isAutoReminder,
            isResolved: addedItem.isResolved,
            resolvedAt: addedItem.resolvedAt,
            sourceReferenceId: addedItem.sourceReferenceId
          });
        }
        for (const updatedItem of [...delaySyncRes.updated, ...delaySyncRes.resolved]) {
          if (updatedItem.id) {
            await db.update(schema.promotionDelayReasons).set({
              description: updatedItem.description,
              affects: updatedItem.affects,
              isResolved: updatedItem.isResolved,
              resolvedAt: updatedItem.resolvedAt,
              updatedAt: new Date()
            }).where(eq(schema.promotionDelayReasons.id, updatedItem.id));
          }
        }
      } catch (e) {}
    } catch (delayErr: any) {
      console.warn(`[DELAY_REASONS_SYNC_WARN] Employee #${empIdNum}:`, delayErr?.message || delayErr);
    }

    saveLocalDb();
    return fullResult;
  }

  // المولّد العام: يُسجَّل فقط المسار الذي لم يُعرَّف صراحةً قبله (المسارات الصريحة تسبقه في الأسبقية،
  // وأي نسخة مولّدة لمسار مسجّل مسبقاً ستكون ميتة؛ مسجّل المسارات يمنع التكرار عند الإقلاع).
  Object.entries(genericEntitiesMap).forEach(([endpoint, schemaKey]) => {
    genericMemoryStores[endpoint] = genericMemoryStores[endpoint] || [];
    const listPath = `/api/${endpoint}`;
    const itemPath = `/api/${endpoint}/:id`;

    if (!routeRegistry.has('get', listPath)) {
    app.get(listPath, requireAuth, async (req, res) => {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable) {
          let query = db.select().from(targetTable);
          if (empIdParam && targetTable.employeeId) {
            query = query.where(eq(targetTable.employeeId, parseInt(empIdParam as string))) as any;
          }
          const records = await query;
          return res.json(records.map((r: any) => mapKeys(r, camelToSnake)));
        }
      } catch (err: any) {
        return sendRouteError(res, err, 'قراءة السجلات'); // B2d: لا قراءة من الذاكرة
      }
      let memList = genericMemoryStores[endpoint] || [];
      if (empIdParam) {
        memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
      }

      res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
    });

    }

    if (!routeRegistry.has('post', listPath)) {
    app.post(listPath, requireAuth, requireWriter, async (req, res) => {
      const data = mapKeys(req.body, snakeToCamel);
      let insertedRecord: any = null;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable) {
          const validColumns = new Set(Object.keys(getTableColumns(targetTable)));
          const cleanData: any = {};
          for (const [k, v] of Object.entries(data)) {
            if (validColumns.has(k) && k !== 'id' && k !== 'createdAt') {
              cleanData[k] = v;
            }
          }
          if (cleanData.employeeId !== undefined) {
            cleanData.employeeId = parseInt(cleanData.employeeId);
          }
          if (cleanData.step !== undefined && typeof cleanData.step === 'string') {
            cleanData.step = parseInt(cleanData.step) || 1;
          }
          if (cleanData.grade !== undefined && typeof cleanData.grade === 'string' && !isNaN(parseInt(cleanData.grade))) {
            cleanData.grade = parseInt(cleanData.grade);
          }
          if (cleanData.years !== undefined) {
            cleanData.years = parseInt(cleanData.years) || 0;
          }
          if (cleanData.months !== undefined) {
            cleanData.months = parseInt(cleanData.months) || 0;
          }
          if (cleanData.days !== undefined) {
            cleanData.days = parseInt(cleanData.days) || 0;
          }

          const [inserted] = await db.insert(targetTable).values(cleanData).returning();
          if (inserted) {
            insertedRecord = inserted;
          }
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'إضافة السجل')) return;
      }
      const newId = insertedRecord?.id || (genericMemoryStores[endpoint].reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, ...(insertedRecord ? mapKeys(insertedRecord, camelToSnake) : {}), id: newId, created_at: insertedRecord?.createdAt || new Date().toISOString() };
      genericMemoryStores[endpoint].push(memRecord);

      // If qualification was added and isActive is true, sync to central employee record!
      if (endpoint === 'qualifications') {
        const empId = parseInt(String(cleanSnake.employee_id || data.employeeId));
        if (empId && cleanSnake.is_active !== false && cleanSnake.isActive !== false) {
          await updateEmployeeCentralRecord(empId, {
            education_level: cleanSnake.education_level || cleanSnake.level || data.level,
            educationLevel: cleanSnake.education_level || cleanSnake.level || data.level,
            specialization: cleanSnake.specialization || data.specialization,
            university: cleanSnake.institution || cleanSnake.university || data.university,
            institution: cleanSnake.institution || cleanSnake.university || data.university,
            graduation_year: cleanSnake.graduation_year || data.graduationYear,
            graduationYear: cleanSnake.graduation_year || data.graduationYear,
            education_order: cleanSnake.evaluation_order || cleanSnake.equation_number || cleanSnake.education_order || data.equationNumber || data.evaluationOrder,
            evaluation_order: cleanSnake.evaluation_order || cleanSnake.equation_number || cleanSnake.education_order || data.equationNumber || data.evaluationOrder
          });
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(cleanSnake.employee_id || cleanSnake.employeeId || data.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      res.status(201).json(mapKeys(memRecord, camelToSnake));
    });
    }

    if (!routeRegistry.has('put', itemPath)) {
    app.put(itemPath, requireAuth, requireWriter, async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      let updatedRecord: any = null;
      let dbAnswered = false;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable && targetTable.id) {
          const validColumns = new Set(Object.keys(getTableColumns(targetTable)));
          const cleanData: any = {};
          for (const [k, v] of Object.entries(data)) {
            if (validColumns.has(k) && k !== 'id' && k !== 'createdAt') {
              cleanData[k] = v;
            }
          }
          if (cleanData.employeeId !== undefined) {
            cleanData.employeeId = parseInt(cleanData.employeeId);
          }
          if (cleanData.step !== undefined && typeof cleanData.step === 'string') {
            cleanData.step = parseInt(cleanData.step) || 1;
          }
          if (cleanData.grade !== undefined && typeof cleanData.grade === 'string' && !isNaN(parseInt(cleanData.grade))) {
            cleanData.grade = parseInt(cleanData.grade);
          }
          if (cleanData.years !== undefined) {
            cleanData.years = parseInt(cleanData.years) || 0;
          }
          if (cleanData.months !== undefined) {
            cleanData.months = parseInt(cleanData.months) || 0;
          }
          if (cleanData.days !== undefined) {
            cleanData.days = parseInt(cleanData.days) || 0;
          }

          const [updated] = await db.update(targetTable).set(cleanData).where(eq(targetTable.id, id)).returning();
          dbAnswered = true;
          if (updated) {
            updatedRecord = updated;
          }
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'تعديل السجل')) return;
      }
      if (dbAnswered && !updatedRecord) {
        return res.status(404).json({ error: 'السجل المطلوب تعديله غير موجود في قاعدة البيانات' });
      }
      const idx = genericMemoryStores[endpoint].findIndex(r => String(r.id) === String(id));
      const cleanSnake = { ...mapKeys(req.body, camelToSnake), ...(updatedRecord ? mapKeys(updatedRecord, camelToSnake) : {}) };
      let savedRecord: any;
      if (idx !== -1) {
        genericMemoryStores[endpoint][idx] = { ...genericMemoryStores[endpoint][idx], ...cleanSnake, id };
        savedRecord = genericMemoryStores[endpoint][idx];
      } else {
        const recordToPush = { ...cleanSnake, id };
        genericMemoryStores[endpoint].push(recordToPush);
        savedRecord = recordToPush;
      }

      // If qualification was updated, sync to employee central record!
      if (endpoint === 'qualifications') {
        const empId = parseInt(String(savedRecord.employee_id || savedRecord.employeeId || data.employeeId));
        if (empId) {
          if (savedRecord.is_active !== false && savedRecord.isActive !== false) {
            await updateEmployeeCentralRecord(empId, {
              education_level: savedRecord.education_level || savedRecord.level || data.level,
              educationLevel: savedRecord.education_level || savedRecord.level || data.level,
              specialization: savedRecord.specialization || data.specialization,
              university: savedRecord.institution || savedRecord.university || data.university,
              institution: savedRecord.institution || savedRecord.university || data.university,
              graduation_year: savedRecord.graduation_year || data.graduationYear,
              graduationYear: savedRecord.graduation_year || data.graduationYear,
              education_order: savedRecord.evaluation_order || savedRecord.equation_number || savedRecord.education_order || data.equationNumber || data.evaluationOrder,
              evaluation_order: savedRecord.evaluation_order || savedRecord.equation_number || savedRecord.education_order || data.equationNumber || data.evaluationOrder
            });
          } else {
            // Find next active qualification
            const nextActive = (genericMemoryStores['qualifications'] || []).find(q => String(q.employee_id || q.employeeId) === String(empId) && String(q.id) !== String(id) && (q.is_active !== false && q.isActive !== false));
            if (nextActive) {
              await updateEmployeeCentralRecord(empId, {
                education_level: nextActive.education_level || nextActive.level,
                educationLevel: nextActive.education_level || nextActive.level,
                specialization: nextActive.specialization || '',
                university: nextActive.institution || nextActive.university || '',
                institution: nextActive.institution || nextActive.university || '',
                graduation_year: nextActive.graduation_year || nextActive.graduationYear || 0,
                graduationYear: nextActive.graduation_year || nextActive.graduationYear || 0,
                education_order: nextActive.evaluation_order || nextActive.equation_number || nextActive.education_order || '',
                evaluation_order: nextActive.evaluation_order || nextActive.equation_number || nextActive.education_order || ''
              });
            }
          }
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(savedRecord?.employee_id || savedRecord?.employeeId || data.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      return res.json(mapKeys(savedRecord, camelToSnake));
    });
    }

    if (!routeRegistry.has('delete', itemPath)) {
    app.delete(itemPath, requireAuth, requireWriter, async (req, res) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });
      let deletedRecord: any = (genericMemoryStores[endpoint] || []).find(r => String(r.id) === String(id));
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable && targetTable.id) {
          const removed = await db.delete(targetTable).where(eq(targetTable.id, id)).returning();
          if (removed && removed[0]) deletedRecord = deletedRecord || mapKeys(removed[0], camelToSnake);
        }
      } catch (err: any) {
        if (respondIfDbWriteError(res, err, 'حذف السجل')) return;
      }
      genericMemoryStores[endpoint] = (genericMemoryStores[endpoint] || []).filter(r => String(r.id) !== String(id));

      if (endpoint === 'qualifications' && deletedRecord) {
        const empId = parseInt(String(deletedRecord.employee_id || deletedRecord.employeeId));
        if (empId) {
          const remainingActive = (genericMemoryStores['qualifications'] || []).filter(
            q => String(q.employee_id || q.employeeId) === String(empId) && String(q.id) !== String(id) && (q.is_active !== false && q.isActive !== false)
          );
          if (remainingActive.length > 0) {
            const top = remainingActive[0];
            await updateEmployeeCentralRecord(empId, {
              education_level: top.education_level || top.level,
              educationLevel: top.education_level || top.level,
              specialization: top.specialization || '',
              university: top.institution || top.university || '',
              institution: top.institution || top.university || '',
              graduation_year: top.graduation_year || top.graduationYear || 0,
              graduationYear: top.graduation_year || top.graduationYear || 0,
              education_order: top.evaluation_order || top.equation_number || top.education_order || '',
              evaluation_order: top.evaluation_order || top.equation_number || top.education_order || ''
            });
          }
        }
      }

      // Trigger real-time promotion/increment recalculation if relevant entity
      const targetEmpId = parseInt(String(deletedRecord?.employee_id || deletedRecord?.employeeId));
      if (targetEmpId && !isNaN(targetEmpId)) {
        triggerRecalculateEligibility(targetEmpId).catch(logRecalcError);
      }

      saveLocalDb();
      res.json({ success: true });
    });
    }
  });

  // --- Promotion & Increment Eligibility API (المسار الاعتيادي ومسار الشهادات) ---
  app.get('/api/employees/:id/promotion-eligibility', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      if (isNaN(empId)) return res.status(400).json({ error: 'ID غير صالح للموظف' });

      const result = await triggerRecalculateEligibility(empId);
      if (!result) return res.status(404).json({ error: 'الموظف غير موجود' });

      return res.json(result);
    } catch (err: any) {
      console.error('Error calculating promotion eligibility:', err);
      sendRouteError(res, err);
    }
  });

  // --- Degree Recognition Track API (Phase 2b) ---

  // 1. Initiate Degree Recognition for In-Service Qualification
  app.post('/api/qualifications/:id/initiate-degree-recognition', requireAuth, requireWriter, async (req, res) => {
    try {
      const qualId = parseInt(req.params.id);
      if (isNaN(qualId)) return res.status(400).json({ error: 'معرّف الشهادة غير صالح' });

      const rawJobTitleId = req.body.job_title_id || req.body.jobTitleId;
      if (!rawJobTitleId) {
        return res.status(400).json({ error: 'العنوان الوظيفي المرتبط مطلوب لبدء مسار احتساب الشهادة (job_title_id)' });
      }
      const jobTitleId = parseInt(String(rawJobTitleId));

      // Find qualification
      let qual = (genericMemoryStores['qualifications'] || []).find(q => parseInt(String(q.id)) === qualId);
      if (!qual) {
        try {
          const dbQuals = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, qualId));
          if (dbQuals && dbQuals.length > 0) qual = dbQuals[0];
        } catch (e) {}
      }
      if (!qual) return res.status(404).json({ error: 'الشهادة غير موجودة' });

      const empId = parseInt(String(qual.employee_id || qual.employeeId));
      let emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === empId);
      if (!emp) {
        try {
          const dbEmps = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
          if (dbEmps && dbEmps.length > 0) emp = dbEmps[0];
        } catch (e) {}
      }
      if (!emp) return res.status(404).json({ error: 'الموظف صاحب الشهادة غير موجود' });

      // Find Job Title and extract baseline grade and step strictly from job_titles table
      let jobTitle = jobTitlesCache.list.find(t => parseInt(String(t.id)) === jobTitleId);
      if (!jobTitle) {
        try {
          const dbTitles = await db.select().from(schema.jobTitles).where(eq(schema.jobTitles.id, jobTitleId));
          if (dbTitles && dbTitles.length > 0) jobTitle = dbTitles[0];
        } catch (e) {}
      }
      if (!jobTitle) return res.status(400).json({ error: 'العنوان الوظيفي المحدد غير موجود' });

      const baselineGrade = parseInt(String(jobTitle.min_grade ?? jobTitle.minGrade)) || 7;
      const baselineStep = parseInt(String(jobTitle.min_step ?? jobTitle.minStep)) || 1;

      const qualLevel = qual.level || qual.education_level || qual.name || '';
      const actualGradeBefore = parseInt(String(emp.grade)) || 3;
      const actualStepBefore = parseInt(String(emp.step)) || 1;
      const graduationDateUsed = qual.graduation_date || qual.graduationDate || `${qual.graduation_year || 2020}-01-01`;
      const orderDate = qual.equation_date || qual.equationDate || qual.order_date || new Date().toISOString().split('T')[0];

      // Deactivate any existing active snapshot for this employee
      const existingSnapshots = (genericMemoryStores['degree-track-snapshots'] || []).filter(
        s => parseInt(String(s.employee_id || s.employeeId)) === empId
      );
      existingSnapshots.forEach(s => { s.status = 'مكتمل'; });
      try {
        await db.update(schema.degreeTrackSnapshots).set({ status: 'مكتمل' }).where(eq(schema.degreeTrackSnapshots.employeeId, empId));
      } catch (e) {}

      // Create new snapshot
      const newSnapshotData: any = {
        qualificationId: qualId,
        employeeId: empId,
        jobTitleId: jobTitleId,
        actualGradeBefore,
        actualStepBefore,
        baselineGrade,
        baselineStep,
        graduationDateUsed,
        orderDate,
        status: 'نشط',
        notes: req.body.notes || `بدء مسار احتساب شهادة (${qualLevel}) مقترنة بالعنوان الوظيفي (${jobTitle.name}) بدرجة أساس (${baselineGrade}) ومرحلة أساس (${baselineStep})`,
        createdAt: new Date()
      };

      let createdSnapshot: any = null;
      try {
        const [inserted] = await db.insert(schema.degreeTrackSnapshots).values(newSnapshotData).returning();
        if (inserted) createdSnapshot = inserted;
      } catch (e) {
        console.warn('Database fallback for degreeTrackSnapshots');
      }

      if (!createdSnapshot) {
        createdSnapshot = {
          id: (genericMemoryStores['degree-track-snapshots'] || []).length + 1,
          ...mapKeys(newSnapshotData, camelToSnake),
          created_at: new Date().toISOString()
        };
      }

      genericMemoryStores['degree-track-snapshots'] = genericMemoryStores['degree-track-snapshots'] || [];
      genericMemoryStores['degree-track-snapshots'].push(mapKeys(createdSnapshot, camelToSnake));

      // Run simulation engine & save steps
      // B3/إصلاح: مدخلات المحاكاة من القاعدة (كانت من الذاكرة الفارغة بعد B2e، وأنواع العقوبات من
      // قائمة الكود بتأخير 0 للتوبيخ والإنذار). أنواع العقوبات من جدولها أو الافتراضي القانوني.
      const simCtx = await loadEngineContext(db, schema, empId);
      const simResult = calculateDegreeTrackSimulation(createdSnapshot, {
        specializationCredits: simCtx.specializationCredits,
        penalties: simCtx.penalties,
        leaves: simCtx.leaves.map(toEngineLeave),
        attendances: simCtx.attendances,
        penaltyTypes: await loadPenaltyTypesForEngine()
      });

      // Clear previous simulation steps for this snapshot and insert new ones
      genericMemoryStores['degree-track-simulation-steps'] = (genericMemoryStores['degree-track-simulation-steps'] || []).filter(
        st => parseInt(String(st.snapshot_id || st.snapshotId)) !== parseInt(String(createdSnapshot.id))
      );

      for (const step of simResult.simulationSteps) {
        const stepDbData = {
          snapshotId: createdSnapshot.id,
          fromGrade: step.fromGrade,
          toGrade: step.toGrade,
          computedDate: step.computedDate,
          weeksConsumed: step.weeksConsumed,
          isBundled: step.isBundled || false,
          status: step.status,
          notes: step.notes || '',
          createdAt: new Date()
        };

        let insertedStep: any = null;
        try {
          const [ins] = await db.insert(schema.degreeTrackSimulationSteps).values(stepDbData).returning();
          if (ins) insertedStep = ins;
        } catch (e) {}

        if (!insertedStep) {
          insertedStep = {
            id: (genericMemoryStores['degree-track-simulation-steps'] || []).length + 1,
            ...mapKeys(stepDbData, camelToSnake),
            created_at: new Date().toISOString()
          };
        }
        genericMemoryStores['degree-track-simulation-steps'].push(mapKeys(insertedStep, camelToSnake));
      }

      // Trigger recalculation of employee eligibility
      await triggerRecalculateEligibility(empId);

      saveLocalDb();
      return res.status(201).json({
        snapshot: mapKeys(createdSnapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error initiating degree recognition:', err);
      sendRouteError(res, err);
    }
  });

  // 2. Get Simulation Report for Snapshot
  app.get('/api/degree-track-snapshots/:id/simulation', requireAuth, async (req, res) => {
    try {
      const snapId = parseInt(req.params.id);
      let snapshot = (genericMemoryStores['degree-track-snapshots'] || []).find(s => parseInt(String(s.id)) === snapId);
      if (!snapshot) {
        try {
          const dbSnaps = await db.select().from(schema.degreeTrackSnapshots).where(eq(schema.degreeTrackSnapshots.id, snapId));
          if (dbSnaps && dbSnaps.length > 0) snapshot = dbSnaps[0];
        } catch (e) {}
      }
      if (!snapshot) return res.status(404).json({ error: 'سجل احتساب الشهادة غير موجود' });

      const empId = parseInt(String(snapshot.employee_id || snapshot.employeeId));
      const specializationCredits = (genericMemoryStores['specialization-credits'] || []).filter(
        c => parseInt(String(c.employee_id || c.employeeId)) === empId
      );
      const penalties = (genericMemoryStores['penalties'] || []).filter(p => parseInt(String(p.employee_id || p.employeeId)) === empId);
      const leaves = (genericMemoryStores['leaves'] || []).filter(l => parseInt(String(l.employee_id || l.employeeId)) === empId);
      const attendances = (genericMemoryStores['attendance'] || []).filter(a => parseInt(String(a.employee_id || a.employeeId)) === empId);

      const simResult = calculateDegreeTrackSimulation(snapshot, {
        specializationCredits,
        penalties,
        leaves,
        attendances
      });

      return res.json({
        snapshot: mapKeys(snapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error fetching degree track simulation:', err);
      sendRouteError(res, err);
    }
  });

  // 3. Get Active Degree Track for Employee
  app.get('/api/employees/:id/degree-track', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      const snapshot = (genericMemoryStores['degree-track-snapshots'] || []).find(
        s => parseInt(String(s.employee_id || s.employeeId)) === empId && (s.status === 'نشط' || !s.status)
      );

      if (!snapshot) return res.json({ hasActiveDegreeTrack: false, snapshot: null, simulation: null });

      const specializationCredits = (genericMemoryStores['specialization-credits'] || []).filter(
        c => parseInt(String(c.employee_id || c.employeeId)) === empId
      );
      const penalties = (genericMemoryStores['penalties'] || []).filter(p => parseInt(String(p.employee_id || p.employeeId)) === empId);
      const leaves = (genericMemoryStores['leaves'] || []).filter(l => parseInt(String(l.employee_id || l.employeeId)) === empId);
      const attendances = (genericMemoryStores['attendance'] || []).filter(a => parseInt(String(a.employee_id || a.employeeId)) === empId);

      const simResult = calculateDegreeTrackSimulation(snapshot, {
        specializationCredits,
        penalties,
        leaves,
        attendances
      });

      return res.json({
        hasActiveDegreeTrack: true,
        snapshot: mapKeys(snapshot, camelToSnake),
        simulation: simResult
      });
    } catch (err: any) {
      console.error('Error fetching employee degree track:', err);
      sendRouteError(res, err);
    }
  });

  // Helper to resolve promotion target job title
  function resolveTargetJobTitle(emp: any, targetGrade: number): string {
    const currentTitleName = String(emp.jobTitle || emp.job_title || '').trim();
    const allTitles = genericMemoryStores['job-titles'] || jobTitlesCache.list || [];
    
    if (allTitles.length > 0) {
      const currentTitleObj = allTitles.find((t: any) => 
        (emp.jobTitleId && String(t.id) === String(emp.jobTitleId)) ||
        (t.name && t.name.trim() === currentTitleName)
      );
      
      if (currentTitleObj && (currentTitleObj.nextTitleId || currentTitleObj.next_title_id)) {
        const nextId = currentTitleObj.nextTitleId || currentTitleObj.next_title_id;
        const nextTitleObj = allTitles.find((t: any) => String(t.id) === String(nextId));
        if (nextTitleObj?.name) return nextTitleObj.name;
      }
      
      if (currentTitleObj?.category) {
        const matched = allTitles.find((t: any) => 
          t.category === currentTitleObj.category && 
          (parseInt(String(t.minGrade || t.min_grade)) === targetGrade || parseInt(String(t.grade)) === targetGrade)
        );
        if (matched?.name) return matched.name;
      }
    }
    
    return currentTitleName || `العنوان المستحق للدرجة ${targetGrade}`;
  }

  // 4. Promotions, Increments & Degree Recognition Due List (قوائم المستحقين الثلاث مع كافة المؤثرات والتواريخ)
  app.get('/api/promotions/due-list', requireAuth, async (req, res) => {
    try {
      const dueForIncrement: any[] = [];
      const dueForPromotion: any[] = [];
      const dueForSettlement: any[] = [];

      // إصلاح عاجل: الموظفون ومدخلات المحرك من القاعدة بقراءة واحدة لكل جدول (كانت من الذاكرة ← قائمة فارغة بعد B2e)
      const bulk = await loadAllEngineContexts(db, schema);
      for (const rawEmp of bulk.employees) {
        try {
          const emp: any = bothCases(rawEmp);
          const empId = parseInt(String(emp.id));
          if (!empId) continue;

          // Skip inactive or separated employees
          const empStatus = emp.status || 'نشط';
          if (['منتهية_خدمته', 'متقاعد', 'مفصول', 'مستقيل', 'متوفى'].includes(empStatus)) {
            continue;
          }

          // Recalculate standard eligibility
          const eligibility = await triggerRecalculateEligibility(empId, bulk.get(empId));

          const currentTitle = emp.jobTitle || emp.job_title || 'موظف';
          const basePromotionDate = emp.lastPromotionDate || emp.last_promotion_date || emp.gradeDate || emp.grade_date || emp.currentAppointmentDate || emp.current_appointment_date || emp.appointmentDate || emp.appointment_date || emp.firstAppointmentDate || emp.first_appointment_date || '';
          const baseIncrementDate = emp.lastIncrementDate || emp.last_increment_date || emp.gradeDate || emp.grade_date || emp.currentAppointmentDate || emp.current_appointment_date || emp.appointmentDate || emp.appointment_date || emp.firstAppointmentDate || emp.first_appointment_date || '';

          // 1. Check Increment Eligibility (علاوة سنوية)
          if (
            eligibility?.increment?.eligibilityStatus === 'مستحق_للعلاوة' &&
            eligibility?.increment?.isIncrementEligible
          ) {
            const currentStep = parseInt(String(emp.step)) || 1;
            const targetStep = Math.min(11, currentStep + 1);
            const incCommCount = eligibility.increment.appliedCommendationsCount || 0;
            const incCommMonths = eligibility.increment.commendationMonthsDeducted || 0;
            const incPenCount = eligibility.increment.appliedPenaltiesCount || 0;
            const incPenMonths = eligibility.increment.penaltyMonthsAdded || 0;
            const incAbsenceDays = eligibility.increment.appliedAbsenceDays || 0;
            const incServiceCredit = eligibility.increment.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
            const incServiceMonths = (incServiceCredit.years || 0) * 12 + (incServiceCredit.months || 0);

            // Construct readable other factors for increment
            const incOtherFactors: string[] = [];
            if (incServiceMonths > 0 || (incServiceCredit.days || 0) > 0) {
              incOtherFactors.push(`خدمة مضافة: ${incServiceCredit.years > 0 ? `${incServiceCredit.years} سنة و ` : ''}${incServiceCredit.months > 0 ? `${incServiceCredit.months} شهر` : ''}${incServiceCredit.days > 0 ? ` و ${incServiceCredit.days} يوم` : ''}`);
            }
            if (incAbsenceDays > 0) {
              incOtherFactors.push(`أيام غياب/إجازات غير اعتيادية: ${incAbsenceDays} يوم`);
            }
            if (incOtherFactors.length === 0) {
              incOtherFactors.push('استيفاء كامل المدة الزمنية والضوابط القانونية');
            }

            dueForIncrement.push({
              employeeId: empId,
              employee_id: empId,
              name: emp.fullName || emp.full_name || emp.name,
              fullName: emp.fullName || emp.full_name || emp.name,
              department: emp.department || 'عام',
              jobTitle: currentTitle,
              currentGrade: emp.grade,
              current_grade: emp.grade,
              currentStep: currentStep,
              current_step: currentStep,
              targetGrade: emp.grade,
              target_grade: emp.grade,
              targetStep: targetStep,
              target_step: targetStep,
              // Previous and Next Dates
              lastIncrementDate: eligibility.increment.lastIncrementDate || baseIncrementDate,
              last_increment_date: eligibility.increment.lastIncrementDate || baseIncrementDate,
              nextIncrementDueDate: eligibility.increment.nextIncrementDueDate,
              next_increment_due_date: eligibility.increment.nextIncrementDueDate,
              dueDate: eligibility.increment.nextIncrementDueDate,
              due_date: eligibility.increment.nextIncrementDueDate,
              baseDueDate: eligibility.increment.baseDueDate || eligibility.increment.nextIncrementDueDate,
              base_due_date: eligibility.increment.baseDueDate || eligibility.increment.nextIncrementDueDate,
              // Commendation Letters & Impact
              commendationsCount: incCommCount,
              commendations_count: incCommCount,
              commendationMonths: incCommMonths,
              commendation_months: incCommMonths,
              commendationImpactText: incCommCount > 0 ? `${incCommCount} كتاب شكر (تقديم ${incCommMonths} شهر)` : 'لا يوجد',
              commendation_impact_text: incCommCount > 0 ? `${incCommCount} كتاب شكر (تقديم ${incCommMonths} شهر)` : 'لا يوجد',
              // Penalties & Impact
              penaltiesCount: incPenCount,
              penalties_count: incPenCount,
              penaltyDelayMonths: incPenMonths,
              penalty_delay_months: incPenMonths,
              penaltyImpactText: incPenCount > 0 ? `${incPenCount} عقوبة (تأخير ${incPenMonths} شهر)` : 'سجل نظيف',
              penalty_impact_text: incPenCount > 0 ? `${incPenCount} عقوبة (تأخير ${incPenMonths} شهر)` : 'سجل نظيف',
              // Other Factors
              serviceCreditDuration: incServiceCredit,
              service_credit_duration: incServiceCredit,
              serviceCreditMonths: incServiceMonths,
              service_credit_months: incServiceMonths,
              absenceDays: incAbsenceDays,
              absence_days: incAbsenceDays,
              otherFactors: incOtherFactors,
              other_factors: incOtherFactors,
              trackType: 'المسار_الاعتيادي',
              track_type: 'المسار_الاعتيادي',
              actionType: 'علاوة',
              action_type: 'علاوة',
              noGradeChange: true,
              no_grade_change: true,
              reasons: [eligibility.increment.statusReason || 'استوفى الموظف المدة الزمنية وشروط استحقاق العلاوة السنوية']
            });
          }

          // 2. Check Degree Track Snapshot Deficit Settlement
          const activeSnap = (genericMemoryStores['degree-track-snapshots'] || []).find(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && (s.status === 'نشط' || !s.status)
          );

          let hasHandledDegreeTrack = false;
          if (activeSnap) {
            const specCredits = (genericMemoryStores['specialization-credits'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empId);
            const p = (genericMemoryStores['penalties'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
            const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId).map(toEngineLeave);
            const a = (genericMemoryStores['attendance'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);

            const sim = calculateDegreeTrackSimulation(activeSnap, { specializationCredits: specCredits, penalties: p, leaves: l, attendances: a });
            if (sim.hasDeficit) {
              hasHandledDegreeTrack = true;
              if (sim.realTimeNextPromotion?.isEligible && sim.realTimeNextPromotion?.eligibilityStatus === 'مستحق_للترفيع') {
                const settCommCount = sim.realTimeNextPromotion.appliedCommendationsCount || 0;
                const settCommMonths = sim.realTimeNextPromotion.commendationMonthsDeducted || 0;
                const settPenCount = sim.realTimeNextPromotion.appliedPenaltiesCount || 0;
                const settPenMonths = sim.realTimeNextPromotion.penaltyMonthsAdded || 0;
                const settServiceCredit = sim.realTimeNextPromotion.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
                const settServiceMonths = (settServiceCredit.years || 0) * 12 + (settServiceCredit.months || 0);

                const settOtherFactors: string[] = [
                  'استيفاء مدة العجز بسنتين خدمة فعلية في الدرجة الحالية',
                  sim.specializationCourseCompleted ? 'اجتياز دورة الاختصاص بنجاح' : 'دورة الاختصاص مستوفاة'
                ];
                if (settServiceMonths > 0) {
                  settOtherFactors.push(`خدمة محتسبة: ${settServiceCredit.years > 0 ? `${settServiceCredit.years} سنة و ` : ''}${settServiceCredit.months} شهر`);
                }

                dueForSettlement.push({
                  employeeId: empId,
                  employee_id: empId,
                  name: emp.fullName || emp.full_name || emp.name,
                  fullName: emp.fullName || emp.full_name || emp.name,
                  department: emp.department || 'عام',
                  jobTitle: currentTitle,
                  currentGrade: emp.grade || activeSnap.actualGradeBefore,
                  current_grade: emp.grade || activeSnap.actualGradeBefore,
                  currentStep: emp.step || activeSnap.actualStepBefore,
                  current_step: emp.step || activeSnap.actualStepBefore,
                  targetGrade: emp.grade || activeSnap.actualGradeBefore,
                  target_grade: emp.grade || activeSnap.actualGradeBefore,
                  targetStep: emp.step || activeSnap.actualStepBefore,
                  target_step: emp.step || activeSnap.actualStepBefore,
                  // Dates
                  lastPromotionDate: activeSnap.actualPromotionDateBefore || basePromotionDate,
                  last_promotion_date: activeSnap.actualPromotionDateBefore || basePromotionDate,
                  nextPromotionDueDate: sim.realTimeNextPromotion.nextPromotionDueDate,
                  next_promotion_due_date: sim.realTimeNextPromotion.nextPromotionDueDate,
                  dueDate: sim.realTimeNextPromotion.nextPromotionDueDate,
                  due_date: sim.realTimeNextPromotion.nextPromotionDueDate,
                  baseDueDate: sim.realTimeNextPromotion.baseDueDate || sim.realTimeNextPromotion.nextPromotionDueDate,
                  base_due_date: sim.realTimeNextPromotion.baseDueDate || sim.realTimeNextPromotion.nextPromotionDueDate,
                  // Commendation Letters & Impact
                  commendationsCount: settCommCount,
                  commendations_count: settCommCount,
                  commendationMonths: settCommMonths,
                  commendation_months: settCommMonths,
                  commendationImpactText: settCommCount > 0 ? `${settCommCount} كتاب شكر (تقديم ${settCommMonths} شهر)` : 'لا يوجد',
                  commendation_impact_text: settCommCount > 0 ? `${settCommCount} كتاب شكر (تقديم ${settCommMonths} شهر)` : 'لا يوجد',
                  // Penalties & Impact
                  penaltiesCount: settPenCount,
                  penalties_count: settPenCount,
                  penaltyDelayMonths: settPenMonths,
                  penalty_delay_months: settPenMonths,
                  penaltyImpactText: settPenCount > 0 ? `${settPenCount} عقوبة (تأخير ${settPenMonths} شهر)` : 'سجل نظيف',
                  penalty_impact_text: settPenCount > 0 ? `${settPenCount} عقوبة (تأخير ${settPenMonths} شهر)` : 'سجل نظيف',
                  // Other Factors
                  serviceCreditDuration: settServiceCredit,
                  service_credit_duration: settServiceCredit,
                  specializationCoursesSatisfied: Boolean(sim.specializationCourseCompleted),
                  specialization_courses_satisfied: Boolean(sim.specializationCourseCompleted),
                  otherFactors: settOtherFactors,
                  other_factors: settOtherFactors,
                  trackType: 'مسار_احتساب_الشهادات',
                  track_type: 'مسار_احتساب_الشهادات',
                  actionType: 'تسوية',
                  action_type: 'تسوية',
                  noGradeChange: true,
                  no_grade_change: true,
                  snapshotId: activeSnap.id,
                  snapshot_id: activeSnap.id,
                  reasons: [sim.realTimeNextPromotion.statusReason || 'استوفى الموظف شروط تسوية العجز وتثبيت الاستحقاق بدرجته الحالية']
                });
              }
            }
          }

          // 3. Check Standard Promotion Eligibility (ترفيع درجة) - only if not in active degree track deficit
          if (!hasHandledDegreeTrack && eligibility?.promotion?.eligibilityStatus === 'مستحق_للترفيع' && eligibility?.promotion?.isPromotionEligible) {
            const currentGrade = parseInt(String(emp.grade)) || 10;
            const targetGrade = Math.max(1, currentGrade - 1);
            const targetTitle = resolveTargetJobTitle(emp, targetGrade);
            
            const promoCommCount = eligibility.promotion.appliedCommendationsCount || 0;
            const promoCommMonths = eligibility.promotion.commendationMonthsDeducted || 0;
            const promoPenCount = eligibility.promotion.appliedPenaltiesCount || 0;
            const promoPenMonths = eligibility.promotion.penaltyMonthsAdded || 0;
            const promoAbsenceDays = eligibility.promotion.appliedAbsenceDays || 0;
            const promoServiceCredit = eligibility.promotion.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
            const promoServiceMonths = (promoServiceCredit.years || 0) * 12 + (promoServiceCredit.months || 0);
            const gateChecks = eligibility.promotion.gateCheckResults || { governingCoursesSatisfied: true, missingGoverningCourses: [], evaluationsSatisfied: true };

            // Construct readable other factors for promotion
            const promoOtherFactors: string[] = [];
            
            // Governing courses
            if (gateChecks.governingCoursesSatisfied) {
              promoOtherFactors.push('الدورات الحتمية: مستوفاة بالكامل');
            } else if (gateChecks.missingGoverningCourses && gateChecks.missingGoverningCourses.length > 0) {
              promoOtherFactors.push(`الدورات الحتمية: متبقي (${gateChecks.missingGoverningCourses.join(', ')})`);
            }

            // Evaluations
            if (gateChecks.evaluationsSatisfied) {
              promoOtherFactors.push('تقييم الأداء: مستوفٍ لآخر سنتين بدرجة كفوء فأعلى');
            }

            // Service additions
            if (promoServiceMonths > 0 || (promoServiceCredit.days || 0) > 0) {
              promoOtherFactors.push(`خدمة محتسبة: ${promoServiceCredit.years > 0 ? `${promoServiceCredit.years} سنة و ` : ''}${promoServiceCredit.months > 0 ? `${promoServiceCredit.months} شهر` : ''}${promoServiceCredit.days > 0 ? ` و ${promoServiceCredit.days} يوم` : ''}`);
            }

            // Absences / pauses
            if (promoAbsenceDays > 0) {
              promoOtherFactors.push(`أيام غياب/إجازات مخصومة: ${promoAbsenceDays} يوم`);
            }

            if (promoOtherFactors.length === 0) {
              promoOtherFactors.push('استيفاء المدة القانونية وشروط الترقية المعتمدة لسلم 2023');
            }

            dueForPromotion.push({
              employeeId: empId,
              employee_id: empId,
              name: emp.fullName || emp.full_name || emp.name,
              fullName: emp.fullName || emp.full_name || emp.name,
              department: emp.department || 'عام',
              jobTitle: currentTitle,
              currentJobTitle: currentTitle,
              current_job_title: currentTitle,
              targetJobTitle: targetTitle,
              target_job_title: targetTitle,
              currentGrade: currentGrade,
              current_grade: currentGrade,
              currentStep: emp.step || 1,
              current_step: emp.step || 1,
              targetGrade: targetGrade,
              target_grade: targetGrade,
              targetStep: 1,
              target_step: 1,
              // Previous and Next Dates
              lastPromotionDate: eligibility.promotion.lastPromotionDate || basePromotionDate,
              last_promotion_date: eligibility.promotion.lastPromotionDate || basePromotionDate,
              nextPromotionDueDate: eligibility.promotion.nextPromotionDueDate,
              next_promotion_due_date: eligibility.promotion.nextPromotionDueDate,
              dueDate: eligibility.promotion.nextPromotionDueDate,
              due_date: eligibility.promotion.nextPromotionDueDate,
              baseDueDate: eligibility.promotion.baseDueDate || eligibility.promotion.nextPromotionDueDate,
              base_due_date: eligibility.promotion.baseDueDate || eligibility.promotion.nextPromotionDueDate,
              requiredYears: eligibility.promotion.requiredYears || 4,
              required_years: eligibility.promotion.requiredYears || 4,
              // Commendation Letters & Impact
              commendationsCount: promoCommCount,
              commendations_count: promoCommCount,
              commendationMonths: promoCommMonths,
              commendation_months: promoCommMonths,
              commendationImpactText: promoCommCount > 0 ? `${promoCommCount} كتاب شكر (تقديم ${promoCommMonths} شهر)` : 'لا يوجد',
              commendation_impact_text: promoCommCount > 0 ? `${promoCommCount} كتاب شكر (تقديم ${promoCommMonths} شهر)` : 'لا يوجد',
              // Penalties & Impact
              penaltiesCount: promoPenCount,
              penalties_count: promoPenCount,
              penaltyDelayMonths: promoPenMonths,
              penalty_delay_months: promoPenMonths,
              penaltyImpactText: promoPenCount > 0 ? `${promoPenCount} عقوبة (تأخير ${promoPenMonths} شهر)` : 'سجل نظيف',
              penalty_impact_text: promoPenCount > 0 ? `${promoPenCount} عقوبة (تأخير ${promoPenMonths} شهر)` : 'سجل نظيف',
              // Other Factors
              serviceCreditDuration: promoServiceCredit,
              service_credit_duration: promoServiceCredit,
              serviceCreditMonths: promoServiceMonths,
              service_credit_months: promoServiceMonths,
              absenceDays: promoAbsenceDays,
              absence_days: promoAbsenceDays,
              gateCheckResults: gateChecks,
              gate_check_results: gateChecks,
              governingCoursesSatisfied: gateChecks.governingCoursesSatisfied,
              evaluationsSatisfied: gateChecks.evaluationsSatisfied,
              otherFactors: promoOtherFactors,
              other_factors: promoOtherFactors,
              trackType: 'المسار_الاعتيادي',
              track_type: 'المسار_الاعتيادي',
              actionType: 'ترفيع',
              action_type: 'ترفيع',
              noGradeChange: false,
              no_grade_change: false,
              reasons: [eligibility.promotion.statusReason || 'استوفى الموظف المدة القانونية والدورات الحاكمة وتقييم الأداء']
            });
          }
        } catch (empErr: any) {
          console.warn(`[DUE_LIST_WARN] Could not process eligibility for employee ${rawEmp?.id}:`, empErr?.message || empErr);
        }
      }

      const summary = {
        totalIncrement: dueForIncrement.length,
        totalPromotion: dueForPromotion.length,
        totalSettlement: dueForSettlement.length,
        totalDue: dueForIncrement.length + dueForPromotion.length + dueForSettlement.length
      };

      res.json({
        dueForIncrement,
        dueForPromotion,
        dueForSettlement,
        due_for_increment: dueForIncrement,
        due_for_promotion: dueForPromotion,
        due_for_settlement: dueForSettlement,
        summary
      });
    } catch (err: any) {
      console.error('Error fetching promotion due list:', err);
      res.json({
        dueForIncrement: [],
        dueForPromotion: [],
        dueForSettlement: [],
        due_for_increment: [],
        due_for_promotion: [],
        due_for_settlement: [],
        summary: {
          totalIncrement: 0,
          totalPromotion: 0,
          totalSettlement: 0,
          totalDue: 0
        }
      });
    }
  });

  // 5. Batch Approval API (مسار الاعتماد الدفعي Transactional)
  app.post('/api/promotions/approve-batch', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { items, order_number, orderNumber, order_date, orderDate } = req.body;
      const finalOrderNumber = String(order_number || orderNumber || '').trim();
      const finalOrderDate = String(order_date || orderDate || '').trim();

      if (!finalOrderNumber || !finalOrderDate) {
        return res.status(400).json({ error: 'رقم الأمر الإداري وتاريخ الأمر الإداري مطلوبان لإتمام الاعتماد' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'قائمة المعاملات المحددة للاعتماد فارغة' });
      }

      const approverName = req.user?.fullName || req.user?.name || req.user?.email || 'مسؤول الموارد البشرية';

      // Phase 1: Pre-validation (Atomic verification - any invalid item rejects the whole batch)
      const validatedBatch: Array<{
        empId: number;
        emp: any;
        type: 'علاوة' | 'ترفيع' | 'تسوية';
        gradeBefore: number;
        gradeAfter: number;
        stepBefore: number;
        stepAfter: number;
        movementType: string;
        dueDate: string;
        activeSnapshot?: any;
      }> = [];
      // الموظفون في حالة «نهاية_المرحلة» أو «بيانات_ناقصة» يُتجاوزون (لا يُعتمدون ولا يُفشلون الدفعة كلها)
      const SKIP_ELIGIBILITY_STATES = new Set(['نهاية_المرحلة', 'بيانات_ناقصة']);
      const skippedItems: Array<{ employeeId: number; name: string; type: string; status: string; reason: string }> = [];

      for (const item of items) {
        const empId = parseInt(String(item.employee_id || item.employeeId));
        const rawType = String(item.type || item.actionType || item.action_type || '').trim();
        const type: 'علاوة' | 'ترفيع' | 'تسوية' = rawType.includes('علاوة') ? 'علاوة' : (rawType.includes('تسوية') ? 'تسوية' : 'ترفيع');

        if (isNaN(empId)) {
          return res.status(400).json({ error: `معرف الموظف غير صالح: ${item.employee_id}` });
        }

        // إصلاح عاجل: الموظف من القاعدة (كان من الذاكرة ← 404 لكل الموظفين بعد B2e)
        const [dbEmpRow] = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
        const emp: any = dbEmpRow ? bothCases(dbEmpRow) : null;
        if (!emp) {
          return res.status(404).json({ error: `الموظف رقم (${empId}) غير موجود بالنظام` });
        }

        const empName = emp.fullName || emp.full_name || emp.name || `موظف #${empId}`;
        const curGrade = parseInt(String(emp.grade));
        const curStep = parseInt(String(emp.step));
        if (type !== 'تسوية' && (isNaN(curGrade) || isNaN(curStep))) {
          // لا تُختلق درجة/مرحلة افتراضية: الموظف بلا درجة أو مرحلة مسجلة يُتجاوز
          skippedItems.push({ employeeId: empId, name: empName, type, status: 'بيانات_ناقصة', reason: 'الدرجة أو المرحلة غير مسجلة' });
          continue;
        }

        if (type === 'علاوة') {
          const eligibility = await triggerRecalculateEligibility(empId);
          if (SKIP_ELIGIBILITY_STATES.has(eligibility?.increment?.eligibilityStatus)) {
            skippedItems.push({ employeeId: empId, name: empName, type, status: eligibility.increment.eligibilityStatus, reason: eligibility.increment.statusReason || '' });
            continue;
          }
          if (eligibility?.increment?.eligibilityStatus !== 'مستحق_للعلاوة' || !eligibility?.increment?.isIncrementEligible) {
            const notYetDue = eligibility?.increment?.eligibilityStatus === 'مؤهل';
            return res.status(400).json({
              error: notYetDue
                ? `الموظف (${empName}) لم يحن تاريخ استحقاق علاوته بعد (${eligibility?.increment?.nextIncrementDueDate || 'غير معروف'})، فلا يُعتمد قبله`
                : `الموظف (${empName}) غير مستحق للعلاوة السنوية حالياً: ${eligibility?.increment?.statusReason || 'شروط غير مستوفاة'}`
            });
          }
          const targetStep = Math.min(11, curStep + 1);
          const calculatedDueDate = eligibility.increment.nextIncrementDueDate || finalOrderDate;

          validatedBatch.push({
            empId,
            emp,
            type: 'علاوة',
            gradeBefore: curGrade,
            gradeAfter: curGrade,
            stepBefore: curStep,
            stepAfter: targetStep,
            movementType: 'علاوة سنوية',
            dueDate: calculatedDueDate
          });
        } else if (type === 'ترفيع') {
          const eligibility = await triggerRecalculateEligibility(empId);
          if (SKIP_ELIGIBILITY_STATES.has(eligibility?.promotion?.eligibilityStatus)) {
            skippedItems.push({ employeeId: empId, name: empName, type, status: eligibility.promotion.eligibilityStatus, reason: eligibility.promotion.statusReason || '' });
            continue;
          }
          if (eligibility?.promotion?.eligibilityStatus !== 'مستحق_للترفيع' || !eligibility?.promotion?.isPromotionEligible) {
            const notYetDue = eligibility?.promotion?.eligibilityStatus === 'مؤهل';
            return res.status(400).json({
              error: notYetDue
                ? `الموظف (${empName}) لم يحن تاريخ استحقاق ترفيعه بعد (${eligibility?.promotion?.nextPromotionDueDate || 'غير معروف'})، فلا يُعتمد قبله`
                : `الموظف (${empName}) غير مستحق للترفيع الوظيفي حالياً: ${eligibility?.promotion?.statusReason || 'شروط غير مستوفاة'}`
            });
          }
          const targetGrade = Math.max(1, curGrade - 1);
          const targetStep = 1;
          const calculatedDueDate = eligibility.promotion.nextPromotionDueDate || finalOrderDate;
          const resolvedTitleObj = findMatchingJobTitleForPromotion(emp, targetGrade, jobTitlesCache.list);

          validatedBatch.push({
            empId,
            emp,
            type: 'ترفيع',
            gradeBefore: curGrade,
            gradeAfter: targetGrade,
            stepBefore: curStep,
            stepAfter: targetStep,
            movementType: 'ترفيع درجة',
            dueDate: calculatedDueDate,
            newJobTitle: resolvedTitleObj?.name || null,
            newJobTitleId: resolvedTitleObj?.id || null
          });
        } else if (type === 'تسوية') {
          const activeSnap = (genericMemoryStores['degree-track-snapshots'] || []).find(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && (s.status === 'نشط' || !s.status)
          );
          if (!activeSnap) {
            return res.status(400).json({ error: `الموظف (${empName}) ليس لديه مسار احتساب شهادة نشط للتسوية` });
          }

          const specCredits = (genericMemoryStores['specialization-credits'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empId);
          const p = (genericMemoryStores['penalties'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
          const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId).map(toEngineLeave);
          const a = (genericMemoryStores['attendance'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);

          const sim = calculateDegreeTrackSimulation(activeSnap, { specializationCredits: specCredits, penalties: p, leaves: l, attendances: a });
          if (!sim.hasDeficit || !sim.realTimeNextPromotion?.isEligible || sim.realTimeNextPromotion?.eligibilityStatus !== 'مستحق_للترفيع') {
            return res.status(400).json({
              error: `الموظف (${empName}) غير مستحق لتسوية مسار الشهادة حالياً: ${sim?.realTimeNextPromotion?.statusReason || 'شروط غير مستوفاة'}`
            });
          }

          const calculatedDueDate = sim.realTimeNextPromotion.nextPromotionDueDate || finalOrderDate;

          validatedBatch.push({
            empId,
            emp,
            type: 'تسوية',
            gradeBefore: curGrade,
            gradeAfter: curGrade, // No grade change!
            stepBefore: curStep,
            stepAfter: curStep,   // No step change!
            movementType: 'تسوية مسار الشهادات',
            dueDate: calculatedDueDate,
            activeSnapshot: activeSnap
          });
        }
      }

      if (validatedBatch.length === 0) {
        return res.status(400).json({
          error: 'لا توجد معاملة قابلة للاعتماد: جميع الموظفين المحددين في حالة «نهاية المرحلة» أو «بيانات ناقصة»',
          skippedCount: skippedItems.length,
          skipped: skippedItems
        });
      }

      // Phase 2: Transactional Execution (Apply DB + Memory updates atomically)
      let dbOffline = false;

      try {
        await db.transaction(async (tx) => {
          for (const item of validatedBatch) {
            if (item.type === 'علاوة') {
              await tx.update(schema.employees).set({
                step: item.stepAfter,
                lastIncrementDate: item.dueDate
              }).where(eq(schema.employees.id, item.empId));
            } else if (item.type === 'ترفيع') {
              await tx.update(schema.employees).set({
                grade: item.gradeAfter,
                step: item.stepAfter,
                lastPromotionDate: item.dueDate,
                ...(item.newJobTitle ? { jobTitle: item.newJobTitle, jobTitleId: item.newJobTitleId } : {})
              }).where(eq(schema.employees.id, item.empId));
            } else if (item.type === 'تسوية') {
              await tx.update(schema.employees).set({
                lastPromotionDate: item.dueDate
              }).where(eq(schema.employees.id, item.empId));

              if (item.activeSnapshot?.id) {
                await tx.update(schema.degreeTrackSnapshots).set({
                  status: 'مكتمل'
                }).where(eq(schema.degreeTrackSnapshots.id, item.activeSnapshot.id));
              }
            }

            await tx.insert(schema.promotionsIncrements).values({
              employeeId: item.empId,
              movementType: item.movementType,
              gradeBefore: String(item.gradeBefore),
              gradeAfter: String(item.gradeAfter),
              stepBefore: item.stepBefore,
              stepAfter: item.stepAfter,
              dueDate: item.dueDate,
              orderNumber: finalOrderNumber,
              orderDate: finalOrderDate,
              approvedBy: approverName,
              notes: item.type === 'تسوية' ? 'اعتماد يدوي لتسوية مسار الشهادات (تثبيت دون تغيير درجة)' : 'اعتماد يدوي عبر قائمة المستحقين'
            });
          }
        });
      } catch (dbErr: any) {
        if (isDbConnectionFailure(dbErr)) {
          console.warn('Database offline / connection failure during batch approval. Falling back to local encrypted storage:', dbErr?.message);
          dbOffline = true;
        } else {
          // Case B: Real transaction execution failure (Constraint violation, schema error, invalid data)
          console.error('CRITICAL: Batch promotion approval database transaction failed (Transaction Rolled Back):', dbErr);
          return res.status(500).json({
            error: 'فشلت عملية الاعتماد بالكامل في قاعدة البيانات، وتم التراجع عن كافة التغييرات (Rollback)',
            code: dbErr?.cause?.code || dbErr?.code
          });
        }
      }

      // Phase 3: Mirror in In-Memory Stores ONLY IF DB succeeded or DB is offline
      for (const item of validatedBatch) {
        const empIdx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === item.empId);
        if (empIdx !== -1) {
          if (item.type === 'علاوة') {
            inMemoryEmployees[empIdx].step = item.stepAfter;
            inMemoryEmployees[empIdx].lastIncrementDate = item.dueDate;
            inMemoryEmployees[empIdx].last_increment_date = item.dueDate;
          } else if (item.type === 'ترفيع') {
            inMemoryEmployees[empIdx].grade = item.gradeAfter;
            inMemoryEmployees[empIdx].step = item.stepAfter;
            inMemoryEmployees[empIdx].lastPromotionDate = item.dueDate;
            inMemoryEmployees[empIdx].last_promotion_date = item.dueDate;
            if (item.newJobTitle) {
              inMemoryEmployees[empIdx].jobTitle = item.newJobTitle;
              inMemoryEmployees[empIdx].job_title = item.newJobTitle;
              inMemoryEmployees[empIdx].jobTitleId = item.newJobTitleId;
              inMemoryEmployees[empIdx].job_title_id = item.newJobTitleId;
            }
          } else if (item.type === 'تسوية') {
            inMemoryEmployees[empIdx].lastPromotionDate = item.dueDate;
            inMemoryEmployees[empIdx].last_promotion_date = item.dueDate;
            if (item.activeSnapshot?.id) {
              const snapIdx = (genericMemoryStores['degree-track-snapshots'] || []).findIndex(s => s.id === item.activeSnapshot.id);
              if (snapIdx !== -1) {
                genericMemoryStores['degree-track-snapshots'][snapIdx].status = 'مكتمل';
              }
            }
          }
        }

        const promoId = (genericMemoryStores['promotions'] || []).length + 1;
        genericMemoryStores['promotions'].push({
          id: promoId,
          employee_id: item.empId,
          employeeId: item.empId,
          movement_type: item.movementType,
          movementType: item.movementType,
          grade_before: item.gradeBefore,
          gradeBefore: item.gradeBefore,
          grade_after: item.gradeAfter,
          gradeAfter: item.gradeAfter,
          step_before: item.stepBefore,
          stepBefore: item.stepBefore,
          step_after: item.stepAfter,
          stepAfter: item.stepAfter,
          due_date: item.dueDate,
          dueDate: item.dueDate,
          order_number: finalOrderNumber,
          orderNumber: finalOrderNumber,
          order_date: finalOrderDate,
          orderDate: finalOrderDate,
          approved_by: approverName,
          approvedBy: approverName,
          notes: item.type === 'تسوية' ? 'اعتماد يدوي لتسوية مسار الشهادات (تثبيت دون تغيير درجة)' : 'اعتماد يدوي عبر قائمة المستحقين',
          created_at: new Date().toISOString()
        });

        // Trigger eligibility recalculation for next cycle
        await triggerRecalculateEligibility(item.empId);
      }

      saveLocalDb();

      return res.json({
        success: true,
        storageMode: dbOffline ? 'local_encrypted' : 'database_and_local',
        approvedCount: validatedBatch.length,
        skippedCount: skippedItems.length,
        skipped: skippedItems,
        orderNumber: finalOrderNumber,
        orderDate: finalOrderDate,
        message: dbOffline
          ? `تم اعتماد ${validatedBatch.length} معاملة بنجاح وحفظها بالتخزين الاحتياطي المحلي المشفر (قاعدة البيانات المركزية غير متصلة) بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
          : `تم اعتماد ${validatedBatch.length} معاملة بنجاح وتحديث قاعدة البيانات المركزية بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
      });
    } catch (err: any) {
      console.error('Error in batch promotion approval:', err);
      sendRouteError(res, err);
    }
  });

  // 5. Batch Auto-Settlement Trigger
  app.post('/api/degree-track/process-auto-settlement', requireAuth, requireAdmin, async (req, res) => {
    try {
      // B3/إصلاح: كل المدخلات من القاعدة (كانت من الذاكرة الفارغة بعد B2e فلا يُسوّى أحد)
      const [crRows, empRows, snapRows, specRows, penRows, leaveRows, attRows] = await Promise.all([
        db.select().from(schema.commendationRulesSettings).limit(1),
        db.select().from(schema.employees),
        db.select().from(schema.degreeTrackSnapshots),
        db.select().from(schema.specializationCourseCredits),
        db.select().from(schema.penalties),
        db.select().from(schema.leaveRequests),
        db.select().from(schema.attendance),
      ]);
      const isAutoEnabled = crRows[0] ? Boolean(crRows[0].degreeTrackAutoSettlement) :
        (settingsLists.getCommendationRulesSettings().degreeTrackAutoSettlement === true || settingsLists.getCommendationRulesSettings().degree_track_auto_settlement === true);

      const batchResult = processBatchDegreeTrackAutoSettlement(
        empRows.map(bothCases),
        snapRows.map(bothCases) as any,
        {
          specializationCredits: specRows.map(bothCases),
          penalties: penRows.map(bothCases),
          leaves: leaveRows.map(bothCases).map(toEngineLeave),
          attendances: attRows.map(bothCases),
          penaltyTypes: await loadPenaltyTypesForEngine()
        },
        {
          autoSettlementEnabled: isAutoEnabled
        }
      );

      for (const item of batchResult.results) {
        if (item.settled && item.updatedEmployee && item.approvalRecord) {
          const empId = parseInt(String(item.employeeId));
          const empIdx = inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empId);
          if (empIdx !== -1) {
            inMemoryEmployees[empIdx].lastPromotionDate = item.updatedEmployee.lastPromotionDate;
            inMemoryEmployees[empIdx].last_promotion_date = item.updatedEmployee.lastPromotionDate;
          }

          const snapIdx = (genericMemoryStores['degree-track-snapshots'] || []).findIndex(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && s.status === 'نشط'
          );
          if (snapIdx !== -1) {
            genericMemoryStores['degree-track-snapshots'][snapIdx].status = 'مكتمل';
          }

          const newPromoId = (genericMemoryStores['promotions'] || []).length + 1;
          genericMemoryStores['promotions'].push({
            id: newPromoId,
            employee_id: empId,
            employeeId: empId,
            movement_type: item.approvalRecord.movementType,
            movementType: item.approvalRecord.movementType,
            grade_before: item.approvalRecord.gradeBefore,
            gradeBefore: item.approvalRecord.gradeBefore,
            grade_after: item.approvalRecord.gradeAfter,
            gradeAfter: item.approvalRecord.gradeAfter,
            step_before: item.approvalRecord.stepBefore,
            stepBefore: item.approvalRecord.stepBefore,
            step_after: item.approvalRecord.stepAfter,
            stepAfter: item.approvalRecord.stepAfter,
            due_date: item.approvalRecord.dueDate,
            dueDate: item.approvalRecord.dueDate,
            order_number: null,
            orderNumber: null,
            order_date: item.approvalRecord.orderDate,
            orderDate: item.approvalRecord.orderDate,
            approved_by: 'نظام آلي — تسوية تلقائية',
            approvedBy: 'نظام آلي — تسوية تلقائية',
            notes: item.approvalRecord.notes,
            created_at: new Date().toISOString()
          });

          try {
            await db.update(schema.employees)
              .set({ lastPromotionDate: item.updatedEmployee.lastPromotionDate })
              .where(eq(schema.employees.id, empId));
            await db.update(schema.degreeTrackSnapshots)
              .set({ status: 'مكتمل' })
              .where(eq(schema.degreeTrackSnapshots.employeeId, empId));
            await db.insert(schema.promotionsIncrements).values({
              employeeId: empId,
              movementType: item.approvalRecord.movementType,
              gradeBefore: String(item.approvalRecord.gradeBefore),
              gradeAfter: String(item.approvalRecord.gradeAfter),
              stepBefore: item.approvalRecord.stepBefore,
              stepAfter: item.approvalRecord.stepAfter,
              dueDate: item.approvalRecord.dueDate,
              orderNumber: null,
              orderDate: item.approvalRecord.orderDate,
              approvedBy: 'نظام آلي — تسوية تلقائية',
              notes: item.approvalRecord.notes
            });
          } catch (e) {}
        }
      }

      saveLocalDb();
      res.json(batchResult);
    } catch (err: any) {
      console.error('Error in batch auto settlement:', err);
      sendRouteError(res, err);
    }
  });

  // --- Promotion Delay Reasons & Reminders API (Phase 4: Transparency & Reminders) ---

  // 1. Get Delay Reasons for Employee
  app.get('/api/promotion-delay-reasons/employee/:id', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      if (isNaN(empId)) return res.status(400).json({ error: 'معرّف الموظف غير صالح' });

      // Always trigger a fresh recalculation to ensure delay reasons match latest status
      await triggerRecalculateEligibility(empId);

      // إصلاح عاجل: الأسباب من القاعدة (كانت من الذاكرة ← قائمة فارغة بعد B2e)
      const store: any[] = await db.select().from(schema.promotionDelayReasons).where(eq(schema.promotionDelayReasons.employeeId, empId));
      const employeeReasons = store
        .filter((item: any) => parseInt(String(item.employeeId || item.employee_id)) === empId)
        .map(item => ({
          ...mapKeys(item, camelToSnake),
          ...item,
          id: item.id,
          employeeId: parseInt(String(item.employeeId || item.employee_id)),
          employee_id: parseInt(String(item.employeeId || item.employee_id)),
          reasonType: item.reasonType || item.reason_type,
          reason_type: item.reasonType || item.reason_type,
          description: item.description,
          affects: item.affects,
          isHidden: Boolean(item.isHidden ?? item.is_hidden),
          is_hidden: Boolean(item.isHidden ?? item.is_hidden),
          reminderDate: item.reminderDate || item.reminder_date || null,
          reminder_date: item.reminderDate || item.reminder_date || null,
          isAutoReminder: Boolean(item.isAutoReminder ?? item.is_auto_reminder),
          is_auto_reminder: Boolean(item.isAutoReminder ?? item.is_auto_reminder),
          isResolved: Boolean(item.isResolved ?? item.is_resolved),
          is_resolved: Boolean(item.isResolved ?? item.is_resolved),
          resolvedAt: item.resolvedAt || item.resolved_at || null,
          resolved_at: item.resolvedAt || item.resolved_at || null,
          sourceReferenceId: item.sourceReferenceId || item.source_reference_id || null,
          source_reference_id: item.sourceReferenceId || item.source_reference_id || null,
        }));

      res.json(employeeReasons);
    } catch (err: any) {
      console.error('Error fetching employee delay reasons:', err);
      sendRouteError(res, err);
    }
  });

  // 2. Toggle or set isHidden for a delay reason
  app.patch('/api/promotion-delay-reasons/:id/hide', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });

      const isHidden = req.body.is_hidden !== undefined
        ? Boolean(req.body.is_hidden)
        : (req.body.isHidden !== undefined ? Boolean(req.body.isHidden) : true);

      const store = genericMemoryStores['promotion-delay-reasons'] || inMemoryPromotionDelayReasons || [];
      const idx = store.findIndex(item => parseInt(String(item.id)) === id);
      if (idx !== -1) {
        store[idx].isHidden = isHidden;
        store[idx].is_hidden = isHidden;
        store[idx].updatedAt = new Date().toISOString();
        store[idx].updated_at = new Date().toISOString();
      }

      try {
        await db.update(schema.promotionDelayReasons).set({
          isHidden,
          updatedAt: new Date()
        }).where(eq(schema.promotionDelayReasons.id, id));
      } catch (e) { return sendRouteError(res, e, 'حفظ سبب التأخير'); }

      saveLocalDb();
      res.json({ success: true, isHidden, id });
    } catch (err: any) {
      console.error('Error updating delay reason visibility:', err);
      sendRouteError(res, err);
    }
  });

  // 3. Update reminderDate manually
  app.patch('/api/promotion-delay-reasons/:id/reminder', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });

      const reminderDate = String(req.body.reminder_date || req.body.reminderDate || '').trim() || null;

      const store = genericMemoryStores['promotion-delay-reasons'] || inMemoryPromotionDelayReasons || [];
      const idx = store.findIndex(item => parseInt(String(item.id)) === id);
      if (idx !== -1) {
        store[idx].reminderDate = reminderDate;
        store[idx].reminder_date = reminderDate;
        store[idx].isAutoReminder = false;
        store[idx].is_auto_reminder = false;
        store[idx].updatedAt = new Date().toISOString();
        store[idx].updated_at = new Date().toISOString();
      }

      try {
        await db.update(schema.promotionDelayReasons).set({
          reminderDate,
          isAutoReminder: false,
          updatedAt: new Date()
        }).where(eq(schema.promotionDelayReasons.id, id));
      } catch (e) { return sendRouteError(res, e, 'حفظ سبب التأخير'); }

      saveLocalDb();
      res.json({ success: true, reminderDate, isAutoReminder: false, id });
    } catch (err: any) {
      console.error('Error updating delay reason reminder date:', err);
      sendRouteError(res, err);
    }
  });

  // 4. Get Due Reminders for Dashboard (reminderDate <= today and isResolved = false and isHidden = false)
  app.get('/api/promotion-delay-reasons/due-reminders', requireAuth, async (req, res) => {
    try {
      const today = formatDateString(new Date());
      // إصلاح عاجل: من القاعدة (كانت من الذاكرة ← لوحة التذكيرات فارغة بعد B2e)
      const store: any[] = await db.select().from(schema.promotionDelayReasons)
        .where(and(sql`${schema.promotionDelayReasons.isHidden} IS NOT TRUE`, sql`${schema.promotionDelayReasons.isResolved} IS NOT TRUE`, isNotNull(schema.promotionDelayReasons.reminderDate)));
      const reminderEmpIds = [...new Set(store.map((r: any) => r.employeeId).filter(Boolean))] as number[];
      const reminderEmps = reminderEmpIds.length ? await db.select().from(schema.employees).where(inArray(schema.employees.id, reminderEmpIds)) : [];
      const empById = new Map(reminderEmps.map((e: any) => [e.id, e]));

      const dueItems: any[] = [];

      for (const item of store) {
        try {
          if (!item) continue;
          const isHidden = item.isHidden === true || item.is_hidden === true;
          const isResolved = item.isResolved === true || item.is_resolved === true;
          const rDate = item.reminderDate || item.reminder_date;
          if (isHidden || isResolved || !rDate) continue;
          if (!isDateOnOrAfter(today, rDate)) continue;

          const empId = parseInt(String(item.employeeId || item.employee_id));
          const emp: any = empById.get(empId);

          dueItems.push({
            ...item,
            id: item.id,
            employeeId: empId,
            employee_id: empId,
            employeeName: emp?.fullName || emp?.full_name || emp?.name || `موظف #${empId}`,
            jobTitle: emp?.jobTitle || emp?.job_title || '—',
            department: emp?.department || '—',
            grade: emp?.grade || '—',
            step: emp?.step || '—',
            reasonType: item.reasonType || item.reason_type,
            reason_type: item.reasonType || item.reason_type,
            description: item.description || '',
            affects: item.affects || 'ترقية',
            reminderDate: item.reminderDate || item.reminder_date,
            reminder_date: item.reminderDate || item.reminder_date,
            isAutoReminder: item.isAutoReminder ?? item.is_auto_reminder ?? true,
            is_auto_reminder: item.isAutoReminder ?? item.is_auto_reminder ?? true,
          });
        } catch (itemErr) {
          console.warn('[DUE_REMINDERS_WARN] Error processing item:', itemErr);
        }
      }

      const summaryByType = {
        'دورة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'دورة').length,
        'عقوبة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'عقوبة').length,
        'اجازة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'اجازة').length,
        'تقييم': dueItems.filter(i => (i.reasonType || i.reason_type) === 'تقييم').length,
        'غياب': dueItems.filter(i => (i.reasonType || i.reason_type) === 'غياب').length,
      };

      res.json({
        reminders: dueItems,
        totalDue: dueItems.length,
        summaryByType
      });
    } catch (err: any) {
      console.error('Error fetching due reminders:', err);
      res.json({
        reminders: [],
        totalDue: 0,
        summaryByType: { 'دورة': 0, 'عقوبة': 0, 'اجازة': 0, 'تقييم': 0, 'غياب': 0 }
      });
    }
  });

  // --- Vite & Asset Serving Middleware ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // B3: جرد المسارات بترتيب تسجيلها (لاختبار server/routeInventory.test.ts). لا يشغّل الخادم.
  if (process.env.ROUTE_INVENTORY_OUT) {
    fs.writeFileSync(process.env.ROUTE_INVENTORY_OUT, routeRegistry.inventory().join('\n') + '\n', 'utf8');
    process.exit(0);
  }

  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await seedAdminUser();
  });
}

startServer();
