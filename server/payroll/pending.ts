// server/payroll/pending.ts — B8a1: العمليات الحساسة بانتظار الاعتماد (مب9، س15.3، ق-3).
// الإدخال يحفظ حمولة فقط؛ الاعتماد (مدير غير المُدخل) يطبّقها على الجداول بمعاملة واحدة مع سجل التدقيق.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { applyMovement, isIsoDate, todayBaghdad } from '../careerMovements.ts';
import { unapproveInTx } from './periods.ts';
import { PayrollError, validateProps, activationProblems, ensureOrder, supersedeAndInsert } from './catalog.ts';

export const OP_TYPES = ['item_version', 'assignment', 'assignment_end', 'family_member', 'family_fact', 'family_mode', 'family_extension', 'period_unapprove'] as const;
export type OpType = typeof OP_TYPES[number];

const MULTI_METHODS = new Set(['installments', 'manual']);
const FAMILY_FACTS = ['يدرس', 'متزوج', 'موظف', 'عاجز', 'حضانة بحكم', 'متوفى', 'يستلم الإعالة'];
const FAMILY_MODES = ['كامل', 'الأطفال فقط', 'محجوب', 'لا يستحق'];
const RELATIONS = ['زوج', 'زوجة', 'زوج/زوجة', 'ابن', 'بنت', 'طفل'];
const iso = (v: any, label: string, required = true) => {
  const s = String(v ?? '').trim();
  if (!s && !required) return null;
  if (!isIsoDate(s)) throw new PayrollError(`${label} بصيغة YYYY-MM-DD`);
  return s;
};
const monthsBetween = (a: string, b: string) => {
  const x = new Date(a + 'T00:00:00Z'), y = new Date(b + 'T00:00:00Z');
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
};
const rows = (r: any) => ((r as any).rows ?? r) as any[];

async function loadItem(db: any, schema: any, itemId: number) {
  const [item] = await db.select().from(schema.payItems).where(eq(schema.payItems.id, itemId));
  if (!item) throw new PayrollError('البند غير موجود', 404);
  return item;
}

/** الحالة الحالية للهدف (لكشف التعارض: تغيّر الهدف بين الإدخال والاعتماد). */
async function baseToken(db: any, schema: any, op: OpType, p: any): Promise<string | null> {
  if (op === 'item_version') {
    const r = rows(await db.execute(sql`SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') t FROM pay_item_versions WHERE item_id = ${Number(p.item_id)} AND superseded_at IS NULL`));
    return r[0]?.t ?? '';
  }
  if (op === 'assignment_end') {
    const r = rows(await db.execute(sql`SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') t FROM employee_pay_assignments WHERE id = ${Number(p.assignment_id)} AND superseded_at IS NULL`));
    return r[0]?.t ?? '';
  }
  if (op === 'assignment') {
    if (p.multi_allowed) return null; // الأقساط والأوامر اليدوية تتعدد؛ ما تتعارض ببعضها
    const r = rows(await db.execute(sql`SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '') t FROM employee_pay_assignments
      WHERE employee_id = ${Number(p.employee_id)} AND item_id = ${Number(p.item_id)} AND superseded_at IS NULL AND NOT multi_allowed`));
    return r[0]?.t ?? '';
  }
  if (op === 'period_unapprove') {
    const r = rows(await db.execute(sql`SELECT status || ':' || coalesce(current_run_id::text, '') t FROM payroll_periods WHERE id = ${Number(p.period_id)}`));
    return r[0]?.t ?? '';
  }
  // العائلة: حالة عائلة الموظف كلها (الأفراد والحقائق الحية والتمديدات والنمط)
  const empId = Number(p.employee_id);
  const r = rows(await db.execute(sql`SELECT concat_ws('|',
      (SELECT string_agg(id::text, ',' ORDER BY id) FROM family_members WHERE employee_id = ${empId}),
      (SELECT string_agg(f.id::text, ',' ORDER BY f.id) FROM family_member_facts f JOIN family_members m ON m.id = f.member_id WHERE m.employee_id = ${empId}),
      (SELECT string_agg(x.id::text, ',' ORDER BY x.id) FROM family_extensions x JOIN family_members m ON m.id = x.member_id WHERE m.employee_id = ${empId}),
      (SELECT max(id)::text FROM employee_field_history WHERE employee_id = ${empId} AND field = 'family_mode')) t`));
  return r[0]?.t ?? '';
}

