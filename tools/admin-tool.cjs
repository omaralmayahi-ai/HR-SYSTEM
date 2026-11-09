// أداة حساب مدير النظام — تستدعيها لوحة التحكم (tools/control-app.ps1)
//   node tools/admin-tool.cjs status  -> يطبع USERS=<عدد الحسابات> و DEFAULT_ADMIN=1 إذا كان admin بكلمة المرور الافتراضية
//   node tools/admin-tool.cjs set     -> ينشئ حساب مدير أو يغيّر كلمة مروره
//                                        (من المتغيرات HR_ADMIN_USERNAME و HR_ADMIN_FULLNAME و HR_ADMIN_PASSWORD)
// تُقرأ إعدادات قاعدة البيانات من ملف .env (SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME).
'use strict';
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ quiet: true });
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function main() {
  const mode = process.argv[2];
  const client = new Client({
    host: process.env.SQL_HOST,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    if (mode === 'status') {
      const exists = await client.query("select to_regclass('public.users') as t");
      if (!exists.rows[0].t) { console.log('USERS=0'); return; }
      const c = await client.query('select count(*)::int as n from users');
      console.log('USERS=' + c.rows[0].n);
      const a = await client.query("select password from users where username = 'admin' limit 1");
      if (a.rows[0] && a.rows[0].password) {
        const p = a.rows[0].password;
        const isDefault = p === 'admin123' || (p.startsWith('$2') && (await bcrypt.compare('admin123', p)));
        console.log('DEFAULT_ADMIN=' + (isDefault ? '1' : '0'));
      }
      return;
    }
    if (mode === 'set') {
      const username = (process.env.HR_ADMIN_USERNAME || '').trim();
      const fullName = (process.env.HR_ADMIN_FULLNAME || '').trim() || 'مدير النظام';
      const password = process.env.HR_ADMIN_PASSWORD || '';
      if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) throw new Error('اسم المستخدم غير صالح');
      if (password.length < 8) throw new Error('كلمة المرور قصيرة');
      const hash = await bcrypt.hash(password, 10);
      const found = await client.query('select id from users where username = $1', [username]);
      if (found.rows.length) {
        await client.query("update users set password = $1, name = $2, role = 'admin' where username = $3", [hash, fullName, username]);
        console.log('تم تغيير كلمة مرور الحساب ' + username + ' وصلاحيته: مدير نظام.');
      } else {
        await client.query("insert into users (username, password, name, role) values ($1, $2, $3, 'admin')", [username, hash, fullName]);
        console.log('تم إنشاء حساب مدير النظام ' + username + '.');
      }
      return;
    }
    throw new Error('الاستخدام: node tools/admin-tool.cjs status|set');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('خطأ: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
