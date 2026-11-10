// server/context.ts — ما يحتاجه أي مجال مسارات من الإقلاع (B3).
// يُمرَّر صراحة إلى register<Domain>Routes. لا مخازن ذاكرة هنا: القاعدة هي المصدر الوحيد (B2).
import type { RequestHandler } from 'express';

export interface RouteContext {
  db: any;
  schema: any;
  pool: any;
  requireAuth: RequestHandler;
  requireWriter: RequestHandler;
  requireAdmin: RequestHandler;
  sendRouteError: (res: any, err: any, operation?: string) => any;
  respondIfDbWriteError: (res: any, err: any, operation?: string) => boolean;
}
