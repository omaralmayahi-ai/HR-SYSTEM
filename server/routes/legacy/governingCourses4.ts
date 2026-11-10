// server/routes/legacy/governingCourses4.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerGoverningCourses4Routes(app: Express, deps: any) {
  const {
    db, eq, mem, readSettingsDoc, requireAdmin, requireAuth,
    requireWriter, saveLocalDb, schema, sendRouteError, writeSettingsDoc,
  } = deps;

  app.get('/api/governing-courses/grade-requirements', requireAuth, async (req, res) => {
    try {
      res.json(await readSettingsDoc('grade_requirements', mem.inMemoryGradeRequirements));
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
        mem.inMemoryEmployeeAssignments = resultMap;
        return res.json(resultMap);
      }
    } catch (err) {
      console.error('Error reading employee assignments from database:', err);
    }
    return res.json(mem.inMemoryEmployeeAssignments);
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

    mem.inMemoryEmployeeAssignments[empIdStr] = assignmentObj;

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
}
