// src/db/schema.ts
import { relations, sql } from 'drizzle-orm';
import { boolean, date, foreignKey, index, integer, jsonb, numeric, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// 1. Users table (Custom Username and Password)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique('users_username_key'),
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
  companyNumber: text('company_number').unique(), // رقم الشركة - معرّف فريد إلزامي (6 أرقام، أو حروف لعقد/أجر يومي)
  civilServiceNumber: text('civil_service_number'), // الرقم الوظيفي (رقم وزارة التخطيط) — غير مفروض فريداً في القاعدة (قرار 2026-11-09)؛ المعرّف الموثوق هو رقم الشركة
  fullName: text('full_name').notNull(),
  firstName: text('first_name'), // الاسم الأول
  fatherName: text('father_name'), // اسم الأب
  grandfatherName: text('grandfather_name'), // اسم الجد
  greatGrandfatherName: text('great_grandfather_name'), // اسم والد الجد / الاسم الرابع
  surname: text('surname'), // اللقب
  gender: text('gender'),
  birthDate: text('birth_date'),
  birthPlace: text('birth_place'),
  nationality: text('nationality'),
  ethnicity: text('ethnicity'), // القومية
  religion: text('religion'),
  maritalStatus: text('marital_status'),
  childrenCount: integer('children_count').default(0),
  nationalId: text('national_id'),
  passportNumber: text('passport_number'), // رقم الجواز
  bloodType: text('blood_type'), // فصيلة الدم
  residenceCard: text('residence_card'),
  rationCard: text('ration_card'), // البطاقة التموينية
  nationalityCert: text('nationality_cert'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  appointmentDate: text('appointment_date'),
  firstAppointmentDate: text('first_appointment_date'), // تاريخ أول تعيين
  currentAppointmentDate: text('current_appointment_date'), // تاريخ المباشرة الحالية
  oilSectorStartDate: text('oil_sector_start_date'), // تاريخ العمل في القطاع النفطي
  appointmentOrder: text('appointment_order'),
  jobTitle: text('job_title'),
  department: text('department'),
  section: text('section'),
  serviceType: text('service_type'),
  contractType: text('contract_type'), // B8a0: نوع العقد (لفئة الرواتب، ق-1)
  freeTransport: boolean('free_transport'), // B8a0: مشمول بالنقل المجاني (شرط مخصص الموقع، ت5)
  riskExposure: text('risk_exposure'), // B8a0: التعرّض للخطورة (عمل/موقع بقرار، ت6)
  familyMode: text('family_mode'), // B8a1: نمط الاستحقاق العائلي (كامل / الأطفال فقط / محجوب / لا يستحق) — فارغ = لم يُحدد
  grade: integer('grade'),
  step: integer('step'),
  gradeDate: text('grade_date'),
  lastPromotionDate: text('last_promotion_date'), // تاريخ آخر ترفيع فعلي للدرجة
  lastIncrementDate: text('last_increment_date'), // تاريخ آخر علاوة سنوية للمرحلة
  nextPromotionDueDate: text('next_promotion_due_date'), // تاريخ استحقاق الترفيع القادم (يحسب لاحقاً من محرك الاستحقاق)
  nextIncrementDueDate: text('next_increment_due_date'), // تاريخ استحقاق العلاوة القادمة (يحسب لاحقاً من محرك الاستحقاق)
  jobResponsibility: text('job_responsibility'), // المسؤولية الوظيفية (قديمة، للإبقاء على التوافق)
  deputyStatus: text('deputy_status'), // صفة وكيل أول أو ثاني (قديمة)
  primaryResponsibility: text('primary_responsibility'), // المسؤولية الأساسية
  actingResponsibility: text('acting_responsibility'), // المسؤولية بالوكالة
  deputyLevel: text('deputy_level'), // درجة الوكيل (وكيل أول - وكيل ثاني)
  serviceRecordNumber: text('service_record_number'),
  employeeIdNumber: text('employee_id_number').unique(), // رقم هوية الموظف - يُنشأ تلقائياً من الخادم، رقم فريد، يُدرج ضمن الهوية الرقمية للموظف
  retirementNumber: text('retirement_number'),
  educationLevel: text('education_level'),
  specialization: text('specialization'),
  university: text('university'),
  institution: text('institution'),
  graduationYear: integer('graduation_year'),
  educationOrder: text('education_order'),
  evaluationOrder: text('evaluation_order'),
  orgUnitId: integer('org_unit_id'), // B5: الوحدة التنظيمية (department/section نصوص عرض مشتقة منها)
  workLocation: text('work_location'), // موقع العمل (مثل المقر الرئيسي، الحقول النفطية، إلخ)
  workNature: text('work_nature').default('مكتبي'), // طبيعة العمل (مكتبي، ميداني)
  workShiftType: text('work_shift_type').default('صباحي'), // نوع عمل الموظف (صباحي، مناوب)
  shiftSystemId: integer('shift_system_id'), // معرّف نظام المناوبة المختار
  shiftSystemName: text('shift_system_name'), // اسم نظام المناوبة المختار
  shiftWorkDays: integer('shift_work_days').default(0), // عدد أيام الدوام
  shiftRestDays: integer('shift_rest_days').default(0), // عدد أيام الاستراحة
  status: text('status').default('مستمر'),
  statusOrderNumber: text('status_order_number'),
  statusOrderDate: text('status_order_date'),
  statusNotes: text('status_notes'),
  initialRegularLeaveBalance: real('initial_regular_leave_balance').default(0), // رصيد الإجازات الاعتيادية عند التسجيل
  initialSickLeaveBalance: real('initial_sick_leave_balance').default(0), // رصيد الإجازات المرضية عند التسجيل
  photo: text('photo'), // الصورة الشخصية
  securityClearanceNumber: text('security_clearance_number'), // رقم التصريح الأمني
  securityClearanceDate: text('security_clearance_date'), // تاريخ التصريح الأمني
  retirementExtensionOrderNumber: text('retirement_extension_order_number'), // رقم أمر تمديد التقاعد
  retirementExtensionOrderDate: text('retirement_extension_order_date'), // تاريخ أمر تمديد التقاعد
  retirementExtensionYears: integer('retirement_extension_years').default(0), // سنوات التمديد
  retirementExtensionMonths: integer('retirement_extension_months').default(0), // أشهر التمديد
  retirementExtensionNote: text('retirement_extension_note'), // ملاحظة / سبب التأجيل
  spouseNames: text('spouse_names'), // أسماء الزوجات
  spousesData: text('spouses_data'), // بيانات الزوجات المفصلة (JSON)
  childrenDetails: text('children_details'), // بيانات وتفاصيل الأطفال (الاسم، تاريخ الميلاد، الجنس) (JSON)
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_employees_department').on(t.department),
  index('idx_employees_education_level').on(t.educationLevel),
  index('idx_employees_ethnicity').on(t.ethnicity),
  index('idx_employees_full_name').on(t.fullName),
  index('idx_employees_gender').on(t.gender),
  index('idx_employees_grade').on(t.grade),
  index('idx_employees_job_title').on(t.jobTitle),
  index('idx_employees_marital_status').on(t.maritalStatus),
  index('idx_employees_primary_responsibility').on(t.primaryResponsibility),
  index('idx_employees_religion').on(t.religion),
  index('idx_employees_section').on(t.section),
  index('idx_employees_service_type').on(t.serviceType),
  index('idx_employees_shift_system_id').on(t.shiftSystemId),
  index('idx_employees_status').on(t.status),
  index('idx_employees_step').on(t.step),
  index('idx_employees_work_location').on(t.workLocation),
  index('idx_employees_work_shift_type').on(t.workShiftType),
  index('idx_employees_created_at').on(t.createdAt),
  index('idx_employees_full_name_trgm').using('gin', t.fullName.op('gin_trgm_ops')),
  index('idx_employees_civil_service_number_trgm').using('gin', t.civilServiceNumber.op('gin_trgm_ops')),
  index('idx_employees_service_record_number_trgm').using('gin', t.serviceRecordNumber.op('gin_trgm_ops')),
]);

// 3. Career Histories table
export const careerHistories = pgTable('career_histories', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
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
    .notNull(),
  leaveTypeId: integer('leave_type_id'),
  leaveType: text('leave_type').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  daysCount: integer('days_count').notNull(),
  status: text('status').default('معلق'),
  remainingBalance: integer('remaining_balance'), // الرصيد المتبقي
  orderNumber: text('order_number'), // رقم أمر الموافقة
  medicalAttachment: text('medical_attachment'), // المرفق الطبي
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'leave_requests_leave_type_id_fkey', columns: [t.leaveTypeId], foreignColumns: [leaveTypes.id] }).onDelete('set null'),
]);

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  employee: one(employees, {
    fields: [leaveRequests.employeeId],
    references: [employees.id],
  }),
  leaveTypeRef: one(leaveTypes, {
    fields: [leaveRequests.leaveTypeId],
    references: [leaveTypes.id],
  }),
}));

// 5. Penalties table
export const penalties = pgTable('penalties', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
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
  daysCount: integer('days_count'), // عدد أيام القطع (لعقوبة قطع الراتب: م8/ثالثاً)
  createdAt: timestamp('created_at').defaultNow(),
  // B7: لقطة أشهر التأخير وقت فرض العقوبة (تعديل أنواع العقوبات لاحقاً ما يغيّر الماضي)
  delayMonths: integer('delay_months'),
  // B7 (ق-10): الإلغاء بأمر إداري
  cancelOrderNumber: text('cancel_order_number'),
  cancelOrderDate: text('cancel_order_date'),
  cancelReason: text('cancel_reason'),
});

