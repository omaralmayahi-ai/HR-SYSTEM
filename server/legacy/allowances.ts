// server/legacy/allowances.ts — المرحلة C: ترحيل نظام المخصصات 1.2.0 (القسم 23 من وثيقة الرواتب).
// يقرأ النسخة الاحتياطية للنظام القديم (PGlite بصيغة tar.gz) قراءة فقط، ويكتب بـ HR-SYSTEM بمعاملة واحدة:
//   - العائلة: نمط الاستحقاق والحالة الزوجية (حركة «ترحيل قديم» إذا الحقل فارغ)، الأفراد، التمديدات.
//     ق-C1 (افتراضي أ): الدمج بتاريخ الميلاد — المطابق ما يُكرر، الناقص يُضاف، الموجود بـ HR فقط ما يُحذف ويصير حالة استفسار.
//   - حالات الاستفسار القديمة ← data_issues، وتعارضات الترحيل نفسها حالات جديدة.
//   - الأرشيف للاطلاع: كشف 8/2026، الكشوف والمتغيرات، سجل التدقيق، الحالة العائلية الأصلية (ق-C3 افتراضي أ).
// التجربة (بلا --apply) تمشي نفس المسار وتلغي المعاملة بالنهاية، فالتقرير مطابق لما سيُكتب.
// لا قيم مختلقة (AGENTS 2): لا نستنتج «يدرس» أو «غير متزوجة» من استحقاق قديم؛ النقص يظهر بفحص الجودة.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { sql } from 'drizzle-orm';
import { applyMovement } from '../careerMovements.ts';
import { normAr } from '../payroll/engine.ts';

const rows = (r: any) => ((r as any).rows ?? r) as any[];
export const SOURCE = 'نظام المخصصات 1.2.0';
const ACTOR = 'ترحيل نظام المخصصات';
const MODE: Record<string, string> = { full: 'كامل', children_only: 'الأطفال فقط', blocked: 'محجوب', none: 'لا يستحق' };
const MARITAL: Record<string, string | null> = { married: 'متزوج', divorced: 'مطلق', widowed: 'أرمل', single: 'أعزب', unknown: null };
const ISSUE_STATUS: Record<string, string> = { open: 'مفتوحة', in_review: 'قيد المراجعة', resolved: 'محلولة', dismissed: 'مستبعدة' };
export const ISSUE_TITLES: Record<string, string> = {
  over_age_eligible: 'مستحق بالكشف رغم تجاوز العمر', not_in_payroll: 'غير موجود بكشف الرواتب', amount_mismatch: 'فرق مبلغ العائلية عن الكشف',
  multiple: 'ملاحظات متعددة', under_age_stopped: 'موقوف دون العمر', sheet_mismatch: 'اختلاف بين أوراق ملف الترحيل', indicator_3: 'مؤشر 3 بكشف الرواتب',
  missing_data: 'بيانات ناقصة', abnormal_amount: 'مبلغ غير طبيعي',
  legacy_not_in_hr: 'موظف بالنظام القديم غير موجود بـ HR-SYSTEM', legacy_family_mode_conflict: 'نمط الاستحقاق العائلي مختلف عن النظام القديم',
  legacy_marital_conflict: 'الحالة الزوجية مختلفة عن النظام القديم', legacy_hr_only_child: 'طفل مسجل بـ HR-SYSTEM فقط (غير موجود بالنظام القديم)',
  legacy_relation_conflict: 'جنس الطفل مختلف عن النظام القديم', legacy_spouse_hr_only: 'زوج/زوجة مسجل بـ HR-SYSTEM غير مطابق للنظام القديم',
  legacy_member_ended: 'فرد أُنهي أو حُذف بالنظام القديم وما زال بـ HR-SYSTEM', legacy_member_not_imported: 'فرد غير مستحق بالنظام القديم لسبب ما يُنقل تلقائياً',
};
/** أسباب عدم الاستحقاق القديمة اللي هي وقائع مسجلة (لا استنتاج): تُنقل حقيقة «ترحيل قديم». */
const REASON_FACT: Record<string, string> = { deceased: 'متوفى', daughter_married: 'متزوج', employed: 'موظف' };
const REASON_NAME: Record<string, string> = { over_age: 'تجاوز العمر', daughter_married: 'زواج البنت', deceased: 'الوفاة', divorce: 'الطلاق', employed: 'التوظيف',
  extension_ended: 'انتهاء التمديد', other: 'أخرى', custody: 'الحضانة لدى الطرف الآخر', spouse_receives: 'الزوج/ة يستلم المخصص' };
