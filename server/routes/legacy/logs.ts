// server/routes/legacy/logs.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerLogsRoutes(app: Express, deps: any) {
  const {
    db, desc, requireAuth, requireWriter, saveLocalDb, schema,
    systemLogsStore,
  } = deps;

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
}