/** تحقق أولي عند الإدخال (نفس التحقق يُعاد عند الاعتماد). يرجع الحمولة المطبّعة وملخصاً. */
export async function prepare(db: any, schema: any, op: OpType, raw: any): Promise<{ payload: any; summary: string; employeeId: number | null; itemId: number | null; warnings: string[] }> {
  const warnings: string[] = [];
  if (!(OP_TYPES as readonly string[]).includes(op)) throw new PayrollError('نوع عملية غير معروف');
  const p: any = { ...(raw || {}) };
  switch (op) {
    case 'item_version': {
      const item = await loadItem(db, schema, Number(p.item_id));
      p.item_id = item.id;
      p.valid_from = iso(p.valid_from, 'تاريخ النفاذ');
      p.valid_to = iso(p.valid_to, 'تاريخ النهاية', false);
      p.props = validateProps(item, p.props);
      const src = p.props.level_source;
      if (src && Array.isArray(p.props.levels) && p.props.levels.length) {
        const table = ({ education_degrees: 'education_degrees', responsibility_allowances: 'responsibility_allowances', work_locations: 'work_locations' } as any)[src];
        const ids = p.props.levels.map((l: any) => Number(l.ref_id));
        if (ids.some((x: number) => !Number.isInteger(x))) throw new PayrollError('معرّف المستوى لازم رقم صحيح');
        const found = rows(await db.execute(sql`SELECT id FROM ${sql.raw(table)} WHERE id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)})`)).map(r => Number(r.id));
        const missing = ids.filter((x: number) => !found.includes(x));
        if (missing.length) throw new PayrollError(`مستويات تشير لسجلات غير موجودة: ${missing.join('، ')}`);
      }
      return { payload: p, summary: `نسخة ${item.name} (${p.props.status}) من ${p.valid_from}`, employeeId: null, itemId: item.id, warnings };
    }
    case 'assignment': {
      const item = await loadItem(db, schema, Number(p.item_id));
      const empId = Number(p.employee_id);
      const [emp] = await db.select({ id: schema.employees.id, name: schema.employees.fullName }).from(schema.employees).where(eq(schema.employees.id, empId));
      if (!emp) throw new PayrollError('الموظف غير موجود', 404);
      if (!['منح', 'تعديل', 'حجب'].includes(p.kind)) throw new PayrollError('نوع الإسناد: منح / تعديل / حجب');
      p.valid_from = iso(p.valid_from, 'تاريخ البداية');
      p.valid_to = iso(p.valid_to, 'تاريخ النهاية', false);
      if (!String(p.reason ?? '').trim()) throw new PayrollError('السبب مطلوب');
      if (!p.order) throw new PayrollError('أمر الإسناد مطلوب (رقمه وتاريخه)');
      const multi = MULTI_METHODS.has(item.method);
      const [cur] = await db.execute(sql`SELECT props FROM pay_item_versions WHERE item_id = ${item.id} AND superseded_at IS NULL
        AND valid_from <= ${p.valid_from}::date AND (valid_to IS NULL OR valid_to >= ${p.valid_from}::date) LIMIT 1`).then((r: any) => rows(r));
      const props = cur?.props || {};
      if (p.kind === 'حجب' && props.withholdable === false) throw new PayrollError(`البند «${item.name}» ما يقبل الحجب بإعداده`);
      if (p.kind !== 'حجب' && item.assignmentMode === 'تلقائي' && !props.individual_override) throw new PayrollError(`البند «${item.name}» ما يقبل الإسناد الفردي فوق القاعدة بإعداده`);
      const catOk = rows(await db.execute(sql`SELECT 1 FROM employees e JOIN payroll_category_rules r ON r.service_type = btrim(coalesce(e.service_type, ''))
        WHERE e.id = ${empId} AND r.category_id = ${item.categoryId} LIMIT 1`));
      if (catOk.length === 0) warnings.push('فئة رواتب الموظف الحالية تختلف عن فئة البند');
      if (p.kind === 'حجب') {
        p.value = '0'; p.value_kind = null;
        if (item.classification === 'عام') warnings.push(`حجب بند عام (${item.name}) — يظهر بقسم مستقل بتقرير الاستثناءات (ق-3)`);
      } else if (item.method === 'installments') {
        const principal = Number(p.principal), count = Number(p.installments_count), inst = Number(p.installment);
        if (!(principal > 0)) throw new PayrollError('أصل المبلغ مطلوب');
        if (!(count > 0) && !(inst > 0)) throw new PayrollError('عدد الأقساط أو مبلغ القسط مطلوب');
      } else {
        const v = Number(p.value);
        if (p.value === undefined || p.value === null || p.value === '' || !Number.isFinite(v)) throw new PayrollError('القيمة مطلوبة');
        if (!['نسبة', 'مبلغ'].includes(p.value_kind)) throw new PayrollError('نوع القيمة: نسبة / مبلغ');
        if (v < 0 && !(item.method === 'manual')) throw new PayrollError('القيمة سالبة');
      }
      // الإسناد على بند تلقائي: نهاية إلزامية (افتراضياً 12 شهراً) حتى ما يبقى استثناء منسي (س8.3)؛ يُستثنى الحجب
      if (item.assignmentMode === 'تلقائي' && p.kind !== 'حجب') {
        if (!p.valid_to) throw new PayrollError('الإسناد على بند تلقائي يحتاج تاريخ نهاية (س8.3)');
        if (monthsBetween(p.valid_from, p.valid_to) > 12) warnings.push('مدة الإسناد على بند تلقائي أكثر من 12 شهراً');
      }
      if (item.classification === 'مؤقت' && !p.valid_to && item.method !== 'installments') throw new PayrollError('البند المؤقت يحتاج تاريخ نهاية');
      p.multi_allowed = multi && p.kind !== 'حجب'; // الحجب صف واحد يوقف البند (ما يتعدد)
      return { payload: p, summary: `${p.kind} ${item.name} للموظف ${emp.name} من ${p.valid_from}${p.valid_to ? ' إلى ' + p.valid_to : ''}`, employeeId: empId, itemId: item.id, warnings };
    }
    case 'assignment_end': {
      const [a] = await db.select().from(schema.employeePayAssignments).where(eq(schema.employeePayAssignments.id, Number(p.assignment_id)));
      if (!a || a.supersededAt) throw new PayrollError('الإسناد غير موجود أو مُستبدل', 404);
      p.end_date = iso(p.end_date, 'تاريخ الإنهاء');
      if (!String(p.reason ?? '').trim()) throw new PayrollError('السبب مطلوب');
      if (!p.order) throw new PayrollError('أمر الإنهاء مطلوب');
      p.employee_id = a.employeeId; p.item_id = a.itemId;
      if (a.validTo && p.end_date > a.validTo) throw new PayrollError('تاريخ الإنهاء بعد نهاية الإسناد؛ التمديد إسناد جديد بأمر');
      const cancel = p.end_date < a.validFrom;
      return { payload: p, summary: cancel ? `إلغاء الإسناد #${a.id}` : `إنهاء الإسناد #${a.id} في ${p.end_date}`, employeeId: a.employeeId, itemId: a.itemId, warnings };
    }
    case 'family_member': {
      const empId = Number(p.employee_id);
      const [emp] = await db.select({ id: schema.employees.id, name: schema.employees.fullName }).from(schema.employees).where(eq(schema.employees.id, empId));
      if (!emp) throw new PayrollError('الموظف غير موجود', 404);
      if (!RELATIONS.includes(p.relation)) throw new PayrollError(`صلة القرابة: ${RELATIONS.join(' / ')}`);
      if (!String(p.name ?? '').trim()) throw new PayrollError('الاسم مطلوب');
      p.birth_date = iso(p.birth_date, 'تاريخ الميلاد', !['زوج', 'زوجة', 'زوج/زوجة'].includes(p.relation));
      const dup = rows(await db.execute(sql`SELECT 1 FROM family_members WHERE employee_id = ${empId} AND btrim(name) = ${String(p.name).trim()}
        AND birth_date IS NOT DISTINCT FROM ${p.birth_date}::date LIMIT 1`));
      if (dup.length) throw new PayrollError('فرد بنفس الاسم وتاريخ الميلاد مسجل لهذا الموظف');
      return { payload: p, summary: `إضافة ${p.relation} (${p.name}) للموظف ${emp.name}`, employeeId: empId, itemId: null, warnings };
    }
    case 'family_fact': {
      const [m] = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.id, Number(p.member_id)));
      if (!m) throw new PayrollError('فرد العائلة غير موجود', 404);
      if (!FAMILY_FACTS.includes(p.fact)) throw new PayrollError(`الحقيقة: ${FAMILY_FACTS.join(' / ')}`);
      if (typeof p.value !== 'boolean') throw new PayrollError('القيمة نعم/لا');
      p.valid_from = iso(p.valid_from, 'تاريخ النفاذ', false);
      if (p.supersedes_id) {
        const [old] = await db.select().from(schema.familyMemberFacts).where(eq(schema.familyMemberFacts.id, Number(p.supersedes_id)));
        if (!old || old.memberId !== m.id || old.fact !== p.fact) throw new PayrollError('الحقيقة المصحَّحة ما تخص نفس الفرد ونفس الحقيقة');
      }
      p.employee_id = m.employeeId;
      return { payload: p, summary: `${m.name || m.relation}: ${p.fact} = ${p.value ? 'نعم' : 'لا'}${p.valid_from ? ' من ' + p.valid_from : ''}`, employeeId: m.employeeId, itemId: null, warnings };
    }
    case 'family_mode': {
      const empId = Number(p.employee_id);
      const [emp] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.id, empId));
      if (!emp) throw new PayrollError('الموظف غير موجود', 404);
      if (!FAMILY_MODES.includes(p.mode)) throw new PayrollError(`النمط: ${FAMILY_MODES.join(' / ')}`);
      p.effective_date = iso(p.effective_date, 'تاريخ النفاذ');
      if (['الأطفال فقط', 'محجوب'].includes(p.mode) && !String(p.reason ?? '').trim()) throw new PayrollError('الحجب والأطفال فقط يحتاجان سبباً');
      return { payload: p, summary: `نمط العائلية «${p.mode}» من ${p.effective_date}`, employeeId: empId, itemId: null, warnings };
    }
    case 'family_extension': {
      const [m] = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.id, Number(p.member_id)));
      if (!m) throw new PayrollError('فرد العائلة غير موجود', 404);
      p.valid_from = iso(p.valid_from, 'بداية التمديد');
      p.valid_to = iso(p.valid_to, 'نهاية التمديد');
      if (p.valid_to < p.valid_from) throw new PayrollError('نهاية التمديد قبل بدايته');
      if (!p.order) throw new PayrollError('أمر التمديد مطلوب');
      p.employee_id = m.employeeId;
      return { payload: p, summary: `تمديد ${m.name || m.relation} من ${p.valid_from} إلى ${p.valid_to}`, employeeId: m.employeeId, itemId: null, warnings };
    }
    case 'period_unapprove': {
      const [per] = await db.select().from(schema.payrollPeriods).where(eq(schema.payrollPeriods.id, Number(p.period_id)));
      if (!per) throw new PayrollError('الفترة غير موجودة', 404);
      if (per.status !== 'معتمدة') throw new PayrollError(`الفترة ${per.status}؛ إلغاء الاعتماد للفترة المعتمدة قبل الإصدار فقط`, 409);
      if (!String(p.reason ?? '').trim()) throw new PayrollError('سبب إلغاء الاعتماد مطلوب');
      p.period_id = per.id; p.reason = String(p.reason).trim();
      return { payload: p, summary: `إلغاء اعتماد فترة ${per.year}/${per.month}: ${p.reason}`, employeeId: null, itemId: null, warnings };
    }
  }
  throw new PayrollError('نوع عملية غير معروف');
}

