CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"user_email" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "allowances_deductions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"calc_type" text NOT NULL,
	"calculation_base" text DEFAULT 'nominal',
	"value" numeric(14, 4) NOT NULL,
	"category" text,
	"status" text DEFAULT 'فعال',
	"deactivated_at" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "annual_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"year" integer NOT NULL,
	"grade" text NOT NULL,
	"evaluation_authority" text,
	"strengths" text,
	"weaknesses" text,
	"required_courses" text,
	"employee_opinion" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "annual_training_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"track" text NOT NULL,
	"planned_courses_count" integer DEFAULT 0,
	"planned_trainees_count" integer DEFAULT 0,
	"planned_budget" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appreciations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"order_number" text NOT NULL,
	"order_date" text NOT NULL,
	"issuer" text,
	"reason" text,
	"seniority_impact" text DEFAULT 'قدم شهر واحد',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "archived_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_label" text,
	"data" text NOT NULL,
	"deleted_by" text,
	"deleted_by_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"check_in" text,
	"check_out" text,
	"late_minutes" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "career_histories" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"order_number" text,
	"order_date" text,
	"action_type" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commendation_rules_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_key" text DEFAULT 'default_commendation_rules' NOT NULL,
	"max_per_year" integer DEFAULT 3,
	"allowed_combinations" text,
	"degree_track_auto_settlement" boolean DEFAULT false,
	"reminder_days_course" integer DEFAULT 30,
	"reminder_days_penalty" integer DEFAULT 15,
	"reminder_days_leave" integer DEFAULT 30,
	"reminder_days_evaluation" integer DEFAULT 30,
	"reminder_days_absence" integer DEFAULT 10,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "commendation_rules_settings_config_key_key" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "commendation_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"credit_months" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'فعال',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "degree_track_simulation_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_id" integer NOT NULL,
	"from_grade" integer NOT NULL,
	"to_grade" integer NOT NULL,
	"computed_date" text NOT NULL,
	"weeks_consumed" integer DEFAULT 2 NOT NULL,
	"is_bundled" boolean DEFAULT false,
	"status" text DEFAULT 'ممنوح_بالمحاكاة' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "degree_track_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"qualification_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"job_title_id" integer,
	"actual_grade_before" integer NOT NULL,
	"actual_step_before" integer NOT NULL,
	"baseline_grade" integer DEFAULT 7 NOT NULL,
	"baseline_step" integer DEFAULT 1 NOT NULL,
	"graduation_date_used" text NOT NULL,
	"order_date" text NOT NULL,
	"status" text DEFAULT 'نشط' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"doc_type" text,
	"file_path" text,
	"entry_date" text,
	"created_at" timestamp DEFAULT now(),
	"document_type" text,
	"title" text NOT NULL,
	"notes" text,
	"upload_date" text
);
--> statement-breakpoint
CREATE TABLE "education_degrees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_higher_education" boolean DEFAULT false,
	"allowance_rate" real NOT NULL,
	"higher_allowance_rate" real DEFAULT 0,
	"baseline_grade" integer DEFAULT 7,
	"baseline_step" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"notes" text,
	"status" text DEFAULT 'فعال'
);
--> statement-breakpoint
CREATE TABLE "employee_commendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"commendation_type_id" integer,
	"credit_months_snapshot" integer DEFAULT 1 NOT NULL,
	"order_number" text,
	"order_date" text,
	"issuer" text,
	"reason" text,
	"is_hidden" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_statuses_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_number" text,
	"company_number" text,
	"civil_service_number" text,
	"full_name" text NOT NULL,
	"first_name" text,
	"father_name" text,
	"grandfather_name" text,
	"great_grandfather_name" text,
	"surname" text,
	"gender" text,
	"birth_date" text,
	"birth_place" text,
	"nationality" text,
	"ethnicity" text,
	"religion" text,
	"marital_status" text,
	"children_count" integer DEFAULT 0,
	"national_id" text,
	"passport_number" text,
	"blood_type" text,
	"residence_card" text,
	"ration_card" text,
	"nationality_cert" text,
	"phone" text,
	"email" text,
	"address" text,
	"appointment_date" text,
	"first_appointment_date" text,
	"current_appointment_date" text,
	"oil_sector_start_date" text,
	"appointment_order" text,
	"job_title" text,
	"department" text,
	"section" text,
	"service_type" text,
	"grade" integer,
	"step" integer,
	"grade_date" text,
	"last_promotion_date" text,
	"last_increment_date" text,
	"next_promotion_due_date" text,
	"next_increment_due_date" text,
	"job_responsibility" text,
	"deputy_status" text,
	"primary_responsibility" text,
	"acting_responsibility" text,
	"deputy_level" text,
	"service_record_number" text,
	"employee_id_number" text,
	"retirement_number" text,
	"education_level" text,
	"specialization" text,
	"university" text,
	"institution" text,
	"graduation_year" integer,
	"education_order" text,
	"evaluation_order" text,
	"work_location" text,
	"work_nature" text DEFAULT 'مكتبي',
	"work_shift_type" text DEFAULT 'صباحي',
	"shift_system_id" integer,
	"shift_system_name" text,
	"shift_work_days" integer DEFAULT 0,
	"shift_rest_days" integer DEFAULT 0,
	"status" text DEFAULT 'مستمر',
	"status_order_number" text,
	"status_order_date" text,
	"status_notes" text,
	"initial_regular_leave_balance" real DEFAULT 0,
	"initial_sick_leave_balance" real DEFAULT 0,
	"photo" text,
	"security_clearance_number" text,
	"security_clearance_date" text,
	"retirement_extension_order_number" text,
	"retirement_extension_order_date" text,
	"retirement_extension_years" integer DEFAULT 0,
	"retirement_extension_months" integer DEFAULT 0,
	"retirement_extension_note" text,
	"spouse_names" text,
	"spouses_data" text,
	"children_details" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "employees_company_number_unique" UNIQUE("company_number"),
	CONSTRAINT "employees_civil_service_number_unique" UNIQUE("civil_service_number"),
	CONSTRAINT "employees_employee_id_number_unique" UNIQUE("employee_id_number")
);
--> statement-breakpoint
CREATE TABLE "evaluation_forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"target_grades" text,
	"applicable_responsibilities" text,
	"applicable_qualifications" text,
	"max_score" integer DEFAULT 100,
	"passing_score" integer DEFAULT 50,
	"description" text,
	"sections" text,
	"enable_weaknesses" boolean DEFAULT false,
	"enable_strengths" boolean DEFAULT false,
	"enable_training_needs" boolean DEFAULT false,
	"enable_employee_opinion" boolean DEFAULT false,
	"status" text DEFAULT 'فعال',
	"created_at" timestamp DEFAULT now(),
	"elements" text,
	"target_group" text
);
--> statement-breakpoint
CREATE TABLE "governing_course_employee_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"status" text DEFAULT 'مشمول',
	"exemption_reason" text,
	"exemption_order_number" text,
	"exemption_order_date" text,
	"assigned_courses" text,
	"course_progress" text,
	"notes" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "governing_course_employee_assignments_employee_id_key" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "governing_course_exemption_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_key" text DEFAULT 'default_exemption_rules',
	"rules" text,
	"qualifications_exemptions" text,
	"grade_title_exemptions" text,
	"auto_apply_rules" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "governing_course_exemption_rules_config_key_key" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "governing_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" integer NOT NULL,
	"course_name" text NOT NULL,
	"course_type" text DEFAULT 'تخصصية',
	"duration_days" integer DEFAULT 5,
	"duration_hours" integer DEFAULT 20,
	"is_required_for_promotion" boolean DEFAULT true,
	"min_passing_score" integer DEFAULT 60,
	"description" text,
	"status" text DEFAULT 'فعال',
	"created_at" timestamp DEFAULT now(),
	"coursename" text,
	"coursetype" text,
	"createdat" timestamp DEFAULT now(),
	"durationdays" integer,
	"durationhours" integer,
	"isrequiredforpromotion" boolean,
	"minpassingscore" integer
);
--> statement-breakpoint
CREATE TABLE "grade_promotion_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" integer NOT NULL,
	"promotion_years" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "grade_promotion_rules_grade_key" UNIQUE("grade")
);
--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"grade" text,
	"step" integer,
	"job_title" text,
	"division" text,
	"department" text,
	"section" text,
	"confirmation_date" text,
	"assignment_type" text DEFAULT 'تكليف',
	"action_type" text DEFAULT 'تكليف',
	"order_number" text,
	"order_date" text,
	"assignment_order" text,
	"assignment_date" text,
	"responsibility" text,
	"primary_responsibility" text,
	"acting_responsibility" text,
	"acting_end_date" text,
	"deputy_level" text,
	"service_type" text DEFAULT 'دائم',
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_titles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'عام',
	"min_grade" integer DEFAULT 7,
	"min_step" integer DEFAULT 1,
	"next_title_id" integer,
	"status" text DEFAULT 'فعال',
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_accrual_runs" (
	"month" text PRIMARY KEY NOT NULL,
	"executed_at" timestamp DEFAULT now(),
	"employees_count" integer DEFAULT 0,
	"regular_days_added" real NOT NULL,
	"sick_days_added" real NOT NULL,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer,
	"leave_type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"days_count" integer NOT NULL,
	"status" text DEFAULT 'معلق',
	"remaining_balance" integer,
	"order_number" text,
	"medical_attachment" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_days" integer,
	"administrative_effect" text DEFAULT 'لا_يؤثر',
	"financial_effect" text DEFAULT 'براتب_كامل',
	"financial_deduction_percentage" integer DEFAULT 0,
	"affects_increment" boolean DEFAULT false,
	"affects_promotion" boolean DEFAULT false,
	"affects_commendations" boolean DEFAULT false,
	"salary_payment_type" text DEFAULT 'full',
	"effects_options" text,
	"description" text,
	"status" text DEFAULT 'فعال',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" integer,
	"manager_id" integer,
	"created_at" timestamp DEFAULT now(),
	"code" text,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "penalties" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"penalty_type" text NOT NULL,
	"penalty_date" text NOT NULL,
	"order_number" text,
	"reason" text,
	"status" text DEFAULT 'نافذ',
	"violation" text,
	"legal_article" text,
	"committee_decision_number" text,
	"decision_date" text,
	"implementation_date" text,
	"appeal_status" text DEFAULT 'لا يوجد',
	"days_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "penalty_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"salary_deduction_days" integer DEFAULT 0,
	"delay_months" integer DEFAULT 0,
	"status" text DEFAULT 'فعال',
	"created_at" timestamp DEFAULT now(),
	"salary_deduction_percent" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "performance_evaluations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"year" text NOT NULL,
	"total_score" integer DEFAULT 0,
	"grade" text DEFAULT 'بانتظار التقييم',
	"form_id" integer,
	"form_title" text,
	"scores_json" text,
	"evaluator" text,
	"evaluation_order" text,
	"evaluation_date" text,
	"weaknesses" text,
	"strengths" text,
	"training_needs" text,
	"employee_opinion" text,
	"notes" text,
	"status" text DEFAULT 'مرفوع للاعتماد',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_delay_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"reason_type" text NOT NULL,
	"description" text NOT NULL,
	"affects" text DEFAULT 'كلاهما' NOT NULL,
	"is_hidden" boolean DEFAULT false,
	"reminder_date" text,
	"is_auto_reminder" boolean DEFAULT true,
	"is_resolved" boolean DEFAULT false,
	"resolved_at" text,
	"source_reference_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotions_increments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"grade_before" text,
	"grade_after" text,
	"step_before" integer,
	"step_after" integer,
	"due_date" text NOT NULL,
	"order_number" text,
	"order_date" text,
	"seniority_months" integer DEFAULT 0,
	"seniority_reason" text,
	"manager_recommendation" text,
	"director_approval" text,
	"approved_by" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qualifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"level" text NOT NULL,
	"specialization" text,
	"sub_specialization" text,
	"university" text,
	"country" text,
	"graduation_year" integer,
	"graduation_date" text,
	"qualification_type" text,
	"average" text,
	"grade" text,
	"equation_number" text,
	"equation_date" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "responsibility_allowances" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"allowance_rate" real NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"description" text,
	"status" text DEFAULT 'فعال'
);
--> statement-breakpoint
CREATE TABLE "retirements" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"retirement_date" text,
	"reason" text,
	"service_duration" text,
	"pension_amount" text,
	"pension_order_number" text,
	"pension_order_date" text,
	"created_at" timestamp DEFAULT now(),
	"retirement_type" text NOT NULL,
	"effective_date" text,
	"order_number" text,
	"order_date" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "salary_allowances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"base_salary" text,
	"cost_of_living" text,
	"position_allowance" text,
	"degree_allowance" text,
	"hazard_transport" text,
	"university_technical" text,
	"retirement_deduction" text,
	"tax_deduction" text,
	"insurance_deduction" text,
	"loans_deduction" text,
	"net_salary" text,
	"bank_account" text,
	"bank_name" text,
	"allowance_type" text,
	"percentage" integer,
	"amount" integer,
	"order_number" text,
	"status" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salary_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"base_salary" integer NOT NULL,
	"total_allowances" integer DEFAULT 0,
	"total_deductions" integer DEFAULT 0,
	"net_salary" integer NOT NULL,
	"status" text DEFAULT 'مسودة',
	"created_at" timestamp DEFAULT now(),
	"allowances_breakdown" text,
	"deductions_breakdown" text,
	"payment_date" text,
	"payment_status" text DEFAULT 'مسودة'
);
--> statement-breakpoint
CREATE TABLE "salary_scale" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" integer NOT NULL,
	"step" integer NOT NULL,
	"amount" integer NOT NULL,
	"effective_from" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"credit_type" text NOT NULL,
	"calculated_years" integer DEFAULT 0,
	"calculated_months" integer DEFAULT 0,
	"calculated_days" integer DEFAULT 0,
	"order_number" text,
	"order_date" text,
	"purpose" text DEFAULT 'علاوة_وترفيع',
	"is_counted_for_promotion" boolean DEFAULT true,
	"is_counted_for_retirement" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"record_type" text NOT NULL,
	"order_number" text,
	"order_date" text,
	"years" integer DEFAULT 0,
	"months" integer DEFAULT 0,
	"days" integer DEFAULT 0,
	"purpose" text DEFAULT 'علاوة_وترفيع',
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"duration_years" integer DEFAULT 0,
	"duration_months" integer DEFAULT 0,
	"duration_days" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "service_types_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shift_systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"work_days" integer NOT NULL,
	"rest_days" integer NOT NULL,
	"shift_hours_type" text,
	"daily_hours" real,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"allowance_amount" integer DEFAULT 0,
	"status" text DEFAULT 'فعال'
);
--> statement-breakpoint
CREATE TABLE "specialization_course_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"snapshot_id" integer,
	"weeks" integer DEFAULT 1 NOT NULL,
	"course_date" text,
	"course_name" text,
	"provider" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform_name" text DEFAULT 'نظام إدارة شؤون الموظفين',
	"beneficiary_name" text DEFAULT 'وزارة الموارد البشرية العراقية',
	"copyright_text" text DEFAULT 'جميع الحقوق محفوظة © 2026',
	"primary_color" text DEFAULT '#1B3A6B',
	"secondary_color" text DEFAULT '#C8960C',
	"active_theme" text DEFAULT 'أزرق ملكي',
	"font_family" text DEFAULT 'Cairo',
	"logo_url" text DEFAULT 'https://img.icons8.com/color/48/gender-neutral-user.png',
	"work_start_hour" text DEFAULT '08:00',
	"work_end_hour" text DEFAULT '15:00',
	"official_holidays" text DEFAULT 'الجمعة, السبت',
	"backup_frequency" text DEFAULT 'يومي',
	"max_children_count" integer DEFAULT 4,
	"retirement_age" integer DEFAULT 60,
	"retirement_notification_period" text DEFAULT 'three_months',
	"retirement_notification_days" integer DEFAULT 90,
	"degree_track_auto_settlement" boolean DEFAULT false,
	"monthly_regular_leave_days" real DEFAULT 3,
	"monthly_sick_leave_days" real DEFAULT 2.5,
	"max_regular_leave_accumulation" real DEFAULT 180,
	"max_sick_leave_accumulation" real DEFAULT 180,
	"auto_monthly_leave_accrual" boolean DEFAULT true,
	"last_leave_accrual_month" text DEFAULT '',
	"last_leave_accrual_date" text DEFAULT '',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer,
	"employee_code" text,
	"full_name" text NOT NULL,
	"trainer_code" text,
	"course_categories" text,
	"specialty_details" text,
	"specialization" text,
	"trainer_type" text DEFAULT 'داخلي',
	"organization" text,
	"phone" text,
	"work_phone" text,
	"email" text,
	"status" text DEFAULT 'معتمد',
	"rating" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"course_name" text NOT NULL,
	"course_type" text,
	"provider" text,
	"location" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"duration_days" integer DEFAULT 1,
	"average" text,
	"grade" text,
	"rank" text,
	"source_training_id" integer,
	"created_at" timestamp DEFAULT now(),
	"duration_hours" integer DEFAULT 0,
	"is_specialized" boolean DEFAULT false,
	"training_center" text,
	"status" text DEFAULT 'ناجح',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "training_enrollments" (
	"id" serial PRIMARY KEY NOT NULL,
	"training_id" integer NOT NULL,
	"employee_id" integer,
	"is_external_participant" boolean DEFAULT false,
	"external_participant_name" text,
	"external_participant_entity" text,
	"external_participant_phone" text,
	"enrollment_date" text,
	"result" text DEFAULT 'قيد التقييم',
	"score" text,
	"grade" text,
	"certificate_number" text,
	"certificate_type" text,
	"certificate_issue_date" text,
	"trainer_rating" text,
	"course_feedback" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trainings" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer DEFAULT 2026,
	"track" text DEFAULT 'تدريب داخلي',
	"course_name" text NOT NULL,
	"category" text DEFAULT 'إدارية',
	"course_type" text DEFAULT 'حضوري',
	"location_type" text DEFAULT 'موقعي',
	"location" text,
	"country" text,
	"provider" text,
	"trainer_id" integer,
	"trainer_name" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"hours" integer DEFAULT 0,
	"days" integer DEFAULT 1,
	"order_number" text,
	"course_code" text,
	"is_outside_plan" boolean DEFAULT false,
	"target_audience" text,
	"duration_value" integer DEFAULT 1,
	"duration_unit" text DEFAULT 'بالأيام',
	"outside_plan_reason" text,
	"trainer_rating" text,
	"course_feedback" text,
	"description" text,
	"status" text DEFAULT 'مخطط',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"transfer_type" text NOT NULL,
	"from_entity" text,
	"to_entity" text,
	"start_date" text,
	"end_date" text,
	"order_number" text,
	"created_at" timestamp DEFAULT now(),
	"from_dept" text,
	"to_dept" text,
	"from_location" text,
	"to_location" text,
	"order_date" text,
	"effective_date" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"name" text,
	"role" text DEFAULT 'user',
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_key" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "work_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"allowance_amount" real DEFAULT 0,
	"work_start_hour" text DEFAULT '08:00',
	"work_end_hour" text DEFAULT '15:00',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "annual_evaluations" ADD CONSTRAINT "annual_evaluations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "degree_track_simulation_steps" ADD CONSTRAINT "degree_track_simulation_steps_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."degree_track_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "degree_track_snapshots" ADD CONSTRAINT "degree_track_snapshots_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "degree_track_snapshots" ADD CONSTRAINT "degree_track_snapshots_job_title_id_fkey" FOREIGN KEY ("job_title_id") REFERENCES "public"."job_titles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "degree_track_snapshots" ADD CONSTRAINT "degree_track_snapshots_qualification_id_fkey" FOREIGN KEY ("qualification_id") REFERENCES "public"."qualifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_delay_reasons" ADD CONSTRAINT "promotion_delay_reasons_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions_increments" ADD CONSTRAINT "promotions_increments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retirements" ADD CONSTRAINT "retirements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_allowances" ADD CONSTRAINT "salary_allowances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_credits" ADD CONSTRAINT "service_credits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialization_course_credits" ADD CONSTRAINT "specialization_course_credits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialization_course_credits" ADD CONSTRAINT "specialization_course_credits_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."degree_track_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_archived_items_created_at" ON "archived_items" USING btree ("created_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_archived_items_entity_type" ON "archived_items" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_employees_department" ON "employees" USING btree ("department");--> statement-breakpoint
CREATE INDEX "idx_employees_education_level" ON "employees" USING btree ("education_level");--> statement-breakpoint
CREATE INDEX "idx_employees_ethnicity" ON "employees" USING btree ("ethnicity");--> statement-breakpoint
CREATE INDEX "idx_employees_full_name" ON "employees" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "idx_employees_gender" ON "employees" USING btree ("gender");--> statement-breakpoint
CREATE INDEX "idx_employees_grade" ON "employees" USING btree ("grade");--> statement-breakpoint
CREATE INDEX "idx_employees_job_title" ON "employees" USING btree ("job_title");--> statement-breakpoint
CREATE INDEX "idx_employees_marital_status" ON "employees" USING btree ("marital_status");--> statement-breakpoint
CREATE INDEX "idx_employees_primary_responsibility" ON "employees" USING btree ("primary_responsibility");--> statement-breakpoint
CREATE INDEX "idx_employees_religion" ON "employees" USING btree ("religion");--> statement-breakpoint
CREATE INDEX "idx_employees_section" ON "employees" USING btree ("section");--> statement-breakpoint
CREATE INDEX "idx_employees_service_type" ON "employees" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "idx_employees_shift_system_id" ON "employees" USING btree ("shift_system_id");--> statement-breakpoint
CREATE INDEX "idx_employees_status" ON "employees" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_employees_step" ON "employees" USING btree ("step");--> statement-breakpoint
CREATE INDEX "idx_employees_work_location" ON "employees" USING btree ("work_location");--> statement-breakpoint
CREATE INDEX "idx_employees_work_shift_type" ON "employees" USING btree ("work_shift_type");--> statement-breakpoint
CREATE INDEX "idx_employees_created_at" ON "employees" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_employees_full_name_trgm" ON "employees" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_employees_civil_service_number_trgm" ON "employees" USING gin ("civil_service_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_employees_service_record_number_trgm" ON "employees" USING gin ("service_record_number" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "training_courses_emp_source_training_uq" ON "training_courses" USING btree ("employee_id","source_training_id") WHERE source_training_id IS NOT NULL;