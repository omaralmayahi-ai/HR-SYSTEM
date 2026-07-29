import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/api/apiClient';
import {
  Clock, Search, Edit3, Printer, CheckSquare, Square,
  PauseCircle, PlayCircle, Trash2, Sliders, AlertCircle, Network
} from 'lucide-react';
import FillEvaluationModal from './FillEvaluationModal';
import PrintSingleEvaluationModal from './PrintSingleEvaluationModal';
import PrintBatchEmployeesFormsModal from './PrintBatchEmployeesFormsModal';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import OrgTreePickerModal from './OrgTreePickerModal';

export default function PendingEvaluationsTab({
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
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedEvalIds, setSelectedEvalIds] = useState(new Set());
  const [loadingAction, setLoadingAction] = useState(false);
  const [isOrgTreeModalOpen, setIsOrgTreeModalOpen] = useState(false);

  const [activeFillModal, setActiveFillModal] = useState({ isOpen: false, employee: null, evaluation: null });
  const [activePrintModal, setActivePrintModal] = useState({ isOpen: false, employee: null, evaluation: null });
  const [isBatchPrintOpen, setIsBatchPrintOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    confirmText: '',
    onConfirm: () => {}
  });

  // Filter evaluations: status === 'بانتظار التقييم' OR 'موقوف' AND matching year
  const pendingEvals = evaluations.filter((ev) => {
    if (String(ev.year) !== String(year)) return false;
    const st = (ev.status || '').trim();
    return st === 'بانتظار التقييم' || st.includes('انتظار') || st === 'موقوف' || (ev.total_score === 0 && st !== 'مكتمل');
  });

  const empMap = new Map(employees.map(e => [e.id, e]));

  // Apply filters
  const filteredList = pendingEvals.filter((ev) => {
    const emp = empMap.get(ev.employee_id || ev.employeeId);
    if (!emp) return false;

    // Status filter
    const st = (ev.status || '').trim();
    if (selectedStatusFilter === 'pending' && st === 'موقوف') return false;
    if (selectedStatusFilter === 'suspended' && st !== 'موقوف') return false;

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

  const handleSelectAll = () => {
    if (selectedEvalIds.size === filteredList.length) {
      setSelectedEvalIds(new Set());
    } else {
      setSelectedEvalIds(new Set(filteredList.map(e => e.id)));
    }
  };

  const toggleSelect = (id) => {
    const next = new Set(selectedEvalIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEvalIds(next);
  };

  const selectedEmployeesList = filteredList
    .filter(ev => selectedEvalIds.has(ev.id))
    .map(ev => empMap.get(ev.employee_id || ev.employeeId))
    .filter(Boolean);

  // Single Delete
  const handleDeleteEvaluation = (ev) => {
    const emp = empMap.get(ev.employee_id || ev.employeeId);
    const empName = emp?.full_name || emp?.fullName || 'الموظف';

    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد حذف إطلاق التقييم',
      description: `هل أنت متأكد من حذف إطلاق استمارة التقييم للموظف (${empName}) لسنة ${ev.year}؟ سيؤدي الحذف إلى إرجاع الموظف تلقائياً إلى قائمة غير الحاصلين على تقييم لإعادة التخصيص.`,
      confirmText: 'نعم، حذف الإطلاق',
      onConfirm: async () => {
        try {
          setLoadingAction(true);
          await apiClient.entities.PerformanceEvaluation.delete(ev.id);
          toast({
            title: 'تم حذف الإطلاق بنجاح',
            description: `تم إرجاع الموظف (${empName}) إلى قائمة غير الحاصلين على تقييم بنجاح`
          });
          setSelectedEvalIds(prev => {
            const next = new Set(prev);
            next.delete(ev.id);
            return next;
          });
          onRefreshData();
        } catch (err) {
          toast({ title: 'خطأ', description: err.message || 'فشل حذف التقييم', variant: 'destructive' });
        } finally {
          setLoadingAction(false);
        }
      }
    });
  };

  // Single Toggle Status (Suspend / Activate)
  const handleToggleStatus = async (ev) => {
    const isCurrentlySuspended = (ev.status || '').trim() === 'موقوف';
    const newStatus = isCurrentlySuspended ? 'بانتظار التقييم' : 'موقوف';
    const actionText = isCurrentlySuspended ? 'تنشيط' : 'إيقاف';

    try {
      setLoadingAction(true);
      await apiClient.entities.PerformanceEvaluation.update(ev.id, { status: newStatus });
      toast({
        title: `تم ${actionText} التقييم`,
        description: `تم تغيير حالة التقييم إلى (${newStatus}) بنجاح`
      });
      onRefreshData();
    } catch (err) {
      toast({ title: 'خطأ', description: `فشل ${actionText} التقييم`, variant: 'destructive' });
    } finally {
      setLoadingAction(false);
    }
  };

  // Batch Status Change
  const handleBatchStatusChange = (targetStatus) => {
    if (selectedEvalIds.size === 0) return;
    const actionText = targetStatus === 'موقوف' ? 'إيقاف' : 'تنشيط';

    setConfirmDialog({
      isOpen: true,
      title: `تأكيد ${actionText} التقييمات المحددة`,
      description: `هل أنت متأكد من ${actionText} التقييمات لـ (${selectedEvalIds.size}) موظف تحديداً؟`,
      confirmText: `نعم، أكد ${actionText}`,
      onConfirm: async () => {
        try {
          setLoadingAction(true);
          const updates = Array.from(selectedEvalIds).map(id =>
            apiClient.entities.PerformanceEvaluation.update(id, { status: targetStatus })
          );
          await Promise.all(updates);
          toast({
            title: `تم ${actionText} التقييمات بنجاح`,
            description: `تم تحديث حالة (${selectedEvalIds.size}) تقييم إلى (${targetStatus})`
          });
          setSelectedEvalIds(new Set());
          onRefreshData();
        } catch (err) {
          toast({ title: 'خطأ', description: `حدث خطأ أثناء ${actionText} التقييمات المحددة`, variant: 'destructive' });
        } finally {
          setLoadingAction(false);
        }
      }
    });
  };

  // Batch Delete
  const handleBatchDelete = () => {
    if (selectedEvalIds.size === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد الحذف الجماعي للتقييمات',
      description: `تحذير: هل أنت متأكد من حذف إطلاق التقييمات لـ (${selectedEvalIds.size}) موظف؟ هذا الإجراء سيرجعهم جميعاً لحالة الاستمارات غير المطلقة.`,
      confirmText: `نعم، حذف (${selectedEvalIds.size}) تقييم`,
      onConfirm: async () => {
        try {
          setLoadingAction(true);
          const deletes = Array.from(selectedEvalIds).map(id =>
            apiClient.entities.PerformanceEvaluation.delete(id)
          );
          await Promise.all(deletes);
          toast({
            title: 'تم الحذف الجماعي بنجاح',
            description: `تم حذف (${selectedEvalIds.size}) تقييم بنجاح`
          });
          setSelectedEvalIds(new Set());
          onRefreshData();
        } catch (err) {
          toast({ title: 'خطأ', description: 'حدث خطأ أثناء حذف التقييمات المحددة', variant: 'destructive' });
        } finally {
          setLoadingAction(false);
        }
      }
    });
  };

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Header Banner */}
      <div className="bg-[#1B3A6B] text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-white rounded-full text-xs font-medium">
            <Clock size={14} />
            الاستمارات المطلقة بانتظار التعبئة والتنفيذ
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            إدارة التقييمات الجارية والموقوفة لسنة ({year})
          </h2>
          <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
            تحكم كامل بالتقييمات المطلقة: تعبئة الدرجات، إيقاف التقييم مؤقتاً، إعادة التنشيط، طباعة الاستمارات المخصصة أو حذف الإطلاق لإعادة التخصيص.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-3 rounded-2xl text-center font-bold min-w-[100px]">
            <span className="text-[10px] text-slate-200 block uppercase">بانتظار التقييم</span>
            <span className="text-xl font-bold font-mono text-amber-300">
              {pendingEvals.filter(e => (e.status || '').trim() !== 'موقوف').length}
            </span>
          </div>

          <div className="bg-white/10 p-3 rounded-2xl text-center font-bold min-w-[100px]">
            <span className="text-[10px] text-slate-200 block uppercase">الموقوفة مؤقتاً</span>
            <span className="text-xl font-bold font-mono text-rose-300">
              {pendingEvals.filter(e => (e.status || '').trim() === 'موقوف').length}
            </span>
          </div>
        </div>
      </div>

      {/* Filters & Actions Toolbar */}
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

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
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

          <div className="flex items-center gap-1.5">
            <Sliders size={16} className="text-slate-400" />
            <select
              value={selectedStatusFilter}
              onChange={e => setSelectedStatusFilter(e.target.value)}
              className="text-xs font-bold border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 focus:outline-none"
            >
              <option value="all">كل الحالات (جارية + موقوفة)</option>
              <option value="pending">بانتظار التقييم فقط</option>
              <option value="suspended">الموقوفة مؤقتاً فقط</option>
            </select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleSelectAll}
            className="rounded-xl text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
          >
            {selectedEvalIds.size === filteredList.length && filteredList.length > 0 ? (
              <>
                <CheckSquare size={16} className="text-[#1B3A6B]" />
                إلغاء التحديد
              </>
            ) : (
              <>
                <Square size={16} className="text-slate-400" />
                تحديد الكل ({filteredList.length})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Batch Action Buttons Bar (Visible when items selected) */}
      {selectedEvalIds.size > 0 && (
        <div className="bg-[#1B3A6B] text-white rounded-2xl p-3.5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
            <span className="text-xs font-bold text-slate-100">
              تم تحديد ({selectedEvalIds.size}) استمارة تقييم
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
            <Button
              type="button"
              onClick={() => handleBatchStatusChange('موقوف')}
              disabled={loadingAction}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold px-3 py-1.5 flex items-center gap-1.5"
            >
              <PauseCircle size={15} />
              إيقاف المحددين
            </Button>

            <Button
              type="button"
              onClick={() => handleBatchStatusChange('بانتظار التقييم')}
              disabled={loadingAction}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold px-3 py-1.5 flex items-center gap-1.5"
            >
              <PlayCircle size={15} />
              تنشيط المحددين
            </Button>



            <Button
              type="button"
              onClick={handleBatchDelete}
              disabled={loadingAction}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold px-3 py-1.5 flex items-center gap-1.5"
            >
              <Trash2 size={15} />
              حذف المحددين
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#1B3A6B] text-white font-medium">
                <th className="p-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={selectedEvalIds.size === filteredList.length && filteredList.length > 0}
                    onChange={handleSelectAll}
                    className="rounded accent-[#1B3A6B] cursor-pointer"
                  />
                </th>
                <th className="p-3 text-right">اسم الموظف الرباعي</th>
                <th className="p-3 text-center">الرقم الوظيفي</th>
                <th className="p-3 text-right">التشكيل والمسمى الوظيفي</th>
                <th className="p-3 text-right">الاستمارة المخصصة</th>
                <th className="p-3 text-center">تاريخ الإطلاق</th>
                <th className="p-3 text-center">الحالة الحالية</th>
                <th className="p-3 text-center w-60">الإجراءات والتحكم</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-normal">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    لا توجد استمارات مطابقة لمعايير البحث لسنة {year}.
                  </td>
                </tr>
              ) : (
                filteredList.map((ev) => {
                  const emp = empMap.get(ev.employee_id || ev.employeeId);
                  if (!emp) return null;
                  const isSelected = selectedEvalIds.has(ev.id);
                  const isSuspended = (ev.status || '').trim() === 'موقوف';

                  return (
                    <tr
                      key={ev.id}
                      onClick={() => toggleSelect(ev.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-slate-100/70' : 'hover:bg-slate-50'
                      } ${isSuspended ? 'bg-slate-50/80' : ''}`}
                    >
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(ev.id)}
                          className="rounded accent-[#1B3A6B] cursor-pointer"
                        />
                      </td>
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
                      <td className="p-3 font-medium text-[#1B3A6B]">
                        <span className="bg-slate-100 px-2 py-0.5 rounded-md inline-block text-xs">
                          {ev.form_title || ev.formTitle || 'استمارة قياسية'}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600">
                        {ev.evaluation_date || ev.evaluationDate || '—'}
                      </td>
                      <td className="p-3 text-center">
                        {isSuspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <AlertCircle size={13} />
                            موقوف مؤقتاً
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            <Clock size={13} />
                            بانتظار التقييم
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {/* Fill / Edit Evaluation */}
                          <Button
                            onClick={() => setActiveFillModal({ isOpen: true, employee: emp, evaluation: ev })}
                            className="bg-[#1B3A6B] hover:bg-[#152d54] text-white font-medium text-xs px-2.5 py-1.5 rounded-xl shadow-2xs flex items-center gap-1"
                            title="تعبئة وتعديل درجات التقييم"
                          >
                            <Edit3 size={14} />
                            <span>تعبئة</span>
                          </Button>

                          {/* Suspend / Activate Toggle Button */}
                          <Button
                            variant="ghost"
                            onClick={() => handleToggleStatus(ev)}
                            disabled={loadingAction}
                            className={`p-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                              isSuspended
                                ? 'text-emerald-700 hover:bg-emerald-50'
                                : 'text-amber-700 hover:bg-amber-50'
                            }`}
                            title={isSuspended ? 'إعادة تنشيط التقييم' : 'إيقاف التقييم مؤقتاً'}
                          >
                            {isSuspended ? <PlayCircle size={16} /> : <PauseCircle size={16} />}
                          </Button>

                          {/* Print Single Blank / Assigned Form */}
                          <Button
                            variant="ghost"
                            onClick={() => setActivePrintModal({ isOpen: true, employee: emp, evaluation: ev })}
                            className="p-1.5 text-slate-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl"
                            title="طباعة الاستمارة"
                          >
                            <Printer size={16} />
                          </Button>

                          {/* Delete Launched Evaluation */}
                          <Button
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEvaluation(ev);
                            }}
                            disabled={loadingAction}
                            className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition-all shadow-2xs cursor-pointer"
                            title="حذف إطلاق التقييم وإعادة الموظف لقائمة غير المقيّمين"
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

      {/* Fill Evaluation Modal */}
      {activeFillModal.isOpen && (
        <FillEvaluationModal
          isOpen={activeFillModal.isOpen}
          onClose={() => setActiveFillModal({ isOpen: false, employee: null, evaluation: null })}
          employee={activeFillModal.employee}
          evaluation={activeFillModal.evaluation}
          forms={forms}
          onSaved={onRefreshData}
        />
      )}

      {/* Print Single Evaluation Modal */}
      {activePrintModal.isOpen && (
        <PrintSingleEvaluationModal
          isOpen={activePrintModal.isOpen}
          onClose={() => setActivePrintModal({ isOpen: false, employee: null, evaluation: null })}
          evaluation={activePrintModal.evaluation}
          employee={activePrintModal.employee}
          form={forms.find(f => f.id === activePrintModal.evaluation?.form_id)}
        />
      )}

      {/* Print Batch Individual Forms Modal */}
      {isBatchPrintOpen && (
        <PrintBatchEmployeesFormsModal
          isOpen={isBatchPrintOpen}
          onClose={() => setIsBatchPrintOpen(false)}
          selectedEmployees={
            selectedEmployeesList.length > 0
              ? selectedEmployeesList
              : filteredList.map(ev => empMap.get(ev.employee_id || ev.employeeId)).filter(Boolean)
          }
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
          setSelectedEvalIds(new Set());
        }}
      />
    </div>
  );
}
