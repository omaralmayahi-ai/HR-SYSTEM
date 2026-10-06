// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
import * as schema from './schema.ts';

const { Pool } = pkg;

// Function to create a new connection pool.
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
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
    // Core Tables
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        email TEXT,
        name TEXT,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_number TEXT,
        company_number TEXT,
        civil_service_number TEXT,
        full_name TEXT NOT NULL,
        first_name TEXT,
        father_name TEXT,
        grandfather_name TEXT,
        great_grandfather_name TEXT,
        surname TEXT,
        gender TEXT,
        birth_date TEXT,
        birth_place TEXT,
        nationality TEXT,
        ethnicity TEXT,
        religion TEXT,
        marital_status TEXT,
        children_count INTEGER DEFAULT 0,
        national_id TEXT,
        passport_number TEXT,
        blood_type TEXT,
        residence_card TEXT,
        ration_card TEXT,
        nationality_cert TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        appointment_date TEXT,
        first_appointment_date TEXT,
        current_appointment_date TEXT,
        oil_sector_start_date TEXT,
        appointment_order TEXT,
        job_title TEXT,
        department TEXT,
        section TEXT,
        service_type TEXT,
        grade INTEGER,
        step INTEGER,
        grade_date TEXT,
        last_promotion_date TEXT,
        last_increment_date TEXT,
        next_promotion_due_date TEXT,
        next_increment_due_date TEXT,
        job_responsibility TEXT,
        deputy_status TEXT,
        primary_responsibility TEXT,
        acting_responsibility TEXT,
        deputy_level TEXT,
        service_record_number TEXT,
        employee_id_number TEXT,
        retirement_number TEXT,
        education_level TEXT,
        specialization TEXT,
        university TEXT,
        institution TEXT,
        graduation_year INTEGER,
        education_order TEXT,
        evaluation_order TEXT,
        work_location TEXT,
        work_nature TEXT DEFAULT 'مكتبي',
        work_shift_type TEXT DEFAULT 'صباحي',
        shift_system_id INTEGER,
        shift_system_name TEXT,
        shift_work_days INTEGER DEFAULT 0,
        shift_rest_days INTEGER DEFAULT 0,
        status TEXT DEFAULT 'مستمر',
        status_order_number TEXT,
        status_order_date TEXT,
        status_notes TEXT,
        initial_regular_leave_balance INTEGER DEFAULT 0,
        initial_sick_leave_balance INTEGER DEFAULT 0,
        photo TEXT,
        security_clearance_number TEXT,
        security_clearance_date TEXT,
        retirement_extension_order_number TEXT,
        retirement_extension_order_date TEXT,
        retirement_extension_years INTEGER DEFAULT 0,
        retirement_extension_months INTEGER DEFAULT 0,
        retirement_extension_note TEXT,
        spouse_names TEXT,
        spouses_data TEXT,
        children_details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const employeeCols = [
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS father_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS grandfather_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS great_grandfather_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS surname TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS initial_regular_leave_balance INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS initial_sick_leave_balance INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS security_clearance_number TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS security_clearance_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_shift_type TEXT DEFAULT 'صباحي'`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_system_id INTEGER`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_system_name TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_work_days INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_rest_days INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_nature TEXT DEFAULT 'مكتبي'`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_location TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS primary_responsibility TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS acting_responsibility TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS deputy_level TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS first_appointment_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS current_appointment_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS oil_sector_start_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS retirement_extension_order_number TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS retirement_extension_order_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS retirement_extension_years INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS retirement_extension_months INTEGER DEFAULT 0`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS retirement_extension_note TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS spouse_names TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS spouses_data TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS children_details TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_promotion_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_increment_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS next_promotion_due_date TEXT`,
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS next_increment_due_date TEXT`
    ];
    for (const q of employeeCols) {
      await safeQuery(q);
    }

    // Backfill existing employee records: copy grade_date to last_promotion_date and last_increment_date as best baseline estimate
    await safeQuery(`
      UPDATE employees 
      SET last_promotion_date = COALESCE(last_promotion_date, grade_date, current_appointment_date, first_appointment_date, appointment_date),
          last_increment_date = COALESCE(last_increment_date, grade_date, current_appointment_date, first_appointment_date, appointment_date)
      WHERE last_promotion_date IS NULL OR last_increment_date IS NULL;
    `);

    // رقم الشركة هو المعرّف الفريد الأساسي للموظف: يمنع تكرار نفس الرقم بين موظفين.
    // ملاحظة: إن وُجدت بيانات قديمة متكررة فعلياً، سيفشل هذا القيد بصمت (نمط safeQuery)
    // ويجب عندها تنظيف التكرارات يدوياً ثم إعادة تشغيل الخادم لتفعيل القيد.
    await safeQuery(`ALTER TABLE employees ADD CONSTRAINT employees_company_number_unique UNIQUE (company_number);`);
    // الرقم الوظيفي (رقم وزارة التخطيط) رقم فريد أيضاً، رغم أن الاعتماد الأساسي في النظام على رقم الشركة
    await safeQuery(`ALTER TABLE employees ADD CONSTRAINT employees_civil_service_number_unique UNIQUE (civil_service_number);`);
    // رقم هوية الموظف: يُنشأ تلقائياً من الخادم عند إضافة الموظف، ويجب أن يبقى فريداً دوماً (يُستخدم في الهوية الرقمية ورمز الوصول السريع)
    await safeQuery(`ALTER TABLE employees ADD CONSTRAINT employees_employee_id_number_unique UNIQUE (employee_id_number);`);


    await safeQuery(`
      CREATE TABLE IF NOT EXISTS salary_scale (
        id SERIAL PRIMARY KEY,
        grade INTEGER NOT NULL,
        step INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        effective_from TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE salary_scale ADD COLUMN IF NOT EXISTS effective_from TEXT;`);
    // Backfill salary_scale: set effective_from to '2026-08-27' as initial tracking baseline date
    await safeQuery(`UPDATE salary_scale SET effective_from = '2026-08-27' WHERE effective_from IS NULL;`);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS allowances_deductions (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        calc_type TEXT NOT NULL,
        value INTEGER NOT NULL,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS work_locations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        allowance_amount INTEGER DEFAULT 0,
        work_start_hour TEXT DEFAULT '08:00',
        work_end_hour TEXT DEFAULT '15:00',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS education_degrees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        allowance_rate REAL NOT NULL,
        is_higher_education BOOLEAN DEFAULT FALSE,
        higher_allowance_rate REAL DEFAULT 0,
        status TEXT DEFAULT 'فعال',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS responsibility_allowances (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        allowance_rate REAL NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS shift_systems (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        work_days INTEGER NOT NULL,
        rest_days INTEGER NOT NULL,
        allowance_amount INTEGER DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // مراجعة صفحة الموظفين (31-08-2026): shift_systems كان ناقصاً 6 أعمدة يتوقعها الكود
    // (src/db/schema.ts) دون أي مسار ALTER يعوّضها - shift_hours_type وdaily_hours فعليان
    // ومُلزَمان في نافذة إعدادات "أنظمة المناوبة" فأُبقيا وأُضيفا هنا لإغلاق الفجوة.
    await safeQuery(`ALTER TABLE shift_systems ADD COLUMN IF NOT EXISTS shift_hours_type TEXT;`);
    await safeQuery(`ALTER TABLE shift_systems ADD COLUMN IF NOT EXISTS daily_hours REAL;`);

    // تحديث 1 أيلول 2026 (بقرار صريح من المستخدم): allowance_percentage, allowance_flat_amount,
    // overtime_factor, notes لم تكن مستخدَمة فعلياً بأي واجهة (لا حقل نموذج واحد يعرضها أو
    // يسمح بتعديلها) — أُزيلت نهائياً من الكود ومن قاعدة البيانات الحية معاً.
    await safeQuery(`ALTER TABLE shift_systems DROP COLUMN IF EXISTS allowance_percentage;`);
    await safeQuery(`ALTER TABLE shift_systems DROP COLUMN IF EXISTS allowance_flat_amount;`);
    await safeQuery(`ALTER TABLE shift_systems DROP COLUMN IF EXISTS overtime_factor;`);
    await safeQuery(`ALTER TABLE shift_systems DROP COLUMN IF EXISTS notes;`);

    // مراجعة صفحة الموظفين (31-08-2026): فهارس أداء لجدول employees - النظام أُقر لاستقبال
    // 10-20 ألف قيد موظف مستقبلاً، وGET /api/employees أصبح يدعم فلترة وترقيماً فعلياً من جهة
    // الخادم بدل تحميل كل السجلات دفعة واحدة؛ هذه الفهارس تُسرّع أعمدة المطابقة المباشرة الأكثر
    // استخداماً في الفلاتر المتقدمة (19 فلتراً) وحقول البحث والفرز. IF NOT EXISTS يجعلها آمنة
    // للتكرار عند كل إقلاع للخادم بلا أي أثر على البيانات الحالية.
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_status ON employees (status);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_service_type ON employees (service_type);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_gender ON employees (gender);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_religion ON employees (religion);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_ethnicity ON employees (ethnicity);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_marital_status ON employees (marital_status);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_grade ON employees (grade);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_step ON employees (step);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_section ON employees (section);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_job_title ON employees (job_title);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_work_location ON employees (work_location);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_work_shift_type ON employees (work_shift_type);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_education_level ON employees (education_level);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_primary_responsibility ON employees (primary_responsibility);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_shift_system_id ON employees (shift_system_id);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_full_name ON employees (full_name);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_created_at ON employees (created_at);`);
    // فهرس نصي (trigram) لتسريع البحث الحر بالاسم/الرقم الوظيفي/رقم الإضبارة/العنوان الوظيفي (LIKE '%..%')
    // يُضاف باحتياط تام: إن لم تكن صلاحية تفعيل الإضافة متاحة على قاعدة البيانات المُدارة، يُتجاهل الخطأ
    // بصمت (نفس نمط safeQuery المعتمد في هذا الملف) ويبقى البحث يعمل، فقط بدون تسريع الفهرس النصي.
    await safeQuery(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_full_name_trgm ON employees USING gin (full_name gin_trgm_ops);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_civil_service_number_trgm ON employees USING gin (civil_service_number gin_trgm_ops);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_employees_service_record_number_trgm ON employees USING gin (service_record_number gin_trgm_ops);`);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS service_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        record_type TEXT NOT NULL,
        duration_years INTEGER DEFAULT 0,
        duration_months INTEGER DEFAULT 0,
        duration_days INTEGER DEFAULT 0,
        order_number TEXT,
        order_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS job_assignments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        job_title TEXT,
        department TEXT,
        section TEXT,
        assignment_date TEXT,
        assignment_order TEXT,
        order_number TEXT,
        order_date TEXT,
        action_type TEXT DEFAULT 'تكليف',
        assignment_type TEXT DEFAULT 'تكليف',
        primary_responsibility TEXT,
        acting_responsibility TEXT,
        acting_end_date TEXT,
        deputy_level TEXT,
        responsibility TEXT,
        service_type TEXT DEFAULT 'دائم',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const jobAssignmentCols = [
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS division TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS grade TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS step INTEGER`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS confirmation_date TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS order_number TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS order_date TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS action_type TEXT DEFAULT 'تكليف'`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'تكليف'`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS primary_responsibility TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS acting_responsibility TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS acting_end_date TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS deputy_level TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS responsibility TEXT`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'دائم'`,
      `ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS notes TEXT`
    ];
    for (const q of jobAssignmentCols) {
      await safeQuery(q);
    }

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS penalty_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        delay_months INTEGER DEFAULT 0,
        salary_deduction_percent INTEGER DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS leave_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        max_days INTEGER,
        description TEXT,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS evaluation_forms (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        target_group TEXT,
        elements TEXT,
        max_score INTEGER DEFAULT 100,
        status TEXT DEFAULT 'فعال',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS career_histories (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        order_number TEXT,
        order_date TEXT,
        action_type TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days_count INTEGER NOT NULL,
        status TEXT DEFAULT 'معلق',
        remaining_balance INTEGER,
        order_number TEXT,
        medical_attachment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_type_id INTEGER REFERENCES leave_types(id) ON DELETE SET NULL;`);
    // Fix: Drizzle schema declares leave_type_id (FK to leave_types) but the legacy bootstrap never created it,
    // so every select/insert against leave_requests (which implicitly reads/returns all declared columns) failed silently.

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS penalties (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        penalty_type TEXT NOT NULL,
        penalty_date TEXT NOT NULL,
        order_number TEXT,
        reason TEXT,
        status TEXT DEFAULT 'نافذ',
        violation TEXT,
        legal_article TEXT,
        committee_decision_number TEXT,
        decision_date TEXT,
        implementation_date TEXT,
        appeal_status TEXT DEFAULT 'لا يوجد',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS appreciations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        order_number TEXT NOT NULL,
        order_date TEXT NOT NULL,
        issuer TEXT,
        reason TEXT,
        seniority_impact TEXT DEFAULT 'قدم شهر واحد',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS performance_evaluations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        year TEXT NOT NULL,
        total_score INTEGER DEFAULT 0,
        grade TEXT DEFAULT 'بانتظار التقييم',
        form_id INTEGER,
        form_title TEXT,
        scores_json TEXT,
        evaluator TEXT,
        evaluation_order TEXT,
        evaluation_date TEXT,
        weaknesses TEXT,
        strengths TEXT,
        training_needs TEXT,
        employee_opinion TEXT,
        notes TEXT,
        status TEXT DEFAULT 'مرفوع للاعتماد',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE performance_evaluations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'مرفوع للاعتماد';`);
    // Fix: same class of bug as salary_records/leave_requests — this column was added to the CREATE TABLE
    // definition after the table already existed on deployed databases, so legacy installs never got it.

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS salary_records (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        base_salary INTEGER NOT NULL,
        total_allowances INTEGER DEFAULT 0,
        total_deductions INTEGER DEFAULT 0,
        net_salary INTEGER NOT NULL,
        payment_status TEXT DEFAULT 'مسودة',
        payment_date TEXT,
        allowances_breakdown TEXT,
        deductions_breakdown TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE salary_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'مسودة';`);
    // Fix: legacy bootstrap created this column as payment_status; the Drizzle schema/app code expects status.
    // Backfill from the legacy column so pre-existing draft records keep their state.
    await safeQuery(`UPDATE salary_records SET status = payment_status WHERE status IS NULL AND payment_status IS NOT NULL;`);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        status TEXT NOT NULL,
        check_in TEXT,
        check_out TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS org_units (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        parent_id INTEGER,
        manager_id INTEGER,
        code TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      CREATE TABLE IF NOT EXISTS qualifications (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        level TEXT NOT NULL,
        specialization TEXT,
        university TEXT,
        graduation_year INTEGER,
        graduation_date TEXT,
        qualification_type TEXT,
        equation_number TEXT,
        equation_date TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS graduation_date TEXT;`);
    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS qualification_type TEXT;`);
    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS sub_specialization TEXT;`);
    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS country TEXT;`);
    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS average TEXT;`);
    await safeQuery(`ALTER TABLE qualifications ADD COLUMN IF NOT EXISTS grade TEXT;`);

    // Backfill graduation_date: approximate to 1st January of graduation_year for legacy records
    await safeQuery(`
      UPDATE qualifications 
      SET graduation_date = CONCAT(graduation_year, '-01-01')
      WHERE graduation_date IS NULL AND graduation_year IS NOT NULL;
    `);

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

    // 8. Grade Promotion Rules Table (سنوات الترفيع لكل درجة وظيفية)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS grade_promotion_rules (
        id SERIAL PRIMARY KEY,
        grade INTEGER UNIQUE NOT NULL,
        promotion_years INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      INSERT INTO grade_promotion_rules (grade, promotion_years, notes)
      VALUES 
        (1, NULL, 'قمة السلم الوظيفي - لا يوجد ترفيع أعلى'),
        (2, 5, 'الدرجة الثانية إلى الأولى'),
        (3, 5, 'الدرجة الثالثة إلى الثانية'),
        (4, 5, 'الدرجة الرابعة إلى الثالثة'),
        (5, 5, 'الدرجة الخامسة إلى الرابعة'),
        (6, 4, 'الدرجة السادسة إلى الخامسة'),
        (7, 4, 'الدرجة السابعة إلى السادسة'),
        (8, 4, 'الدرجة الثامنة إلى السابعة'),
        (9, 4, 'الدرجة التاسعة إلى الثامنة'),
        (10, 4, 'الدرجة العاشرة إلى التاسعة'),
        (11, NULL, 'درجة خاصة / عليا أ'),
        (12, NULL, 'درجة خاصة / عليا ب'),
        (13, NULL, 'درجة خاصة / عليا ج')
      ON CONFLICT (grade) DO NOTHING;
    `);

    // 9. Commendation Types Table (أنواع كتب الشكر والتقدير)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS commendation_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        credit_months INTEGER NOT NULL DEFAULT 1,
        status TEXT DEFAULT 'فعال',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      INSERT INTO commendation_types (name, credit_months, status, notes)
      VALUES 
        ('كتاب شكر وتقدير اعتيادي / مدير عام', 1, 'فعال', 'يمنح قدماً لمدة شهر واحد'),
        ('كتاب شكر وتقدير وزاري', 1, 'فعال', 'يمنح قدماً لمدة شهر واحد'),
        ('كتاب شكر وتقدير استثنائي (رئاسي / رئيس مجلس الوزراء)', 6, 'فعال', 'يمنح قدماً لمدة 6 أشهر')
      ON CONFLICT DO NOTHING;
    `);

    // أنواع الخدمة (قائمة قابلة للتوسيع من المستخدم، بلا تكرار)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS service_types (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`
      INSERT INTO service_types (name)
      VALUES ('دائم'), ('عقد'), ('أجر يومي')
      ON CONFLICT (name) DO NOTHING;
    `);

    // حالات الموظف (قائمة قابلة للتوسيع من المستخدم، بلا تكرار)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS employee_statuses (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`
      INSERT INTO employee_statuses (name)
      VALUES ('مستمر'), ('منسب'), ('مجاز'), ('متقاعد'), ('مستقيل'), ('موقوف')
      ON CONFLICT (name) DO NOTHING;
    `);

    // مراجعة صفحة الموظفين (31-08-2026): أرشيف المحذوفات (Soft Delete Archive)
    // بدلاً من حذف أي سجل نهائياً من النظام، يُنقل إلى هذا الجدول المركزي كنسخة كاملة (JSON)،
    // ليتمكن مدير النظام من استعراضه واستعادته أو تأكيد حذفه بشكل نهائي من نافذة الإعدادات.
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS archived_items (
        id SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        entity_label TEXT,
        data TEXT NOT NULL,
        deleted_by TEXT,
        deleted_by_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_archived_items_entity_type ON archived_items(entity_type);`);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_archived_items_created_at ON archived_items(created_at DESC);`);

    // 10. Employee Commendations Table (سجل كتب الشكر الممنوحة للموظفين)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS employee_commendations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        commendation_type_id INTEGER,
        credit_months_snapshot INTEGER NOT NULL DEFAULT 1,
        order_number TEXT,
        order_date TEXT,
        issuer TEXT,
        reason TEXT,
        is_hidden BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 11. Commendation Rules Settings Table (إعدادات وضوابط كتب الشكر)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS commendation_rules_settings (
        id SERIAL PRIMARY KEY,
        config_key TEXT UNIQUE NOT NULL DEFAULT 'default_commendation_rules',
        max_per_year INTEGER DEFAULT 3,
        allowed_combinations TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`
      INSERT INTO commendation_rules_settings (config_key, max_per_year, allowed_combinations)
      VALUES (
        'default_commendation_rules',
        3,
        '[{"label":"3 كتب عادية (شهر واحد)","maxCount":3,"creditMonths":1},{"label":"كتابان عاديان + كتاب استثنائي (6 أشهر)","maxCount":3,"rules":[{"count":2,"creditMonths":1},{"count":1,"creditMonths":6}]},{"label":"كتابان استثنائيان (6 أشهر)","maxCount":2,"rules":[{"count":2,"creditMonths":6}]}]'
      ) ON CONFLICT (config_key) DO NOTHING;
    `);

    // 12. Leave Types & Leave Requests Effect & FK Migration
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS administrative_effect TEXT DEFAULT 'لا_يؤثر';`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS financial_effect TEXT DEFAULT 'براتب_كامل';`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS financial_deduction_percentage INTEGER DEFAULT 0;`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS affects_increment BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS affects_promotion BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS affects_commendations BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS salary_payment_type TEXT DEFAULT 'full';`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS effects_options TEXT;`);
    await safeQuery(`ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await safeQuery(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS leave_type_id INTEGER;`);

    // Penalty Types columns
    await safeQuery(`ALTER TABLE penalty_types ADD COLUMN IF NOT EXISTS salary_deduction_days INTEGER DEFAULT 0;`);

    // Service Records columns
    await safeQuery(`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS years INTEGER DEFAULT 0;`);
    await safeQuery(`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS months INTEGER DEFAULT 0;`);
    await safeQuery(`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS days INTEGER DEFAULT 0;`);
    await safeQuery(`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'علاوة_وترفيع';`);
    await safeQuery(`ALTER TABLE service_records ADD COLUMN IF NOT EXISTS reason TEXT;`);

    // Backfill leave_type_id on matching name
    await safeQuery(`
      UPDATE leave_requests lr
      SET leave_type_id = lt.id
      FROM leave_types lt
      WHERE lr.leave_type_id IS NULL AND TRIM(lr.leave_type) = TRIM(lt.name);
    `);

    // مراجعة صفحة الموظفين (31-08-2026): جدول job_titles (دليل العناوين الوظيفية المعتمد)
    // كان بلا أمر CREATE TABLE إطلاقاً في هذا الملف (فقط أوامر ALTER التالية كانت تفترض وجوده
    // ضمناً)، ما يعني فشل تنصيب هذا الجدول بالكامل على أي قاعدة بيانات جديدة، وبالتبعية فشل
    // إنشاء degree_track_snapshots وما يعتمد عليها لأنها تشير إليه بمفتاح أجنبي عند إنشائها.
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS job_titles (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT DEFAULT 'عام',
        min_grade INTEGER DEFAULT 7,
        min_step INTEGER DEFAULT 1,
        next_title_id INTEGER,
        status TEXT DEFAULT 'فعال',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Job Titles career ladder migration
    await safeQuery(`ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS next_title_id INTEGER;`);

    // 14. Service Credits Table (احتساب الخدمة السابقة والمهنية والعسكرية المضافة)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS service_credits (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        credit_type TEXT NOT NULL,
        calculated_years INTEGER DEFAULT 0,
        calculated_months INTEGER DEFAULT 0,
        calculated_days INTEGER DEFAULT 0,
        order_number TEXT,
        order_date TEXT,
        purpose TEXT DEFAULT 'علاوة_وترفيع',
        is_counted_for_promotion BOOLEAN DEFAULT TRUE,
        is_counted_for_retirement BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 15. Job Titles min_step & Education Degrees Baseline Migration
    await safeQuery(`ALTER TABLE job_titles ADD COLUMN IF NOT EXISTS min_step INTEGER DEFAULT 1;`);
    await safeQuery(`ALTER TABLE education_degrees ADD COLUMN IF NOT EXISTS baseline_grade INTEGER DEFAULT 7;`);
    await safeQuery(`ALTER TABLE education_degrees ADD COLUMN IF NOT EXISTS baseline_step INTEGER DEFAULT 1;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS degree_track_auto_settlement BOOLEAN DEFAULT FALSE;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS reminder_days_course INTEGER DEFAULT 30;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS reminder_days_penalty INTEGER DEFAULT 15;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS reminder_days_leave INTEGER DEFAULT 30;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS reminder_days_evaluation INTEGER DEFAULT 30;`);
    await safeQuery(`ALTER TABLE commendation_rules_settings ADD COLUMN IF NOT EXISTS reminder_days_absence INTEGER DEFAULT 10;`);
    await safeQuery(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS degree_track_auto_settlement BOOLEAN DEFAULT FALSE;`);
    // System Settings Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        platform_name TEXT DEFAULT 'نظام إدارة شؤون الموظفين',
        beneficiary_name TEXT DEFAULT 'وزارة الموارد البشرية العراقية',
        copyright_text TEXT DEFAULT 'جميع الحقوق محفوظة © 2026',
        primary_color TEXT DEFAULT '#1B3A6B',
        secondary_color TEXT DEFAULT '#C8960C',
        active_theme TEXT DEFAULT 'أزرق ملكي',
        font_family TEXT DEFAULT 'Cairo',
        logo_url TEXT DEFAULT 'https://img.icons8.com/color/48/gender-neutral-user.png',
        work_start_hour TEXT DEFAULT '08:00',
        work_end_hour TEXT DEFAULT '15:00',
        official_holidays TEXT DEFAULT 'الجمعة, السبت',
        backup_frequency TEXT DEFAULT 'يومي',
        max_children_count INTEGER DEFAULT 4,
        retirement_age INTEGER DEFAULT 60,
        retirement_notification_period TEXT DEFAULT 'three_months',
        retirement_notification_days INTEGER DEFAULT 90,
        degree_track_auto_settlement BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Activity Logs Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        user_email TEXT NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Promotions and Increments Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS promotions_increments (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        movement_type TEXT NOT NULL,
        grade_before TEXT,
        grade_after TEXT,
        step_before INTEGER,
        step_after INTEGER,
        due_date TEXT NOT NULL,
        order_number TEXT,
        order_date TEXT,
        seniority_months INTEGER DEFAULT 0,
        seniority_reason TEXT,
        manager_recommendation TEXT,
        director_approval TEXT,
        approved_by TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Salary Allowances Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS salary_allowances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        base_salary TEXT,
        cost_of_living TEXT,
        position_allowance TEXT,
        degree_allowance TEXT,
        hazard_transport TEXT,
        university_technical TEXT,
        retirement_deduction TEXT,
        tax_deduction TEXT,
        insurance_deduction TEXT,
        loans_deduction TEXT,
        net_salary TEXT,
        bank_account TEXT,
        bank_name TEXT,
        allowance_type TEXT,
        percentage INTEGER,
        amount INTEGER,
        order_number TEXT,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Annual Evaluations Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS annual_evaluations (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        year INTEGER NOT NULL,
        grade TEXT NOT NULL,
        evaluation_authority TEXT,
        strengths TEXT,
        weaknesses TEXT,
        required_courses TEXT,
        employee_opinion TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Training Courses Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS training_courses (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        course_name TEXT NOT NULL,
        training_center TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        duration_days INTEGER DEFAULT 1,
        duration_hours INTEGER DEFAULT 0,
        grade TEXT,
        status TEXT DEFAULT 'ناجح',
        is_specialized BOOLEAN DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS course_type TEXT;`);
    await safeQuery(`ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS provider TEXT;`);
    await safeQuery(`ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS location TEXT;`);
    await safeQuery(`ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS average TEXT;`);
    await safeQuery(`ALTER TABLE training_courses ADD COLUMN IF NOT EXISTS rank TEXT;`);

    // Transfers Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS transfers (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        transfer_type TEXT NOT NULL,
        order_number TEXT,
        order_date TEXT,
        from_dept TEXT,
        to_dept TEXT,
        from_location TEXT,
        to_location TEXT,
        effective_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Retirements Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS retirements (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        retirement_type TEXT NOT NULL,
        order_number TEXT,
        order_date TEXT,
        effective_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Documents Table
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        title TEXT NOT NULL,
        document_type TEXT,
        file_path TEXT,
        upload_date TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await safeQuery(`ALTER TABLE promotions_increments ADD COLUMN IF NOT EXISTS approved_by TEXT;`);
    await safeQuery(`ALTER TABLE promotions_increments ADD COLUMN IF NOT EXISTS notes TEXT;`);

    // 16. Degree Track Snapshots Table (لقطة بدء عملية احتساب الشهادة أثناء الخدمة)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS degree_track_snapshots (
        id SERIAL PRIMARY KEY,
        qualification_id INTEGER REFERENCES qualifications(id) ON DELETE CASCADE NOT NULL,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL,
        actual_grade_before INTEGER NOT NULL,
        actual_step_before INTEGER NOT NULL,
        baseline_grade INTEGER NOT NULL DEFAULT 7,
        baseline_step INTEGER NOT NULL DEFAULT 1,
        graduation_date_used TEXT NOT NULL,
        order_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'نشط',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await safeQuery(`ALTER TABLE degree_track_snapshots ADD COLUMN IF NOT EXISTS job_title_id INTEGER REFERENCES job_titles(id) ON DELETE SET NULL;`);

    // 17. Degree Track Simulation Steps Table (سجل خطوات ترفيع المحاكاة للفترة المقضية)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS degree_track_simulation_steps (
        id SERIAL PRIMARY KEY,
        snapshot_id INTEGER REFERENCES degree_track_snapshots(id) ON DELETE CASCADE NOT NULL,
        from_grade INTEGER NOT NULL,
        to_grade INTEGER NOT NULL,
        computed_date TEXT NOT NULL,
        weeks_consumed INTEGER NOT NULL DEFAULT 2,
        is_bundled BOOLEAN DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'ممنوح_بالمحاكاة',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 18. Specialization Course Credits Table (رصيد أسابيع تدريب الاختصاص التراكمي)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS specialization_course_credits (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        snapshot_id INTEGER REFERENCES degree_track_snapshots(id) ON DELETE SET NULL,
        weeks INTEGER NOT NULL DEFAULT 1,
        course_date TEXT,
        course_name TEXT,
        provider TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 19. Promotion Delay Reasons Table (أسباب تأخير وتوقف الترقية والعلاوة والتذكيرات المدارة)
    await safeQuery(`
      CREATE TABLE IF NOT EXISTS promotion_delay_reasons (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        reason_type TEXT NOT NULL,
        description TEXT NOT NULL,
        affects TEXT NOT NULL DEFAULT 'كلاهما',
        is_hidden BOOLEAN DEFAULT FALSE,
        reminder_date TEXT,
        is_auto_reminder BOOLEAN DEFAULT TRUE,
        is_resolved BOOLEAN DEFAULT FALSE,
        resolved_at TEXT,
        source_reference_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
