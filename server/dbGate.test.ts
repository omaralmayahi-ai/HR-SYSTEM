import { describe, it, expect, vi } from 'vitest';
import { createDbGate, GATE_EXEMPT } from './dbGate.ts';

function run(gate: any, path: string) {
  return new Promise<{ status: number; body?: any; next: boolean }>((resolve) => {
    const res: any = { status(c: number) { this.code = c; return this; }, json(b: any) { resolve({ status: this.code, body: b, next: false }); } };
    gate.middleware({ path, originalUrl: path } as any, res, () => resolve({ status: 200, next: true }));
  });
}

describe('dbGate', () => {
  it('passes requests when the database is up', async () => {
    const gate = createDbGate(async () => true);
    expect((await run(gate, '/api/employees')).next).toBe(true);
  });
  it('returns 503 DB_UNAVAILABLE when down, but keeps exempt routes open', async () => {
    const gate = createDbGate(async () => false);
    const r = await run(gate, '/api/employees');
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('DB_UNAVAILABLE');
    for (const p of GATE_EXEMPT) expect((await run(gate, p)).next).toBe(true);
  });
  it('caches the probe and re-probes after invalidate()', async () => {
    let t = 0; const probe = vi.fn(async () => true);
    const gate = createDbGate(probe, { cacheMs: 2000, now: () => t });
    await gate.isUp(); await gate.isUp();
    expect(probe).toHaveBeenCalledTimes(1);
    gate.invalidate(); await gate.isUp();
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it('treats a throwing probe as down', async () => {
    const gate = createDbGate(async () => { throw new Error('x'); });
    expect(await gate.isUp()).toBe(false);
  });
});
