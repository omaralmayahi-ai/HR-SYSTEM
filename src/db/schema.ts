// src/db/schema.ts
import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Users table (Custom Username and Password)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email: text('email'),
  name: text('name'),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Employees table
export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  employeeNumber: text('employee_number'),
  companyNumber: text('company_number'), // رقم الشركة
  civilServiceNumber: text('civil_service_number'), // الرقم الوظيفي
  fullName: text('full_name').notNull(),
  surname: text('surname'), // اللقب
  gender: text('gender'),
  birthDate: text('birth_date'),
  birthPlace: text('birth_place'),
  nationality: text('nationality'),
  religion: text('religion'),
  maritalStatus: text('marital_status'),
  childrenCount: integer('children_count'),
  nationalId: text('national_id'),
  passportNumber: text('passport_number'), // رقم الجواز
  bloodType: text('blood_type'), // فصيلة الدم
  residenceCard: text('residence_card'),
  nationalityCert: text('nationality_cert'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  appointmentDate: text('appointment_date'),
  firstAppointmentDate: text('first_appointment_date'), // تاريخ أول تعيين
  currentAppointmentDate: text('current_appointment_date'), // تاريخ المباشرة الحالية
  appointmentOrder: text('appointment_order'),
  jobTitle: text('job_title'),
  department: text('department'),
  section: text('section'),
  serviceType: text('service_type'),
  grade: integer('grade'),
  step: integer('step'),
  gradeDate: text('grade_date'),
  jobResponsibility: text('job_responsibility'), // المسؤولية الوظيفية (قديمة، للإبقاء على التوافق)
  deputyStatus: text('deputy_status'), // صفة وكيل أول أو ثاني (قديمة)
  primaryResponsibility: text('primary_responsibility'), // المسؤولية الأساسية
  actingResponsibility: text('acting_responsibility'), // المسؤولية بالوكالة
  deputyLevel: text('deputy_level'), // درجة الوكيل (وكيل أول - وكيل ثاني)
  serviceRecordNumber: text('service_record_number'),
  employeeIdNumber: text('employee_id_number'),
  retirementNumber: text('retirement_number'),
  educationLevel: text('education_level'),
  specialization: text('specialization'),
  workLocation: text('work_location'), // موقع العمل (مثل المقر الرئيسي، الحقول النفطية، إلخ)
  workNature: text('work_nature').default('مكتبي'), // طبيعة العمل (مكتبي، ميداني)
  status: text('status').default('مستمر'),
  statusOrderNumber: text('status_order_number'),
  statusOrderDate: text('status_order_date'),
  statusNotes: text('status_notes'),
  initialRegularLeaveBalance: integer('initial_regular_leave_balance').default(0), // رصيد الإجازات الاعتيادية عند التسجيل
  initialSickLeaveBalance: integer('initial_sick_leave_balance').default(0), // رصيد الإجازات المرضية عند التسجيل
  photo: text('photo'), // الصورة الشخصية
  securityClearanceNumber: text('security_clearance_number'), // رقم التصريح الأمني
  securityClearanceDate: text('security_clearance_date'), // تاريخ التصريح الأمني
  retirementExtensionOrderNumber: text('retirement_extension_order_number'), // رقم أمر تمديد التقاعد
  retirementExtensionOrderDate: text('retirement_extension_order_date'), // تاريخ أمر تمديد التقاعد
  retirementExtensionYears: integer('retirement_extension_years').default(0), // سنوات التمديد
  retirementExtensionMonths: integer('retirement_extension_months').default(0), // أشهر التمديد
  retirementExtensionNote: text('retirement_extension_note'), // ملاحظة / سبب التأجيل
  createdAt: timestamp('created_at').defaultNow(),
});

