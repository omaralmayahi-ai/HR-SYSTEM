import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Edit, Plus, Trash2, Calendar, FileText, GraduationCap, DollarSign, Clock, Briefcase, Heart, MapPin, ClipboardList, CheckCircle2, XCircle, Power, ShieldCheck, QrCode, Award, ShieldAlert, User, Baby } from 'lucide-react';
import { formatCurrency, calculateSalary, getGradeLabel, getStepLabel, getActiveFinancialRates, checkEmployeeMatchesRule } from '@/lib/salaryTable';
import { useToast } from '@/components/ui/use-toast';
import EmployeeQuickAccessQR from '@/components/employee/EmployeeQuickAccessQR';
import { fetchEducationDegreesSorted, fetchPenaltyTypesSorted, subscribeToSettingsUpdates, notifySettingsChanged } from '@/lib/settingsUtils';

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 px-2 transition-colors">
      <span className="text-slate-500 text-sm font-medium">{label}:</span>
      <span className="text-slate-800 text-sm font-semibold text-left">{value}</span>
    </div>
  );
}

// Function to calculate exact service duration in Years, Months, and Days
function calculateServiceDuration(startDateStr) {
  if (!startDateStr) return '—';
  const start = new Date(startDateStr);
  const end = new Date(); // current date
  
  if (isNaN(start.getTime())) return 'التاريخ غير صالح';
  if (start > end) return 'لم تبدأ الخدمة بعد';
  
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  
  if (days < 0) {
    months--;
    // Get last day of previous month
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  const parts = [];
  if (years > 0) {
    if (years === 1) parts.push('سنة واحدة');
    else if (years === 2) parts.push('سنتين');
    else if (years >= 3 && years <= 10) parts.push(`${years} سنوات`);
    else parts.push(`${years} سنة`);
  }
  
  if (months > 0) {
    if (months === 1) parts.push('شهر واحد');
    else if (months === 2) parts.push('شهرين');
    else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
    else parts.push(`${months} شهر`);
  }
  
  if (days > 0) {
    if (days === 1) parts.push('يوم واحد');
    else if (days === 2) parts.push('يومين');
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوم`);
  }
  
  if (parts.length === 0) return '0 يوم';
  return parts.join(' و ');
}

// Function to calculate cumulative total service including added service records
function calculateTotalCumulativeService(startDateStr, addedYears = 0, addedMonths = 0, addedDays = 0) {
  const aY = parseInt(addedYears) || 0;
  const aM = parseInt(addedMonths) || 0;
  const aD = parseInt(addedDays) || 0;

  if (!startDateStr) {
    if (aY > 0 || aM > 0 || aD > 0) {
      const parts = [];
      if (aY > 0) parts.push(`${aY} سنة`);
      if (aM > 0) parts.push(`${aM} شهر`);
      if (aD > 0) parts.push(`${aD} يوم`);
      return `${parts.join(' و ')} (خدمة مضافة محتسبة فقط)`;
    }
    return '—';
  }
  const start = new Date(startDateStr);
  const end = new Date(); // current date
  
  if (isNaN(start.getTime())) return 'التاريخ غير صالح';
  if (start > end) return 'لم تبدأ الخدمة بعد';
  
  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();
  
  if (days < 0) {
    months--;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  
  if (months < 0) {
    years--;
    months += 12;
  }

  // Add extra added/calculated service
  years += aY;
  months += aM;
  days += aD;

  if (days >= 30) {
    months += Math.floor(days / 30);
    days = days % 30;
  }
  if (months >= 12) {
    years += Math.floor(months / 12);
    months = months % 12;
  }
  
  const parts = [];
  if (years > 0) {
    if (years === 1) parts.push('سنة واحدة');
    else if (years === 2) parts.push('سنتين');
    else if (years >= 3 && years <= 10) parts.push(`${years} سنوات`);
    else parts.push(`${years} سنة`);
  }
  
  if (months > 0) {
    if (months === 1) parts.push('شهر واحد');
    else if (months === 2) parts.push('شهرين');
    else if (months >= 3 && months <= 10) parts.push(`${months} أشهر`);
    else parts.push(`${months} شهر`);
  }
  
  if (days > 0) {
    if (days === 1) parts.push('يوم واحد');
    else if (days === 2) parts.push('يومين');
    else if (days >= 3 && days <= 10) parts.push(`${days} أيام`);
    else parts.push(`${days} يوم`);
  }
  
  if (parts.length === 0) return '0 يوم';
  return parts.join(' و ');
}

// Function to calculate exact child age from birth date string
function calculateChildAge(birthDateStr) {
  if (!birthDateStr) return null;
  const b = new Date(birthDateStr);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - b.getFullYear();
  let months = now.getMonth() - b.getMonth();
  let days = now.getDate() - b.getDate();
  if (days < 0) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years < 0) return null;
  if (years === 0) {
    if (months <= 0) return 'أقل من شهر';
    if (months === 1) return 'شهر واحد';
    if (months === 2) return 'شهرين';
    if (months >= 3 && months <= 10) return `${months} أشهر`;
    return `${months} شهر`;
  }
  if (years === 1) return 'سنة واحدة';
  if (years === 2) return 'سنتان';
  if (years >= 3 && years <= 10) return `${years} سنوات`;
  return `${years} سنة`;
}

function formatDurationParts(y = 0, m = 0, d = 0) {
  let extraM = m;
  let extraY = y;
  let extraD = d;
  if (extraD >= 30) {
    extraM += Math.floor(extraD / 30);
    extraD = extraD % 30;
  }
  if (extraM >= 12) {
    extraY += Math.floor(extraM / 12);
    extraM = extraM % 12;
  }
  const parts = [];
  if (extraY > 0) {
    if (extraY === 1) parts.push('سنة واحدة');
    else if (extraY === 2) parts.push('سنتين');
    else if (extraY >= 3 && extraY <= 10) parts.push(`${extraY} سنوات`);
    else parts.push(`${extraY} سنة`);
  }
  if (extraM > 0) {
    if (extraM === 1) parts.push('شهر واحد');
    else if (extraM === 2) parts.push('شهرين');
    else if (extraM >= 3 && extraM <= 10) parts.push(`${extraM} أشهر`);
    else parts.push(`${extraM} شهر`);
  }
  if (extraD > 0) {
    if (extraD === 1) parts.push('يوم واحد');
    else if (extraD === 2) parts.push('يومين');
    else if (extraD >= 3 && extraD <= 10) parts.push(`${extraD} أيام`);
    else parts.push(`${extraD} يوم`);
  }
  if (parts.length === 0) return '0 يوم';
  return parts.join(' و ');
}

const defaultResponsibilities = [
  'بلا مسؤولية',
  'مسؤول وجبة',
  'مسؤول وحدة',
  'مسؤول شعبة',
  'مدير قسم',
  'مدير قسم مركزي',
  'مدير هيئة',
  'معاون مدير عام',
  'مدير عام'
];

const defaultActingResponsibilities = [
  'بلا وكالة',
  'مسؤول وجبة',
  'مسؤول وحدة',
  'مسؤول شعبة',
  'مدير قسم',
  'مدير قسم مركزي',
  'مدير هيئة',
  'معاون مدير عام',
  'مدير عام'
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [employee, setEmployee] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [appreciations, setAppreciations] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [trainings, setTrainings] = useState([]);
  
  // New Iraqi civil service tables
  const [qualifications, setQualifications] = useState([]);
  const [jobAssignments, setJobAssignments] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [salaryAllowances, setSalaryAllowances] = useState([]);
  const [trainingCourses, setTrainingCourses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [retirements, setRetirements] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [educationDegrees, setEducationDegrees] = useState([]);
  const [serviceRecords, setServiceRecords] = useState([]);
  const [allowanceDeductionPresets, setAllowanceDeductionPresets] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [showQRModal, setShowQRModal] = useState(false);
  
  // Modal states for adding/editing records
  const [activeModal, setActiveModal] = useState(null); // 'qualification', 'assignment', 'promotion', 'allowance', 'evaluation', 'training_course', 'transfer', 'retirement', 'document', 'service_record'
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [modalForm, setModalForm] = useState({});
  const [modalSaving, setModalSaving] = useState(false);

  // Service Extension Management States
  const [extModalOpen, setExtModalOpen] = useState(false);
  const [extForm, setExtForm] = useState({
    orderNumber: '',
    orderDate: '',
    years: 1,
    months: 0,
    note: ''
  });
  const [extCancelModalOpen, setExtCancelModalOpen] = useState(false);
  const [extCancelForm, setExtCancelForm] = useState({
    orderNumber: '',
    orderDate: '',
    note: ''
  });
  const [extDeleteConfirmOpen, setExtDeleteConfirmOpen] = useState(false);
  const [extSaving, setExtSaving] = useState(false);

  // General Record Delete Dialog State
  const [deleteDialog, setDeleteDialog] = useState({ open: false, clientName: '', recordId: null, presetId: null });
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    try {
      const [
        empRes, lvRes, penRes, apprRes, evRes, trRes, qualRes, jobRes, promRes, salRes, tcRes, transRes, retRes, docRes, sRecsRes, presetsRes
      ] = await Promise.allSettled([
        apiClient.entities.Employee.get(id),
        apiClient.entities.LeaveRequest.filter({ employee_id: id }),
        apiClient.entities.Penalty.filter({ employee_id: id }),
        apiClient.entities.Appreciation.filter({ employee_id: id }),
        apiClient.entities.AnnualEvaluation.filter({ employee_id: id }),
        apiClient.entities.TrainingEnrollment.filter({ employee_id: id }),
        apiClient.entities.Qualification.filter({ employee_id: id }),
        apiClient.entities.JobAssignment.filter({ employee_id: id }),
        apiClient.entities.PromotionIncrement.filter({ employee_id: id }),
        apiClient.entities.SalaryAllowance.filter({ employee_id: id }),
        apiClient.entities.TrainingCourse.filter({ employee_id: id }),
        apiClient.entities.Transfer.filter({ employee_id: id }),
        apiClient.entities.Retirement.filter({ employee_id: id }),
        apiClient.entities.Document.filter({ employee_id: id }),
        apiClient.entities.ServiceRecord.filter({ employee_id: id }),
        apiClient.entities.AllowanceDeduction.list()
      ]);

      if (empRes.status === 'fulfilled' && empRes.value) setEmployee(empRes.value);
      if (lvRes.status === 'fulfilled') setLeaves(lvRes.value || []);
      if (penRes.status === 'fulfilled') setPenalties(penRes.value || []);
      if (apprRes.status === 'fulfilled') setAppreciations(apprRes.value || []);
      if (evRes.status === 'fulfilled') setEvaluations(evRes.value || []);
      if (trRes.status === 'fulfilled') setTrainings(trRes.value || []);
      if (qualRes.status === 'fulfilled') setQualifications(qualRes.value || []);
      if (jobRes.status === 'fulfilled') setJobAssignments(jobRes.value || []);
      if (promRes.status === 'fulfilled') setPromotions(promRes.value || []);
      if (salRes.status === 'fulfilled') setSalaryAllowances(salRes.value || []);
      if (tcRes.status === 'fulfilled') setTrainingCourses(tcRes.value || []);
      if (transRes.status === 'fulfilled') setTransfers(transRes.value || []);
      if (retRes.status === 'fulfilled') setRetirements(retRes.value || []);
      if (docRes.status === 'fulfilled') setDocuments(docRes.value || []);
      if (sRecsRes.status === 'fulfilled') setServiceRecords(sRecsRes.value || []);
      if (presetsRes.status === 'fulfilled') {
        setAllowanceDeductionPresets(presetsRes.value || []);
        if (presetsRes.value) {
          localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(presetsRes.value));
        }
      }
    } catch (err) {
      console.error('Error fetching employee data:', err);
    } finally {
      setLoading(false);
    }
  };

  const [penaltyTypesList, setPenaltyTypesList] = useState([]);

  const loadEducationDegrees = () => {
    fetchEducationDegreesSorted().then(data => setEducationDegrees(data || [])).catch(() => {});
  };

  const loadPenaltyTypes = () => {
    fetchPenaltyTypesSorted().then(data => {
      if (data && data.length > 0) {
        const active = data.filter(d => d.status === 'فعال' || !d.status);
        setPenaltyTypesList(active.length > 0 ? active : data);
      } else {
        setPenaltyTypesList(['إنذار شفهي', 'إنذار خطي', 'قطع الراتب (يوم)', 'قطع الراتب (أيام)', 'توبيخ إداري', 'إنقاص الراتب', 'تنزيل الدرجة', 'فصل من الخدمة'].map(n => ({ id: n, name: n })));
      }
    }).catch(() => {});
  };

  const handleOpenExtModal = () => {
    setExtForm({
      orderNumber: employee?.retirement_extension_order_number || employee?.retirementExtensionOrderNumber || '',
      orderDate: employee?.retirement_extension_order_date || employee?.retirementExtensionOrderDate || '',
      years: employee?.retirement_extension_years ?? employee?.retirementExtensionYears ?? 1,
      months: employee?.retirement_extension_months ?? employee?.retirementExtensionMonths ?? 0,
      note: employee?.retirement_extension_note || employee?.retirementExtensionNote || ''
    });
    setExtModalOpen(true);
  };

  const handleSaveExtension = async (e) => {
    e.preventDefault();
    if (!extForm.orderNumber.trim() || !extForm.orderDate) {
      toast({
        title: 'بيانات غير مكتملة',
        description: 'يرجى إدخال رقم وتاريخ أمر تمديد الخدمة',
        variant: 'destructive',
      });
      return;
    }
    setExtSaving(true);
    try {
      const payload = {
        retirementExtensionOrderNumber: extForm.orderNumber,
        retirementExtensionOrderDate: extForm.orderDate,
        retirementExtensionYears: parseInt(extForm.years) || 0,
        retirementExtensionMonths: parseInt(extForm.months) || 0,
        retirementExtensionNote: extForm.note,
      };
      await apiClient.entities.Employee.update(employee.id, payload);

      // Check if serviceRecord of type 'تمديد خدمة' exists, update or create it
      const existingExtRecord = serviceRecords.find(r => (r.recordType || r.record_type) === 'تمديد خدمة');
      if (existingExtRecord) {
        await apiClient.entities.ServiceRecord.update(existingExtRecord.id, {
          order_number: extForm.orderNumber,
          order_date: extForm.orderDate,
          years: parseInt(extForm.years) || 0,
          months: parseInt(extForm.months) || 0,
          reason: extForm.note || 'تمديد خدمة تقاعدية'
        });
      } else {
        await apiClient.entities.ServiceRecord.create({
          employee_id: employee.id,
          record_type: 'تمديد خدمة',
          order_number: extForm.orderNumber,
          order_date: extForm.orderDate,
          years: parseInt(extForm.years) || 0,
          months: parseInt(extForm.months) || 0,
          days: 0,
          purpose: 'pension_only',
          reason: extForm.note || 'تمديد خدمة تقاعدية',
          notes: ''
        });
      }

      toast({
        title: 'تم حفظ وتأكيد تمديد الخدمة',
        description: `تم تحديث مدة تمديد الخدمة للموظف (${employee.full_name || employee.name})`,
        variant: 'success',
      });
      await apiClient.logs.create({
        action: 'تثبيت/تعديل تمديد الخدمة',
        details: `تحديث تمديد الخدمة للموظف (${employee.full_name || employee.name}) بموجب الأمر (${extForm.orderNumber}) بتاريخ (${extForm.orderDate}) ولمدة (${extForm.years} سنة و ${extForm.months} شهر).`
      }).catch(() => {});

      setExtModalOpen(false);
      fetchData();
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'تعذر حفظ بيانات تمديد الخدمة',
        variant: 'destructive',
      });
    } finally {
      setExtSaving(false);
    }
  };

  const handleCancelExtension = async (e) => {
    e.preventDefault();
    if (!extCancelForm.orderNumber.trim() || !extCancelForm.orderDate) {
      toast({
        title: 'بيانات غير مكتملة',
        description: 'يرجى إدخال رقم وتاريخ أمر إلغاء التمديد',
        variant: 'destructive',
      });
      return;
    }
    setExtSaving(true);
    try {
      const oldNote = employee.retirement_extension_note || employee.retirementExtensionNote || '';
      const cancelMsg = `[تم إلغاء التمديد بموجب الأمر رقم (${extCancelForm.orderNumber}) بتاريخ (${extCancelForm.orderDate}) - السبب: ${extCancelForm.note || 'بلا سبب مذكور'}]`;
      const newNote = oldNote ? `${oldNote}\n${cancelMsg}` : cancelMsg;

      const payload = {
        retirementExtensionYears: 0,
        retirementExtensionMonths: 0,
        retirementExtensionNote: newNote,
      };
      await apiClient.entities.Employee.update(employee.id, payload);
      toast({
        title: 'تم إلغاء تمديد الخدمة',
        description: `تم إيقاف تمديد الخدمة وتدوين أمر الإلغاء بالسجل الرسمى.`,
        variant: 'success',
      });
      await apiClient.logs.create({
        action: 'إلغاء تمديد الخدمة',
        details: `إلغاء تمديد الخدمة للموظف (${employee.full_name || employee.name}) بموجب أمر الإلغاء (${extCancelForm.orderNumber}) بتاريخ (${extCancelForm.orderDate}).`
      }).catch(() => {});

      setExtCancelModalOpen(false);
      fetchData();
    } catch (error) {
      toast({
        title: 'خطأ أثناء الإلغاء',
        description: error.message || 'تعذر إلغاء تمديد الخدمة',
        variant: 'destructive',
      });
    } finally {
      setExtSaving(false);
    }
  };

  const handleDeleteExtension = async () => {
    setExtSaving(true);
    try {
      const payload = {
        retirementExtensionOrderNumber: null,
        retirementExtensionOrderDate: null,
        retirementExtensionYears: 0,
        retirementExtensionMonths: 0,
        retirementExtensionNote: null,
      };
      await apiClient.entities.Employee.update(employee.id, payload);

      // Delete all serviceRecords with recordType === 'تمديد خدمة' for this employee
      const extRecs = serviceRecords.filter(r => (r.recordType || r.record_type) === 'تمديد خدمة');
      for (const r of extRecs) {
        try {
          await apiClient.entities.ServiceRecord.delete(r.id);
        } catch (e) {}
      }

      toast({
        title: 'تم حذف بيانات التمديد',
        description: `تم إزالة وحذف كافة بيانات تمديد الخدمة الخاصة بالموظف.`,
        variant: 'success',
      });
      await apiClient.logs.create({
        action: 'حذف تمديد الخدمة',
        details: `حذف بيانات تمديد الخدمة للموظف (${employee.full_name || employee.name}).`
      }).catch(() => {});

      setExtDeleteConfirmOpen(false);
      fetchData();
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message || 'تعذر حذف تمديد الخدمة',
        variant: 'destructive',
      });
    } finally {
      setExtSaving(false);
    }
  };

  useEffect(() => {
    fetchData();
    loadEducationDegrees();
    loadPenaltyTypes();

    const unsubscribe = subscribeToSettingsUpdates(() => {
      fetchData();
      loadEducationDegrees();
      loadPenaltyTypes();
    });

    return () => unsubscribe();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
    </div>
  );
  if (!employee) return <div className="text-center py-12 text-slate-400">الموظف غير موجود</div>;

  const salaryCalc = calculateSalary(employee);
  const financialRates = getActiveFinancialRates();

  const classifiedCustomItems = (() => {
    let presets = allowanceDeductionPresets.length > 0 ? allowanceDeductionPresets : [];
    if (presets.length === 0) {
      try {
        const saved = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
        if (saved) presets = JSON.parse(saved);
      } catch (e) {}
    }

    const items = [];
    const processedPresetNames = new Set();

    // 1. Process global presets from ALLOWANCES_DEDUCTIONS_PRESETS
    presets.forEach(p => {
      const isStopped = p.status && p.status !== 'فعال' && p.status !== 'active';

      const isSpouse = (p.name.includes('زوجية') || p.name.includes('الزوجية'));
      const isChild = (p.name.includes('أطفال') || p.name.includes('الاطفال') || p.name.includes('أولاد') || p.name.includes('الاولاد') || p.name.includes('طفل') || p.name.includes('ولد'));
      if (isSpouse || isChild) return;

      let isTemp = false;
      let timingLabel = 'دائم';
      let tempMeta = null;

      try {
        const metaStr = localStorage.getItem(`TEMPORARY_META_${p.id}`);
        if (metaStr) {
          tempMeta = JSON.parse(metaStr);
          isTemp = !!tempMeta.isTemporary;
          if (isTemp) {
            if (tempMeta.timingType === 'range') {
              timingLabel = `مؤقت (من شهر ${tempMeta.startMonth}/${tempMeta.startYear} إلى شهر ${tempMeta.endMonth}/${tempMeta.endYear})`;
            } else {
              timingLabel = `مؤقت (شهر ${tempMeta.paymentMonth}/${tempMeta.paymentYear})`;
            }
          }
        }
      } catch (e) {}

      let isEligible = true;

      // Check temporary timing
      if (isTemp && tempMeta) {
        const targetM = new Date().getMonth() + 1;
        const targetY = new Date().getFullYear();
        if (tempMeta.timingType === 'range') {
          const startVal = parseInt(tempMeta.startYear) * 12 + parseInt(tempMeta.startMonth);
          const endVal = parseInt(tempMeta.endYear) * 12 + parseInt(tempMeta.endMonth);
          const curVal = targetY * 12 + targetM;
          if (curVal < startVal || curVal > endVal) isEligible = false;
        } else {
          if (parseInt(tempMeta.paymentYear) !== targetY || parseInt(tempMeta.paymentMonth) !== targetM) {
            isEligible = false;
          }
        }

        if (isEligible) {
          if (tempMeta.beneficiaryType === 'direct') {
            const directIds = tempMeta.directEmployeeIds || [];
            if (!directIds.map(String).includes(String(employee.id))) {
              isEligible = false;
            }
          } else {
            if (!checkEmployeeMatchesRule(employee, p.id)) {
              isEligible = false;
            }
          }
        }
      } else {
        if (!checkEmployeeMatchesRule(employee, p.id)) {
          isEligible = false;
        }
      }

      if (!isEligible) return; // Employee is NOT included in criteria/direct list

      // Check if employee has a DB record in salaryAllowances for this preset
      const dbMatch = salaryAllowances.find(sa => sa.allowance_type === p.name || sa.allowanceType === p.name);

      const calcType = p.calcType || p.calc_type || (dbMatch?.percentage > 0 ? 'percentage' : 'flat');
      const val = dbMatch?.amount > 0 ? dbMatch.amount : (dbMatch?.percentage > 0 ? dbMatch.percentage : (p.value || 0));

      let resolvedAmount = 0;
      if (!isStopped) {
        if (calcType === 'percentage') {
          resolvedAmount = Math.round(salaryCalc.base_salary * (val / 100));
        } else {
          resolvedAmount = val;
        }
      }

      processedPresetNames.add(p.name);

      items.push({
        id: dbMatch?.id || `preset_${p.id}`,
        dbId: dbMatch?.id || null,
        presetId: p.id,
        allowance_type: p.name,
        type: p.type || 'allowance',
        isTemp,
        isStopped,
        timingLabel,
        order_number: dbMatch?.order_number || dbMatch?.orderNumber || '—',
        resolvedAmount
      });
    });

    // 2. Process any remaining salaryAllowances DB records that didn't match a preset
    salaryAllowances.forEach(sa => {
      if (processedPresetNames.has(sa.allowance_type)) return;

      // Check if employee is eligible/not blocked for this individual DB record
      if (!checkEmployeeMatchesRule(employee, sa.id)) return;

      const isStopped = sa.status === 'متوقف مؤقتاً' || sa.status === 'متوقف' || sa.status === 'موقوف';
      let value = 0;
      if (!isStopped) {
        value = sa.amount > 0 ? sa.amount : Math.round(salaryCalc.base_salary * ((sa.percentage || 0) / 100));
      }

      items.push({
        ...sa,
        dbId: sa.id,
        presetId: null,
        type: sa.type || 'allowance',
        isTemp: false,
        isStopped,
        timingLabel: 'دائم',
        resolvedAmount: value
      });
    });

    return items;
  })();

  const totalCustomAllowances = classifiedCustomItems
    .filter(sa => sa.type === 'allowance')
    .reduce((sum, sa) => sum + (sa.resolvedAmount || 0), 0);

  const displayedTotalAllowances = 
    salaryCalc.degree_allowance + 
    salaryCalc.higher_degree_allowance + 
    salaryCalc.spouse_allowance + 
    salaryCalc.children_allowance + 
    salaryCalc.position_allowance + 
    salaryCalc.region_allowance + 
    totalCustomAllowances;

  const totalCustomDeductions = classifiedCustomItems
    .filter(sa => sa.type === 'deduction')
    .reduce((sum, sa) => sum + (sa.resolvedAmount || 0), 0);

  const displayedTotalDeductions = 
    salaryCalc.retirement_deduction + 
    salaryCalc.tax_deduction + 
    salaryCalc.absence_deduction + 
    salaryCalc.penalty_deduction + 
    salaryCalc.loan_deduction + 
    totalCustomDeductions;

  const displayedNetSalary = salaryCalc.base_salary + displayedTotalAllowances - displayedTotalDeductions;

  // Compute leave balances dynamically
  const approvedRegularLeaves = leaves.filter(l => l.leave_type === 'اعتيادية' && l.status === 'معتمد').reduce((sum, l) => sum + (l.days_count || 0), 0);
  const regularLeaveBalance = (employee.initial_regular_leave_balance || 0) - approvedRegularLeaves;

  const approvedSickLeaves = leaves.filter(l => l.leave_type === 'مرضية' && l.status === 'معتمد').reduce((sum, l) => sum + (l.days_count || 0), 0);
  const sickLeaveBalance = (employee.initial_sick_leave_balance || 0) - approvedSickLeaves;

  // Durations of service & Added Service records calculation
  const addedServiceRecords = serviceRecords.filter(r => (r.recordType || r.record_type) !== 'تمديد خدمة');
  const extensionRecords = serviceRecords.filter(r => (r.recordType || r.record_type) === 'تمديد خدمة');

  let totalAddedYears = 0;
  let totalAddedMonths = 0;
  let totalAddedDays = 0;

  addedServiceRecords.forEach(r => {
    totalAddedYears += parseInt(r.years || 0) || 0;
    totalAddedMonths += parseInt(r.months || 0) || 0;
    totalAddedDays += parseInt(r.days || 0) || 0;
  });

  if (totalAddedDays >= 30) {
    totalAddedMonths += Math.floor(totalAddedDays / 30);
    totalAddedDays = totalAddedDays % 30;
  }
  if (totalAddedMonths >= 12) {
    totalAddedYears += Math.floor(totalAddedMonths / 12);
    totalAddedMonths = totalAddedMonths % 12;
  }

  // Extension duration calculation
  const extYearsFromEmp = parseInt(employee?.retirement_extension_years ?? employee?.retirementExtensionYears ?? 0) || 0;
  const extMonthsFromEmp = parseInt(employee?.retirement_extension_months ?? employee?.retirementExtensionMonths ?? 0) || 0;

  let extRecYears = 0;
  let extRecMonths = 0;
  let extRecDays = 0;
  extensionRecords.forEach(r => {
    extRecYears += parseInt(r.years || 0) || 0;
    extRecMonths += parseInt(r.months || 0) || 0;
    extRecDays += parseInt(r.days || 0) || 0;
  });

  const finalExtYears = Math.max(extYearsFromEmp, extRecYears);
  const finalExtMonths = extYearsFromEmp > 0 ? extMonthsFromEmp : extRecMonths;
  const finalExtDays = extYearsFromEmp > 0 ? 0 : extRecDays;

  const hasAddedService = (totalAddedYears > 0 || totalAddedMonths > 0 || totalAddedDays > 0);
  const hasExtensionService = (finalExtYears > 0 || finalExtMonths > 0 || finalExtDays > 0);
  const hasAddedOrExtension = hasAddedService || hasExtensionService;

  const actualServiceDuration = calculateServiceDuration(employee.first_appointment_date);
  const totalServiceDuration = calculateTotalCumulativeService(
    employee.first_appointment_date,
    totalAddedYears,
    totalAddedMonths,
    totalAddedDays
  );
  const companyServiceDuration = calculateServiceDuration(employee.current_appointment_date);
  const oilSectorServiceDuration = calculateServiceDuration(employee.oil_sector_start_date);

  // Workplace representation
  const workplace = employee.section || employee.department || 'غير محدد';

  // Active qualification representation
  const activeQualification = qualifications.find(q => (q.is_active !== false && q.isActive !== false) && (q.education_level === employee.education_level || q.level === employee.education_level))
    || qualifications.find(q => q.is_active !== false && q.isActive !== false) 
    || qualifications[0] 
    || null;

  // Qualification Order Display
  const qualificationOrderDisplay = (() => {
    const raw = activeQualification?.evaluation_order || 
                activeQualification?.evaluationOrder || 
                activeQualification?.equation_number || 
                activeQualification?.equationNumber || 
                activeQualification?.education_order || 
                activeQualification?.educationOrder || 
                employee.education_order || 
                employee.evaluation_order || 
                employee.educationOrder || 
                employee.evaluationOrder || 
                employee.equation_number || 
                employee.equationNumber;

    if (!raw || raw === 'لا يوجد' || raw === 'غير متوفر' || raw === '—') {
      const empOrd = employee.education_order || 
                     employee.evaluation_order || 
                     employee.educationOrder || 
                     employee.evaluationOrder || 
                     employee.equation_number || 
                     employee.equationNumber;
      if (empOrd && empOrd !== 'لا يوجد' && empOrd !== 'غير متوفر' && empOrd !== '—') {
        return empOrd;
      }
      return raw || '—';
    }
    return raw;
  })();

  // Age calculation helper
  const employeeAge = (() => {
    if (!employee?.birth_date) return null;
    const b = new Date(employee.birth_date);
    if (isNaN(b.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) {
      age--;
    }
    return age > 0 ? age : null;
  })();

  // Spouses & Children parsers
  const parsedSpouses = (() => {
    if (!employee) return [];
    if (employee.spouses_data || employee.spousesData) {
      try {
        const parsed = typeof (employee.spouses_data || employee.spousesData) === 'string'
          ? JSON.parse(employee.spouses_data || employee.spousesData)
          : (employee.spouses_data || employee.spousesData);
        if (Array.isArray(parsed)) {
          return parsed.map(s => typeof s === 'string' ? s : s.name).filter(Boolean);
        }
      } catch (e) {}
    }
    if (employee.spouse_names || employee.spouseNames) {
      return String(employee.spouse_names || employee.spouseNames).split('،').map(s => s.trim()).filter(Boolean);
    }
    return [];
  })();

  const parsedChildren = (() => {
    if (!employee) return [];
    if (employee.children_details || employee.childrenDetails) {
      try {
        const parsed = typeof (employee.children_details || employee.childrenDetails) === 'string'
          ? JSON.parse(employee.children_details || employee.childrenDetails)
          : (employee.children_details || employee.childrenDetails);
        if (Array.isArray(parsed)) {
          return parsed.filter(c => c && (c.name || c.birth_date));
        }
      } catch (e) {}
    }
    return [];
  })();

  const openAddModal = (type) => {
    setEditingRecordId(null);
    setActiveModal(type);
    let defaultValues = {};
    if (type === 'qualification') {
      defaultValues = { 
        education_level: 'بكالوريوس', 
        specialization: '', 
        institution: '', 
        graduation_year: new Date().getFullYear(), 
        evaluation_order: '',
        equation_number: '',
        education_order: '',
        notes: '' 
      };
    } else if (type === 'assignment') {
      defaultValues = { 
        order_number: '', 
        assignment_order: '', 
        order_date: new Date().toISOString().split('T')[0], 
        assignment_date: new Date().toISOString().split('T')[0], 
        action_type: 'تكليف', 
        assignment_type: 'تكليف',
        primary_responsibility: employee?.primary_responsibility || 'بلا مسؤولية', 
        acting_responsibility: employee?.acting_responsibility || 'بلا وكالة', 
        deputy_level: employee?.deputy_level || 'لا يوجد', 
        job_title: employee?.job_title || '', 
        department: employee?.department || '', 
        section: employee?.section || '', 
        service_type: employee?.service_type || 'دائم',
        notes: ''
      };
    } else if (type === 'promotion') {
      defaultValues = { promotion_date: '', promotion_order: '', grade: 1, step: 1, notes: '' };
    } else if (type === 'allowance') {
      defaultValues = { 
        name: '', 
        type: 'allowance', 
        calcType: 'flat', 
        value: 100000, 
        order_number: '', 
        timingType: 'single', 
        paymentMonth: new Date().getMonth() + 1, 
        paymentYear: new Date().getFullYear(),
        startMonth: new Date().getMonth() + 1,
        startYear: new Date().getFullYear(),
        endMonth: new Date().getMonth() + 1,
        endYear: new Date().getFullYear()
      };
    } else if (type === 'evaluation') {
      defaultValues = { year: new Date().getFullYear(), score: 85, grade: 'جيد جداً', evaluator: '', status: 'معتمد' };
    } else if (type === 'training_course') {
      defaultValues = { course_name: '', start_date: '', end_date: '', institution: '', result: 'اجتاز', order_number: '' };
    } else if (type === 'transfer') {
      defaultValues = { transfer_date: '', transfer_order: '', from_department: '', to_department: '', transfer_type: 'نقل دائم' };
    } else if (type === 'retirement') {
      defaultValues = { retirement_date: '', retirement_order: '', retirement_reason: 'بلوغ السن القانوني', pension_amount: 0, status: 'مكتمل' };
    } else if (type === 'document') {
      defaultValues = { document_name: '', document_type: 'أمر إداري', issue_date: '', issue_authority: '', file_path: '', notes: '' };
    } else if (type === 'service_record') {
      defaultValues = { 
        record_type: 'خدمة محتسبة', 
        order_number: '', 
        order_date: new Date().toISOString().split('T')[0], 
        years: 1, 
        months: 0, 
        days: 0, 
        purpose: 'promotion_allowance_pension', 
        reason: '', 
        notes: '' 
      };
    } else if (type === 'appreciation') {
      defaultValues = {
        order_number: '',
        order_date: new Date().toISOString().split('T')[0],
        issuer: 'السيد المدير العام',
        reason: '',
        seniority_impact: 'قدم شهر واحد',
        notes: ''
      };
    } else if (type === 'penalty') {
      defaultValues = {
        penalty_type: 'إنذار خطي',
        penalty_date: new Date().toISOString().split('T')[0],
        order_number: '',
        reason: '',
        status: 'نافذ'
      };
    }
    setModalForm(defaultValues);
  };

  const openEditModal = (type, record) => {
    if (!record) return;
    setEditingRecordId(record.id);
    setActiveModal(type);

    let editValues = {};
    if (type === 'qualification') {
      const orderVal = record.evaluation_order || record.evaluationOrder || record.equation_number || record.equationNumber || record.education_order || record.educationOrder || '';
      editValues = {
        education_level: record.education_level || record.educationLevel || record.level || 'بكالوريوس',
        specialization: record.specialization || '',
        institution: record.institution || record.university || '',
        graduation_year: record.graduation_year || record.graduationYear || new Date().getFullYear(),
        evaluation_order: orderVal,
        equation_number: orderVal,
        education_order: orderVal,
        notes: record.notes || ''
      };
    } else if (type === 'assignment') {
      editValues = {
        order_number: record.order_number || record.orderNumber || record.assignment_order || record.assignmentOrder || '',
        assignment_order: record.assignment_order || record.assignmentOrder || record.order_number || record.orderNumber || '',
        order_date: record.order_date || record.orderDate || record.assignment_date || record.assignmentDate || new Date().toISOString().split('T')[0],
        assignment_date: record.assignment_date || record.assignmentDate || record.order_date || record.orderDate || new Date().toISOString().split('T')[0],
        action_type: record.action_type || record.actionType || record.assignment_type || record.assignmentType || 'تكليف',
        assignment_type: record.assignment_type || record.assignmentType || record.action_type || record.actionType || 'تكليف',
        primary_responsibility: record.primary_responsibility || record.primaryResponsibility || record.responsibility || employee?.primary_responsibility || 'بلا مسؤولية',
        acting_responsibility: record.acting_responsibility || record.actingResponsibility || employee?.acting_responsibility || 'بلا وكالة',
        deputy_level: record.deputy_level || record.deputyLevel || employee?.deputy_level || 'لا يوجد',
        job_title: record.job_title || record.jobTitle || employee?.job_title || '',
        department: record.department || employee?.department || '',
        section: record.section || employee?.section || '',
        service_type: record.service_type || record.serviceType || employee?.service_type || 'دائم',
        notes: record.notes || ''
      };
    } else if (type === 'promotion') {
      editValues = {
        promotion_date: record.promotion_date || record.promotionDate || '',
        promotion_order: record.promotion_order || record.promotionOrder || '',
        grade: record.grade || 1,
        step: record.step || 1,
        notes: record.notes || ''
      };
    } else if (type === 'evaluation') {
      editValues = {
        year: record.year || new Date().getFullYear(),
        score: record.score || 85,
        grade: record.grade || 'جيد جداً',
        evaluator: record.evaluator || '',
        status: record.status || 'معتمد'
      };
    } else if (type === 'training_course') {
      editValues = {
        course_name: record.course_name || record.courseName || '',
        start_date: record.start_date || record.startDate || '',
        end_date: record.end_date || record.endDate || '',
        institution: record.institution || '',
        order_number: record.order_number || record.orderNumber || '',
        result: record.result || 'اجتاز'
      };
    } else if (type === 'transfer') {
      editValues = {
        transfer_date: record.transfer_date || record.transferDate || '',
        transfer_order: record.transfer_order || record.transferOrder || '',
        from_department: record.from_department || record.fromDepartment || '',
        to_department: record.to_department || record.toDepartment || '',
        transfer_type: record.transfer_type || record.transferType || 'نقل دائم'
      };
    } else if (type === 'retirement') {
      editValues = {
        retirement_date: record.retirement_date || record.retirementDate || '',
        retirement_order: record.retirement_order || record.retirementOrder || '',
        retirement_reason: record.retirement_reason || record.retirementReason || 'بلوغ السن القانوني',
        pension_amount: record.pension_amount || record.pensionAmount || 0,
        status: record.status || 'مكتمل'
      };
    } else if (type === 'document') {
      editValues = {
        document_name: record.document_name || record.documentName || '',
        document_type: record.document_type || record.documentType || 'أمر إداري',
        issue_date: record.issue_date || record.issueDate || '',
        issue_authority: record.issue_authority || record.issueAuthority || '',
        file_path: record.file_path || record.filePath || '',
        notes: record.notes || ''
      };
    } else if (type === 'service_record') {
      editValues = {
        record_type: record.record_type || record.recordType || 'خدمة محتسبة',
        order_number: record.order_number || record.orderNumber || '',
        order_date: record.order_date || record.orderDate || new Date().toISOString().split('T')[0],
        years: record.years !== undefined ? record.years : 1,
        months: record.months !== undefined ? record.months : 0,
        days: record.days !== undefined ? record.days : 0,
        purpose: record.purpose || 'promotion_allowance_pension',
        reason: record.reason || '',
        notes: record.notes || ''
      };
    } else if (type === 'appreciation') {
      editValues = {
        order_number: record.order_number || record.orderNumber || '',
        order_date: record.order_date || record.orderDate || '',
        issuer: record.issuer || 'السيد المدير العام',
        reason: record.reason || '',
        seniority_impact: record.seniority_impact || record.seniorityImpact || 'قدم شهر واحد',
        notes: record.notes || ''
      };
    } else if (type === 'penalty') {
      editValues = {
        penalty_type: record.penalty_type || record.penaltyType || 'إنذار خطي',
        penalty_date: record.penalty_date || record.penaltyDate || '',
        order_number: record.order_number || record.orderNumber || '',
        reason: record.reason || '',
        status: record.status || 'نافذ'
      };
    }
    setModalForm(editValues);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const payload = { ...modalForm, employee_id: parseInt(id) };
      
      if (activeModal === 'allowance') {
        let createdPreset = null;
        try {
          createdPreset = await apiClient.entities.AllowanceDeduction.create({
            name: modalForm.name,
            type: modalForm.type, // 'allowance' or 'deduction'
            calcType: modalForm.calcType, // 'percentage' or 'flat'
            calc_type: modalForm.calcType,
            value: parseInt(modalForm.value) || 0,
            status: 'فعال'
          });
        } catch (eErr) {
          console.warn('Could not create AllowanceDeduction entity:', eErr);
        }

        const presetId = createdPreset?.id || Date.now();

        // 1. Save preset to ALLOWANCES_DEDUCTIONS_PRESETS in localStorage
        let presets = [];
        try {
          const saved = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
          if (saved) presets = JSON.parse(saved);
        } catch (errPreset) {}

        const newPreset = {
          id: presetId,
          name: modalForm.name,
          type: modalForm.type, // 'allowance' or 'deduction'
          calcType: modalForm.calcType, // 'percentage' or 'flat'
          calc_type: modalForm.calcType,
          value: parseInt(modalForm.value) || 0,
          status: 'فعال'
        };
        const existingIdx = presets.findIndex(p => p.id === presetId);
        if (existingIdx >= 0) presets[existingIdx] = newPreset;
        else presets.push(newPreset);

        localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(presets));

        // 2. Save metadata to TEMPORARY_META_${presetId} in localStorage
        const tempMeta = {
          isTemporary: true,
          timingType: modalForm.timingType,
          paymentYear: parseInt(modalForm.paymentYear) || new Date().getFullYear(),
          paymentMonth: parseInt(modalForm.paymentMonth) || (new Date().getMonth() + 1),
          startYear: parseInt(modalForm.startYear) || new Date().getFullYear(),
          startMonth: parseInt(modalForm.startMonth) || (new Date().getMonth() + 1),
          endYear: parseInt(modalForm.endYear) || new Date().getFullYear(),
          endMonth: parseInt(modalForm.endMonth) || (new Date().getMonth() + 1),
          beneficiaryType: 'direct',
          directEmployeeIds: [parseInt(id)]
        };
        localStorage.setItem(`TEMPORARY_META_${presetId}`, JSON.stringify(tempMeta));

        // 3. Save to database table salary_allowances for database list persistence
        const dbPayload = {
          employee_id: parseInt(id),
          allowance_type: modalForm.name,
          percentage: modalForm.calcType === 'percentage' ? parseInt(modalForm.value) : 0,
          amount: modalForm.calcType === 'flat' ? parseInt(modalForm.value) : 0,
          order_number: modalForm.order_number,
          status: 'مستمر'
        };
        await apiClient.entities.SalaryAllowance.create(dbPayload);

        notifySettingsChanged('allowances_deductions');

        toast({ title: 'تم إضافة المخصص/الاستقطاع المؤقت', description: 'تم حفظ المخصص المؤقت للموظف بنجاح وجاري تطبيقه في احتساب الراتب' });
        setActiveModal(null);
        setEditingRecordId(null);
        fetchData();
        return;
      }

      // Map entity names to match API client definitions
      let clientName = '';
      if (activeModal === 'qualification') {
        clientName = 'Qualification';
        const ord = modalForm.evaluation_order || modalForm.equation_number || modalForm.education_order || '';
        payload.level = modalForm.education_level;
        payload.education_level = modalForm.education_level;
        payload.specialization = modalForm.specialization;
        payload.university = modalForm.institution;
        payload.institution = modalForm.institution;
        payload.graduationYear = parseInt(modalForm.graduation_year) || 0;
        payload.graduation_year = parseInt(modalForm.graduation_year) || 0;
        payload.equationNumber = ord;
        payload.equation_number = ord;
        payload.evaluationOrder = ord;
        payload.evaluation_order = ord;
        payload.educationOrder = ord;
        payload.education_order = ord;
      }
      else if (activeModal === 'assignment') {
        clientName = 'JobAssignment';
        const orderNum = modalForm.order_number || modalForm.assignment_order || '';
        const orderDt = modalForm.order_date || modalForm.assignment_date || new Date().toISOString().split('T')[0];
        const actionType = modalForm.action_type || 'تكليف';

        payload.order_number = orderNum;
        payload.assignment_order = orderNum;
        payload.order_date = orderDt;
        payload.assignment_date = orderDt;
        payload.action_type = actionType;
        payload.assignment_type = actionType;
        payload.primary_responsibility = modalForm.primary_responsibility || 'بلا مسؤولية';
        payload.acting_responsibility = modalForm.acting_responsibility || 'بلا وكالة';
        payload.deputy_level = modalForm.deputy_level || 'لا يوجد';
        payload.responsibility = modalForm.primary_responsibility || 'بلا مسؤولية';
        payload.job_title = modalForm.job_title || employee?.job_title || 'غير محدد';
        payload.department = modalForm.department || employee?.department || 'غير محدد';
        payload.section = modalForm.section || employee?.section || 'غير محدد';
        payload.service_type = modalForm.service_type || employee?.service_type || 'دائم';

        // Update central employee record to reflect changes immediately
        const empUpdate = {
          primary_responsibility: modalForm.primary_responsibility || 'بلا مسؤولية',
          acting_responsibility: modalForm.acting_responsibility || 'بلا وكالة',
          deputy_level: modalForm.deputy_level || 'لا يوجد',
          job_responsibility: modalForm.primary_responsibility || 'بلا مسؤولية',
        };
        if (modalForm.job_title) empUpdate.job_title = modalForm.job_title;
        if (modalForm.department) empUpdate.department = modalForm.department;
        if (modalForm.section) empUpdate.section = modalForm.section;
        if (modalForm.service_type) empUpdate.service_type = modalForm.service_type;

        try {
          await apiClient.entities.Employee.update(employee.id, empUpdate);
        } catch (eErr) {
          console.warn('Could not update employee central fields:', eErr);
        }
      }
      else if (activeModal === 'promotion') clientName = 'PromotionIncrement';
      else if (activeModal === 'evaluation') clientName = 'AnnualEvaluation';
      else if (activeModal === 'training_course') clientName = 'TrainingCourse';
      else if (activeModal === 'transfer') clientName = 'Transfer';
      else if (activeModal === 'retirement') clientName = 'Retirement';
      else if (activeModal === 'document') clientName = 'Document';
      else if (activeModal === 'service_record') clientName = 'ServiceRecord';
      else if (activeModal === 'appreciation') clientName = 'Appreciation';
      else if (activeModal === 'penalty') clientName = 'Penalty';

      if (!clientName) {
        setModalSaving(false);
        return;
      }

      let createdOrUpdated = null;
      if (editingRecordId) {
        createdOrUpdated = await apiClient.entities[clientName].update(editingRecordId, payload);
        toast({ title: 'تم تحديث السجل بنجاح', description: 'تم حفظ التعديلات على السجل في قاعدة البيانات بنجاح' });
      } else {
        createdOrUpdated = await apiClient.entities[clientName].create(payload);
        toast({ title: 'تم حفظ السجل', description: 'تمت إضافة السجل إلى قاعدة البيانات بنجاح' });
      }

      // Optimistic local state update for instant UI feedback
      const finalItem = createdOrUpdated || { ...payload, id: editingRecordId || Date.now() };
      if (activeModal === 'assignment') {
        if (editingRecordId) {
          setJobAssignments(prev => prev.map(ja => (String(ja.id) === String(editingRecordId) ? { ...ja, ...finalItem } : ja)));
        } else {
          setJobAssignments(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'qualification') {
        if (editingRecordId) {
          setQualifications(prev => prev.map(q => (String(q.id) === String(editingRecordId) ? { ...q, ...finalItem } : q)));
        } else {
          setQualifications(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'promotion') {
        if (editingRecordId) {
          setPromotions(prev => prev.map(p => (String(p.id) === String(editingRecordId) ? { ...p, ...finalItem } : p)));
        } else {
          setPromotions(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'evaluation') {
        if (editingRecordId) {
          setEvaluations(prev => prev.map(ev => (String(ev.id) === String(editingRecordId) ? { ...ev, ...finalItem } : ev)));
        } else {
          setEvaluations(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'training_course') {
        if (editingRecordId) {
          setTrainingCourses(prev => prev.map(tc => (String(tc.id) === String(editingRecordId) ? { ...tc, ...finalItem } : tc)));
        } else {
          setTrainingCourses(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'transfer') {
        if (editingRecordId) {
          setTransfers(prev => prev.map(tr => (String(tr.id) === String(editingRecordId) ? { ...tr, ...finalItem } : tr)));
        } else {
          setTransfers(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'retirement') {
        if (editingRecordId) {
          setRetirements(prev => prev.map(r => (String(r.id) === String(editingRecordId) ? { ...r, ...finalItem } : r)));
        } else {
          setRetirements(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'document') {
        if (editingRecordId) {
          setDocuments(prev => prev.map(d => (String(d.id) === String(editingRecordId) ? { ...d, ...finalItem } : d)));
        } else {
          setDocuments(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'service_record') {
        if (editingRecordId) {
          setServiceRecords(prev => prev.map(s => (String(s.id) === String(editingRecordId) ? { ...s, ...finalItem } : s)));
        } else {
          setServiceRecords(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'appreciation') {
        if (editingRecordId) {
          setAppreciations(prev => prev.map(a => (String(a.id) === String(editingRecordId) ? { ...a, ...finalItem } : a)));
        } else {
          setAppreciations(prev => [finalItem, ...prev]);
        }
      } else if (activeModal === 'penalty') {
        if (editingRecordId) {
          setPenalties(prev => prev.map(p => (String(p.id) === String(editingRecordId) ? { ...p, ...finalItem } : p)));
        } else {
          setPenalties(prev => [finalItem, ...prev]);
        }
      }
      
      setActiveModal(null);
      setEditingRecordId(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'فشلت العملية', description: 'حدث خطأ أثناء حفظ البيانات', variant: 'destructive' });
    } finally {
      setModalSaving(false);
    }
  };

  const toggleQualification = async (qualId, currentActive) => {
    try {
      const updated = await apiClient.entities.Qualification.toggle(qualId);
      
      const newStatusText = updated.is_active ? 'تفعيل' : 'تعطيل';
      toast({
        title: `تم ${newStatusText} الشهادة بنجاح`,
        description: updated.is_active 
          ? 'تم اعتماد الشهادة المضافة واحتساب مخصصات الراتب بناءً عليها تلقائياً.' 
          : 'تم تعطيل الشهادة والعودة إلى الشهادة السابقة الفعالة وتحديث مخصصات الراتب تلقائياً.',
      });
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'خطأ', description: 'تعذر تغيير حالة الشهادة: ' + (err.message || ''), variant: 'destructive' });
    }
  };

  const deleteRecord = (clientName, recordId, presetId = null) => {
    setDeleteDialog({ open: true, clientName, recordId, presetId });
  };

  const executeDeleteRecord = async () => {
    if (!deleteDialog.recordId && deleteDialog.clientName !== 'SalaryAllowance') return;
    setDeleting(true);
    try {
      const { clientName, recordId, presetId } = deleteDialog;

      // Optimistically remove from state immediately
      if (clientName === 'JobAssignment') {
        setJobAssignments(prev => prev.filter(ja => String(ja.id) !== String(recordId)));
      } else if (clientName === 'Qualification') {
        setQualifications(prev => prev.filter(q => String(q.id) !== String(recordId)));
      } else if (clientName === 'PromotionIncrement') {
        setPromotions(prev => prev.filter(p => String(p.id) !== String(recordId)));
      } else if (clientName === 'AnnualEvaluation') {
        setEvaluations(prev => prev.filter(ev => String(ev.id) !== String(recordId)));
      } else if (clientName === 'TrainingCourse') {
        setTrainingCourses(prev => prev.filter(tc => String(tc.id) !== String(recordId)));
      } else if (clientName === 'Transfer') {
        setTransfers(prev => prev.filter(tr => String(tr.id) !== String(recordId)));
      } else if (clientName === 'Retirement') {
        setRetirements(prev => prev.filter(r => String(r.id) !== String(recordId)));
      } else if (clientName === 'Document') {
        setDocuments(prev => prev.filter(d => String(d.id) !== String(recordId)));
      } else if (clientName === 'ServiceRecord') {
        setServiceRecords(prev => prev.filter(s => String(s.id) !== String(recordId)));
      } else if (clientName === 'Appreciation') {
        setAppreciations(prev => prev.filter(a => String(a.id) !== String(recordId)));
      } else if (clientName === 'Penalty') {
        setPenalties(prev => prev.filter(p => String(p.id) !== String(recordId)));
      }

      if (clientName === 'SalaryAllowance') {
        // If numeric ID, delete from DB table
        if (typeof recordId === 'number') {
          try {
            await apiClient.entities.SalaryAllowance.delete(recordId);
          } catch (e) {}
        } else if (typeof recordId === 'string' && recordId.startsWith('db_')) {
          const num = parseInt(recordId.replace('db_', ''));
          if (num) {
            try {
              await apiClient.entities.SalaryAllowance.delete(num);
            } catch (e) {}
          }
        }

        // Find or block preset for this employee
        const activePresetId = presetId || (typeof recordId === 'string' && recordId.startsWith('preset_') ? recordId.replace('preset_', '') : null);
        if (activePresetId) {
          try {
            let rule = { blockedEmployees: [] };
            const saved = localStorage.getItem(`ALLOWANCE_RULES_${activePresetId}`);
            if (saved) rule = JSON.parse(saved);
            if (!rule.blockedEmployees) rule.blockedEmployees = [];
            if (!rule.blockedEmployees.map(String).includes(String(employee.id))) {
              rule.blockedEmployees.push(employee.id);
            }
            localStorage.setItem(`ALLOWANCE_RULES_${activePresetId}`, JSON.stringify(rule));
          } catch (errBlock) {
            console.error('Error blocking preset for employee:', errBlock);
          }
        }

        toast({ title: 'تمت إزالة البند المالي', description: 'تم استثناء الموظف من هذا المخصص/الاستقطاع بنجاح' });
      } else {
        await apiClient.entities[clientName].delete(recordId);
        toast({ title: 'تم الحذف بنجاح', description: 'تم إزالة السجل من قاعدة البيانات بنجاح' });
      }

      setDeleteDialog({ open: false, clientName: '', recordId: null, presetId: null });
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'فشلت العملية', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setModalForm(prev => ({ ...prev, file_path: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl p-5 shadow-xs border border-slate-100">
        <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-right">
          <div className="relative">
            {employee.photo ? (
              <img src={employee.photo} alt={employee.full_name} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shadow-xs" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B3A6B] to-[#122748] flex items-center justify-center text-white text-2xl font-black shadow-xs">
                {employee.full_name?.charAt(0)}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 bg-amber-500 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-white shadow-xs">ID</span>
          </div>
          <div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <h1 className="text-xl font-bold text-[#1B3A6B]">{employee.full_name} {employee.surname}</h1>
              <span className="text-slate-300 hidden md:inline">|</span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">رقم الشركة: {employee.company_number || 'بدون'}</span>
            </div>
            <p className="text-slate-500 text-xs font-medium mt-0.5">
              {employee.job_title || 'بدون عنوان وظيفي'} &bull; {employee.section || employee.department || 'الدائرة العامة'} &bull; موقع العمل: {employee.work_location || 'غير محدد'}
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-1.5 mt-1.5">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shadow-2xs ${
                employee.status === 'مستمر' ? 'bg-green-100 text-green-700' :
                employee.status === 'مجاز' ? 'bg-orange-100 text-orange-700' :
                employee.status === 'موقوف' ? 'bg-red-100 text-red-700' :
                employee.status === 'متقاعد' || employee.status === 'مستقيل' ? 'bg-rose-100 text-rose-700' :
                'bg-blue-100 text-blue-700'
              }`}>حالة الموظف: {employee.status || 'مستمر'}</span>
              <span className="bg-[#1B3A6B]/10 text-[#1B3A6B] px-2.5 py-0.5 rounded-full text-[11px] font-bold">{employee.grade >= 11 ? getGradeLabel(employee.grade) : `الدرجة ${getGradeLabel(employee.grade)}`} / م{employee.step}</span>
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[11px] font-bold">الرقم الوظيفي: {employee.civil_service_number || 'غير متوفر'}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center items-center flex-wrap gap-2">
          <Button
            onClick={() => setShowQRModal(true)}
            variant="outline"
            size="sm"
            className="rounded-xl gap-1.5 border-amber-500 text-amber-900 bg-amber-50/50 hover:bg-amber-100 font-bold px-3 shadow-2xs text-xs"
          >
            <QrCode size={14} className="text-amber-600" /> رمز الوصول السريع
          </Button>
          <Link to={`/employees/${id}/edit`}>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5 border-[#1B3A6B] text-[#1B3A6B] font-bold px-4 text-xs">
              <Edit size={14} /> تعديل الملف الأساسي
            </Button>
          </Link>
        </div>
      </div>

      {/* Executive 6 Comprehensive Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        
        {/* 1. البيانات الشخصية والهوية */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                <User size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">البيانات الشخصية والهوية</h4>
            </div>
            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
              ملف الهوية
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            {/* 1. الاسم الكامل */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1.5 px-2 rounded-lg bg-indigo-50/60 border border-indigo-100/70 gap-1">
              <span className="text-slate-600 font-bold shrink-0">الاسم الكامل:</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words leading-relaxed">
                {[employee.first_name, employee.father_name, employee.grandfather_name, employee.great_grandfather_name, employee.surname].filter(Boolean).join(' ') || employee.full_name}
              </span>
            </div>

            {/* 2. رقم الشركة / الرقم الوظيفي */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">رقم الشركة / الرقم الوظيفي:</span>
              <span className="font-mono font-bold text-indigo-900 text-right break-words">
                {employee.company_number || 'بدون'} / {employee.civil_service_number || 'بدون'}
              </span>
            </div>

            {/* 3. الرقم الوطني / بطاقة السكن */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الرقم الوطني / بطاقة السكن:</span>
              <span className="font-mono font-bold text-slate-800 text-right break-words">
                {employee.national_id || 'غير متوفر'} {employee.residence_card ? `(سكن: ${employee.residence_card})` : ''}
              </span>
            </div>

            {/* 4. المواليد ومحل الولادة */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">المواليد ومحل الولادة:</span>
              <span className="font-bold text-slate-800 text-right break-words">
                {employee.birth_date || '—'} {employeeAge ? `(${employeeAge} سنة)` : ''} {employee.birth_place ? `• ${employee.birth_place}` : ''}
              </span>
            </div>

            {/* 5. الهاتف ومكان السكن */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">رقم الهاتف وعنوان السكن:</span>
              <span className="font-bold text-slate-700 text-right break-words leading-relaxed">
                {employee.phone || 'بدون هاتف'} &bull; {employee.address || 'غير محدد'}
              </span>
            </div>

            {/* 6. الحالة الاجتماعية */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الحالة الاجتماعية:</span>
              <span className="font-bold text-slate-700 text-right break-words">
                {employee.marital_status || 'أعزب'}
              </span>
            </div>

            {/* 7. اسم الزوجة / الزوجات */}
            {(employee.marital_status === 'متزوج' || parsedSpouses.length > 0) && (
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
                <span className="text-slate-500 font-medium shrink-0">
                  {parsedSpouses.length > 1 ? 'أسماء الزوجات:' : 'اسم الزوجة:'}
                </span>
                <span className="font-bold text-slate-800 text-right break-words">
                  {parsedSpouses.length > 0 ? parsedSpouses.join('، ') : (employee.spouse_names || 'غير مسجل')}
                </span>
              </div>
            )}

            {/* 8. الأطفال والمعالين وتفاصيلهم */}
            {(employee.children_count > 0 || parsedChildren.length > 0) && (
              <div className="py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">
                    الأطفال والمعالين:
                  </span>
                  <span className="font-bold text-slate-800 font-mono text-[11px]">
                    {employee.children_count || parsedChildren.length} أولاد
                  </span>
                </div>
                {parsedChildren.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {parsedChildren.map((ch, idx) => {
                      const childAge = calculateChildAge(ch.birth_date);
                      return (
                        <span key={idx} className="inline-flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 transition-colors px-2 py-0.5 rounded-md border border-slate-200/90 text-[11px]">
                          <span className="font-bold text-slate-800">{ch.name || `طفل ${idx + 1}`}</span>
                          {ch.gender && (
                            <span className="text-[9px] px-1 rounded font-semibold bg-white border border-slate-200 text-slate-700">
                              {ch.gender}
                            </span>
                          )}
                          {childAge && (
                            <span className="text-[10px] font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200/70">
                              {childAge}
                            </span>
                          )}
                          {ch.birth_date && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({ch.birth_date})
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2. البيانات الوظيفية والإدارية */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#1B3A6B] flex items-center justify-center font-bold">
                <Briefcase size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">البيانات الوظيفية والإدارية</h4>
            </div>
            <span className="text-[10px] font-bold text-[#1B3A6B] bg-blue-50 px-2 py-0.5 rounded-md">
              {employee.status || 'مستمر بالخدمة'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            {/* 1. العنوان الوظيفي */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1.5 px-2 rounded-lg bg-blue-50/60 border border-blue-100/70 gap-1">
              <span className="text-slate-600 font-bold shrink-0">العنوان الوظيفي:</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words">{employee.job_title || 'غير محدد'}</span>
            </div>

            {/* 2. الدرجة والمرحلة (أسفل العنوان الوظيفي مباشرة) */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg bg-slate-50/80 border border-slate-200/60 gap-1">
              <span className="text-slate-600 font-semibold shrink-0">الدرجة والمرحلة الوظيفية:</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words">
                {employee.grade >= 11 ? getGradeLabel(employee.grade) : `الدرجة ${getGradeLabel(employee.grade)}`} / المرحلة {employee.step}
              </span>
            </div>

            {/* 3. الجهة والموقع */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الجهة والموقع:</span>
              <span className="font-bold text-slate-800 text-right break-words leading-relaxed">
                {employee.section || employee.department || 'الدائرة العامة'} &bull; {employee.work_location || 'المقر الرئيسي'}
              </span>
            </div>

            {/* 4. المسؤولية والتكليف الإداري */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">المسؤولية الإدارية:</span>
              <span className="font-bold text-amber-800 text-right break-words">
                {employee.primary_responsibility || 'بلا مسؤولية'} {employee.acting_responsibility && employee.acting_responsibility !== 'بلا وكالة' ? `(${employee.acting_responsibility})` : ''}
              </span>
            </div>

            {/* 5. طبيعة الدوام ونوع الخدمة */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الدوام ونوع الخدمة:</span>
              <span className="font-bold text-slate-700 text-right break-words">
                {employee.work_shift_type || 'صباحي'} &bull; ملاك {employee.service_type || 'دائم'}
              </span>
            </div>

            {/* 6. تاريخ المباشرة الأولى (أسفل القائمة) */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">تاريخ المباشرة الأولى:</span>
              <span className="font-bold text-slate-700 text-right break-words">
                {employee.first_appointment_date || employee.appointment_date || '—'} {employee.appointment_order ? `(أمر: ${employee.appointment_order})` : ''}
              </span>
            </div>

            {/* 7. تاريخ المباشرة في القطاع النفطي (أسفل تاريخ المباشرة الأولى) */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">تاريخ المباشرة في القطاع النفطي:</span>
              <span className="font-bold text-amber-800 text-right break-words">
                {employee.oil_sector_start_date || 'غير محدد'}
              </span>
            </div>

            {/* 8. تاريخ المباشرة في هذه الشركة (أسفل تاريخ القطاع النفطي) */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">تاريخ المباشرة في هذه الشركة:</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words">
                {employee.current_appointment_date || 'غير محدد'}
              </span>
            </div>
          </div>
        </div>

        {/* 3. المؤهلات الدراسية والشهادات */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
                <GraduationCap size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">المؤهلات الدراسية والشهادات</h4>
            </div>
            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
              {qualifications.length > 0 ? `${qualifications.length} مؤهل مسجل` : 'المؤهل المعتمد'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            {/* 1. الشهادة المعتمدة */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1.5 px-2 rounded-lg bg-purple-50/60 border border-purple-100/70 gap-1">
              <span className="text-slate-600 font-bold shrink-0">الشهادة المعتمدة:</span>
              <span className="font-bold text-purple-900 text-right break-words">
                {activeQualification?.education_level || activeQualification?.educationLevel || employee.education_level || 'غير محدد'}
              </span>
            </div>

            {/* 2. التخصص الدقيق */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">التخصص الدقيق:</span>
              <span className="font-bold text-slate-800 text-right break-words leading-relaxed">
                {activeQualification?.specialization || employee.specialization || 'غير محدد'}
              </span>
            </div>

            {/* 3. الجامعة / جهة التخرج */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الجامعة / جهة التخرج:</span>
              <span className="font-bold text-slate-700 text-right break-words leading-relaxed">
                {activeQualification?.university || activeQualification?.institution || employee.university || 'غير محدد'}
              </span>
            </div>

            {/* 4. سنة التخرج (سنة التخرج فقط من قاعدة البيانات) */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">سنة التخرج:</span>
              <span className="font-bold text-slate-700 text-right break-words">
                {activeQualification?.graduation_year || employee.graduation_year || '—'}
              </span>
            </div>

            {/* 5. أمر الاحتساب / المعادلة */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">أمر الاحتساب / المعادلة:</span>
              <span className="font-bold text-slate-700 text-right font-mono break-words leading-relaxed">
                {qualificationOrderDisplay || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* 4. سجل مدد واحتساب الخدمة */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Clock size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">سجل مدد واحتساب الخدمة</h4>
            </div>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
              قانون الخدمة والتقاعد
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg bg-emerald-50/70 border border-emerald-100/80 gap-1">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5 shrink-0">
                <ShieldCheck size={13} className="text-emerald-600 shrink-0" />
                الخدمة الكلية المعتمدة:
              </span>
              <span className="font-black text-emerald-800 text-xs text-right break-words">{totalServiceDuration}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الخدمة في القطاع النفطي:</span>
              <span className="font-bold text-amber-800 text-right break-words">{oilSectorServiceDuration}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الخدمة في هذه الشركة:</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words">{companyServiceDuration}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الخدمة المضافة:</span>
              <span className="font-bold text-amber-600 text-right break-words">
                {hasAddedService ? formatDurationParts(totalAddedYears, totalAddedMonths, totalAddedDays) : '٠ يوم (لا يوجد)'}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">التمديد التقاعدي:</span>
              <span className="font-bold text-purple-700 text-right break-words">
                {hasExtensionService ? formatDurationParts(finalExtYears, finalExtMonths, finalExtDays) : '٠ يوم (لا يوجد)'}
              </span>
            </div>
          </div>
        </div>

        {/* 5. الاستحقاق المالي وسلّم الرواتب */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <DollarSign size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">الاستحقاق المالي وحساب الراتب</h4>
            </div>
            <Link to="/salaries" className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
              مسير الرواتب &larr;
            </Link>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-2xs gap-1">
              <span className="font-bold flex items-center gap-1.5 shrink-0">
                <DollarSign size={13} className="text-emerald-200 shrink-0" />
                صافي الراتب المستحق:
              </span>
              <span className="font-black text-sm text-right break-words">{formatCurrency(displayedNetSalary)}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">الراتب الاسمي (الأساسي):</span>
              <span className="font-bold text-[#1B3A6B] text-right break-words">{formatCurrency(salaryCalc.base_salary)}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">إجمالي المخصصات المستمرة:</span>
              <span className="font-bold text-blue-600 text-right break-words">+{formatCurrency(displayedTotalAllowances)}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">إجمالي الاستقطاعات الشهرية:</span>
              <span className="font-bold text-rose-600 text-right break-words">-{formatCurrency(displayedTotalDeductions)}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors gap-1">
              <span className="text-slate-500 font-medium shrink-0">التسكين المالي لسلم 2023:</span>
              <span className="font-bold text-slate-700 text-right break-words">الدرجة {getGradeLabel(employee.grade)} / م{employee.step}</span>
            </div>
          </div>
        </div>

        {/* 6. أرصدة الإجازات والحالة المهنية */}
        <div className="bg-white rounded-2xl p-4 border border-slate-100/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-start">
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
                <ClipboardList size={15} />
              </span>
              <h4 className="font-bold text-xs text-[#1B3A6B]">الأرصدة والسجل الوظيفي</h4>
            </div>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              السنة الحالية {new Date().getFullYear()}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100/70">
              <p className="text-[10px] font-bold text-emerald-800 mb-0.5">الإجازات الاعتيادية</p>
              <p className="text-base font-black text-emerald-700 break-words">{regularLeaveBalance} <span className="text-[10px] font-bold text-emerald-600">يوم</span></p>
            </div>

            <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-100/70">
              <p className="text-[10px] font-bold text-rose-800 mb-0.5">الإجازات المرضية</p>
              <p className="text-base font-black text-rose-600 break-words">{sickLeaveBalance} <span className="text-[10px] font-bold text-rose-500">يوم</span></p>
            </div>

            <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100/70">
              <p className="text-[10px] font-bold text-amber-800 mb-0.5">كتب الشكر (القدم)</p>
              <p className="text-base font-black text-amber-700 break-words">{appreciations.length} <span className="text-[10px] font-bold text-amber-600">كتاب</span></p>
            </div>

            <div className={`p-2.5 rounded-xl border ${penalties.length > 0 ? 'bg-red-50/60 border-red-100/70' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-[10px] font-bold mb-0.5 ${penalties.length > 0 ? 'text-red-800' : 'text-slate-600'}`}>العقوبات الانضباطية</p>
              <p className={`text-base font-black ${penalties.length > 0 ? 'text-red-600' : 'text-slate-700'} break-words`}>
                {penalties.length > 0 ? `${penalties.length} عقوبة` : '٠ (نظيف)'}
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="personal" dir="rtl" className="w-full">
        <TabsList className="bg-white border border-slate-200 rounded-xl p-1 flex flex-wrap gap-1 h-auto overflow-x-auto justify-start">
          <TabsTrigger value="personal" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">البيانات الشخصية</TabsTrigger>
          <TabsTrigger value="job" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">البيانات الوظيفية</TabsTrigger>
          <TabsTrigger value="qualifications" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">المؤهلات الدراسية ({qualifications.length})</TabsTrigger>
          <TabsTrigger value="salary" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">مخصصات الراتب ({classifiedCustomItems.length})</TabsTrigger>
          <TabsTrigger value="promotions" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">الترقيات والعلاوات ({promotions.length})</TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">الإجازات ({leaves.length})</TabsTrigger>
          <TabsTrigger value="penalties" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">التشكرات والعقوبات ({appreciations.length + penalties.length})</TabsTrigger>
          <TabsTrigger value="evaluations" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">تقييم الأداء ({evaluations.length})</TabsTrigger>
          <TabsTrigger value="training" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">التدريب ({trainingCourses.length})</TabsTrigger>
          <TabsTrigger value="transfers" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">التنقلات ({transfers.length})</TabsTrigger>
          <TabsTrigger value="retirement" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">ملف التقاعد ({retirements.length})</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">المستندات والمرفقات ({documents.length})</TabsTrigger>
        </TabsList>

        {/* 1. Personal Tab */}
        <TabsContent value="personal" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#1B3A6B]">البيانات الشخصية والهوية</h3>
              <p className="text-xs text-slate-400 mt-0.5">المعلومات الأساسية وبيانات التعريف والاتصال بالموظف</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. معلومات الهوية الأساسية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">معلومات الهوية الأساسية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الاسم الأول" value={employee.first_name || (employee.full_name?.split(/\s+/)[0]) || '—'} />
                  <InfoRow label="اسم الأب" value={employee.father_name || (employee.full_name?.split(/\s+/)[1]) || '—'} />
                  <InfoRow label="اسم الجد" value={employee.grandfather_name || (employee.full_name?.split(/\s+/)[2]) || '—'} />
                  <InfoRow label="اسم والد الجد (الاسم الرابع)" value={employee.great_grandfather_name || (employee.full_name?.split(/\s+/).slice(3).join(' ')) || '—'} />
                  <InfoRow label="اللقب" value={employee.surname || '—'} />
                  <div className="bg-blue-50/60 border border-blue-200/70 rounded-xl px-3 py-2 my-2 flex justify-between items-center text-xs">
                    <span className="text-blue-900 font-semibold">الاسم الكامل المعتمد:</span>
                    <span className="font-bold text-[#1B3A6B]">{[employee.first_name, employee.father_name, employee.grandfather_name, employee.great_grandfather_name, employee.surname].filter(Boolean).join(' ') || employee.full_name}</span>
                  </div>
                  <InfoRow label="الرقم الوظيفي (التخطيط)" value={employee.civil_service_number || '—'} />
                  <InfoRow label="رقم الشركة الموحد" value={employee.company_number || '—'} />
                </div>
              </div>

              {/* 2. المعلومات الحيوية والاجتماعية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">المعلومات الحيوية والاجتماعية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الجنس" value={employee.gender || 'ذكر'} />
                  <InfoRow label="تاريخ الميلاد" value={employee.birth_date || '—'} />
                  <InfoRow label="محل الميلاد" value={employee.birth_place || '—'} />
                  <InfoRow label="الجنسية" value={employee.nationality || 'عراقي'} />
                  <InfoRow label="القومية" value={employee.ethnicity || 'عربي/ة'} />
                  <InfoRow label="الديانة" value={employee.religion || 'مسلم'} />
                  <InfoRow label="فصيلة الدم" value={employee.blood_type || 'غير معروف'} />
                  <InfoRow label="الحالة الاجتماعية" value={employee.marital_status || 'أعزب'} />
                  {(employee.marital_status === 'متزوج' || parsedSpouses.length > 0) && (
                    <InfoRow label="اسم الزوجة / الزوجات" value={parsedSpouses.length > 0 ? parsedSpouses.join('، ') : employee.spouse_names || '—'} />
                  )}
                  <InfoRow label="عدد الأولاد المعالين" value={employee.children_count || 0} />
                  {parsedChildren.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60 mt-2">
                      <span className="text-xs font-bold text-[#1B3A6B] block mb-1.5">بيانات وتفاصيل الأطفال المسجلين:</span>
                      <div className="space-y-1">
                        {parsedChildren.map((ch, idx) => {
                          const childAge = calculateChildAge(ch.birth_date);
                          return (
                            <div key={idx} className="flex justify-between items-center bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/70 text-xs">
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-800 text-[10px] flex items-center justify-center font-bold">{idx + 1}</span>
                                {ch.name || 'بدون اسم'}
                                {childAge && (
                                  <span className="text-[10px] font-bold text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/80">
                                    العمر: {childAge}
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-500 font-mono text-[11px]">
                                {ch.gender || 'ذكر'} {ch.birth_date ? `• ${ch.birth_date}` : ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. المستندات الثبوتية والوطنية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">المستندات الثبوتية والوطنية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="رقم البطاقة الوطنية / الهوية" value={employee.national_id || 'غير متوفر'} />
                  <InfoRow label="رقم بطاقة السكن" value={employee.residence_card || 'غير متوفر'} />
                  <InfoRow label="البطاقة التموينية" value={employee.ration_card || 'غير متوفر'} />
                  <InfoRow label="رقم جواز السفر" value={employee.passport_number || 'غير متوفر'} />
                </div>
              </div>

              {/* 4. بيانات الاتصال والصورة الشخصية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80 flex flex-col justify-between">
                <div>
                  <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                    <h4 className="font-bold text-xs text-[#1B3A6B]">بيانات الاتصال والصورة الشخصية</h4>
                  </div>
                  <div className="space-y-1">
                    <InfoRow label="عنوان السكن الكامل" value={employee.address || 'غير محدد'} />
                    <InfoRow label="رقم الهاتف" value={employee.phone || 'غير متوفر'} />
                    <InfoRow label="البريد الإلكتروني" value={employee.email || 'غير متوفر'} />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shadow-2xs shrink-0 bg-white flex items-center justify-center">
                    {employee.photo ? (
                      <img src={employee.photo} alt={employee.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-slate-400" />
                    )}
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-slate-800">الصورة الشخصية المعتمدة للموظف</p>
                    <p className="text-[11px] text-slate-400">محفوظة في قيد الموظف المركزي وملفه الرسمي</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. رمز الوصول السريع الفريد (Quick Access QR) */}
            <div className="pt-2 border-t border-slate-100">
              <EmployeeQuickAccessQR employee={employee} />
            </div>
          </div>
        </TabsContent>

        {/* 2. Job Tab */}
        <TabsContent value="job" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-[#1B3A6B]">البيانات الوظيفية والإدارية</h3>
              <p className="text-xs text-slate-400 mt-0.5">معلومات التعيين والمباشرة، السلم الوظيفي، والجهة التنظيمية</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. معلومات التعيين والمباشرة */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">معلومات التعيين والمباشرة (المعلومات الإدارية)</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="أمر التعيين (رقم الأمر الإداري)" value={employee.appointment_order || 'غير محدد'} />
                  <InfoRow label="تاريخ أمر التعيين" value={employee.appointment_date || 'غير محدد'} />
                  <InfoRow label="تاريخ المباشرة الأولى" value={employee.first_appointment_date || 'غير محدد'} />
                  <InfoRow label="تاريخ المباشرة في هذه الشركة" value={employee.current_appointment_date || 'غير محدد'} />
                  <InfoRow label="تاريخ العمل في القطاع النفطي" value={employee.oil_sector_start_date || 'غير محدد'} />
                  <InfoRow label="نوع الخدمة" value={employee.service_type || 'دائم'} />
                  <InfoRow label="حالة الموظف الحالية" value={employee.status || 'مستمر'} />
                  {employee.status && employee.status !== 'مستمر' && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-800 space-y-1">
                      <p className="font-bold border-b border-amber-200/60 pb-1 mb-1">تفاصيل تغيير الحالة إلى ({employee.status}):</p>
                      <InfoRow label="رقم الأمر الإداري للحالة" value={employee.status_order_number || 'غير محدد'} />
                      <InfoRow label="تاريخ الأمر الإداري للحالة" value={employee.status_order_date || 'غير محدد'} />
                      <InfoRow label="ملاحظات الحالة" value={employee.status_notes || 'غير محدد'} />
                    </div>
                  )}
                </div>
              </div>

              {/* 2. الموقع الوظيفي والجهة التنظيمية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">الموقع الوظيفي والجهة التنظيمية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="العنوان الوظيفي" value={employee.job_title || 'غير محدد'} />
                  <InfoRow label="جهة العمل من الهيكل التنظيمي" value={employee.section || employee.department || 'غير محدد'} />
                  <InfoRow label="موقع العمل للشركة" value={employee.work_location || 'غير محدد'} />
                  <InfoRow label="طبيعة العمل" value={employee.work_nature || 'مكتبي'} />
                </div>
              </div>

              {/* 3. نظام الدوام والمناوبات */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">نظام الدوام والمناوبات</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="نوع عمل الموظف (الدوام)" value={employee.work_shift_type || 'صباحي'} />
                  {employee.work_shift_type === 'مناوب' && (
                    <>
                      {employee.shift_system_name && (
                        <InfoRow label="نظام المناوبة المثبت" value={employee.shift_system_name} />
                      )}
                      <InfoRow label="جدول الدوام والاستراحة" value={`${employee.shift_work_days ?? 0} يوم دوام / ${employee.shift_rest_days ?? 0} يوم استراحة`} />
                    </>
                  )}
                </div>
              </div>

              {/* 4. المسؤوليات والتكاليف الإدارية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">المسؤوليات والتكاليف الإدارية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="المسؤولية الأساسية" value={employee.primary_responsibility || 'بلا مسؤولية'} />
                  <InfoRow label="المسؤولية في حالة الوكالة" value={employee.acting_responsibility || 'بلا وكالة'} />
                  <InfoRow label="تحديد درجة الوكيل" value={employee.deputy_level || 'لا يوجد'} />
                </div>
              </div>

              {/* 5. الدرجة الوظيفية (سلم رواتب 2023) */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">التسكين والدرجة الوظيفية (سلم رواتب 2023)</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الدرجة الوظيفية" value={employee.grade >= 11 ? getGradeLabel(employee.grade) : `الدرجة ${getGradeLabel(employee.grade)}`} />
                  <InfoRow label="المرحلة" value={`المرحلة ${employee.step}`} />
                  <InfoRow label="تاريخ الدرجة الحالية" value={employee.grade_date || 'غير محدد'} />
                </div>
              </div>

              {/* 6. الأرقام التعريفية والسجلات الإدارية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">الأرقام التعريفية والسجلات الإدارية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="رقم اضبارة الموظف" value={employee.service_record_number || 'غير محدد'} />
                  <InfoRow label="رقم هوية الموظف" value={employee.employee_id_number || 'غير محدد'} />
                  <InfoRow label="رقم التصريح الأمني" value={employee.security_clearance_number || 'غير متوفر'} />
                  <InfoRow label="تاريخ التصريح الأمني" value={employee.security_clearance_date || 'غير متوفر'} />
                  <InfoRow label="الدور في النظام" value={employee.role === 'hr_admin' ? 'مسؤول شؤون موظفين' : employee.role === 'manager' ? 'مدير' : 'موظف'} />
                  <InfoRow label="ملاحظات إدارية" value={employee.notes || 'لا توجد ملاحظات'} />
                </div>
              </div>

              {/* 7. أرصدة الإجازات والبيانات التراكمية (الافتتاحي والمتبقي) */}
              <div className="col-span-full bg-teal-50/40 p-5 rounded-2xl border border-teal-200/70 space-y-4">
                <div className="pb-2 border-b border-teal-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-teal-600 rounded-full" />
                    <h4 className="font-bold text-xs text-teal-900">أرصدة الإجازات والبيانات التراكمية (الافتتاحية والمتبقية)</h4>
                  </div>
                  <span className="text-[10px] bg-teal-100 text-teal-800 font-bold px-2.5 py-0.5 rounded-full border border-teal-200">
                    محدثة تلقائياً مع حركة الإجازات
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* الاعتيادية */}
                  <div className="bg-white p-4 rounded-xl border border-teal-100 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900">الإجازات الاعتيادية:</span>
                      <span className="text-xs font-extrabold text-emerald-700 font-mono">{regularLeaveBalance} يوم متبقي</span>
                    </div>
                    <div className="space-y-1 text-xs pt-1 border-t border-slate-100">
                      <InfoRow label="الرصيد الافتتاحي المثبت (المدور)" value={`${employee.initial_regular_leave_balance || 0} يوم`} />
                      <InfoRow label="الرصيد الفعلي المتاح حالياً" value={`${regularLeaveBalance} يوم`} />
                    </div>
                  </div>

                  {/* المرضية */}
                  <div className="bg-white p-4 rounded-xl border border-teal-100 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-rose-900">الإجازات المرضية:</span>
                      <span className="text-xs font-extrabold text-rose-600 font-mono">{sickLeaveBalance} يوم متبقي</span>
                    </div>
                    <div className="space-y-1 text-xs pt-1 border-t border-slate-100">
                      <InfoRow label="الرصيد الافتتاحي المثبت (براتب تام)" value={`${employee.initial_sick_leave_balance || 0} يوم`} />
                      <InfoRow label="الرصيد الفعلي المتاح حالياً" value={`${sickLeaveBalance} يوم`} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 8. احتساب الخدمة الكلية والمضافة */}
              <div className="col-span-full md:col-span-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80 space-y-3">
                <div className="pb-2 border-b border-slate-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                    <h4 className="font-bold text-xs text-[#1B3A6B]">احتساب مدة الخدمة الكلية الشاملة (السنوات/الأشهر/الأيام)</h4>
                  </div>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                    مباشرة + خدمة محتسبة
                  </span>
                </div>

                <div className="space-y-1">
                  <InfoRow label="1. الخدمة الفترية الفعلية (منذ المباشرة الأولى)" value={employee.first_appointment_date || '—'} />
                  <InfoRow label="مدة المباشرة الفترية" value={actualServiceDuration} />
                  <InfoRow 
                    label="2. إجمالي الخدمة المضافة المحتسبة بالأوامر" 
                    value={totalAddedYears > 0 || totalAddedMonths > 0 || totalAddedDays > 0 
                      ? `${totalAddedYears} سنة و ${totalAddedMonths} شهر و ${totalAddedDays} يوم` 
                      : 'لا يوجد خدمة مضافة'} 
                  />
                  <InfoRow 
                    label="السبب والمبررات / التفاصيل" 
                    value={addedServiceRecords.length > 0 
                      ? addedServiceRecords.map(r => `${r.record_type || r.recordType || 'خدمة'}${r.reason || r.notes ? `: ${r.reason || r.notes}` : ''}`).join(' • ') 
                      : 'لا توجد تفاصيل أو مبررات مسجلة'} 
                  />
                </div>

                <div className="mt-2 pt-2.5 border-t border-slate-200/60">
                  <div className="bg-emerald-50/90 border border-emerald-200/80 rounded-xl p-3 flex justify-between items-center">
                    <span className="text-xs font-bold text-emerald-950">3. إجمالي الخدمة الكلية الشاملة المعتمدة بالأنظمة:</span>
                    <span className="text-xs font-black text-emerald-800 font-mono">{totalServiceDuration}</span>
                  </div>
                </div>
              </div>

              {/* 9. احتساب خدمة القطاع النفطي والشركة */}
              <div className="col-span-full md:col-span-1 bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80 space-y-3">
                <div className="pb-2 border-b border-slate-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                    <h4 className="font-bold text-xs text-[#1B3A6B]">سجل الخدمة في القطاع النفطي والشركة</h4>
                  </div>
                  <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2.5 py-0.5 rounded-full border border-blue-200/60">
                    مدد الخدمة التخصصية
                  </span>
                </div>

                <div className="space-y-1">
                  <InfoRow label="تاريخ بدء العمل بالقطاع النفطي" value={employee.oil_sector_start_date || '—'} />
                  <InfoRow label="الخدمة بالقطاع النفطي" value={oilSectorServiceDuration} />
                  <InfoRow label="تاريخ المباشرة في هذه الشركة" value={employee.current_appointment_date || '—'} />
                  <InfoRow label="الخدمة في هذه الشركة" value={companyServiceDuration} />
                </div>

                <div className="mt-2 pt-2.5 border-t border-slate-200/60 grid grid-cols-2 gap-2">
                  <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-2.5 text-center">
                    <span className="text-[10px] font-bold text-amber-900 block mb-0.5">الخدمة بالقطاع النفطي</span>
                    <span className="text-xs font-black text-amber-800 font-mono block leading-tight">{oilSectorServiceDuration}</span>
                  </div>
                  <div className="bg-blue-50/90 border border-blue-200/80 rounded-xl p-2.5 text-center">
                    <span className="text-[10px] font-bold text-blue-900 block mb-0.5">الخدمة في هذه الشركة</span>
                    <span className="text-xs font-black text-[#1B3A6B] font-mono block leading-tight">{companyServiceDuration}</span>
                  </div>
                </div>
              </div>
            </div>



            {/* 7. سجل الأوامر الرسمية للخدمة المضافة والمحتسبة */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2">
                    <ShieldCheck className="text-emerald-600" size={18} />
                    سجل الخدمات المضافة والمحتسبة (عسكرية / عقود / ممارسة)
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الخدمة المضافة تُحسب ببطاقة وتُجمع مع الخدمة الكلية لأغراض الترقية والعلاوة والتقاعد دون التأثير على موعد التقاعد
                  </p>
                </div>
                <Button size="sm" onClick={() => openAddModal('service_record')} className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs gap-1 shadow-xs">
                  <Plus size={14} /> إضافة أمر احتساب خدمة
                </Button>
              </div>

              <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl overflow-hidden">
                <div className="p-3.5 bg-emerald-100/50 border-b border-emerald-200/60 flex flex-wrap justify-between items-center gap-2">
                  <span className="text-xs font-bold text-emerald-900">
                    إجمالي المدة المضافة: <span className="font-mono text-xs bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800">{totalAddedYears} سنة و {totalAddedMonths} شهر و {totalAddedDays} يوم</span>
                  </span>
                  <span className="text-xs font-bold text-emerald-900">
                    الخدمة المعتمدة الكلية الشاملة: <span className="font-mono text-xs bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800">{totalServiceDuration}</span>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                        <th className="text-right px-4 py-2.5 font-bold text-xs">نوع الخدمة</th>
                        <th className="text-right px-4 py-2.5 font-bold text-xs">رقم الأمر</th>
                        <th className="text-right px-4 py-2.5 font-bold text-xs">تاريخ الأمر</th>
                        <th className="text-right px-4 py-2.5 font-bold text-xs">المدة المحتسبة</th>
                        <th className="text-right px-4 py-2.5 font-bold text-xs">الغرض القانوني</th>
                        <th className="text-right px-4 py-2.5 font-bold text-xs">السبب والجهة</th>
                        <th className="text-center px-4 py-2.5 font-bold text-xs">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {addedServiceRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-white/60">
                          <td className="px-4 py-2.5 font-bold text-emerald-900 text-xs">{rec.record_type || rec.recordType}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{rec.order_number || rec.orderNumber || '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{rec.order_date || rec.orderDate || '—'}</td>
                          <td className="px-4 py-2.5 font-bold text-xs text-emerald-700">
                            {rec.years || 0} سنة و {rec.months || 0} شهر و {rec.days || 0} يوم
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${rec.purpose === 'pension_only' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                              {rec.purpose === 'pension_only' ? 'لاغراض التقاعد فقط' : 'للترقية والعلاوة والتقاعد'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{rec.reason || rec.notes || '—'}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-blue-600 hover:bg-blue-50 h-7 w-7 rounded-lg"
                                title="تعديل أمر الخدمة المحتسبة"
                                onClick={() => openEditModal('service_record', rec)}
                              >
                                <Edit size={14} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-500 hover:bg-red-50 h-7 w-7 rounded-lg"
                                title="حذف أمر الخدمة المحتسبة"
                                onClick={() => deleteRecord('ServiceRecord', rec.id)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {addedServiceRecords.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-xs">لا توجد خدمة مضافة أو محتسبة مسجلة قانونياً لهذا الموظف</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 8. تمديد الخدمة التقاعدية */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2">
                    <Calendar className="text-blue-600" size={18} />
                    تمديد الخدمة التقاعدية وتأجيل السن القانوني
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    التمديد يضيف مدة إلى السن التقاعدي المثبت ويؤخر موعد التقاعد، ويُزيل الموظف تلقائياً من قائمة المقتربين من التقاعد
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleOpenExtModal} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs gap-1 shadow-xs">
                    <Plus size={14} /> {employee.retirement_extension_years > 0 || employee.retirement_extension_months > 0 ? 'تعديل التمديد' : 'إضافة أمر تمديد'}
                  </Button>
                  {(employee.retirement_extension_years > 0 || employee.retirement_extension_months > 0) && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setExtCancelModalOpen(true)} className="border-amber-300 text-amber-700 hover:bg-amber-50 rounded-xl text-xs font-bold gap-1">
                        <Power size={13} /> إلغاء التمديد
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setExtDeleteConfirmOpen(true)} className="rounded-xl text-xs font-bold gap-1">
                        <Trash2 size={13} /> حذف التمديد
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-blue-50/30 border border-blue-100 rounded-2xl p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-xs text-slate-500 font-semibold block">السن التقاعدي المثبت (القانوني):</span>
                    <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">60 سنة</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-xs text-slate-500 font-semibold block">مدة التمديد الممنوحة بالأمر:</span>
                    <span className="text-sm font-bold text-blue-700 font-mono mt-1 block">
                      {employee.retirement_extension_years > 0 || employee.retirement_extension_months > 0
                        ? `${employee.retirement_extension_years || 0} سنة و ${employee.retirement_extension_months || 0} شهر`
                        : 'لا يوجد تمديد فعال'}
                    </span>
                    {employee.retirement_extension_order_number && (
                      <span className="text-[11px] text-slate-400 block mt-0.5">أمر رقم: {employee.retirement_extension_order_number} ({employee.retirement_extension_order_date || '—'})</span>
                    )}
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-xs text-slate-500 font-semibold block">السن التقاعدي المعدل الفعلي:</span>
                    <span className="text-sm font-black text-blue-900 font-mono mt-1 block">
                      {60 + (parseInt(employee.retirement_extension_years) || 0)} سنة 
                      {employee.retirement_extension_months > 0 ? ` و ${employee.retirement_extension_months} شهر` : ''}
                    </span>
                  </div>
                </div>

                {/* Table of Extension Records if any exist */}
                {extensionRecords.length > 0 && (
                  <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-blue-100/60 border-b border-blue-200 font-bold text-xs text-blue-950">
                      سجل أوامر تمديد الخدمة المسجلة رسمياً ({extensionRecords.length})
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 border-b border-slate-100">
                            <th className="text-right px-4 py-2 font-bold">نوع الإجراء</th>
                            <th className="text-right px-4 py-2 font-bold">رقم الأمر الإداري</th>
                            <th className="text-right px-4 py-2 font-bold">تاريخ الأمر</th>
                            <th className="text-right px-4 py-2 font-bold">المدة الممددة</th>
                            <th className="text-right px-4 py-2 font-bold">سبب ومبررات التمديد</th>
                            <th className="text-center px-4 py-2 font-bold">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {extensionRecords.map(extRec => (
                            <tr key={extRec.id} className="hover:bg-blue-50/40 transition-colors">
                              <td className="px-4 py-2 font-bold text-amber-900">{extRec.record_type || extRec.recordType || 'تمديد خدمة'}</td>
                              <td className="px-4 py-2 font-mono text-slate-700">{extRec.order_number || extRec.orderNumber || '—'}</td>
                              <td className="px-4 py-2 font-mono text-slate-600">{extRec.order_date || extRec.orderDate || '—'}</td>
                              <td className="px-4 py-2 font-bold text-amber-800">
                                {extRec.years || 0} سنة و {extRec.months || 0} شهر
                              </td>
                              <td className="px-4 py-2 text-slate-600">{extRec.reason || extRec.notes || '—'}</td>
                              <td className="px-4 py-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-blue-600 hover:bg-blue-50 h-7 w-7 rounded-lg"
                                    title="تعديل أمر تمديد الخدمة"
                                    onClick={() => openEditModal('service_record', extRec)}
                                  >
                                    <Edit size={14} />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="text-red-500 hover:bg-red-50 h-7 w-7 rounded-lg"
                                    title="حذف أمر تمديد الخدمة"
                                    onClick={() => deleteRecord('ServiceRecord', extRec.id)}
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                <div>
                  <h4 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2">
                    <span className="w-1.5 h-3.5 bg-yellow-500 rounded-full" />
                    سجل التكاليف والإعفاءات والتدوير الإداري
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">توثيق كافة الأوامر الإدارية بالمسؤوليات والتكاليف بالوكالة والأصالة</p>
                </div>
                <Button size="sm" onClick={() => openAddModal('assignment')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs gap-1 shadow-xs">
                  <Plus size={14} /> تسجيل تكليف جديد
                </Button>
              </div>
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="text-right px-4 py-2.5 font-bold text-xs">رقم وتاريخ الأمر</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">نوع الإجراء</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">المسؤولية الأساسية</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">مسؤولية الوكالة</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">درجة الوكيل</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">العنوان الوظيفي / الدائرة</th>
                      <th className="text-center px-4 py-2.5 font-bold text-xs">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobAssignments.map(ja => {
                      const action = ja.action_type || ja.actionType || ja.assignment_type || ja.assignmentType || 'تكليف';
                      const isRelief = action === 'إعفاء';
                      const isRotation = action === 'تدوير';
                      const orderNum = ja.order_number || ja.orderNumber || ja.assignment_order || ja.assignmentOrder || '—';
                      const orderDt = ja.order_date || ja.orderDate || ja.assignment_date || ja.assignmentDate || '—';
                      return (
                        <tr key={ja.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                          <td className="px-4 py-2.5 font-mono text-xs">
                            <span className="font-bold text-[#1B3A6B] block">{orderNum}</span>
                            <span className="text-slate-500 text-[11px] block mt-0.5">{orderDt}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              isRelief ? 'bg-red-100 text-red-700' : isRotation ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {action}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">
                            {ja.primary_responsibility || ja.primaryResponsibility || ja.responsibility || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 font-medium">
                            {ja.acting_responsibility || ja.actingResponsibility || 'بلا وكالة'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs">
                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                              {ja.deputy_level || ja.deputyLevel || 'لا يوجد'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 text-xs">
                            <span className="font-semibold text-slate-700 block">{ja.job_title || employee?.job_title || '—'}</span>
                            <span className="text-slate-400 block">{ja.department || ja.section || ''}</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل التكليف" onClick={() => openEditModal('assignment', ja)}>
                                <Edit size={14} />
                              </Button>
                              <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" title="حذف التكليف" onClick={() => deleteRecord('JobAssignment', ja.id)}>
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {jobAssignments.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد سجلات تكليف تاريخية مضافة</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 3. Qualifications Tab */}
        <TabsContent value="qualifications" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
            
            {/* Explanatory Banner */}
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-4 flex items-start gap-3 text-xs text-blue-900">
              <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold text-sm mb-1 text-blue-950">احتساب مخصصات الشهادة الدراسية تلقائياً:</p>
                <p className="leading-relaxed">
                  عند إضافة شهادة دراسية جديدة، تُحتسب مخصصات الشهادة بناءً على <strong>أحدث شهادة مفعلة</strong> للموظف. عند تعطيل الشهادة المضافة، يعود النظام تلقائياً للشهادة السابقة المفعلة وتحديث مخصصات الراتب بشكل فوري تلقائياً.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#1B3A6B]">التحصيل الدراسي والشهادات الحاصل عليها الموظف</h3>
                <p className="text-xs text-slate-500 mt-0.5">الشهادة الفعالة المعتمدة حالياً بالراتب: <span className="font-bold text-emerald-700">{employee.education_level || 'بدون'}</span></p>
              </div>
              <Button size="sm" onClick={() => openAddModal('qualification')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> إضافة شهادة دراسية
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">الشهادة العلمية</th>
                    <th className="text-right px-4 py-2.5 font-bold">التخصص العام والدقيق</th>
                    <th className="text-right px-4 py-2.5 font-bold">الجهة المانحة والجامعة</th>
                    <th className="text-right px-4 py-2.5 font-bold">سنة التخرج</th>
                    <th className="text-right px-4 py-2.5 font-bold">أمر احتساب الشهادة</th>
                    <th className="text-center px-4 py-2.5 font-bold">الحالة المعتمدة</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifications.map((q) => {
                    const isActiveQual = q.is_active !== false && q.isActive !== false;
                    const qualLevel = q.education_level || q.level || 'بدون';
                    const isCurrentlyCalculated = isActiveQual && (qualLevel === (employee.education_level || employee.educationLevel));

                    return (
                      <tr key={q.id} className={`border-b border-slate-50 hover:bg-slate-50/40 ${!isActiveQual ? 'bg-slate-50/60 opacity-75' : ''}`}>
                        <td className="px-4 py-3 font-bold text-[#1B3A6B]">
                          <div className="flex items-center gap-2">
                            <GraduationCap size={16} className={isActiveQual ? "text-blue-600" : "text-slate-400"} />
                            <span>{qualLevel}</span>
                            {isCurrentlyCalculated && (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1 shrink-0">
                                <CheckCircle2 size={11} /> المعتمدة بالراتب
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-semibold">{q.specialization || 'بدون تخصص'}</td>
                        <td className="px-4 py-3 text-slate-600">{q.institution || q.university || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{q.graduation_year || q.graduationYear || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 font-mono text-xs font-semibold">
                          {q.evaluation_order || q.evaluationOrder || q.equation_number || q.equationNumber || q.education_order || q.educationOrder || (isActiveQual ? (employee.education_order || employee.evaluation_order || employee.educationOrder || employee.evaluationOrder || employee.equation_number || employee.equationNumber) : null) || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isActiveQual ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <CheckCircle2 size={12} /> مفعلة
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1">
                              <XCircle size={12} /> معطلة
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-8 px-2.5 text-xs font-bold rounded-lg gap-1.5 transition-colors ${
                                isActiveQual 
                                  ? 'border-amber-200 text-amber-700 hover:bg-amber-50 hover:border-amber-300' 
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300'
                              }`}
                              onClick={() => toggleQualification(q.id, isActiveQual)}
                              title={isActiveQual ? "تعطيل الشهادة والعودة للشهادة السابقة" : "تفعيل الشهادة واحتساب مخصصاتها"}
                            >
                              <Power size={13} />
                              {isActiveQual ? 'تعطيل' : 'تفعيل'}
                            </Button>
                            <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل الشهادة" onClick={() => openEditModal('qualification', q)}>
                              <Edit size={14} />
                            </Button>
                            <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('Qualification', q.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {qualifications.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد مؤهلات تاريخية مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 4. Salary & Allowances Tab */}
        <TabsContent value="salary" className="mt-5">
          <div className="space-y-6">
            
            {/* Header with control buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-[#1B3A6B]">تفاصيل ومكونات الراتب الشهري</h3>
                <p className="text-xs text-slate-400 mt-1">توزيع الراتب الاسمي مع المخصصات المضافة وكافة الاستقطاعات المفروضة بالتفصيل</p>
              </div>
            </div>

            {/* Part 1: الراتب الاسمي الأساسي (Nominal Salary) */}
            <div className="bg-[#1B3A6B]/5 border border-[#1B3A6B]/15 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center md:text-right">
                <span className="text-[#1B3A6B] text-xs font-bold bg-[#1B3A6B]/10 px-2.5 py-1 rounded-full">تفاصيل التسكين والدرجة الوظيفية</span>
                <h3 className="text-xl font-bold text-[#1B3A6B] pt-1">
                  {employee?.grade ? `الدرجة ${getGradeLabel(employee.grade)}` : '—'} / {employee?.step ? `المرحلة ${getStepLabel(employee.step)}` : '—'}
                </h3>
                <p className="text-slate-500 text-xs">
                  تم تحديد الراتب الاسمي الموحد حسب سلم رواتب الموظفين لسنة 2023 المعتمد في العراق
                </p>
              </div>
              <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl px-6 py-3 text-center md:text-left min-w-[220px]">
                <span className="text-slate-500 text-xs font-medium block">الراتب الاسمي الأساسي</span>
                <span className="text-2xl font-black text-[#1B3A6B] font-mono leading-none">
                  {formatCurrency(salaryCalc.base_salary)}
                </span>
              </div>
            </div>

            {/* Part 2: المخصصات المضافة بالتفصيل (Added Allowances) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-[#1B3A6B] flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-green-500 rounded-full" />
                  المخصصات المضافة والمستحقة (الزيادات)
                </h3>
                <span className="text-xs text-slate-400 font-medium">تشمل المخصصات الثابتة بقوة القانون والمنح المخصصة</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                      <th className="text-right px-4 py-2.5 font-bold text-xs">اسم المخصص المضاف</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">النوع</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">الضابط / التفاصيل</th>
                      <th className="text-left px-4 py-2.5 font-bold text-xs">المبلغ المستحق (د.ع)</th>
                      <th className="text-center px-4 py-2.5 font-bold text-xs">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    
                    {/* 1. الشهادة */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات الشهادة العلمية</td>
                      <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {employee.education_level === 'بكالوريوس' ? '٤٥٪ من الراتب الاسمي' :
                         employee.education_level === 'دبلوم عالي' ? '٥٠٪ من الراتب الاسمي' :
                         employee.education_level === 'ماجستير' ? '٧٥٪ من الراتب الاسمي' :
                         employee.education_level === 'دكتوراه' ? '١٠٠٪ من الراتب الاسمي' :
                         employee.education_level === 'معهد' ? '٣٥٪ من الراتب الاسمي' :
                         employee.education_level === 'اعدادية' ? '٢٥٪ من الراتب الاسمي' : `مستوى دراسي: ${employee.education_level || 'غير محدد'}`}
                      </td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">{formatCurrency(salaryCalc.degree_allowance)}</td>
                      <td className="px-4 py-3 text-center text-slate-300">—</td>
                    </tr>

                    {/* 2. الشهادة العليا الإضافية */}
                    {salaryCalc.higher_degree_allowance > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات الشهادة العليا الإضافية</td>
                        <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">ممنوحة بموجب أمر إداري للشهادات العليا</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">{formatCurrency(salaryCalc.higher_degree_allowance)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 3. الزوجية */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات الزوجية</td>
                      <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">مبلغ مقطوع مخصص للموظف المتزوج ({formatCurrency(financialRates.spouse)} د.ع)</td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">
                        {salaryCalc.spouse_allowance > 0 ? formatCurrency(salaryCalc.spouse_allowance) : '٠ د.ع (غير مشمول)'}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-300">—</td>
                    </tr>

                    {/* 4. الأطفال */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات الأطفال</td>
                      <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{formatCurrency(financialRates.child)} د.ع لكل طفل مشمول (العدد: {employee.children_count || 0})</td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">{formatCurrency(salaryCalc.children_allowance)}</td>
                      <td className="px-4 py-3 text-center text-slate-300">—</td>
                    </tr>

                    {/* 5. المنصب والمسؤولية */}
                    {salaryCalc.position_allowance > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات المنصب والمسؤولية</td>
                        <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">حسب العنوان القيادي والموقع التنظيمي ({employee.primary_responsibility})</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">{formatCurrency(salaryCalc.position_allowance)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 6. الموقع الجغرافي */}
                    {salaryCalc.region_allowance > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">مخصصات الموقع الجغرافي والنائي</td>
                        <td className="px-4 py-3"><span className="bg-green-100 text-green-800 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">حسب موقع العمل المعتمد ({employee.work_location})</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-slate-800 text-xs">{formatCurrency(salaryCalc.region_allowance)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 7. المخصصات المضافة المخصصة والمؤقتة */}
                    {classifiedCustomItems
                      .filter(sa => sa.type === 'allowance')
                      .map(sa => (
                        <tr key={sa.id} className={`hover:bg-slate-50/30 ${sa.isStopped ? 'bg-amber-50/20 opacity-75' : 'bg-emerald-50/10'}`}>
                          <td className="px-4 py-3 font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${sa.isStopped ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            {sa.allowance_type}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              sa.isStopped ? 'bg-slate-100 text-slate-600 border border-slate-200' : (sa.isTemp ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800')
                            }`}>
                              {sa.isStopped ? 'متوقف مؤقتاً' : (sa.isTemp ? 'مؤقت' : 'دائم')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {sa.isStopped ? (
                              <span className="text-amber-700 font-medium">موقوف مؤقتاً في إعدادات النظام &bull; غير مضاف للراتب</span>
                            ) : (
                              <>{sa.isTemp ? sa.timingLabel : 'مدرج كبند مخصص دائم للموظف'} &bull; الأمر: {sa.order_number || '—'}</>
                            )}
                          </td>
                          <td className="px-4 py-3 text-left font-mono font-bold text-xs">
                            {sa.isStopped ? (
                              <span className="text-slate-400 line-through">٠ د.ع (موقوف)</span>
                            ) : (
                              <span className="text-emerald-700">{formatCurrency(sa.resolvedAmount)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7" onClick={() => deleteRecord('SalaryAllowance', sa.dbId || sa.id, sa.presetId)}>
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}

                  </tbody>
                </table>
              </div>

              {/* مجموع المخصصات الإجمالي مباشرة أسفل المجموعة */}
              <div className="flex justify-between items-center bg-slate-50 px-6 py-4 rounded-xl border border-slate-100 mt-2">
                <span className="font-bold text-slate-600 text-sm">إجمالي المخصصات المضافة المستحقة</span>
                <span className="font-extrabold text-green-600 text-base font-mono">
                  +{formatCurrency(displayedTotalAllowances)}
                </span>
              </div>
            </div>

            {/* Part 3: الاستقطاعات المفروضة بالتفصيل (Deductions) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-[#1B3A6B] flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-red-500 rounded-full" />
                  الاستقطاعات والحسومات المفروضة (الخصومات)
                </h3>
                <span className="text-xs text-slate-400 font-medium">تشمل التوقيفات التقاعدية القانونية والخصومات الإدارية</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100">
                      <th className="text-right px-4 py-2.5 font-bold text-xs">اسم بند الاستقطاع</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">النوع</th>
                      <th className="text-right px-4 py-2.5 font-bold text-xs">الضابط / التفاصيل</th>
                      <th className="text-left px-4 py-2.5 font-bold text-xs">المبلغ المستقطع (د.ع)</th>
                      <th className="text-center px-4 py-2.5 font-bold text-xs">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100/50">
                    
                    {/* 1. التوقيفات التقاعدية */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="px-4 py-3 font-semibold text-slate-800 text-xs">التوقيفات التقاعدية ({Math.round(financialRates.retirement * 100)}٪)</td>
                      <td className="px-4 py-3"><span className="bg-red-50 text-red-700 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">توقيفات تقاعدية إلزامية مستقطعة من الراتب الاسمي بموجب القانون</td>
                      <td className="px-4 py-3 text-left font-mono font-bold text-red-600 text-xs">{formatCurrency(salaryCalc.retirement_deduction)}</td>
                      <td className="px-4 py-3 text-center text-slate-300">—</td>
                    </tr>

                    {/* 2. ضريبة الدخل التقديرية */}
                    {salaryCalc.tax_deduction > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">ضريبة الدخل التقديرية</td>
                        <td className="px-4 py-3"><span className="bg-red-50 text-red-700 px-2.5 py-0.5 rounded text-[11px] font-bold">دائم</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">ضريبة دخل تقديرية على مجموع الدخل المستحق</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-red-600 text-xs">{formatCurrency(salaryCalc.tax_deduction)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 3. استقطاع غيابات */}
                    {salaryCalc.absence_deduction > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">استقطاع غيابات موثقة</td>
                        <td className="px-4 py-3"><span className="bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded text-[11px] font-bold">مؤقت</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">حسم أيام الغياب المسجلة عن العمل دون إجازة رسمية</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-red-600 text-xs">{formatCurrency(salaryCalc.absence_deduction)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 4. استقطاع عقوبات */}
                    {salaryCalc.penalty_deduction > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">استقطاع عقوبات إدارية</td>
                        <td className="px-4 py-3"><span className="bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded text-[11px] font-bold">مؤقت</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">مترتب على عقوبة قطع الراتب الصادرة بحق الموظف</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-red-600 text-xs">{formatCurrency(salaryCalc.penalty_deduction)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 5. استقطاع قروض وسلف */}
                    {salaryCalc.loan_deduction > 0 && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="px-4 py-3 font-semibold text-slate-800 text-xs">حسم سلف وقروض</td>
                        <td className="px-4 py-3"><span className="bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded text-[11px] font-bold">مؤقت</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">الأقساط الشهرية المسحوبة من مصرف الرافدين/الرشيد المترتبة على الموظف</td>
                        <td className="px-4 py-3 text-left font-mono font-bold text-red-600 text-xs">{formatCurrency(salaryCalc.loan_deduction)}</td>
                        <td className="px-4 py-3 text-center text-slate-300">—</td>
                      </tr>
                    )}

                    {/* 6. الاستقطاعات المخصصة والمؤقتة المضافة */}
                    {classifiedCustomItems
                      .filter(sa => sa.type === 'deduction')
                      .map(sa => (
                        <tr key={sa.id} className={`hover:bg-slate-50/30 ${sa.isStopped ? 'bg-amber-50/20 opacity-75' : 'bg-red-50/5'}`}>
                          <td className="px-4 py-3 font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${sa.isStopped ? 'bg-amber-500' : 'bg-red-500'}`} />
                            {sa.allowance_type}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              sa.isStopped ? 'bg-slate-100 text-slate-600 border border-slate-200' : (sa.isTemp ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')
                            }`}>
                              {sa.isStopped ? 'متوقف مؤقتاً' : (sa.isTemp ? 'مؤقت' : 'دائم')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {sa.isStopped ? (
                              <span className="text-amber-700 font-medium">موقوف مؤقتاً في إعدادات النظام &bull; غير مخصوم من الراتب</span>
                            ) : (
                              <>{sa.isTemp ? sa.timingLabel : 'مدرج كاستقطاع مخصص دائم للموظف'} &bull; الأمر: {sa.order_number || '—'}</>
                            )}
                          </td>
                          <td className="px-4 py-3 text-left font-mono font-bold text-xs">
                            {sa.isStopped ? (
                              <span className="text-slate-400 line-through">٠ د.ع (موقوف)</span>
                            ) : (
                              <span className="text-red-700">{formatCurrency(sa.resolvedAmount)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7" onClick={() => deleteRecord('SalaryAllowance', sa.dbId || sa.id, sa.presetId)}>
                              <Trash2 size={13} />
                            </Button>
                          </td>
                        </tr>
                      ))}

                  </tbody>
                </table>
              </div>

              {/* مجموع الاستقطاعات الإجمالي مباشرة أسفل المجموعة */}
              <div className="flex justify-between items-center bg-slate-50 px-6 py-4 rounded-xl border border-slate-100 mt-2">
                <span className="font-bold text-slate-600 text-sm">إجمالي الاستقطاعات المخصومة</span>
                <span className="font-extrabold text-red-600 text-base font-mono">
                  -{formatCurrency(displayedTotalDeductions)}
                </span>
              </div>
            </div>

            {/* Part 4: الراتب الكلي المستحق النهائي (Net Pay Card) */}
            <div className="bg-gradient-to-br from-[#1B3A6B] to-[#112544] text-white rounded-2xl p-8 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center md:text-right">
                <span className="text-yellow-400 text-xs font-black tracking-wider uppercase bg-yellow-400/10 px-3 py-1 rounded-full border border-yellow-400/20">
                  صافي الراتب الكلي المعتمد
                </span>
                <h3 className="text-2xl font-black text-white">الراتب النهائي المتبقي للمستلم</h3>
                <p className="text-slate-300 text-xs max-w-xl leading-relaxed">
                  هذا هو صافي الراتب الفعلي المعتمد لتحويله إلى حساب الموظف المصرفي أو دفعه نقداً بعد جمع كافة العلاوات القانونية والزيادات وخصم التوقيفات والالتزامات المالية كاملةً.
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-10 py-6 text-center md:text-left min-w-[280px] shadow-inner">
                <span className="text-slate-300 text-xs font-semibold block mb-1">صافي الراتب الكلي المستحق</span>
                <span className="text-3xl font-black text-yellow-400 font-mono leading-none">
                  {formatCurrency(displayedNetSalary)}
                </span>
              </div>
            </div>

          </div>
        </TabsContent>

        {/* 5. Promotions Tab */}
        <TabsContent value="promotions" className="mt-5 space-y-4">
          {/* Added Service Promotion & Allowance Impact Banner */}
          {(() => {
            const promoAddedRecords = addedServiceRecords.filter(r => r.purpose !== 'pension_only');
            if (promoAddedRecords.length === 0) return null;

            let promoAddedYears = 0;
            let promoAddedMonths = 0;
            let promoAddedDays = 0;

            promoAddedRecords.forEach(r => {
              promoAddedYears += parseInt(r.years || 0) || 0;
              promoAddedMonths += parseInt(r.months || 0) || 0;
              promoAddedDays += parseInt(r.days || 0) || 0;
            });

            const formattedAdded = formatDurationParts(promoAddedYears, promoAddedMonths, promoAddedDays);
            const latestPromoDate = promotions[0]?.promotion_date || employee.current_appointment_date || employee.first_appointment_date;
            
            // Check if added service order dates are prior to latest promotion
            const isUtilizedInLastPromo = promotions.length > 0 && promoAddedRecords.every(r => r.order_date && new Date(r.order_date) <= new Date(promotions[0].promotion_date));

            return (
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <ShieldCheck size={16} className="text-emerald-700" />
                  احتساب الخدمة المضافة للعلاوات والترقيات ({formattedAdded})
                </div>
                <p className="text-emerald-800 leading-relaxed font-medium">
                  {isUtilizedInLastPromo ? (
                    <>تم الاستفادة الكاملة من هذه المدة المضافة لمرة واحدة في الترقية/العلاوة المسجلة بتاريخ ({latestPromoDate}). والترقيات اللاحقة تعود لفتراتها القانونية الاعتيادية.</>
                  ) : (
                    <>تُستقطع مدة الخدمة المضافة ({formattedAdded}) من فترة الانتظار القانونية للعلاوة والترقية القادمة لمرة واحدة، مما يقدّم تاريخ الاستحقاق القادم دون تكرارها بعد الاستفادة منها.</>
                  )}
                </p>
              </div>
            );
          })()}

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">الترقيات والعلاوات السنوية</h3>
              <Button size="sm" onClick={() => openAddModal('promotion')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> تسجيل ترفيع/علاوة جديدة
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ الترفيع</th>
                    <th className="text-right px-4 py-2.5 font-bold">الدرجة الممنوحة</th>
                    <th className="text-right px-4 py-2.5 font-bold">المرحلة الممنوحة</th>
                    <th className="text-right px-4 py-2.5 font-bold">رقم الأمر الإداري</th>
                    <th className="text-right px-4 py-2.5 font-bold">ملاحظات</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B]">{p.promotion_date}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-semibold">{p.grade >= 11 ? getGradeLabel(p.grade) : `الدرجة ${getGradeLabel(p.grade)}`}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-semibold">المرحلة {p.step}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{p.promotion_order}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{p.notes || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل الترفيع" onClick={() => openEditModal('promotion', p)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('PromotionIncrement', p.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {promotions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد ترقيات أو علاوات مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 6. Leaves Tab */}
        <TabsContent value="leaves" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">سجل الإجازات الرسمية</h3>
              <Link to={`/leaves/new?employee=${id}`}>
                <Button size="sm" className="bg-[#1B3A6B] text-white rounded-xl gap-1">
                  <Plus size={14} /> تسجيل إجازة جديدة
                </Button>
              </Link>
            </div>
            
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="text-right px-4 py-2.5 font-bold">نوع الإجازة</th>
                  <th className="text-right px-4 py-2.5 font-bold">من تاريخ</th>
                  <th className="text-right px-4 py-2.5 font-bold">إلى تاريخ</th>
                  <th className="text-right px-4 py-2.5 font-bold">عدد الأيام</th>
                  <th className="text-right px-4 py-2.5 font-bold">الحالة الإدارية</th>
                  <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{l.leave_type}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.start_date}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.end_date}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-bold">{l.days_count} يوم</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        l.status === 'معتمد' ? 'bg-green-100 text-green-700' :
                        l.status === 'معلق' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{l.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('LeaveRequest', l.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
                {leaves.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد إجازات مسجلة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 7. Appreciations & Penalties Tab */}
        <TabsContent value="penalties" className="mt-5 space-y-6">
          {/* 1. كتب الشكر والتقدير */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
              <div>
                <h3 className="text-base font-bold text-amber-900 flex items-center gap-2">
                  <Award className="text-amber-600" size={18} />
                  كتب الشكر والتقدير ({appreciations.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">سجل كتب الشكر الممنوحة للموظف وما يترتب عليها من أثر القِدَم والمكافآت والمعنويات</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => openAddModal('appreciation')} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl gap-1">
                  <Plus size={14} /> إضافة كتاب شكر وتقدير
                </Button>
                <Link to={`/penalties?employee=${id}`}>
                  <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50 rounded-xl text-xs gap-1">
                    <FileText size={14} /> إدارة الشكر والعقوبات العامة
                  </Button>
                </Link>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-amber-50/50 text-amber-900 border-b border-amber-100">
                    <th className="text-right px-4 py-2.5 font-bold">جهة الإصدار</th>
                    <th className="text-right px-4 py-2.5 font-bold">رقم الأمر الإداري</th>
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ الأمر</th>
                    <th className="text-right px-4 py-2.5 font-bold">أثر القِدَم / المكافأة</th>
                    <th className="text-right px-4 py-2.5 font-bold">سبب الشكر</th>
                    <th className="text-right px-4 py-2.5 font-bold">ملاحظات</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {appreciations.map(a => (
                    <tr key={a.id} className="border-b border-slate-50 hover:bg-amber-50/20">
                      <td className="px-4 py-2.5 font-bold text-amber-950">{a.issuer || 'السيد المدير العام'}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{a.order_number || a.orderNumber}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{a.order_date || a.orderDate}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {a.seniority_impact || a.seniorityImpact || 'قدم شهر واحد'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 text-xs max-w-xs truncate" title={a.reason}>{a.reason || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{a.notes || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل كتاب الشكر" onClick={() => openEditModal('appreciation', a)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" title="حذف" onClick={() => deleteRecord('Appreciation', a.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {appreciations.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد كتب شكر وتقدير مسجلة للموظف</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. العقوبات الإدارية الانضباطية */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
              <div>
                <h3 className="text-base font-bold text-red-700 flex items-center gap-2">
                  <ShieldAlert className="text-red-600" size={18} />
                  العقوبات الإدارية والانضباطية ({penalties.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">سجل العقوبات والإنذارات المفروضة بحق الموظف وحالتها التنفيذية</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => openAddModal('penalty')} className="bg-red-600 hover:bg-red-700 text-white rounded-xl gap-1">
                  <Plus size={14} /> تسجيل عقوبة جديدة
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">نوع العقوبة</th>
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ العقوبة</th>
                    <th className="text-right px-4 py-2.5 font-bold">رقم الأمر</th>
                    <th className="text-right px-4 py-2.5 font-bold">سبب العقوبة</th>
                    <th className="text-right px-4 py-2.5 font-bold">الحالة الإدارية</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {penalties.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-red-50/20">
                      <td className="px-4 py-2.5 font-bold text-red-700">{p.penalty_type || p.penaltyType}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{p.penalty_date || p.penaltyDate}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{p.order_number || p.orderNumber}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{p.reason || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.status === 'نافذ' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{p.status || 'نافذ'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل العقوبة" onClick={() => openEditModal('penalty', p)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" title="حذف" onClick={() => deleteRecord('Penalty', p.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {penalties.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">سجل الموظف نظيف من العقوبات الإدارية</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 8. Evaluations Tab */}
        <TabsContent value="evaluations" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">تقييمات الأداء السنوية</h3>
              <Button size="sm" onClick={() => openAddModal('evaluation')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> إضافة تقييم سنوي جديد
              </Button>
            </div>
            
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="text-right px-4 py-2.5 font-bold">السنة التقييمية</th>
                  <th className="text-right px-4 py-2.5 font-bold">الدرجة الاجمالية</th>
                  <th className="text-right px-4 py-2.5 font-bold">التقدير النهائي</th>
                  <th className="text-right px-4 py-2.5 font-bold">المقيم / اللجنة</th>
                  <th className="text-right px-4 py-2.5 font-bold">حالة التقييم</th>
                  <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map(ev => (
                  <tr key={ev.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-800">{ev.year}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-800 font-bold">{ev.score}/100</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        ev.grade === 'ممتاز' ? 'bg-green-100 text-green-700' :
                        ev.grade === 'جيد جداً' ? 'bg-blue-100 text-blue-700' :
                        ev.grade === 'جيد' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{ev.grade}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{ev.evaluator || 'اللجنة المركزية'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${ev.status === 'معتمد' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{ev.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل التقييم" onClick={() => openEditModal('evaluation', ev)}>
                          <Edit size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('AnnualEvaluation', ev.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {evaluations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد تقييمات سنوية مسجلة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* 9. Training Tab */}
        <TabsContent value="training" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">الدورات التدريبية المعتمدة</h3>
              <Button size="sm" onClick={() => openAddModal('training_course')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> تسجيل دورة تدريبية
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">اسم الدورة</th>
                    <th className="text-right px-4 py-2.5 font-bold">الجهة المنظمة للتدريب</th>
                    <th className="text-right px-4 py-2.5 font-bold">من تاريخ</th>
                    <th className="text-right px-4 py-2.5 font-bold">إلى تاريخ</th>
                    <th className="text-right px-4 py-2.5 font-bold">الأمر الإداري بالوفد</th>
                    <th className="text-right px-4 py-2.5 font-bold">النتيجة</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingCourses.map(tc => (
                    <tr key={tc.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B]">{tc.course_name}</td>
                      <td className="px-4 py-2.5 text-slate-700">{tc.institution}</td>
                      <td className="px-4 py-2.5 text-slate-600">{tc.start_date}</td>
                      <td className="px-4 py-2.5 text-slate-600">{tc.end_date}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{tc.order_number || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${tc.result === 'اجتاز' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>{tc.result}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل الدورة التدريبية" onClick={() => openEditModal('training_course', tc)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('TrainingCourse', tc.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {trainingCourses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد دورات تدريبية معتمدة مسجلة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 10. Transfers Tab */}
        <TabsContent value="transfers" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">سجل التنقلات والتنسيب الإداري</h3>
              <Button size="sm" onClick={() => openAddModal('transfer')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> تسجيل نقل / تنسيب جديد
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ التنقل</th>
                    <th className="text-right px-4 py-2.5 font-bold">نوع الإجراء</th>
                    <th className="text-right px-4 py-2.5 font-bold">من دائرة/قسم</th>
                    <th className="text-right px-4 py-2.5 font-bold">إلى دائرة/قسم</th>
                    <th className="text-right px-4 py-2.5 font-bold">الأمر الإداري الصادر</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(tr => (
                    <tr key={tr.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B]">{tr.transfer_date}</td>
                      <td className="px-4 py-2.5 text-slate-800"><span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded text-xs font-bold">{tr.transfer_type}</span></td>
                      <td className="px-4 py-2.5 text-slate-600 font-medium">{tr.from_department}</td>
                      <td className="px-4 py-2.5 text-[#1B3A6B] font-semibold">{tr.to_department}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{tr.transfer_order}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل التنسيب/النقل" onClick={() => openEditModal('transfer', tr)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('Transfer', tr.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {transfers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد تنقلات تاريخية مضافة للموظف</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 11. Retirement Tab */}
        <TabsContent value="retirement" className="mt-5 space-y-6">
          {/* Card: Service Extension (معلومات تمديد الخدمة وتأجيل التقاعد) */}
          {(() => {
            const extOrderNum = employee?.retirement_extension_order_number || employee?.retirementExtensionOrderNumber || '';
            const extOrderDate = employee?.retirement_extension_order_date || employee?.retirementExtensionOrderDate || '';
            const extYears = employee?.retirement_extension_years ?? employee?.retirementExtensionYears ?? 0;
            const extMonths = employee?.retirement_extension_months ?? employee?.retirementExtensionMonths ?? 0;
            const extNote = employee?.retirement_extension_note || employee?.retirementExtensionNote || '';
            const hasExtension = Boolean(extOrderNum || extOrderDate || extYears > 0 || extMonths > 0);

            let baseRetirementDate = 'غير محدد';
            let finalRetirementDate = 'غير محدد';
            let diffDays = null;

            if (employee?.birth_date || employee?.birthDate) {
              const bDate = new Date(employee.birth_date || employee.birthDate);
              if (!isNaN(bDate.getTime())) {
                const baseDate = new Date(bDate);
                baseDate.setFullYear(baseDate.getFullYear() + 60);

                const finalDate = new Date(baseDate);
                finalDate.setFullYear(finalDate.getFullYear() + (parseInt(extYears) || 0));
                finalDate.setMonth(finalDate.getMonth() + (parseInt(extMonths) || 0));

                baseRetirementDate = baseDate.toISOString().split('T')[0];
                finalRetirementDate = finalDate.toISOString().split('T')[0];

                const today = new Date();
                const diff = finalDate.getTime() - today.getTime();
                diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
              }
            }

            return (
              <div className="bg-gradient-to-r from-amber-900/5 via-orange-900/5 to-yellow-900/5 border border-amber-200/80 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-amber-200/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-[#1B3A6B] text-white rounded-xl shadow-xs">
                      <Clock size={22} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        تمديد الخدمة الوظيفية وتأجيل التقاعد
                        {hasExtension && (extYears > 0 || extMonths > 0) ? (
                          <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                            تمديد خدمة ساري المفعول
                          </span>
                        ) : hasExtension ? (
                          <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-200">
                            موقوف / ملغى
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-0.5 rounded-full font-bold border border-slate-200">
                            لا يوجد تمديد
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        إدارة ومراجعة وتعديل وإلغاء أو حذف أوامر تمديد الخدمة للمتقاعدين والمستحقين
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={handleOpenExtModal}
                      className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold gap-1.5 shadow-xs px-4"
                    >
                      <Edit size={14} />
                      {hasExtension ? 'تعديل التمديد' : 'إضافة أمر تمديد'}
                    </Button>

                    {hasExtension && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExtCancelForm({
                              orderNumber: '',
                              orderDate: new Date().toISOString().split('T')[0],
                              note: ''
                            });
                            setExtCancelModalOpen(true);
                          }}
                          className="border-amber-300 text-amber-800 hover:bg-amber-100/60 rounded-xl text-xs font-bold gap-1.5"
                        >
                          <Power size={14} />
                          إلغاء التمديد
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setExtDeleteConfirmOpen(true)}
                          className="rounded-xl text-xs font-bold gap-1.5"
                        >
                          <Trash2 size={14} />
                          حذف التمديد
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {hasExtension ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-slate-400 block font-medium">رقم الأمر الإداري</span>
                        <span className="font-mono font-bold text-slate-800 text-sm block">{extOrderNum || 'غير محدد'}</span>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-slate-400 block font-medium">تاريخ الأمر الإداري</span>
                        <span className="font-mono font-bold text-slate-800 text-sm block">{extOrderDate || 'غير محدد'}</span>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-slate-400 block font-medium">المدة المضافة للخدمة</span>
                        <span className="font-bold text-emerald-700 text-sm block">
                          {extYears} سنة و {extMonths} شهر
                        </span>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 space-y-1">
                        <span className="text-slate-400 block font-medium">تاريخ التقاعد (الأصلي ← المعدل)</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-slate-400 line-through">{baseRetirementDate}</span>
                          <span className="font-mono font-bold text-emerald-700">← {finalRetirementDate}</span>
                        </div>
                      </div>
                    </div>

                    {diffDays !== null && (
                      <div className="flex items-center gap-2 bg-white/80 p-3 rounded-xl border border-amber-200/60 text-xs">
                        <Clock size={16} className="text-amber-600 shrink-0" />
                        <span className="text-slate-700 font-medium">
                          {diffDays < 0 ? (
                            <span className="text-red-600 font-bold">الموظف تجاوز تاريخ التقاعد المعدل بـ {Math.abs(diffDays)} يوم</span>
                          ) : (
                            <span>المتبقي للإحالة للتقاعد بعد التمديد: <strong className="text-amber-800 font-bold">{diffDays} يوم</strong></span>
                          )}
                        </span>
                      </div>
                    )}

                    {extNote && (
                      <div className="bg-amber-50/80 p-3.5 rounded-xl border border-amber-200/60 text-amber-900 text-xs leading-relaxed">
                        <span className="font-bold block mb-1">الملاحظات / سبب التمديد أو الإلغاء:</span>
                        <p className="whitespace-pre-line font-medium text-slate-800">{extNote}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-5 text-xs text-slate-500 bg-white/60 rounded-xl border border-dashed border-amber-200/80">
                    لا يوجد أمر تمديد خدمة مضاف لهذا الموظف. انقر على "إضافة أمر تمديد" لتسجيل الأمر الإداري.
                  </div>
                )}
              </div>
            );
          })()}

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">معاملات نهاية الخدمة والإحالة للتقاعد</h3>
              <Button size="sm" onClick={() => openAddModal('retirement')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> إنشاء معاملة تقاعد
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ الإحالة</th>
                    <th className="text-right px-4 py-2.5 font-bold">سبب الإحالة</th>
                    <th className="text-right px-4 py-2.5 font-bold">مبلغ الراتب التقاعدي المعتمد</th>
                    <th className="text-right px-4 py-2.5 font-bold">الأمر الإداري بالتقاعد</th>
                    <th className="text-right px-4 py-2.5 font-bold">الحالة</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {retirements.map(r => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B]">{r.retirement_date}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-semibold">{r.retirement_reason}</td>
                      <td className="px-4 py-2.5 font-mono text-green-600 font-bold">{formatCurrency(r.pension_amount)}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{r.retirement_order}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.status === 'مكتمل' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{r.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل معاملة التقاعد" onClick={() => openEditModal('retirement', r)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('Retirement', r.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {retirements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد سجلات إحالة تقاعدية نشطة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* 12. Documents Tab */}
        <TabsContent value="documents" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">المستندات القانونية والمرفقات</h3>
              <Button size="sm" onClick={() => openAddModal('document')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> رفع وثيقة ومرفق جديد
              </Button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <th className="text-right px-4 py-2.5 font-bold">اسم الوثيقة</th>
                    <th className="text-right px-4 py-2.5 font-bold">نوع المرفق</th>
                    <th className="text-right px-4 py-2.5 font-bold">تاريخ الإصدار</th>
                    <th className="text-right px-4 py-2.5 font-bold">جهة الإصدار</th>
                    <th className="text-right px-4 py-2.5 font-bold">ملاحظات</th>
                    <th className="text-right px-4 py-2.5 font-bold">المرفق</th>
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(d => (
                    <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B]">{d.document_name}</td>
                      <td className="px-4 py-2.5 text-slate-800"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{d.document_type}</span></td>
                      <td className="px-4 py-2.5 text-slate-600">{d.issue_date}</td>
                      <td className="px-4 py-2.5 text-slate-600">{d.issue_authority}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{d.notes || '—'}</td>
                      <td className="px-4 py-2.5 text-[#1B3A6B] font-medium text-xs">
                        {d.file_path ? (
                          <a href={d.file_path} download={d.document_name} className="hover:underline flex items-center gap-1 font-bold text-green-700">
                            <FileText size={14} /> تحميل الوثيقة
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="text-blue-600 hover:bg-blue-50 h-8 w-8 rounded-lg" title="تعديل المستند" onClick={() => openEditModal('document', d)}>
                            <Edit size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg" onClick={() => deleteRecord('Document', d.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {documents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">لا توجد وثائق أو مرفقات قانونية مضافة</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dynamic Pop-up Modal Form */}
      {activeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 p-6 space-y-4 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-[#1B3A6B]">
                {activeModal === 'qualification' && (editingRecordId ? 'تعديل المؤهل العلمي' : 'إضافة مؤهل علمي جديد')}
                {activeModal === 'assignment' && (editingRecordId ? 'تعديل التكليف/الوظيفة' : 'تسجيل تكليف/وظيفة جديدة')}
                {activeModal === 'promotion' && (editingRecordId ? 'تعديل الترفيع/العلاوة' : 'تسجيل ترفيع/علاوة جديدة')}
                {activeModal === 'allowance' && (editingRecordId ? 'تعديل المخصص/الاستقطاع' : 'إضافة مخصص أو استقطاع مؤقت جديد')}
                {activeModal === 'evaluation' && (editingRecordId ? 'تعديل التقييم السنوي' : 'إضافة تقييم سنوي جديد')}
                {activeModal === 'training_course' && (editingRecordId ? 'تعديل الدورة التدريبية' : 'تسجيل دورة تدريبية جديدة')}
                {activeModal === 'transfer' && (editingRecordId ? 'تعديل معاملة النقل/التنسيب' : 'تسجيل معاملة نقل/تنسيب')}
                {activeModal === 'retirement' && (editingRecordId ? 'تعديل معاملة التقاعد' : 'تسجيل معاملة تقاعد جديدة')}
                {activeModal === 'document' && (editingRecordId ? 'تعديل المستند/الوثيقة' : 'إضافة مستند/وثيقة جديدة')}
                {activeModal === 'service_record' && (editingRecordId ? 'تعديل أمر احتساب الخدمة / التمديد' : 'إضافة أمر احتساب خدمة / تمديد')}
              </h3>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">&times;</button>
            </div>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              {/* 1. Qualification Form */}
              {activeModal === 'qualification' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>الشهادة العلمية *</Label>
                    <Select value={modalForm.education_level} onValueChange={v => setModalForm(prev => ({ ...prev, education_level: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(educationDegrees.length > 0 ? educationDegrees.map(d => d.name) : ['دكتوراه','ماجستير','بكالوريوس','دبلوم عالي','دبلوم','إعدادية','متوسطة','ابتدائية']).map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>التخصص العام والدقيق *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.specialization || ''} onChange={e => setModalForm(prev => ({ ...prev, specialization: e.target.value }))} required placeholder="مثال: هندسة برمجيات" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>الجامعة / المعهد / الجهة المانحة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.institution || ''} onChange={e => setModalForm(prev => ({ ...prev, institution: e.target.value }))} required placeholder="مثال: جامعة بغداد / كلية الهندسة" />
                  </div>
                  <div>
                    <Label>سنة التخرج *</Label>
                    <Input type="number" className="mt-1 rounded-xl" value={modalForm.graduation_year || ''} onChange={e => setModalForm(prev => ({ ...prev, graduation_year: parseInt(e.target.value) || '' }))} required />
                  </div>
                  <div>
                    <Label>رقم أمر احتساب الشهادة</Label>
                    <Input 
                      className="mt-1 rounded-xl" 
                      value={modalForm.evaluation_order || modalForm.equation_number || modalForm.education_order || ''} 
                      onChange={e => setModalForm(prev => ({ 
                        ...prev, 
                        evaluation_order: e.target.value,
                        equation_number: e.target.value,
                        education_order: e.target.value,
                        evaluationOrder: e.target.value,
                        equationNumber: e.target.value,
                        educationOrder: e.target.value
                      }))} 
                      placeholder="مثال: أ د / 1234 أو ق/2154" 
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات إضافية</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* 2. Job Assignment Form */}
              {activeModal === 'assignment' && (
                <div className="space-y-4">
                  <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-900">
                    <ShieldCheck className="text-blue-600 shrink-0 mt-0.5" size={17} />
                    <p className="leading-relaxed">
                      يرجى إدخال تفاصيل الأمر الإداري ونوع الإجراء (تكليف / إعفاء / تدوير) مع تحديد المسؤولية الأساسية ومسؤولية الوكالة ودرجة الوكيل. سيتم تحديث وتوثيق بيانات الموظف تلقائياً بالسجل المركزي.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* رقم وتاريخ الأمر */}
                    <div>
                      <Label>رقم الأمر الإداري *</Label>
                      <Input 
                        className="mt-1 rounded-xl" 
                        value={modalForm.order_number || modalForm.assignment_order || ''} 
                        onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value, assignment_order: e.target.value }))} 
                        required 
                        placeholder="مثال: 1234/ت" 
                      />
                    </div>
                    <div>
                      <Label>تاريخ الأمر الإداري / المباشرة *</Label>
                      <Input 
                        type="date" 
                        className="mt-1 rounded-xl" 
                        value={modalForm.order_date || modalForm.assignment_date || ''} 
                        onChange={e => setModalForm(prev => ({ ...prev, order_date: e.target.value, assignment_date: e.target.value }))} 
                        required 
                      />
                    </div>

                    {/* نوع الإجراء: هل هو تكليف أم إعفاء أم تدوير */}
                    <div className="md:col-span-2">
                      <Label>نوع الإجراء الإداري *</Label>
                      <Select 
                        value={modalForm.action_type || 'تكليف'} 
                        onValueChange={v => {
                          setModalForm(prev => {
                            const updated = { ...prev, action_type: v, assignment_type: v };
                            if (v === 'إعفاء') {
                              updated.primary_responsibility = 'بلا مسؤولية';
                              updated.acting_responsibility = 'بلا وكالة';
                              updated.deputy_level = 'لا يوجد';
                            }
                            return updated;
                          });
                        }}
                      >
                        <SelectTrigger className="mt-1 rounded-xl font-bold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="تكليف">تكليف بمسؤولية / منصب</SelectItem>
                          <SelectItem value="إعفاء">إعفاء من المسؤولية</SelectItem>
                          <SelectItem value="تدوير">تدوير وظيفي / تغيير موقع</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* القائمة المنسدلة للمسؤوليات الأساسية */}
                    <div>
                      <Label>المسؤولية الأساسية (أصالة) *</Label>
                      <Select 
                        value={modalForm.primary_responsibility || 'بلا مسؤولية'} 
                        onValueChange={v => setModalForm(prev => ({ ...prev, primary_responsibility: v }))}
                      >
                        <SelectTrigger className="mt-1 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {defaultResponsibilities.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* القائمة المنسدلة للوكالات */}
                    <div>
                      <Label>المسؤولية في حالة الوكالة *</Label>
                      <Select 
                        value={modalForm.acting_responsibility || 'بلا وكالة'} 
                        onValueChange={v => setModalForm(prev => ({ ...prev, acting_responsibility: v }))}
                      >
                        <SelectTrigger className="mt-1 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {defaultActingResponsibilities.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* القائمة المنسدلة لدرجة الوكالة */}
                    <div>
                      <Label>تحديد درجة الوكيل *</Label>
                      <Select 
                        value={modalForm.deputy_level || 'لا يوجد'} 
                        onValueChange={v => setModalForm(prev => ({ ...prev, deputy_level: v }))}
                      >
                        <SelectTrigger className="mt-1 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="لا يوجد">لا يوجد (أصالة)</SelectItem>
                          <SelectItem value="وكيل أول">وكيل أول</SelectItem>
                          <SelectItem value="وكيل ثاني">وكيل ثاني</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* نوع الخدمة */}
                    <div>
                      <Label>نوع الخدمة</Label>
                      <Select 
                        value={modalForm.service_type || 'دائم'} 
                        onValueChange={v => setModalForm(prev => ({ ...prev, service_type: v }))}
                      >
                        <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['دائم', 'مؤقت', 'عقد', 'إعارة', 'تنسيب'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* العنوان الوظيفي والدائرة (اختياري/تحديث) */}
                    <div>
                      <Label>العنوان الوظيفي</Label>
                      <Input 
                        className="mt-1 rounded-xl" 
                        value={modalForm.job_title || ''} 
                        onChange={e => setModalForm(prev => ({ ...prev, job_title: e.target.value }))} 
                        placeholder="العنوان الوظيفي المثبت" 
                      />
                    </div>
                    <div>
                      <Label>الدائرة / القسم / الشعبة</Label>
                      <Input 
                        className="mt-1 rounded-xl" 
                        value={modalForm.department || modalForm.section || ''} 
                        onChange={e => setModalForm(prev => ({ ...prev, department: e.target.value, section: e.target.value }))} 
                        placeholder="الجهة التنظيمية" 
                      />
                    </div>

                    {/* ملاحظات وتفاصيل */}
                    <div className="md:col-span-2">
                      <Label>ملاحظات ومبررات إضافية</Label>
                      <Input 
                        className="mt-1 rounded-xl" 
                        value={modalForm.notes || ''} 
                        onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} 
                        placeholder="أي تفاصيل أو مبررات عن الإجراء الإداري..." 
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Promotion/Increment Form */}
              {activeModal === 'promotion' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ الترفيع/العلاوة *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.promotion_date || ''} onChange={e => setModalForm(prev => ({ ...prev, promotion_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>رقم الأمر الإداري بالترفيع *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.promotion_order || ''} onChange={e => setModalForm(prev => ({ ...prev, promotion_order: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>الدرجة الممنوحة *</Label>
                    <Select value={String(modalForm.grade)} onValueChange={v => setModalForm(prev => ({ ...prev, grade: parseInt(v) }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9,10,11,12,13].map(g => (
                          <SelectItem key={g} value={String(g)}>
                            {g >= 11 ? getGradeLabel(g) : `الدرجة ${getGradeLabel(g)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>المرحلة الممنوحة *</Label>
                    <Select value={String(modalForm.step)} onValueChange={v => setModalForm(prev => ({ ...prev, step: parseInt(v) }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9,10,11].map(s => <SelectItem key={s} value={String(s)}>المرحلة {s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* 4. Temporary Allowance & Deduction Form */}
              {activeModal === 'allowance' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 bg-[#1B3A6B]/5 p-3 rounded-xl border border-[#1B3A6B]/10 text-[#1B3A6B] text-xs font-semibold leading-relaxed">
                    سيتم شمول هذا الموظف حصراً (**{employee?.full_name}**) بهذا المخصص أو الاستقطاع المؤقت، وسيُضاف تلقائياً إلى قائمة المخصصات المؤقتة.
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-slate-700 font-bold">اسم المخصص أو الاستقطاع المؤقت *</Label>
                    <Input 
                      placeholder="مثال: مخصصات أعمال إضافية، استقطاع سلفة هاتف..." 
                      className="mt-1 rounded-xl" 
                      value={modalForm.name || ''} 
                      onChange={e => setModalForm(prev => ({ ...prev, name: e.target.value }))} 
                      required 
                    />
                  </div>

                  <div>
                    <Label className="text-slate-700 font-bold">النوع *</Label>
                    <Select value={modalForm.type} onValueChange={v => setModalForm(prev => ({ ...prev, type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allowance">مخصصات (إضافة للراتب)</SelectItem>
                        <SelectItem value="deduction">استقطاع (خصم من الراتب)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-700 font-bold">طريقة الاحتساب *</Label>
                    <Select value={modalForm.calcType} onValueChange={v => setModalForm(prev => ({ ...prev, calcType: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">مبلغ مقطوع (دينار عراقي)</SelectItem>
                        <SelectItem value="percentage">نسبة مئوية % (من الراتب الاسمي)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-700 font-bold">
                      {modalForm.calcType === 'percentage' ? 'النسبة المئوية % *' : 'المبلغ المقطوع (د.ع) *'}
                    </Label>
                    <Input 
                      type="number" 
                      className="mt-1 rounded-xl" 
                      value={modalForm.value || ''} 
                      onChange={e => setModalForm(prev => ({ ...prev, value: parseInt(e.target.value) || 0 }))} 
                      required 
                    />
                  </div>

                  <div>
                    <Label className="text-slate-700 font-bold">رقم الأمر الإداري بالصرف *</Label>
                    <Input 
                      placeholder="مثال: م.أ / ١٢٣٤" 
                      className="mt-1 rounded-xl" 
                      value={modalForm.order_number || ''} 
                      onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value }))} 
                      required 
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Label className="text-slate-700 font-bold">التوقيت / الصرف الاستثنائي *</Label>
                    <Select value={modalForm.timingType} onValueChange={v => setModalForm(prev => ({ ...prev, timingType: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">شهر محدد واحد فقط</SelectItem>
                        <SelectItem value="range">فترة زمنية محددة (نطاق أشهر)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {modalForm.timingType === 'single' ? (
                    <>
                      <div>
                        <Label className="text-slate-700 font-bold">شهر الصرف *</Label>
                        <Select value={String(modalForm.paymentMonth)} onValueChange={v => setModalForm(prev => ({ ...prev, paymentMonth: parseInt(v) }))}>
                          <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                              <SelectItem key={i+1} value={String(i+1)}>شهر {i+1}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-700 font-bold">سنة الصرف *</Label>
                        <Select value={String(modalForm.paymentYear)} onValueChange={v => setModalForm(prev => ({ ...prev, paymentYear: parseInt(v) }))}>
                          <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[2025, 2026, 2027, 2028, 2029].map(y => (
                              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-1 md:col-span-2 grid grid-cols-2 gap-3">
                        <div className="col-span-2 text-xs font-bold text-slate-500 mb-1">فترة السريان (من):</div>
                        <div>
                          <Label className="text-xs text-slate-600">الشهر</Label>
                          <Select value={String(modalForm.startMonth)} onValueChange={v => setModalForm(prev => ({ ...prev, startMonth: parseInt(v) }))}>
                            <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i+1} value={String(i+1)}>شهر {i+1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">السنة</Label>
                          <Select value={String(modalForm.startYear)} onValueChange={v => setModalForm(prev => ({ ...prev, startYear: parseInt(v) }))}>
                            <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[2025, 2026, 2027, 2028, 2029].map(y => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-1 md:col-span-2 grid grid-cols-2 gap-3">
                        <div className="col-span-2 text-xs font-bold text-slate-500 mb-1">فترة السريان (إلى):</div>
                        <div>
                          <Label className="text-xs text-slate-600">الشهر</Label>
                          <Select value={String(modalForm.endMonth)} onValueChange={v => setModalForm(prev => ({ ...prev, endMonth: parseInt(v) }))}>
                            <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i+1} value={String(i+1)}>شهر {i+1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-slate-600">السنة</Label>
                          <Select value={String(modalForm.endYear)} onValueChange={v => setModalForm(prev => ({ ...prev, endYear: parseInt(v) }))}>
                            <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[2025, 2026, 2027, 2028, 2029].map(y => (
                                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 5. Annual Evaluation Form */}
              {activeModal === 'evaluation' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>السنة التقييمية *</Label>
                    <Input type="number" className="mt-1 rounded-xl" value={modalForm.year || ''} onChange={e => setModalForm(prev => ({ ...prev, year: parseInt(e.target.value) || '' }))} required />
                  </div>
                  <div>
                    <Label>الدرجة الإجمالية (من 100) *</Label>
                    <Input type="number" min={0} max={100} className="mt-1 rounded-xl" value={modalForm.score || ''} onChange={e => setModalForm(prev => ({ ...prev, score: parseInt(e.target.value) || '' }))} required />
                  </div>
                  <div>
                    <Label>التقدير النهائي *</Label>
                    <Select value={modalForm.grade} onValueChange={v => setModalForm(prev => ({ ...prev, grade: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['ممتاز', 'جيد جداً', 'جيد', 'متوسط', 'مقبول', 'ضعيف'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>اسم المقيم أو جهة التقييم *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.evaluator || ''} onChange={e => setModalForm(prev => ({ ...prev, evaluator: e.target.value }))} required placeholder="مثال: مدير القسم" />
                  </div>
                </div>
              )}

              {/* 6. Training Course Form */}
              {activeModal === 'training_course' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>اسم الدورة التدريبية المعتمدة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.course_name || ''} onChange={e => setModalForm(prev => ({ ...prev, course_name: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>تاريخ البدء *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.start_date || ''} onChange={e => setModalForm(prev => ({ ...prev, start_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>تاريخ الانتهاء *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.end_date || ''} onChange={e => setModalForm(prev => ({ ...prev, end_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>الجهة المنظمة للتدريب *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.institution || ''} onChange={e => setModalForm(prev => ({ ...prev, institution: e.target.value }))} required placeholder="مثال: معهد التطوير الإداري" />
                  </div>
                  <div>
                    <Label>أمر إيفاد التدريب (الرقم المرجعي)</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.order_number || ''} onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value }))} />
                  </div>
                  <div>
                    <Label>النتيجة النهائية *</Label>
                    <Select value={modalForm.result} onValueChange={v => setModalForm(prev => ({ ...prev, result: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['اجتاز', 'مشارك', 'متميز', 'لم يجتز'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* 7. Transfer Form */}
              {activeModal === 'transfer' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ التنقل / التنسيب *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.transfer_date || ''} onChange={e => setModalForm(prev => ({ ...prev, transfer_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>رقم الأمر الإداري بالنقل *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.transfer_order || ''} onChange={e => setModalForm(prev => ({ ...prev, transfer_order: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>من دائرة / قسم / وزارة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.from_department || ''} onChange={e => setModalForm(prev => ({ ...prev, from_department: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>إلى دائرة / قسم / وزارة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.to_department || ''} onChange={e => setModalForm(prev => ({ ...prev, to_department: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>نوع التنقل *</Label>
                    <Select value={modalForm.transfer_type} onValueChange={v => setModalForm(prev => ({ ...prev, transfer_type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="نقل دائم">نقل دائم</SelectItem>
                        <SelectItem value="تنسيب مؤقت">تنسيب مؤقت</SelectItem>
                        <SelectItem value="إعارة خدمات">إعارة خدمات</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* 8. Retirement Form */}
              {activeModal === 'retirement' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ الإحالة للتقاعد *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.retirement_date || ''} onChange={e => setModalForm(prev => ({ ...prev, retirement_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>رقم أمر التقاعد الإداري *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.retirement_order || ''} onChange={e => setModalForm(prev => ({ ...prev, retirement_order: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>سبب الإحالة للتقاعد *</Label>
                    <Select value={modalForm.retirement_reason} onValueChange={v => setModalForm(prev => ({ ...prev, retirement_reason: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['بلوغ السن القانوني', 'بناءً على طلبه', 'أسباب صحية', 'استقالة', 'فصل'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>المبلغ المعتمد للراتب التقاعدي</Label>
                    <Input type="number" className="mt-1 rounded-xl" value={modalForm.pension_amount || ''} onChange={e => setModalForm(prev => ({ ...prev, pension_amount: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
              )}

              {/* 9. Document Form */}
              {activeModal === 'document' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>اسم المستند / الوثيقة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.document_name || ''} onChange={e => setModalForm(prev => ({ ...prev, document_name: e.target.value }))} required placeholder="مثال: الأمر الوزاري للتعيين" />
                  </div>
                  <div>
                    <Label>نوع الوثيقة *</Label>
                    <Select value={modalForm.document_type} onValueChange={v => setModalForm(prev => ({ ...prev, document_type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['أمر إداري', 'أمر وزاري', 'شهادة دراسية', 'هوية شخصية', 'بطاقة سكن', 'أخرى'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>تاريخ الإصدار *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.issue_date || ''} onChange={e => setModalForm(prev => ({ ...prev, issue_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>جهة الإصدار *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.issue_authority || ''} onChange={e => setModalForm(prev => ({ ...prev, issue_authority: e.target.value }))} required placeholder="مثال: وزارة التعليم العالي والبحث العلمي" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>اختيار المرفق (PDF أو صورة) *</Label>
                    <Input type="file" onChange={handleFileChange} className="mt-1 rounded-xl text-xs" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* 10. Service Record Form */}
              {activeModal === 'service_record' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>نوع الخدمة المحتسبة *</Label>
                    <Select value={modalForm.record_type} onValueChange={v => setModalForm(prev => ({ ...prev, record_type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['خدمة محتسبة', 'خدمة عسكرية', 'خدمة عقد', 'خدمة ممارسة', 'خدمة محاماة', 'أخرى'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>الغرض القانوني من الاحتساب *</Label>
                    <Select value={modalForm.purpose} onValueChange={v => setModalForm(prev => ({ ...prev, purpose: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="promotion_allowance_pension">لاغراض الترقية والعلاوة والتقاعد</SelectItem>
                        <SelectItem value="pension_only">لاغراض التقاعد فقط</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>رقم الأمر الإداري *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.order_number || ''} onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value }))} required placeholder="مثال: 1234/4/5" />
                  </div>
                  <div>
                    <Label>تاريخ الأمر الإداري *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.order_date || ''} onChange={e => setModalForm(prev => ({ ...prev, order_date: e.target.value }))} required />
                  </div>
                  <div className="md:col-span-2 grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <Label className="text-xs">المدة (سنوات) *</Label>
                      <Input type="number" min="0" className="mt-1 rounded-xl bg-white" value={modalForm.years ?? 0} onChange={e => setModalForm(prev => ({ ...prev, years: parseInt(e.target.value) || 0 }))} required />
                    </div>
                    <div>
                      <Label className="text-xs">المدة (أشهر) *</Label>
                      <Input type="number" min="0" max="11" className="mt-1 rounded-xl bg-white" value={modalForm.months ?? 0} onChange={e => setModalForm(prev => ({ ...prev, months: parseInt(e.target.value) || 0 }))} required />
                    </div>
                    <div>
                      <Label className="text-xs">المدة (أيام)</Label>
                      <Input type="number" min="0" max="29" className="mt-1 rounded-xl bg-white" value={modalForm.days ?? 0} onChange={e => setModalForm(prev => ({ ...prev, days: parseInt(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <Label>السبب والمبررات / التفاصيل *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.reason || ''} onChange={e => setModalForm(prev => ({ ...prev, reason: e.target.value }))} required placeholder="مثال: احتساب خدمة العلم الإلزامية بموجب كتاب وزارة الدفاع" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات إضافية</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* 11. Appreciation Form */}
              {activeModal === 'appreciation' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>رقم الأمر الإداري *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.order_number || ''} onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value }))} required placeholder="مثال: 1234/ش" />
                  </div>
                  <div>
                    <Label>تاريخ الأمر الإداري *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.order_date || ''} onChange={e => setModalForm(prev => ({ ...prev, order_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>جهة الإصدار / المانحة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.issuer || ''} onChange={e => setModalForm(prev => ({ ...prev, issuer: e.target.value }))} required placeholder="مثال: السيد المدير العام / معالي الوزير" />
                  </div>
                  <div>
                    <Label>أثر القِدَم / المكافأة *</Label>
                    <Select value={modalForm.seniority_impact} onValueChange={v => setModalForm(prev => ({ ...prev, seniority_impact: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="قدم شهر واحد">قدم شهر واحد</SelectItem>
                        <SelectItem value="قدم 6 اشهر">قدم 6 اشهر</SelectItem>
                        <SelectItem value="معنوي فقط بدون اثر">معنوي فقط بدون اثر</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>سبب / مناسبة الشكر والتقدير *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.reason || ''} onChange={e => setModalForm(prev => ({ ...prev, reason: e.target.value }))} required placeholder="أدخل أسباب ومناسبة منح كتاب الشكر والتقدير..." />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات إضافية</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="أي ملاحظات إضافية..." />
                  </div>
                </div>
              )}

              {/* 12. Penalty Form */}
              {activeModal === 'penalty' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>نوع العقوبة *</Label>
                    <Select value={modalForm.penalty_type} onValueChange={v => setModalForm(prev => ({ ...prev, penalty_type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {penaltyTypesList.map(t => {
                          const val = t.name || t;
                          return <SelectItem key={t.id || val} value={val}>{val}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>تاريخ العقوبة *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.penalty_date || ''} onChange={e => setModalForm(prev => ({ ...prev, penalty_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>رقم الأمر الإداري *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.order_number || ''} onChange={e => setModalForm(prev => ({ ...prev, order_number: e.target.value }))} required placeholder="مثال: 5678/ع" />
                  </div>
                  <div>
                    <Label>الحالة الإدارية *</Label>
                    <Select value={modalForm.status} onValueChange={v => setModalForm(prev => ({ ...prev, status: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="نافذ">نافذ</SelectItem>
                        <SelectItem value="ملغاة">ملغاة</SelectItem>
                        <SelectItem value="موقوف تنفيذها">موقوف تنفيذها</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>سبب العقوبة / المخالفة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.reason || ''} onChange={e => setModalForm(prev => ({ ...prev, reason: e.target.value }))} required placeholder="تفاصيل أسباب فرض العقوبة..." />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setActiveModal(null)} disabled={modalSaving}>إلغاء</Button>
                <Button type="submit" disabled={modalSaving} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2 font-bold px-6">
                  {modalSaving ? 'جاري الحفظ...' : 'حفظ السجل'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Access QR Modal */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl p-4 sm:p-5" dir="rtl">
          <DialogHeader className="text-right pb-1">
            <DialogTitle className="text-base font-bold text-[#1B3A6B]">
              بطاقة الوصول السريع والهوية الرقمية
            </DialogTitle>
          </DialogHeader>
          <div className="pt-1">
            <EmployeeQuickAccessQR employee={employee} />
          </div>
        </DialogContent>
      </Dialog>

      {/* 12. Service Extension Edit/Add Modal */}
      <Dialog open={extModalOpen} onOpenChange={setExtModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl p-6" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-[#1B3A6B] flex items-center gap-2">
              <Clock size={18} className="text-amber-600" />
              تثبيت / تعديل أمر تمديد الخدمة
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveExtension} className="space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>رقم الأمر الإداري بالتمديد *</Label>
                <Input
                  className="mt-1 rounded-xl"
                  value={extForm.orderNumber}
                  onChange={e => setExtForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                  required
                  placeholder="مثال: أمر 302/ث"
                />
              </div>
              <div>
                <Label>تاريخ الأمر الإداري *</Label>
                <Input
                  type="date"
                  className="mt-1 rounded-xl"
                  value={extForm.orderDate}
                  onChange={e => setExtForm(prev => ({ ...prev, orderDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>سنوات التمديد المضافة *</Label>
                <Select
                  value={String(extForm.years)}
                  onValueChange={v => setExtForm(prev => ({ ...prev, years: parseInt(v) || 0 }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(y => (
                      <SelectItem key={y} value={String(y)}>{y === 0 ? '0 سنة' : `${y} سنة`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>أشهر التمديد المضافة *</Label>
                <Select
                  value={String(extForm.months)}
                  onValueChange={v => setExtForm(prev => ({ ...prev, months: parseInt(v) || 0 }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => (
                      <SelectItem key={m} value={String(m)}>{m === 0 ? '0 شهر' : `${m} شهر`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>سبب / ملاحظة تمديد الخدمة</Label>
              <Input
                className="mt-1 rounded-xl"
                value={extForm.note}
                onChange={e => setExtForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="أدخل سبب التمديد أو التوصيات الخاصة بأمر التمديد..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-xs"
                onClick={() => setExtModalOpen(false)}
                disabled={extSaving}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={extSaving}
                className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold gap-2 px-6"
              >
                {extSaving ? 'جاري الحفظ...' : 'حفظ بيانات التمديد'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 13. Service Extension Cancel Modal */}
      <Dialog open={extCancelModalOpen} onOpenChange={setExtCancelModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
              <Power size={18} className="text-amber-600" />
              إلغاء / إيقاف تمديد الخدمة
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCancelExtension} className="space-y-4 pt-3">
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-amber-900 text-xs leading-relaxed">
              سيتم تصفير سنوات وأشهر التمديد وتدوين رقم وتاريخ أمر إلغاء التمديد في السجل الرسمي للموظف.
            </div>

            <div>
              <Label>رقم أمر إلغاء التمديد *</Label>
              <Input
                className="mt-1 rounded-xl"
                value={extCancelForm.orderNumber}
                onChange={e => setExtCancelForm(prev => ({ ...prev, orderNumber: e.target.value }))}
                required
                placeholder="أدخل رقم الأمر الإداري القاضي بالإلغاء"
              />
            </div>

            <div>
              <Label>تاريخ أمر إلغاء التمديد *</Label>
              <Input
                type="date"
                className="mt-1 rounded-xl"
                value={extCancelForm.orderDate}
                onChange={e => setExtCancelForm(prev => ({ ...prev, orderDate: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label>سبب إلغاء التمديد / ملاحظات</Label>
              <Input
                className="mt-1 rounded-xl"
                value={extCancelForm.note}
                onChange={e => setExtCancelForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="أدخل سبب أو دواعي إلغاء التمديد..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-xs"
                onClick={() => setExtCancelModalOpen(false)}
                disabled={extSaving}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={extSaving}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold gap-2 px-6"
              >
                {extSaving ? 'جاري المعالجة...' : 'تأكيد أمر الإلغاء'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* 14. Service Extension Delete Confirm Modal */}
      <Dialog open={extDeleteConfirmOpen} onOpenChange={setExtDeleteConfirmOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-red-700 flex items-center gap-2">
              <Trash2 size={18} />
              حذف بيانات تمديد الخدمة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              هل أنت متأكد من رغبتك في حذف كافة بيانات وأرقام أوامر تمديد الخدمة لهذا الموظف نهائياً؟ لا يمكن التراجع عن هذه العملية.
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-xs"
                onClick={() => setExtDeleteConfirmOpen(false)}
                disabled={extSaving}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                onClick={handleDeleteExtension}
                disabled={extSaving}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold gap-2 px-6"
              >
                {extSaving ? 'جاري الحذف...' : 'حذف التمديد نهائياً'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 15. General Record Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !deleting && setDeleteDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader className="text-right pb-2 border-b border-slate-100">
            <DialogTitle className="text-base font-bold text-red-700 flex items-center gap-2">
              <Trash2 size={18} />
              تأكيد حذف السجل
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-3">
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              هل أنت متأكد من رغبتك في حذف هذا السجل نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذه العملية بعد التأكيد.
            </p>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-xs font-bold"
                onClick={() => setDeleteDialog(prev => ({ ...prev, open: false }))}
                disabled={deleting}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                onClick={executeDeleteRecord}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold gap-2 px-6 shadow-xs"
              >
                {deleting ? 'جاري الحذف...' : 'تأكيد الحذف نهائياً'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
