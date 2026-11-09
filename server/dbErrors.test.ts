import { describe, it, expect, vi } from 'vitest';
import { classifyDbError, respondIfDbWriteError, sendRouteError, HttpError, unwrapDbError } from './dbErrors';
import { isDbConnectionFailure } from '../src/lib/referentialIntegrity';

function fakeRes() {
  const res: any = { headersSent: false, statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: any) => { res.body = b; res.headersSent = true; return res; });
  return res;
}

// Mimics drizzle-orm's DrizzleQueryError wrapping a pg error
function drizzleWrap(cause: any) {
  const e: any = new Error('Failed query: insert into "employees" ... \nparams: connection lost,123');
  e.query = 'insert into "employees"';
  e.params = ['connection lost'];
  e.cause = cause;
  return e;
}

describe('isDbConnectionFailure with wrapped errors', () => {
  it('detects a connection failure inside DrizzleQueryError.cause', () => {
    expect(isDbConnectionFailure(drizzleWrap({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:5432' }))).toBe(true);
  });
  it('does not keyword-match the SQL params of a wrapped data error', () => {
    expect(isDbConnectionFailure(drizzleWrap({ code: '23505', message: 'duplicate key value violates unique constraint' }))).toBe(false);
  });
  it('detects AggregateError connection failures and pool connect timeouts', () => {
    expect(isDbConnectionFailure({ message: 'agg', errors: [{ code: 'ECONNREFUSED' }] })).toBe(true);
    expect(isDbConnectionFailure(new Error('timeout exceeded when trying to connect'))).toBe(true);
  });
});

describe('classifyDbError', () => {
  it('maps pg codes to HTTP status with Arabic messages and no SQL', () => {
    const dup = classifyDbError(drizzleWrap({ code: '23505', message: 'dup' }), 'إضافة الموظف');
    expect(dup.status).toBe(409);
    expect(dup.message).toContain('إضافة الموظف');
    expect(dup.message).not.toContain('insert');
    expect(classifyDbError({ code: '23502', column: 'employee_id' }).status).toBe(400);
    expect(classifyDbError({ code: '22P02' }).status).toBe(400);
    expect(classifyDbError({ code: '42703' }).status).toBe(500);
    expect(classifyDbError(new Error('boom')).status).toBe(500);
  });
  it('unwraps nested causes', () => {
    expect(unwrapDbError(drizzleWrap({ code: '23503' })).code).toBe('23503');
  });
});

describe('respondIfDbWriteError', () => {
  it('returns false (offline fallback) on a connection failure and sends nothing', () => {
    const res = fakeRes();
    expect(respondIfDbWriteError(res, { code: 'ECONNREFUSED' }, 'x')).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
  it('responds with an error and returns true on a data error', () => {
    const res = fakeRes();
    expect(respondIfDbWriteError(res, drizzleWrap({ code: '23505', message: 'dup' }), 'حفظ')).toBe(true);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/تعذّر حفظ/);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|insert into/);
  });
});

describe('sendRouteError', () => {
  it('honours HttpError status', () => {
    const res = fakeRes();
    sendRouteError(res, new HttpError(422, 'رسالة'));
    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('رسالة');
  });
  it('returns 503 for connection failures and 500 without internals otherwise', () => {
    const r1 = fakeRes();
    sendRouteError(r1, { code: 'ECONNREFUSED' });
    expect(r1.statusCode).toBe(503);
    const r2 = fakeRes();
    sendRouteError(r2, new Error('secret internal detail'));
    expect(r2.statusCode).toBe(500);
    expect(r2.body.error).not.toContain('secret');
  });
});
