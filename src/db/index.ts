// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 20,
    keepAlive: true,
  });
};

// Create a pool instance.
export const pool = createPool();

// Ensure database schema columns exist
export async function ensureSchema() {
  const safeQuery = async (queryText: string) => {
    try {
      const res = await pool.query(queryText);
      return res;
    } catch (err: any) {
      // Ignore schema permission or table ownership warnings
    }
  };

  try {
    // 1. Trainers Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS trainers (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        specialization TEXT,
        trainer_type TEXT DEFAULT 'داخلي',
        organization TEXT,
        phone TEXT,
        email TEXT,
        status TEXT DEFAULT 'معتمد',
        rating TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const trainerCols = [
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS employee_id INTEGER`,
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS employee_code TEXT`,
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS trainer_code TEXT`,
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS course_categories TEXT`,
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS specialty_details TEXT`,
      `ALTER TABLE trainers ADD COLUMN IF NOT EXISTS work_phone TEXT`
    ];
    for (const q of trainerCols) {
      await safeQuery(q);
    }

    // 2. Annual Training Plans Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS annual_training_plans (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        track TEXT NOT NULL,
        planned_courses_count INTEGER DEFAULT 0,
        planned_trainees_count INTEGER DEFAULT 0,
        planned_budget INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Ensure trainings table exists
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS trainings (
        id SERIAL PRIMARY KEY,
        course_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const trainingCols = [
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS year INTEGER DEFAULT 2026`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS track TEXT DEFAULT 'تدريب داخلي'`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'إدارية'`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'حضوري'`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS location_type TEXT DEFAULT 'موقعي'`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS location TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS country TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS provider TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS trainer_id INTEGER`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS trainer_name TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS hours INTEGER DEFAULT 0`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS days INTEGER DEFAULT 1`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS order_number TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE trainings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'مخطط'`
    ];
    for (const q of trainingCols) {
      await safeQuery(q);
    }

    // 4. Ensure training_enrollments table exists
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS training_enrollments (
        id SERIAL PRIMARY KEY,
        training_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const enrollmentCols = [
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS employee_id INTEGER`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS is_external_participant BOOLEAN DEFAULT FALSE`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS external_participant_name TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS external_participant_entity TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS external_participant_phone TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS enrollment_date TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS result TEXT DEFAULT 'قيد التقييم'`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS score TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS grade TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS certificate_number TEXT`,
      `ALTER TABLE training_enrollments ADD COLUMN IF NOT EXISTS notes TEXT`
    ];
    for (const q of enrollmentCols) {
      await safeQuery(q);
    }
    await safeQuery(`ALTER TABLE training_enrollments ALTER COLUMN employee_id DROP NOT NULL`);

    // 5. Ensure governing_courses table exists
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS governing_courses (
        id SERIAL PRIMARY KEY,
        grade INTEGER NOT NULL,
        course_name TEXT NOT NULL,
        course_type TEXT DEFAULT 'تخصصية',
        duration_days INTEGER DEFAULT 5,
        duration_hours INTEGER DEFAULT 20,
        is_required_for_promotion BOOLEAN DEFAULT TRUE,
        min_passing_score INTEGER DEFAULT 60,
        description TEXT,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure camelCase alias columns exist for compatibility if needed
    const govCols = [
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS courseName TEXT`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS courseType TEXT`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS durationDays INTEGER`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS durationHours INTEGER`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS isRequiredForPromotion BOOLEAN`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS minPassingScore INTEGER`,
      `ALTER TABLE governing_courses ADD COLUMN IF NOT EXISTS createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    ];
    for (const q of govCols) {
      await safeQuery(q);
    }

    // 6. Governing Course Exemption Rules Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS governing_course_exemption_rules (
        id SERIAL PRIMARY KEY,
        config_key TEXT UNIQUE DEFAULT 'default_exemption_rules',
        rules TEXT,
        qualifications_exemptions TEXT,
        grade_title_exemptions TEXT,
        auto_apply_rules BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Governing Course Employee Assignments Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS governing_course_employee_assignments (
        id SERIAL PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'مشمول',
        exemption_reason TEXT,
        exemption_order_number TEXT,
        exemption_order_date TEXT,
        assigned_courses TEXT,
        course_progress TEXT,
        notes TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Migration execution notice:', err);
  }
}

// Prevent unhandled pool-level errors from crashing the application
pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });
export * as schema from './schema.ts';
export { eq, and, or, desc, asc, sql } from 'drizzle-orm';
