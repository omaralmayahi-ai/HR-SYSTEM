// server/routes/legacy/promotions.ts — نُقل حرفياً من server.ts (B3، الدفعات 3–7).
// الاعتماديات تصل صراحة عبر deps. التنظيف (حذف فروع الذاكرة وكتابة الأنواع) يتم لاحقاً مجالاً مجالاً.
import type { Express } from 'express';
import type { AuthRequest } from '../../../src/middleware/auth.ts';

export function registerPromotionsRoutes(app: Express, deps: any) {
  const {
    and, bothCases, calculateDegreeTrackSimulation, camelToSnake, db, eq,
    findMatchingJobTitleForPromotion, formatDateString, genericMemoryStores, inArray, isDateOnOrAfter, isDbConnectionFailure,
    isNotNull, jobTitlesCache, loadAllEngineContexts, loadPenaltyTypesForEngine, mapKeys, mem,
    processBatchDegreeTrackAutoSettlement, requireAdmin, requireAuth, requireWriter, resolveTargetJobTitle, saveLocalDb,
    schema, sendRouteError, settingsLists, sql, toEngineLeave, triggerRecalculateEligibility, dueListCache, writeDueDatesBulk,
  } = deps;

  // 4. Promotions, Increments & Degree Recognition Due List (قوائم المستحقين الثلاث مع كافة المؤثرات والتواريخ)
  // أداء: الاحتساب لكل الموظفين يُنفَّذ مرة وحدة ويشترك به كل الطلبات المتزامنة (لوحة التحكم + صفحة
  // المستحقين)، والنتيجة تُحفظ دقيقتين وتُبطل عند أي عملية كتابة ناجحة (dueListCache.invalidate).
  async function computeDueList() {
      const dueForIncrement: any[] = [];
      const dueForPromotion: any[] = [];
      const dueForSettlement: any[] = [];

      // إصلاح عاجل: الموظفون ومدخلات المحرك من القاعدة بقراءة واحدة لكل جدول (كانت من الذاكرة ← قائمة فارغة بعد B2e)
      const bulk = await loadAllEngineContexts(db, schema);
      const penaltyTypes = await loadPenaltyTypesForEngine();
      const dueDateWrites: any[] = [];
      for (const rawEmp of bulk.employees) {
        try {
          const emp: any = bothCases(rawEmp);
          const empId = parseInt(String(emp.id));
          if (!empId) continue;

          // Skip inactive or separated employees
          const empStatus = emp.status || 'نشط';
          if (['منتهية_خدمته', 'متقاعد', 'مفصول', 'مستقيل', 'متوفى'].includes(empStatus)) {
            continue;
          }

          // Recalculate standard eligibility
          const eligibility = await triggerRecalculateEligibility(empId, bulk.get(empId), { penaltyTypes, penaltyTypesLoaded: true, collectDueDateWrites: dueDateWrites });

          const currentTitle = emp.jobTitle || emp.job_title || 'موظف';
          const basePromotionDate = emp.lastPromotionDate || emp.last_promotion_date || emp.gradeDate || emp.grade_date || emp.currentAppointmentDate || emp.current_appointment_date || emp.appointmentDate || emp.appointment_date || emp.firstAppointmentDate || emp.first_appointment_date || '';
          const baseIncrementDate = emp.lastIncrementDate || emp.last_increment_date || emp.gradeDate || emp.grade_date || emp.currentAppointmentDate || emp.current_appointment_date || emp.appointmentDate || emp.appointment_date || emp.firstAppointmentDate || emp.first_appointment_date || '';

          // 1. Check Increment Eligibility (علاوة سنوية)
          if (
            eligibility?.increment?.eligibilityStatus === 'مستحق_للعلاوة' &&
            eligibility?.increment?.isIncrementEligible
          ) {
            const currentStep = parseInt(String(emp.step)) || 1;
            const targetStep = Math.min(11, currentStep + 1);
            const incCommCount = eligibility.increment.appliedCommendationsCount || 0;
            const incCommMonths = eligibility.increment.commendationMonthsDeducted || 0;
            const incPenCount = eligibility.increment.appliedPenaltiesCount || 0;
            const incPenMonths = eligibility.increment.penaltyMonthsAdded || 0;
            const incAbsenceDays = eligibility.increment.appliedAbsenceDays || 0;
            const incServiceCredit = eligibility.increment.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
            const incServiceMonths = (incServiceCredit.years || 0) * 12 + (incServiceCredit.months || 0);

            // Construct readable other factors for increment
            const incOtherFactors: string[] = [];
            if (incServiceMonths > 0 || (incServiceCredit.days || 0) > 0) {
              incOtherFactors.push(`خدمة مضافة: ${incServiceCredit.years > 0 ? `${incServiceCredit.years} سنة و ` : ''}${incServiceCredit.months > 0 ? `${incServiceCredit.months} شهر` : ''}${incServiceCredit.days > 0 ? ` و ${incServiceCredit.days} يوم` : ''}`);
            }
            if (incAbsenceDays > 0) {
              incOtherFactors.push(`أيام غياب/إجازات غير اعتيادية: ${incAbsenceDays} يوم`);
            }
            if (incOtherFactors.length === 0) {
              incOtherFactors.push('استيفاء كامل المدة الزمنية والضوابط القانونية');
            }

            dueForIncrement.push({
              employeeId: empId,
              employee_id: empId,
              name: emp.fullName || emp.full_name || emp.name,
              fullName: emp.fullName || emp.full_name || emp.name,
              department: emp.department || 'عام',
              jobTitle: currentTitle,
              currentGrade: emp.grade,
              current_grade: emp.grade,
              currentStep: currentStep,
              current_step: currentStep,
              targetGrade: emp.grade,
              target_grade: emp.grade,
              targetStep: targetStep,
              target_step: targetStep,
              // Previous and Next Dates
              lastIncrementDate: eligibility.increment.lastIncrementDate || baseIncrementDate,
              last_increment_date: eligibility.increment.lastIncrementDate || baseIncrementDate,
              nextIncrementDueDate: eligibility.increment.nextIncrementDueDate,
              next_increment_due_date: eligibility.increment.nextIncrementDueDate,
              dueDate: eligibility.increment.nextIncrementDueDate,
              due_date: eligibility.increment.nextIncrementDueDate,
              baseDueDate: eligibility.increment.baseDueDate || eligibility.increment.nextIncrementDueDate,
              base_due_date: eligibility.increment.baseDueDate || eligibility.increment.nextIncrementDueDate,
              // Commendation Letters & Impact
              commendationsCount: incCommCount,
              commendations_count: incCommCount,
              commendationMonths: incCommMonths,
              commendation_months: incCommMonths,
              commendationImpactText: incCommCount > 0 ? `${incCommCount} كتاب شكر (تقديم ${incCommMonths} شهر)` : 'لا يوجد',
              commendation_impact_text: incCommCount > 0 ? `${incCommCount} كتاب شكر (تقديم ${incCommMonths} شهر)` : 'لا يوجد',
              // Penalties & Impact
              penaltiesCount: incPenCount,
              penalties_count: incPenCount,
              penaltyDelayMonths: incPenMonths,
              penalty_delay_months: incPenMonths,
              penaltyImpactText: incPenCount > 0 ? `${incPenCount} عقوبة (تأخير ${incPenMonths} شهر)` : 'سجل نظيف',
              penalty_impact_text: incPenCount > 0 ? `${incPenCount} عقوبة (تأخير ${incPenMonths} شهر)` : 'سجل نظيف',
              // Other Factors
              serviceCreditDuration: incServiceCredit,
              service_credit_duration: incServiceCredit,
              serviceCreditMonths: incServiceMonths,
              service_credit_months: incServiceMonths,
              absenceDays: incAbsenceDays,
              absence_days: incAbsenceDays,
              otherFactors: incOtherFactors,
              other_factors: incOtherFactors,
              trackType: 'المسار_الاعتيادي',
              track_type: 'المسار_الاعتيادي',
              actionType: 'علاوة',
              action_type: 'علاوة',
              noGradeChange: true,
              no_grade_change: true,
              reasons: [eligibility.increment.statusReason || 'استوفى الموظف المدة الزمنية وشروط استحقاق العلاوة السنوية']
            });
          }

          // 2. Check Degree Track Snapshot Deficit Settlement
          const activeSnap = (genericMemoryStores['degree-track-snapshots'] || []).find(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && (s.status === 'نشط' || !s.status)
          );

          let hasHandledDegreeTrack = false;
          if (activeSnap) {
            const specCredits = (genericMemoryStores['specialization-credits'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empId);
            const p = (genericMemoryStores['penalties'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
            const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId).map(toEngineLeave);
            const a = (genericMemoryStores['attendance'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);

            const sim = calculateDegreeTrackSimulation(activeSnap, { specializationCredits: specCredits, penalties: p, leaves: l, attendances: a });
            if (sim.hasDeficit) {
              hasHandledDegreeTrack = true;
              if (sim.realTimeNextPromotion?.isEligible && sim.realTimeNextPromotion?.eligibilityStatus === 'مستحق_للترفيع') {
                const settCommCount = sim.realTimeNextPromotion.appliedCommendationsCount || 0;
                const settCommMonths = sim.realTimeNextPromotion.commendationMonthsDeducted || 0;
                const settPenCount = sim.realTimeNextPromotion.appliedPenaltiesCount || 0;
                const settPenMonths = sim.realTimeNextPromotion.penaltyMonthsAdded || 0;
                const settServiceCredit = sim.realTimeNextPromotion.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
                const settServiceMonths = (settServiceCredit.years || 0) * 12 + (settServiceCredit.months || 0);

                const settOtherFactors: string[] = [
                  'استيفاء مدة العجز بسنتين خدمة فعلية في الدرجة الحالية',
                  sim.specializationCourseCompleted ? 'اجتياز دورة الاختصاص بنجاح' : 'دورة الاختصاص مستوفاة'
                ];
                if (settServiceMonths > 0) {
                  settOtherFactors.push(`خدمة محتسبة: ${settServiceCredit.years > 0 ? `${settServiceCredit.years} سنة و ` : ''}${settServiceCredit.months} شهر`);
                }

                dueForSettlement.push({
                  employeeId: empId,
                  employee_id: empId,
                  name: emp.fullName || emp.full_name || emp.name,
                  fullName: emp.fullName || emp.full_name || emp.name,
                  department: emp.department || 'عام',
                  jobTitle: currentTitle,
                  currentGrade: emp.grade || activeSnap.actualGradeBefore,
                  current_grade: emp.grade || activeSnap.actualGradeBefore,
                  currentStep: emp.step || activeSnap.actualStepBefore,
                  current_step: emp.step || activeSnap.actualStepBefore,
                  targetGrade: emp.grade || activeSnap.actualGradeBefore,
                  target_grade: emp.grade || activeSnap.actualGradeBefore,
                  targetStep: emp.step || activeSnap.actualStepBefore,
                  target_step: emp.step || activeSnap.actualStepBefore,
                  // Dates
                  lastPromotionDate: activeSnap.actualPromotionDateBefore || basePromotionDate,
                  last_promotion_date: activeSnap.actualPromotionDateBefore || basePromotionDate,
                  nextPromotionDueDate: sim.realTimeNextPromotion.nextPromotionDueDate,
                  next_promotion_due_date: sim.realTimeNextPromotion.nextPromotionDueDate,
                  dueDate: sim.realTimeNextPromotion.nextPromotionDueDate,
                  due_date: sim.realTimeNextPromotion.nextPromotionDueDate,
                  baseDueDate: sim.realTimeNextPromotion.baseDueDate || sim.realTimeNextPromotion.nextPromotionDueDate,
                  base_due_date: sim.realTimeNextPromotion.baseDueDate || sim.realTimeNextPromotion.nextPromotionDueDate,
                  // Commendation Letters & Impact
                  commendationsCount: settCommCount,
                  commendations_count: settCommCount,
                  commendationMonths: settCommMonths,
                  commendation_months: settCommMonths,
                  commendationImpactText: settCommCount > 0 ? `${settCommCount} كتاب شكر (تقديم ${settCommMonths} شهر)` : 'لا يوجد',
                  commendation_impact_text: settCommCount > 0 ? `${settCommCount} كتاب شكر (تقديم ${settCommMonths} شهر)` : 'لا يوجد',
                  // Penalties & Impact
                  penaltiesCount: settPenCount,
                  penalties_count: settPenCount,
                  penaltyDelayMonths: settPenMonths,
                  penalty_delay_months: settPenMonths,
                  penaltyImpactText: settPenCount > 0 ? `${settPenCount} عقوبة (تأخير ${settPenMonths} شهر)` : 'سجل نظيف',
                  penalty_impact_text: settPenCount > 0 ? `${settPenCount} عقوبة (تأخير ${settPenMonths} شهر)` : 'سجل نظيف',
                  // Other Factors
                  serviceCreditDuration: settServiceCredit,
                  service_credit_duration: settServiceCredit,
                  specializationCoursesSatisfied: Boolean(sim.specializationCourseCompleted),
                  specialization_courses_satisfied: Boolean(sim.specializationCourseCompleted),
                  otherFactors: settOtherFactors,
                  other_factors: settOtherFactors,
                  trackType: 'مسار_احتساب_الشهادات',
                  track_type: 'مسار_احتساب_الشهادات',
                  actionType: 'تسوية',
                  action_type: 'تسوية',
                  noGradeChange: true,
                  no_grade_change: true,
                  snapshotId: activeSnap.id,
                  snapshot_id: activeSnap.id,
                  reasons: [sim.realTimeNextPromotion.statusReason || 'استوفى الموظف شروط تسوية العجز وتثبيت الاستحقاق بدرجته الحالية']
                });
              }
            }
          }

          // 3. Check Standard Promotion Eligibility (ترفيع درجة) - only if not in active degree track deficit
          if (!hasHandledDegreeTrack && eligibility?.promotion?.eligibilityStatus === 'مستحق_للترفيع' && eligibility?.promotion?.isPromotionEligible) {
            const currentGrade = parseInt(String(emp.grade)) || 10;
            const targetGrade = Math.max(1, currentGrade - 1);
            const targetTitle = resolveTargetJobTitle(emp, targetGrade);
            
            const promoCommCount = eligibility.promotion.appliedCommendationsCount || 0;
            const promoCommMonths = eligibility.promotion.commendationMonthsDeducted || 0;
            const promoPenCount = eligibility.promotion.appliedPenaltiesCount || 0;
            const promoPenMonths = eligibility.promotion.penaltyMonthsAdded || 0;
            const promoAbsenceDays = eligibility.promotion.appliedAbsenceDays || 0;
            const promoServiceCredit = eligibility.promotion.serviceCreditDurationDeducted || { years: 0, months: 0, days: 0 };
            const promoServiceMonths = (promoServiceCredit.years || 0) * 12 + (promoServiceCredit.months || 0);
            const gateChecks = eligibility.promotion.gateCheckResults || { governingCoursesSatisfied: true, missingGoverningCourses: [], evaluationsSatisfied: true };

            // Construct readable other factors for promotion
            const promoOtherFactors: string[] = [];
            
            // Governing courses
            if (gateChecks.governingCoursesSatisfied) {
              promoOtherFactors.push('الدورات الحتمية: مستوفاة بالكامل');
            } else if (gateChecks.missingGoverningCourses && gateChecks.missingGoverningCourses.length > 0) {
              promoOtherFactors.push(`الدورات الحتمية: متبقي (${gateChecks.missingGoverningCourses.join(', ')})`);
            }

            // Evaluations
            if (gateChecks.evaluationsSatisfied) {
              promoOtherFactors.push('تقييم الأداء: مستوفٍ لآخر سنتين بدرجة كفوء فأعلى');
            }

            // Service additions
            if (promoServiceMonths > 0 || (promoServiceCredit.days || 0) > 0) {
              promoOtherFactors.push(`خدمة محتسبة: ${promoServiceCredit.years > 0 ? `${promoServiceCredit.years} سنة و ` : ''}${promoServiceCredit.months > 0 ? `${promoServiceCredit.months} شهر` : ''}${promoServiceCredit.days > 0 ? ` و ${promoServiceCredit.days} يوم` : ''}`);
            }

            // Absences / pauses
            if (promoAbsenceDays > 0) {
              promoOtherFactors.push(`أيام غياب/إجازات مخصومة: ${promoAbsenceDays} يوم`);
            }

            if (promoOtherFactors.length === 0) {
              promoOtherFactors.push('استيفاء المدة القانونية وشروط الترقية المعتمدة لسلم 2023');
            }

            dueForPromotion.push({
              employeeId: empId,
              employee_id: empId,
              name: emp.fullName || emp.full_name || emp.name,
              fullName: emp.fullName || emp.full_name || emp.name,
              department: emp.department || 'عام',
              jobTitle: currentTitle,
              currentJobTitle: currentTitle,
              current_job_title: currentTitle,
              targetJobTitle: targetTitle,
              target_job_title: targetTitle,
              currentGrade: currentGrade,
              current_grade: currentGrade,
              currentStep: emp.step || 1,
              current_step: emp.step || 1,
              targetGrade: targetGrade,
              target_grade: targetGrade,
              targetStep: 1,
              target_step: 1,
              // Previous and Next Dates
              lastPromotionDate: eligibility.promotion.lastPromotionDate || basePromotionDate,
              last_promotion_date: eligibility.promotion.lastPromotionDate || basePromotionDate,
              nextPromotionDueDate: eligibility.promotion.nextPromotionDueDate,
              next_promotion_due_date: eligibility.promotion.nextPromotionDueDate,
              dueDate: eligibility.promotion.nextPromotionDueDate,
              due_date: eligibility.promotion.nextPromotionDueDate,
              baseDueDate: eligibility.promotion.baseDueDate || eligibility.promotion.nextPromotionDueDate,
              base_due_date: eligibility.promotion.baseDueDate || eligibility.promotion.nextPromotionDueDate,
              requiredYears: eligibility.promotion.requiredYears || 4,
              required_years: eligibility.promotion.requiredYears || 4,
              // Commendation Letters & Impact
              commendationsCount: promoCommCount,
              commendations_count: promoCommCount,
              commendationMonths: promoCommMonths,
              commendation_months: promoCommMonths,
              commendationImpactText: promoCommCount > 0 ? `${promoCommCount} كتاب شكر (تقديم ${promoCommMonths} شهر)` : 'لا يوجد',
              commendation_impact_text: promoCommCount > 0 ? `${promoCommCount} كتاب شكر (تقديم ${promoCommMonths} شهر)` : 'لا يوجد',
              // Penalties & Impact
              penaltiesCount: promoPenCount,
              penalties_count: promoPenCount,
              penaltyDelayMonths: promoPenMonths,
              penalty_delay_months: promoPenMonths,
              penaltyImpactText: promoPenCount > 0 ? `${promoPenCount} عقوبة (تأخير ${promoPenMonths} شهر)` : 'سجل نظيف',
              penalty_impact_text: promoPenCount > 0 ? `${promoPenCount} عقوبة (تأخير ${promoPenMonths} شهر)` : 'سجل نظيف',
              // Other Factors
              serviceCreditDuration: promoServiceCredit,
              service_credit_duration: promoServiceCredit,
              serviceCreditMonths: promoServiceMonths,
              service_credit_months: promoServiceMonths,
              absenceDays: promoAbsenceDays,
              absence_days: promoAbsenceDays,
              gateCheckResults: gateChecks,
              gate_check_results: gateChecks,
              governingCoursesSatisfied: gateChecks.governingCoursesSatisfied,
              evaluationsSatisfied: gateChecks.evaluationsSatisfied,
              otherFactors: promoOtherFactors,
              other_factors: promoOtherFactors,
              trackType: 'المسار_الاعتيادي',
              track_type: 'المسار_الاعتيادي',
              actionType: 'ترفيع',
              action_type: 'ترفيع',
              noGradeChange: false,
              no_grade_change: false,
              reasons: [eligibility.promotion.statusReason || 'استوفى الموظف المدة القانونية والدورات الحاكمة وتقييم الأداء']
            });
          }
        } catch (empErr: any) {
          console.warn(`[DUE_LIST_WARN] Could not process eligibility for employee ${rawEmp?.id}:`, empErr?.message || empErr);
        }
      }

      try {
        await writeDueDatesBulk(dueDateWrites);
      } catch (e: any) {
        console.warn('[DUE_LIST_WARN] تعذّر حفظ تواريخ الاستحقاق:', e?.message || e);
      }

      const summary = {
        totalIncrement: dueForIncrement.length,
        totalPromotion: dueForPromotion.length,
        totalSettlement: dueForSettlement.length,
        totalDue: dueForIncrement.length + dueForPromotion.length + dueForSettlement.length
      };

      return {
        dueForIncrement,
        dueForPromotion,
        dueForSettlement,
        due_for_increment: dueForIncrement,
        due_for_promotion: dueForPromotion,
        due_for_settlement: dueForSettlement,
        summary
      };
  }
  dueListCache.setCompute(computeDueList);

  app.get('/api/promotions/due-list', requireAuth, async (req, res) => {
    try {
      const result = await dueListCache.get();
      // أداء: لوحة التحكم تحتاج العدد فقط (القائمة الكاملة ~17 ميغابايت لـ 6000 موظف)
      if (req.query.summary === '1') return res.json({ summary: result.summary });
      res.json(result);
    } catch (err: any) {
      console.error('Error fetching promotion due list:', err);
      res.json({
        dueForIncrement: [],
        dueForPromotion: [],
        dueForSettlement: [],
        due_for_increment: [],
        due_for_promotion: [],
        due_for_settlement: [],
        summary: {
          totalIncrement: 0,
          totalPromotion: 0,
          totalSettlement: 0,
          totalDue: 0
        }
      });
    }
  });

  // 5. Batch Approval API (مسار الاعتماد الدفعي Transactional)
  app.post('/api/promotions/approve-batch', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
    try {
      const { items, order_number, orderNumber, order_date, orderDate } = req.body;
      const finalOrderNumber = String(order_number || orderNumber || '').trim();
      const finalOrderDate = String(order_date || orderDate || '').trim();

      if (!finalOrderNumber || !finalOrderDate) {
        return res.status(400).json({ error: 'رقم الأمر الإداري وتاريخ الأمر الإداري مطلوبان لإتمام الاعتماد' });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'قائمة المعاملات المحددة للاعتماد فارغة' });
      }

      const approverName = req.user?.fullName || req.user?.name || req.user?.email || 'مسؤول الموارد البشرية';

      // Phase 1: Pre-validation (Atomic verification - any invalid item rejects the whole batch)
      const validatedBatch: Array<{
        empId: number;
        emp: any;
        type: 'علاوة' | 'ترفيع' | 'تسوية';
        gradeBefore: number;
        gradeAfter: number;
        stepBefore: number;
        stepAfter: number;
        movementType: string;
        dueDate: string;
        activeSnapshot?: any;
      }> = [];
      // الموظفون في حالة «نهاية_المرحلة» أو «بيانات_ناقصة» يُتجاوزون (لا يُعتمدون ولا يُفشلون الدفعة كلها)
      const SKIP_ELIGIBILITY_STATES = new Set(['نهاية_المرحلة', 'بيانات_ناقصة']);
      const skippedItems: Array<{ employeeId: number; name: string; type: string; status: string; reason: string }> = [];

      for (const item of items) {
        const empId = parseInt(String(item.employee_id || item.employeeId));
        const rawType = String(item.type || item.actionType || item.action_type || '').trim();
        const type: 'علاوة' | 'ترفيع' | 'تسوية' = rawType.includes('علاوة') ? 'علاوة' : (rawType.includes('تسوية') ? 'تسوية' : 'ترفيع');

        if (isNaN(empId)) {
          return res.status(400).json({ error: `معرف الموظف غير صالح: ${item.employee_id}` });
        }

        // إصلاح عاجل: الموظف من القاعدة (كان من الذاكرة ← 404 لكل الموظفين بعد B2e)
        const [dbEmpRow] = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
        const emp: any = dbEmpRow ? bothCases(dbEmpRow) : null;
        if (!emp) {
          return res.status(404).json({ error: `الموظف رقم (${empId}) غير موجود بالنظام` });
        }

        const empName = emp.fullName || emp.full_name || emp.name || `موظف #${empId}`;
        const curGrade = parseInt(String(emp.grade));
        const curStep = parseInt(String(emp.step));
        if (type !== 'تسوية' && (isNaN(curGrade) || isNaN(curStep))) {
          // لا تُختلق درجة/مرحلة افتراضية: الموظف بلا درجة أو مرحلة مسجلة يُتجاوز
          skippedItems.push({ employeeId: empId, name: empName, type, status: 'بيانات_ناقصة', reason: 'الدرجة أو المرحلة غير مسجلة' });
          continue;
        }

        if (type === 'علاوة') {
          const eligibility = await triggerRecalculateEligibility(empId);
          if (SKIP_ELIGIBILITY_STATES.has(eligibility?.increment?.eligibilityStatus)) {
            skippedItems.push({ employeeId: empId, name: empName, type, status: eligibility.increment.eligibilityStatus, reason: eligibility.increment.statusReason || '' });
            continue;
          }
          if (eligibility?.increment?.eligibilityStatus !== 'مستحق_للعلاوة' || !eligibility?.increment?.isIncrementEligible) {
            const notYetDue = eligibility?.increment?.eligibilityStatus === 'مؤهل';
            return res.status(400).json({
              error: notYetDue
                ? `الموظف (${empName}) لم يحن تاريخ استحقاق علاوته بعد (${eligibility?.increment?.nextIncrementDueDate || 'غير معروف'})، فلا يُعتمد قبله`
                : `الموظف (${empName}) غير مستحق للعلاوة السنوية حالياً: ${eligibility?.increment?.statusReason || 'شروط غير مستوفاة'}`
            });
          }
          const targetStep = Math.min(11, curStep + 1);
          const calculatedDueDate = eligibility.increment.nextIncrementDueDate || finalOrderDate;

          validatedBatch.push({
            empId,
            emp,
            type: 'علاوة',
            gradeBefore: curGrade,
            gradeAfter: curGrade,
            stepBefore: curStep,
            stepAfter: targetStep,
            movementType: 'علاوة سنوية',
            dueDate: calculatedDueDate
          });
        } else if (type === 'ترفيع') {
          const eligibility = await triggerRecalculateEligibility(empId);
          if (SKIP_ELIGIBILITY_STATES.has(eligibility?.promotion?.eligibilityStatus)) {
            skippedItems.push({ employeeId: empId, name: empName, type, status: eligibility.promotion.eligibilityStatus, reason: eligibility.promotion.statusReason || '' });
            continue;
          }
          if (eligibility?.promotion?.eligibilityStatus !== 'مستحق_للترفيع' || !eligibility?.promotion?.isPromotionEligible) {
            const notYetDue = eligibility?.promotion?.eligibilityStatus === 'مؤهل';
            return res.status(400).json({
              error: notYetDue
                ? `الموظف (${empName}) لم يحن تاريخ استحقاق ترفيعه بعد (${eligibility?.promotion?.nextPromotionDueDate || 'غير معروف'})، فلا يُعتمد قبله`
                : `الموظف (${empName}) غير مستحق للترفيع الوظيفي حالياً: ${eligibility?.promotion?.statusReason || 'شروط غير مستوفاة'}`
            });
          }
          const targetGrade = Math.max(1, curGrade - 1);
          const targetStep = 1;
          const calculatedDueDate = eligibility.promotion.nextPromotionDueDate || finalOrderDate;
          const resolvedTitleObj = findMatchingJobTitleForPromotion(emp, targetGrade, jobTitlesCache.list);

          validatedBatch.push({
            empId,
            emp,
            type: 'ترفيع',
            gradeBefore: curGrade,
            gradeAfter: targetGrade,
            stepBefore: curStep,
            stepAfter: targetStep,
            movementType: 'ترفيع درجة',
            dueDate: calculatedDueDate,
            newJobTitle: resolvedTitleObj?.name || null,
            newJobTitleId: resolvedTitleObj?.id || null
          });
        } else if (type === 'تسوية') {
          const activeSnap = (genericMemoryStores['degree-track-snapshots'] || []).find(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && (s.status === 'نشط' || !s.status)
          );
          if (!activeSnap) {
            return res.status(400).json({ error: `الموظف (${empName}) ليس لديه مسار احتساب شهادة نشط للتسوية` });
          }

          const specCredits = (genericMemoryStores['specialization-credits'] || []).filter(c => parseInt(String(c.employee_id || c.employeeId)) === empId);
          const p = (genericMemoryStores['penalties'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);
          const l = (genericMemoryStores['leaves'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId).map(toEngineLeave);
          const a = (genericMemoryStores['attendance'] || []).filter(item => parseInt(String(item.employee_id || item.employeeId)) === empId);

          const sim = calculateDegreeTrackSimulation(activeSnap, { specializationCredits: specCredits, penalties: p, leaves: l, attendances: a });
          if (!sim.hasDeficit || !sim.realTimeNextPromotion?.isEligible || sim.realTimeNextPromotion?.eligibilityStatus !== 'مستحق_للترفيع') {
            return res.status(400).json({
              error: `الموظف (${empName}) غير مستحق لتسوية مسار الشهادة حالياً: ${sim?.realTimeNextPromotion?.statusReason || 'شروط غير مستوفاة'}`
            });
          }

          const calculatedDueDate = sim.realTimeNextPromotion.nextPromotionDueDate || finalOrderDate;

          validatedBatch.push({
            empId,
            emp,
            type: 'تسوية',
            gradeBefore: curGrade,
            gradeAfter: curGrade, // No grade change!
            stepBefore: curStep,
            stepAfter: curStep,   // No step change!
            movementType: 'تسوية مسار الشهادات',
            dueDate: calculatedDueDate,
            activeSnapshot: activeSnap
          });
        }
      }

      if (validatedBatch.length === 0) {
        return res.status(400).json({
          error: 'لا توجد معاملة قابلة للاعتماد: جميع الموظفين المحددين في حالة «نهاية المرحلة» أو «بيانات ناقصة»',
          skippedCount: skippedItems.length,
          skipped: skippedItems
        });
      }

      // Phase 2: Transactional Execution (Apply DB + Memory updates atomically)
      let dbOffline = false;

      try {
        await db.transaction(async (tx) => {
          for (const item of validatedBatch) {
            if (item.type === 'علاوة') {
              await tx.update(schema.employees).set({
                step: item.stepAfter,
                lastIncrementDate: item.dueDate
              }).where(eq(schema.employees.id, item.empId));
            } else if (item.type === 'ترفيع') {
              await tx.update(schema.employees).set({
                grade: item.gradeAfter,
                step: item.stepAfter,
                lastPromotionDate: item.dueDate,
                ...(item.newJobTitle ? { jobTitle: item.newJobTitle, jobTitleId: item.newJobTitleId } : {})
              }).where(eq(schema.employees.id, item.empId));
            } else if (item.type === 'تسوية') {
              await tx.update(schema.employees).set({
                lastPromotionDate: item.dueDate
              }).where(eq(schema.employees.id, item.empId));

              if (item.activeSnapshot?.id) {
                await tx.update(schema.degreeTrackSnapshots).set({
                  status: 'مكتمل'
                }).where(eq(schema.degreeTrackSnapshots.id, item.activeSnapshot.id));
              }
            }

            await tx.insert(schema.promotionsIncrements).values({
              employeeId: item.empId,
              movementType: item.movementType,
              gradeBefore: String(item.gradeBefore),
              gradeAfter: String(item.gradeAfter),
              stepBefore: item.stepBefore,
              stepAfter: item.stepAfter,
              dueDate: item.dueDate,
              orderNumber: finalOrderNumber,
              orderDate: finalOrderDate,
              approvedBy: approverName,
              notes: item.type === 'تسوية' ? 'اعتماد يدوي لتسوية مسار الشهادات (تثبيت دون تغيير درجة)' : 'اعتماد يدوي عبر قائمة المستحقين'
            });
          }
        });
      } catch (dbErr: any) {
        if (isDbConnectionFailure(dbErr)) {
          console.warn('Database offline / connection failure during batch approval. Falling back to local encrypted storage:', dbErr?.message);
          dbOffline = true;
        } else {
          // Case B: Real transaction execution failure (Constraint violation, schema error, invalid data)
          console.error('CRITICAL: Batch promotion approval database transaction failed (Transaction Rolled Back):', dbErr);
          return res.status(500).json({
            error: 'فشلت عملية الاعتماد بالكامل في قاعدة البيانات، وتم التراجع عن كافة التغييرات (Rollback)',
            code: dbErr?.cause?.code || dbErr?.code
          });
        }
      }

      // Phase 3: Mirror in In-Memory Stores ONLY IF DB succeeded or DB is offline
      for (const item of validatedBatch) {
        const empIdx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === item.empId);
        if (empIdx !== -1) {
          if (item.type === 'علاوة') {
            mem.inMemoryEmployees[empIdx].step = item.stepAfter;
            mem.inMemoryEmployees[empIdx].lastIncrementDate = item.dueDate;
            mem.inMemoryEmployees[empIdx].last_increment_date = item.dueDate;
          } else if (item.type === 'ترفيع') {
            mem.inMemoryEmployees[empIdx].grade = item.gradeAfter;
            mem.inMemoryEmployees[empIdx].step = item.stepAfter;
            mem.inMemoryEmployees[empIdx].lastPromotionDate = item.dueDate;
            mem.inMemoryEmployees[empIdx].last_promotion_date = item.dueDate;
            if (item.newJobTitle) {
              mem.inMemoryEmployees[empIdx].jobTitle = item.newJobTitle;
              mem.inMemoryEmployees[empIdx].job_title = item.newJobTitle;
              mem.inMemoryEmployees[empIdx].jobTitleId = item.newJobTitleId;
              mem.inMemoryEmployees[empIdx].job_title_id = item.newJobTitleId;
            }
          } else if (item.type === 'تسوية') {
            mem.inMemoryEmployees[empIdx].lastPromotionDate = item.dueDate;
            mem.inMemoryEmployees[empIdx].last_promotion_date = item.dueDate;
            if (item.activeSnapshot?.id) {
              const snapIdx = (genericMemoryStores['degree-track-snapshots'] || []).findIndex(s => s.id === item.activeSnapshot.id);
              if (snapIdx !== -1) {
                genericMemoryStores['degree-track-snapshots'][snapIdx].status = 'مكتمل';
              }
            }
          }
        }

        const promoId = (genericMemoryStores['promotions'] || []).length + 1;
        genericMemoryStores['promotions'].push({
          id: promoId,
          employee_id: item.empId,
          employeeId: item.empId,
          movement_type: item.movementType,
          movementType: item.movementType,
          grade_before: item.gradeBefore,
          gradeBefore: item.gradeBefore,
          grade_after: item.gradeAfter,
          gradeAfter: item.gradeAfter,
          step_before: item.stepBefore,
          stepBefore: item.stepBefore,
          step_after: item.stepAfter,
          stepAfter: item.stepAfter,
          due_date: item.dueDate,
          dueDate: item.dueDate,
          order_number: finalOrderNumber,
          orderNumber: finalOrderNumber,
          order_date: finalOrderDate,
          orderDate: finalOrderDate,
          approved_by: approverName,
          approvedBy: approverName,
          notes: item.type === 'تسوية' ? 'اعتماد يدوي لتسوية مسار الشهادات (تثبيت دون تغيير درجة)' : 'اعتماد يدوي عبر قائمة المستحقين',
          created_at: new Date().toISOString()
        });

        // Trigger eligibility recalculation for next cycle
        await triggerRecalculateEligibility(item.empId);
      }

      saveLocalDb();

      return res.json({
        success: true,
        storageMode: dbOffline ? 'local_encrypted' : 'database_and_local',
        approvedCount: validatedBatch.length,
        skippedCount: skippedItems.length,
        skipped: skippedItems,
        orderNumber: finalOrderNumber,
        orderDate: finalOrderDate,
        message: dbOffline
          ? `تم اعتماد ${validatedBatch.length} معاملة بنجاح وحفظها بالتخزين الاحتياطي المحلي المشفر (قاعدة البيانات المركزية غير متصلة) بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
          : `تم اعتماد ${validatedBatch.length} معاملة بنجاح وتحديث قاعدة البيانات المركزية بموجب الأمر الإداري رقم (${finalOrderNumber}) بتاريخ (${finalOrderDate})`
      });
    } catch (err: any) {
      console.error('Error in batch promotion approval:', err);
      sendRouteError(res, err);
    }
  });

  // 5. Batch Auto-Settlement Trigger
  app.post('/api/degree-track/process-auto-settlement', requireAuth, requireAdmin, async (req, res) => {
    try {
      // B3/إصلاح: كل المدخلات من القاعدة (كانت من الذاكرة الفارغة بعد B2e فلا يُسوّى أحد)
      const [crRows, empRows, snapRows, specRows, penRows, leaveRows, attRows] = await Promise.all([
        db.select().from(schema.commendationRulesSettings).limit(1),
        db.select().from(schema.employees),
        db.select().from(schema.degreeTrackSnapshots),
        db.select().from(schema.specializationCourseCredits),
        db.select().from(schema.penalties),
        db.select().from(schema.leaveRequests),
        db.select().from(schema.attendance),
      ]);
      const isAutoEnabled = crRows[0] ? Boolean(crRows[0].degreeTrackAutoSettlement) :
        (settingsLists.getCommendationRulesSettings().degreeTrackAutoSettlement === true || settingsLists.getCommendationRulesSettings().degree_track_auto_settlement === true);

      const batchResult = processBatchDegreeTrackAutoSettlement(
        empRows.map(bothCases),
        snapRows.map(bothCases) as any,
        {
          specializationCredits: specRows.map(bothCases),
          penalties: penRows.map(bothCases),
          leaves: leaveRows.map(bothCases).map(toEngineLeave),
          attendances: attRows.map(bothCases),
          penaltyTypes: await loadPenaltyTypesForEngine()
        },
        {
          autoSettlementEnabled: isAutoEnabled
        }
      );

      for (const item of batchResult.results) {
        if (item.settled && item.updatedEmployee && item.approvalRecord) {
          const empId = parseInt(String(item.employeeId));
          const empIdx = mem.inMemoryEmployees.findIndex(e => parseInt(String(e.id)) === empId);
          if (empIdx !== -1) {
            mem.inMemoryEmployees[empIdx].lastPromotionDate = item.updatedEmployee.lastPromotionDate;
            mem.inMemoryEmployees[empIdx].last_promotion_date = item.updatedEmployee.lastPromotionDate;
          }

          const snapIdx = (genericMemoryStores['degree-track-snapshots'] || []).findIndex(
            s => parseInt(String(s.employee_id || s.employeeId)) === empId && s.status === 'نشط'
          );
          if (snapIdx !== -1) {
            genericMemoryStores['degree-track-snapshots'][snapIdx].status = 'مكتمل';
          }

          const newPromoId = (genericMemoryStores['promotions'] || []).length + 1;
          genericMemoryStores['promotions'].push({
            id: newPromoId,
            employee_id: empId,
            employeeId: empId,
            movement_type: item.approvalRecord.movementType,
            movementType: item.approvalRecord.movementType,
            grade_before: item.approvalRecord.gradeBefore,
            gradeBefore: item.approvalRecord.gradeBefore,
            grade_after: item.approvalRecord.gradeAfter,
            gradeAfter: item.approvalRecord.gradeAfter,
            step_before: item.approvalRecord.stepBefore,
            stepBefore: item.approvalRecord.stepBefore,
            step_after: item.approvalRecord.stepAfter,
            stepAfter: item.approvalRecord.stepAfter,
            due_date: item.approvalRecord.dueDate,
            dueDate: item.approvalRecord.dueDate,
            order_number: null,
            orderNumber: null,
            order_date: item.approvalRecord.orderDate,
            orderDate: item.approvalRecord.orderDate,
            approved_by: 'نظام آلي — تسوية تلقائية',
            approvedBy: 'نظام آلي — تسوية تلقائية',
            notes: item.approvalRecord.notes,
            created_at: new Date().toISOString()
          });

          try {
            await db.update(schema.employees)
              .set({ lastPromotionDate: item.updatedEmployee.lastPromotionDate })
              .where(eq(schema.employees.id, empId));
            await db.update(schema.degreeTrackSnapshots)
              .set({ status: 'مكتمل' })
              .where(eq(schema.degreeTrackSnapshots.employeeId, empId));
            await db.insert(schema.promotionsIncrements).values({
              employeeId: empId,
              movementType: item.approvalRecord.movementType,
              gradeBefore: String(item.approvalRecord.gradeBefore),
              gradeAfter: String(item.approvalRecord.gradeAfter),
              stepBefore: item.approvalRecord.stepBefore,
              stepAfter: item.approvalRecord.stepAfter,
              dueDate: item.approvalRecord.dueDate,
              orderNumber: null,
              orderDate: item.approvalRecord.orderDate,
              approvedBy: 'نظام آلي — تسوية تلقائية',
              notes: item.approvalRecord.notes
            });
          } catch (e) {}
        }
      }

      saveLocalDb();
      res.json(batchResult);
    } catch (err: any) {
      console.error('Error in batch auto settlement:', err);
      sendRouteError(res, err);
    }
  });

  // --- Promotion Delay Reasons & Reminders API (Phase 4: Transparency & Reminders) ---

  // 1. Get Delay Reasons for Employee
  app.get('/api/promotion-delay-reasons/employee/:id', requireAuth, async (req, res) => {
    try {
      const empId = parseInt(req.params.id);
      if (isNaN(empId)) return res.status(400).json({ error: 'معرّف الموظف غير صالح' });

      // Always trigger a fresh recalculation to ensure delay reasons match latest status
      await triggerRecalculateEligibility(empId);

      // إصلاح عاجل: الأسباب من القاعدة (كانت من الذاكرة ← قائمة فارغة بعد B2e)
      const store: any[] = await db.select().from(schema.promotionDelayReasons).where(eq(schema.promotionDelayReasons.employeeId, empId));
      const employeeReasons = store
        .filter((item: any) => parseInt(String(item.employeeId || item.employee_id)) === empId)
        .map(item => ({
          ...mapKeys(item, camelToSnake),
          ...item,
          id: item.id,
          employeeId: parseInt(String(item.employeeId || item.employee_id)),
          employee_id: parseInt(String(item.employeeId || item.employee_id)),
          reasonType: item.reasonType || item.reason_type,
          reason_type: item.reasonType || item.reason_type,
          description: item.description,
          affects: item.affects,
          isHidden: Boolean(item.isHidden ?? item.is_hidden),
          is_hidden: Boolean(item.isHidden ?? item.is_hidden),
          reminderDate: item.reminderDate || item.reminder_date || null,
          reminder_date: item.reminderDate || item.reminder_date || null,
          isAutoReminder: Boolean(item.isAutoReminder ?? item.is_auto_reminder),
          is_auto_reminder: Boolean(item.isAutoReminder ?? item.is_auto_reminder),
          isResolved: Boolean(item.isResolved ?? item.is_resolved),
          is_resolved: Boolean(item.isResolved ?? item.is_resolved),
          resolvedAt: item.resolvedAt || item.resolved_at || null,
          resolved_at: item.resolvedAt || item.resolved_at || null,
          sourceReferenceId: item.sourceReferenceId || item.source_reference_id || null,
          source_reference_id: item.sourceReferenceId || item.source_reference_id || null,
        }));

      res.json(employeeReasons);
    } catch (err: any) {
      console.error('Error fetching employee delay reasons:', err);
      sendRouteError(res, err);
    }
  });

  // 2. Toggle or set isHidden for a delay reason
  app.patch('/api/promotion-delay-reasons/:id/hide', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });

      const isHidden = req.body.is_hidden !== undefined
        ? Boolean(req.body.is_hidden)
        : (req.body.isHidden !== undefined ? Boolean(req.body.isHidden) : true);

      const store = genericMemoryStores['promotion-delay-reasons'] || mem.inMemoryPromotionDelayReasons || [];
      const idx = store.findIndex(item => parseInt(String(item.id)) === id);
      if (idx !== -1) {
        store[idx].isHidden = isHidden;
        store[idx].is_hidden = isHidden;
        store[idx].updatedAt = new Date().toISOString();
        store[idx].updated_at = new Date().toISOString();
      }

      try {
        await db.update(schema.promotionDelayReasons).set({
          isHidden,
          updatedAt: new Date()
        }).where(eq(schema.promotionDelayReasons.id, id));
      } catch (e) { return sendRouteError(res, e, 'حفظ سبب التأخير'); }

      saveLocalDb();
      res.json({ success: true, isHidden, id });
    } catch (err: any) {
      console.error('Error updating delay reason visibility:', err);
      sendRouteError(res, err);
    }
  });

  // 3. Update reminderDate manually
  app.patch('/api/promotion-delay-reasons/:id/reminder', requireAuth, requireWriter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'معرّف السجل غير صالح' });

      const reminderDate = String(req.body.reminder_date || req.body.reminderDate || '').trim() || null;

      const store = genericMemoryStores['promotion-delay-reasons'] || mem.inMemoryPromotionDelayReasons || [];
      const idx = store.findIndex(item => parseInt(String(item.id)) === id);
      if (idx !== -1) {
        store[idx].reminderDate = reminderDate;
        store[idx].reminder_date = reminderDate;
        store[idx].isAutoReminder = false;
        store[idx].is_auto_reminder = false;
        store[idx].updatedAt = new Date().toISOString();
        store[idx].updated_at = new Date().toISOString();
      }

      try {
        await db.update(schema.promotionDelayReasons).set({
          reminderDate,
          isAutoReminder: false,
          updatedAt: new Date()
        }).where(eq(schema.promotionDelayReasons.id, id));
      } catch (e) { return sendRouteError(res, e, 'حفظ سبب التأخير'); }

      saveLocalDb();
      res.json({ success: true, reminderDate, isAutoReminder: false, id });
    } catch (err: any) {
      console.error('Error updating delay reason reminder date:', err);
      sendRouteError(res, err);
    }
  });

  // 4. Get Due Reminders for Dashboard (reminderDate <= today and isResolved = false and isHidden = false)
  app.get('/api/promotion-delay-reasons/due-reminders', requireAuth, async (req, res) => {
    try {
      const today = formatDateString(new Date());
      // إصلاح عاجل: من القاعدة (كانت من الذاكرة ← لوحة التذكيرات فارغة بعد B2e)
      const store: any[] = await db.select().from(schema.promotionDelayReasons)
        .where(and(sql`${schema.promotionDelayReasons.isHidden} IS NOT TRUE`, sql`${schema.promotionDelayReasons.isResolved} IS NOT TRUE`, isNotNull(schema.promotionDelayReasons.reminderDate)));
      const reminderEmpIds = [...new Set(store.map((r: any) => r.employeeId).filter(Boolean))] as number[];
      const reminderEmps = reminderEmpIds.length ? await db.select().from(schema.employees).where(inArray(schema.employees.id, reminderEmpIds)) : [];
      const empById = new Map(reminderEmps.map((e: any) => [e.id, e]));

      const dueItems: any[] = [];

      for (const item of store) {
        try {
          if (!item) continue;
          const isHidden = item.isHidden === true || item.is_hidden === true;
          const isResolved = item.isResolved === true || item.is_resolved === true;
          const rDate = item.reminderDate || item.reminder_date;
          if (isHidden || isResolved || !rDate) continue;
          if (!isDateOnOrAfter(today, rDate)) continue;

          const empId = parseInt(String(item.employeeId || item.employee_id));
          const emp: any = empById.get(empId);

          dueItems.push({
            ...item,
            id: item.id,
            employeeId: empId,
            employee_id: empId,
            employeeName: emp?.fullName || emp?.full_name || emp?.name || `موظف #${empId}`,
            jobTitle: emp?.jobTitle || emp?.job_title || '—',
            department: emp?.department || '—',
            grade: emp?.grade || '—',
            step: emp?.step || '—',
            reasonType: item.reasonType || item.reason_type,
            reason_type: item.reasonType || item.reason_type,
            description: item.description || '',
            affects: item.affects || 'ترقية',
            reminderDate: item.reminderDate || item.reminder_date,
            reminder_date: item.reminderDate || item.reminder_date,
            isAutoReminder: item.isAutoReminder ?? item.is_auto_reminder ?? true,
            is_auto_reminder: item.isAutoReminder ?? item.is_auto_reminder ?? true,
          });
        } catch (itemErr) {
          console.warn('[DUE_REMINDERS_WARN] Error processing item:', itemErr);
        }
      }

      const summaryByType = {
        'دورة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'دورة').length,
        'عقوبة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'عقوبة').length,
        'اجازة': dueItems.filter(i => (i.reasonType || i.reason_type) === 'اجازة').length,
        'تقييم': dueItems.filter(i => (i.reasonType || i.reason_type) === 'تقييم').length,
        'غياب': dueItems.filter(i => (i.reasonType || i.reason_type) === 'غياب').length,
      };

      res.json({
        reminders: dueItems,
        totalDue: dueItems.length,
        summaryByType
      });
    } catch (err: any) {
      console.error('Error fetching due reminders:', err);
      res.json({
        reminders: [],
        totalDue: 0,
        summaryByType: { 'دورة': 0, 'عقوبة': 0, 'اجازة': 0, 'تقييم': 0, 'غياب': 0 }
      });
    }
  });
}
