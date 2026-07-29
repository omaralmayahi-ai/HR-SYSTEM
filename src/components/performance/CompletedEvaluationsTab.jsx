import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/api/apiClient';
import { EVALUATION_GRADE_SCALE } from '@/lib/evaluationEngine';
import {
  CheckCircle2, Search, Eye, Edit3, Trash2, Printer, Award, Sliders, Network
} from 'lucide-react';
import FillEvaluationModal from './FillEvaluationModal';
import PrintSingleEvaluationModal from './PrintSingleEvaluationModal';
import PrintBatchEmployeesFormsModal from './PrintBatchEmployeesFormsModal';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import OrgTreePickerModal from './OrgTreePickerModal';

export default function CompletedEvaluationsTab({
  evaluations,
  employees,
  forms,
  orgUnits,
  year,
  onRefreshData
}) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('all');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('all');
  const [selectedEvaluationDetail, setSelectedEvaluationDetail] = useState(null);
  const [isOrgTreeModalOpen, setIsOrgTreeModalOpen] = useState(false);

  const [activeEditModal, setActiveEditModal] = useState({ isOpen: false, employee: null, evaluation: null });
  const [activePrintModal, setActivePrintModal] = useState({ isOpen: false, employee: null, evaluation: null });
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    onConfirm: () => {}
  });

  // Filter completed evaluations for chosen year
  const completedEvals = evaluations.filter((ev) => {
    if (String(ev.year) !== String(year)) return false;
    const st = (ev.status || '').trim();
    return st !== 'بانتظار التقييم' && !st.includes('انتظار') && (ev.total_score > 0 || ev.totalScore > 0);
  });

  const empMap = new Map(employees.map(e => [e.id, e]));

  // Apply search & org filters
  const filteredList = completedEvals.filter((ev) => {
    const emp = empMap.get(ev.employee_id || ev.employeeId);
    if (!emp) return false;

    // Org filter
    if (selectedOrgFilter === 'unassigned') {
      const dept = (emp.department || '').trim();
      const sec = (emp.section || '').trim();
      if ((dept && dept !== 'غير محدد' && dept !== 'بدون تشكيل') || (sec && sec !== 'غير محدد')) return false;
    } else if (selectedOrgFilter !== 'all') {
      const dept = (emp.department || '').trim();
      const sec = (emp.section || '').trim();
      if (dept !== selectedOrgFilter && sec !== selectedOrgFilter) return false;
    }

    // Grade filter
    if (selectedGradeFilter !== 'all') {
      if (ev.grade !== selectedGradeFilter) return false;
    }

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      const name = (emp.full_name || emp.fullName || '').toLowerCase();
      const num = String(
        emp.company_number || emp.companyNumber ||
        emp.badge_number || emp.badgeNumber ||
        emp.employee_id || emp.employeeId ||
        emp.employee_number || emp.employeeNumber ||
        emp.civil_service_number || emp.civilServiceNumber ||
        emp.file_number || emp.fileNumber ||
        emp.id_number || emp.idNumber || ''
      ).toLowerCase();
      const job = (emp.job_title || emp.jobTitle || '').toLowerCase();
      const dept = (emp.department || emp.section || '').toLowerCase();
      return name.includes(q) || num.includes(q) || job.includes(q) || dept.includes(q);
    }

    return true;
  });

  // Calculate grade distribution counts
  const gradeCounts = {
    'ممتاز': completedEvals.filter(e => e.grade === 'ممتاز').length,
    'جيد جداً': completedEvals.filter(e => e.grade === 'جيد جداً').length,
    'جيد': completedEvals.filter(e => e.grade === 'جيد').length,
    'متوسط': completedEvals.filter(e => e.grade === 'متوسط').length,
    'مقبول': completedEvals.filter(e => e.grade === 'مقبول').length,
    'ضعيف': completedEvals.filter(e => e.grade === 'ضعيف').length,
  };

  // Delete Evaluation Action
  const handleDeleteEvaluation = (ev) => {
    const emp = empMap.get(ev.employee_id || ev.employeeId);
    const empName = emp?.full_name || emp?.fullName || 'الموظف';

    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد إلغاء وحذف التقييم المنجز',
      description: `تحذير هام: حذف هذا التقييم المنجز والمعتمد للموظف (${empName}) لسنة ${ev.year} سيؤدي إلى إلغاء السجل التقييمي المعتمد نهائياً وإعادة الموظف تلقائياً إلى قائمة غير الحاصلين على تقييم. هل تريد الاستمرار بحذف هذا السجل التقييمي؟`,
      confirmText: 'نعم، حذف السجل المنجز نهائياً',
      onConfirm: async () => {
        try {
          await apiClient.entities.PerformanceEvaluation.delete(ev.id);
          toast({
            title: 'تم حذف التقييم المنجز',
            description: `تم إلغاء التقييم المعتمد للموظف (${empName}) وإعادته لقائمة غير الحاصلين على تقييم.`
          });
          onRefreshData();
        } catch (err) {
          toast({ title: 'خطأ', description: err.message || 'فشل حذف التقييم', variant: 'destructive' });
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#1B3A6B] text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-white rounded-full text-xs font-medium">
            <CheckCircle2 size={14} />
            التقييمات المكتملة والمعتمدة رسمياً
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            الاستمارات المنجزة لسنة ({year})
          </h2>
          <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
            استعراض نتائج التقييمات المنجزة، التقديرات المعتمدة، طباعة الاستمارات الرسمية والتعديل على سجلات التقييم للسنة التقييمية الحالية والسنوات السابقة.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3.5 rounded-2xl text-center font-bold">
            <span className="text-[10px] text-slate-200 block uppercase">عدد التقييمات المنجزة</span>
            <span className="text-2xl font-bold font-mono text-emerald-300">{completedEvals.length}</span>
          </div>
        </div>
      </div>

      {/* Grade Statistics Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {EVALUATION_GRADE_SCALE.map((g) => {
          const count = gradeCounts[g.label] || 0;
          const isSelected = selectedGradeFilter === g.label;

          return (
            <button
              key={g.label}
              onClick={() => setSelectedGradeFilter(isSelected ? 'all' : g.label)}
              className={`p-3 rounded-2xl border text-right transition-all flex flex-col justify-between ${
                isSelected
                  ? 'ring-2 ring-[#1B3A6B] bg-white shadow-sm border-[#1B3A6B]'
                  : 'bg-white border-slate-100 hover:border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${g.bg}`}>
                  {g.label}
                </span>
                <Award size={14} className="text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold font-mono text-slate-900">{count}</span>
                <span className="text-[10px] text-slate-400 font-medium">تقييم</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="بحث باسم الموظف، رقم الشركة، أو الرقم الوظيفي..."
            className="pr-9 text-xs rounded-xl border-slate-200 focus:border-[#1B3A6B]"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
          <Button
            type="button"
            onClick={() => setIsOrgTreeModalOpen(true)}
            className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-2xs"
          >
            <div className="p-1 rounded-md bg-[#1B3A6B] text-white flex-shrink-0">
              <Network size={14} />
            </div>
            <span className="truncate max-w-[180px]">
              {selectedOrgFilter === 'all'
                ? 'جميع التشكيلات والأقسام'
                : selectedOrgFilter === 'unassigned'
                ? 'غير منسوبين لقسم'
                : selectedOrgFilter}
            </span>
            <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
              تحديد من الهيكل التنظيمي (الشكل الشجري)
            </span>
          </Button>

          <div className="flex items-center gap-2">
            <Sliders size={16} className="text-slate-400" />
            <select
              value={selectedGradeFilter}
              onChange={e => setSelectedGradeFilter(e.target.value)}
              className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none"
            >
              <option value="all">كل التقديرات</option>
              {EVALUATION_GRADE_SCALE.map(g => (
                <option key={g.label} value={g.label}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#1B3A6B] text-white font-medium">
                <th className="p-3 text-center w-12">#</th>
                <th className="p-3 text-right">اسم الموظف الرباعي</th>
                <th className="p-3 text-center">الرقم الوظيفي</th>
                <th className="p-3 text-right">التشكيل والمسمى الوظيفي</th>
                <th className="p-3 text-center">الدرجة الكلية</th>
                <th className="p-3 text-center">التقدير النهائي</th>
                <th className="p-3 text-right">جهة التقييم / المقيم</th>
                <th className="p-3 text-center">تاريخ التقييم</th>
                <th className="p-3 text-center w-40">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-normal">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    لا توجد تقييمات منجزة مطابقة للفلاتر لسنة {year}.
                  </td>
                </tr>
              ) : (
                filteredList.map((ev, idx) => {
                  const emp = empMap.get(ev.employee_id || ev.employeeId);
                  if (!emp) return null;

                  const totalScore = ev.total_score ?? ev.totalScore ?? 0;
                  const gradeLabel = ev.grade || 'غير محدد';
                  const gradeBadge = EVALUATION_GRADE_SCALE.find(g => g.label === gradeLabel) || { bg: 'bg-slate-100 text-slate-800' };

                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-center font-medium text-slate-400">{idx + 1}</td>
                      <td className="p-3 font-medium text-[#1B3A6B]">
                        {emp.full_name || emp.fullName}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {emp.civil_service_number || emp.civilServiceNumber || emp.employee_number || '—'}
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-medium text-slate-900 block">{emp.job_title || emp.jobTitle || 'موظف'}</span>
                        <span className="text-[11px] text-slate-500">{emp.section || emp.department || 'غير محدد'}</span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-base text-[#1B3A6B]">
                        {totalScore}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${gradeBadge.bg}`}>
                          {gradeLabel}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-slate-800">
                        {ev.evaluator || 'اللجنة المركزية'}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {ev.evaluation_date || ev.evaluationDate || '—'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => setSelectedEvaluationDetail({ evaluation: ev, employee: emp })}
                            className="p-1.5 text-slate-600 hover:text-[#1B3A6B] hover:bg-slate-100 rounded-xl"
                            title="عرض تفاصيل التقييم"
                          >
                            <Eye size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            onClick={() => setActivePrintModal({ isOpen: true, employee: emp, evaluation: ev })}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl"
                            title="طباعة التقييم"
                          >
                            <Printer size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            onClick={() => setActiveEditModal({ isOpen: true, employee: emp, evaluation: ev })}
                            className="p-1.5 text-slate-600 hover:text-green-700 hover:bg-green-50 rounded-xl"
                            title="تعديل التقييم"
                          >
                            <Edit3 size={16} />
                          </Button>

                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEvaluation(ev);
                            }}
                            className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition-all shadow-2xs cursor-pointer"
                            title="حذف التقييم المعتمد"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Preview Modal */}
      {selectedEvaluationDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[85vh] space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900">
                تفاصيل نتائج تقييم الموظف ({selectedEvaluationDetail.employee.full_name || selectedEvaluationDetail.employee.fullName}) - لسنة {selectedEvaluationDetail.evaluation.year}
              </h3>
              <Button
                variant="ghost"
                onClick={() => setSelectedEvaluationDetail(null)}
                className="text-slate-400 hover:text-slate-900 p-1 rounded-lg"
              >
                ✕
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-slate-400 block text-[10px]">المسمى الوظيفي:</span>
                <span className="font-bold text-slate-900">{selectedEvaluationDetail.employee.job_title || selectedEvaluationDetail.employee.jobTitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">التشكيل / القسم:</span>
                <span className="font-bold text-slate-900">{selectedEvaluationDetail.employee.section || selectedEvaluationDetail.employee.department}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">نوع الاستمارة:</span>
                <span className="font-bold text-indigo-900">{selectedEvaluationDetail.evaluation.form_title || selectedEvaluationDetail.evaluation.formTitle}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">المقيم:</span>
                <span className="font-bold text-slate-900">{selectedEvaluationDetail.evaluation.evaluator || '—'}</span>
              </div>
            </div>

            {/* Total Score Banner */}
            <div className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-slate-300 text-[10px] block font-bold">الدرجة النهائية والتقدير</span>
                <span className="text-2xl font-black font-mono text-amber-400">{selectedEvaluationDetail.evaluation.total_score ?? selectedEvaluationDetail.evaluation.totalScore} / 100</span>
              </div>
              <span className="text-xs font-black px-3 py-1 bg-amber-500 text-slate-950 rounded-lg">
                التقدير: {selectedEvaluationDetail.evaluation.grade}
              </span>
            </div>

            {/* Dynamic Custom Fields */}
            <div className="space-y-2 text-xs">
              {selectedEvaluationDetail.evaluation.weaknesses && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <strong className="text-rose-800 block font-bold mb-0.5">نقاط الضعف:</strong>
                  <p className="text-slate-700">{selectedEvaluationDetail.evaluation.weaknesses}</p>
                </div>
              )}

              {selectedEvaluationDetail.evaluation.strengths && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <strong className="text-emerald-800 block font-bold mb-0.5">نقاط القوة:</strong>
                  <p className="text-slate-700">{selectedEvaluationDetail.evaluation.strengths}</p>
                </div>
              )}

              {(selectedEvaluationDetail.evaluation.training_needs || selectedEvaluationDetail.evaluation.trainingNeeds) && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <strong className="text-blue-800 block font-bold mb-0.5">الاحتياجات التدريبية والدورات:</strong>
                  <p className="text-slate-700">{selectedEvaluationDetail.evaluation.training_needs || selectedEvaluationDetail.evaluation.trainingNeeds}</p>
                </div>
              )}

              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                <strong className="text-purple-800 block font-bold mb-0.5">رأي الموظف بالتقييم:</strong>
                <p className="text-slate-700">
                  {selectedEvaluationDetail.evaluation.employee_opinion || selectedEvaluationDetail.evaluation.employeeOpinion || 'لم يضع الموظف رأيه بهذا التقييم'}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedEvaluationDetail(null)} className="bg-slate-800 text-white text-xs px-5 rounded-xl">
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Evaluation Modal */}
      {activeEditModal.isOpen && (
        <FillEvaluationModal
          isOpen={activeEditModal.isOpen}
          onClose={() => setActiveEditModal({ isOpen: false, employee: null, evaluation: null })}
          employee={activeEditModal.employee}
          evaluation={activeEditModal.evaluation}
          forms={forms}
          onSaved={onRefreshData}
        />
      )}

      {/* Print Single Modal */}
      {activePrintModal.isOpen && (
        <PrintSingleEvaluationModal
          isOpen={activePrintModal.isOpen}
          onClose={() => setActivePrintModal({ isOpen: false, employee: null, evaluation: null })}
          evaluation={activePrintModal.evaluation}
          employee={activePrintModal.employee}
          form={forms.find(f => f.id === activePrintModal.evaluation?.form_id)}
        />
      )}

      {/* Batch Print Modal */}
      {isBatchPrintOpen && (
        <PrintBatchEmployeesFormsModal
          isOpen={isBatchPrintOpen}
          onClose={() => setIsBatchPrintOpen(false)}
          selectedEmployees={filteredList.map(ev => empMap.get(ev.employee_id || ev.employeeId)).filter(Boolean)}
          employees={filteredList.map(ev => empMap.get(ev.employee_id || ev.employeeId)).filter(Boolean)}
          evaluations={evaluations}
          forms={forms}
          year={year}
        />
      )}

      {/* Confirmation Dialog Modal */}
      <ConfirmDeleteDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmText={confirmDialog.confirmText}
      />

      {/* Org Structure Tree Selector Modal */}
      <OrgTreePickerModal
        isOpen={isOrgTreeModalOpen}
        onClose={() => setIsOrgTreeModalOpen(false)}
        orgUnits={orgUnits}
        employees={employees}
        selectedOrgUnit={selectedOrgFilter}
        onSelectOrgUnit={(unitName) => {
          setSelectedOrgFilter(unitName);
        }}
      />
    </div>
  );
}
