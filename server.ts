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
import { registerCareerHistoryRoutes } from './server/routes/careerHistory.ts';
import { registerSalaryScaleRoutes } from './server/routes/salaryScale.ts';
import { registerSharedSettingsRoutes } from './server/routes/sharedSettings.ts';
import { registerOfficialHolidaysRoutes } from './server/routes/officialHolidays.ts';
import { registerPayrollRoutes } from './server/routes/payroll.ts';
import { registerPayrollPeriodRoutes } from './server/routes/payrollPeriods.ts';
import { registerPayrollStateRoutes } from './server/routes/payrollStates.ts';
import { registerRoleRoutes, loadRoles } from './server/routes/roles.ts';
import { registerPayrollReconcileRoutes } from './server/routes/payrollReconcile.ts';
import { createRequestAudit } from './server/requestAudit.ts';
import { startDueMovementsJob } from './server/careerMovements.ts';
import { registerAnnualPlanRoutes } from './server/routes/annualPlans.ts';
import { registerSalaryRoutes } from './server/routes/salaries.ts';
import { registerAttendanceRoutes } from './server/routes/attendance.ts';
import { registerOrgUnitRoutes } from './server/routes/orgUnits.ts';
import { registerSettingsListRoutes } from './server/routes/settingsLists.ts';
import { registerSettingsRoutes } from './server/routes/legacy/settings.ts';
import { registerLogsRoutes } from './server/routes/legacy/logs.ts';
import { registerAuthRoutes } from './server/routes/legacy/auth.ts';
import { registerAuth2Routes } from './server/routes/legacy/auth2.ts';
import { registerAdminRoutes } from './server/routes/legacy/admin.ts';
import { registerEmployeesRoutes } from './server/routes/legacy/employees.ts';
import { registerEmployees2Routes } from './server/routes/legacy/employees2.ts';
import { registerArchiveRoutes } from './server/routes/legacy/archive.ts';
import { registerLeavesRoutes } from './server/routes/legacy/leaves.ts';
import { registerLeaves2Routes } from './server/routes/legacy/leaves2.ts';
import { registerTrainingsRoutes } from './server/routes/legacy/trainings.ts';
import { registerQualificationsRoutes } from './server/routes/legacy/qualifications.ts';
import { registerGoverningCoursesRoutes } from './server/routes/legacy/governingCourses.ts';
import { registerGoverningCourses2Routes } from './server/routes/legacy/governingCourses2.ts';
import { registerGoverningCourses3Routes } from './server/routes/legacy/governingCourses3.ts';
import { registerGoverningCourses4Routes } from './server/routes/legacy/governingCourses4.ts';
import { registerGenericEntitiesRoutes } from './server/routes/legacy/genericEntities.ts';
import { registerPromotionsRoutes } from './server/routes/legacy/promotions.ts';
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
import { createSingleFlightCache } from './server/singleFlightCache.ts';
import { createStatusRegistry, dbStatusLoader } from './server/statusRegistry.ts';
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
  // B9: سجل تدقيق لكل عملية كتابة (بعد انتهاء الرد، بالمستخدم الذي حدده requireAuth)
  app.use('/api', createRequestAudit(row => db.insert(schema.requestAudit).values(row)));
  // أداء: قائمة المستحقين تُحسب مرة وتُحفظ دقيقتين؛ أي كتابة ناجحة تبطلها
  const dueListCache = createSingleFlightCache<any>({ ttlMs: 120_000 });
  // تسخين: أول احتساب بعد الإقلاع بالخلفية، فأول فتح للوحة التحكم ما ينتظر
  setTimeout(() => { dueListCache.get().catch(() => {}); }, 15_000).unref?.();
  app.use('/api', function invalidateDueListOnWrite(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        dueListCache.invalidate();
        // B7: تغيير قواعد الاستحقاق (أنواع الشكر وسقفها، أنواع العقوبات) يعيد احتساب الكل بالخلفية فتتحدث التواريخ المخزونة
        if (/^\/(commendation-types|commendation-rules-settings|penalty-types)(\/|$)/.test(req.path)) {
          setTimeout(() => { dueListCache.get().catch(() => {}); }, 1_000).unref?.();
        }
      });
    }
    next();
  });

  // B3: سياق مسارات المجالات المنقولة إلى server/routes/
  // B4a (ق-14): معنى حالات الموظف من القاعدة
  const statusRegistry = createStatusRegistry(dbStatusLoader(db, schema));
  const routeCtx: RouteContext = { db, schema, pool, requireAuth, requireWriter, requireAdmin, sendRouteError, respondIfDbWriteError, statusRegistry };

  // System Settings Store & API
  // B3: كل الحالة المشتركة القابلة لإعادة الإسناد (كانت 32 «let») في كائن واحد يُمرَّر إلى الوحدات.
  // أغلبها مخازن ذاكرة قديمة تُحذف مع تنظيف كل مجال؛ القاعدة هي المصدر الوحيد للبيانات (B2).
  const mem: Record<string, any> = {};
  mem.systemSettingsStore = {
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
  mem.leaveAccrualLogs = [];

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
        mem.systemSettingsStore = { ...mem.systemSettingsStore, ...dbSettings };
      }
    } catch (settingsErr) {
      if (!isDbConnectionFailure(settingsErr)) throw settingsErr;
      dbAvailable = false;
    }

    const params = resolveAccrualParams(mem.systemSettingsStore);
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
          const upd = await client.query(ACCRUAL_UPDATE_SQL, [params.regularDays, params.regularCap, params.sickDays, params.sickCap, await statusRegistry.namesWhere('accruesLeave'), await statusRegistry.emptyStatusHas('accruesLeave')]);
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

    mem.systemSettingsStore.lastLeaveAccrualMonth = currentMonth;
    mem.systemSettingsStore.lastLeaveAccrualDate = accrualDate;

    const logEntry = {
      id: mem.leaveAccrualLogs.length + 1,
      month: currentMonth,
      employeesCount: processedCount,
      regularDaysAdded: params.regularDays,
      sickDaysAdded: params.sickDays,
      timestamp: accrualDate,
      triggeredBy,
      status: dbAvailable ? 'ناجح' : 'ناجح (تخزين احتياطي - بلا اتصال)'
    };
    mem.leaveAccrualLogs.unshift(logEntry);

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

  // System Logs Store & API
  const systemLogsStore: any[] = [];

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

  // Users Management API
  const BCRYPT_HASH_RE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
  mem.inMemoryUsers = [
    {
      id: 1,
      username: 'admin',
      name: 'مدير النظام الافتراضي (Admin)',
      role: 'admin',
      email: 'admin@hr.gov.iq',
      created_at: new Date().toISOString()
    }
  ];

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
  mem.inMemoryQualifications = [];
  mem.inMemoryJobAssignments = [
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
  mem.inMemoryCareerHistories = [];
  mem.inMemoryPromotions = [];
  mem.inMemorySalaryAllowances = [];
  mem.inMemoryAnnualEvaluations = [];
  mem.inMemoryTrainingCourses = [];
  mem.inMemoryTransfers = [];
  mem.inMemoryRetirements = [];
  mem.inMemoryDocuments = [];
  mem.inMemoryLeaves = [];
  mem.inMemoryPenalties = [];
  mem.inMemoryAppreciations = [];
  mem.inMemoryPerformanceEvaluations = [];
  mem.inMemoryPromotionDelayReasons = [];
  mem.inMemoryDegreeTrackSnapshots = [];
  mem.inMemoryDegreeTrackSimulationSteps = [];
  mem.inMemorySpecializationCredits = [];
  mem.inMemoryServiceRecords = [];
  mem.inMemoryServiceCredits = [];

  const genericMemoryStores: Record<string, any[]> = {
    'career': mem.inMemoryCareerHistories,
    'job-assignments': mem.inMemoryJobAssignments,
    'qualifications': mem.inMemoryQualifications,
    'promotions': mem.inMemoryPromotions,
    'salary-allowances': mem.inMemorySalaryAllowances,
    'annual-evaluations': mem.inMemoryAnnualEvaluations,
    'training-courses': mem.inMemoryTrainingCourses,
    'transfers': mem.inMemoryTransfers,
    'retirements': mem.inMemoryRetirements,
    'documents': mem.inMemoryDocuments,
    'service-records': mem.inMemoryServiceRecords,
    'service-credits': mem.inMemoryServiceCredits,
    'leaves': mem.inMemoryLeaves,
    'penalties': mem.inMemoryPenalties,
    'appreciations': mem.inMemoryAppreciations,
    'performance': mem.inMemoryPerformanceEvaluations,
    'degree-track-snapshots': mem.inMemoryDegreeTrackSnapshots,
    'degree-track-simulation-steps': mem.inMemoryDegreeTrackSimulationSteps,
    'specialization-credits': mem.inMemorySpecializationCredits,
    'promotion-delay-reasons': mem.inMemoryPromotionDelayReasons,
    'promotion_delay_reasons': mem.inMemoryPromotionDelayReasons
  };

  function syncEmployeeRecord(emp: any, action: 'insert' | 'update' | 'delete') {
    if (!emp) return;
    const empId = parseInt(String(emp.id));
    if (isNaN(empId)) return;

    if (action === 'delete') {
      mem.inMemoryEmployees = mem.inMemoryEmployees.filter((e: any) => parseInt(String(e.id)) !== empId);
    } else if (action === 'update') {
      const idx = mem.inMemoryEmployees.findIndex((e: any) => parseInt(String(e.id)) === empId);
      if (idx !== -1) {
        mem.inMemoryEmployees[idx] = { ...mem.inMemoryEmployees[idx], ...emp, id: empId, updatedAt: new Date().toISOString(), updated_at: new Date().toISOString() };
      } else {
        mem.inMemoryEmployees.push({ ...emp, id: empId });
      }
    } else if (action === 'insert') {
      const idx = mem.inMemoryEmployees.findIndex((e: any) => parseInt(String(e.id)) === empId);
      if (idx !== -1) {
        mem.inMemoryEmployees[idx] = { ...mem.inMemoryEmployees[idx], ...emp, id: empId };
      } else {
        mem.inMemoryEmployees.push({ ...emp, id: empId });
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
    if (endpoint === 'qualifications') mem.inMemoryQualifications = genericMemoryStores['qualifications'];
    if (endpoint === 'job-assignments') mem.inMemoryJobAssignments = genericMemoryStores['job-assignments'];
    if (endpoint === 'promotions') mem.inMemoryPromotions = genericMemoryStores['promotions'];
    if (endpoint === 'salary-allowances') mem.inMemorySalaryAllowances = genericMemoryStores['salary-allowances'];
    if (endpoint === 'annual-evaluations') mem.inMemoryAnnualEvaluations = genericMemoryStores['annual-evaluations'];
    if (endpoint === 'training-courses') mem.inMemoryTrainingCourses = genericMemoryStores['training-courses'];
    if (endpoint === 'transfers') mem.inMemoryTransfers = genericMemoryStores['transfers'];
    if (endpoint === 'retirements') mem.inMemoryRetirements = genericMemoryStores['retirements'];
    if (endpoint === 'documents') mem.inMemoryDocuments = genericMemoryStores['documents'];
    if (endpoint === 'service-records') mem.inMemoryServiceRecords = genericMemoryStores['service-records'];
    if (endpoint === 'service-credits') mem.inMemoryServiceCredits = genericMemoryStores['service-credits'];
    if (endpoint === 'leaves') mem.inMemoryLeaves = genericMemoryStores['leaves'];
    if (endpoint === 'penalties') mem.inMemoryPenalties = genericMemoryStores['penalties'];
    if (endpoint === 'appreciations') mem.inMemoryAppreciations = genericMemoryStores['appreciations'];
    if (endpoint === 'performance') mem.inMemoryPerformanceEvaluations = genericMemoryStores['performance'];
    if (endpoint === 'career') mem.inMemoryCareerHistories = genericMemoryStores['career'];
    if (endpoint === 'degree-track-snapshots') mem.inMemoryDegreeTrackSnapshots = genericMemoryStores['degree-track-snapshots'];
    if (endpoint === 'degree-track-simulation-steps') mem.inMemoryDegreeTrackSimulationSteps = genericMemoryStores['degree-track-simulation-steps'];
    if (endpoint === 'specialization-credits') mem.inMemorySpecializationCredits = genericMemoryStores['specialization-credits'];
    if (endpoint === 'promotion-delay-reasons' || endpoint === 'promotion_delay_reasons') {
      mem.inMemoryPromotionDelayReasons = genericMemoryStores['promotion-delay-reasons'];
      genericMemoryStores['promotion_delay_reasons'] = mem.inMemoryPromotionDelayReasons;
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
      genericMemoryStores['qualifications'] = genericMemoryStores['qualifications'] || mem.inMemoryQualifications;
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
      mem.inMemoryQualifications = store;
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
    // B8a1: نمط الاستحقاق العائلي يتغير بعملية معتمدة فقط (/api/payroll/family/:id/mode)
    delete clean.familyMode;
    // B8a0: النص الفارغ بعمود رقمي أو منطقي = فارغ (الاستمارة ترسل '' لحقل رواتب ما مسجل)
    for (const [k, col] of Object.entries(getTableColumns(schema.employees)) as any[]) {
      if (clean[k] === '' && ['PgInteger', 'PgReal', 'PgBoolean', 'PgSerial', 'PgNumeric'].includes(col?.columnType)) clean[k] = null;
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
    const memMatch = mem.inMemoryEmployees.find(e => {
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
    const memMatch = mem.inMemoryEmployees.find(e => {
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
    return mem.inMemoryEmployees.find(e => {
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
    const memMatch = mem.inMemoryEmployees.find(e => {
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
    collectFrom(mem.inMemoryEmployees);

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
  mem.inMemoryEmployees = [];

  // B8a0: opts.effectiveDate يؤرخ تغيّر الحقول المتتبعة بالسجل (مثل تاريخ كتاب احتساب الشهادة) بدل يوم الإدخال
  async function updateEmployeeCentralRecord(employeeId: number, partialData: any, opts: { effectiveDate?: string | null; reason?: string | null; user?: string | null } = {}) {
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
        const eff = /^\d{4}-\d{2}-\d{2}/.test(String(opts.effectiveDate || '')) ? String(opts.effectiveDate).slice(0, 10) : '';
        await db.transaction(async (tx: any) => {
          await tx.execute(sql`SELECT set_config('hr.effective_date', ${eff}, true), set_config('hr.reason', ${String(opts.reason || '')}, true), set_config('hr.user', ${String(opts.user || '')}, true)`);
          await tx.update(schema.employees).set(dbPayload).where(eq(schema.employees.id, employeeId));
        });
      }
    } catch (e) {
      console.error('Error updating central employee in DB:', e);
      throw e;
    }

    // Also update in-memory employee record
    const idx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === employeeId);
    if (idx !== -1) {
      const current = mem.inMemoryEmployees[idx];
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
      mem.inMemoryEmployees[idx] = updated;
      saveLocalDb();
    }
  }

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
      { label: 'طلبات إجازة', table: schema.leaveRequests, column: schema.leaveRequests.employeeId, memArray: mem.inMemoryLeaves },
      { label: 'عقوبات إدارية', table: schema.penalties, column: schema.penalties.employeeId, memArray: mem.inMemoryPenalties },
      { label: 'كتب شكر وتقدير', table: schema.appreciations, column: schema.appreciations.employeeId, memArray: mem.inMemoryAppreciations },
      { label: 'تقييمات أداء سنوية', table: schema.performanceEvaluations, column: schema.performanceEvaluations.employeeId, memArray: mem.inMemoryPerformanceEvaluations },
      { label: 'مؤهلات دراسية', table: schema.qualifications, column: schema.qualifications.employeeId, memArray: mem.inMemoryQualifications },
      { label: 'سجلات تكليف وظيفي', table: schema.jobAssignments, column: schema.jobAssignments.employeeId, memArray: mem.inMemoryJobAssignments },
      { label: 'سجلات تنقلات', table: schema.transfers, column: schema.transfers.employeeId, memArray: mem.inMemoryTransfers },
      { label: 'سجلات تقاعد', table: schema.retirements, column: schema.retirements.employeeId, memArray: mem.inMemoryRetirements },
      { label: 'مستندات ومرفقات', table: schema.documents, column: schema.documents.employeeId, memArray: mem.inMemoryDocuments },
      { label: 'سجلات احتساب خدمة / تمديد', table: schema.serviceRecords, column: schema.serviceRecords.employeeId, memArray: mem.inMemoryServiceRecords },
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

  // Leave Requests API
  // الحالة موحّدة: معلق / معتمد / مرفوض / ملغى (انظر server/leaveStatus.ts)؛ القيم القديمة
  // («مقبولة»، «موافق_عليها»، approved...) تُقرأ كـ«معتمد» وتُعاد بالقيمة الموحدة.
  const presentLeave = (r: any) => {
    const out = mapKeys(r, camelToSnake);
    if (out && out.status !== undefined) out.status = normalizeLeaveStatus(out.status);
    return out;
  };

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
  mem.inMemoryTrainings = [];
  mem.inMemoryEnrollments = [];
  mem.inMemoryAttendance = [];

  // B3: getExistingColumns نُقلت إلى server/util/dbColumns.ts
  const getExistingColumns = (tableName: string) => getExistingColumnsFrom(pool, tableName);

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
  // B8a0: الشهادة النافذة تتأرخ بتاريخ كتاب الاحتساب (أو التخرج) لا بيوم الإدخال
  async function syncEmployeeEducationQualification(employeeId: number, opts: { user?: string | null; reason?: string | null } = {}) {
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
        const memActive = mem.inMemoryQualifications
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
        }, {
          effectiveDate: latestActive.equationDate || latestActive.equation_date || latestActive.graduationDate || latestActive.graduation_date || null,
          reason: opts.reason || 'مزامنة الشهادة النافذة', user: opts.user || null,
        });
      } else {
        await updateEmployeeCentralRecord(employeeId, {
          educationLevel: 'بدون',
          education_level: 'بدون',
          educationOrder: '',
          education_order: '',
          evaluationOrder: '',
          evaluation_order: '',
        }, { reason: opts.reason || 'لا شهادة فعّالة', user: opts.user || null });
      }
    } catch (err) {
      console.error('Error syncing employee education qualification:', err);
    }
  }


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

  mem.inMemoryGoverningCourses = DEFAULT_GOVERNING_COURSES.map((item, idx) => ({
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

  // --- Governing Course Exemption Rules & Employee Assignments ---
  mem.inMemoryExemptionRules = {
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

  mem.inMemoryEmployeeAssignments = {};

  // --- Promotion Paths & Required Governing Courses Matrix ---
  mem.inMemoryPromotionPathsMatrix = [
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

  // --- Grade Requirements for Promotion Training Packs (تصنيفات وساعات وأيام الحتميات للدرجات) ---
  mem.inMemoryGradeRequirements = {
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
    if (dbSettings) mem.systemSettingsStore = { ...mem.systemSettingsStore, ...dbSettings };
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
    if (mem.systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
      executeMonthlyLeaveAccrual().catch((accErr: any) => console.error('[LEAVE-ACCRUAL] فشل الترحيل الشهري التلقائي:', accErr?.message || accErr));
    }
  }, 3000);
  setInterval(() => {
    if (mem.systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
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

  // أداء (لوحة التحكم): opts.penaltyTypes يُحمَّل مرة واحدة للحساب الجماعي بدل استعلام لكل موظف
  // أداء: كتابة تواريخ الاستحقاق المتغيرة بمعاملة واحدة (دفعات 500)
  async function writeDueDatesBulk(rows: Array<{ id: number; nextPromotionDueDate: any; nextIncrementDueDate: any }>) {
    if (rows.length === 0) return 0;
    const txt = (v: any) => (v === null || v === undefined || v === '' ? null : String(v));
    await db.transaction(async (tx: any) => {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const values = sql.join(chunk.map(r => sql`(${r.id}::int, ${txt(r.nextPromotionDueDate)}::text, ${txt(r.nextIncrementDueDate)}::text)`), sql`, `);
        await tx.execute(sql`UPDATE employees AS e SET next_promotion_due_date = v.p, next_increment_due_date = v.i
          FROM (VALUES ${values}) AS v(id, p, i) WHERE e.id = v.id`);
      }
    });
    return rows.length;
  }

  async function triggerRecalculateEligibility(employeeId: number | string, preloaded?: LoadedEngineContext, opts: { penaltyTypes?: any[] | undefined; penaltyTypesLoaded?: boolean; collectDueDateWrites?: Array<{ id: number; nextPromotionDueDate: any; nextIncrementDueDate: any }> } = {}) {
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
      governingCourses: loaded.governingCourses.length ? loaded.governingCourses : mem.inMemoryGoverningCourses,
      governingAssignments: loaded.governingAssignments,
      // قواعد الترفيع: من القاعدة؛ إن كانت فارغة فالقواعد القانونية الافتراضية
      gradeRules: loaded.gradeRules.length ? loaded.gradeRules : settingsLists.getGradePromotionRulesDefaults(),
      // أنواع العقوبات من الإعدادات (جدول penalty_types) بدل الجدول الثابت في المحرك
      penaltyTypes: opts.penaltyTypesLoaded ? opts.penaltyTypes : await loadPenaltyTypesForEngine(),
      weeksPerPromotion: loaded.weeksPerPromotion, // B6 (ق-13)
      commendationTypes: loaded.commendationTypes, // B7 (ق-9)
      commendationMaxPerYear: commendationRulesNow?.maxPerYear ?? (commendationRulesNow as any)?.max_per_year ?? 3,
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
          attendances,
          weeksPerPromotion: loaded?.weeksPerPromotion, // B6 (ق-13)
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
            const updatedEmpMemIdx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empIdNum);
            if (updatedEmpMemIdx !== -1) {
              mem.inMemoryEmployees[updatedEmpMemIdx].lastPromotionDate = settlementDate;
              mem.inMemoryEmployees[updatedEmpMemIdx].last_promotion_date = settlementDate;
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

    const memIdx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empIdNum);
    if (memIdx !== -1) {
      mem.inMemoryEmployees[memIdx] = {
        ...mem.inMemoryEmployees[memIdx],
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

    // أداء: الكتابة فقط إذا تغيّر التاريخ (كانت تكتب لكل موظف بكل فتح للوحة التحكم)
    const sameDate = (a: any, b: any) => String(a ?? '') === String(b ?? '');
    if ((!sameDate(emp.nextPromotionDueDate, promoDue) || !sameDate(emp.nextIncrementDueDate, incrDue)) && opts.collectDueDateWrites) {
      // أداء: الاحتساب الجماعي يجمع التحديثات ويكتبها بمعاملة واحدة بدل كتابة لكل موظف
      opts.collectDueDateWrites.push({ id: empIdNum, nextPromotionDueDate: promoDue, nextIncrementDueDate: incrDue });
    } else if (!sameDate(emp.nextPromotionDueDate, promoDue) || !sameDate(emp.nextIncrementDueDate, incrDue)) {
      try {
        await db.update(schema.employees)
          .set({
            nextPromotionDueDate: promoDue,
            nextIncrementDueDate: incrDue,
          })
          .where(eq(schema.employees.id, empIdNum));
      } catch (e) {}
    }

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

  // ===== B3: تسجيل كل مسارات المجالات بترتيبها الأصلي (بعد تعريف كل المساعدات: لا TDZ) =====
  registerSettingsRoutes(app, { db, eq, executeMonthlyLeaveAccrual, isDbConnectionFailure, mem, pool, requireAdmin, requireAuth, resolveAccrualParams, respondIfDbWriteError, saveLocalDb, schema, sendRouteError });
  registerLogsRoutes(app, { db, desc, requireAuth, requireWriter, saveLocalDb, schema, systemLogsStore });
  registerAuthRoutes(app, { MAX_ACCOUNT_FAILURES, MAX_IP_FAILURES, bcrypt, db, eq, getJwtSecret, getRateLimitRecord, jwt, loginFailuresMap, recordLoginFailure, requireAuth, schema, sendRouteError });
  registerAuth2Routes(app, { BCRYPT_HASH_RE, asc, bcrypt, db, eq, mem, requireAdmin, requireAuth, respondIfDbWriteError, schema, sendRouteError });
  registerAdminRoutes(app, { getMigrationStatus, getSchemaHealth, requireAdmin, requireAuth });
  registerEmployeesRoutes(app, { EMPLOYEE_SORT_COLUMNS, SALARY_TABLE, and, asc, bothCases, buildEmployeeFilterConditions, camelToSnake, checkJobTitleInDirectory, classifyDbError, db, desc, enhanceEmployeeRecord, eq, findEmployeeByCivilServiceNumber, findEmployeeByCompanyNumber, findEmployeeByServiceRecordNumber, generateUniqueEmployeeIdNumber, isDbConnectionFailure, mapKeys, mem, normalizeEmployeePayload, normalizeJobTitleName, processEmployeeEducationData, processEmployeeNameData, requireAdmin, requireAuth, requireWriter, respondIfDbWriteError, sanitizeEmployeeData, saveLocalDb, schema, sendRouteError, snakeToCamel, sqlCount, syncEmployeeQualificationFromEmployee, syncEmployeeRecord, validateCompanyNumberFormat, validateEmployeeImportRow });
  registerEmployees2Routes(app, { EMPLOYEE_CASCADE_TABLES, buildEmployeeCascadeSnapshot, camelToSnake, checkEmployeeRelatedRecords, db, desc, eq, inArray, mapKeys, mem, removeEmployeeFromMemoryStores, requireAdmin, requireAuth, saveLocalDb, schema, syncEmployeeRecord });
  registerArchiveRoutes(app, { EMPLOYEE_RESTORE_MEMKEY_BY_KEY, EMPLOYEE_RESTORE_ORDER, EMPLOYEE_RESTORE_TABLE_BY_KEY, camelToSnake, db, eq, genericMemoryStores, inArray, mapKeys, mem, requireAdmin, requireAuth, saveLocalDb, schema, snakeToCamel, syncEmployeeRecord });
  registerLeavesRoutes(app, { LEAVE_STATUS, and, db, desc, eq, genericMemoryStores, inArray, isNull, leaveStatusVariants, mem, normalizeLeaveStatus, or, presentLeave, requireAuth, schema, sendRouteError });
  registerLeaves2Routes(app, { LEAVE_STATUS, adjustLeaveBalance, and, camelToSnake, db, deductLeaveBalanceOnApproval, desc, eq, genericMemoryStores, getTableColumns, isApprovedLeaveStatus, isRejectedOrCancelledLeaveStatus, logRecalcError, mapKeys, mem, normalizeLeaveStatus, presentLeave, requireAuth, requireWriter, respondIfDbWriteError, schema, sendRouteError, snakeToCamel, syncEntityRecord, triggerRecalculateEligibility });
  registerTrainingsRoutes(app, { and, db, desc, enhanceEnrollmentRecord, enhanceTrainingRecord, eq, mapKeys, mem, requireAuth, requireWriter, respondIfDbWriteError, saveLocalDb, schema, sendRouteError, snakeToCamel, syncEnrollmentToTrainingCourses, triggerRecalculateEligibility, logRecalcError });
  registerTrainerRoutes(app, routeCtx);
  registerAnnualPlanRoutes(app, routeCtx);
  registerSalaryRoutes(app, routeCtx);
  registerAttendanceRoutes(app, routeCtx);
  registerOrgUnitRoutes(app, routeCtx);
  registerCareerHistoryRoutes(app, routeCtx); // B4b
  registerSalaryScaleRoutes(app, routeCtx); // B4d
  registerSharedSettingsRoutes(app, routeCtx); // B6
  registerOfficialHolidaysRoutes(app, routeCtx); // B7
  registerPayrollRoutes(app, routeCtx); // B8a1
  registerPayrollPeriodRoutes(app, routeCtx); // B8a3
  registerPayrollStateRoutes(app, routeCtx); // B8b
  registerPayrollReconcileRoutes(app, routeCtx); // B8a4
  registerRoleRoutes(app, routeCtx); // B9
  loadRoles(db, schema).catch(e => console.error('[roles] تعذّر تحميل الأدوار؛ تُستخدم الافتراضية:', e?.message));
  setInterval(() => { loadRoles(db, schema).catch(() => {}); }, 60_000).unref?.();
  const settingsLists = registerSettingsListRoutes(app, {
    SALARY_TABLE, asc, bothCases, camelToSnake, checkReferentialUsage, db, desc, eq, inMemoryEmployees: mem.inMemoryEmployees, jobTitlesCache,
    logRecalcError, mapKeys, registerLookupRoutes, registerWorkLocationRoutes, requireAdmin, requireAuth, requireWriter,
    respondIfDbWriteError, routeCtx, saveLocalDb, schema, sendRouteError, snakeToCamel, sql, triggerRecalculateEligibility,
  });
  const { buildRefContext, CANONICAL_SEED_FORMS } = settingsLists;
  registerQualificationsRoutes(app, { and, bothCases, camelToSnake, db, desc, eq, findMatchingJobTitleForPromotion, genericMemoryStores, jobTitlesCache, logRecalcError, mapKeys, mem, requireAuth, requireWriter, respondIfDbWriteError, saveLocalDb, schema, sendRouteError, snakeToCamel, syncEmployeeEducationQualification, syncEntityRecord, triggerRecalculateEligibility, updateEmployeeCentralRecord });
  registerGoverningCoursesRoutes(app, { DEFAULT_GOVERNING_COURSES, asc, buildRefContext, checkReferentialUsage, db, ensureGoverningCoursesTable, eq, mem, requireAdmin, requireAuth, schema, sendRouteError });
  registerGoverningCourses2Routes(app, { db, eq, mem, requireAdmin, requireAuth, schema, sendRouteError });
  registerGoverningCourses3Routes(app, { mem, readSettingsDoc, requireAdmin, requireAuth, sendRouteError, writeSettingsDoc });
  registerGoverningCourses4Routes(app, { db, eq, mem, readSettingsDoc, requireAdmin, requireAuth, requireWriter, saveLocalDb, schema, sendRouteError, writeSettingsDoc });
  registerGenericEntitiesRoutes(app, { calculateDegreeTrackSimulation, camelToSnake, db, eq, genericEntitiesMap, genericMemoryStores, getTableColumns, jobTitlesCache, loadEngineContext, loadPenaltyTypesForEngine, logRecalcError, mapKeys, mem, requireAuth, requireWriter, respondIfDbWriteError, routeRegistry, saveLocalDb, schema, sendRouteError, snakeToCamel, toEngineLeave, triggerRecalculateEligibility, updateEmployeeCentralRecord });
  registerPromotionsRoutes(app, { and, bothCases, calculateDegreeTrackSimulation, camelToSnake, db, eq, findMatchingJobTitleForPromotion, formatDateString, genericMemoryStores, inArray, isDateOnOrAfter, isDbConnectionFailure, isNotNull, jobTitlesCache, loadAllEngineContexts, loadPenaltyTypesForEngine, mapKeys, mem, processBatchDegreeTrackAutoSettlement, requireAdmin, requireAuth, requireWriter, resolveTargetJobTitle, saveLocalDb, schema, sendRouteError, settingsLists, sql, toEngineLeave, triggerRecalculateEligibility, dueListCache, writeDueDatesBulk });


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
    startDueMovementsJob(db, schema); // B4b: الحركات المؤجلة لتاريخ نفاذ لاحق
    await seedAdminUser();
  });
}

startServer();
