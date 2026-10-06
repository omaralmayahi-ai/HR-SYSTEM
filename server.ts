// server.ts
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, schema, eq, and, or, desc, asc, ensureSchema, pool } from './src/db/index.ts';
import { getTableColumns, ilike, ne, isNull, isNotNull, gt, inArray, not, sql, count as sqlCount } from 'drizzle-orm';
import { requireAuth, AuthRequest, JWT_SECRET } from './src/middleware/auth.ts';
import { seedAdminUser } from './src/db/users.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { SALARY_TABLE } from './src/lib/salaryTable.js';
import { encryptData, decryptData } from './src/lib/cryptoStorage.ts';
import { recalculateEligibilitySync, EngineContextData, formatDateString, isDateOnOrAfter } from './src/lib/promotionEngine.ts';
import { calculateDegreeTrackSimulation, processDegreeTrackSettlement, processBatchDegreeTrackAutoSettlement } from './src/lib/degreeTrackEngine.ts';
import { extractDelayReasonsFromContext, syncPromotionDelayReasons } from './src/lib/promotionDelayReasonsEngine.ts';
import { checkReferentialUsage } from './src/lib/referentialIntegrity.ts';


const currentFilename = typeof __filename !== 'undefined' ? __filename : '';
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : (currentFilename ? path.dirname(currentFilename) : process.cwd());

