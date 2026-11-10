// أعمدة جدول موجودة فعلاً في القاعدة (للمسارات التي تبني SQL ديناميكياً). نُقل من server.ts (B3).
// B3: فشل القراءة لم يعد يُبتلع ويُعاد كمجموعة فارغة (كان يعني «اكتب كل الحقول») — يُرمى للمسار.
export async function getExistingColumns(pool: { query: (q: string, p: any[]) => Promise<any> }, tableName: string): Promise<Set<string>> {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(res.rows.map((r: any) => r.column_name));
}