/** هل تُطبّق مباشرة بلا اعتماد؟ فقط تعديل مسودة بند ما فُعّل يوماً (لا أثر مالي). */
async function isDirectDraftEdit(db: any, op: OpType, p: any) {
  if (op !== 'item_version' || p.props?.status !== 'مسودة') return false;
  const r = rows(await db.execute(sql`SELECT 1 FROM pay_item_versions WHERE item_id = ${p.item_id} AND props->>'status' <> 'مسودة' LIMIT 1`));
  return r.length === 0;
}

export async function submit(db: any, schema: any, op: OpType, raw: any, user: string) {
  const prep = await prepare(db, schema, op, raw);
  if (await isDirectDraftEdit(db, op, prep.payload)) {
    const result = await db.transaction(async (tx: any) => {
      const r = await applyOp(tx, schema, op, prep.payload, user, user);
      await tx.insert(schema.payrollAudit).values({ actor: user, action: 'تعديل مسودة بند', entity: 'pay_items', entityId: String(prep.itemId), after: prep.payload });
      return r;
    });
    return { applied: true, result, warnings: prep.warnings };
  }
  const token = await baseToken(db, schema, op, prep.payload);
  const summary = prep.warnings.length ? `${prep.summary} — ⚠ ${prep.warnings.join('؛ ')}` : prep.summary; // يشوفها المعتمِد (ق-3)
  const [row] = await db.insert(schema.pendingOperations).values({
    opType: op, employeeId: prep.employeeId, itemId: prep.itemId, payload: prep.payload, baseToken: token, summary, enteredBy: user,
  }).returning();
  await db.insert(schema.payrollAudit).values({ actor: user, action: 'إدخال عملية بانتظار الاعتماد', entity: 'pending_operations', entityId: String(row.id), after: { op, summary: prep.summary } });
  return { applied: false, pending: row, warnings: prep.warnings };
}

