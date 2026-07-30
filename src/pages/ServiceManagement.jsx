import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import {
  Hourglass,
  Plus,
  Search,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit,
  Sparkles,
  Users,
  Award
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ServiceManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('records'); // 'records' | 'monitoring'

  // Data states
  const [employees, setEmployees] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [systemSettings, setSystemSettings] = useState({
    retirementAge: 60,
    retirementNotificationDays: 180,
  });

  // Filters for Tab 1 (Records)
  const [recordSearch, setRecordSearch] = useState('');
  const [recordTypeFilter, setRecordTypeFilter] = useState('all');

  // Filters for Tab 2 (Monitoring)
  const [monitoringSearch, setMonitoringSearch] = useState('');
  const [monitoringFilter, setMonitoringFilter] = useState('all'); // 'all', 'reached_no_extension', 'reached_not_retired', 'approaching', 'retired'
  const [approachingDaysLimit, setApproachingDaysLimit] = useState('180'); // '30', '60', '90', '180', '365', 'all'

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [lockRecordType, setLockRecordType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [empSearchTerm, setEmpSearchTerm] = useState('');

  // Delete Confirm Modal State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    employee_id: '',
    record_type: 'خدمة محتسبة', // 'خدمة محتسبة' | 'تمديد خدمة'
    order_number: '',
    order_date: '',
    years: 0,
    months: 0,
    days: 0,
    purpose: 'promotion_allowance_pension', // 'pension_only' | 'promotion_allowance_pension'
    reason: '',
    notes: '',
  });

  // Modal filtered employees for selection (by Name, Company Number, Civil Service Number)
  const modalFilteredEmployees = useMemo(() => {
    if (!empSearchTerm.trim()) return employees;
    const q = empSearchTerm.trim().toLowerCase();
    return employees.filter(emp => {
      const name = (emp.full_name || emp.fullName || '').toLowerCase();
      const companyNum = (emp.company_number || emp.companyNumber || '').toLowerCase();
      const civilNum = (emp.civil_service_number || emp.civilServiceNumber || '').toLowerCase();
      const empNum = (emp.employee_number || emp.employeeNumber || '').toLowerCase();
      const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
      const dept = (emp.department || '').toLowerCase();

      return name.includes(q) || companyNum.includes(q) || civilNum.includes(q) || empNum.includes(q) || title.includes(q) || dept.includes(q);
    });
  }, [employees, empSearchTerm]);

  // Status Modal State (Quick retirement action)
  const [retirementModalEmployee, setRetirementModalEmployee] = useState(null);
  const [retirementOrderNumber, setRetirementOrderNumber] = useState('');
  const [retirementOrderDate, setRetirementOrderDate] = useState('');
  const [retirementNotes, setRetirementNotes] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [empList, recList, setRes] = await Promise.all([
        apiClient.entities.Employee.list(),
        apiClient.entities.ServiceRecord.list(),
        apiClient.settings.get().catch(() => null)
      ]);
      setEmployees(empList || []);
      setServiceRecords(recList || []);
      if (setRes) {
        setSystemSettings({
          retirementAge: setRes.retirementAge || setRes.retirement_age || 60,
          retirementNotificationDays: setRes.retirementNotificationDays || setRes.retirement_notification_days || 180,
        });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: 'خطأ في التحميل',
        description: 'تعذر تحميل بيانات الخدمة والموظفين',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper calculation for Age
  const calculateAge = (birthDateStr) => {
    if (!birthDateStr) return null;
    const birthDate = new Date(birthDateStr);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Helper for retirement calculations (Extension delays retirement age, Added service adds to total service duration)
  const getRetirementAnalysis = (emp, customDaysLimit = approachingDaysLimit) => {
    const age = calculateAge(emp.birth_date || emp.birthDate);
    if (age === null) return { status: 'unknown', age: null, monthsToRetirement: null };

    const birthDate = new Date(emp.birth_date || emp.birthDate);
    const baseRetirementAge = systemSettings.retirementAge || 60;

    const extYears = parseInt(emp.retirement_extension_years ?? emp.retirementExtensionYears ?? 0) || 0;
    const extMonths = parseInt(emp.retirement_extension_months ?? emp.retirementExtensionMonths ?? 0) || 0;

    const hasExtension = Boolean(
      extYears > 0 || extMonths > 0 || (emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber)
    );

    // Effective retirement age extends with extension duration
    const effectiveRetirementAge = baseRetirementAge + extYears + (extMonths / 12);

    // Effective retirement date = Birth date + Base Age + Extension Duration
    let rYear = birthDate.getFullYear() + baseRetirementAge + extYears;
    let rMonth = birthDate.getMonth() + extMonths;
    let rDay = birthDate.getDate();

    const retirementDate = new Date(rYear, rMonth, rDay);

    const today = new Date();
    const timeDiff = retirementDate.getTime() - today.getTime();
    const daysToRetirement = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const monthsToRetirement = Math.round(daysToRetirement / 30);

    const limitDays = customDaysLimit === 'all' ? 3650 : (parseInt(customDaysLimit) || 180);

    const isRetired = emp.status === 'متقاعد';
    // Employee reaches retirement ONLY if current age >= effectiveRetirementAge (or today >= retirementDate)
    const reachedAge = age >= effectiveRetirementAge;
    const isApproaching = daysToRetirement > 0 && daysToRetirement <= limitDays;

    return {
      age,
      baseRetirementAge,
      effectiveRetirementAge,
      reachedAge,
      isApproaching,
      daysToRetirement,
      monthsToRetirement,
      hasExtension,
      extYears,
      extMonths,
      isRetired,
      retirementDateStr: retirementDate.toISOString().split('T')[0]
    };
  };

  // Employees retirement breakdown
  const retirementMonitoredEmployees = useMemo(() => {
    return employees.map(emp => {
      const analysis = getRetirementAnalysis(emp);
      return {
        ...emp,
        retirementAnalysis: analysis
      };
    }).filter(emp => {
      const { reachedAge, isApproaching, isRetired, hasExtension } = emp.retirementAnalysis;
      return reachedAge || isApproaching || isRetired || hasExtension;
    });
  }, [employees, systemSettings, approachingDaysLimit]);

  // Statistics
  const stats = useMemo(() => {
    let extensionCount = 0;
    let reachedNoExtension = 0;
    let reachedNotRetired = 0;
    let approachingCount = 0;

    employees.forEach(emp => {
      const { reachedAge, isApproaching, hasExtension, isRetired } = getRetirementAnalysis(emp);
      if (hasExtension) extensionCount++;
      if (reachedAge) {
        if (!hasExtension) reachedNoExtension++;
        if (!isRetired) reachedNotRetired++;
      }
      if (isApproaching && !reachedAge && !isRetired) {
        approachingCount++;
      }
    });

    return {
      totalRecords: serviceRecords.length,
      extensionCount,
      reachedNoExtension,
      reachedNotRetired,
      approachingCount
    };
  }, [employees, serviceRecords, systemSettings, approachingDaysLimit]);

  // Filtered Service Records (Tab 1)
  const filteredRecords = useMemo(() => {
    return serviceRecords.filter(rec => {
      const emp = employees.find(e => String(e.id) === String(rec.employeeId || rec.employee_id));
      const empName = emp ? (emp.full_name || emp.fullName || '').toLowerCase() : '';
      const companyNum = emp ? (emp.company_number || emp.companyNumber || '').toLowerCase() : '';
      const civilNum = emp ? (emp.civil_service_number || emp.civilServiceNumber || '').toLowerCase() : '';
      const empNum = emp ? (emp.employee_number || emp.employeeNumber || '').toLowerCase() : '';
      const orderNum = (rec.orderNumber || rec.order_number || '').toLowerCase();
      const reasonText = (rec.reason || '').toLowerCase();
      const q = recordSearch.toLowerCase().trim();

      const matchText = !q || empName.includes(q) ||
                        companyNum.includes(q) ||
                        civilNum.includes(q) ||
                        empNum.includes(q) ||
                        orderNum.includes(q) ||
                        reasonText.includes(q);
      
      const recType = (rec.recordType || rec.record_type || '').trim();
      let matchType = true;
      if (recordTypeFilter === 'all') {
        matchType = true;
      } else if (recordTypeFilter === 'خدمة محتسبة') {
        matchType = recType !== 'تمديد خدمة';
      } else if (recordTypeFilter === 'تمديد خدمة') {
        matchType = recType === 'تمديد خدمة';
      } else {
        matchType = recType === recordTypeFilter || recType.includes(recordTypeFilter);
      }

      return matchText && matchType;
    });
  }, [serviceRecords, employees, recordSearch, recordTypeFilter]);

  // Filtered Monitored Employees (Tab 2)
  const filteredMonitoredEmployees = useMemo(() => {
    const query = monitoringSearch.trim().toLowerCase();

    // If query is present, search ALL employees so user can find ANY employee to extend service!
    let pool = employees.map(emp => ({
      ...emp,
      retirementAnalysis: getRetirementAnalysis(emp, approachingDaysLimit)
    }));

    if (!query) {
      pool = pool.filter(emp => {
        const { reachedAge, isApproaching, isRetired, hasExtension } = emp.retirementAnalysis;
        return reachedAge || isApproaching || isRetired || hasExtension;
      });
    }

    return pool.filter(emp => {
      const empName = (emp.full_name || emp.fullName || '').toLowerCase();
      const companyNum = (emp.company_number || emp.companyNumber || '').toLowerCase();
      const civilNum = (emp.civil_service_number || emp.civilServiceNumber || '').toLowerCase();
      const empNum = (emp.employee_number || emp.employeeNumber || '').toLowerCase();
      const dept = (emp.department || '').toLowerCase();

      const matchText = !query || empName.includes(query) ||
                        companyNum.includes(query) ||
                        civilNum.includes(query) ||
                        empNum.includes(query) ||
                        dept.includes(query);

      const { reachedAge, isApproaching, hasExtension, isRetired } = emp.retirementAnalysis;

      if (monitoringFilter === 'reached_no_extension') {
        return matchText && reachedAge && !hasExtension;
      }
      if (monitoringFilter === 'reached_not_retired') {
        return matchText && reachedAge && !isRetired;
      }
      if (monitoringFilter === 'approaching') {
        return matchText && isApproaching && !reachedAge && !isRetired;
      }
      if (monitoringFilter === 'retired') {
        return matchText && isRetired;
      }
      return matchText;
    });
  }, [employees, monitoringSearch, monitoringFilter, approachingDaysLimit, systemSettings]);

  // Helper to sync employee extension data across all extension records
  const syncEmployeeExtensionData = async (employeeId) => {
    if (!employeeId) return;
    try {
      const allRecords = await apiClient.entities.ServiceRecord.filter({ employee_id: employeeId });
      const extRecords = (allRecords || []).filter(r => (r.recordType || r.record_type) === 'تمديد خدمة');

      let totalYears = 0;
      let totalMonths = 0;
      let lastOrderNum = '';
      let lastOrderDate = '';
      let lastReason = '';

      extRecords.forEach(r => {
        totalYears += parseInt(r.years || 0) || 0;
        totalMonths += parseInt(r.months || 0) || 0;
        if (r.orderNumber || r.order_number) lastOrderNum = r.orderNumber || r.order_number;
        if (r.orderDate || r.order_date) lastOrderDate = r.orderDate || r.order_date;
        if (r.reason || r.notes) lastReason = r.reason || r.notes;
      });

      if (totalMonths >= 12) {
        totalYears += Math.floor(totalMonths / 12);
        totalMonths = totalMonths % 12;
      }

      await apiClient.entities.Employee.update(parseInt(employeeId), {
        retirement_extension_order_number: lastOrderNum,
        retirement_extension_order_date: lastOrderDate,
        retirement_extension_years: totalYears,
        retirement_extension_months: totalMonths,
        retirement_extension_note: lastReason,
        status: totalYears > 0 || totalMonths > 0 ? 'متقاعد مع تمديد' : 'مستمر'
      }).catch((err) => console.error('Error updating employee extension sync:', err));
    } catch (err) {
      console.error('Error syncing employee extension:', err);
    }
  };

  // Open modal to create record
  const handleOpenAddModal = (targetEmployee = null, defaultRecordType = 'خدمة محتسبة', lockType = false) => {
    setEditingRecord(null);
    setLockRecordType(lockType);
    const empIdStr = targetEmployee ? String(targetEmployee.id) : '';
    const empName = targetEmployee ? (targetEmployee.full_name || targetEmployee.fullName || '') : '';
    setEmpSearchTerm(empName);
    setFormData({
      employee_id: empIdStr,
      record_type: defaultRecordType,
      order_number: '',
      order_date: new Date().toISOString().split('T')[0],
      years: defaultRecordType === 'تمديد خدمة' ? 1 : 0,
      months: 0,
      days: 0,
      purpose: 'promotion_allowance_pension',
      reason: defaultRecordType === 'تمديد خدمة' ? 'تمديد الخدمة التقاعدية' : '',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  // Open modal to edit record
  const handleOpenEditModal = (rec) => {
    setEditingRecord(rec);
    setLockRecordType(false);
    const empIdStr = String(rec.employeeId || rec.employee_id || '');
    const foundEmp = employees.find(e => String(e.id) === empIdStr);
    setEmpSearchTerm(foundEmp ? (foundEmp.full_name || foundEmp.fullName || '') : '');
    setFormData({
      employee_id: empIdStr,
      record_type: rec.recordType || rec.record_type || 'خدمة محتسبة',
      order_number: rec.orderNumber || rec.order_number || '',
      order_date: rec.orderDate || rec.order_date || '',
      years: rec.years || 0,
      months: rec.months || 0,
      days: rec.days || 0,
      purpose: rec.purpose || 'promotion_allowance_pension',
      reason: rec.reason || '',
      notes: rec.notes || '',
    });
    setIsAddModalOpen(true);
  };

  // Save Record
  const handleSaveRecord = async (e) => {
    e.preventDefault();
    if (!formData.employee_id) {
      toast({ title: 'تنبيه', description: 'يرجى اختيار الموظف أولاً', variant: 'destructive' });
      return;
    }
    if (!formData.order_number || !formData.order_date) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال رقم وتاريخ الأمر', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (editingRecord) {
        await apiClient.entities.ServiceRecord.update(editingRecord.id, formData);
      } else {
        await apiClient.entities.ServiceRecord.create(formData);
      }

      // Sync extension data if applicable
      await syncEmployeeExtensionData(formData.employee_id);

      toast({
        title: 'نجاح',
        description: editingRecord ? 'تم تحديث سجل الخدمة والتمديد بنجاح' : 'تم إضافة أمر الخدمة / التمديد بنجاح',
        variant: 'success'
      });

      setIsAddModalOpen(false);
      fetchInitialData();
    } catch (err) {
      console.error(err);
      toast({ title: 'خطأ', description: 'تعذر حفظ السجل: ' + (err.message || ''), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Delete Record Trigger
  const handleDeleteRecord = (id) => {
    if (!id) return;
    const targetRec = serviceRecords.find(r => String(r.id) === String(id));
    if (targetRec) {
      setItemToDelete({ type: 'record', record: targetRec });
      setDeleteConfirmOpen(true);
    }
  };

  // Delete Extension Trigger
  const handleDeleteEmployeeExtension = (emp) => {
    if (!emp) return;
    setItemToDelete({ type: 'extension', emp });
    setDeleteConfirmOpen(true);
  };

  // Perform Delete Action
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      if (itemToDelete.type === 'record') {
        const rec = itemToDelete.record;
        const empId = rec.employeeId || rec.employee_id;
        await apiClient.entities.ServiceRecord.delete(rec.id);
        if (empId) {
          await syncEmployeeExtensionData(empId);
        }
        toast({ title: 'تم الحذف بنجاح', description: 'تم حذف سجل الخدمة وتحديث البيانات المربوطة بنجاح' });
      } else if (itemToDelete.type === 'extension') {
        const emp = itemToDelete.emp;
        const extRecords = serviceRecords.filter(r => 
          String(r.employeeId || r.employee_id) === String(emp.id) && 
          (r.recordType || r.record_type) === 'تمديد خدمة'
        );

        for (const rec of extRecords) {
          await apiClient.entities.ServiceRecord.delete(rec.id);
        }

        await apiClient.entities.Employee.update(parseInt(emp.id), {
          retirement_extension_order_number: '',
          retirement_extension_order_date: '',
          retirement_extension_years: 0,
          retirement_extension_months: 0,
          retirement_extension_note: '',
          status: emp.status === 'متقاعد مع تمديد' ? 'متقاعد' : 'مستمر'
        });

        toast({ title: 'تم الحذف بنجاح', description: 'تم حذف أمر التمديد وتحديث موقف الموظف بنجاح' });
      }

      setDeleteConfirmOpen(false);
      setItemToDelete(null);
      await fetchInitialData();
    } catch (err) {
      console.error('Error during deletion:', err);
      toast({ title: 'خطأ أثناء الحذف', description: 'تعذر إجراء عملية الحذف: ' + (err.message || ''), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  // Submit Retirement status change
  const handleSaveRetirementStatus = async (e) => {
    e.preventDefault();
    if (!retirementModalEmployee) return;
    if (!retirementOrderNumber || !retirementOrderDate) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال رقم وتاريخ امر الإحالة على التقاعد', variant: 'destructive' });
      return;
    }

    setStatusSaving(true);
    try {
      await apiClient.entities.Employee.update(retirementModalEmployee.id, {
        status: 'متقاعد',
        status_order_number: retirementOrderNumber,
        status_order_date: retirementOrderDate,
        status_notes: retirementNotes,
      });

      // Log action
      await apiClient.logs.create({
        action: 'إحالة موظف إلى التقاعد',
        details: `تغيير حالة الموظف ${retirementModalEmployee.full_name || retirementModalEmployee.fullName} إلى متقاعد بموجب الأمر ${retirementOrderNumber} بتاريخ ${retirementOrderDate}`
      }).catch(() => {});

      toast({ title: 'تمت الإحالة', description: 'تم تحويل حالة الموظف إلى متقاعد بنجاح', variant: 'success' });
      setRetirementModalEmployee(null);
      fetchInitialData();
    } catch (err) {
      console.error(err);
      toast({ title: 'خطأ', description: 'تعذر تحديث حالة الموظف', variant: 'destructive' });
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B3A6B] to-[#2a4f8f] flex items-center justify-center text-white shadow-md">
            <Hourglass size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#1B3A6B]">التمديدات والخدمات المضافة</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              إضافة وإدارة الخدمة المحتسبة، أوامر تمديد الخدمة، ومتابعة الموظفين البالغين أو المقتربين من السن التقاعدي.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => handleOpenAddModal(null, 'خدمة محتسبة')}
            className="bg-[#1B3A6B] hover:bg-[#2a4f8f] text-white rounded-xl gap-2 text-xs font-bold px-4 py-2.5 shadow-sm"
          >
            <Plus size={16} />
            إضافة أمر خدمة / تمديد
          </Button>
        </div>
      </div>

      {/* Stats Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">إجمالي سجلات الأوامر والمدد</p>
            <p className="text-xl font-black text-slate-800 mt-0.5">{stats.totalRecords}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Award size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">المستفيدون من تمديد الخدمة</p>
            <p className="text-xl font-black text-emerald-700 mt-0.5">{stats.extensionCount}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-xs text-amber-900 font-semibold">بلغوا السن دون تمديد/تحديث</p>
            <p className="text-xl font-black text-amber-800 mt-0.5">{stats.reachedNoExtension}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
            <Users size={20} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold">المقتربون من التقاعد ({systemSettings.retirementNotificationDays} يوم)</p>
            <p className="text-xl font-black text-indigo-700 mt-0.5">{stats.approachingCount}</p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('records')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            activeTab === 'records'
              ? 'bg-[#1B3A6B] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText size={16} />
          سجلات الخدمة المحتسبة وأوامر التمديد ({serviceRecords.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('monitoring')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
            activeTab === 'monitoring'
              ? 'bg-[#1B3A6B] text-white shadow-md'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle size={16} />
          متابعة الموظفين البالغين والمقتربين من التقاعد ({retirementMonitoredEmployees.length})
        </button>
      </div>

      {/* TAB 1: Service Records List */}
      {activeTab === 'records' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
              <Input
                placeholder="بحث باسم الموظف، الرمز الوظيفي، أو رقم الأمر..."
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="pr-9 rounded-xl text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">نوع الأمر:</span>
              <Select value={recordTypeFilter} onValueChange={setRecordTypeFilter}>
                <SelectTrigger className="w-48 rounded-xl text-xs bg-slate-50 border-slate-200 font-bold">
                  <SelectValue placeholder="جميع السجلات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع السجلات</SelectItem>
                  <SelectItem value="خدمة محتسبة">أوامر الاحتساب</SelectItem>
                  <SelectItem value="تمديد خدمة">أوامر التمديد</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الموظف</th>
                  <th className="px-4 py-3">نوع الإجراء / الأمر</th>
                  <th className="px-4 py-3">رقم وتاريخ الأمر</th>
                  <th className="px-4 py-3">المدة المضافة / التمديد</th>
                  <th className="px-4 py-3">الغرض / السبب والمبررات</th>
                  <th className="px-4 py-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400">
                      لا توجد سجلات خدمة أو تمديد مطابقة لخيارات البحث
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
                    const emp = employees.find(e => String(e.id) === String(rec.employeeId || rec.employee_id));
                    const isExtension = (rec.recordType || rec.record_type) === 'تمديد خدمة';
                    const isPensionOnly = rec.purpose === 'pension_only';

                    const displayName = emp ? (
                      (emp.full_name && emp.full_name !== 'غير محدد') ? emp.full_name :
                      (emp.fullName && emp.fullName !== 'غير محدد') ? emp.fullName :
                      [emp.first_name || emp.firstName, emp.father_name || emp.fatherName, emp.grandfather_name || emp.grandfatherName, emp.great_grandfather_name || emp.greatGrandfatherName].filter(Boolean).join(' ') || 'غير محدد'
                    ) : '';

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          {emp ? (
                            <div>
                              <p className="font-bold text-slate-800">{displayName}</p>
                              <p className="text-[10px] text-slate-400">
                                {emp.civil_service_number || emp.civilServiceNumber || '—'} | {emp.job_title || emp.jobTitle || '—'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">معرف الموظف: #{rec.employeeId || rec.employee_id}</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isExtension ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              <Sparkles size={12} />
                              تمديد خدمة
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                              <Award size={12} />
                              خدمة محتسبة
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">
                            أمر رقم: <span className="font-mono text-slate-900">{rec.orderNumber || rec.order_number}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            تاريخ: {rec.orderDate || rec.order_date}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-bold text-slate-800">
                          {rec.years || 0} سنة و {rec.months || 0} شهر
                          {!isExtension && (rec.days > 0) && ` و ${rec.days} يوم`}
                        </td>

                        <td className="px-4 py-3">
                          {!isExtension ? (
                            <div>
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold mb-1 ${
                                isPensionOnly ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}>
                                {isPensionOnly ? 'لاغراض التقاعد فقط' : 'لاغراض الترقية و العلاوة و التقاعد'}
                              </span>
                              <p className="text-[11px] text-slate-500 truncate max-w-xs">{rec.reason || '—'}</p>
                            </div>
                          ) : (
                            <div>
                              <p className="text-[11px] text-slate-700 font-semibold">{rec.reason || 'تمديد خدمة قانوني'}</p>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(rec);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="تعديل السجل"
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRecord(rec.id);
                              }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف السجل"
                            >
                              <Trash2 size={15} />
                            </button>
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
      )}

      {/* TAB 2: Retirement Monitoring */}
      {activeTab === 'monitoring' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Sub Filters & Duration Filter */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="relative w-full lg:w-80">
              <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
              <Input
                placeholder="بحث باسم الموظف، المسمى، أو الرمز الوظيفي..."
                value={monitoringSearch}
                onChange={(e) => setMonitoringSearch(e.target.value)}
                className="pr-9 rounded-xl text-xs bg-slate-50 border-slate-200"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">مدة التنبيه:</span>
                <Select value={approachingDaysLimit} onValueChange={setApproachingDaysLimit}>
                  <SelectTrigger className="w-40 rounded-xl text-xs bg-slate-50 border-slate-200 font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">خلال 30 يوماً</SelectItem>
                    <SelectItem value="60">خلال 60 يوماً</SelectItem>
                    <SelectItem value="90">خلال 90 يوماً</SelectItem>
                    <SelectItem value="180">خلال 180 يوماً (6 أشهر)</SelectItem>
                    <SelectItem value="365">خلال سنة واحدة (365 يوم)</SelectItem>
                    <SelectItem value="all">جميع المقتربين (بلا حد)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMonitoringFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    monitoringFilter === 'all'
                      ? 'bg-[#1B3A6B] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الكل ({filteredMonitoredEmployees.length})
                </button>

                <button
                  type="button"
                  onClick={() => setMonitoringFilter('reached_no_extension')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    monitoringFilter === 'reached_no_extension'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  بلغوا السن دون تمديد ({stats.reachedNoExtension})
                </button>

                <button
                  type="button"
                  onClick={() => setMonitoringFilter('approaching')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    monitoringFilter === 'approaching'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                  }`}
                >
                  المقتربون من التقاعد ({stats.approachingCount})
                </button>

                <button
                  type="button"
                  onClick={() => setMonitoringFilter('retired')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    monitoringFilter === 'retired'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  متحولون إلى متقاعدين
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">الموظف والتشكيل</th>
                  <th className="px-4 py-3">تاريخ الميلاد والعمر</th>
                  <th className="px-4 py-3">موقف التقاعد والتنبيه</th>
                  <th className="px-4 py-3">حالة التمديد الحالية</th>
                  <th className="px-4 py-3 text-center">إجراء سريغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredMonitoredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">
                      لا يوجد موظفون ينطبق عليهم التصفية المختارة
                    </td>
                  </tr>
                ) : (
                  filteredMonitoredEmployees.map((emp) => {
                    const { age, reachedAge, isApproaching, daysToRetirement, hasExtension, isRetired } = emp.retirementAnalysis;

                    return (
                      <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-bold text-slate-800">{emp.full_name || emp.fullName}</p>
                            <p className="text-[10px] text-slate-400">
                              {emp.department || '—'} | {emp.job_title || emp.jobTitle || '—'} | الرمز: {emp.civil_service_number || emp.civilServiceNumber || '—'}
                            </p>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-700">
                            {emp.birth_date || emp.birthDate || 'غير مسجل'}
                          </div>
                          {age !== null && (
                            <div className="text-[10px] text-slate-500 font-extrabold">
                              العمر: {age} سنة
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isRetired ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              <CheckCircle2 size={12} className="text-slate-500" />
                              متم تغيير الحالة إلى متقاعد
                            </span>
                          ) : reachedAge ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertTriangle size={12} className="text-rose-600" />
                              بلغ السن القانوني ({systemSettings.retirementAge} سنة)
                            </span>
                          ) : isApproaching ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              <Hourglass size={12} className="text-amber-700" />
                              يقترب من التقاعد (باقي {daysToRetirement} يوم)
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {hasExtension ? (
                            <div className="flex items-center justify-between gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                              <div>
                                <div>تمديد معتمد: {emp.retirement_extension_years || emp.retirementExtensionYears || 0}س و {emp.retirement_extension_months || emp.retirementExtensionMonths || 0}ش</div>
                                {(emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber) && (
                                  <div className="text-[9px] text-emerald-600">أمر: {emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber}</div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEmployeeExtension(emp);
                                }}
                                className="p-1 text-rose-600 hover:bg-rose-100 rounded-md transition-colors cursor-pointer shrink-0"
                                title="حذف تمديد الخدمة"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">بدون تمديد خدمة</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleOpenAddModal(emp, 'تمديد خدمة')}
                              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-bold px-3 py-1 h-7 gap-1"
                            >
                              <Plus size={12} />
                              تمديد خدمة
                            </Button>

                            {!isRetired && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRetirementModalEmployee(emp);
                                  setRetirementOrderNumber('');
                                  setRetirementOrderDate(new Date().toISOString().split('T')[0]);
                                  setRetirementNotes('');
                                }}
                                className="border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-[10px] font-bold px-3 py-1 h-7"
                              >
                                تحويل إلى متقاعد
                              </Button>
                            )}
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
      )}

      {/* Modal: Add/Edit Service Record */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 sm:p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-[#1B3A6B] flex items-center gap-2">
              <Hourglass size={20} className="text-[#C8960C]" />
              {editingRecord ? 'تعديل أمر الخدمة المحتسبة / التمديد' : 'إضافة أمر احتساب خدمة / تمديد خدمة'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveRecord} className="space-y-4 mt-2">
            {/* Employee Search & Select */}
            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-800">
                اختيار الموظف مع إمكانية البحث <span className="text-rose-500">*</span>
              </label>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute right-3 top-2.5 text-slate-400" size={15} />
                <Input
                  type="text"
                  placeholder="ابحث باسم الموظف، رقم الشركة، الرمز الوظيفي..."
                  value={empSearchTerm}
                  onChange={(e) => setEmpSearchTerm(e.target.value)}
                  className="pr-9 rounded-xl text-xs bg-white border-slate-200 shadow-xs"
                />
              </div>

              {/* Select Dropdown */}
              <Select
                value={formData.employee_id}
                onValueChange={(val) => setFormData({ ...formData, employee_id: val })}
              >
                <SelectTrigger className="rounded-xl border-slate-200 text-xs bg-white font-medium">
                  <SelectValue placeholder="اختر الموظف من القائمة المعروضة..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {modalFilteredEmployees.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400 font-medium">
                      لا يوجد موظف مطابق لنتائج البحث
                    </div>
                  ) : (
                    modalFilteredEmployees.map((emp) => {
                      const name = emp.full_name || emp.fullName;
                      const companyNum = emp.company_number || emp.companyNumber;
                      const civilNum = emp.civil_service_number || emp.civilServiceNumber || emp.employee_number || emp.employeeNumber;
                      const title = emp.job_title || emp.jobTitle;

                      return (
                        <SelectItem key={emp.id} value={String(emp.id)} className="text-right py-2">
                          <div className="flex flex-col text-right">
                            <span className="font-bold text-slate-800">{name}</span>
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              {companyNum ? `رقم الشركة: ${companyNum} | ` : ''}
                              {civilNum ? `الرمز الوظيفي: ${civilNum}` : 'بدون رمز'}
                              {title ? ` | ${title}` : ''}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>

              {/* Highlighted selected employee badge */}
              {formData.employee_id && (() => {
                const selectedEmp = employees.find(e => String(e.id) === String(formData.employee_id));
                if (!selectedEmp) return null;
                const companyNum = selectedEmp.company_number || selectedEmp.companyNumber;
                const civilNum = selectedEmp.civil_service_number || selectedEmp.civilServiceNumber || selectedEmp.employee_number || selectedEmp.employeeNumber;

                return (
                  <div className="bg-blue-100/70 border border-blue-200 rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-blue-950 mt-1">
                    <div>
                      <div className="font-black text-[#1B3A6B] flex items-center gap-1.5">
                        <Users size={14} className="text-[#1B3A6B]" />
                        {selectedEmp.full_name || selectedEmp.fullName}
                      </div>
                      <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-medium">
                        {companyNum && (
                          <span className="bg-white px-2 py-0.5 rounded border border-blue-100 font-bold text-blue-900">
                            رقم الشركة: {companyNum}
                          </span>
                        )}
                        {civilNum && (
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            الرمز الوظيفي: {civilNum}
                          </span>
                        )}
                        {(selectedEmp.job_title || selectedEmp.jobTitle) && (
                          <span>{selectedEmp.job_title || selectedEmp.jobTitle}</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, employee_id: '' });
                        setEmpSearchTerm('');
                      }}
                      className="text-rose-600 hover:text-rose-700 text-[10px] font-bold px-2 py-1 bg-white rounded-lg border border-rose-200 hover:bg-rose-50 shadow-xs shrink-0"
                    >
                      تغيير الموظف
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Record Type Select */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">نوع الإجراء / الأمر <span className="text-rose-500">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={lockRecordType}
                  onClick={() => setFormData({ ...formData, record_type: 'خدمة محتسبة' })}
                  className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                    formData.record_type === 'خدمة محتسبة'
                      ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-sm'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  } ${lockRecordType ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  خدمة محتسبة (إضافة مدة)
                </button>

                <button
                  type="button"
                  disabled={lockRecordType}
                  onClick={() => setFormData({ ...formData, record_type: 'تمديد خدمة' })}
                  className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                    formData.record_type === 'تمديد خدمة'
                      ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-sm'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                  } ${lockRecordType ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  تمديد خدمة تقاعدية
                </button>
              </div>
            </div>

            {/* Order Number & Order Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الأمر الوزاري/الإداري <span className="text-rose-500">*</span></label>
                <Input
                  required
                  placeholder="مثال: 1042/ش/م"
                  value={formData.order_number}
                  onChange={(e) => setFormData({ ...formData, order_number: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الأمر <span className="text-rose-500">*</span></label>
                <Input
                  type="date"
                  required
                  value={formData.order_date}
                  onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                  className="rounded-xl text-xs"
                />
              </div>
            </div>

            {/* Duration Fields */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المدة المضافة {formData.record_type === 'تمديد خدمة' ? '(سنوات - شهور)' : '(سنوات - شهور - أيام)'}
              </label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-1">سنوات</span>
                  <Input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.years}
                    onChange={(e) => setFormData({ ...formData, years: parseInt(e.target.value) || 0 })}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 font-bold block mb-1">أشهر</span>
                  <Input
                    type="number"
                    min="0"
                    max="11"
                    value={formData.months}
                    onChange={(e) => setFormData({ ...formData, months: parseInt(e.target.value) || 0 })}
                    className="rounded-xl text-xs font-mono"
                  />
                </div>

                {formData.record_type === 'خدمة محتسبة' && (
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block mb-1">أيام</span>
                    <Input
                      type="number"
                      min="0"
                      max="30"
                      value={formData.days}
                      onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 0 })}
                      className="rounded-xl text-xs font-mono"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Options Specific to Service Type */}
            {formData.record_type === 'خدمة محتسبة' ? (
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                <label className="block text-xs font-bold text-slate-800">الغرض من الاحتساب:</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="purpose"
                      value="pension_only"
                      checked={formData.purpose === 'pension_only'}
                      onChange={() => setFormData({ ...formData, purpose: 'pension_only' })}
                      className="text-[#1B3A6B]"
                    />
                    <span>لاغراض التقاعد فقط</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="purpose"
                      value="promotion_allowance_pension"
                      checked={formData.purpose === 'promotion_allowance_pension'}
                      onChange={() => setFormData({ ...formData, purpose: 'promotion_allowance_pension' })}
                      className="text-[#1B3A6B]"
                    />
                    <span>لاغراض الترقية و العلاوة و التقاعد</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200/80 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-700" />
                  ملاحظة تمديد الخدمة:
                </p>
                <p className="text-[11px] text-amber-800">
                  عند حفظ تمديد الخدمة، سيتم تحديث حقول التمديد في سجل الموظف وتحديث حالته الإدارية لتوثيق الاستمرارية الممددة بنجاح.
                </p>
              </div>
            )}

            {/* Reasons / Details */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">السبب والمبررات / التفاصيل</label>
              <Textarea
                rows={2}
                placeholder="أدخل التفاصيل والجهة السابقة أو أسباب التمديد الإداري..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="rounded-xl text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-xl text-xs"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#1B3A6B] hover:bg-[#2a4f8f] text-white rounded-xl text-xs font-bold"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ السجل والأمر'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Retirement Status Dialog */}
      <Dialog open={Boolean(retirementModalEmployee)} onOpenChange={() => setRetirementModalEmployee(null)}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-[#1B3A6B]">
              إحالة الموظف إلى التقاعد
            </DialogTitle>
          </DialogHeader>

          {retirementModalEmployee && (
            <form onSubmit={handleSaveRetirementStatus} className="space-y-4 mt-2">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <p className="font-bold text-slate-800">{retirementModalEmployee.full_name || retirementModalEmployee.fullName}</p>
                <p className="text-[10px] text-slate-500">الرمز الوظيفي: {retirementModalEmployee.civil_service_number || retirementModalEmployee.civilServiceNumber}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم أمر الإحالة على التقاعد <span className="text-rose-500">*</span></label>
                <Input
                  required
                  placeholder="مثال: 882/تقاعد"
                  value={retirementOrderNumber}
                  onChange={(e) => setRetirementOrderNumber(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ أمر الإحالة <span className="text-rose-500">*</span></label>
                <Input
                  type="date"
                  required
                  value={retirementOrderDate}
                  onChange={(e) => setRetirementOrderDate(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الإحالة</label>
                <Textarea
                  rows={2}
                  placeholder="بلوغ السن القانوني للتقاعد..."
                  value={retirementNotes}
                  onChange={(e) => setRetirementNotes(e.target.value)}
                  className="rounded-xl text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRetirementModalEmployee(null)}
                  className="rounded-xl text-xs"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={statusSaving}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
                >
                  {statusSaving ? 'جاري المعالجة...' : 'تأكيد الإحالة إلى التقاعد'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <Trash2 size={18} />
              تأكيد حذف البيانات
            </DialogTitle>
          </DialogHeader>

          {itemToDelete && (
            <div className="space-y-4 pt-2">
              <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-900 leading-relaxed space-y-1.5">
                {itemToDelete.type === 'record' ? (
                  <div>
                    <p className="font-bold text-sm text-rose-950">
                      هل أنت متأكد من حذف أمر ({itemToDelete.record.recordType || itemToDelete.record.record_type || 'احتساب الخدمة'})؟
                    </p>
                    <p className="text-slate-700 mt-1">
                      الموظف: <strong className="text-slate-900">{itemToDelete.record.employee_name || itemToDelete.record.employeeName || 'المحدد'}</strong>
                    </p>
                    <p className="font-mono text-[11px] text-rose-800 mt-0.5">
                      رقم الأمر: {itemToDelete.record.orderNumber || itemToDelete.record.order_number || 'بدون رقم'} | المدة: {itemToDelete.record.years || 0} سنة و {itemToDelete.record.months || 0} شهر
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold text-sm text-rose-950">
                      هل أنت متأكد من حذف أمر تمديد الخدمة للموظف؟
                    </p>
                    <p className="text-slate-700 mt-1">
                      الموظف: <strong className="text-slate-900">{itemToDelete.emp.full_name || itemToDelete.emp.fullName}</strong>
                    </p>
                    <p className="text-[11px] text-rose-800 mt-0.5">
                      سيتم تصفير سنوات وأشهر التمديد وإعادة الموقف الإداري للموظف تلقائياً.
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteConfirmOpen(false);
                    setItemToDelete(null);
                  }}
                  className="rounded-xl text-xs"
                  disabled={deleting}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold gap-1.5 px-5"
                >
                  {deleting ? 'جاري الحذف...' : 'حذف السجل نهائياً'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
