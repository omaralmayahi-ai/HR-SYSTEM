// server/routes/salaries.ts — قسائم الرواتب المحفوظة (B3، الدفعة 1). نُقل حرفياً من server.ts.
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { eq, and, desc } from 'drizzle-orm';

export function registerSalaryRoutes(app: Express, ctx: RouteContext) {
  const { db, schema, requireAuth, requireWriter, sendRouteError } = ctx;

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
      return sendRouteError(res, error, 'قراءة البيانات'); // B2d: لا قراءة من الذاكرة
    }
    res.json([]);
  });

  app.post('/api/salaries/bulk', requireAuth, requireWriter, async (req, res) => {
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
      const invalid = toInsert.findIndex(r => !r.employeeId || !r.month || !r.year);
      if (invalid !== -1) {
        return res.status(400).json({ error: `بيانات ناقصة في السجل رقم ${invalid + 1}: الموظف والشهر والسنة مطلوبة` });
      }
      let inserted: any[] = [];
      if (toInsert.length > 0) {
        // إدراج واحد (ذري): إما أن تُحفظ كل القسائم أو لا يُحفظ شيء
        inserted = await db.insert(schema.salaryRecords).values(toInsert).returning({ id: schema.salaryRecords.id });
      }
      res.status(201).json({ success: true, count: inserted.length });
    } catch (error: any) {
      // لا يوجد تخزين احتياطي لقسائم الرواتب: أي فشل (بما فيه انقطاع الاتصال) يُعاد كخطأ ولا يُبلَّغ كنجاح
      sendRouteError(res, error, 'حفظ قسائم الرواتب');
    }
  });

  app.put('/api/salaries/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id));
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
      const data = req.body;
      const updateObj: any = {};
      if (data.status) updateObj.status = data.status;
      if (Object.keys(updateObj).length === 0) {
        return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
      }
      const [updated] = await db.update(schema.salaryRecords)
        .set(updateObj)
        .where(eq(schema.salaryRecords.id, id))
        .returning();
      if (!updated) return res.status(404).json({ error: 'قسيمة الراتب غير موجودة' });
      res.json(updated);
    } catch (error: any) {
      console.error('Error updating salary record:', error);
      sendRouteError(res, error);
    }
  });
}