/** يطبّق العملية على الجداول (داخل معاملة الاعتماد). */
async function applyOp(tx: any, schema: any, op: OpType, p: any, enteredBy: string, approver: string) {
  switch (op) {
    case 'item_version': {
      const [item] = await tx.select().from(schema.payItems).where(eq(schema.payItems.id, p.item_id));
      const order = await ensureOrder(tx, schema, p.order, approver);
      const problems = activationProblems(item, p.props, order, p.valid_from);
      if (problems.length) throw new PayrollError('ما يُعتمد: ' + problems.join('؛ '), 409);
      const r = await supersedeAndInsert(tx, schema.payItemVersions, eq(schema.payItemVersions.itemId, p.item_id), {
        itemId: p.item_id, validFrom: p.valid_from, validTo: p.valid_to ?? null, props: p.props, orderId: order?.id ?? null,
        enteredBy, approvedBy: approver, note: p.note ?? null, publishedAt: p.props.status !== 'مسودة' ? new Date() : null,
      });
      return { version_id: r.created.id, superseded: r.superseded };
    }
    case 'assignment': {
      const order = await ensureOrder(tx, schema, p.order, approver);
      const row = {
        employeeId: Number(p.employee_id), itemId: Number(p.item_id), kind: p.kind, valueKind: p.value_kind ?? null,
        value: p.value === undefined || p.value === null || p.value === '' ? null : String(p.value),
        validFrom: p.valid_from, validTo: p.valid_to ?? null,
        principal: p.principal != null && p.principal !== '' ? String(p.principal) : null,
        installment: p.installment != null && p.installment !== '' ? String(p.installment) : null,
        installmentsCount: p.installments_count != null && p.installments_count !== '' ? Number(p.installments_count) : null,
        multiAllowed: !!p.multi_allowed, orderId: order!.id, reason: String(p.reason).trim(), enteredBy, approvedBy: approver,
      };
      if (row.multiAllowed) {
        const [created] = await tx.insert(schema.employeePayAssignments).values(row).returning();
        return { assignment_id: created.id };
      }
      const A = schema.employeePayAssignments;
      const r = await supersedeAndInsert(tx, A, and(eq(A.employeeId, row.employeeId), eq(A.itemId, row.itemId)), row);
      return { assignment_id: r.created.id, superseded: r.superseded };
    }
    case 'assignment_end': {
      const A = schema.employeePayAssignments;
      const [a] = await tx.select().from(A).where(and(eq(A.id, Number(p.assignment_id)), isNull(A.supersededAt))).for('update');
      if (!a) throw new PayrollError('الإسناد تغيّر بعد الإدخال؛ أعد الإدخال', 409);
      const order = await ensureOrder(tx, schema, p.order, approver);
      await tx.update(A).set({ supersededAt: new Date() }).where(eq(A.id, a.id));
      if (p.end_date < a.validFrom) return { cancelled: a.id }; // إلغاء: كأنه لم يكن
      const { id, recordedAt, supersededAt, supersededBy, ...rest } = a;
      const [created] = await tx.insert(A).values({ ...rest, validTo: p.end_date, orderId: order!.id, reason: `${a.reason} — إنهاء: ${p.reason}`, enteredBy, approvedBy: approver }).returning();
      await tx.update(A).set({ supersededBy: created.id }).where(eq(A.id, a.id));
      return { ended: a.id, replacement: created.id };
    }
    case 'family_member': {
      const [m] = await tx.insert(schema.familyMembers).values({
        employeeId: Number(p.employee_id), relation: p.relation, name: String(p.name).trim(), birthDate: p.birth_date ?? null,
        spouseEmployeeId: p.spouse_employee_id ? Number(p.spouse_employee_id) : null, createdBy: enteredBy,
      }).returning();
      const order = await ensureOrder(tx, schema, p.order, approver);
      for (const f of Array.isArray(p.facts) ? p.facts : []) {
        if (!FAMILY_FACTS.includes(f?.fact) || typeof f?.value !== 'boolean') continue;
        await tx.insert(schema.familyMemberFacts).values({ memberId: m.id, fact: f.fact, value: f.value, validFrom: f.valid_from || null, orderId: order?.id ?? null, source: order ? 'أمر' : 'تقديري', reason: 'عند الإضافة', recordedBy: enteredBy });
      }
      return { member_id: m.id };
    }
    case 'family_fact': {
      const order = await ensureOrder(tx, schema, p.order, approver);
      const [f] = await tx.insert(schema.familyMemberFacts).values({
        memberId: Number(p.member_id), fact: p.fact, value: p.value, validFrom: p.valid_from ?? null, orderId: order?.id ?? null,
        source: p.supersedes_id ? 'تصحيح' : (order ? 'أمر' : 'تقديري'), reason: p.reason ?? null,
        supersedesId: p.supersedes_id ? Number(p.supersedes_id) : null, recordedBy: enteredBy,
      }).returning();
      return { fact_id: f.id };
    }
    case 'family_mode': {
      const order = await ensureOrder(tx, schema, p.order, approver);
      // نمط العائلية حقل متتبَّع: حركة مؤرخة بالسجل الوظيفي (نفس المعاملة)
      const r = await applyMovement(tx, schema, {
        employeeId: Number(p.employee_id), effectiveDate: p.effective_date, changes: { family_mode: p.mode } as any,
        orderId: order?.id ?? null, source: order ? 'أمر' : 'تعديل مباشر', reason: p.reason ?? 'نمط الاستحقاق العائلي', userLabel: approver,
      });
      return { rows: r.inserted.length };
    }
    case 'family_extension': {
      const order = await ensureOrder(tx, schema, p.order, approver);
      const [x] = await tx.insert(schema.familyExtensions).values({ memberId: Number(p.member_id), validFrom: p.valid_from, validTo: p.valid_to, orderId: order?.id ?? null, reason: p.reason ?? null, recordedBy: enteredBy }).returning();
      return { extension_id: x.id };
    }
    case 'period_unapprove':
      return unapproveInTx(tx, schema, Number(p.period_id), p.reason, enteredBy, approver);
  }
}

