// src/db/drizzle.config.ts
// إعداد drizzle-kit (generate / check / studio). يقرأ نفس مفاتيح .env التي تكتبها لوحة التحكم.
// SQL_ADMIN_USER / SQL_ADMIN_PASSWORD اختياريان: إن وُجدا يُستعملان بدل SQL_USER / SQL_PASSWORD.
import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const sqlHost = process.env.SQL_HOST || "localhost";
// generate/check لا يتصلان بالقاعدة، لذلك لا نرمي خطأً إن غابت المفاتيح؛ push/studio فقط يحتاجانها.
const sqlDbName = process.env.SQL_DB_NAME || "hr_system";
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || "postgres";
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || "";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
  dbCredentials: {
    host: sqlHost,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 5432,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  },
  verbose: true,
});