const sha8 = (v: any) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 12);
/** الحالة الزوجية بلا فرق التذكير والتأنيث. */
const maritalKey = (v: any) => normAr(v).replace(/ه$/, '').replace(/^عزباء$/, 'اعزب');

export type LegacyData = Awaited<ReturnType<typeof readAllowancesBackup>>;

/** يقرأ النسخة الاحتياطية (tar.gz من data\backups للنظام القديم) بقاعدة PGlite بالذاكرة، قراءة فقط. */
export async function readAllowancesBackup(file: string) {
  const buf = fs.readFileSync(file);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = await PGlite.create({ loadDataDir: new Blob([buf]) });
  try {
    const q = async (s: string) => (await pg.query(s)).rows as any[];
    const tables = new Set((await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map(r => r.table_name));
    for (const t of ['employees', 'employee_family_status', 'family_members']) if (!tables.has(t)) throw new Error(`الملف ليس نسخة نظام المخصصات: الجدول ${t} غير موجود`);
    const opt = async (t: string, s: string) => (tables.has(t) ? q(s) : []);
    return {
      sha256, bytes: buf.length,
      employees: await q(`SELECT id, employee_no::text employee_no, full_name, gender::text gender, grade, step, basic_salary::text basic_salary, certificate_code, status_code FROM employees ORDER BY id`),
      statuses: await q(`SELECT id, employee_id, marital_status::text marital_status, entitlement::text entitlement, partner_employee_no, reason_text, order_no, order_date::text order_date,
          effective_from::text effective_from, effective_to::text effective_to FROM employee_family_status ORDER BY employee_id, effective_from, id`),
      members: await q(`SELECT m.id, m.employee_id, m.relation::text relation, m.seq, m.gender::text gender, m.birth_date::text birth_date, m.is_eligible, r.code reason,
          m.eligible_from::text eligible_from, m.eligible_to::text eligible_to, m.order_no, m.status::text status, m.source
        FROM family_members m LEFT JOIN ineligibility_reasons r ON r.id = m.ineligibility_reason_id ORDER BY m.employee_id, m.seq, m.id`),
      extensions: await opt('family_extensions', `SELECT id, member_id, valid_from::text valid_from, valid_to::text valid_to, duration_months, reason_text, document_ref, document_date::text document_date FROM family_extensions ORDER BY id`),
      issues: await opt('data_issues', `SELECT id, employee_no::text employee_no, issue_code, details, payroll_amount::text payroll_amount, computed_amount::text computed_amount,
          status::text status, resolution, resolved_at::text resolved_at, source FROM data_issues ORDER BY id`),
      payrollImports: await opt('payroll_imports', `SELECT id, period, file_name, rows_count, imported_at::text imported_at FROM payroll_imports ORDER BY id`),
      payrollItems: await opt('payroll_items', `SELECT import_id, employee_no::text employee_no, payroll_code, value::text value FROM payroll_items ORDER BY import_id, employee_no, payroll_code`),
      archive: {
        statement: await opt('statements', `SELECT to_jsonb(s) d, s.id FROM statements s ORDER BY id`),
        statement_line: await opt('statement_lines', `SELECT to_jsonb(s) d, s.id FROM statement_lines s ORDER BY id`),
        allowance_change: await opt('allowance_changes', `SELECT to_jsonb(s) d, s.id FROM allowance_changes s ORDER BY id`),
        // سجل الدخول وكلمات المرور والشعار ما يُؤرشف
        audit: await opt('audit_log', `SELECT to_jsonb(s) - 'ip_address' d, s.id FROM audit_log s WHERE s.entity IN ('family_members', 'employees', 'employee_family_status', 'family_extensions', 'allowance_types', 'statements', 'data_issues', 'allowance_changes', 'presets') ORDER BY id`),
        period: await opt('periods', `SELECT to_jsonb(s) d, s.id FROM periods s ORDER BY id`),
      } as Record<string, { d: any; id: number }[]>,
    };
  } finally { await pg.close(); }
}

class DryRun extends Error { constructor(public result: any) { super('dry-run'); } }
const childRel = (r: string) => (r === 'son' ? 'ابن' : r === 'daughter' ? 'بنت' : null);
const isChild = (r: string) => ['ابن', 'بنت', 'طفل'].includes(r);
const isSpouse = (r: string) => ['زوج', 'زوجة', 'زوج/زوجة'].includes(r);
const nextDay = (d: string) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };

/** هل يُنقل الفرد القديم تلقائياً؟ غير المستحق لسبب مسجل كواقعة (أو تجاوز العمر) يُنقل؛ غيره (الحضانة، الزوج يستلم، موقوف...) حالة استفسار. */
function importable(m: any): { ok: boolean; fact?: string; why?: string } {
  if (m.status !== 'active') return { ok: false, why: m.status === 'suspended' ? 'موقوف بالنظام القديم' : 'منتهٍ بالنظام القديم' };
  if (m.relation !== 'spouse' && !m.birth_date) return { ok: false, why: 'بلا تاريخ ميلاد' };
  if (m.is_eligible) return { ok: true };
  if (m.reason === 'over_age') return { ok: true }; // العمر يحسبه المحرك من الميلاد
  if (m.reason && REASON_FACT[m.reason] && m.relation !== 'spouse') return { ok: true, fact: REASON_FACT[m.reason] };
  return { ok: false, why: `غير مستحق: ${REASON_NAME[m.reason] ?? m.reason ?? 'بلا سبب مسجل'}` };
}

/**
 * الترحيل. apply=false: تجربة كاملة تُلغى بالنهاية. يرجع الملخص وتفاصيل التقرير (للملف المحلي، فيه بيانات شخصية).
 * يرفض التطبيق إذا أكو فترة معتمدة/مُصدَرة لفئة موظف تتغير عائلته: الأفراد المضافون بعدها يولدون فروقاً رجعية بالعائلية.
 * ربط الأفراد ثابت بالأرشيف (member_link): المطابق والمضاف يُربطان مرة، فالتكرار ما يعيد ما حذفه المستخدم بـ HR ولا يكرر ما صحّحه.
 */
