import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { diffJournal, readJournal, baselineExpectation } from './migrate.ts';

const e = (idx: number, when: number, hash = 'h' + idx) => ({ idx, tag: `000${idx}_x`, when, hash });

describe('diffJournal', () => {
  it('fresh (not adopted): everything is pending', () => {
    const r = diffJournal([e(0, 100), e(1, 200)], []);
    expect(r).toEqual({ applied: [], pending: ['0000_x', '0001_x'], modified: [] });
  });

  it('adopted baseline only: later migrations are pending', () => {
    const r = diffJournal([e(0, 100), e(1, 200)], [{ hash: 'h0', created_at: '100' }]);
    expect(r.applied).toEqual(['0000_x']);
    expect(r.pending).toEqual(['0001_x']);
    expect(r.modified).toEqual([]);
  });

  it('an applied migration whose file changed is reported as modified', () => {
    const r = diffJournal([e(0, 100), e(1, 200, 'changed')], [{ hash: 'h0', created_at: '100' }, { hash: 'h1', created_at: '200' }]);
    expect(r.modified).toEqual(['0001_x']);
  });

  it('a migration older than the last applied one is never silently skipped', () => {
    // drizzle compares only created_at with the last row: 150 < 200 would be ignored forever
    const r = diffJournal([e(0, 100), e(2, 150), e(1, 200)], [{ hash: 'h0', created_at: '100' }, { hash: 'h1', created_at: '200' }]);
    expect(r.modified).toEqual(['0002_x']);
    expect(r.pending).toEqual([]);
  });
});

describe('committed drizzle/ folder', () => {
  const folder = path.resolve(__dirname, '..', 'drizzle');

  it('has the pinned baseline as its first entry', () => {
    const entries = readJournal(folder);
    expect(entries[0].tag).toBe('0000_baseline');
    expect(entries[0].when).toBe(1794241847655);
  });

  it('journal timestamps strictly increase', () => {
    const entries = readJournal(folder);
    for (let i = 1; i < entries.length; i++) expect(entries[i].when).toBeGreaterThan(entries[i - 1].when);
  });

  it('baseline snapshot covers the core tables', () => {
    const exp = baselineExpectation(folder, '0000_baseline');
    expect(exp.size).toBe(52);
    expect(exp.get('employees')).toContain('company_number');
    expect(exp.get('governing_courses')).toContain('coursename');
  });

  it('migration files use LF line endings (hash stability on Windows)', () => {
    for (const f of fs.readdirSync(folder).filter((x) => x.endsWith('.sql'))) {
      expect(fs.readFileSync(path.join(folder, f), 'utf8').includes('\r\n')).toBe(false);
    }
  });
});
