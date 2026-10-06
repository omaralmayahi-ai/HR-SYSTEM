import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, TrendingUp, CheckCircle2, AlertCircle, Clock,
  Search, RefreshCw, CheckSquare, Square,
  ShieldCheck, Layers, FileText, ChevronDown, ChevronUp,
  Info, AlertTriangle, ShieldAlert, Sparkles, UserCheck, Calendar,
  ExternalLink, GraduationCap, Briefcase
} from 'lucide-react';
import apiClient from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

function calculatePeriodDiff(fromDateStr, toDateStr) {
  if (!fromDateStr || !toDateStr || fromDateStr === '—' || toDateStr === '—') return null;
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null;
  
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const dayDiff = to.getDate() - from.getDate();
  if (dayDiff > 15) months++;
  else if (dayDiff < -15) months--;
  
  if (months <= 0) return 'استحقاق فوري / حالي';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'سنة' : (years === 2 ? 'سنتين' : (years <= 10 ? 'سنوات' : 'سنة'))}`);
  if (remMonths > 0) parts.push(`${remMonths} ${remMonths === 1 ? 'شهر' : (remMonths === 2 ? 'شهرين' : (remMonths <= 10 ? 'أشهر' : 'شهر'))}`);
  return parts.join(' و ') || `${months} شهر`;
}

const ANNUAL_INCREMENTS = {
  1: 20000,
  2: 17000,
  3: 10000,
  4: 8000,
  5: 6000,
  6: 6000,
  7: 6000,
  8: 3000,
  9: 3000,
  10: 3000
};

export default function PromotionsDue() {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('increments'); // 'increments' | 'promotions' | 'settlements'
  const [loading, setLoading] = useState(true);
  const [dueData, setDueData] = useState({
    dueForIncrement: [],
    dueForPromotion: [],
    dueForSettlement: [],
    summary: { totalIncrement: 0, totalPromotion: 0, totalSettlement: 0, totalDue: 0 }
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  // Multi-selection state: keys like `${type}_${employeeId}`
  const [selectedItems, setSelectedItems] = useState({});

  // Approval Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [approvalTargetItems, setApprovalTargetItems] = useState([]);

  // Detailed Inspector Modal state
  const [detailsModalItem, setDetailsModalItem] = useState(null);

  // Fetch Due List from Backend
  const fetchDueList = async () => {
    setLoading(true);
    try {
      const res = await apiClient.promotionsDue.getDueList();
      if (res) {
        setDueData({
          dueForIncrement: res.dueForIncrement || res.due_for_increment || [],
          dueForPromotion: res.dueForPromotion || res.due_for_promotion || [],
          dueForSettlement: res.dueForSettlement || res.due_for_settlement || [],
          summary: res.summary || {
            totalIncrement: (res.dueForIncrement || []).length,
            totalPromotion: (res.dueForPromotion || []).length,
            totalSettlement: (res.dueForSettlement || []).length,
            totalDue: (res.dueForIncrement || []).length + (res.dueForPromotion || []).length + (res.dueForSettlement || []).length
          }
        });
      }
    } catch (err) {
      console.error('Error fetching promotion due list:', err);
      toast({
        title: 'خطأ في جلب البيانات',
        description: err.message || 'تعذر تحميل قوائم المستحقين من الخادم',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDueList();
  }, []);

  // Filter current active list
  const currentList = useMemo(() => {
    let list = [];
    if (activeTab === 'increments') list = dueData.dueForIncrement;
    else if (activeTab === 'promotions') list = dueData.dueForPromotion;
    else if (activeTab === 'settlements') list = dueData.dueForSettlement;

    return list.filter(item => {
      const name = item.name || item.fullName || '';
      const dept = item.department || '';
      const job = item.jobTitle || item.job_title || item.currentJobTitle || '';
      const grade = String(item.currentGrade || item.current_grade || '');

      const matchSearch =
        searchTerm === '' ||
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.toLowerCase().includes(searchTerm.toLowerCase()) ||
        grade.includes(searchTerm);

      const matchDept = departmentFilter === 'ALL' || dept === departmentFilter;

      return matchSearch && matchDept;
    });
  }, [activeTab, dueData, searchTerm, departmentFilter]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const all = [
      ...dueData.dueForIncrement,
      ...dueData.dueForPromotion,
      ...dueData.dueForSettlement
    ].map(i => i.department).filter(Boolean);
    return Array.from(new Set(all));
  }, [dueData]);

  // Selection handlers
  const getItemKey = (item) => `${item.actionType || item.action_type || activeTab}_${item.employeeId || item.employee_id}`;

  const isSelected = (item) => Boolean(selectedItems[getItemKey(item)]);

  const toggleSelectItem = (item) => {
    const key = getItemKey(item);
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = item;
      }
      return next;
    });
  };

  const isAllCurrentSelected = useMemo(() => {
    if (currentList.length === 0) return false;
    return currentList.every(item => isSelected(item));
  }, [currentList, selectedItems]);

  const toggleSelectAllCurrent = () => {
    if (isAllCurrentSelected) {
      setSelectedItems(prev => {
        const next = { ...prev };
        currentList.forEach(item => {
          delete next[getItemKey(item)];
        });
        return next;
      });
    } else {
      setSelectedItems(prev => {
        const next = { ...prev };
        currentList.forEach(item => {
          next[getItemKey(item)] = item;
        });
        return next;
      });
    }
  };

  const selectedCount = Object.keys(selectedItems).length;

  // Open approval modal for selected items
  const handleOpenBatchModal = () => {
    const items = Object.values(selectedItems);
    if (items.length === 0) {
      toast({
        title: 'تنبيه',
        description: 'يرجى تحديد موظف واحد على الأقل للاعتماد',
        variant: 'default'
      });
      return;
    }
    setApprovalTargetItems(items);
    setIsModalOpen(true);
  };

  // Open approval modal for a single item
  const handleOpenSingleModal = (item) => {
    setApprovalTargetItems([item]);
    setIsModalOpen(true);
  };

  // Submit batch approval to backend
  const handleSubmitApproval = async (e) => {
    e?.preventDefault();
    if (!orderNumber.trim()) {
      toast({
        title: 'حقل إلزامي',
        description: 'يرجى إدخال رقم الأمر الإداري',
        variant: 'destructive'
      });
      return;
    }
    if (!orderDate) {
      toast({
        title: 'حقل إلزامي',
        description: 'يرجى تحديد تاريخ صدور الأمر الإداري',
        variant: 'destructive'
      });
      return;
    }

    setModalSubmitting(true);
    try {
      const payload = {
        order_number: orderNumber.trim(),
        order_date: orderDate,
        items: approvalTargetItems.map(item => ({
          employee_id: item.employeeId || item.employee_id,
          type: item.actionType || item.action_type || (activeTab === 'increments' ? 'علاوة' : (activeTab === 'settlements' ? 'تسوية' : 'ترفيع'))
        }))
      };

      const res = await apiClient.promotionsDue.approveBatch(payload);

      toast({
        title: 'تم الاعتماد بنجاح',
        description: res.message || `تم اعتماد ${approvalTargetItems.length} معاملة بالأمر الإداري (${orderNumber})`,
        variant: 'default'
      });

      setIsModalOpen(false);
      setOrderNumber('');
      setSelectedItems({});
      await fetchDueList();
    } catch (err) {
      console.error('Error approving batch:', err);
      toast({
        title: 'تعذر إتمام الاعتماد',
        description: err.message || 'حدث خطأ أثناء اعتماد الدفعة، تم التراجع عن جميع التغييرات',
        variant: 'destructive'
      });
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-[#1B3A6B] text-[#C8960C] flex items-center justify-center shadow-inner">
              <Award size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1B3A6B]">قوائم المستحقين للترقية والعلاوة والتسوية</h1>
              <p className="text-sm text-slate-500">
                إدارة واعتماد استحقاقات الترفيع الوظيفي والعلاوات السنوية وتسوية مسار احتساب الشهادات مع بيان كافة المؤثرات
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchDueList}
            disabled={loading}
            className="flex items-center gap-2 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>تحديث القوائم</span>
          </Button>

          {selectedCount > 0 && (
            <Button
              onClick={handleOpenBatchModal}
              className="bg-[#C8960C] hover:bg-[#b0830a] text-white flex items-center gap-2 shadow-md transition-all animate-pulse font-semibold"
            >
              <CheckCircle2 size={18} />
              <span>اعتماد المحدد ({selectedCount})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Increments */}
        <div
          onClick={() => setActiveTab('increments')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'increments'
              ? 'bg-emerald-50/80 border-emerald-300 shadow-md ring-2 ring-emerald-500/20'
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-full">
              المسار الاعتيادي
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mb-1">
            {dueData.summary.totalIncrement}
          </p>
          <p className="text-sm font-medium text-slate-600">مستحق للعلاوة السنوية</p>
          <p className="text-xs text-slate-400 mt-1">تغيير المرحلة (+1) وثبات الدرجة</p>
        </div>

        {/* Card 2: Promotions */}
        <div
          onClick={() => setActiveTab('promotions')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'promotions'
              ? 'bg-blue-50/80 border-blue-300 shadow-md ring-2 ring-blue-500/20'
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-blue-800 bg-blue-100/80 px-2.5 py-1 rounded-full">
              المسار الاعتيادي
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Award size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mb-1">
            {dueData.summary.totalPromotion}
          </p>
          <p className="text-sm font-medium text-slate-600">مستحق للترفيع الوظيفي</p>
          <p className="text-xs text-slate-400 mt-1">ترقية وتغيير درجة فعلية (-1)</p>
        </div>

        {/* Card 3: Settlements */}
        <div
          onClick={() => setActiveTab('settlements')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'settlements'
              ? 'bg-amber-50/80 border-amber-300 shadow-md ring-2 ring-amber-500/20'
              : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-full">
              مسار احتساب الشهادات
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-800 mb-1">
            {dueData.summary.totalSettlement}
          </p>
          <p className="text-sm font-medium text-slate-600">مستحق لتسوية العجز</p>
          <p className="text-xs text-amber-700 font-semibold mt-1">تثبيت استحقاق بدون تغيير درجة</p>
        </div>

        {/* Card 4: Grand Total */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#1B3A6B] to-[#254d8c] text-white shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/80 bg-white/10 px-2.5 py-1 rounded-full">
              إجمالي الاستحقاقات
            </span>
            <div className="w-9 h-9 rounded-xl bg-white/10 text-[#C8960C] flex items-center justify-center">
              <Layers size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white mb-1">
            {dueData.summary.totalDue}
          </p>
          <p className="text-sm font-medium text-slate-200">إجمالي المعاملات المعلقة</p>
          <p className="text-xs text-slate-300/80 mt-1">تنتظر صدور الأمر الإداري والاعتماد</p>
        </div>
      </div>

      {/* Main Table Card with Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-2 flex flex-wrap gap-2">
          <button
            onClick={() => { setActiveTab('increments'); }}
            className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'increments'
                ? 'bg-white text-emerald-800 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <TrendingUp size={18} className={activeTab === 'increments' ? 'text-emerald-600' : 'text-slate-400'} />
            <span>المستحقون للعلاوة السنوية</span>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5">
              {dueData.summary.totalIncrement}
            </Badge>
          </button>

          <button
            onClick={() => { setActiveTab('promotions'); }}
            className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'promotions'
                ? 'bg-white text-blue-800 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <Award size={18} className={activeTab === 'promotions' ? 'text-blue-600' : 'text-slate-400'} />
            <span>المستحقون للترفيع الوظيفي (تغيير درجة)</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5">
              {dueData.summary.totalPromotion}
            </Badge>
          </button>

          <button
            onClick={() => { setActiveTab('settlements'); }}
            className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'settlements'
                ? 'bg-white text-amber-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
            }`}
          >
            <ShieldCheck size={18} className={activeTab === 'settlements' ? 'text-amber-600' : 'text-slate-400'} />
            <span>تسوية مسار الشهادات (تثبيت دون تغيير درجة)</span>
            <Badge variant="secondary" className="bg-amber-100 text-amber-900 text-xs px-2 py-0.5">
              {dueData.summary.totalSettlement}
            </Badge>
          </button>
        </div>

        {/* Special Banner for Settlements Tab */}
        {activeTab === 'settlements' && (
          <div className="bg-amber-50 border-y border-amber-200 px-6 py-3 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
            <p className="text-xs text-amber-900 leading-relaxed font-medium">
              <strong>تنبيه خاص بمسار الشهادات:</strong> اعتماد تسوية العجز يقوم بتحديث تاريخ آخر ترفيع وإغلاق مسار الاحتساب كمكتمل
              <strong> دون تغيير الدرجة أو المرحلة الحالية للموظف</strong> (تثبيت الاستحقاق الفعلي للدرجة بعد استيفاء السنتين ودورة الاختصاص).
            </p>
          </div>
        )}

        {/* Filters Bar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-3 w-full sm:w-auto flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="البحث بالاسم، العنوان الوظيفي، أو الدرجة..."
                className="pr-10 bg-slate-50 border-slate-200 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {departments.length > 0 && (
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#1B3A6B]/20 outline-none"
              >
                <option value="ALL">كافة الأقسام والتشكيلات</option>
                {departments.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAllCurrent}
              className="text-xs flex items-center gap-1.5 border-slate-200"
            >
              {isAllCurrentSelected ? <CheckSquare size={14} className="text-[#C8960C]" /> : <Square size={14} />}
              <span>{isAllCurrentSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل بالصفحة'}</span>
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin text-[#1B3A6B] mx-auto mb-3" />
              <p className="font-medium text-sm">جاري مراجعة وتحليل استحقاقات الموظفين وربط المؤثرات...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-700 mb-1">لا توجد استحقاقات معلقة بهذا التبويب</p>
              <p className="text-xs text-slate-400">جميع الموظفين محدثين أو لم يحن موعد استحقاقهم بعد</p>
            </div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 text-slate-700 font-bold border-b border-slate-200 text-xs">
                <tr>
                  <th className="p-3.5 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentSelected}
                      onChange={toggleSelectAllCurrent}
                      className="w-4 h-4 rounded text-[#C8960C] focus:ring-[#C8960C] cursor-pointer"
                    />
                  </th>
                  <th className="p-3.5">الموظف والتشكيل</th>
                  <th className="p-3.5">
                    {activeTab === 'promotions' ? 'العنوان والدرجة الحالية (تاريخ الترقية الحالي)' : (activeTab === 'increments' ? 'العلاوة والمرحلة الحالية (تاريخ المنح الحالي)' : 'الوضع الحالي (تاريخ الاحتساب السابق)')}
                  </th>
                  <th className="p-3.5">
                    {activeTab === 'promotions' ? 'العنوان القادم المستحق (تاريخ الترقية القادم)' : (activeTab === 'increments' ? 'المرحلة المستحقة (تاريخ الاستحقاق القادم)' : 'الاستحقاق القادم (تاريخ التسوية)')}
                  </th>
                  <th className="p-3.5 text-center">كتب الشكر وتأثيرها</th>
                  <th className="p-3.5 text-center">العقوبات وتأثيرها</th>
                  <th className="p-3.5">مؤثرات إضافية وضوابط</th>
                  <th className="p-3.5 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {currentList.map((item) => {
                  const selected = isSelected(item);
                  const isSettlement = activeTab === 'settlements' || item.actionType === 'تسوية' || item.noGradeChange;
                  const isPromotion = activeTab === 'promotions' || item.actionType === 'ترفيع';
                  const isIncrement = activeTab === 'increments' || item.actionType === 'علاوة';

                  const commCount = item.commendationsCount || item.commendations_count || 0;
                  const commMonths = item.commendationMonths || item.commendation_months || 0;
                  const penCount = item.penaltiesCount || item.penalties_count || 0;
                  const penMonths = item.penaltyDelayMonths || item.penalty_delay_months || 0;
                  
                  const currentDateVal = isPromotion 
                    ? (item.lastPromotionDate || item.last_promotion_date || item.gradeDate || item.grade_date || item.currentAppointmentDate || item.current_appointment_date || item.appointmentDate || item.appointment_date || item.firstAppointmentDate || item.first_appointment_date || '—')
                    : (item.lastIncrementDate || item.last_increment_date || item.lastPromotionDate || item.last_promotion_date || item.gradeDate || item.grade_date || item.currentAppointmentDate || item.current_appointment_date || item.appointmentDate || item.appointment_date || item.firstAppointmentDate || item.first_appointment_date || '—');

                  const nextDateVal = isPromotion
                    ? (item.nextPromotionDueDate || item.dueDate || item.due_date || '—')
                    : (item.nextIncrementDueDate || item.dueDate || item.due_date || '—');

                  const factorsList = item.otherFactors || item.other_factors || item.reasons || [];

                  return (
                    <tr
                      key={getItemKey(item)}
                      className={`transition-colors ${selected ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="p-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectItem(item)}
                          className="w-4 h-4 rounded text-[#C8960C] focus:ring-[#C8960C] cursor-pointer"
                        />
                      </td>

                      {/* Employee Info */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 hover:text-[#1B3A6B] transition-colors cursor-pointer" onClick={() => setDetailsModalItem(item)}>
                          {item.name || item.fullName}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span className="font-medium text-slate-700">{item.jobTitle || item.job_title || item.currentJobTitle || 'موظف'}</span>
                          <span>•</span>
                          <span className="text-slate-400">{item.department || 'عام'}</span>
                        </div>
                      </td>

                      {/* Current Status & Current Promotion / Increment Date */}
                      <td className="p-3.5">
                        <div className="space-y-1.5">
                          {isIncrement && (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-slate-100 text-slate-800 border-slate-200 text-[11px] font-bold">
                                  المرحلة الحالية {item.currentStep || item.current_step}
                                </Badge>
                                <span className="text-[11px] text-slate-600 font-medium">
                                  (الدرجة {item.currentGrade || item.current_grade})
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-700 bg-blue-50/80 border border-blue-200/70 rounded-md px-2 py-0.5">
                                <Calendar size={12} className="text-blue-600 shrink-0" />
                                <span className="text-blue-900 font-semibold">تاريخ منح العلاوة الحالية:</span>
                                <span className="font-mono font-bold text-blue-950">{currentDateVal}</span>
                              </div>
                              {ANNUAL_INCREMENTS[item.currentGrade || item.current_grade] && (
                                <div className="text-[10px] text-emerald-700 font-medium">
                                  مقدار العلاوة السنوية: <span className="font-bold font-mono">+{ANNUAL_INCREMENTS[item.currentGrade || item.current_grade].toLocaleString()} د.ع</span>
                                </div>
                              )}
                            </>
                          )}

                          {isPromotion && (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-blue-50 text-blue-900 border-blue-200 text-[11px] font-bold">
                                  {item.jobTitle || item.job_title || item.currentJobTitle || item.current_job_title || 'العنوان الحالي'}
                                </Badge>
                                <span className="text-[11px] font-bold text-slate-800">
                                  (الدرجة {item.currentGrade || item.current_grade} - مرحلة {item.currentStep || item.current_step})
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-700 bg-indigo-50/80 border border-indigo-200/70 rounded-md px-2 py-0.5">
                                <Calendar size={12} className="text-indigo-600 shrink-0" />
                                <span className="text-indigo-900 font-semibold">تاريخ الترقية الحالي:</span>
                                <span className="font-mono font-bold text-indigo-950">{currentDateVal}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium">
                                مدة الترفيع المقررة بالسلم: <span className="font-bold text-slate-700">{item.requiredYears || item.required_years || ((item.currentGrade || item.current_grade) <= 5 ? 5 : 4)} سنوات</span>
                              </div>
                            </>
                          )}

                          {isSettlement && (
                            <>
                              <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-md text-xs font-bold text-slate-800">
                                <span>الدرجة {item.currentGrade || item.current_grade}</span>
                                <span>/</span>
                                <span>المرحلة {item.currentStep || item.current_step}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] text-slate-600">
                                <Calendar size={12} className="text-slate-400 shrink-0" />
                                <span className="text-slate-500 font-medium">تاريخ الاحتساب السابق:</span>
                                <span className="font-mono font-semibold text-slate-800">{currentDateVal}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Next Due Status & Next Due Date */}
                      <td className="p-3.5">
                        <div className="space-y-1.5">
                          {isPromotion && (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-blue-100 text-blue-900 border-blue-200 text-[11px] font-bold">
                                  {item.targetJobTitle || item.target_job_title || `الدرجة ${item.targetGrade}`}
                                </Badge>
                                <span className="text-[11px] font-bold text-blue-950">
                                  (الدرجة {item.targetGrade || item.target_grade} - مرحلة 1)
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] bg-amber-50/80 border border-amber-200/80 rounded-md px-2 py-0.5">
                                <Clock size={12} className="text-[#C8960C] shrink-0" />
                                <span className="text-amber-950 font-semibold">تاريخ الترقية القادم:</span>
                                <span className="font-mono font-bold text-[#1B3A6B]">{nextDateVal}</span>
                              </div>
                              {calculatePeriodDiff(currentDateVal, nextDateVal) && (
                                <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 inline-block font-sans">
                                  المدة المقررة: <span className="font-bold text-slate-700">{calculatePeriodDiff(currentDateVal, nextDateVal)}</span>
                                </div>
                              )}
                            </>
                          )}

                          {isIncrement && (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[11px] font-bold">
                                  المرحلة المستحقة {item.targetStep || item.target_step}
                                </Badge>
                                <span className="text-[11px] font-medium text-emerald-950">
                                  (نفس الدرجة {item.currentGrade || item.current_grade})
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px] bg-emerald-50/80 border border-emerald-200/80 rounded-md px-2 py-0.5">
                                <Clock size={12} className="text-emerald-700 shrink-0" />
                                <span className="text-emerald-950 font-semibold">تاريخ استحقاق العلاوة:</span>
                                <span className="font-mono font-bold text-[#1B3A6B]">{nextDateVal}</span>
                              </div>
                              {calculatePeriodDiff(currentDateVal, nextDateVal) && (
                                <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded px-1.5 py-0.5 inline-block font-sans">
                                  المدة المحسوبة: <span className="font-bold text-slate-700">{calculatePeriodDiff(currentDateVal, nextDateVal)}</span>
                                </div>
                              )}
                            </>
                          )}

                          {isSettlement && (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[11px] font-bold">
                                  تسوية عجز الشهادة
                                </Badge>
                                <span className="text-[11px] font-semibold text-amber-900">
                                  تثبيت بالدرجة {item.currentGrade || item.current_grade}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[11px]">
                                <Clock size={12} className="text-[#C8960C] shrink-0" />
                                <span className="text-slate-500 font-medium">تاريخ التسوية:</span>
                                <span className="font-mono font-bold text-[#1B3A6B]">{nextDateVal}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Commendation Letters & Impact */}
                      <td className="p-3.5 text-center">
                        {commCount > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs font-bold shadow-2xs">
                              <Sparkles size={13} className="text-emerald-600" />
                              <span>{commCount} كتاب شكر</span>
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 mt-0.5">
                              (تقديم {commMonths} {commMonths === 1 ? 'شهر' : 'أشهر'})
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">لا يوجد</span>
                        )}
                      </td>

                      {/* Penalties & Delay Impact */}
                      <td className="p-3.5 text-center">
                        {penCount > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-200 px-2.5 py-1 rounded-lg text-xs font-bold shadow-2xs">
                              <AlertTriangle size={13} className="text-rose-600" />
                              <span>{penCount} عقوبة</span>
                            </span>
                            <span className="text-[10px] font-bold text-rose-700 mt-0.5">
                              (تأخير {penMonths} {penMonths === 1 ? 'شهر' : 'أشهر'})
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                            <CheckCircle2 size={12} className="text-emerald-500" />
                            <span>سجل نظيف</span>
                          </span>
                        )}
                      </td>

                      {/* Other Influencing Factors */}
                      <td className="p-3.5">
                        <div className="space-y-1 max-w-xs">
                          {factorsList.slice(0, 2).map((factor, fIdx) => (
                            <div key={fIdx} className="text-xs text-slate-700 flex items-start gap-1">
                              <span className="text-[#C8960C] font-bold">•</span>
                              <span className="line-clamp-1 text-[11px] font-medium" title={factor}>
                                {factor}
                              </span>
                            </div>
                          ))}
                          {factorsList.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setDetailsModalItem(item)}
                              className="text-[10px] text-blue-700 hover:underline font-bold"
                            >
                              + {factorsList.length - 2} مؤثرات إضافية...
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => handleOpenSingleModal(item)}
                            className="text-xs bg-[#1B3A6B] hover:bg-[#152e55] text-white px-3 py-1 rounded-lg font-semibold shadow-xs"
                          >
                            اعتماد فوري
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailsModalItem(item)}
                            className="text-xs text-slate-500 hover:text-slate-800 p-1.5 h-8 w-8 rounded-lg"
                            title="عرض تفاصيل المحرك والمؤثرات"
                          >
                            <Info size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Confirmation & Order Data Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#1B3A6B] flex items-center gap-2">
              <Award className="text-[#C8960C]" size={22} />
              <span>اعتماد استحقاقات الترقية والعلاوة</span>
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              سيتم إنشاء سجلات رسمية معتمدة وتحديث البيانات الوظيفية وتثبيت تواريخ الاستحقاق المحسوبة بدقة.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitApproval} className="space-y-4 my-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رقم الأمر الإداري <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="مثال: 142/ق/2026"
                  className="bg-slate-50 border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  تاريخ صدور الأمر الإداري <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="bg-slate-50 border-slate-200"
                />
              </div>
            </div>

            {/* Target Items Summary */}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 max-h-48 overflow-y-auto space-y-2">
              <p className="text-xs font-bold text-slate-700 mb-1">
                المعاملات المشمولة بالاعتماد ({approvalTargetItems.length}):
              </p>
              {approvalTargetItems.map((it, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100 text-xs">
                  <span className="font-semibold text-slate-800">{it.name || it.fullName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-mono">{it.dueDate || it.due_date}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {it.actionType || it.action_type || 'استحقاق'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Clock size={14} className="text-blue-700" />
                <span>مبدأ ثبات تاريخ الاستحقاق:</span>
              </p>
              <p className="text-blue-800 text-[11px]">
                سيتم تحديث تواريخ آخر ترفيع/علاوة وفق تاريخ الاستحقاق الفعلي المحسوب لكل موظف، بينما يُحفظ تاريخ الأمر الإداري للتوثيق والترتيب القانوني.
              </p>
            </div>

            <DialogFooter className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                disabled={modalSubmitting}
              >
                إلغاء
              </Button>

              <Button
                type="submit"
                disabled={modalSubmitting}
                className="bg-[#C8960C] hover:bg-[#b0830a] text-white font-bold px-6"
              >
                {modalSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  `تأكيد واعتماد (${approvalTargetItems.length})`
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detailed Influencers & Eligibility Inspector Modal */}
      <Dialog open={Boolean(detailsModalItem)} onOpenChange={(open) => !open && setDetailsModalItem(null)}>
        <DialogContent className="sm:max-w-2xl text-right max-h-[90vh] overflow-y-auto" dir="rtl">
          {detailsModalItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2 border-b pb-3">
                  <UserCheck className="text-[#C8960C]" size={22} />
                  <span>تفاصيل ومؤثرات استحقاق الموظف: {detailsModalItem.name || detailsModalItem.fullName}</span>
                </DialogTitle>
                <DialogDescription className="text-slate-500 text-xs pt-1">
                  عرض تحليلي شامل لكافة التواريخ وكتب الشكر والعقوبات والدورات والمؤثرات القانونية المحسوبة.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-2 text-xs">
                {/* General Info Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px]">القسم / الدائرة</span>
                    <span className="font-bold text-slate-800">{detailsModalItem.department || 'عام'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">العنوان الوظيفي الحالي</span>
                    <span className="font-bold text-slate-800">{detailsModalItem.jobTitle || detailsModalItem.currentJobTitle || 'موظف'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">الدرجة / المرحلة الحالية</span>
                    <span className="font-bold text-slate-800">الدرجة {detailsModalItem.currentGrade} / المرحلة {detailsModalItem.currentStep}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">الإجراء المستحق</span>
                    <Badge className="text-[10px] bg-[#1B3A6B] text-white">
                      {detailsModalItem.actionType || detailsModalItem.action_type || 'استحقاق'}
                    </Badge>
                  </div>
                </div>

                {/* Dates Timeline Card */}
                <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-xl space-y-3">
                  <div className="font-bold text-blue-950 flex items-center gap-2">
                    <Calendar size={16} className="text-blue-700" />
                    <span>المحطة الزمنية والتواريخ المحسوبة:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-3 rounded-lg border border-blue-100">
                      <span className="text-slate-500 block text-[11px] mb-1">
                        {detailsModalItem.actionType === 'ترفيع' ? 'تاريخ الترقية للعنوان الحالي:' : 'تاريخ منح العلاوة الحالية:'}
                      </span>
                      <span className="font-mono font-bold text-sm text-slate-800">
                        {detailsModalItem.lastPromotionDate || detailsModalItem.lastIncrementDate || '—'}
                      </span>
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-blue-100">
                      <span className="text-blue-800 block text-[11px] font-bold mb-1">
                        {detailsModalItem.actionType === 'ترفيع' ? 'تاريخ الترقية للعنوان القادم:' : 'تاريخ استحقاق العلاوة القادمة:'}
                      </span>
                      <span className="font-mono font-bold text-sm text-[#1B3A6B]">
                        {detailsModalItem.nextPromotionDueDate || detailsModalItem.nextIncrementDueDate || detailsModalItem.dueDate || '—'}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const fromD = detailsModalItem.actionType === 'ترفيع' ? (detailsModalItem.lastPromotionDate || detailsModalItem.grade_date) : (detailsModalItem.lastIncrementDate || detailsModalItem.lastPromotionDate);
                    const toD = detailsModalItem.nextPromotionDueDate || detailsModalItem.nextIncrementDueDate || detailsModalItem.dueDate;
                    const diff = calculatePeriodDiff(fromD, toD);
                    if (!diff) return null;
                    return (
                      <div className="text-xs text-blue-900 bg-white/80 border border-blue-100 rounded-lg p-2 flex items-center justify-between font-medium">
                        <span>المدة المحسوبة بين الاستحقاقين (شاملة المؤثرات):</span>
                        <span className="font-bold text-[#1B3A6B] font-mono">{diff}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Commendations & Penalties Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Commendations Impact Card */}
                  <div className="bg-emerald-50/60 border border-emerald-200 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                        <Sparkles size={15} className="text-emerald-700" />
                        <span>كتب الشكر والتقدير</span>
                      </span>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">
                        {detailsModalItem.commendationsCount || 0} كتاب
                      </Badge>
                    </div>
                    <p className="text-emerald-950 text-xs">
                      <strong>الأثر على الاستحقاق: </strong>
                      {detailsModalItem.commendationsCount > 0 
                        ? `تقديم موعد الاستحقاق بمقدار (${detailsModalItem.commendationMonths || 0}) شهر`
                        : 'لا يوجد تقديم (سجل بدون كتب شكر مستفاد منها)'}
                    </p>
                  </div>

                  {/* Penalties Impact Card */}
                  <div className="bg-rose-50/60 border border-rose-200 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-900 flex items-center gap-1.5">
                        <AlertTriangle size={15} className="text-rose-700" />
                        <span>العقوبات الإدارية</span>
                      </span>
                      <Badge className={detailsModalItem.penaltiesCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}>
                        {detailsModalItem.penaltiesCount || 0} عقوبة
                      </Badge>
                    </div>
                    <p className="text-rose-950 text-xs">
                      <strong>الأثر على الاستحقاق: </strong>
                      {detailsModalItem.penaltiesCount > 0 
                        ? `تأخير موعد الاستحقاق بمقدار (${detailsModalItem.penaltyDelayMonths || 0}) شهر`
                        : 'سجل نظيف لا يتضمن أي عقوبات مؤخرة'}
                    </p>
                  </div>
                </div>

                {/* Other Influencing Factors Card */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="font-bold text-slate-800 flex items-center gap-2">
                    <Info size={16} className="text-[#C8960C]" />
                    <span>المؤثرات الإضافية والضوابط القانونية:</span>
                  </div>
                  <ul className="space-y-1.5 pr-2">
                    {(detailsModalItem.otherFactors || detailsModalItem.reasons || []).map((factor, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-slate-700">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <DialogFooter className="flex gap-2 justify-end pt-2 border-t mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDetailsModalItem(null)}
                >
                  إغلاق
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const item = detailsModalItem;
                    setDetailsModalItem(null);
                    handleOpenSingleModal(item);
                  }}
                  className="bg-[#1B3A6B] hover:bg-[#152e55] text-white"
                >
                  اعتماد المعاملة الآن
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
