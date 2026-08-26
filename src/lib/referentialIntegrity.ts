// src/lib/referentialIntegrity.ts
import { doesEmployeeMatchCriteria } from './salaryTable.js';

export interface ReferentialCheckResult {
  canProceed: boolean;
  count: number;
  message?: string;
  affectedSummary?: string;
}

export interface ReferentialContext {
  employees?: any[];
  jobAssignments?: any[];
  qualifications?: any[];
  penalties?: any[];
  performanceEvaluations?: any[];
  governingCourseAssignments?: any[];
  allowanceRules?: Record<string, any>;
  temporaryMeta?: Record<string, any>;
  entities?: Record<string, any[]>;
}

/**
 * Checks if an administrative/financial setting entity is currently actively referenced
 * by employees or ongoing administrative records before allowing manual deletion or deactivation.
 *
 * @param entityType The type of entity ('job_titles', 'shift_systems', 'allowances_deductions', 'education_degrees', 'responsibility_allowances', 'penalty_types', 'evaluation_forms', 'governing_courses')
 * @param entityId The ID of the record
 * @param isDeactivation True if the action is setting status to disabled/inactive/stopped, False if deleting
 * @param context In-memory or database context for checking
 */
export function checkReferentialUsage(
  entityType: string,
  entityId: number | string,
  isDeactivation = false,
  context: ReferentialContext = {}
): ReferentialCheckResult {
  const actionVerb = isDeactivation ? 'إيقاف / تعطيل' : 'حذف';
  const idStr = String(entityId);
  const idNum = parseInt(idStr, 10);

  const employees = context.employees || [];
  const activeEmployees = employees.filter(e => {
    const s = e.status || e.employeeStatus || '';
    return s !== 'مستقيل' && s !== 'مفصول' && s !== 'منقول خارجياً';
  });

  switch (entityType) {
    case 'job_titles':
    case 'jobTitles': {
      const titles = context.entities?.job_titles || context.entities?.['job-titles'] || [];
      const titleItem = titles.find((t: any) => String(t.id) === idStr);
      const titleName = titleItem?.name ? titleItem.name.trim().toLowerCase() : '';

      const matchedEmployees = activeEmployees.filter(e => {
        const empTitle = (e.job_title || e.jobTitle || '').trim().toLowerCase();
        return empTitle && (empTitle === titleName || String(e.job_title_id || e.jobTitleId) === idStr);
      });

      const jobAssignments = context.jobAssignments || [];
      const matchedAssignments = jobAssignments.filter((ja: any) => {
        const jaTitle = (ja.job_title || ja.jobTitle || '').trim().toLowerCase();
        return jaTitle && jaTitle === titleName;
      });

      const totalCount = new Set([
        ...matchedEmployees.map(e => `emp_${e.id}`),
        ...matchedAssignments.map(ja => `assign_${ja.id || ja.employee_id || ja.employeeId}`)
      ]).size;

      if (totalCount > 0) {
        return {
          canProceed: false,
          count: totalCount,
          message: `لا يمكن ${actionVerb} هذا العنوان الوظيفي، مستخدم حالياً من قبل ${totalCount} موظف/سجل وظيفي نشط.`,
          affectedSummary: `مرتبط بـ ${matchedEmployees.length} موظف و ${matchedAssignments.length} سجل تكليف وظيفي.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'shift_systems':
    case 'shiftSystems': {
      const shiftSystems = context.entities?.shift_systems || context.entities?.['shift-systems'] || [];
      const shiftItem = shiftSystems.find((s: any) => String(s.id) === idStr);
      const shiftName = shiftItem?.name ? shiftItem.name.trim().toLowerCase() : '';

      const matched = activeEmployees.filter(e => {
        const sid = String(e.shift_system_id || e.shiftSystemId || '');
        const sName = (e.shift_system_name || e.shiftSystemName || '').trim().toLowerCase();
        return (sid && sid === idStr) || (shiftName && sName === shiftName);
      });

      if (matched.length > 0) {
        return {
          canProceed: false,
          count: matched.length,
          message: `لا يمكن ${actionVerb} نظام المناوبة هذا، مسند حالياً لـ ${matched.length} موظف.`,
          affectedSummary: `مسند إلى ${matched.length} موظف على جدول المناوبة.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'allowances_deductions':
    case 'allowancesDeductions': {
      const items = context.entities?.allowances_deductions || context.entities?.['allowances-deductions'] || [];
      const target = items.find((i: any) => String(i.id) === idStr);
      const isDeduction = target?.type === 'deduction';
      const entityLabel = isDeduction ? 'الاستقطاع' : 'المخصص';

      // Check if temporary
      const meta = context.temporaryMeta?.[idStr] || (typeof localStorage !== 'undefined' ? (() => {
        try {
          const raw = localStorage.getItem(`TEMPORARY_META_${idStr}`);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })() : null);

      const isTemporary = Boolean(meta?.isTemporary);

      // EXCEPTION: If temporary and action is deactivation (auto-expiration or manual status sync), ALLOW
      if (isTemporary && isDeactivation) {
        return { canProceed: true, count: 0 };
      }

      // Read rules for this allowance/deduction
      const rule = context.allowanceRules?.[idStr] || (typeof localStorage !== 'undefined' ? (() => {
        try {
          const ruleKey = isDeduction ? `DEDUCTION_RULES_${idStr}` : `ALLOWANCE_RULES_${idStr}`;
          const raw = localStorage.getItem(ruleKey);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })() : null);

      let eligibleEmployeesCount = 0;

      if (!rule) {
        // No custom criteria rule means granted/applied to all active employees by default!
        eligibleEmployeesCount = activeEmployees.length;
      } else {
        // Evaluate eligibility based on criteria
        eligibleEmployeesCount = activeEmployees.filter(emp => {
          // Blocklist check
          const empId = emp.id;
          const empNum = emp.employee_number || emp.employeeNumber || emp.civil_service_number || emp.civilServiceNumber;
          if (rule.blockedEmployees && rule.blockedEmployees.length > 0) {
            if (
              rule.blockedEmployees.includes(empId) ||
              rule.blockedEmployees.includes(String(empId)) ||
              rule.blockedEmployees.includes(Number(empId)) ||
              (empNum && rule.blockedEmployees.includes(empNum)) ||
              (empNum && rule.blockedEmployees.includes(String(empNum)))
            ) {
              return false;
            }
          }
          return doesEmployeeMatchCriteria(emp, rule);
        }).length;
      }

      if (eligibleEmployeesCount > 0) {
        return {
          canProceed: false,
          count: eligibleEmployeesCount,
          message: `لا يمكن ${actionVerb} هذا ${entityLabel} (${target?.name || ''})، مستحق/مطبق حالياً على ${eligibleEmployeesCount} موظف.`,
          affectedSummary: `يستفيد منه أو يطبق على ${eligibleEmployeesCount} موظف نشط.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'education_degrees':
    case 'educationDegrees': {
      const degrees = context.entities?.education_degrees || context.entities?.['education-degrees'] || [];
      const degreeItem = degrees.find((d: any) => String(d.id) === idStr);
      const degreeName = degreeItem?.name ? degreeItem.name.trim().toLowerCase() : '';

      const matchedEmployees = activeEmployees.filter(e => {
        const empEdu = (e.education_level || e.educationLevel || '').trim().toLowerCase();
        return empEdu && (empEdu === degreeName || String(e.education_degree_id || e.educationDegreeId) === idStr);
      });

      const qualifications = context.qualifications || [];
      const matchedQualifications = qualifications.filter((q: any) => {
        const qLevel = (q.level || q.education_level || q.educationLevel || '').trim().toLowerCase();
        return qLevel && qLevel === degreeName && (q.is_active !== false && q.isActive !== false);
      });

      const totalCount = new Set([
        ...matchedEmployees.map(e => `emp_${e.id}`),
        ...matchedQualifications.map(q => `qual_${q.id || q.employee_id || q.employeeId}`)
      ]).size;

      if (totalCount > 0) {
        return {
          canProceed: false,
          count: totalCount,
          message: `لا يمكن ${actionVerb} هذه الشهادة العلمية (${degreeItem?.name || ''})، مرتبطة حالياً بـ ${totalCount} موظف/مؤهل دراسي مسجل.`,
          affectedSummary: `مرتبطة بـ ${matchedEmployees.length} موظف و ${matchedQualifications.length} قيد مؤهل معتمد.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'responsibility_allowances':
    case 'responsibilityAllowances': {
      const resps = context.entities?.responsibility_allowances || context.entities?.['responsibility-allowances'] || [];
      const respItem = resps.find((r: any) => String(r.id) === idStr);
      const respName = respItem?.name ? respItem.name.trim().toLowerCase() : '';

      const matchedEmployees = activeEmployees.filter(e => {
        const pResp = (e.primary_responsibility || e.primaryResponsibility || '').trim().toLowerCase();
        const aResp = (e.acting_responsibility || e.actingResponsibility || '').trim().toLowerCase();
        return (pResp && pResp === respName) || (aResp && aResp === respName);
      });

      const jobAssignments = context.jobAssignments || [];
      const matchedAssignments = jobAssignments.filter((ja: any) => {
        const jaResp = (ja.responsibility || ja.primary_responsibility || ja.primaryResponsibility || '').trim().toLowerCase();
        return jaResp && jaResp === respName;
      });

      const totalCount = new Set([
        ...matchedEmployees.map(e => `emp_${e.id}`),
        ...matchedAssignments.map(ja => `assign_${ja.id || ja.employee_id || ja.employeeId}`)
      ]).size;

      if (totalCount > 0) {
        return {
          canProceed: false,
          count: totalCount,
          message: `لا يمكن ${actionVerb} مخصص المسؤولية/المنصب (${respItem?.name || ''})، مسند حالياً لـ ${totalCount} موظف/سجل تكليف.`,
          affectedSummary: `مسند إلى ${matchedEmployees.length} موظف و ${matchedAssignments.length} أمر تكليف.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'penalty_types':
    case 'penaltyTypes': {
      const pTypes = context.entities?.penalty_types || context.entities?.['penalty-types'] || [];
      const ptItem = pTypes.find((p: any) => String(p.id) === idStr);
      const ptName = ptItem?.name ? ptItem.name.trim().toLowerCase() : '';

      const penalties = context.penalties || [];
      const activePenalties = penalties.filter((p: any) => {
        const pName = (p.penalty_type || p.penaltyType || '').trim().toLowerCase();
        const pStatus = p.status || 'نافذ';
        return pName && pName === ptName && (pStatus === 'نافذ' || pStatus === 'ساري' || pStatus === 'مفعل');
      });

      if (activePenalties.length > 0) {
        return {
          canProceed: false,
          count: activePenalties.length,
          message: `لا يمكن ${actionVerb} نوع العقوبة (${ptItem?.name || ''})، مرتبط حالياً بـ ${activePenalties.length} عقوبة إدارية نافذة.`,
          affectedSummary: `يوجد ${activePenalties.length} عقوبة نافذة مسجلة بهذا النوع.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'evaluation_forms':
    case 'evaluationForms': {
      const forms = context.entities?.evaluation_forms || context.entities?.['evaluation-forms'] || [];
      const formItem = forms.find((f: any) => String(f.id) === idStr);
      const formTitle = formItem?.title ? formItem.title.trim().toLowerCase() : '';

      const evals = context.performanceEvaluations || [];
      const ongoingEvals = evals.filter((ev: any) => {
        const fId = String(ev.form_id || ev.formId || '');
        const fTitle = (ev.form_title || ev.formTitle || '').trim().toLowerCase();
        const evStatus = ev.status || '';
        const isOngoing = evStatus !== 'معتمد' && evStatus !== 'مؤرشف' && evStatus !== 'ملغى';
        return ((fId && fId === idStr) || (formTitle && fTitle === formTitle)) && isOngoing;
      });

      if (ongoingEvals.length > 0) {
        return {
          canProceed: false,
          count: ongoingEvals.length,
          message: `لا يمكن ${actionVerb} استمارة التقييم (${formItem?.title || ''})، مستخدمة حالياً في ${ongoingEvals.length} دورة تقييم جارية لم تعتمد بعد.`,
          affectedSummary: `مستخدمة في ${ongoingEvals.length} تقييم قيد التعبئة أو الاعتماد.`
        };
      }
      return { canProceed: true, count: 0 };
    }

    case 'governing_courses':
    case 'governingCourses': {
      const courses = context.entities?.governing_courses || context.entities?.['governing-courses'] || [];
      const courseItem = courses.find((c: any) => String(c.id) === idStr);
      const courseGrade = courseItem?.grade ? parseInt(String(courseItem.grade), 10) : null;
      const courseName = courseItem?.course_name || courseItem?.courseName || '';

      const assignments = context.governingCourseAssignments || [];
      const directAssigned = assignments.filter((a: any) => {
        const status = a.status || 'مشمول';
        if (status !== 'مشمول') return false;
        if (a.assigned_courses || a.assignedCourses) {
          const list = Array.isArray(a.assigned_courses) ? a.assigned_courses : (typeof a.assigned_courses === 'string' ? JSON.parse(a.assigned_courses || '[]') : []);
          return list.includes(idNum) || list.includes(idStr) || list.includes(courseName);
        }
        return false;
      });

      // Also check active employees in that grade who are continuing service
      const gradeEmployees = courseGrade ? activeEmployees.filter(e => {
        const empGrade = parseInt(String(e.grade || 0), 10);
        return empGrade === courseGrade;
      }) : [];

      const totalCount = Math.max(directAssigned.length, gradeEmployees.length);

      if (totalCount > 0) {
        return {
          canProceed: false,
          count: totalCount,
          message: `لا يمكن ${actionVerb} هذه الدورة الحاكمة (${courseName})، مشمول بها حالياً ${totalCount} موظف لغرض الترفيع والعلاوة.`,
          affectedSummary: `مشمول بها ${totalCount} موظف في الدرجة الوظيفية (${courseGrade || 'المحددة'}).`
        };
      }
      return { canProceed: true, count: 0 };
    }

    default:
      return { canProceed: true, count: 0 };
  }
}

/**
 * Validates an imported employee Excel row against the system's authoritative settings tables.
 *
 * @param row The row data from the Excel file
 * @param lookupData Authoritative system settings (active job titles, education degrees, shift systems, salary scale)
 */
export function validateEmployeeImportRow(
  row: any,
  lookupData: {
    jobTitles?: any[];
    educationDegrees?: any[];
    shiftSystems?: any[];
    salaryScaleMap?: Record<number | string, Record<number | string, number>>;
  }
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Mandatory base fields
  const firstName = (row.firstName || row.first_name || row.fullName || row.full_name || '').trim();
  const companyNumber = (row.companyNumber || row.company_number || row.employeeNumber || row.employee_number || '').trim();

  if (!firstName) {
    errors.push('الاسم الأول أو الاسم الكامل مفقود');
  }
  if (!companyNumber) {
    errors.push('رقم الشركة الموحد أو الرقم الوظيفي مفقود');
  }

  // 2. Validate Job Title against active job_titles
  const rawJobTitle = (row.jobTitle || row.job_title || '').trim();
  if (rawJobTitle) {
    const jobTitles = lookupData.jobTitles || [];
    const matchedTitle = jobTitles.find((t: any) => {
      const name = (t.name || '').trim().toLowerCase();
      return name === rawJobTitle.toLowerCase();
    });

    if (!matchedTitle) {
      errors.push(`العنوان الوظيفي ('${rawJobTitle}') غير موجود بدليل العناوين الوظيفية المعتمد`);
    } else if (matchedTitle.status === 'معطل' || matchedTitle.status === 'غير فعال') {
      errors.push(`العنوان الوظيفي ('${rawJobTitle}') معطل في دليل العناوين الوظيفية`);
    }
  }

  // 3. Validate Education Degree against education_degrees
  const rawEduLevel = (row.educationLevel || row.education_level || '').trim();
  if (rawEduLevel) {
    const educationDegrees = lookupData.educationDegrees || [];
    const matchedDegree = educationDegrees.find((d: any) => {
      const name = (d.name || '').trim().toLowerCase();
      return name === rawEduLevel.toLowerCase();
    });

    if (!matchedDegree) {
      errors.push(`التحصيل الدراسي ('${rawEduLevel}') غير مسجل في دليل الشهادات الدراسية المعتمد`);
    }
  }

  // 4. Validate Shift System against shift_systems
  const rawShiftName = (row.shiftSystemName || row.shift_system_name || '').trim();
  const workShiftType = (row.workShiftType || row.work_shift_type || 'صباحي').trim();

  if (workShiftType === 'مناوب' || rawShiftName) {
    if (rawShiftName) {
      const shiftSystems = lookupData.shiftSystems || [];
      const matchedShift = shiftSystems.find((s: any) => {
        const name = (s.name || '').trim().toLowerCase();
        return name === rawShiftName.toLowerCase();
      });

      if (!matchedShift) {
        errors.push(`نظام المناوبة ('${rawShiftName}') غير موجود بأنظمة المناوبة المعتمدة`);
      }
    }
  }

  // 5. Validate Grade & Step against salary scale bounds
  const rawGrade = String(row.grade || '').trim().replace(/[^\d]/g, '');
  const rawStep = String(row.step || '').trim().replace(/[^\d]/g, '');

  if (!rawGrade) {
    errors.push('الدرجة الوظيفية مفقودة');
  } else {
    const gradeNum = parseInt(rawGrade, 10);
    if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 13) {
      errors.push(`الدرجة الوظيفية (${rawGrade}) خارج نطاق درجات سلم الرواتب المعتمد (1 - 13)`);
    } else if (!rawStep) {
      errors.push('المرحلة الوظيفية مفقودة');
    } else {
      const stepNum = parseInt(rawStep, 10);
      if (isNaN(stepNum) || stepNum < 1 || stepNum > 11) {
        errors.push(`المرحلة الوظيفية (${rawStep}) خارج نطاق مراحل سلم الرواتب المعتمد (1 - 11)`);
      } else if (lookupData.salaryScaleMap) {
        const scaleGrade = lookupData.salaryScaleMap[gradeNum] || lookupData.salaryScaleMap[String(gradeNum)];
        if (scaleGrade && scaleGrade[stepNum] === undefined && scaleGrade[String(stepNum)] === undefined) {
          errors.push(`الدرجة (${gradeNum}) والمرحلة (${stepNum}) غير معرفة في جدول سلم الرواتب`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}
