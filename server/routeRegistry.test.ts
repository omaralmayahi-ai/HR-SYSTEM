import { describe, it, expect } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { installRouteRegistry } from './routeRegistry';

describe('installRouteRegistry', () => {
  it('throws when the same method + path is registered twice', () => {
    const app = express();
    const reg = installRouteRegistry(app);
    app.get('/api/x', (_req, res) => res.end());
    app.post('/api/x', (_req, res) => res.end());
    expect(reg.has('get', '/api/x')).toBe(true);
    expect(() => app.get('/api/x', (_req, res) => res.end())).toThrow(/تسجيل مكرر/);
  });

  it('keeps app.get(setting) working as a settings getter', () => {
    const app = express();
    installRouteRegistry(app);
    app.set('trust proxy', 1);
    expect(app.get('trust proxy')).toBe(1);
  });

  it('server.ts has no literal duplicate route registrations', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'server.ts'), 'utf8');
    const re = /^\s*app\.(get|post|put|patch|delete)\(\s*'([^']+)'/gm;
    const seen = new Set<string>();
    const dups: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const key = `${m[1].toUpperCase()} ${m[2]}`;
      if (seen.has(key)) dups.push(key);
      seen.add(key);
    }
    expect(dups).toEqual([]);
  });
});
