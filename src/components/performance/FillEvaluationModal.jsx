import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { apiClient } from '@/api/apiClient';
import {
  determineTargetForm,
  getAdjustedFormStructure,
  getEvaluationGrade,
  EVALUATION_GRADE_SCALE
} from '@/lib/evaluationEngine';
import { Save, X, Award, Lock, AlertTriangle, CheckCircle2, Building2, User, FileText } from 'lucide-react';

export default function FillEvaluationModal({ isOpen, onClose, employee, evaluation, forms, onSaved }) {
  const { toast } = useToast();
  const { appPublicSettings } = useAuth();
  const [loading, setLoading] = useState(false);

  const beneficiaryName = appPublicSettings?.beneficiaryName || 'جمهورية العراق - وزارة النفط';
  const platformName = appPublicSettings?.platformName || 'شركة النفط الوطنية - شعبة تقييم الأداء والتطوير الوظيفي';
  const logoUrl = appPublicSettings?.logoUrl;

  // Selected Form & Dynamic Structure
  const targetForm = useMemo(() => {
    return evaluation?.form_id
      ? forms.find(f => f.id === evaluation.form_id) || determineTargetForm(employee, forms)
      : determineTargetForm(employee, forms);
  }, [evaluation?.form_id, employee, forms]);

  const adjustedForm = useMemo(() => {
    return targetForm ? getAdjustedFormStructure(targetForm, employee) : null;
  }, [targetForm, employee]);

  // Active form toggles
  const enableWeaknesses = Boolean(adjustedForm?.enable_weaknesses || adjustedForm?.enableWeaknesses);
  const enableStrengths = Boolean(adjustedForm?.enable_strengths || adjustedForm?.enableStrengths);
  const enableTrainingNeeds = Boolean(adjustedForm?.enable_training_needs || adjustedForm?.enableTrainingNeeds);
  const enableEmployeeOpinion = Boolean(adjustedForm?.enable_employee_opinion || adjustedForm?.enableEmployeeOpinion);

  // Form inputs state
  // Evaluation year is FIXED based on evaluation or current release year
  const fixedYear = useMemo(() => {
    return evaluation?.year || new Date().getFullYear();
  }, [evaluation?.year]);

  const [evaluator, setEvaluator] = useState('ادخل اسم المقيم');
  const [evaluationDate, setEvaluationDate] = useState(
    evaluation?.evaluation_date || evaluation?.evaluationDate || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState(evaluation?.notes || '');

  // Custom fields
  const [weaknesses, setWeaknesses] = useState(evaluation?.weaknesses || '');
  const [strengths, setStrengths] = useState(evaluation?.strengths || '');
  const [trainingNeeds, setTrainingNeeds] = useState(evaluation?.training_needs || evaluation?.trainingNeeds || '');
  const [employeeOpinion, setEmployeeOpinion] = useState(
    evaluation?.employee_opinion || evaluation?.employeeOpinion || ''
  );

  // Scores state: { [criterionId]: string | number }
  const [criterionScores, setCriterionScores] = useState({});

  // Validation errors state
  const [validationErrors, setValidationErrors] = useState({
    evaluator: false,
    date: false,
    critIds: new Set()
  });

  useEffect(() => {
    if (!isOpen || !employee) return;

    // Reset validation errors
    setValidationErrors({ evaluator: false, date: false, critIds: new Set() });

    // Evaluator default
    const initialEvaluator = evaluation?.evaluator && evaluation.evaluator !== 'اللجنة المركزية للتقييم'
      ? evaluation.evaluator
      : 'ادخل اسم المقيم';
    setEvaluator(initialEvaluator);

    setEvaluationDate(
      evaluation?.evaluation_date || evaluation?.evaluationDate || new Date().toISOString().split('T')[0]
    );
    setNotes(evaluation?.notes || '');
    setWeaknesses(evaluation?.weaknesses || '');
    setStrengths(evaluation?.strengths || '');
    setTrainingNeeds(evaluation?.training_needs || evaluation?.trainingNeeds || '');
    setEmployeeOpinion(evaluation?.employee_opinion || evaluation?.employeeOpinion || '');

    if (!adjustedForm) return;

    // Check if initial scores exist in evaluation
    let existingScores = {};
    if (evaluation?.scores_json || evaluation?.scoresJson) {
      try {
        const parsed = typeof evaluation.scores_json === 'string'
          ? JSON.parse(evaluation.scores_json)
          : (evaluation.scores_json || JSON.parse(evaluation.scoresJson || '[]'));

        (parsed || []).forEach(sec => {
          (sec.criteria || []).forEach(crit => {
            if (crit.id) existingScores[crit.id] = crit.assignedScore;
          });
        });
      } catch {
        // ignore fallback
      }
    }

    // Set initial criterion scores: EMPTY by default if no saved scores exist
    const initial = {};
    (adjustedForm.sections || []).forEach(sec => {
      (sec.criteria || []).forEach(crit => {
        initial[crit.id] = existingScores[crit.id] !== undefined && existingScores[crit.id] !== null
          ? String(existingScores[crit.id])
          : ''; // Empty string by default so evaluator fills manually
      });
    });
    setCriterionScores(initial);
  }, [isOpen, evaluation, adjustedForm, employee]);

  if (!isOpen || !employee) return null;

  // Calculate live total score & grade from entered numbers
  const totalScore = Object.values(criterionScores).reduce((acc, curr) => {
    const val = parseInt(curr, 10);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const gradeLabel = getEvaluationGrade(totalScore);
  const gradeBadge = EVALUATION_GRADE_SCALE.find(g => g.label === gradeLabel) || { bg: 'bg-slate-100 text-slate-800' };

  // Score change handler
  const handleScoreChange = (criterionId, val, maxScore) => {
    // Clear error for this criterion as user types
    if (validationErrors.critIds.has(criterionId)) {
      setValidationErrors(prev => {
        const nextSet = new Set(prev.critIds);
        nextSet.delete(criterionId);
        return { ...prev, critIds: nextSet };
      });
    }

    if (val === '') {
      setCriterionScores(prev => ({ ...prev, [criterionId]: '' }));
      return;
    }

    let num = parseInt(val, 10);
    if (isNaN(num)) {
      setCriterionScores(prev => ({ ...prev, [criterionId]: '' }));
      return;
    }
    if (num < 0) num = 0;
    if (num > maxScore) num = maxScore;

    setCriterionScores(prev => ({ ...prev, [criterionId]: String(num) }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!adjustedForm) {
      toast({ title: 'خطأ', description: 'لم يتم العثور على استمارة تقييم مناسبة للموظف', variant: 'destructive' });
      return;
    }

    // Validation checks
    const missingCrits = new Set();
    let hasEvaluatorError = false;
    let hasDateError = false;

    // 1. Check evaluator
    const trimmedEvaluator = (evaluator || '').trim();
    if (!trimmedEvaluator || trimmedEvaluator === 'ادخل اسم المقيم') {
      hasEvaluatorError = true;
    }

    // 2. Check evaluation date
    if (!evaluationDate) {
      hasDateError = true;
    }

    // 3. Check every criterion score in adjustedForm
    (adjustedForm.sections || []).forEach(sec => {
      (sec.criteria || []).forEach(crit => {
        const val = criterionScores[crit.id];
        if (val === '' || val === undefined || val === null) {
          missingCrits.add(crit.id);
        } else {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 0 || num > crit.maxScore) {
            missingCrits.add(crit.id);
          }
        }
      });
    });

    if (hasEvaluatorError || hasDateError || missingCrits.size > 0) {
      setValidationErrors({
        evaluator: hasEvaluatorError,
        date: hasDateError,
        critIds: missingCrits
      });

      const errDetails = [];
      if (hasEvaluatorError) errDetails.push('إدخال اسم المقيم بشكل صحيح');
      if (hasDateError) errDetails.push('تحديد تاريخ التقييم');
      if (missingCrits.size > 0) errDetails.push(`تعبئة درجات ${missingCrits.size} معيار تقييمي متبقي`);

      toast({
        title: 'تنبيه: تعذّر حفظ التقييم - بيانات غير مكتملة',
        description: `يرجى إكمال الحقول التالية: ${errDetails.join('، ')}. تم تمييز الحقول المطلوبة باللون الأحمر.`,
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);

      const scoresBreakdown = (adjustedForm.sections || []).map(sec => ({
        sectionId: sec.id,
        sectionTitle: sec.title,
        criteria: (sec.criteria || []).map(crit => ({
          id: crit.id,
          name: crit.name,
          maxScore: crit.maxScore,
          assignedScore: parseInt(criterionScores[crit.id], 10) || 0
        }))
      }));

      const finalEmployeeOpinion = enableEmployeeOpinion
        ? (employeeOpinion.trim() ? employeeOpinion.trim() : 'لم يضع الموظف رأيه بهذا التقييم')
        : null;

      const payload = {
        employee_id: employee.id,
        year: String(fixedYear),
        total_score: totalScore,
        grade: gradeLabel,
        form_id: targetForm.id,
        form_title: targetForm.title,
        evaluator: trimmedEvaluator,
        evaluation_date: evaluationDate,
        scores_json: JSON.stringify(scoresBreakdown),
        notes: notes,
        weaknesses: enableWeaknesses ? (weaknesses.trim() || null) : null,
        strengths: enableStrengths ? (strengths.trim() || null) : null,
        training_needs: enableTrainingNeeds ? (trainingNeeds.trim() || null) : null,
        employee_opinion: finalEmployeeOpinion,
        status: 'مرفوع للاعتماد'
      };

      if (evaluation?.id) {
        await apiClient.entities.PerformanceEvaluation.update(evaluation.id, payload);
        toast({ title: 'تم الحفظ بنجاح', description: 'تم تفريغ واكتمال درجات تقييم الموظف بنجاح' });
      } else {
        await apiClient.entities.PerformanceEvaluation.create(payload);
        toast({ title: 'تم الحفظ بنجاح', description: 'تم حفظ وتفريغ تقييم الموظف بنجاح' });
      }

      onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'خطأ', description: err.message || 'فشل حفظ التقييم', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden my-6 flex flex-col max-h-[92vh] border border-slate-200">
        {/* Top Header Toolbar */}
        <div className="p-4 bg-[#1B3A6B] text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                تعبئة وتفريغ درجات التقييم السنوي (نموذج الاستمارة الرسمية)
                <span className="bg-amber-400 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black">
                  سنة {fixedYear}
                </span>
              </h3>
              <p className="text-xs text-slate-200 mt-0.5">
                تفريغ الدرجات اليدوية وتخصيص نتائج معايير تقييم الأداء الوظيفي
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-200 hover:text-white hover:bg-white/10 rounded-xl p-2 cursor-pointer transition-colors"
          >
            <X size={20} />
          </Button>
        </div>

        {/* Form Body - Styled to Match Official Paper Form Sheet */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-900 bg-slate-50/50" dir="rtl">

          {/* Official Paper Form Header Box */}
          <div className="bg-white border-2 border-slate-300 rounded-2xl p-4 shadow-xs">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-3 mb-3">
              <div className="text-right text-xs font-bold text-slate-800 leading-tight">
                <p className="font-black text-slate-900 text-sm">{beneficiaryName}</p>
                <p className="text-slate-600 text-[11px] mt-0.5">{platformName}</p>
              </div>

              <div className="text-center flex flex-col items-center">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="w-10 h-10 object-contain mb-1" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-700 mb-1">
                    <Award size={20} />
                  </div>
                )}
                <h2 className="text-base font-black text-slate-900 tracking-wide">
                  استمارة تقييم الأداء الوظيفي السنوي
                </h2>
                <div className="flex items-center gap-1.5 text-xs font-black text-[#1B3A6B] bg-blue-50 px-3 py-0.5 rounded-full border border-blue-200 mt-1">
                  <Lock size={12} className="text-slate-500" />
                  <span>سنة التقييم الثابتة: {fixedYear}</span>
                </div>
              </div>

              <div className="text-left text-xs font-mono font-bold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200">
                <p className="text-[11px] text-slate-500">حالة الاستمارة: <span className="font-black text-amber-700">قيد التعبئة والتفريغ</span></p>
                <p className="text-[11px] text-slate-500 mt-0.5">رمز الاستمارة: <span className="font-black text-indigo-900">{targetForm?.code || targetForm?.id || '—'}</span></p>
              </div>
            </div>

            {/* Official Employee Data Grid */}
            <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
              <h4 className="text-xs font-black text-[#1B3A6B] mb-2 flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <User size={14} />
                <span>البيانات الأساسية للموظف التابع للاستمارة:</span>
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-bold">
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">اسم الموظف الرباعي:</span>
                  <span className="text-slate-900 font-black">{employee.full_name || employee.fullName || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">الرقم الوظيفي / الخدمي:</span>
                  <span className="font-mono text-slate-900">{employee.civil_service_number || employee.civilServiceNumber || employee.employee_number || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">المسمى الوظيفي:</span>
                  <span className="text-slate-800">{employee.job_title || employee.jobTitle || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">التشكيل / القسم الإداري:</span>
                  <span className="text-slate-800">{employee.department || employee.section || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">الدرجة والمرحلة:</span>
                  <span className="text-slate-800">درجة {employee.grade || '—'} &bull; مرحلة {employee.step || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-normal">التحصيل الدراسي والتخصص:</span>
                  <span className="text-slate-800">{employee.education_level || employee.educationLevel || '—'} ({employee.specialization || 'عام'})</span>
                </div>
                <div className="md:col-span-2">
                  <span className="text-[10px] text-slate-400 block font-normal">عنوان ونوع الاستمارة المخصصة:</span>
                  <span className="text-indigo-950 font-black">{targetForm?.title || 'استمارة تقييم قياسية'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Evaluator & Date Settings Grid */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
            <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2">
              <Building2 size={14} className="text-[#1B3A6B]" />
              <span>بيانات جهة التقييم وتاريخ التحرير:</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Evaluator Field */}
              <div>
                <Label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1">
                  <span>جهة التقييم / اسم المقيم <span className="text-rose-500">*</span></span>
                  {validationErrors.evaluator && (
                    <span className="text-[10px] font-bold text-rose-600">مطلوب التعبئة!</span>
                  )}
                </Label>
                <Input
                  value={evaluator}
                  onChange={e => {
                    setEvaluator(e.target.value);
                    if (validationErrors.evaluator) {
                      setValidationErrors(prev => ({ ...prev, evaluator: false }));
                    }
                  }}
                  className={`text-xs rounded-xl font-bold transition-all ${
                    validationErrors.evaluator
                      ? 'border-2 border-rose-500 bg-rose-50/80 text-rose-900 focus:ring-rose-500'
                      : 'border-slate-300 focus:border-[#1B3A6B]'
                  }`}
                  placeholder="ادخل اسم المقيم"
                  required
                />
                {validationErrors.evaluator ? (
                  <p className="text-[10px] text-rose-600 font-bold mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    <span>يرجى إدخال اسم المقيم أو جهة التقييم بدلاً من النمط الافتراضي.</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">العبارة الافتراضية: "ادخل اسم المقيم"</p>
                )}
              </div>

              {/* Evaluation Date */}
              <div>
                <Label className="text-xs font-bold text-slate-700 flex items-center justify-between mb-1">
                  <span>تاريخ التقييم <span className="text-rose-500">*</span></span>
                  {validationErrors.date && (
                    <span className="text-[10px] font-bold text-rose-600">مطلوب التحديد!</span>
                  )}
                </Label>
                <Input
                  type="date"
                  value={evaluationDate}
                  onChange={e => {
                    setEvaluationDate(e.target.value);
                    if (validationErrors.date) {
                      setValidationErrors(prev => ({ ...prev, date: false }));
                    }
                  }}
                  className={`text-xs rounded-xl font-mono font-bold transition-all ${
                    validationErrors.date
                      ? 'border-2 border-rose-500 bg-rose-50 text-rose-900'
                      : 'border-slate-300 focus:border-[#1B3A6B]'
                  }`}
                  required
                />
              </div>

              {/* Locked Year Field */}
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-1">
                  سنة التقييم (ثابتة غير قابلة للتغيير)
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={fixedYear}
                    disabled
                    readOnly
                    className="text-xs rounded-xl font-mono font-black bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed pl-8"
                  />
                  <Lock size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">معتمدة تلقائياً على سنة تحرير الاستمارة</p>
              </div>
            </div>
          </div>

          {/* Realtime Live Score Summary Banner */}
          <div className="bg-[#1B3A6B] text-white p-4 rounded-2xl shadow-md flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-slate-200 font-bold">المجموع الكلي المحتسب للدرجات الممنوحة حالياً:</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-3xl font-black font-mono text-amber-400">{totalScore}</span>
                <span className="text-xs font-bold text-slate-300">من إجمالي {adjustedForm?.maxScore || 100} درجة</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-left bg-white/10 p-2.5 rounded-xl border border-white/20">
                <span className="text-[10px] text-slate-300 font-bold block">التقدير المحتسب تلقائياً:</span>
                <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black mt-1 ${gradeBadge.bg}`}>
                  {gradeLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Criteria Scoring Table / Sections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>جدول تفريغ درجات معايير التقييم اليدوية:</span>
                <span className="text-[11px] font-normal text-slate-500">(الحقول فارغة ليتم ملؤها يدوياً)</span>
              </h4>
              {validationErrors.critIds.size > 0 && (
                <span className="text-xs font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 animate-pulse">
                  ⚠️ متبقي {validationErrors.critIds.size} معيار بحاجة لإدخال الدرجة!
                </span>
              )}
            </div>

            {(adjustedForm?.sections || []).map((sec) => (
              <div key={sec.id} className="border border-slate-300 rounded-2xl overflow-hidden bg-white shadow-xs">
                {/* Section Header */}
                <div className="p-3 bg-slate-100 border-b border-slate-300 font-black text-xs text-slate-900 flex justify-between items-center">
                  <span className="text-[#1B3A6B]">{sec.title}</span>
                  <span className="text-[11px] font-bold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                    الوزن الكلي للمحور: {sec.criteria.reduce((a, b) => a + b.maxScore, 0)} درجة
                  </span>
                </div>

                {/* Criteria Rows */}
                <div className="divide-y divide-slate-200">
                  {sec.criteria.map((crit) => {
                    const isMissing = validationErrors.critIds.has(crit.id);
                    const currentVal = criterionScores[crit.id] !== undefined ? criterionScores[crit.id] : '';

                    return (
                      <div
                        key={crit.id}
                        className={`p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                          isMissing ? 'bg-rose-50/70' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 block">{crit.name}</span>
                            {isMissing && (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300">
                                ⚠️ مطلوب إدخال الدرجة
                              </span>
                            )}
                          </div>
                          {crit.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{crit.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Label className="text-[11px] text-slate-500 font-bold">الدرجة الممنوحة:</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              min={0}
                              max={crit.maxScore}
                              value={currentVal}
                              onChange={(e) => handleScoreChange(crit.id, e.target.value, crit.maxScore)}
                              placeholder="أدخل الدرجة"
                              className={`w-24 text-center text-xs font-mono font-black rounded-xl transition-all ${
                                isMissing
                                  ? 'border-2 border-rose-500 bg-rose-100 text-rose-900 placeholder-rose-400 focus:ring-rose-500'
                                  : currentVal !== ''
                                  ? 'border-emerald-500 bg-emerald-50/50 text-slate-900'
                                  : 'border-slate-300 focus:border-[#1B3A6B]'
                              }`}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-500 font-mono">/ {crit.maxScore}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Optional Dynamic Fields (Weaknesses, Strengths, Training Needs, Employee Opinion) */}
          {(enableWeaknesses || enableStrengths || enableTrainingNeeds || enableEmployeeOpinion) && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-2">
                حقول وتقارير إضافية حسب نوع الاستمارة المخصصة:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Weaknesses */}
                {enableWeaknesses && (
                  <div>
                    <Label className="text-xs font-bold text-rose-700 block mb-1">
                      نقاط الضعف الملاحظة <span className="text-slate-400 font-normal">(اختياري)</span>
                    </Label>
                    <textarea
                      className="w-full border border-rose-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      rows={2}
                      value={weaknesses}
                      onChange={e => setWeaknesses(e.target.value)}
                      placeholder="نقاط الضعف التي تحتاج إلى معالجة أو تطوير..."
                    />
                  </div>
                )}

                {/* Strengths */}
                {enableStrengths && (
                  <div>
                    <Label className="text-xs font-bold text-emerald-700 block mb-1">
                      نقاط القوة والإنجازات <span className="text-slate-400 font-normal">(اختياري)</span>
                    </Label>
                    <textarea
                      className="w-full border border-emerald-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      rows={2}
                      value={strengths}
                      onChange={e => setStrengths(e.target.value)}
                      placeholder="إنجازات ونقاط تميز الموظف خلال سنة التقييم..."
                    />
                  </div>
                )}

                {/* Training Needs */}
                {enableTrainingNeeds && (
                  <div className="md:col-span-2">
                    <Label className="text-xs font-bold text-blue-700 block mb-1">
                      الاحتياجات التدريبية والدورات المقترحة <span className="text-slate-400 font-normal">(اختياري)</span>
                    </Label>
                    <textarea
                      className="w-full border border-blue-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      rows={2}
                      value={trainingNeeds}
                      onChange={e => setTrainingNeeds(e.target.value)}
                      placeholder="الدورات والبرامج الموصى بها للموظف..."
                    />
                  </div>
                )}

                {/* Employee Opinion */}
                {enableEmployeeOpinion && (
                  <div className="md:col-span-2">
                    <Label className="text-xs font-bold text-purple-700 block mb-1">
                      رأي الموظف بالتقييم <span className="text-slate-400 font-normal">(في حال ترك الحقل فارغاً يحفظ تلقائياً: "لم يضع الموظف رأيه بهذا التقييم")</span>
                    </Label>
                    <textarea
                      className="w-full border border-purple-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                      rows={2}
                      value={employeeOpinion}
                      onChange={e => setEmployeeOpinion(e.target.value)}
                      placeholder="ملاحظات الموظف ورأيه..."
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* General Notes */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <Label className="text-xs font-bold text-slate-800 block mb-1">
              ملاحظات وقرارات التقييم العامة <span className="text-slate-400 font-normal">(اختياري)</span>
            </Label>
            <textarea
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/20"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي ملاحظات أو قرارات إضافية..."
            />
          </div>

          {/* Note: Signatures block is explicitly removed/omitted as per user requirement */}

          {/* Save Action Footer Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-300 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span>تعتمد جميع الدرجات والنتائج بعد التأكد من اكتمال التعبئة اليدوية.</span>
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="rounded-xl text-xs px-5 font-bold cursor-pointer">
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl text-xs px-6 py-2.5 font-black shadow-md flex items-center gap-2 cursor-pointer transition-all"
              >
                <Save size={16} />
                <span>{loading ? 'جاري الحفظ والاعتماد...' : 'حفظ واعتماد نتائج التقييم المكتملة'}</span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
