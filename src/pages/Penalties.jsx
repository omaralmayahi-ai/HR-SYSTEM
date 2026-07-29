import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Award, ShieldAlert, Search, Trash2, Edit3, CheckCircle2, FileText, AlertTriangle, Building2, MapPin, RotateCcw, Check, User, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency, getGradeLabel, getStepLabel } from '@/lib/salaryTable';
import { fetchPenaltyTypesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';

const PENALTY_TYPES = ['إنذار شفهي', 'إنذار خطي', 'خصم يوم', 'خصم أيام', 'وقف عن الدوام', 'إحالة للتحقيق', 'تنزيل درجة', 'فصل'];
const SENIORITY_OPTIONS = ['قدم شهر واحد', 'قدم 6 اشهر', 'معنوي فقط بدون اثر'];
const DEFAULT_ISSUERS = ['معالي الوزير', 'السيد الوكيل', 'السيد المدير العام', 'شركة نفط الوسط', 'إدارة الشركة / حقل شرقي بغداد'];

const STANDARD_JOB_TITLES = [
  "مهندس", "مهندس أقدم", "معاون مهندس", "رئيس مهندسين", "رئيس مهندسين أقدم",
  "محاسب", "محاسب أقدم", "معاون محاسب", "رئيس محاسبين",
  "قانوني", "قانوني أقدم", "معاون قانوني", "رئيس قانونيين",
  "إداري", "إداري أقدم", "معاون إداري", "رئيس إداريين",
  "مبرمج", "مبرمج أقدم", "معاون مبرمج", "رئيس مبرمجين",
  "محلل نظم", "محلل نظم أقدم",
  "باحث علمي", "باحث علمي أقدم", "معاون باحث",
  "فني", "فني أقدم", "معاون فني", "رئيس فنيين",
  "كاتب", "كاتب أقدم", "معاون كاتب", "رئيس كتبة",
  "طبيب", "طبيب اختصاص", "ممرض", "ممرض ماهر", "سائق", "حرفي", "ملاحظ", "مفتش"
];

// Searchable Employee Select Component
function EmployeeSearchSelect({ employees, value, onChange, placeholder = "ابحث باسم الموظف أو رقم الشركة..." }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedEmp = employees.find(e => String(e.id) === String(value));

  const filtered = employees.filter(e => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    const name = (e.full_name || e.fullName || '').toLowerCase();
    const compNum = (e.company_number || e.companyNumber || '').toString().toLowerCase();
    const empNum = (e.employee_number || e.employeeNumber || '').toString().toLowerCase();
    const civilNum = (e.civil_service_number || e.civilServiceNumber || '').toString().toLowerCase();
    return name.includes(q) || compNum.includes(q) || empNum.includes(q) || civilNum.includes(q);
  });

  return (
    <div className="relative text-right w-full" dir="rtl">
      <div className="relative">
        <Input
          dir="rtl"
          value={isOpen ? searchTerm : (selectedEmp ? `${selectedEmp.full_name || selectedEmp.fullName} (رقم الشركة: ${selectedEmp.company_number || selectedEmp.companyNumber || selectedEmp.id})` : searchTerm)}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setSearchTerm('');
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="mt-1 rounded-xl text-xs text-right bg-white pr-9 pl-8 text-slate-800 placeholder:text-slate-400 font-medium border-slate-200"
        />
        <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setSearchTerm('');
              setIsOpen(true);
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-rose-600 font-bold"
            title="إلغاء التحديد"
          >
            ✕
          </button>
        )}
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-full max-h-60 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-20 divide-y divide-slate-100 text-right">
            {filtered.length > 0 ? (
              filtered.slice(0, 50).map(e => (
                <div
                  key={e.id}
                  onClick={() => {
                    onChange(String(e.id));
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className={`p-2.5 text-xs cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between text-right ${
                    String(e.id) === String(value) ? 'bg-emerald-50 text-emerald-900 font-bold' : 'text-slate-700'
                  }`}
                >
                  <div className="text-right">
                    <div className="font-bold text-slate-800">{e.full_name || e.fullName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {e.job_title || e.jobTitle || 'موظف'} {e.department ? `• ${e.department}` : ''}
                    </div>
                  </div>
                  <div className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 mr-2">
                    {e.company_number || e.companyNumber ? `رقم الشركة: ${e.company_number || e.companyNumber}` : `#${e.id}`}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 text-xs text-center text-slate-400">لا يوجد موظف يطابق البحث</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function Penalties() {
  const [searchParams] = useSearchParams();

  // Active Tab: add_appreciation | add_penalty | query_employee | query_order
  const [activeTab, setActiveTab] = useState(searchParams.get('employee') ? 'query_employee' : 'add_appreciation');
  const [penalties, setPenalties] = useState([]);
  const [appreciations, setAppreciations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Forms visibility
  const [showAppreciationForm, setShowAppreciationForm] = useState(true);
  const [showPenaltyForm, setShowPenaltyForm] = useState(true);

  // Editing state
  const [editingAppreciation, setEditingAppreciation] = useState(null);
  const [editingPenalty, setEditingPenalty] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [duplicateAppreciationReport, setDuplicateAppreciationReport] = useState(null);

  // Query Employee Tab state
  const [selectedEmployeeForQuery, setSelectedEmployeeForQuery] = useState(searchParams.get('employee') || '');
  const [queriedEmpSubTab, setQueriedEmpSubTab] = useState('appreciations');

  // Query Order Tab state
  const [selectedOrderKey, setSelectedOrderKey] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [orderQuerySearchTerm, setOrderQuerySearchTerm] = useState('');
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false);

  const { toast } = useToast();

  // Appreciation Form
  const [appreciationForm, setAppreciationForm] = useState({
    employee_id: searchParams.get('employee') || '',
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    issuer: DEFAULT_ISSUERS[2] || 'السيد المدير العام',
    reason: '',
    seniority_impact: 'قدم شهر واحد',
    notes: ''
  });

  // Dynamic Saved Issuers
  const [savedIssuers, setSavedIssuers] = useState(() => {
    try {
      const saved = localStorage.getItem('hr_custom_issuers');
      return saved ? JSON.parse(saved) : DEFAULT_ISSUERS;
    } catch {
      return DEFAULT_ISSUERS;
    }
  });
  const [isAddingNewIssuer, setIsAddingNewIssuer] = useState(false);
  const [isManagingIssuers, setIsManagingIssuers] = useState(false);
  const [newIssuerText, setNewIssuerText] = useState('');

  const handleAddCustomIssuer = (newIssuerName) => {
    const trimmed = newIssuerName.trim();
    if (!trimmed) return;
    if (!savedIssuers.includes(trimmed)) {
      const updated = [trimmed, ...savedIssuers];
      setSavedIssuers(updated);
      try {
        localStorage.setItem('hr_custom_issuers', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleDeleteIssuer = (issuerToDelete) => {
    const updated = savedIssuers.filter(i => i !== issuerToDelete);
    setSavedIssuers(updated);
    try {
      localStorage.setItem('hr_custom_issuers', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (appreciationForm.issuer === issuerToDelete) {
      setAppreciationForm(prev => ({ ...prev, issuer: updated[0] || '' }));
    }
    toast({ title: 'تم حذف جهة الإصدار من القائمة' });
  };

  // Target Modes: 'single' | 'multiple' | 'category'
  const [appreciationTargetMode, setAppreciationTargetMode] = useState('single');
  const [multiSelectedEmpIds, setMultiSelectedEmpIds] = useState([]);

  // Category Filters
  const [categoryFilters, setCategoryFilters] = useState({
    gender: 'all',
    serviceType: 'all',
    department: 'all',
    selectedOrgUnits: [],
    workLocation: 'all',
    selectedWorkLocations: [],
    qualification: 'all',
    selectedQualifications: [],
    jobTitle: 'all',
    selectedJobTitles: [],
    searchJobTitle: '',
    employeeStatus: 'all',
    ethnicity: 'all',
    religion: 'all',
  });

  // DB System Entities
  const [dbOrgUnits, setDbOrgUnits] = useState([]);
  const [dbWorkLocations, setDbWorkLocations] = useState([]);
  const [dbEducationDegrees, setDbEducationDegrees] = useState([]);
  const [showOrgPickerModal, setShowOrgPickerModal] = useState(false);
  const [showWorkLocationModal, setShowWorkLocationModal] = useState(false);
  const [showJobTitleModal, setShowJobTitleModal] = useState(false);
  const [searchModalJobTitleTerm, setSearchModalJobTitleTerm] = useState('');

  const [manualExcludedEmpIds, setManualExcludedEmpIds] = useState(new Set());
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Dynamic lists from employee dataset & system configuration
  const departmentsList = Array.from(new Set([
    ...employees.map(e => e.department).filter(Boolean),
    ...dbOrgUnits.map(o => o.name).filter(Boolean)
  ])).sort();

  const workLocationsList = Array.from(new Set([
    ...employees.map(e => e.work_location || e.workLocation || e.address).filter(Boolean),
    ...dbWorkLocations.map(l => l.name).filter(Boolean)
  ])).sort();

  // Education Degrees dynamically populated strictly from system administrative settings & employee records
  const degreesFromSettings = (() => {
    let sortedData = [...dbEducationDegrees];
    try {
      const savedOrder = localStorage.getItem('EDUCATION_DEGREES_ORDER');
      if (savedOrder) {
        const orderIds = JSON.parse(savedOrder);
        sortedData.sort((a, b) => {
          const idA = typeof a === 'object' ? a.id : -1;
          const idB = typeof b === 'object' ? b.id : -1;
          const indexA = orderIds.indexOf(idA);
          const indexB = orderIds.indexOf(idB);
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });
      }
    } catch (e) { /* ignore */ }

    return sortedData
      .map(d => typeof d === 'string' ? d : (d.name || d.degree_name || d.title))
      .filter(Boolean);
  })();

  const degreesFromLocalStorage = (() => {
    try {
      const saved = localStorage.getItem('EDUCATION_DEGREES_PRESETS');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map(d => typeof d === 'string' ? d : (d.name || d.degree_name || d.title)).filter(Boolean);
      }
    } catch (e) { /* ignore */ }
    return [];
  })();

  const configuredDegreesList = degreesFromSettings.length > 0 ? degreesFromSettings : degreesFromLocalStorage;

  const CANONICAL_DEGREE_ORDER = [
    'دون الابتدائية',
    'أمي',
    'أُمّي',
    'يقرأ ويكتب',
    'ابتدائية',
    'متوسطة',
    'إعدادية',
    'دبلوم',
    'بكالوريوس',
    'دبلوم عالي',
    'ماجستير',
    'دكتوراه'
  ];

  const rawUniqueDegrees = Array.from(new Set([
    ...configuredDegreesList,
    ...employees.map(e => e.education_level || e.educationLevel || e.qualification || e.education || e.certificate).filter(Boolean)
  ])).filter(Boolean);

  const qualificationsList = rawUniqueDegrees.sort((a, b) => {
    const configIndexA = configuredDegreesList.indexOf(a);
    const configIndexB = configuredDegreesList.indexOf(b);

    if (configIndexA !== -1 && configIndexB !== -1) {
      return configIndexA - configIndexB;
    }
    if (configIndexA !== -1) return -1;
    if (configIndexB !== -1) return 1;

    const canonIndexA = CANONICAL_DEGREE_ORDER.indexOf(a);
    const canonIndexB = CANONICAL_DEGREE_ORDER.indexOf(b);

    if (canonIndexA !== -1 && canonIndexB !== -1) {
      return canonIndexA - canonIndexB;
    }
    if (canonIndexA !== -1) return -1;
    if (canonIndexB !== -1) return 1;

    return a.localeCompare(b, 'ar');
  });

  const jobTitlesList = Array.from(new Set([
    ...STANDARD_JOB_TITLES,
    ...employees.map(e => e.job_title || e.jobTitle).filter(Boolean)
  ])).filter(Boolean).sort();

  const serviceTypeOptions = ['دائم', 'مؤقت', 'عقد', 'إعارة', 'منسب', 'أجر'];
  const statusOptions = ['مستمر', 'منسب', 'منقول', 'متقاعد', 'متقاعد مع تمديد', 'مستقيل', 'موقوف', 'مجاز'];
  const ethnicityOptions = ['عربي/ة', 'كردي/ة', 'تركماني/ة', 'كلداني/ة', 'آشوري/ة', 'سرياني/ة', 'أرمني/ة', 'أخرى', 'غير محدد'];
  const religionOptions = ['مسلم', 'مسيحي', 'صابئي', 'يزيدي', 'أخرى', 'غير محدد'];

  // Category Filter Calculator
  const getMatchingCategoryEmployees = () => {
    return employees.filter(emp => {
      // 1. Gender (الجنس - كلا الجنسين / ذكر / أنثى)
      if (categoryFilters.gender !== 'all') {
        const g = (emp.gender || '').trim();
        if (categoryFilters.gender === 'ذكر' && !g.includes('ذكر') && !g.includes('رجل')) return false;
        if (categoryFilters.gender === 'أنثى' && !g.includes('أنثى') && !g.includes('امرأة')) return false;
      }

      // 2. Service Type (نوع الخدمة)
      if (categoryFilters.serviceType !== 'all') {
        const st = (emp.service_type || emp.serviceType || '').trim();
        if (categoryFilters.serviceType === 'دائم' && !st.includes('دائم') && !st.includes('ملاك')) return false;
        if (categoryFilters.serviceType === 'مؤقت' && !st.includes('مؤقت')) return false;
        if (categoryFilters.serviceType === 'عقد' && !st.includes('عقد')) return false;
        if (categoryFilters.serviceType === 'إعارة' && !st.includes('إعارة')) return false;
        if (categoryFilters.serviceType === 'أجر' && !st.includes('أجر')) return false;
        if (categoryFilters.serviceType === 'منسب' && !st.includes('منسب')) return false;
        if (!['دائم', 'مؤقت', 'عقد', 'إعارة', 'أجر', 'منسب'].includes(categoryFilters.serviceType)) {
          if (st !== categoryFilters.serviceType && !st.includes(categoryFilters.serviceType)) return false;
        }
      }

      // 3. Department / Org Structure (التشكيل - الهيكل التنظيمي)
      if (categoryFilters.selectedOrgUnits && categoryFilters.selectedOrgUnits.length > 0) {
        const empDept = emp.department || '';
        const empSec = emp.section || emp.unit || '';
        const matches = categoryFilters.selectedOrgUnits.some(ou =>
          empDept === ou || empSec === ou || empDept.includes(ou) || empSec.includes(ou) || ou.includes(empDept)
        );
        if (!matches) return false;
      } else if (categoryFilters.department !== 'all') {
        if ((emp.department || '') !== categoryFilters.department) return false;
      }

      // 4. Work Location (موقع العمل - الهيكل التنظيمي)
      if (categoryFilters.selectedWorkLocations && categoryFilters.selectedWorkLocations.length > 0) {
        const loc = emp.work_location || emp.workLocation || emp.address || '';
        if (!categoryFilters.selectedWorkLocations.includes(loc)) return false;
      } else if (categoryFilters.workLocation !== 'all') {
        const loc = emp.work_location || emp.workLocation || emp.address || '';
        if (loc !== categoryFilters.workLocation) return false;
      }

      // 5. Qualification (التحصيل العلمي / الشهادة الدراسية المعتمدة)
      if (categoryFilters.selectedQualifications && categoryFilters.selectedQualifications.length > 0) {
        const q = emp.education_level || emp.educationLevel || emp.qualification || emp.education || emp.certificate || '';
        const matches = categoryFilters.selectedQualifications.some(sel =>
          q === sel || q.includes(sel) || sel.includes(q)
        );
        if (!matches) return false;
      } else if (categoryFilters.qualification !== 'all') {
        const q = emp.education_level || emp.educationLevel || emp.qualification || emp.education || emp.certificate || '';
        if (q !== categoryFilters.qualification && !q.includes(categoryFilters.qualification)) return false;
      }

      // 6. Job Title (العناوين الوظيفية - دعم التحديد المتعدد والبحث)
      if (categoryFilters.selectedJobTitles && categoryFilters.selectedJobTitles.length > 0) {
        const jt = (emp.job_title || emp.jobTitle || '').trim();
        const matches = categoryFilters.selectedJobTitles.some(selectedJt =>
          jt === selectedJt || jt.includes(selectedJt) || selectedJt.includes(jt)
        );
        if (!matches) return false;
      } else if (categoryFilters.jobTitle !== 'all') {
        const jt = emp.job_title || emp.jobTitle || '';
        if (jt !== categoryFilters.jobTitle && !jt.includes(categoryFilters.jobTitle)) return false;
      }

      if (categoryFilters.searchJobTitle && categoryFilters.searchJobTitle.trim()) {
        const jt = emp.job_title || emp.jobTitle || '';
        const query = categoryFilters.searchJobTitle.trim().toLowerCase();
        if (!jt.toLowerCase().includes(query)) return false;
      }

      // 7. Employee Status (الحالة الوظيفية)
      if (categoryFilters.employeeStatus !== 'all') {
        const st = (emp.status || emp.job_status || '').trim();
        if (st !== categoryFilters.employeeStatus && !st.includes(categoryFilters.employeeStatus)) return false;
      }

      // 8. Ethnicity (القومية)
      if (categoryFilters.ethnicity !== 'all') {
        const eth = (emp.ethnicity || '').trim();
        if (eth !== categoryFilters.ethnicity && !eth.includes(categoryFilters.ethnicity)) return false;
      }

      // 9. Religion (الديانة)
      if (categoryFilters.religion !== 'all') {
        const rel = (emp.religion || '').trim();
        if (rel !== categoryFilters.religion && !rel.includes(categoryFilters.religion)) return false;
      }

      return true;
    });
  };

  const matchingCategoryEmployees = getMatchingCategoryEmployees();
  const finalTargetEmployees = matchingCategoryEmployees.filter(emp => !manualExcludedEmpIds.has(String(emp.id)));

  const filteredPreviewEmployees = matchingCategoryEmployees.filter(emp => {
    if (!previewSearchTerm.trim()) return true;
    const q = previewSearchTerm.trim().toLowerCase();
    const name = (emp.full_name || emp.fullName || '').toLowerCase();
    const companyNum = String(emp.company_number || emp.companyNumber || emp.id || '').toLowerCase();
    return name.includes(q) || companyNum.includes(q);
  });

  const [penaltyTypesList, setPenaltyTypesList] = useState([]);

  // Penalty Form
  const [penaltyForm, setPenaltyForm] = useState({
    employee_id: searchParams.get('employee') || '',
    penalty_type: 'إنذار خطي',
    penalty_date: new Date().toISOString().split('T')[0],
    order_number: '',
    reason: '',
    days_count: 0,
    financial_amount: 0,
    notes: '',
    status: 'نافذ'
  });

  const loadData = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.Penalty.list('-penalty_date', 200).catch(() => []),
      apiClient.entities.Appreciation.list('-order_date', 200).catch(() => []),
      apiClient.entities.Employee.list().catch(() => []),
      apiClient.entities.OrgUnit.list().catch(() => []),
      apiClient.entities.WorkLocation.list().catch(() => []),
      apiClient.entities.EducationDegree.list().catch(() => []),
      apiClient.entities.Qualification.list().catch(() => []),
      fetchPenaltyTypesSorted().catch(() => [])
    ]).then(([pen, app, emps, orgs, locs, eduDegs, qualifs, pTypes]) => {
      setPenalties(pen || []);
      setAppreciations(app || []);
      setEmployees(emps || []);
      setDbOrgUnits(orgs || []);
      setDbWorkLocations(locs || []);
      setDbEducationDegrees([...(eduDegs || []), ...(qualifs || [])]);

      if (pTypes && pTypes.length > 0) {
        const activeTypes = pTypes.filter(pt => pt.status === 'فعال' || !pt.status);
        const listToUse = activeTypes.length > 0 ? activeTypes : pTypes;
        setPenaltyTypesList(listToUse);
        // If current penalty_type is not in list, set to first
        setPenaltyForm(prev => {
          const names = listToUse.map(t => t.name || t);
          if (!names.includes(prev.penalty_type) && names.length > 0) {
            return { ...prev, penalty_type: names[0] };
          }
          return prev;
        });
      } else {
        const fallback = ['لفت نظر', 'إنذار خطي', 'قطع الراتب (يوم)', 'قطع الراتب (أيام)', 'توبيخ إداري', 'إنقاص الراتب', 'تنزيل الدرجة', 'فصل من الخدمة'].map(n => ({ id: n, name: n }));
        setPenaltyTypesList(fallback);
      }

      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();

    const handleSettingsOrDataChange = () => {
      loadData();
    };

    const unsubscribeSettings = subscribeToSettingsUpdates((detail) => {
      loadData();
    });

    window.addEventListener('hr_settings_changed', handleSettingsOrDataChange);
    window.addEventListener('storage', handleSettingsOrDataChange);
    return () => {
      unsubscribeSettings();
      window.removeEventListener('hr_settings_changed', handleSettingsOrDataChange);
      window.removeEventListener('storage', handleSettingsOrDataChange);
    };
  }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  // Helper matching functions for duplicates
  const normalizeVal = (val) => String(val || '').trim().toLowerCase();

  const isDuplicateAppreciation = (appItem, empId, orderNumber, orderDate, currentId = null) => {
    if (currentId && (appItem.id === currentId || String(appItem.id) === String(currentId))) {
      return false;
    }
    const itemEmpId = String(appItem.employee_id || appItem.employeeId || '');
    const itemOrderNum = normalizeVal(appItem.order_number || appItem.orderNumber);
    const itemOrderDate = normalizeVal(appItem.order_date || appItem.orderDate);
    return (
      itemEmpId === String(empId) &&
      itemOrderNum === normalizeVal(orderNumber) &&
      itemOrderDate === normalizeVal(orderDate)
    );
  };

  const isDuplicatePenalty = (penItem, empId, orderNumber, penaltyDate, currentId = null) => {
    if (currentId && (penItem.id === currentId || String(penItem.id) === String(currentId))) {
      return false;
    }
    const itemEmpId = String(penItem.employee_id || penItem.employeeId || '');
    const itemOrderNum = normalizeVal(penItem.order_number || penItem.orderNumber);
    const itemDate = normalizeVal(penItem.penalty_date || penItem.penaltyDate || penItem.order_date || penItem.orderDate);
    return (
      itemEmpId === String(empId) &&
      itemOrderNum === normalizeVal(orderNumber) &&
      itemDate === normalizeVal(penaltyDate)
    );
  };

  // Appreciations Submit
  const handleAppreciationSubmit = async (e) => {
    if (e) e.preventDefault();

    if (!appreciationForm.order_number?.trim()) {
      toast({ title: 'يرجى إدخال رقم كتاب الشكر والتقدير', variant: 'destructive' });
      return;
    }

    if (!appreciationForm.reason?.trim()) {
      toast({ title: 'يرجى إدخال سبب/مناسبة منح كتاب الشكر والتقدير', variant: 'destructive' });
      return;
    }

    // Save custom issuer if entered
    if (appreciationForm.issuer?.trim()) {
      handleAddCustomIssuer(appreciationForm.issuer.trim());
    }

    let targetEmpIds = [];

    if (editingAppreciation) {
      if (!appreciationForm.employee_id) {
        toast({ title: 'يرجى اختيار الموظف', variant: 'destructive' });
        return;
      }
      targetEmpIds = [String(appreciationForm.employee_id)];
    } else if (appreciationTargetMode === 'single') {
      if (!appreciationForm.employee_id) {
        toast({ title: 'يرجى اختيار الموظف الموجه له الشكر', variant: 'destructive' });
        return;
      }
      targetEmpIds = [String(appreciationForm.employee_id)];
    } else if (appreciationTargetMode === 'multiple') {
      if (multiSelectedEmpIds.length === 0) {
        toast({ title: 'يرجى اختيار موظف واحد على الأقل في القائمة', variant: 'destructive' });
        return;
      }
      targetEmpIds = multiSelectedEmpIds.map(id => String(id));
    } else if (appreciationTargetMode === 'category') {
      targetEmpIds = finalTargetEmployees.map(emp => String(emp.id));
      if (targetEmpIds.length === 0) {
        toast({ title: 'لا يوجد أي موظف مشمول بناءً على الفلاتر وقواعد الاستثناء الحالية', variant: 'destructive' });
        return;
      }
    }

    const orderNum = appreciationForm.order_number.trim();
    const orderDate = (appreciationForm.order_date || '').trim();

    // Check duplicate for single employee / editing
    if (editingAppreciation || appreciationTargetMode === 'single') {
      const singleEmpId = targetEmpIds[0];
      const existing = appreciations.find(a =>
        isDuplicateAppreciation(a, singleEmpId, orderNum, orderDate, editingAppreciation?.id)
      );
      if (existing) {
        const empObj = empMap[singleEmpId];
        const empName = empObj?.full_name || empObj?.fullName || `الموظف رقم ${singleEmpId}`;
        toast({
          title: 'كتاب الشكر مضاف سابقاً',
          description: `الموظف (${empName}) لديه كتاب شكر وتقدير مسجل سابقاً بنفس الرقم (${orderNum}) والتاريخ (${orderDate}).`,
          variant: 'destructive'
        });
        return;
      }
    }

    // Check duplicates for multi-select / category target modes
    let toAddEmpIds = [...targetEmpIds];
    let alreadyBenefitedEmpIds = [];

    if (!editingAppreciation && (appreciationTargetMode === 'multiple' || appreciationTargetMode === 'category')) {
      alreadyBenefitedEmpIds = targetEmpIds.filter(empId =>
        appreciations.some(a => isDuplicateAppreciation(a, empId, orderNum, orderDate))
      );
      toAddEmpIds = targetEmpIds.filter(empId => !alreadyBenefitedEmpIds.includes(empId));

      if (alreadyBenefitedEmpIds.length > 0 && toAddEmpIds.length === 0) {
        // All targeted employees already have this appreciation
        setDuplicateAppreciationReport({
          orderNumber: orderNum,
          orderDate: orderDate,
          addedCount: 0,
          alreadyBenefitedEmps: alreadyBenefitedEmpIds.map(id => empMap[id] || { id, full_name: `موظف #${id}` })
        });
        return;
      }
    }

    setSubmittingBatch(true);
    try {
      if (editingAppreciation) {
        await apiClient.entities.Appreciation.update(editingAppreciation.id, {
          ...appreciationForm,
          employee_id: parseInt(toAddEmpIds[0])
        });
        toast({ title: 'تم تحديث كتاب الشكر والتقدير بنجاح' });
      } else {
        let count = 0;
        for (const empId of toAddEmpIds) {
          await apiClient.entities.Appreciation.create({
            ...appreciationForm,
            employee_id: parseInt(empId)
          });
          count++;
        }

        if (alreadyBenefitedEmpIds.length > 0) {
          setDuplicateAppreciationReport({
            orderNumber: orderNum,
            orderDate: orderDate,
            addedCount: count,
            alreadyBenefitedEmps: alreadyBenefitedEmpIds.map(id => empMap[id] || { id, full_name: `موظف #${id}` })
          });
          toast({
            title: 'تم تسجيل كتاب الشكر والتقدير',
            description: `تم شمول (${count}) موظف جديد، وتخطي (${alreadyBenefitedEmpIds.length}) موظف لأنهم مستفيدون سابقاً من الكتاب.`
          });
        } else {
          toast({
            title: 'تم تسجيل كتاب الشكر والتقدير بنجاح',
            description: `تم إضافة كتاب الشكر والتقدير لـ (${count}) موظف بنجاح.`
          });
        }
      }

      resetAppreciationForm();
      loadData();
    } catch (err) {
      toast({ title: 'حدث خطأ أثناء حفظ كتاب الشكر والتقدير', description: err.message, variant: 'destructive' });
    } finally {
      setSubmittingBatch(false);
    }
  };

  const resetAppreciationForm = () => {
    setShowAppreciationForm(true);
    setEditingAppreciation(null);
    setAppreciationTargetMode('single');
    setMultiSelectedEmpIds([]);
    setManualExcludedEmpIds(new Set());
    setPreviewSearchTerm('');
    setCategoryFilters({
      gender: 'all',
      serviceType: 'all',
      department: 'all',
      selectedOrgUnits: [],
      workLocation: 'all',
      selectedWorkLocations: [],
      qualification: 'all',
      selectedQualifications: [],
      jobTitle: 'all',
      selectedJobTitles: [],
      searchJobTitle: '',
      employeeStatus: 'all',
      ethnicity: 'all',
      religion: 'all',
    });
    setAppreciationForm({
      employee_id: '',
      order_number: '',
      order_date: new Date().toISOString().split('T')[0],
      issuer: savedIssuers[0] || 'السيد المدير العام',
      reason: '',
      seniority_impact: 'قدم شهر واحد',
      notes: ''
    });
  };

  const resetPenaltyForm = () => {
    setShowPenaltyForm(true);
    setEditingPenalty(null);
    setPenaltyForm({
      employee_id: '',
      penalty_type: 'إنذار خطي',
      penalty_date: new Date().toISOString().split('T')[0],
      order_number: '',
      reason: '',
      days_count: 0,
      financial_amount: 0,
      notes: '',
      status: 'نافذ'
    });
  };

  // Penalties Submit
  const handlePenaltySubmit = async (e) => {
    if (e) e.preventDefault();
    if (!penaltyForm.employee_id) {
      toast({ title: 'يرجى اختيار الموظف', variant: 'destructive' });
      return;
    }
    if (!penaltyForm.order_number?.trim()) {
      toast({ title: 'يرجى إدخال رقم الأمر الإداري للعقوبة', variant: 'destructive' });
      return;
    }

    const orderNum = penaltyForm.order_number.trim();
    const orderDate = (penaltyForm.penalty_date || '').trim();
    const empId = penaltyForm.employee_id;

    // Check duplicate penalty
    const existing = penalties.find(p =>
      isDuplicatePenalty(p, empId, orderNum, orderDate, editingPenalty?.id)
    );

    if (existing) {
      const empObj = empMap[empId];
      const empName = empObj?.full_name || empObj?.fullName || `الموظف رقم ${empId}`;
      toast({
        title: 'العقوبة الإدارية مضافة سابقاً',
        description: `الموظف (${empName}) لديه عقوبة إدارية مسجلة سابقاً بنفس رقم الأمر (${orderNum}) والتاريخ (${orderDate}).`,
        variant: 'destructive'
      });
      return;
    }

    try {
      if (editingPenalty) {
        await apiClient.entities.Penalty.update(editingPenalty.id, penaltyForm);
        toast({ title: 'تم تحديث سجل العقوبة بنجاح' });
      } else {
        await apiClient.entities.Penalty.create(penaltyForm);
        toast({ title: 'تم تسجيل العقوبة بنجاح' });
      }
      resetPenaltyForm();
      loadData();
    } catch (err) {
      toast({ title: 'حدث خطأ أثناء حفظ العقوبة', description: err.message, variant: 'destructive' });
    }
  };

  // Delete Appreciation
  const handleDeleteAppreciation = (id, orderNum = '') => {
    setDeleteConfirmTarget({
      title: 'حذف كتاب شكر وتقدير',
      message: orderNum ? `هل أنت متأكد من حذف كتاب الشكر رقم (${orderNum}) لهذا الموظف؟` : 'هل أنت متأكد من حذف كتاب الشكر والتقدير هذا؟',
      onConfirm: async () => {
        try {
          await apiClient.entities.Appreciation.delete(id);
          toast({ title: 'تم حذف كتاب الشكر بنجاح' });
          loadData();
        } catch (err) {
          toast({ title: 'تعذر الحذف', description: err.message, variant: 'destructive' });
        }
      }
    });
  };

  // Delete Penalty
  const handleDeletePenalty = (id, orderNum = '') => {
    setDeleteConfirmTarget({
      title: 'حذف عقوبة إدارية',
      message: orderNum ? `هل أنت متأكد من حذف العقوبة الإدارية رقم (${orderNum}) لهذا الموظف؟` : 'هل أنت متأكد من حذف هذه العقوبة الإدارية؟',
      onConfirm: async () => {
        try {
          await apiClient.entities.Penalty.delete(id);
          toast({ title: 'تم حذف العقوبة بنجاح' });
          loadData();
        } catch (err) {
          toast({ title: 'تعذر الحذف', description: err.message, variant: 'destructive' });
        }
      }
    });
  };

  // Delete Entire Order / Book for all included employees
  const handleDeleteEntireOrder = (orderObj) => {
    if (!orderObj || !orderObj.records || orderObj.records.length === 0) return;
    const confirmMsg = `هل أنت متأكد من حذف ${orderObj.typeName} رقم (${orderObj.orderNumber}) بالكامل لكافة الموظفين المشمولين وعددهم (${orderObj.records.length})؟`;
    
    setDeleteConfirmTarget({
      title: `حذف ${orderObj.typeName} بالكامل`,
      message: confirmMsg,
      onConfirm: async () => {
        try {
          for (const rec of orderObj.records) {
            if (orderObj.type === 'appreciation') {
              await apiClient.entities.Appreciation.delete(rec.id);
            } else {
              await apiClient.entities.Penalty.delete(rec.id);
            }
          }
          toast({ title: 'تم حذف الكتاب بجميع المشمولين به بنجاح' });
          setSelectedOrderKey('');
          setOrderQuerySearchTerm('');
          loadData();
        } catch (err) {
          toast({ title: 'تعذر الحذف', description: err.message, variant: 'destructive' });
        }
      }
    });
  };

  // Filtered lists
  const filteredAppreciations = appreciations.filter(a => {
    const emp = empMap[a.employee_id || a.employeeId];
    const empName = emp?.full_name || emp?.fullName || '';
    const compNum = (emp?.company_number || emp?.companyNumber || '').toString();
    const q = searchQuery.toLowerCase();
    return (
      empName.toLowerCase().includes(q) ||
      compNum.toLowerCase().includes(q) ||
      (a.order_number || a.orderNumber || '').toLowerCase().includes(q) ||
      (a.reason || '').toLowerCase().includes(q) ||
      (a.issuer || '').toLowerCase().includes(q)
    );
  });

  const filteredPenalties = penalties.filter(p => {
    const emp = empMap[p.employee_id || p.employeeId];
    const empName = emp?.full_name || emp?.fullName || '';
    const compNum = (emp?.company_number || emp?.companyNumber || '').toString();
    const q = searchQuery.toLowerCase();
    return (
      empName.toLowerCase().includes(q) ||
      compNum.toLowerCase().includes(q) ||
      (p.order_number || p.orderNumber || '').toLowerCase().includes(q) ||
      (p.reason || '').toLowerCase().includes(q) ||
      (p.penalty_type || p.penaltyType || '').toLowerCase().includes(q)
    );
  });

  // Unique Appreciation Books Stats (counts unique order numbers, not employee entries)
  const uniqueAppreciationOrders = useMemo(() => {
    const totalOrders = new Set();
    const seniorityOrders = new Set();
    const moralOrders = new Set();

    appreciations.forEach(a => {
      const orderNum = (a.order_number || a.orderNumber || '').trim() || `id_${a.id}`;
      totalOrders.add(orderNum);

      const impact = a.seniority_impact || a.seniorityImpact || '';
      if (impact.includes('قدم')) {
        seniorityOrders.add(orderNum);
      }
      if (impact.includes('معنوي')) {
        moralOrders.add(orderNum);
      }
    });

    return {
      totalCount: totalOrders.size,
      seniorityCount: seniorityOrders.size,
      moralCount: moralOrders.size,
    };
  }, [appreciations]);

  // Unique Penalty Orders Stats (counts unique order numbers, not employee entries)
  const uniquePenaltyOrders = useMemo(() => {
    const totalOrders = new Set();
    const activeOrders = new Set();

    penalties.forEach(p => {
      const orderNum = (p.order_number || p.orderNumber || '').trim() || `id_${p.id}`;
      totalOrders.add(orderNum);

      const status = p.status || 'نافذ';
      if (status === 'نافذ') {
        activeOrders.add(orderNum);
      }
    });

    return {
      totalCount: totalOrders.size,
      activeCount: activeOrders.size,
    };
  }, [penalties]);

  // Query Employee Calculations
  const queriedEmployee = selectedEmployeeForQuery
    ? (empMap[selectedEmployeeForQuery] || employees.find(e => String(e.id) === String(selectedEmployeeForQuery)))
    : null;

  const queriedEmpAppreciations = queriedEmployee
    ? appreciations.filter(a => String(a.employee_id || a.employeeId) === String(queriedEmployee.id))
    : [];

  const queriedEmpPenalties = queriedEmployee
    ? penalties.filter(p => String(p.employee_id || p.employeeId) === String(queriedEmployee.id))
    : [];

  // Query Order Calculations
  const distinctOrdersMap = {};

  appreciations.forEach(a => {
    const orderNum = (a.order_number || a.orderNumber || '').trim();
    if (!orderNum) return;
    const key = `appreciation_${orderNum}`;
    if (!distinctOrdersMap[key]) {
      distinctOrdersMap[key] = {
        key,
        orderNumber: orderNum,
        type: 'appreciation',
        typeName: 'كتاب شكر وتقدير',
        date: a.order_date || a.orderDate || '—',
        issuer: a.issuer || 'السيد المدير العام',
        reason: a.reason || '—',
        impact: a.seniority_impact || a.seniorityImpact || 'قدم شهر واحد',
        records: []
      };
    }
    distinctOrdersMap[key].records.push(a);
  });

  penalties.forEach(p => {
    const orderNum = (p.order_number || p.orderNumber || '').trim();
    if (!orderNum) return;
    const key = `penalty_${orderNum}`;
    if (!distinctOrdersMap[key]) {
      distinctOrdersMap[key] = {
        key,
        orderNumber: orderNum,
        type: 'penalty',
        typeName: 'عقوبة إدارية',
        date: p.penalty_date || p.penaltyDate || '—',
        issuer: 'الأمر الإداري',
        reason: p.reason || '—',
        impact: p.penalty_type || p.penaltyType || 'خصم إداري',
        records: []
      };
    }
    distinctOrdersMap[key].records.push(p);
  });

  const distinctOrders = Object.values(distinctOrdersMap);

  const filteredDistinctOrders = distinctOrders.filter(ord => {
    if (orderTypeFilter !== 'all' && ord.type !== orderTypeFilter) return false;
    if (!orderQuerySearchTerm.trim()) return true;
    const q = orderQuerySearchTerm.trim().toLowerCase();
    return (
      ord.orderNumber.toLowerCase().includes(q) ||
      ord.reason.toLowerCase().includes(q) ||
      ord.issuer.toLowerCase().includes(q)
    );
  });

  const selectedOrderObj = distinctOrders.find(o => o.key === selectedOrderKey) || null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4" dir="rtl">
        <div className="text-right">
          <h1 className="text-2xl font-black text-[#1B3A6B]">التشكرات والعقوبات الإدارية</h1>
          <p className="text-slate-500 text-xs mt-1">
            إضافة وتوثيق كتب الشكر والتقدير والعقوبات الإدارية والاستعلام المباشر عن الموظفين والكتب الرسمية
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-3" dir="rtl">
          <TabsList className="bg-slate-100 p-1 rounded-2xl gap-1 flex flex-wrap">
            <TabsTrigger
              value="add_appreciation"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-emerald-700 data-[state=active]:text-white transition-all"
            >
              <Award size={16} />
              إضافة كتاب شكر وتقدير
            </TabsTrigger>

            <TabsTrigger
              value="add_penalty"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-rose-700 data-[state=active]:text-white transition-all"
            >
              <ShieldAlert size={16} />
              تسجيل عقوبة إدارية
            </TabsTrigger>

            <TabsTrigger
              value="query_employee"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white transition-all"
            >
              <Search size={16} />
              الاستعلام عن موظف
            </TabsTrigger>

            <TabsTrigger
              value="query_order"
              className="rounded-xl px-4 py-2 text-xs font-bold gap-2 data-[state=active]:bg-amber-600 data-[state=active]:text-white transition-all"
            >
              <FileText size={16} />
              الاستعلام عن كتاب (شكر / عقوبة)
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ----------------- TAB 1: ADD APPRECIATION ----------------- */}
        <TabsContent value="add_appreciation" className="space-y-5 mt-5" dir="rtl">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" dir="rtl">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between text-right">
              <div className="text-right">
                <p className="text-emerald-800 text-xs font-bold mb-0.5">إجمالي كتب الشكر</p>
                <p className="text-2xl font-black text-emerald-900">{uniqueAppreciationOrders.totalCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Award size={20} />
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 flex items-center justify-between text-right">
              <div className="text-right">
                <p className="text-blue-800 text-xs font-bold mb-0.5">شكر بأثر قدم ممتاز</p>
                <p className="text-2xl font-black text-blue-900">
                  {uniqueAppreciationOrders.seniorityCount}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex items-center justify-between text-right">
              <div className="text-right">
                <p className="text-amber-800 text-xs font-bold mb-0.5">شكر معنوي فقط</p>
                <p className="text-2xl font-black text-amber-900">
                  {uniqueAppreciationOrders.moralCount}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
            </div>
          </div>

          {/* Form for Adding / Editing Appreciation */}
          {showAppreciationForm && (
            <form onSubmit={handleAppreciationSubmit} dir="rtl" className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-200/80 space-y-5 text-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3" dir="rtl">
                <h3 className="font-bold text-emerald-900 flex items-center gap-2 text-base text-right">
                  <Award size={18} className="text-emerald-700 shrink-0" />
                  {editingAppreciation ? 'تعديل بيانات كتاب الشكر والتقدير' : 'تسجيل كتاب شكر وتقدير جديد'}
                </h3>
              </div>

              {/* Mode Selection for New Appreciation */}
              {!editingAppreciation && (
                <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                  <Label className="text-xs font-bold text-slate-800 block mb-1">طريقة توجيه كتاب الشكر والتقدير *</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAppreciationTargetMode('single')}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        appreciationTargetMode === 'single'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>شخص واحد (موظف فردي)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAppreciationTargetMode('multiple')}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        appreciationTargetMode === 'multiple'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>مجموعة موظفين محددين ({multiSelectedEmpIds.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAppreciationTargetMode('category')}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                        appreciationTargetMode === 'category'
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>تحديد فئات المشمولين وقواعد الاستثناء ({finalTargetEmployees.length})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 1: SINGLE EMPLOYEE */}
              {(editingAppreciation || appreciationTargetMode === 'single') && (
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">الموظف الموجه له الشكر *</Label>
                  <EmployeeSearchSelect
                    employees={employees}
                    value={appreciationForm.employee_id}
                    onChange={(val) => setAppreciationForm(prev => ({ ...prev, employee_id: val }))}
                    placeholder="ابحث باسم الموظف أو رقم الشركة..."
                  />
                </div>
              )}

              {/* MODE 2: MULTIPLE SPECIFIC EMPLOYEES */}
              {!editingAppreciation && appreciationTargetMode === 'multiple' && (
                <div className="space-y-3 bg-emerald-50/40 p-4 rounded-2xl border border-emerald-100">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-emerald-950">إضافة موظفين إلى قائمة المشمولين بكتاب الشكر *</Label>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                      عدد المحددين: {multiSelectedEmpIds.length} موظف
                    </span>
                  </div>

                  <EmployeeSearchSelect
                    employees={employees.filter(e => !multiSelectedEmpIds.includes(String(e.id)))}
                    value=""
                    onChange={(selectedId) => {
                      if (selectedId && !multiSelectedEmpIds.includes(selectedId)) {
                        setMultiSelectedEmpIds(prev => [...prev, selectedId]);
                      }
                    }}
                    placeholder="ابحث واختر الموظف لإضافته للقائمة..."
                  />

                  {/* Selected Employees List / Chips */}
                  {multiSelectedEmpIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-2 max-h-48 overflow-y-auto">
                      {multiSelectedEmpIds.map(id => {
                        const emp = empMap[id];
                        if (!emp) return null;
                        return (
                          <div key={id} className="bg-white border border-emerald-200 rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-xs text-xs font-semibold text-slate-800">
                            <span>{emp.full_name || emp.fullName}</span>
                            <span className="text-[10px] text-slate-500 font-mono">({emp.company_number || emp.companyNumber || `#${emp.id}`})</span>
                            <button
                              type="button"
                              onClick={() => setMultiSelectedEmpIds(prev => prev.filter(x => x !== id))}
                              className="text-slate-400 hover:text-rose-600 font-bold mr-1 text-sm"
                              title="إزالة من القائمة"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-center text-slate-400 py-3 bg-white/60 rounded-xl border border-dashed border-slate-200">
                      لم يتم إضافة أي موظف للقائمة بعد. استخدم حقل البحث أعلاه لإضافة الموظفين.
                    </div>
                  )}
                </div>
              )}

              {/* MODE 3: BATCH CATEGORY TARGETING & EXCLUSIONS */}
              {!editingAppreciation && appreciationTargetMode === 'category' && (
                <div className="space-y-4">
                  {/* Category Inclusion Filters */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                    <div className="font-bold text-xs text-slate-900 border-b border-slate-200/80 pb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-xs"></span>
                        <span className="font-bold text-slate-900">فئات المشمولين بكتاب الشكر والتقدير</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setCategoryFilters({
                            gender: 'all',
                            serviceType: 'all',
                            department: 'all',
                            selectedOrgUnits: [],
                            workLocation: 'all',
                            selectedWorkLocations: [],
                            qualification: 'all',
                            selectedQualifications: [],
                            jobTitle: 'all',
                            selectedJobTitles: [],
                            searchJobTitle: '',
                            employeeStatus: 'all',
                            ethnicity: 'all',
                            religion: 'all',
                          });
                        }}
                        className="h-7 px-2.5 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg gap-1"
                      >
                        <RotateCcw size={12} />
                        إعادة ضبط جميع الفلاتر
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 text-right">
                      {/* 1. Gender */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-700 block mb-1">الجنس</Label>
                        <Select
                          dir="rtl"
                          value={categoryFilters.gender}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, gender: v }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كلا الجنسين" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">كلا الجنسين (ذكور وإناث)</SelectItem>
                            <SelectItem value="ذكر">ذكر فقط</SelectItem>
                            <SelectItem value="أنثى">أنثى فقط</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 2. Service Type */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-700 block mb-1">نوع الخدمة</Label>
                        <Select
                          dir="rtl"
                          value={categoryFilters.serviceType}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, serviceType: v }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة أنواع الخدمة" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">كافة أنواع الخدمة</SelectItem>
                            {serviceTypeOptions.map(st => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 3. Department / Org Structure (التشكيل) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[11px] font-semibold text-slate-700">التشكيل (الهيكل التنظيمي)</Label>
                          <button
                            type="button"
                            onClick={() => setShowOrgPickerModal(true)}
                            className="text-[10px] text-emerald-700 hover:underline font-bold"
                          >
                            + تحديد متعدد
                          </button>
                        </div>
                        <Select
                          dir="rtl"
                          value={categoryFilters.department}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, department: v, selectedOrgUnits: [] }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة التشكيلات والأقسام" />
                          </SelectTrigger>
                          <SelectContent dir="rtl" className="max-h-60">
                            <SelectItem value="all">كافة التشكيلات والأقسام</SelectItem>
                            {departmentsList.map(dept => (
                              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 4. Work Location */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[11px] font-semibold text-slate-700">موقع العمل</Label>
                          <button
                            type="button"
                            onClick={() => setShowWorkLocationModal(true)}
                            className="text-[10px] text-emerald-700 hover:underline font-bold"
                          >
                            + تحديد متعدد
                          </button>
                        </div>
                        <Select
                          dir="rtl"
                          value={categoryFilters.workLocation}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, workLocation: v, selectedWorkLocations: [] }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة مواقع العمل" />
                          </SelectTrigger>
                          <SelectContent dir="rtl" className="max-h-60">
                            <SelectItem value="all">كافة مواقع العمل والحقول</SelectItem>
                            {workLocationsList.map(loc => (
                              <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 5. Employee Status */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-700 block mb-1">الحالة الوظيفية</Label>
                        <Select
                          dir="rtl"
                          value={categoryFilters.employeeStatus}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, employeeStatus: v }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة الحالات" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">كافة الحالات الوظيفية</SelectItem>
                            {statusOptions.map(st => (
                              <SelectItem key={st} value={st}>{st}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 6. Ethnicity (القومية) */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-700 block mb-1">القومية</Label>
                        <Select
                          dir="rtl"
                          value={categoryFilters.ethnicity}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, ethnicity: v }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة القوميات" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">كافة القوميات</SelectItem>
                            {ethnicityOptions.map(eth => (
                              <SelectItem key={eth} value={eth}>{eth}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 7. Religion (الديانة) */}
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-700 block mb-1">الديانة</Label>
                        <Select
                          dir="rtl"
                          value={categoryFilters.religion}
                          onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, religion: v }))}
                        >
                          <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200">
                            <SelectValue placeholder="كافة الديانات" />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="all">كافة الديانات</SelectItem>
                            {religionOptions.map(rel => (
                              <SelectItem key={rel} value={rel}>{rel}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* 8. Job Title Select, Search & Multi-Insert */}
                      <div className="sm:col-span-2 md:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-[11px] font-semibold text-slate-700">العنوان الوظيفي (البحث والإدراج)</Label>
                          <button
                            type="button"
                            onClick={() => setShowJobTitleModal(true)}
                            className="text-[10px] text-violet-700 hover:underline font-bold"
                          >
                            + تحديد/إدراج عناوين متعددة
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <Select
                            dir="rtl"
                            value={categoryFilters.jobTitle}
                            onValueChange={(v) => setCategoryFilters(prev => ({ ...prev, jobTitle: v, selectedJobTitles: [] }))}
                          >
                            <SelectTrigger dir="rtl" className="h-8 text-xs bg-white rounded-xl border-slate-200 flex-1">
                              <SelectValue placeholder="كافة العناوين" />
                            </SelectTrigger>
                            <SelectContent dir="rtl" className="max-h-60">
                              <SelectItem value="all">كافة العناوين الوظيفية</SelectItem>
                              {jobTitlesList.map(jt => (
                                <SelectItem key={jt} value={jt}>{jt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="تصفية السريعة بالنص..."
                            value={categoryFilters.searchJobTitle}
                            onChange={(e) => setCategoryFilters(prev => ({ ...prev, searchJobTitle: e.target.value }))}
                            className="h-8 text-xs w-36 bg-white rounded-xl border-slate-200"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Multi Selected Org Units Badge Pills */}
                    {categoryFilters.selectedOrgUnits?.length > 0 && (
                      <div className="bg-emerald-50/80 p-2.5 rounded-xl border border-emerald-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-emerald-900 flex items-center justify-between">
                          <span>التشكيلات المحددة من الهيكل ({categoryFilters.selectedOrgUnits.length}):</span>
                          <button
                            type="button"
                            onClick={() => setCategoryFilters(prev => ({ ...prev, selectedOrgUnits: [] }))}
                            className="text-[10px] text-rose-600 hover:underline font-bold"
                          >
                            مسح التشكيلات
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {categoryFilters.selectedOrgUnits.map(ou => (
                            <span key={ou} className="bg-white text-emerald-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border border-emerald-200 flex items-center gap-1 shadow-2xs">
                              {ou}
                              <button
                                type="button"
                                onClick={() => setCategoryFilters(prev => ({
                                  ...prev,
                                  selectedOrgUnits: prev.selectedOrgUnits.filter(x => x !== ou)
                                }))}
                                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Multi Selected Work Locations Badge Pills */}
                    {categoryFilters.selectedWorkLocations?.length > 0 && (
                      <div className="bg-blue-50/80 p-2.5 rounded-xl border border-blue-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-blue-900 flex items-center justify-between">
                          <span>مواقع العمل المحددة ({categoryFilters.selectedWorkLocations.length}):</span>
                          <button
                            type="button"
                            onClick={() => setCategoryFilters(prev => ({ ...prev, selectedWorkLocations: [] }))}
                            className="text-[10px] text-rose-600 hover:underline font-bold"
                          >
                            مسح المواقع
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {categoryFilters.selectedWorkLocations.map(loc => (
                            <span key={loc} className="bg-white text-blue-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border border-blue-200 flex items-center gap-1 shadow-2xs">
                              {loc}
                              <button
                                type="button"
                                onClick={() => setCategoryFilters(prev => ({
                                  ...prev,
                                  selectedWorkLocations: prev.selectedWorkLocations.filter(x => x !== loc)
                                }))}
                                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Multi Selected Job Titles Badge Pills */}
                    {categoryFilters.selectedJobTitles?.length > 0 && (
                      <div className="bg-violet-50/80 p-2.5 rounded-xl border border-violet-200/80 space-y-1.5">
                        <div className="text-[11px] font-bold text-violet-900 flex items-center justify-between">
                          <span>العناوين الوظيفية المحددة ({categoryFilters.selectedJobTitles.length}):</span>
                          <button
                            type="button"
                            onClick={() => setCategoryFilters(prev => ({ ...prev, selectedJobTitles: [] }))}
                            className="text-[10px] text-rose-600 hover:underline font-bold"
                          >
                            مسح العناوين
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {categoryFilters.selectedJobTitles.map(jt => (
                            <span key={jt} className="bg-white text-violet-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border border-violet-200 flex items-center gap-1 shadow-2xs">
                              {jt}
                              <button
                                type="button"
                                onClick={() => setCategoryFilters(prev => ({
                                  ...prev,
                                  selectedJobTitles: prev.selectedJobTitles.filter(x => x !== jt)
                                }))}
                                className="text-slate-400 hover:text-rose-600 font-bold ml-0.5"
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Interactive Educational Certificates / Multi-Select Badges */}
                    <div className="pt-1">
                      <div className="flex items-center justify-between mb-1.5">
                        <Label className="text-[11px] font-semibold text-slate-700 block">
                          التحصيل العلمي / الشهادات الدراسية المعتمدة في النظام (انقر لتحديد شهادة واحدة أو عدة شهادات):
                        </Label>
                        {categoryFilters.selectedQualifications?.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCategoryFilters(prev => ({ ...prev, selectedQualifications: [] }))}
                            className="text-[10px] text-rose-600 hover:underline font-bold"
                          >
                            مسح تحديد الشهادات
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {qualificationsList.map(q => {
                          const isSelected = categoryFilters.selectedQualifications?.includes(q);
                          return (
                            <button
                              type="button"
                              key={q}
                              onClick={() => {
                                setCategoryFilters(prev => {
                                  const current = prev.selectedQualifications || [];
                                  const updated = current.includes(q)
                                    ? current.filter(x => x !== q)
                                    : [...current, q];
                                  return { ...prev, selectedQualifications: updated, qualification: 'all' };
                                });
                              }}
                              className={`text-xs px-2.5 py-1 rounded-xl transition-all border font-medium ${
                                isSelected
                                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-xs'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {q} {isSelected && '✓'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Targeted Employees Live Table Preview */}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden space-y-3 p-3.5 shadow-2xs">
                    {/* Header with Total Included & Total Excluded counters */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">معاينة وتخصيص قائمة المشمولين:</span>
                        <span className="text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-200/80 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                          عدد المشمولين الكلي: {finalTargetEmployees.length} موظف
                        </span>
                        <span className="text-xs font-bold text-rose-800 bg-rose-100 border border-rose-200/80 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                          عدد المحجوبين الكلي: {matchingCategoryEmployees.length - finalTargetEmployees.length} موظف
                        </span>
                      </div>
                      
                      {manualExcludedEmpIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setManualExcludedEmpIds(new Set())}
                          className="text-[11px] font-bold text-slate-600 hover:text-emerald-700 underline shrink-0"
                        >
                          إلغاء جميع الحجوبات (إعادة شمول الكل)
                        </button>
                      )}
                    </div>

                    {/* Search input for employee name or company number */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <div className="relative w-full sm:w-80">
                        <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                        <Input
                          placeholder="ابحث بالاسم أو رقم الشركة للحجب..."
                          value={previewSearchTerm}
                          onChange={(e) => setPreviewSearchTerm(e.target.value)}
                          className="pr-9 h-8 text-xs bg-white rounded-lg border-slate-200"
                        />
                        {previewSearchTerm && (
                          <button
                            type="button"
                            onClick={() => setPreviewSearchTerm('')}
                            className="absolute left-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {previewSearchTerm ? `نتائج البحث: ${filteredPreviewEmployees.length} موظف` : `إجمالي القائمة: ${matchingCategoryEmployees.length} موظف`}
                      </div>
                    </div>

                    {/* Employee Rows */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs rounded-xl border border-slate-100 bg-slate-50/30">
                      {filteredPreviewEmployees.length > 0 ? (
                        filteredPreviewEmployees.map(emp => {
                          const empId = String(emp.id);
                          const isExcluded = manualExcludedEmpIds.has(empId);
                          const isIncluded = !isExcluded;

                          return (
                            <div
                              key={emp.id}
                              className={`p-2.5 flex items-center justify-between transition-colors ${
                                isIncluded ? 'bg-white hover:bg-emerald-50/40' : 'bg-rose-50/40 text-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={isIncluded}
                                  onChange={(e) => {
                                    setManualExcludedEmpIds(prev => {
                                      const next = new Set(prev);
                                      if (e.target.checked) {
                                        next.delete(empId);
                                      } else {
                                        next.add(empId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className={`font-bold ${isIncluded ? 'text-slate-800' : 'text-rose-900 line-through decoration-rose-400'}`}>
                                      {emp.full_name || emp.fullName}
                                    </span>
                                    <span className="font-mono text-[11px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                      #{emp.company_number || emp.companyNumber || emp.id}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {emp.job_title || emp.jobTitle || 'موظف'} {emp.department ? `• ${emp.department}` : ''} {(emp.education_level || emp.educationLevel || emp.qualification) ? `• ${emp.education_level || emp.educationLevel || emp.qualification}` : ''}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-[11px] shrink-0">
                                {isIncluded ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualExcludedEmpIds(prev => new Set(prev).add(empId));
                                    }}
                                    className="text-emerald-800 bg-emerald-100 hover:bg-rose-100 hover:text-rose-800 border border-emerald-200 hover:border-rose-300 font-bold px-3 py-1 rounded-lg transition-all"
                                  >
                                    مشمول (انقر للحجب)
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualExcludedEmpIds(prev => {
                                        const next = new Set(prev);
                                        next.delete(empId);
                                        return next;
                                      });
                                    }}
                                    className="text-rose-800 bg-rose-100 hover:bg-emerald-100 hover:text-emerald-800 border border-rose-200 hover:border-emerald-300 font-bold px-3 py-1 rounded-lg transition-all"
                                  >
                                    محجوب (انقر لإلغاء الحجب)
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center text-slate-400 py-8 text-xs">
                          {previewSearchTerm
                            ? 'لا يوجد موظف يطابق الاسم أو رقم الشركة المكتوب في البحث'
                            : 'لا يوجد أي موظف يطابق الفلاتر المحددة أعلاه'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Shared Metadata Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right pt-2 border-t border-slate-100" dir="rtl">
                {/* Order Number */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">رقم كتاب الشكر والتقدير *</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="مثال: ش/1054"
                    value={appreciationForm.order_number}
                    onChange={(e) => setAppreciationForm(prev => ({ ...prev, order_number: e.target.value }))}
                    required
                  />
                </div>

                {/* Order Date */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">تاريخ الإصدار *</Label>
                  <Input
                    type="date"
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white [color-scheme:light]"
                    value={appreciationForm.order_date}
                    onChange={(e) => setAppreciationForm(prev => ({ ...prev, order_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Dynamic Saved Issuers Field */}
                <div className="text-right">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold text-right block">جهة الإصدار / الجهة المانحة *</Label>
                    <div className="flex items-center gap-2">
                      {!isAddingNewIssuer && !isManagingIssuers && (
                        <>
                          <button
                            type="button"
                            onClick={() => setIsAddingNewIssuer(true)}
                            className="text-[11px] font-bold text-emerald-700 hover:underline"
                          >
                            + إضافة جديدة
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setIsManagingIssuers(true)}
                            className="text-[11px] font-bold text-rose-700 hover:underline"
                          >
                            حذف/إدارة الجهات
                          </button>
                        </>
                      )}
                      {isManagingIssuers && (
                        <button
                          type="button"
                          onClick={() => setIsManagingIssuers(false)}
                          className="text-[11px] font-bold text-slate-600 hover:underline"
                        >
                          تم (إغلاق الإدارة)
                        </button>
                      )}
                    </div>
                  </div>

                  {isManagingIssuers ? (
                    <div className="bg-rose-50/60 p-2.5 rounded-xl border border-rose-200/80 space-y-2 mt-1">
                      <div className="text-[11px] font-bold text-rose-950 flex items-center justify-between">
                        <span>إدارة القائمة (اضغط 🗑️ للحذف):</span>
                        <span className="text-[10px] text-rose-700">{savedIssuers.length} جهات محفوظة</span>
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-rose-100">
                        {savedIssuers.map(i => (
                          <div key={i} className="flex items-center justify-between pt-1.5 text-xs text-slate-800">
                            <span className="font-semibold">{i}</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteIssuer(i)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-100/80 transition-colors"
                              title={`حذف (${i}) من القائمة`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : isAddingNewIssuer ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Input
                        dir="rtl"
                        className="rounded-xl text-xs bg-white text-right placeholder:text-right flex-1"
                        placeholder="اكتب اسم جهة الإصدار الجديدة..."
                        value={newIssuerText}
                        onChange={(e) => setNewIssuerText(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs rounded-xl px-3"
                        onClick={() => {
                          if (newIssuerText.trim()) {
                            handleAddCustomIssuer(newIssuerText);
                            setAppreciationForm(prev => ({ ...prev, issuer: newIssuerText.trim() }));
                            setNewIssuerText('');
                            setIsAddingNewIssuer(false);
                          }
                        }}
                      >
                        حفظ
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs text-slate-500 rounded-xl px-2"
                        onClick={() => setIsAddingNewIssuer(false)}
                      >
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <Select
                      dir="rtl"
                      value={appreciationForm.issuer}
                      onValueChange={(v) => {
                        if (v === '__ADD_NEW__') {
                          setIsAddingNewIssuer(true);
                        } else if (v === '__MANAGE__') {
                          setIsManagingIssuers(true);
                        } else {
                          setAppreciationForm(prev => ({ ...prev, issuer: v }));
                        }
                      }}
                    >
                      <SelectTrigger dir="rtl" className="mt-1 rounded-xl text-xs text-right bg-white flex flex-row-reverse items-center justify-between">
                        <SelectValue className="text-right" />
                      </SelectTrigger>
                      <SelectContent dir="rtl" className="text-right max-h-60">
                        {savedIssuers.map(i => (
                          <SelectItem key={i} value={i} dir="rtl" className="text-right">
                            {i}
                          </SelectItem>
                        ))}
                        <SelectItem value="__ADD_NEW__" dir="rtl" className="text-right font-bold text-emerald-700 bg-emerald-50/50">
                          + كتابة وتخزين جهة جديدة...
                        </SelectItem>
                        <SelectItem value="__MANAGE__" dir="rtl" className="text-right font-bold text-rose-700 bg-rose-50/50">
                          ⚙️ حذف / إدارة جهات الإصدار...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Seniority Options */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">أثر القدم الممتاز *</Label>
                  <Select
                    dir="rtl"
                    value={appreciationForm.seniority_impact}
                    onValueChange={(v) => setAppreciationForm(prev => ({ ...prev, seniority_impact: v }))}
                  >
                    <SelectTrigger dir="rtl" className="mt-1 rounded-xl text-xs text-right bg-white flex flex-row-reverse items-center justify-between">
                      <SelectValue className="text-right" />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="text-right">
                      {SENIORITY_OPTIONS.map(s => (
                        <SelectItem key={s} value={s} dir="rtl" className="text-right">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Reason */}
                <div className="md:col-span-2 text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">سبب / مناسبة منح كتاب الشكر والتقدير *</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="مثال: لجهوده المتميزة في إنجاز مشروع التدقيق المالي السنوي بفترة قياسية"
                    value={appreciationForm.reason}
                    onChange={(e) => setAppreciationForm(prev => ({ ...prev, reason: e.target.value }))}
                    required
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-3 text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">ملاحظات إضافية</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="أي ملاحظات أو رقم ملف الأرشيف"
                    value={appreciationForm.notes}
                    onChange={(e) => setAppreciationForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-start gap-2 pt-3 border-t border-slate-100 mt-4" dir="rtl">
                <Button
                  type="submit"
                  disabled={submittingBatch}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold gap-2 px-6 shadow-xs"
                >
                  {submittingBatch ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>جاري حفظ كتاب الشكر والتقدير...</span>
                    </>
                  ) : (
                    <span>
                      {editingAppreciation
                        ? 'تحديث كتاب الشكر'
                        : appreciationTargetMode === 'single'
                        ? 'حفظ كتاب الشكر والتقدير'
                        : appreciationTargetMode === 'multiple'
                        ? `حفظ وتوجيه كتاب الشكر لـ (${multiSelectedEmpIds.length}) موظف`
                        : `حفظ وتوجيه كتاب الشكر لـ (${finalTargetEmployees.length}) موظف مشمول`}
                    </span>
                  )}
                </Button>
                <Button variant="outline" type="button" className="rounded-xl text-xs font-bold" onClick={resetAppreciationForm}>
                  تفريغ الحقول / إلغاء
                </Button>
              </div>
            </form>
          )}
        </TabsContent>

        {/* ----------------- TAB 2: ADD PENALTY ----------------- */}
        <TabsContent value="add_penalty" className="space-y-5 mt-5" dir="rtl">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" dir="rtl">
            <div className="bg-rose-50/60 border border-rose-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-rose-800 text-xs font-bold mb-0.5">إجمالي العقوبات المسجلة</p>
                <p className="text-2xl font-black text-rose-900">{uniquePenaltyOrders.totalCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                <ShieldAlert size={20} />
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-amber-800 text-xs font-bold mb-0.5">عقوبات نافذة حالياً</p>
                <p className="text-2xl font-black text-amber-900">
                  {uniquePenaltyOrders.activeCount}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
            </div>
          </div>

          {/* Form for Adding / Editing Penalty */}
          {showPenaltyForm && (
            <form onSubmit={handlePenaltySubmit} dir="rtl" className="bg-white rounded-2xl p-6 shadow-sm border border-rose-200/80 space-y-5 text-right">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3" dir="rtl">
                <h3 className="font-bold text-rose-950 flex items-center gap-2 text-base text-right">
                  <ShieldAlert size={18} className="text-rose-700 shrink-0" />
                  {editingPenalty ? 'تعديل بيانات العقوبة الإدارية' : 'تسجيل عقوبة إدارية جديدة'}
                </h3>
              </div>

              {/* Employee Selection for Single Employee */}
              <div className="text-right">
                <Label className="text-xs font-semibold text-right block mb-1">الموظف الموجهة له العقوبة *</Label>
                <EmployeeSearchSelect
                  employees={employees}
                  value={penaltyForm.employee_id}
                  onChange={(val) => setPenaltyForm(prev => ({ ...prev, employee_id: val }))}
                  placeholder="ابحث باسم الموظف أو رقم الشركة..."
                />
              </div>

              {/* Shared / Penalty Fields Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-right pt-2 border-t border-slate-100" dir="rtl">
                {/* Order Number */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">رقم الأمر الإداري *</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="مثال: ع/402"
                    value={penaltyForm.order_number}
                    onChange={(e) => setPenaltyForm(prev => ({ ...prev, order_number: e.target.value }))}
                    required
                  />
                </div>

                {/* Order Date */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">تاريخ الإصدار / العقوبة *</Label>
                  <Input
                    type="date"
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white [color-scheme:light]"
                    value={penaltyForm.penalty_date}
                    onChange={(e) => setPenaltyForm(prev => ({ ...prev, penalty_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Penalty Type */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">نوع العقوبة *</Label>
                  <Select
                    dir="rtl"
                    value={penaltyForm.penalty_type}
                    onValueChange={(v) => setPenaltyForm(prev => ({ ...prev, penalty_type: v }))}
                  >
                    <SelectTrigger dir="rtl" className="mt-1 rounded-xl text-xs text-right bg-white flex flex-row-reverse items-center justify-between">
                      <SelectValue className="text-right" />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="text-right">
                      {penaltyTypesList.map(t => {
                        const val = t.name || t;
                        return (
                          <SelectItem key={t.id || val} value={val} dir="rtl" className="text-right">
                            {val}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Status */}
                <div className="text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">حالة العقوبة *</Label>
                  <Select
                    dir="rtl"
                    value={penaltyForm.status}
                    onValueChange={(v) => setPenaltyForm(prev => ({ ...prev, status: v }))}
                  >
                    <SelectTrigger dir="rtl" className="mt-1 rounded-xl text-xs text-right bg-white flex flex-row-reverse items-center justify-between">
                      <SelectValue className="text-right" />
                    </SelectTrigger>
                    <SelectContent dir="rtl" className="text-right">
                      <SelectItem value="نافذ" dir="rtl" className="text-right">نافذ</SelectItem>
                      <SelectItem value="ملغي بقرار قضائي" dir="rtl" className="text-right">ملغي بقرار قضائي</SelectItem>
                      <SelectItem value="ملغي بكتاب شكر" dir="rtl" className="text-right">ملغي بكتاب شكر (مشمول بالمحاصصة القانونية)</SelectItem>
                      <SelectItem value="منتهي الأثر" dir="rtl" className="text-right">منتهي الأثر</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Reason */}
                <div className="md:col-span-2 text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">سبب / مخالفة العقوبة *</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="سبب صدور العقوبة والمخالفة المرتكبة"
                    value={penaltyForm.reason}
                    onChange={(e) => setPenaltyForm(prev => ({ ...prev, reason: e.target.value }))}
                    required
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-3 text-right">
                  <Label className="text-xs font-semibold text-right block mb-1">ملاحظات إضافية</Label>
                  <Input
                    dir="rtl"
                    className="mt-1 rounded-xl text-xs text-right bg-white placeholder:text-right"
                    placeholder="ملاحظات تفصيلية أو مستندات مرفقة"
                    value={penaltyForm.notes}
                    onChange={(e) => setPenaltyForm(prev => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-start gap-2 pt-3 border-t border-slate-100 mt-4" dir="rtl">
                <Button type="submit" className="bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold gap-1 px-6 shadow-xs">
                  {editingPenalty ? 'تحديث العقوبة' : 'تسجيل العقوبة الإدارية'}
                </Button>
                <Button variant="outline" type="button" className="rounded-xl text-xs font-bold" onClick={resetPenaltyForm}>
                  تفريغ الحقول / إلغاء
                </Button>
              </div>
            </form>
          )}
        </TabsContent>

        {/* ----------------- TAB 3: QUERY EMPLOYEE ----------------- */}
        <TabsContent value="query_employee" className="space-y-6 mt-5" dir="rtl">
          {/* Employee Search Selector */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 text-right">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-[#1B3A6B] text-sm flex items-center gap-2">
                  <User size={18} className="text-[#1B3A6B]" />
                  الاستعلام المباشر عن سجل الموظف
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ابحث باسم الموظف أو رقم الشركة لاستعراض سجل كتب الشكر والعقوبات الإدارية الخاصة به
                </p>
              </div>
              {selectedEmployeeForQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedEmployeeForQuery('')}
                  className="text-xs font-bold text-slate-600 rounded-xl"
                >
                  اختيار موظف آخر
                </Button>
              )}
            </div>

            <EmployeeSearchSelect
              employees={employees}
              value={selectedEmployeeForQuery}
              onChange={(val) => setSelectedEmployeeForQuery(val)}
              placeholder="ابحث باسم الموظف، رقم الشركة، الرقم الوظيفي..."
            />
          </div>

          {/* Queried Employee Profile & Records */}
          {queriedEmployee ? (() => {
            const empQualification = 
              queriedEmployee.education_level || 
              queriedEmployee.educationLevel || 
              queriedEmployee.qualification || 
              queriedEmployee.qualification_name ||
              queriedEmployee.qualification_degree ||
              queriedEmployee.highest_qualification ||
              queriedEmployee.degree ||
              'غير محدد';

            const rawGrade = queriedEmployee.grade ?? queriedEmployee.salary_grade ?? queriedEmployee.salaryGrade ?? queriedEmployee.job_grade;
            const rawStep = queriedEmployee.step ?? queriedEmployee.salary_stage ?? queriedEmployee.salaryStage ?? queriedEmployee.stage;

            let formattedGrade = 'غير محدد';
            if (rawGrade !== undefined && rawGrade !== null && rawGrade !== '') {
              const parsed = parseInt(rawGrade);
              if (!isNaN(parsed)) {
                formattedGrade = parsed >= 11 ? getGradeLabel(parsed) : `الدرجة ${getGradeLabel(parsed)}`;
              } else {
                formattedGrade = String(rawGrade);
              }
            }

            let formattedStep = 'غير محدد';
            if (rawStep !== undefined && rawStep !== null && rawStep !== '') {
              const parsed = parseInt(rawStep);
              if (!isNaN(parsed)) {
                formattedStep = `المرحلة ${getStepLabel(parsed)}`;
              } else {
                formattedStep = String(rawStep);
              }
            }

            return (
              <div className="space-y-6">
                {/* Profile Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs text-right space-y-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#1B3A6B]/10 text-[#1B3A6B] font-bold flex items-center justify-center text-lg">
                        <User size={24} />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-slate-900">{queriedEmployee.full_name || queriedEmployee.fullName}</h2>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="font-mono bg-slate-100 px-2.5 py-0.5 rounded-lg text-slate-700 font-bold border border-slate-200">
                            رقم الشركة: {queriedEmployee.company_number || queriedEmployee.companyNumber || queriedEmployee.id}
                          </span>
                          <span>•</span>
                          <span>{queriedEmployee.job_title || queriedEmployee.jobTitle || 'غير محدد'}</span>
                          <span>•</span>
                          <span>{queriedEmployee.department || 'القسم الرئيسي'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setQueriedEmpSubTab('appreciations')}
                        className={`px-3.5 py-2 rounded-xl text-center border transition-all cursor-pointer ${
                          queriedEmpSubTab === 'appreciations'
                            ? 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-400/20'
                            : 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/60'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-emerald-800">كتب الشكر والتقدير</div>
                        <div className="text-lg font-black text-emerald-950">{queriedEmpAppreciations.length}</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQueriedEmpSubTab('penalties')}
                        className={`px-3.5 py-2 rounded-xl text-center border transition-all cursor-pointer ${
                          queriedEmpSubTab === 'penalties'
                            ? 'bg-rose-100 border-rose-400 ring-2 ring-rose-400/20'
                            : 'bg-rose-50/60 border-rose-200 hover:bg-rose-100/60'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-rose-800">العقوبات الإدارية</div>
                        <div className="text-lg font-black text-rose-950">{queriedEmpPenalties.length}</div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[11px] font-semibold mb-0.5">التحصيل الدراسي:</span>
                      <span className="font-bold text-slate-800 text-xs">{empQualification}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[11px] font-semibold mb-0.5">الدرجة الوظيفية:</span>
                      <span className="font-bold text-slate-800 text-xs">{formattedGrade}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[11px] font-semibold mb-0.5">المرحلة:</span>
                      <span className="font-bold text-slate-800 text-xs">{formattedStep}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-slate-400 block text-[11px] font-semibold mb-0.5">نوع الخدمة وحالة الموظف:</span>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[11px] border border-emerald-200/60">
                          {queriedEmployee.employee_status || queriedEmployee.employeeStatus || queriedEmployee.status || 'مستمر بالخدمة'}
                        </span>
                        <span className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                          {queriedEmployee.service_type || queriedEmployee.serviceType || 'دائمية'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-tab Navigation */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setQueriedEmpSubTab('appreciations')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      queriedEmpSubTab === 'appreciations'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <Award size={16} />
                    <span>سجل كتب الشكر والتقدير ({queriedEmpAppreciations.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQueriedEmpSubTab('penalties')}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                      queriedEmpSubTab === 'penalties'
                        ? 'bg-rose-700 text-white shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <ShieldAlert size={16} />
                    <span>سجل العقوبات الإدارية ({queriedEmpPenalties.length})</span>
                  </button>
                </div>

                {/* Sub-tab Content */}
                {queriedEmpSubTab === 'appreciations' ? (
                  /* Table 1: Appreciations for Employee */
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden text-right">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <Award size={18} className="text-emerald-700" />
                        سجل كتب الشكر والتقدير للموظف ({queriedEmpAppreciations.length})
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">رقم الكتاب</th>
                            <th className="px-4 py-3">تاريخ الإصدار</th>
                            <th className="px-4 py-3">جهة الإصدار</th>
                            <th className="px-4 py-3">السبب / المناسبة</th>
                            <th className="px-4 py-3">أثر القدم الممتاز</th>
                            <th className="px-4 py-3">الملاحظات</th>
                            <th className="px-4 py-3 text-center">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {queriedEmpAppreciations.map((a, idx) => (
                            <tr key={a.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-800">{a.order_number || a.orderNumber}</td>
                              <td className="px-4 py-3 text-slate-600">{a.order_date || a.orderDate}</td>
                              <td className="px-4 py-3 font-semibold text-slate-700">{a.issuer || '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{a.reason || '—'}</td>
                              <td className="px-4 py-3">
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  {a.seniority_impact || a.seniorityImpact || 'قدم شهر واحد'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{a.notes || '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingAppreciation(a);
                                      setAppreciationForm({
                                        employee_id: String(a.employee_id || a.employeeId || ''),
                                        order_number: a.order_number || a.orderNumber || '',
                                        order_date: a.order_date || a.orderDate || '',
                                        issuer: a.issuer || 'السيد المدير العام',
                                        reason: a.reason || '',
                                        seniority_impact: a.seniority_impact || a.seniorityImpact || 'قدم شهر واحد',
                                        notes: a.notes || ''
                                      });
                                      setActiveTab('add_appreciation');
                                    }}
                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                    title="تعديل"
                                  >
                                    <Edit3 size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAppreciation(a.id)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                                    title="حذف"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}

                          {queriedEmpAppreciations.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                                لا يوجد كتب شكر وتقدير مسجلة لهذا الموظف
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Table 2: Penalties for Employee */
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden text-right">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <ShieldAlert size={18} className="text-rose-700" />
                        سجل العقوبات الإدارية للموظف ({queriedEmpPenalties.length})
                      </h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">نوع العقوبة</th>
                            <th className="px-4 py-3">التاريخ</th>
                            <th className="px-4 py-3">رقم الأمر</th>
                            <th className="px-4 py-3">السبب / المخالفة</th>
                            <th className="px-4 py-3">الخصم المالي</th>
                            <th className="px-4 py-3">الحالة</th>
                            <th className="px-4 py-3 text-center">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {queriedEmpPenalties.map((p, idx) => {
                            const finAmt = parseInt(p.financial_amount || p.financialAmount || 0);
                            return (
                              <tr key={p.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                                <td className="px-4 py-3 font-bold text-rose-800">{p.penalty_type || p.penaltyType}</td>
                                <td className="px-4 py-3 text-slate-600">{p.penalty_date || p.penaltyDate}</td>
                                <td className="px-4 py-3 font-mono font-bold text-slate-800">{p.order_number || p.orderNumber}</td>
                                <td className="px-4 py-3 text-slate-600">{p.reason || '—'}</td>
                                <td className="px-4 py-3 font-bold text-rose-700">
                                  {finAmt > 0 ? formatCurrency(finAmt) : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                                    {p.status || 'نافذ'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingPenalty(p);
                                        setPenaltyForm({
                                          employee_id: String(p.employee_id || p.employeeId || ''),
                                          penalty_type: p.penalty_type || p.penaltyType || 'إنذار خطي',
                                          penalty_date: p.penalty_date || p.penaltyDate || '',
                                          order_number: p.order_number || p.orderNumber || '',
                                          reason: p.reason || '',
                                          days_count: parseInt(p.days_count || p.daysCount || 0),
                                          financial_amount: parseInt(p.financial_amount || p.financialAmount || 0),
                                          notes: p.notes || '',
                                          status: p.status || 'نافذ'
                                        });
                                        setActiveTab('add_penalty');
                                      }}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                      title="تعديل"
                                    >
                                      <Edit3 size={15} />
                                    </button>
                                    <button
                                      onClick={() => handleDeletePenalty(p.id)}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                                      title="حذف"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {queriedEmpPenalties.length === 0 && (
                            <tr>
                              <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                                لا يوجد عقوبات إدارية مسجلة لهذا الموظف
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center text-slate-400 space-y-3">
              <Search size={40} className="mx-auto text-slate-300" />
              <p className="font-bold text-slate-700 text-sm">الرجاء اختيار موظف للبدء بالاستعلام عن كافة سجله الوظيفي</p>
              <p className="text-xs text-slate-400">يمكنك استخدام مربع البحث أعلاه لكتابة الاسم أو رقم الشركة</p>
            </div>
          )}
        </TabsContent>

        {/* ----------------- TAB 4: QUERY ORDER ----------------- */}
        <TabsContent value="query_order" className="space-y-6 mt-5" dir="rtl">
          {/* Order Search & Filters */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 text-right">
            <div>
              <h3 className="font-bold text-amber-900 text-sm flex items-center gap-2">
                <FileText size={18} className="text-amber-600" />
                الاستعلام المباشر عن الكتب الرسمية والأوامر الإدارية
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ابحث برقم الكتاب أو الجهة واختاره من القائمة المنسدلة لرؤية كافة الموظفين المشمولين به
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search size={15} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
                <Input
                  dir="rtl"
                  value={orderQuerySearchTerm}
                  onChange={(e) => {
                    setOrderQuerySearchTerm(e.target.value);
                    setIsOrderDropdownOpen(true);
                  }}
                  onFocus={() => setIsOrderDropdownOpen(true)}
                  placeholder="انقر هنا للبحث برقم الكتاب، جهة الإصدار، أو السبب..."
                  className="pr-9 pl-8 h-10 text-xs bg-slate-50 rounded-xl border-slate-200"
                />
                {(orderQuerySearchTerm || selectedOrderKey) && (
                  <button
                    type="button"
                    onClick={() => {
                      setOrderQuerySearchTerm('');
                      setSelectedOrderKey('');
                      setIsOrderDropdownOpen(false);
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-rose-600 font-bold"
                    title="إلغاء التحديد"
                  >
                    ✕
                  </button>
                )}

                {/* Dropdown Suggestions List */}
                {isOrderDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOrderDropdownOpen(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-full max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl z-20 divide-y divide-slate-100 text-right">
                      {filteredDistinctOrders.length > 0 ? (
                        filteredDistinctOrders.map(ord => {
                          const isSelected = selectedOrderKey === ord.key;
                          return (
                            <div
                              key={ord.key}
                              onClick={() => {
                                setSelectedOrderKey(ord.key);
                                setIsOrderDropdownOpen(false);
                                setOrderQuerySearchTerm(ord.orderNumber);
                              }}
                              className={`p-3 text-xs cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between text-right ${
                                isSelected ? 'bg-amber-50/80 font-bold text-amber-900' : 'text-slate-800'
                              }`}
                            >
                              <div className="space-y-1 text-right">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                    ord.type === 'appreciation' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                  }`}>
                                    {ord.typeName}
                                  </span>
                                  <span className="font-mono font-bold text-slate-900 text-xs">
                                    كتاب رقم: {ord.orderNumber}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-mono">({ord.date})</span>
                                </div>
                                <div className="text-[11px] text-slate-500 truncate max-w-md">
                                  السبب: {ord.reason} • جهة الإصدار: {ord.issuer}
                                </div>
                              </div>

                              <div className="shrink-0 mr-3 text-left">
                                <span className="px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] rounded-lg">
                                  {ord.records.length} موظف مشمول
                                </span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-4 text-xs text-center text-slate-400">
                          لا يوجد كتب أو أوامر إدارية تطابق كلمة البحث
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="w-full sm:w-56">
                <Select dir="rtl" value={orderTypeFilter} onValueChange={setOrderTypeFilter}>
                  <SelectTrigger dir="rtl" className="h-10 text-xs bg-slate-50 rounded-xl border-slate-200">
                    <SelectValue placeholder="نوع الكتاب" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="all">كافة الكتب والأوامر</SelectItem>
                    <SelectItem value="appreciation">كتب الشكر والتقدير فقط</SelectItem>
                    <SelectItem value="penalty">أوامر العقوبات الإدارية فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Full Width Order Detail View */}
          <div className="space-y-4 text-right">
            {selectedOrderObj ? (
              <div className="space-y-4">
                {/* Order Details Banner */}
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedOrderObj.type === 'appreciation' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {selectedOrderObj.typeName}
                        </span>
                        <span className="text-xs text-slate-500 font-mono">تاريخ الإصدار: {selectedOrderObj.date}</span>
                      </div>
                      <h2 className="text-lg font-black text-slate-900 font-mono mt-1">
                        كتاب رقم: {selectedOrderObj.orderNumber}
                      </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleDeleteEntireOrder(selectedOrderObj)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors border border-rose-200/80 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="حذف هذا الكتاب بالكامل لجميع الموظفين المشمولين به"
                      >
                        <Trash2 size={14} />
                        <span>حذف الكتاب بالكامل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderKey('');
                          setOrderQuerySearchTerm('');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors border border-slate-200 cursor-pointer"
                      >
                        اختيار كتاب آخر
                      </button>

                      <div className="bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-center">
                        <div className="text-[10px] font-bold text-slate-500">عدد المشمولين بالكامل</div>
                        <div className="text-lg font-black text-slate-900">{selectedOrderObj.records.length} موظف</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[11px]">جهة الإصدار:</span>
                      <span className="font-bold text-slate-800">{selectedOrderObj.issuer}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">الأثر الإداري / المالي:</span>
                      <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md inline-block">
                        {selectedOrderObj.impact}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">السبب / المناسبة:</span>
                      <span className="font-bold text-slate-800">{selectedOrderObj.reason}</span>
                    </div>
                  </div>
                </div>

                {/* Covered Employees Table */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 bg-slate-50 border-b border-slate-200">
                    <h3 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <Users size={16} className="text-slate-700" />
                      قائمة كافة الموظفين الحاصلين والمشمولين بهذا الأمر ({selectedOrderObj.records.length})
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">اسم الموظف</th>
                          <th className="px-4 py-3">رقم الشركة</th>
                          <th className="px-4 py-3">التشكيل / القسم</th>
                          <th className="px-4 py-3">العنوان الوظيفي</th>
                          <th className="px-4 py-3">الملاحظات</th>
                          <th className="px-4 py-3 text-center">حذف من الأمر</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrderObj.records.map((rec, idx) => {
                          const emp = empMap[rec.employee_id || rec.employeeId];
                          return (
                            <tr key={rec.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-slate-400 font-mono">{idx + 1}</td>
                              <td className="px-4 py-3 font-bold text-[#1B3A6B]">
                                {emp ? (emp.full_name || emp.fullName) : '—'}
                              </td>
                              <td className="px-4 py-3 font-mono font-bold text-slate-700">
                                {emp ? (emp.company_number || emp.companyNumber || emp.id) : '—'}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{emp?.department || '—'}</td>
                              <td className="px-4 py-3 text-slate-600">{emp?.job_title || emp?.jobTitle || '—'}</td>
                              <td className="px-4 py-3 text-slate-500">{rec.notes || '—'}</td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => {
                                    if (selectedOrderObj.type === 'appreciation') {
                                      handleDeleteAppreciation(rec.id);
                                    } else {
                                      handleDeletePenalty(rec.id);
                                    }
                                  }}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                                  title="حذف هذا الموظف من الكتاب"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center text-slate-400 space-y-3 shadow-xs">
                <FileText size={44} className="mx-auto text-amber-300" />
                <p className="font-bold text-slate-800 text-sm">لم يتم اختيار أي أمر إداري أو كتاب رسمي للعرض</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  يرجى استخدام مربع البحث أعلاه لكتابة رقم الأمر أو السبب واختيار الكتاب المطلوب من القائمة المنسدلة لرؤية تفاصيله والموظفين المشمولين به.
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: Organizational Structure Multi-Picker Modal */}
      <Dialog open={showOrgPickerModal} onOpenChange={setShowOrgPickerModal}>
        <DialogContent dir="rtl" className="max-w-xl text-right rounded-2xl">
          <DialogHeader dir="rtl" className="text-right">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 size={18} className="text-emerald-600" />
              تحديد التشكيلات والأقسام من الهيكل التنظيمي
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-slate-500">
              اختر قسم واحد أو أكثر من قائمة التشكيلات المعتمدة في النظام حسب الارتباط الإداري:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {departmentsList.map(dept => {
                const isSelected = categoryFilters.selectedOrgUnits?.includes(dept);
                return (
                  <button
                    type="button"
                    key={dept}
                    onClick={() => {
                      setCategoryFilters(prev => {
                        const current = prev.selectedOrgUnits || [];
                        const updated = current.includes(dept)
                          ? current.filter(x => x !== dept)
                          : [...current, dept];
                        return { ...prev, selectedOrgUnits: updated, department: 'all' };
                      });
                    }}
                    className={`p-2.5 rounded-xl border text-xs text-right font-medium flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{dept}</span>
                    {isSelected && <Check size={16} className="text-emerald-600" />}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter dir="rtl" className="flex items-center justify-between border-t pt-3">
            <span className="text-xs font-bold text-slate-600">
              المحدد: {categoryFilters.selectedOrgUnits?.length || 0} تشكيل
            </span>
            <Button
              type="button"
              onClick={() => setShowOrgPickerModal(false)}
              className="bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl text-xs font-bold px-5"
            >
              تم الحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Work Locations Multi-Picker Modal */}
      <Dialog open={showWorkLocationModal} onOpenChange={setShowWorkLocationModal}>
        <DialogContent dir="rtl" className="max-w-xl text-right rounded-2xl">
          <DialogHeader dir="rtl" className="text-right">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MapPin size={18} className="text-blue-600" />
              تحديد مواقع العمل والحقول الإدارية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-slate-500">
              اختر موقع عمل واحد أو أكثر المضافة في صفحة الهيكل التنظيمي أو سجلات الموظفين:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {workLocationsList.map(loc => {
                const isSelected = categoryFilters.selectedWorkLocations?.includes(loc);
                return (
                  <button
                    type="button"
                    key={loc}
                    onClick={() => {
                      setCategoryFilters(prev => {
                        const current = prev.selectedWorkLocations || [];
                        const updated = current.includes(loc)
                          ? current.filter(x => x !== loc)
                          : [...current, loc];
                        return { ...prev, selectedWorkLocations: updated, workLocation: 'all' };
                      });
                    }}
                    className={`p-2.5 rounded-xl border text-xs text-right font-medium flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold shadow-2xs'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{loc}</span>
                    {isSelected && <Check size={16} className="text-blue-600" />}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter dir="rtl" className="flex items-center justify-between border-t pt-3">
            <span className="text-xs font-bold text-slate-600">
              المحدد: {categoryFilters.selectedWorkLocations?.length || 0} موقع
            </span>
            <Button
              type="button"
              onClick={() => setShowWorkLocationModal(false)}
              className="bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl text-xs font-bold px-5"
            >
              تم الحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Job Titles Multi-Picker & Search Modal */}
      <Dialog open={showJobTitleModal} onOpenChange={setShowJobTitleModal}>
        <DialogContent dir="rtl" className="max-w-2xl text-right rounded-2xl">
          <DialogHeader dir="rtl" className="text-right">
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileText size={18} className="text-violet-600" />
              تحديد وإدراج العناوين الوظيفية المتعددة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-slate-500">
              ابحث عن العنوان الوظيفي وحدد عنواناً واحداً أو أكثر لإدراجهم في فلاتر المشمولين بكتاب الشكر والتقدير:
            </p>
            
            {/* Search and Quick Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute right-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="ابحث عن عنوان وظيفي..."
                  value={searchModalJobTitleTerm}
                  onChange={(e) => setSearchModalJobTitleTerm(e.target.value)}
                  className="pr-9 h-8 text-xs bg-white rounded-lg border-slate-200"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const filtered = jobTitlesList.filter(jt => jt.toLowerCase().includes(searchModalJobTitleTerm.toLowerCase().trim()));
                    setCategoryFilters(prev => ({
                      ...prev,
                      selectedJobTitles: Array.from(new Set([...(prev.selectedJobTitles || []), ...filtered])),
                      jobTitle: 'all'
                    }));
                  }}
                  className="text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 px-3 py-1.5 rounded-lg font-bold"
                >
                  تحديد نتائج البحث
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilters(prev => ({ ...prev, selectedJobTitles: [] }))}
                  className="text-[11px] text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-lg font-bold"
                >
                  مسح الكل
                </button>
              </div>
            </div>

            {/* Titles List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto p-1">
              {jobTitlesList
                .filter(jt => jt.toLowerCase().includes(searchModalJobTitleTerm.toLowerCase().trim()))
                .map(jt => {
                  const isSelected = categoryFilters.selectedJobTitles?.includes(jt);
                  return (
                    <button
                      type="button"
                      key={jt}
                      onClick={() => {
                        setCategoryFilters(prev => {
                          const current = prev.selectedJobTitles || [];
                          const updated = current.includes(jt)
                            ? current.filter(x => x !== jt)
                            : [...current, jt];
                          return { ...prev, selectedJobTitles: updated, jobTitle: 'all' };
                        });
                      }}
                      className={`p-2 rounded-xl border text-xs text-right font-medium flex items-center justify-between transition-all ${
                        isSelected
                          ? 'bg-violet-50 border-violet-500 text-violet-900 font-bold shadow-2xs'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className="truncate pl-1">{jt}</span>
                      {isSelected && <Check size={15} className="text-violet-600 shrink-0" />}
                    </button>
                  );
                })}
              {jobTitlesList.filter(jt => jt.toLowerCase().includes(searchModalJobTitleTerm.toLowerCase().trim())).length === 0 && (
                <div className="col-span-full py-8 text-center text-xs text-slate-400">
                  لا توجد عناوين وظيفية تطابق كلمة البحث
                </div>
              )}
            </div>
          </div>
          <DialogFooter dir="rtl" className="flex items-center justify-between border-t pt-3">
            <span className="text-xs font-bold text-slate-600">
              المحدد: {categoryFilters.selectedJobTitles?.length || 0} عنوان وظيفي
            </span>
            <Button
              type="button"
              onClick={() => setShowJobTitleModal(false)}
              className="bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl text-xs font-bold px-5"
            >
              تم الحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Deletion */}
      <Dialog open={!!deleteConfirmTarget} onOpenChange={(open) => { if (!open) setDeleteConfirmTarget(null); }}>
        <DialogContent dir="rtl" className="max-w-md text-right rounded-2xl p-6">
          <DialogHeader dir="rtl" className="text-right">
            <DialogTitle className="text-base font-bold text-rose-800 flex items-center gap-2">
              <Trash2 size={20} className="text-rose-600" />
              {deleteConfirmTarget?.title || 'تأكيد الحذف'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs font-semibold text-slate-700 leading-relaxed">
            {deleteConfirmTarget?.message}
          </div>
          <DialogFooter dir="rtl" className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmTarget(null)}
              className="rounded-xl text-xs font-bold px-4"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => {
                const action = deleteConfirmTarget?.onConfirm;
                setDeleteConfirmTarget(null);
                if (action) action();
              }}
              className="bg-rose-700 hover:bg-rose-800 text-white rounded-xl text-xs font-bold px-5 shadow-xs"
            >
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Dialog for Duplicate Beneficiaries in Group Appreciation */}
      <Dialog open={!!duplicateAppreciationReport} onOpenChange={(open) => { if (!open) setDuplicateAppreciationReport(null); }}>
        <DialogContent dir="rtl" className="max-w-lg text-right rounded-2xl p-6">
          <DialogHeader dir="rtl" className="text-right">
            <DialogTitle className="text-base font-bold text-amber-900 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-600 shrink-0" />
              <span>تنبيه: مستفيدون سابقون من كتاب الشكر</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 leading-relaxed font-semibold">
              {duplicateAppreciationReport?.addedCount > 0 ? (
                <p>
                  تم شمول وتسجيل كتاب الشكر رقم <span className="font-mono font-bold text-amber-950">({duplicateAppreciationReport?.orderNumber})</span> بتاريخ <span className="font-mono font-bold text-amber-950">({duplicateAppreciationReport?.orderDate})</span> بنجاح لـ <span className="font-bold text-emerald-700">({duplicateAppreciationReport?.addedCount})</span> موظف جديد.
                </p>
              ) : (
                <p className="text-rose-800 font-bold">
                  لم يتم إضافة أية سجلات جديدة لأن جميع الموظفين المحددين مستفيدون سابقاً من كتاب الشكر رقم ({duplicateAppreciationReport?.orderNumber}) بتاريخ ({duplicateAppreciationReport?.orderDate}).
                </p>
              )}
            </div>

            {duplicateAppreciationReport?.alreadyBenefitedEmps?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>قائمة الموظفين المستفيدين من الكتاب سابقاً (تم تخطيهم):</span>
                  <span className="text-xs font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    {duplicateAppreciationReport.alreadyBenefitedEmps.length} موظف
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {duplicateAppreciationReport.alreadyBenefitedEmps.map((emp, i) => (
                    <div key={emp.id || i} className="p-2.5 text-xs flex items-center justify-between hover:bg-white transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 font-mono text-[11px]">{i + 1}.</span>
                        <span className="font-bold text-slate-800">{emp.full_name || emp.fullName || emp.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                        <span>ر.ش: {emp.company_number || emp.companyNumber || emp.id}</span>
                        {emp.department && (
                          <>
                            <span>•</span>
                            <span>{emp.department}</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter dir="rtl" className="pt-3 border-t border-slate-100 flex justify-end">
            <Button
              type="button"
              onClick={() => setDuplicateAppreciationReport(null)}
              className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold px-6 shadow-xs"
            >
              موافق / فهمت ذلك
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
