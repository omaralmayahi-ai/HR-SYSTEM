// npm run db:migrate — يطبّق الترحيلات المعلّقة (ويتبنّى القاعدة القائمة أول مرة).
// رمز الخروج: 0 نجاح، 1 خطأ، 3 قاعدة البيانات غير متاحة.
import 'dotenv/config';
import { runMigrations } from '../../server/migrate.ts';
import { pool } from '../../src/db/index.ts';

const st = await runMigrations({ log: (m) => console.log(m) });
await pool.end().catch(() => {});
if (st.status === 'ok') {
  console.log(`النتيجة: ناجح — مطبّق ${st.applied.length}، طُبّق الآن ${st.appliedNow.length}${st.adoptedNow ? '، وتم التبنّي' : ''}`);
  process.exit(0);
}
if (st.status === 'offline') { console.error('النتيجة: قاعدة البيانات غير متاحة'); process.exit(3); }
console.error('النتيجة: فشل — ' + (st.error?.message || 'خطأ غير معروف'));
process.exit(1);
