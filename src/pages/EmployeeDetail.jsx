import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Plus, Trash2, Calendar, FileText, GraduationCap, DollarSign, Clock, Briefcase, Heart, MapPin, ClipboardList } from 'lucide-react';
import { formatCurrency, calculateSalary, getGradeLabel, getStepLabel, getActiveFinancialRates } from '@/lib/salaryTable';
import { useToast } from '@/components/ui/use-toast';

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

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [employee, setEmployee] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [penalties, setPenalties] = useState([]);
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
  
  const [loading, setLoading] = useState(true);
  
  // Modal states for adding records
  const [activeModal, setActiveModal] = useState(null); // 'qualification', 'assignment', 'promotion', 'allowance', 'evaluation', 'training_course', 'transfer', 'retirement', 'document'
  const [modalForm, setModalForm] = useState({});
  const [modalSaving, setModalSaving] = useState(false);

  const fetchData = () => {
    Promise.all([
      apiClient.entities.Employee.get(id),
      apiClient.entities.LeaveRequest.filter({ employee_id: id }),
      apiClient.entities.Penalty.filter({ employee_id: id }),
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
    ]).then(([emp, lv, pen, ev, tr, qual, job, prom, sal, tc, trans, ret, doc]) => {
      setEmployee(emp);
      setLeaves(lv || []);
      setPenalties(pen || []);
      setEvaluations(ev || []);
      setTrainings(tr || []);
      setQualifications(qual || []);
      setJobAssignments(job || []);
      setPromotions(prom || []);
      setSalaryAllowances(sal || []);
      setTrainingCourses(tc || []);
      setTransfers(trans || []);
      setRetirements(ret || []);
      setDocuments(doc || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      toast({ title: 'خطأ', description: 'فشل تحميل بيانات الموظف', variant: 'destructive' });
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
    </div>
  );
  if (!employee) return <div className="text-center py-12 text-slate-400">الموظف غير موجود</div>;

  const salaryCalc = calculateSalary(employee);
  const financialRates = getActiveFinancialRates();

  const classifiedCustomItems = salaryAllowances.map(sa => {
    let isTemp = false;
    let type = 'allowance';
    let timingLabel = 'دائم';
    let presetId = null;

    const presetsStr = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
    if (presetsStr) {
      try {
        const presets = JSON.parse(presetsStr);
        const matchingPreset = presets.find(p => p.name === sa.allowance_type);
        if (matchingPreset) {
          presetId = matchingPreset.id;
          type = matchingPreset.type || 'allowance';
          
          const metaStr = localStorage.getItem(`TEMPORARY_META_${matchingPreset.id}`);
          if (metaStr) {
            const meta = JSON.parse(metaStr);
            isTemp = !!meta.isTemporary;
            if (isTemp) {
              if (meta.timingType === 'range') {
                timingLabel = `مؤقت (من شهر ${meta.startMonth}/${meta.startYear} إلى شهر ${meta.endMonth}/${meta.endYear})`;
              } else {
                timingLabel = `مؤقت (شهر ${meta.paymentMonth}/${meta.paymentYear})`;
              }
            }
          }
        }
      } catch(e){}
    }

    const value = sa.amount > 0 ? sa.amount : Math.round(salaryCalc.base_salary * (sa.percentage / 100));

    return {
      ...sa,
      isTemp,
      type,
      timingLabel,
      presetId,
      resolvedAmount: value
    };
  });

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

  // Durations of service
  const totalServiceDuration = calculateServiceDuration(employee.first_appointment_date);
  const companyServiceDuration = calculateServiceDuration(employee.current_appointment_date);

  // Workplace representation
  const workplace = employee.section || employee.department || 'غير محدد';

  const openAddModal = (type) => {
    setActiveModal(type);
    let defaultValues = {};
    if (type === 'qualification') {
      defaultValues = { education_level: 'بكالوريوس', specialization: '', institution: '', graduation_year: new Date().getFullYear(), evaluation_order: '', notes: '' };
    } else if (type === 'assignment') {
      defaultValues = { assignment_date: '', assignment_order: '', job_title: '', department: '', section: '', service_type: 'دائم' };
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
    }
    setModalForm(defaultValues);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const payload = { ...modalForm, employee_id: parseInt(id) };
      
      if (activeModal === 'allowance') {
        const tempId = Date.now();
        // 1. Save preset to ALLOWANCES_DEDUCTIONS_PRESETS in localStorage
        let presets = [];
        try {
          const saved = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
          if (saved) presets = JSON.parse(saved);
        } catch (errPreset) {}

        const newPreset = {
          id: tempId,
          name: modalForm.name,
          type: modalForm.type, // 'allowance' or 'deduction'
          calcType: modalForm.calcType, // 'percentage' or 'flat'
          calc_type: modalForm.calcType,
          value: parseInt(modalForm.value) || 0,
          status: 'فعال'
        };
        presets.push(newPreset);
        localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(presets));

        // 2. Save metadata to TEMPORARY_META_${tempId} in localStorage
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
        localStorage.setItem(`TEMPORARY_META_${tempId}`, JSON.stringify(tempMeta));

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

        toast({ title: 'تم إضافة المخصص/الاستقطاع المؤقت', description: 'تم حفظ المخصص المؤقت للموظف بنجاح وجاري تطبيقه في احتساب الراتب' });
        setActiveModal(null);
        fetchData();
        return;
      }

      // Map entity names to match API client definitions
      let clientName = '';
      if (activeModal === 'qualification') clientName = 'Qualification';
      else if (activeModal === 'assignment') clientName = 'JobAssignment';
      else if (activeModal === 'promotion') clientName = 'PromotionIncrement';
      else if (activeModal === 'evaluation') clientName = 'AnnualEvaluation';
      else if (activeModal === 'training_course') clientName = 'TrainingCourse';
      else if (activeModal === 'transfer') clientName = 'Transfer';
      else if (activeModal === 'retirement') clientName = 'Retirement';
      else if (activeModal === 'document') clientName = 'Document';

      if (!clientName) {
        setModalSaving(false);
        return;
      }

      await apiClient.entities[clientName].create(payload);
      toast({ title: 'تم حفظ السجل', description: 'تمت إضافة السجل إلى قاعدة البيانات بنجاح' });
      setActiveModal(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'فشلت العملية', description: 'حدث خطأ أثناء حفظ البيانات', variant: 'destructive' });
    } finally {
      setModalSaving(false);
    }
  };

  const deleteRecord = async (clientName, recordId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      if (clientName === 'SalaryAllowance') {
        // Find the record first to get its name/type to clean up presets if needed
        try {
          const list = await apiClient.entities.SalaryAllowance.filter({ employee_id: id });
          const recordToDelete = list.find(r => r.id === recordId);
          if (recordToDelete) {
            // Clean up presets in localStorage
            const presetsStr = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
            if (presetsStr) {
              const presets = JSON.parse(presetsStr);
              // filter out any preset that has the same name and is temporary for this employee
              const nextPresets = presets.filter(p => {
                const metaStr = localStorage.getItem(`TEMPORARY_META_${p.id}`);
                if (metaStr) {
                  const meta = JSON.parse(metaStr);
                  if (meta.isTemporary && p.name === recordToDelete.allowance_type && meta.directEmployeeIds?.map(String).includes(String(id))) {
                    // Clean up metadata
                    localStorage.removeItem(`TEMPORARY_META_${p.id}`);
                    return false;
                  }
                }
                return true;
              });
              localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(nextPresets));
            }
          }
        } catch (errPresetCleanup) {
          console.error('Error cleaning up local storage preset:', errPresetCleanup);
        }
      }
      await apiClient.entities[clientName].delete(recordId);
      toast({ title: 'تم الحذف', description: 'تم إزالة السجل بنجاح' });
      fetchData();
    } catch (err) {
      console.error(err);
      toast({ title: 'فشلت العملية', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
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
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row items-center gap-5 text-center md:text-right">
          <div className="relative">
            {employee.photo ? (
              <img src={employee.photo} alt={employee.full_name} className="w-20 h-20 rounded-2xl object-cover border border-slate-200 shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B3A6B] to-[#122748] flex items-center justify-center text-white text-3xl font-extrabold shadow-sm">
                {employee.full_name?.charAt(0)}
              </div>
            )}
            <span className="absolute -bottom-1 -right-1 bg-yellow-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm">ID</span>
          </div>
          <div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <h1 className="text-2xl font-bold text-[#1B3A6B]">{employee.full_name} {employee.surname}</h1>
              <span className="text-slate-400 hidden md:inline">|</span>
              <span className="text-sm font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">رقم الشركة: {employee.company_number || 'بدون'}</span>
            </div>
            <p className="text-slate-500 text-sm font-medium mt-1">
              {employee.job_title || 'بدون عنوان وظيفي'} &bull; {employee.section || employee.department || 'الدائرة العامة'} &bull; موقع العمل: {employee.work_location || 'غير محدد'}
            </p>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                employee.status === 'مستمر' ? 'bg-green-100 text-green-700' :
                employee.status === 'مجاز' ? 'bg-orange-100 text-orange-700' :
                employee.status === 'موقوف' ? 'bg-red-100 text-red-700' :
                employee.status === 'متقاعد' || employee.status === 'مستقيل' ? 'bg-rose-100 text-rose-700' :
                'bg-blue-100 text-blue-700'
              }`}>حالة الموظف: {employee.status || 'مستمر'}</span>
              <span className="bg-[#1B3A6B]/5 text-[#1B3A6B] px-3 py-1 rounded-full text-xs font-bold">{employee.grade >= 11 ? getGradeLabel(employee.grade) : `الدرجة ${getGradeLabel(employee.grade)}`} / المرحلة {employee.step}</span>
              <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold">الرقم الوظيفي: {employee.civil_service_number || 'غير متوفر'}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-2">
          <Link to={`/employees/${id}/edit`}>
            <Button variant="outline" className="rounded-xl gap-2 border-[#1B3A6B] text-[#1B3A6B] font-bold px-5">
              <Edit size={16} /> تعديل الملف الأساسي
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'الراتب الأساسي', value: formatCurrency(salaryCalc.base_salary), color: 'text-[#1B3A6B]', icon: DollarSign },
          { label: 'صافي الراتب المتوقع', value: formatCurrency(displayedNetSalary), color: 'text-green-600', icon: DollarSign },
          { label: 'تاريخ المباشرة الأولى', value: employee.first_appointment_date || '—', color: 'text-blue-600', icon: Calendar },
          { label: 'تاريخ المباشرة في هذه الشركة', value: employee.current_appointment_date || '—', color: 'text-indigo-600', icon: Calendar },
          { label: 'رصيد الإجازات الاعتيادية', value: `${regularLeaveBalance} يوم`, color: 'text-emerald-600', icon: ClipboardList },
          { label: 'رصيد الإجازات المرضية', value: `${sickLeaveBalance} يوم`, color: 'text-rose-500', icon: Heart },
          { label: 'مدة الخدمة الكلية', value: totalServiceDuration, color: 'text-amber-600 text-xs font-bold', icon: Clock },
          { label: 'مدة الخدمة في هذه الشركة', value: companyServiceDuration, color: 'text-teal-600 text-xs font-bold', icon: Briefcase },
          { label: 'حالة الموظف الحالية', value: employee.status || 'مستمر', color: 'text-amber-600 text-xs font-bold', icon: ClipboardList },
          { label: 'موقع العمل في الشركة', value: employee.work_location || 'غير محدد', color: 'text-indigo-600 text-xs font-bold', icon: MapPin },
          { label: 'جهة العمل (الهيكل التنظيمي)', value: workplace, color: 'text-[#1B3A6B] text-xs font-bold', icon: MapPin, className: 'sm:col-span-2' },
        ].map((s, i) => {
          const IconComponent = s.icon;
          return (
            <div key={i} className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex justify-between items-center hover:shadow-md transition-all ${s.className || ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-[10px] font-bold mb-1 truncate">{s.label}</p>
                <p className={`text-sm font-extrabold truncate ${s.color}`} title={s.value}>{s.value}</p>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 shrink-0 mr-2">
                <IconComponent size={18} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="personal" dir="rtl" className="w-full">
        <TabsList className="bg-white border border-slate-200 rounded-xl p-1 flex flex-wrap gap-1 h-auto overflow-x-auto justify-start">
          <TabsTrigger value="personal" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">البيانات الشخصية</TabsTrigger>
          <TabsTrigger value="job" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">البيانات الوظيفية</TabsTrigger>
          <TabsTrigger value="qualifications" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">المؤهلات الدراسية ({qualifications.length})</TabsTrigger>
          <TabsTrigger value="salary" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">مخصصات الراتب ({salaryAllowances.length})</TabsTrigger>
          <TabsTrigger value="promotions" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">الترقيات والعلاوات ({promotions.length})</TabsTrigger>
          <TabsTrigger value="leaves" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">الإجازات ({leaves.length})</TabsTrigger>
          <TabsTrigger value="penalties" className="rounded-lg text-xs font-bold px-4 py-2.5 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">العقوبات ({penalties.length})</TabsTrigger>
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
              <h3 className="text-lg font-bold text-[#1B3A6B]">تفاصيل الملف الشخصي والهوية</h3>
              <p className="text-xs text-slate-400 mt-0.5">المعلومات الشخصية والبيانات الحيوية المسجلة للموظف</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* 1. معلومات الهوية الأساسية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">معلومات الهوية الأساسية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الاسم الكامل" value={`${employee.full_name} ${employee.surname}`} />
                  <InfoRow label="الرقم الوظيفي (التخطيط)" value={employee.civil_service_number} />
                  <InfoRow label="رقم الشركة الموحد" value={employee.company_number} />
                </div>
              </div>

              {/* 2. المعلومات الحيوية والاجتماعية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">المعلومات الحيوية والاجتماعية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الجنس" value={employee.gender} />
                  <InfoRow label="تاريخ الميلاد" value={employee.birth_date} />
                  <InfoRow label="محل الميلاد" value={employee.birth_place} />
                  <InfoRow label="الجنسية" value={employee.nationality} />
                  <InfoRow label="الديانة" value={employee.religion} />
                  <InfoRow label="فصيلة الدم" value={employee.blood_type || 'غير معروف'} />
                  <InfoRow label="الحالة الاجتماعية" value={employee.marital_status} />
                  <InfoRow label="عدد الأولاد المعالين" value={employee.children_count} />
                </div>
              </div>

              {/* 3. المستندات الثبوتية */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">المستندات الثبوتية</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="رقم البطاقة الوطنية / الهوية" value={employee.national_id || 'غير متوفر'} />
                  <InfoRow label="رقم بطاقة السكن" value={employee.residence_card || 'غير متوفر'} />
                  <InfoRow label="رقم الجواز" value={employee.passport_number || 'غير متوفر'} />
                </div>
              </div>

              {/* 4. بيانات الاتصال والسكن */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">بيانات الاتصال والسكن</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="عنوان السكن" value={employee.address || 'غير محدد'} />
                  <InfoRow label="رقم الهاتف" value={employee.phone || 'غير متوفر'} />
                  <InfoRow label="البريد الإلكتروني" value={employee.email || 'غير متوفر'} />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 2. Job Tab */}
        <TabsContent value="job" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
              <div>
                <h3 className="text-lg font-bold text-[#1B3A6B]">البيانات الوظيفية والخدمة</h3>
                <p className="text-xs text-slate-400 mt-0.5">معلومات التعيين، التسكين الوظيفي، وتاريخ التكاليف الإدارية</p>
              </div>
              <Button size="sm" onClick={() => openAddModal('assignment')} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-1">
                <Plus size={14} /> تسجيل تكليف جديد
              </Button>
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
                  <InfoRow label="القسم" value={employee.department || 'غير محدد'} />
                  <InfoRow label="الشعبة / الفرع" value={employee.section || 'غير محدد'} />
                  <InfoRow label="موقع العمل للشركة" value={employee.work_location || 'غير محدد'} />
                  <InfoRow label="طبيعة العمل" value={employee.work_nature || 'مكتبي'} />
                  <InfoRow label="نوع الخدمة" value={employee.service_type || 'غير محدد'} />
                  <InfoRow label="المسؤولية الأساسية" value={employee.primary_responsibility || 'بلا مسؤولية'} />
                  <InfoRow label="المسؤولية بالوكالة" value={employee.acting_responsibility || 'بلا وكالة'} />
                  <InfoRow label="درجة الوكيل" value={employee.deputy_level || 'لا يوجد'} />
                </div>
              </div>

              {/* 3. الدرجة الوظيفية (سلم الرواتب) */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100/80">
                <div className="pb-2 border-b border-slate-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h4 className="font-bold text-xs text-[#1B3A6B]">الدرجة الوظيفية (سلم الرواتب)</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="الدرجة الوظيفية" value={employee.grade >= 11 ? getGradeLabel(employee.grade) : `الدرجة ${getGradeLabel(employee.grade)}`} />
                  <InfoRow label="المرحلة" value={`المرحلة ${employee.step}`} />
                  <InfoRow label="تاريخ الدرجة الحالية" value={employee.grade_date || 'غير محدد'} />
                </div>
              </div>

              {/* 4. الأرقام التعريفية والسجلات الإدارية */}
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
                </div>
              </div>

              {/* 5. احتساب الخدمة الفعلية */}
              <div className="bg-emerald-50/40 p-5 rounded-2xl border border-emerald-100/80">
                <div className="pb-2 border-b border-emerald-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-emerald-600 rounded-full" />
                  <h4 className="font-bold text-xs text-emerald-800">احتساب الخدمة الفعلية (يوم/شهر/سنة)</h4>
                </div>
                <div className="space-y-3.5">
                  <div>
                    <span className="text-xs text-slate-500 font-semibold block">تاريخ المباشرة الأولى (الخدمة الكلية):</span>
                    <span className="text-slate-800 text-xs font-bold font-mono mt-0.5 block">{employee.first_appointment_date || '—'}</span>
                    <div className="mt-1 bg-white border border-emerald-100 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                      <span className="text-[11px] text-emerald-800 font-medium">الخدمة الكلية المعتمدة:</span>
                      <span className="text-xs text-emerald-700 font-extrabold">{calculateServiceDuration(employee.first_appointment_date)}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500 font-semibold block">تاريخ المباشرة في هذه الشركة:</span>
                    <span className="text-slate-800 text-xs font-bold font-mono mt-0.5 block">{employee.current_appointment_date || '—'}</span>
                    <div className="mt-1 bg-white border border-emerald-100 rounded-lg px-2.5 py-1.5 flex justify-between items-center">
                      <span className="text-[11px] text-emerald-800 font-medium">الخدمة في هذه الشركة:</span>
                      <span className="text-xs text-emerald-700 font-extrabold">{calculateServiceDuration(employee.current_appointment_date)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. أرصدة الإجازات الافتتاحية */}
              <div className="bg-teal-50/40 p-5 rounded-2xl border border-teal-100/80">
                <div className="pb-2 border-b border-teal-200/60 flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-4 bg-teal-600 rounded-full" />
                  <h4 className="font-bold text-xs text-teal-800">أرصدة الإجازات الافتتاحية (عند المباشرة)</h4>
                </div>
                <div className="space-y-1">
                  <InfoRow label="رصيد الإجازات الاعتيادية الابتدائي" value={employee.initial_regular_leave_balance !== undefined ? `${employee.initial_regular_leave_balance} يوم` : '0 يوم'} />
                  <InfoRow label="رصيد الإجازات المرضية الابتدائي" value={employee.initial_sick_leave_balance !== undefined ? `${employee.initial_sick_leave_balance} يوم` : '0 يوم'} />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <h4 className="text-sm font-bold text-[#1B3A6B] mb-3 flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-yellow-500 rounded-full" />
                تاريخ التكاليف والتغييرات الإدارية
              </h4>
              <div className="overflow-x-auto border border-slate-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                      <th className="text-right px-4 py-2.5 font-bold">العنوان الوظيفي</th>
                      <th className="text-right px-4 py-2.5 font-bold">الدائرة / القسم</th>
                      <th className="text-right px-4 py-2.5 font-bold">تاريخ التكليف</th>
                      <th className="text-right px-4 py-2.5 font-bold">الأمر الإداري</th>
                      <th className="text-right px-4 py-2.5 font-bold">نوع الخدمة</th>
                      <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobAssignments.map(ja => (
                      <tr key={ja.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{ja.job_title}</td>
                        <td className="px-4 py-2.5 text-slate-600">{ja.department} / {ja.section}</td>
                        <td className="px-4 py-2.5 text-slate-600">{ja.assignment_date}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{ja.assignment_order}</td>
                        <td className="px-4 py-2.5"><span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">{ja.service_type}</span></td>
                        <td className="px-4 py-2.5 text-center">
                          <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('JobAssignment', ja.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {jobAssignments.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد سجلات تكليف تاريخية مضافة</td>
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
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-[#1B3A6B]">التحصيل الدراسي والشهادات الحاصل عليها الموظف</h3>
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
                    <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifications.map(q => (
                    <tr key={q.id} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-bold text-[#1B3A6B] flex items-center gap-2">
                        <GraduationCap size={16} className="text-slate-400" />
                        {q.education_level}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 font-semibold">{q.specialization || 'بدون تخصص'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{q.institution}</td>
                      <td className="px-4 py-2.5 text-slate-600">{q.graduation_year}</td>
                      <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{q.evaluation_order || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('Qualification', q.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {qualifications.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد مؤهلات تاريخية مسجلة</td>
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
                        <tr key={sa.id} className="hover:bg-slate-50/30 bg-emerald-50/10">
                          <td className="px-4 py-3 font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {sa.allowance_type}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              sa.isTemp ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                            }`}>
                              {sa.isTemp ? 'مؤقت' : 'دائم'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {sa.isTemp ? sa.timingLabel : 'مدرج كبند مخصص دائم للموظف'} &bull; الأمر: {sa.order_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-left font-mono font-bold text-emerald-700 text-xs">{formatCurrency(sa.resolvedAmount)}</td>
                          <td className="px-4 py-3 text-center">
                            <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7" onClick={() => deleteRecord('SalaryAllowance', sa.id)}>
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
                        <tr key={sa.id} className="hover:bg-slate-50/30 bg-red-50/5">
                          <td className="px-4 py-3 font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                            {sa.allowance_type}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold ${
                              sa.isTemp ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {sa.isTemp ? 'مؤقت' : 'دائم'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {sa.isTemp ? sa.timingLabel : 'مدرج كاستقطاع مخصص دائم للموظف'} &bull; الأمر: {sa.order_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-left font-mono font-bold text-red-700 text-xs">{formatCurrency(sa.resolvedAmount)}</td>
                          <td className="px-4 py-3 text-center">
                            <Button size="icon" variant="ghost" className="text-red-500 h-7 w-7" onClick={() => deleteRecord('SalaryAllowance', sa.id)}>
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
        <TabsContent value="promotions" className="mt-5">
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
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('PromotionIncrement', p.id)}>
                          <Trash2 size={14} />
                        </Button>
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

        {/* 7. Penalties Tab */}
        <TabsContent value="penalties" className="mt-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-base font-bold text-red-700">العقوبات الإدارية والانضباطية</h3>
              <Link to={`/penalties/new?employee=${id}`}>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white rounded-xl gap-1">
                  <Plus size={14} /> تسجيل عقوبة جديدة
                </Button>
              </Link>
            </div>
            
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <th className="text-right px-4 py-2.5 font-bold">نوع العقوبة</th>
                  <th className="text-right px-4 py-2.5 font-bold">التاريخ</th>
                  <th className="text-right px-4 py-2.5 font-bold">رقم الأمر</th>
                  <th className="text-right px-4 py-2.5 font-bold">سبب العقوبة</th>
                  <th className="text-right px-4 py-2.5 font-bold">الحالة الإدارية</th>
                  <th className="text-center px-4 py-2.5 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {penalties.map(p => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="px-4 py-2.5 font-bold text-red-700">{p.penalty_type}</td>
                    <td className="px-4 py-2.5 text-slate-600">{p.penalty_date}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{p.order_number}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{p.reason}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.status === 'نافذ' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('Penalty', p.id)}>
                        <Trash2 size={14} />
                      </Button>
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
                      <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('AnnualEvaluation', ev.id)}>
                        <Trash2 size={14} />
                      </Button>
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
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('TrainingCourse', tc.id)}>
                          <Trash2 size={14} />
                        </Button>
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
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('Transfer', tr.id)}>
                          <Trash2 size={14} />
                        </Button>
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
        <TabsContent value="retirement" className="mt-5">
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
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('Retirement', r.id)}>
                          <Trash2 size={14} />
                        </Button>
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
                        <Button size="icon" variant="ghost" className="text-red-500 h-8 w-8" onClick={() => deleteRecord('Document', d.id)}>
                          <Trash2 size={14} />
                        </Button>
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
                {activeModal === 'qualification' && 'إضافة مؤهل علمي جديد'}
                {activeModal === 'assignment' && 'تسجيل تكليف/وظيفة جديدة'}
                {activeModal === 'promotion' && 'تسجيل ترفيع/علاوة جديدة'}
                {activeModal === 'allowance' && 'إضافة مخصص أو استقطاع مؤقت جديد'}
                {activeModal === 'evaluation' && 'إضافة تقييم سنوي جديد'}
                {activeModal === 'training_course' && 'تسجيل دورة تدريبية جديدة'}
                {activeModal === 'transfer' && 'تسجيل معاملة نقل/تنسيب'}
                {activeModal === 'retirement' && 'تسجيل معاملة تقاعد جديدة'}
                {activeModal === 'document' && 'إضافة مستند/وثيقة جديدة'}
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
                        {['دكتوراه','ماجستير','بكالوريوس','دبلوم عالي','دبلوم','إعدادية','متوسطة','ابتدائية'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
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
                    <Input className="mt-1 rounded-xl" value={modalForm.evaluation_order || ''} onChange={e => setModalForm(prev => ({ ...prev, evaluation_order: e.target.value }))} placeholder="أ د / 1234" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>ملاحظات إضافية</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.notes || ''} onChange={e => setModalForm(prev => ({ ...prev, notes: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* 2. Job Assignment Form */}
              {activeModal === 'assignment' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>العنوان الوظيفي *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.job_title || ''} onChange={e => setModalForm(prev => ({ ...prev, job_title: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>تاريخ المباشرة/التكليف *</Label>
                    <Input type="date" className="mt-1 rounded-xl" value={modalForm.assignment_date || ''} onChange={e => setModalForm(prev => ({ ...prev, assignment_date: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>الدائرة / الوزارة / الهيئة *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.department || ''} onChange={e => setModalForm(prev => ({ ...prev, department: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>القسم / الشعبة / الوحدة</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.section || ''} onChange={e => setModalForm(prev => ({ ...prev, section: e.target.value }))} />
                  </div>
                  <div>
                    <Label>رقم الأمر الإداري بالتكليف *</Label>
                    <Input className="mt-1 rounded-xl" value={modalForm.assignment_order || ''} onChange={e => setModalForm(prev => ({ ...prev, assignment_order: e.target.value }))} required />
                  </div>
                  <div>
                    <Label>نوع الخدمة *</Label>
                    <Select value={modalForm.service_type} onValueChange={v => setModalForm(prev => ({ ...prev, service_type: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['دائم','مؤقت','عقد','إعارة'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
    </div>
  );
}
