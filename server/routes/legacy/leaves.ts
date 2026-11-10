// server/routes/legacy/leaves.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';

export function registerLeavesRoutes(app: Express, deps: any) {
  const {
    LEAVE_STATUS, and, db, desc, eq, genericMemoryStores,
    inArray, isNull, leaveStatusVariants, mem, normalizeLeaveStatus, or,
    presentLeave, requireAuth, schema, sendRouteError,
  } = deps;

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
    let memList = genericMemoryStores['leaves'] || mem.inMemoryLeaves || [];
    if (empIdParam) {
      memList = memList.filter(item => String(item.employee_id || item.employeeId) === String(empIdParam));
    }
    if (statusParam) {
      const wanted = normalizeLeaveStatus(statusParam);
      memList = memList.filter(item => (normalizeLeaveStatus(item.status) || LEAVE_STATUS.PENDING) === wanted);
    }
    res.json(memList.map(presentLeave));
  });
}