export async function migrateAllowances(db: any, schema: any, src: LegacyData, o: { apply: boolean; user: string; fileName: string; today?: string }) {
  try {
    return await db.transaction(async (tx: any) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('legacy:allowances'))`);
      // اعتماد فترة أثناء الترحيل يخلي الأفراد المضافين «معروفين قبل الاعتماد» فما تلتقطهم الفروق الرجعية: نمنعه لحين الانتهاء
      if (o.apply) await tx.execute(sql`LOCK TABLE payroll_periods IN SHARE ROW EXCLUSIVE MODE`);
      const [imp] = await tx.insert(schema.legacyImports).values({ source: SOURCE, fileName: o.fileName.slice(0, 300), fileSha256: src.sha256, summary: {}, appliedBy: o.user }).returning();
      const prev = rows(await tx.execute(sql`SELECT id, applied_at::text at FROM legacy_imports WHERE file_sha256 = ${src.sha256} AND id <> ${imp.id} ORDER BY id`));

      const keyOf = (v: any) => String(v ?? '').trim().toUpperCase();
      const hrEmps = new Map<string, any>(rows(await tx.execute(sql`SELECT id, company_number, gender, family_mode, marital_status, service_type, contract_type FROM employees WHERE company_number IS NOT NULL`))
        .map(r => [keyOf(r.company_number), r]));
      const hrFam = new Map<number, any[]>();
      for (const m of rows(await tx.execute(sql`SELECT id, employee_id, relation, birth_date::text bd, source_ref FROM family_members ORDER BY employee_id, id`))) {
        (hrFam.get(Number(m.employee_id)) || hrFam.set(Number(m.employee_id), []).get(Number(m.employee_id))!).push(m);
      }
      const links = new Map<string, number>(rows(await tx.execute(sql`SELECT source_ref, (data->>'hr_member_id')::int hr FROM legacy_archive WHERE kind = 'member_link'`)).map(r => [r.source_ref, Number(r.hr)]));
      const oldEmp = new Map<number, any>(src.employees.map(e => [Number(e.id), e]));
      const hrOf = (oldEmployeeId: number) => { const e = oldEmp.get(oldEmployeeId); return e ? hrEmps.get(keyOf(e.employee_no)) : undefined; };
      const hrByNo = (no: any) => hrEmps.get(keyOf(no));

      const s = { family_employees: 0, not_in_hr: 0, mode_set: 0, mode_same: 0, mode_conflict: 0, marital_set: 0, marital_conflict: 0,
        members_added: 0, members_matched: 0, members_already: 0, members_removed_in_hr: 0, members_ended: 0, members_not_imported: 0, facts_added: 0,
        children_hr_only: 0, relation_conflicts: 0, spouses_added: 0, spouse_hr_only: 0, extensions_added: 0, extensions_skipped: 0,
        issues_legacy: 0, issues_refreshed: 0, issues_new: 0, issues_existing: 0, archive_rows: 0, payroll_rows: 0, employees_not_in_hr: 0, grade_step_diffs: 0 };
      const report = { not_in_hr: [] as any[], conflicts: [] as any[], hr_only: [] as any[], grade_step: [] as any[], employees_not_in_hr: [] as any[], not_imported: [] as any[] };

      const issue = async (x: { emp?: any; no: string; topic: string; code: string; details?: string | null; ext?: string | null; comp?: string | null;
        status?: string; resolution?: string | null; resolvedAt?: string | null; source: string; ref: string }) => {
        const st = x.status ?? 'مفتوحة'; const closed = st === 'محلولة' || st === 'مستبعدة';
        const resolution = closed ? (x.resolution?.trim() || 'أُغلقت بنظام المخصصات بلا قرار مكتوب') : x.resolution ?? null;
        const r = rows(await tx.execute(sql`INSERT INTO data_issues (employee_id, company_number, topic, issue_code, title, details, external_amount, computed_amount, status, resolution, resolved_by, resolved_at, source, source_ref, import_id)
          VALUES (${x.emp?.id ?? null}, ${x.no}, ${x.topic}, ${x.code}, ${ISSUE_TITLES[x.code] ?? x.code}, ${x.details ?? null}, ${x.ext ?? null}, ${x.comp ?? null}, ${st},
            ${resolution}, ${closed ? ACTOR : null}, ${closed ? (x.resolvedAt ? sql`${x.resolvedAt}::timestamptz` : sql`now()`) : null}, ${x.source}, ${x.ref}, ${imp.id})
          ON CONFLICT (source_ref) DO NOTHING RETURNING id`));
        if (r.length) return 'new' as const;
        // أُغلقت بالنظام القديم بعد الترحيل السابق وما زالت مفتوحة هنا ⇒ تُحدَّث (الوضع والقرار فقط)
        if (closed) {
          const u = rows(await tx.execute(sql`UPDATE data_issues SET status = ${st}, resolution = ${resolution}, resolved_by = ${ACTOR},
              resolved_at = ${x.resolvedAt ? sql`${x.resolvedAt}::timestamptz` : sql`now()`} WHERE source_ref = ${x.ref} AND status IN ('مفتوحة', 'قيد المراجعة') RETURNING id`));
          if (u.length) return 'refreshed' as const;
        }
        return 'exists' as const;
      };
      const newIssue = async (x: Parameters<typeof issue>[0]) => { if ((await issue(x)) === 'new') s.issues_new++; };
      const arch = async (kind: string, ref: string, data: any, employeeId: number | null) => {
        const r = rows(await tx.execute(sql`INSERT INTO legacy_archive (import_id, kind, source_ref, employee_id, data) VALUES (${imp.id}, ${kind}, ${ref}, ${employeeId}, ${JSON.stringify(data)}::jsonb)
          ON CONFLICT (kind, source_ref) DO NOTHING RETURNING id`));
        if (r.length) s.archive_rows++;
        return r.length > 0;
      };
      const link = async (key: string, hrId: number, how: string, employeeId: number) => { links.set(key, hrId); await arch('member_link', key, { hr_member_id: hrId, how }, employeeId); };
      const touched = new Set<number>(); // موظفو HR اللي تغيرت مدخلات عائلتهم

      // 1) العائلة: آخر حالة نافذة لكل موظف
      const current = new Map<number, any>();
      for (const st of src.statuses) if (!st.effective_to) current.set(Number(st.employee_id), st);
      const membersOf = new Map<number, any[]>();
      for (const m of src.members) (membersOf.get(Number(m.employee_id)) || membersOf.set(Number(m.employee_id), []).get(Number(m.employee_id))!).push(m);
      const famEmployees = [...new Set([...current.keys(), ...membersOf.keys()])].sort((a, b) => a - b);
      const memberHrId = new Map<number, number>(); // عضو قديم ← عضو HR (للتمديدات)
      const addFact = async (memberId: number, fact: string, m: any, emp: any) => {
        const ref = `alw:fact:${m.id}:${fact}`;
        if (rows(await tx.execute(sql`SELECT 1 FROM family_member_facts WHERE member_id = ${memberId} AND fact = ${fact} AND reason LIKE ${'%' + ref}`)).length) return;
        await tx.insert(schema.familyMemberFacts).values({ memberId, fact, value: true, validFrom: m.eligible_to ? nextDay(m.eligible_to) : null, source: 'ترحيل قديم',
          reason: `من ${SOURCE}: سبب عدم الاستحقاق «${REASON_NAME[m.reason] ?? m.reason}» ${ref}`, recordedBy: ACTOR });
        s.facts_added++; touched.add(emp.id);
      };
      for (const oid of famEmployees) {
        s.family_employees++;
        const old = oldEmp.get(oid); const no = String(old?.employee_no ?? '');
        const emp = hrOf(oid);
        const oldMembers = membersOf.get(oid) || [];
        if (!emp) {
          s.not_in_hr++; report.not_in_hr.push({ company_number: no, name: old?.full_name ?? null, members: oldMembers.length });
          await newIssue({ no, topic: 'العائلية', code: 'legacy_not_in_hr', details: `${oldMembers.length} فرداً بالنظام القديم`, source: 'ترحيل C', ref: `alw:not_in_hr:${no}` });
          continue;
        }
        const st = current.get(oid);
        if (st) {
          const mode = MODE[st.entitlement] ?? null, marital = MARITAL[st.marital_status] ?? null;
          const changes: Record<string, string> = {};
          const done = rows(await tx.execute(sql`SELECT 1 FROM employee_field_history WHERE employee_id = ${emp.id} AND reason ~ ${'alw:status:' + st.id + '($|[^0-9])'} LIMIT 1`)).length > 0;
          if (mode) {
            const cur = (emp.family_mode ?? '').trim();
            if (done || cur === mode) s.mode_same++;
            else if (!cur) changes.family_mode = mode;
            else { s.mode_conflict++; report.conflicts.push({ company_number: no, field: 'نمط الاستحقاق', hr: cur, old: mode });
              await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_family_mode_conflict', details: `HR: ${cur} — القديم: ${mode}`, source: 'ترحيل C', ref: `alw:mode:${st.id}:${no}` }); }
          }
          if (marital && !done) {
            const cur = (emp.marital_status ?? '').trim();
            if (!cur) changes.marital_status = marital;
            // الحالة الزوجية ما تدخل الاحتساب (النمط هو اللي يدخل)، وقيمتها الافتراضية بالاستمارة «أعزب»: التعارض بالتقرير فقط بلا حالة استفسار
            else if (maritalKey(cur) !== maritalKey(marital)) { s.marital_conflict++; report.conflicts.push({ company_number: no, field: 'الحالة الزوجية', hr: cur, old: marital }); }
          }
          if (Object.keys(changes).length) {
            await applyMovement(tx, schema, { employeeId: emp.id, effectiveDate: st.effective_from, changes, source: 'ترحيل قديم',
              reason: `من ${SOURCE} (مطابق لكشف 8/2026)${st.reason_text ? ' — ' + st.reason_text : ''} alw:status:${st.id}`, userLabel: ACTOR } as any, { today: o.today });
            touched.add(emp.id);
            if (changes.family_mode) s.mode_set++;
            if (changes.marital_status) s.marital_set++;
          }
        }
        const hr = hrFam.get(emp.id) || [];
        const hrIds = new Set(hr.map(h => h.id));
        const used = new Set<number>();
        const endedLinked: { key: string; hrId: number; m: any }[] = [];
        // الجولة 1: المربوطون سابقاً
        for (const m of oldMembers) {
          const key = `${m.id}:${no}`; const hrId = links.get(key);
          if (hrId === undefined) continue;
          const imp1 = importable(m);
          if (!hrIds.has(hrId)) { if (imp1.ok) s.members_removed_in_hr++; continue; } // حذفه المستخدم بـ HR: ما يُعاد
          if (!imp1.ok) { endedLinked.push({ key, hrId, m }); continue; }
          used.add(hrId); memberHrId.set(Number(m.id), hrId); s.members_already++;
          if (imp1.fact) await addFact(hrId, imp1.fact, m, emp);
        }
        // الجولة 2: غير المربوطين — مطابقة بتاريخ الميلاد ضد كل أطفال HR غير المستعملين (ومنهم المربوط بفرد قديم أُنهي ثم أُعيد إدخاله)
        for (const m of oldMembers) {
          const key = `${m.id}:${no}`;
          if (links.has(key)) continue;
          const imp1 = importable(m);
          if (!imp1.ok) {
            s.members_not_imported++; report.not_imported.push({ company_number: no, relation: m.relation, birth_date: m.birth_date, why: imp1.why });
            if (m.status !== 'ended') await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_member_not_imported',
              details: `${childRel(m.relation) ?? 'زوج/زوجة'}${m.birth_date ? ' مواليد ' + m.birth_date : ''}: ${imp1.why}`, source: 'ترحيل C', ref: `alw:skip:${key}` });
            continue;
          }
          if (m.relation === 'spouse') {
            const sp = hr.find(h => isSpouse(h.relation) && !used.has(h.id));
            if (sp) { used.add(sp.id); memberHrId.set(Number(m.id), sp.id); s.members_matched++; await link(key, sp.id, 'matched', emp.id); continue; }
            const rel = emp.gender === 'ذكر' ? 'زوجة' : ['أنثى', 'انثى'].includes(emp.gender) ? 'زوج' : 'زوج/زوجة';
            const partner = st?.partner_employee_no ? hrByNo(st.partner_employee_no) : undefined;
            const [r] = await tx.insert(schema.familyMembers).values({ employeeId: emp.id, relation: rel, name: null, birthDate: null, spouseEmployeeId: partner?.id ?? null,
              sourceRef: `alw:member:${m.id}`, createdBy: ACTOR }).returning();
            used.add(r.id); memberHrId.set(Number(m.id), r.id); s.spouses_added++; s.members_added++; touched.add(emp.id);
            await link(key, r.id, 'added', emp.id);
            continue;
          }
          const rel = childRel(m.relation)!;
          const same = hr.filter(h => isChild(h.relation) && h.bd === m.birth_date && !used.has(h.id));
          const exact = same.find(h => h.relation === rel) ?? same.find(h => h.relation === 'طفل') ?? same[0];
          let hrId: number;
          if (exact) {
            used.add(exact.id); hrId = exact.id; s.members_matched++;
            await link(key, exact.id, 'matched', emp.id);
            if (exact.relation !== rel && exact.relation !== 'طفل') {
              s.relation_conflicts++; report.conflicts.push({ company_number: no, field: `طفل مواليد ${m.birth_date}`, hr: exact.relation, old: rel });
              await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_relation_conflict', details: `مواليد ${m.birth_date}: HR ${exact.relation} — القديم ${rel}`, source: 'ترحيل C', ref: `alw:relation:${key}` });
            }
          } else {
            const [r] = await tx.insert(schema.familyMembers).values({ employeeId: emp.id, relation: rel, name: null, birthDate: m.birth_date, sourceRef: `alw:member:${m.id}`, createdBy: ACTOR }).returning();
            used.add(r.id); hrId = r.id; s.members_added++; touched.add(emp.id);
            await link(key, r.id, 'added', emp.id);
          }
          memberHrId.set(Number(m.id), hrId);
          if (imp1.fact) await addFact(hrId, imp1.fact, m, emp);
        }
        // فرد مربوط أُنهي أو أُوقف بالنظام القديم وما أُعيد ربطه: يبقى بـ HR (ما نحذف)، وحالة استفسار
        for (const x of endedLinked) {
          if (used.has(x.hrId)) continue;
          used.add(x.hrId); s.members_ended++;
          await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_member_ended', details: `${childRel(x.m.relation) ?? 'زوج/زوجة'}${x.m.birth_date ? ' مواليد ' + x.m.birth_date : ''} (عضو HR ${x.hrId}): ${importable(x.m).ok ? '' : (importable(x.m) as any).why}`,
            source: 'ترحيل C', ref: `alw:ended:${x.key}` });
        }
        // فرد قديم مربوط اختفى من النسخة كلياً
        for (const [key, hrId] of links) {
          if (!key.endsWith(`:${no}`) || used.has(hrId) || !hrIds.has(hrId)) continue;
          const oldId = Number(key.split(':')[0]);
          if (oldMembers.some(m => Number(m.id) === oldId)) continue;
          used.add(hrId); s.members_ended++;
          await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_member_ended', details: `عضو HR ${hrId}: حُذف من النظام القديم`, source: 'ترحيل C', ref: `alw:ended:${key}` });
        }
        for (const h of hr) {
          if (used.has(h.id)) continue;
          if (isChild(h.relation)) {
            s.children_hr_only++; report.hr_only.push({ company_number: no, relation: h.relation, birth_date: h.bd });
            await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_hr_only_child', details: `${h.relation}${h.bd ? ' مواليد ' + h.bd : ' بلا تاريخ ميلاد'} (عضو HR ${h.id})`, source: 'ترحيل C', ref: `alw:hr_only:${h.id}` });
          } else if (isSpouse(h.relation)) {
            s.spouse_hr_only++; report.hr_only.push({ company_number: no, relation: h.relation, birth_date: null });
            await newIssue({ emp, no, topic: 'العائلية', code: 'legacy_spouse_hr_only', details: `عضو HR ${h.id}`, source: 'ترحيل C', ref: `alw:hr_only:${h.id}` });
          }
        }
      }
      // التمديدات: لعضو مُرحَّل أو مطابق، مرة واحدة
      for (const x of src.extensions) {
        const mid = memberHrId.get(Number(x.member_id));
        if (!mid) { s.extensions_skipped++; continue; }
        if (rows(await tx.execute(sql`SELECT 1 FROM family_extensions WHERE member_id = ${mid} AND reason ~ ${'alw:extension:' + x.id + '$'}`)).length) continue;
        const [own] = rows(await tx.execute(sql`SELECT employee_id FROM family_members WHERE id = ${mid}`)); if (own) touched.add(Number(own.employee_id));
        const reason = [x.reason_text, x.document_ref].filter(v => v && String(v).trim()).join(' — ') || 'تمديد من نظام المخصصات';
        await tx.insert(schema.familyExtensions).values({ memberId: mid, validFrom: x.valid_from, validTo: x.valid_to, reason: `${reason} alw:extension:${x.id}`, source: 'ترحيل قديم', recordedBy: ACTOR });
        s.extensions_added++;
      }

      // 2) حالات الاستفسار القديمة (بحالتها وتاريخ إغلاقها)
      for (const i of src.issues) {
        const emp = hrByNo(i.employee_no);
        const r = await issue({ emp, no: String(i.employee_no), topic: 'العائلية', code: i.issue_code, details: i.details, ext: i.payroll_amount, comp: i.computed_amount,
          status: ISSUE_STATUS[i.status] ?? 'مفتوحة', resolution: i.resolution, resolvedAt: i.resolved_at, source: `${SOURCE} — ${i.source ?? ''}`.trim(), ref: `alw:issue:${i.id}:${i.employee_no}:${i.issue_code}` });
        if (r === 'new') s.issues_legacy++; else if (r === 'refreshed') s.issues_refreshed++; else s.issues_existing++;
      }

      // 3) الأرشيف: كشف الرواتب صفاً لكل موظف؛ الحالة والأفراد بنسخة لكل تغيّر (المرجع فيه بصمة المحتوى)
      for (const p of src.payrollImports) await arch('payroll_import', String(p.id), p, null);
      const byRow = new Map<string, Record<string, string>>();
      for (const it of src.payrollItems) { const k = `${it.import_id}|${it.employee_no}`; (byRow.get(k) || byRow.set(k, {}).get(k)!)[it.payroll_code] = it.value; }
      const period = new Map(src.payrollImports.map(p => [Number(p.id), p.period]));
      for (const [k, values] of byRow) {
        const [iid, no] = k.split('|');
        if (await arch('payroll_row', `${iid}:${no}`, { period: period.get(Number(iid)) ?? null, company_number: no, values }, hrByNo(no)?.id ?? null)) s.payroll_rows++;
      }
      for (const [kind, list] of Object.entries(src.archive)) for (const r of list) await arch(kind, `${r.id}:${sha8(r.d)}`, r.d, null);
      for (const st of src.statuses) {
        const no = oldEmp.get(Number(st.employee_id))?.employee_no ?? '';
        await arch('family_status', `${st.id}:${no}:${sha8(st)}`, { ...st, company_number: no }, hrOf(Number(st.employee_id))?.id ?? null);
      }
      for (const m of src.members) {
        const no = oldEmp.get(Number(m.employee_id))?.employee_no ?? '';
        await arch('family_member', `${m.id}:${no}:${sha8(m)}`, { ...m, company_number: no }, hrOf(Number(m.employee_id))?.id ?? null);
      }

      // 4) مقارنة بيانات الموظف (تقرير فقط، الحقول المؤثرة بالراتب تتغير بأمر — قرار B8)
      const hrGrades = new Map<number, any>(rows(await tx.execute(sql`SELECT id, grade, step FROM employees`)).map(r => [Number(r.id), r]));
      for (const e of src.employees) {
        const h = hrByNo(e.employee_no);
        if (!h) { s.employees_not_in_hr++; report.employees_not_in_hr.push({ company_number: e.employee_no, name: e.full_name }); continue; }
        const g = hrGrades.get(Number(h.id));
        const og = e.grade === null || e.grade === undefined || e.grade === '' ? null : Number(e.grade), os = e.step === null ? null : Number(e.step);
        if ((og !== null && Number.isFinite(og) && og !== g?.grade) || (os !== null && os !== g?.step)) {
          s.grade_step_diffs++; report.grade_step.push({ company_number: e.employee_no, name: e.full_name, hr: `${g?.grade ?? '—'}/${g?.step ?? '—'}`, old: `${og ?? '—'}/${os ?? '—'}`, basic_old: e.basic_salary });
        }
      }

      // فترات معتمدة/مُصدَرة لفئة أي موظف تغيرت عائلته (بنفس تطبيع المحرك لنوع الخدمة) أو احتُسب بها: التطبيق يحتاج قراراً
      const rules = rows(await tx.execute(sql`SELECT service_type, contract_type, category_id FROM payroll_category_rules`));
      const catOf = (st: any, ct: any) => {
        const a = normAr(st), b = normAr(ct);
        return (rules.find(r => normAr(r.service_type) === a && r.contract_type !== null && normAr(r.contract_type) === b) ?? rules.find(r => normAr(r.service_type) === a && r.contract_type === null))?.category_id ?? null;
      };
      const byId = new Map<number, any>([...hrEmps.values()].map(e => [Number(e.id), e]));
      const cats = [...new Set([...touched].map(id => catOf(byId.get(id)?.service_type, byId.get(id)?.contract_type)).filter(c => c !== null))];
      const ids = sql.raw(`ARRAY[${[...touched].join(',') || 0}]::int[]`);
      const blockers = rows(await tx.execute(sql`SELECT count(DISTINCT p.id)::int n FROM payroll_periods p WHERE p.status IN ('معتمدة', 'مُصدَرة') AND (
          p.category_id = ANY(${sql.raw(`ARRAY[${cats.join(',') || 0}]::int[]`)})
          OR EXISTS (SELECT 1 FROM payroll_results r WHERE r.run_id = p.current_run_id AND r.employee_id = ANY(${ids})))`))[0].n;

      const summary = { ...s, backup_sha256: src.sha256, previous_runs: prev, approved_periods: blockers };
      const result = { import_id: imp.id, summary, report, blocked: blockers > 0 ? `أكو ${blockers} فترة رواتب معتمدة أو مُصدَرة لفئة الموظفين المتأثرين؛ الأفراد المضافون الآن يولّدون فروقاً رجعية بالعائلية. التطبيق يحتاج قراراً` : null };
      if (!o.apply || blockers > 0) throw new DryRun(result);
      await tx.execute(sql`UPDATE legacy_imports SET summary = ${JSON.stringify(summary)}::jsonb WHERE id = ${imp.id}`);
      await tx.insert(schema.payrollAudit).values({ actor: o.user, action: 'ترحيل نظام المخصصات', entity: 'legacy_imports', entityId: String(imp.id), after: summary });
      return { ...result, applied: true };
    });
  } catch (e: any) {
    if (e instanceof DryRun) return { ...e.result, applied: false };
    throw e;
  }
}
