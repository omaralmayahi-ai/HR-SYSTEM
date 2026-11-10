// server/dbErrors.ts
// Uniform handling of database write errors for the HR server.
//
// Rule (implementation brief, phase A): a database error that is NOT a connection failure must
// surface to the client as an HTTP error with an Arabic message — the in-memory store must not be
// written and the operation must not be reported as successful. Genuine connection failures keep
// the existing offline fallback behaviour (owner decision pending).
import { isDbConnectionFailure } from '../src/lib/referentialIntegrity.ts';

export interface ClassifiedDbError {
  status: number;
  message: string;
  code?: string;
}

/** Returns the underlying driver error (pg) when wrapped by Drizzle (DrizzleQueryError.cause). */
export function unwrapDbError(err: any): any {
  let cur = err;
  for (let i = 0; i < 4 && cur && cur.cause && cur.cause !== cur; i++) {
    cur = cur.cause;
  }
  return cur || err;
}

/**
 * Maps a non-connection database error to an HTTP status and an Arabic, user-safe message.
 * Never includes SQL text, parameters or stack traces.
 */
export function classifyDbError(err: any, operation = 'حفظ البيانات'): ClassifiedDbError {
  const inner = unwrapDbError(err);
  const code: string | undefined = inner?.code ? String(inner.code) : undefined;
  const column = inner?.column ? ` (الحقل: ${inner.column})` : '';
  switch (code) {
    case '23505':
      return { status: 409, code, message: `تعذّر ${operation}: القيمة مكررة وتتعارض مع سجل موجود مسبقاً` };
    case '23503':
      return { status: 409, code, message: `تعذّر ${operation}: السجل مرتبط بسجل غير موجود أو تُشير إليه سجلات أخرى` };
    case '23502':
      return { status: 400, code, message: `تعذّر ${operation}: حقل إلزامي فارغ${column}` };
    case '23514':
      return { status: 400, code, message: `تعذّر ${operation}: القيمة المدخلة لا تحقق شروط الحقل` };
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
    case '22001':
      return { status: 400, code, message: `تعذّر ${operation}: صيغة إحدى القيم المدخلة غير صحيحة` };
    case '42703':
    case '42P01':
      return { status: 500, code, message: `تعذّر ${operation}: بنية قاعدة البيانات غير مطابقة (عمود أو جدول مفقود). راجع مسؤول النظام` };
    default:
      return { status: 500, code, message: `تعذّر ${operation} في قاعدة البيانات. لم يُحفظ أي تغيير` };
  }
}

/**
 * Call inside the `catch` of a database write.
 * - Connection failure  → logs a warning and returns false (caller continues with the offline fallback).
 * - Any other DB error → logs it, sends an HTTP error response and returns true (caller must `return`).
 */
// B2d (ق-2): لا تخزين احتياطي. انقطاع القاعدة = 503 برسالة واضحة، ويُبلَّغ مُستمع البوابة ليعيد الفحص.
let onConnectionFailure: (() => void) | null = null;
export function setDbConnectionFailureListener(fn: (() => void) | null) { onConnectionFailure = fn; }
const DB_DOWN = 'قاعدة البيانات غير متاحة حالياً. لم يُحفظ شيء. أعد المحاولة بعد قليل.';

export function respondIfDbWriteError(res: any, err: any, operation = 'حفظ البيانات'): boolean {
  if (isDbConnectionFailure(err)) {
    console.warn(`[DB-OFFLINE] ${operation}: تعذّر الاتصال بقاعدة البيانات — رُفض الطلب (لا تخزين احتياطي)`);
    onConnectionFailure?.();
    if (res && !res.headersSent) res.status(503).json({ error: DB_DOWN, code: 'DB_UNAVAILABLE' });
    return true;
  }
  const inner = unwrapDbError(err);
  const classified = classifyDbError(err, operation);
  console.error(`[DB-ERROR] ${operation}: code=${inner?.code || '-'} message=${inner?.message || err?.message || err}`);
  if (res && !res.headersSent) {
    res.status(classified.status).json({ error: classified.message, code: classified.code });
  }
  return true;
}

/**
 * Error thrown from inner helpers (or transaction bodies) to abort with a specific HTTP status.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Generic catch-all for route handlers: HttpError → its status; DB errors → classified; else 500.
 * Never leaks stack traces or SQL text.
 */
export function sendRouteError(res: any, err: any, operation = 'تنفيذ العملية') {
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (isDbConnectionFailure(err)) {
    console.warn(`[DB-OFFLINE] ${operation}: ${unwrapDbError(err)?.message || err}`);
    onConnectionFailure?.();
    return res.status(503).json({ error: `تعذّر ${operation}: قاعدة البيانات غير متاحة حالياً`, code: 'DB_UNAVAILABLE' });
  }
  const inner = unwrapDbError(err);
  if (inner?.code && /^[0-9A-Z]{5}$/.test(String(inner.code))) {
    const c = classifyDbError(err, operation);
    console.error(`[DB-ERROR] ${operation}: code=${inner.code} message=${inner.message}`);
    return res.status(c.status).json({ error: c.message, code: c.code });
  }
  console.error(`[ERROR] ${operation}:`, err?.message || err);
  return res.status(500).json({ error: `تعذّر ${operation} بسبب خطأ داخلي في الخادم` });
}
