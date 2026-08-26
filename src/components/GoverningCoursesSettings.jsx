import { useState, useEffect, useMemo } from 'react';
import { apiClient, request } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import {
  GraduationCap,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  BookOpen,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Layers,
  FileText,
  UserCheck,
  Award,
  CheckCircle2,
  XCircle,
  Building2,
  Save
} from 'lucide-react';
import { notifySettingsChanged, applySavedOrder, fetchEducationDegreesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';
import { useAuth } from '@/lib/AuthContext';

const JOB_GRADES_LIST = [
  { value: 10, label: 'الدرجة العاشرة (للترفيع للتاسعة)', shortLabel: 'الدرجة 10' },
  { value: 9, label: 'الدرجة التاسعة (للترفيع للثامنة)', shortLabel: 'الدرجة 9' },
  { value: 8, label: 'الدرجة الثامنة (للترفيع للسابعة)', shortLabel: 'الدرجة 8' },
  { value: 7, label: 'الدرجة السابعة (للترفيع للسادسة)', shortLabel: 'الدرجة 7' },
  { value: 6, label: 'الدرجة السادسة (للترفيع للخامسة)', shortLabel: 'الدرجة 6' },
  { value: 5, label: 'الدرجة الخامسة (للترفيع للرابعة)', shortLabel: 'الدرجة 5' },
  { value: 4, label: 'الدرجة الرابعة (للترفيع للثالثة)', shortLabel: 'الدرجة 4' },
  { value: 3, label: 'الدرجة الثالثة (للترفيع للثانية)', shortLabel: 'الدرجة 3' },
  { value: 2, label: 'الدرجة الثانية (للترفيع للأولى)', shortLabel: 'الدرجة 2' },
  { value: 1, label: 'الدرجة الأولى (التطوير القيادي)', shortLabel: 'الدرجة 1' },
];

const ALL_JOB_GRADES_OPTIONS = [
  { value: 'الكل', label: 'كافة الدرجات الوظيفية (جميع الدرجات)', badge: 'الكل' },
  { value: '10', label: 'الدرجة العاشرة (10)', badge: 'الدرجة 10' },
  { value: '9', label: 'الدرجة التاسعة (9)', badge: 'الدرجة 9' },
  { value: '8', label: 'الدرجة الثامنة (8)', badge: 'الدرجة 8' },
  { value: '7', label: 'الدرجة السابعة (7)', badge: 'الدرجة 7' },
  { value: '6', label: 'الدرجة السادسة (6)', badge: 'الدرجة 6' },
  { value: '5', label: 'الدرجة الخامسة (5)', badge: 'الدرجة 5' },
  { value: '4', label: 'الدرجة الرابعة (4)', badge: 'الدرجة 4' },
  { value: '3', label: 'الدرجة الثالثة (3)', badge: 'الدرجة 3' },
  { value: '2', label: 'الدرجة الثانية (2)', badge: 'الدرجة 2' },
  { value: '1', label: 'الدرجة الأولى (1)', badge: 'الدرجة 1' },
  { value: 'الخاصة_أ', label: 'الدرجة الخاصة / العليا (أ)', badge: 'خاصة أ' },
  { value: 'الخاصة_ب', label: 'الدرجة الخاصة / العليا (ب)', badge: 'خاصة ب' },
  { value: 'المناصب_القيادية', label: 'العناوين والقيادات العليا (مدير عام / وكيل / رئيس هيئة)', badge: 'عناوين قيادية' },
];

const EXEMPTION_TYPES_OPTIONS = [
  { value: 'كامل', label: 'إعفاء كامل (تام من كافة الدورات الحاكمة)', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'جزئي', label: 'إعفاء جزئي (تخفيض عدد الساعات والدورات)', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'دورة_بديلة', label: 'دورة تطويرية بديلة واحدة', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'استثناء_خدمة', label: 'استثناء بسبب الخدمة الوظيفية (25 سنة+)', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'لا_يوجد_إعفاء', label: 'شمول كامل (لا يوجد إعفاء)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
];

const DEFAULT_DYNAMIC_EXEMPTION_RULES = [
  {
    id: 'rule_higher_degrees',
    title: 'إعفاء حملة الشهادات العليا (دكتوراه، ماجستير، دبلوم عالي معادل)',
    qualifications: ['دكتوراه', 'ماجستير', 'دبلوم عالي'],
    grades: ['الكل'],
    exemptionType: 'كامل',
    isExempt: true,
    legalBasis: 'إعفاء تام من جميع الدورات الحاكمة المخصصة للترقية استناداً لضوابط احتساب الشهادات العليا والتعليم العالي',
    category: 'qualification',
  },
  {
    id: 'rule_middle_school_and_below',
    title: 'إعفاء مؤهلات المتوسطة فما دون (متوسطة، ابتدائية، بدون مؤهل)',
    qualifications: ['متوسطة فما دون', 'متوسطة', 'ابتدائية', 'بدون مؤهل'],
    grades: ['الكل'],
    exemptionType: 'كامل',
    isExempt: true,
    legalBasis: 'إعفاء حاملي شهادات المتوسطة فما دون من الالتزام بالدورات الحاكمة لأغراض الترقية الإدارية والترفيع',
    category: 'qualification',
  },
  {
    id: 'rule_special_grades_and_leadership',
    title: 'استثناء الدرجات الخاصة والعليا والعناوين القيادية العليا',
    qualifications: ['الكل'],
    grades: ['1', 'الخاصة_أ', 'الخاصة_ب', 'المناصب_القيادية'],
    exemptionType: 'دورة_بديلة',
    isExempt: true,
    legalBasis: 'دورة واحدة في التطوير القيادي والمؤسسي تغني عن الحتميات المتعددة المقررة للدرجة الوظيفية',
    category: 'grade',
  },
  {
    id: 'rule_service_25_years',
    title: 'استثناء ذوي الخدمة الوظيفية الطويلة (25 سنة فما فوق)',
    qualifications: ['الكل'],
    grades: ['الكل'],
    exemptionType: 'استثناء_خدمة',
    isExempt: true,
    legalBasis: 'إعفاء من دورات H.S.E والحاسوب والتركيز على الدورات التخصصية أو القيادية المباشرة',
    category: 'general',
  },
  {
    id: 'rule_bachelor_and_diploma',
    title: 'شمول حاملي البكالوريوس والدبلوم والإعدادية بالدورات الحاكمة',
    qualifications: ['بكالوريوس', 'دبلوم', 'إعدادية'],
    grades: ['الكل'],
    exemptionType: 'لا_يوجد_إعفاء',
    isExempt: false,
    legalBasis: 'مشمول بكافة الحتميات المقررة حسب جدول الدرجة الوظيفية لأغراض الترفيع',
    category: 'qualification',
  },
];

const COURSE_TYPES = [
  'تخصصية',
  'إدارية',
  'مالية',
  'حاسوب',
  'سلامة وبيئة (HSE)',
  'قيادية وإشرافية',
  'قانونية',
];

export default function GoverningCoursesSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const secondaryColor = appPublicSettings?.secondaryColor || '#C8960C';
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog' | 'rules' | 'inclusions' | 'assignments'
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeAssignments, setEmployeeAssignments] = useState({});
  const [exemptionRules, setExemptionRules] = useState({
    rules: DEFAULT_DYNAMIC_EXEMPTION_RULES,
    qualificationsExemptions: [],
    gradeTitleExemptions: [],
    autoApplyRules: true,
  });

  // Exemption Rule Dynamic Modal State
  const [ruleModal, setRuleModal] = useState({
    isOpen: false,
    isEditing: false,
    ruleId: null,
    title: '',
    qualifications: ['الكل'],
    grades: ['الكل'],
    exemptionType: 'كامل',
    isExempt: true,
    legalBasis: '',
    category: 'qualification',
  });

  const [ruleSearch, setRuleSearch] = useState('');
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState('all');
  const [ruleStatusFilter, setRuleStatusFilter] = useState('all');

  const [loading, setLoading] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMatrixGuide, setShowMatrixGuide] = useState(true);
  const { toast } = useToast();

  // Add Form State
  const [adding, setAdding] = useState(false);
  const [newGrade, setNewGrade] = useState(5);
  const [newCourseName, setNewCourseName] = useState('');
  const [newCourseType, setNewCourseType] = useState('تخصصية');
  const [newDurationDays, setNewDurationDays] = useState(5);
  const [newDurationHours, setNewDurationHours] = useState(20);
  const [newIsRequired, setNewIsRequired] = useState(true);
  const [newMinScore, setNewMinScore] = useState(60);
  const [newDescription, setNewDescription] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Edit Form State
  const [editingId, setEditingId] = useState(null);
  const [editGrade, setEditGrade] = useState(5);
  const [editCourseName, setEditCourseName] = useState('');
  const [editCourseType, setEditCourseType] = useState('تخصصية');
  const [editDurationDays, setEditDurationDays] = useState(5);
  const [editDurationHours, setEditDurationHours] = useState(20);
  const [editIsRequired, setEditIsRequired] = useState(true);
  const [editMinScore, setEditMinScore] = useState(60);
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');

  // Delete Confirm State
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState({ isOpen: false, id: null, title: '' });

  // Inclusions & Exemptions Filters
  const [incSearch, setIncSearch] = useState('');
  const [incStatusFilter, setIncStatusFilter] = useState('all');
  const [incGradeFilter, setIncGradeFilter] = useState('all');

  // Modal for changing employee inclusion/exemption
  const [exemptionModal, setExemptionModal] = useState({
    isOpen: false,
    employee: null,
    status: 'مشمول', // مشمول | معفى_شهادة | معفى_درجة | معفى_استثناء
    exemptionReason: '',
    exemptionOrderNumber: '',
    exemptionOrderDate: '',
    notes: '',
  });

  // Course Assignment Tab State
  const [selectedEmployeeForCourses, setSelectedEmployeeForCourses] = useState(null);
  const [assignedCourseSelection, setAssignedCourseSelection] = useState({});

  // System Education Degrees State (Synced with EducationDegreesSettings)
  const [systemEducationDegrees, setSystemEducationDegrees] = useState([]);

  const loadSystemDegrees = async () => {
    try {
      const degrees = await fetchEducationDegreesSorted();
      setSystemEducationDegrees(degrees || []);
    } catch (err) {
      console.error('Error loading system education degrees:', err);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchExemptionRules();
    fetchEmployeesAndAssignments();
    loadSystemDegrees();

    // Subscribe to real-time updates from EducationDegreesSettings
    const unsubscribe = subscribeToSettingsUpdates((detail) => {
      if (detail?.type === 'education_degrees' || detail?.type === 'all') {
        loadSystemDegrees();
      }
    });
    return () => unsubscribe();
  }, []);

  // Compute available qualification options dynamically based ONLY on system-installed education degrees
  const qualificationOptions = useMemo(() => {
    const base = [
      { value: 'الكل', label: 'كافة التحصيلات الدراسية (جميع الشهادات)', badge: 'كافة الشهادات' }
    ];
    if (systemEducationDegrees && systemEducationDegrees.length > 0) {
      systemEducationDegrees.forEach((deg) => {
        const degName = deg.name || deg.degree_name || deg.degreeName;
        if (degName && !base.some((b) => b.value === degName)) {
          base.push({
            value: degName,
            label: degName,
            badge: degName,
          });
        }
      });
    }
    return base;
  }, [systemEducationDegrees]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.GoverningCourse.list();
      let sortedData = applySavedOrder(data || [], 'GOVERNING_COURSES_ORDER');
      setRecords(sortedData);
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(sortedData));
      notifySettingsChanged('governing_courses', sortedData);
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: error.message || 'تعذر تحميل الدورات التدريبية الحاكمة',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesAndAssignments = async () => {
    try {
      const empData = await apiClient.entities.Employee.list();
      setEmployees(empData || []);

      const assignData = await request('/api/governing-courses/employee-assignments');
      setEmployeeAssignments(assignData || {});
    } catch (err) {
      console.log('Error fetching employees or assignments:', err);
    }
  };

  const fetchExemptionRules = async () => {
    try {
      const data = await request('/api/governing-courses/exemption-rules');
      if (data) {
        if (!Array.isArray(data.rules)) {
          data.rules = DEFAULT_DYNAMIC_EXEMPTION_RULES;
        }
        setExemptionRules(data);
      }
    } catch (err) {
      console.log('Error fetching exemption rules:', err);
    }
  };

  const handleSaveExemptionRules = async () => {
    setLoading(true);
    try {
      const data = await request('/api/governing-courses/exemption-rules', {
        method: 'POST',
        body: JSON.stringify(exemptionRules),
      });
      if (data) setExemptionRules(data);
      toast({ title: 'تم الحفظ بنجاح', description: 'تم تحديث قواعد وضوابط الإعفاء وتثبيتها في قاعدة البيانات' });
    } catch (err) {
      toast({ title: 'خطأ في الحفظ', description: err.message || 'فشل حفظ ضوابط الإعفاء', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('هل أنت أحدث بالتأكيد من إعادة ضبط واستعادة الدورات التدريبية الحاكمة القياسية الموحدة لسلم الرواتب والترقيات؟')) {
      return;
    }
    setLoading(true);
    try {
      const data = await request('/api/governing-courses/reset-defaults', {
        method: 'POST',
      });
      setRecords(data || []);
      localStorage.removeItem('GOVERNING_COURSES_ORDER');
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(data));
      notifySettingsChanged('governing_courses', data);
      toast({
        title: 'تم استعادة الدورات القياسية',
        description: 'تم تثبيت دليل الدورات التدريبية الحاكمة المعتمدة للترقيات الإدارية والمالية',
      });
    } catch (err) {
      toast({
        title: 'خطأ في الاستعادة',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCourseName.trim()) {
      toast({ title: 'خطأ في المدخلات', description: 'يرجى كتابة اسم الدورة الحاكمة', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        grade: parseInt(newGrade),
        courseName: newCourseName.trim(),
        courseType: newCourseType,
        durationDays: parseInt(newDurationDays) || 5,
        durationHours: parseInt(newDurationHours) || 20,
        isRequiredForPromotion: Boolean(newIsRequired),
        minPassingScore: parseInt(newMinScore) || 60,
        description: newDescription.trim(),
        status: newStatus,
      };

      const created = await apiClient.entities.GoverningCourse.create(payload);
      const updatedList = [...records, created];
      setRecords(updatedList);
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(updatedList));
      notifySettingsChanged('governing_courses', updatedList);

      setAdding(false);
      setNewCourseName('');
      setNewDescription('');
      toast({ title: 'تمت الإضافة بنجاح', description: 'تمت إضافة الدورة التدريبية الحاكمة بنجاح' });
    } catch (error) {
      toast({ title: 'خطأ في الإضافة', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (rec) => {
    setEditingId(rec.id);
    setEditGrade(rec.grade);
    setEditCourseName(rec.courseName || rec.course_name || '');
    setEditCourseType(rec.courseType || rec.course_type || 'تخصصية');
    setEditDurationDays(rec.durationDays !== undefined ? rec.durationDays : (rec.duration_days || 5));
    setEditDurationHours(rec.durationHours !== undefined ? rec.durationHours : (rec.duration_hours || 20));
    setEditIsRequired(rec.isRequiredForPromotion !== undefined ? rec.isRequiredForPromotion : (rec.is_required_for_promotion ?? true));
    setEditMinScore(rec.minPassingScore !== undefined ? rec.minPassingScore : (rec.min_passing_score || 60));
    setEditDescription(rec.description || '');
    setEditStatus(rec.status || 'فعال');
  };

  const handleUpdate = async (id) => {
    if (!editCourseName.trim()) {
      toast({ title: 'خطأ', description: 'يرجى كتابة اسم الدورة الحاكمة', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        grade: parseInt(editGrade),
        courseName: editCourseName.trim(),
        courseType: editCourseType,
        durationDays: parseInt(editDurationDays) || 5,
        durationHours: parseInt(editDurationHours) || 20,
        isRequiredForPromotion: Boolean(editIsRequired),
        minPassingScore: parseInt(editMinScore) || 60,
        description: editDescription.trim(),
        status: editStatus,
      };

      const updated = await apiClient.entities.GoverningCourse.update(id, payload);
      const updatedList = records.map((r) => (r.id === id ? { ...r, ...updated, ...payload } : r));
      setRecords(updatedList);
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(updatedList));
      notifySettingsChanged('governing_courses', updatedList);

      setEditingId(null);
      toast({ title: 'تم التحديث', description: 'تم حفظ تعديلات الدورة الحاكمة بنجاح' });
    } catch (error) {
      toast({ title: 'خطأ في التحديث', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    setLoading(true);
    try {
      await apiClient.entities.GoverningCourse.delete(id);
      const updatedList = records.filter((r) => r.id !== id);
      setRecords(updatedList);
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(updatedList));
      notifySettingsChanged('governing_courses', updatedList);

      toast({ title: 'تم الحذف', description: 'تم حذف الدورة التدريبية الحاكمة بنجاح' });
    } catch (error) {
      toast({ title: 'خطأ في الحذف', description: error.message, variant: 'destructive' });
    } finally {
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      setLoading(false);
    }
  };

  const handleToggleStatus = async (rec) => {
    const nextStatus = rec.status === 'فعال' ? 'غير فعال' : 'فعال';
    setLoading(true);
    try {
      const updated = await apiClient.entities.GoverningCourse.update(rec.id, { status: nextStatus });
      const updatedList = records.map((r) => (r.id === rec.id ? { ...r, status: nextStatus } : r));
      setRecords(updatedList);
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(updatedList));
      notifySettingsChanged('governing_courses', updatedList);
    } catch (err) {
      toast({ title: 'خطأ في تفعيل/تعطيل الحالة', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleModalQualification = (val) => {
    let current = [...(ruleModal.qualifications || [])];
    if (val === 'الكل') {
      setRuleModal({ ...ruleModal, qualifications: ['الكل'] });
      return;
    }
    current = current.filter((q) => q !== 'الكل');
    if (current.includes(val)) {
      current = current.filter((q) => q !== val);
    } else {
      current.push(val);
    }
    setRuleModal({ ...ruleModal, qualifications: current });
  };

  const toggleModalGrade = (val) => {
    let current = [...(ruleModal.grades || [])];
    if (val === 'الكل') {
      setRuleModal({ ...ruleModal, grades: ['الكل'] });
      return;
    }
    current = current.filter((g) => g !== 'الكل');
    if (current.includes(val)) {
      current = current.filter((g) => g !== val);
    } else {
      current.push(val);
    }
    setRuleModal({ ...ruleModal, grades: current });
  };

  const handleOpenAddRuleModal = () => {
    setRuleModal({
      isOpen: true,
      isEditing: false,
      ruleId: null,
      title: '',
      qualifications: [],
      grades: ['الكل'],
      exemptionType: 'كامل',
      isExempt: true,
      legalBasis: '',
      category: 'qualification',
    });
  };

  const handleOpenEditRuleModal = (rule) => {
    setRuleModal({
      isOpen: true,
      isEditing: true,
      ruleId: rule.id,
      title: rule.title || '',
      qualifications: rule.qualifications || [],
      grades: rule.grades || ['الكل'],
      exemptionType: rule.exemptionType || 'كامل',
      isExempt: rule.isExempt !== undefined ? rule.isExempt : true,
      legalBasis: rule.legalBasis || '',
      category: rule.category || 'qualification',
    });
  };

  const handleSaveRuleModal = async () => {
    if (!ruleModal.title || !ruleModal.title.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال عنوان او اسم ضابطة الإعفاء', variant: 'destructive' });
      return;
    }

    const currentRules = exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES;
    let updatedRules = [];

    if (ruleModal.isEditing && ruleModal.ruleId) {
      updatedRules = currentRules.map((r) =>
        r.id === ruleModal.ruleId
          ? {
              ...r,
              title: ruleModal.title.trim(),
              qualifications: ruleModal.qualifications,
              grades: ruleModal.grades,
              exemptionType: ruleModal.exemptionType,
              isExempt: ruleModal.isExempt,
              legalBasis: ruleModal.legalBasis,
              category: ruleModal.category,
            }
          : r
      );
    } else {
      const newRule = {
        id: `rule_${Date.now()}`,
        title: ruleModal.title.trim(),
        qualifications: ruleModal.qualifications,
        grades: ruleModal.grades,
        exemptionType: ruleModal.exemptionType,
        isExempt: ruleModal.isExempt,
        legalBasis: ruleModal.legalBasis,
        category: ruleModal.category || 'qualification',
      };
      updatedRules = [newRule, ...currentRules];
    }

    const newExemptionState = { ...exemptionRules, rules: updatedRules };
    setExemptionRules(newExemptionState);
    setRuleModal({ ...ruleModal, isOpen: false });

    try {
      const saved = await request('/api/governing-courses/exemption-rules', {
        method: 'POST',
        body: JSON.stringify(newExemptionState),
      });
      if (saved) setExemptionRules(saved);
      toast({
        title: 'تم الحفظ في قاعدة البيانات بنجاح',
        description: ruleModal.isEditing ? 'تم تحديث وحفظ ضابطة الإعفاء' : 'تمت إضافة وحفظ ضابطة الإعفاء الجديدة',
      });
    } catch (err) {
      toast({
        title: 'تم الحفظ محلياً',
        description: ruleModal.isEditing ? 'تم تحديث ضابطة الإعفاء' : 'تمت إضافة ضابطة إعفاء جديدة',
      });
    }
  };

  const handleDeleteRule = (ruleId, ruleTitle = '') => {
    setDeleteRuleConfirm({ isOpen: true, id: ruleId, title: ruleTitle });
  };

  const handleConfirmDeleteRule = async (ruleId) => {
    const currentRules = exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES;
    const updatedRules = currentRules.filter((r) => r.id !== ruleId);
    const newExemptionState = { ...exemptionRules, rules: updatedRules };
    setExemptionRules(newExemptionState);
    setDeleteRuleConfirm({ isOpen: false, id: null, title: '' });

    try {
      const saved = await request('/api/governing-courses/exemption-rules', {
        method: 'POST',
        body: JSON.stringify(newExemptionState),
      });
      if (saved) setExemptionRules(saved);
      toast({ title: 'تم الحذف بنجاح', description: 'تمت إزالة ضابطة الإعفاء وحفظ التغييرات في قاعدة البيانات تلقائياً' });
    } catch (err) {
      toast({ title: 'تم الحذف', description: 'تمت إزالة ضابطة الإعفاء من القائمة' });
    }
  };

  const handleToggleRuleActive = async (ruleId) => {
    const currentRules = exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES;
    const updatedRules = currentRules.map((r) => (r.id === ruleId ? { ...r, isExempt: !r.isExempt } : r));
    const newExemptionState = { ...exemptionRules, rules: updatedRules };
    setExemptionRules(newExemptionState);

    try {
      const saved = await request('/api/governing-courses/exemption-rules', {
        method: 'POST',
        body: JSON.stringify(newExemptionState),
      });
      if (saved) setExemptionRules(saved);
    } catch (err) {
      // Quiet save
    }
  };

  const handleResetExemptionRulesDefaults = async () => {
    if (!window.confirm('هل أنت أحدث بالتأكيد من استعادة ضوابط وقواعد الإعفاء الموحدة الافتراضية؟')) return;
    const newExemptionState = {
      ...exemptionRules,
      rules: DEFAULT_DYNAMIC_EXEMPTION_RULES,
    };
    setExemptionRules(newExemptionState);

    try {
      const saved = await request('/api/governing-courses/exemption-rules', {
        method: 'POST',
        body: JSON.stringify(newExemptionState),
      });
      if (saved) setExemptionRules(saved);
      toast({ title: 'تم الاسترجاع والحفظ', description: 'تمت استعادة القواعد الموحدة للإعفاء من الدورات الحاكمة وحفظها' });
    } catch (err) {
      toast({ title: 'تم الاسترجاع', description: 'تمت استعادة القواعد الموحدة للإعفاء من الدورات الحاكمة' });
    }
  };

  // Helpers for strict grade parsing and senior leadership post verification
  const extractGradeNumber = (val) => {
    if (val === null || val === undefined) return null;
    const s = String(val).trim().toLowerCase();
    if (!s) return null;
    const digits = s.replace(/[^0-9]/g, '');
    if (digits && parseInt(digits, 10) >= 1 && parseInt(digits, 10) <= 10) {
      return parseInt(digits, 10);
    }
    if (s.includes('الأولى') || s.includes('الاولى') || s.includes('الاول')) return 1;
    if (s.includes('الثانية') || s.includes('الثاني')) return 2;
    if (s.includes('الثالثة') || s.includes('الثالث')) return 3;
    if (s.includes('الرابعة') || s.includes('الرابع')) return 4;
    if (s.includes('الخامسة') || s.includes('الخامس')) return 5;
    if (s.includes('السادسة') || s.includes('السادس')) return 6;
    if (s.includes('السابعة') || s.includes('السابع')) return 7;
    if (s.includes('الثامنة') || s.includes('الثامن')) return 8;
    if (s.includes('التاسعة') || s.includes('التاسع')) return 9;
    if (s.includes('العاشرة') || s.includes('العاشر')) return 10;
    return null;
  };

  const isSeniorLeadershipPost = (titleStr, gStr) => {
    const t = (titleStr || '').toLowerCase();
    const g = (gStr || '').toLowerCase();
    if (g.includes('خاص') || g === 'خاصة' || g === 'الخاصة') return true;
    if (
      t.includes('مدير عام') ||
      t.includes('مديرة عامة') ||
      t.includes('وكيل') ||
      t.includes('رئيس هيئة') ||
      t.includes('مستشار') ||
      t.includes('درجة خاصة') ||
      t.includes('عميد') ||
      t.includes('وزير')
    ) {
      return true;
    }
    return false;
  };

  // Helper to calculate automatic or manual exemption status for an employee
  const getEmployeeInclusionInfo = (emp) => {
    const empIdStr = String(emp.id || emp.employeeId || emp.employee_id || '');
    const custom = employeeAssignments[empIdStr];

    if (custom && custom.status) {
      if (custom.status === 'معفى_استثناء' || custom.status === 'معفى_يدوي') {
        return {
          statusKey: 'معفى_استثناء',
          statusLabel: 'معفى استثناءً (أمر إداري)',
          badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
          reason: custom.exemptionReason || 'إعفاء بقرار/أمر إداري استثنائي',
          orderNo: custom.exemptionOrderNumber,
          orderDate: custom.exemptionOrderDate,
          isExempt: true,
        };
      }
      if (custom.status === 'معفى_شهادة') {
        return {
          statusKey: 'معفى_شهادة',
          statusLabel: 'معفى تلقائياً (شهادة أكاديمية)',
          badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
          reason: custom.exemptionReason || 'إعفاء مستند للشهادة الأكاديمية',
          orderNo: custom.exemptionOrderNumber,
          orderDate: custom.exemptionOrderDate,
          isExempt: true,
        };
      }
      if (custom.status === 'معفى_درجة') {
        return {
          statusKey: 'معفى_درجة',
          statusLabel: 'معفى (الدرجة / العنوان الوظيفي)',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
          reason: custom.exemptionReason || 'إعفاء مستند للدرجة أو العنوان الإداري القيادي',
          orderNo: custom.exemptionOrderNumber,
          orderDate: custom.exemptionOrderDate,
          isExempt: true,
        };
      }
      if (custom.status === 'مشمول') {
        return {
          statusKey: 'مشمول',
          statusLabel: 'مشمول بالدورات الحاكمة',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          reason: 'مشمول بمتطلبات الترفيع القياسية للدرجة الوظيفية',
          isExempt: false,
        };
      }
    }

    // Dynamic Evaluation Against Exemption Rules
    const edu = (
      emp.educationLevel ||
      emp.education_level ||
      emp.qualification ||
      emp.qualificationName ||
      emp.academicDegree ||
      emp.academic_degree ||
      ''
    ).toLowerCase().trim();

    const title = (
      emp.jobTitle ||
      emp.job_title ||
      emp.degreeTitle ||
      emp.job_degree_title ||
      ''
    ).toLowerCase().trim();

    const rawGrade = emp.grade ?? emp.jobGrade ?? emp.job_grade ?? emp.grade_level ?? emp.degree ?? '';
    const gradeStr = String(rawGrade).toLowerCase().trim();

    const rulesList = exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES;

    for (const rule of rulesList) {
      if (!rule.isExempt) continue;

      // 1) Match Education
      let matchEdu = false;
      if (!rule.qualifications || rule.qualifications.length === 0 || rule.qualifications.includes('الكل')) {
        matchEdu = true;
      } else {
        matchEdu = rule.qualifications.some((q) => {
          const qLower = q.toLowerCase();
          if (qLower === 'متوسطة فما دون') {
            return (
              edu.includes('متوسطة') ||
              edu.includes('ابتدائية') ||
              edu.includes('دون') ||
              edu.includes('بدون') ||
              edu.includes('يقرأ') ||
              edu.includes('أمية') ||
              edu === ''
            );
          }
          if (qLower === 'دكتوراه') return edu.includes('دكتوراه') || edu.includes('phd');
          if (qLower === 'ماجستير') return edu.includes('ماجستير') || edu.includes('master');
          if (qLower === 'دبلوم عالي') return edu.includes('دبلوم عالي') || edu.includes('عالي');
          if (qLower === 'بكالوريوس') return edu.includes('بكالوريوس') || edu.includes('bachelor');
          if (qLower === 'دبلوم') return edu.includes('دبلوم') && !edu.includes('عالي');
          if (qLower === 'إعدادية') return edu.includes('إعدادية') || edu.includes('ثانوية');
          if (qLower === 'بدون مؤهل') return edu.includes('بدون') || edu.includes('أمي') || edu === '';
          return edu.includes(qLower);
        });
      }

      // 2) Match Grade
      let matchGrade = false;
      if (!rule.grades || rule.grades.length === 0 || rule.grades.includes('الكل')) {
        matchGrade = true;
      } else {
        const empGradeNum = extractGradeNumber(rawGrade);
        matchGrade = rule.grades.some((g) => {
          if (g === 'الكل') return true;

          const targetGradeNum = parseInt(g, 10);
          if (!isNaN(targetGradeNum) && targetGradeNum >= 1 && targetGradeNum <= 10) {
            return empGradeNum === targetGradeNum;
          }

          if (g === 'الخاصة_أ') {
            return (
              (gradeStr.includes('خاص') && (gradeStr.includes('أ') || gradeStr.includes('ا'))) ||
              title.includes('خاصة أ') || title.includes('خاصة ا')
            );
          }

          if (g === 'الخاصة_ب') {
            return (
              (gradeStr.includes('خاص') && gradeStr.includes('ب')) ||
              title.includes('خاصة ب')
            );
          }

          if (g === 'المناصب_القيادية') {
            return isSeniorLeadershipPost(title, gradeStr);
          }

          return g === gradeStr;
        });
      }

      if (matchEdu && matchGrade) {
        if (rule.exemptionType === 'لا_يوجد_إعفاء') {
          return {
            statusKey: 'مشمول',
            statusLabel: 'مشمول بالدورات الحاكمة',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
            reason: rule.legalBasis || 'مشمول بمتطلبات الدرجة الوظيفية',
            isExempt: false,
          };
        }

        let badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
        let statusKey = 'معفى_شهادة';
        if (rule.exemptionType === 'جزئي') {
          badgeClass = 'bg-cyan-100 text-cyan-800 border-cyan-300';
          statusKey = 'معفى_جزئي';
        } else if (rule.exemptionType === 'دورة_بديلة') {
          badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
          statusKey = 'معفى_درجة';
        } else if (rule.exemptionType === 'استثناء_خدمة') {
          badgeClass = 'bg-purple-100 text-purple-800 border-purple-300';
          statusKey = 'معفى_استثناء';
        }

        return {
          statusKey: statusKey,
          statusLabel: `معفى (${rule.title})`,
          badgeClass: badgeClass,
          reason: rule.legalBasis || 'معفى وفق ضوابط الإعفاء المعمول بها',
          isExempt: true,
        };
      }
    }

    return {
      statusKey: 'مشمول',
      statusLabel: 'مشمول بالدورات الحاكمة',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      reason: 'مشمول بحتميات الترفيع للدرجة الوظيفية التالية',
      isExempt: false,
    };
  };

  // Save manual exemption/inclusion status for an employee
  const handleSaveEmployeeExemptionModal = async () => {
    if (!exemptionModal.employee) return;
    setLoading(true);

    try {
      const payload = {
        employeeId: exemptionModal.employee.id,
        status: exemptionModal.status,
        exemptionReason: exemptionModal.exemptionReason,
        exemptionOrderNumber: exemptionModal.exemptionOrderNumber,
        exemptionOrderDate: exemptionModal.exemptionOrderDate,
        notes: exemptionModal.notes,
      };

      const updatedAssignment = await request('/api/governing-courses/employee-assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setEmployeeAssignments((prev) => ({
        ...prev,
        [String(exemptionModal.employee.id)]: {
          ...prev[String(exemptionModal.employee.id)],
          ...updatedAssignment,
        },
      }));

      toast({
        title: 'تم تحديث حالة الموظف',
        description: `تم حفظ حالة الموظف (${exemptionModal.employee?.fullName || exemptionModal.employee?.full_name || exemptionModal.employee?.name || ''}) بنجاح`,
      });

      setExemptionModal({ isOpen: false, employee: null, status: 'مشمول', exemptionReason: '', exemptionOrderNumber: '', exemptionOrderDate: '', notes: '' });
    } catch (err) {
      toast({ title: 'خطأ في الحفظ', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Open modal for setting exemption
  const openExemptionModalForEmployee = (emp) => {
    const info = getEmployeeInclusionInfo(emp);
    const custom = employeeAssignments[String(emp.id)] || {};

    setExemptionModal({
      isOpen: true,
      employee: emp,
      status: custom.status || info.statusKey || 'مشمول',
      exemptionReason: custom.exemptionReason || info.reason || '',
      exemptionOrderNumber: custom.exemptionOrderNumber || '',
      exemptionOrderDate: custom.exemptionOrderDate || '',
      notes: custom.notes || '',
    });
  };

  // Setup assigned courses view for selected employee
  const handleSelectEmployeeForCourses = (emp) => {
    setSelectedEmployeeForCourses(emp);
    const empGrade = parseInt(emp.grade) || 5;
    // Courses for this employee's grade
    const gradeCourses = records.filter((r) => r.grade === empGrade);

    const empAssignment = employeeAssignments[String(emp.id)] || {};
    const currentAssigned = empAssignment.assignedCourses || [];
    const currentProgress = empAssignment.courseProgress || {};

    const initialSelection = {};
    gradeCourses.forEach((c) => {
      const isAssigned = currentAssigned.length === 0 ? true : currentAssigned.includes(c.id);
      const prog = currentProgress[c.id] || { status: 'مطلوبة', score: 60, certNum: '', certDate: '' };
      initialSelection[c.id] = {
        selected: isAssigned,
        status: prog.status || 'مطلوبة', // 'مطلوبة' | 'قيد_التدريب' | 'مكتملة'
        score: prog.score || c.minPassingScore || 60,
        certNum: prog.certNum || '',
        certDate: prog.certDate || '',
      };
    });

    setAssignedCourseSelection(initialSelection);
  };

  const handleSaveAssignedCourses = async () => {
    if (!selectedEmployeeForCourses) return;
    setLoading(true);

    try {
      const assignedIds = Object.keys(assignedCourseSelection)
        .filter((cid) => assignedCourseSelection[cid].selected)
        .map((cid) => parseInt(cid));

      const courseProg = {};
      Object.keys(assignedCourseSelection).forEach((cid) => {
        courseProg[cid] = {
          status: assignedCourseSelection[cid].status,
          score: assignedCourseSelection[cid].score,
          certNum: assignedCourseSelection[cid].certNum,
          certDate: assignedCourseSelection[cid].certDate,
        };
      });

      const payload = {
        employeeId: selectedEmployeeForCourses.id,
        status: employeeAssignments[String(selectedEmployeeForCourses.id)]?.status || 'مشمول',
        assignedCourses: assignedIds,
        courseProgress: courseProg,
      };

      const updated = await request('/api/governing-courses/employee-assignments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setEmployeeAssignments((prev) => ({
        ...prev,
        [String(selectedEmployeeForCourses.id)]: {
          ...prev[String(selectedEmployeeForCourses.id)],
          ...updated,
        },
      }));

      toast({
        title: 'تم حفظ تخصيصات الدورات',
        description: `تم حفظ وتحديد الدورات الحاكمة المخصصة للموظف (${selectedEmployeeForCourses.fullName || selectedEmployeeForCourses.full_name || selectedEmployeeForCourses.name || ''})`,
      });
    } catch (err) {
      toast({ title: 'خطأ في الحفظ', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Filter & Search Logic for Catalog
  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchGrade = selectedGrade === 'all' || rec.grade === parseInt(selectedGrade);
      const name = (rec.courseName || rec.course_name || '').toLowerCase();
      const type = (rec.courseType || rec.course_type || '').toLowerCase();
      const desc = (rec.description || '').toLowerCase();
      const query = searchQuery.toLowerCase().trim();

      const matchQuery = !query || name.includes(query) || type.includes(query) || desc.includes(query);
      return matchGrade && matchQuery;
    });
  }, [records, selectedGrade, searchQuery]);

  // Statistics for Catalog
  const stats = useMemo(() => {
    const total = records.length;
    const active = records.filter((r) => r.status === 'فعال').length;
    const totalHours = records.reduce((sum, r) => sum + (parseInt(r.durationHours || r.duration_hours) || 0), 0);
    const uniqueGrades = new Set(records.map((r) => r.grade)).size;
    return { total, active, totalHours, uniqueGrades };
  }, [records]);

  // Employee Inclusion List Calculations
  const processedEmployees = useMemo(() => {
    return employees.map((emp) => {
      const incInfo = getEmployeeInclusionInfo(emp);
      return { ...emp, incInfo };
    });
  }, [employees, employeeAssignments, exemptionRules]);

  const filteredInclusionEmployees = useMemo(() => {
    return processedEmployees.filter((emp) => {
      const name = (emp.fullName || emp.full_name || emp.name || '').toLowerCase();
      const civil = (emp.civilServiceNumber || emp.civil_service_number || emp.employeeNumber || emp.employee_number || emp.companyNumber || emp.company_number || emp.employee_id_number || '').toLowerCase();
      const title = (emp.jobTitle || emp.job_title || '').toLowerCase();
      const query = incSearch.toLowerCase().trim();
      const matchQuery = !query || name.includes(query) || civil.includes(query) || title.includes(query);

      const matchGrade = incGradeFilter === 'all' || parseInt(emp.grade) === parseInt(incGradeFilter);

      let matchStatus = true;
      if (incStatusFilter === 'included') matchStatus = !emp.incInfo.isExempt;
      if (incStatusFilter === 'exempt_qualification') matchStatus = emp.incInfo.statusKey === 'معفى_شهادة';
      if (incStatusFilter === 'exempt_grade') matchStatus = emp.incInfo.statusKey === 'معفى_درجة';
      if (incStatusFilter === 'exempt_admin') matchStatus = emp.incInfo.statusKey === 'معفى_استثناء';

      return matchQuery && matchGrade && matchStatus;
    });
  }, [processedEmployees, incSearch, incStatusFilter, incGradeFilter]);

  const inclusionStats = useMemo(() => {
    const total = processedEmployees.length;
    const included = processedEmployees.filter((e) => !e.incInfo.isExempt).length;
    const exemptCert = processedEmployees.filter((e) => e.incInfo.statusKey === 'معفى_شهادة').length;
    const exemptGrade = processedEmployees.filter((e) => e.incInfo.statusKey === 'معفى_درجة').length;
    const exemptAdmin = processedEmployees.filter((e) => e.incInfo.statusKey === 'معفى_استثناء').length;
    return { total, included, exemptCert, exemptGrade, exemptAdmin };
  }, [processedEmployees]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div 
        className="text-white rounded-3xl p-6 shadow-xl relative overflow-hidden transition-all duration-300 border border-white/10"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0d1f3c 100%)` }}
      >
        <div 
          className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full blur-3xl pointer-events-none" 
          style={{ backgroundColor: `${secondaryColor}25` }}
        />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div 
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-2 border shadow-xs"
              style={{
                backgroundColor: `${secondaryColor}25`,
                borderColor: `${secondaryColor}40`,
                color: '#ffffff'
              }}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              نظام الموارد البشرية والتدريب والتطوير
            </div>
            <h2 className="text-2xl font-black text-white">إدارة الدورات التدريبية الحاكمة والمشمولين والإعفاءات</h2>
            <p className="text-slate-200 text-xs mt-1 max-w-2xl leading-relaxed">
              تحديد محددات وحتميات الدورات الحاكمة للترفيع، وضوابط الإعفاء حسب الشهادات الأكاديمية والدرجات والعناوين الوظيفية، وإدارة شمول الموظفين وتعيين الدورات المطلوبة لكل موظف.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-all border border-white/20 backdrop-blur-sm"
              title="استعادة الدورات الحاكمة القياسية المعتمدة"
            >
              <RotateCcw className="w-4 h-4" />
              استعادة القياسية
            </button>
            <button
              onClick={() => {
                setActiveTab('catalog');
                setAdding(true);
              }}
              style={{
                backgroundColor: secondaryColor,
                color: '#0f172a',
                boxShadow: `0 4px 14px ${secondaryColor}40`
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 font-black text-xs rounded-xl transition-all hover:brightness-110 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              إضافة دورة حاكمة جديدة
            </button>
          </div>
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6 pt-4 border-t border-white/15">
          <button
            onClick={() => setActiveTab('catalog')}
            style={activeTab === 'catalog' ? {
              backgroundColor: secondaryColor,
              color: '#0f172a',
              borderColor: secondaryColor,
              boxShadow: `0 4px 12px ${secondaryColor}40`
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff'
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
              activeTab === 'catalog'
                ? 'font-black shadow-md'
                : 'hover:bg-white/15'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-xs block font-bold">دليل الدورات الحاكمة</span>
              <span className="text-[10px] opacity-80 block">{stats.total} دورة حسب الدرجة</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            style={activeTab === 'rules' ? {
              backgroundColor: secondaryColor,
              color: '#0f172a',
              borderColor: secondaryColor,
              boxShadow: `0 4px 12px ${secondaryColor}40`
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff'
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
              activeTab === 'rules'
                ? 'font-black shadow-md'
                : 'hover:bg-white/15'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-xs block font-bold">ضوابط الإعفاءات</span>
              <span className="text-[10px] opacity-80 block">الشهادة والدرجة الوظيفية</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('inclusions')}
            style={activeTab === 'inclusions' ? {
              backgroundColor: secondaryColor,
              color: '#0f172a',
              borderColor: secondaryColor,
              boxShadow: `0 4px 12px ${secondaryColor}40`
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff'
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
              activeTab === 'inclusions'
                ? 'font-black shadow-md'
                : 'hover:bg-white/15'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-xs block font-bold">المشمولين وغير المشمولين</span>
              <span className="text-[10px] opacity-80 block">{inclusionStats.included} مشمول من أصل {inclusionStats.total}</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('assignments')}
            style={activeTab === 'assignments' ? {
              backgroundColor: secondaryColor,
              color: '#0f172a',
              borderColor: secondaryColor,
              boxShadow: `0 4px 12px ${secondaryColor}40`
            } : {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff'
            }}
            className={`p-3 rounded-2xl border text-right transition-all flex items-center gap-2.5 ${
              activeTab === 'assignments'
                ? 'font-black shadow-md'
                : 'hover:bg-white/15'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <div>
              <span className="text-xs block font-bold">تحديد الدورات للمشمولين</span>
              <span className="text-[10px] opacity-80 block">تخصيص ومتابعة الموظف</span>
            </div>
          </button>
        </div>
      </div>

      {/* TAB 1: CATALOG OF GOVERNING COURSES */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Official Promotion Paths Matrix Table */}
          <div className="bg-white rounded-2xl border border-amber-200/80 shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMatrixGuide(!showMatrixGuide)}
              className="w-full p-4 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between hover:bg-amber-100/50 transition-colors text-right"
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">جدول حتميات مسارات الترقية والدرجات الوظيفية المعتمدة</h3>
                  <p className="text-[11px] text-slate-500">محددات الدورات الحاكمة وفق سلم الرواتب والخدمة المدنية (من الدرجة 8 إلى الدرجة 1)</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                {showMatrixGuide ? 'إخفاء الجدول' : 'عرض الجدول الرسمي'}
              </span>
            </button>

            {showMatrixGuide && (
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-2.5 rounded-r-lg">مسار الترقية</th>
                      <th className="p-2.5 text-center">الدرجة (من ← إلى)</th>
                      <th className="p-2.5 rounded-l-lg">الدورات الحاكمة المطلوبة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">الثانية ← الأولى</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">2 ← 1</td>
                      <td className="p-3 space-y-1">
                        <p className="font-semibold text-slate-800">1) اختصاص متقدمة (أسبوعين - 10 أيام)</p>
                        <p className="font-semibold text-slate-800">2) إدارية متقدمة / إدارة وقيادة (أسبوع على الأقل)</p>
                        <p className="text-slate-600">3) تفاوض — <span className="text-amber-700 font-medium">يمكن تعويضها بلجان/اجتماعات مع شركات أجنبية بكتاب رسمي مؤيد</span></p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">الثالثة ← الثانية</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">3 ← 2</td>
                      <td className="p-3 space-y-1">
                        <p className="font-semibold text-slate-800">1) اختصاص (أسبوعين - 10 أيام)</p>
                        <p className="text-slate-700">2) (إدارية متقدمة) أو (حاسبة) أو (لغة إنكليزية) بمجموع شهر تدريبي</p>
                        <p className="text-emerald-700 font-medium text-[11px] bg-emerald-50 p-1.5 rounded-md border border-emerald-200">
                          💡 بديل كامل: للعنوان الإداري (مدير / مدير أقدم) دورة واحدة ≥ شهر تغني عن كل الحتميات
                        </p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">الرابعة ← الثالثة</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">4 ← 3</td>
                      <td className="p-3 space-y-1">
                        <p className="text-slate-700 font-medium">نفس متطلبات الترفيع (3 ← 2): دورة اختصاص (أسبوعين) + (إدارية متقدمة/حاسبة/إنكليزي مجموع شهر) أو البديل الإداري الكامل</p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">الخامسة ← الرابعة</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">5 ← 4</td>
                      <td className="p-3 space-y-1">
                        <p className="font-semibold text-slate-800">1) اختصاص (أسبوعين)</p>
                        <p className="font-semibold text-slate-800">2) إدارية أو حاسبة (أسبوع)</p>
                        <p className="font-semibold text-slate-800">3) السلامة والصحة المهنية والبيئة (H.S.E)</p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">السادسة ← الخامسة</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">6 ← 5</td>
                      <td className="p-3 space-y-1">
                        <p className="text-slate-700 font-medium">نفس متطلبات الترفيع (5 ← 4): دورة اختصاص (أسبوعين) + إدارية/حاسبة (أسبوع) + H.S.E</p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">السابعة ← السادسة</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">7 ← 6</td>
                      <td className="p-3 space-y-1">
                        <p className="font-semibold text-slate-800">1) اختصاص (أسبوع) &nbsp; 2) إدارية (أسبوع)</p>
                        <p className="font-semibold text-slate-800">3) H.S.E (أسبوع) &nbsp; 4) حاسبة (أسبوع)</p>
                      </td>
                    </tr>
                    <tr className="hover:bg-amber-50/40">
                      <td className="p-3 font-bold text-amber-900 bg-amber-50/30">الثامنة ← السابعة</td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700 bg-slate-50">8 ← 7</td>
                      <td className="p-3 space-y-1">
                        <p className="text-slate-700 font-medium">نفس متطلبات الترفيع (7 ← 6): اختصاص (أسبوع) + إدارية (أسبوع) + H.S.E + حاسبة</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Grade Filters & Search Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الدورة أو النوع أو الوصف..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Layers className="w-4 h-4 text-amber-600" />
                <span>تصفية حسب الدرجة الوظيفية:</span>
              </div>
            </div>

            {/* Grade Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedGrade('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  selectedGrade === 'all'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                كافة الدرجات الوظيفية
              </button>
              {JOB_GRADES_LIST.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setSelectedGrade(g.value.toString())}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                    selectedGrade === g.value.toString()
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {g.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Form for Adding New Record */}
          {adding && (
            <form onSubmit={handleCreate} className="bg-amber-50/60 border-2 border-amber-300 rounded-3xl p-6 shadow-lg space-y-4 animate-fadeIn">
              <div className="flex justify-between items-center pb-3 border-b border-amber-200">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-700" />
                  <h3 className="font-bold text-sm text-amber-950">إضافة دورة تدريبية حاكمة جديدة للدرجة الوظيفية</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدرجة الوظيفية المستهدفة *</label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(parseInt(e.target.value))}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    {JOB_GRADES_LIST.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الدورة الحاكمة *</label>
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="مثال: دورة إدارة المشاريع والجودة الإدارية"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع ومجال الدورة</label>
                  <select
                    value={newCourseType}
                    onChange={(e) => setNewCourseType(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    {COURSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدة بالأيام</label>
                  <input
                    type="number"
                    min="1"
                    value={newDurationDays}
                    onChange={(e) => setNewDurationDays(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عدد الساعات التدريبية</label>
                  <input
                    type="number"
                    min="1"
                    value={newDurationHours}
                    onChange={(e) => setNewDurationHours(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">درجة النجاح المقبولة (%)</label>
                  <input
                    type="number"
                    min="50"
                    max="100"
                    value={newMinScore}
                    onChange={(e) => setNewMinScore(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة التشغيلية</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="فعال">فعال</option>
                    <option value="غير فعال">غير فعال</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الوصف والملاحظات والتعليمات الخاصة بالدورة</label>
                <textarea
                  rows="2"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="اكتب أية شروط إضافية أو مخرجات مستهدفة من الدورة..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsRequired}
                    onChange={(e) => setNewIsRequired(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded-md focus:ring-amber-500"
                  />
                  <span>دورة وجوبية حاكمة لا يستوفى الترفيع بدونها</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-amber-200">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  حفظ الدورة الحاكمة
                </button>
              </div>
            </form>
          )}

          {/* List Cards of Governing Courses */}
          {filteredRecords.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">لا توجد دورات تدريبية حاكمة مسجلة</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                لم يتم العثور على أية دورات تطابق خيارات التصفية المختارة. يمكنك استعادة الدورات القياسية أو إضافة دورة جديدة.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRecords.map((rec) => {
                const isEditing = editingId === rec.id;
                const gradeInfo = JOB_GRADES_LIST.find((g) => g.value === rec.grade) || { label: `الدرجة ${rec.grade}` };
                const isRequired = rec.isRequiredForPromotion !== undefined ? rec.isRequiredForPromotion : (rec.is_required_for_promotion ?? true);

                if (isEditing) {
                  return (
                    <div key={rec.id} className="bg-amber-50/90 border-2 border-amber-400 rounded-3xl p-5 shadow-md space-y-3 col-span-1 md:col-span-2">
                      <div className="flex justify-between items-center pb-2 border-b border-amber-200">
                        <span className="font-bold text-xs text-amber-900">تعديل الدورة التدريبية الحاكمة</span>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">الدرجة الوظيفية</label>
                          <select
                            value={editGrade}
                            onChange={(e) => setEditGrade(parseInt(e.target.value))}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                          >
                            {JOB_GRADES_LIST.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">اسم الدورة</label>
                          <input
                            type="text"
                            value={editCourseName}
                            onChange={(e) => setEditCourseName(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">النوع</label>
                          <select
                            value={editCourseType}
                            onChange={(e) => setEditCourseType(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                          >
                            {COURSE_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">الأيام</label>
                          <input
                            type="number"
                            value={editDurationDays}
                            onChange={(e) => setEditDurationDays(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">الساعات</label>
                          <input
                            type="number"
                            value={editDurationHours}
                            onChange={(e) => setEditDurationHours(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">درجة النجاح %</label>
                          <input
                            type="number"
                            value={editMinScore}
                            onChange={(e) => setEditMinScore(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">الوصف</label>
                        <input
                          type="text"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs"
                        />
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-amber-200">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <input
                            type="checkbox"
                            checked={editIsRequired}
                            onChange={(e) => setEditIsRequired(e.target.checked)}
                            className="rounded-md"
                          />
                          حاكمة وجوبية للترفيع
                        </label>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-3 py-1.5 bg-slate-200 text-slate-700 font-bold text-xs rounded-lg"
                          >
                            إلغاء
                          </button>
                          <button
                            onClick={() => handleUpdate(rec.id)}
                            className="px-4 py-1.5 bg-amber-600 text-white font-bold text-xs rounded-lg shadow-sm"
                          >
                            حفظ
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={rec.id}
                    className={`bg-white rounded-3xl p-5 border shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                      rec.status === 'فعال' ? 'border-slate-200/90' : 'border-slate-200 bg-slate-50/60 opacity-75'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex justify-between items-start gap-2">
                        <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-100/80 text-amber-900 border border-amber-200">
                          الدرجة {rec.grade}
                        </span>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleStatus(rec)}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-lg transition-all ${
                              rec.status === 'فعال'
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {rec.status === 'فعال' ? 'فعال' : 'غير فعال'}
                          </button>
                          <button
                            onClick={() => startEditing(rec)}
                            className="p-1.5 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            title="تعديل"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm({ isOpen: true, id: rec.id, name: rec.courseName || rec.course_name })}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Title & Type */}
                      <div className="mt-3">
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                          {rec.courseType || rec.course_type || 'تخصصية'}
                        </span>
                        <h3 className="font-bold text-base text-slate-900 mt-1 leading-snug">
                          {rec.courseName || rec.course_name}
                        </h3>

                        {/* Target Promotion Info */}
                        <p className="text-xs text-amber-800 font-medium mt-1">
                          {gradeInfo.label}
                        </p>

                        {/* Details Badges */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-center">
                          <div className="bg-slate-50 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-400 block font-medium">المدة</span>
                            <span className="text-xs font-black text-slate-800 font-mono">
                              {rec.durationDays !== undefined ? rec.durationDays : (rec.duration_days || 5)} أيام
                            </span>
                          </div>

                          <div className="bg-slate-50 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-400 block font-medium">الساعات</span>
                            <span className="text-xs font-black text-slate-800 font-mono">
                              {rec.durationHours !== undefined ? rec.durationHours : (rec.duration_hours || 20)} ساعة
                            </span>
                          </div>

                          <div className="bg-slate-50 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-400 block font-medium">أدنى نجاح</span>
                            <span className="text-xs font-black text-emerald-700 font-mono">
                              {rec.minPassingScore !== undefined ? rec.minPassingScore : (rec.min_passing_score || 60)}%
                            </span>
                          </div>
                        </div>

                        {/* Description / Notes */}
                        {rec.description && (
                          <div className="mt-3 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 text-slate-600 text-xs leading-relaxed flex items-start gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>{rec.description}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer Requirement Tag */}
                      <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-medium">الاشتراط القانوني:</span>
                        {isRequired ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            حاكمة وجوبية للترفيع
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                            استرشادية / اختيارية
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: EXEMPTION RULES & POLICIES */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
            {/* Header & Main Control Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">إدارة ضوابط وقواعد الإعفاء من الدورات التدريبية الحاكمة</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    إضافة وتعديل ضوابط الإعفاء المستندة إلى الشهادة الأكاديمية (من المتوسطة فما دون إلى الدكتوراه) والدرجات الوظيفية (من 10 حتى الدرجات الخاصة)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <button
                  onClick={handleOpenAddRuleModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة ضابطة إعفاء جديدة</span>
                </button>

                <button
                  onClick={handleSaveExemptionRules}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>حفظ التغييرات</span>
                </button>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80">
              {/* Search input */}
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  placeholder="ابحث بالحساسية أو الدرجة أو نص الضابطة..."
                  className="w-full pl-3 pr-9 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {/* Category filter */}
                <select
                  value={ruleCategoryFilter}
                  onChange={(e) => setRuleCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden"
                >
                  <option value="all">كافة الفئات (الكل)</option>
                  <option value="qualification">معايير الشهادة الأكاديمية</option>
                  <option value="grade">معايير الدرجات الوظيفية والعناوين</option>
                  <option value="general">معايير عامة واستثناءات خدمة</option>
                </select>

                {/* Status filter */}
                <select
                  value={ruleStatusFilter}
                  onChange={(e) => setRuleStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden"
                >
                  <option value="all">كافة الحالات</option>
                  <option value="active">إعفاء مفعل فقط</option>
                  <option value="inactive">غير مفعل (شمول بالدورات)</option>
                </select>
              </div>
            </div>

            {/* Rules Cards List */}
            <div className="space-y-4">
              {(exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES)
                .filter((rule) => {
                  if (ruleCategoryFilter !== 'all' && rule.category !== ruleCategoryFilter) return false;
                  if (ruleStatusFilter === 'active' && !rule.isExempt) return false;
                  if (ruleStatusFilter === 'inactive' && rule.isExempt) return false;
                  if (ruleSearch.trim()) {
                    const q = ruleSearch.toLowerCase().trim();
                    const titleMatch = (rule.title || '').toLowerCase().includes(q);
                    const legalMatch = (rule.legalBasis || '').toLowerCase().includes(q);
                    const qualMatch = (rule.qualifications || []).some((item) => item.toLowerCase().includes(q));
                    const gradeMatch = (rule.grades || []).some((item) => item.toLowerCase().includes(q));
                    return titleMatch || legalMatch || qualMatch || gradeMatch;
                  }
                  return true;
                })
                .map((rule) => {
                  const typeObj = EXEMPTION_TYPES_OPTIONS.find((t) => t.value === rule.exemptionType) || EXEMPTION_TYPES_OPTIONS[0];

                  return (
                    <div
                      key={rule.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        rule.isExempt
                          ? 'bg-white border-amber-200/90 shadow-2xs hover:shadow-md'
                          : 'bg-slate-50/80 border-slate-200 opacity-80'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Active status badge */}
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                                rule.isExempt
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                  : 'bg-slate-200 text-slate-700 border-slate-300'
                              }`}
                            >
                              {rule.isExempt ? 'إعفاء مفعل' : 'مشمول بالدورات (غير مفعل)'}
                            </span>

                            {/* Exemption Type Badge */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${typeObj.color}`}>
                              {typeObj.label}
                            </span>

                            {/* Category Label */}
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              {rule.category === 'qualification'
                                ? 'التحصيل الدراسي'
                                : rule.category === 'grade'
                                ? 'الدرجة والعنوان'
                                : 'عام / خدمة'}
                            </span>
                          </div>

                          <h4 className="font-bold text-base text-slate-900 leading-snug">{rule.title}</h4>

                          {/* Qualifications Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 ml-1">
                              <GraduationCap className="w-3.5 h-3.5 text-amber-700" />
                              الشهادات:
                            </span>
                            {(rule.qualifications || ['الكل']).map((q, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 rounded-md text-[11px] font-medium"
                              >
                                {q}
                              </span>
                            ))}
                          </div>

                          {/* Grades Badges */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 ml-1">
                              <Building2 className="w-3.5 h-3.5 text-blue-700" />
                              الدرجات الوظيفية:
                            </span>
                            {(rule.grades || ['الكل']).map((g, idx) => {
                              const matchObj = ALL_JOB_GRADES_OPTIONS.find((opt) => opt.value === g);
                              return (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded-md text-[11px] font-medium"
                                >
                                  {matchObj ? matchObj.badge : g}
                                </span>
                              );
                            })}
                          </div>

                          {/* Legal basis description */}
                          {rule.legalBasis && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 mt-2 leading-relaxed">
                              <span className="font-bold text-slate-700 ml-1">السند والضابطة:</span>
                              {rule.legalBasis}
                            </p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 self-end md:self-center shrink-0 border-t md:border-t-0 pt-3 md:pt-0 w-full md:w-auto justify-end">
                          <button
                            onClick={() => handleToggleRuleActive(rule.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                              rule.isExempt
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            }`}
                          >
                            {rule.isExempt ? 'تعطيل الإعفاء' : 'تفعيل الإعفاء'}
                          </button>

                          <button
                            onClick={() => handleOpenEditRuleModal(rule)}
                            className="p-2 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-all border border-slate-200"
                            title="تعديل الضابطة"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteRule(rule.id, rule.title)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200"
                            title="حذف الضابطة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INCLUSION & EXEMPTION MANAGEMENT DASHBOARD */}
      {activeTab === 'inclusions' && (
        <div className="space-y-6">
          {/* Quick Stats Grid for Inclusions */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-medium block">إجمالي الموظفين</span>
              <span className="text-xl font-black text-slate-800 mt-0.5 block">{inclusionStats.total}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-emerald-700 font-medium block">المشمولين بالدورات</span>
              <span className="text-xl font-black text-emerald-800 mt-0.5 block">{inclusionStats.included}</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-blue-700 font-medium block">معفيين (الشهادة)</span>
              <span className="text-xl font-black text-blue-800 mt-0.5 block">{inclusionStats.exemptCert}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-amber-700 font-medium block">معفيين (الدرجة/العنوان)</span>
              <span className="text-xl font-black text-amber-800 mt-0.5 block">{inclusionStats.exemptGrade}</span>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-purple-700 font-medium block">معفيين (استثناء إداري)</span>
              <span className="text-xl font-black text-purple-800 mt-0.5 block">{inclusionStats.exemptAdmin}</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={incSearch}
                  onChange={(e) => setIncSearch(e.target.value)}
                  placeholder="ابحث باسم الموظف أو الرقم الوظيفي..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={incStatusFilter}
                  onChange={(e) => setIncStatusFilter(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="all">كافة حالات الشمول والإعفاء</option>
                  <option value="included">المشمولين بالدورات فقط</option>
                  <option value="exempt_qualification">معفيين حسب الشهادة الأكاديمية</option>
                  <option value="exempt_grade">معفيين حسب الدرجة والعنوان</option>
                  <option value="exempt_admin">معفيين استثناءً بأمر إداري</option>
                </select>

                <select
                  value={incGradeFilter}
                  onChange={(e) => setIncGradeFilter(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="all">كافة الدرجات الوظيفية</option>
                  {JOB_GRADES_LIST.map((g) => (
                    <option key={g.value} value={g.value}>
                      الدرجة {g.value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Employees Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="p-3">اسم الموظف / الرقم الوظيفي</th>
                    <th className="p-3 text-center">الدرجة والشهادة المعتمدة بقيد الموظف</th>
                    <th className="p-3">العنوان والتشكيل الإداري</th>
                    <th className="p-3 text-center">حالة الشمول بالدورات الحاكمة</th>
                    <th className="p-3">السبب / الأمر الإداري للإعفاء</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInclusionEmployees.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-400">
                        لا يوجد موظفين يطابقون شروط البحث والتصفية المحددة
                      </td>
                    </tr>
                  ) : (
                    filteredInclusionEmployees.map((emp) => {
                      const empName = emp.fullName || emp.full_name || emp.name || 'موظف بدون اسم';
                      const empJobNum = emp.civilServiceNumber || emp.civil_service_number || emp.employeeNumber || emp.employee_number || emp.companyNumber || emp.company_number || emp.employee_id_number || 'غير محدد';
                      const empGrade = emp.grade || 'غير محددة';
                      const empEdu = emp.educationLevel || emp.education_level || 'غير مسجلة';
                      const empTitle = emp.jobTitle || emp.job_title || 'غير محدد';
                      const empDept = emp.department || emp.section || 'المقر الرئيسي';

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <span className="font-bold text-slate-900 block">{empName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">الرقم الوظيفي: {empJobNum}</span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md font-bold text-[11px] mb-1">
                              الدرجة {empGrade}
                            </span>
                            <span className="block text-[11px] text-slate-600 font-medium">
                              {empEdu}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-slate-800 block">{empTitle}</span>
                            <span className="text-[10px] text-slate-500">{empDept}</span>
                          </td>
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${emp.incInfo.badgeClass}`}>
                            {emp.incInfo.isExempt ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                            {emp.incInfo.statusLabel}
                          </span>
                        </td>
                        <td className="p-3">
                          <p className="text-xs text-slate-700 leading-snug">{emp.incInfo.reason}</p>
                          {emp.incInfo.orderNo && (
                            <span className="inline-block text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 mt-1">
                              أمر رقم: {emp.incInfo.orderNo} بتاريخ {emp.incInfo.orderDate || '-'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => openExemptionModalForEmployee(emp)}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] rounded-xl border border-amber-200 transition-all"
                          >
                            تعديل الشمول / الإعفاء
                          </button>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ASSIGNING COURSES TO INCLUDED EMPLOYEES */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column: Select Included Employee */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <UserCheck className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-sm text-slate-900">اختيار الموظف المشمول</h3>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={incSearch}
                  onChange={(e) => setIncSearch(e.target.value)}
                  placeholder="ابحث عن موظف مشمول..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="max-h-[500px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {processedEmployees
                  .filter((e) => !e.incInfo.isExempt)
                  .filter((e) => {
                    if (!incSearch) return true;
                    const q = incSearch.toLowerCase();
                    const eName = (e.fullName || e.full_name || e.name || '').toLowerCase();
                    const eCivil = (e.civilServiceNumber || e.civil_service_number || e.employeeNumber || e.employee_number || '').toLowerCase();
                    return eName.includes(q) || eCivil.includes(q);
                  })
                  .map((emp) => {
                    const isSelected = selectedEmployeeForCourses?.id === emp.id;
                    const empName = emp.fullName || emp.full_name || emp.name || 'موظف بدون اسم';
                    const empTitle = emp.jobTitle || emp.job_title || 'بدون عنوان';
                    const empEdu = emp.educationLevel || emp.education_level || 'شهادة غير محددة';
                    return (
                      <button
                        key={emp.id}
                        onClick={() => handleSelectEmployeeForCourses(emp)}
                        className={`w-full p-3 rounded-2xl text-right border transition-all ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-xs'
                            : 'bg-slate-50 hover:bg-amber-50/60 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-xs block">{empName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSelected ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            الدرجة {emp.grade || '?'}
                          </span>
                        </div>
                        <span className={`text-[11px] block mt-1 ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                          {empTitle} • {empEdu}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Right Column: Course Assignments Form */}
            <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
              {!selectedEmployeeForCourses ? (
                <div className="p-12 text-center text-slate-400 space-y-2">
                  <Award className="w-12 h-12 text-slate-300 mx-auto" />
                  <h4 className="font-bold text-sm text-slate-700">يرجى اختيار موظف مشمول من القائمة</h4>
                  <p className="text-xs">تتيح لك هذه الشاشة عرض وتخصيص وتثبيت نتائج وتاريخ اجتياز الدورات الحاكمة للموظف المختار</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Selected Employee Info */}
                  <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded border border-amber-300 mb-1 inline-block">
                        الموظف المختار للتخصيص
                      </span>
                      <h3 className="font-black text-base text-slate-900">
                        {selectedEmployeeForCourses.fullName || selectedEmployeeForCourses.full_name || selectedEmployeeForCourses.name}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        الدرجة الحالية: <span className="font-bold text-slate-900">{selectedEmployeeForCourses.grade}</span> (الترقية إلى الدرجة {(parseInt(selectedEmployeeForCourses.grade) || 2) - 1}) • العنوان: {selectedEmployeeForCourses.jobTitle || selectedEmployeeForCourses.job_title || 'غير محدد'}
                      </p>
                    </div>

                    <button
                      onClick={handleSaveAssignedCourses}
                      disabled={loading}
                      className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      حفظ تخصيصات وتاريخ الدورات
                    </button>
                  </div>

                  {/* List of Applicable Governing Courses for Grade */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-amber-700" />
                      الدورات التدريبية الحاكمة المقررة للدرجة ({selectedEmployeeForCourses.grade}):
                    </h4>

                    {records.filter((r) => r.grade === parseInt(selectedEmployeeForCourses.grade)).length === 0 ? (
                      <p className="text-xs text-slate-400 p-4 bg-slate-50 rounded-xl text-center">
                        لا توجد دورات قياسية مسجلة لهذه الدرجة الوظيفية حالياً في الدليل
                      </p>
                    ) : (
                      records
                        .filter((r) => r.grade === parseInt(selectedEmployeeForCourses.grade))
                        .map((course) => {
                          const stateData = assignedCourseSelection[course.id] || { selected: true, status: 'مطلوبة', score: 60, certNum: '', certDate: '' };
                          return (
                            <div
                              key={course.id}
                              className={`p-4 rounded-2xl border transition-all space-y-3 ${
                                stateData.selected ? 'bg-white border-amber-300 shadow-2xs' : 'bg-slate-50/60 border-slate-200 opacity-60'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-2">
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={stateData.selected}
                                    onChange={(e) => {
                                      setAssignedCourseSelection((prev) => ({
                                        ...prev,
                                        [course.id]: { ...prev[course.id], selected: e.target.checked },
                                      }));
                                    }}
                                    className="w-4 h-4 text-amber-600 rounded mt-0.5"
                                  />
                                  <div>
                                    <span className="font-bold text-xs text-slate-900 block">{course.courseName || course.course_name}</span>
                                    <span className="text-[10px] text-slate-500 font-medium">النوع: {course.courseType || 'تخصصية'} • المدة: {course.durationDays} أيام ({course.durationHours} ساعة)</span>
                                  </div>
                                </label>

                                <select
                                  value={stateData.status}
                                  onChange={(e) => {
                                    setAssignedCourseSelection((prev) => ({
                                      ...prev,
                                      [course.id]: { ...prev[course.id], status: e.target.value },
                                    }));
                                  }}
                                  className="p-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold"
                                >
                                  <option value="مطلوبة">لم تبدأ / مطلوبة للترقية</option>
                                  <option value="قيد_التدريب">قيد التدريب والتنفيذ</option>
                                  <option value="مكتملة">مكتملة ومجتازة بنجاح</option>
                                </select>
                              </div>

                              {stateData.selected && (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">درجة النجاح (%)</label>
                                    <input
                                      type="number"
                                      value={stateData.score}
                                      onChange={(e) => {
                                        setAssignedCourseSelection((prev) => ({
                                          ...prev,
                                          [course.id]: { ...prev[course.id], score: parseInt(e.target.value) || 60 },
                                        }));
                                      }}
                                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">رقم كتاب / شهادة الاجتياز</label>
                                    <input
                                      type="text"
                                      value={stateData.certNum}
                                      onChange={(e) => {
                                        setAssignedCourseSelection((prev) => ({
                                          ...prev,
                                          [course.id]: { ...prev[course.id], certNum: e.target.value },
                                        }));
                                      }}
                                      placeholder="رقم الكتاب الرسمي..."
                                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                    />
                                  </div>

                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-1">تاريخ الاجتياز</label>
                                    <input
                                      type="date"
                                      value={stateData.certDate}
                                      onChange={(e) => {
                                        setAssignedCourseSelection((prev) => ({
                                          ...prev,
                                          [course.id]: { ...prev[course.id], certDate: e.target.value },
                                        }));
                                      }}
                                      className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EXEMPTION MODAL FOR EMPLOYEE */}
      {exemptionModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-sm text-slate-900">تعديل حالة الشمول والاعفاء من الدورات الحاكمة</h3>
              </div>
              <button
                onClick={() => setExemptionModal({ isOpen: false, employee: null, status: 'مشمول', exemptionReason: '', exemptionOrderNumber: '', exemptionOrderDate: '', notes: '' })}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <span className="font-bold block text-sm">
                {exemptionModal.employee?.fullName || exemptionModal.employee?.full_name || exemptionModal.employee?.name || 'موظف بدون اسم'}
              </span>
              <span>
                الدرجة الوظيفية: {exemptionModal.employee?.grade || 'غير محددة'} • الشهادة: {exemptionModal.employee?.educationLevel || exemptionModal.employee?.education_level || 'غير مسجلة'} • العنوان: {exemptionModal.employee?.jobTitle || exemptionModal.employee?.job_title || 'غير محدد'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حالة الشمول بالدورات الحاكمة *</label>
                <select
                  value={exemptionModal.status}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, status: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="مشمول">مشمول بالدورات الحاكمة (وجوب التطبيق)</option>
                  <option value="معفى_شهادة">معفى بناءً على الشهادة الأكاديمية (دكتوراه/ماجستير)</option>
                  <option value="معفى_درجة">معفى بناءً على الدرجة أو العنوان الإداري</option>
                  <option value="معفى_استثناء">معفى استثناءً بموجب أمر إداري خاص</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب ومبرر الإعفاء التفصيلي</label>
                <input
                  type="text"
                  value={exemptionModal.exemptionReason}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionReason: e.target.value })}
                  placeholder="مثال: حائز على شهادة الدكتوراه / أتم الدورة البديلة الشاملة..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الأمر الإداري / الاستثناء</label>
                  <input
                    type="text"
                    value={exemptionModal.exemptionOrderNumber}
                    onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionOrderNumber: e.target.value })}
                    placeholder="مثال: 1245/و"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الأمر الإداري</label>
                  <input
                    type="date"
                    value={exemptionModal.exemptionOrderDate}
                    onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionOrderDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <textarea
                  rows="2"
                  value={exemptionModal.notes}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, notes: e.target.value })}
                  placeholder="ملاحظات قسم التدريب والموارد البشرية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setExemptionModal({ isOpen: false, employee: null, status: 'مشمول', exemptionReason: '', exemptionOrderNumber: '', exemptionOrderDate: '', notes: '' })}
                className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveEmployeeExemptionModal}
                disabled={loading}
                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                حفظ التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog for Courses */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">تأكيد حذف الدورة الحاكمة</h3>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت تأكيد من رغبتك في حذف الدورة الحاكمة{' '}
                <span className="font-bold text-slate-800">"{deleteConfirm.name}"</span>؟ لا يمكن التراجع عن هذه العملية.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                حذف الدورة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog for Exemption Rules */}
      {deleteRuleConfirm.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">تأكيد حذف ضابطة الإعفاء</h3>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت تأكيد من رغبتك في حذف ضابطة الإعفاء{' '}
                <span className="font-bold text-slate-800">"{deleteRuleConfirm.title}"</span>؟ لا يمكن التراجع عن هذه العملية.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteRuleConfirm({ isOpen: false, id: null, title: '' })}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleConfirmDeleteRule(deleteRuleConfirm.id)}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                حذف ضابطة الإعفاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exemption Rule Edit/Add Modal */}
      {ruleModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {ruleModal.isEditing ? 'تعديل ضابطة إعفاء' : 'إضافة ضابطة إعفاء جديدة'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    تحديد المعايير المعتمدة بناءً على التحصيل الدراسي والدرجات الوظيفية
                  </p>
                </div>
              </div>

              <button
                onClick={() => setRuleModal({ ...ruleModal, isOpen: false })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Rule Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم أو عنوان ضابطة الإعفاء *</label>
                <input
                  type="text"
                  value={ruleModal.title}
                  onChange={(e) => setRuleModal({ ...ruleModal, title: e.target.value })}
                  placeholder="مثال: إعفاء حاملي شهادات المتوسطة فما دون من الدورات"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فئة الضابطة</label>
                <select
                  value={ruleModal.category}
                  onChange={(e) => setRuleModal({ ...ruleModal, category: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="qualification">تعتمد على التحصيل الدراسي (الشهادة)</option>
                  <option value="grade">تعتمد على الدرجة الوظيفية والعنوان الإداري</option>
                  <option value="general">استثناء عام / خدمة وظيفية</option>
                </select>
              </div>

              {/* Educational Qualifications Chips Multi-select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-amber-700" />
                    <span>التحصيل الدراسي المشمول بالإعفاء:</span>
                  </div>
                  <span className="text-[11px] font-normal text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    مستوردة تلقائياً من إعدادات الشهادات
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  {qualificationOptions.map((opt) => {
                    const selected = (ruleModal.qualifications || []).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleModalQualification(opt.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          selected
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {selected ? '✓ ' : ''}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Job Grades Chips Multi-select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-700" />
                  <span>الدرجات والعناوين الوظيفية المشمولة بالإعفاء:</span>
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  {ALL_JOB_GRADES_OPTIONS.map((opt) => {
                    const selected = (ruleModal.grades || []).includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleModalGrade(opt.value)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {selected ? '✓ ' : ''}
                        {opt.badge}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Exemption Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع وأثر الإعفاء</label>
                <select
                  value={ruleModal.exemptionType}
                  onChange={(e) => setRuleModal({ ...ruleModal, exemptionType: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  {EXEMPTION_TYPES_OPTIONS.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Active status */}
              <div className="flex items-center gap-2 p-3 bg-amber-50/60 rounded-xl border border-amber-200/80">
                <input
                  type="checkbox"
                  id="modalRuleActive"
                  checked={ruleModal.isExempt}
                  onChange={(e) => setRuleModal({ ...ruleModal, isExempt: e.target.checked })}
                  className="w-4 h-4 text-amber-600 rounded-md cursor-pointer"
                />
                <label htmlFor="modalRuleActive" className="text-xs font-bold text-amber-950 cursor-pointer">
                  تفعيل هذه الضابطة في النظام والتطبيق التلقائي على الموظفين المشمولين
                </label>
              </div>

              {/* Legal Basis / Textarea */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">النص السند القانوني أو الملاحظات التفصيلية</label>
                <textarea
                  rows="3"
                  value={ruleModal.legalBasis}
                  onChange={(e) => setRuleModal({ ...ruleModal, legalBasis: e.target.value })}
                  placeholder="اكتب السند القانوني أو ضوابط الوزارة المعتمده..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRuleModal({ ...ruleModal, isOpen: false })}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveRuleModal}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                حفظ ضابطة الإعفاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
