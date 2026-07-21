// server.ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, schema, eq, and, desc, asc } from './src/db/index.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { seedAdminUser } from './src/db/users.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
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

  // Employees API
  app.get('/api/employees', requireAuth, async (req, res) => {
    try {
      const allEmployees = await db.select().from(schema.employees).orderBy(desc(schema.employees.createdAt));
      res.json(mapKeys(allEmployees, camelToSnake));
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: 'Database query failed' });
    }
  });

  app.post('/api/employees', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const mappedData = mapKeys(data, snakeToCamel);
      delete mappedData.id;
      delete mappedData.createdAt;

      const [newEmployee] = await db.insert(schema.employees).values(mappedData).returning();
      res.status(210).json(mapKeys(newEmployee, camelToSnake));
    } catch (error: any) {
      console.error('Error creating employee:', error);
      res.status(500).json({ error: error.message });
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
      res.json(mapKeys(employee, camelToSnake));
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
      delete mappedData.id;
      delete mappedData.createdAt;

      const [updatedEmployee] = await db.update(schema.employees)
        .set(mappedData)
        .where(eq(schema.employees.id, id))
        .returning();
      res.json(mapKeys(updatedEmployee, camelToSnake));
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
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.leaveRequests);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.employeeId, employeeId)) as any;
      }
      const leaves = await query.orderBy(desc(schema.leaveRequests.createdAt));
      res.json(leaves);
    } catch (error: any) {
      console.error('Error fetching leaves:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/leaves', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newLeave] = await db.insert(schema.leaveRequests).values(data).returning();
      res.status(210).json(newLeave);
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
      const [updatedLeave] = await db.update(schema.leaveRequests)
        .set(data)
        .where(eq(schema.leaveRequests.id, id))
        .returning();
      res.json(updatedLeave);
    } catch (error: any) {
      console.error('Error updating leave request:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Penalties API
  app.get('/api/penalties', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.penalties);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.penalties).where(eq(schema.penalties.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.penalties.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching penalties:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/penalties', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newPenalty] = await db.insert(schema.penalties).values(data).returning();
      res.status(210).json(newPenalty);
    } catch (error: any) {
      console.error('Error creating penalty:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Performance Evaluations API
  app.get('/api/performance', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.performanceEvaluations);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.performanceEvaluations).where(eq(schema.performanceEvaluations.employeeId, employeeId)) as any;
      }
      const results = await query.orderBy(desc(schema.performanceEvaluations.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching performance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/performance', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newEval] = await db.insert(schema.performanceEvaluations).values(data).returning();
      res.status(210).json(newEval);
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
      const [updatedEval] = await db.update(schema.performanceEvaluations)
        .set(data)
        .where(eq(schema.performanceEvaluations.id, id))
        .returning();
      res.json(updatedEval);
    } catch (error: any) {
      console.error('Error updating performance evaluation:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Career Histories API
  app.get('/api/career', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      if (!employeeId || isNaN(employeeId)) {
        return res.status(400).json({ error: 'Missing or invalid employeeId' });
      }
      const results = await db.select()
        .from(schema.careerHistories)
        .where(eq(schema.careerHistories.employeeId, employeeId))
        .orderBy(desc(schema.careerHistories.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error('Error fetching career history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/career', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newHistory] = await db.insert(schema.careerHistories).values(data).returning();
      res.status(210).json(newHistory);
    } catch (error: any) {
      console.error('Error creating career history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Training Courses API
  app.get('/api/trainings', requireAuth, async (req, res) => {
    try {
      const courses = await db.select().from(schema.trainings).orderBy(desc(schema.trainings.startDate));
      res.json(courses);
    } catch (error: any) {
      console.error('Error fetching trainings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/trainings', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newCourse] = await db.insert(schema.trainings).values(data).returning();
      res.status(210).json(newCourse);
    } catch (error: any) {
      console.error('Error creating training course:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Training Enrollments API
  app.get('/api/trainings/enrollments', requireAuth, async (req, res) => {
    try {
      const employeeId = req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined;
      let query = db.select().from(schema.trainingEnrollments);
      if (employeeId && !isNaN(employeeId)) {
        query = db.select().from(schema.trainingEnrollments).where(eq(schema.trainingEnrollments.employeeId, employeeId)) as any;
      }
      const enrollments = await query.orderBy(desc(schema.trainingEnrollments.createdAt));
      res.json(enrollments);
    } catch (error: any) {
      console.error('Error fetching enrollments:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/trainings/enroll', requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const [newEnroll] = await db.insert(schema.trainingEnrollments).values({
        ...data,
        enrollmentDate: data.enrollmentDate || new Date().toISOString().split('T')[0]
      }).returning();
      res.status(210).json(newEnroll);
    } catch (error: any) {
      console.error('Error enrolling training course:', error);
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
      }).returning();

      const recordMapped = {
        ...record,
        education_level: record.level,
        institution: record.university,
        graduation_year: record.graduationYear,
        evaluation_order: record.equationNumber,
      };
      res.json(recordMapped);
    } catch (error: any) {
      console.error('Error creating qualification:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/qualifications/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      await db.delete(schema.qualifications).where(eq(schema.qualifications.id, id));
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
