// server.ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, schema, eq, and, desc, asc, ensureSchema, pool } from './src/db/index.ts';
import { getTableColumns } from 'drizzle-orm';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { seedAdminUser } from './src/db/users.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await ensureSchema().catch(() => {});
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // --- API Routes (First, before Vite middleware) ---

  // Custom Authentication Endpoints
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
      }

      const [user] = await db.select()
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .limit(1);

      if (!user || user.password !== password) {
        return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
      }

      // Generate custom base64 token of user info
      const token = Buffer.from(JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: user.email
      })).toString('base64');

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
  app.get('/api/auth/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول إلى هذه الصفحة' });
      }
      const allUsers = await db.select().from(schema.users).orderBy(asc(schema.users.id));
      res.json(allUsers);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: error.message });
    }
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

      // Check if username already exists
      const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
      if (existing) {
        return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً' });
      }

      const [newUser] = await db.insert(schema.users).values({
        username,
        password,
        name,
        email,
        role: role || 'user'
      }).returning();

      res.status(201).json(newUser);
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
      
      // If username changed, check uniqueness
      if (username) {
        const [existing] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
        if (existing && existing.id !== id) {
          return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً لمستخدم آخر' });
        }
      }

      // Do not allow changing the original 'admin' username
      const [currentUserToEdit] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      if (currentUserToEdit && currentUserToEdit.username === 'admin' && username !== 'admin') {
        return res.status(400).json({ error: 'لا يمكن تغيير اسم مستخدم مدير النظام الرئيسي (admin)' });
      }
      if (currentUserToEdit && currentUserToEdit.username === 'admin' && role && role !== 'admin') {
        return res.status(400).json({ error: 'لا يمكن سحب صلاحية مدير النظام من الحساب الرئيسي' });
      }

      const [updatedUser] = await db.update(schema.users)
        .set({
          username,
          password,
          name,
          email,
          role
        })
        .where(eq(schema.users.id, id))
        .returning();

      res.json(updatedUser);
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

      const [userToDelete] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
      if (userToDelete && userToDelete.username === 'admin') {
        return res.status(400).json({ error: 'لا يمكن حذف حساب مدير النظام الرئيسي' });
      }

      await db.delete(schema.users).where(eq(schema.users.id, id));
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

  async function syncEmployeeQualificationFromEmployee(employeeId: number, mappedData: any) {
    if (!employeeId || isNaN(employeeId)) return;
    try {
      const level = mappedData.educationLevel || mappedData.education_level;
      const spec = mappedData.specialization;
      const univ = mappedData.university || mappedData.institution;
      const gradYearVal = mappedData.graduationYear ?? mappedData.graduation_year;
      const gradYear = gradYearVal ? parseInt(String(gradYearVal)) : null;
      const eduOrder = mappedData.educationOrder || mappedData.education_order || mappedData.evaluationOrder || mappedData.evaluation_order || mappedData.equationNumber;

      if (!level && !spec && !univ && !gradYear && !eduOrder) return;

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
          specialization: spec || null,
          university: univ || null,
          graduationYear: gradYear || new Date().getFullYear(),
          equationNumber: eduOrder || null,
          isActive: true,
        });
      }
    } catch (err) {
      console.error('Error syncing qualification from employee:', err);
    }
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

    // Ensure education fields are explicitly provided in snake_case format
    mapped.education_level = mapped.education_level || emp.educationLevel || '';
    mapped.specialization = mapped.specialization || emp.specialization || '';
    mapped.university = mapped.university || mapped.institution || emp.university || emp.institution || '';
    mapped.institution = mapped.institution || mapped.university || emp.institution || emp.university || '';
    mapped.graduation_year = mapped.graduation_year || emp.graduationYear || '';
    mapped.education_order = mapped.education_order || mapped.evaluation_order || emp.educationOrder || emp.evaluationOrder || '';
    mapped.evaluation_order = mapped.evaluation_order || mapped.education_order || emp.evaluationOrder || emp.educationOrder || '';

    return mapped;
  }

  // Employees API
  app.get('/api/employees', requireAuth, async (req, res) => {
    try {
      const allEmployees = await db.select().from(schema.employees).orderBy(desc(schema.employees.createdAt));

      // Auto-repair any employees whose full_name was set to 'غير محدد' by mistake
      for (const emp of allEmployees) {
        if ((!emp.fullName || emp.fullName === 'غير محدد') && (emp.firstName || emp.fatherName)) {
          const nameParts = [emp.firstName, emp.fatherName, emp.grandfatherName, emp.greatGrandfatherName].filter(Boolean);
          if (nameParts.length > 0) {
            const repairedFullName = nameParts.join(' ');
            emp.fullName = repairedFullName;
            await db.update(schema.employees)
              .set({ fullName: repairedFullName })
              .where(eq(schema.employees.id, emp.id))
              .catch(e => console.error('Error auto-repairing employee name:', e));
          }
        }
      }

      res.json(allEmployees.map(enhanceEmployeeRecord));
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  app.post('/api/employees', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      processEmployeeNameData(mappedData, true);
      processEmployeeEducationData(mappedData);
      const cleanData = sanitizeEmployeeData(mappedData);

      const [newEmployee] = await db.insert(schema.employees).values(cleanData).returning();
      if (newEmployee && newEmployee.id) {
        await syncEmployeeQualificationFromEmployee(newEmployee.id, mappedData);
      }
      res.status(201).json(enhanceEmployeeRecord(newEmployee));
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

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      const processedEmployees: any[] = [];

      for (const empItem of employees) {
        const action = empItem.action || (empItem.overwrite ? 'update' : 'insert');
        if (action === 'skip') {
          skippedCount++;
          continue;
        }

        const empData = empItem.data || empItem;
        const mappedData = mapKeys(empData, snakeToCamel);
        delete mappedData.id;
        delete mappedData.createdAt;

        processEmployeeNameData(mappedData, true);
        processEmployeeEducationData(mappedData);

        if (!mappedData.status) mappedData.status = 'مستمر بالخدمة';
        if (!mappedData.serviceType) mappedData.serviceType = 'ملاك دائم';
        if (!mappedData.gender) mappedData.gender = 'ذكر';

        const companyNum = mappedData.companyNumber ? String(mappedData.companyNumber).trim() : null;
        const civilNum = mappedData.civilServiceNumber ? String(mappedData.civilServiceNumber).trim() : null;

        // Check if employee already exists in DB by companyNumber or civilServiceNumber
        let existingEmp = null;
        if (companyNum) {
          const [found] = await db.select().from(schema.employees).where(eq(schema.employees.companyNumber, companyNum));
          existingEmp = found;
        }
        if (!existingEmp && civilNum) {
          const [found] = await db.select().from(schema.employees).where(eq(schema.employees.civilServiceNumber, civilNum));
          existingEmp = found;
        }

        const cleanData = sanitizeEmployeeData(mappedData);

        if (existingEmp && action === 'update') {
          // Perform update/overwrite on existing employee
          const [updated] = await db.update(schema.employees)
            .set(cleanData)
            .where(eq(schema.employees.id, existingEmp.id))
            .returning();

          updatedCount++;
          if (updated) {
            processedEmployees.push(enhanceEmployeeRecord(updated));
          }
        } else {
          // Perform fresh insertion
          const [inserted] = await db.insert(schema.employees).values(cleanData).returning();
          insertedCount++;

          // If education level provided, create qualification entry
          if (inserted && inserted.educationLevel && inserted.educationLevel !== 'بدون') {
            try {
              await db.insert(schema.qualifications).values({
                employeeId: inserted.id,
                level: inserted.educationLevel,
                specialization: inserted.specialization || 'عام',
                university: 'مستوردة من الملف',
                graduationYear: new Date().getFullYear(),
                isActive: true,
              });
            } catch (qErr) {
              console.error('Error auto-creating qualification on bulk import:', qErr);
            }
          }

          if (inserted) {
            processedEmployees.push(enhanceEmployeeRecord(inserted));
          }
        }
      }

      res.json({
        success: true,
        count: processedEmployees.length,
        insertedCount,
        updatedCount,
        skippedCount,
        employees: processedEmployees
      });
    } catch (error: any) {
      console.error('Error in bulk import:', error);
      res.status(500).json({ error: error.message || 'فشلت عملية ترحيل الموظفين' });
    }
  });

  app.get('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const [employee] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      res.json(enhanceEmployeeRecord(employee));
    } catch (error: any) {
      console.error('Error fetching employee details:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      processEmployeeNameData(mappedData, false);
      processEmployeeEducationData(mappedData);
      const cleanData = sanitizeEmployeeData(mappedData);

      const [updatedEmployee] = await db.update(schema.employees)
        .set(cleanData)
        .where(eq(schema.employees.id, id))
        .returning();

      if (updatedEmployee && updatedEmployee.id) {
        await syncEmployeeQualificationFromEmployee(updatedEmployee.id, mappedData);
      }

      res.json(enhanceEmployeeRecord(updatedEmployee));
    } catch (error: any) {
      console.error('Error updating employee:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/employees/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      await db.delete(schema.employees).where(eq(schema.employees.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ error: error.message });
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
      res.json(leaves.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error fetching leaves:', error);
      res.status(500).json({ error: error.message });
    }
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

      const [newLeave] = await db.insert(schema.leaveRequests).values(mappedData).returning();
      res.status(201).json(mapKeys(newLeave, camelToSnake));
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

      const [updatedLeave] = await db.update(schema.leaveRequests)
        .set(mappedData)
        .where(eq(schema.leaveRequests.id, id))
        .returning();
      res.json(mapKeys(updatedLeave, camelToSnake));
    } catch (error: any) {
      console.error('Error updating leave request:', error);
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
      res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error fetching penalties:', error);
      res.status(500).json({ error: error.message });
    }
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

      const [newPenalty] = await db.insert(schema.penalties).values(mappedData).returning();
      res.status(201).json(mapKeys(newPenalty, camelToSnake));
    } catch (error: any) {
      console.error('Error creating penalty:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/penalties/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      const [updated] = await db.update(schema.penalties).set(mappedData).where(eq(schema.penalties.id, parseInt(id))).returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/penalties/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(schema.penalties).where(eq(schema.penalties.id, parseInt(id)));
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
      res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error fetching appreciations:', error);
      res.status(500).json({ error: error.message });
    }
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

      const [newAppreciation] = await db.insert(schema.appreciations).values(mappedData).returning();
      res.status(201).json(mapKeys(newAppreciation, camelToSnake));
    } catch (error: any) {
      console.error('Error creating appreciation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/appreciations/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      if (mappedData.employeeId !== undefined) {
        mappedData.employeeId = parseInt(mappedData.employeeId);
      }
      delete mappedData.id;
      delete mappedData.createdAt;

      const [updated] = await db.update(schema.appreciations).set(mappedData).where(eq(schema.appreciations.id, parseInt(id))).returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating appreciation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/appreciations/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(schema.appreciations).where(eq(schema.appreciations.id, parseInt(id)));
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
      res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error fetching performance:', error);
      res.status(500).json({ error: error.message });
    }
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
      const existing = await db.select().from(schema.performanceEvaluations).where(
        and(
          eq(schema.performanceEvaluations.employeeId, mappedData.employeeId),
          eq(schema.performanceEvaluations.year, evalYear)
        )
      );

      if (existing.length > 0) {
        return res.status(400).json({
          error: `الموظف لديه تقييم أداء مسجل سابقاً لسنة ${evalYear}. لا يُسمح بإدخال أكثر من تقييم واحد للموظف خلال نفس السنة التقييمية.`
        });
      }

      const [newEval] = await db.insert(schema.performanceEvaluations).values(mappedData).returning();
      res.status(201).json(mapKeys(newEval, camelToSnake));
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

      const [updatedEval] = await db.update(schema.performanceEvaluations)
        .set(mappedData)
        .where(eq(schema.performanceEvaluations.id, id))
        .returning();
      res.json(mapKeys(updatedEval, camelToSnake));
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
      await db.delete(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.id, id));
      res.json({ success: true, message: 'تم حذف التقييم بنجاح' });
    } catch (error: any) {
      console.error('Error deleting performance evaluation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Career Histories API
  app.get('/api/career', requireAuth, async (req, res) => {
    try {
      const empIdParam = req.query.employeeId || req.query.employee_id;
      const employeeId = empIdParam ? parseInt(empIdParam as string) : undefined;
      if (!employeeId || isNaN(employeeId)) {
        return res.status(400).json({ error: 'Missing or invalid employeeId' });
      }
      const results = await db.select()
        .from(schema.careerHistories)
        .where(eq(schema.careerHistories.employeeId, employeeId))
        .orderBy(desc(schema.careerHistories.createdAt));
      res.json(results.map(r => mapKeys(r, camelToSnake)));
    } catch (error: any) {
      console.error('Error fetching career history:', error);
      res.status(500).json({ error: error.message });
    }
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

      const [newHistory] = await db.insert(schema.careerHistories).values(mappedData).returning();
      res.status(201).json(mapKeys(newHistory, camelToSnake));
    } catch (error: any) {
      console.error('Error creating career history:', error);
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
      res.json(courses.map(enhanceTrainingRecord));
    } catch (error: any) {
      console.error('Error fetching trainings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/trainings', requireAuth, async (req, res) => {
    try {
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

      const [newCourse] = await db.insert(schema.trainings).values(data).returning();
      res.status(201).json(enhanceTrainingRecord(newCourse));
    } catch (error: any) {
      console.error('Error creating training course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/trainings/:id', requireAuth, async (req, res) => {
    try {
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

      const [updated] = await db.update(schema.trainings).set(data).where(eq(schema.trainings.id, id)).returning();
      res.json(enhanceTrainingRecord(updated));
    } catch (error: any) {
      console.error('Error updating training:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/trainings/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(schema.trainings).where(eq(schema.trainings.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting training:', error);
      res.status(500).json({ error: error.message });
    }
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
      res.json(enrollments.map(enhanceEnrollmentRecord));
    } catch (error: any) {
      console.error('Error fetching enrollments:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/trainings/enroll', requireAuth, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      if (data.trainingId) data.trainingId = parseInt(data.trainingId);
      if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;
      data.enrollmentDate = data.enrollmentDate || new Date().toISOString().split('T')[0];

      const [newEnroll] = await db.insert(schema.trainingEnrollments).values(data).returning();

      // If internal employee & result is passed/completed, auto-sync to employee's career training record
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

      res.status(201).json(enhanceEnrollmentRecord(newEnroll));
    } catch (error: any) {
      console.error('Error enrolling training course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/trainings/enrollments/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = mapKeys(req.body, snakeToCamel);
      if (data.trainingId) data.trainingId = parseInt(data.trainingId);
      if (data.employeeId) data.employeeId = parseInt(data.employeeId) || null;

      const [updated] = await db.update(schema.trainingEnrollments).set(data).where(eq(schema.trainingEnrollments.id, id)).returning();

      // If internal employee & result is passed/completed, auto-sync to employee's career training record
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

      res.json(enhanceEnrollmentRecord(updated));
    } catch (error: any) {
      console.error('Error updating enrollment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/trainings/enrollments/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting enrollment:', error);
      res.status(500).json({ error: error.message });
    }
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
      res.json(result.rows.map(enhanceTrainerRecord));
    } catch (error: any) {
      console.error('Error fetching trainers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = await pool.query('SELECT * FROM trainers WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'المدرب غير موجود' });
      }
      res.json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      console.error('Error fetching trainer by id:', error);
      res.status(500).json({ error: error.message });
    }
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

      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        return res.status(400).json({ error: 'بيانات المدرب غير مكتملة' });
      }

      const cols = keys.join(', ');
      const params = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map(k => snakeData[k]);

      const query = `INSERT INTO trainers (${cols}) VALUES (${params}) RETURNING *`;
      const result = await pool.query(query, values);
      res.status(201).json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      console.error('Error creating trainer:', error);
      res.status(500).json({ error: error.message });
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
        let parsedEmpId: number | null = null;
        if (rawEmpId !== null && rawEmpId !== '' && !isNaN(parseInt(rawEmpId))) {
          parsedEmpId = parseInt(rawEmpId);
        }
        addField('employee_id', parsedEmpId);
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

      const keys = Object.keys(snakeData);
      if (keys.length === 0) {
        const existingRow = await pool.query(`SELECT * FROM trainers WHERE id = $1`, [id]);
        return res.json(enhanceTrainerRecord(existingRow.rows[0]));
      }

      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values = keys.map(k => snakeData[k]);
      values.push(id);

      const query = `UPDATE trainers SET ${setClause} WHERE id = $${values.length} RETURNING *`;
      const result = await pool.query(query, values);
      res.json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      console.error('Error updating trainer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await pool.query('UPDATE trainings SET trainer_id = NULL WHERE trainer_id = $1', [id]);
      await pool.query('DELETE FROM trainers WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting trainer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Annual Training Plans API (خطط التدريب السنوية)
  app.get('/api/annual-plans', requireAuth, async (req, res) => {
    try {
      const plans = await db.select().from(schema.annualTrainingPlans).orderBy(desc(schema.annualTrainingPlans.year));
      res.json(plans.map(enhancePlanRecord));
    } catch (error: any) {
      console.error('Error fetching annual plans:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/annual-plans', requireAuth, async (req, res) => {
    try {
      const data = mapKeys(req.body, snakeToCamel);
      if (data.year) data.year = parseInt(data.year);
      if (data.plannedCoursesCount) data.plannedCoursesCount = parseInt(data.plannedCoursesCount);
      if (data.plannedTraineesCount) data.plannedTraineesCount = parseInt(data.plannedTraineesCount);
      if (data.plannedBudget) data.plannedBudget = parseInt(data.plannedBudget);

      const { year, track } = data;
      const existing = await db.select().from(schema.annualTrainingPlans)
        .where(and(eq(schema.annualTrainingPlans.year, year), eq(schema.annualTrainingPlans.track, track))).limit(1);

      if (existing.length > 0) {
        const [updated] = await db.update(schema.annualTrainingPlans)
          .set(data)
          .where(eq(schema.annualTrainingPlans.id, existing[0].id))
          .returning();
        return res.json(enhancePlanRecord(updated));
      }

      const [newPlan] = await db.insert(schema.annualTrainingPlans).values(data).returning();
      res.status(201).json(enhancePlanRecord(newPlan));
    } catch (error: any) {
      console.error('Error saving annual plan:', error);
      res.status(500).json({ error: error.message });
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
      res.json(mapped);
    } catch (error: any) {
      console.error('Error fetching salary records:', error);
      res.status(500).json({ error: error.message });
    }
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
      res.status(210).json({ success: true, count: toInsert.length });
    } catch (error: any) {
      console.error('Error bulk creating salary records:', error);
      res.status(500).json({ error: error.message });
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
      res.json(mapped);
    } catch (error: any) {
      console.error('Error fetching attendance records:', error);
      res.status(500).json({ error: error.message });
    }
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
  app.get('/api/org-units', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.orgUnits);
      res.json(records);
    } catch (error: any) {
      console.error('Error fetching org units:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/org-units', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newRecord] = await db.insert(schema.orgUnits).values({
        name: data.name,
        type: data.type,
        parentId: (data.parentId !== undefined && data.parentId !== null && data.parentId !== '') ? parseInt(data.parentId) : null,
        managerId: (data.managerId !== undefined && data.managerId !== null && data.managerId !== '') ? parseInt(data.managerId) : null,
      }).returning();
      res.status(201).json(newRecord);
    } catch (error: any) {
      console.error('Error creating org unit:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/org-units/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const updateObj: any = {};
      if (data.name !== undefined) updateObj.name = data.name;
      if (data.type !== undefined) updateObj.type = data.type;
      
      if (data.parentId !== undefined) {
        updateObj.parentId = (data.parentId !== null && data.parentId !== '') ? parseInt(data.parentId) : null;
      }
      if (data.managerId !== undefined) {
        updateObj.managerId = (data.managerId !== null && data.managerId !== '') ? parseInt(data.managerId) : null;
      }

      const [updated] = await db.update(schema.orgUnits)
        .set(updateObj)
        .where(eq(schema.orgUnits.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating org unit:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/org-units/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }

      // Fetch all org units to find descendants recursively
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

      // Delete all of them starting from the descendants to preserve constraints or run a bulk delete
      for (const deleteId of idsToDelete.reverse()) {
        await db.delete(schema.orgUnits).where(eq(schema.orgUnits.id, deleteId));
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting org unit:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Salary Scale API ---
  app.get('/api/salary-scale', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.salaryScale).orderBy(asc(schema.salaryScale.grade), asc(schema.salaryScale.step));
      res.json(records);
    } catch (error: any) {
      console.error('Error fetching salary scale:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/salary-scale', requireAuth, async (req, res) => {
    try {
      const { grade, step, amount } = req.body;
      const [newRecord] = await db.insert(schema.salaryScale).values({
        grade: parseInt(grade),
        step: parseInt(step),
        amount: parseInt(amount),
      }).returning();
      res.status(201).json(newRecord);
    } catch (error: any) {
      console.error('Error creating salary scale record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/salary-scale/bulk', requireAuth, async (req, res) => {
    try {
      const items = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'Body must be an array' });
      }
      
      // Clear existing first to re-seed or overwrite if needed
      await db.delete(schema.salaryScale);
      
      const toInsert = items.map(item => ({
        grade: parseInt(item.grade),
        step: parseInt(item.step),
        amount: parseInt(item.amount)
      }));

      if (toInsert.length > 0) {
        await db.insert(schema.salaryScale).values(toInsert);
      }
      res.json({ success: true, count: toInsert.length });
    } catch (error: any) {
      console.error('Error bulk inserting salary scale:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/salary-scale/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { grade, step, amount } = req.body;
      const [updated] = await db.update(schema.salaryScale)
        .set({
          grade: grade !== undefined ? parseInt(grade) : undefined,
          step: step !== undefined ? parseInt(step) : undefined,
          amount: amount !== undefined ? parseInt(amount) : undefined,
        })
        .where(eq(schema.salaryScale.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating salary scale:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/salary-scale/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.salaryScale).where(eq(schema.salaryScale.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting salary scale record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Allowances and Deductions API ---
  app.get('/api/allowances-deductions', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.allowancesDeductions).orderBy(asc(schema.allowancesDeductions.id));
      res.json(records);
    } catch (error: any) {
      console.error('Error fetching allowances/deductions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/allowances-deductions', requireAuth, async (req, res) => {
    try {
      const { name, type, calcType, value, status } = req.body;
      const [newRecord] = await db.insert(schema.allowancesDeductions).values({
        name,
        type,
        calcType,
        value: parseInt(value),
        status: status || 'فعال',
      }).returning();
      res.status(201).json(newRecord);
    } catch (error: any) {
      console.error('Error creating allowance/deduction:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/allowances-deductions/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, type, calcType, value, status } = req.body;
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
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating allowance/deduction:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/allowances-deductions/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.allowancesDeductions).where(eq(schema.allowancesDeductions.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting allowance/deduction:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Work Locations API ---
  app.get('/api/work-locations', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.workLocations).orderBy(asc(schema.workLocations.id));
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching work locations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/work-locations', requireAuth, async (req, res) => {
    try {
      const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body;
      const [newRecord] = await db.insert(schema.workLocations).values({
        name,
        province,
        allowanceAmount: allowance_amount !== undefined ? parseInt(allowance_amount) : 0,
        workStartHour: work_start_hour || '08:00',
        workEndHour: work_end_hour || '15:00',
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating work location:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/work-locations/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, province, allowance_amount, work_start_hour, work_end_hour } = req.body;
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
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating work location:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/work-locations/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.workLocations).where(eq(schema.workLocations.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting work location:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Education Degrees API ---
  app.get('/api/education-degrees', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.educationDegrees).orderBy(asc(schema.educationDegrees.id));
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching education degrees:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/education-degrees', requireAuth, async (req, res) => {
    try {
      const { name, is_higher_education, allowance_rate, higher_allowance_rate } = req.body;
      const [newRecord] = await db.insert(schema.educationDegrees).values({
        name,
        isHigherEducation: is_higher_education === true,
        allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : 0,
        higherAllowanceRate: higher_allowance_rate !== undefined ? parseInt(higher_allowance_rate) : 0,
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating education degree:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/education-degrees/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, is_higher_education, allowance_rate, higher_allowance_rate } = req.body;
      const [updated] = await db.update(schema.educationDegrees)
        .set({
          name,
          isHigherEducation: is_higher_education !== undefined ? is_higher_education === true : undefined,
          allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : undefined,
          higherAllowanceRate: higher_allowance_rate !== undefined ? parseInt(higher_allowance_rate) : undefined,
        })
        .where(eq(schema.educationDegrees.id, id))
        .returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating education degree:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/education-degrees/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.educationDegrees).where(eq(schema.educationDegrees.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting education degree:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Responsibility Allowances API ---
  app.get('/api/responsibility-allowances', requireAuth, async (req, res) => {
    try {
      let records = await db.select().from(schema.responsibilityAllowances).orderBy(asc(schema.responsibilityAllowances.id));
      if (records.length === 0) {
        // Seed default Iraqi responsibility allowances
        const defaults = [
          { name: "مدير عام", allowanceRate: 50 },
          { name: "معاون مدير عام", allowanceRate: 40 },
          { name: "مدير هيئة", allowanceRate: 35 },
          { name: "مدير قسم مركزي", allowanceRate: 30 },
          { name: "مدير قسم", allowanceRate: 25 },
          { name: "مسؤول شعبة", allowanceRate: 20 },
          { name: "مسؤول وحدة", allowanceRate: 15 },
          { name: "مسؤول وجبة", allowanceRate: 10 },
          { name: "بلا مسؤولية", allowanceRate: 0 }
        ];
        await db.insert(schema.responsibilityAllowances).values(defaults);
        records = await db.select().from(schema.responsibilityAllowances).orderBy(asc(schema.responsibilityAllowances.id));
      }
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching responsibility allowances:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/responsibility-allowances', requireAuth, async (req, res) => {
    try {
      const { name, allowance_rate } = req.body;
      const [newRecord] = await db.insert(schema.responsibilityAllowances).values({
        name,
        allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : 0,
      }).returning();
      res.status(201).json(mapKeys(newRecord, camelToSnake));
    } catch (error: any) {
      console.error('Error creating responsibility allowance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/responsibility-allowances/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, allowance_rate } = req.body;
      const [updated] = await db.update(schema.responsibilityAllowances)
        .set({
          name,
          allowanceRate: allowance_rate !== undefined ? parseInt(allowance_rate) : undefined,
        })
        .where(eq(schema.responsibilityAllowances.id, id))
        .returning();
      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating responsibility allowance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/responsibility-allowances/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.responsibilityAllowances).where(eq(schema.responsibilityAllowances.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting responsibility allowance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Leave Types API ---
  app.get('/api/leave-types', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.leaveTypes).orderBy(asc(schema.leaveTypes.id));
      res.json(records);
    } catch (error: any) {
      console.error('Error fetching leave types:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/leave-types', requireAuth, async (req, res) => {
    try {
      const { name, maxDays, description, status } = req.body;
      const [newRecord] = await db.insert(schema.leaveTypes).values({
        name,
        maxDays: maxDays ? parseInt(maxDays) : null,
        description,
        status: status || 'فعال',
      }).returning();
      res.status(201).json(newRecord);
    } catch (error: any) {
      console.error('Error creating leave type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/leave-types/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, maxDays, description, status } = req.body;
      const [updated] = await db.update(schema.leaveTypes)
        .set({
          name,
          maxDays: maxDays !== undefined ? (maxDays ? parseInt(maxDays) : null) : undefined,
          description,
          status: status !== undefined ? status : undefined,
        })
        .where(eq(schema.leaveTypes.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating leave type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/leave-types/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.leaveTypes).where(eq(schema.leaveTypes.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting leave type:', error);
      res.status(500).json({ error: error.message });
    }
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
      
      // Auto upgrade if database contains old erroneous records or is empty
      const isOldData = records.length === 0 || records.some(r => r.name.includes('(يوم)') || r.name.includes('(أيام)') || r.name === 'إنذار خطي') || !records.some(r => r.name === 'العزل');

      if (isOldData || req.query.reset === 'true') {
        await db.delete(schema.penaltyTypes);
        for (const item of LEGAL_ARTICLE_8_PENALTIES) {
          await db.insert(schema.penaltyTypes).values(item).catch(() => {});
        }
        records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      }

      const enrichedRecords = records.map(enrichPenaltyRecord);
      res.json(mapKeys(enrichedRecords, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching penalty types:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/penalty-types/reset-legal', requireAuth, async (req, res) => {
    try {
      await db.delete(schema.penaltyTypes);
      for (const item of LEGAL_ARTICLE_8_PENALTIES) {
        await db.insert(schema.penaltyTypes).values(item).catch(() => {});
      }
      const records = await db.select().from(schema.penaltyTypes).orderBy(asc(schema.penaltyTypes.id));
      const enrichedRecords = records.map(enrichPenaltyRecord);
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
      const [newRecord] = await db.insert(schema.penaltyTypes).values({
        name,
        delayMonths: delayMonths ? parseInt(delayMonths) : 0,
        description: description || '',
        salaryDeductionDays: salaryDeductionDays ? parseInt(salaryDeductionDays) : 0,
        status: status || 'فعال',
      }).returning();
      res.status(201).json(mapKeys(enrichPenaltyRecord(newRecord), camelToSnake));
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
      if (!updated) return res.status(404).json({ error: 'نوع العقوبة غير موجود' });
      res.json(mapKeys(enrichPenaltyRecord(updated), camelToSnake));
    } catch (error: any) {
      console.error('Error updating penalty type:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/penalty-types/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'ID غير صالح' });
      await db.delete(schema.penaltyTypes).where(eq(schema.penaltyTypes.id, id));
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
      const hasCanonicalForms = records.some(r => r.title.includes('FORM_1') || r.title.includes('FORM_2') || r.title.includes('FORM_3'));
      
      if (records.length === 0 || !hasCanonicalForms) {
        for (const form of CANONICAL_SEED_FORMS) {
          const exists = records.find(r => r.title === form.title);
          if (!exists) {
            await db.insert(schema.evaluationForms).values(form).catch(() => {});
          }
        }
        records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      } else {
        // Migration update for existing canonical forms if they contain obsolete default responsibilities
        for (const form of CANONICAL_SEED_FORMS) {
          const existing = records.find(r => r.title === form.title);
          if (existing) {
            const respStr = existing.applicableResponsibilities || '';
            if (existing.title.includes('FORM_1') && respStr.includes('مسؤول وحدة')) {
              await db.update(schema.evaluationForms).set({
                applicableResponsibilities: form.applicableResponsibilities
              }).where(eq(schema.evaluationForms.id, existing.id)).catch(() => {});
            } else if (existing.title.includes('FORM_2') && !respStr.includes('مسؤول وحدة')) {
              await db.update(schema.evaluationForms).set({
                applicableResponsibilities: form.applicableResponsibilities
              }).where(eq(schema.evaluationForms.id, existing.id)).catch(() => {});
            }
          }
        }
        records = await db.select().from(schema.evaluationForms).orderBy(asc(schema.evaluationForms.id));
      }
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching evaluation forms:', error);
      res.status(500).json({ error: error.message });
    }
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
      await db.delete(schema.evaluationForms).where(eq(schema.evaluationForms.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting evaluation form:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Shift Systems API ---
  app.get('/api/shift-systems', requireAuth, async (req, res) => {
    try {
      const records = await db.select().from(schema.shiftSystems).orderBy(asc(schema.shiftSystems.id));
      res.json(mapKeys(records, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching shift systems:', error);
      res.status(500).json({ error: error.message });
    }
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
        allowance_percentage,
        allowance_flat_amount,
        overtime_factor,
        notes,
      } = req.body;

      const [newRecord] = await db.insert(schema.shiftSystems).values({
        name,
        workDays: work_days !== undefined ? parseInt(work_days) : 1,
        restDays: rest_days !== undefined ? parseInt(rest_days) : 3,
        shiftHoursType: shift_hours_type || '24h',
        dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : 24,
        description: description || '',
        allowancePercentage: allowance_percentage !== undefined ? parseFloat(allowance_percentage) : 0,
        allowanceFlatAmount: allowance_flat_amount !== undefined ? parseInt(allowance_flat_amount) : 0,
        overtimeFactor: overtime_factor !== undefined ? parseFloat(overtime_factor) : 1.0,
        notes: notes || '',
      }).returning();

      res.status(201).json(mapKeys(newRecord, camelToSnake));
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
        allowance_percentage,
        allowance_flat_amount,
        overtime_factor,
        notes,
      } = req.body;

      const [updated] = await db.update(schema.shiftSystems)
        .set({
          name: name !== undefined ? name : undefined,
          workDays: work_days !== undefined ? parseInt(work_days) : undefined,
          restDays: rest_days !== undefined ? parseInt(rest_days) : undefined,
          shiftHoursType: shift_hours_type !== undefined ? shift_hours_type : undefined,
          dailyHours: daily_hours !== undefined ? parseInt(daily_hours) : undefined,
          description: description !== undefined ? description : undefined,
          allowancePercentage: allowance_percentage !== undefined ? parseFloat(allowance_percentage) : undefined,
          allowanceFlatAmount: allowance_flat_amount !== undefined ? parseInt(allowance_flat_amount) : undefined,
          overtimeFactor: overtime_factor !== undefined ? parseFloat(overtime_factor) : undefined,
          notes: notes !== undefined ? notes : undefined,
        })
        .where(eq(schema.shiftSystems.id, id))
        .returning();

      res.json(mapKeys(updated, camelToSnake));
    } catch (error: any) {
      console.error('Error updating shift system:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/shift-systems/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.shiftSystems).where(eq(schema.shiftSystems.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting shift system:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // System Settings API
  app.get('/api/settings', async (req, res) => {
    try {
      let [settings] = await db.select().from(schema.systemSettings).limit(1);
      if (!settings) {
        [settings] = await db.insert(schema.systemSettings).values({}).returning();
      }
      res.json(settings);
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/settings', requireAuth, async (req, res) => {
    try {
      const { id, createdAt, ...data } = req.body;
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
      res.json(updated);
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
      res.json(logs);
    } catch (error: any) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ error: error.message });
    }
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

  // Helper to sync employee primary education_level with the latest active qualification
  async function syncEmployeeEducationQualification(employeeId: number) {
    if (!employeeId || isNaN(employeeId)) return;
    try {
      const activeQuals = await db.select()
        .from(schema.qualifications)
        .where(and(
          eq(schema.qualifications.employeeId, employeeId),
          eq(schema.qualifications.isActive, true)
        ))
        .orderBy(desc(schema.qualifications.graduationYear), desc(schema.qualifications.createdAt), desc(schema.qualifications.id));

      if (activeQuals.length > 0) {
        const latestActive = activeQuals[0];
        await db.update(schema.employees)
          .set({
            educationLevel: latestActive.level,
            specialization: latestActive.specialization || null,
            university: latestActive.university || null,
            institution: latestActive.university || null,
            graduationYear: latestActive.graduationYear || null,
            educationOrder: latestActive.equationNumber || null,
            evaluationOrder: latestActive.equationNumber || null,
            updatedAt: new Date(),
          })
          .where(eq(schema.employees.id, employeeId));
      } else {
        await db.update(schema.employees)
          .set({
            educationLevel: 'بدون',
            updatedAt: new Date(),
          })
          .where(eq(schema.employees.id, employeeId));
      }
    } catch (err) {
      console.error('Error syncing employee education qualification:', err);
    }
  }

  // 1. Qualifications API
  app.get('/api/qualifications', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.qualifications);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.qualifications).where(eq(schema.qualifications.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.qualifications.createdAt));
      const resultsMapped = results.map(r => ({
        ...r,
        education_level: r.level,
        institution: r.university,
        graduation_year: r.graduationYear,
        evaluation_order: r.equationNumber,
        is_active: r.isActive ?? true,
      }));
      res.json(resultsMapped);
    } catch (error: any) {
      console.error('Error fetching qualifications:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/qualifications', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });
      
      const level = data.level || data.education_level || data.educationLevel;
      if (!level) return res.status(400).json({ error: 'level/education_level is required' });

      const isActiveVal = data.is_active !== undefined ? Boolean(data.is_active) : (data.isActive !== undefined ? Boolean(data.isActive) : true);

      const [record] = await db.insert(schema.qualifications).values({
        employeeId,
        level,
        specialization: data.specialization,
        subSpecialization: data.sub_specialization || data.subSpecialization,
        university: data.university || data.institution,
        country: data.country,
        graduationYear: parseInt(data.graduation_year || data.graduationYear || '0'),
        average: data.average,
        grade: data.grade,
        equationNumber: data.equation_number || data.equationNumber || data.evaluation_order || data.evaluationOrder,
        equationDate: data.equation_date || data.equationDate,
        isActive: isActiveVal,
      }).returning();

      await syncEmployeeEducationQualification(employeeId);

      const recordMapped = {
        ...record,
        education_level: record.level,
        institution: record.university,
        graduation_year: record.graduationYear,
        evaluation_order: record.equationNumber,
        is_active: record.isActive ?? true,
      };
      res.json(recordMapped);
    } catch (error: any) {
      console.error('Error creating qualification:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/qualifications/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;

      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length === 0) return res.status(404).json({ error: 'Qualification not found' });

      const empId = existing[0].employeeId;
      const updateValues: any = {};
      if (data.level || data.education_level) updateValues.level = data.level || data.education_level;
      if (data.specialization !== undefined) updateValues.specialization = data.specialization;
      if (data.sub_specialization || data.subSpecialization) updateValues.subSpecialization = data.sub_specialization || data.subSpecialization;
      if (data.university || data.institution) updateValues.university = data.university || data.institution;
      if (data.country !== undefined) updateValues.country = data.country;
      if (data.graduation_year || data.graduationYear) updateValues.graduationYear = parseInt(data.graduation_year || data.graduationYear);
      if (data.is_active !== undefined) updateValues.isActive = Boolean(data.is_active);
      if (data.isActive !== undefined) updateValues.isActive = Boolean(data.isActive);

      const [updated] = await db.update(schema.qualifications)
        .set(updateValues)
        .where(eq(schema.qualifications.id, id))
        .returning();

      await syncEmployeeEducationQualification(empId);

      res.json({
        ...updated,
        education_level: updated.level,
        institution: updated.university,
        graduation_year: updated.graduationYear,
        evaluation_order: updated.equationNumber,
        is_active: updated.isActive ?? true,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch('/api/qualifications/:id/toggle', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length === 0) return res.status(404).json({ error: 'Qualification not found' });

      const newActiveState = !(existing[0].isActive ?? true);

      const [updated] = await db.update(schema.qualifications)
        .set({ isActive: newActiveState })
        .where(eq(schema.qualifications.id, id))
        .returning();

      await syncEmployeeEducationQualification(existing[0].employeeId);

      res.json({
        ...updated,
        education_level: updated.level,
        institution: updated.university,
        graduation_year: updated.graduationYear,
        evaluation_order: updated.equationNumber,
        is_active: updated.isActive ?? true,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/qualifications/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const existing = await db.select().from(schema.qualifications).where(eq(schema.qualifications.id, id));
      if (existing.length > 0) {
        const empId = existing[0].employeeId;
        await db.delete(schema.qualifications).where(eq(schema.qualifications.id, id));
        await syncEmployeeEducationQualification(empId);
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 2. Job Assignments API
  app.get('/api/job-assignments', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.jobAssignments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.jobAssignments).where(eq(schema.jobAssignments.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.jobAssignments.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching job assignments:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/job-assignments', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.jobAssignments).values({
        employeeId,
        grade: data.grade || 'العاشرة',
        step: parseInt(data.step || '1'),
        jobTitle: data.job_title || data.jobTitle || 'موظف',
        division: data.division,
        department: data.department,
        section: data.section,
        confirmationDate: data.confirmation_date || data.confirmationDate || new Date().toISOString().split('T')[0],
        assignmentType: data.assignment_type || data.assignmentType || 'تعيين',
        orderNumber: data.order_number || data.orderNumber,
        orderDate: data.order_date || data.orderDate,
        responsibility: data.responsibility || 'بلا مسؤولية',
      }).returning();
      res.json(record);
    } catch (error: any) {
      console.error('Error creating job assignment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/job-assignments/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.jobAssignments).where(eq(schema.jobAssignments.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 3. Promotions & Increments API
  app.get('/api/promotions', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.promotionsIncrements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.promotionsIncrements.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching promotions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/promotions', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.promotionsIncrements).values({
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
      res.json(record);
    } catch (error: any) {
      console.error('Error creating promotion:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/promotions/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.promotionsIncrements).where(eq(schema.promotionsIncrements.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 4. Salary Allowances API
  app.get('/api/salary-allowances', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.salaryAllowances);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.salaryAllowances).where(eq(schema.salaryAllowances.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.salaryAllowances.createdAt));
      
      const resultsMapped = results.map(r => ({
        ...r,
        allowance_type: r.allowanceType,
        order_number: r.orderNumber,
        employee_id: r.employeeId,
      }));
      res.json(resultsMapped);
    } catch (error: any) {
      console.error('Error fetching salary allowances:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/salary-allowances', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

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

      const [record] = await db.insert(schema.salaryAllowances).values(values).returning();
      
      const recordMapped = {
        ...record,
        allowance_type: record.allowanceType,
        order_number: record.orderNumber,
        employee_id: record.employeeId,
      };
      res.json(recordMapped);
    } catch (error: any) {
      console.error('Error creating salary allowance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/salary-allowances/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.salaryAllowances).where(eq(schema.salaryAllowances.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting salary allowance:', error);
      res.status(500).json({ error: error.message });
    }
  });


  // 5. Annual Evaluations API
  app.get('/api/annual-evaluations', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.annualEvaluations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.annualEvaluations).where(eq(schema.annualEvaluations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.annualEvaluations.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching annual evaluations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/annual-evaluations', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.annualEvaluations).values({
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
      res.json(record);
    } catch (error: any) {
      console.error('Error creating annual evaluation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/annual-evaluations/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.annualEvaluations).where(eq(schema.annualEvaluations.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 6. Training Courses API
  app.get('/api/training-courses', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.trainingCourses);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingCourses).where(eq(schema.trainingCourses.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.trainingCourses.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching training courses:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/training-courses', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.trainingCourses).values({
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
      res.json(record);
    } catch (error: any) {
      console.error('Error creating training course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/training-courses/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.trainingCourses).where(eq(schema.trainingCourses.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 7. Transfers API
  app.get('/api/transfers', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.transfers);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.transfers).where(eq(schema.transfers.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.transfers.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching transfers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/transfers', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.transfers).values({
        employeeId,
        transferType: data.transfer_type || data.transferType || 'نقل داخلي',
        fromEntity: data.from_entity || data.fromEntity || '',
        toEntity: data.to_entity || data.toEntity || '',
        startDate: data.start_date || data.startDate || new Date().toISOString().split('T')[0],
        endDate: data.end_date || data.endDate,
        orderNumber: data.order_number || data.orderNumber || '',
      }).returning();
      res.json(record);
    } catch (error: any) {
      console.error('Error creating transfer:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/transfers/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.transfers).where(eq(schema.transfers.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // 8. Retirements API
  app.get('/api/retirements', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.retirements);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.retirements.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching retirements:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/retirements', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      // First check if there is an existing record
      const [existing] = await db.select().from(schema.retirements).where(eq(schema.retirements.employeeId, employeeId));
      let record;
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
      res.json(record);
    } catch (error: any) {
      console.error('Error creating/updating retirement:', error);
      res.status(500).json({ error: error.message });
    }
  });


  // 9. Documents API
  app.get('/api/documents', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.documents);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.documents).where(eq(schema.documents.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.documents.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/documents', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const employeeId = data.employee_id !== undefined ? parseInt(data.employee_id) : (data.employeeId !== undefined ? parseInt(data.employeeId) : undefined);
      if (!employeeId) return res.status(400).json({ error: 'employeeId is required' });

      const [record] = await db.insert(schema.documents).values({
        employeeId,
        docType: data.doc_type || data.docType || 'أخرى',
        filePath: data.file_path || data.filePath || '',
        entryDate: data.entry_date || data.entryDate || new Date().toISOString().split('T')[0],
      }).returning();
      res.json(record);
    } catch (error: any) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.documents).where(eq(schema.documents.id, id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Service Records (احتساب الخدمة وتمديد الخدمة) API ---
  app.get('/api/service-records', requireAuth, async (req, res) => {
    try {
      const { employeeId } = req.query;
      let query = db.select().from(schema.serviceRecords);
      if (employeeId) {
        const empId = parseInt(employeeId as string);
        if (!isNaN(empId)) {
          query = db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.employeeId, empId)) as any;
        }
      }
      const results = await query.orderBy(desc(schema.serviceRecords.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching service records:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/service-records', requireAuth, async (req, res) => {
    try {
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

      const [record] = await db.insert(schema.serviceRecords).values({
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

      res.json(record);
    } catch (error: any) {
      console.error('Error creating service record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/service-records/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const data = req.body;

      const [updated] = await db.update(schema.serviceRecords)
        .set({
          orderNumber: data.order_number || data.orderNumber,
          orderDate: data.order_date || data.orderDate,
          years: data.years !== undefined ? parseInt(data.years) : undefined,
          months: data.months !== undefined ? parseInt(data.months) : undefined,
          days: data.days !== undefined ? parseInt(data.days) : undefined,
          purpose: data.purpose,
          reason: data.reason,
          notes: data.notes,
        })
        .where(eq(schema.serviceRecords.id, id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error('Error updating service record:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/service-records/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      
      const existing = await db.select().from(schema.serviceRecords).where(eq(schema.serviceRecords.id, id));
      if (existing.length === 0) {
        return res.json({ success: true });
      }

      const recordToDelete = existing[0];
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

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting service record:', error);
      res.status(500).json({ error: error.message });
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await seedAdminUser();
  });
}

startServer();
