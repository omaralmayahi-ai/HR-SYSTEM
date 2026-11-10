// server/routes/trainers.ts — دليل المدربين (B3، الدفعة 1)
// نُقل من server.ts. التغيير الوحيد عن الأصل: حُذفت فروع الذاكرة (B2g) ومعها:
//   - القائمة الفارغة كانت تُعاد من الذاكرة ← تُعاد فارغة
//   - أي خطأ في الإضافة/التعديل كان يُرد بنجاح كاذب (201 بـ id: 1) ← يُرد بالخطأ
//   - الحذف كان يرمي ReferenceError بعد نجاحه (id خارج نطاقه)
import type { Express } from 'express';
import type { RouteContext } from '../context.ts';
import { mapKeys, camelToSnake } from '../util/caseMap.ts';
import { getExistingColumns } from '../util/dbColumns.ts';

export function enhanceTrainerRecord(t: any) {
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

/** تصنيفات الدورات: نص JSON محفوظ كما هو، أو كائن يُحوَّل إلى JSON. */
export function normalizeCourseCategories(cats: any): string | undefined {
  if (cats === undefined || cats === null) return undefined;
  if (typeof cats === 'string') {
    try {
      const parsed = JSON.parse(cats);
      if (typeof parsed === 'string') return parsed;
    } catch { /* نص عادي */ }
    return cats;
  }
  return JSON.stringify(cats);
}

function parseEmployeeId(raw: any): number | null {
  return raw !== undefined && raw !== null && raw !== '' && !isNaN(parseInt(raw)) ? parseInt(raw) : null;
}

export function registerTrainerRoutes(app: Express, ctx: RouteContext) {
  const { pool, requireAuth, requireWriter, sendRouteError, respondIfDbWriteError } = ctx;

  app.get('/api/trainers', requireAuth, async (_req, res) => {
    try {
      const result = await pool.query('SELECT * FROM trainers ORDER BY id DESC');
      res.json(result.rows.map(enhanceTrainerRecord));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة المدربين');
    }
  });

  app.get('/api/trainers/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM trainers WHERE id = $1', [parseInt(req.params.id)]);
      if (!result.rows.length) return res.status(404).json({ error: 'المدرب غير موجود' });
      res.json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      sendRouteError(res, error, 'قراءة المدرب');
    }
  });

  app.post('/api/trainers', requireAuth, requireWriter, async (req, res) => {
    try {
      const rawData = req.body || {};
      const existingCols = await getExistingColumns(pool, 'trainers');
      const snakeData: Record<string, any> = {};
      const addField = (col: string, val: any) => {
        if (existingCols.has(col) && val !== undefined && val !== null) snakeData[col] = val;
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
      addField('employee_id', parseEmployeeId(rawData.employee_id ?? rawData.employeeId));
      addField('employee_code', rawData.employee_code || rawData.employeeCode);
      addField('trainer_code', rawData.trainer_code || rawData.trainerCode);
      addField('course_categories', normalizeCourseCategories(rawData.course_categories ?? rawData.courseCategories));
      addField('specialty_details', rawData.specialty_details || rawData.specialtyDetails);
      addField('work_phone', rawData.work_phone || rawData.workPhone);

      const keys = Object.keys(snakeData);
      if (!keys.length) return res.status(400).json({ error: 'لا توجد بيانات صالحة لحفظ المدرب' });
      const q = `INSERT INTO trainers (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
      const result = await pool.query(q, Object.values(snakeData));
      res.status(201).json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      if (!respondIfDbWriteError(res, error, 'حفظ المدرب')) sendRouteError(res, error, 'حفظ المدرب');
    }
  });

  app.put('/api/trainers/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const rawData = req.body || {};
      const existingCols = await getExistingColumns(pool, 'trainers');
      const snakeData: Record<string, any> = {};
      const addField = (col: string, val: any) => {
        if (existingCols.has(col) && val !== undefined) snakeData[col] = val;
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
      if (rawEmpId !== undefined) addField('employee_id', parseEmployeeId(rawEmpId));
      addField('employee_code', rawData.employee_code ?? rawData.employeeCode);
      addField('trainer_code', rawData.trainer_code ?? rawData.trainerCode);
      addField('course_categories', normalizeCourseCategories(rawData.course_categories ?? rawData.courseCategories));
      addField('specialty_details', rawData.specialty_details ?? rawData.specialtyDetails);
      addField('work_phone', rawData.work_phone ?? rawData.workPhone);

      const keys = Object.keys(snakeData);
      if (!keys.length) return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
      const q = `UPDATE trainers SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`;
      const result = await pool.query(q, [...Object.values(snakeData), id]);
      if (!result.rows.length) return res.status(404).json({ error: 'المدرب غير موجود' });
      res.json(enhanceTrainerRecord(result.rows[0]));
    } catch (error: any) {
      if (!respondIfDbWriteError(res, error, 'تعديل المدرب')) sendRouteError(res, error, 'تعديل المدرب');
    }
  });

  app.delete('/api/trainers/:id', requireAuth, requireWriter, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM trainers WHERE id = $1', [parseInt(req.params.id)]);
      if (!result.rowCount) return res.status(404).json({ error: 'المدرب غير موجود' });
      res.json({ success: true });
    } catch (error: any) {
      if (!respondIfDbWriteError(res, error, 'حذف المدرب')) sendRouteError(res, error, 'حذف المدرب');
    }
  });
}