export async function decide(db: any, schema: any, id: number, decision: 'approve' | 'reject' | 'cancel', user: string, reason?: string | null) {
  return db.transaction(async (tx: any) => {
    const P = schema.pendingOperations;
    const [op] = await tx.select().from(P).where(eq(P.id, id)).for('update');
    if (!op) throw new PayrollError('العملية غير موجودة', 404);
    if (op.state !== 'بانتظار') throw new PayrollError(`العملية ${op.state} مسبقاً`, 409);
    if (decision === 'cancel') {
      if (op.enteredBy !== user) throw new PayrollError('يلغيها من أدخلها فقط', 403);
      await tx.update(P).set({ state: 'ملغى', decidedBy: user, decidedAt: new Date(), decisionReason: reason ?? null }).where(eq(P.id, id));
      return { state: 'ملغى' };
    }
    if (!user) throw new PayrollError('تعذّر التعرّف على المستخدم', 403);
    if (op.enteredBy === user) throw new PayrollError('ما تكدر تعتمد أو ترفض عملية أدخلتها أنت؛ يقررها مستخدم آخر (مب9)', 403);
    if (decision === 'reject') {
      if (!String(reason ?? '').trim()) throw new PayrollError('سبب الرفض مطلوب');
      await tx.update(P).set({ state: 'مرفوض', decidedBy: user, decidedAt: new Date(), decisionReason: reason }).where(eq(P.id, id));
      await tx.insert(schema.payrollAudit).values({ actor: user, action: 'رفض عملية', entity: 'pending_operations', entityId: String(id), after: { reason } });
      return { state: 'مرفوض' };
    }
    // قفل لكل هدف حتى ما يعتمد اثنان بنفس اللحظة على نفس الهدف
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${op.opType === 'period_unapprove' ? `payroll:period:${op.payload.period_id}` : `payroll:${op.employeeId ?? ''}:${op.itemId ?? ''}`}))`);
    const token = await baseToken(tx, schema, op.opType, op.payload);
    if (op.baseToken !== null && token !== op.baseToken) {
      throw new PayrollError('الهدف تغيّر بعد إدخال العملية (اعتُمدت عملية أخرى عليه)؛ ترفض هذه ويُعاد إدخالها', 409);
    }
    // إعادة التحقق بنفس قواعد الإدخال على الحالة الحالية
    await prepare(tx, schema, op.opType, op.payload);
    const result = await applyOp(tx, schema, op.opType, op.payload, op.enteredBy, user);
    await tx.update(P).set({ state: 'معتمد', decidedBy: user, decidedAt: new Date(), decisionReason: reason ?? null, resultRef: JSON.stringify(result) }).where(eq(P.id, id));
    await tx.insert(schema.payrollAudit).values({ actor: user, action: 'اعتماد عملية', entity: 'pending_operations', entityId: String(id), before: { op: op.opType, entered_by: op.enteredBy }, after: { payload: op.payload, result } });
    return { state: 'معتمد', result };
  });
}

export { todayBaghdad };
