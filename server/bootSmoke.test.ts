// B3 (مراجعة: M6): اختبار دخان يعمل دائماً بلا قاعدة بيانات. يشغّل server.ts فعلياً ويتحقق من:
//   - /api/health = 503 JSON (القاعدة غير متاحة)
//   - مسار محمي = 503 JSON من البوابة لا HTML من catch-all
//   - /api/auth/me بلا رمز = 401 (مستثنى من البوابة)
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const freePort = () => new Promise<number>((r) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as any).port; s.close(() => r(p)); }); });

describe('server boot smoke (no database)', () => {
  it('fails closed with JSON 503 and keeps auth/me at 401', async () => {
    const port = await freePort();
    const tsx = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const child = spawn(tsx, ['server.ts'], {
      cwd: root, shell: process.platform === 'win32',
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'production', SQL_HOST: '127.0.0.1', SQL_PORT: '1', SQL_USER: 'none', SQL_DB_NAME: 'none', JWT_SECRET: 'boot-smoke-test-secret-0123456789abcdef' },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    try {
      const deadline = Date.now() + 60_000;
      while (!out.includes('Server running') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
      expect(out).toContain('Server running');
      const get = async (p: string) => { const r = await fetch(`http://127.0.0.1:${port}${p}`); return { status: r.status, type: r.headers.get('content-type') || '', body: await r.text() }; };
      const health = await get('/api/health');
      expect(health.status).toBe(503);
      const emp = await get('/api/employees');
      expect(emp.status).toBe(503);
      expect(emp.type).toContain('application/json');
      expect(JSON.parse(emp.body).code).toBe('DB_UNAVAILABLE');
      expect((await get('/api/auth/me')).status).toBe(401);
    } finally {
      child.kill();
    }
  }, 90_000);
});
