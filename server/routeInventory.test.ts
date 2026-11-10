// B3: لقطة جرد المسارات بترتيب تسجيلها. أي مسار يضيع أو يتكرر أو يتغيّر ترتيبه أثناء تقسيم server.ts يُفشل الاختبار.
// لتحديث اللقطة عن قصد (مسار جديد/محذوف): UPDATE_ROUTE_SNAPSHOT=1 npx vitest run server/routeInventory.test.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(__dirname, '..');
const snapshotFile = path.join(__dirname, 'route-inventory.snapshot.txt');

describe('route inventory (B3 safety net)', () => {
  it('registers exactly the snapshotted routes, in the same order', () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'routes-')), 'routes.txt');
    const tsx = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
    const r = spawnSync(tsx, ['server.ts'], {
      cwd: root, encoding: 'utf8', timeout: 120_000, shell: process.platform === 'win32',
      env: {
        ...process.env, ROUTE_INVENTORY_OUT: out, NODE_ENV: 'production',
        SQL_HOST: '127.0.0.1', SQL_PORT: '1', SQL_USER: 'none', SQL_DB_NAME: 'none',
        JWT_SECRET: 'route-inventory-test-secret-0123456789abcdef',
      },
    });
    expect(r.status, r.stderr?.slice(-2000)).toBe(0);
    const actual = fs.readFileSync(out, 'utf8');
    if (process.env.UPDATE_ROUTE_SNAPSHOT === '1') fs.writeFileSync(snapshotFile, actual);
    expect(actual.split('\n')).toEqual(fs.readFileSync(snapshotFile, 'utf8').split('\n'));
  }, 130_000);
});
