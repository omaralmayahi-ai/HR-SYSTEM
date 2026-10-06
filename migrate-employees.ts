// migrate-employees.ts
// سكربت لنقل بيانات الموظفين والكيانات المرتبطة من النسخة الاحتياطية المحلية المشفرة إلى PostgreSQL

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { decryptData } from './src/lib/cryptoStorage.ts';
import { db, schema, pool } from './src/db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
  const DATA_FILE = path.resolve(process.cwd(), 'data', 'local_storage.json');

  if (!fs.existsSync(DATA_FILE)) {
    console.error('لم يُعثر على ملف النسخة الاحتياطية المحلية:', DATA_FILE);
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const decrypted = decryptData(raw);
  const state = JSON.parse(decrypted);
  const employeesData = state.inMemoryEmployees;

  if (!Array.isArray(employeesData) || employeesData.length === 0) {
    console.log('لا يوجد موظفون في النسخة الاحتياطية المحلية - لا شيء لنقله.');
    await pool.end();
    return;
  }

  // فحص أمان: تأكد أن جدول employees في PostgreSQL فارغ فعلاً قبل الإدراج
  const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(schema.employees);
  const existingCount = Number(cnt) || 0;
  if (existingCount > 0) {
    console.log(`جدول employees في PostgreSQL يحتوي بالفعل على ${existingCount} سجل.`);
  } else {
    console.log(`جاري نقل ${employeesData.length} موظف من النسخة الاحتياطية المحلية إلى PostgreSQL...`);

    let migrated = 0;
    let failed = 0;
    for (const emp of employeesData) {
      try {
        const cleanedEmp = {
          id: emp.id ? Number(emp.id) : undefined,
          employeeNumber: emp.employeeNumber || emp.employee_number || null,
          companyNumber: emp.companyNumber || emp.company_number || null,
          civilServiceNumber: emp.civilServiceNumber || emp.civil_service_number || null,
          fullName: emp.fullName || emp.full_name || '',
          firstName: emp.firstName || emp.first_name || null,
          fatherName: emp.fatherName || emp.father_name || null,
          grandfatherName: emp.grandfatherName || emp.grandfather_name || null,
          greatGrandfatherName: emp.greatGrandfatherName || emp.great_grandfather_name || null,
          surname: emp.surname || null,
          gender: emp.gender || null,
          birthDate: emp.birthDate || emp.birth_date || null,
          birthPlace: emp.birthPlace || emp.birth_place || null,
          nationality: emp.nationality || 'عراقي',
          ethnicity: emp.ethnicity || 'عربي',
          religion: emp.religion || 'مسلم',
          maritalStatus: emp.maritalStatus || emp.marital_status || 'أعزب',
          childrenCount: Number(emp.childrenCount ?? emp.children_count ?? 0),
          nationalId: emp.nationalId || emp.national_id || null,
          passportNumber: emp.passportNumber || emp.passport_number || null,
          bloodType: emp.bloodType || emp.blood_type || null,
          residenceCard: emp.residenceCard || emp.residence_card || null,
          rationCard: emp.rationCard || emp.ration_card || null,
          nationalityCert: emp.nationalityCert || emp.nationality_cert || null,
          phone: emp.phone || null,
          email: emp.email || null,
          address: emp.address || null,
          appointmentDate: emp.appointmentDate || emp.appointment_date || null,
          firstAppointmentDate: emp.firstAppointmentDate || emp.first_appointment_date || null,
          currentAppointmentDate: emp.currentAppointmentDate || emp.current_appointment_date || null,
          oilSectorStartDate: emp.oilSectorStartDate || emp.oil_sector_start_date || null,
          appointmentOrder: emp.appointmentOrder || emp.appointment_order || null,
          jobTitle: emp.jobTitle || emp.job_title || null,
          department: emp.department || null,
          section: emp.section || null,
          serviceType: emp.serviceType || emp.service_type || 'دائمي',
          grade: emp.grade != null && emp.grade !== '' ? Number(emp.grade) : null,
          step: emp.step != null && emp.step !== '' ? Number(emp.step) : null,
          gradeDate: emp.gradeDate || emp.grade_date || null,
          lastPromotionDate: emp.lastPromotionDate || emp.last_promotion_date || emp.gradeDate || emp.grade_date || null,
          lastIncrementDate: emp.lastIncrementDate || emp.last_increment_date || emp.gradeDate || emp.grade_date || null,
          nextPromotionDueDate: emp.nextPromotionDueDate || emp.next_promotion_due_date || null,
          nextIncrementDueDate: emp.nextIncrementDueDate || emp.next_increment_due_date || null,
          jobResponsibility: emp.jobResponsibility || emp.job_responsibility || null,
          deputyStatus: emp.deputyStatus || emp.deputy_status || null,
          primaryResponsibility: emp.primaryResponsibility || emp.primary_responsibility || null,
          actingResponsibility: emp.actingResponsibility || emp.acting_responsibility || null,
          deputyLevel: emp.deputyLevel || emp.deputy_level || null,
          serviceRecordNumber: emp.serviceRecordNumber || emp.service_record_number || null,
          employeeIdNumber: emp.employeeIdNumber || emp.employee_id_number || null,
          retirementNumber: emp.retirementNumber || emp.retirement_number || null,
          educationLevel: emp.educationLevel || emp.education_level || null,
          specialization: emp.specialization || null,
          university: emp.university || null,
          institution: emp.institution || null,
          graduationYear: emp.graduationYear != null && emp.graduationYear !== '' ? Number(emp.graduationYear) : null,
          educationOrder: emp.educationOrder || emp.education_order || null,
          evaluationOrder: emp.evaluationOrder || emp.evaluation_order || null,
          workLocation: emp.workLocation || emp.work_location || null,
          workNature: emp.workNature || emp.work_nature || 'مكتبي',
          workShiftType: emp.workShiftType || emp.work_shift_type || 'صباحي',
          shiftSystemId: emp.shiftSystemId != null && emp.shiftSystemId !== '' ? Number(emp.shiftSystemId) : null,
          shiftSystemName: emp.shiftSystemName || emp.shift_system_name || null,
          shiftWorkDays: Number(emp.shiftWorkDays ?? emp.shift_work_days ?? 0),
          shiftRestDays: Number(emp.shiftRestDays ?? emp.shift_rest_days ?? 0),
          status: emp.status || 'مستمر',
          statusOrderNumber: emp.statusOrderNumber || emp.status_order_number || null,
          statusOrderDate: emp.statusOrderDate || emp.status_order_date || null,
          statusNotes: emp.statusNotes || emp.status_notes || null,
          initialRegularLeaveBalance: Number(emp.initialRegularLeaveBalance ?? emp.initial_regular_leave_balance ?? 0),
          initialSickLeaveBalance: Number(emp.initialSickLeaveBalance ?? emp.initial_sick_leave_balance ?? 0),
          photo: emp.photo || null,
          securityClearanceNumber: emp.securityClearanceNumber || emp.security_clearance_number || null,
          securityClearanceDate: emp.securityClearanceDate || emp.security_clearance_date || null,
          retirementExtensionOrderNumber: emp.retirementExtensionOrderNumber || emp.retirement_extension_order_number || null,
          retirementExtensionOrderDate: emp.retirementExtensionOrderDate || emp.retirement_extension_order_date || null,
          retirementExtensionYears: Number(emp.retirementExtensionYears ?? emp.retirement_extension_years ?? 0),
          retirementExtensionMonths: Number(emp.retirementExtensionMonths ?? emp.retirement_extension_months ?? 0),
          retirementExtensionNote: emp.retirementExtensionNote || emp.retirement_extension_note || null,
          spouseNames: typeof emp.spouseNames === 'string' ? emp.spouseNames : (emp.spouse_names ? String(emp.spouse_names) : null),
          spousesData: typeof emp.spousesData === 'string' ? emp.spousesData : (emp.spouses_data ? String(emp.spouses_data) : null),
          childrenDetails: typeof emp.childrenDetails === 'string' ? emp.childrenDetails : (emp.children_details ? String(emp.children_details) : null),
          createdAt: emp.createdAt || emp.created_at ? new Date(emp.createdAt || emp.created_at) : new Date(),
        };

        await db.insert(schema.employees).values(cleanedEmp);
        migrated++;
      } catch (err: any) {
        failed++;
        console.error(`فشل نقل الموظف id=${emp.id} (${emp.fullName || ''}):`, err?.message);
      }
    }

    // إعادة ضبط تسلسل id التلقائي
    try {
      await pool.query(`SELECT setval('employees_id_seq', (SELECT COALESCE(MAX(id), 1) FROM employees))`);
    } catch (seqErr: any) {
      console.warn('تعذّر إعادة ضبط تسلسل id (غير حرج):', seqErr?.message);
    }

    console.log(`تم نقل ${migrated} من أصل ${employeesData.length} موظف بنجاح. (فشل: ${failed})`);
  }

  // فحص تحقق نهائي: عدد السجلات في PostgreSQL
  const [{ cnt: finalCount }] = await db.select({ cnt: sql<number>`count(*)` }).from(schema.employees);
  console.log(`العدد النهائي للموظفين في PostgreSQL الآن: ${finalCount}`);

  await pool.end();
}

main().catch((err) => {
  console.error('فشل سكربت النقل بالكامل:', err);
  process.exit(1);
});
