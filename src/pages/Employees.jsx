import { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient, request } from '@/api/apiClient';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2, Filter, RotateCcw, ChevronDown, ChevronUp, Users, Sparkles, QrCode, Settings2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import EmployeeQuickAccessQR from '@/components/employee/EmployeeQuickAccessQR';
import ConfirmDeleteDialog from '@/components/performance/ConfirmDeleteDialog';
import { fetchEducationDegreesSorted, fetchResponsibilityAllowancesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';
import { PENDING_VALUE } from './EmployeeForm';

const STATUS_COLORS = {
  'مستمر': 'bg-green-100 text-green-700',
  'منسب': 'bg-blue-100 text-blue-700',
  'منقول': 'bg-purple-100 text-purple-700',
  'متقاعد': 'bg-slate-100 text-slate-600',
  'متقاعد مع تمديد': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  'مستقيل': 'bg-stone-100 text-stone-600',
  'موقوف': 'bg-red-100 text-red-700',
  'مجاز': 'bg-orange-100 text-orange-700',
};

// الحالة الافتراضية المعروضة في جدول الموظفين عند فتح الصفحة (31-08-2026): "مستمر" فقط،
// مع بطاقات إحصائية للتنقل بين بقية الحالات (منسب / منقول / متقاعد ...) بدل عرض الجميع دفعة واحدة.
const DEFAULT_STATUS_FILTER = 'مستمر';

const EDUCATION_LEVELS = [
  'دكتوراه',
  'ماجستير',
  'دبلوم عالٍ',
  'بكالوريوس',
  'دبلوم',
  'إعدادية',
  'متوسطة',
  'ابتدائية',
  'بدون',
];

const MARITAL_STATUSES = ['أعزب', 'متزوج', 'مطلق', 'أرمل'];

const RELIGIONS = ['مسلم', 'مسيحي', 'إيزيدي', 'صابيئي', 'آخر'];

const ETHNICITIES = ['عربي/ة', 'كردي/ة', 'تركماني/ة', 'كلداني/ة', 'آشوري/ة', 'سرياني/ة', 'أرمني/ة', 'أخرى'];

const ORG_TYPES = ['هيئة', 'قسم مركزي', 'قسم', 'شعبة', 'وحدة'];

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [qrEmployee, setQrEmployee] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Entities for lookup options
  const [orgUnits, setOrgUnits] = useState([]);
  const [shiftSystems, setShiftSystems] = useState([]);
  const [workLocations, setWorkLocations] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [educationDegrees, setEducationDegrees] = useState([]);
  const [serviceTypes, setServiceTypes] = useState([]);
  const [employeeStatuses, setEmployeeStatuses] = useState([]);
  const [statusCounts, setStatusCounts] = useState({}); // { statusName: count } - لبطاقات إحصائية الحالات
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [newStatusName, setNewStatusName] = useState('');
  const [statusManagerBusy, setStatusManagerBusy] = useState(false);
  const [statusManagerError, setStatusManagerError] = useState('');
  const [deletingStatusId, setDeletingStatusId] = useState(null);
  // نافذة تأكيد الحذف الاحترافية المنبثقة (بديل window.confirm) لكل من حذف موظف وحذف حالة موظف
  const [confirmDeleteEmployee, setConfirmDeleteEmployee] = useState(null);
  const [confirmDeleteStatus, setConfirmDeleteStatus] = useState(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [religionFilter, setReligionFilter] = useState('all');
  const [ethnicityFilter, setEthnicityFilter] = useState('all');
  const [maritalStatusFilter, setMaritalStatusFilter] = useState('all');
  const [jobTitleFilter, setJobTitleFilter] = useState('all');
  const [primaryRespFilter, setPrimaryRespFilter] = useState('all');
  const [actingRespFilter, setActingRespFilter] = useState('all');
  const [deputyLevelFilter, setDeputyLevelFilter] = useState('all');
  const [orgTypeFilter, setOrgTypeFilter] = useState('all');
  const [orgUnitFilter, setOrgUnitFilter] = useState('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [extensionFilter, setExtensionFilter] = useState('all');
  const [workLocationFilter, setWorkLocationFilter] = useState('all');
  const [workNatureFilter, setWorkNatureFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [stepFilter, setStepFilter] = useState('all');
  const [educationFilter, setEducationFilter] = useState('all');
  const [workShiftTypeFilter, setWorkShiftTypeFilter] = useState('all');
  const [shiftSystemFilter, setShiftSystemFilter] = useState('all');
  const [dataCompletenessFilter, setDataCompletenessFilter] = useState('all'); // بيانات غير مكتملة: all | incomplete | complete

  // ترقيم من جهة الخادم (31-08-2026): النظام مُعَد لاستقبال 10-20 ألف قيد موظف مستقبلاً، فأصبحت
  // القائمة تُجلب صفحة بصفحة من الخادم (مع كل الفلاتر) بدل تحميل كل السجلات دفعة واحدة إلى المتصفح.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [jobTitlesDirectory, setJobTitlesDirectory] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const { toast } = useToast();

  // بيانات القوائم المرجعية للفلاتر (لا تعتمد على الصفحة الحالية من الموظفين) - تُحمَّل مرة واحدة
  const loadLookups = async () => {
    try {
      const [orgs, shifts, locs, resps, eduDegrees, svcTypes, empStatuses, jobTitlesRes] = await Promise.all([
        apiClient.entities.OrgUnit.list().catch(() => []),
        apiClient.entities.ShiftSystem.list().catch(() => []),
        apiClient.entities.WorkLocation.list().catch(() => []),
        fetchResponsibilityAllowancesSorted().catch(() => []),
        fetchEducationDegreesSorted().catch(() => []),
        apiClient.entities.ServiceType.list().catch(() => []),
        apiClient.entities.EmployeeStatus.list().catch(() => []),
        apiClient.entities.JobTitle.list().catch(() => []),
      ]);
      setOrgUnits(orgs || []);
      setShiftSystems(shifts || []);
      setWorkLocations(locs || []);
      setResponsibilities(resps || []);
      setEducationDegrees(eduDegrees || []);
      setServiceTypes(Array.isArray(svcTypes) ? svcTypes : []);
      setEmployeeStatuses(Array.isArray(empStatuses) ? empStatuses : []);
      const activeTitles = Array.isArray(jobTitlesRes)
        ? jobTitlesRes.filter(t => !t.status || t.status === 'فعال' || t.status !== 'معطل')
        : [];
      setJobTitlesDirectory(activeTitles);
    } catch (err) {
      console.error('Error loading employee filtering lookups:', err);
    }
  };

  // جلب صفحة الموظفين الحالية من الخادم، مع كل الفلاتر المفعّلة حالياً (فلترة وترقيم من جهة الخادم)
  const employeesRequestEpoch = useRef(0);
  const loadEmployeesPage = async () => {
    const epoch = ++employeesRequestEpoch.current;
    setListLoading(true);
    try {
      const query = {
        page,
        pageSize,
        search: search || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        religion: religionFilter !== 'all' ? religionFilter : undefined,
        ethnicity: ethnicityFilter !== 'all' ? ethnicityFilter : undefined,
        marital_status: maritalStatusFilter !== 'all' ? maritalStatusFilter : undefined,
        job_title: jobTitleFilter !== 'all' ? jobTitleFilter : undefined,
        primary_resp: primaryRespFilter !== 'all' ? primaryRespFilter : undefined,
        acting_resp: actingRespFilter !== 'all' ? actingRespFilter : undefined,
        deputy_level: deputyLevelFilter !== 'all' ? deputyLevelFilter : undefined,
        org_type: orgTypeFilter !== 'all' ? orgTypeFilter : undefined,
        org_unit: orgUnitFilter !== 'all' ? orgUnitFilter : undefined,
        service_type: serviceTypeFilter !== 'all' ? serviceTypeFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        extension: extensionFilter !== 'all' ? extensionFilter : undefined,
        work_location: workLocationFilter !== 'all' ? workLocationFilter : undefined,
        work_nature: workNatureFilter !== 'all' ? workNatureFilter : undefined,
        grade: gradeFilter !== 'all' ? gradeFilter : undefined,
        step: stepFilter !== 'all' ? stepFilter : undefined,
        education: educationFilter !== 'all' ? educationFilter : undefined,
        work_shift_type: workShiftTypeFilter !== 'all' ? workShiftTypeFilter : undefined,
        shift_system: shiftSystemFilter !== 'all' ? shiftSystemFilter : undefined,
        data_completeness: dataCompletenessFilter !== 'all' ? dataCompletenessFilter : undefined,
      };
      const res = await apiClient.entities.Employee.filter(query);
      if (epoch !== employeesRequestEpoch.current) return; // استجابة متأخرة لطلب سابق - تُهمَل
      if (res && Array.isArray(res.data)) {
        setEmployees(res.data);
        setTotalFiltered(res.total || 0);
      } else if (Array.isArray(res)) {
        // احتياط: توافق مع أي استجابة قديمة غير مرقّمة (نظرياً لا يجب أن يحدث مع معامل page)
        setEmployees(res);
        setTotalFiltered(res.length);
      } else {
        setEmployees([]);
        setTotalFiltered(0);
      }
    } catch (err) {
      if (epoch !== employeesRequestEpoch.current) return;
      console.error('Error loading employees page:', err);
      setEmployees([]);
      setTotalFiltered(0);
    } finally {
      if (epoch === employeesRequestEpoch.current) setListLoading(false);
    }
  };

  // العدد الكلي لجميع الموظفين بلا أي فلترة (لعرض "X من أصل Y")، يُحدَّث مع كل تحميل/حذف/إضافة
  const loadTotalAll = async () => {
    try {
      const res = await apiClient.entities.Employee.filter({ page: 1, pageSize: 1 });
      if (res && typeof res.total === 'number') {
        setTotalAll(res.total);
      } else if (Array.isArray(res)) {
        // احتياط: خادم قديم لا يدعم بعد الترقيم من جهة الخادم (قبل إعادة تشغيله بالنسخة الجديدة)
        setTotalAll(res.length);
      }
    } catch (err) {
      console.error('Error loading total employees count:', err);
    }
  };

  // إحصائية عدد الموظفين ضمن كل حالة (لبطاقات التنقل بين الحالات أعلى الجدول)
  const loadStatusCounts = async () => {
    try {
      const res = await request('/api/employees/status-counts');
      setStatusCounts((res && res.counts) || {});
    } catch (err) {
      console.error('Error loading employee status counts:', err);
    }
  };

  useEffect(() => {
    loadLookups();
    loadTotalAll();
    loadStatusCounts();

    const unsubscribe = subscribeToSettingsUpdates(() => {
      loadLookups();
    });

    return () => unsubscribe();
  }, []);

  // تأخير قصير (Debounce) قبل إرسال طلب جديد للخادم عند تغيّر أي فلتر أو البحث النصي، لتفادي إرسال
  // طلب مع كل ضغطة حرف أثناء الكتابة في مربع البحث تحديداً؛ التنقل بين الصفحات نفسه فوري بلا تأخير.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadEmployeesPage();
    }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [
    page, pageSize, search, genderFilter, religionFilter, ethnicityFilter, maritalStatusFilter, jobTitleFilter,
    primaryRespFilter, actingRespFilter, deputyLevelFilter, orgTypeFilter, orgUnitFilter,
    serviceTypeFilter, statusFilter, extensionFilter, workLocationFilter, workNatureFilter, gradeFilter,
    stepFilter, educationFilter, workShiftTypeFilter, shiftSystemFilter, dataCompletenessFilter
  ]);

  // إعادة الصفحة إلى 1 تلقائياً عند تغيّر أي فلتر أو البحث (وليس عند تغيّر الصفحة نفسها)
  useEffect(() => {
    setPage(1);
  }, [
    search, genderFilter, religionFilter, ethnicityFilter, maritalStatusFilter, jobTitleFilter,
    primaryRespFilter, actingRespFilter, deputyLevelFilter, orgTypeFilter, orgUnitFilter,
    serviceTypeFilter, statusFilter, extensionFilter, workLocationFilter, workNatureFilter, gradeFilter,
    stepFilter, educationFilter, workShiftTypeFilter, shiftSystemFilter, dataCompletenessFilter, pageSize
  ]);

  // قوائم الفلاتر المرجعية - تعتمد الآن على الدليل الرسمي (job-titles / org-units) وليس على
  // الصفحة الحالية المحمَّلة من الموظفين (التي تحوي بعد الترقيم من جهة الخادم صفحة واحدة فقط)
  const uniqueJobTitles = useMemo(() => {
    const set = new Set();
    jobTitlesDirectory.forEach(t => { if (t.name?.trim()) set.add(t.name.trim()); });
    return Array.from(set).sort();
  }, [jobTitlesDirectory]);

  const uniqueDepartmentsAndSections = useMemo(() => {
    const set = new Set();
    orgUnits.forEach(u => { if (u.name?.trim()) set.add(u.name.trim()); });
    return Array.from(set).sort();
  }, [orgUnits]);

  // Count Active Filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (genderFilter !== 'all') count++;
    if (religionFilter !== 'all') count++;
    if (ethnicityFilter !== 'all') count++;
    if (maritalStatusFilter !== 'all') count++;
    if (jobTitleFilter !== 'all') count++;
    if (primaryRespFilter !== 'all') count++;
    if (actingRespFilter !== 'all') count++;
    if (deputyLevelFilter !== 'all') count++;
    if (orgTypeFilter !== 'all') count++;
    if (orgUnitFilter !== 'all') count++;
    if (serviceTypeFilter !== 'all') count++;
    if (statusFilter !== DEFAULT_STATUS_FILTER) count++;
    if (extensionFilter !== 'all') count++;
    if (workLocationFilter !== 'all') count++;
    if (workNatureFilter !== 'all') count++;
    if (gradeFilter !== 'all') count++;
    if (stepFilter !== 'all') count++;
    if (educationFilter !== 'all') count++;
    if (workShiftTypeFilter !== 'all') count++;
    if (shiftSystemFilter !== 'all') count++;
    if (dataCompletenessFilter !== 'all') count++;
    return count;
  }, [
    genderFilter, religionFilter, ethnicityFilter, maritalStatusFilter, jobTitleFilter, primaryRespFilter,
    actingRespFilter, deputyLevelFilter, orgTypeFilter, orgUnitFilter, serviceTypeFilter,
    statusFilter, extensionFilter, workLocationFilter, workNatureFilter, gradeFilter, stepFilter,
    educationFilter, workShiftTypeFilter, shiftSystemFilter, dataCompletenessFilter
  ]);

  const resetFilters = () => {
    setPage(1);
    setSearch('');
    setGenderFilter('all');
    setReligionFilter('all');
    setEthnicityFilter('all');
    setMaritalStatusFilter('all');
    setJobTitleFilter('all');
    setPrimaryRespFilter('all');
    setActingRespFilter('all');
    setDeputyLevelFilter('all');
    setOrgTypeFilter('all');
    setOrgUnitFilter('all');
    setServiceTypeFilter('all');
    setStatusFilter(DEFAULT_STATUS_FILTER);
    setExtensionFilter('all');
    setWorkLocationFilter('all');
    setWorkNatureFilter('all');
    setGradeFilter('all');
    setStepFilter('all');
    setEducationFilter('all');
    setWorkShiftTypeFilter('all');
    setShiftSystemFilter('all');
    setDataCompletenessFilter('all');
  };

  // فحص ما إذا كان سجل الموظف يحتوي على حقل واحد على الأقل بقيمة "سيتم تسجيله لاحقاً"
  // ملاحظة (قاعدة صارمة): يجب تحديث هذا الفحص كلما أُضيف حقل جديد يدعم آلية "سيتم تسجيله لاحقاً" في نموذج الموظف
  const employeeHasIncompleteData = (e) => {
    if (!e) return false;
    for (const value of Object.values(e)) {
      if (value === PENDING_VALUE) return true;
    }
    const nestedArrays = [e.spouses, e.children_details, e.childrenDetails].filter(Array.isArray);
    for (const arr of nestedArrays) {
      for (const item of arr) {
        if (item && typeof item === 'object' && Object.values(item).some(v => v === PENDING_VALUE)) return true;
      }
    }
    return false;
  };

  // حذف موظف: يُعرض أولاً تأكيد احترافي منبثق (بدل window.confirm الافتراضي للمتصفح)، وعند التأكيد
  // يُنقل الموظف إلى أرشيف المحذوفات في الخادم (وليس حذفاً نهائياً فورياً) ليتسنى استعادته لاحقاً
  // من نافذة الإعدادات إن لزم الأمر.
  const handleDelete = (emp) => {
    setConfirmDeleteEmployee(emp);
  };

  const confirmDeleteEmployeeAction = async () => {
    const emp = confirmDeleteEmployee;
    if (!emp) return;
    try {
      await apiClient.entities.Employee.delete(emp.id);
      toast({ title: 'تم نقل الموظف إلى الأرشيف', description: 'يمكن استعادته لاحقاً من أرشيف المحذوفات في نافذة الإعدادات عند الحاجة', variant: 'success' });
      loadEmployeesPage();
      loadTotalAll();
      loadStatusCounts();
    } catch (err) {
      toast({ title: 'خطأ في الحذف', description: err.message, variant: 'destructive' });
    }
  };

  // إضافة حالة موظف جديدة (تُضاف لها بطاقة تلقائياً في شريط الحالات أعلاه)
  const handleAddStatus = async () => {
    const name = newStatusName.trim();
    if (!name) return;
    setStatusManagerBusy(true);
    setStatusManagerError('');
    try {
      await apiClient.entities.EmployeeStatus.create({ name });
      setNewStatusName('');
      await loadLookups();
      await loadStatusCounts();
      toast({ title: 'تمت إضافة الحالة', description: `تمت إضافة حالة (${name}) بنجاح`, variant: 'success' });
    } catch (err) {
      setStatusManagerError(err.message || 'تعذّرت إضافة الحالة');
    } finally {
      setStatusManagerBusy(false);
    }
  };

  // حذف حالة موظف: مسموح فقط عندما لا يستخدمها أي موظف حالياً (يتحقق الخادم من ذلك ويرفض الطلب مع
  // رسالة واضحة بعدد الموظفين المرتبطين إن وُجدوا)
  const handleDeleteStatus = (status) => {
    setConfirmDeleteStatus(status);
  };

  const confirmDeleteStatusAction = async () => {
    const status = confirmDeleteStatus;
    if (!status) return;
    setDeletingStatusId(status.id);
    setStatusManagerError('');
    try {
      await apiClient.entities.EmployeeStatus.delete(status.id);
      await loadLookups();
      await loadStatusCounts();
      toast({ title: 'تم حذف الحالة', description: `تم حذف حالة (${status.name}) بنجاح`, variant: 'success' });
    } catch (err) {
      setStatusManagerError(err.message || 'تعذّر حذف الحالة');
      toast({ title: 'تعذّر الحذف', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingStatusId(null);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-xs border border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-[#1B3A6B]">الموظفون</h1>
            <span className="bg-blue-50 text-[#1B3A6B] text-xs font-bold px-3 py-1 rounded-full border border-blue-100">
              {totalFiltered} من أصل {totalAll} موظف
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            سجل الموظفين الشامل مع إمكانية التصفية المتقدمة حسب جميع البيانات الإدارية والمالية والهيكلية.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`rounded-xl text-xs font-bold gap-2 transition-all ${
              activeFiltersCount > 0
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'text-slate-700 border-slate-200'
            }`}
          >
            <Filter size={15} />
            <span>الفلاتر المتقدمة</span>
            {activeFiltersCount > 0 && (
              <span className="bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
                {activeFiltersCount}
              </span>
            )}
            {showAdvancedFilters ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>

          <Link to="/employees/new">
            <Button className="bg-[#1B3A6B] hover:bg-[#152d54] text-white gap-2 rounded-xl text-xs font-bold shadow-xs">
              <Plus size={16} /> إضافة موظف جديد
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Navigation Cards - إحصائية واقعية لتوزيع الموظفين حسب الحالة، مع تصفية الجدول بالنقر */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black text-slate-600">توزيع الموظفين حسب الحالة</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setShowStatusManager(true); setStatusManagerError(''); setNewStatusName(''); }}
            className="text-slate-500 hover:text-[#1B3A6B] hover:bg-blue-50 text-[11px] font-bold rounded-xl h-8 gap-1.5"
          >
            <Settings2 size={14} /> إدارة الحالات
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
              statusFilter === 'all'
                ? 'bg-[#1B3A6B] border-[#1B3A6B] text-white shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>جميع الحالات</span>
            <span className={`min-w-[22px] h-[20px] px-1 rounded-full flex items-center justify-center font-mono text-[11px] ${
              statusFilter === 'all' ? 'bg-white/20 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}>
              {totalAll}
            </span>
          </button>
          {(employeeStatuses.length > 0
            ? employeeStatuses.filter(s => s.name).map(s => s.name)
            : Object.keys(STATUS_COLORS)
          ).map(name => {
            const isActive = statusFilter === name;
            const colorClass = STATUS_COLORS[name] || 'bg-slate-100 text-slate-600';
            return (
              <button
                key={name}
                type="button"
                onClick={() => setStatusFilter(name)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#1B3A6B] border-[#1B3A6B] text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{name}</span>
                <span className={`min-w-[22px] h-[20px] px-1 rounded-full flex items-center justify-center font-mono text-[11px] ${
                  isActive ? 'bg-white/20 text-white' : colorClass
                }`}>
                  {statusCounts[name] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Primary Search Bar & Quick Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="بحث بالاسم الكامل، الرقم الوظيفي، رقم الإضبارة، أو العنوان الوظيفي..."
              className="pr-10 rounded-xl border-slate-200 text-xs h-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                مسح
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold shrink-0">
            <span>عرض</span>
            <Select value={String(pageSize)} onValueChange={v => setPageSize(parseInt(v))}>
              <SelectTrigger className="w-16 h-9 rounded-xl border-slate-200 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>لكل صفحة</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeFiltersCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={resetFilters}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs font-bold rounded-xl h-10 gap-1"
              >
                <RotateCcw size={14} /> إعادة ضبط الكل ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Multi-Criteria Filter Panel */}
        {showAdvancedFilters && (
          <div className="pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#1B3A6B] flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" />
                خيارات التصفية المتعددة
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] font-bold text-slate-500 hover:text-red-600 transition-colors flex items-center gap-1"
              >
                <RotateCcw size={12} /> إعادة الفلاتر للوضع الافتراضي
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
              {/* 1. الجنس */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الجنس</label>
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل (ذكور وإناث)</SelectItem>
                    <SelectItem value="ذكر">ذكر</SelectItem>
                    <SelectItem value="أنثى">أنثى</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 2. الديانة */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الديانة</label>
                <Select value={religionFilter} onValueChange={setReligionFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الديانات</SelectItem>
                    {RELIGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 2b. القومية */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">القومية</label>
                <Select value={ethnicityFilter} onValueChange={setEthnicityFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع القوميات</SelectItem>
                    {ETHNICITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. الحالة الاجتماعية */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الحالة الاجتماعية</label>
                <Select value={maritalStatusFilter} onValueChange={setMaritalStatusFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات الاجتماعية</SelectItem>
                    {MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 4. التحصيل الدراسي */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">التحصيل الدراسي</label>
                <Select value={educationFilter} onValueChange={setEducationFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المؤهلات</SelectItem>
                    {(educationDegrees.length > 0 ? educationDegrees.map(d => d.name) : EDUCATION_LEVELS).map(edu => (
                      <SelectItem key={edu} value={edu}>{edu}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 5. العنوان الوظيفي */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">العنوان الوظيفي</label>
                <Select value={jobTitleFilter} onValueChange={setJobTitleFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع العناوين الوظيفية</SelectItem>
                    {uniqueJobTitles.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 6. المسؤولية الأساسية */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">المسؤولية الأساسية</label>
                <Select value={primaryRespFilter} onValueChange={setPrimaryRespFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المسؤوليات</SelectItem>
                    <SelectItem value="none">بلا مسؤولية</SelectItem>
                    {responsibilities.length > 0 ? (
                      responsibilities.map(r => <SelectItem key={r.id} value={r.title || r.name}>{r.title || r.name}</SelectItem>)
                    ) : (
                      ['مدير عام', 'معاون مدير عام', 'رئيس هيئة', 'مدير قسم', 'مسؤول شعبة', 'مسؤول وحدة'].map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* 7. المسؤولية في حالة الوكالة */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">المسؤولية بالوكالة</label>
                <Select value={actingRespFilter} onValueChange={setActingRespFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="has_acting">مع تكليف/وكالة فقط</SelectItem>
                    <SelectItem value="no_acting">بدون وكالة</SelectItem>
                    {responsibilities.map(r => (
                      <SelectItem key={r.id} value={r.title || r.name}>{r.title || r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 8. درجة الوكيل أو عام */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">درجة الوكيل / صفة الوكالة</label>
                <Select value={deputyLevelFilter} onValueChange={setDeputyLevelFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="general">عام (أي درجة/وكيل)</SelectItem>
                    <SelectItem value="وكيل أول">وكيل أول</SelectItem>
                    <SelectItem value="وكيل ثاني">وكيل ثاني</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 9. التشكيل الهيكلي (هيئة، قسم، شعبة، وحدة) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع التشكيل الهيكلي</label>
                <Select value={orgTypeFilter} onValueChange={setOrgTypeFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع التشكيلات</SelectItem>
                    {ORG_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 10. جهة العمل المحددة */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">جهة العمل / القسم / الشعبة</label>
                <Select value={orgUnitFilter} onValueChange={setOrgUnitFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الجهات</SelectItem>
                    {uniqueDepartmentsAndSections.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 11. نوع الخدمة */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الخدمة</label>
                <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع أنواع الخدمة</SelectItem>
                    {serviceTypes.length > 0 ? (
                      serviceTypes.map(t => (
                        <SelectItem key={t.id ?? t.name} value={t.name}>{t.name}</SelectItem>
                      ))
                    ) : (
                      ['دائم', 'عقد', 'أجر يومي'].map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* 12. الدرجة الوظيفية (بجميع مراحلها) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الدرجة الوظيفية</label>
                <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="جميع الدرجات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الدرجات (1-13)</SelectItem>
                    {[1,2,3,4,5,6,7,8,9,10,11,12,13].map(g => (
                      <SelectItem key={g} value={String(g)}>الدرجة {g} (بجميع مراحلها)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 13. المرحلة الوظيفية */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">المرحلة الوظيفية</label>
                <Select value={stepFilter} onValueChange={setStepFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="جميع المراحل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المراحل (1-11)</SelectItem>
                    {[1,2,3,4,5,6,7,8,9,10,11].map(st => (
                      <SelectItem key={st} value={String(st)}>المرحلة {st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 14. موقع العمل بالشركة */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">موقع العمل بالشركة</label>
                <Select value={workLocationFilter} onValueChange={setWorkLocationFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع المواقع</SelectItem>
                    {workLocations.length > 0 ? (
                      workLocations.map(loc => <SelectItem key={loc.id} value={loc.name}>{loc.name}</SelectItem>)
                    ) : (
                      ['المقر الرئيسي', 'الحقول النفطية', 'الموقع الميداني', 'موقع البصرة', 'موقع بغداد'].map(loc => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* 15. طبيعة العمل (مكتبي / ميداني) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">طبيعة العمل</label>
                <Select value={workNatureFilter} onValueChange={setWorkNatureFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل (مكتبي وميداني)</SelectItem>
                    <SelectItem value="مكتبي">مكتبي</SelectItem>
                    <SelectItem value="ميداني">ميداني</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 16. طبيعة دوام الموظف (صباحي / مناوب) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع عمل الموظف</label>
                <Select value={workShiftTypeFilter} onValueChange={v => {
                  setWorkShiftTypeFilter(v);
                  if (v === 'صباحي') setShiftSystemFilter('all');
                }}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل (صباحي ومناوب)</SelectItem>
                    <SelectItem value="صباحي">صباحي</SelectItem>
                    <SelectItem value="مناوب">مناوب</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 17. نظام المناوبة المحدد (في حال اختيار مناوب أو جميع الحالات) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">نظام المناوبة المحدد</label>
                <Select value={shiftSystemFilter} onValueChange={setShiftSystemFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="جميع أنظمة المناوبة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع أنظمة المناوبة</SelectItem>
                    {shiftSystems.map(s => {
                      const wD = s.work_days ?? s.workDays ?? 1;
                      const rD = s.rest_days ?? s.restDays ?? 3;
                      return (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name} ({wD}* {rD})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* 18. تمديد الخدمة للمتقاعدين */}
              <div>
                <label className="block text-[11px] font-bold text-amber-800 mb-1">تمديد الخدمة / التقاعد</label>
                <Select value={extensionFilter} onValueChange={setExtensionFilter}>
                  <SelectTrigger className="rounded-xl border-amber-200 bg-amber-50/30 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الموظفين (مع وبدون تمديد)</SelectItem>
                    <SelectItem value="has_extension">المستفيدون من تمديد الخدمة فقط</SelectItem>
                    <SelectItem value="retired_extended">المتقاعدون الحاصلون على تمديد فقط</SelectItem>
                    <SelectItem value="no_extension">بدون تمديد خدمة</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 19. اكتمال البيانات */}
              <div>
                <label className="block text-[11px] font-bold text-amber-800 mb-1">اكتمال البيانات</label>
                <Select value={dataCompletenessFilter} onValueChange={setDataCompletenessFilter}>
                  <SelectTrigger className="rounded-xl border-amber-200 bg-amber-50/30 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الموظفين</SelectItem>
                    <SelectItem value="incomplete">بيانات غير مكتملة فقط (تحتوي "سيتم تسجيله لاحقاً")</SelectItem>
                    <SelectItem value="complete">بيانات مكتملة فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 20. حالة الموظف (كانت الحالة والمنطق موجودين مسبقاً بلا عنصر واجهة) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">حالة الموظف</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-xl border-slate-200 text-xs h-9">
                    <SelectValue placeholder="الكل" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    {(employeeStatuses.length > 0
                      ? Array.from(new Set(employeeStatuses.map(s => s.name).filter(Boolean)))
                      : Object.keys(STATUS_COLORS)
                    ).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table & Results */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        {listLoading ? (
          <div className="flex flex-col items-center justify-center h-52 space-y-3">
            <div className="w-9 h-9 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
            <p className="text-xs text-slate-400 font-bold">جاري تحميل وسجل الموظفين وتطبيق الفلاتر...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1B3A6B] text-white">
                  <th className="text-right px-4 py-3 font-bold">#</th>
                  <th className="text-right px-4 py-3 font-bold">الاسم الكامل</th>
                  <th className="text-right px-4 py-3 font-bold">العنوان الوظيفي</th>
                  <th className="text-right px-4 py-3 font-bold">جهة العمل / التشكيل</th>
                  <th className="text-right px-4 py-3 font-bold">الدرجة / المرحلة</th>
                  <th className="text-right px-4 py-3 font-bold">نوع الدوام والمناوبة</th>
                  <th className="text-right px-4 py-3 font-bold">نوع الخدمة</th>
                  <th className="text-right px-4 py-3 font-bold">الحالة</th>
                  <th className="text-right px-4 py-3 font-bold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp, idx) => (
                  <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono">{(page - 1) * pageSize + idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center text-[#1B3A6B] font-extrabold text-xs shrink-0">
                          {emp.full_name?.charAt(0) || 'م'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <Link to={`/employees/${emp.id}`} className="font-extrabold text-[#1B3A6B] hover:underline block">
                              {emp.full_name}
                            </Link>
                            {employeeHasIncompleteData(emp) && (
                              <span title="يحتوي هذا السجل على حقول بقيمة (سيتم تسجيله لاحقاً)" className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-bold shrink-0">
                                بيانات غير مكتملة
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>رقم الشركة: {emp.company_number || emp.companyNumber || '—'}</span>
                            {emp.gender && <span>• {emp.gender}</span>}
                            {emp.marital_status && <span>• {emp.marital_status}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="font-bold block">{emp.job_title || 'غير محدد'}</span>
                      {emp.primary_responsibility && emp.primary_responsibility !== 'بلا مسؤولية' && (
                        <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-bold inline-block mt-0.5">
                          {emp.primary_responsibility}
                        </span>
                      )}
                      {emp.acting_responsibility && emp.acting_responsibility !== 'بلا وكالة' && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 font-bold inline-block mt-0.5 mr-1">
                          وكالة: {emp.acting_responsibility} ({emp.deputy_level || emp.deputy_status || 'وكيل'})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-medium">{emp.section || emp.department || 'غير محدد'}</span>
                      {emp.work_location && (
                        <span className="block text-[10px] text-slate-400">موقع: {emp.work_location}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md bg-[#1B3A6B]/10 text-[#1B3A6B] font-mono font-extrabold text-[11px] shrink-0">
                            {emp.grade || '—'}
                          </span>
                          <div className="leading-tight">
                            <div className="font-bold text-[10px] text-slate-500">الدرجة</div>
                            <div className="text-[10px] font-mono text-slate-400" title="تاريخ الحصول على الدرجة الحالية">
                              {(emp.grade_date || emp.last_promotion_date || emp.lastPromotionDate) || 'بلا تاريخ'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono font-extrabold text-[11px] shrink-0">
                            {emp.step || '—'}
                          </span>
                          <div className="leading-tight">
                            <div className="font-bold text-[10px] text-slate-500">المرحلة</div>
                            <div className="text-[10px] font-mono text-slate-400" title="تاريخ الحصول على المرحلة الحالية (العلاوة)">
                              {(emp.last_increment_date || emp.lastIncrementDate) || 'بلا تاريخ'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          emp.work_shift_type === 'مناوب'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {emp.work_shift_type || 'صباحي'}
                        </span>
                        {emp.work_shift_type === 'مناوب' && emp.shift_system_name && (
                          <span className="block text-[10px] font-bold text-purple-700">
                            {emp.shift_system_name} ({emp.shift_work_days ?? 0}* {emp.shift_rest_days ?? 0})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        emp.service_type === 'دائم' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        emp.service_type === 'عقد' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        'bg-slate-50 text-slate-600'
                      }`}>{emp.service_type || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${STATUS_COLORS[emp.status] || 'bg-slate-100 text-slate-600'}`}>
                          {emp.status || 'مستمر'}
                        </span>
                        {(emp.retirement_extension_years > 0 || emp.retirement_extension_months > 0 || emp.retirement_extension_order_number || emp.retirementExtensionOrderNumber) && (
                          <div className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 font-bold flex items-center gap-1">
                            <span>تمديد: {emp.retirement_extension_years || 0}س {emp.retirement_extension_months || 0}ش</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setQrEmployee(emp)}
                          className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 flex items-center justify-center transition-colors text-amber-600"
                          title="رمز الوصول السريع QR"
                        >
                          <QrCode size={13} />
                        </button>
                        <Link to={`/employees/${emp.id}`}>
                          <button className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors text-blue-600" title="عرض التفاصيل">
                            <Eye size={13} />
                          </button>
                        </Link>
                        <Link to={`/employees/${emp.id}/edit`}>
                          <button className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors text-slate-600" title="تعديل الموظف">
                            <Edit size={13} />
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDelete(emp)}
                          className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors text-red-500"
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!listLoading && employees.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      <div className="space-y-2">
                        <Users className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-bold text-slate-600 text-xs">لا يوجد موظفون مطابقون لشروط التصفية والبحث المحددة</p>
                        {activeFiltersCount > 0 && (
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="text-blue-600 hover:underline text-xs font-bold"
                          >
                            إعادة ضبط جميع الفلاتر
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ترقيم الصفحات (31-08-2026): يُعرض دوماً بعد الجدول، مبني على الإجمالي المفلتَر totalFiltered
            من الخادم - يدعم آلاف السجلات دون تحميلها كلها إلى المتصفح دفعة واحدة */}
        {!listLoading && totalFiltered > 0 && (
          <div className="flex items-center justify-center px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 rounded-lg text-[11px]"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                السابق
              </Button>
              <span className="text-[11px] font-bold text-slate-600 px-2">
                صفحة {page} من {Math.max(1, Math.ceil(totalFiltered / pageSize))}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 rounded-lg text-[11px]"
                disabled={page >= Math.ceil(totalFiltered / pageSize)}
                onClick={() => setPage(p => Math.min(Math.ceil(totalFiltered / pageSize), p + 1))}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Access QR Modal */}
      <Dialog open={!!qrEmployee} onOpenChange={(open) => !open && setQrEmployee(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl p-4 sm:p-5" dir="rtl">
          <DialogHeader className="text-right pb-1">
            <DialogTitle className="text-base font-bold text-[#1B3A6B]">
              بطاقة الوصول السريع والهوية الرقمية
            </DialogTitle>
          </DialogHeader>
          <div className="pt-1">
            {qrEmployee && <EmployeeQuickAccessQR employee={qrEmployee} />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Employee Statuses Modal */}
      <Dialog open={showStatusManager} onOpenChange={(open) => { setShowStatusManager(open); if (!open) { setStatusManagerError(''); setNewStatusName(''); } }}>
        <DialogContent className="max-w-md rounded-2xl p-4 sm:p-5" dir="rtl">
          <DialogHeader className="text-right pb-1">
            <DialogTitle className="text-base font-bold text-[#1B3A6B]">إدارة حالات الموظف</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              يمكن حذف حالة فقط بشرط ألا يستخدمها أي موظف حالياً، لتفادي فقدان تصنيف موظفين فعليين بالخطأ.
            </p>

            <div className="flex items-center gap-2">
              <Input
                placeholder="اسم حالة جديدة (مثال: منقول)"
                value={newStatusName}
                onChange={e => { setNewStatusName(e.target.value); setStatusManagerError(''); }}
                className="rounded-xl border-slate-200 text-xs h-9"
              />
              <Button
                type="button"
                disabled={statusManagerBusy || !newStatusName.trim()}
                onClick={handleAddStatus}
                className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold h-9 gap-1.5 shrink-0"
              >
                {statusManagerBusy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                إضافة
              </Button>
            </div>
            {statusManagerError && (
              <p className="text-[11px] text-red-600 font-bold bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {statusManagerError}
              </p>
            )}

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {employeeStatuses.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">{s.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({statusCounts[s.name] || 0} موظف)
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={deletingStatusId === s.id}
                    onClick={() => handleDeleteStatus(s)}
                    title="حذف الحالة"
                    className="text-slate-400 hover:text-red-600 disabled:opacity-40 transition-colors"
                  >
                    {deletingStatusId === s.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                  </button>
                </div>
              ))}
              {employeeStatuses.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-3">لا توجد حالات مسجّلة بعد.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        isOpen={!!confirmDeleteEmployee}
        onClose={() => setConfirmDeleteEmployee(null)}
        onConfirm={confirmDeleteEmployeeAction}
        title="تأكيد حذف الموظف"
        description={confirmDeleteEmployee ? `سيتم نقل بيانات الموظف "${confirmDeleteEmployee.full_name || ''}" إلى أرشيف المحذوفات، ويمكن لمدير النظام استعادتها لاحقاً من نافذة الإعدادات، أو تأكيد حذفها بشكل نهائي من هناك. لن يُحذف السجل نهائياً الآن.` : ''}
        confirmText="نعم، انقل إلى الأرشيف"
        cancelText="تراجع"
      />

      <ConfirmDeleteDialog
        isOpen={!!confirmDeleteStatus}
        onClose={() => setConfirmDeleteStatus(null)}
        onConfirm={confirmDeleteStatusAction}
        title="تأكيد حذف الحالة"
        description={confirmDeleteStatus ? `هل أنت متأكد من حذف حالة "${confirmDeleteStatus.name}"؟ لن يُسمح بالحذف إن كان هناك موظفون مسجَّلون حالياً بهذه الحالة.` : ''}
        confirmText="نعم، احذف الحالة"
        cancelText="تراجع"
      />
    </div>
  );
}
