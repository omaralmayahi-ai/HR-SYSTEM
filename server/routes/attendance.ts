// server/routes/attendance.ts — الدوام اليومي (B3، الدفعة 1). نُقل حرفياً من server.ts.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, and, desc } from 'drizzle-orm';

export function registerAttendanceRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, sendRouteError } = ctx;

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
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json([]);
  });

  app.post('/api/attendance', requireAuth, requireWriter, async (req, res) => {
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
      
      res.status(201).json({
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
      sendRouteError(res, error);
    }
  });

  app.put('/api/attendance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
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

      if (Object.keys(updateObj).length === 0) {
        return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
      }
      const [updated] = await db.update(schema.attendance)
        .set(updateObj)
        .where(eq(schema.attendance.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'سجل الدوام غير موجود' });

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
      sendRouteError(res, error);
    }
  });

  app.delete('/api/attendance/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      await db.delete(schema.attendance).where(eq(schema.attendance.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting attendance record:', error);
      sendRouteError(res, error);
    }
  });
}
