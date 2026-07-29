import React, { useState, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { determineTargetForm } from '@/lib/evaluationEngine';
import {
  Building2, Users, UserX, Send, Printer, Search, CheckSquare, Square,
  AlertCircle, CheckCircle2, Clock, Sparkles, Trash2, Network
} from 'lucide-react';
import PrintBatchEmployeesFormsModal from './PrintBatchEmployeesFormsModal';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import OrgTreePickerModal from './OrgTreePickerModal';

export default function ReleaseFormsTab({
  employees,
  evaluations,
  forms,
  orgUnits,
  year,
  onRefreshData
}) {
  const { toast } = useToast();
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpIds, setSelectedEmpIds] = useState(new Set());
  const [isReleasing, setIsReleasing] = useState(false);
  const [isBatchFormsPrintModalOpen, setIsBatchFormsPrintModalOpen] = useState(false);
  const [isOrgTreeModalOpen, setIsOrgTreeModalOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    onConfirm: () => {}
  });

  // Helper to check if employee is unassigned to org unit
  const isUnassigned = (emp) => {
    const dept = (emp.department || '').trim();
    return !dept || dept === 'غير محدد' || dept === 'بدون تشكيل';
  };

  // Build map of evaluations for current selected year
  const currentYearEvalsMap = useMemo(() => {
    const map = new Map();
    evaluations.forEach((ev) => {
      if (String(ev.year) === String(year)) {
        map.set(String(ev.employee_id || ev.employeeId), ev);
      }
    });
    return map;
  }, [evaluations, year]);

  // Enrich employee list with target forms & evaluation status for current year
  const enrichedList = useMemo(() => {
    return employees.map((emp) => {
      const empId = String(emp.id);
      const existingEval = currentYearEvalsMap.get(empId);
      const targetForm = determineTargetForm(emp, forms);

      let evalStatus = 'غير مخصص له تقييم';
      if (existingEval) {
        if (existingEval.status === 'منجز' || existingEval.status === 'مرفوع للاعتماد') {
          evalStatus = 'تقييم منجز';
        } else {
          evalStatus = 'استمارة مطلقة - بانتظار التقييم';
        }
      } else if (!targetForm) {
        evalStatus = 'لا توجد استمارة مطابقة';
      }

      return {
        ...emp,
        targetForm,
        existingEval,
        evalStatus
      };
    });
  }, [employees, currentYearEvalsMap, forms]);

  // Enriched list filtered by Org Unit
  const orgFilteredList = useMemo(() => {
    return enrichedList.filter((emp) => {
      if (selectedOrgUnit === 'unassigned') {
        return isUnassigned(emp);
      } else if (selectedOrgUnit !== 'all') {
        const dept = (emp.department || '').trim();
        return dept === selectedOrgUnit;
      }
      return true;
    });
  }, [enrichedList, selectedOrgUnit]);

  // Filter list to ONLY show UNRELEASED employees (no released/completed evaluation for current selected year)
  // Plus Org Unit & Search Query filter
  const filteredList = useMemo(() => {
    return orgFilteredList.filter((emp) => {
      // Exclude employees whose forms are already released for the selected year
      if (emp.existingEval) return false;

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (emp.full_name || emp.fullName || '').toLowerCase();
        const empCode = String(
          emp.company_number || emp.companyNumber ||
          emp.badge_number || emp.badgeNumber ||
          emp.employee_id || emp.employeeId ||
          emp.employee_number || emp.employeeNumber ||
          emp.civil_service_number || emp.civilServiceNumber ||
          emp.file_number || emp.fileNumber ||
          emp.id_number || emp.idNumber || ''
        ).toLowerCase();
        const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
        const dept = (emp.department || '').toLowerCase();

        return name.includes(q) || empCode.includes(q) || title.includes(q) || dept.includes(q);
      }

      return true;
    });
  }, [orgFilteredList, searchQuery]);

  // Selectable employees (for checkbox selection and bulk printing)
  const selectableEmps = useMemo(() => {
    return filteredList;
  }, [filteredList]);

  // Handle Batch Print Paper Forms for Selected Employees
  const handlePrintSelectedForms = () => {
    if (selectedEmpIds.size === 0) {
      toast({
        title: 'تنبيه - تحديد الموظفين للطباعة',
        description: 'يرجى تحديد الموظفين المراد طباعة استماراتهم أولاً بوضع علامة الصح (☑) بجانب أسمائهم من القائمة.',
        variant: 'destructive'
      });
      return;
    }
    setIsBatchFormsPrintModalOpen(true);
  };

  // Handle Single Form Release
  const handleReleaseSingle = async (emp) => {
    if (!emp.targetForm) {
      toast({
        title: 'تعذر الإطلاق',
        description: 'لا توجد استمارة ملائمة لهذا الموظف وفق شروط العنوان الوظيفي والدرجة.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsReleasing(true);
      await apiClient.entities.PerformanceEvaluation.create({
        employee_id: emp.id,
        form_id: emp.targetForm.id,
        year: parseInt(year, 10),
        status: 'بانتظار التقييم',
        total_score: 0,
        evaluator_notes: ''
      });

      toast({
        title: 'تم إطلاق استمارة التقييم',
        description: `تمت تخصيص استمارة (${emp.targetForm.title}) للموظف (${emp.full_name || emp.fullName}) بنجاح للسنة ${year}.`
      });

      onRefreshData();
    } catch (err) {
      toast({
        title: 'خطأ أثناء الإطلاق',
        description: err.message || 'حدث خطأ في الاتصال بالخادم.',
        variant: 'destructive'
      });
    } finally {
      setIsReleasing(false);
    }
  };

  // Delete released evaluation action
  const handleDeleteReleasedEval = (ev, emp) => {
    const empName = emp.full_name || emp.fullName || 'الموظف';
    const isCompleted = ev.status === 'منجز' || ev.status === 'مرفوع للاعتماد' || (ev.total_score > 0);

    setConfirmDialog({
      isOpen: true,
      title: isCompleted ? 'تأكيد إلغاء وحذف التقييم المنجز' : 'تأكيد حذف إطلاق استمارة التقييم',
      description: isCompleted
        ? `تحذير هام: حذف هذا التقييم المنجز للموظف (${empName}) لسنة ${year} سيؤدي لإلغاء السجل التقييمي المعتمد نهائياً وإعادة الموظف لقائمة غير الحاصلين على تقييم. هل تريد الاستمرار بحذف هذا السجل؟`
        : `هل أنت متأكد من حذف إطلاق استمارة التقييم للموظف (${empName}) لسنة ${year}؟ سيؤدي الحذف إلى إرجاع الموظف تلقائياً إلى قائمة غير الحاصلين على تقييم لإعادة التخصيص.`,
      confirmText: isCompleted ? 'نعم، حذف السجل المنجز' : 'نعم، حذف الإطلاق',
      onConfirm: async () => {
        try {
          await apiClient.entities.PerformanceEvaluation.delete(ev.id);
          toast({
            title: 'تم حذف الإطلاق بنجاح',
            description: `تم إرجاع الموظف (${empName}) إلى قائمة غير الحاصلين على تقييم بنجاح`
          });
          onRefreshData();
        } catch (err) {
          toast({ title: 'خطأ', description: err.message || 'فشل حذف التقييم', variant: 'destructive' });
        }
      }
    });
  };

  // Statistics for active org unit selection
  const totalInSelectedOrg = orgFilteredList.length;
  const releasedPendingCount = orgFilteredList.filter(e => e.evalStatus === 'استمارة مطلقة - بانتظار التقييم').length;
  const completedCount = orgFilteredList.filter(e => e.evalStatus === 'تقييم منجز').length;
  const unassignedEvalCount = orgFilteredList.filter(e => !e.existingEval).length;

  // Checkbox toggle helpers
  const toggleSelectAll = () => {
    if (selectedEmpIds.size === selectableEmps.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(selectableEmps.map(e => e.id)));
    }
  };

  const toggleSelectEmp = (id) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Handle Batch Release
  const handleBatchRelease = async () => {
    if (selectedEmpIds.size === 0) return;

    const selectedEmpsList = enrichedList.filter(e => selectedEmpIds.has(e.id));
    const validToRelease = selectedEmpsList.filter(e => e.targetForm);

    if (validToRelease.length === 0) {
      toast({
        title: 'تعذر الإطلاق الجماعي',
        description: 'جميع الموظفين المحددين لا تتوفر لديهم استمارات مطابقة.',
        variant: 'destructive'
      });
      return;
    }

    try {
      setIsReleasing(true);
      const promises = validToRelease.map(emp =>
        apiClient.entities.PerformanceEvaluation.create({
          employee_id: emp.id,
          form_id: emp.targetForm.id,
          year: parseInt(year, 10),
          status: 'بانتظار التقييم',
          total_score: 0,
          evaluator_notes: ''
        })
      );

      await Promise.all(promises);

      toast({
        title: 'تم الإطلاق الجماعي بنجاح',
        description: `تم إطلاق استمارات التقييم لـ (${validToRelease.length}) موظف لسنة ${year}.`
      });

      setSelectedEmpIds(new Set());
      onRefreshData();
    } catch (err) {
      toast({
        title: 'خطأ في الإطلاق الجماعي',
        description: err.message || 'حدث خطأ أثناء معالجة الطلبات.',
        variant: 'destructive'
      });
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-gradient-to-l from-[#1B3A6B] to-[#2C5282] rounded-3xl p-6 text-white shadow-lg space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="bg-white/10 text-white/90 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-xs flex items-center gap-1.5 w-fit">
              <Sparkles size={14} className="text-amber-300" />
              المطابقة التلقائية وفق الهيكل والنظام الموحد
            </span>
            <h2 className="text-xl font-bold tracking-tight">إعداد وتحضير الاستمارات وفق الهيكل التنظيمي ({year})</h2>
            <p className="text-slate-200 text-xs max-w-2xl leading-relaxed">
              اختر التشكيل أو القسم الإداري لتخصيص الاستمارات المعتمدة تلقائياً بناءً على الدرجة الوظيفية والعنوان للموظف.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrintSelectedForms}
              variant="outline"
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/30 backdrop-blur-xs font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer transition-all"
            >
              <Printer size={16} />
              <span>طباعة الاستمارات الورقية المحددة</span>
              {selectedEmpIds.size > 0 && (
                <span className="bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded-md text-[10px] font-mono">
                  {selectedEmpIds.size}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Filters and Org Unit Selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Org Unit Single Tree Selector Button */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Building2 size={14} />
              <span>التشكيل / القسم المحدد وفق الهيكل التنظيمي:</span>
            </label>

            <Button
              type="button"
              onClick={() => setIsOrgTreeModalOpen(true)}
              className="w-full bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center justify-between gap-3 shadow-xs cursor-pointer transition-all"
            >
              <div className="flex items-center gap-2.5 truncate">
                <div className="p-1.5 rounded-lg bg-amber-400 text-slate-950 flex-shrink-0">
                  <Network size={16} />
                </div>
                <span className="truncate text-xs font-black">
                  {selectedOrgUnit === 'all'
                    ? 'جميع التشكيلات والأقسام'
                    : selectedOrgUnit === 'unassigned'
                    ? 'الموظفون غير المنسوبين لقسم'
                    : selectedOrgUnit}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-lg font-bold flex-shrink-0">
                <Network size={13} />
                <span>تحديد من الهيكل التنظيمي (الشكل الشجري)</span>
              </div>
            </Button>
          </div>

          {/* Search Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Search size={14} />
              <span>البحث السريع المباشر:</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث بالاسم، الرقم، المسمى..."
                className="w-full bg-white/10 border border-white/20 rounded-xl pr-9 pl-3 py-2 text-xs font-medium text-white placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <Search size={16} className="absolute right-3 top-2.5 text-slate-300" />
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 text-blue-200 rounded-xl">
              <Users size={18} />
            </div>
            <div>
              <p className="text-[11px] text-slate-300">إجمالي التشكيل</p>
              <p className="text-base font-extrabold text-white">{totalInSelectedOrg}</p>
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-200 rounded-xl">
              <UserX size={18} />
            </div>
            <div>
              <p className="text-[11px] text-slate-300">غير مقيّمين حالياً</p>
              <p className="text-base font-extrabold text-amber-300">{unassignedEvalCount}</p>
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 flex items-center gap-3">
            <div className="p-2 bg-sky-500/20 text-sky-200 rounded-xl">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[11px] text-slate-300">استمارات مطلقة بانتظار التقييم</p>
              <p className="text-base font-extrabold text-sky-200">{releasedPendingCount}</p>
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-3 border border-white/10 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-200 rounded-xl">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[11px] text-slate-300">تقييمات منجزة معتمدة</p>
              <p className="text-base font-extrabold text-emerald-300">{completedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Table Control Header */}
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700">
              قائمة الموظفين المقترح تخصيص الاستمارات لهم ({filteredList.length})
            </span>
            {selectedEmpIds.size > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-amber-200">
                تم تحديد ({selectedEmpIds.size}) موظف
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedEmpIds.size > 0 && (
              <Button
                onClick={handleBatchRelease}
                disabled={isReleasing}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Send size={15} />
                <span>إطلاق الاستمارات للمحددين ({selectedEmpIds.size})</span>
              </Button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 text-xs font-bold">
                <th className="p-3 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    disabled={selectableEmps.length === 0}
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 cursor-pointer"
                  >
                    {selectedEmpIds.size > 0 && selectedEmpIds.size === selectableEmps.length ? (
                      <CheckSquare size={18} className="text-emerald-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="p-3">اسم الموظف الرباعي</th>
                <th className="p-3">رقم الشركة</th>
                <th className="p-3">المسمى الوظيفي والدرجة</th>
                <th className="p-3">الاستمارة المخصصة تلقائياً</th>
                <th className="p-3 text-center">حالة التقييم ({year})</th>
                <th className="p-3 text-center w-36">الإجراءات والتحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    لا يوجد موظفون ينتمون للتشكيل أو معيار البحث المحدد.
                  </td>
                </tr>
              ) : (
                filteredList.map((emp) => {
                  const empId = String(emp.id);
                  const isSelected = selectedEmpIds.has(emp.id);
                  const canSelect = true;

                  return (
                    <tr
                      key={emp.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleSelectEmp(emp.id)}
                          disabled={!canSelect}
                          className="text-slate-400 hover:text-slate-600 disabled:opacity-20 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-amber-600" />
                          ) : (
                            <Square size={18} />
                          )}
                        </button>
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        {emp.full_name || emp.fullName}
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-xs">
                        {emp.company_number || emp.companyNumber || emp.badge_number || emp.badgeNumber || emp.employee_id || emp.employeeId || '—'}
                      </td>
                      <td className="p-3 text-slate-600 text-xs">
                        <span className="font-semibold block text-slate-700">{emp.job_title || emp.jobTitle || 'غير محدد'}</span>
                        <span className="text-slate-400 text-[11px]">{emp.department || 'بدون قسم'} • درجة {emp.grade || '—'}</span>
                      </td>
                      <td className="p-3">
                        {emp.targetForm ? (
                          <div className="flex items-center gap-1.5 text-xs text-blue-700 font-bold bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 w-fit">
                            <Sparkles size={13} className="text-blue-500" />
                            <span>{emp.targetForm.title}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-rose-600 font-medium bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 w-fit">
                            <AlertCircle size={13} />
                            <span>لا توجد استمارة ملائمة</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                            emp.evalStatus === 'تقييم منجز'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : emp.evalStatus === 'استمارة مطلقة - بانتظار التقييم'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {emp.evalStatus === 'تقييم منجز' && <CheckCircle2 size={12} />}
                          {emp.evalStatus === 'استمارة مطلقة - بانتظار التقييم' && <Clock size={12} />}
                          {emp.evalStatus}
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {emp.existingEval ? (
                          <Button
                            variant="ghost"
                            onClick={() => handleDeleteReleasedEval(emp.existingEval, emp)}
                            className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1 mx-auto"
                            title="حذف التقييم/الاستمارة المطلقة وإعادة الموظف لقائمة غير المقيّمين"
                          >
                            <Trash2 size={15} />
                            <span className="text-[11px] font-bold">حذف</span>
                          </Button>
                        ) : emp.targetForm ? (
                          <Button
                            onClick={() => handleReleaseSingle(emp)}
                            disabled={isReleasing}
                            className="bg-[#1B3A6B] hover:bg-[#2C5282] text-white text-xs font-bold py-1 px-3 rounded-lg flex items-center gap-1 mx-auto cursor-pointer"
                          >
                            <Send size={13} />
                            <span>إطلاق الاستمارة</span>
                          </Button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Batch Blank/Filled Forms Modal */}
      {isBatchFormsPrintModalOpen && (
        <PrintBatchEmployeesFormsModal
          isOpen={isBatchFormsPrintModalOpen}
          onClose={() => setIsBatchFormsPrintModalOpen(false)}
          selectedEmployees={
            selectedEmpIds.size > 0
              ? filteredList.filter(e => selectedEmpIds.has(e.id))
              : filteredList
          }
          employees={
            selectedEmpIds.size > 0
              ? filteredList.filter(e => selectedEmpIds.has(e.id))
              : filteredList
          }
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
        selectedOrgUnit={selectedOrgUnit}
        onSelectOrgUnit={(unitName) => {
          setSelectedOrgUnit(unitName);
          setSelectedEmpIds(new Set());
        }}
      />
    </div>
  );
}
