import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2, Filter, RotateCcw, ChevronDown, ChevronUp, Users, Sparkles, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import EmployeeQuickAccessQR from '@/components/employee/EmployeeQuickAccessQR';
import { fetchEducationDegreesSorted, fetchResponsibilityAllowancesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';

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
  const [loading, setLoading] = useState(true);
  const [qrEmployee, setQrEmployee] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Entities for lookup options
  const [orgUnits, setOrgUnits] = useState([]);
  const [shiftSystems, setShiftSystems] = useState([]);
  const [workLocations, setWorkLocations] = useState([]);
  const [responsibilities, setResponsibilities] = useState([]);
  const [educationDegrees, setEducationDegrees] = useState([]);

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [extensionFilter, setExtensionFilter] = useState('all');
  const [workLocationFilter, setWorkLocationFilter] = useState('all');
  const [workNatureFilter, setWorkNatureFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [stepFilter, setStepFilter] = useState('all');
  const [educationFilter, setEducationFilter] = useState('all');
  const [workShiftTypeFilter, setWorkShiftTypeFilter] = useState('all');
  const [shiftSystemFilter, setShiftSystemFilter] = useState('all');

  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [empData, orgs, shifts, locs, resps, eduDegrees] = await Promise.all([
        apiClient.entities.Employee.list('-created_date', 1000).catch(() => []),
        apiClient.entities.OrgUnit.list().catch(() => []),
        apiClient.entities.ShiftSystem.list().catch(() => []),
        apiClient.entities.WorkLocation.list().catch(() => []),
        fetchResponsibilityAllowancesSorted().catch(() => []),
        fetchEducationDegreesSorted().catch(() => []),
      ]);
      setEmployees(empData || []);
      setOrgUnits(orgs || []);
      setShiftSystems(shifts || []);
      setWorkLocations(locs || []);
      setResponsibilities(resps || []);
      setEducationDegrees(eduDegrees || []);
    } catch (err) {
      console.error('Error loading employee filtering data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const unsubscribe = subscribeToSettingsUpdates(() => {
      loadData();
    });

    return () => unsubscribe();
  }, []);

  // Unique lists derived from current employee data
  const uniqueJobTitles = useMemo(() => {
    const set = new Set();
    employees.forEach(e => { if (e.job_title?.trim()) set.add(e.job_title.trim()); });
    return Array.from(set).sort();
  }, [employees]);

  const uniqueDepartmentsAndSections = useMemo(() => {
    const set = new Set();
    employees.forEach(e => {
      if (e.department?.trim()) set.add(e.department.trim());
      if (e.section?.trim()) set.add(e.section.trim());
    });
    orgUnits.forEach(u => { if (u.name?.trim()) set.add(u.name.trim()); });
    return Array.from(set).sort();
  }, [employees, orgUnits]);

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
    if (statusFilter !== 'all') count++;
    if (extensionFilter !== 'all') count++;
    if (workLocationFilter !== 'all') count++;
    if (workNatureFilter !== 'all') count++;
    if (gradeFilter !== 'all') count++;
    if (stepFilter !== 'all') count++;
    if (educationFilter !== 'all') count++;
    if (workShiftTypeFilter !== 'all') count++;
    if (shiftSystemFilter !== 'all') count++;
    return count;
  }, [
    genderFilter, religionFilter, ethnicityFilter, maritalStatusFilter, jobTitleFilter, primaryRespFilter,
    actingRespFilter, deputyLevelFilter, orgTypeFilter, orgUnitFilter, serviceTypeFilter,
    statusFilter, extensionFilter, workLocationFilter, workNatureFilter, gradeFilter, stepFilter,
    educationFilter, workShiftTypeFilter, shiftSystemFilter
  ]);

  const resetFilters = () => {
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
    setStatusFilter('all');
    setExtensionFilter('all');
    setWorkLocationFilter('all');
    setWorkNatureFilter('all');
    setGradeFilter('all');
    setStepFilter('all');
    setEducationFilter('all');
    setWorkShiftTypeFilter('all');
    setShiftSystemFilter('all');
  };

  // Filter Logic
  const filtered = useMemo(() => {
    return employees.filter(e => {
      // 1. Text search
      if (search) {
        const q = search.trim().toLowerCase();
        const matchName = e.full_name?.toLowerCase().includes(q);
        const matchCivil = e.civil_service_number?.toLowerCase().includes(q);
        const matchRecord = e.service_record_number?.toLowerCase().includes(q);
        const matchTitle = e.job_title?.toLowerCase().includes(q);
        if (!matchName && !matchCivil && !matchRecord && !matchTitle) return false;
      }

      // 2. Gender
      if (genderFilter !== 'all' && e.gender !== genderFilter) return false;

      // 3. Religion
      if (religionFilter !== 'all' && e.religion !== religionFilter) return false;

      // 3b. Ethnicity (القومية)
      if (ethnicityFilter !== 'all' && e.ethnicity !== ethnicityFilter) return false;

      // 4. Marital Status
      if (maritalStatusFilter !== 'all' && e.marital_status !== maritalStatusFilter) return false;

      // 5. Job Title
      if (jobTitleFilter !== 'all' && e.job_title !== jobTitleFilter) return false;

      // 6. Primary Responsibility
      if (primaryRespFilter !== 'all') {
        if (primaryRespFilter === 'none') {
          if (e.primary_responsibility && e.primary_responsibility !== 'بلا مسؤولية') return false;
        } else if (e.primary_responsibility !== primaryRespFilter) {
          return false;
        }
      }

      // 7. Acting Responsibility
      if (actingRespFilter !== 'all') {
        if (actingRespFilter === 'has_acting') {
          if (!e.acting_responsibility || e.acting_responsibility === 'بلا وكالة') return false;
        } else if (actingRespFilter === 'no_acting') {
          if (e.acting_responsibility && e.acting_responsibility !== 'بلا وكالة') return false;
        } else if (e.acting_responsibility !== actingRespFilter) {
          return false;
        }
      }

      // 8. Deputy Level (درجة الوكيل أو عام)
      if (deputyLevelFilter !== 'all') {
        if (deputyLevelFilter === 'general') {
          const hasDeputy = (e.acting_responsibility && e.acting_responsibility !== 'بلا وكالة') ||
                            (e.deputy_level && e.deputy_level !== 'لا يوجد') ||
                            (e.deputy_status && e.deputy_status !== 'لا يوجد');
          if (!hasDeputy) return false;
        } else if (e.deputy_level !== deputyLevelFilter && e.deputy_status !== deputyLevelFilter) {
          return false;
        }
      }

      // 9. Org Type (هيئة، قسم، شعبة، وحدة)
      if (orgTypeFilter !== 'all') {
        const matchingOrgNames = orgUnits
          .filter(u => u.type === orgTypeFilter)
          .map(u => u.name);
        
        const empOrg = e.section || e.department || '';
        if (matchingOrgNames.length > 0) {
          if (!matchingOrgNames.includes(empOrg)) return false;
        } else {
          // Fallback if org units list is empty
          if (!empOrg.includes(orgTypeFilter)) return false;
        }
      }

      // 10. Org Unit / Department
      if (orgUnitFilter !== 'all') {
        if (e.department !== orgUnitFilter && e.section !== orgUnitFilter) return false;
      }

      // 11. Service Type
      if (serviceTypeFilter !== 'all' && e.service_type !== serviceTypeFilter) return false;

      // 12. Employee Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'متقاعد') {
          if (e.status !== 'متقاعد' && e.status !== 'متقاعد مع تمديد') return false;
        } else if (e.status !== statusFilter) {
          return false;
        }
      }

      // 12b. Retirement Service Extension
      if (extensionFilter !== 'all') {
        const hasExt = Boolean((e.retirement_extension_years > 0 || e.retirement_extension_months > 0 || e.retirement_extension_order_number || e.retirementExtensionOrderNumber));
        if (extensionFilter === 'has_extension' && !hasExt) return false;
        if (extensionFilter === 'no_extension' && hasExt) return false;
        if (extensionFilter === 'retired_extended') {
          const isRetiredOrExtended = (e.status === 'متقاعد' || e.status === 'متقاعد مع تمديد' || hasExt);
          if (!isRetiredOrExtended || !hasExt) return false;
        }
      }

      // 13. Work Location
      if (workLocationFilter !== 'all' && e.work_location !== workLocationFilter) return false;

      // 14. Work Nature (مكتبي / ميداني)
      if (workNatureFilter !== 'all' && e.work_nature !== workNatureFilter) return false;

      // 15. Grade (الدرجة بجميع مراحلها)
      if (gradeFilter !== 'all' && String(e.grade) !== String(gradeFilter)) return false;

      // 16. Step (المرحلة المحددة)
      if (stepFilter !== 'all' && String(e.step) !== String(stepFilter)) return false;

      // 17. Education Level
      if (educationFilter !== 'all' && e.education_level !== educationFilter) return false;

      // 18. Work Shift Type (صباحي / مناوب)
      if (workShiftTypeFilter !== 'all' && e.work_shift_type !== workShiftTypeFilter) return false;

      // 19. Shift System ID or Name
      if (shiftSystemFilter !== 'all') {
        const selectedSys = shiftSystems.find(s => String(s.id) === String(shiftSystemFilter));
        const sysName = selectedSys ? selectedSys.name : shiftSystemFilter;
        if (String(e.shift_system_id) !== String(shiftSystemFilter) && e.shift_system_name !== sysName) {
          return false;
        }
      }

      return true;
    });
  }, [
    employees, search, genderFilter, religionFilter, ethnicityFilter, maritalStatusFilter, jobTitleFilter,
    primaryRespFilter, actingRespFilter, deputyLevelFilter, orgTypeFilter, orgUnitFilter,
    serviceTypeFilter, statusFilter, extensionFilter, workLocationFilter, workNatureFilter, gradeFilter,
    stepFilter, educationFilter, workShiftTypeFilter, shiftSystemFilter, orgUnits, shiftSystems
  ]);

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    try {
      await apiClient.entities.Employee.delete(id);
      toast({ title: 'تم حذف الموظف', description: 'تم حذف الموظف بنجاح', variant: 'success' });
      loadData();
    } catch (err) {
      toast({ title: 'خطأ في الحذف', description: err.message, variant: 'destructive' });
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
              {filtered.length} من أصل {employees.length} موظف
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

      {/* Primary Search Bar & Quick Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="بحث بالاسم الكامل، الرقم الوظيفي، أوجنسية..."
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
                    <SelectItem value="دائم">دائم</SelectItem>
                    <SelectItem value="عقد">عقد</SelectItem>
                    <SelectItem value="أجراء يوميين">أجراء يوميين</SelectItem>
                    <SelectItem value="وزاري">وزاري</SelectItem>
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
            </div>
          </div>
        )}
      </div>

      {/* Table & Results */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        {loading ? (
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
                {filtered.map((emp, idx) => (
                  <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center text-[#1B3A6B] font-extrabold text-xs shrink-0">
                          {emp.full_name?.charAt(0) || 'م'}
                        </div>
                        <div>
                          <Link to={`/employees/${emp.id}`} className="font-extrabold text-[#1B3A6B] hover:underline block">
                            {emp.full_name}
                          </Link>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            <span>الرقم الوظيفي: {emp.civil_service_number || '—'}</span>
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
                    <td className="px-4 py-3 text-slate-700 font-mono font-bold">
                      {emp.grade ? `د${emp.grade}` : '—'} / {emp.step ? `م${emp.step}` : '—'}
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
                          onClick={() => handleDelete(emp.id)}
                          className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors text-red-500"
                          title="حذف"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
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
    </div>
  );
}