// Appreciations / Thank You Letters table (كتب الشكر والتقدير)
export const appreciations = pgTable('appreciations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  orderNumber: text('order_number').notNull(),
  orderDate: text('order_date').notNull(),
  issuer: text('issuer'), // جهة الإصدار (الوزير، المدير العام، الشركة...)
  reason: text('reason'), // سبب كتاب الشكر
  seniorityImpact: text('seniority_impact').default('قدم شهر واحد'), // أثر القدم (قدم شهر واحد / قدم شهرين / معنوي)
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 6. Performance Evaluations table
export const performanceEvaluations = pgTable('performance_evaluations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  year: text('year').notNull(),
  totalScore: integer('total_score').default(0),
  grade: text('grade').default('بانتظار التقييم'),
  formId: integer('form_id'),
  formTitle: text('form_title'),
  scoresJson: text('scores_json'), // Latching score snapshot & structure
  evaluator: text('evaluator'),
  evaluationOrder: text('evaluation_order'),
  evaluationDate: text('evaluation_date'),
  weaknesses: text('weaknesses'),
  strengths: text('strengths'),
  trainingNeeds: text('training_needs'),
  employeeOpinion: text('employee_opinion'),
  notes: text('notes'),
  status: text('status').default('مرفوع للاعتماد'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 7. Trainers table (دليل المدربين)
export const trainers = pgTable('trainers', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id'),
  employeeCode: text('employee_code'),
  fullName: text('full_name').notNull(),
  trainerCode: text('trainer_code'), // كود المدرب عند الاعتماد
  courseCategories: text('course_categories'), // طبيعة الدورات (إدارية، حاسوب، HSE، اختصاص)
  specialtyDetails: text('specialty_details'), // طبيعة الاختصاص (إذا تم اختيار اختصاص)
  specialization: text('specialization'), // التخصص العام والخبرة
  trainerType: text('trainer_type').default('داخلي'), // 'داخلي' أو 'خارجي'
  organization: text('organization'), // الجهة / الشركة / المعهد
  phone: text('phone'), // رقم الهاتف المحمول
  workPhone: text('work_phone'), // رقم هاتف العمل
  email: text('email'),
  status: text('status').default('معتمد'), // 'معتمد', 'قيد الاعتماد', 'محظور'
  rating: text('rating'), // تقييم المدرب
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 8. Annual Training Plans table (خطط التدريب السنوية)
export const annualTrainingPlans = pgTable('annual_training_plans', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(), // السنة (2024, 2025, 2026, إلخ)
  track: text('track').notNull(), // 'تدريب داخلي', 'تدريب خارجي وإيفادات', 'تدريب صيفي'
  plannedCoursesCount: integer('planned_courses_count').default(0), // عدد الدورات المخطط
  plannedTraineesCount: integer('planned_trainees_count').default(0), // عدد المتدربين المخطط
  plannedBudget: integer('planned_budget').default(0), // الميزانية المخططة
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. Trainings table (جدول الدورات والإيفادات والتدريب الصيفي)
export const trainings = pgTable('trainings', {
  id: serial('id').primaryKey(),
  year: integer('year').default(2026),
  track: text('track').default('تدريب داخلي'), // 'تدريب داخلي', 'تدريب خارجي وإيفادات', 'تدريب صيفي'
  courseName: text('course_name').notNull(),
  category: text('category').default('إدارية'), // 'إدارية', 'حاسوب', 'اختصاص', 'HSE'
  courseType: text('course_type').default('حضوري'), // 'حضوري', 'إلكتروني'
  locationType: text('location_type').default('موقعي'), // 'موقعي', 'خارجي', 'دولي'
  location: text('location'), // تفاصيل المكان (المقر، المعهد النفطي، إلخ)
  country: text('country'), // الدولة (للتدريب الخارجي)
  provider: text('provider'), // الجهة المنفذة / الجامعة للتدريب الصيفي
  trainerId: integer('trainer_id'), // مرجع المدرب (اختياري)
  trainerName: text('trainer_name'), // اسم المدرب (للتوافق والسهولة)
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  hours: integer('hours').default(0),
  days: integer('days').default(1),
  orderNumber: text('order_number'), // رقم الأمر الإداري / كتاب الإيفاد
  courseCode: text('course_code'), // رمز الدورة
  isOutsidePlan: boolean('is_outside_plan').default(false), // هل الدورة خارج الخطة؟
  targetAudience: text('target_audience'), // الفئة المستهدفة (الدرجات الوظيفية)
  durationValue: integer('duration_value').default(1), // مدة الدورة (قيمة عدشية)
  durationUnit: text('duration_unit').default('بالأيام'), // مدة الدورة (بالأيام - بالأسابيع - بالأشهر)
  outsidePlanReason: text('outside_plan_reason'), // سبب إنشاء دورة تدريبية خارج الخطة
  trainerRating: text('trainer_rating'), // تقييم المتدربين للمدرب
  courseFeedback: text('course_feedback'), // الملاحظات والتقييم للبرنامج التدريبي
  description: text('description'), // الوصف والأهداف
  status: text('status').default('مخطط'), // 'مخطط', 'جاري', 'منتهي', 'ملغى'
  createdAt: timestamp('created_at').defaultNow(),
});

// 10. Training Enrollments table (جدول تسجيل المتدربين والنتائج)
export const trainingEnrollments = pgTable('training_enrollments', {
  id: serial('id').primaryKey(),
  trainingId: integer('training_id')
    .notNull(),
  employeeId: integer('employee_id'), // غير إجباري ليتيح تسجيل المتدربين الخارجيين والطلاب
  isExternalParticipant: boolean('is_external_participant').default(false), // هل المشارك خارجي / طالب؟
  externalParticipantName: text('external_participant_name'), // اسم المشارك الخارجي / الطالب
  externalParticipantEntity: text('external_participant_entity'), // الجهة الخارجية / الجامعة
  externalParticipantPhone: text('external_participant_phone'), // رقم هاتف المشارك الخارجي
  enrollmentDate: text('enrollment_date'),
  result: text('result').default('قيد التقييم'), // 'اجتاز', 'لم يجتز', 'مشارك', 'انسحب', 'قيد التقييم'
  score: text('score'), // الدرجة المئوية (مثل: 85%)
  grade: text('grade'), // التقدير (ممتاز، جيد جداً، إلخ)
  certificateNumber: text('certificate_number'), // رقم شهادة المشاركة
  certificateType: text('certificate_type'), // 'شهادة مشاركة' أو 'شهادة اجتياز'
  certificateIssueDate: text('certificate_issue_date'), // تاريخ استصدار الشهادة
  trainerRating: text('trainer_rating'), // تقييم المتدرب للمدرب
  courseFeedback: text('course_feedback'), // ملاحظات المتدرب على البرنامج
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 9. Salary Records table
export const salaryRecords = pgTable('salary_records', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  baseSalary: integer('base_salary').notNull(),
  totalAllowances: integer('total_allowances').default(0),
  totalDeductions: integer('total_deductions').default(0),
  netSalary: integer('net_salary').notNull(),
  status: text('status').default('مسودة'),
  createdAt: timestamp('created_at').defaultNow(),
  allowancesBreakdown: text('allowances_breakdown'),
  deductionsBreakdown: text('deductions_breakdown'),
  paymentDate: text('payment_date'),
  paymentStatus: text('payment_status').default('مسودة'),
});

// 9.5. Attendance table
export const attendance = pgTable('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
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
  appreciations: many(appreciations),
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

export const penaltiesRelations = relations(penalties, ({ one }) => ({
  employee: one(employees, {
    fields: [penalties.employeeId],
    references: [employees.id],
  }),
}));

export const appreciationsRelations = relations(appreciations, ({ one }) => ({
  employee: one(employees, {
    fields: [appreciations.employeeId],
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
  degreeTrackAutoSettlement: boolean('degree_track_auto_settlement').default(false), // تفعيل التسوية التلقائية لمسار احتساب الشهادات
  monthlyRegularLeaveDays: real('monthly_regular_leave_days').default(3), // م43: يوم عن كل 10 أيام خدمة = 3 أيام شهرياً
  monthlySickLeaveDays: real('monthly_sick_leave_days').default(2.5),
  maxRegularLeaveAccumulation: real('max_regular_leave_accumulation').default(180),
  maxSickLeaveAccumulation: real('max_sick_leave_accumulation').default(180),
  autoMonthlyLeaveAccrual: boolean('auto_monthly_leave_accrual').default(true),
  lastLeaveAccrualMonth: text('last_leave_accrual_month').default(''),
  lastLeaveAccrualDate: text('last_leave_accrual_date').default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

// 10-ب. سجل الترحيل الشهري للإجازات: صف واحد لكل شهر (يمنع تكرار الترحيل على مستوى قاعدة البيانات)
export const leaveAccrualRuns = pgTable('leave_accrual_runs', {
  month: text('month').primaryKey(), // YYYY-MM
  executedAt: timestamp('executed_at').defaultNow(),
  employeesCount: integer('employees_count').default(0),
  regularDaysAdded: real('regular_days_added').notNull(),
  sickDaysAdded: real('sick_days_added').notNull(),
  triggeredBy: text('triggered_by'),
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
  code: text('code'),
  description: text('description'),
  englishName: text('english_name'), // B1b: موجود في قاعدة التشغيل (24 وحدة فيها قيمة)
  isCentral: boolean('is_central').default(false), // B1b: موجود في قاعدة التشغيل (26 وحدة مركزية)
  // B5: تواريخ النفاذ بدل الحذف؛ valid_to فارغ = قائمة
  validFrom: date('valid_from', { mode: 'string' }),
  validTo: date('valid_to', { mode: 'string' }),
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
    .notNull(),
  level: text('level').notNull(), // ابتدائية / متوسطة / إعدادية / دبلوم / بكالوريوس / ماجستير / دكتوراه
  specialization: text('specialization'), // التخصص العام
  subSpecialization: text('sub_specialization'), // التخصص الدقيق
  university: text('university'), // اسم الجامعة أو الكلية
  country: text('country'), // بلد الدراسة
  graduationYear: integer('graduation_year'), // سنة التخرج
  graduationDate: text('graduation_date'), // تاريخ التخرج الكامل (YYYY-MM-DD)
  qualificationType: text('qualification_type'), // نوع الشهادة: 'تعيين' أو 'أثناء الخدمة'
  average: text('average'), // المعدل
  grade: text('grade'), // التقدير: ضعيف / متوسط / جيد / جيد جداً / امتياز
  equationNumber: text('equation_number'), // رقم كتاب المعادلة/الاحتساب
  equationDate: text('equation_date'), // تاريخ كتاب المعادلة/الاحتساب
  isActive: boolean('is_active').default(true), // حالة الشهادة: مفعلة أو معطلة
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
    .notNull(),
  grade: text('grade'), // خاصة / الأولى ... العاشرة
  step: integer('step'), // 1 - 11
  jobTitle: text('job_title'), // العنوان الوظيفي
  division: text('division'), // الهيئة
  department: text('department'), // القسم
  section: text('section'), // الشعبة
  confirmationDate: text('confirmation_date'), // تاريخ التثبيت
  assignmentType: text('assignment_type').default('تكليف'), // تكليف / إعفاء / تدوير / تعيين / نقل
  actionType: text('action_type').default('تكليف'), // تكليف / إعفاء / تدوير
  orderNumber: text('order_number'), // رقم الأمر الإداري
  orderDate: text('order_date'), // تاريخ الأمر الإداري
  assignmentOrder: text('assignment_order'), // رقم أمر التكليف
  assignmentDate: text('assignment_date'), // تاريخ التكليف
  responsibility: text('responsibility'), // المسؤولية
  primaryResponsibility: text('primary_responsibility'), // المسؤولية الأساسية
  actingResponsibility: text('acting_responsibility'), // المسؤولية بالوكالة
  actingEndDate: text('acting_end_date'), // تاريخ انتهاء التكليف بالوكالة (اختياري)
  deputyLevel: text('deputy_level'), // درجة الوكيل (وكيل أول / وكيل ثاني / لا يوجد)
  serviceType: text('service_type').default('دائم'), // دائم / مؤقت / عقد / إعارة
  notes: text('notes'),
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
    .notNull(),
  movementType: text('movement_type').notNull(), // علاوة سنوية / ترفيع درجة
  gradeBefore: text('grade_before'),
  gradeAfter: text('grade_after'),
  stepBefore: integer('step_before'),
  stepAfter: integer('step_after'),
  dueDate: text('due_date').notNull(), // تاريخ الاستحقاق
  orderNumber: text('order_number'), // رقم الأمر الإداري
  orderDate: text('order_date'), // تاريخ الأمر الإداري
  seniorityMonths: integer('seniority_months').default(0), // القدم الممنوح بالأشهر (1-12)
  seniorityReason: text('seniority_reason'), // سبب القدم: كتب الشكر والتقدير / إضافة خدمة / أخرى (مع تدوين ملاحظة)
  managerRecommendation: text('manager_recommendation'), // نعم / لا
  directorApproval: text('director_approval'), // نعم / لا
  approvedBy: text('approved_by'), // جهة أو نظام الاعتماد (مثال: نظام آلي — تسوية تلقائية)
  notes: text('notes'), // ملاحظات التسوية أو الترفيع
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'promotions_increments_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
  percentage: real('percentage'), // النسبة المئوية % (real: تقبل الكسور مثل 2.5)
  amount: real('amount'), // المبلغ الثابت (real مطابقة لقاعدة التشغيل)
  orderNumber: text('order_number'), // رقم الأمر الإداري بالصرف
  status: text('status'), // الحالة (مستمر / موقوف)
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'salary_allowances_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
}, (t) => [
  foreignKey({ name: 'annual_evaluations_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
    .notNull(),
  courseName: text('course_name').notNull(),
  courseType: text('course_type'), // حضوري – الكتروني
  provider: text('provider'), // الجهة المنظمة
  location: text('location'), // داخل العراق / خارج العراق
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  durationDays: integer('duration_days').default(1),
  average: text('average'), // المعدل (0.00 – 100.00)
  grade: text('grade'), // ممتاز / جيد جدا / جيد / متوسط / مقبول / ضعيف
  rank: text('rank'), // الأول – الثاني – الثالث - مشارك
  sourceTrainingId: integer('source_training_id'), // الدورة في موديول التدريب التي وُلِّد منها السجل (للمزامنة بلا تكرار)
  createdAt: timestamp('created_at').defaultNow(),
  durationHours: integer('duration_hours').default(0),
  isSpecialized: boolean('is_specialized').default(false),
  trainingCenter: text('training_center'),
  status: text('status').default('ناجح'),
  notes: text('notes'),
}, (t) => [
  uniqueIndex('training_courses_emp_source_training_uq').on(t.employeeId, t.sourceTrainingId).where(sql`source_training_id IS NOT NULL`),
  foreignKey({ name: 'training_courses_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
    .notNull(),
  transferType: text('transfer_type').notNull(), // نقل داخلي / نقل خارجي / تنسيب داخلي / تنسيب خارجي
  fromEntity: text('from_entity'),
  toEntity: text('to_entity'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  orderNumber: text('order_number'),
  createdAt: timestamp('created_at').defaultNow(),
  fromDept: text('from_dept'),
  toDept: text('to_dept'),
  fromLocation: text('from_location'),
  toLocation: text('to_location'),
  orderDate: text('order_date'),
  effectiveDate: text('effective_date'),
  notes: text('notes'),
}, (t) => [
  foreignKey({ name: 'transfers_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
    .notNull(),
  retirementDate: text('retirement_date'),
  reason: text('reason'), // بلوغ السن القانونية / تقاعد اختياري / عجز / وفاة
  serviceDuration: text('service_duration'), // مدة الخدمة المحتسبة
  pensionAmount: text('pension_amount'), // الراتب التقاعدي
  pensionOrderNumber: text('pension_order_number'), // رقم كتاب دائرة التقاعد
  pensionOrderDate: text('pension_order_date'), // تاريخ كتاب دائرة التقاعد
  createdAt: timestamp('created_at').defaultNow(),
  retirementType: text('retirement_type').notNull(),
  effectiveDate: text('effective_date'),
  orderNumber: text('order_number'),
  orderDate: text('order_date'),
  notes: text('notes'),
}, (t) => [
  foreignKey({ name: 'retirements_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

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
    .notNull(),
  docType: text('doc_type'), // هوية / جواز سفر / شهادة دراسية / عقد زواج / صورة شخصية / أمر تعييني / أخرى
  filePath: text('file_path'), // Base64 or uploaded URL
  entryDate: text('entry_date'),
  createdAt: timestamp('created_at').defaultNow(),
  documentType: text('document_type'), // B1: موجود في القاعدة الفعلية (ensureSchema)
  title: text('title').notNull(),
  notes: text('notes'),
  uploadDate: text('upload_date'),
}, (t) => [
  foreignKey({ name: 'documents_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

export const documentsRelations = relations(documents, ({ one }) => ({
  employee: one(employees, {
    fields: [documents.employeeId],
    references: [employees.id],
  }),
}));

// 22. Salary Scale table
// B4d (ق-5): سلّم الرواتب بإصدارات؛ إصدار واحد نافذ، وكل إصدار قابل للتعديل
export const salaryScaleVersions = pgTable('salary_scale_versions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique('salary_scale_versions_name_key'),
  legalBasis: text('legal_basis'), // السند القانوني
  effectiveFrom: date('effective_from', { mode: 'string' }),
  isActive: boolean('is_active').notNull().default(false), // B8a0: مشتق للعرض (النافذ اليوم)، الاختيار بالتاريخ والحالة
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  // B8a0: مسودة (تتعدل) / معتمد (مقفل، نافذ من تاريخه) / مؤرشف (لا يُختار)
  status: text('status').notNull().default('مسودة'),
  createdBy: text('created_by'),
  updatedBy: text('updated_by'),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  orderId: integer('order_id'),
}, (t) => [
  uniqueIndex('salary_scale_versions_single_active').on(t.isActive).where(sql`${t.isActive}`),
  uniqueIndex('salary_scale_versions_approved_from').on(t.effectiveFrom).where(sql`${t.status} = 'معتمد'`),
  foreignKey({ name: 'salary_scale_versions_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
]);

export const salaryScale = pgTable('salary_scale', {
  id: serial('id').primaryKey(),
  grade: integer('grade').notNull(), // الدرجة
  step: integer('step').notNull(), // المرحلة
  amount: integer('amount').notNull(), // مبلغ الراتب الاسمي
  effectiveFrom: text('effective_from'), // تاريخ بدء السريان (نقطة انطلاق التتبع - خط الأساس)
  createdAt: timestamp('created_at').defaultNow(),
  versionId: integer('version_id'), // B4d
}, (t) => [
  foreignKey({ name: 'salary_scale_version_fkey', columns: [t.versionId], foreignColumns: [salaryScaleVersions.id] }).onDelete('restrict'),
  uniqueIndex('salary_scale_version_grade_step').on(t.versionId, t.grade, t.step),
]);

// 23. Allowances and Deductions table
export const allowancesDeductions = pgTable('allowances_deductions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // الاسم (مثلاً: مخصصات شهادة، مخصصات منصب، استقطاع تقاعد)
  type: text('type').notNull(), // allowance (مخصصات) or deduction (استقطاع)
  calcType: text('calc_type').notNull(), // percentage (نسبة من الراتب الاسمي) or flat (مبلغ مقطوع)
  calculationBase: text('calculation_base').default('nominal'), // nominal | gross | net
  value: numeric('value', { precision: 14, scale: 4, mode: 'number' }).notNull(), // قيمة النسبة أو المبلغ المقطوع (عشري دقيق مثل 5.25)
  category: text('category'), // فئة البند الصريحة (spouse/child/retirement/certificate/position/tax/general...) — NULL للسجلات القديمة
  status: text('status').default('فعال'), // فعال أو متوقف مؤقتاً
  deactivatedAt: text('deactivated_at'), // تاريخ إيقاف المخصص أو الاستقطاع
  createdAt: timestamp('created_at').defaultNow(),
  // B1b: أعمدة كانت في قاعدة التشغيل من إصدار سابق ولم تكن معرّفة هنا (فكان الأرشفة تُتجاهل)
  effectiveDate: text('effective_date'), // تاريخ نفاذ البند
  notes: text('notes'),
  isArchived: boolean('is_archived').default(false), // مؤرشف: لا يظهر ولا يُحتسب في الرواتب
  archivedAt: timestamp('archived_at'),
});

// 24. Leave Types table
export const leaveTypes = pgTable('leave_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم الإجازة (مثلاً: اعتيادية، مرضية، دراسية)
  maxDays: integer('max_days'), // الحد الأقصى للأيام المسموح بها في السنة (اختياري)
  administrativeEffect: text('administrative_effect').default('لا_يؤثر'), // 'لا_يؤثر', 'يوقف_الترفيع', 'يؤخر_العلاوة'
  financialEffect: text('financial_effect').default('براتب_كامل'), // 'براتب_كامل', 'بدون_راتب', 'استقطاع_جزئي', 'براتب_ومخصصات_ثابتة'
  financialDeductionPercentage: real('financial_deduction_percentage').default(0), // نسبة الاستقطاع في حال استقطاع جزئي (0 - 100)
  affectsIncrement: boolean('affects_increment').default(false), // إيقاف / تأخير العلاوة السنوية
  affectsPromotion: boolean('affects_promotion').default(false), // إيقاف الترفيع واحتساب القدم
  affectsCommendations: boolean('affects_commendations').default(false), // توقف منح كتب الشكر والتقدير
  entitlementStateId: integer('entitlement_state_id'), // B8b: حالة الاستحقاق لأيام هذه الإجازة (ق-17)
  salaryPaymentType: text('salary_payment_type').default('full'), // 'منح_الراتب_كامل', 'منح_الراتب_والمخصصات_الثابتة_فقط', 'بدون_راتب', 'استقطاع_جزئي'
  effectsOptions: text('effects_options'), // خيارات التأشير بصيغة JSON أو نصية
  description: text('description'), // وصف الإجازة أو الشروط
  status: text('status').default('فعال'), // فعال أو متوقف مؤقتاً
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 25. Work Locations table (مواقع الشركة)
export const workLocations = pgTable('work_locations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم موقع العمل
  province: text('province'), // المحافظة — B3: كانت الواجهة ترسلها وتُهمل بصمت لعدم وجود العمود
  allowanceAmount: real('allowance_amount').default(0), // مخصصات الموقع الجغرافي أو النامي
  workStartHour: text('work_start_hour').default('08:00'), // وقت بدء الدوام
  workEndHour: text('work_end_hour').default('15:00'), // وقت نهاية الدوام
  createdAt: timestamp('created_at').defaultNow(),
});

// 26. Education Degrees table (الشهادات والتحصيل الدراسي ومخصصاتها المئوية ودرجة الأساس)
export const educationDegrees = pgTable('education_degrees', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم الشهادة (مثلاً: بكالوريوس، ماجستير)
  isHigherEducation: boolean('is_higher_education').default(false), // هل هي شهادة عليا؟
  allowanceRate: real('allowance_rate').notNull(), // نسبة مخصص الشهادة (مثلاً: 45 أو 45.5)
  higherAllowanceRate: real('higher_allowance_rate').default(0), // نسبة مخصص الشهادة العليا الإضافي (مثلاً: 50 تعني 50%)
  baselineGrade: integer('baseline_grade').default(7), // الدرجة الأساس للتعيين/الاحتساب (دكتوراه 5، ماجستير 6، بكالوريوس 7، دبلوم 8، إعدادية 8)
  baselineStep: integer('baseline_step').default(1), // المرحلة الأساس للتعيين/الاحتساب
  createdAt: timestamp('created_at').defaultNow(),
  notes: text('notes'),
  status: text('status').default('فعال'),
});

// 27. Responsibility Allowances table (مخصصات المسؤولية / المناصب ونسبها المئوية)
export const responsibilityAllowances = pgTable('responsibility_allowances', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم المسؤولية / المنصب (مثلاً: مدير عام، رئيس قسم)
  allowanceRate: real('allowance_rate').notNull(), // نسبة مخصص المنصب والمسؤولية (مثلاً: 25 تعني 25%)
  createdAt: timestamp('created_at').defaultNow(),
  description: text('description'),
  status: text('status').default('فعال'),
});

// 28. Shift Systems table (أنظمة عمل المناوبة والانعكاسات الإدارية والمالية)
export const shiftSystems = pgTable('shift_systems', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم نظام المناوبة (مثل: مناوبة 1*3، مناوبة 7*7)
  workDays: integer('work_days').notNull(),
  restDays: integer('rest_days').notNull(),
  shiftHoursType: text('shift_hours_type'),
  dailyHours: real('daily_hours'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  allowanceAmount: integer('allowance_amount').default(0),
  status: text('status').default('فعال'),
});

// 29. Service Records table (احتساب الخدمات الإضافية وسجلات تمديد الخدمة)
export const serviceRecords = pgTable('service_records', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  recordType: text('record_type').notNull(), // 'احتساب خدمة' | 'تمديد خدمة'
  orderNumber: text('order_number'),
  orderDate: text('order_date'),
  years: integer('years').default(0),
  months: integer('months').default(0),
  days: integer('days').default(0),
  purpose: text('purpose').default('علاوة_وترفيع'), // 'pension_only' (لأغراض التقاعد فقط) | 'promotion_allowance_pension' (لأغراض الترقية والعلاوة والتقاعد)
  reason: text('reason'), // السبب / التفاصيل
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  durationYears: integer('duration_years').default(0),
  durationMonths: integer('duration_months').default(0),
  durationDays: integer('duration_days').default(0),
});

export const serviceRecordsRelations = relations(serviceRecords, ({ one }) => ({
  employee: one(employees, {
    fields: [serviceRecords.employeeId],
    references: [employees.id],
  }),
}));

// 30. Penalty Types table (أنواع العقوبات الإدارية)
export const penaltyTypes = pgTable('penalty_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم العقوبة (لفت النظر، الإنذار، قطع الراتب، التوبيخ، إنقاص الراتب، تنزيل الدرجة، الفصل، العزل)
  description: text('description'), // الوصف والتأثير القانوني المباشر وفق المادة 8
  salaryDeductionDays: integer('salary_deduction_days').default(0), // عدد أيام الخصم (للتوافقية)
  delayMonths: integer('delay_months').default(0), // مدة تأخير الترفيع والزيادة بالشهور (للأغراض الحسابية)
  status: text('status').default('فعال'), // فعال أو غير فعال
  createdAt: timestamp('created_at').defaultNow(),
  salaryDeductionPercent: integer('salary_deduction_percent').default(0),
});

// 30-ب. أنواع الخدمة (نوع تعيين الموظف: دائم، عقد، أجر يومي، ...) - قائمة قابلة للتوسيع من قبل المستخدم بدون تكرار
export const serviceTypes = pgTable('service_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique('service_types_name_key'), // اسم نوع الخدمة، يجب أن يكون فريداً
  createdAt: timestamp('created_at').defaultNow(),
});

// 30-ج. حالات الموظف (مستمر، منسب، مجاز، متقاعد، مستقيل، موقوف، ...) - قائمة قابلة للتوسيع من قبل المستخدم بدون تكرار
export const employeeStatuses = pgTable('employee_statuses', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique('employee_statuses_name_key'), // اسم حالة الموظف، يجب أن يكون فريداً
  entitlementStateId: integer('entitlement_state_id'), // B8b: حالة استحقاق لأيام هذه الحالة (مثل سحب اليد)
  createdAt: timestamp('created_at').defaultNow(),
  // B4a (ق-14): المدير يحدد معنى كل حالة بدل القوائم الثابتة بالكود
  isActive: boolean('is_active').notNull().default(false), // يُحسب ضمن الموظفين الفعّالين
  payrollEligible: boolean('payroll_eligible').notNull().default(false), // يُولَّد له راتب تلقائياً
  accruesLeave: boolean('accrues_leave').notNull().default(false), // يتراكم له رصيد الإجازات الشهري
  sortOrder: integer('sort_order').notNull().default(100),
  isDefault: boolean('is_default').notNull().default(false), // حالة الموظف الجديد (واحدة فقط)
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('employee_statuses_single_default').on(t.isDefault).where(sql`${t.isDefault}`),
]);

// 30-د. أرشيف المحذوفات (Soft Delete Archive) - سجل مركزي لكل عنصر يُحذف من النظام بدلاً من حذفه نهائياً.
// عند "حذف" أي سجل (موظف حالياً، ويمكن توسيعه لاحقاً لأنواع أخرى) يُنقل هنا كنسخة كاملة (JSON) بدلاً من إزالته
// نهائياً من قاعدة البيانات، ليتمكن مدير النظام (أو من يُمنح الصلاحية لاحقاً بحسب الأدوار) من استعراضه من نافذة
// الإعدادات واستعادته، أو تأكيد حذفه بشكل نهائي ولا رجعة فيه من هناك.
export const archivedItems = pgTable('archived_items', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // نوع الكيان المؤرشف، مثل: 'employee'
  entityId: integer('entity_id').notNull(), // المعرّف الأصلي للسجل قبل الحذف (يُستخدم لاستعادته بنفس الرقم)
  entityLabel: text('entity_label'), // وصف مختصر يسهّل عرض السجل في قائمة الأرشيف دون الحاجة لفك ترميز data في كل مرة
  data: text('data').notNull(), // نسخة كاملة (JSON) من بيانات السجل وقت حذفه، تُستخدم لاستعادته لاحقاً
  deletedBy: text('deleted_by'), // اسم مستخدم/بريد من نفّذ عملية الحذف
  deletedByName: text('deleted_by_name'), // الاسم الظاهري لمن نفّذ عملية الحذف
  createdAt: timestamp('created_at').defaultNow(), // تاريخ ووقت نقل السجل إلى الأرشيف
}, (t) => [
  index('idx_archived_items_created_at').on(t.createdAt.desc().nullsFirst()),
  index('idx_archived_items_entity_type').on(t.entityType),
]);

// 31. Evaluation Forms table (استمارات تقييم الأداء والتخصيص حسب الفئات)
export const evaluationForms = pgTable('evaluation_forms', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(), // عنوان استمارة التقييم
  category: text('category'), // الفئة الوظيفية المستهدفة (مثل: الوظائف القيادية والإشرافية)
  targetGrades: text('target_grades'), // الدرجات الوظيفية المشمولة بالاستمارة
  applicableResponsibilities: text('applicable_responsibilities'), // المسؤوليات المشمولة بهذه الاستمارة (JSON array string)
  applicableQualifications: text('applicable_qualifications'), // الشهادات الدراسية المشمولة بهذه الاستمارة (JSON array string)
  maxScore: integer('max_score').default(100), // إجمالي الدرجة القصوى
  passingScore: integer('passing_score').default(50), // درجة القبول/النجاح
  description: text('description'), // تعليمات وإرادات ملء الاستمارة
  sections: text('sections'), // هيكلية المحاور والمعايير (مخزن بتنسيق JSON)
  enableWeaknesses: boolean('enable_weaknesses').default(false), // تفعيل تسجيل نقاط الضعف
  enableStrengths: boolean('enable_strengths').default(false), // تفعيل تسجيل نقاط القوة
  enableTrainingNeeds: boolean('enable_training_needs').default(false), // تفعيل تسجيل الاحتياجات التدريبية
  enableEmployeeOpinion: boolean('enable_employee_opinion').default(false), // تفعيل رأي الموظف
  status: text('status').default('فعال'), // فعال / غير فعال / مسودة
  createdAt: timestamp('created_at').defaultNow(),
  elements: text('elements'),
  targetGroup: text('target_group'),
});

// 32. Governing Training Courses table (الدورات التدريبية الحاكمة للموظفين حسب الدرجة الوظيفية للترفيع)
export const governingCourses = pgTable('governing_courses', {
  id: serial('id').primaryKey(),
  grade: integer('grade').notNull(), // الدرجة الوظيفية (مثلاً: 1 - 10)
  courseName: text('course_name').notNull(), // اسم الدورة الحاكمة
  courseType: text('course_type').default('تخصصية'), // نوع/مجال الدورة (حاكمة تخصصية، إدارية، مالية، حاسوب، سلامة، قيادية)
  durationDays: integer('duration_days').default(5), // مدة الدورة بالأيام
  durationHours: integer('duration_hours').default(20), // عدد الساعات التدريبية
  isRequiredForPromotion: boolean('is_required_for_promotion').default(true), // هل الدورة حاكمة وجوبية للترفيع؟
  minPassingScore: integer('min_passing_score').default(60), // أدنى درجة للنجاح والاجتياز
  description: text('description'), // وصف وملاحظات وتفاصيل الدورة
  status: text('status').default('فعال'), // فعال / غير فعال
  createdAt: timestamp('created_at').defaultNow(),
  // legacy: أعمدة مكررة بأسماء صغيرة من DDL قديم — تُراجع وتُحذف في B1b
  legacyCoursename: text('coursename'),
  legacyCoursetype: text('coursetype'),
  legacyCreatedat: timestamp('createdat').defaultNow(),
  legacyDurationdays: integer('durationdays'),
  legacyDurationhours: integer('durationhours'),
  legacyIsrequiredforpromotion: boolean('isrequiredforpromotion'),
  legacyMinpassingscore: integer('minpassingscore'),
});

// 33. Governing Course Exemption Rules table
export const governingCourseExemptionRules = pgTable('governing_course_exemption_rules', {
  id: serial('id').primaryKey(),
  configKey: text('config_key').unique('governing_course_exemption_rules_config_key_key').default('default_exemption_rules'),
  rules: text('rules'), // JSON stringified rules array
  qualificationsExemptions: text('qualifications_exemptions'), // JSON stringified array
  gradeTitleExemptions: text('grade_title_exemptions'), // JSON stringified array
  autoApplyRules: boolean('auto_apply_rules').default(true),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 34. Governing Course Employee Assignments table
export const governingCourseEmployeeAssignments = pgTable('governing_course_employee_assignments', {
  id: serial('id').primaryKey(),
  employeeId: text('employee_id').notNull().unique('governing_course_employee_assignments_employee_id_key'),
  status: text('status').default('مشمول'),
  exemptionReason: text('exemption_reason'),
  exemptionOrderNumber: text('exemption_order_number'),
  exemptionOrderDate: text('exemption_order_date'),
  assignedCourses: text('assigned_courses'), // JSON stringified array
  courseProgress: text('course_progress'), // JSON stringified object
  notes: text('notes'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 35. Job Titles table (دليل العناوين الوظيفية والمهنية)
export const jobTitles = pgTable('job_titles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').default('عام'), // هندسي، إداري، مالي، قانوني، حاسبات وتقنية، فني، طبي وصحي، خدمات، أخرى
  minGrade: integer('min_grade').default(7), // الدرجة الوظيفية المقترحة
  minStep: integer('min_step').default(1), // المرحلة الوظيفية الأساسية المقترحة
  nextTitleId: integer('next_title_id'), // العنوان الوظيفي التالي في الترقية / التدرج الهرمي
  status: text('status').default('فعال'), // فعال / معطل
  // B5 (ق-7): مدى الدرجة والسند وتواريخ النفاذ؛ القيم الحالية تبقى ويكملها المستخدم
  gradeMax: integer('grade_max'), // الدرجة العليا للعنوان (رقمها ≤ min_grade لأن الدرجة 1 أعلى درجة)
  legalBasis: text('legal_basis'), // جدول الملاك / تعديل 19 لسنة 2024 / أمر ...
  validFrom: date('valid_from', { mode: 'string' }),
  validTo: date('valid_to', { mode: 'string' }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 36. Grade Promotion Rules table (سنوات الترفيع القانونية لكل درجة وظيفية)
export const gradePromotionRules = pgTable('grade_promotion_rules', {
  id: serial('id').primaryKey(),
  grade: integer('grade').notNull().unique('grade_promotion_rules_grade_key'), // الدرجة الوظيفية (1 - 10, والدرجات الخاصة 11, 12, 13)
  promotionYears: integer('promotion_years'), // عدد سنوات الخدمة المطلوبة للترفيع للدرجة الأعلى (null يعني لا يوجد ترفيع أعلى)
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 37. Commendation Types table (أنواع كتب الشكر والتقدير وشهور القدم)
export const commendationTypes = pgTable('commendation_types', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // اسم نوع كتاب الشكر (مثلاً: كتاب شكر وزاري، كتاب شكر رئاسي)
  creditMonths: integer('credit_months').notNull().default(1), // عدد أشهر القدم الممنوحة (1 أو 6)
  // B7 (ق-9): يشمل العلاوة أو الترفيع أو كلاهما، وسقف سنوي خاص بالنوع (فارغ = السقف العام)
  appliesTo: text('applies_to').notNull().default('كلاهما'),
  annualCap: integer('annual_cap'),
  status: text('status').default('فعال'), // فعال / معطل
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 38. Employee Commendations table (سجل كتب الشكر والتقدير الممنوحة لكل موظف)
export const employeeCommendations = pgTable('employee_commendations', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  commendationTypeId: integer('commendation_type_id'),
  creditMonthsSnapshot: integer('credit_months_snapshot').notNull().default(1), // لقطة جامدة لعدد شهور القدم وقت المنح
  appliesToSnapshot: text('applies_to_snapshot').notNull().default('كلاهما'), // B7 (ق-9): لقطة الشمول وقت المنح
  orderNumber: text('order_number'), // رقم الأمر الإداري
  orderDate: text('order_date'), // تاريخ الأمر الإداري
  issuer: text('issuer'), // الجهة المانحة (الوزير، المدير العام، رئيس مجلس الوزراء)
  reason: text('reason'), // سبب منح كتاب الشكر
  isHidden: boolean('is_hidden').default(false), // إخفاء من الاحتساب المباشر للترقية
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const employeeCommendationsRelations = relations(employeeCommendations, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeCommendations.employeeId],
    references: [employees.id],
  }),
  commendationType: one(commendationTypes, {
    fields: [employeeCommendations.commendationTypeId],
    references: [commendationTypes.id],
  }),
}));

// 39. Commendation Rules Settings table (إعدادات وقيود كتب الشكر السنوية)
export const commendationRulesSettings = pgTable('commendation_rules_settings', {
  id: serial('id').primaryKey(),
  configKey: text('config_key').notNull().unique('commendation_rules_settings_config_key_key').default('default_commendation_rules'),
  maxPerYear: integer('max_per_year').default(3), // الحد الأقصى لعدد كتب الشكر المحتسبة سنوياً
  allowedCombinations: text('allowed_combinations'), // JSON stringified array of permitted combinations
  degreeTrackAutoSettlement: boolean('degree_track_auto_settlement').default(false), // تفعيل التسوية التلقائية لمسار احتساب الشهادات
  reminderDaysCourse: integer('reminder_days_course').default(30), // عدد أيام التذكير الافتراضي للدورات الحاكمة
  reminderDaysPenalty: integer('reminder_days_penalty').default(15), // عدد أيام التذكير الافتراضي للعقوبات
  reminderDaysLeave: integer('reminder_days_leave').default(30), // عدد أيام التذكير الافتراضي للإجازات الموقفة
  reminderDaysEvaluation: integer('reminder_days_evaluation').default(30), // عدد أيام التذكير الافتراضي لتقييم الأداء
  reminderDaysAbsence: integer('reminder_days_absence').default(10), // عدد أيام التذكير الافتراضي للغياب
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 40. Service Credits table (احتساب الخدمة السابقة والمهنية والعسكرية المضافة)
export const serviceCredits = pgTable('service_credits', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  creditType: text('credit_type').notNull(), // خدمة_عسكرية، خدمة_عقد، ممارسة_مهنة، خدمة_خارجية، أخرى
  calculatedYears: integer('calculated_years').default(0),
  calculatedMonths: integer('calculated_months').default(0),
  calculatedDays: integer('calculated_days').default(0),
  orderNumber: text('order_number'),
  orderDate: text('order_date'),
  purpose: text('purpose').default('علاوة_وترفيع'), // علاوة_وترفيع، تقاعد_فقط، علاوة_فقط
  isCountedForPromotion: boolean('is_counted_for_promotion').default(true),
  isCountedForRetirement: boolean('is_counted_for_retirement').default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'service_credits_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

export const serviceCreditsRelations = relations(serviceCredits, ({ one }) => ({
  employee: one(employees, {
    fields: [serviceCredits.employeeId],
    references: [employees.id],
  }),
}));

// 41. Degree Track Snapshots table (لقطة بدء عملية احتساب الشهادة أثناء الخدمة)
export const degreeTrackSnapshots = pgTable('degree_track_snapshots', {
  id: serial('id').primaryKey(),
  qualificationId: integer('qualification_id')
    .notNull(),
  employeeId: integer('employee_id')
    .notNull(),
  jobTitleId: integer('job_title_id'), // العنوان الوظيفي المعتمد المقترن بالشهادة
  actualGradeBefore: integer('actual_grade_before').notNull(), // الدرجة الفعلية الحالية وقت بدء الاحتساب (مثال: 3)
  actualStepBefore: integer('actual_step_before').notNull(), // المرحلة الفعلية الحالية وقت بدء الاحتساب (مثال: 1)
  baselineGrade: integer('baseline_grade').notNull().default(7), // الدرجة الأساس المقررة للعنوان الوظيفي (مثال: 7)
  baselineStep: integer('baseline_step').notNull().default(1), // المرحلة الأساس المقررة للعنوان الوظيفي (مثال: 1)
  graduationDateUsed: text('graduation_date_used').notNull(), // تاريخ التخرج المعتمد (YYYY-MM-DD)
  orderDate: text('order_date').notNull(), // تاريخ صدور أمر الاحتساب (YYYY-MM-DD)
  status: text('status').notNull().default('نشط'), // 'نشط' | 'مكتمل'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'degree_track_snapshots_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
  foreignKey({ name: 'degree_track_snapshots_job_title_id_fkey', columns: [t.jobTitleId], foreignColumns: [jobTitles.id] }).onDelete('set null'),
  foreignKey({ name: 'degree_track_snapshots_qualification_id_fkey', columns: [t.qualificationId], foreignColumns: [qualifications.id] }).onDelete('cascade'),
]);

export const degreeTrackSnapshotsRelations = relations(degreeTrackSnapshots, ({ one, many }) => ({
  employee: one(employees, {
    fields: [degreeTrackSnapshots.employeeId],
    references: [employees.id],
  }),
  qualification: one(qualifications, {
    fields: [degreeTrackSnapshots.qualificationId],
    references: [qualifications.id],
  }),
  jobTitle: one(jobTitles, {
    fields: [degreeTrackSnapshots.jobTitleId],
    references: [jobTitles.id],
  }),
  simulationSteps: many(degreeTrackSimulationSteps),
  specializationCredits: many(specializationCourseCredits),
}));

// 42. Degree Track Simulation Steps table (سجل خطوات ترفيع المحاكاة للفترة المقضية)
export const degreeTrackSimulationSteps = pgTable('degree_track_simulation_steps', {
  id: serial('id').primaryKey(),
  snapshotId: integer('snapshot_id')
    .notNull(),
  fromGrade: integer('from_grade').notNull(),
  toGrade: integer('to_grade').notNull(),
  computedDate: text('computed_date').notNull(), // التاريخ المحسوب افتراضياً لهذا الترفيع (نقطة بداية المرحلة الحقيقية)
  weeksConsumed: integer('weeks_consumed').notNull().default(2), // عدد أسابيع دورة الاختصاص المستهلكة
  isBundled: boolean('is_bundled').default(false), // هل دمج هذا الترفيع مع ترفيع آخر (استثناء الـ 10 سنوات)
  status: text('status').notNull().default('ممنوح_بالمحاكاة'), // 'ممنوح_بالمحاكاة' | 'معلق_لعدم_استيفاء_الدورة'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'degree_track_simulation_steps_snapshot_id_fkey', columns: [t.snapshotId], foreignColumns: [degreeTrackSnapshots.id] }).onDelete('cascade'),
]);

export const degreeTrackSimulationStepsRelations = relations(degreeTrackSimulationSteps, ({ one }) => ({
  snapshot: one(degreeTrackSnapshots, {
    fields: [degreeTrackSimulationSteps.snapshotId],
    references: [degreeTrackSnapshots.id],
  }),
}));

// 43. Specialization Course Credits table (رصيد أسابيع تدريب الاختصاص التراكمي)
export const specializationCourseCredits = pgTable('specialization_course_credits', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  snapshotId: integer('snapshot_id'),
  weeks: integer('weeks').notNull().default(1), // عدد أسابيع الدورة التدريبية التخصصية
  courseDate: text('course_date'), // تاريخ الدورة
  courseName: text('course_name'), // اسم الدورة التخصصية
  provider: text('provider'), // الجهة المنظمة
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  // B6 (ق-13): الرصيد الآلي من دورة اختصاص مجتازة بموديول التدريب، وإلغاؤه من المسؤول
  sourceTrainingId: integer('source_training_id'),
  source: text('source').default('يدوي'), // يدوي | آلي من التدريب
  isCancelled: boolean('is_cancelled').notNull().default(false),
  cancelledReason: text('cancelled_reason'),
}, (t) => [
  uniqueIndex('specialization_credits_training_unique').on(t.employeeId, t.sourceTrainingId).where(sql`${t.sourceTrainingId} IS NOT NULL`),
  foreignKey({ name: 'specialization_course_credits_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
  foreignKey({ name: 'specialization_course_credits_snapshot_id_fkey', columns: [t.snapshotId], foreignColumns: [degreeTrackSnapshots.id] }).onDelete('set null'),
]);

export const specializationCourseCreditsRelations = relations(specializationCourseCredits, ({ one }) => ({
  employee: one(employees, {
    fields: [specializationCourseCredits.employeeId],
    references: [employees.id],
  }),
  snapshot: one(degreeTrackSnapshots, {
    fields: [specializationCourseCredits.snapshotId],
    references: [degreeTrackSnapshots.id],
  }),
}));

// 44. Promotion Delay Reasons table (أسباب تأخير وتوقف الترقية والعلاوة والتذكيرات المدارة)
export const promotionDelayReasons = pgTable('promotion_delay_reasons', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull(),
  reasonType: text('reason_type').notNull(), // 'دورة' | 'عقوبة' | 'اجازة' | 'تقييم' | 'غياب'
  description: text('description').notNull(), // نص توضيحي مولد من المحرك
  affects: text('affects').notNull().default('كلاهما'), // 'ترفيع' | 'علاوة' | 'كلاهما'
  isHidden: boolean('is_hidden').default(false), // إخفاء من واجهة العرض
  reminderDate: text('reminder_date'), // تاريخ التذكير (YYYY-MM-DD)
  isAutoReminder: boolean('is_auto_reminder').default(true), // هل التذكير محسوب تلقائياً
  isResolved: boolean('is_resolved').default(false), // هل زال المانع بعد إعادة الحساب
  resolvedAt: text('resolved_at'), // تاريخ زوال السبب
  sourceReferenceId: text('source_reference_id'), // معرّف السجل المصدر للتتبع
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => [
  foreignKey({ name: 'promotion_delay_reasons_employee_id_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('cascade'),
]);

export const promotionDelayReasonsRelations = relations(promotionDelayReasons, ({ one }) => ({
  employee: one(employees, {
    fields: [promotionDelayReasons.employeeId],
    references: [employees.id],
  }),
}));

// B2: وثائق إعدادات كاملة (JSONB) كانت تعيش في الذاكرة أو في local_storage.json فقط.
// المفاتيح: 'grade_requirements' (متطلبات الدورات لكل درجة)، 'promotion_paths_matrix' (مصفوفة مسارات الترفيع).
export const appSettingsDocuments = pgTable('app_settings_documents', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  source: text('source').default('user'), // user | default | imported-local-storage
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: text('updated_by'),
});

// ============================================================================
// B4b: الأوامر الإدارية والسجل الوظيفي المؤرخ (ق-4)
// ============================================================================

export const administrativeOrders = pgTable('administrative_orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull(),
  orderDate: date('order_date', { mode: 'string' }).notNull(),
  issuer: text('issuer'), // الجهة المصدرة
  subject: text('subject'),
  orderKind: text('order_kind'), // ترفيع / علاوة / نقل / تكليف / تغيير حالة / ...
  effectiveDate: date('effective_date', { mode: 'string' }), // تاريخ النفاذ الافتراضي لحركات الأمر
  cancelsOrderId: integer('cancels_order_id'), // هذا الأمر يلغي أمراً سابقاً
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'administrative_orders_cancels_fkey', columns: [t.cancelsOrderId], foreignColumns: [t.id] }).onDelete('restrict'),
  // الجهة الفارغة تُعامل كقيمة (حتى ما يتكرر نفس الأمر بلا جهة)
  uniqueIndex('administrative_orders_identity').on(t.orderNumber, t.orderDate, sql`coalesce(${t.issuer}, '')`),
]);

// سجل إلحاقي فقط: لا يُعدَّل صف ولا يُحذف. نهاية كل فترة = بداية الصف التالي لنفس الحقل
// (العرض employee_field_timeline). التصحيح صف جديد يشير للمُصحَّح بـ supersedes_id.
export const employeeFieldHistory = pgTable('employee_field_history', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull(),
  field: text('field').notNull(), // grade, step, job_title, ... أو 'event' لحدث بلا تغيير حقل
  value: jsonb('value'),
  validFrom: date('valid_from', { mode: 'string' }), // فارغ = قبل بدء السجل (تقديري بلا تاريخ معروف)
  orderId: integer('order_id'),
  source: text('source').notNull(), // تقديري | أمر | تعديل مباشر | ترحيل قديم
  reason: text('reason'),
  snapshot: jsonb('snapshot'), // صف الموظف لحظة التسجيل
  supersedesId: integer('supersedes_id'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  recordedBy: text('recorded_by'),
}, (t) => [
  foreignKey({ name: 'employee_field_history_employee_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('restrict'),
  foreignKey({ name: 'employee_field_history_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
  foreignKey({ name: 'employee_field_history_supersedes_fkey', columns: [t.supersedesId], foreignColumns: [t.id] }).onDelete('restrict'),
  index('employee_field_history_emp_field').on(t.employeeId, t.field, t.validFrom),
  index('employee_field_history_order').on(t.orderId),
]);

// B7 (ق-12): تقويم العطل الرسمية (قانون العطل الرسمية 12 لسنة 2024 + العطل الهجرية والطارئة سنوياً)
export const officialHolidays = pgTable('official_holidays', {
  id: serial('id').primaryKey(),
  holidayDate: date('holiday_date', { mode: 'string' }).notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('ميلادي ثابت'), // ميلادي ثابت | هجري | طارئ | ديني خاص
  legalBasis: text('legal_basis'),
  notes: text('notes'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('official_holidays_date_name').on(t.holidayDate, t.name),
]);

// B8a0: سجل تدقيق إلحاقي للرواتب وتغييرات المستخدمين (مشغّل يمنع التعديل والحذف)
export const payrollAudit = pgTable('payroll_audit', {
  id: serial('id').primaryKey(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  actor: text('actor'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: text('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: text('ip'),
}, (t) => [
  index('payroll_audit_entity').on(t.entity, t.entityId),
  index('payroll_audit_at').on(t.at),
]);

// ===================== B8a1: الرواتب — الفئات والبنود والإسناد والعائلة والاعتماد الثاني =====================

// ق-1: فئات الرواتب المستقلة (الدائميون، أنواع العقود، الأجر اليومي)
export const payrollCategories = pgTable('payroll_categories', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique('payroll_categories_code_key'),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // دائم | عقد | أجر يومي
  payBasis: text('pay_basis').notNull().default('شهري'), // شهري | يومي
  isActive: boolean('is_active').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// انتماء الموظف للفئة من نوع خدمته ونوع عقده (contract_type فارغ = أي نوع)
export const payrollCategoryRules = pgTable('payroll_category_rules', {
  id: serial('id').primaryKey(),
  serviceType: text('service_type').notNull(),
  contractType: text('contract_type'),
  categoryId: integer('category_id').notNull(),
}, (t) => [
  foreignKey({ name: 'payroll_category_rules_category_fkey', columns: [t.categoryId], foreignColumns: [payrollCategories.id] }).onDelete('restrict'),
  uniqueIndex('payroll_category_rules_key').on(t.serviceType, sql`coalesce(${t.contractType}, '')`),
]);

// البند: الخصائص الثابتة (القسم 6.1 من المتطلبات)
export const payItems = pgTable('pay_items', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique('pay_items_code_key'),
  name: text('name').notNull(),
  direction: text('direction').notNull(), // + مخصص | - استقطاع
  itemGroup: text('item_group').notNull(), // الشهادة، المنصب، الموقع، العائلية، القانونية، العقوبات، الأقساط، القضائية، أخرى
  classification: text('classification').notNull(), // عام | ثابت | تقديري | مؤقت
  assignmentMode: text('assignment_mode').notNull(), // تلقائي | بأمر
  method: text('method').notNull(), // percent | flat | tiered | family | installments | manual | brackets | hours
  categoryId: integer('category_id').notNull(),
  payrollCode: text('payroll_code'), // رمز كشف الرواتب للمطابقة
  beneficiary: text('beneficiary'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'pay_items_category_fkey', columns: [t.categoryId], foreignColumns: [payrollCategories.id] }).onDelete('restrict'),
]);

// نسخ البند المؤرخة بزمنين: الخصائص المؤرخة كلها بـ props، والتصحيح يستبدل ولا يكتب فوق
export const payItemVersions = pgTable('pay_item_versions', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull(),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  validTo: date('valid_to', { mode: 'string' }), // آخر يوم (شامل)؛ فارغ = مفتوح
  props: jsonb('props').notNull(),
  orderId: integer('order_id'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  supersededBy: integer('superseded_by'),
  enteredBy: text('entered_by'),
  approvedBy: text('approved_by'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  note: text('note'),
}, (t) => [
  foreignKey({ name: 'pay_item_versions_item_fkey', columns: [t.itemId], foreignColumns: [payItems.id] }).onDelete('restrict'),
  foreignKey({ name: 'pay_item_versions_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
  index('pay_item_versions_item').on(t.itemId, t.validFrom),
]);

// الإسناد الفردي والحجب (الحجب = قيمة صفر) — الصفوف المعتمدة فقط؛ المعلّق بـ pending_operations
export const employeePayAssignments = pgTable('employee_pay_assignments', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull(),
  itemId: integer('item_id').notNull(),
  kind: text('kind').notNull(), // منح | تعديل | حجب
  valueKind: text('value_kind'), // نسبة | مبلغ | فارغ = قيمة القاعدة
  value: numeric('value', { precision: 18, scale: 6, mode: 'string' }),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  validTo: date('valid_to', { mode: 'string' }),
  principal: numeric('principal', { precision: 18, scale: 6, mode: 'string' }),
  installment: numeric('installment', { precision: 18, scale: 6, mode: 'string' }),
  installmentsCount: integer('installments_count'),
  multiAllowed: boolean('multi_allowed').notNull().default(false),
  orderId: integer('order_id').notNull(),
  reason: text('reason').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  supersededBy: integer('superseded_by'),
  enteredBy: text('entered_by'),
  approvedBy: text('approved_by'),
}, (t) => [
  foreignKey({ name: 'employee_pay_assignments_employee_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('restrict'),
  foreignKey({ name: 'employee_pay_assignments_item_fkey', columns: [t.itemId], foreignColumns: [payItems.id] }).onDelete('restrict'),
  foreignKey({ name: 'employee_pay_assignments_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
  index('employee_pay_assignments_emp').on(t.employeeId, t.itemId),
]);

// العائلة (كانت JSON بلا تواريخ)
export const familyMembers = pgTable('family_members', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull(),
  relation: text('relation').notNull(), // زوج | زوجة | ابن | بنت | طفل (الجنس غير معروف)
  name: text('name'),
  birthDate: date('birth_date', { mode: 'string' }),
  spouseEmployeeId: integer('spouse_employee_id'), // الزوج موظف بالشركة
  sourceRef: text('source_ref'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ name: 'family_members_employee_fkey', columns: [t.employeeId], foreignColumns: [employees.id] }).onDelete('restrict'),
  foreignKey({ name: 'family_members_spouse_employee_fkey', columns: [t.spouseEmployeeId], foreignColumns: [employees.id] }).onDelete('restrict'),
  index('family_members_employee').on(t.employeeId),
]);

// حقائق العضو المؤرخة بزمنين (إلحاقي): يدرس، متزوج، موظف، عاجز، حضانة، متوفى، يستلم الإعالة
export const familyMemberFacts = pgTable('family_member_facts', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').notNull(),
  fact: text('fact').notNull(),
  value: jsonb('value').notNull(),
  validFrom: date('valid_from', { mode: 'string' }), // فارغ = معروف منذ البداية (تقديري)
  orderId: integer('order_id'),
  source: text('source').notNull(), // أمر | تقديري | ترحيل قديم | تصحيح
  reason: text('reason'),
  supersedesId: integer('supersedes_id'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  recordedBy: text('recorded_by'),
}, (t) => [
  foreignKey({ name: 'family_member_facts_member_fkey', columns: [t.memberId], foreignColumns: [familyMembers.id] }).onDelete('restrict'),
  foreignKey({ name: 'family_member_facts_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
  foreignKey({ name: 'family_member_facts_supersedes_fkey', columns: [t.supersedesId], foreignColumns: [t.id] }).onDelete('restrict'),
  index('family_member_facts_member').on(t.memberId, t.fact),
]);

// تمديد استحقاق الطفل بعد العمر، بأمر ولمدة (س8.5)
export const familyExtensions = pgTable('family_extensions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').notNull(),
  validFrom: date('valid_from', { mode: 'string' }).notNull(),
  validTo: date('valid_to', { mode: 'string' }).notNull(),
  orderId: integer('order_id'),
  reason: text('reason'),
  source: text('source').notNull().default('أمر'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  recordedBy: text('recorded_by'),
}, (t) => [
  foreignKey({ name: 'family_extensions_member_fkey', columns: [t.memberId], foreignColumns: [familyMembers.id] }).onDelete('restrict'),
  foreignKey({ name: 'family_extensions_order_fkey', columns: [t.orderId], foreignColumns: [administrativeOrders.id] }).onDelete('restrict'),
]);

// العمليات الحساسة بانتظار الاعتماد: حمولة فقط، تُطبَّق عند الاعتماد بمعاملة واحدة (مب9)
export const pendingOperations = pgTable('pending_operations', {
  id: serial('id').primaryKey(),
  opType: text('op_type').notNull(),
  employeeId: integer('employee_id'),
  itemId: integer('item_id'),
  payload: jsonb('payload').notNull(),
  baseToken: text('base_token'), // حالة الهدف وقت الإدخال: اختلافها عند الاعتماد = تعارض
  summary: text('summary'),
  enteredBy: text('entered_by').notNull(),
  enteredAt: timestamp('entered_at', { withTimezone: true }).defaultNow().notNull(),
  state: text('state').notNull().default('بانتظار'), // بانتظار | معتمد | مرفوض | ملغى
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decisionReason: text('decision_reason'),
  resultRef: text('result_ref'),
}, (t) => [
  index('pending_operations_state').on(t.state, t.enteredAt),
]);

// ===================== B8a3: الفترات والاحتسابات الثابتة والمتغيرات =====================

// الفترة الشهرية لكل فئة رواتب (س11.1). الحالة تتغير بالانتقالات المسموحة فقط (مشغّل).
export const payrollPeriods = pgTable('payroll_periods', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  kind: text('kind').notNull().default('عادية'), // عادية | استثنائية (B8b)
  parentId: integer('parent_id'),
  paySource: text('pay_source').notNull().default('ظلّي'), // ظلّي | فعلي (ق-14)
  status: text('status').notNull().default('مفتوحة'), // مفتوحة | محتسبة | معتمدة | مُصدَرة
  currentRunId: integer('current_run_id'),
  openedBy: text('opened_by').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  approvedBy: text('approved_by'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  issuedBy: text('issued_by'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  dispatchLetter: text('dispatch_letter'),
  notes: text('notes'),
}, (t) => [
  foreignKey({ name: 'payroll_periods_category_fkey', columns: [t.categoryId], foreignColumns: [payrollCategories.id] }).onDelete('restrict'),
  uniqueIndex('payroll_periods_regular_key').on(t.categoryId, t.year, t.month).where(sql`kind = 'عادية'`),
  index('payroll_periods_status').on(t.categoryId, t.status),
]);

// كل احتساب سجل ثابت: السطور والنتائج تنتمي له، وإعادة الاحتساب = احتساب جديد.
export const payrollRuns = pgTable('payroll_runs', {
  id: serial('id').primaryKey(),
  periodId: integer('period_id').notNull(),
  state: text('state').notNull().default('جاري'), // جاري | محتسب | معتمد | مُصدَر | ملغى | فاشل
  fingerprint: text('fingerprint'),
  knownAt: timestamp('known_at', { withTimezone: true }).notNull(),
  computedBy: text('computed_by').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  totals: jsonb('totals'),
  cancelReason: text('cancel_reason'),
}, (t) => [
  foreignKey({ name: 'payroll_runs_period_fkey', columns: [t.periodId], foreignColumns: [payrollPeriods.id] }).onDelete('restrict'),
  index('payroll_runs_period').on(t.periodId),
]);

export const payrollResults = pgTable('payroll_results', {
  runId: integer('run_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  computed: boolean('computed').notNull(),
  nominal: numeric('nominal', { precision: 18, scale: 6 }).notNull(),
  allowances: numeric('allowances', { precision: 18, scale: 6 }).notNull(),
  deductions: numeric('deductions', { precision: 18, scale: 6 }).notNull(),
  netExact: numeric('net_exact', { precision: 18, scale: 6 }).notNull(),
  net: numeric('net', { precision: 18, scale: 6 }).notNull(),
  negative: numeric('negative', { precision: 18, scale: 6 }).notNull(),
  flags: jsonb('flags').notNull(),
  issues: jsonb('issues').notNull(),
  snapshot: jsonb('snapshot').notNull(), // لقطة مجمّدة: الاسم، الرقم، التشكيل، الدرجة والمرحلة
}, (t) => [
  uniqueIndex('payroll_results_run_employee').on(t.runId, t.employeeId),
  foreignKey({ name: 'payroll_results_run_fkey', columns: [t.runId], foreignColumns: [payrollRuns.id] }).onDelete('restrict'),
  index('payroll_results_employee').on(t.employeeId),
]);

export const payrollLines = pgTable('payroll_lines', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  seq: integer('seq').notNull(),
  itemId: integer('item_id'), // فارغ = الراتب الاسمي
  itemCode: text('item_code').notNull(),
  itemName: text('item_name').notNull(), // نص مجمّد
  direction: text('direction').notNull(),
  kind: text('kind').notNull(),
  itemVersionId: integer('item_version_id'),
  scaleVersionId: integer('scale_version_id'),
  assignmentId: integer('assignment_id'),
  segmentFrom: date('segment_from'),
  segmentTo: date('segment_to'),
  share: text('share'),
  base: numeric('base', { precision: 18, scale: 6 }),
  rate: text('rate'),
  amount: numeric('amount', { precision: 18, scale: 6 }).notNull(),
  explain: jsonb('explain'),
}, (t) => [
  foreignKey({ name: 'payroll_lines_run_fkey', columns: [t.runId], foreignColumns: [payrollRuns.id] }).onDelete('restrict'),
  index('payroll_lines_run_emp').on(t.runId, t.employeeId),
]);

// المتغيرات الشهرية تُشتق عند الاعتماد (س11.2)
export const payrollVariances = pgTable('payroll_variances', {
  id: serial('id').primaryKey(),
  runId: integer('run_id').notNull(),
  employeeId: integer('employee_id').notNull(),
  itemId: integer('item_id'),
  itemCode: text('item_code').notNull(),
  itemName: text('item_name').notNull(),
  before: numeric('before', { precision: 18, scale: 6 }).notNull(),
  after: numeric('after', { precision: 18, scale: 6 }).notNull(),
  cause: text('cause').notNull(),
  orderRef: text('order_ref'),
}, (t) => [
  foreignKey({ name: 'payroll_variances_run_fkey', columns: [t.runId], foreignColumns: [payrollRuns.id] }).onDelete('restrict'),
  index('payroll_variances_run').on(t.runId, t.employeeId),
]);

// B8b: حالات الاستحقاق (القسم 9) — نسبة الاسمي والمحجوز وسلوك البنود والتقاعد والأسبقية
export const entitlementStates = pgTable('entitlement_states', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique('entitlement_states_code_key'),
  name: text('name').notNull(),
  nominalPct: numeric('nominal_pct', { precision: 7, scale: 4 }).notNull(),
  heldPct: numeric('held_pct', { precision: 7, scale: 4 }).notNull().default('0'),
  defaultBehavior: text('default_behavior').notNull().default('يتبع'),
  itemBehaviors: jsonb('item_behaviors').notNull().default({}),
  retirement: text('retirement').notNull().default('على المستحق'),
  precedence: integer('precedence').notNull().default(10),
  verification: text('verification').notNull().default('يُتحقق'),
  legalBasis: text('legal_basis'),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