// 3. Career Histories table
export const careerHistories = pgTable('career_histories', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  orderNumber: text('order_number'),
  orderDate: text('order_date'),
  actionType: text('action_type'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. Leave Requests table
export const leaveRequests = pgTable('leave_requests', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  leaveType: text('leave_type').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  daysCount: integer('days_count').notNull(),
  status: text('status').default('معلق'),
  remainingBalance: integer('remaining_balance'), // الرصيد المتبقي
  orderNumber: text('order_number'), // رقم أمر الموافقة
  medicalAttachment: text('medical_attachment'), // المرفق الطبي
  createdAt: timestamp('created_at').defaultNow(),
});

// 5. Penalties table
export const penalties = pgTable('penalties', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  penaltyType: text('penalty_type').notNull(),
  penaltyDate: text('penalty_date').notNull(),
  orderNumber: text('order_number'),
  reason: text('reason'),
  status: text('status').default('نافذ'),
  violation: text('violation'), // المخالفة
  legalArticle: text('legal_article'), // المادة القانونية
  committeeDecisionNumber: text('committee_decision_number'), // رقم قرار اللجنة
  decisionDate: text('decision_date'), // تاريخ القرار
  implementationDate: text('implementation_date'), // تاريخ التنفيذ
  appealStatus: text('appeal_status').default('لا يوجد'), // حالة الاعتراض: لا يوجد / قيد الطعن / مرفوض الطعن / مقبول الطعن
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. Performance Evaluations table
export const performanceEvaluations = pgTable('performance_evaluations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  year: text('year').notNull(),
  totalScore: integer('total_score').notNull(),
  grade: text('grade').notNull(),
  status: text('status').default('مرفوع للاعتماد'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. Trainings table
export const trainings = pgTable('trainings', {
  id: serial('id').primaryKey(),
  courseName: text('course_name').notNull(),
  courseType: text('course_type').notNull(),
  provider: text('provider'),
  location: text('location'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  hours: integer('hours'),
  days: integer('days'),
  orderNumber: text('order_number'),
  description: text('description'),
  status: text('status').default('مخطط'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. Training Enrollments table
export const trainingEnrollments = pgTable('training_enrollments', {
  id: serial('id').primaryKey(),
  trainingId: integer('training_id')
    .references(() => trainings.id, { onDelete: 'cascade' })
    .notNull(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  enrollmentDate: text('enrollment_date'),
  result: text('result').default('قيد التقييم'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. Salary Records table
export const salaryRecords = pgTable('salary_records', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  baseSalary: integer('base_salary').notNull(),
  totalAllowances: integer('total_allowances').notNull(),
  totalDeductions: integer('total_deductions').notNull(),
  netSalary: integer('net_salary').notNull(),
  status: text('status').default('مسودة'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9.5. Attendance table
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  date: text('date').notNull(),
  status: text('status').notNull(),
  checkIn: text('check_in'),
  checkOut: text('check_out'),
  lateMinutes: integer('late_minutes').default(0),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});


// --- Relationships Definition ---

export const usersRelations = relations(users, () => ({}));

export const employeesRelations = relations(employees, ({ many }) => ({
  careerHistories: many(careerHistories),
  leaveRequests: many(leaveRequests),
  penalties: many(penalties),
  performanceEvaluations: many(performanceEvaluations),
  trainingEnrollments: many(trainingEnrollments),
  salaryRecords: many(salaryRecords),
  attendance: many(attendance),
  qualifications: many(qualifications),
  jobAssignments: many(jobAssignments),
  promotionsIncrements: many(promotionsIncrements),
  salaryAllowances: many(salaryAllowances),
  annualEvaluations: many(annualEvaluations),
  trainingCourses: many(trainingCourses),
  transfers: many(transfers),
  retirements: many(retirements),
  documents: many(documents),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  employee: one(employees, {
    fields: [attendance.employeeId],
    references: [employees.id],
  }),
}));

export const careerHistoriesRelations = relations(careerHistories, ({ one }) => ({
  employee: one(employees, {
    fields: [careerHistories.employeeId],
    references: [employees.id],
  }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
}));

export const penaltiesRelations = relations(penalties, ({ one }) => ({
  employee: one(employees, {
    fields: [penalties.employeeId],
    references: [employees.id],
  }),
}));

export const performanceEvaluationsRelations = relations(performanceEvaluations, ({ one }) => ({
  employee: one(employees, {
    fields: [performanceEvaluations.employeeId],
    references: [employees.id],
  }),
}));

export const trainingsRelations = relations(trainings, ({ many }) => ({
  enrollments: many(trainingEnrollments),
}));

export const trainingEnrollmentsRelations = relations(trainingEnrollments, ({ one }) => ({
  training: one(trainings, {
    fields: [trainingEnrollments.trainingId],
    references: [trainings.id],
  }),
  employee: one(employees, {
    fields: [trainingEnrollments.employeeId],
    references: [employees.id],
  }),
}));

export const salaryRecordsRelations = relations(salaryRecords, ({ one }) => ({
  employee: one(employees, {
    fields: [salaryRecords.employeeId],
    references: [employees.id],
  }),
}));

// 10. System Settings table
export const systemSettings = pgTable('system_settings', {
  id: serial('id').primaryKey(),
  platformName: text('platform_name').default('نظام إدارة شؤون الموظفين'),
  beneficiaryName: text('beneficiary_name').default('وزارة الموارد البشرية العراقية'),
  copyrightText: text('copyright_text').default('جميع الحقوق محفوظة © 2026'),
  primaryColor: text('primary_color').default('#1B3A6B'),
  secondaryColor: text('secondary_color').default('#C8960C'),
  activeTheme: text('active_theme').default('أزرق ملكي'),
  fontFamily: text('font_family').default('Cairo'),
  logoUrl: text('logo_url').default('https://img.icons8.com/color/48/gender-neutral-user.png'),
  workStartHour: text('work_start_hour').default('08:00'),
  workEndHour: text('work_end_hour').default('15:00'),
  officialHolidays: text('official_holidays').default('الجمعة, السبت'),
  backupFrequency: text('backup_frequency').default('يومي'),
  maxChildrenCount: integer('max_children_count').default(4), // الحد الأقصى للأطفال لمنح المخصص
  retirementAge: integer('retirement_age').default(60), // السن القانونية للتقاعد
  retirementNotificationPeriod: text('retirement_notification_period').default('three_months'), // فترة إشعار التقاعد (month, three_months, etc)
  retirementNotificationDays: integer('retirement_notification_days').default(90), // فترة الإشعار بالأيام في حال مخصص
  createdAt: timestamp('created_at').defaultNow(),
});

// 11. Activity Logs table
export const activityLogs = pgTable('activity_logs', {
  id: serial('id').primaryKey(),
  action: text('action').notNull(),
  userEmail: text('user_email').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 12. Org Units table (Organizational structure)
export const orgUnits = pgTable('org_units', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // e.g., 'مدير عام', 'معاون مدير عام', 'هيئة', 'قسم مركزي', 'قسم', 'شعبة', 'وحدة'
  parentId: integer('parent_id'),
  managerId: integer('manager_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orgUnitsRelations = relations(orgUnits, ({ one }) => ({
  manager: one(users, {
    fields: [orgUnits.managerId],
    references: [users.id],
  }),
}));

// 13. Qualifications table
export const qualifications = pgTable('qualifications', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  level: text('level').notNull(), // ابتدائية / متوسطة / إعدادية / دبلوم / بكالوريوس / ماجستير / دكتوراه
  specialization: text('specialization'), // التخصص العام
  subSpecialization: text('sub_specialization'), // التخصص الدقيق
  university: text('university'), // اسم الجامعة أو الكلية
  country: text('country'), // بلد الدراسة
  graduationYear: integer('graduation_year').notNull(), // سنة التخرج
  average: text('average'), // المعدل
  grade: text('grade'), // التقدير: ضعيف / متوسط / جيد / جيد جداً / امتياز
  equationNumber: text('equation_number'), // رقم كتاب المعادلة/الاحتساب
  equationDate: text('equation_date'), // تاريخ كتاب المعادلة/الاحتساب
  createdAt: timestamp('created_at').defaultNow(),
});

export const qualificationsRelations = relations(qualifications, ({ one }) => ({
  employee: one(employees, {
    fields: [qualifications.employeeId],
    references: [employees.id],
  }),
}));

// 14. Job Assignments table
export const jobAssignments = pgTable('job_assignments', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  grade: text('grade').notNull(), // خاصة / الأولى ... العاشرة
  step: integer('step').notNull(), // 1 - 11
  jobTitle: text('job_title').notNull(), // العنوان الوظيفي
  division: text('division'), // الهيئة
  department: text('department'), // القسم
  section: text('section'), // الشعبة
  confirmationDate: text('confirmation_date').notNull(), // تاريخ التثبيت
  assignmentType: text('assignment_type').notNull(), // تعيين / نقل / إعادة تعيين
  orderNumber: text('order_number'), // رقم أمر التعيين
  orderDate: text('order_date'), // تاريخ أمر التعيين
  responsibility: text('responsibility').notNull(), // بلا مسؤولية / مسؤول وجبة / مسؤول وحدة / مسؤول شعبة / مدير قسم / مدير قسم مركزي / مدير هيئة / معاون مدير عام / مدير عام
  createdAt: timestamp('created_at').defaultNow(),
});

export const jobAssignmentsRelations = relations(jobAssignments, ({ one }) => ({
  employee: one(employees, {
    fields: [jobAssignments.employeeId],
    references: [employees.id],
  }),
}));

// 15. Promotions and Increments table
export const promotionsIncrements = pgTable('promotions_increments', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  movementType: text('movement_type').notNull(), // علاوة سنوية / ترفيع درجة
  gradeBefore: text('grade_before'),
  gradeAfter: text('grade_after'),
  stepBefore: integer('step_before'),
  stepAfter: integer('step_after'),
  dueDate: text('due_date').notNull(), // تاريخ الاستحقاق
  orderNumber: text('order_number'), // رقم الأمر الإداري
  orderDate: text('order_date'), // تاريخ الأمر الإداري
  seniorityMonths: integer('seniority_months'), // القدم الممنوح بالأشهر (1-12)
  seniorityReason: text('seniority_reason'), // سبب القدم: كتب الشكر والتقدير / إضافة خدمة / أخرى (مع تدوين ملاحظة)
  managerRecommendation: text('manager_recommendation'), // نعم / لا
  directorApproval: text('director_approval'), // نعم / لا
  createdAt: timestamp('created_at').defaultNow(),
});

export const promotionsIncrementsRelations = relations(promotionsIncrements, ({ one }) => ({
  employee: one(employees, {
    fields: [promotionsIncrements.employeeId],
    references: [employees.id],
  }),
}));

// 16. Salary Allowances table
export const salaryAllowances = pgTable('salary_allowances', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  baseSalary: text('base_salary'), // الراتب الاسمي
  costOfLiving: text('cost_of_living'), // مخصصات غلاء المعيشة
  positionAllowance: text('position_allowance'), // مخصصات منصب
  degreeAllowance: text('degree_allowance'), // مخصصات شهادة
  hazardTransport: text('hazard_transport'), // مخصصات خطورة نقل سكن
  universityTechnical: text('university_technical'), // مخصصات جامعية فنية
  retirementDeduction: text('retirement_deduction'), // استقطاع تقاعد
  taxDeduction: text('tax_deduction'), // استقطاع ضريبة دخل
  insuranceDeduction: text('insurance_deduction'), // استقطاع تأمين
  loansDeduction: text('loans_deduction'), // استقطاع سلف
  netSalary: text('net_salary'), // صافي الراتب (محسوب)
  bankAccount: text('bank_account'), // رقم الحساب المصرفي
  bankName: text('bank_name'), // اسم المصرف
  allowanceType: text('allowance_type'), // نوع المخصص المضاف
  percentage: integer('percentage'), // النسبة المئوية %
  amount: integer('amount'), // المبلغ الثابت
  orderNumber: text('order_number'), // رقم الأمر الإداري بالصرف
  status: text('status'), // الحالة (مستمر / موقوف)
  createdAt: timestamp('created_at').defaultNow(),
});

export const salaryAllowancesRelations = relations(salaryAllowances, ({ one }) => ({
  employee: one(employees, {
    fields: [salaryAllowances.employeeId],
    references: [employees.id],
  }),
}));

// 17. Annual Evaluation table
export const annualEvaluations = pgTable('annual_evaluations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  year: integer('year').notNull(),
  grade: text('grade').notNull(), // كفوء جداً / كفوء / متوسط / ضعيف
  evaluationAuthority: text('evaluation_authority'), // جهة التقييم
  strengths: text('strengths'), // نقاط القوة
  weaknesses: text('weaknesses'), // نقاط الضعف
  requiredCourses: text('required_courses'), // الدورات التي يحتاجها
  employeeOpinion: text('employee_opinion'), // رأي الموظف
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const annualEvaluationsRelations = relations(annualEvaluations, ({ one }) => ({
  employee: one(employees, {
    fields: [annualEvaluations.employeeId],
    references: [employees.id],
  }),
}));

// 18. Training Courses table (linked directly to Employee)
export const trainingCourses = pgTable('training_courses', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  courseName: text('course_name').notNull(),
  courseType: text('course_type').notNull(), // حضوري – الكتروني
  provider: text('provider').notNull(), // الجهة المنظمة
  location: text('location').notNull(), // داخل العراق / خارج العراق
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  durationDays: integer('duration_days').notNull(),
  average: text('average'), // المعدل (0.00 – 100.00)
  grade: text('grade'), // ممتاز / جيد جدا / جيد / متوسط / مقبول / ضعيف
  rank: text('rank'), // الأول – الثاني – الثالث - مشارك
  createdAt: timestamp('created_at').defaultNow(),
});

export const trainingCoursesRelations = relations(trainingCourses, ({ one }) => ({
  employee: one(employees, {
    fields: [trainingCourses.employeeId],
    references: [employees.id],
  }),
}));

// 19. Transfers table
export const transfers = pgTable('transfers', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  transferType: text('transfer_type').notNull(), // نقل داخلي / نقل خارجي / تنسيب داخلي / تنسيب خارجي
  fromEntity: text('from_entity').notNull(),
  toEntity: text('to_entity').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  orderNumber: text('order_number').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const transfersRelations = relations(transfers, ({ one }) => ({
  employee: one(employees, {
    fields: [transfers.employeeId],
    references: [employees.id],
  }),
}));

// 20. Retirement table
export const retirements = pgTable('retirements', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  retirementDate: text('retirement_date').notNull(),
  reason: text('reason').notNull(), // بلوغ السن القانونية / تقاعد اختياري / عجز / وفاة
  serviceDuration: text('service_duration'), // مدة الخدمة المحتسبة
  pensionAmount: text('pension_amount'), // الراتب التقاعدي
  pensionOrderNumber: text('pension_order_number'), // رقم كتاب دائرة التقاعد
  pensionOrderDate: text('pension_order_date'), // تاريخ كتاب دائرة التقاعد
  createdAt: timestamp('created_at').defaultNow(),
});

export const retirementsRelations = relations(retirements, ({ one }) => ({
  employee: one(employees, {
    fields: [retirements.employeeId],
    references: [employees.id],
  }),
}));

// 21. Documents table
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .references(() => employees.id, { onDelete: 'cascade' })
    .notNull(),
  docType: text('doc_type').notNull(), // هوية / جواز سفر / شهادة دراسية / عقد زواج / صورة شخصية / أمر تعييني / أخرى
  filePath: text('file_path').notNull(), // Base64 or uploaded URL
  entryDate: text('entry_date').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentsRelations = relations(documents, ({ one }) => ({
  employee: one(employees, {
    fields: [documents.employeeId],
    references: [employees.id],
  }),
}));

// 22. Salary Scale table
export const salaryScale = pgTable('salary_scale', {
  id: serial('id').primaryKey(),
  grade: integer('grade').notNull(), // الدرجة
  step: integer('step').notNull(), // المرحلة
  amount: integer('amount').notNull(), // مبلغ الراتب الاسمي
  createdAt: timestamp('created_at').defaultNow(),
});

// 23. Allowances and Deductions table
export const allowancesDeductions = pgTable('allowances_deductions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // الاسم (مثلاً: مخصصات شهادة، مخصصات منصب، استقطاع تقاعد)
  type: text('type').notNull(), // allowance (مخصصات) or deduction (استقطاع)
  calcType: text('calc_type').notNull(), // percentage (نسبة من الراتب الاسمي) or flat (مبلغ مقطوع)
  value: integer('value').notNull(), // قيمة النسبة أو المبلغ المقطوع
  status: text('status').default('فعال'), // فعال أو متوقف مؤقتاً
  createdAt: timestamp('created_at').defaultNow(),
});

// 24. Leave Types table
export const leaveTypes = pgTable('leave_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم الإجازة (مثلاً: اعتيادية، مرضية، دراسية)
  maxDays: integer('max_days'), // الحد الأقصى للأيام المسموح بها في السنة (اختياري)
  description: text('description'), // وصف الإجازة أو الشروط
  status: text('status').default('فعال'), // فعال أو متوقف مؤقتاً
  createdAt: timestamp('created_at').defaultNow(),
});

// 25. Work Locations table (مواقع الشركة)
export const workLocations = pgTable('work_locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم موقع العمل
  allowanceAmount: integer('allowance_amount').default(0), // مخصصات الموقع الجغرافي أو النامي
  workStartHour: text('work_start_hour').default('08:00'), // وقت بدء الدوام
  workEndHour: text('work_end_hour').default('15:00'), // وقت نهاية الدوام
  createdAt: timestamp('created_at').defaultNow(),
});

// 26. Education Degrees table (الشهادات والتحصيل الدراسي ومخصصاتها المئوية)
export const educationDegrees = pgTable('education_degrees', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم الشهادة (مثلاً: بكالوريوس، ماجستير)
  isHigherEducation: boolean('is_higher_education').default(false), // هل هي شهادة عليا؟
  allowanceRate: integer('allowance_rate').default(0), // نسبة مخصص الشهادة (مثلاً: 45 تعني 45%)
  higherAllowanceRate: integer('higher_allowance_rate').default(0), // نسبة مخصص الشهادة العليا الإضافي (مثلاً: 50 تعني 50%)
  createdAt: timestamp('created_at').defaultNow(),
});

// 27. Responsibility Allowances table (مخصصات المسؤولية / المناصب ونسبها المئوية)
export const responsibilityAllowances = pgTable('responsibility_allowances', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم المسؤولية / المنصب (مثلاً: مدير عام، رئيس قسم)
  allowanceRate: integer('allowance_rate').default(0), // نسبة مخصص المنصب والمسؤولية (مثلاً: 25 تعني 25%)
  createdAt: timestamp('created_at').defaultNow(),
});


