import type { StatusRegistry } from './statusRegistry.ts';
// server/context.ts — ما يحتاجه أي مجال مسارات من الإقلاع (B3).
// يُمرَّر صراحة إلى register<Domain>Routes. لا مخازن ذاكرة هنا: القاعدة هي المصدر الوحيد (B2).
import type { RequestHandler } from 'express';
import type { db as Db, schema as Schema, pool as Pool } from '../src/db/index.ts';

export interface RouteContext {
  // أنواع حقيقية لا any (مراجعة B3: M1) حتى يبقى فحص الأنواع فعّالاً على الكود المنقول
  db: typeof Db;
  schema: typeof Schema;
  pool: typeof Pool;
  requireAuth: RequestHandler;
  requireWriter: RequestHandler;
  requireAdmin: RequestHandler;
  sendRouteError: (res: any, err: any, operation?: string) => any;
  respondIfDbWriteError: (res: any, err: any, operation?: string) => boolean;
  statusRegistry: StatusRegistry;
}