async function startServer() {
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
  await ensureSchema().catch(() => {});
  const app = express();
  const PORT = Number(process.env.PORT) || 5000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
    monthlyRegularLeaveDays: 2.5, // عدد أيام الإجازة الاعتيادية المضافة شهرياً
    monthlySickLeaveDays: 2.5, // عدد أيام الإجازة المرضية المضافة شهرياً
    maxRegularLeaveAccumulation: 10000, // الحد الأقصى لتراكم الإجازة الاعتيادية (القيمة الافتراضية 10000 يوم)
    maxSickLeaveAccumulation: 10000, // الحد الأقصى لتراكم الإجازة المرضية (القيمة الافتراضية 10000 يوم)
    autoMonthlyLeaveAccrual: true, // زيادة أرصدة الإجازات تلقائياً شهرياً
    lastLeaveAccrualMonth: '',
    lastLeaveAccrualDate: ''
  };

  // Leave Accrual Logs Store
  let leaveAccrualLogs: any[] = [];

  // Monthly Leave Accrual Execution Function
  async function executeMonthlyLeaveAccrual(targetMonth?: string, force = false) {
    const currentMonth = targetMonth || new Date().toISOString().slice(0, 7); // e.g. '2026-08'
    
    // If not forced and already accrued for this month, return status
    if (!force && systemSettingsStore.lastLeaveAccrualMonth === currentMonth) {
      return {
        success: true,
        alreadyExecuted: true,
        month: currentMonth,
        message: `تم ترحيل وتطبيق الزيادة الشهرية لشهر ${currentMonth} مسبقاً`
      };
    }

    const regDaysToAdd = parseFloat(String(systemSettingsStore.monthlyRegularLeaveDays ?? 2.5)) || 0;
    const sickDaysToAdd = parseFloat(String(systemSettingsStore.monthlySickLeaveDays ?? 2.5)) || 0;
    const maxRegCap = parseInt(String(systemSettingsStore.maxRegularLeaveAccumulation || 10000)) || 10000;
    const maxSickCap = parseInt(String(systemSettingsStore.maxSickLeaveAccumulation || 10000)) || 10000;

    let processedCount = 0;

    // 1. Process in-memory employees
    for (const emp of inMemoryEmployees) {
      const isContinuing = emp.status === 'مستمر' || !emp.status || emp.status === 'مستمر بالخدمة' || emp.status === 'فعال';
      if (isContinuing) {
        const curReg = parseFloat(String(emp.initialRegularLeaveBalance ?? emp.initial_regular_leave_balance ?? 0)) || 0;
        const curSick = parseFloat(String(emp.initialSickLeaveBalance ?? emp.initial_sick_leave_balance ?? 0)) || 0;

        const newReg = Math.min(curReg + regDaysToAdd, maxRegCap);
        const newSick = Math.min(curSick + sickDaysToAdd, maxSickCap);

        emp.initialRegularLeaveBalance = Number(newReg.toFixed(1));
        emp.initial_regular_leave_balance = Number(newReg.toFixed(1));
        emp.initialSickLeaveBalance = Number(newSick.toFixed(1));
        emp.initial_sick_leave_balance = Number(newSick.toFixed(1));

        processedCount++;
      }
    }

    // 2. Process database employees if connected
    try {
      const dbEmps = await db.select().from(schema.employees);
      if (dbEmps && dbEmps.length > 0) {
        for (const emp of dbEmps) {
          const isContinuing = emp.status === 'مستمر' || !emp.status || emp.status === 'مستمر بالخدمة' || emp.status === 'فعال';
          if (isContinuing) {
            const curReg = parseFloat(String(emp.initialRegularLeaveBalance ?? 0)) || 0;
            const curSick = parseFloat(String(emp.initialSickLeaveBalance ?? 0)) || 0;

            const newReg = Math.min(curReg + regDaysToAdd, maxRegCap);
            const newSick = Math.min(curSick + sickDaysToAdd, maxSickCap);

            await db.update(schema.employees).set({
              initialRegularLeaveBalance: Math.round(newReg),
              initialSickLeaveBalance: Math.round(newSick)
            }).where(eq(schema.employees.id, emp.id)).catch(() => {});
          }
        }
      }
    } catch (e) {
      // Database fallback
    }

    // Update settings state
    systemSettingsStore.lastLeaveAccrualMonth = currentMonth;
    systemSettingsStore.lastLeaveAccrualDate = new Date().toISOString();

    const logEntry = {
      id: leaveAccrualLogs.length + 1,
      month: currentMonth,
      employeesCount: processedCount,
      regularDaysAdded: regDaysToAdd,
      sickDaysAdded: sickDaysToAdd,
      timestamp: new Date().toISOString(),
      triggeredBy: force ? 'مسؤول الموارد البشرية (يدوياً)' : 'النظام الآلي (ترحيل شهري)',
      status: 'ناجح'
    };
    leaveAccrualLogs.unshift(logEntry);

    // Also add to system logs
    systemLogsStore.unshift({
      id: systemLogsStore.length + 1,
      action: 'زيادة الأرصدة الشهرية للإجازات',
      user: 'النظام الآلي',
      details: `تم بنجاح تطبيق الزيادة الشهرية لشهر ${currentMonth} على ${processedCount} موظفاً (إجازة اعتيادية: +${regDaysToAdd} يوم، إجازة مرضية: +${sickDaysToAdd} يوم)`,
      timestamp: new Date().toISOString()
    });

    saveLocalDb();

    return {
      success: true,
      month: currentMonth,
      employeesCount: processedCount,
      regularDaysAdded: regDaysToAdd,
      sickDaysAdded: sickDaysToAdd,
      date: new Date().toISOString()
    };
  }

  app.get('/api/settings', async (req, res) => {
    res.json(systemSettingsStore);
  });

  app.get('/api/settings/public', async (req, res) => {
    res.json(systemSettingsStore);
  });

  app.put('/api/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      systemSettingsStore = { ...systemSettingsStore, ...req.body };
      saveLocalDb();
      res.json(systemSettingsStore);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Leave Accrual Dedicated Endpoints
  app.get('/api/leave-accrual/status', requireAuth, async (req, res) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const isAccruedForCurrentMonth = systemSettingsStore.lastLeaveAccrualMonth === currentMonth;
    res.json({
      currentMonth,
      isAccruedForCurrentMonth,
      lastLeaveAccrualMonth: systemSettingsStore.lastLeaveAccrualMonth || '',
      lastLeaveAccrualDate: systemSettingsStore.lastLeaveAccrualDate || '',
      monthlyRegularLeaveDays: systemSettingsStore.monthlyRegularLeaveDays ?? 2.5,
      monthlySickLeaveDays: systemSettingsStore.monthlySickLeaveDays ?? 2.5,
      maxRegularLeaveAccumulation: systemSettingsStore.maxRegularLeaveAccumulation ?? 10000,
      maxSickLeaveAccumulation: systemSettingsStore.maxSickLeaveAccumulation ?? 10000,
      autoMonthlyLeaveAccrual: systemSettingsStore.autoMonthlyLeaveAccrual !== false,
      logs: leaveAccrualLogs
    });
  });

  app.post('/api/leave-accrual/execute', requireAuth, async (req, res) => {
    try {
      const { month, force } = req.body || {};
      const result = await executeMonthlyLeaveAccrual(month, force !== undefined ? Boolean(force) : true);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // System Logs Store & API
  const systemLogsStore: any[] = [];
  app.get('/api/logs', requireAuth, async (req, res) => {
    res.json(systemLogsStore);
  });
  app.post('/api/logs', requireAuth, async (req: AuthRequest, res) => {
    const logItem = { 
      id: systemLogsStore.length + 1, 
      ...req.body, 
      user: req.user?.username || 'admin', 
      timestamp: new Date().toISOString() 
    };
    systemLogsStore.unshift(logItem);
    res.json(logItem);
  });

  // Custom Authentication Endpoints
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      let user: any = null;
      try {
        const usersList = await db.select()
          .from(schema.users)
          .where(eq(schema.users.username, username))
          .limit(1);
        user = usersList[0];
      } catch (dbErr) {
        console.warn('Database query fallback during login:', dbErr);
        // Fallback for admin test user when local PostgreSQL is offline
        if (username === 'admin' && password === 'admin123') {
          user = {
            id: 1,
            username: 'admin',
            password: 'admin123',
            name: 'مدير النظام الافتراضي (وضع الاختبار)',
            role: 'admin',
            email: 'admin@hr.gov.iq'
          };
        }
      }

      if (!user) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      let isMatch = false;
      if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$'))) {
        isMatch = await bcrypt.compare(password, user.password);
      } else {
        // Plaintext match fallback + auto-upgrade to hashed password
        isMatch = user.password === password;
        if (isMatch && !user.isFallback) {
          try {
            const newHash = await bcrypt.hash(password, 10);
            await db.update(schema.users).set({ password: newHash }).where(eq(schema.users.id, user.id));
          } catch (upgradeErr) {
            // ignore
          }
        }
      }

      if (!isMatch) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      // Generate cryptographically signed JWT token of user info
      const token = jwt.sign({
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email
      }, JWT_SECRET, { expiresIn: '7d' });

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
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      res.json(req.user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Users Management API
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

  app.get('/api/auth/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.id));
      if (allUsers && allUsers.length > 0) {
        return res.json(allUsers);
      }
    } catch (error: any) {
      console.warn('Database fallback for users list');
    }
    res.json(inMemoryUsers);
  });

  app.post('/api/auth/users', requireAuth, async (req: AuthRequest, res) => {
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
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/auth/users/:id', requireAuth, async (req: AuthRequest, res) => {
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
        if (password) {
          updateData.password = await bcrypt.hash(password, 10);
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
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/auth/users/:id', requireAuth, async (req: AuthRequest, res) => {
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
        console.warn('Database fallback for deleting user');
      }

      inMemoryUsers = inMemoryUsers.filter(u => u.id !== id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Casing conversion utilities for database <-> frontend compatibility
  function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  function mapKeys(obj: any, transform: (s: string) => string): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => mapKeys(item, transform));
    }
    if (typeof obj === 'object') {
      if (obj instanceof Date) return obj;
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        // Keep string values as is, transform only keys
        newObj[transform(key)] = mapKeys(obj[key], transform);
      }
      return newObj;
    }
    return obj;
  }

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
      order_number: '55212',
      assignment_order: '55212',
      order_date: '2026-08-26',
      assignment_date: '2026-08-26',
      action_type: 'تكليف',
      assignment_type: 'تكليف',
      primary_responsibility: 'مسؤول شعبة',
      acting_responsibility: 'بلا وكالة',
      deputy_level: 'لا يوجد',
      job_title: 'معاون رئيس مبرمجين',
      department: 'قسم التدريب والتطوير الإداري',
      section: 'قسم التدريب والتطوير الإداري',
      service_type: 'دائم',
      notes: '',
      responsibility: 'مسؤول شعبة',
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
    if (jId && Array.isArray(inMemoryJobTitles)) {
      const matchById = inMemoryJobTitles.find(t => parseInt(String(t.id)) === parseInt(String(jId)));
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
    const baseGradeDate = mapped.grade_date || emp.gradeDate || emp.grade_date || mapped.current_appointment_date || emp.currentAppointmentDate || '';
    const lastPromo = emp.lastPromotionDate || emp.last_promotion_date || mapped.last_promotion_date || mapped.lastPromotionDate || baseGradeDate || '';
    const lastIncr = emp.lastIncrementDate || emp.last_increment_date || mapped.last_increment_date || mapped.lastIncrementDate || baseGradeDate || '';
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
  let inMemoryJobTitles: any[] = [
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

  function ensureJobTitleExists(title: string, grade?: number | string, category?: string) {
    if (!title || typeof title !== 'string' || !title.trim()) return;
    const clean = title.trim();
    const norm = clean.replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه').toLowerCase();
    const exists = inMemoryJobTitles.some(t => {
      const tNorm = (t.name || '').replace(/[أإآا]/g, 'ا').replace(/[ىي]/g, 'ي').replace(/[ةه]/g, 'ه').toLowerCase();
      return tNorm === norm;
    });
    if (!exists) {
      const targetGrade = grade ? (parseInt(String(grade)) || 7) : 7;
      const targetCategory = category || 'أخرى';
      const newId = inMemoryJobTitles.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) + 1;
      const newTitle = {
        id: newId,
        name: clean,
        category: targetCategory,
        min_grade: targetGrade,
        minGrade: targetGrade,
        status: 'فعال',
        notes: `تمت إضافته تلقائياً عند حفظ الموظف (الدرجة ${targetGrade}) - تصنيف مؤقت (أخرى)`,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      inMemoryJobTitles.push(newTitle);
      try {
        db.insert(schema.jobTitles).values({
          name: clean,
          category: targetCategory,
          minGrade: targetGrade,
          status: 'فعال',
          notes: `تمت إضافته تلقائياً عند حفظ الموظف (الدرجة ${targetGrade}) - تصنيف مؤقت (أخرى)`
        }).catch(() => {});
      } catch (e) {}
    }
  }

  let inMemoryEmployees: any[] = [
    {
      id: 1,
      fullName: 'عمر محمود سلمان محيميد المياحي',
      full_name: 'عمر محمود سلمان محيميد المياحي',
      firstName: 'عمر',
      first_name: 'عمر',
      fatherName: 'محمود',
      father_name: 'محمود',
      grandfatherName: 'سلمان',
      grandfather_name: 'سلمان',
      greatGrandfatherName: 'محيميد',
      great_grandfather_name: 'محيميد',
      surname: 'المياحي',
      employeeNumber: '118789',
      employee_number: '118789',
      companyNumber: '118789',
      company_number: '118789',
      civilServiceNumber: '118789',
      civil_service_number: '118789',
      gender: 'ذكر',
      birthDate: '1989-10-12',
      birth_date: '1989-10-12',
      birthPlace: 'صلاح الدين',
      birth_place: 'صلاح الدين',
      nationality: 'عراقي',
      ethnicity: 'عربي/ة',
      religion: 'مسلم',
      maritalStatus: 'متزوج',
      marital_status: 'متزوج',
      spouseNames: 'زينب أحمد حسن',
      spouse_names: 'زينب أحمد حسن',
      spousesData: JSON.stringify([{ id: 1, name: 'زينب أحمد حسن' }]),
      spouses_data: JSON.stringify([{ id: 1, name: 'زينب أحمد حسن' }]),
      childrenCount: 2,
      children_count: 2,
      childrenDetails: JSON.stringify([
        { id: 1, name: 'علي عمر محمود', birth_date: '2018-05-14', gender: 'ذكر' },
        { id: 2, name: 'مريم عمر محمود', birth_date: '2021-09-20', gender: 'أنثى' }
      ]),
      children_details: JSON.stringify([
        { id: 1, name: 'علي عمر محمود', birth_date: '2018-05-14', gender: 'ذكر' },
        { id: 2, name: 'مريم عمر محمود', birth_date: '2021-09-20', gender: 'أنثى' }
      ]),
      nationalId: '111111',
      national_id: '111111',
      passportNumber: '11',
      passport_number: '11',
      bloodType: 'AB+',
      blood_type: 'AB+',
      phone: '07701784629',
      email: 'omar.almayahi@gmail.com',
      address: 'بغداد / كفاءات السيدية',
      appointmentDate: '2013-03-24',
      appointment_date: '2013-03-24',
      firstAppointmentDate: '2013-03-24',
      first_appointment_date: '2013-03-24',
      currentAppointmentDate: '2018-01-11',
      current_appointment_date: '2018-01-11',
      oilSectorStartDate: '2013-03-24',
      oil_sector_start_date: '2013-03-24',
      jobTitle: 'معاون رئيس مبرمجين',
      job_title: 'معاون رئيس مبرمجين',
      department: 'قسم التدريب والتطوير الإداري',
      section: 'قسم التدريب والتطوير الإداري',
      serviceType: 'دائم',
      service_type: 'دائم',
      grade: 4,
      step: 4,
      gradeDate: '2025-12-20',
      grade_date: '2025-12-20',
      lastPromotionDate: '2025-12-20',
      last_promotion_date: '2025-12-20',
      lastIncrementDate: '2025-12-20',
      last_increment_date: '2025-12-20',
      jobResponsibility: 'بلا مسؤولية',
      job_responsibility: 'بلا مسؤولية',
      primaryResponsibility: 'بلا مسؤولية',
      primary_responsibility: 'بلا مسؤولية',
      educationLevel: 'بكالوريوس',
      education_level: 'بكالوريوس',
      specialization: 'علوم الحاسبات',
      university: 'جامعة تكريت',
      institution: 'جامعة تكريت',
      graduationYear: 2012,
      graduation_year: 2012,
      workLocation: 'المقر العام - بغداد',
      work_location: 'المقر العام - بغداد',
      workNature: 'مكتبي',
      work_nature: 'مكتبي',
      workShiftType: 'صباحي',
      work_shift_type: 'صباحي',
      status: 'مستمر',
      initialRegularLeaveBalance: 392,
      initial_regular_leave_balance: 392,
      initialSickLeaveBalance: 277,
      initial_sick_leave_balance: 277,
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ];

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
        try {
          await db.update(schema.employees).set(dbPayload).where(eq(schema.employees.id, employeeId));
        } catch (dbErr) {
          console.warn('Database fallback for updateEmployeeCentralRecord');
        }
      }
    } catch (e) {
      console.error('Error updating central employee in DB:', e);
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

  app.post('/api/admin/reload-local-db', async (req, res) => {
    loadLocalDb();
    res.json({ success: true, count: inMemoryEmployees.length });
  });

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
    if (!inMemoryEmployees || inMemoryEmployees.length === 0) {
      loadLocalDb();
    }

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
        let debugFallbackError: string | undefined;
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
          debugFallbackError = String(dbErr?.message || dbErr) + ' || stack: ' + String(dbErr?.stack || '').slice(0, 500);
          // احتياطي: فلترة/ترقيم على نسخة الذاكرة عند فشل الاستعلام المباشر لقاعدة البيانات
          rows = inMemoryEmployees.slice((page - 1) * pageSize, page * pageSize);
          total = inMemoryEmployees.length;
        }

        return res.json({
          data: rows.map(enhanceEmployeeRecord),
          total,
          page,
          pageSize,
          _debugFallbackError: debugFallbackError,
        });
      } catch (error: any) {
        console.error('Error in paginated employees list:', error);
        return res.status(500).json({ error: error.message });
      }
    }

    try {
      const allEmployees = await db.select().from(schema.employees).orderBy(desc(schema.employees.createdAt));
      if (allEmployees && allEmployees.length > 0) {
        return res.json(allEmployees.map(enhanceEmployeeRecord));
      }
    } catch (error: any) {
      console.warn('Database fallback for employees list');
    }
    res.json(inMemoryEmployees.map(enhanceEmployeeRecord));
  });

  app.post('/api/employees', requireAuth, async (req, res) => {
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

      // رقم هوية الموظف: يُنشأ تلقائياً دوماً عند الإضافة (يتجاهل أي قيمة قد تُرسل من الواجهة لهذا الحقل تحديداً)
      mappedData.employeeIdNumber = await generateUniqueEmployeeIdNumber();

      const cleanData = sanitizeEmployeeData(mappedData);

      if (mappedData.jobTitle || data.job_title) {
        const empGrade = mappedData.grade || data.grade || 7;
        const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
        ensureJobTitleExists(rawTitle, empGrade, 'أخرى');
        const matchTitle = inMemoryJobTitles.find(t => (t.name && String(t.name).trim() === rawTitle) || (t.id && String(t.id) === String(mappedData.jobTitleId || data.job_title_id)));
        if (matchTitle) {
          cleanData.jobTitleId = matchTitle.id;
          mappedData.jobTitleId = matchTitle.id;
        }
      }

      let insertedFromDb: any = null;
      try {
        const [newEmployee] = await db.insert(schema.employees).values(cleanData).returning();
        if (newEmployee && newEmployee.id) {
          insertedFromDb = newEmployee;
        }
      } catch (dbErr) {
        console.warn('Database fallback for creating employee');
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/employees/bulk-import', requireAuth, async (req, res) => {
    try {
      const { employees } = req.body;
      if (!Array.isArray(employees) || employees.length === 0) {
        return res.status(400).json({ error: 'لم يتم تزويد قائمة موظفين صالحة للترحيل' });
      }

      const lookupData = {
        jobTitles: inMemoryJobTitles,
        educationDegrees: inMemoryEducationDegrees,
        shiftSystems: inMemoryShiftSystems,
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

        if (!mappedData.status) mappedData.status = 'مستمر بالخدمة';
        if (!mappedData.serviceType) mappedData.serviceType = 'ملاك دائم';
        if (!mappedData.gender) mappedData.gender = 'ذكر';

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

            updatedCount++;
            if (updated) {
              await syncEmployeeQualificationFromEmployee(updated.id, mappedData);
              syncEmployeeRecord(updated, 'update');
              processedEmployees.push(enhanceEmployeeRecord(updated));
              handled = true;
            }
          } else {
            const [inserted] = await db.insert(schema.employees).values(cleanData).returning();
            insertedCount++;

            if (inserted) {
              await syncEmployeeQualificationFromEmployee(inserted.id, mappedData);
              syncEmployeeRecord(inserted, 'insert');
              processedEmployees.push(enhanceEmployeeRecord(inserted));
              handled = true;
            }
          }
        } catch (dbErr) {
          console.warn('Database fallback for bulk import item');
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
      res.status(500).json({ error: error.message || 'فشلت عملية ترحيل الموظفين' });
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
      console.warn('Database fallback for get employee by id');
    }
    const memEmp = inMemoryEmployees.find(e => parseInt(String(e.id)) === id);
    if (memEmp) {
      return res.json(enhanceEmployeeRecord(memEmp));
    }
    res.status(404).json({ error: 'الموظف غير موجود' });
  });

  app.put('/api/employees/:id', requireAuth, async (req, res) => {
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

    // الرقم الوظيفي (رقم وزارة التخطيط): منع التكرار عند التعديل أيضاً إن أُرسل فعلياً
    if (mappedData.civilServiceNumber !== undefined && mappedData.civilServiceNumber) {
      const duplicateCivilServiceNumber = await findEmployeeByCivilServiceNumber(mappedData.civilServiceNumber, id);
      if (duplicateCivilServiceNumber) {
        return res.status(400).json({ error: `الرقم الوظيفي (${String(mappedData.civilServiceNumber).trim()}) مستخدم بالفعل من قبل موظف آخر` });
      }
    }

    // رقم هوية الموظف: يُنشأ تلقائياً مرة واحدة فقط عند الإضافة، ولا يُسمح بتعديله يدوياً عبر واجهة التعديل إطلاقاً
    delete mappedData.employeeIdNumber;

    const cleanData = sanitizeEmployeeData(mappedData);

    if (mappedData.jobTitle || data.job_title) {
      const empGrade = mappedData.grade || data.grade || 7;
      const rawTitle = String(mappedData.jobTitle || data.job_title || '').trim();
      ensureJobTitleExists(rawTitle, empGrade, 'أخرى');
      const matchTitle = inMemoryJobTitles.find(t => (t.name && String(t.name).trim() === rawTitle) || (t.id && String(t.id) === String(mappedData.jobTitleId || data.job_title_id)));
      if (matchTitle) {
        cleanData.jobTitleId = matchTitle.id;
        mappedData.jobTitleId = matchTitle.id;
      }
    }

    let updatedFromDb: any = null;
    try {
      const [updatedEmployee] = await db.update(schema.employees)
        .set(cleanData)
        .where(eq(schema.employees.id, id))
        .returning();

      if (updatedEmployee && updatedEmployee.id) {
        updatedFromDb = updatedEmployee;
      }
    } catch (error: any) {
      console.warn('Database fallback for update employee');
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
      let rows: any[] = [];
      try {
        rows = await db.select().from(cfg.table).where(eq(cfg.column, employeeId));
      } catch {
        rows = [];
      }
      if ((!rows || rows.length === 0) && cfg.memKey && Array.isArray(genericMemoryStores[cfg.memKey])) {
        rows = genericMemoryStores[cfg.memKey].filter((item: any) =>
          parseInt(String(item.employee_id ?? item.employeeId ?? '0')) === employeeId
        );
      }
      related[cfg.key] = rows || [];
    }

    // خطوات محاكاة مسار الشهادات (degree_track_simulation_steps) ترتبط بلقطة المسار (snapshot) وليس بالموظف مباشرة
    const snapshotIds = (related['degreeTrackSnapshots'] || []).map((s: any) => s.id).filter((v: any) => v != null);
    let simulationSteps: any[] = [];
    if (snapshotIds.length > 0) {
      try {
        simulationSteps = await db.select().from(schema.degreeTrackSimulationSteps).where(inArray(schema.degreeTrackSimulationSteps.snapshotId, snapshotIds));
      } catch {
        simulationSteps = [];
      }
      if (simulationSteps.length === 0 && Array.isArray(genericMemoryStores['degree-track-simulation-steps'])) {
        simulationSteps = genericMemoryStores['degree-track-simulation-steps'].filter((item: any) =>
          snapshotIds.includes(parseInt(String(item.snapshot_id ?? item.snapshotId ?? '0')))
        );
      }
    }
    related['degreeTrackSimulationSteps'] = simulationSteps;

    let trainerRows: any[] = [];
    try {
      trainerRows = await db.select().from(schema.trainers).where(eq(schema.trainers.employeeId, employeeId));
    } catch {
      trainerRows = [];
    }
    related['trainers'] = trainerRows || [];

    let governingRows: any[] = [];
    try {
      governingRows = await db.select().from(schema.governingCourseEmployeeAssignments).where(eq(schema.governingCourseEmployeeAssignments.employeeId, String(employeeId)));
    } catch {
      governingRows = [];
    }
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

  app.delete('/api/employees/:id', requireAuth, async (req, res) => {
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

  app.get('/api/archive', requireAuth, async (req, res) => {
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

  app.post('/api/archive/:id/restore', requireAuth, async (req, res) => {
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

  app.delete('/api/archive/:id', requireAuth, async (req, res) => {
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
  app.get('/api/leaves', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.leaveRequests);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.employeeId, employeeId)) as any;
      }
      const leaves = await query.orderBy(desc(schema.leaveRequests.createdAt));
      if (leaves && leaves.length > 0) {
        return res.json(leaves.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for leaves list');
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['leaves'] || inMemoryLeaves || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/leaves', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseInt(mappedData.daysCount);
      }
      if (mappedData.remainingBalance !== undefined && mappedData.remainingBalance !== null) {
        mappedData.remainingBalance = parseInt(mappedData.remainingBalance);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      if (!mappedData.employeeId || isNaN(mappedData.employeeId)) {
        return res.status(400).json({ error: 'employee_id is required' });
      }

      let newLeave: any = null;
      try {
        const [inserted] = await db.insert(schema.leaveRequests).values(mappedData).returning();
        newLeave = inserted;
      } catch (dbErr) {
        console.warn('Database fallback for create leave');
      }

      // Sync leave balance to central employee record
      const days = mappedData.daysCount || 0;
      const lType = (mappedData.leaveType || '').toLowerCase();
      if (days > 0 && mappedData.status !== 'مرفوضة' && mappedData.status !== 'rejected') {
        const emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === mappedData.employeeId);
        if (emp) {
          if (lType.includes('مرض') || lType.includes('sick')) {
            const cur = parseInt(emp.sick_leave_balance ?? emp.sickLeaveBalance ?? emp.initial_sick_leave_balance ?? 30);
            const updatedSick = Math.max(0, cur - days);
            await updateEmployeeCentralRecord(mappedData.employeeId, { sickLeaveBalance: updatedSick });
          } else {
            const cur = parseInt(emp.regular_leave_balance ?? emp.regularLeaveBalance ?? emp.initial_regular_leave_balance ?? 30);
            const updatedReg = Math.max(0, cur - days);
            await updateEmployeeCentralRecord(mappedData.employeeId, { regularLeaveBalance: updatedReg });
          }
        }
      }

      const newId = newLeave?.id || (genericMemoryStores['leaves']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('leaves', memRecord, 'insert');

      res.status(201).json(mapKeys(newLeave || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating leave:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/leaves/:id', requireAuth, async (req, res) => {
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
      if (mappedData.daysCount !== undefined) {
        mappedData.daysCount = parseInt(mappedData.daysCount);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      let updatedLeave: any = null;
      try {
        const [updated] = await db.update(schema.leaveRequests)
          .set(mappedData)
          .where(eq(schema.leaveRequests.id, id))
          .returning();
        updatedLeave = updated;
      } catch (dbErr) {
        console.warn('Database fallback for update leave');
      }

      // Sync leave balance to central employee record if approved
      if (mappedData.status === 'مقبولة' || mappedData.status === 'approved') {
        const days = mappedData.daysCount || 0;
        const empId = mappedData.employeeId;
        const lType = (mappedData.leaveType || '').toLowerCase();
        if (days > 0 && empId) {
          const emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === empId);
          if (emp) {
            if (lType.includes('مرض') || lType.includes('sick')) {
              const cur = parseInt(emp.sick_leave_balance ?? emp.sickLeaveBalance ?? emp.initial_sick_leave_balance ?? 30);
              const updatedSick = Math.max(0, cur - days);
              await updateEmployeeCentralRecord(empId, { sickLeaveBalance: updatedSick });
            } else {
              const cur = parseInt(emp.regular_leave_balance ?? emp.regularLeaveBalance ?? emp.initial_regular_leave_balance ?? 30);
              const updatedReg = Math.max(0, cur - days);
              await updateEmployeeCentralRecord(empId, { regularLeaveBalance: updatedReg });
            }
          }
        }
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('leaves', memRecord, 'update');

      res.json(mapKeys(updatedLeave || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/leaves/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      try {
        await db.delete(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete leave');
      }
      syncEntityRecord('leaves', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting leave:', error);
      res.status(500).json({ error: error.message });
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
      if (results && results.length > 0) {
        return res.json(results.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for penalties list');
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['penalties'] || inMemoryPenalties || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/penalties', requireAuth, async (req, res) => {
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

      let newPenalty: any = null;
      try {
        const [inserted] = await db.insert(schema.penalties).values(mappedData).returning();
        newPenalty = inserted;
      } catch (dbErr) {
        console.warn('Database fallback for create penalty');
      }

      const newId = newPenalty?.id || (genericMemoryStores['penalties']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('penalties', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(() => {});
      }

      res.status(201).json(mapKeys(newPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/penalties/:id', requireAuth, async (req, res) => {
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

      let updatedPenalty: any = null;
      try {
        const [updated] = await db.update(schema.penalties).set(mappedData).where(eq(schema.penalties.id, id)).returning();
        updatedPenalty = updated;
      } catch (dbErr) {
        console.warn('Database fallback for update penalty');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('penalties', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(() => {});
      }

      res.json(mapKeys(updatedPenalty || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/penalties/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['penalties'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.penalties).where(eq(schema.penalties.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete penalty');
      }
      syncEntityRecord('penalties', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(() => {});
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting penalty:', error);
      res.status(500).json({ error: error.message });
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
      if (results && results.length > 0) {
        return res.json(results.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for appreciations list');
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['appreciations'] || inMemoryAppreciations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/appreciations', requireAuth, async (req, res) => {
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
        console.warn('Database fallback for create appreciation');
      }

      const newId = newAppreciation?.id || (genericMemoryStores['appreciations']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('appreciations', memRecord, 'insert');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(() => {});
      }

      res.status(201).json(mapKeys(newAppreciation || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating appreciation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/appreciations/:id', requireAuth, async (req, res) => {
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
        console.warn('Database fallback for update appreciation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('appreciations', memRecord, 'update');

      if (mappedData.employeeId) {
        triggerRecalculateEligibility(mappedData.employeeId).catch(() => {});
      }

      res.json(mapKeys(updatedApprec || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating appreciation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/appreciations/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = (genericMemoryStores['appreciations'] || []).find(r => String(r.id) === String(id));
      try {
        await db.delete(schema.appreciations).where(eq(schema.appreciations.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete appreciation');
      }
      syncEntityRecord('appreciations', { id }, 'delete');

      const empId = parseInt(String(existing?.employee_id || existing?.employeeId || '0'));
      if (empId) {
        triggerRecalculateEligibility(empId).catch(() => {});
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting appreciation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Performance Evaluations API
  app.get('/api/performance', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      let query = db.select().from(schema.performanceEvaluations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.performanceEvaluations.createdAt));
      if (results && results.length > 0) {
        return res.json(results.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for performance list');
    }
    const empIdParam = req.query.employeeId || req.query.employee_id;
    let memList = genericMemoryStores['performance'] || inMemoryPerformanceEvaluations || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
  });

  app.post('/api/performance', requireAuth, async (req, res) => {
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
        console.warn('Database fallback for create performance evaluation');
      }

      const newId = newEval?.id || (genericMemoryStores['performance']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, year: evalYear, created_at: new Date().toISOString() };
      syncEntityRecord('performance', memRecord, 'insert');

      res.status(201).json(mapKeys(newEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating performance evaluation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/performance/:id', requireAuth, async (req, res) => {
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
        console.warn('Database fallback for update performance evaluation');
      }

      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id };
      syncEntityRecord('performance', memRecord, 'update');

      res.json(mapKeys(updatedEval || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error updating performance evaluation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/performance/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      try {
        await db.delete(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete performance evaluation');
      }
      syncEntityRecord('performance', { id }, 'delete');
      res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
    } catch (error: any) {
      console.error('Error deleting performance evaluation:', error);
      res.status(500).json({ error: error.message });
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
      if (results && results.length > 0) {
        return res.json(results.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for career history query');
    }
    const store = genericMemoryStores['career'] || inMemoryCareerHistories || [];
    const filtered = store.filter(item => parseInt(String(item.employee_id || item.employeeId)) === employeeId);
    res.json(filtered.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/career', requireAuth, async (req, res) => {
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
        console.warn('Database fallback for create career history');
      }

      const newId = newHistory?.id || (genericMemoryStores['career']?.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
      syncEntityRecord('career', memRecord, 'insert');

      res.status(201).json(mapKeys(newHistory || memRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating career history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/career/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      try {
        await db.delete(schema.careerHistories).where(eq(schema.careerHistories.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete career history');
      }
      syncEntityRecord('career', { id }, 'delete');
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting career history:', error);
      res.status(500).json({ error: error.message });
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

  function enhanceTrainerRecord(t: any) {
    if (!t) return t;
    const mapped = mapKeys(t, camelToSnake);
    mapped.fullName = t.fullName || mapped.full_name;
    mapped.full_name = mapped.full_name || t.fullName;
    mapped.trainerType = t.trainerType || mapped.trainer_type;
    mapped.trainer_type = mapped.trainer_type || t.trainerType;
    mapped.employeeId = t.employeeId ?? mapped.employee_id;
    mapped.employee_id = mapped.employee_id ?? t.employeeId;
    mapped.employeeCode = t.employeeCode || mapped.employee_code;
    mapped.employee_code = mapped.employee_code || t.employeeCode;
    mapped.trainerCode = t.trainerCode || mapped.trainer_code;
    mapped.trainer_code = mapped.trainer_code || t.trainerCode;
    mapped.courseCategories = t.courseCategories || mapped.course_categories;
    mapped.course_categories = mapped.course_categories || t.courseCategories;
    mapped.specialtyDetails = t.specialtyDetails || mapped.specialty_details;
    mapped.specialty_details = mapped.specialty_details || t.specialtyDetails;
    mapped.workPhone = t.workPhone || mapped.work_phone;
    mapped.work_phone = mapped.work_phone || t.workPhone;
    return mapped;
  }

  function enhancePlanRecord(p: any) {
    if (!p) return p;
    const mapped = mapKeys(p, camelToSnake);
    mapped.plannedCoursesCount = p.plannedCoursesCount ?? mapped.planned_courses_count;
    mapped.planned_courses_count = mapped.planned_courses_count ?? p.plannedCoursesCount;
    mapped.plannedTraineesCount = p.plannedTraineesCount ?? mapped.planned_trainees_count;
    mapped.planned_trainees_count = mapped.planned_trainees_count ?? p.plannedTraineesCount;
    mapped.plannedBudget = p.plannedBudget ?? mapped.planned_budget;
    mapped.planned_budget = mapped.planned_budget ?? p.plannedBudget;
    return mapped;
  }

  // In-memory stores for training & enrollments fallback
  let inMemoryTrainings: any[] = [];
  let inMemoryEnrollments: any[] = [];
  let inMemoryTrainers: any[] = [];
  let inMemoryAnnualPlans: any[] = [];
  let inMemoryAttendance: any[] = [];

  // Training Courses API
  app.get('/api/trainings', requireAuth, async (req, res) => {
    try {
      const track = req.query.track as string;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      let query = db.select().from(schema.trainings);
      if (track && year) {
        query = db.select().from(schema.trainings).where(and(eq(schema.trainings.track, track), eq(schema.trainings.year, year))) as any;
      } else if (track) {
        query = db.select().from(schema.trainings).where(eq(schema.trainings.track, track)) as any;
      } else if (year) {
        query = db.select().from(schema.trainings).where(eq(schema.trainings.year, year)) as any;
      }
      const courses = await query.orderBy(desc(schema.trainings.startDate));
      if (courses && courses.length > 0) {
        return res.json(courses.map(enhanceTrainingRecord));
      }
    } catch (error: any) {
      console.warn('Database fallback for trainings list');
    }
    const track = req.query.track as string;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    let list = inMemoryTrainings;
    if (track) list = list.filter(c => c.track === track);
    if (year) list = list.filter(c => c.year === year);
    res.json(list.map(enhanceTrainingRecord));
  });

  app.post('/api/trainings', requireAuth, async (req, res) => {
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

  app.put('/api/trainings/:id', requireAuth, async (req, res) => {
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

  app.delete('/api/trainings/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.trainings).where(eq(schema.trainings.id, id));
    } catch (error: any) {
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
      if (enrollments && enrollments.length > 0) {
        return res.json(enrollments.map(enhanceEnrollmentRecord));
      }
    } catch (error: any) {
      console.warn('Database fallback for enrollments list');
    }
    const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
    const trainingId = req.query.trainingId ? parseInt(req.query.trainingId as string) : undefined;
    let list = inMemoryEnrollments;
    if (employeeId) list = list.filter(e => e.employeeId === employeeId || e.employee_id === employeeId);
    if (trainingId) list = list.filter(e => e.trainingId === trainingId || e.training_id === trainingId);
    res.json(list.map(enhanceEnrollmentRecord));
  });

  app.post('/api/trainings/enroll', requireAuth, async (req, res) => {
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;
    data.enrollmentDate = data.enrollmentDate || new Date().toISOString().split('T')[0];

    let newEnroll: any = null;
    try {
      const [inserted] = await db.insert(schema.trainingEnrollments).values(data).returning();
      newEnroll = inserted;
      if (newEnroll) {
        if (newEnroll.employeeId && (newEnroll.result === 'اجتاز' || newEnroll.result === 'مشارك')) {
          const [course] = await db.select().from(schema.trainings).where(eq(schema.trainings.id, newEnroll.trainingId)).limit(1);
          if (course) {
            await db.insert(schema.trainingCourses).values({
              employeeId: newEnroll.employeeId,
              courseName: course.courseName,
              courseType: course.courseType || 'حضوري',
              provider: course.provider || 'قسم التدريب والتطوير',
              location: course.location || (course.locationType === 'موقعي' ? 'داخل الشركة' : 'خارج العراق'),
              startDate: course.startDate,
              endDate: course.endDate,
              durationDays: course.days || 1,
              average: newEnroll.score || '',
              grade: newEnroll.grade || newEnroll.result,
              rank: 'مشارك'
            }).catch(() => {});
          }
        }
      }
    } catch (error: any) {
      console.warn('Database fallback for enroll');
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

  app.put('/api/trainings/enrollments/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = mapKeys(req.body, snakeToCamel);
    if (data.trainingId) data.trainingId = parseInt(data.trainingId);
    if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;

    let updatedFromDb: any = null;
    try {
      const [updated] = await db.update(schema.trainingEnrollments).set(data).where(eq(schema.trainingEnrollments.id, id)).returning();
      updatedFromDb = updated;
      if (updated && updated.employeeId && (updated.result === 'اجتاز' || updated.result === 'مشارك')) {
        const [course] = await db.select().from(schema.trainings).where(eq(schema.trainings.id, updated.trainingId)).limit(1);
        if (course) {
          await db.insert(schema.trainingCourses).values({
            employeeId: updated.employeeId,
            courseName: course.courseName,
            courseType: course.courseType || 'حضوري',
            provider: course.provider || 'قسم التدريب والتطوير',
            location: course.location || (course.locationType === 'موقعي' ? 'داخل الشركة' : 'خارج العراق'),
            startDate: course.startDate,
            endDate: course.endDate,
            durationDays: course.days || 1,
            average: updated.score || '',
            grade: updated.grade || updated.result,
            rank: 'مشارك'
          }).catch(() => {});
        }
      }
    } catch (error: any) {
      console.warn('Database fallback for update enrollment');
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

  app.delete('/api/trainings/enrollments/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete enrollment');
    }
    inMemoryEnrollments = inMemoryEnrollments.filter(e => parseInt(String(e.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // Helper to dynamically inspect existing database table columns
  async function getExistingColumns(tableName: string): Promise<Set<string>> {
    try {
      const res = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [tableName]
      );
      return new Set(res.rows.map((r: any) => r.column_name));
    } catch {
      return new Set();
    }
  }

  // Trainers API (دليل المدربين)
  app.get('/api/trainers', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM trainers ORDER BY id DESC');
      if (result && result.rows && result.rows.length > 0) {
        return res.json(result.rows.map(enhanceTrainerRecord));
      }
    } catch (error: any) {
      console.warn('Database fallback for trainers list');
    }
    res.json(inMemoryTrainers.map(enhanceTrainerRecord));
  });

  app.get('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await pool.query('SELECT * FROM trainers WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        return res.json(enhanceTrainerRecord(result.rows[0]));
      }
    } catch (error: any) {
      console.warn('Database fallback for trainer get by id');
    }
    const id = parseInt(req.params.id);
    const memTrainer = inMemoryTrainers.find(t => parseInt(String(t.id)) === id);
    if (memTrainer) return res.json(enhanceTrainerRecord(memTrainer));
    res.status(404).json({ error: 'المدرب غير موجود' });
  });

  app.post('/api/trainers', requireAuth, async (req, res) => {
    try {
      const rawData = req.body;
      const existingCols = await getExistingColumns('trainers');
      
      const snakeData: Record<string, any> = {};
      const addField = (colName: string, val: any) => {
        if (existingCols.size === 0 || existingCols.has(colName)) {
          if (val !== undefined && val !== null) snakeData[colName] = val;
        }
      };

      addField('full_name', rawData.full_name || rawData.fullName);
      addField('specialization', rawData.specialization);
      addField('trainer_type', rawData.trainer_type || rawData.trainerType || 'داخلي');
      addField('organization', rawData.organization);
      addField('phone', rawData.phone);
      addField('email', rawData.email);
      addField('status', rawData.status || 'معتمد');
      addField('rating', rawData.rating || 'ممتاز');
      addField('notes', rawData.notes);

      const rawEmpId = rawData.employee_id ?? rawData.employeeId;
      let parsedEmpId: number | null = null;
      if (rawEmpId !== undefined && rawEmpId !== null && rawEmpId !== '' && !isNaN(parseInt(rawEmpId))) {
        parsedEmpId = parseInt(rawEmpId);
      }
      addField('employee_id', parsedEmpId);

      addField('employee_code', rawData.employee_code || rawData.employeeCode);
      addField('trainer_code', rawData.trainer_code || rawData.trainerCode);
      
      const cats = rawData.course_categories ?? rawData.courseCategories;
      if (cats !== undefined && cats !== null) {
        let catVal = cats;
        if (typeof cats === 'string') {
          try {
            const parsed = JSON.parse(cats);
            if (typeof parsed === 'string') {
              catVal = parsed;
            }
          } catch {
            // Keep original string
          }
        } else {
          catVal = JSON.stringify(cats);
        }
        addField('course_categories', typeof catVal === 'string' ? catVal : JSON.stringify(catVal));
      }
      addField('specialty_details', rawData.specialty_details || rawData.specialtyDetails);
      addField('work_phone', rawData.work_phone || rawData.workPhone);

      let savedRow: any = null;
      try {
        const keys = Object.keys(snakeData);
        const values = Object.values(snakeData);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const q = `INSERT INTO trainers (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
        const result = await pool.query(q, values);
        if (result && result.rows && result.rows.length > 0) {
          savedRow = result.rows[0];
        }
      } catch (dbErr) {
        console.warn('Database fallback for insert trainer');
      }

      const newId = savedRow?.id || (inMemoryTrainers.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
      const memTrainer = { id: newId, ...rawData, ...(savedRow || {}), created_at: new Date().toISOString() };
      inMemoryTrainers.push(memTrainer);
      saveLocalDb();
      res.status(201).json(enhanceTrainerRecord(memTrainer));
    } catch (error: any) {
      console.warn('Database fallback for create trainer');
      res.status(201).json(enhanceTrainerRecord({ id: 1, ...req.body }));
    }
  });

  app.put('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const rawData = req.body;
      const existingCols = await getExistingColumns('trainers');
      
      const snakeData: Record<string, any> = {};
      const addField = (colName: string, val: any) => {
        if (existingCols.size === 0 || existingCols.has(colName)) {
          if (val !== undefined) snakeData[colName] = val;
        }
      };

      addField('full_name', rawData.full_name ?? rawData.fullName);
      addField('specialization', rawData.specialization);
      addField('trainer_type', rawData.trainer_type ?? rawData.trainerType);
      addField('organization', rawData.organization);
      addField('phone', rawData.phone);
      addField('email', rawData.email);
      addField('status', rawData.status);
      addField('rating', rawData.rating);
      addField('notes', rawData.notes);

      const rawEmpId = rawData.employee_id ?? rawData.employeeId;
      if (rawEmpId !== undefined) {
        snakeData['employee_id'] = (rawEmpId !== null && rawEmpId !== '' && !isNaN(parseInt(rawEmpId))) ? parseInt(rawEmpId) : null;
      }
      addField('employee_code', rawData.employee_code ?? rawData.employeeCode);
      addField('trainer_code', rawData.trainer_code ?? rawData.trainerCode);
      
      const cats = rawData.course_categories ?? rawData.courseCategories;
      if (cats !== undefined && cats !== null) {
        let catVal = cats;
        if (typeof cats === 'string') {
          try {
            const parsed = JSON.parse(cats);
            if (typeof parsed === 'string') {
              catVal = parsed;
            }
          } catch {
            // Keep original string
          }
        } else {
          catVal = JSON.stringify(cats);
        }
        addField('course_categories', typeof catVal === 'string' ? catVal : JSON.stringify(catVal));
      }
      addField('specialty_details', rawData.specialty_details ?? rawData.specialtyDetails);
      addField('work_phone', rawData.work_phone ?? rawData.workPhone);

      let savedRow: any = null;
      try {
        const keys = Object.keys(snakeData);
        const values = Object.values(snakeData);
        const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const q = `UPDATE trainers SET ${setClauses} WHERE id = $${keys.length + 1} RETURNING *`;
        const result = await pool.query(q, [...values, id]);
        if (result && result.rows && result.rows.length > 0) {
          savedRow = result.rows[0];
        }
      } catch (dbErr) {
        console.warn('Database fallback for update trainer');
      }

      const idx = inMemoryTrainers.findIndex(t => parseInt(String(t.id)) === id);
      let record: any;
      if (idx !== -1) {
        inMemoryTrainers[idx] = { ...inMemoryTrainers[idx], ...rawData, ...(savedRow || {}) };
        record = inMemoryTrainers[idx];
      } else {
        record = { id, ...rawData, ...(savedRow || {}) };
        inMemoryTrainers.push(record);
      }
      saveLocalDb();
      res.json(enhanceTrainerRecord(record));
    } catch (error: any) {
      console.warn('Database fallback for update trainer');
      res.json(enhanceTrainerRecord({ id: parseInt(req.params.id), ...req.body }));
    }
  });

  app.delete('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await pool.query('DELETE FROM trainers WHERE id = $1', [id]);
    } catch (error: any) {
      console.warn('Database fallback for delete trainer');
    }
    inMemoryTrainers = inMemoryTrainers.filter(t => parseInt(String(t.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // Annual Training Plans API (خطط التدريب السنوية)
  app.get('/api/annual-plans', requireAuth, async (req, res) => {
    try {
      const plans = await db.select().from(schema.annualTrainingPlans).orderBy(desc(schema.annualTrainingPlans.year));
      if (plans && plans.length > 0) {
        return res.json(plans.map(enhancePlanRecord));
      }
    } catch (error: any) {
      console.warn('Database fallback for annual plans list');
    }
    res.json(inMemoryAnnualPlans.map(enhancePlanRecord));
  });

  app.post('/api/annual-plans', requireAuth, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      if (data.year) data.year = parseInt(data.year);
      if (data.plannedCoursesCount) data.plannedCoursesCount = parseInt(data.plannedCoursesCount);
      if (data.plannedTraineesCount) data.plannedTraineesCount = parseInt(data.plannedTraineesCount);
      if (data.plannedBudget) data.plannedBudget = parseInt(data.plannedBudget);

      const { year, track } = data;
      let savedPlan: any = null;
      try {
        const existing = await db.select().from(schema.annualTrainingPlans)
          .where(and(eq(schema.annualTrainingPlans.year, year), eq(schema.annualTrainingPlans.track, track))).limit(1);

        if (existing.length > 0) {
          const [updated] = await db.update(schema.annualTrainingPlans)
            .set(data)
            .where(eq(schema.annualTrainingPlans.id, existing[0].id))
            .returning();
          savedPlan = updated;
        } else {
          const [newPlan] = await db.insert(schema.annualTrainingPlans).values(data).returning();
          savedPlan = newPlan;
        }
      } catch (dbErr) {
        console.warn('Database fallback for save annual plan');
      }

      const idx = inMemoryAnnualPlans.findIndex(p => p.year === year && p.track === track);
      let record: any;
      if (idx !== -1) {
        inMemoryAnnualPlans[idx] = { ...inMemoryAnnualPlans[idx], ...data, ...(savedPlan || {}) };
        record = inMemoryAnnualPlans[idx];
      } else {
        const newId = savedPlan?.id || (inMemoryAnnualPlans.reduce((max, p) => Math.max(max, parseInt(p.id) || 0), 0) || 0) + 1;
        record = { id: newId, ...data, ...(savedPlan || {}) };
        inMemoryAnnualPlans.push(record);
      }
      saveLocalDb();
      res.status(201).json(enhancePlanRecord(record));
    } catch (error: any) {
      console.warn('Database fallback for save annual plan');
      res.status(201).json(enhancePlanRecord({ id: 1, ...req.body }));
    }
  });

  // Salaries API
  app.get('/api/salaries', requireAuth, async (req, res) => {
    try {
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      if (!month || !year || isNaN(month) || isNaN(year)) {
        return res.status(400).json({ error: 'Missing or invalid month/year' });
      }
      const records = await db.select()
        .from(schema.salaryRecords)
        .where(
          and(
            eq(schema.salaryRecords.month, month),
            eq(schema.salaryRecords.year, year)
          )
        );
      
      // Map to snake_case format for the frontend compatibility
      const mapped = records.map(r => ({
        id: r.id,
        employee_id: r.employeeId,
        month: r.month,
        year: r.year,
        base_salary: r.baseSalary,
        total_allowances: r.totalAllowances,
        total_deductions: r.totalDeductions,
        net_salary: r.netSalary,
        status: r.status,
        created_at: r.createdAt
      }));
      return res.json(mapped);
    } catch (error: any) {
      console.warn('Database fallback for salary records');
    }
    res.json([]);
  });

  app.post('/api/salaries/bulk', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      if (!Array.isArray(data)) {
        return res.status(400).json({ error: 'Body must be an array' });
      }
      const toInsert = data.map(item => ({
        employeeId: item.employee_id,
        month: item.month,
        year: item.year,
        baseSalary: item.base_salary,
        totalAllowances: item.total_allowances,
        totalDeductions: item.total_deductions,
        netSalary: item.net_salary,
        status: item.status || 'مسودة'
      }));
      if (toInsert.length > 0) {
        await db.insert(schema.salaryRecords).values(toInsert);
      }
      res.status(201).json({ success: true, count: toInsert.length });
    } catch (error: any) {
      console.warn('Database fallback for bulk salary records');
      res.status(201).json({ success: true, count: Array.isArray(req.body) ? req.body.length : 0 });
    }
  });

  app.put('/api/salaries/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const updateObj: any = {};
      if (data.status) updateObj.status = data.status;
      const [updated] = await db.update(schema.salaryRecords)
        .set(updateObj)
        .where(eq(schema.salaryRecords.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating salary record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Attendance API
  app.get('/api/attendance', requireAuth, async (req, res) => {
    try {
      const date = req.query.date as string;
      let query = db.select().from(schema.attendance);
      if (date) {
        query = db.select().from(schema.attendance).where(eq(schema.attendance.date, date)) as any;
      }
      const records = await query.orderBy(desc(schema.attendance.createdAt));
      
      const mapped = records.map(r => ({
        id: r.id,
        employee_id: r.employeeId,
        date: r.date,
        status: r.status,
        check_in: r.checkIn,
        check_out: r.checkOut,
        late_minutes: r.lateMinutes,
        notes: r.notes,
        created_at: r.createdAt
      }));
      return res.json(mapped);
    } catch (error: any) {
      console.warn('Database fallback for attendance records');
    }
    res.json([]);
  });

  app.post('/api/attendance', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const toInsert = {
        employeeId: data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined),
        date: data.date,
        status: data.status,
        checkIn: data.check_in !== undefined ? data.check_in : data.checkIn,
        checkOut: data.check_out !== undefined ? data.check_out : data.checkOut,
        lateMinutes: data.late_minutes !== undefined ? parseInt(data.late_minutes) : (data.lateMinutes !== undefined ? parseInt(data.lateMinutes) : 0),
        notes: data.notes
      };

      if (!toInsert.employeeId) {
        return res.status(400).json({ error: 'الموظف مطلوب' });
      }

      const [newRecord] = await db.insert(schema.attendance).values(toInsert as any).returning();
      
      res.status(210).json({
        id: newRecord.id,
        employee_id: newRecord.employeeId,
        date: newRecord.date,
        status: newRecord.status,
        check_in: newRecord.checkIn,
        check_out: newRecord.checkOut,
        late_minutes: newRecord.lateMinutes,
        notes: newRecord.notes,
        created_at: newRecord.createdAt
      });
    } catch (error: any) {
      console.error('Error creating attendance record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/attendance/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const updateObj: any = {};
      if (data.status) updateObj.status = data.status;
      if (data.check_in !== undefined) updateObj.checkIn = data.check_in;
      if (data.check_out !== undefined) updateObj.checkOut = data.check_out;
      if (data.late_minutes !== undefined) updateObj.lateMinutes = parseInt(data.late_minutes) || 0;
      if (data.notes !== undefined) updateObj.notes = data.notes;

      const [updated] = await db.update(schema.attendance)
        .set(updateObj)
        .where(eq(schema.attendance.id, id))
        .returning();

      res.json({
        id: updated.id,
        employee_id: updated.employeeId,
        date: updated.date,
        status: updated.status,
        check_in: updated.checkIn,
        check_out: updated.checkOut,
        late_minutes: updated.lateMinutes,
        notes: updated.notes,
        created_at: updated.createdAt
      });
    } catch (error: any) {
      console.error('Error updating attendance record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/attendance/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      await db.delete(schema.attendance).where(eq(schema.attendance.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting attendance record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Organizational Units API
  let inMemoryOrgUnits: any[] = [
    { id: 1, name: 'المديرية العامة للموارد البشرية', type: 'مديرية عامة', parentId: null, parent_id: null, managerId: 1, manager_id: 1 },
    { id: 2, name: 'قسم إدارة الملاكات والتعيينات', type: 'قسم', parentId: 1, parent_id: 1, managerId: null, manager_id: null },
    { id: 3, name: 'قسم الرواتب والمخصصات', type: 'قسم', parentId: 1, parent_id: 1, managerId: null, manager_id: null },
    { id: 4, name: 'قسم التدريب والتطوير الإداري', type: 'قسم', parentId: 1, parent_id: 1, managerId: null, manager_id: null },
    { id: 5, name: 'شعبة شؤون الخدمة والتقاعد', type: 'شعبة', parentId: 2, parent_id: 2, managerId: null, manager_id: null }
  ];

  app.get('/api/org-units', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.orgUnits);
      if (records && records.length > 0) {
        return res.json(records.map(r => ({
          ...r,
          parent_id: r.parentId,
          manager_id: r.managerId
        })));
      }
    } catch (error: any) {
      console.warn('Database fallback for org units');
    }
    res.json(inMemoryOrgUnits);
  });

  app.post('/api/org-units', requireAuth, async (req, res) => {
    const data = req.body;
    const parentId = (data.parentId !== undefined && data.parentId !== null && data.parentId !== '') ? parseInt(data.parentId) : ((data.parent_id !== undefined && data.parent_id !== null && data.parent_id !== '') ? parseInt(data.parent_id) : null);
    const managerId = (data.managerId !== undefined && data.managerId !== null && data.managerId !== '') ? parseInt(data.managerId) : ((data.manager_id !== undefined && data.manager_id !== null && data.manager_id !== '') ? parseInt(data.manager_id) : null);

    const unitName = String(data.name || '').trim();
    if (!unitName) {
      return res.status(400).json({ error: 'اسم الوحدة التنظيمية مطلوب' });
    }
    const normalize = (s: string) => s.trim().toLowerCase();
    let existingUnits: any[] = [];
    try {
      existingUnits = await db.select().from(schema.orgUnits);
    } catch (error: any) {
      console.warn('Database fallback for org unit duplicate check');
    }
    const allUnits = [...existingUnits, ...inMemoryOrgUnits];
    const samePid = (u: any) => {
      const uPid = (u.parentId !== undefined && u.parentId !== null) ? u.parentId : (u.parent_id !== undefined ? u.parent_id : null);
      return (uPid === null && parentId === null) || (uPid !== null && parentId !== null && parseInt(String(uPid)) === parseInt(String(parentId)));
    };
    const duplicateUnit = allUnits.find(u => samePid(u) && normalize(String(u.name || '')) === normalize(unitName));
    if (duplicateUnit) {
      return res.status(400).json({ error: `الوحدة التنظيمية (${unitName}) موجودة بالفعل ضمن نفس الجهة الأعلى` });
    }

    try {
      const [newRecord] = await db.insert(schema.orgUnits).values({
        name: data.name,
        type: data.type,
        parentId,
        managerId,
      }).returning();
      if (newRecord) {
        return res.status(201).json({
          ...newRecord,
          parent_id: newRecord.parentId,
          manager_id: newRecord.managerId
        });
      }
    } catch (error: any) {
      console.warn('Database fallback for create org unit');
    }

    const newId = inMemoryOrgUnits.length > 0 ? Math.max(...inMemoryOrgUnits.map(u => u.id)) + 1 : 1;
    const memUnit = {
      id: newId,
      name: data.name,
      type: data.type,
      parentId,
      parent_id: parentId,
      managerId,
      manager_id: managerId
    };
    inMemoryOrgUnits.push(memUnit);
    res.status(201).json(memUnit);
  });

  app.put('/api/org-units/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    const data = req.body;
    const updateObj: any = {};
    if (data.name !== undefined) updateObj.name = data.name;
    if (data.type !== undefined) updateObj.type = data.type;
    
    if (data.parentId !== undefined || data.parent_id !== undefined) {
      const rawP = data.parentId !== undefined ? data.parentId : data.parent_id;
      updateObj.parentId = (rawP !== null && rawP !== '') ? parseInt(rawP) : null;
    }
    if (data.managerId !== undefined || data.manager_id !== undefined) {
      const rawM = data.managerId !== undefined ? data.managerId : data.manager_id;
      updateObj.managerId = (rawM !== null && rawM !== '') ? parseInt(rawM) : null;
    }

    try {
      const [updated] = await db.update(schema.orgUnits)
        .set(updateObj)
        .where(eq(schema.orgUnits.id, id))
        .returning();
      if (updated) {
        return res.json({
          ...updated,
          parent_id: updated.parentId,
          manager_id: updated.managerId
        });
      }
    } catch (error: any) {
      console.warn('Database fallback for update org unit');
    }

    const idx = inMemoryOrgUnits.findIndex(u => u.id === id);
    if (idx !== -1) {
      inMemoryOrgUnits[idx] = {
        ...inMemoryOrgUnits[idx],
        name: data.name !== undefined ? data.name : inMemoryOrgUnits[idx].name,
        type: data.type !== undefined ? data.type : inMemoryOrgUnits[idx].type,
        parentId: updateObj.parentId !== undefined ? updateObj.parentId : inMemoryOrgUnits[idx].parentId,
        parent_id: updateObj.parentId !== undefined ? updateObj.parentId : inMemoryOrgUnits[idx].parent_id,
        managerId: updateObj.managerId !== undefined ? updateObj.managerId : inMemoryOrgUnits[idx].managerId,
        manager_id: updateObj.managerId !== undefined ? updateObj.managerId : inMemoryOrgUnits[idx].manager_id,
      };
      return res.json(inMemoryOrgUnits[idx]);
    }

    res.json({ id, ...data });
  });

  app.delete('/api/org-units/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    try {
      const allUnits = await db.select().from(schema.orgUnits);
      const getDescendantIds = (parentId: number): number[] => {
        const children = allUnits.filter(u => u.parentId === parentId);
        let ids = children.map(c => c.id);
        for (const child of children) {
          ids = [...ids, ...getDescendantIds(child.id)];
        }
        return ids;
      };

      const idsToDelete = [id, ...getDescendantIds(id)];
      for (const deleteId of idsToDelete.reverse()) {
        await db.delete(schema.orgUnits).where(eq(schema.orgUnits.id, deleteId));
      }
    } catch (error: any) {
      console.warn('Database fallback for delete org unit');
    }

    const getMemDescendants = (parentId: number): number[] => {
      const children = inMemoryOrgUnits.filter(u => u.parentId === parentId || u.parent_id === parentId);
      let ids = children.map(c => c.id);
      for (const child of children) {
        ids = [...ids, ...getMemDescendants(child.id)];
      }
      return ids;
    };
    const allToDelete = new Set([id, ...getMemDescendants(id)]);
    inMemoryOrgUnits = inMemoryOrgUnits.filter(u => !allToDelete.has(u.id));

    res.json({ success: true });
  });

  // --- In-Memory Stores for Offline/Fallback Development ---
  let inMemorySalaryScale: any[] = [];
  function getUnifiedSalaryScaleDefaults() {
    const records: any[] = [];
    let idCounter = 1;
    for (let g = 1; g <= 10; g++) {
      for (let s = 1; s <= 11; s++) {
        records.push({
          id: idCounter++,
          grade: g,
          step: s,
          amount: (SALARY_TABLE as any)[g]?.[s] || 250000,
          effectiveFrom: '2026-08-27', // تاريخ بداية التتبع (خط الأساس)
          effective_from: '2026-08-27',
          createdAt: new Date().toISOString()
        });
      }
    }
    return records;
  }

  let inMemoryGradePromotionRules: any[] = [
    { id: 1, grade: 1, promotion_years: null, promotionYears: null, notes: 'قمة السلم الوظيفي - لا يوجد ترفيع أعلى' },
    { id: 2, grade: 2, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الثانية إلى الأولى' },
    { id: 3, grade: 3, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الثالثة إلى الثانية' },
    { id: 4, grade: 4, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الرابعة إلى الثالثة' },
    { id: 5, grade: 5, promotion_years: 5, promotionYears: 5, notes: 'الدرجة الخامسة إلى الرابعة' },
    { id: 6, grade: 6, promotion_years: 4, promotionYears: 4, notes: 'الدرجة السادسة إلى الخامسة' },
    { id: 7, grade: 7, promotion_years: 4, promotionYears: 4, notes: 'الدرجة السابعة إلى السادسة' },
    { id: 8, grade: 8, promotion_years: 4, promotionYears: 4, notes: 'الدرجة الثامنة إلى السابعة' },
    { id: 9, grade: 9, promotion_years: 4, promotionYears: 4, notes: 'الدرجة التاسعة إلى الثامنة' },
    { id: 10, grade: 10, promotion_years: 4, promotionYears: 4, notes: 'الدرجة العاشرة إلى التاسعة' },
    { id: 11, grade: 11, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا أ' },
    { id: 12, grade: 12, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا ب' },
    { id: 13, grade: 13, promotion_years: null, promotionYears: null, notes: 'درجة خاصة / عليا ج' },
  ];

  let inMemoryCommendationTypes: any[] = [
    { id: 1, name: 'كتاب شكر وتقدير اعتيادي / مدير عام', credit_months: 1, creditMonths: 1, status: 'فعال', notes: 'يمنح قدماً لمدة شهر واحد' },
    { id: 2, name: 'كتاب شكر وتقدير وزاري', credit_months: 1, creditMonths: 1, status: 'فعال', notes: 'يمنح قدماً لمدة شهر واحد' },
    { id: 3, name: 'كتاب شكر وتقدير استثنائي (رئاسي / رئيس مجلس الوزراء)', credit_months: 6, creditMonths: 6, status: 'فعال', notes: 'يمنح قدماً لمدة 6 أشهر' }
  ];

  let inMemoryEmployeeCommendations: any[] = [];

  let inMemoryCommendationRulesSettings: any = {
    id: 1,
    config_key: 'default_commendation_rules',
    configKey: 'default_commendation_rules',
    max_per_year: 3,
    maxPerYear: 3,
    allowed_combinations: JSON.stringify([
      { label: "3 كتب عادية (شهر واحد)", maxCount: 3, creditMonths: 1 },
      { label: "كتابان عاديان + كتاب استثنائي (6 أشهر)", maxCount: 3, rules: [{ count: 2, creditMonths: 1 }, { count: 1, creditMonths: 6 }] },
      { label: "كتابان استثنائيان (6 أشهر)", maxCount: 2, rules: [{ count: 2, creditMonths: 6 }] }
    ]),
    allowedCombinations: JSON.stringify([
      { label: "3 كتب عادية (شهر واحد)", maxCount: 3, creditMonths: 1 },
      { label: "كتابان عاديان + كتاب استثنائي (6 أشهر)", maxCount: 3, rules: [{ count: 2, creditMonths: 1 }, { count: 1, creditMonths: 6 }] },
      { label: "كتابان استثنائيان (6 أشهر)", maxCount: 2, rules: [{ count: 2, creditMonths: 6 }] }
    ]),
    degreeTrackAutoSettlement: false,
    degree_track_auto_settlement: false,
    reminderDaysCourse: 30,
    reminder_days_course: 30,
    reminderDaysPenalty: 15,
    reminder_days_penalty: 15,
    reminderDaysLeave: 30,
    reminder_days_leave: 30,
    reminderDaysEvaluation: 30,
    reminder_days_evaluation: 30,
    reminderDaysAbsence: 10,
    reminder_days_absence: 10
  };

  let inMemoryAllowancesDeductions: any[] = [
    { id: 1, name: 'مخصصات زوجية', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
    { id: 2, name: 'مخصصات أطفال (لكل طفل)', type: 'allowance', calcType: 'flat', value: 10000, status: 'فعال' },
    { id: 3, name: 'مخصصات خطورة مهنية', type: 'allowance', calcType: 'percentage', value: 20, status: 'فعال' },
    { id: 4, name: 'مخصصات موقع جغرافي / نأي', type: 'allowance', calcType: 'flat', value: 50000, status: 'فعال' },
    { id: 5, name: 'استقطاع التقاعد الإلزامي', type: 'deduction', calcType: 'percentage', value: 10, status: 'فعال' },
    { id: 6, name: 'استقطاع ضريبة الدخل', type: 'deduction', calcType: 'percentage', value: 3, status: 'فعال' },
    { id: 7, name: 'استقطاع صندوق التكافل الاجتماعي', type: 'deduction', calcType: 'flat', value: 10000, status: 'فعال' }
  ];

  let inMemoryEducationDegrees: any[] = [
    { id: 1, name: 'دكتوراه', allowance_rate: 100, is_higher_education: true, higher_allowance_rate: 100, baseline_grade: 5, baseline_step: 1, status: 'فعال' },
    { id: 2, name: 'ماجستير', allowance_rate: 75, is_higher_education: true, higher_allowance_rate: 75, baseline_grade: 6, baseline_step: 1, status: 'فعال' },
    { id: 3, name: 'دبلوم عالي', allowance_rate: 65, is_higher_education: true, higher_allowance_rate: 65, baseline_grade: 6, baseline_step: 1, status: 'فعال' },
    { id: 4, name: 'بكالوريوس', allowance_rate: 45, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 7, baseline_step: 1, status: 'فعال' },
    { id: 5, name: 'دبلوم فني', allowance_rate: 35, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1, status: 'فعال' },
    { id: 6, name: 'إعدادية', allowance_rate: 25, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1, status: 'فعال' },
    { id: 7, name: 'متوسطة', allowance_rate: 15, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 9, baseline_step: 1, status: 'فعال' },
    { id: 8, name: 'ابتدائية', allowance_rate: 0, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1, status: 'فعال' },
    { id: 9, name: 'يقرأ ويكتب', allowance_rate: 0, is_higher_education: false, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1, status: 'فعال' }
  ];

  let inMemoryResponsibilityAllowances: any[] = [
    { id: 1, name: 'مدير عام', allowance_rate: 50, status: 'فعال' },
    { id: 2, name: 'معاون مدير عام', allowance_rate: 40, status: 'فعال' },
    { id: 3, name: 'مدير هيئة', allowance_rate: 35, status: 'فعال' },
    { id: 4, name: 'مدير قسم مركزي', allowance_rate: 30, status: 'فعال' },
    { id: 5, name: 'مدير قسم', allowance_rate: 25, status: 'فعال' },
    { id: 6, name: 'مسؤول شعبة', allowance_rate: 20, status: 'فعال' },
    { id: 7, name: 'مسؤول وحدة', allowance_rate: 15, status: 'فعال' },
    { id: 8, name: 'مسؤول وجبة', allowance_rate: 10, status: 'فعال' },
    { id: 9, name: 'بلا مسؤولية', allowance_rate: 0, status: 'فعال' }
  ];

  let inMemoryWorkLocations: any[] = [
    { id: 1, name: 'المقر العام - بغداد', allowance_amount: 0, work_start_hour: '08:00', work_end_hour: '15:00' },
    { id: 2, name: 'حقول البصرة النفطية', allowance_amount: 150000, work_start_hour: '07:00', work_end_hour: '19:00' },
    { id: 3, name: 'مصفى كركوك', allowance_amount: 100000, work_start_hour: '08:00', work_end_hour: '16:00' },
    { id: 4, name: 'مستودع ميسان', allowance_amount: 75000, work_start_hour: '08:00', work_end_hour: '15:00' }
  ];

  let inMemoryServiceTypes: any[] = [
    { id: 1, name: 'دائم' },
    { id: 2, name: 'عقد' },
    { id: 3, name: 'أجر يومي' }
  ];

  let inMemoryEmployeeStatuses: any[] = [
    { id: 1, name: 'مستمر' },
    { id: 2, name: 'منسب' },
    { id: 3, name: 'مجاز' },
    { id: 4, name: 'متقاعد' },
    { id: 5, name: 'مستقيل' },
    { id: 6, name: 'موقوف' }
  ];

  let inMemoryShiftSystems: any[] = [
    { id: 1, name: 'دوام صباحي اعتيادي (5 أيام عمل / يومين راحة)', work_days: 5, rest_days: 2, allowance_amount: 0, status: 'فعال' },
    { id: 2, name: 'نظام مناوبة حقول (14 يوم عمل / 14 يوم استراحة)', work_days: 14, rest_days: 14, allowance_amount: 100000, status: 'فعال' },
    { id: 3, name: 'نظام مناوبة أسبوعي (7 أيام عمل / 7 أيام استراحة)', work_days: 7, rest_days: 7, allowance_amount: 50000, status: 'فعال' }
  ];

  let inMemoryLeaveTypes: any[] = [
    { 
      id: 1, 
      name: 'إجازة اعتيادية براتب تام', 
      max_days: 36, 
      maxDays: 36, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'تمنح برصيد اعتيادي سنوي بمعدل يومين ونصف عن كل شهر خدمة فعلي متراكم', 
      status: 'فعال' 
    },
    { 
      id: 2, 
      name: 'إجازة مرضية براتب تام', 
      max_days: 120, 
      maxDays: 120, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'بتقارير طبية معتمدة من اللجان الرسمية المختصة', 
      status: 'فعال' 
    },
    { 
      id: 3, 
      name: 'إجازة أمومة ورعاية طفل', 
      max_days: 365, 
      maxDays: 365, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_ومخصصات_ثابتة', 
      financialEffect: 'براتب_ومخصصات_ثابتة', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      effects_options: JSON.stringify(['منح_الراتب_والمخصصات_الثابتة_فقط']),
      effectsOptions: JSON.stringify(['منح_الراتب_والمخصصات_الثابتة_فقط']),
      description: 'للموظفات لرعاية الطفل بموجب قانون الخدمة المدنية', 
      status: 'فعال' 
    },
    { 
      id: 4, 
      name: 'إجازة حج بيت الله الحرام', 
      max_days: 30, 
      maxDays: 30, 
      administrative_effect: 'لا_يؤثر', 
      administrativeEffect: 'لا_يؤثر', 
      financial_effect: 'براتب_كامل', 
      financialEffect: 'براتب_كامل', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: false,
      affectsCommendations: false,
      salary_payment_type: 'منح_الراتب_كامل',
      salaryPaymentType: 'منح_الراتب_كامل',
      effects_options: JSON.stringify(['منح_الراتب_كامل']),
      effectsOptions: JSON.stringify(['منح_الراتب_كامل']),
      description: 'لمرة واحدة طوال الخدمة الوظيفية براتب تام', 
      status: 'فعال' 
    },
    { 
      id: 5, 
      name: 'إجازة دراسية لتطوير الكفاءات', 
      max_days: 730, 
      maxDays: 730, 
      administrative_effect: 'توقف_منح_كتب_الشكر', 
      administrativeEffect: 'توقف_منح_كتب_الشكر', 
      financial_effect: 'براتب_ومخصصات_ثابتة', 
      financialEffect: 'براتب_ومخصصات_ثابتة', 
      financial_deduction_percentage: 0,
      financialDeductionPercentage: 0,
      affects_increment: false,
      affectsIncrement: false,
      affects_promotion: false,
      affectsPromotion: false,
      affects_commendations: true,
      affectsCommendations: true,
      salary_payment_type: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      salaryPaymentType: 'منح_الراتب_والمخصصات_الثابتة_فقط',
      effects_options: JSON.stringify(['كتب_الشكر', 'منح_الراتب_والمخصصات_الثابتة_فقط']),
      effectsOptions: JSON.stringify(['كتب_الشكر', 'منح_الراتب_والمخصصات_الثابتة_فقط']),
      description: 'لإكمال الدراسات العليا داخل أو خارج العراق وتوقف منح كتب الشكر والتقدير أثناء التمتع بها', 
      status: 'فعال' 
    },
    { 
      id: 6, 
      name: 'إجازة بدون راتب (طارئة / مصاحبة)', 
      max_days: 365, 
      maxDays: 365, 
      administrative_effect: 'يوقف_الترفيع_والعلاوة_وكتب_الشكر', 
      administrativeEffect: 'يوقف_الترفيع_والعلاوة_وكتب_الشكر', 
      financial_effect: 'بدون_راتب', 
      financialEffect: 'بدون_راتب', 
      financial_deduction_percentage: 100,
      financialDeductionPercentage: 100,
      affects_increment: true,
      affectsIncrement: true,
      affects_promotion: true,
      affectsPromotion: true,
      affects_commendations: true,
      affectsCommendations: true,
      salary_payment_type: 'بدون_راتب',
      salaryPaymentType: 'بدون_راتب',
      effects_options: JSON.stringify(['العلاوة_السنوية', 'الترفيع', 'كتب_الشكر', 'بدون_راتب']),
      effectsOptions: JSON.stringify(['العلاوة_السنوية', 'الترفيع', 'كتب_الشكر', 'بدون_راتب']),
      description: 'إجازة استثنائية بدون راتب توقف الترفيع والعلاوة وتوقف منح كتب الشكر والتقدير', 
      status: 'فعال' 
    }
  ];

  // --- Penalty Types Canonical Data & In-Memory Store ---
  let inMemoryPenaltyTypes: any[] = [
    { id: 1, name: 'لفت نظر', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'تنبيه الموظف إلى التقصير', status: 'فعال' },
    { id: 2, name: 'إنذار', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'توجيه إنذار رسمي للموظف', status: 'فعال' },
    { id: 3, name: 'قطع راتب', deduction_type: 'قطع راتب لأيام محددة', deduction_value: 'حسب الأيام', delay_months: 0, delay_rule: 'لا يؤخر', description: 'استقطاع الراتب الاسمي لعدة أيام', status: 'فعال' },
    { id: 4, name: 'توبيخ', deduction_type: 'بدون قطع مالي', deduction_value: 'بدون قطع مالي', delay_months: 0, delay_rule: 'لا يؤخر', description: 'توبيخ رسمي موثق في إضبارة الخدمة', status: 'فعال' },
    { id: 5, name: 'إنقاص راتب', deduction_type: 'نسبة مئوية', deduction_value: '10%', delay_months: 6, delay_rule: 'تأخير الترفيع 6 أشهر', description: 'إنقاص الراتب بنسبة محددة لمدة معلومة', status: 'فعال' },
    { id: 6, name: 'تنزيل درجة', deduction_type: 'تنزيل درجة وظيفية', deduction_value: 'درجة واحدة', delay_months: 24, delay_rule: 'تنزيل درجة وتأخير الترفيع سنتين', description: 'تنزيل الموظف إلى الدرجة الأدنى مباشرة', status: 'فعال' },
    { id: 7, name: 'فصل', deduction_type: 'إنهاء خدمة مؤقت', deduction_value: 'فصل مؤقت', delay_months: 0, delay_rule: 'فصل', description: 'فصل الموظف للمدة القانونية المحددة', status: 'فعال' },
    { id: 8, name: 'عزل', deduction_type: 'إنهاء خدمة نهائي', deduction_value: 'عزل نهائي', delay_months: 0, delay_rule: 'عزل', description: 'عزل الموظف نهائياً من الوظيفة العامة', status: 'فعال' }
  ];

  // --- Job Titles Canonical Data & In-Memory Store ---
  const DEFAULT_JOB_TITLES = [
    { id: 1, name: 'رئيس مهندسين أقدم', category: 'هندسي', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 2, name: 'رئيس مهندسين', category: 'هندسي', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 3, name: 'مهندس أقدم', category: 'هندسي', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 4, name: 'مهندس', category: 'هندسي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 5, name: 'معاون مهندس', category: 'هندسي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 6, name: 'رئيس مبرمجين أقدم', category: 'حاسبات وتقنية', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 7, name: 'رئيس مبرمجين', category: 'حاسبات وتقنية', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 8, name: 'مبرمج أقدم', category: 'حاسبات وتقنية', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 9, name: 'مبرمج', category: 'حاسبات وتقنية', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 10, name: 'معاون مبرمج', category: 'حاسبات وتقنية', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 11, name: 'مدير عام', category: 'إداري', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 12, name: 'مدير أقدم', category: 'إداري', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 13, name: 'مدير', category: 'إداري', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 14, name: 'رئيس ملاحظين', category: 'إداري', min_grade: 4, min_step: 1, status: 'فعال', notes: '' },
    { id: 15, name: 'ملاحظ', category: 'إداري', min_grade: 5, min_step: 1, status: 'فعال', notes: '' },
    { id: 16, name: 'معاون ملاحظ', category: 'إداري', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 17, name: 'كاتب طابعة', category: 'إداري', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 18, name: 'رئيس مدققين أقدم', category: 'مالي', min_grade: 1, min_step: 1, status: 'فعال', notes: '' },
    { id: 19, name: 'رئيس مدققين', category: 'مالي', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 20, name: 'مدقق أقدم', category: 'مالي', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 21, name: 'مدقق حسابات', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 22, name: 'محاسب', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 23, name: 'معاون محاسب', category: 'مالي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 24, name: 'رئيس مشاورين قانونيين', category: 'قانوني', min_grade: 2, min_step: 1, status: 'فعال', notes: '' },
    { id: 25, name: 'مشاور قانوني أقدم', category: 'قانوني', min_grade: 3, min_step: 1, status: 'فعال', notes: '' },
    { id: 26, name: 'مشاور قانوني', category: 'قانوني', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 27, name: 'معاون مشاور قانوني', category: 'قانوني', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 28, name: 'طبيب اختصاص', category: 'طبي وصحي', min_grade: 5, min_step: 1, status: 'فعال', notes: '' },
    { id: 29, name: 'طبيب ممارس', category: 'طبي وصحي', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 30, name: 'ممرض جامعي', category: 'طبي وصحي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 31, name: 'فني أقدم', category: 'فني', min_grade: 6, min_step: 1, status: 'فعال', notes: '' },
    { id: 32, name: 'فني', category: 'فني', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 33, name: 'حرفي أقدم', category: 'مهني وحرفي', min_grade: 7, min_step: 1, status: 'فعال', notes: '' },
    { id: 34, name: 'حرفي', category: 'مهني وحرفي', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 35, name: 'سائق', category: 'خدمات', min_grade: 8, min_step: 1, status: 'فعال', notes: '' },
    { id: 36, name: 'حارس أمني', category: 'أمن وحماية', min_grade: 9, min_step: 1, status: 'فعال', notes: '' },
    { id: 37, name: 'موظف خدمة', category: 'خدمات', min_grade: 10, min_step: 1, status: 'فعال', notes: '' }
  ];

  if (!inMemoryJobTitles || inMemoryJobTitles.length === 0) {
    inMemoryJobTitles = DEFAULT_JOB_TITLES.map(t => ({ ...t, minGrade: t.min_grade, minStep: t.min_step }));
  }

  function buildRefContext() {
    return {
      employees: (typeof inMemoryEmployees !== 'undefined' && inMemoryEmployees) ? inMemoryEmployees : [],
      jobAssignments: (typeof genericMemoryStores !== 'undefined' && genericMemoryStores['job-assignments']) || (typeof inMemoryJobAssignments !== 'undefined' ? inMemoryJobAssignments : []),
      qualifications: (typeof genericMemoryStores !== 'undefined' && genericMemoryStores['qualifications']) || (typeof inMemoryQualifications !== 'undefined' ? inMemoryQualifications : []),
      penalties: (typeof genericMemoryStores !== 'undefined' && genericMemoryStores['penalties']) || (typeof inMemoryPenalties !== 'undefined' ? inMemoryPenalties : []),
      performanceEvaluations: (typeof genericMemoryStores !== 'undefined' && genericMemoryStores['performance']) || (typeof inMemoryPerformanceEvaluations !== 'undefined' ? inMemoryPerformanceEvaluations : []),
      governingCourseAssignments: (typeof inMemoryEmployeeAssignments !== 'undefined' && inMemoryEmployeeAssignments) ? Object.values(inMemoryEmployeeAssignments) : [],
      entities: {
        'job_titles': (typeof inMemoryJobTitles !== 'undefined' && inMemoryJobTitles) ? inMemoryJobTitles : [],
        'job-titles': (typeof inMemoryJobTitles !== 'undefined' && inMemoryJobTitles) ? inMemoryJobTitles : [],
        'shift_systems': (typeof inMemoryShiftSystems !== 'undefined' && inMemoryShiftSystems) ? inMemoryShiftSystems : [],
        'shift-systems': (typeof inMemoryShiftSystems !== 'undefined' && inMemoryShiftSystems) ? inMemoryShiftSystems : [],
        'allowances_deductions': (typeof inMemoryAllowancesDeductions !== 'undefined' && inMemoryAllowancesDeductions) ? inMemoryAllowancesDeductions : [],
        'allowances-deductions': (typeof inMemoryAllowancesDeductions !== 'undefined' && inMemoryAllowancesDeductions) ? inMemoryAllowancesDeductions : [],
        'education_degrees': (typeof inMemoryEducationDegrees !== 'undefined' && inMemoryEducationDegrees) ? inMemoryEducationDegrees : [],
        'education-degrees': (typeof inMemoryEducationDegrees !== 'undefined' && inMemoryEducationDegrees) ? inMemoryEducationDegrees : [],
        'responsibility_allowances': (typeof inMemoryResponsibilityAllowances !== 'undefined' && inMemoryResponsibilityAllowances) ? inMemoryResponsibilityAllowances : [],
        'responsibility-allowances': (typeof inMemoryResponsibilityAllowances !== 'undefined' && inMemoryResponsibilityAllowances) ? inMemoryResponsibilityAllowances : [],
        'penalty_types': (typeof inMemoryPenaltyTypes !== 'undefined' && inMemoryPenaltyTypes) ? inMemoryPenaltyTypes : [],
        'penalty-types': (typeof inMemoryPenaltyTypes !== 'undefined' && inMemoryPenaltyTypes) ? inMemoryPenaltyTypes : [],
        'evaluation_forms': (typeof inMemoryEvaluationForms !== 'undefined' ? inMemoryEvaluationForms : (typeof CANONICAL_SEED_FORMS !== 'undefined' ? CANONICAL_SEED_FORMS : [])),
        'evaluation-forms': (typeof inMemoryEvaluationForms !== 'undefined' ? inMemoryEvaluationForms : (typeof CANONICAL_SEED_FORMS !== 'undefined' ? CANONICAL_SEED_FORMS : [])),
        'governing_courses': (typeof inMemoryGoverningCourses !== 'undefined' ? inMemoryGoverningCourses : []),
        'governing-courses': (typeof inMemoryGoverningCourses !== 'undefined' ? inMemoryGoverningCourses : []),
      }
    };
  }

  // --- Job Titles API (العناوين الوظيفية والمهنية) ---
  app.get('/api/job-titles', requireAuth, async (req, res) => {
    try {
      const statusParam = req.query.status as string;
      let query = db.select().from(schema.jobTitles).orderBy(asc(schema.jobTitles.name));
      if (statusParam) {
        query = query.where(eq(schema.jobTitles.status, statusParam)) as any;
      }
      let records = await query;
      if (records && records.length > 0) {
        return res.json(records.map(r => mapKeys(r, camelToSnake)));
      } else if (!statusParam) {
        // Auto-seed canonical job titles to database if empty
        for (const t of DEFAULT_JOB_TITLES) {
          await db.insert(schema.jobTitles).values({
            name: t.name,
            category: t.category,
            minGrade: t.min_grade,
            minStep: t.min_step,
            status: t.status,
            notes: t.notes
          }).catch(() => {});
        }
        records = await db.select().from(schema.jobTitles).orderBy(asc(schema.jobTitles.name));
        if (records && records.length > 0) {
          return res.json(records.map(r => mapKeys(r, camelToSnake)));
        }
      }
    } catch (error: any) {
      console.warn('Database fallback for job titles');
    }
    const statusParam = req.query.status as string;
    let list = inMemoryJobTitles;
    if (statusParam) {
      list = list.filter(t => t.status === statusParam);
    }
    res.json(list.map(t => mapKeys(t, camelToSnake)));
  });

  app.post('/api/job-titles', requireAuth, async (req, res) => {
    const { name, category, min_grade, minGrade, min_step, minStep, next_title_id, nextTitleId, status, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم العنوان الوظيفي مطلوب' });
    }
    const trimmedName = name.trim();
    const normalizeArabic = (text: string) => {
      if (!text) return '';
      return text
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/[ةه]/g, 'ه')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    // Uniqueness validation check
    let existingTitles: any[] = inMemoryJobTitles || [];
    try {
      const dbList = await db.select().from(schema.jobTitles);
      if (dbList && dbList.length > 0) existingTitles = dbList;
    } catch (e) {}

    const normInput = normalizeArabic(trimmedName);
    const isDuplicate = existingTitles.some(t => t.name && normalizeArabic(t.name) === normInput);
    if (isDuplicate) {
      return res.status(400).json({
        error: 'اسم العنوان الوظيفي مسجل مسبقاً في النظام، يجب أن يكون كل عنوان وظيفي مميزاً وفريداً.'
      });
    }

    const mGrade = min_grade !== undefined ? parseInt(min_grade) : (minGrade !== undefined ? parseInt(minGrade) : 7);
    const mStep = min_step !== undefined ? parseInt(min_step) : (minStep !== undefined ? parseInt(minStep) : 1);
    const nxtId = next_title_id !== undefined ? (next_title_id ? parseInt(next_title_id) : null) : (nextTitleId !== undefined ? (nextTitleId ? parseInt(nextTitleId) : null) : null);

    try {
      const [newRecord] = await db.insert(schema.jobTitles).values({
        name: trimmedName,
        category: category || 'عام',
        minGrade: mGrade,
        minStep: mStep,
        nextTitleId: nxtId,
        status: status || 'فعال',
        notes: notes || '',
      }).returning();
      if (newRecord) {
        saveLocalDb();
        return res.status(201).json(mapKeys(newRecord, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for create job title');
    }
    const newId = inMemoryJobTitles.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) + 1;
    const memItem = {
      id: newId,
      name: trimmedName,
      category: category || 'عام',
      min_grade: mGrade,
      minGrade: mGrade,
      min_step: mStep,
      minStep: mStep,
      next_title_id: nxtId,
      nextTitleId: nxtId,
      status: status || 'فعال',
      notes: notes || '',
      created_at: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    inMemoryJobTitles.push(memItem);
    saveLocalDb();
    res.status(201).json(mapKeys(memItem, camelToSnake));
  });

  app.put('/api/job-titles/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, category, min_grade, minGrade, min_step, minStep, next_title_id, nextTitleId, status, notes } = req.body;
      const normalizeArabic = (text: string) => {
        if (!text) return '';
        return text
          .replace(/[أإآا]/g, 'ا')
          .replace(/[ىي]/g, 'ي')
          .replace(/[ةه]/g, 'ه')
          .replace(/[\u064B-\u065F]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      };

      // Uniqueness validation check on rename
      if (name && name.trim()) {
        const trimmedName = name.trim();
        const normInput = normalizeArabic(trimmedName);
        let existingTitles: any[] = inMemoryJobTitles || [];
        try {
          const dbList = await db.select().from(schema.jobTitles);
          if (dbList && dbList.length > 0) existingTitles = dbList;
        } catch (e) {}

        const isDuplicate = existingTitles.some(t => 
          parseInt(t.id) !== id && t.name && normalizeArabic(t.name) === normInput
        );
        if (isDuplicate) {
          return res.status(400).json({
            error: 'اسم العنوان الوظيفي مسجل مسبقاً في النظام، يجب أن يكون كل عنوان وظيفي مميزاً وفريداً.'
          });
        }
      }

      const mGrade = min_grade !== undefined ? parseInt(min_grade) : (minGrade !== undefined ? parseInt(minGrade) : undefined);
      const mStep = min_step !== undefined ? parseInt(min_step) : (minStep !== undefined ? parseInt(minStep) : undefined);
      const nxtId = next_title_id !== undefined ? (next_title_id ? parseInt(next_title_id) : null) : (nextTitleId !== undefined ? (nextTitleId ? parseInt(nextTitleId) : null) : undefined);

      // Comprehensive referential guard: check if deactivating an in-use job title
      if (status === 'معطل' || status === 'غير فعال') {
        let dbEmployees = inMemoryEmployees || [];
        let dbTitles = inMemoryJobTitles || [];
        try {
          const dbEmpList = await db.select().from(schema.employees);
          if (dbEmpList && dbEmpList.length > 0) dbEmployees = dbEmpList;
          const dbTitleList = await db.select().from(schema.jobTitles);
          if (dbTitleList && dbTitleList.length > 0) dbTitles = dbTitleList;
        } catch (e) {}

        const refCtx = {
          ...buildRefContext(),
          employees: dbEmployees,
          entities: {
            ...buildRefContext().entities,
            'job_titles': dbTitles,
            'job-titles': dbTitles
          }
        };

        const refCheck = checkReferentialUsage('job_titles', id, true, refCtx);
        if (!refCheck.canProceed) {
          return res.status(400).json({ 
            error: refCheck.message, 
            details: refCheck.affectedSummary,
            count: refCheck.count,
            affectedEmployees: refCheck.affectedEmployees || []
          });
        }
      }

      // Get existing title name before updating to perform cascading rename if changed
      let oldTitle = inMemoryJobTitles.find(t => parseInt(String(t.id)) === id);
      try {
        const dbList = await db.select().from(schema.jobTitles).where(eq(schema.jobTitles.id, id));
        if (dbList && dbList.length > 0) oldTitle = dbList[0];
      } catch (e) {}
      const oldName = oldTitle?.name ? String(oldTitle.name).trim() : '';
      const newName = name ? name.trim() : oldName;

      try {
        const updateData: any = { updatedAt: new Date() };
        if (name) updateData.name = newName;
        if (category !== undefined) updateData.category = category;
        if (mGrade !== undefined) updateData.minGrade = mGrade;
        if (mStep !== undefined) updateData.minStep = mStep;
        if (nxtId !== undefined) updateData.nextTitleId = nxtId;
        if (status !== undefined) updateData.status = status;
        if (notes !== undefined) updateData.notes = notes;

        const [updated] = await db.update(schema.jobTitles)
          .set(updateData)
          .where(eq(schema.jobTitles.id, id))
          .returning();

        // If title name was updated, cascade change to all employee records and job assignments in DB
        if (oldName && newName && oldName !== newName) {
          try {
            await db.update(schema.employees)
              .set({ jobTitle: newName, updatedAt: new Date() })
              .where(or(
                eq(schema.employees.jobTitle, oldName),
                eq(schema.employees.jobTitleId, id)
              ));
            await db.update(schema.jobAssignments)
              .set({ jobTitle: newName })
              .where(or(
                eq(schema.jobAssignments.jobTitle, oldName),
                eq(schema.jobAssignments.jobTitleId, id)
              ));
          } catch (cascErr) {
            console.warn('Database fallback for cascading job title rename');
          }

          // Cascade in-memory employees and job assignments
          (inMemoryEmployees || []).forEach(emp => {
            const curTitle = String(emp.jobTitle || emp.job_title || '').trim();
            const curTitleId = parseInt(String(emp.jobTitleId || emp.job_title_id || '0'));
            if ((oldName && curTitle === oldName) || (curTitleId && curTitleId === id)) {
              emp.jobTitle = newName;
              emp.job_title = newName;
              emp.jobTitleId = id;
              emp.job_title_id = id;
              emp.updatedAt = new Date().toISOString();
              emp.updated_at = new Date().toISOString();
            }
          });

          const jaStore = genericMemoryStores['job-assignments'] || inMemoryJobAssignments || [];
          jaStore.forEach((ja: any) => {
            const jaTitle = String(ja.jobTitle || ja.job_title || '').trim();
            const jaTitleId = parseInt(String(ja.jobTitleId || ja.job_title_id || '0'));
            if ((oldName && jaTitle === oldName) || (jaTitleId && jaTitleId === id)) {
              ja.jobTitle = newName;
              ja.job_title = newName;
              ja.jobTitleId = id;
              ja.job_title_id = id;
            }
          });
        }

        if (updated) {
          saveLocalDb();
          return res.json(mapKeys(updated, camelToSnake));
        }
      } catch (error: any) {
        console.warn('Database fallback for update job title');
      }

      const idx = inMemoryJobTitles.findIndex(r => parseInt(String(r.id)) === id);
      if (idx !== -1) {
        inMemoryJobTitles[idx] = {
          ...inMemoryJobTitles[idx],
          name: newName,
          category: category !== undefined ? category : inMemoryJobTitles[idx].category,
          min_grade: mGrade !== undefined ? mGrade : inMemoryJobTitles[idx].min_grade,
          minGrade: mGrade !== undefined ? mGrade : inMemoryJobTitles[idx].minGrade,
          min_step: mStep !== undefined ? mStep : inMemoryJobTitles[idx].min_step,
          minStep: mStep !== undefined ? mStep : inMemoryJobTitles[idx].minStep,
          next_title_id: nxtId !== undefined ? nxtId : inMemoryJobTitles[idx].next_title_id,
          nextTitleId: nxtId !== undefined ? nxtId : inMemoryJobTitles[idx].nextTitleId,
          status: status !== undefined ? status : inMemoryJobTitles[idx].status,
          notes: notes !== undefined ? notes : inMemoryJobTitles[idx].notes,
          updated_at: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // If title name was updated, cascade in in-memory storage
        if (oldName && newName && oldName !== newName) {
          (inMemoryEmployees || []).forEach(emp => {
            const curTitle = String(emp.jobTitle || emp.job_title || '').trim();
            const curTitleId = parseInt(String(emp.jobTitleId || emp.job_title_id || '0'));
            if ((oldName && curTitle === oldName) || (curTitleId && curTitleId === id)) {
              emp.jobTitle = newName;
              emp.job_title = newName;
              emp.jobTitleId = id;
              emp.job_title_id = id;
              emp.updatedAt = new Date().toISOString();
              emp.updated_at = new Date().toISOString();
            }
          });

          const jaStore = genericMemoryStores['job-assignments'] || inMemoryJobAssignments || [];
          jaStore.forEach((ja: any) => {
            const jaTitle = String(ja.jobTitle || ja.job_title || '').trim();
            const jaTitleId = parseInt(String(ja.jobTitleId || ja.job_title_id || '0'));
            if ((oldName && jaTitle === oldName) || (jaTitleId && jaTitleId === id)) {
              ja.jobTitle = newName;
              ja.job_title = newName;
              ja.jobTitleId = id;
              ja.job_title_id = id;
            }
          });
        }

        saveLocalDb();
        return res.json(mapKeys(inMemoryJobTitles[idx], camelToSnake));
      }
      res.json({ id, name: newName, category, min_grade: mGrade, min_step: mStep, next_title_id: nxtId, status, notes });
    } catch (err: any) {
      console.error('Error updating job title:', err);
      res.status(500).json({ error: err.message || 'حدث خطأ أثناء تعديل العنوان الوظيفي' });
    }
  });

  app.delete('/api/job-titles/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'معرف العنوان الوظيفي غير صالح' });
      }

      // Comprehensive referential guard: check if deleting an in-use job title
      let dbEmployees = inMemoryEmployees || [];
      let dbTitles = inMemoryJobTitles || [];
      try {
        const dbEmpList = await db.select().from(schema.employees);
        if (dbEmpList && dbEmpList.length > 0) dbEmployees = dbEmpList;
        const dbTitleList = await db.select().from(schema.jobTitles);
        if (dbTitleList && dbTitleList.length > 0) dbTitles = dbTitleList;
      } catch (e) {}

      const refCtx = {
        ...buildRefContext(),
        employees: dbEmployees,
        entities: {
          ...buildRefContext().entities,
          'job_titles': dbTitles,
          'job-titles': dbTitles
        }
      };

      const refCheck = checkReferentialUsage('job_titles', id, false, refCtx);
      if (!refCheck.canProceed) {
        return res.status(400).json({ 
          error: refCheck.message, 
          details: refCheck.affectedSummary,
          count: refCheck.count,
          affectedEmployees: refCheck.affectedEmployees || []
        });
      }

      try {
        await db.delete(schema.jobTitles).where(eq(schema.jobTitles.id, id));
      } catch (error: any) {
        console.warn('Database fallback for delete job title');
      }
      inMemoryJobTitles = inMemoryJobTitles.filter(r => r.id !== id);
      saveLocalDb();
      res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting job title:', err);
      res.status(500).json({ error: err.message || 'حدث خطأ أثناء حذف العنوان الوظيفي' });
    }
  });

  // --- Salary Scale API ---
  app.get('/api/salary-scale', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.salaryScale).orderBy(asc(schema.salaryScale.grade), asc(schema.salaryScale.step));
      if (records && records.length > 0) {
        return res.json(records);
      }
    } catch (error: any) {
      console.warn('Database fallback for salary scale query');
    }
    if (inMemorySalaryScale.length === 0) {
      inMemorySalaryScale = getUnifiedSalaryScaleDefaults();
    }
    res.json(inMemorySalaryScale);
  });

  app.post('/api/salary-scale', requireAuth, async (req, res) => {
    const { grade, step, amount, effective_from, effectiveFrom } = req.body;
    const effDate = effective_from || effectiveFrom || '2026-08-27';
    try {
      const [newRecord] = await db.insert(schema.salaryScale).values({
        grade: parseInt(grade),
        step: parseInt(step),
        amount: parseInt(amount),
        effectiveFrom: effDate,
      }).returning();
      if (newRecord) return res.status(201).json(newRecord);
    } catch (error: any) {
      console.warn('Database fallback for create salary scale');
    }
    const memRecord = {
      id: inMemorySalaryScale.length + 1,
      grade: parseInt(grade),
      step: parseInt(step),
      amount: parseInt(amount),
      effectiveFrom: effDate,
      effective_from: effDate,
      createdAt: new Date().toISOString()
    };
    inMemorySalaryScale.push(memRecord);
    saveLocalDb();
    res.status(201).json(memRecord);
  });

  app.post('/api/salary-scale/bulk', requireAuth, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body must be an array' });
    }
    try {
      await db.delete(schema.salaryScale);
      const toInsert = items.map(item => ({
        grade: parseInt(item.grade),
        step: parseInt(item.step),
        amount: parseInt(item.amount),
        effectiveFrom: item.effective_from || item.effectiveFrom || '2026-08-27',
      }));
      if (toInsert.length > 0) {
        await db.insert(schema.salaryScale).values(toInsert);
      }
    } catch (error: any) {
      console.warn('Database fallback for bulk salary scale');
    }
    inMemorySalaryScale = items.map((item, idx) => ({
      id: idx + 1,
      grade: parseInt(item.grade),
      step: parseInt(item.step),
      amount: parseInt(item.amount),
      effectiveFrom: item.effective_from || item.effectiveFrom || '2026-08-27',
      effective_from: item.effective_from || item.effectiveFrom || '2026-08-27',
      createdAt: new Date().toISOString()
    }));
    saveLocalDb();
    res.json({ success: true, count: inMemorySalaryScale.length });
  });

  app.put('/api/salary-scale/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { grade, step, amount } = req.body;
    try {
      const [updated] = await db.update(schema.salaryScale)
        .set({
          grade: grade !== undefined ? parseInt(grade) : undefined,
          step: step !== undefined ? parseInt(step) : undefined,
          amount: amount !== undefined ? parseInt(amount) : undefined,
        })
        .where(eq(schema.salaryScale.id, id))
        .returning();
      if (updated) return res.json(updated);
    } catch (error: any) {
      console.warn('Database fallback for update salary scale');
    }
    const idx = inMemorySalaryScale.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemorySalaryScale[idx] = {
        ...inMemorySalaryScale[idx],
        grade: grade !== undefined ? parseInt(grade) : inMemorySalaryScale[idx].grade,
        step: step !== undefined ? parseInt(step) : inMemorySalaryScale[idx].step,
        amount: amount !== undefined ? parseInt(amount) : inMemorySalaryScale[idx].amount
      };
      saveLocalDb();
      return res.json(inMemorySalaryScale[idx]);
    }
    res.json({ id, grade, step, amount });
  });

  app.delete('/api/salary-scale/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.salaryScale).where(eq(schema.salaryScale.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete salary scale');
    }
    inMemorySalaryScale = inMemorySalaryScale.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Grade Promotion Rules API (سنوات الترفيع القانونية لكل درجة) ---
  app.get('/api/grade-promotion-rules', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.gradePromotionRules).orderBy(asc(schema.gradePromotionRules.grade));
      if (records && records.length > 0) {
        return res.json(records.map(r => mapKeys(r, camelToSnake)));
      }
    } catch (error: any) {
      console.warn('Database fallback for grade promotion rules query');
    }
    res.json(inMemoryGradePromotionRules.map(r => mapKeys(r, camelToSnake)));
  });

  app.put('/api/grade-promotion-rules/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { promotion_years, promotionYears, notes } = req.body;
    const pYears = promotion_years !== undefined ? (promotion_years === null || promotion_years === '' ? null : parseInt(promotion_years)) : (promotionYears !== undefined ? (promotionYears === null || promotionYears === '' ? null : parseInt(promotionYears)) : undefined);
    
    try {
      const updateData: any = { updatedAt: new Date() };
      if (pYears !== undefined) updateData.promotionYears = pYears;
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db.update(schema.gradePromotionRules)
        .set(updateData)
        .where(eq(schema.gradePromotionRules.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryGradePromotionRules.findIndex(r => r.id === id || r.grade === id);
        if (idx !== -1) {
          inMemoryGradePromotionRules[idx] = { ...inMemoryGradePromotionRules[idx], ...mapKeys(updated, camelToSnake), ...updated };
        }
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for update grade promotion rule');
    }

    const idx = inMemoryGradePromotionRules.findIndex(r => r.id === id || r.grade === id);
    if (idx !== -1) {
      if (pYears !== undefined) {
        inMemoryGradePromotionRules[idx].promotionYears = pYears;
        inMemoryGradePromotionRules[idx].promotion_years = pYears;
      }
      if (notes !== undefined) inMemoryGradePromotionRules[idx].notes = notes;
      inMemoryGradePromotionRules[idx].updatedAt = new Date().toISOString();
      saveLocalDb();
      return res.json(mapKeys(inMemoryGradePromotionRules[idx], camelToSnake));
    }

    res.json({ id, promotion_years: pYears, notes });
  });

  app.put('/api/grade-promotion-rules', requireAuth, async (req, res) => {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Body must be an array of rules' });
    }
    try {
      for (const item of items) {
        const g = parseInt(item.grade);
        const pYears = item.promotion_years !== undefined ? (item.promotion_years === null || item.promotion_years === '' ? null : parseInt(item.promotion_years)) : (item.promotionYears !== undefined ? (item.promotionYears === null || item.promotionYears === '' ? null : parseInt(item.promotionYears)) : null);
        await db.insert(schema.gradePromotionRules).values({
          grade: g,
          promotionYears: pYears,
          notes: item.notes || ''
        }).onConflictDoUpdate({
          target: schema.gradePromotionRules.grade,
          set: {
            promotionYears: pYears,
            notes: item.notes || '',
            updatedAt: new Date()
          }
        });
      }
    } catch (error: any) {
      console.warn('Database fallback for bulk grade promotion rules');
    }

    items.forEach(item => {
      const idx = inMemoryGradePromotionRules.findIndex(r => r.grade === parseInt(item.grade) || r.id === parseInt(item.id));
      const pYears = item.promotion_years !== undefined ? (item.promotion_years === null || item.promotion_years === '' ? null : parseInt(item.promotion_years)) : (item.promotionYears !== undefined ? (item.promotionYears === null || item.promotionYears === '' ? null : parseInt(item.promotionYears)) : null);
      if (idx !== -1) {
        inMemoryGradePromotionRules[idx].promotionYears = pYears;
        inMemoryGradePromotionRules[idx].promotion_years = pYears;
        if (item.notes !== undefined) inMemoryGradePromotionRules[idx].notes = item.notes;
      }
    });
    saveLocalDb();
    res.json({ success: true, count: items.length });
  });

  // --- Commendation Types API (أنواع كتب الشكر والتقدير) ---
  app.get('/api/commendation-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.commendationTypes).orderBy(asc(schema.commendationTypes.id));
      if (records && records.length > 0) return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (e) {
      console.warn('Database fallback for commendation-types');
    }
    res.json(inMemoryCommendationTypes.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/commendation-types', requireAuth, async (req, res) => {
    const { name, credit_months, creditMonths, status, notes } = req.body;
    const cMonths = parseInt(credit_months ?? creditMonths ?? 1);
    try {
      const [inserted] = await db.insert(schema.commendationTypes).values({
        name,
        creditMonths: cMonths,
        status: status || 'فعال',
        notes: notes || '',
      }).returning();
      if (inserted) {
        inMemoryCommendationTypes.push(mapKeys(inserted, camelToSnake));
        saveLocalDb();
        return res.status(201).json(mapKeys(inserted, camelToSnake));
      }
    } catch (e) {
      console.warn('Database fallback for create commendation-type');
    }
    const newId = inMemoryCommendationTypes.length + 1;
    const mem = { id: newId, name, credit_months: cMonths, creditMonths: cMonths, status: status || 'فعال', notes: notes || '' };
    inMemoryCommendationTypes.push(mem);
    saveLocalDb();
    res.status(201).json(mem);
  });

  app.put('/api/commendation-types/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, credit_months, creditMonths, status, notes } = req.body;
    const cMonths = credit_months !== undefined ? parseInt(credit_months) : (creditMonths !== undefined ? parseInt(creditMonths) : undefined);
    try {
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (cMonths !== undefined) updateData.creditMonths = cMonths;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const [updated] = await db.update(schema.commendationTypes)
        .set(updateData)
        .where(eq(schema.commendationTypes.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryCommendationTypes.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryCommendationTypes[idx] = { ...inMemoryCommendationTypes[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (e) {
      console.warn('Database fallback for update commendation-type');
    }
    const idx = inMemoryCommendationTypes.findIndex(r => r.id === id);
    if (idx !== -1) {
      if (name !== undefined) inMemoryCommendationTypes[idx].name = name;
      if (cMonths !== undefined) {
        inMemoryCommendationTypes[idx].credit_months = cMonths;
        inMemoryCommendationTypes[idx].creditMonths = cMonths;
      }
      if (status !== undefined) inMemoryCommendationTypes[idx].status = status;
      if (notes !== undefined) inMemoryCommendationTypes[idx].notes = notes;
      saveLocalDb();
      return res.json(inMemoryCommendationTypes[idx]);
    }
    res.json({ id, name, status });
  });

  app.delete('/api/commendation-types/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.commendationTypes).where(eq(schema.commendationTypes.id, id));
    } catch (e) {
      console.warn('Database fallback for delete commendation-type');
    }
    inMemoryCommendationTypes = inMemoryCommendationTypes.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Employee Commendations API (سجل كتب الشكر الممنوحة للموظفين) ---
  app.get('/api/employee-commendations', requireAuth, async (req, res) => {
    const empIdParam = req.query.employeeId || req.query.employee_id;
    const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
    try {
      let query = db.select().from(schema.employeeCommendations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.employeeCommendations).where(eq(schema.employeeCommendations.employeeId, employeeId)) as any;
      }
      const records = await query.orderBy(desc(schema.employeeCommendations.createdAt));
      if (records && records.length > 0) return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (e) {
      console.warn('Database fallback for employee-commendations');
    }
    let list = inMemoryEmployeeCommendations;
    if (employeeId) list = list.filter(r => r.employee_id === employeeId || r.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/employee-commendations', requireAuth, async (req, res) => {
    const data = req.body;
    const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
    if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

    let creditMonthsSnapshot = data.credit_months_snapshot !== undefined ? parseInt(data.credit_months_snapshot) : (data.creditMonthsSnapshot !== undefined ? parseInt(data.creditMonthsSnapshot) : undefined);
    if (creditMonthsSnapshot === undefined && (data.commendation_type_id || data.commendationTypeId)) {
      const typeId = parseInt(data.commendation_type_id || data.commendationTypeId);
      const foundType = inMemoryCommendationTypes.find(t => t.id === typeId);
      creditMonthsSnapshot = foundType ? (foundType.credit_months || foundType.creditMonths || 1) : 1;
    }
    if (creditMonthsSnapshot === undefined) creditMonthsSnapshot = 1;

    try {
      const [inserted] = await db.insert(schema.employeeCommendations).values({
        employeeId,
        commendationTypeId: data.commendation_type_id ? parseInt(data.commendation_type_id) : (data.commendationTypeId ? parseInt(data.commendationTypeId) : null),
        creditMonthsSnapshot,
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        issuer: data.issuer || 'الوزارة',
        reason: data.reason || '',
        isHidden: data.is_hidden === true || data.isHidden === true,
        notes: data.notes || '',
      }).returning();
      if (inserted) {
        inMemoryEmployeeCommendations.push(mapKeys(inserted, camelToSnake));
        saveLocalDb();
        triggerRecalculateEligibility(employeeId).catch(() => {});
        return res.status(201).json(mapKeys(inserted, camelToSnake));
      }
    } catch (e) {
      console.warn('Database fallback for create employee-commendation');
    }
    const newId = inMemoryEmployeeCommendations.length + 1;
    const mem = { id: newId, employee_id: employeeId, ...data, credit_months_snapshot: creditMonthsSnapshot, creditMonthsSnapshot, created_at: new Date().toISOString() };
    inMemoryEmployeeCommendations.push(mem);
    saveLocalDb();
    triggerRecalculateEligibility(employeeId).catch(() => {});
    res.status(201).json(mem);
  });

  app.put('/api/employee-commendations/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const data = req.body;
    try {
      const updateData: any = {};
      if (data.order_number !== undefined || data.orderNumber !== undefined) updateData.orderNumber = data.order_number || data.orderNumber;
      if (data.order_date !== undefined || data.orderDate !== undefined) updateData.orderDate = data.order_date || data.orderDate;
      if (data.issuer !== undefined) updateData.issuer = data.issuer;
      if (data.reason !== undefined) updateData.reason = data.reason;
      if (data.is_hidden !== undefined || data.isHidden !== undefined) updateData.isHidden = data.is_hidden ?? data.isHidden;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.credit_months_snapshot !== undefined || data.creditMonthsSnapshot !== undefined) updateData.creditMonthsSnapshot = parseInt(data.credit_months_snapshot || data.creditMonthsSnapshot);

      const [updated] = await db.update(schema.employeeCommendations)
        .set(updateData)
        .where(eq(schema.employeeCommendations.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryEmployeeCommendations.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryEmployeeCommendations[idx] = { ...inMemoryEmployeeCommendations[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        if (updated.employeeId) triggerRecalculateEligibility(updated.employeeId).catch(() => {});
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (e) {
      console.warn('Database fallback for update employee-commendation');
    }
    const idx = inMemoryEmployeeCommendations.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryEmployeeCommendations[idx] = { ...inMemoryEmployeeCommendations[idx], ...data };
      saveLocalDb();
      const empId = inMemoryEmployeeCommendations[idx].employee_id || inMemoryEmployeeCommendations[idx].employeeId;
      if (empId) triggerRecalculateEligibility(empId).catch(() => {});
      return res.json(inMemoryEmployeeCommendations[idx]);
    }
    res.json({ id, ...data });
  });

  app.delete('/api/employee-commendations/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const existing = inMemoryEmployeeCommendations.find(r => r.id === id);
    try {
      await db.delete(schema.employeeCommendations).where(eq(schema.employeeCommendations.id, id));
    } catch (e) {
      console.warn('Database fallback for delete employee-commendation');
    }
    inMemoryEmployeeCommendations = inMemoryEmployeeCommendations.filter(r => r.id !== id);
    saveLocalDb();
    if (existing?.employee_id || existing?.employeeId) {
      triggerRecalculateEligibility(existing.employee_id || existing.employeeId).catch(() => {});
    }
    res.json({ success: true });
  });

  // --- Commendation Rules Settings API (إعدادات وضوابط كتب الشكر) ---
  app.get('/api/commendation-rules-settings', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.commendationRulesSettings).where(eq(schema.commendationRulesSettings.configKey, 'default_commendation_rules'));
      if (records && records.length > 0) {
        const item = records[0];
        inMemoryCommendationRulesSettings = {
          ...inMemoryCommendationRulesSettings,
          ...mapKeys(item, camelToSnake),
          degreeTrackAutoSettlement: Boolean(item.degreeTrackAutoSettlement),
          degree_track_auto_settlement: Boolean(item.degreeTrackAutoSettlement),
          reminderDaysCourse: item.reminderDaysCourse ?? 30,
          reminder_days_course: item.reminderDaysCourse ?? 30,
          reminderDaysPenalty: item.reminderDaysPenalty ?? 15,
          reminder_days_penalty: item.reminderDaysPenalty ?? 15,
          reminderDaysLeave: item.reminderDaysLeave ?? 30,
          reminder_days_leave: item.reminderDaysLeave ?? 30,
          reminderDaysEvaluation: item.reminderDaysEvaluation ?? 30,
          reminder_days_evaluation: item.reminderDaysEvaluation ?? 30,
          reminderDaysAbsence: item.reminderDaysAbsence ?? 10,
          reminder_days_absence: item.reminderDaysAbsence ?? 10
        };
        return res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
      }
    } catch (e) {
      console.warn('Database fallback for commendation-rules-settings');
    }
    res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
  });

  app.put('/api/commendation-rules-settings', requireAuth, async (req, res) => {
    const {
      max_per_year, maxPerYear,
      allowed_combinations, allowedCombinations,
      degree_track_auto_settlement, degreeTrackAutoSettlement,
      reminder_days_course, reminderDaysCourse,
      reminder_days_penalty, reminderDaysPenalty,
      reminder_days_leave, reminderDaysLeave,
      reminder_days_evaluation, reminderDaysEvaluation,
      reminder_days_absence, reminderDaysAbsence
    } = req.body;

    const maxVal = max_per_year !== undefined ? parseInt(max_per_year) : (maxPerYear !== undefined ? parseInt(maxPerYear) : 3);
    const combos = typeof (allowed_combinations || allowedCombinations) === 'object' ? JSON.stringify(allowed_combinations || allowedCombinations) : (allowed_combinations || allowedCombinations || '');
    const autoSettlementVal = Boolean(degree_track_auto_settlement ?? degreeTrackAutoSettlement);

    const rCourse = parseInt(reminder_days_course ?? reminderDaysCourse ?? inMemoryCommendationRulesSettings.reminderDaysCourse ?? 30);
    const rPenalty = parseInt(reminder_days_penalty ?? reminderDaysPenalty ?? inMemoryCommendationRulesSettings.reminderDaysPenalty ?? 15);
    const rLeave = parseInt(reminder_days_leave ?? reminderDaysLeave ?? inMemoryCommendationRulesSettings.reminderDaysLeave ?? 30);
    const rEval = parseInt(reminder_days_evaluation ?? reminderDaysEvaluation ?? inMemoryCommendationRulesSettings.reminderDaysEvaluation ?? 30);
    const rAbs = parseInt(reminder_days_absence ?? reminderDaysAbsence ?? inMemoryCommendationRulesSettings.reminderDaysAbsence ?? 10);

    try {
      await db.insert(schema.commendationRulesSettings).values({
        configKey: 'default_commendation_rules',
        maxPerYear: maxVal,
        allowedCombinations: combos,
        degreeTrackAutoSettlement: autoSettlementVal,
        reminderDaysCourse: rCourse,
        reminderDaysPenalty: rPenalty,
        reminderDaysLeave: rLeave,
        reminderDaysEvaluation: rEval,
        reminderDaysAbsence: rAbs,
      }).onConflictDoUpdate({
        target: schema.commendationRulesSettings.configKey,
        set: {
          maxPerYear: maxVal,
          allowedCombinations: combos,
          degreeTrackAutoSettlement: autoSettlementVal,
          reminderDaysCourse: rCourse,
          reminderDaysPenalty: rPenalty,
          reminderDaysLeave: rLeave,
          reminderDaysEvaluation: rEval,
          reminderDaysAbsence: rAbs,
          updatedAt: new Date()
        }
      });
    } catch (e) {
      console.warn('Database fallback for update commendation-rules-settings');
    }
    inMemoryCommendationRulesSettings = {
      ...inMemoryCommendationRulesSettings,
      max_per_year: maxVal,
      maxPerYear: maxVal,
      allowed_combinations: combos,
      allowedCombinations: combos,
      degree_track_auto_settlement: autoSettlementVal,
      degreeTrackAutoSettlement: autoSettlementVal,
      reminder_days_course: rCourse,
      reminderDaysCourse: rCourse,
      reminder_days_penalty: rPenalty,
      reminderDaysPenalty: rPenalty,
      reminder_days_leave: rLeave,
      reminderDaysLeave: rLeave,
      reminder_days_evaluation: rEval,
      reminderDaysEvaluation: rEval,
      reminder_days_absence: rAbs,
      reminderDaysAbsence: rAbs
    };
    saveLocalDb();
    res.json(mapKeys(inMemoryCommendationRulesSettings, camelToSnake));
  });

  // --- Allowances and Deductions API ---
  app.get('/api/allowances-deductions', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.allowancesDeductions).orderBy(asc(schema.allowancesDeductions.id));
      if (records && records.length > 0) return res.json(records);
    } catch (error: any) {
      console.warn('Database fallback for allowances/deductions');
    }
    res.json(inMemoryAllowancesDeductions);
  });

  app.post('/api/allowances-deductions', requireAuth, async (req, res) => {
    const { name, type, calcType, value, status } = req.body;
    try {
      const [newRecord] = await db.insert(schema.allowancesDeductions).values({
        name,
        type,
        calcType,
        value: parseInt(value),
        status: status || 'فعال',
      }).returning();
      if (newRecord) return res.status(201).json(newRecord);
    } catch (error: any) {
      console.warn('Database fallback for create allowance');
    }
    const memItem = {
      id: inMemoryAllowancesDeductions.length + 1,
      name,
      type,
      calcType,
      value: parseInt(value),
      status: status || 'فعال',
      createdAt: new Date().toISOString()
    };
    inMemoryAllowancesDeductions.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/allowances-deductions/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, type, calcType, value, status } = req.body;

    if (status === 'موقوف' || status === 'غير فعال' || status === 'معطل') {
      const refCheck = checkReferentialUsage('allowances_deductions', id, true, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    try {
      const [updated] = await db.update(schema.allowancesDeductions)
        .set({
          name,
          type,
          calcType,
          value: value !== undefined ? parseInt(value) : undefined,
          status: status !== undefined ? status : undefined,
        })
        .where(eq(schema.allowancesDeductions.id, id))
        .returning();
      if (updated) return res.json(updated);
    } catch (error: any) {
      console.warn('Database fallback for update allowance');
    }
    const idx = inMemoryAllowancesDeductions.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryAllowancesDeductions[idx] = {
        ...inMemoryAllowancesDeductions[idx],
        name: name || inMemoryAllowancesDeductions[idx].name,
        type: type || inMemoryAllowancesDeductions[idx].type,
        calcType: calcType || inMemoryAllowancesDeductions[idx].calcType,
        value: value !== undefined ? parseInt(value) : inMemoryAllowancesDeductions[idx].value,
        status: status || inMemoryAllowancesDeductions[idx].status
      };
      saveLocalDb();
      return res.json(inMemoryAllowancesDeductions[idx]);
    }
    res.json({ id, name, type, calcType, value, status });
  });

  app.delete('/api/allowances-deductions/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('allowances_deductions', id, false, buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.allowancesDeductions).where(eq(schema.allowancesDeductions.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete allowance');
    }
    inMemoryAllowancesDeductions = inMemoryAllowancesDeductions.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Work Locations API ---
  app.get('/api/work-locations', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.workLocations).orderBy(asc(schema.workLocations.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for work locations');
    }
    res.json(inMemoryWorkLocations);
  });

  app.post('/api/work-locations', requireAuth, async (req, res) => {
    const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body;
    const locName = String(name || '').trim();
    if (!locName) {
      return res.status(400).json({ error: 'اسم موقع العمل مطلوب' });
    }
    {
      const normalize = (s: string) => s.trim().toLowerCase();
      let existingLocs: any[] = [];
      try {
        existingLocs = await db.select().from(schema.workLocations);
      } catch (error: any) {
        console.warn('Database fallback for work location duplicate check');
      }
      const allLocs = [...existingLocs, ...inMemoryWorkLocations];
      if (allLocs.some(l => normalize(String(l.name || '')) === normalize(locName))) {
        return res.status(400).json({ error: `موقع العمل (${locName}) موجود بالفعل` });
      }
    }
    try {
      const [newRecord] = await db.insert(schema.workLocations).values({
        name,
        province,
        allowanceAmount: allowance_amount !== undefined ? parseInt(allowance_amount) : 0,
        workStartHour: work_start_hour || '08:00',
        workEndHour: work_end_hour || '15:00',
      }).returning();
      if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for create work location');
    }
    const memItem = {
      id: inMemoryWorkLocations.length + 1,
      name,
      province,
      allowance_amount: allowance_amount !== undefined ? parseInt(allowance_amount) : 0,
      work_start_hour: work_start_hour || '08:00',
      work_end_hour: work_end_hour || '15:00',
      created_at: new Date().toISOString()
    };
    inMemoryWorkLocations.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/work-locations/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body;
    try {
      const [updated] = await db.update(schema.workLocations)
        .set({
          name,
          province,
          allowanceAmount: allowance_amount !== undefined ? parseInt(allowance_amount) : undefined,
          workStartHour: work_start_hour !== undefined ? work_start_hour : undefined,
          workEndHour: work_end_hour !== undefined ? work_end_hour : undefined,
        })
        .where(eq(schema.workLocations.id, id))
        .returning();
      if (updated) return res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for update work location');
    }
    const idx = inMemoryWorkLocations.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryWorkLocations[idx] = {
        ...inMemoryWorkLocations[idx],
        name: name || inMemoryWorkLocations[idx].name,
        province: province || inMemoryWorkLocations[idx].province,
        allowance_amount: allowance_amount !== undefined ? parseInt(allowance_amount) : inMemoryWorkLocations[idx].allowance_amount,
        work_start_hour: work_start_hour || inMemoryWorkLocations[idx].work_start_hour,
        work_end_hour: work_end_hour || inMemoryWorkLocations[idx].work_end_hour
      };
      saveLocalDb();
      return res.json(inMemoryWorkLocations[idx]);
    }
    res.json({ id, name, province, allowance_amount, work_start_hour, work_end_hour });
  });

  app.delete('/api/work-locations/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.workLocations).where(eq(schema.workLocations.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete work location');
    }
    inMemoryWorkLocations = inMemoryWorkLocations.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- أنواع الخدمة (service types) API: قائمة قابلة للتوسيع بلا تكرار ---
  app.get('/api/service-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.serviceTypes).orderBy(asc(schema.serviceTypes.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for service types');
    }
    res.json(inMemoryServiceTypes);
  });

  app.post('/api/service-types', requireAuth, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'اسم نوع الخدمة مطلوب' });
    }
    const normalize = (s: string) => s.trim().toLowerCase();
    let existingRows: any[] = [];
    try {
      existingRows = await db.select().from(schema.serviceTypes);
    } catch (error: any) {
      console.warn('Database fallback for service types duplicate check');
    }
    const allNames = [...existingRows, ...inMemoryServiceTypes].map(r => normalize(String(r.name || '')));
    if (allNames.includes(normalize(name))) {
      return res.status(400).json({ error: `نوع الخدمة (${name}) موجود بالفعل` });
    }
    let newRecord: any = null;
    try {
      const [inserted] = await db.insert(schema.serviceTypes).values({ name }).returning();
      newRecord = inserted;
    } catch (error: any) {
      console.warn('Database fallback for create service type');
    }
    const memItem = newRecord || { id: (inMemoryServiceTypes.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1, name, created_at: new Date().toISOString() };
    inMemoryServiceTypes.push(mapKeys(memItem, camelToSnake));
    saveLocalDb();
    res.status(201).json(mapKeys(memItem, camelToSnake));
  });

  // --- حالات الموظف (employee statuses) API: قائمة قابلة للتوسيع بلا تكرار ---
  app.get('/api/employee-statuses', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.employeeStatuses).orderBy(asc(schema.employeeStatuses.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for employee statuses');
    }
    res.json(inMemoryEmployeeStatuses);
  });

  app.post('/api/employee-statuses', requireAuth, async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'اسم حالة الموظف مطلوب' });
    }
    const normalize = (s: string) => s.trim().toLowerCase();
    let existingRows: any[] = [];
    try {
      existingRows = await db.select().from(schema.employeeStatuses);
    } catch (error: any) {
      console.warn('Database fallback for employee statuses duplicate check');
    }
    const allNames = [...existingRows, ...inMemoryEmployeeStatuses].map(r => normalize(String(r.name || '')));
    if (allNames.includes(normalize(name))) {
      return res.status(400).json({ error: `حالة الموظف (${name}) موجودة بالفعل` });
    }
    let newRecord: any = null;
    try {
      const [inserted] = await db.insert(schema.employeeStatuses).values({ name }).returning();
      newRecord = inserted;
    } catch (error: any) {
      console.warn('Database fallback for create employee status');
    }
    const memItem = newRecord || { id: (inMemoryEmployeeStatuses.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1, name, created_at: new Date().toISOString() };
    inMemoryEmployeeStatuses.push(mapKeys(memItem, camelToSnake));
    saveLocalDb();
    res.status(201).json(mapKeys(memItem, camelToSnake));
  });

  // حذف حالة موظف: مسموح فقط بشرط ألا يستخدمها أي موظف حالياً (سيطرة على إدارة الحالات
  // كي لا تُحذف حالة أُضيفت بالخطأ وتؤثر على موظفين فعليين يحملونها).
  app.delete('/api/employee-statuses/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    try {
      let statusRecord: any = null;
      try {
        const [row] = await db.select().from(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
        statusRecord = row || null;
      } catch (err) {
        console.warn('Database fallback for employee status lookup');
      }
      if (!statusRecord) {
        statusRecord = inMemoryEmployeeStatuses.find(r => parseInt(String(r.id)) === id) || null;
      }
      if (!statusRecord) {
        return res.status(404).json({ error: 'حالة الموظف غير موجودة' });
      }
      const statusName = String(statusRecord.name || '').trim();

      // فحص الارتباط: هل يوجد موظف واحد أو أكثر يحمل هذه الحالة حالياً؟
      let usedCount = 0;
      try {
        const rows = await db.select().from(schema.employees).where(eq(schema.employees.status, statusName));
        usedCount = rows.length;
      } catch (err) {
        console.warn('Database fallback for employee status usage check');
      }
      if (usedCount === 0) {
        usedCount = inMemoryEmployees.filter(e => String(e.status || '').trim() === statusName).length;
      }
      if (usedCount > 0) {
        return res.status(400).json({
          error: `لا يمكن حذف حالة (${statusName})، مستخدمة حالياً من قبل ${usedCount} موظف/ة. يجب تغيير حالة هؤلاء الموظفين أولاً قبل حذف هذه الحالة.`,
          count: usedCount
        });
      }

      try {
        await db.delete(schema.employeeStatuses).where(eq(schema.employeeStatuses.id, id));
      } catch (err) {
        console.warn('Database fallback for delete employee status');
      }
      inMemoryEmployeeStatuses = inMemoryEmployeeStatuses.filter(r => parseInt(String(r.id)) !== id);
      saveLocalDb();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting employee status:', error);
      res.status(500).json({ error: error.message || 'فشل حذف حالة الموظف' });
    }
  });

  // --- Education Degrees API ---
  app.get('/api/education-degrees', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.educationDegrees).orderBy(asc(schema.educationDegrees.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for education degrees');
    }
    res.json(inMemoryEducationDegrees);
  });

  app.post('/api/education-degrees', requireAuth, async (req, res) => {
    const { 
      name, 
      is_higher_education, isHigherEducation, 
      allowance_rate, allowanceRate, 
      higher_allowance_rate, higherAllowanceRate, 
      baseline_grade, baselineGrade, 
      baseline_step, baselineStep 
    } = req.body;

    const isHigher = is_higher_education !== undefined ? is_higher_education === true : isHigherEducation === true;
    const allRate = allowance_rate !== undefined ? parseInt(allowance_rate) : (allowanceRate !== undefined ? parseInt(allowanceRate) : 0);
    const hAllRate = higher_allowance_rate !== undefined ? parseInt(higher_allowance_rate) : (higherAllowanceRate !== undefined ? parseInt(higherAllowanceRate) : 0);
    const bGrade = baseline_grade !== undefined ? parseInt(baseline_grade) : (baselineGrade !== undefined ? parseInt(baselineGrade) : 7);
    const bStep = baseline_step !== undefined ? parseInt(baseline_step) : (baselineStep !== undefined ? parseInt(baselineStep) : 1);

    try {
      const [newRecord] = await db.insert(schema.educationDegrees).values({
        name,
        isHigherEducation: isHigher,
        allowanceRate: allRate,
        higherAllowanceRate: hAllRate,
        baselineGrade: bGrade,
        baselineStep: bStep,
      }).returning();
      if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for create education degree');
    }
    const memItem = {
      id: inMemoryEducationDegrees.length + 1,
      name,
      is_higher_education: isHigher,
      isHigherEducation: isHigher,
      allowance_rate: allRate,
      allowanceRate: allRate,
      higher_allowance_rate: hAllRate,
      higherAllowanceRate: hAllRate,
      baseline_grade: bGrade,
      baselineGrade: bGrade,
      baseline_step: bStep,
      baselineStep: bStep,
      status: 'فعال',
      created_at: new Date().toISOString()
    };
    inMemoryEducationDegrees.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/education-degrees/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { 
      name, 
      is_higher_education, isHigherEducation, 
      allowance_rate, allowanceRate, 
      higher_allowance_rate, higherAllowanceRate, 
      baseline_grade, baselineGrade, 
      baseline_step, baselineStep, 
      status 
    } = req.body;

    if (status === 'معطل' || status === 'غير فعال') {
      const refCheck = checkReferentialUsage('education_degrees', id, true, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    const isHigher = is_higher_education !== undefined ? is_higher_education === true : (isHigherEducation !== undefined ? isHigherEducation === true : undefined);
    const allRate = allowance_rate !== undefined ? parseInt(allowance_rate) : (allowanceRate !== undefined ? parseInt(allowanceRate) : undefined);
    const hAllRate = higher_allowance_rate !== undefined ? parseInt(higher_allowance_rate) : (higherAllowanceRate !== undefined ? parseInt(higherAllowanceRate) : undefined);
    const bGrade = baseline_grade !== undefined ? parseInt(baseline_grade) : (baselineGrade !== undefined ? parseInt(baselineGrade) : undefined);
    const bStep = baseline_step !== undefined ? parseInt(baseline_step) : (baselineStep !== undefined ? parseInt(baselineStep) : undefined);

    try {
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (isHigher !== undefined) updateData.isHigherEducation = isHigher;
      if (allRate !== undefined) updateData.allowanceRate = allRate;
      if (hAllRate !== undefined) updateData.higherAllowanceRate = hAllRate;
      if (bGrade !== undefined) updateData.baselineGrade = bGrade;
      if (bStep !== undefined) updateData.baselineStep = bStep;

      const [updated] = await db.update(schema.educationDegrees)
        .set(updateData)
        .where(eq(schema.educationDegrees.id, id))
        .returning();
      if (updated) {
        const idx = inMemoryEducationDegrees.findIndex(r => r.id === id);
        if (idx !== -1) inMemoryEducationDegrees[idx] = { ...inMemoryEducationDegrees[idx], ...mapKeys(updated, camelToSnake) };
        saveLocalDb();
        return res.json(mapKeys(updated, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for update education degree');
    }
    const idx = inMemoryEducationDegrees.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryEducationDegrees[idx] = {
        ...inMemoryEducationDegrees[idx],
        name: name || inMemoryEducationDegrees[idx].name,
        is_higher_education: isHigher !== undefined ? isHigher : inMemoryEducationDegrees[idx].is_higher_education,
        isHigherEducation: isHigher !== undefined ? isHigher : inMemoryEducationDegrees[idx].isHigherEducation,
        allowance_rate: allRate !== undefined ? allRate : inMemoryEducationDegrees[idx].allowance_rate,
        allowanceRate: allRate !== undefined ? allRate : inMemoryEducationDegrees[idx].allowanceRate,
        higher_allowance_rate: hAllRate !== undefined ? hAllRate : inMemoryEducationDegrees[idx].higher_allowance_rate,
        higherAllowanceRate: hAllRate !== undefined ? hAllRate : inMemoryEducationDegrees[idx].higherAllowanceRate,
        baseline_grade: bGrade !== undefined ? bGrade : (inMemoryEducationDegrees[idx].baseline_grade || inMemoryEducationDegrees[idx].baselineGrade || 7),
        baselineGrade: bGrade !== undefined ? bGrade : (inMemoryEducationDegrees[idx].baselineGrade || inMemoryEducationDegrees[idx].baseline_grade || 7),
        baseline_step: bStep !== undefined ? bStep : (inMemoryEducationDegrees[idx].baseline_step || inMemoryEducationDegrees[idx].baselineStep || 1),
        baselineStep: bStep !== undefined ? bStep : (inMemoryEducationDegrees[idx].baselineStep || inMemoryEducationDegrees[idx].baseline_step || 1),
        status: status !== undefined ? status : inMemoryEducationDegrees[idx].status,
      };
      saveLocalDb();
      return res.json(inMemoryEducationDegrees[idx]);
    }
    res.json({ id, name, is_higher_education: isHigher, allowance_rate: allRate, higher_allowance_rate: hAllRate, baseline_grade: bGrade, baseline_step: bStep, status });
  });

  app.delete('/api/education-degrees/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('education_degrees', id, false, buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.educationDegrees).where(eq(schema.educationDegrees.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete education degree');
    }
    inMemoryEducationDegrees = inMemoryEducationDegrees.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Responsibility Allowances API ---
  app.get('/api/responsibility-allowances', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.responsibilityAllowances).orderBy(asc(schema.responsibilityAllowances.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for responsibility allowances');
    }
    res.json(inMemoryResponsibilityAllowances);
  });

  app.post('/api/responsibility-allowances', requireAuth, async (req, res) => {
    const { name, allowance_rate } = req.body;
    try {
      const [newRecord] = await db.insert(schema.responsibilityAllowances).values({
        name,
        allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : 0,
      }).returning();
      if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for create responsibility allowance');
    }
    const memItem = {
      id: inMemoryResponsibilityAllowances.length + 1,
      name,
      allowance_rate: allowance_rate !== undefined ? parseInt(allowance_rate) : 0,
      status: 'فعال',
      created_at: new Date().toISOString()
    };
    inMemoryResponsibilityAllowances.push(memItem);
    saveLocalDb();
    res.status(201).json(memItem);
  });

  app.put('/api/responsibility-allowances/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, allowance_rate, status } = req.body;

    if (status === 'معطل' || status === 'غير فعال') {
      const refCheck = checkReferentialUsage('responsibility_allowances', id, true, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }
    }

    try {
      const [updated] = await db.update(schema.responsibilityAllowances)
        .set({
          name,
          allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : undefined,
        })
        .where(eq(schema.responsibilityAllowances.id, id))
        .returning();
      if (updated) return res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for update responsibility allowance');
    }
    const idx = inMemoryResponsibilityAllowances.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryResponsibilityAllowances[idx] = {
        ...inMemoryResponsibilityAllowances[idx],
        name: name || inMemoryResponsibilityAllowances[idx].name,
        allowance_rate: allowance_rate !== undefined ? parseInt(allowance_rate) : inMemoryResponsibilityAllowances[idx].allowance_rate
      };
      saveLocalDb();
      return res.json(inMemoryResponsibilityAllowances[idx]);
    }
    res.json({ id, name, allowance_rate });
  });

  app.delete('/api/responsibility-allowances/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);

    const refCheck = checkReferentialUsage('responsibility_allowances', id, false, buildRefContext());
    if (!refCheck.canProceed) {
      return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
    }

    try {
      await db.delete(schema.responsibilityAllowances).where(eq(schema.responsibilityAllowances.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete responsibility allowance');
    }
    inMemoryResponsibilityAllowances = inMemoryResponsibilityAllowances.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Service Records API ---
  app.get('/api/service-records', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.serviceRecords).orderBy(desc(schema.serviceRecords.id));
      if (records && records.length > 0) return res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.warn('Database fallback for service records');
    }
    res.json(inMemoryServiceRecords.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/service-records', requireAuth, async (req, res) => {
    const { employee_id, record_type, duration_years, duration_months, duration_days, order_number, order_date, notes } = req.body;
    let newRec: any = null;
    try {
      const [newRecord] = await db.insert(schema.serviceRecords).values({
        employeeId: parseInt(employee_id),
        recordType: record_type,
        durationYears: parseInt(duration_years) || 0,
        durationMonths: parseInt(duration_months) || 0,
        durationDays: parseInt(duration_days) || 0,
        orderNumber: order_number,
        orderDate: order_date,
        notes: notes || '',
      }).returning();
      newRec = newRecord;
    } catch (error: any) {
      console.warn('Database fallback for create service record');
    }
    const newId = newRec?.id || (inMemoryServiceRecords.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
    const memItem = {
      id: newId,
      employee_id: parseInt(employee_id),
      employeeId: parseInt(employee_id),
      record_type,
      recordType: record_type,
      duration_years: parseInt(duration_years) || 0,
      durationYears: parseInt(duration_years) || 0,
      duration_months: parseInt(duration_months) || 0,
      durationMonths: parseInt(duration_months) || 0,
      duration_days: parseInt(duration_days) || 0,
      durationDays: parseInt(duration_days) || 0,
      order_number,
      orderNumber: order_number,
      order_date,
      orderDate: order_date,
      notes: notes || '',
      created_at: new Date().toISOString()
    };
    inMemoryServiceRecords.push(memItem);
    saveLocalDb();
    res.status(201).json(mapKeys(newRec || memItem, camelToSnake));
  });

  app.delete('/api/service-records/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete service record');
    }
    inMemoryServiceRecords = inMemoryServiceRecords.filter(r => parseInt(String(r.id)) !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Leave Types API ---
  app.get('/api/leave-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.id));
      if (records && records.length > 0) return res.json(records.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for leave types');
    }
    res.json(inMemoryLeaveTypes.map(r => mapKeys(r, camelToSnake)));
  });

  app.post('/api/leave-types', requireAuth, async (req, res) => {
    const { 
      name, maxDays, max_days, description, status, 
      administrativeEffect, administrative_effect, 
      financialEffect, financial_effect, 
      financialDeductionPercentage, financial_deduction_percentage,
      affectsIncrement, affects_increment,
      affectsPromotion, affects_promotion,
      affectsCommendations, affects_commendations,
      salaryPaymentType, salary_payment_type,
      effectsOptions, effects_options
    } = req.body;

    const mDays = maxDays !== undefined ? (maxDays ? parseInt(maxDays) : null) : (max_days !== undefined ? (max_days ? parseInt(max_days) : null) : null);
    const affInc = Boolean(affectsIncrement ?? affects_increment ?? false);
    const affPromo = Boolean(affectsPromotion ?? affects_promotion ?? false);
    const affComm = Boolean(affectsCommendations ?? affects_commendations ?? false);
    const salType = salaryPaymentType || salary_payment_type || (financialEffect === 'بدون_راتب' ? 'بدون_راتب' : financialEffect === 'براتب_ومخصصات_ثابتة' ? 'منح_الراتب_والمخصصات_الثابتة_فقط' : financialEffect === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'منح_الراتب_كامل');

    let adminEff = administrativeEffect || administrative_effect || '';
    if (!adminEff || adminEff === 'لا_يؤثر') {
      const parts: string[] = [];
      if (affPromo) parts.push('يوقف الترفيع');
      if (affInc) parts.push('يؤخر العلاوة');
      if (affComm) parts.push('يوقف كتب الشكر');
      adminEff = parts.length > 0 ? parts.join(' و ') : 'لا_يؤثر';
    }

    const finEff = financialEffect || financial_effect || (salType === 'بدون_راتب' ? 'بدون_راتب' : salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' ? 'براتب_ومخصصات_ثابتة' : salType === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'براتب_كامل');
    const finDedPct = parseInt(financialDeductionPercentage ?? financial_deduction_percentage ?? (salType === 'بدون_راتب' ? 100 : 0)) || 0;
    const effOptsStr = typeof effectsOptions === 'string' ? effectsOptions : typeof effects_options === 'string' ? effects_options : JSON.stringify(effectsOptions || effects_options || []);

    let newRec: any = null;
    try {
      const [newRecord] = await db.insert(schema.leaveTypes).values({
        name,
        maxDays: mDays,
        administrativeEffect: adminEff,
        financialEffect: finEff,
        financialDeductionPercentage: finDedPct,
        affectsIncrement: affInc,
        affectsPromotion: affPromo,
        affectsCommendations: affComm,
        salaryPaymentType: salType,
        effectsOptions: effOptsStr,
        description,
        status: status || 'فعال',
      }).returning();
      newRec = newRecord;
    } catch (error: any) {
      console.warn('Database fallback for create leave type');
    }

    const newId = newRec?.id || (inMemoryLeaveTypes.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
    const memItem = {
      id: newId,
      name,
      max_days: mDays,
      maxDays: mDays,
      administrative_effect: adminEff,
      administrativeEffect: adminEff,
      financial_effect: finEff,
      financialEffect: finEff,
      financial_deduction_percentage: finDedPct,
      financialDeductionPercentage: finDedPct,
      affects_increment: affInc,
      affectsIncrement: affInc,
      affects_promotion: affPromo,
      affectsPromotion: affPromo,
      affects_commendations: affComm,
      affectsCommendations: affComm,
      salary_payment_type: salType,
      salaryPaymentType: salType,
      effects_options: effOptsStr,
      effectsOptions: effOptsStr,
      description,
      status: status || 'فعال',
      createdAt: new Date().toISOString()
    };
    inMemoryLeaveTypes.push(memItem);
    saveLocalDb();
    res.status(201).json(mapKeys(newRec || memItem, camelToSnake));
  });

  app.put('/api/leave-types/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const { 
      name, maxDays, max_days, description, status, 
      administrativeEffect, administrative_effect, 
      financialEffect, financial_effect, 
      financialDeductionPercentage, financial_deduction_percentage,
      affectsIncrement, affects_increment,
      affectsPromotion, affects_promotion,
      affectsCommendations, affects_commendations,
      salaryPaymentType, salary_payment_type,
      effectsOptions, effects_options
    } = req.body;

    const mDays = maxDays !== undefined ? (maxDays ? parseInt(maxDays) : null) : (max_days !== undefined ? (max_days ? parseInt(max_days) : null) : undefined);
    const affInc = affectsIncrement !== undefined ? Boolean(affectsIncrement) : (affects_increment !== undefined ? Boolean(affects_increment) : undefined);
    const affPromo = affectsPromotion !== undefined ? Boolean(affectsPromotion) : (affects_promotion !== undefined ? Boolean(affects_promotion) : undefined);
    const affComm = affectsCommendations !== undefined ? Boolean(affectsCommendations) : (affects_commendations !== undefined ? Boolean(affects_commendations) : undefined);
    const salType = salaryPaymentType !== undefined ? salaryPaymentType : salary_payment_type;
    const effOptsStr = effectsOptions !== undefined ? (typeof effectsOptions === 'string' ? effectsOptions : JSON.stringify(effectsOptions)) : (effects_options !== undefined ? (typeof effects_options === 'string' ? effects_options : JSON.stringify(effects_options)) : undefined);

    let adminEff = administrativeEffect !== undefined ? administrativeEffect : administrative_effect;
    if (adminEff === undefined && (affInc !== undefined || affPromo !== undefined || affComm !== undefined)) {
      const parts: string[] = [];
      if (affPromo) parts.push('يوقف الترفيع');
      if (affInc) parts.push('يؤخر العلاوة');
      if (affComm) parts.push('يوقف كتب الشكر');
      adminEff = parts.length > 0 ? parts.join(' و ') : 'لا_يؤثر';
    }

    let finEff = financialEffect !== undefined ? financialEffect : financial_effect;
    if (finEff === undefined && salType !== undefined) {
      finEff = salType === 'بدون_راتب' ? 'بدون_راتب' : salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' ? 'براتب_ومخصصات_ثابتة' : salType === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'براتب_كامل';
    }
    const finDedPct = financialDeductionPercentage !== undefined ? parseInt(financialDeductionPercentage) : (financial_deduction_percentage !== undefined ? parseInt(financial_deduction_percentage) : (salType === 'بدون_راتب' ? 100 : undefined));

    let updatedRec: any = null;
    try {
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (mDays !== undefined) updateData.maxDays = mDays;
      if (adminEff !== undefined) updateData.administrativeEffect = adminEff;
      if (finEff !== undefined) updateData.financialEffect = finEff;
      if (finDedPct !== undefined) updateData.financialDeductionPercentage = finDedPct;
      if (affInc !== undefined) updateData.affectsIncrement = affInc;
      if (affPromo !== undefined) updateData.affectsPromotion = affPromo;
      if (affComm !== undefined) updateData.affectsCommendations = affComm;
      if (salType !== undefined) updateData.salaryPaymentType = salType;
      if (effOptsStr !== undefined) updateData.effectsOptions = effOptsStr;
      if (description !== undefined) updateData.description = description;
      if (status !== undefined) updateData.status = status;

      const [updated] = await db.update(schema.leaveTypes)
        .set(updateData)
        .where(eq(schema.leaveTypes.id, id))
        .returning();
      updatedRec = updated;
    } catch (error: any) {
      console.warn('Database fallback for update leave type');
    }

    const idx = inMemoryLeaveTypes.findIndex(r => r.id === id);
    if (idx !== -1) {
      inMemoryLeaveTypes[idx] = {
        ...inMemoryLeaveTypes[idx],
        name: name !== undefined ? name : inMemoryLeaveTypes[idx].name,
        max_days: mDays !== undefined ? mDays : inMemoryLeaveTypes[idx].max_days,
        maxDays: mDays !== undefined ? mDays : inMemoryLeaveTypes[idx].maxDays,
        administrative_effect: adminEff !== undefined ? adminEff : inMemoryLeaveTypes[idx].administrative_effect,
        administrativeEffect: adminEff !== undefined ? adminEff : inMemoryLeaveTypes[idx].administrativeEffect,
        financial_effect: finEff !== undefined ? finEff : inMemoryLeaveTypes[idx].financial_effect,
        financialEffect: finEff !== undefined ? finEff : inMemoryLeaveTypes[idx].financialEffect,
        financial_deduction_percentage: finDedPct !== undefined ? finDedPct : inMemoryLeaveTypes[idx].financial_deduction_percentage,
        financialDeductionPercentage: finDedPct !== undefined ? finDedPct : inMemoryLeaveTypes[idx].financialDeductionPercentage,
        affects_increment: affInc !== undefined ? affInc : inMemoryLeaveTypes[idx].affects_increment,
        affectsIncrement: affInc !== undefined ? affInc : inMemoryLeaveTypes[idx].affectsIncrement,
        affects_promotion: affPromo !== undefined ? affPromo : inMemoryLeaveTypes[idx].affects_promotion,
        affectsPromotion: affPromo !== undefined ? affPromo : inMemoryLeaveTypes[idx].affectsPromotion,
        affects_commendations: affComm !== undefined ? affComm : inMemoryLeaveTypes[idx].affects_commendations,
        affectsCommendations: affComm !== undefined ? affComm : inMemoryLeaveTypes[idx].affectsCommendations,
        salary_payment_type: salType !== undefined ? salType : inMemoryLeaveTypes[idx].salary_payment_type,
        salaryPaymentType: salType !== undefined ? salType : inMemoryLeaveTypes[idx].salaryPaymentType,
        effects_options: effOptsStr !== undefined ? effOptsStr : inMemoryLeaveTypes[idx].effects_options,
        effectsOptions: effOptsStr !== undefined ? effOptsStr : inMemoryLeaveTypes[idx].effectsOptions,
        description: description !== undefined ? description : inMemoryLeaveTypes[idx].description,
        status: status !== undefined ? status : inMemoryLeaveTypes[idx].status
      };
      saveLocalDb();
      return res.json(mapKeys(inMemoryLeaveTypes[idx], camelToSnake));
    }
    saveLocalDb();
    res.json(mapKeys(updatedRec || { id, name, maxDays: mDays, description, status }, camelToSnake));
  });

  app.delete('/api/leave-types/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await db.delete(schema.leaveTypes).where(eq(schema.leaveTypes.id, id));
    } catch (error: any) {
      console.warn('Database fallback for delete leave type');
    }
    inMemoryLeaveTypes = inMemoryLeaveTypes.filter(r => r.id !== id);
    saveLocalDb();
    res.json({ success: true });
  });

  // --- Penalty Types API (أنواع العقوبات الإدارية - المادة 8 قانون 14 لسنة 1991) ---
  const LEGAL_ARTICLE_8_PENALTIES = [
    {
      name: 'لفت النظر',
      delayMonths: 3,
      description: 'إشعار الموظف تحريرياً بالمخالفة وتوجيهه لتحسين سلوكه الوظيفي',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'الإنذار',
      delayMonths: 6,
      description: 'إشعار تحريري بالمخالفة وتحذيره من الإخلال بواجباته مستقبلاً',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'قطع الراتب',
      delayMonths: 5,
      description: 'حسم القسط اليومي من الراتب بأمر تحريري يذكر فيه المخالفة (حتى 10 أيام كحد أقصى)',
      salaryDeductionDays: 10,
      status: 'فعال'
    },
    {
      name: 'التوبيخ',
      delayMonths: 12,
      description: 'إشعار تحريري بالمخالفة وأسباب عدم رضا السلوك، مع طلب تحسينه',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'إنقاص الراتب',
      delayMonths: 24,
      description: 'قطع نسبة لا تتجاوز 10% من الراتب بأمر تحريري يشعر الموظف بالفعل المرتكب (لمدة 6 أشهر - سنتين)',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'تنزيل الدرجة',
      delayMonths: 36,
      description: 'تنزيل الراتب إلى الحد الأدنى للدرجة الأدنى مباشرة، مع منحه العلاوات المكتسبة سابقاً',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'الفصل',
      delayMonths: 0,
      description: 'تنحية الموظف عن الوظيفة مؤقتاً (من سنة إلى 3 سنوات)؛ تُفرض عند تكرار عقوبات مرتين خلال 5 سنوات',
      salaryDeductionDays: 0,
      status: 'فعال'
    },
    {
      name: 'العزل',
      delayMonths: 0,
      description: 'تنحية نهائية عن الوظيفة مع منع إعادة التوظيف في دوائر الدولة؛ تُفرض بقرار مسبب من الوزير',
      salaryDeductionDays: 0,
      status: 'فعال'
    }
  ];

  const LEGAL_ARTICLE_8_MAP: Record<string, { deductionType: string; deductionValue: string; delayRule: string }> = {
    'لفت النظر': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '3 أشهر'
    },
    'الإنذار': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '6 أشهر'
    },
    'إنذار خطي': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '6 أشهر'
    },
    'قطع الراتب': {
      deductionType: 'حسم القسط اليومي',
      deductionValue: 'حتى 10 أيام كحد أقصى',
      delayRule: 'حالتان: • ≤5 أيام قطع ← 5 أشهر | • أكثر من 5 أيام ← شهر واحد عن كل يوم قطع'
    },
    'التوبيخ': {
      deductionType: 'بدون قطع مالي',
      deductionValue: 'بدون قطع مالي',
      delayRule: '12 شهر (سنة واحدة)'
    },
    'إنقاص الراتب': {
      deductionType: 'نسبة مئوية %',
      deductionValue: 'نسبة لا تتجاوز 10% (لمدة 6 أشهر - سنتين)',
      delayRule: '24 شهر (سنتان)'
    },
    'تنزيل الدرجة': {
      deductionType: 'لا ينطبق (تأثير وظيفي)',
      deductionValue: 'لا ينطبق',
      delayRule: 'يُعاد لراتبه السابق بعد 3 سنوات من فرض العقوبة'
    },
    'الفصل': {
      deductionType: 'لا ينطبق (إبعاد مؤقت)',
      deductionValue: 'مدة الفصل من سنة إلى 3 سنوات',
      delayRule: 'مدة الفصل من سنة إلى 3 سنوات'
    },
    'العزل': {
      deductionType: 'لا ينطبق (نهائي)',
      deductionValue: 'لا ينطبق',
      delayRule: 'لا ينطبق (تنحية نهائية)'
    }
  };

  const enrichPenaltyRecord = (record: any) => {
    const meta = LEGAL_ARTICLE_8_MAP[record.name] || {
      deductionType: record.salaryDeductionDays > 0 ? 'حسم القسط اليومي' : 'بدون قطع مالي',
      deductionValue: record.salaryDeductionDays > 0 ? `${record.salaryDeductionDays} أيام` : 'بدون قطع مالي',
      delayRule: record.delayMonths > 0 ? `${record.delayMonths} أشهر` : 'لا يوجد تأخير'
    };
    return {
      ...record,
      deductionType: meta.deductionType,
      deductionValue: meta.deductionValue,
      delayRule: meta.delayRule
    };
  };

  app.get('/api/penalty-types', requireAuth, async (req, res) => {
    try {
      let records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));

      if (records.length === 0 || req.query.reset === 'true') {
        await db.delete(schema.penaltyTypes);
        for (const item of LEGAL_ARTICLE_8_PENALTIES) {
          await db.insert(schema.penaltyTypes).values(item).catch(() => {});
        }
        records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      }

      if (records && records.length > 0) {
        const enrichedRecords = records.map(enrichPenaltyRecord);
        return res.json(mapKeys(enrichedRecords, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for penalty types');
    }
    res.json(mapKeys((inMemoryPenaltyTypes && inMemoryPenaltyTypes.length > 0 ? inMemoryPenaltyTypes : LEGAL_ARTICLE_8_PENALTIES).map(enrichPenaltyRecord), camelToSnake));
  });

  app.post('/api/penalty-types/reset-legal', requireAuth, async (req, res) => {
    try {
      await db.delete(schema.penaltyTypes);
      for (const item of LEGAL_ARTICLE_8_PENALTIES) {
        await db.insert(schema.penaltyTypes).values(item).catch(() => {});
      }
      const records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      const enrichedRecords = records.map(enrichPenaltyRecord);
      inMemoryPenaltyTypes = enrichedRecords;
      saveLocalDb();
      res.json(mapKeys(enrichedRecords, camelToSnake));
    } catch (error: any) {
      console.error('Error resetting penalty types:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/penalty-types', requireAuth, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      const { name, delayMonths, description, salaryDeductionDays, status } = data;
      if (!name) return res.status(400).json({ error: 'اسم نوع العقوبة مطلوب' });
      let savedRecord: any = null;
      try {
        const [newRecord] = await db.insert(schema.penaltyTypes).values({
          name,
          delayMonths: delayMonths ? parseInt(delayMonths) : 0,
          description: description || '',
          salaryDeductionDays: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
          status: status || 'فعال',
        }).returning();
        savedRecord = newRecord;
      } catch (dbErr) {
        console.warn('Database fallback for create penalty type');
      }

      const newId = savedRecord?.id || (inMemoryPenaltyTypes.reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const memItem = {
        id: newId,
        name,
        delay_months: delayMonths ? parseInt(delayMonths) : 0,
        delayMonths: delayMonths ? parseInt(delayMonths) : 0,
        description: description || '',
        salary_deduction_days: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
        salaryDeductionDays: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
        status: status || 'فعال',
        created_at: new Date().toISOString()
      };
      inMemoryPenaltyTypes.push(memItem);
      saveLocalDb();
      res.status(201).json(mapKeys(enrichPenaltyRecord(savedRecord || memItem), camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/penalty-types/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      const { name, delayMonths, description, salaryDeductionDays, status } = data;

      if (status === 'غير فعال' || status === 'معطل') {
        const refCheck = checkReferentialUsage('penalty_types', id, true, buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      let updatedRecord: any = null;
      try {
        const [updated] = await db.update(schema.penaltyTypes)
          .set({
            name: name !== undefined ? name : undefined,
            delayMonths: delayMonths !== undefined ? (delayMonths ? parseInt(delayMonths) : 0) : undefined,
            description: description !== undefined ? description : undefined,
            salaryDeductionDays: salaryDeductionDays !== undefined ? (salaryDeductionDays ? parseInt(salaryDeductionDays) : 0) : undefined,
            status: status !== undefined ? status : undefined,
          })
          .where(eq(schema.penaltyTypes.id, id))
          .returning();
        updatedRecord = updated;
      } catch (dbErr) {
        console.warn('Database fallback for update penalty type');
      }

      const idx = inMemoryPenaltyTypes.findIndex(r => r.id === id);
      if (idx !== -1) {
        inMemoryPenaltyTypes[idx] = {
          ...inMemoryPenaltyTypes[idx],
          name: name !== undefined ? name : inMemoryPenaltyTypes[idx].name,
          delay_months: delayMonths !== undefined ? parseInt(delayMonths) : inMemoryPenaltyTypes[idx].delay_months,
          delayMonths: delayMonths !== undefined ? parseInt(delayMonths) : inMemoryPenaltyTypes[idx].delayMonths,
          description: description !== undefined ? description : inMemoryPenaltyTypes[idx].description,
          salary_deduction_days: salaryDeductionDays !== undefined ? parseInt(salaryDeductionDays) : inMemoryPenaltyTypes[idx].salary_deduction_days,
          salaryDeductionDays: salaryDeductionDays !== undefined ? parseInt(salaryDeductionDays) : inMemoryPenaltyTypes[idx].salaryDeductionDays,
          status: status !== undefined ? status : inMemoryPenaltyTypes[idx].status,
        };
      }
      saveLocalDb();
      res.json(mapKeys(enrichPenaltyRecord(updatedRecord || inMemoryPenaltyTypes[idx] || { id, ...data }), camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/penalty-types/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });

      const refCheck = checkReferentialUsage('penalty_types', id, false, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      try {
        await db.delete(schema.penaltyTypes).where(eq(schema.penaltyTypes.id, id));
      } catch (dbErr) {
        console.warn('Database fallback for delete penalty type');
      }
      inMemoryPenaltyTypes = inMemoryPenaltyTypes.filter(r => r.id !== id);
      saveLocalDb();
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting penalty type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Evaluation Forms API (استمارات تقييم الأداء حسب الفئات) ---
  const CANONICAL_SEED_FORMS = [
    {
      title: 'استمارة تقييم أداء شاغلي الوظائف القيادية والإشرافية (FORM_1)',
      category: 'الوظائف القيادية والإشرافية',
      targetGrades: 'الدرجات (الأولى - الخامسة) مع مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['مدير عام', 'معاون مدير عام', 'مدير هيئة', 'مدير قسم مركزي', 'مدير قسم', 'مسؤول شعبة']),
      applicableQualifications: JSON.stringify(['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي']),
      maxScore: 100,
      passingScore: 50,
      description: 'خاصة بالمدراء ومسؤولي الشُّعب فأعلى ممن يملكون مسؤولية إشرافية (18 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 49,
          criteria: [
            { id: 'c1_1', name: 'المساهمة في تحقيق أهداف المنظمة', maxScore: 6 },
            { id: 'c1_2', name: 'المهارة في التخطيط ومتابعة التنفيذ', maxScore: 6 },
            { id: 'c1_3', name: 'المهارة في اتخاذ القرارات', maxScore: 6 },
            { id: 'c1_4', name: 'المعرفة والالتزام بالتشريعات النافذة والمحافظة على سرية المعلومات', maxScore: 6 },
            { id: 'c1_5', name: 'القدرة على توجيه ومتابعة تنفيذ المرؤوسين وترتيب الأولويات بالعمل', maxScore: 6 },
            { id: 'c1_6_hse', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 8, isHseConditional: true },
            { id: 'c1_7', name: 'القابلية على تطوير الذات وتأهيل وتدريب المرؤوسين ضمن برامج تطويرية حديثة', maxScore: 6 },
            { id: 'c1_8', name: 'معرفة استخدام تكنولوجيا المعلومات في العمل', maxScore: 5 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 36,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 4 },
            { id: 'c2_2', name: 'القدرة على الحوار وعرض الرأي', maxScore: 5 },
            { id: 'c2_3', name: 'القدرة على التعامل مع ضغوطات العمل', maxScore: 5 },
            { id: 'c2_4', name: 'تحمل المسؤولية', maxScore: 5 },
            { id: 'c2_5', name: 'الشخصية القيادية', maxScore: 6 },
            { id: 'c2_6', name: 'تقديم أفكار إبداعية', maxScore: 6 },
            { id: 'c2_7', name: 'المستوى في اللغة الإنكليزية', maxScore: 5 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 15,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 5 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 5 },
            { id: 'c3_3', name: 'العلاقة مع المرؤوسين', maxScore: 5 }
          ]
        }
      ])
    },
    {
      title: 'استمارة تقييم أداء الموظفين والمهنيين (شهادة إعدادية فأعلى) (FORM_2)',
      category: 'الكادر التنفيذي والتخصصي (شهادة إعدادية فأعلى)',
      targetGrades: 'الدرجات (1 - 8) - بلا مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة']),
      applicableQualifications: JSON.stringify(['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية']),
      maxScore: 100,
      passingScore: 50,
      description: 'للمرؤوسين درجة 8→1 من حملة شهادة إعدادية فأعلى بلا مسؤولية إشرافية (16 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 51,
          criteria: [
            { id: 'c1_1', name: 'المعرفة الكاملة بأهداف وسياسات التشكيل والعاملين به', maxScore: 7 },
            { id: 'c1_2', name: 'المشاركة في وضع الخطط وتنفيذها ضمن الوقت المحدد', maxScore: 6 },
            { id: 'c1_3', name: 'المعرفة والالتزام بالتشريعات النافذة والمحافظة على سرية المعلومات', maxScore: 7 },
            { id: 'c1_4', name: 'مدى تنفيذ القرارات والتوجيهات الصادرة من الجهات المسؤولة', maxScore: 6 },
            { id: 'c1_5_hse', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 8, isHseConditional: true },
            { id: 'c1_6', name: 'القابلية على ترتيب الأولويات وإدارة الوقت', maxScore: 7 },
            { id: 'c1_7', name: 'القابلية على تطوير الذات والاستفادة من التجارب والبرامج التدريبية النافذة', maxScore: 5 },
            { id: 'c1_8', name: 'معرفة استخدام تكنولوجيا المعلومات في العمل', maxScore: 5 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 36,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 6 },
            { id: 'c2_2', name: 'القدرة على الحوار وإبداء الرأي', maxScore: 7 },
            { id: 'c2_3', name: 'القدرة على التعامل مع ضغوطات العمل', maxScore: 6 },
            { id: 'c2_4', name: 'القدرة على الإبداع والابتكار', maxScore: 5 },
            { id: 'c2_5', name: 'تقدير وتحمل المسؤولية الأعلى', maxScore: 7 },
            { id: 'c2_6', name: 'المستوى باللغة الإنكليزية', maxScore: 5 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 13,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 7 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 6 }
          ]
        }
      ])
    },
    {
      title: 'استمارة تقييم أداء الكوادر والمهن الحرفية (شهادة متوسطة فأدنى) (FORM_3)',
      category: 'المهن الحرفية والخدمية (شهادة متوسطة فأدنى)',
      targetGrades: 'كافة الدرجات - بلا مسؤولية إشرافية',
      applicableResponsibilities: JSON.stringify(['بلا مسؤولية', 'مسؤول وحدة', 'مسؤول وجبة']),
      applicableQualifications: JSON.stringify(['متوسطة', 'ابتدائية', 'يقرأ ويكتب', 'أمي']),
      maxScore: 100,
      passingScore: 50,
      description: 'للمهن الحرفية والخدمية بكافة الدرجات من حملة شهادة متوسطة فأدنى بلا مسؤولية إشرافية (13 عنصرًا، المجموع 100)',
      status: 'فعال',
      sections: JSON.stringify([
        {
          id: 's1',
          title: 'محور الأداء الوظيفي',
          weight: 63,
          criteria: [
            { id: 'c1_1', name: 'الالتزام بمواعيد العمل الرسمية', maxScore: 10 },
            { id: 'c1_2', name: 'الالتزام بتعليمات وإجراءات الصحة والسلامة والبيئة (HSE)', maxScore: 9 },
            { id: 'c1_3', name: 'المحافظة على وسائل العمل المتاحة', maxScore: 9 },
            { id: 'c1_4', name: 'مدى التكيف مع ظروف العمل المختلفة', maxScore: 9 },
            { id: 'c1_5', name: 'القدرة على تنفيذ الأعمال ضمن الوقت المحدد', maxScore: 9 },
            { id: 'c1_6', name: 'نوعية وكمية العمل المنجز خلال فترة التقييم', maxScore: 9 },
            { id: 'c1_7', name: 'المهارات في تطوير الأداء واستخدام تقنيات حديثة في العمل', maxScore: 8 }
          ]
        },
        {
          id: 's2',
          title: 'محور الصفات الشخصية',
          weight: 26,
          criteria: [
            { id: 'c2_1', name: 'الاهتمام بالمظهر وحسن التصرف', maxScore: 6 },
            { id: 'c2_2', name: 'القدرة على تحمل المسؤولية والإبداع', maxScore: 7 },
            { id: 'c2_3', name: 'العمل بروح الفريق', maxScore: 7 },
            { id: 'c2_4', name: 'القابلية على إنجاز الأعمال بدون متابعة مباشرة', maxScore: 6 }
          ]
        },
        {
          id: 's3',
          title: 'محور علاقات العمل',
          weight: 11,
          criteria: [
            { id: 'c3_1', name: 'العلاقة مع الرؤساء', maxScore: 5 },
            { id: 'c3_2', name: 'العلاقة مع الزملاء', maxScore: 6 }
          ]
        }
      ])
    }
  ];

  app.get('/api/evaluation-forms', requireAuth, async (req, res) => {
    try {
      let records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      if (records.length === 0) {
        for (const form of CANONICAL_SEED_FORMS) {
          await db.insert(schema.evaluationForms).values(form).catch(() => {});
        }
        records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      }
      if (records && records.length > 0) {
        return res.json(mapKeys(records, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for evaluation forms');
    }
    res.json(mapKeys(CANONICAL_SEED_FORMS.map((f, i) => ({ id: i + 1, ...f })), camelToSnake));
  });

  app.post('/api/evaluation-forms/seed-defaults', requireAuth, async (req, res) => {
    try {
      for (const form of CANONICAL_SEED_FORMS) {
        const [existing] = await db.select().from(schema.evaluationForms).where(eq(schema.evaluationForms.title, form.title));
        if (!existing) {
          await db.insert(schema.evaluationForms).values(form);
        } else {
          await db.update(schema.evaluationForms).set({
            category: form.category,
            targetGrades: form.targetGrades,
            applicableResponsibilities: form.applicableResponsibilities,
            applicableQualifications: form.applicableQualifications,
            maxScore: form.maxScore,
            passingScore: form.passingScore,
            description: form.description,
            sections: form.sections,
            status: 'فعال'
          }).where(eq(schema.evaluationForms.id, existing.id));
        }
      }
      const records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      res.json({ success: true, message: 'تم إعادة ضبط وسيد القوالب الثلاثة القياسية بنجاح', data: records.map(r => mapKeys(r, camelToSnake)) });
    } catch (error: any) {
      console.error('Error seeding canonical forms:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/evaluation-forms', requireAuth, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      const {
        title,
        category,
        targetGrades,
        applicableResponsibilities,
        applicableQualifications,
        maxScore,
        passingScore,
        description,
        sections,
        status,
        enableWeaknesses,
        enableStrengths,
        enableTrainingNeeds,
        enableEmployeeOpinion
      } = data;
      if (!title) return res.status(400).json({ error: 'عنوان استمارة التقييم مطلوب' });
      if (!category) return res.status(400).json({ error: 'الفئة الوظيفية المستهدفة مطلوبة' });

      const [newRecord] = await db.insert(schema.evaluationForms).values({
        title: title.trim(),
        category: category.trim(),
        targetGrades: targetGrades || 'جميع الدرجات',
        applicableResponsibilities: typeof applicableResponsibilities === 'object' ? JSON.stringify(applicableResponsibilities) : applicableResponsibilities,
        applicableQualifications: typeof applicableQualifications === 'object' ? JSON.stringify(applicableQualifications) : applicableQualifications,
        maxScore: maxScore ? parseInt(maxScore) : 100,
        passingScore: passingScore ? parseInt(passingScore) : 50,
        description: description || '',
        sections: typeof sections === 'object' ? JSON.stringify(sections) : (sections || '[]'),
        enableWeaknesses: Boolean(enableWeaknesses),
        enableStrengths: Boolean(enableStrengths),
        enableTrainingNeeds: Boolean(enableTrainingNeeds),
        enableEmployeeOpinion: Boolean(enableEmployeeOpinion),
        status: status || 'فعال',
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating evaluation form:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/evaluation-forms/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });
      const data = mapKeys(req.body, snakeToCamel);
      const {
        title,
        category,
        targetGrades,
        applicableResponsibilities,
        applicableQualifications,
        maxScore,
        passingScore,
        description,
        sections,
        status,
        enableWeaknesses,
        enableStrengths,
        enableTrainingNeeds,
        enableEmployeeOpinion
      } = data;

      if (status === 'غير فعال' || status === 'معطل') {
        const refCheck = checkReferentialUsage('evaluation_forms', id, true, buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      const [updated] = await db.update(schema.evaluationForms)
        .set({
          title: title !== undefined ? title : undefined,
          category: category !== undefined ? category : undefined,
          targetGrades: targetGrades !== undefined ? targetGrades : undefined,
          applicableResponsibilities: applicableResponsibilities !== undefined ? (typeof applicableResponsibilities === 'object' ? JSON.stringify(applicableResponsibilities) : applicableResponsibilities) : undefined,
          applicableQualifications: applicableQualifications !== undefined ? (typeof applicableQualifications === 'object' ? JSON.stringify(applicableQualifications) : applicableQualifications) : undefined,
          maxScore: maxScore !== undefined ? (maxScore ? parseInt(maxScore) : 100) : undefined,
          passingScore: passingScore !== undefined ? (passingScore ? parseInt(passingScore) : 50) : undefined,
          description: description !== undefined ? description : undefined,
          sections: sections !== undefined ? (typeof sections === 'object' ? JSON.stringify(sections) : sections) : undefined,
          enableWeaknesses: enableWeaknesses !== undefined ? Boolean(enableWeaknesses) : undefined,
          enableStrengths: enableStrengths !== undefined ? Boolean(enableStrengths) : undefined,
          enableTrainingNeeds: enableTrainingNeeds !== undefined ? Boolean(enableTrainingNeeds) : undefined,
          enableEmployeeOpinion: enableEmployeeOpinion !== undefined ? Boolean(enableEmployeeOpinion) : undefined,
          status: status !== undefined ? status : undefined,
        })
        .where(eq(schema.evaluationForms.id, id))
        .returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating evaluation form:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/evaluation-forms/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });

      const refCheck = checkReferentialUsage('evaluation_forms', id, false, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      await db.delete(schema.evaluationForms).where(eq(schema.evaluationForms.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting evaluation form:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Shift Systems API ---
  const DEFAULT_SHIFT_SYSTEMS = [
    { id: 1, name: 'شفت 24/72 (يوم عمل مقابل 3 أيام استراحة)', work_days: 1, rest_days: 3, shift_hours_type: '24h', daily_hours: 24, description: 'نظام المناوبة المستمرة 24 ساعة عمل يعقبها 72 ساعة راحة' },
    { id: 2, name: 'شفت 12/24 (12 ساعة عمل مقابل 24 ساعة استراحة)', work_days: 1, rest_days: 1, shift_hours_type: '12h', daily_hours: 12, description: 'نظام مناوبة 12 ساعة' },
    { id: 3, name: 'دوام صباحي اعتيادي (8 ساعات)', work_days: 5, rest_days: 2, shift_hours_type: '8h', daily_hours: 8, description: 'الدوام الصباحي الرسمي المعتاد' }
  ];

  app.get('/api/shift-systems', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.shiftSystems).orderBy(asc(schema.shiftSystems.id));
      if (records && records.length > 0) {
        return res.json(mapKeys(records, camelToSnake));
      }
    } catch (error: any) {
      console.warn('Database fallback for shift systems');
    }
    res.json(DEFAULT_SHIFT_SYSTEMS);
  });

  app.post('/api/shift-systems', requireAuth, async (req, res) => {
    try {
      const {
        name,
        work_days,
        rest_days,
        shift_hours_type,
        daily_hours,
        description,
      } = req.body;

      try {
        const [newRecord] = await db.insert(schema.shiftSystems).values({
          name,
          workDays: work_days !== undefined ? parseInt(work_days) : 1,
          restDays: rest_days !== undefined ? parseInt(rest_days) : 3,
          shiftHoursType: shift_hours_type || '24h',
          dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : 24,
          description: description || '',
        }).returning();

        if (newRecord) return res.status(201).json(mapKeys(newRecord, camelToSnake));
      } catch (err) {
        console.warn('Database fallback for create shift system');
      }

      res.status(201).json({ id: Date.now(), ...req.body });
    } catch (error: any) {
      console.error('Error creating shift system:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/shift-systems/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const {
        name,
        work_days,
        rest_days,
        shift_hours_type,
        daily_hours,
        description,
        status
      } = req.body;

      if (status === 'معطل' || status === 'غير فعال') {
        const refCheck = checkReferentialUsage('shift_systems', id, true, buildRefContext());
        if (!refCheck.canProceed) {
          return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
        }
      }

      try {
        const [updated] = await db.update(schema.shiftSystems)
          .set({
            name: name !== undefined ? name : undefined,
            workDays: work_days !== undefined ? parseInt(work_days) : undefined,
            restDays: rest_days !== undefined ? parseInt(rest_days) : undefined,
            shiftHoursType: shift_hours_type !== undefined ? shift_hours_type : undefined,
            dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : undefined,
            description: description !== undefined ? description : undefined,
          })
          .where(eq(schema.shiftSystems.id, id))
          .returning();

        if (updated) return res.json(mapKeys(updated, camelToSnake));
      } catch (err) {
        console.warn('Database fallback for update shift system');
      }

      res.json({ id, ...req.body });
    } catch (error: any) {
      console.error('Error updating shift system:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/shift-systems/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const refCheck = checkReferentialUsage('shift_systems', id, false, buildRefContext());
      if (!refCheck.canProceed) {
        return res.status(400).json({ error: refCheck.message, details: refCheck.affectedSummary });
      }

      try {
        await db.delete(schema.shiftSystems).where(eq(schema.shiftSystems.id, id));
      } catch (err) {
        console.warn('Database fallback for delete shift system');
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting shift system:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // System Settings API
  const DEFAULT_SYSTEM_SETTINGS = {
    id: 1,
    company_name: 'جمهورية العراق - نظام إدارة الموارد البشرية والرواتب الموحد',
    created_at: new Date().toISOString()
  };

  app.get('/api/settings', async (req, res) => {
    try {
      let [settings] = await db.select().from(schema.systemSettings).limit(1);
      if (!settings) {
        [settings] = await db.insert(schema.systemSettings).values({}).returning();
      }
      if (settings) return res.json(settings);
    } catch (error: any) {
      console.warn('Database fallback for settings');
    }
    res.json(DEFAULT_SYSTEM_SETTINGS);
  });

  app.put('/api/settings', requireAuth, async (req, res) => {
    try {
      const { id, createdAt, ...data } = req.body;
      try {
        let [settings] = await db.select().from(schema.systemSettings).limit(1);
        let updated;
        if (!settings) {
          [updated] = await db.insert(schema.systemSettings).values(data).returning();
        } else {
          [updated] = await db.update(schema.systemSettings)
            .set(data)
            .where(eq(schema.systemSettings.id, settings.id))
            .returning();
        }
        if (updated) return res.json(updated);
      } catch (err) {
        console.warn('Database fallback for update settings');
      }
      res.json({ ...DEFAULT_SYSTEM_SETTINGS, ...req.body });
    } catch (error: any) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Activity Logs API
  app.get('/api/logs', requireAuth, async (req, res) => {
    try {
      const logs = await db.select()
        .from(schema.activityLogs)
        .orderBy(desc(schema.activityLogs.createdAt))
        .limit(100);
      if (logs) return res.json(logs);
    } catch (error: any) {
      console.warn('Database fallback for activity logs');
    }
    res.json([]);
  });

  app.post('/api/logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { action, details } = req.body;
      const userEmail = req.user?.email || 'مستخدم غير معروف';
      const [log] = await db.insert(schema.activityLogs)
        .values({ action, userEmail, details })
        .returning();
      res.json(log);
    } catch (error: any) {
      console.error('Error creating activity log:', error);
      res.status(500).json({ error: error.message });
    }
  });

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
      if (results && results.length > 0) {
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
      console.warn('Database fallback for qualifications');
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

  app.post('/api/qualifications', requireAuth, async (req, res) => {
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

  app.put('/api/qualifications/:id', requireAuth, async (req, res) => {
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
    }

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

  app.patch('/api/qualifications/:id/toggle', requireAuth, async (req, res) => {
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
    }

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

  app.delete('/api/qualifications/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for delete qualification');
    }

    const store = genericMemoryStores['qualifications'] || inMemoryQualifications || [];
    const memItem = store.find(q => parseInt(String(q.id)) === id);
    if (!empId && memItem) empId = parseInt(String(memItem.employee_id || memItem.employeeId));

    syncEntityRecord('qualifications', { id }, 'delete');

    if (empId) {
      await syncEmployeeEducationQualification(empId);
    }

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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for job assignments');
    }
    let list = genericMemoryStores['job-assignments'] || inMemoryJobAssignments || [];
    if (employeeId) list = list.filter(j => parseInt(String(j.employee_id || j.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/job-assignments', requireAuth, async (req, res) => {
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

  app.put('/api/job-assignments/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update job assignment');
    }
    const memItem = { id, ...data };
    syncEntityRecord('job-assignments', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/job-assignments/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.jobAssignments).where(eq(schema.jobAssignments.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for promotions');
    }
    let list = genericMemoryStores['promotions'] || inMemoryPromotions || [];
    if (employeeId) list = list.filter(p => parseInt(String(p.employee_id || p.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/promotions', requireAuth, async (req, res) => {
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
        const curEmp = inMemoryEmployees.find(e => parseInt(String(e.id)) === employeeId);
        const resolvedTitle = findMatchingJobTitleForPromotion(curEmp, targetGradeNum, inMemoryJobTitles);
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

  app.put('/api/promotions/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update promotion');
    }
    const memItem = { id, ...data };
    syncEntityRecord('promotions', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/promotions/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) {
        return res.json(results.map(r => ({
          ...r,
          allowance_type: r.allowanceType,
          order_number: r.orderNumber,
          employee_id: r.employeeId,
        })));
      }
    } catch (error: any) {
      console.warn('Database fallback for salary allowances');
    }
    let list = genericMemoryStores['salary-allowances'] || inMemorySalaryAllowances || [];
    if (employeeId) list = list.filter(s => parseInt(String(s.employee_id || s.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/salary-allowances', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for create salary allowance');
    }

    const store = genericMemoryStores['salary-allowances'] || inMemorySalaryAllowances || [];
    const newId = record?.id || (store.reduce((max, s) => Math.max(max, parseInt(s.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('salary-allowances', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/salary-allowances/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update salary allowance');
    }
    const memItem = { id, ...data };
    syncEntityRecord('salary-allowances', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/salary-allowances/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.salaryAllowances).where(eq(schema.salaryAllowances.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for annual evaluations');
    }
    let list = genericMemoryStores['annual-evaluations'] || inMemoryAnnualEvaluations || [];
    if (employeeId) list = list.filter(e => parseInt(String(e.employee_id || e.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/annual-evaluations', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for create annual evaluation');
    }

    const store = genericMemoryStores['annual-evaluations'] || inMemoryAnnualEvaluations || [];
    const newId = record?.id || (store.reduce((max, e) => Math.max(max, parseInt(e.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('annual-evaluations', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/annual-evaluations/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update annual evaluation');
    }
    const memItem = { id, ...data };
    syncEntityRecord('annual-evaluations', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/annual-evaluations/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.annualEvaluations).where(eq(schema.annualEvaluations.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for training courses');
    }
    let list = genericMemoryStores['training-courses'] || inMemoryTrainingCourses || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/training-courses', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for create training course');
    }

    const store = genericMemoryStores['training-courses'] || inMemoryTrainingCourses || [];
    const newId = record?.id || (store.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('training-courses', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.put('/api/training-courses/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update training course');
    }
    const memItem = { id, ...data };
    syncEntityRecord('training-courses', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/training-courses/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.trainingCourses).where(eq(schema.trainingCourses.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for transfers');
    }
    let list = genericMemoryStores['transfers'] || inMemoryTransfers || [];
    if (employeeId) list = list.filter(t => parseInt(String(t.employee_id || t.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/transfers', requireAuth, async (req, res) => {
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

  app.put('/api/transfers/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for update transfer');
    }
    const memItem = { id, ...data };
    syncEntityRecord('transfers', memItem, 'update');
    res.json(mapKeys(updatedRec || memItem, camelToSnake));
  });

  app.delete('/api/transfers/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for retirements');
    }
    let list = genericMemoryStores['retirements'] || inMemoryRetirements || [];
    if (employeeId) list = list.filter(r => parseInt(String(r.employee_id || r.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/retirements', requireAuth, async (req, res) => {
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

  app.delete('/api/retirements/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.retirements).where(eq(schema.retirements.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) return res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.warn('Database fallback for documents');
    }
    let list = genericMemoryStores['documents'] || inMemoryDocuments || [];
    if (employeeId) list = list.filter(d => parseInt(String(d.employee_id || d.employeeId)) === employeeId);
    res.json(list.map((r: any) => mapKeys(r, camelToSnake)));
  });

  app.post('/api/documents', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for create document');
    }

    const store = genericMemoryStores['documents'] || inMemoryDocuments || [];
    const newId = record?.id || (store.reduce((max, d) => Math.max(max, parseInt(d.id) || 0), 0) || 0) + 1;
    const memItem = { id: newId, employee_id: employeeId, employeeId, ...data, created_at: new Date().toISOString() };
    syncEntityRecord('documents', memItem, 'insert');

    res.status(201).json(mapKeys(record || memItem, camelToSnake));
  });

  app.delete('/api/documents/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    try {
      await db.delete(schema.documents).where(eq(schema.documents.id, id));
    } catch (error: any) {
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
      if (results && results.length > 0) {
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
      console.warn('Database fallback for service records');
    }
    let list = inMemoryServiceRecords;
    if (employeeId) list = list.filter(r => r.employee_id === employeeId || r.employeeId === employeeId);
    res.json(list);
  });

  app.post('/api/service-records', requireAuth, async (req, res) => {
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

    triggerRecalculateEligibility(employeeId).catch(() => {});
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

  app.put('/api/service-records/:id', requireAuth, async (req, res) => {
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
      triggerRecalculateEligibility(updated.employeeId || updated.employee_id).catch(() => {});
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

  app.delete('/api/service-records/:id', requireAuth, async (req, res) => {
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
      console.warn('Database fallback for delete service record');
    }

    inMemoryServiceRecords = inMemoryServiceRecords.filter(r => r.id !== id);
    saveLocalDb();

    if (recordToDelete?.employeeId || recordToDelete?.employee_id) {
      triggerRecalculateEligibility(recordToDelete.employeeId || recordToDelete.employee_id).catch(() => {});
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

  app.post('/api/governing-courses', requireAuth, async (req, res) => {
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

  app.put('/api/governing-courses/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const data = req.body;

    if (data.status === 'غير فعال' || data.status === 'معطل') {
      const refCheck = checkReferentialUsage('governing_courses', id, true, buildRefContext());
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

  app.delete('/api/governing-courses/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const refCheck = checkReferentialUsage('governing_courses', id, false, buildRefContext());
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

  app.post('/api/governing-courses/reset-defaults', requireAuth, async (req, res) => {
    try {
      await ensureGoverningCoursesTable();
      await db.delete(schema.governingCourses).catch(() => {});
      await db.insert(schema.governingCourses).values(DEFAULT_GOVERNING_COURSES as any).catch(() => {});
      const results = await db.select().from(schema.governingCourses).orderBy(asc(schema.governingCourses.grade), asc(schema.governingCourses.id));
      if (results.length > 0) {
        return res.json(results);
      }
    } catch (error: any) {
      // Quiet fallback
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
      console.error('Error reading exemption rules from database:', err);
    }
    return res.json(inMemoryExemptionRules);
  });

  app.post('/api/governing-courses/exemption-rules', requireAuth, async (req, res) => {
    const data = req.body;
    inMemoryExemptionRules = { ...inMemoryExemptionRules, ...data };

    try {
      const rulesJson = JSON.stringify(inMemoryExemptionRules.rules || []);
      const qualsJson = JSON.stringify(inMemoryExemptionRules.qualificationsExemptions || []);
      const gradeJson = JSON.stringify(inMemoryExemptionRules.gradeTitleExemptions || []);
      const autoApply = inMemoryExemptionRules.autoApplyRules !== false;

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
      console.error('Error persisting exemption rules to database:', err);
    }

    return res.json(inMemoryExemptionRules);
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

  app.get('/api/governing-courses/matrix', requireAuth, async (req, res) => {
    res.json(inMemoryPromotionPathsMatrix);
  });

  app.post('/api/governing-courses/matrix', requireAuth, async (req, res) => {
    if (Array.isArray(req.body)) {
      inMemoryPromotionPathsMatrix = req.body;
      res.json(inMemoryPromotionPathsMatrix);
    } else {
      res.status(400).json({ error: 'Invalid matrix data' });
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
    res.json(inMemoryGradeRequirements);
  });

  app.post('/api/governing-courses/grade-requirements', requireAuth, async (req, res) => {
    if (req.body && typeof req.body === 'object') {
      inMemoryGradeRequirements = req.body;
      saveLocalDb();
      return res.json(inMemoryGradeRequirements);
    }
    return res.status(400).json({ error: 'Invalid grade requirements data' });
  });

  app.get('/api/governing-courses/employee-assignments', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.governingCourseEmployeeAssignments);
      if (records && records.length > 0) {
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

  app.post('/api/governing-courses/employee-assignments', requireAuth, async (req, res) => {
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

  function saveLocalDb() {
    try {
      ensureDataDir();
      const state = {
        inMemoryEmployees,
        inMemoryQualifications: genericMemoryStores['qualifications'] || inMemoryQualifications,
        inMemoryJobAssignments: genericMemoryStores['job-assignments'] || inMemoryJobAssignments,
        inMemoryPromotions: genericMemoryStores['promotions'] || inMemoryPromotions,
        inMemorySalaryAllowances: genericMemoryStores['salary-allowances'] || inMemorySalaryAllowances,
        inMemoryAnnualEvaluations: genericMemoryStores['annual-evaluations'] || inMemoryAnnualEvaluations,
        inMemoryTrainingCourses: genericMemoryStores['training-courses'] || inMemoryTrainingCourses,
        inMemoryTransfers: genericMemoryStores['transfers'] || inMemoryTransfers,
        inMemoryRetirements: genericMemoryStores['retirements'] || inMemoryRetirements,
        inMemoryDocuments: genericMemoryStores['documents'] || inMemoryDocuments,
        inMemoryServiceRecords: genericMemoryStores['service-records'] || inMemoryServiceRecords,
        inMemoryServiceCredits: genericMemoryStores['service-credits'] || inMemoryServiceCredits,
        inMemoryLeaves: genericMemoryStores['leaves'] || inMemoryLeaves,
        inMemoryPenalties: genericMemoryStores['penalties'] || inMemoryPenalties,
        inMemoryAppreciations: genericMemoryStores['appreciations'] || inMemoryAppreciations,
        inMemoryPerformanceEvaluations: genericMemoryStores['performance'] || inMemoryPerformanceEvaluations,
        inMemoryCareerHistories: genericMemoryStores['career'] || inMemoryCareerHistories,
        inMemoryDegreeTrackSnapshots: genericMemoryStores['degree-track-snapshots'] || inMemoryDegreeTrackSnapshots,
        inMemoryDegreeTrackSimulationSteps: genericMemoryStores['degree-track-simulation-steps'] || inMemoryDegreeTrackSimulationSteps,
        inMemorySpecializationCredits: genericMemoryStores['specialization-credits'] || inMemorySpecializationCredits,
        inMemoryPromotionDelayReasons: genericMemoryStores['promotion-delay-reasons'] || inMemoryPromotionDelayReasons,
        inMemoryAllowancesDeductions,
        inMemoryEducationDegrees,
        inMemoryResponsibilityAllowances,
        inMemoryWorkLocations,
        inMemoryShiftSystems,
        inMemoryServiceTypes,
        inMemoryEmployeeStatuses,
        inMemoryLeaveTypes,
        inMemoryPenaltyTypes,
        inMemorySalaryScale,
        inMemoryGradePromotionRules,
        inMemoryCommendationTypes,
        inMemoryEmployeeCommendations,
        inMemoryCommendationRulesSettings,
        inMemoryJobTitles,
        inMemoryExemptionRules,
        inMemoryGradeRequirements,
        inMemoryEmployeeAssignments,
        inMemoryTrainings,
        inMemoryEnrollments,
        inMemoryTrainers,
        inMemoryAnnualPlans,
        inMemoryAttendance,
        inMemoryOrgUnits,
        systemSettingsStore,
        leaveAccrualLogs,
        genericMemoryStores
      };
      const jsonStr = JSON.stringify(state, null, 2);
      const encryptedPayload = encryptData(jsonStr);
      fs.writeFileSync(DATA_FILE, encryptedPayload, { encoding: 'utf-8', mode: 0o600 });
    } catch (e) {
      console.warn('Could not save local DB state:', e);
    }
  }

  function loadLocalDb() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const decryptedStr = decryptData(raw);
        const state = JSON.parse(decryptedStr);

        // If file was legacy plain text, re-save immediately as encrypted
        try {
          const parsedRaw = JSON.parse(raw);
          if (parsedRaw && !parsedRaw.version) {
            console.log('[SECURITY] Upgrading legacy plain-text local_storage.json to AES-256-GCM encryption...');
            saveLocalDb();
          }
        } catch (e) {
          // not legacy raw json or already ciphertext
        }
        if (Array.isArray(state.inMemoryEmployees) && state.inMemoryEmployees.length > 0) {
          inMemoryEmployees = state.inMemoryEmployees.map((emp: any) => {
            const baseDt = emp.gradeDate || emp.grade_date || emp.currentAppointmentDate || emp.current_appointment_date || emp.firstAppointmentDate || emp.first_appointment_date || emp.appointmentDate || emp.appointment_date || '';
            const lastPromo = emp.lastPromotionDate || emp.last_promotion_date || baseDt;
            const lastIncr = emp.lastIncrementDate || emp.last_increment_date || baseDt;
            return {
              ...emp,
              lastPromotionDate: lastPromo,
              last_promotion_date: lastPromo,
              lastIncrementDate: lastIncr,
              last_increment_date: lastIncr,
              nextPromotionDueDate: emp.nextPromotionDueDate || emp.next_promotion_due_date || null,
              next_promotion_due_date: emp.next_promotion_due_date || emp.nextPromotionDueDate || null,
              nextIncrementDueDate: emp.nextIncrementDueDate || emp.next_increment_due_date || null,
              next_increment_due_date: emp.next_increment_due_date || emp.nextIncrementDueDate || null,
            };
          });
        }
        if (state.genericMemoryStores && typeof state.genericMemoryStores === 'object') {
          for (const [k, v] of Object.entries(state.genericMemoryStores)) {
            if (Array.isArray(v)) {
              genericMemoryStores[k] = v;
            }
          }
        }
        if (Array.isArray(state.inMemoryJobAssignments)) {
          inMemoryJobAssignments = state.inMemoryJobAssignments;
          genericMemoryStores['job-assignments'] = state.inMemoryJobAssignments;
        }
        if (Array.isArray(state.inMemoryQualifications)) {
          inMemoryQualifications = state.inMemoryQualifications.map((q: any) => {
            const gradYear = q.graduationYear || q.graduation_year;
            const gradDate = q.graduationDate || q.graduation_date || (gradYear ? `${gradYear}-01-01` : null);
            return {
              ...q,
              graduationDate: gradDate,
              graduation_date: gradDate,
              qualificationType: q.qualificationType || q.qualification_type || 'تعيين',
              qualification_type: q.qualification_type || q.qualificationType || 'تعيين'
            };
          });
          genericMemoryStores['qualifications'] = inMemoryQualifications;
        }
        if (Array.isArray(state.inMemoryPromotions)) {
          inMemoryPromotions = state.inMemoryPromotions;
          genericMemoryStores['promotions'] = state.inMemoryPromotions;
        }
        if (Array.isArray(state.inMemorySalaryAllowances)) {
          inMemorySalaryAllowances = state.inMemorySalaryAllowances;
          genericMemoryStores['salary-allowances'] = state.inMemorySalaryAllowances;
        }
        if (Array.isArray(state.inMemoryAnnualEvaluations)) {
          inMemoryAnnualEvaluations = state.inMemoryAnnualEvaluations;
          genericMemoryStores['annual-evaluations'] = state.inMemoryAnnualEvaluations;
        }
        if (Array.isArray(state.inMemoryTrainingCourses)) {
          inMemoryTrainingCourses = state.inMemoryTrainingCourses;
          genericMemoryStores['training-courses'] = state.inMemoryTrainingCourses;
        }
        if (Array.isArray(state.inMemoryTransfers)) {
          inMemoryTransfers = state.inMemoryTransfers;
          genericMemoryStores['transfers'] = state.inMemoryTransfers;
        }
        if (Array.isArray(state.inMemoryRetirements)) {
          inMemoryRetirements = state.inMemoryRetirements;
          genericMemoryStores['retirements'] = state.inMemoryRetirements;
        }
        if (Array.isArray(state.inMemoryDocuments)) {
          inMemoryDocuments = state.inMemoryDocuments;
          genericMemoryStores['documents'] = state.inMemoryDocuments;
        }
        if (Array.isArray(state.inMemoryServiceRecords)) {
          inMemoryServiceRecords = state.inMemoryServiceRecords;
          genericMemoryStores['service-records'] = state.inMemoryServiceRecords;
        }
        if (Array.isArray(state.inMemoryServiceCredits)) {
          inMemoryServiceCredits = state.inMemoryServiceCredits;
          genericMemoryStores['service-credits'] = state.inMemoryServiceCredits;
        }
        if (Array.isArray(state.inMemoryLeaves)) {
          inMemoryLeaves = state.inMemoryLeaves;
          genericMemoryStores['leaves'] = state.inMemoryLeaves;
        }
        if (Array.isArray(state.inMemoryPenalties)) {
          inMemoryPenalties = state.inMemoryPenalties;
          genericMemoryStores['penalties'] = state.inMemoryPenalties;
        }
        if (Array.isArray(state.inMemoryAppreciations)) {
          inMemoryAppreciations = state.inMemoryAppreciations;
          genericMemoryStores['appreciations'] = state.inMemoryAppreciations;
        }
        if (Array.isArray(state.inMemoryPerformanceEvaluations)) {
          inMemoryPerformanceEvaluations = state.inMemoryPerformanceEvaluations;
          genericMemoryStores['performance'] = state.inMemoryPerformanceEvaluations;
        }
        if (Array.isArray(state.inMemoryCareerHistories)) {
          inMemoryCareerHistories = state.inMemoryCareerHistories;
          genericMemoryStores['career'] = state.inMemoryCareerHistories;
        }
        if (Array.isArray(state.inMemoryDegreeTrackSnapshots)) {
          inMemoryDegreeTrackSnapshots = state.inMemoryDegreeTrackSnapshots;
          genericMemoryStores['degree-track-snapshots'] = state.inMemoryDegreeTrackSnapshots;
        }
        if (Array.isArray(state.inMemoryDegreeTrackSimulationSteps)) {
          inMemoryDegreeTrackSimulationSteps = state.inMemoryDegreeTrackSimulationSteps;
          genericMemoryStores['degree-track-simulation-steps'] = state.inMemoryDegreeTrackSimulationSteps;
        }
        if (Array.isArray(state.inMemorySpecializationCredits)) {
          inMemorySpecializationCredits = state.inMemorySpecializationCredits;
          genericMemoryStores['specialization-credits'] = state.inMemorySpecializationCredits;
        }
        if (Array.isArray(state.inMemoryPromotionDelayReasons)) {
          inMemoryPromotionDelayReasons = state.inMemoryPromotionDelayReasons;
          genericMemoryStores['promotion-delay-reasons'] = state.inMemoryPromotionDelayReasons;
          genericMemoryStores['promotion_delay_reasons'] = state.inMemoryPromotionDelayReasons;
        }
        if (Array.isArray(state.inMemoryAllowancesDeductions) && state.inMemoryAllowancesDeductions.length > 0) {
          inMemoryAllowancesDeductions = state.inMemoryAllowancesDeductions.filter((item: any) => {
            if (!item) return false;
            const name = String(item.name || '');
            const isDegree = (name.includes('شهادة') || name.includes('الشهادة') || name.includes('دكتوراه') || name.includes('ماجستير') || name.includes('دبلوم') || name.includes('بكالوريوس') || name.includes('إعدادية') || name.includes('متوسطة'));
            const isResp = (name.includes('منصب') || name.includes('مسؤولية') || name.includes('إشرافية'));
            return !isDegree && !isResp;
          });
        }
        if (Array.isArray(state.inMemoryEducationDegrees) && state.inMemoryEducationDegrees.length > 0) {
          inMemoryEducationDegrees = state.inMemoryEducationDegrees.map((r: any) => ({
            ...r,
            baseline_grade: r.baseline_grade !== undefined ? parseInt(r.baseline_grade) : (r.baselineGrade !== undefined ? parseInt(r.baselineGrade) : 7),
            baselineGrade: r.baseline_grade !== undefined ? parseInt(r.baseline_grade) : (r.baselineGrade !== undefined ? parseInt(r.baselineGrade) : 7),
            baseline_step: r.baseline_step !== undefined ? parseInt(r.baseline_step) : (r.baselineStep !== undefined ? parseInt(r.baselineStep) : 1),
            baselineStep: r.baseline_step !== undefined ? parseInt(r.baseline_step) : (r.baselineStep !== undefined ? parseInt(r.baselineStep) : 1),
          }));
        }
        if (Array.isArray(state.inMemoryResponsibilityAllowances) && state.inMemoryResponsibilityAllowances.length > 0) inMemoryResponsibilityAllowances = state.inMemoryResponsibilityAllowances;
        if (Array.isArray(state.inMemoryWorkLocations) && state.inMemoryWorkLocations.length > 0) inMemoryWorkLocations = state.inMemoryWorkLocations;
        if (Array.isArray(state.inMemoryShiftSystems) && state.inMemoryShiftSystems.length > 0) inMemoryShiftSystems = state.inMemoryShiftSystems;
        if (Array.isArray(state.inMemoryServiceTypes) && state.inMemoryServiceTypes.length > 0) inMemoryServiceTypes = state.inMemoryServiceTypes;
        if (Array.isArray(state.inMemoryEmployeeStatuses) && state.inMemoryEmployeeStatuses.length > 0) inMemoryEmployeeStatuses = state.inMemoryEmployeeStatuses;
        if (Array.isArray(state.inMemoryPenaltyTypes) && state.inMemoryPenaltyTypes.length > 0) inMemoryPenaltyTypes = state.inMemoryPenaltyTypes;
        if (Array.isArray(state.inMemorySalaryScale) && state.inMemorySalaryScale.length > 0) inMemorySalaryScale = state.inMemorySalaryScale;
        if (Array.isArray(state.inMemoryTrainings)) inMemoryTrainings = state.inMemoryTrainings;
        if (Array.isArray(state.inMemoryEnrollments)) inMemoryEnrollments = state.inMemoryEnrollments;
        if (Array.isArray(state.inMemoryTrainers)) inMemoryTrainers = state.inMemoryTrainers;
        if (Array.isArray(state.inMemoryAnnualPlans)) inMemoryAnnualPlans = state.inMemoryAnnualPlans;
        if (Array.isArray(state.inMemoryAttendance)) {
          inMemoryAttendance = state.inMemoryAttendance;
          genericMemoryStores['attendance'] = state.inMemoryAttendance;
        }
        if (Array.isArray(state.inMemoryOrgUnits)) inMemoryOrgUnits = state.inMemoryOrgUnits;

        if (Array.isArray(state.inMemoryLeaveTypes) && state.inMemoryLeaveTypes.length > 0) {
          inMemoryLeaveTypes = state.inMemoryLeaveTypes.map((r: any) => {
            const isInc = Boolean(r.affectsIncrement ?? r.affects_increment ?? (
              r.administrativeEffect === 'يؤخر_العلاوة' || 
              r.administrative_effect === 'يؤخر_العلاوة' || 
              (r.administrative_effect && r.administrative_effect.includes('العلاوة'))
            ));
            const isPromo = Boolean(r.affectsPromotion ?? r.affects_promotion ?? (
              r.administrativeEffect === 'يوقف_الترفيع' || 
              r.administrative_effect === 'يوقف_الترفيع' || 
              (r.administrative_effect && r.administrative_effect.includes('الترفيع'))
            ));
            const isComm = Boolean(r.affectsCommendations ?? r.affects_commendations ?? (
              (r.administrative_effect && r.administrative_effect.includes('الشكر')) ||
              (r.effects_options && r.effects_options.includes('كتب_الشكر'))
            ));
            let salType = r.salaryPaymentType || r.salary_payment_type;
            if (!salType) {
              const fin = r.financialEffect || r.financial_effect;
              if (fin === 'بدون_راتب') salType = 'بدون_راتب';
              else if (fin === 'براتب_ومخصصات_ثابتة') salType = 'منح_الراتب_والمخصصات_الثابتة_فقط';
              else if (fin === 'استقطاع_جزئي') salType = 'استقطاع_جزئي';
              else salType = 'منح_الراتب_كامل';
            }
            return {
              ...r,
              affects_increment: isInc,
              affectsIncrement: isInc,
              affects_promotion: isPromo,
              affectsPromotion: isPromo,
              affects_commendations: isComm,
              affectsCommendations: isComm,
              salary_payment_type: salType,
              salaryPaymentType: salType,
              administrative_effect: r.administrative_effect || r.administrativeEffect || (isPromo || isInc || isComm ? [isPromo && 'يوقف الترفيع', isInc && 'يؤخر العلاوة', isComm && 'يوقف كتب الشكر'].filter(Boolean).join(' و ') : 'لا_يؤثر'),
              financial_effect: r.financial_effect || r.financialEffect || (salType === 'بدون_راتب' ? 'بدون_راتب' : salType === 'منح_الراتب_والمخصصات_الثابتة_فقط' ? 'براتب_ومخصصات_ثابتة' : salType === 'استقطاع_جزئي' ? 'استقطاع_جزئي' : 'براتب_كامل'),
            };
          });
        }
        if (Array.isArray(state.inMemoryGradePromotionRules) && state.inMemoryGradePromotionRules.length > 0) inMemoryGradePromotionRules = state.inMemoryGradePromotionRules;
        if (Array.isArray(state.inMemoryCommendationTypes) && state.inMemoryCommendationTypes.length > 0) inMemoryCommendationTypes = state.inMemoryCommendationTypes;
        if (Array.isArray(state.inMemoryEmployeeCommendations)) inMemoryEmployeeCommendations = state.inMemoryEmployeeCommendations;
        if (state.inMemoryCommendationRulesSettings && typeof state.inMemoryCommendationRulesSettings === 'object') inMemoryCommendationRulesSettings = state.inMemoryCommendationRulesSettings;
        if (Array.isArray(state.inMemoryJobTitles) && state.inMemoryJobTitles.length > 0) inMemoryJobTitles = state.inMemoryJobTitles;
        if (state.inMemoryExemptionRules && typeof state.inMemoryExemptionRules === 'object') {
          inMemoryExemptionRules = { ...inMemoryExemptionRules, ...state.inMemoryExemptionRules };
        }
        if (state.inMemoryGradeRequirements && typeof state.inMemoryGradeRequirements === 'object') {
          inMemoryGradeRequirements = { ...inMemoryGradeRequirements, ...state.inMemoryGradeRequirements };
        }
        if (state.inMemoryEmployeeAssignments && typeof state.inMemoryEmployeeAssignments === 'object') {
          inMemoryEmployeeAssignments = { ...inMemoryEmployeeAssignments, ...state.inMemoryEmployeeAssignments };
        }
        if (state.systemSettingsStore && typeof state.systemSettingsStore === 'object') {
          systemSettingsStore = { ...systemSettingsStore, ...state.systemSettingsStore };
        }
        if (Array.isArray(state.leaveAccrualLogs)) {
          leaveAccrualLogs = state.leaveAccrualLogs;
        }
      }
    } catch (e) {
      console.warn('Could not load local DB state:', e);
    }
  }

  // Load existing data on startup
  loadLocalDb();

  // Automatic periodic check for monthly leave accrual
  setTimeout(() => {
    if (systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
      executeMonthlyLeaveAccrual().catch(() => {});
    }
  }, 3000);
  setInterval(() => {
    if (systemSettingsStore.autoMonthlyLeaveAccrual !== false) {
      executeMonthlyLeaveAccrual().catch(() => {});
    }
  }, 1000 * 60 * 60);

  // Central Promotion and Increment Recalculation Trigger
  async function triggerRecalculateEligibility(employeeId: number | string) {
    if (!employeeId) return null;
    const empIdNum = parseInt(String(employeeId));
    if (isNaN(empIdNum)) return null;

    let emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === empIdNum);
    if (!emp) {
      try {
        const dbEmps = await db.select().from(schema.employees).where(eq(schema.employees.id, empIdNum));
        if (dbEmps && dbEmps.length > 0) {
          emp = dbEmps[0];
        }
      } catch (e) {}
    }
    if (!emp) return null;

    // Collect Context Data
    const commendations = [
      ...inMemoryEmployeeCommendations.filter(c => parseInt(String(c.employee_id || c.employeeId)) === empIdNum),
      ...(genericMemoryStores['appreciations'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empIdNum)
    ];

    const penalties = (genericMemoryStores['penalties'] || []).filter(p => parseInt(String(p.employee_id || p.employeeId)) === empIdNum);
    const attendances = (genericMemoryStores['attendance'] || []).filter(a => parseInt(String(a.employee_id || a.employeeId)) === empIdNum);
    const evaluations = [
      ...(genericMemoryStores['performance'] || []).filter(e => parseInt(String(e.employee_id || e.employeeId)) === empIdNum),
      ...(genericMemoryStores['annual-evaluations'] || []).filter(e => parseInt(String(e.employee_id || e.employeeId)) === empIdNum)
    ];
    const leaves = (genericMemoryStores['leaves'] || []).filter(l => parseInt(String(l.employee_id || l.employeeId)) === empIdNum);
    const serviceCredits = [
      ...(genericMemoryStores['service-credits'] || []).filter(s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum),
      ...(genericMemoryStores['service-records'] || []).filter(s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum)
    ];
    const qualifications = (genericMemoryStores['qualifications'] || []).filter(q => parseInt(String(q.employee_id || q.employeeId)) === empIdNum);
    const degreeTrackSnapshots = (genericMemoryStores['degree-track-snapshots'] || []).filter(s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum);
    const specializationCredits = (genericMemoryStores['specialization-credits'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empIdNum);

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
      governingCourses: inMemoryGoverningCourses,
      governingAssignments: inMemoryEmployeeAssignments,
      gradeRules: inMemoryGradePromotionRules
    };

    const fullResult = recalculateEligibilitySync(emp, context);

    // Check Degree Recognition Track & Deficit Auto-Settlement
    const activeDegreeSnapshot = (genericMemoryStores['degree-track-snapshots'] || []).find(
      s => parseInt(String(s.employee_id || s.employeeId)) === empIdNum && (s.status === 'نشط' || !s.status)
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

        const isAutoSettlementEnabled = inMemoryCommendationRulesSettings.degreeTrackAutoSettlement === true ||
          inMemoryCommendationRulesSettings.degree_track_auto_settlement === true;

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
      const currentReasonsStore = genericMemoryStores['promotion-delay-reasons'] || inMemoryPromotionDelayReasons || [];
      const delaySyncRes = syncPromotionDelayReasons(
        empIdNum,
        rawReasons,
        currentReasonsStore,
        inMemoryCommendationRulesSettings
      );

      genericMemoryStores['promotion-delay-reasons'] = delaySyncRes.updatedStore;
      genericMemoryStores['promotion_delay_reasons'] = delaySyncRes.updatedStore;
      inMemoryPromotionDelayReasons = delaySyncRes.updatedStore;

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

  // Qualifications Toggle Endpoint
  app.patch('/api/qualifications/:id/toggle', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    let qualObj = (genericMemoryStores['qualifications'] || []).find(q => String(q.id) === String(id));
    if (!qualObj) {
      return res.status(404).json({ error: 'الشهادة غير موجودة' });
    }

    const newActive = !(qualObj.is_active !== false && qualObj.isActive !== false);
    qualObj.is_active = newActive;
    qualObj.isActive = newActive;

    try {
      await db.update(schema.qualifications)
        .set({ isActive: newActive })
        .where(eq(schema.qualifications.id, id));
    } catch (e) {}

    const empId = parseInt(String(qualObj.employee_id || qualObj.employeeId));
    if (empId) {
      if (newActive) {
        await updateEmployeeCentralRecord(empId, {
          education_level: qualObj.education_level || qualObj.level,
          educationLevel: qualObj.education_level || qualObj.level,
          specialization: qualObj.specialization || '',
          university: qualObj.institution || qualObj.university || '',
          institution: qualObj.institution || qualObj.university || '',
          graduation_year: qualObj.graduation_year || qualObj.graduationYear || 0,
          graduationYear: qualObj.graduation_year || qualObj.graduationYear || 0,
          education_order: qualObj.evaluation_order || qualObj.equation_number || qualObj.education_order || '',
          evaluation_order: qualObj.evaluation_order || qualObj.equation_number || qualObj.education_order || ''
        });
      } else {
        const nextActive = (genericMemoryStores['qualifications'] || []).find(
          q => String(q.employee_id || q.employeeId) === String(empId) && String(q.id) !== String(id) && (q.is_active !== false && q.isActive !== false)
        );
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
      triggerRecalculateEligibility(empId).catch(() => {});
    }

    saveLocalDb();
    res.json(mapKeys(qualObj, camelToSnake));
  });

  Object.entries(genericEntitiesMap).forEach(([endpoint, schemaKey]) => {
    genericMemoryStores[endpoint] = genericMemoryStores[endpoint] || [];

    app.get(`/api/${endpoint}`, requireAuth, async (req, res) => {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable) {
          let query = db.select().from(targetTable);
          if (empIdParam && targetTable.employeeId) {
            query = query.where(eq(targetTable.employeeId, parseInt(empIdParam as string))) as any;
          }
          const records = await query;
          if (records && records.length > 0) {
            return res.json(records.map((r: any) => mapKeys(r, camelToSnake)));
          }
        }
      } catch (err: any) {
        console.warn(`Database fallback for /api/${endpoint}`);
      }
      let memList = genericMemoryStores[endpoint] || [];
      if (empIdParam) {
        memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
      }

      res.json(memList.map((item: any) => mapKeys(item, camelToSnake)));
    });

    app.post(`/api/${endpoint}`, requireAuth, async (req, res) => {
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
        console.warn(`Database fallback for POST /api/${endpoint}:`, err?.message || err);
      }
      const newId = insertedRecord?.id || (genericMemoryStores[endpoint].reduce((max, r) => Math.max(max, parseInt(r.id) || 0), 0) || 0) + 1;
      const cleanSnake = mapKeys(req.body, camelToSnake);
      const memRecord = { ...cleanSnake, id: newId, created_at: new Date().toISOString() };
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
        triggerRecalculateEligibility(targetEmpId).catch(() => {});
      }

      saveLocalDb();
      res.status(201).json(mapKeys(memRecord, camelToSnake));
    });

    app.put(`/api/${endpoint}/:id`, requireAuth, async (req, res) => {
      const id = parseInt(req.params.id);
      const data = mapKeys(req.body, snakeToCamel);
      let updatedRecord: any = null;
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
          if (updated) {
            updatedRecord = updated;
          }
        }
      } catch (err: any) {
        console.warn(`Database fallback for PUT /api/${endpoint}:`, err?.message || err);
      }
      const idx = genericMemoryStores[endpoint].findIndex(r => String(r.id) === String(id));
      const cleanSnake = mapKeys(req.body, camelToSnake);
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
        triggerRecalculateEligibility(targetEmpId).catch(() => {});
      }

      saveLocalDb();
      return res.json(mapKeys(savedRecord, camelToSnake));
    });

    app.delete(`/api/${endpoint}/:id`, requireAuth, async (req, res) => {
      const id = parseInt(req.params.id);
      const deletedRecord = (genericMemoryStores[endpoint] || []).find(r => String(r.id) === String(id));
      try {
        const targetTable = (schema as any)[schemaKey];
        if (targetTable && targetTable.id) {
          await db.delete(targetTable).where(eq(targetTable.id, id));
        }
      } catch (err: any) {
        console.warn(`Database fallback for DELETE /api/${endpoint}`);
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
        triggerRecalculateEligibility(targetEmpId).catch(() => {});
      }

      saveLocalDb();
      res.json({ success: true });
    });
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
      res.status(500).json({ error: err.message });
    }
  });

  // --- Degree Recognition Track API (Phase 2b) ---

  // 1. Initiate Degree Recognition for In-Service Qualification
  app.post('/api/qualifications/:id/initiate-degree-recognition', requireAuth, async (req, res) => {
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
      let jobTitle = inMemoryJobTitles.find(t => parseInt(String(t.id)) === jobTitleId);
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
      const specializationCredits = (genericMemoryStores['specialization-credits'] || []).filter(
        c => parseInt(String(c.employee_id || c.employeeId)) === empId
      );
      const penalties = (genericMemoryStores['penalties'] || []).filter(p => parseInt(String(p.employee_id || p.employeeId)) === empId);
      const leaves = (genericMemoryStores['leaves'] || []).filter(l => parseInt(String(l.employee_id || l.employeeId)) === empId);
      const attendances = (genericMemoryStores['attendance'] || []).filter(a => parseInt(String(a.employee_id || a.employeeId)) === empId);

      const simResult = calculateDegreeTrackSimulation(createdSnapshot, {
        specializationCredits,
        penalties,
        leaves,
        attendances,
        penaltyTypes: inMemoryPenaltyTypes ? Object.fromEntries(inMemoryPenaltyTypes.map((t: any) => [t.name, t.delay_months || 0])) : undefined
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
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
      res.status(500).json({ error: err.message });
    }
  });

  // Helper to resolve promotion target job title
  function resolveTargetJobTitle(emp: any, targetGrade: number): string {
    const currentTitleName = String(emp.jobTitle || emp.job_title || '').trim();
    const allTitles = genericMemoryStores['job-titles'] || inMemoryJobTitles || [];
    
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

      for (const emp of (inMemoryEmployees || [])) {
        try {
          const empId = parseInt(String(emp.id));
          if (!empId) continue;

          // Skip inactive or separated employees
          const empStatus = emp.status || 'نشط';
          if (['منتهية_خدمته', 'متقاعد', 'مفصول', 'مستقيل', 'متوفى'].includes(empStatus)) {
            continue;
          }

          // Recalculate standard eligibility
          const eligibility = await triggerRecalculateEligibility(empId);

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
            const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
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
          console.warn(`[DUE_LIST_WARN] Could not process eligibility for employee ${emp.id}:`, empErr?.message || empErr);
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
  app.post('/api/promotions/approve-batch', requireAuth, async (req: AuthRequest, res) => {
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

      for (const item of items) {
        const empId = parseInt(String(item.employee_id || item.employeeId));
        const rawType = String(item.type || item.actionType || item.action_type || '').trim();
        const type: 'علاوة' | 'ترفيع' | 'تسوية' = rawType.includes('علاوة') ? 'علاوة' : (rawType.includes('تسوية') ? 'تسوية' : 'ترفيع');

        if (isNaN(empId)) {
          return res.status(400).json({ error: `معرف الموظف غير صالح: ${item.employee_id}` });
        }

        const emp = inMemoryEmployees.find(e => parseInt(String(e.id)) === empId);
        if (!emp) {
          return res.status(404).json({ error: `الموظف رقم (${empId}) غير موجود بالنظام` });
        }

        const empName = emp.fullName || emp.full_name || emp.name || `موظف #${empId}`;
        const curGrade = parseInt(String(emp.grade)) || 10;
        const curStep = parseInt(String(emp.step)) || 1;

        if (type === 'علاوة') {
          const eligibility = await triggerRecalculateEligibility(empId);
          if (eligibility?.increment?.eligibilityStatus !== 'مستحق_للعلاوة' || !eligibility?.increment?.isIncrementEligible) {
            return res.status(400).json({
              error: `الموظف (${empName}) غير مستحق للعلاوة السنوية حالياً: ${eligibility?.increment?.statusReason || 'شروط غير مستوفاة'}`
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
          if (eligibility?.promotion?.eligibilityStatus !== 'مستحق_للترفيع' || !eligibility?.promotion?.isPromotionEligible) {
            return res.status(400).json({
              error: `الموظف (${empName}) غير مستحق للترفيع الوظيفي حالياً: ${eligibility?.promotion?.statusReason || 'شروط غير مستوفاة'}`
            });
          }
          const targetGrade = Math.max(1, curGrade - 1);
          const targetStep = 1;
          const calculatedDueDate = eligibility.promotion.nextPromotionDueDate || finalOrderDate;
          const resolvedTitleObj = findMatchingJobTitleForPromotion(emp, targetGrade, inMemoryJobTitles);

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
          const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
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
            details: dbErr?.message || String(dbErr),
            code: dbErr?.code
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
        orderNumber: finalOrderNumber,
        orderDate: finalOrderDate,
        message: dbOffline
          ? `تم اعتماد ${validatedBatch.length} معاملة بنجاح وحفظها بالتخزين الاحتياطي المحلي المشفر (قاعدة البيانات المركزية غير متصلة) بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
          : `تم اعتماد ${validatedBatch.length} معاملة بنجاح وتحديث قاعدة البيانات المركزية بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
      });
    } catch (err: any) {
      console.error('Error in batch promotion approval:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Batch Auto-Settlement Trigger
  app.post('/api/degree-track/process-auto-settlement', requireAuth, async (req, res) => {
    try {
      const isAutoEnabled = inMemoryCommendationRulesSettings.degreeTrackAutoSettlement === true ||
        inMemoryCommendationRulesSettings.degree_track_auto_settlement === true;

      const batchResult = processBatchDegreeTrackAutoSettlement(
        inMemoryEmployees,
        genericMemoryStores['degree-track-snapshots'] || [],
        {
          specializationCredits: genericMemoryStores['specialization-credits'] || [],
          penalties: genericMemoryStores['penalties'] || [],
          leaves: genericMemoryStores['leaves'] || [],
          attendances: genericMemoryStores['attendance'] || []
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
      res.status(500).json({ error: err.message });
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

      const store = genericMemoryStores['promotion-delay-reasons'] || inMemoryPromotionDelayReasons || [];
      const employeeReasons = store
        .filter(item => parseInt(String(item.employeeId || item.employee_id)) === empId)
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
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Toggle or set isHidden for a delay reason
  app.patch('/api/promotion-delay-reasons/:id/hide', requireAuth, async (req, res) => {
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
      } catch (e) {}

      saveLocalDb();
      res.json({ success: true, isHidden, id });
    } catch (err: any) {
      console.error('Error updating delay reason visibility:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Update reminderDate manually
  app.patch('/api/promotion-delay-reasons/:id/reminder', requireAuth, async (req, res) => {
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
      } catch (e) {}

      saveLocalDb();
      res.json({ success: true, reminderDate, isAutoReminder: false, id });
    } catch (err: any) {
      console.error('Error updating delay reason reminder date:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get Due Reminders for Dashboard (reminderDate <= today and isResolved = false and isHidden = false)
  app.get('/api/promotion-delay-reasons/due-reminders', requireAuth, async (req, res) => {
    try {
      const today = formatDateString(new Date());
      const store = Array.isArray(genericMemoryStores['promotion-delay-reasons'])
        ? genericMemoryStores['promotion-delay-reasons']
        : (Array.isArray(inMemoryPromotionDelayReasons) ? inMemoryPromotionDelayReasons : []);

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
          const emp = (inMemoryEmployees || []).find(e => parseInt(String(e.id)) === empId);

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

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await seedAdminUser();
  });
}

startServer();
