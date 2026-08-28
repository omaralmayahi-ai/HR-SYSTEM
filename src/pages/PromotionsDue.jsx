import React, { useState, useEffect, useMemo } from 'react';
import {
  Award, TrendingUp, CheckCircle2, AlertCircle, Clock,
  Search, RefreshCw, CheckSquare, Square,
  ShieldCheck, Layers
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
      const job = item.jobTitle || item.job_title || '';
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
      // Deselect current list
      setSelectedItems(prev => {
        const next = { ...prev };
        currentList.forEach(item => {
          delete next[getItemKey(item)];
        });
        return next;
      });
    } else {
      // Select all in current list
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

      // Clear selection & close modal
      setIsModalOpen(false);
      setOrderNumber('');
      setSelectedItems({});
      
      // Refresh list
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
                إدارة واعتماد استحقاقات الترفيع الوظيفي والعلاوات السنوية وتسوية مسار احتساب الشهادات وفق السلم الموحد 2023
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
              className="bg-[#C8960C] hover:bg-[#b0830a] text-white flex items-center gap-2 shadow-md transition-all animate-pulse"
            >
              <CheckCircle2 size={18} />
              <span>اعتماد المحدد ({selectedCount})</span>
            </Button>
          )}
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
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
              <p className="font-medium text-sm">جاري مراجعة وتحليل استحقاقات الموظفين...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div className="p-16 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-700 mb-1">لا توجد استحقاقات معلقة بهذا التبويب</p>
              <p className="text-xs text-slate-400">جميع الموظفين محدثين أو لم يحن موعد استحقاقهم بعد</p>
            </div>
          ) : (
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100 text-xs">
                <tr>
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={isAllCurrentSelected}
                      onChange={toggleSelectAllCurrent}
                      className="w-4 h-4 rounded text-[#C8960C] focus:ring-[#C8960C] cursor-pointer"
                    />
                  </th>
                  <th className="p-4">الموظف والتشكيل</th>
                  <th className="p-4">الوضع الحالي</th>
                  <th className="p-4">الإجراء والوضع المستحق</th>
                  <th className="p-4">تاريخ الاستحقاق المحسوب</th>
                  <th className="p-4">السند والمسار</th>
                  <th className="p-4 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {currentList.map((item) => {
                  const selected = isSelected(item);
                  const isSettlement = activeTab === 'settlements' || item.actionType === 'تسوية' || item.noGradeChange;
                  const isPromotion = activeTab === 'promotions' || item.actionType === 'ترفيع';
                  const isIncrement = activeTab === 'increments' || item.actionType === 'علاوة';

                  return (
                    <tr
                      key={getItemKey(item)}
                      className={`transition-colors ${selected ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'}`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectItem(item)}
                          className="w-4 h-4 rounded text-[#C8960C] focus:ring-[#C8960C] cursor-pointer"
                        />
                      </td>

                      <td className="p-4">
                        <div className="font-bold text-slate-900">{item.name || item.fullName}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{item.jobTitle || item.job_title}</span>
                          <span>•</span>
                          <span className="text-slate-400">{item.department}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700">
                          <span>الدرجة {item.currentGrade || item.current_grade}</span>
                          <span>/</span>
                          <span>المرحلة {item.currentStep || item.current_step}</span>
                        </div>
                      </td>

                      <td className="p-4">
                        {isPromotion && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              ترفيع درجة
                            </Badge>
                            <span className="text-xs font-bold text-blue-900">
                              ← الدرجة {item.targetGrade || item.target_grade} (المرحلة 1)
                            </span>
                          </div>
                        )}

                        {isIncrement && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                              علاوة سنوية
                            </Badge>
                            <span className="text-xs font-bold text-emerald-900">
                              ← المرحلة {item.targetStep || item.target_step} (نفس الدرجة {item.currentGrade})
                            </span>
                          </div>
                        )}

                        {isSettlement && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-amber-100 text-amber-900 border-amber-200">
                              تسوية عجز الشهادة
                            </Badge>
                            <span className="text-xs font-semibold text-amber-900">
                              تثبيت بالدرجة {item.currentGrade} دون تغيير
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="p-4 font-mono text-xs font-bold text-slate-800">
                        {item.dueDate || item.due_date}
                      </td>

                      <td className="p-4">
                        <div className="text-xs text-slate-600 max-w-xs truncate" title={(item.reasons || []).join(' | ')}>
                          {(item.reasons || [])[0] || 'مستوفٍ للشروط'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.trackType || item.track_type}
                        </div>
                      </td>

                      <td className="p-4 text-center">
                        <Button
                          size="sm"
                          onClick={() => handleOpenSingleModal(item)}
                          className="text-xs bg-[#1B3A6B] hover:bg-[#152e55] text-white px-3 py-1 rounded-lg"
                        >
                          اعتماد فوري
                        </Button>
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
              سيتم إنشاء سجلات رسمية معتمدة وتحديث البيانات الوظيفية وتثبيت تواريخ الاستحقاق المحسوبة.
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
    </div>
  );
}
