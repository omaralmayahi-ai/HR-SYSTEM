import React, { useState, useEffect, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  GraduationCap,
  Users,
  Plus,
  Building2,
  Calendar,
  Award,
  Printer,
  Edit,
  Trash2,
  Globe,
  UserCheck,
  MapPin,
  School,
  FileText,
  X,
  Target,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Search,
  ShieldAlert,
  CheckCircle2,
  Eye,
  ArrowUp,
  ArrowDown,
  UserX,
  UserPlus,
  Filter,
  Lock,
  Unlock,
  QrCode,
  Phone,
  PhoneCall,
  Mail,
  AlertTriangle,
  PlayCircle,
  XCircle,
  RotateCcw,
  Clock,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  Check
} from 'lucide-react';

// Constants & Types
const TRACK_INTERNAL = 'تدريب داخلي';
const TRACK_EXTERNAL = 'تدريب خارجي وإيفادات';
const TRACK_SUMMER = 'تدريب صيفي';

const CATEGORIES = ['إدارية', 'حاسوب', 'HSE', 'اختصاص'];
const COURSE_TYPES = ['حضوري', 'إلكتروني'];
const LOCATION_TYPES = ['إلكتروني', 'موقعي', 'خارجي', 'دولي'];
const COURSE_STATUSES = ['غير منفذة', 'منفذة', 'ملغاة'];

const IRAQ_MONTHS = [
  { value: '1', label: '1 - كانون الثاني' },
  { value: '2', label: '2 - شباط' },
  { value: '3', label: '3 - آذار' },
  { value: '4', label: '4 - نيسان' },
  { value: '5', label: '5 - أيار' },
  { value: '6', label: '6 - حزيران' },
  { value: '7', label: '7 - تموز' },
  { value: '8', label: '8 - آب' },
  { value: '9', label: '9 - أيلول' },
  { value: '10', label: '10 - تشرين الأول' },
  { value: '11', label: '11 - تشرين الثاني' },
  { value: '12', label: '12 - كانون الأول' },
];

const JOB_GRADES = [
  'كافة الدرجات والكوادر الوظيفية',
  'الدرجة الممتازة / العليا',
  'الدرجة الأولى',
  'الدرجة الثانية',
  'الدرجة الثالثة',
  'الدرجة الرابعة',
  'الدرجة الخامسة',
  'الدرجة السادسة',
  'الدرجة السابعة',
  'الدرجة الثامنة',
  'الدرجة التاسعة',
  'الدرجة العاشرة'
];

const TARGET_JOB_GRADES_FROM_1 = [
  'الدرجة الأولى',
  'الدرجة الثانية',
  'الدرجة الثالثة',
  'الدرجة الرابعة',
  'الدرجة الخامسة',
  'الدرجة السادسة',
  'الدرجة السابعة',
  'الدرجة الثامنة',
  'الدرجة التاسعة',
  'الدرجة العاشرة'
];

const DURATION_UNITS = ['بالأيام', 'بالأسابيع', 'بالأشهر'];

// Robust helper to parse course_categories from any structure
export const parseCourseCategories = (raw) => {
  if (!raw) return [];
  let val = raw;
  for (let i = 0; i < 3; i++) {
    if (typeof val === 'string' && val.trim()) {
      try {
        const parsed = JSON.parse(val);
        val = parsed;
      } catch {
        return val.split(/[،,]/).map(s => s.trim()).filter(Boolean);
      }
    } else {
      break;
    }
  }
  if (Array.isArray(val)) {
    return val.map(item => typeof item === 'string' ? item.trim() : item).filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return val.split(/[،,]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
};

// Generates dynamic vCard payload for Quick Contact QR Code scanning
export const generateContactQRPayload = (tr) => {
  if (!tr) return '';
  const name = tr.full_name || tr.fullName || 'مدرب';
  const phone = tr.phone || '';
  const workPhone = tr.work_phone || tr.workPhone || '';
  const email = tr.email || '';

  const vcardLines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:;${name};;;`,
    `FN:${name}`,
    phone ? `TEL;TYPE=CELL,VOICE:${phone}` : '',
    workPhone ? `TEL;TYPE=WORK,VOICE:${workPhone}` : '',
    email ? `EMAIL:${email}` : '',
    'END:VCARD'
  ].filter(Boolean);

  return vcardLines.join('\n');
};

const TRAINER_STATUSES = ['معتمد', 'قيد الاعتماد', 'محظور', 'مقيد ومحظور', 'قيد التجريب', 'زائر', 'معطل'];
const RESULTS = ['قيد التقييم', 'اجتاز', 'لم يجتز', 'مشارك', 'انسحب'];
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'متوسط', 'مقبول', 'ضعيف'];

export default function Training() {
  const { toast } = useToast();
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const beneficiaryName = appPublicSettings?.beneficiaryName || 'شركة نفط الوسط';
  const logoUrl = appPublicSettings?.logoUrl || '';
  const platformName = appPublicSettings?.platformName || 'وزارة النفط';

  // Ref for scrolling up to inline form on edit
  const inlineCourseFormRef = useRef(null);

  // Primary States
  const [activeTrack, setActiveTrack] = useState(TRACK_INTERNAL);
  const [activeView, setActiveView] = useState('PLAN'); // 'PLAN' | 'COURSES' | 'TRAINERS'
  const [selectedYear, setSelectedYear] = useState(2026);
  const [loading, setLoading] = useState(true);

  // Data Collections
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [annualPlans, setAnnualPlans] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Filters (Courses & Plan)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterMonth, setFilterMonth] = useState('ALL');
  const [filterPlanScope, setFilterPlanScope] = useState('ALL'); // 'ALL' | 'PLANNED' | 'OUTSIDE'
  const [planSubTab, setPlanSubTab] = useState('PLANNED'); // 'PLANNED' | 'OUTSIDE'
  const [showInlinePlanForm, setShowInlinePlanForm] = useState(true);

  // Filters & States (Trainers)
  const [trainerSearchQuery, setTrainerSearchQuery] = useState('');
  const [trainerTypeFilter, setTrainerTypeFilter] = useState('ALL');
  const [trainerStatusFilter, setTrainerStatusFilter] = useState('ALL');
  const [showTrainerFormPanel, setShowTrainerFormPanel] = useState(false);
  const [selectedTrainerForView, setSelectedTrainerForView] = useState(null);

  // Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    description: '',
    actionText: '',
    variant: 'destructive',
    onConfirm: null
  });

  // Modals visibility
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);

  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState(null);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedCourseForEnroll, setSelectedCourseForEnroll] = useState(null);
  const [enrollEmpSearchQuery, setEnrollEmpSearchQuery] = useState('');

  const [showCertModal, setShowCertModal] = useState(false);
  const [certData, setCertData] = useState(null);

  // Helper generator for course codes
  const generateCourseCode = (year = selectedYear) => {
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `TRN-${year}-${rand}`;
  };

  // Forms State
  const [courseForm, setCourseForm] = useState({
    track: TRACK_INTERNAL,
    year: 2026,
    course_code: '',
    course_name: '',
    category: 'إدارية',
    target_audience: 'كافة الدرجات والكوادر الوظيفية',
    course_type: 'حضوري',
    location_type: 'موقعي',
    location: '',
    country: 'العراق',
    provider: '',
    trainer_id: '',
    trainer_name: '',
    start_date: '',
    end_date: '',
    duration_value: 5,
    duration_unit: 'بالأيام',
    days: 5,
    hours: 30,
    is_outside_plan: false,
    outside_plan_reason: '',
    order_number: '',
    description: '',
    status: 'غير منفذة'
  });

  // Saved Custom Specialties state (persisted in localStorage)
  const [customSavedSpecialties, setCustomSavedSpecialties] = useState(() => {
    try {
      const saved = localStorage.getItem('hr_saved_specialties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [deletedSpecialties, setDeletedSpecialties] = useState(() => {
    try {
      const saved = localStorage.getItem('hr_deleted_specialties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');

  // Extract all unique trainer specializations added when creating trainer accounts
  const availableTrainerSpecializations = useMemo(() => {
    const specs = new Set();
    trainers.forEach(t => {
      if (t.specialization && t.specialization.trim()) specs.add(t.specialization.trim());
      if (t.specialty_details && t.specialty_details.trim()) specs.add(t.specialty_details.trim());
      const cats = parseCourseCategories(t.course_categories);
      cats.forEach(c => {
        if (c && !['إدارية', 'حاسوب', 'HSE', 'اختصاص'].includes(c)) {
          specs.add(c);
        }
      });
    });
    return Array.from(specs);
  }, [trainers]);

  // Trainer search state for course creation form
  const [courseTrainerSearch, setCourseTrainerSearch] = useState('');
  const [showCourseTrainerDropdown, setShowCourseTrainerDropdown] = useState(false);

  const filteredTrainersForCourseForm = useMemo(() => {
    if (!courseTrainerSearch.trim()) return trainers;
    const q = courseTrainerSearch.toLowerCase();
    return trainers.filter(t =>
      (t.full_name || '').toLowerCase().includes(q) ||
      (t.specialization || '').toLowerCase().includes(q) ||
      (t.phone || '').toLowerCase().includes(q) ||
      (t.trainer_type || '').toLowerCase().includes(q)
    );
  }, [trainers, courseTrainerSearch]);

  const handleToggleGrade = (grade) => {
    const currentGrades = (courseForm.target_audience || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    let updated;
    if (currentGrades.includes(grade)) {
      updated = currentGrades.filter(g => g !== grade);
    } else {
      updated = [...currentGrades, grade];
    }
    setCourseForm(p => ({ ...p, target_audience: updated.join(', ') }));
  };

  const handleSelectAllGrades = () => {
    const currentGrades = (courseForm.target_audience || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (currentGrades.length === TARGET_JOB_GRADES_FROM_1.length) {
      setCourseForm(p => ({ ...p, target_audience: '' }));
    } else {
      setCourseForm(p => ({ ...p, target_audience: TARGET_JOB_GRADES_FROM_1.join(', ') }));
    }
  };

  // Helper to calculate training days and hours automatically based on rules:
  // - 1 training week = 5 training days
  // - 1 training month = 20 training days
  // - 5 training days = 20 hours (i.e. 4 hours per training day)
  const calcTrainingAutoValues = (val, unit) => {
    const num = Math.max(1, parseInt(val) || 1);
    let days = num;
    if (unit === 'بالأسابيع' || unit === 'أسابيع') {
      days = num * 5;
    } else if (unit === 'بالأشهر' || unit === 'أشهر') {
      days = num * 20;
    }
    const hours = days * 4;
    return { days, hours };
  };

  const handleDurationValueChange = (val, currentUnit) => {
    const unit = currentUnit || courseForm.duration_unit || 'بالأيام';
    const num = parseInt(val) || 1;
    const { days, hours } = calcTrainingAutoValues(num, unit);
    setCourseForm(p => ({
      ...p,
      duration_value: num,
      duration_unit: unit,
      days,
      hours
    }));
  };

  const handleDurationUnitChange = (unit, currentVal) => {
    const num = parseInt(currentVal ?? courseForm.duration_value) || 1;
    const { days, hours } = calcTrainingAutoValues(num, unit);
    setCourseForm(p => ({
      ...p,
      duration_value: num,
      duration_unit: unit,
      days,
      hours
    }));
  };

  const getTrainerCourseCountInYear = (trainerId, trainerName, targetYear = selectedYear) => {
    const yr = parseInt(targetYear) || parseInt(selectedYear);
    return courses.filter(c => {
      if (c.status === 'ملغى') return false;
      const cYr = getCourseYear(c);
      if (cYr !== yr) return false;
      if (trainerId && String(c.trainer_id) === String(trainerId)) return true;
      if (trainerName && c.trainer_name && c.trainer_name.trim() === trainerName.trim()) return true;
      return false;
    }).length;
  };

  const clearCourseForm = (targetYear = selectedYear) => {
    setEditingCourse(null);
    setCourseTrainerSearch('');
    setCourseForm({
      track: activeTrack,
      year: targetYear,
      course_code: '',
      course_name: '',
      category: 'إدارية',
      specialty_details: '',
      target_audience: '',
      course_type: 'حضوري',
      location_type: 'موقعي',
      location: '',
      country: activeTrack === TRACK_EXTERNAL ? 'الإمارات' : 'العراق',
      provider: activeTrack === TRACK_SUMMER ? 'جامعة بغداد' : '',
      trainer_id: '',
      trainer_name: '',
      start_date: '',
      end_date: '',
      duration_value: '',
      duration_unit: 'بالأيام',
      days: 0,
      hours: '',
      is_outside_plan: Boolean(planSubTab === 'OUTSIDE'),
      outside_plan_reason: '',
      order_number: '',
      description: '',
      status: 'غير منفذة'
    });
  };

  const resetCourseForm = clearCourseForm;

  // Trainer employee search state
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [showEmpDropdown, setShowEmpDropdown] = useState(false);

  const [trainerForm, setTrainerForm] = useState({
    full_name: '',
    employee_id: '',
    employee_code: '',
    trainer_code: '',
    course_categories: [], // e.g. ['إدارية', 'اختصاص']
    specialty_details: '',
    specialization: '',
    trainer_type: 'داخلي',
    organization: '',
    phone: '', // رقم الهاتف المحمول
    work_phone: '', // رقم هاتف العمل
    email: '',
    status: 'معتمد', // 'معتمد' | 'قيد الاعتماد' | 'محظور'
    rating: 'ممتاز',
    notes: ''
  });

  const [planForm, setPlanForm] = useState({
    year: 2026,
    track: TRACK_INTERNAL,
    planned_courses_count: 10,
    planned_trainees_count: 100,
    planned_budget: 0,
    notes: ''
  });

  // Score Input Sanitizer & Clamper (strictly 0 to 100, no negative numbers)
  const sanitizeScoreInput = (rawVal) => {
    if (rawVal === '' || rawVal === null || rawVal === undefined) return '';
    let str = String(rawVal).replace(/-/g, '');
    if (str === '') return '';
    const num = parseFloat(str);
    if (isNaN(num)) return '';
    if (num > 100) return '100';
    if (num < 0) return '0';
    return str;
  };

  // Grade Rating calculation helper:
  // 90 to 100: ممتاز | 80 to 89: جيد جداً | 70 to 79: جيد | 60 to 69: متوسط | 50 to 59: مقبول | < 50: ضعيف
  const computeGradeRating = (scoreInput) => {
    if (scoreInput === null || scoreInput === undefined || String(scoreInput).trim() === '') {
      return { rating: '—', result: '-' };
    }
    const num = parseFloat(scoreInput);
    if (isNaN(num)) {
      if (typeof scoreInput === 'string' && scoreInput.trim().length > 0) {
        return { rating: scoreInput.trim(), result: 'ناجح' };
      }
      return { rating: '—', result: '-' };
    }
    if (num >= 90 && num <= 100) return { rating: 'ممتاز', result: 'ناجح' };
    if (num >= 80 && num < 90) return { rating: 'جيد جداً', result: 'ناجح' };
    if (num >= 70 && num < 80) return { rating: 'جيد', result: 'ناجح' };
    if (num >= 60 && num < 70) return { rating: 'متوسط', result: 'ناجح' };
    if (num >= 50 && num < 60) return { rating: 'مقبول', result: 'ناجح' };
    if (num < 50 && num >= 0) return { rating: 'ضعيف', result: 'راسب' };
    return { rating: '—', result: '-' };
  };

  // Helper to compare Employee Job Grade with Course Target Audience / Target Grades
  const checkEmployeeCourseGradeMatch = (emp, course) => {
    if (!emp || !course) return { isMatch: true, empGradeLabel: 'غير محددة', targetLabel: '' };

    const targetAudience = (course.target_audience || course.target_grades || '').trim();

    // If no specific target audience or explicitly set to all/general grades
    if (
      !targetAudience ||
      targetAudience.includes('كافة') ||
      targetAudience.includes('جميع') ||
      targetAudience.includes('الكل') ||
      targetAudience.includes('عامة') ||
      targetAudience.includes('الجميع') ||
      targetAudience === 'كافة الدرجات والكوادر الوظيفية'
    ) {
      return { isMatch: true, empGradeLabel: emp.grade ? `الدرجة ${emp.grade}` : 'غير محددة', targetLabel: targetAudience || 'كافة الدرجات' };
    }

    // Parse employee grade
    let empGradeNum = null;
    if (emp.grade !== undefined && emp.grade !== null && String(emp.grade).trim() !== '') {
      const rawVal = String(emp.grade).trim();
      const num = parseInt(rawVal.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > 0) {
        empGradeNum = num;
      }
    }

    const empGradeLabel = empGradeNum ? `الدرجة ${empGradeNum}` : (emp.grade ? `الدرجة ${emp.grade}` : 'غير محددة');

    if (empGradeNum === null) {
      return {
        isMatch: false,
        reason: 'الدرجة الوظيفية للموظف غير محددة في سجله الوظيفي',
        empGradeLabel: 'غير محددة',
        targetLabel: targetAudience
      };
    }

    // Helper parser for ordinal words or numbers
    const parseGradeWordOrNum = (str) => {
      if (!str) return null;
      const numMatch = str.match(/\d+/);
      if (numMatch) return parseInt(numMatch[0], 10);
      const s = str.trim();
      if (s.includes('أولى') || s.includes('اولى')) return 1;
      if (s.includes('ثانية') || s.includes('ثانيه')) return 2;
      if (s.includes('ثالثة') || s.includes('ثالثه')) return 3;
      if (s.includes('رابعة') || s.includes('رابعه')) return 4;
      if (s.includes('خامسة') || s.includes('خامسه')) return 5;
      if (s.includes('سادسة') || s.includes('سادسه')) return 6;
      if (s.includes('سابعة') || s.includes('سابعه')) return 7;
      if (s.includes('ثامنة') || s.includes('ثامنه')) return 8;
      if (s.includes('تاسعة') || s.includes('تاسعه')) return 9;
      if (s.includes('عاشرة') || s.includes('عاشره')) return 10;
      return null;
    };

    // Check for range patterns: e.g. "الدرجة الأولى إلى الدرجة الرابعة" or "1 - 5" or "من 1 الى 4"
    const rangePattern = /(?:الدرجة\s*)?([0-9]|أولى|اولى|ثانية|ثانيه|ثالثة|ثالثه|رابعة|رابعه|خامسة|خامسه|سادسة|سادسه|سابعة|سابعه|ثامنة|ثامنه|تاسعة|تاسعه|عاشرة|عاشره)\s*(?:إلى|الى|-|حتى|ولغاية)\s*(?:الدرجة\s*)?([0-9]|أولى|اولى|ثانية|ثانيه|ثالثة|ثالثه|رابعة|رابعه|خامسة|خامسه|سادسة|سادسه|سابعة|سابعه|ثامنة|ثامنه|تاسعة|تاسعه|عاشرة|عاشره)/i;
    const rangeMatch = targetAudience.match(rangePattern);

    if (rangeMatch) {
      const minG = parseGradeWordOrNum(rangeMatch[1]);
      const maxG = parseGradeWordOrNum(rangeMatch[2]);
      if (minG !== null && maxG !== null) {
        const lower = Math.min(minG, maxG);
        const upper = Math.max(minG, maxG);
        if (empGradeNum >= lower && empGradeNum <= upper) {
          return { isMatch: true, empGradeLabel, targetLabel: targetAudience };
        } else {
          return {
            isMatch: false,
            reason: `الدرجة الوظيفية للموظف (${empGradeLabel}) خارج النطاق المخصص للدورة (${targetAudience})`,
            empGradeLabel,
            targetLabel: targetAudience
          };
        }
      }
    }

    // Check discrete list of numbers or words e.g. "الدرجة الأولى، الدرجة الثانية" or "1, 2, 3"
    const foundGrades = [];
    const tokens = targetAudience.split(/[،,و\s]+/);
    tokens.forEach(t => {
      const g = parseGradeWordOrNum(t);
      if (g !== null && !foundGrades.includes(g)) {
        foundGrades.push(g);
      }
    });

    if (foundGrades.length > 0) {
      if (foundGrades.includes(empGradeNum)) {
        return { isMatch: true, empGradeLabel, targetLabel: targetAudience };
      } else {
        return {
          isMatch: false,
          reason: `الدرجة الوظيفية للموظف (${empGradeLabel}) لا تطابق الدرجات المحددة للدورة (${targetAudience})`,
          empGradeLabel,
          targetLabel: targetAudience
        };
      }
    }

    // Fallback substring search
    if (targetAudience.includes(String(empGradeNum))) {
      return { isMatch: true, empGradeLabel, targetLabel: targetAudience };
    }

    return {
      isMatch: false,
      reason: `الدرجة الوظيفية للموظف (${empGradeLabel}) قد لا تطابق الدرجات المحددة للدورة (${targetAudience})`,
      empGradeLabel,
      targetLabel: targetAudience
    };
  };

  const [enrollType, setEnrollType] = useState('INTERNAL'); // INTERNAL or EXTERNAL
  const [enrollForm, setEnrollForm] = useState({
    training_id: '',
    employee_id: '',
    is_external_participant: false,
    external_participant_name: '',
    external_employee_number: '',
    external_participant_entity: '',
    external_participant_phone: '',
    result: 'قيد التقييم',
    score: '',
    grade: '',
    certificate_number: '',
    notes: ''
  });

  // Batch Grade Entry Modal State
  const [showBatchGradeModal, setShowBatchGradeModal] = useState(false);
  const [batchGradeData, setBatchGradeData] = useState({});

  // Single Grade Entry Modal State
  const [singleGradeTarget, setSingleGradeTarget] = useState(null);
  const [singleGradeScore, setSingleGradeScore] = useState('');

  // Batch Certificate Printing Modal State
  const [showBatchCertModal, setShowBatchCertModal] = useState(false);
  const [batchCertificatesList, setBatchCertificatesList] = useState([]);

  // Certificate Type Selection State ('PARTICIPATION' | 'COMPLETION')
  const [showCertTypeModal, setShowCertTypeModal] = useState(false);
  const [certSelectTarget, setCertSelectTarget] = useState(null); // { mode: 'SINGLE' | 'BATCH', course, enrollment }
  const [batchCertType, setBatchCertType] = useState('PARTICIPATION');

  // Excel Batch Trainee Import Modal State
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [excelImportResult, setExcelImportResult] = useState({
    fileName: '',
    validRows: [],
    invalidRows: [],
    totalCount: 0
  });
  const [isMigratingExcel, setIsMigratingExcel] = useState(false);
  const [excelTab, setExcelTab] = useState('VALID'); // 'VALID' | 'INVALID'

  // Load Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [trList, enList, trnrs, plans, emps] = await Promise.all([
        apiClient.entities.Training.list('-start_date', 500),
        apiClient.entities.TrainingEnrollment.list(),
        apiClient.entities.Trainer.list(),
        apiClient.entities.AnnualPlan.list(),
        apiClient.entities.Employee.list()
      ]);

      setCourses(trList || []);
      setEnrollments(enList || []);
      setTrainers(trnrs || []);
      setAnnualPlans(plans || []);
      setEmployees(emps || []);
    } catch (err) {
      console.error('Error loading training data:', err);
      toast({ title: 'خطأ في تحميل بيانات التدريب', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Quick lookup maps
  const empMap = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);
  const trainerMap = useMemo(() => Object.fromEntries(trainers.map(t => [t.id, t])), [trainers]);

  // Saved specialties aggregated from database trainers + localStorage (without hardcoded defaults)
  const allSavedSpecialties = useMemo(() => {
    const dbSpecialties = [];
    trainers.forEach(tr => {
      if (tr.specialty_details && typeof tr.specialty_details === 'string') {
        tr.specialty_details.split(/[،,]/).map(s => s.trim()).forEach(s => {
          if (s) dbSpecialties.push(s);
        });
      }
      if (tr.specialization && typeof tr.specialization === 'string' && tr.specialization.trim()) {
        dbSpecialties.push(tr.specialization.trim());
      }
    });

    const combined = Array.from(new Set([...customSavedSpecialties, ...dbSpecialties])).filter(Boolean);
    return combined.filter(s => !deletedSpecialties.includes(s));
  }, [trainers, customSavedSpecialties, deletedSpecialties]);

  const handleSelectSpecialtyChip = (spec) => {
    setTrainerForm(prev => {
      const currentText = (prev.specialty_details || '').trim();
      if (!currentText) {
        return { ...prev, specialty_details: spec };
      }
      const currentList = currentText.split(/[،,]/).map(s => s.trim()).filter(Boolean);
      if (currentList.includes(spec)) {
        const newList = currentList.filter(s => s !== spec);
        return { ...prev, specialty_details: newList.join('، ') };
      } else {
        return { ...prev, specialty_details: `${currentText}، ${spec}` };
      }
    });
  };

  const handleAddManualSpecialty = () => {
    const val = newSpecialtyInput.trim();
    if (!val) return;
    const updatedCustom = Array.from(new Set([...customSavedSpecialties, val]));
    setCustomSavedSpecialties(updatedCustom);
    const updatedDeleted = deletedSpecialties.filter(s => s !== val);
    setDeletedSpecialties(updatedDeleted);
    try {
      localStorage.setItem('hr_saved_specialties', JSON.stringify(updatedCustom));
      localStorage.setItem('hr_deleted_specialties', JSON.stringify(updatedDeleted));
    } catch (err) {
      console.error('Error saving specialty:', err);
    }
    setNewSpecialtyInput('');
  };

  const handleRemoveSavedSpecialty = (e, spec) => {
    e.stopPropagation();
    const updatedCustom = customSavedSpecialties.filter(s => s !== spec);
    setCustomSavedSpecialties(updatedCustom);
    const updatedDeleted = Array.from(new Set([...deletedSpecialties, spec]));
    setDeletedSpecialties(updatedDeleted);
    try {
      localStorage.setItem('hr_saved_specialties', JSON.stringify(updatedCustom));
      localStorage.setItem('hr_deleted_specialties', JSON.stringify(updatedDeleted));
    } catch (err) {
      console.error('Error updating saved specialties:', err);
    }
  };

  // Helper to extract course year reliably
  const getCourseYear = (c) => {
    if (c.year && !isNaN(parseInt(c.year))) return parseInt(c.year);
    if (c.start_date) {
      const yr = parseInt(c.start_date.split('-')[0]);
      if (!isNaN(yr)) return yr;
    }
    return selectedYear;
  };

  // Dynamic list of training years (without artificial limits)
  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const set = new Set([
      currentYr + 3,
      currentYr + 2,
      currentYr + 1,
      currentYr,
      currentYr - 1,
      currentYr - 2,
      currentYr - 3,
      parseInt(selectedYear)
    ]);

    courses.forEach(c => {
      const yr = c.year || (c.start_date ? parseInt(c.start_date.split('-')[0]) : null);
      if (yr && !isNaN(yr)) set.add(parseInt(yr));
    });

    annualPlans.forEach(p => {
      if (p.year && !isNaN(p.year)) set.add(parseInt(p.year));
    });

    return Array.from(set).filter(Boolean).sort((a, b) => b - a);
  }, [courses, annualPlans, selectedYear]);

  // Current track & year plan
  const currentPlan = useMemo(() => {
    return annualPlans.find(p => p.year === parseInt(selectedYear) && p.track === activeTrack) || {
      year: selectedYear,
      track: activeTrack,
      planned_courses_count: 0,
      planned_trainees_count: 0,
      planned_budget: 0
    };
  }, [annualPlans, selectedYear, activeTrack]);

  // Location Formatter
  const formatLocation = (course) => {
    if (!course) return 'منصة إلكترونية';
    const locType = course.location_type || course.locationType || '';
    const cType = course.course_type || course.courseType || '';
    const loc = (course.location || '').trim();

    if (
      cType === 'إلكتروني' ||
      cType === 'الكتروني' ||
      locType === 'إلكتروني' ||
      locType === 'الكتروني' ||
      loc === 'إلكتروني' ||
      loc === 'الكتروني' ||
      loc === 'أونلاين' ||
      loc === 'منفذة إلكترونياً' ||
      loc === 'منصة إلكترونية'
    ) {
      return 'منصة إلكترونية';
    }

    if (loc) {
      if (loc === 'موقع الشركة' || loc === 'موقعي' || loc === 'موقع الشركة / موقعي') return 'مواقع الشركة';
      if (loc === 'منفذة إلكترونياً') return 'منصة إلكترونية';
      return loc;
    }

    if (locType === 'موقعي') return 'مواقع الشركة';
    if (locType === 'خارجي') return 'موقع خارجي';
    if (locType === 'دولي') return course.country ? `دولي (${course.country})` : 'موقع دولي';

    return 'منصة إلكترونية';
  };

  // Quick Status Update for Course Execution
  const handleUpdateStatus = async (course, newStatus) => {
    try {
      await apiClient.entities.Training.update(course.id, { status: newStatus });
      toast({
        title: newStatus === 'منفذة'
          ? 'تم تحديث حالة الدورة إلى (منفذة)'
          : newStatus === 'ملغاة'
          ? 'تم إلغاء الدورة التدريبية'
          : 'تم تغيير حالة الدورة'
      });
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, status: newStatus } : c));
    } catch (err) {
      console.error(err);
      toast({ title: 'فشل تحديث حالة الدورة', variant: 'destructive' });
    }
  };

  // Track & Year filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchTrack = (c.track || TRACK_INTERNAL) === activeTrack;
      const matchYear = getCourseYear(c) === parseInt(selectedYear);
      const matchCat = filterCategory === 'ALL' || c.category === filterCategory;
      const matchType = filterType === 'ALL' || c.course_type === filterType;
      const matchLoc = filterLocation === 'ALL' || c.location_type === filterLocation;
      
      const st = c.status || 'غير منفذة';
      const matchStatus = filterStatus === 'ALL' || (() => {
        if (filterStatus === 'غير منفذة') {
          return st === 'غير منفذة' || st === 'مخطط';
        }
        if (filterStatus === 'منفذة') {
          return st === 'منفذة' || st === 'جاري' || st === 'منتهي';
        }
        if (filterStatus === 'ملغاة') {
          return st === 'ملغاة' || st === 'ملغى';
        }
        return st === filterStatus;
      })();

      const isOutside = Boolean(c.is_outside_plan || c.isOutsidePlan);
      const matchPlanScope = filterPlanScope === 'ALL' ||
        (filterPlanScope === 'PLANNED' && !isOutside) ||
        (filterPlanScope === 'OUTSIDE' && isOutside);
      const matchMonth = filterMonth === 'ALL' || (() => {
        const targetM = parseInt(filterMonth, 10);
        let sM = c.start_date ? parseInt(c.start_date.split('-')[1], 10) : null;
        let eM = c.end_date ? parseInt(c.end_date.split('-')[1], 10) : null;
        if (!eM) eM = sM;
        if (!sM && eM) sM = eM;
        if (!sM || isNaN(sM)) return false;
        if (sM <= eM) return targetM >= sM && targetM <= eM;
        return targetM >= sM || targetM <= eM;
      })();
      const matchQuery = !searchQuery ||
        (c.course_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.course_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.provider || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.trainer_name || '').toLowerCase().includes(searchQuery.toLowerCase());

      return matchTrack && matchYear && matchCat && matchType && matchLoc && matchStatus && matchPlanScope && matchMonth && matchQuery;
    });
  }, [courses, activeTrack, selectedYear, filterCategory, filterType, filterLocation, filterStatus, filterPlanScope, filterMonth, searchQuery]);

  // Employee Search Results for Enroll Modal
  const filteredEnrollEmployees = useMemo(() => {
    if (!enrollEmpSearchQuery.trim()) return employees;
    const q = enrollEmpSearchQuery.trim().toLowerCase();
    return employees.filter(emp => {
      const name = (emp.full_name || emp.fullName || '').toLowerCase();
      const companyNum = (emp.company_number || emp.companyNumber || emp.file_number || '').toString().toLowerCase();
      const empNum = (emp.employee_number || emp.employeeNumber || '').toString().toLowerCase();
      const empId = (emp.id || '').toString().toLowerCase();
      return name.includes(q) || companyNum.includes(q) || empNum.includes(q) || empId.includes(q);
    });
  }, [employees, enrollEmpSearchQuery]);

  // Employee Search Results for Trainer Form
  const searchedEmployees = useMemo(() => {
    if (!empSearchQuery.trim()) return [];
    const q = empSearchQuery.trim().toLowerCase();
    return employees.filter(emp => {
      const name = (emp.full_name || emp.fullName || '').toLowerCase();
      const companyNum = (emp.company_number || emp.companyNumber || '').toString().toLowerCase();
      const empNum = (emp.employee_number || emp.employeeNumber || '').toString().toLowerCase();
      const empId = (emp.id || '').toString().toLowerCase();
      return name.includes(q) || companyNum.includes(q) || empNum.includes(q) || empId.includes(q);
    }).slice(0, 8);
  }, [employees, empSearchQuery]);

  // Filtered Trainers
  const filteredTrainers = useMemo(() => {
    return trainers.filter(tr => {
      const q = trainerSearchQuery.trim().toLowerCase();
      const catsText = Array.isArray(tr.course_categories)
        ? tr.course_categories.join(' ')
        : (tr.course_categories || '');

      const matchQuery = !q ||
        (tr.full_name && tr.full_name.toLowerCase().includes(q)) ||
        (tr.employee_code && tr.employee_code.toLowerCase().includes(q)) ||
        (tr.trainer_code && tr.trainer_code.toLowerCase().includes(q)) ||
        (tr.specialization && tr.specialization.toLowerCase().includes(q)) ||
        (tr.specialty_details && tr.specialty_details.toLowerCase().includes(q)) ||
        (tr.organization && tr.organization.toLowerCase().includes(q)) ||
        (tr.phone && tr.phone.toLowerCase().includes(q)) ||
        (tr.work_phone && tr.work_phone.toLowerCase().includes(q)) ||
        (tr.email && tr.email.toLowerCase().includes(q)) ||
        (tr.notes && tr.notes.toLowerCase().includes(q)) ||
        catsText.toLowerCase().includes(q);

      const matchType = trainerTypeFilter === 'ALL' || tr.trainer_type === trainerTypeFilter;
      const matchStatus = trainerStatusFilter === 'ALL' ||
        tr.status === trainerStatusFilter ||
        (trainerStatusFilter === 'محظور' && tr.status === 'مقيد ومحظور');

      return matchQuery && matchType && matchStatus;
    });
  }, [trainers, trainerSearchQuery, trainerTypeFilter, trainerStatusFilter]);

  // Metrics (Annual Plan vs Actual Execution)
  const yearCourses = useMemo(() => {
    return courses.filter(c => (c.track || TRACK_INTERNAL) === activeTrack && getCourseYear(c) === parseInt(selectedYear));
  }, [courses, activeTrack, selectedYear]);

  const yearPlannedCourses = useMemo(() => {
    return yearCourses.filter(c => !Boolean(c.is_outside_plan || c.isOutsidePlan));
  }, [yearCourses]);

  const yearOutsidePlanCourses = useMemo(() => {
    return yearCourses.filter(c => Boolean(c.is_outside_plan || c.isOutsidePlan));
  }, [yearCourses]);

  const yearPlannedExecuted = useMemo(() => {
    return yearPlannedCourses.filter(c => c.status === 'منتهي');
  }, [yearPlannedCourses]);

  const yearPlannedOngoing = useMemo(() => {
    return yearPlannedCourses.filter(c => c.status === 'جاري');
  }, [yearPlannedCourses]);

  const yearExecutionRate = useMemo(() => {
    if (yearPlannedCourses.length === 0) return 0;
    return Math.round((yearPlannedExecuted.length / yearPlannedCourses.length) * 100);
  }, [yearPlannedCourses, yearPlannedExecuted]);

  const planExecutionKPI = useMemo(() => {
    if (yearPlannedCourses.length === 0) {
      if (yearOutsidePlanCourses.length > 0) {
        return {
          label: `تم تنفيذ (${yearOutsidePlanCourses.length}) دورة إضافية خارج الخطة (بدون خطة سابقة)`,
          status: 'extra',
          color: 'bg-purple-100 text-purple-800 border-purple-200'
        };
      }
      return {
        label: 'لا توجد خطة تدريبية مثبتة لهذا العام حتى الآن',
        status: 'none',
        color: 'bg-slate-100 text-slate-600 border-slate-200'
      };
    }

    const isPlanCompleted = yearPlannedExecuted.length === yearPlannedCourses.length;
    const hasExtra = yearOutsidePlanCourses.length > 0;

    if (isPlanCompleted && hasExtra) {
      return {
        label: `تم تنفيذ الخطة بالكامل بنسبة 100% (+ إنجاز ${yearOutsidePlanCourses.length} دورات إضافية خارج الخطة)`,
        status: 'overachieved',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300'
      };
    } else if (isPlanCompleted) {
      return {
        label: 'تم تنفيذ كافة دورات الخطة السنوية بالكامل (100%)',
        status: 'completed',
        color: 'bg-emerald-100 text-emerald-800 border-emerald-300'
      };
    } else if (yearPlannedExecuted.length + yearPlannedOngoing.length > 0) {
      return {
        label: `الخطة قيد التنفيذ (تم إنجاز ${yearPlannedExecuted.length} وجاري تنفيذ ${yearPlannedOngoing.length} من أصل ${yearPlannedCourses.length} دورات مخطط لها)`,
        status: 'in_progress',
        color: 'bg-blue-100 text-blue-800 border-blue-300'
      };
    } else {
      return {
        label: `لم يتم البدء بتنفيذ دورات الخطة التدريبية لعام ${selectedYear} بعد`,
        status: 'pending',
        color: 'bg-amber-100 text-amber-800 border-amber-300'
      };
    }
  }, [yearPlannedCourses, yearOutsidePlanCourses, yearPlannedExecuted, yearPlannedOngoing, selectedYear]);

  const actualCoursesCount = useMemo(() => {
    return yearCourses.filter(c => c.status !== 'ملغى').length;
  }, [yearCourses]);

  const actualTraineesCount = useMemo(() => {
    const trackCourseIds = new Set(yearCourses.filter(c => c.status !== 'ملغى').map(c => c.id));
    return enrollments.filter(e => trackCourseIds.has(e.training_id)).length;
  }, [yearCourses, enrollments]);

  const actualPassedTrainees = useMemo(() => {
    const trackCourseIds = new Set(yearCourses.map(c => c.id));
    return enrollments.filter(e => trackCourseIds.has(e.training_id) && (e.result === 'اجتاز' || e.result === 'مشارك')).length;
  }, [yearCourses, enrollments]);

  // Open New Course Form: Resets form and navigates to inline entry form
  const openNewCourseModal = () => {
    setEditingCourse(null);
    clearCourseForm();
    if (activeView !== 'PLAN') {
      setActiveView('PLAN');
    }
    setTimeout(() => {
      inlineCourseFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  // Edit Course: Populates inline entry form and scrolls up to input fields
  const handleEditCourse = (course) => {
    setEditingCourse(course);
    setCourseTrainerSearch(course.trainer_name || '');
    setShowCourseTrainerDropdown(false);

    if (activeView !== 'PLAN') {
      setActiveView('PLAN');
    }

    if (course.is_outside_plan || course.isOutsidePlan) {
      setPlanSubTab('OUTSIDE');
    } else {
      setPlanSubTab('PLANNED');
    }

    setCourseForm({
      track: course.track || activeTrack,
      year: course.year || selectedYear,
      course_code: course.course_code || course.courseCode || generateCourseCode(course.year || selectedYear),
      course_name: course.course_name || '',
      category: course.category || 'إدارية',
      specialty_details: course.specialty_details || course.specialtyDetails || '',
      target_audience: course.target_audience || course.targetAudience || 'كافة الدرجات والكوادر الوظيفية',
      course_type: course.course_type || 'حضوري',
      location_type: course.location_type || 'موقعي',
      location: course.location || '',
      country: course.country || (activeTrack === TRACK_EXTERNAL ? 'الإمارات' : 'العراق'),
      provider: course.provider || '',
      trainer_id: course.trainer_id ? String(course.trainer_id) : '',
      trainer_name: course.trainer_name || '',
      start_date: course.start_date || '',
      end_date: course.end_date || '',
      duration_value: course.duration_value ?? course.durationValue ?? course.days ?? 1,
      duration_unit: course.duration_unit || course.durationUnit || 'بالأيام',
      days: course.days || 1,
      hours: course.hours || 0,
      is_outside_plan: Boolean(course.is_outside_plan ?? course.isOutsidePlan ?? false),
      outside_plan_reason: course.outside_plan_reason || course.outsidePlanReason || '',
      order_number: course.order_number || '',
      description: course.description || '',
      status: course.status || 'غير منفذة'
    });

    setTimeout(() => {
      inlineCourseFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleSaveCourse = async () => {
    if (!courseForm.course_name.trim()) {
      toast({ title: 'يرجى إدخال اسم الدورة / البرنامج التدريبي', variant: 'destructive' });
      return;
    }

    if (courseForm.is_outside_plan && !courseForm.outside_plan_reason.trim()) {
      toast({ title: 'يرجى كتابة سبب إنشاء الدورة التدريبية خارج الخطة السنوية', variant: 'destructive' });
      return;
    }

    try {
      let tName = courseForm.trainer_name;
      if (courseForm.trainer_id && trainerMap[courseForm.trainer_id]) {
        tName = trainerMap[courseForm.trainer_id].full_name;
      }

      let trainerIdNum = null;
      if (courseForm.trainer_id && String(courseForm.trainer_id).trim() !== '') {
        const parsed = parseInt(courseForm.trainer_id);
        if (!isNaN(parsed)) trainerIdNum = parsed;
      }

      const durVal = parseInt(courseForm.duration_value) || parseInt(courseForm.days) || 1;
      const finalCode = (courseForm.course_code || '').trim() || generateCourseCode(courseForm.year);

      const payload = {
        ...courseForm,
        course_code: finalCode,
        trainer_id: trainerIdNum,
        trainer_name: tName,
        year: parseInt(courseForm.year) || selectedYear,
        duration_value: durVal,
        duration_unit: courseForm.duration_unit || 'بالأيام',
        days: durVal,
        hours: parseInt(courseForm.hours) || 0,
        is_outside_plan: Boolean(courseForm.is_outside_plan),
        outside_plan_reason: courseForm.is_outside_plan ? (courseForm.outside_plan_reason || '') : '',
        target_audience: courseForm.target_audience || 'كافة الدرجات والكوادر الوظيفية'
      };

      if (editingCourse) {
        await apiClient.entities.Training.update(editingCourse.id, payload);
        toast({ title: 'تم تعديل بيانات الدورة التدريبية بنجاح' });
      } else {
        await apiClient.entities.Training.create(payload);
        toast({
          title: courseForm.is_outside_plan
            ? 'تمت إضافة الدورة التدريبية خارج الخطة بنجاح'
            : 'تمت إضافة الدورة في الخطة التدريبية السنوية بنجاح'
        });
      }

      // Check trainer limit rule (> 2 courses in the year)
      const targetYear = parseInt(payload.year) || selectedYear;
      if (trainerIdNum || (tName && tName.trim())) {
        const existingCount = courses.filter(c => {
          if (getCourseYear(c) !== targetYear) return false;
          if (c.status === 'ملغى') return false;
          if (editingCourse && c.id === editingCourse.id) return false;
          if (trainerIdNum && c.trainer_id && String(c.trainer_id) === String(trainerIdNum)) return true;
          if (tName && c.trainer_name && c.trainer_name.trim() === tName.trim()) return true;
          return false;
        }).length;

        const newTotalCount = existingCount + 1;
        if (newTotalCount > 2) {
          setTimeout(() => {
            toast({
              title: '⚠️ تنبيه: إقامة أكثر من دورتين للمدرب',
              description: `المدرب (${tName || 'المحدد'}) أصبح مسجلاً لـ (${newTotalCount}) دورات تدريبية في عام ${targetYear}. وفقاً للتعليمات: يستحق أجور التدريب فقط (دون كتاب شكر أو مكافأة مالية).`,
              duration: 10000
            });
          }, 400);
        }
      }

      setEditingCourse(null);
      resetCourseForm(selectedYear);
      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'حدث خطأ أثناء حفظ الدورة التدريبية', variant: 'destructive' });
    }
  };

  const handleDeleteCourse = (id) => {
    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد حذف الدورة التدريبية',
      description: 'هل أنت متأكد من حذف هذه الدورة السنوية وجميع التسجيلات التابعة لها؟',
      actionText: 'حذف الدورة',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient.entities.Training.delete(id);
          toast({ title: 'تم حذف الدورة التدريبية بنجاح' });
          loadData();
        } catch (err) {
          toast({ title: 'تعذر حذف الدورة', variant: 'destructive' });
        }
      }
    });
  };

  const handleMoveCourse = (courseId, direction) => {
    const list = [...courses];
    const idx = list.findIndex(c => c.id === courseId);
    if (idx === -1) return;
    const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const temp = list[idx];
    list[idx] = list[targetIdx];
    list[targetIdx] = temp;
    setCourses(list);
    toast({ title: 'تم تعديل تسلسل وترتيب الدورة التدريبية بنجاح' });
  };

  // Trainer Management Handlers
  const handleSelectEmployeeForTrainer = (emp) => {
    const fName = emp.full_name || emp.fullName || '';
    const code = emp.company_number || emp.companyNumber || emp.employee_number || emp.employeeNumber || String(emp.id);
    const dept = emp.department || emp.section || 'كوادر الشركة';
    const mob = emp.phone || emp.mobile_phone || '';
    const workPh = emp.work_phone || emp.landline || '';
    const mail = emp.email || '';

    setTrainerForm(prev => ({
      ...prev,
      full_name: fName,
      employee_id: emp.id,
      employee_code: code,
      organization: dept,
      trainer_type: 'داخلي',
      phone: prev.phone || mob,
      work_phone: prev.work_phone || workPh,
      email: prev.email || mail
    }));
    setEmpSearchQuery('');
    setShowEmpDropdown(false);
    toast({ title: `تم اختيار الموظف (${fName}) - رقم الشركة (${code})` });
  };

  const toggleCourseCategory = (cat) => {
    setTrainerForm(prev => {
      const current = parseCourseCategories(prev.course_categories);
      const updated = current.includes(cat)
        ? current.filter(c => c !== cat)
        : [...current, cat];
      return { ...prev, course_categories: updated };
    });
  };

  const handleSaveTrainer = async () => {
    if (!trainerForm.full_name.trim()) {
      toast({ title: 'يرجى كتابة اسم المدرب أو اختيار موظف من الشركة', variant: 'destructive' });
      return;
    }

    if (trainerForm.status === 'معتمد' && !trainerForm.trainer_code.trim()) {
      toast({ title: 'يرجى إدخال كود المدرب لحالة الاعتماد', variant: 'destructive' });
      return;
    }

    const categoriesArray = parseCourseCategories(trainerForm.course_categories);

    if (categoriesArray.includes('اختصاص') && !trainerForm.specialty_details.trim()) {
      toast({ title: 'يرجى ذكر طبيعة الاختصاص التفصيلية', variant: 'destructive' });
      return;
    }

    const payload = {
      ...trainerForm,
      course_categories: JSON.stringify(categoriesArray)
    };

    try {
      if (trainerForm.specialty_details && trainerForm.specialty_details.trim()) {
        const newItems = trainerForm.specialty_details.split(/[،,]/).map(s => s.trim()).filter(Boolean);
        const updatedCustom = Array.from(new Set([...customSavedSpecialties, ...newItems]));
        setCustomSavedSpecialties(updatedCustom);
        try {
          localStorage.setItem('hr_saved_specialties', JSON.stringify(updatedCustom));
        } catch (e) {
          console.error('Error saving specialties:', e);
        }
      }

      if (editingTrainer) {
        await apiClient.entities.Trainer.update(editingTrainer.id, payload);
        toast({ title: 'تم تحديث بيانات المدرب بنجاح' });
      } else {
        await apiClient.entities.Trainer.create(payload);
        toast({ title: 'تمت إضافة المدرب إلى دليل الاعتماد بنجاح' });
      }
      setEditingTrainer(null);
      setShowTrainerFormPanel(false);
      setEmpSearchQuery('');
      setTrainerForm({
        full_name: '',
        employee_id: '',
        employee_code: '',
        trainer_code: '',
        course_categories: [],
        specialty_details: '',
        specialization: '',
        trainer_type: 'داخلي',
        organization: '',
        phone: '',
        work_phone: '',
        email: '',
        status: 'معتمد',
        rating: 'ممتاز',
        notes: ''
      });
      loadData();
    } catch (err) {
      toast({ title: 'تعذر حفظ بيانات المدرب', variant: 'destructive' });
    }
  };

  const handleEditTrainer = (tr) => {
    setEditingTrainer(tr);

    const catArr = parseCourseCategories(tr.course_categories || tr.courseCategories);

    setTrainerForm({
      full_name: tr.full_name || tr.fullName || '',
      employee_id: tr.employee_id || tr.employeeId || '',
      employee_code: tr.employee_code || tr.employeeCode || '',
      trainer_code: tr.trainer_code || tr.trainerCode || '',
      course_categories: catArr,
      specialty_details: tr.specialty_details || tr.specialtyDetails || '',
      specialization: tr.specialization || '',
      trainer_type: tr.trainer_type || tr.trainerType || 'داخلي',
      organization: tr.organization || '',
      phone: tr.phone || '',
      work_phone: tr.work_phone || tr.workPhone || '',
      email: tr.email || '',
      status: tr.status || 'معتمد',
      rating: tr.rating || 'ممتاز',
      notes: tr.notes || ''
    });
    setEmpSearchQuery('');
    setShowTrainerFormPanel(true);
    setActiveView('TRAINERS');
  };

  const handleToggleRestrictTrainer = (tr, e) => {
    if (e?.stopPropagation) e.stopPropagation();
    const isCurrentlyRestricted = tr.status === 'مقيد ومحظور' || tr.status === 'محظور';
    const newStatus = isCurrentlyRestricted ? 'معتمد' : 'مقيد ومحظور';
    const actionText = isCurrentlyRestricted ? 'تنشيط وإلغاء تقييد' : 'تقييد وحظر';

    setConfirmDialog({
      isOpen: true,
      title: `${actionText} حساب المدرب`,
      description: `هل أنت متأكد من ${actionText} حساب المدرب (${tr.full_name})؟`,
      actionText: actionText,
      variant: isCurrentlyRestricted ? 'default' : 'destructive',
      onConfirm: async () => {
        // Optimistic update
        setTrainers(prev => prev.map(t => t.id === tr.id ? { ...t, status: newStatus } : t));
        if (selectedTrainerForView && selectedTrainerForView.id === tr.id) {
          setSelectedTrainerForView(prev => prev ? { ...prev, status: newStatus } : null);
        }

        try {
          await apiClient.entities.Trainer.update(tr.id, {
            ...tr,
            status: newStatus
          });
          toast({
            title: isCurrentlyRestricted ? 'تم تنشيط الحساب وإلغاء التقييد' : 'تم تقييد وحظر حساب المدرب',
            description: isCurrentlyRestricted
              ? `تمت إعادة تنشيط المدرب ${tr.full_name} في قائمة المدربين المعتمدين.`
              : `تم تحويل حالة حساب المدرب ${tr.full_name} إلى مقيد ومحظور.`,
            variant: isCurrentlyRestricted ? 'default' : 'destructive'
          });
          loadData();
        } catch (err) {
          console.error('Error toggling trainer status:', err);
          toast({ title: 'تعذر تغيير حالة تقييد المدرب', variant: 'destructive' });
          loadData(); // Revert on failure
        }
      }
    });
  };

  const handleDeleteTrainer = (id, e) => {
    if (e?.stopPropagation) e.stopPropagation();

    const targetTrainer = trainers.find(t => t.id === id) || (selectedTrainerForView?.id === id ? selectedTrainerForView : null);
    const trainerName = targetTrainer ? targetTrainer.full_name : '';

    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد حذف المدرب',
      description: `هل أنت متأكد من حذف المدرب (${trainerName || 'المحدد'}) نهائياً من دليل الاعتماد؟ سيتم فك ارتباطه بكافة الدورات المسندة له.`,
      actionText: 'حذف المدرب',
      variant: 'destructive',
      onConfirm: async () => {
        // Optimistically remove from state and close modal
        setTrainers(prev => prev.filter(t => t.id !== id));
        if (selectedTrainerForView && selectedTrainerForView.id === id) {
          setSelectedTrainerForView(null);
        }

        try {
          await apiClient.entities.Trainer.delete(id);
          toast({ 
            title: 'تم حذف المدرب بنجاح',
            description: trainerName ? `تم حذف بيانات المدرب (${trainerName}) وإزالة ارتباطه بالدورات.` : 'تم حذف المدرب من النظام.'
          });
          loadData();
        } catch (err) {
          console.error('Error deleting trainer:', err);
          toast({ title: 'تعذر حذف المدرب', description: err?.message || 'حدث خطأ أثناء الاتصال بالخادم', variant: 'destructive' });
          loadData(); // Revert on failure
        }
      }
    });
  };

  // Plan Handlers
  const openPlanModal = () => {
    setPlanForm({
      year: selectedYear,
      track: activeTrack,
      planned_courses_count: currentPlan.planned_courses_count || 10,
      planned_trainees_count: currentPlan.planned_trainees_count || 100,
      planned_budget: currentPlan.planned_budget || 0,
      notes: currentPlan.notes || ''
    });
    setShowPlanModal(true);
  };

  const handleSavePlan = async () => {
    try {
      await apiClient.entities.AnnualPlan.create({
        ...planForm,
        year: parseInt(planForm.year),
        planned_courses_count: parseInt(planForm.planned_courses_count) || 0,
        planned_trainees_count: parseInt(planForm.planned_trainees_count) || 0,
        planned_budget: parseInt(planForm.planned_budget) || 0
      });
      toast({ title: 'تم حفظ أهداف الخطة السنوية بنجاح' });
      setShowPlanModal(false);
      loadData();
    } catch (err) {
      toast({ title: 'حدث خطأ أثناء حفظ الخطة', variant: 'destructive' });
    }
  };

  // Enrollment Handlers
  const openEnrollModal = (course) => {
    setSelectedCourseForEnroll(course);
    setEnrollType('INTERNAL');
    setEnrollForm({
      training_id: course.id,
      employee_id: '',
      is_external_participant: false,
      external_participant_name: '',
      external_employee_number: '',
      external_participant_entity: '',
      external_participant_phone: '',
      result: 'قيد التقييم',
      score: '',
      grade: '',
      certificate_number: `CERT-${course.id}-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: ''
    });
    setShowEnrollModal(true);
  };

  const handleSaveEnrollment = async (overrideConfirm = false) => {
    if (enrollType === 'INTERNAL' && !enrollForm.employee_id) {
      toast({ title: 'يرجى اختيار الموظف المطلوب تسجيله', variant: 'destructive' });
      return;
    }
    if (enrollType === 'EXTERNAL' && !enrollForm.external_participant_name.trim()) {
      toast({ title: 'يرجى كتابة اسم المتدرب / الطالب الخارجي', variant: 'destructive' });
      return;
    }

    // Job Grade Validation Check for Internal Employees
    if (enrollType === 'INTERNAL' && !overrideConfirm) {
      const selectedEmp = empMap[enrollForm.employee_id];
      const gradeCheck = checkEmployeeCourseGradeMatch(selectedEmp, selectedCourseForEnroll);
      if (!gradeCheck.isMatch) {
        setConfirmDialog({
          isOpen: true,
          title: 'تنبيه: عدم مطابقة الدرجة الوظيفية للدورة',
          description: `الموظف (${selectedEmp?.full_name || selectedEmp?.fullName || ''}) بدرجة وظيفية (${gradeCheck.empGradeLabel}) خارج الدرجات المحددة لهذه الدورة التدريبية (${gradeCheck.targetLabel || 'غير محددة'}). هل ترغب في الاستمرار وإضافة الموظف مع إبقاء مؤشر عدم المطابقة؟`,
          actionText: 'الاستمرار والإضافة رغم عدم المطابقة',
          variant: 'warning',
          onConfirm: () => handleSaveEnrollment(true)
        });
        return;
      }
    }

    try {
      const calc = computeGradeRating(enrollForm.score);
      const entityVal = enrollType === 'EXTERNAL'
        ? (enrollForm.external_participant_entity.trim() || 'مشارك خارجي')
        : '';

      const payload = {
        training_id: selectedCourseForEnroll.id,
        employee_id: enrollType === 'INTERNAL' ? parseInt(enrollForm.employee_id) : null,
        is_external_participant: enrollType === 'EXTERNAL',
        external_participant_name: enrollType === 'EXTERNAL' ? enrollForm.external_participant_name : '',
        external_employee_number: enrollType === 'EXTERNAL' ? enrollForm.external_employee_number : '',
        external_participant_entity: entityVal,
        external_participant_phone: enrollType === 'EXTERNAL' ? enrollForm.external_participant_phone : '',
        result: calc.result !== '-' ? calc.result : (enrollForm.result || 'قيد التقييم'),
        score: enrollForm.score || '',
        grade: calc.rating !== '—' ? calc.rating : (enrollForm.grade || ''),
        certificate_number: enrollForm.certificate_number || `CERT-${selectedCourseForEnroll.id}-${Math.floor(1000 + Math.random() * 9000)}`,
        notes: enrollForm.notes,
        enrollment_date: new Date().toISOString().split('T')[0]
      };

      await apiClient.entities.TrainingEnrollment.create(payload);
      toast({ title: 'تم تسجيل المشارك في الدورة بنجاح' });
      
      // Reset input form for adding another trainee easily
      setEnrollForm(prev => ({
        ...prev,
        employee_id: '',
        external_participant_name: '',
        external_employee_number: '',
        external_participant_entity: '',
        external_participant_phone: '',
        score: '',
        grade: '',
        certificate_number: `CERT-${selectedCourseForEnroll.id}-${Math.floor(1000 + Math.random() * 9000)}`
      }));

      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'تعذر إتمام التسجيل', variant: 'destructive' });
    }
  };

  const handleOpenSingleGrade = (en) => {
    setSingleGradeTarget(en);
    setSingleGradeScore(en.score || '');
  };

  const handleSaveSingleGrade = async () => {
    if (!singleGradeTarget) return;
    const calc = computeGradeRating(singleGradeScore);
    try {
      await apiClient.entities.TrainingEnrollment.update(singleGradeTarget.id, {
        score: singleGradeScore,
        grade: calc.rating !== '—' ? calc.rating : '',
        result: calc.result !== '-' ? calc.result : (singleGradeScore ? 'ناجح' : 'قيد التقييم')
      });
      toast({ title: 'تم حفظ النتيجة والتقدير بنجاح' });
      setSingleGradeTarget(null);
      setSingleGradeScore('');
      loadData();
    } catch (err) {
      toast({ title: 'حدث خطأ أثناء حفظ النتيجة', variant: 'destructive' });
    }
  };

  const handleOpenBatchGradeModal = () => {
    const initial = {};
    currentCourseEnrollments.forEach(en => {
      initial[en.id] = en.score || '';
    });
    setBatchGradeData(initial);
    setShowBatchGradeModal(true);
  };

  const handleSaveBatchGrades = async () => {
    try {
      const updates = currentCourseEnrollments.map(en => {
        const scoreVal = batchGradeData[en.id] ?? en.score ?? '';
        const calc = computeGradeRating(scoreVal);
        return apiClient.entities.TrainingEnrollment.update(en.id, {
          score: scoreVal,
          grade: calc.rating !== '—' ? calc.rating : '',
          result: calc.result !== '-' ? calc.result : (en.result || 'قيد التقييم')
        });
      });
      await Promise.all(updates);
      toast({ title: 'تم حفظ درجات ونتائج كافة المشاركين بنجاح' });
      setShowBatchGradeModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'تعذر حفظ درجات المشاركين', variant: 'destructive' });
    }
  };

  // Excel Batch Trainee Import Handlers (Requires only Company Number / رقم الشركة)
  const handleDownloadTraineesTemplate = () => {
    const templateRows = [
      { 'رقم الشركة': '1001' },
      { 'رقم الشركة': '1002' },
      { 'رقم الشركة': '1003' }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateRows);
    worksheet['!cols'] = [
      { wch: 25 } // رقم الشركة
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'أرقام الشركة');
    XLSX.writeFile(workbook, `قالب_رفع_أرقام_الشركة_للمتدربين.xlsx`);
    toast({ title: 'تم تنزيل نموذج أرقام الشركة بنجاح' });
  };

  const handleExcelFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!jsonRows || jsonRows.length === 0) {
          toast({ title: 'ملف الإكسل فارغ أو غير صالح', variant: 'destructive' });
          return;
        }

        // Current course enrollments for duplicate detection
        const activeCourseEnrollments = enrollments.filter(
          en => String(en.training_id) === String(selectedCourseForEnroll?.id)
        );

        const validRows = [];
        const invalidRows = [];
        const seenCodesInFile = new Set();

        jsonRows.forEach((row, index) => {
          const rowNum = index + 2;

          const findVal = (keys) => {
            for (const k of keys) {
              if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return String(row[k]).trim();
              }
            }
            return '';
          };

          const rawCode = findVal([
            'رقم الشركة',
            'الرقم الوظيفي',
            'رقم الموظف',
            'الرمز الوظيفي',
            'الرقم_الوظيفي',
            'Emp ID',
            'Employee ID',
            'code',
            'company_number',
            'job_number'
          ]) || String(Object.values(row)[0] || '').trim();

          // 1. Check if Code is Empty
          if (!rawCode) {
            invalidRows.push({
              rowNum,
              rawCode: '—',
              reason: 'رقم الشركة فارغ بالصف'
            });
            return;
          }

          const cleanedCode = rawCode.replace(/\s+/g, '');

          // 2. Check for Duplicate Code in uploaded Excel File
          if (seenCodesInFile.has(cleanedCode)) {
            invalidRows.push({
              rowNum,
              rawCode: rawCode,
              reason: `مكرر: رقم الشركة (${rawCode}) أدخل أكثر من مرة في ملف الإكسل`
            });
            return;
          }
          seenCodesInFile.add(cleanedCode);

          // 3. Match Employee in Company Employees Database
          const matchedEmp = employees.find(emp => {
            const compNum = String(emp.company_number || '').trim().replace(/\s+/g, '');
            const empNum = String(emp.employee_number || '').trim().replace(/\s+/g, '');
            const jobNum = String(emp.job_number || '').trim().replace(/\s+/g, '');
            const empCode = String(emp.employee_code || '').trim().replace(/\s+/g, '');
            const empId = String(emp.id || '').trim();

            return (
              (compNum && compNum === cleanedCode) ||
              (empNum && empNum === cleanedCode) ||
              (jobNum && jobNum === cleanedCode) ||
              (empCode && empCode === cleanedCode) ||
              (empId && empId === cleanedCode)
            );
          });

          if (!matchedEmp) {
            invalidRows.push({
              rowNum,
              rawCode: rawCode,
              reason: `مخالف: رقم الشركة (${rawCode}) غير موجود في قيد موظفي الشركة بالنظام`
            });
            return;
          }

          // 4. Check if already enrolled in this course
          const isAlreadyEnrolled = activeCourseEnrollments.some(
            en => !en.is_external_participant && String(en.employee_id) === String(matchedEmp.id)
          );

          if (isAlreadyEnrolled) {
            invalidRows.push({
              rowNum,
              rawCode: rawCode,
              rawName: matchedEmp.full_name || matchedEmp.fullName,
              reason: `مكرر: الموظف (${matchedEmp.full_name || matchedEmp.fullName}) مسجل بالفعل مسبقاً في هذه الدورة`
            });
            return;
          }

          validRows.push({
            rowNum,
            employee: matchedEmp,
            employee_id: matchedEmp.id,
            employee_code: rawCode,
            full_name: matchedEmp.full_name || matchedEmp.fullName,
            department: matchedEmp.department || 'الشركة العامة',
            grade: matchedEmp.grade || 'غير محددة',
            score: '',
            rating: '',
            result: 'قيد التقييم',
            notes: 'مستورد عبر ملف Excel (رقم الشركة)'
          });
        });

        setExcelImportResult({
          fileName: file.name,
          validRows,
          invalidRows,
          totalCount: jsonRows.length
        });
        setExcelTab(validRows.length > 0 ? 'VALID' : 'INVALID');
        setShowExcelImportModal(true);
      } catch (err) {
        console.error('Error parsing excel file:', err);
        toast({ title: 'تعذر قراءة ملف الإكسل', description: 'يرجى التثبت من صيغة الملف وتجربة ملف آخر', variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleConfirmExcelMigration = async () => {
    if (!selectedCourseForEnroll || excelImportResult.validRows.length === 0) return;

    setIsMigratingExcel(true);
    try {
      const courseId = selectedCourseForEnroll.id;

      await Promise.all(
        excelImportResult.validRows.map(item => {
          const payload = {
            training_id: courseId,
            employee_id: item.employee_id,
            is_external_participant: false,
            external_participant_name: '',
            external_employee_number: '',
            external_participant_entity: '',
            external_participant_phone: '',
            result: item.result || 'قيد التقييم',
            score: item.score || '',
            grade: item.rating || '',
            certificate_number: `CERT-${courseId}-${Math.floor(10000 + Math.random() * 90000)}`,
            notes: item.notes || 'مستورد عبر ملف Excel',
            enrollment_date: new Date().toISOString().split('T')[0]
          };
          return apiClient.entities.TrainingEnrollment.create(payload);
        })
      );

      toast({
        title: `تم بنجاح ترحيل (${excelImportResult.validRows.length}) متدرب إلى الدورة!`,
        className: 'bg-emerald-600 text-white font-bold'
      });

      setShowExcelImportModal(false);
      loadData();
    } catch (err) {
      console.error('Error migrating excel trainees:', err);
      toast({ title: 'حدث خطأ أثناء ترحيل بيانات المتدربين', variant: 'destructive' });
    } finally {
      setIsMigratingExcel(false);
    }
  };

  // Helper to construct normalized certificate object
  const createCertDataObject = (course, enrollment, certType = 'PARTICIPATION') => {
    let participantName = '';
    let participantEntity = '';
    let participantCode = '';

    if (enrollment.is_external_participant) {
      participantName = enrollment.external_participant_name || 'مشارك خارجي';
      participantEntity = enrollment.external_participant_entity || 'مشارك خارجي';
      participantCode = enrollment.external_employee_number || '—';
    } else {
      const emp = empMap[enrollment.employee_id];
      participantName = emp ? (emp.full_name || emp.fullName) : 'الموظف المتدرب';
      participantEntity = emp ? (emp.department || beneficiaryName) : beneficiaryName;
      participantCode = emp ? (emp.company_number || emp.employee_number || emp.job_number || emp.employee_code || emp.id) : '—';
    }

    const calc = computeGradeRating(enrollment.score || enrollment.grade);
    const hasValidScore = (calc.rating !== '—' && calc.rating !== '') || (enrollment.score !== null && enrollment.score !== undefined && String(enrollment.score).trim() !== '');

    return {
      courseName: course.course_name,
      courseType: course.course_type,
      location: formatLocation ? formatLocation(course) : (course.location || course.location_type || 'مركز التدريب'),
      startDate: course.start_date,
      endDate: course.end_date,
      days: course.days || 1,
      hours: course.hours || 0,
      participantName,
      participantEntity,
      participantCode,
      hasValidScore,
      score: enrollment.score || '',
      result: calc.result !== '-' ? calc.result : (enrollment.result || 'اجتاز'),
      grade: calc.rating !== '—' ? calc.rating : (enrollment.grade || enrollment.score || 'ممتاز'),
      certNo: enrollment.certificate_number || `CERT-${course.id}-${enrollment.id}`,
      issueDate: new Date().toLocaleDateString('ar-IQ'),
      certType: certType, // 'PARTICIPATION' | 'COMPLETION'
      rawEnrollment: enrollment,
      rawCourse: course
    };
  };

  // Open Certificate Selection Modal (Prompt for Single or Batch)
  const handleOpenCertTypeSelection = (mode, course, enrollment = null) => {
    if (!course) return;
    setCertSelectTarget({ mode, course, enrollment });
    setShowCertTypeModal(true);
  };

  // Choice handler from Certificate Selection Modal
  const handleSelectCertType = (type) => {
    if (!certSelectTarget) return;
    const { mode, course, enrollment } = certSelectTarget;

    if (mode === 'SINGLE') {
      const certObj = createCertDataObject(course, enrollment, type);
      if (type === 'COMPLETION' && !certObj.hasValidScore) {
        toast({
          title: '⚠️ تعذر إصدار شهادة إجتياز',
          description: 'تتطلب شهادة الإجتياز وجود درجة مئوية وتقدير للمتدرب. يرجى رصد الدرجة أولاً أو اختيار شهادة المشاركة.',
          variant: 'destructive'
        });
        return;
      }
      setCertData(certObj);
      setShowCertTypeModal(false);
      setShowCertModal(true);
    } else if (mode === 'BATCH') {
      let participants = currentCourseEnrollments;
      if (type === 'COMPLETION') {
        participants = currentCourseEnrollments.filter(en => {
          const scoreVal = en.score || en.grade || '';
          const calc = computeGradeRating(scoreVal);
          return (calc.rating !== '—' && calc.rating !== '') || (en.score && String(en.score).trim() !== '');
        });

        if (participants.length === 0) {
          toast({
            title: '⚠️ لا توجد شهادات إجتياز صالحة للطباعة',
            description: 'لم يتم رصد درجات للمشاركين حتى الآن. يرجى رصد الدرجات أولاً أو اختيار طباعة شهادات المشاركة.',
            variant: 'destructive'
          });
          return;
        }
      }

      const certs = participants.map(en => createCertDataObject(course, en, type));
      setBatchCertType(type);
      setBatchCertificatesList(certs);
      setShowCertTypeModal(false);
      setShowBatchCertModal(true);
    }
  };

  const handleOpenBatchCertificates = () => {
    handleOpenCertTypeSelection('BATCH', selectedCourseForEnroll);
  };

  const handleUpdateEnrollmentResult = async (enrollId, newResult, newScore, newGrade) => {
    try {
      await apiClient.entities.TrainingEnrollment.update(enrollId, {
        result: newResult,
        score: newScore,
        grade: newGrade
      });
      toast({ title: 'تم تحديث نتيجة المتدرب بنجاح' });
      loadData();
    } catch (err) {
      toast({ title: 'خطأ في تحديث النتيجة', variant: 'destructive' });
    }
  };

  const handleDeleteEnrollment = (enrollId) => {
    setConfirmDialog({
      isOpen: true,
      title: 'إلغاء تسجيل مشارك',
      description: 'هل تريد إلغاء تسجيل هذا المشارك من الدورة التدريبية؟',
      actionText: 'تأكيد إلغاء التسجيل',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await apiClient.entities.TrainingEnrollment.delete(enrollId);
          toast({ title: 'تم إلغاء التسجيل' });
          loadData();
        } catch (err) {
          toast({ title: 'حدث خطأ أثناء إلغاء التسجيل', variant: 'destructive' });
        }
      }
    });
  };

  // Certificate Handler
  const openCertificate = (course, enrollment, certType = 'PARTICIPATION') => {
    const certObj = createCertDataObject(course, enrollment, certType);
    setCertData(certObj);
    setShowCertModal(true);
  };

  const handlePrintCertificates = (certs, overrideCertType) => {
    const certsList = certs && certs.length > 0 ? certs : (certData ? [certData] : []);
    if (certsList.length === 0) {
      window.print();
      return;
    }

    const bName = beneficiaryName || 'شركة نفط الوسط';
    const logo = logoUrl || '';

    const certsHtml = certsList.map((cert) => {
      const type = overrideCertType || cert.certType || 'PARTICIPATION';
      const isParticipation = type === 'PARTICIPATION';

      const certMainTitle = isParticipation ? 'شهادة مشاركة' : 'شهادة إجتياز';
      const certCaption = isParticipation ? 'CERTIFICATE OF PARTICIPATION' : 'CERTIFICATE OF ACHIEVEMENT';
      const titleColor = isParticipation ? '#1B3A6B' : '#065f46';
      const titleLineBg = isParticipation ? '#f59e0b' : '#10b981';

      const p1Text = isParticipation
        ? 'تأكيداً على الحرص والسعي المستمر لتطوير القدرات والمهارات الميدانية، تُشهد هذه الإدارة بأن السيد / السيدة:'
        : 'تأكيداً على كفاءة الأداء والتطوير المستمر للمهارات، تُشهد هذه الإدارة بأن السيد / السيدة:';

      const p2Text = isParticipation
        ? `قد شارك/ت في البرنامج التدريبي الـ <strong class="highlight">(${cert.courseType || 'دورة تدريبية'})</strong> الموسوم:`
        : `قد شارك/ت بنجاح واجتاز/ت البرنامج الـ <strong class="highlight">(${cert.courseType || 'دورة تدريبية'})</strong> التدريبي الموسوم:`;

      const p3Details = isParticipation
        ? `المنعقدة في (${cert.location || 'مركز التدريب'}) للفترة من <strong>${cert.startDate || ''}</strong> إلى <strong>${cert.endDate || ''}</strong> (${cert.days || 1} أيام / ${cert.hours || 0} ساعة تدريبية).`
        : `المنعقدة في (${cert.location || 'مركز التدريب'}) للفترة من <strong>${cert.startDate || ''}</strong> إلى <strong>${cert.endDate || ''}</strong> (${cert.days || 1} أيام / ${cert.hours || 0} ساعة تدريبية)<br />وبنتيجة: <strong class="res-tag">(${cert.result || 'اجتاز'})</strong> ودرجة: <strong class="res-tag">(${cert.score || ''})</strong> وتقدير: <strong class="res-tag">(${cert.grade || 'ممتاز'})</strong>.`;

      return `
      <div class="cert-card">
        <div class="cert-border ${isParticipation ? 'cert-part-border' : 'cert-[#065f46]-border'}">
          <span class="corner top-right">❖</span>
          <span class="corner top-left">❖</span>
          <span class="corner bottom-right">❖</span>
          <span class="corner bottom-left">❖</span>

          <div class="cert-header">
            <div class="header-right">
              <div>جمهورية العراق</div>
              <div class="company-title">${bName}</div>
              <div class="dept-title">قسم التدريب والتطوير</div>
            </div>

            <div class="header-center">
              ${logo ? `<img src="${logo}" class="logo-img" alt="شعار" />` : `
                <div class="logo-circle" style="background: ${titleColor}">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                </div>
              `}
              <div class="cert-caption" style="color: ${titleColor}">${certCaption}</div>
            </div>

            <div class="header-left">
              <div>الرقم: ${cert.certNo || '—'}</div>
              <div>التاريخ: ${cert.issueDate || '—'}</div>
            </div>
          </div>

          <div class="cert-title-container">
            <h2 class="cert-main-title" style="color: ${titleColor}">${certMainTitle}</h2>
            <div class="title-line" style="background: ${titleLineBg}"></div>
          </div>

          <div class="cert-body">
            <p>${p1Text}</p>
            <div class="participant-name" style="color: ${titleColor}">${cert.participantName || ''}</div>
            <div class="participant-dept">من (${cert.participantEntity || bName}) — رقم الشركة: (${cert.participantCode || '—'})</div>

            <p style="margin-top: 10px;">${p2Text}</p>

            <div class="course-box" style="${!isParticipation ? 'background: #ecfdf5; border-color: #6ee7b7; color: #064e3b;' : 'background: #fef3c7; border-color: #fde68a; color: #78350f;'} font-weight: 800; padding: 10px 24px; border-radius: 12px; margin: 10px 0; font-size: 20px;">"${cert.courseName || ''}"</div>

            <p class="cert-details">
              ${p3Details}
            </p>
          </div>

          <div class="cert-footer">
            <div class="sig-col">
              <div class="sig-title">المحاضر</div>
            </div>
            <div class="sig-col">
              <div class="sig-title">مدير قسم التدريب</div>
            </div>
            <div class="sig-col">
              <div class="sig-title">مدير هيئة إدارة وتنمية الموارد البشرية</div>
            </div>
          </div>
        </div>
      </div>
      `;
    }).join('');

    const fullHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>شهادة مشاركة وتطوير وظيفي</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
    @page {
      size: A4 landscape;
      margin: 4mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Tajawal', Arial, sans-serif;
    }
    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #0f172a;
      direction: rtl;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .cert-card {
      width: 288mm;
      height: 198mm;
      max-width: 100%;
      max-height: 100vh;
      margin: 0 auto;
      box-sizing: border-box;
      page-break-after: always;
      page-break-inside: avoid;
      break-after: page;
      break-inside: avoid;
      padding: 2mm;
      display: flex;
      flex-direction: column;
    }
    .cert-card:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .cert-border {
      width: 100%;
      height: 100%;
      border: 6px double #1B3A6B;
      outline: 2px solid #d97706;
      outline-offset: -10px;
      border-radius: 18px;
      padding: 24px 40px;
      position: relative;
      background: linear-gradient(135deg, #fffdf2 0%, #ffffff 50%, #fffdf2 100%);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
    .corner {
      position: absolute;
      color: #1B3A6B;
      opacity: 0.3;
      font-size: 28px;
    }
    .top-right { top: 12px; right: 16px; }
    .top-left { top: 12px; left: 16px; }
    .bottom-right { bottom: 12px; right: 16px; }
    .bottom-left { bottom: 12px; left: 16px; }

    .cert-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #d97706;
      padding-bottom: 12px;
    }
    .header-right {
      text-align: right;
      font-size: 12px;
      font-weight: 700;
      color: #1e293b;
      line-height: 1.5;
    }
    .company-title {
      font-size: 15px;
      font-weight: 900;
      color: #1B3A6B;
    }
    .dept-title {
      color: #b45309;
      font-size: 12px;
      font-weight: 700;
    }
    .header-center {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .logo-img {
      width: 65px;
      height: 65px;
      object-fit: contain;
      margin-bottom: 2px;
    }
    .logo-circle {
      width: 60px;
      height: 60px;
      background: #1B3A6B;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 2px;
    }
    .cert-caption {
      font-size: 10px;
      font-weight: 900;
      color: #1B3A6B;
      letter-spacing: 2px;
    }
    .header-left {
      text-align: left;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      direction: ltr;
      line-height: 1.5;
    }

    .cert-title-container {
      margin: 10px 0 5px 0;
    }
    .cert-main-title {
      font-size: 32px;
      font-weight: 900;
      color: #1B3A6B;
      letter-spacing: 0.5px;
    }
    .title-line {
      width: 120px;
      height: 4px;
      background: #f59e0b;
      margin: 6px auto 0 auto;
      border-radius: 99px;
    }

    .cert-body {
      width: 100%;
      max-width: 95%;
      margin: 10px auto;
      font-size: 14px;
      line-height: 1.8;
      font-weight: 500;
      color: #1e293b;
    }
    .participant-name {
      font-size: 26px;
      font-weight: 900;
      color: #1B3A6B;
      padding: 6px 0;
      border-bottom: 2px dashed #cbd5e1;
      margin: 6px auto;
      display: inline-block;
      min-width: 60%;
    }
    .participant-dept {
      font-size: 12px;
      color: #475569;
      font-weight: 700;
      margin-bottom: 10px;
    }
    .highlight {
      color: #1B3A6B;
      font-weight: 800;
    }
    .course-box {
      font-size: 20px;
      font-weight: 800;
      color: #78350f;
      background: #fef3c7;
      padding: 10px 24px;
      border-radius: 12px;
      border: 1px solid #fde68a;
      margin: 10px 0;
      display: block;
      width: 100%;
    }
    .cert-details {
      font-size: 12px;
      color: #475569;
      margin-top: 8px;
    }
    .res-tag {
      color: #047857;
      font-weight: 800;
    }

    .cert-footer {
      display: flex;
      justify-content: space-between;
      margin-top: auto;
      padding-top: 15px;
      border-top: 1.5px solid #cbd5e1;
      font-size: 14px;
      font-weight: 800;
      color: #1e293b;
    }
    .sig-col {
      flex: 1;
      text-align: center;
      padding: 0 10px;
    }
    .sig-title {
      color: #0f172a;
      font-weight: 800;
      font-size: 14px;
      margin-top: 60px;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  ${certsHtml}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

    let printWin = null;
    try {
      printWin = window.open('', '_blank', 'width=900,height=950');
    } catch (err) {
      printWin = null;
    }

    if (printWin && !printWin.closed) {
      printWin.document.open();
      printWin.document.write(fullHtml);
      printWin.document.close();
      printWin.focus();
    } else {
      let iframe = document.getElementById('print-certificate-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-certificate-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);
      }
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(fullHtml);
      doc.close();
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          window.print();
        }
      }, 400);
    }
  };

  const triggerPrint = () => {
    handlePrintCertificates(certData ? [certData] : []);
  };

  // Course Enrollments for Modal
  const currentCourseEnrollments = useMemo(() => {
    if (!selectedCourseForEnroll) return [];
    return enrollments.filter(e => e.training_id === selectedCourseForEnroll.id);
  }, [enrollments, selectedCourseForEnroll]);

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Main Track Selection & Header Banner */}
      <Tabs value={activeTrack} onValueChange={setActiveTrack} className="w-full">
        {/* Header Banner with Tracks, Global Trainers Directory & Year Picker */}
        <div 
          className="rounded-2xl p-5 text-white shadow-md relative overflow-hidden text-right transition-colors" 
          style={{ background: `linear-gradient(to left, ${primaryColor}, ${primaryColor}e6, ${primaryColor}cc)` }}
          dir="rtl"
        >
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 -skew-x-12 pointer-events-none" />
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
            {/* Title & Subtitle */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-2xl text-amber-300 border border-white/20 shrink-0 shadow-xs">
                <GraduationCap size={26} />
              </div>
              <div>
                <h1 className="text-xl font-black text-white leading-tight">
                  التدريب والدورات والتطوير الوظيفي
                </h1>
                <p className="text-blue-100 text-xs mt-0.5">
                  إدارة خطط التدريب الداخلي والخارجي والصيفي وسجلات المدربين لعام {selectedYear}
                </p>
              </div>
            </div>

            {/* Header Controls: Tracks, Global Trainer Directory & Year Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-blue-200 shrink-0 hidden xl:inline">النوع:</span>
              <TabsList className="bg-white/10 p-1 rounded-xl h-auto flex flex-wrap gap-1 border border-white/15">
                <TabsTrigger
                  value={TRACK_INTERNAL}
                  className="rounded-lg px-3 py-1 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center gap-1.5"
                >
                  <Building2 size={13} />
                  التدريب الداخلي
                </TabsTrigger>
                <TabsTrigger
                  value={TRACK_EXTERNAL}
                  className="rounded-lg px-3 py-1 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center gap-1.5"
                >
                  <Globe size={13} />
                  التدريب الخارجي والإيفادات
                </TabsTrigger>
                <TabsTrigger
                  value={TRACK_SUMMER}
                  className="rounded-lg px-3 py-1 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center gap-1.5"
                >
                  <School size={13} />
                  التدريب الصيفي (الطلاب)
                </TabsTrigger>
              </TabsList>

              {/* Global Trainers Directory Button (عام ومتاح أسفل السنة التدريبية) */}
              <Button
                type="button"
                variant={activeView === 'TRAINERS' ? 'default' : 'ghost'}
                onClick={() => setActiveView('TRAINERS')}
                className={`rounded-xl font-bold text-xs gap-1.5 h-8 px-3.5 transition-all border ${
                  activeView === 'TRAINERS'
                    ? 'bg-amber-400 text-slate-900 border-amber-300 shadow-xs font-black'
                    : 'bg-white/10 text-white hover:bg-white/20 border-white/20'
                }`}
              >
                <UserCheck size={14} />
                دليل وسجلات المدربين ({trainers.length})
              </Button>

              {/* Training Year Selector */}
              <div className="flex items-center gap-1 bg-white/10 px-1.5 py-1 rounded-xl border border-white/15 text-white">
                <Calendar size={14} className="text-amber-300 shrink-0 ml-1" />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedYear(prev => prev - 1)}
                  className="h-6 w-6 rounded-md text-white hover:bg-white/20"
                  title="السنة السابقة"
                >
                  <ChevronRight size={14} />
                </Button>

                <div className="px-1.5 font-black text-sm text-white min-w-[42px] text-center select-none">
                  {selectedYear}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedYear(prev => prev + 1)}
                  className="h-6 w-6 rounded-md text-white hover:bg-white/20"
                  title="السنة التالية"
                >
                  <ChevronLeft size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Primary Options Bar for the Active Track */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-sm mt-4" dir="rtl">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={activeView === 'PLAN' ? 'default' : 'ghost'}
              onClick={() => {
                setActiveView('PLAN');
                setPlanSubTab('PLANNED');
              }}
              className={`rounded-xl font-bold text-xs gap-2 px-4 py-2 h-9 transition-all cursor-pointer ${
                activeView === 'PLAN'
                  ? 'bg-[#1B3A6B] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Target size={16} />
              الخطة التدريبية لعام {selectedYear} ({yearPlannedCourses.length} مخطط / {yearOutsidePlanCourses.length} خارج الخطة)
            </Button>

            <Button
              type="button"
              variant={activeView === 'COURSES' ? 'default' : 'ghost'}
              onClick={() => setActiveView('COURSES')}
              className={`rounded-xl font-bold text-xs gap-2 px-4 py-2 h-9 transition-all cursor-pointer ${
                activeView === 'COURSES'
                  ? 'bg-[#1B3A6B] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <GraduationCap size={16} />
              إدارة الدورات التدريبية لعام {selectedYear} ({filteredCourses.length})
            </Button>
          </div>
        </div>

        {/* VIEW 1: ANNUAL TRAINING PLAN (تبويب الخطة التدريبية السنوية) */}
        {activeView === 'PLAN' && (
          <div className="space-y-6 mt-6 text-right" dir="rtl">
            {/* Sub-tabs inside Plan View */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
              <Button
                type="button"
                variant={planSubTab === 'PLANNED' ? 'default' : 'outline'}
                onClick={() => {
                  setPlanSubTab('PLANNED');
                  setCourseForm(p => ({
                    ...p,
                    track: activeTrack,
                    year: selectedYear,
                    is_outside_plan: false,
                    outside_plan_reason: '',
                    course_code: p.course_code || generateCourseCode(selectedYear)
                  }));
                }}
                className={`rounded-xl font-bold text-xs gap-2 h-9 px-4 transition-all cursor-pointer ${
                  planSubTab === 'PLANNED'
                    ? 'bg-[#1B3A6B] text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Target size={15} />
                الخطة التدريبية لعام {selectedYear} ({yearPlannedCourses.length} دورة ضمن الخطة)
              </Button>

              <Button
                type="button"
                variant={planSubTab === 'OUTSIDE' ? 'default' : 'outline'}
                onClick={() => {
                  setPlanSubTab('OUTSIDE');
                  setCourseForm(p => ({
                    ...p,
                    track: activeTrack,
                    year: selectedYear,
                    is_outside_plan: true,
                    course_code: p.course_code || generateCourseCode(selectedYear)
                  }));
                }}
                className={`rounded-xl font-bold text-xs gap-2 h-9 px-4 transition-all cursor-pointer ${
                  planSubTab === 'OUTSIDE'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                }`}
              >
                <Sparkles size={15} />
                إضافة الدورات التدريبية خارج الخطة لعام {selectedYear} ({yearOutsidePlanCourses.length} دورة إضافية)
              </Button>
            </div>

            {/* Direct Inline Entry Form (وفق القواعد والمواصفات المحددة بدقة) */}
            <div
              ref={inlineCourseFormRef}
              className={`rounded-2xl border shadow-sm p-5 space-y-4 transition-all duration-300 ${
                editingCourse
                  ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-400/30'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-[#1B3A6B] text-sm flex items-center gap-2">
                  {editingCourse ? (
                    <>
                      <Edit size={16} className="text-amber-600 shrink-0" />
                      <span>تعديل بيانات الدورة التدريبية:</span>
                      <span className="text-amber-900 font-extrabold bg-amber-100/90 px-2.5 py-0.5 rounded-lg border border-amber-300">
                        {courseForm.course_name || editingCourse.course_name || editingCourse.courseCode}
                      </span>
                    </>
                  ) : planSubTab === 'PLANNED' ? (
                    <>
                      <Plus size={16} className="text-blue-600" />
                      إضافة دورة جديدة في الخطة التدريبية لعام {selectedYear}
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="text-amber-600" />
                      إضافة دورة جديدة خارج الخطة لعام {selectedYear}
                    </>
                  )}
                </h3>
                {editingCourse ? (
                  <span className="text-xs bg-amber-600 text-white font-bold px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5 animate-pulse">
                    <Edit size={12} />
                    وضع التعديل النشط
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">نموذج الإدخال المباشر</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                {/* 1. رمز الدورة (توليد تلقائي) */}
                <div>
                  <Label className="text-[11px] font-bold">رمز الدورة (توليد تلقائي) *</Label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      className="rounded-xl font-mono bg-slate-50 text-xs h-9"
                      value={courseForm.course_code || generateCourseCode(selectedYear)}
                      onChange={e => setCourseForm(p => ({ ...p, course_code: e.target.value }))}
                      placeholder={`TRN-${selectedYear}-101`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCourseForm(p => ({ ...p, course_code: generateCourseCode(selectedYear) }))}
                      className="h-9 px-2 text-[10px] rounded-xl shrink-0 border-slate-200"
                      title="توليد كود تلقائي جديد"
                    >
                      توليد تلقائي
                    </Button>
                  </div>
                </div>

                {/* 2. اسم الدورة التدريبية "نص" */}
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-bold">اسم الدورة التدريبية *</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white h-9"
                    placeholder="أدخل اسم الدورة التدريبية..."
                    value={courseForm.course_name}
                    onChange={e => setCourseForm(p => ({ ...p, course_name: e.target.value }))}
                  />
                </div>

                {/* 3. المدرب اسم المدرب "بحث في قائمة المدربين المضافين" */}
                <div className="relative">
                  <Label className="text-[11px] font-bold">المدرب (بحث في قائمة المدربين المضافين) *</Label>
                  <div className="relative mt-1">
                    <Input
                      className="rounded-xl bg-white h-9 pr-8 text-xs font-bold"
                      placeholder="بحث عن مدرب بالاسم أو التخصص..."
                      value={courseForm.trainer_name || courseTrainerSearch}
                      onChange={e => {
                        const val = e.target.value;
                        setCourseTrainerSearch(val);
                        setCourseForm(p => ({ ...p, trainer_name: val, trainer_id: '' }));
                        setShowCourseTrainerDropdown(true);
                      }}
                      onFocus={() => setShowCourseTrainerDropdown(true)}
                    />
                    <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>

                  {showCourseTrainerDropdown && (
                    <div className="absolute z-30 right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 text-xs">
                      <div
                        onClick={() => {
                          setCourseForm(p => ({ ...p, trainer_id: '', trainer_name: '' }));
                          setCourseTrainerSearch('');
                          setShowCourseTrainerDropdown(false);
                        }}
                        className="p-2 hover:bg-slate-50 cursor-pointer text-slate-500 font-bold text-[11px]"
                      >
                        بدون تعيين مدرب (أو إدخال يدوي)
                      </div>
                      {filteredTrainersForCourseForm.length === 0 ? (
                        <div className="p-3 text-center text-slate-400 text-[11px]">لا يوجد مدرب مطابق لنتائج البحث</div>
                      ) : (
                        filteredTrainersForCourseForm.map(tr => {
                          const trCount = getTrainerCourseCountInYear(tr.id, tr.full_name, selectedYear);
                          return (
                            <div
                              key={tr.id}
                              onClick={() => {
                                setCourseForm(p => ({ ...p, trainer_id: String(tr.id), trainer_name: tr.full_name }));
                                setCourseTrainerSearch(tr.full_name);
                                setShowCourseTrainerDropdown(false);
                              }}
                              className="p-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                            >
                              <div>
                                <div className="font-bold text-[#1B3A6B] flex items-center gap-1.5">
                                  <span>{tr.full_name}</span>
                                  {trCount > 2 ? (
                                    <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5" title="تجاوز دورتين: أجور تدريب فقط دون كتاب شكر أو مكافأة">
                                      <AlertTriangle size={10} className="text-amber-600" />
                                      أقام {trCount} دورات (أجور فقط)
                                    </span>
                                  ) : trCount === 2 ? (
                                    <span className="text-[9px] bg-blue-100 text-blue-900 border border-blue-200 px-1.5 py-0.2 rounded font-bold">
                                      أقام دورتين (النصاب)
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[10px] text-slate-500">{tr.specialization || tr.trainer_type} — {tr.status}</div>
                              </div>
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                                {tr.trainer_type}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {(() => {
                    if (!courseForm.trainer_name && !courseForm.trainer_id) return null;
                    const currentCount = getTrainerCourseCountInYear(courseForm.trainer_id, courseForm.trainer_name, selectedYear);
                    if (currentCount >= 2) {
                      return (
                        <div className="mt-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 p-2 rounded-xl flex items-start gap-1.5 leading-tight">
                          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span>تنبيه: المدرب أقام ({currentCount}) دورات لعام {selectedYear}.</span>
                            <span className="block text-[10px] text-amber-800 font-normal mt-0.5">
                              عند إضافة هذه الدورة سينفذ ({currentCount + 1}) دورات، ويصرف له أجور التدريب فقط (دون كتاب شكر أو مكافأة مالية).
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* 4. تخصص الدورة (ادارية - حاسوب - HSE - اختصاص) */}
                <div>
                  <Label className="text-[11px] font-bold">تخصص الدورة *</Label>
                  <Select
                    value={courseForm.category}
                    onValueChange={v => setCourseForm(p => ({ ...p, category: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl bg-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="إدارية">إدارية</SelectItem>
                      <SelectItem value="حاسوب">حاسوب</SelectItem>
                      <SelectItem value="HSE">HSE</SelectItem>
                      <SelectItem value="اختصاص">اختصاص</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* حقل يظهر في حال اختيار "اختصاص" (يفتح حقل تعيين الاختصاص من ضمن الاختصاصات المضافة للمدربين) */}
                {courseForm.category === 'اختصاص' && (
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-bold text-blue-900">تعيين الاختصاص المخصص (من ضمن اختصاصات المدربين المضافين) *</Label>
                    <div className="flex gap-2 mt-1">
                      <Select
                        value={courseForm.specialty_details || ''}
                        onValueChange={v => setCourseForm(p => ({ ...p, specialty_details: v }))}
                      >
                        <SelectTrigger className="rounded-xl bg-blue-50/60 border-blue-200 h-9 text-xs">
                          <SelectValue placeholder="اختر من تخصصات المدربين المسجلة..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTrainerSpecializations.length === 0 ? (
                            <SelectItem value="عام">لا توجد اختصاصات مضافة للمدربين (عام)</SelectItem>
                          ) : (
                            availableTrainerSpecializations.map(spec => (
                              <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Input
                        className="rounded-xl bg-white h-9 text-xs w-48"
                        placeholder="أو اكتب اختصاصاً جديداً..."
                        value={courseForm.specialty_details || ''}
                        onChange={e => setCourseForm(p => ({ ...p, specialty_details: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* 5. الفئة المستهدفة (عرض الدرجات الوظيفية فقط من الدرجة 1 صعوداً مع السماح بتحديد اكثر من درجة) */}
                <div className="md:col-span-4 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[11px] font-bold text-[#1B3A6B] flex items-center gap-1.5">
                      <Users size={14} />
                      الفئة المستهدفة (عرض الدرجات الوظيفية فقط من الدرجة 1 صعوداً مع السماح بتحديد أكثر من درجة) *
                    </Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSelectAllGrades}
                      className="h-6 text-[11px] font-bold text-blue-700 hover:bg-blue-100 rounded-lg"
                    >
                      {((courseForm.target_audience || '').split(',').map(s=>s.trim()).filter(Boolean)).length === TARGET_JOB_GRADES_FROM_1.length
                        ? 'إلغاء تحديد الكل'
                        : 'تحديد كافة الدرجات (من 1 إلى 10)'}
                    </Button>
                  </div>

                  {/* Grid of job grades from Grade 1 to Grade 10 */}
                  <div className="flex flex-wrap gap-1.5">
                    {TARGET_JOB_GRADES_FROM_1.map(grade => {
                      const selected = (courseForm.target_audience || '').split(',').map(s => s.trim()).includes(grade);
                      return (
                        <button
                          key={grade}
                          type="button"
                          onClick={() => handleToggleGrade(grade)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            selected
                              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {selected ? `✓ ${grade}` : `+ ${grade}`}
                        </button>
                      );
                    })}
                  </div>

                  {courseForm.target_audience && (
                    <div className="mt-2 text-[11px] font-bold text-slate-600 bg-white p-1.5 rounded-xl border border-slate-200">
                      الدرجات المحددة حالياً: <span className="text-blue-900">{courseForm.target_audience}</span>
                    </div>
                  )}
                </div>

                {/* 6. للفترة من تاريخ الى تاريخ */}
                <div className="md:col-span-2">
                  <Label className="text-[11px] font-bold">للفترة (من تاريخ إلى تاريخ) *</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-0.5">من تاريخ البدء:</span>
                      <Input
                        type="date"
                        className="rounded-xl bg-white h-9 text-xs"
                        value={courseForm.start_date}
                        onChange={e => setCourseForm(p => ({ ...p, start_date: e.target.value }))}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold block mb-0.5">إلى تاريخ الانتهاء:</span>
                      <Input
                        type="date"
                        className="rounded-xl bg-white h-9 text-xs"
                        value={courseForm.end_date}
                        onChange={e => setCourseForm(p => ({ ...p, end_date: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {/* 7. مدة الدورة (إما بالأيام أو بالأسابيع أو بالأشهر) وتكون بتحديد أحد الخيارات وإدخال الرقم */}
                <div>
                  <Label className="text-[11px] font-bold">مدة الدورة (الواحدة) *</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <Select
                      value={courseForm.duration_unit || 'بالأيام'}
                      onValueChange={v => handleDurationUnitChange(v)}
                    >
                      <SelectTrigger className="rounded-xl bg-white h-9 font-bold"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="بالأيام">بالأيام</SelectItem>
                        <SelectItem value="بالأسابيع">بالأسابيع (5 أيام/أسبوع)</SelectItem>
                        <SelectItem value="بالأشهر">بالأشهر (20 يوم/شهر)</SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      min={1}
                      className="rounded-xl bg-white h-9 text-center font-bold"
                      placeholder="الرقم"
                      value={courseForm.duration_value}
                      onChange={e => handleDurationValueChange(e.target.value)}
                    />
                  </div>
                </div>

                {/* 8. عدد الساعات التدريبية (حساب تلقائي محدد بقواعد: 5 أيام = 20 ساعة، الأسبوع = 5 أيام) */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold">عدد الساعات التدريبية *</Label>
                    <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-md border border-blue-200">
                      حساب تلقائي ✨
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    className="mt-1 rounded-xl bg-blue-50/70 border-blue-200 h-9 font-bold text-blue-950 text-center"
                    placeholder="عدد الساعات التلقائية..."
                    value={courseForm.hours}
                    onChange={e => setCourseForm(p => ({ ...p, hours: parseInt(e.target.value) || 0 }))}
                  />
                  <div className="text-[10px] text-blue-800 font-bold mt-1 bg-blue-50/50 p-1 rounded-lg border border-blue-100 text-center">
                    {courseForm.duration_unit === 'بالأسابيع' && `${courseForm.duration_value} أسبوع = ${courseForm.days} أيام تدريبية = ${courseForm.hours} ساعة`}
                    {courseForm.duration_unit === 'بالأشهر' && `${courseForm.duration_value} شهر = ${courseForm.days} يوماً تدريبياً = ${courseForm.hours} ساعة`}
                    {(courseForm.duration_unit === 'بالأيام' || !courseForm.duration_unit) && `${courseForm.duration_value} أيام تدريب = ${courseForm.hours} ساعة تدريبية`}
                  </div>
                </div>

                {/* 9. نوع الدورة التدريبية (حضوري - الكتروني) مهم وفي حال كان حضوري يظهر حقل مكان الانعقاد */}
                <div>
                  <Label className="text-[11px] font-bold">نوع الدورة التدريبية *</Label>
                  <Select
                    value={courseForm.course_type}
                    onValueChange={v => setCourseForm(p => ({ ...p, course_type: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl bg-white h-9 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="حضوري">حضوري</SelectItem>
                      <SelectItem value="إلكتروني">إلكتروني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 10. حالة التنفيذ (منفذة - غير منفذة - ملغاة) */}
                <div>
                  <Label className="text-[11px] font-bold">حالة التنفيذ *</Label>
                  <Select
                    value={courseForm.status || 'غير منفذة'}
                    onValueChange={v => setCourseForm(p => ({ ...p, status: v }))}
                  >
                    <SelectTrigger className="mt-1 rounded-xl bg-white h-9 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="غير منفذة">
                        <span className="flex items-center gap-1.5 font-bold text-sky-700">
                          <Clock size={13} /> غير منفذة
                        </span>
                      </SelectItem>
                      <SelectItem value="منفذة">
                        <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                          <CheckCircle2 size={13} /> منفذة
                        </span>
                      </SelectItem>
                      <SelectItem value="ملغاة">
                        <span className="flex items-center gap-1.5 font-bold text-rose-700">
                          <XCircle size={13} /> ملغاة
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* حقل يظهر فقط إذا كان نوع الدورة "حضوري" */}
                {courseForm.course_type === 'حضوري' && (
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-bold text-blue-900">مكان انعقاد الدورة التدريبية (نص) *</Label>
                    <Input
                      className="mt-1 rounded-xl bg-white border-blue-200 h-9 text-xs"
                      placeholder="أدخل مكان انعقاد الدورة (مثال: القاعة المركزية / مقر المعهد)..."
                      value={courseForm.location}
                      onChange={e => setCourseForm(p => ({ ...p, location: e.target.value }))}
                    />
                  </div>
                )}

                {/* Outside plan reason if tab is OUTSIDE */}
                {planSubTab === 'OUTSIDE' && (
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-bold text-amber-800">سبب إضافة الدورة خارج الخطة التدريبية السنوية *</Label>
                    <Input
                      className="mt-1 rounded-xl bg-amber-50/50 border-amber-200 h-9"
                      placeholder="استحداث متطلبات جديدة، توجيه وزاري، ضرورة تنظيمية..."
                      value={courseForm.outside_plan_reason}
                      onChange={e => setCourseForm(p => ({ ...p, outside_plan_reason: e.target.value }))}
                    />
                  </div>
                )}

                {/* Submit & Reset Actions */}
                <div className="flex items-end md:col-span-2 gap-2">
                  <Button
                    type="button"
                    onClick={handleSaveCourse}
                    className={`flex-1 text-white rounded-xl font-bold h-9 text-xs gap-1.5 cursor-pointer shadow-xs ${
                      editingCourse
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : planSubTab === 'OUTSIDE'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-[#1B3A6B] hover:bg-[#152d54]'
                    }`}
                  >
                    {editingCourse ? <CheckCircle2 size={15} /> : <Plus size={15} />}
                    {editingCourse
                      ? 'حفظ التعديلات'
                      : planSubTab === 'OUTSIDE'
                      ? `حفظ وإضافة دورة خارج الخطة لعام ${selectedYear}`
                      : `حفظ وإضافة إلى الخطة لعام ${selectedYear}`}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => clearCourseForm(selectedYear)}
                    className="rounded-xl font-bold h-9 text-xs gap-1 border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer shrink-0"
                    title={editingCourse ? 'إلغاء التعديل والعودة لإضافة جديدة' : 'تفريغ جميع حقول الإدخال بالكامل'}
                  >
                    <X size={14} />
                    {editingCourse ? 'إلغاء التعديل' : 'تفريغ حقول الإدخال'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Filter Row for Plan */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pr-9 h-9 rounded-xl text-xs bg-slate-50 border-slate-200"
                    placeholder="بحث باسم الدورة، الرمز، المدرب..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>

                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-9 w-36 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="تخصص الدورة" />
                  </SelectTrigger>
                  <SelectContent side="bottom" position="popper">
                    <SelectItem value="ALL">كافة التخصصات</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="h-9 w-44 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="أشهر السنة" />
                  </SelectTrigger>
                  <SelectContent side="bottom" position="popper">
                    <SelectItem value="ALL">كافة الأشهر لعام {selectedYear}</SelectItem>
                    {IRAQ_MONTHS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="text-xs text-slate-500 font-bold">
                عرض {
                  (planSubTab === 'PLANNED' ? yearPlannedCourses : yearOutsidePlanCourses).filter(c => {
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      const matchName = (c.course_name || '').toLowerCase().includes(q);
                      const matchCode = (c.course_code || '').toLowerCase().includes(q);
                      const matchTrainer = (c.trainer_name || '').toLowerCase().includes(q);
                      if (!matchName && !matchCode && !matchTrainer) return false;
                    }
                    if (filterCategory !== 'ALL' && c.category !== filterCategory) return false;
                    if (filterMonth !== 'ALL') {
                      const targetM = parseInt(filterMonth, 10);
                      let sM = c.start_date ? parseInt(c.start_date.split('-')[1], 10) : null;
                      let eM = c.end_date ? parseInt(c.end_date.split('-')[1], 10) : null;
                      if (!eM) eM = sM;
                      if (!sM && eM) sM = eM;
                      if (!sM || isNaN(sM)) return false;
                      if (sM <= eM) {
                        if (targetM < sM || targetM > eM) return false;
                      } else {
                        if (targetM < sM && targetM > eM) return false;
                      }
                    }
                    return true;
                  }).length
                } دورات مسجلة
              </div>
            </div>

            {/* Sequential Plan Courses Table with Reordering Capability */}
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-[#1B3A6B] text-sm flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  {planSubTab === 'PLANNED'
                    ? `جدول الدورات ضمن الخطة التدريبية لعام ${selectedYear}`
                    : `جدول الدورات التدريبية المضافة خارج الخطة لعام ${selectedYear}`}
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadTraineesTemplate}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 rounded-xl font-bold text-xs h-8 px-3.5 gap-1.5 cursor-pointer shadow-2xs"
                    title="تنزيل نموذج إكسل معتمد لإدراج وتغذية بيانات المتدربين"
                  >
                    <Download size={14} className="text-emerald-700" />
                    تنزيل نموذج إكسل للمتدربين
                  </Button>

                  <Button
                    type="button"
                    onClick={() => setActiveView('COURSES')}
                    className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl font-bold text-xs h-8 px-3.5 gap-2 shadow-xs cursor-pointer"
                    title="الانتقال إلى إدارة الدورات التدريبية للعام المحدد"
                  >
                    <GraduationCap size={15} />
                    إدارة الدورات التدريبية للعام المحدد ({selectedYear})
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3 text-center w-12">#</th>
                      <th className="p-3 text-center w-14">الترتيب</th>
                      <th className="p-3.5">رمز الدورة</th>
                      <th className="p-3.5">اسم الدورة التدريبية</th>
                      <th className="p-3.5">التخصص</th>
                      <th className="p-3.5">الفئة المستهدفة</th>
                      <th className="p-3.5">المدرب</th>
                      <th className="p-3.5">المدة والساعات</th>
                      <th className="p-3.5">النوع والمكان</th>
                      <th className="p-3.5">الفترة الزمنية</th>
                      <th className="p-3.5">حالة التنفيذ</th>
                      <th className="p-3.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {((planSubTab === 'PLANNED' ? yearPlannedCourses : yearOutsidePlanCourses).filter(c => {
                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        const matchName = (c.course_name || '').toLowerCase().includes(q);
                        const matchCode = (c.course_code || '').toLowerCase().includes(q);
                        const matchTrainer = (c.trainer_name || '').toLowerCase().includes(q);
                        if (!matchName && !matchCode && !matchTrainer) return false;
                      }
                      if (filterCategory !== 'ALL' && c.category !== filterCategory) return false;
                      if (filterMonth !== 'ALL') {
                        const targetM = parseInt(filterMonth, 10);
                        let sM = c.start_date ? parseInt(c.start_date.split('-')[1], 10) : null;
                        let eM = c.end_date ? parseInt(c.end_date.split('-')[1], 10) : null;
                        if (!eM) eM = sM;
                        if (!sM && eM) sM = eM;
                        if (!sM || isNaN(sM)) return false;
                        if (sM <= eM) {
                          if (targetM < sM || targetM > eM) return false;
                        } else {
                          if (targetM < sM && targetM > eM) return false;
                        }
                      }
                      return true;
                    })).length === 0 ? (
                      <tr>
                        <td colSpan={12} className="p-12 text-center text-slate-400">
                          لا توجد دورات مسجلة في هذا التبويب لعام {selectedYear} حتى الآن. يمكنك استخدام النموذج أعلاه لإضافة الدورات بشكل مباشر.
                        </td>
                      </tr>
                    ) : (planSubTab === 'PLANNED' ? yearPlannedCourses : yearOutsidePlanCourses).filter(c => {
                      if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        const matchName = (c.course_name || '').toLowerCase().includes(q);
                        const matchCode = (c.course_code || '').toLowerCase().includes(q);
                        const matchTrainer = (c.trainer_name || '').toLowerCase().includes(q);
                        if (!matchName && !matchCode && !matchTrainer) return false;
                      }
                      if (filterCategory !== 'ALL' && c.category !== filterCategory) return false;
                      if (filterMonth !== 'ALL') {
                        const targetM = parseInt(filterMonth, 10);
                        let sM = c.start_date ? parseInt(c.start_date.split('-')[1], 10) : null;
                        let eM = c.end_date ? parseInt(c.end_date.split('-')[1], 10) : null;
                        if (!eM) eM = sM;
                        if (!sM && eM) sM = eM;
                        if (!sM || isNaN(sM)) return false;
                        if (sM <= eM) {
                          if (targetM < sM || targetM > eM) return false;
                        } else {
                          if (targetM < sM && targetM > eM) return false;
                        }
                      }
                      return true;
                    }).map((course, idx, arr) => {
                      const isOutside = Boolean(course.is_outside_plan || course.isOutsidePlan);
                      const courseEnrollments = enrollments.filter(e => e.training_id === course.id);

                      return (
                        <tr key={course.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-500 bg-slate-50/60">
                            {idx + 1}
                          </td>

                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={idx === 0}
                                onClick={() => handleMoveCourse(course.id, 'UP')}
                                className="h-6 w-6 text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-20"
                                title="رفع لأعلى"
                              >
                                <ArrowUp size={12} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                disabled={idx === arr.length - 1}
                                onClick={() => handleMoveCourse(course.id, 'DOWN')}
                                className="h-6 w-6 text-slate-500 hover:text-blue-600 hover:bg-slate-100 disabled:opacity-20"
                                title="خفض لأسفل"
                              >
                                <ArrowDown size={12} />
                              </Button>
                            </div>
                          </td>

                          <td className="p-3.5 font-mono text-[11px] font-bold text-slate-600">
                            {course.course_code || course.courseCode || `TRN-${selectedYear}-${course.id}`}
                          </td>

                          <td className="p-3.5 font-bold text-[#1B3A6B]">
                            {course.course_name}
                            {isOutside && course.outside_plan_reason && (
                              <div className="text-[10px] text-amber-700 font-normal mt-0.5">
                                السبب: {course.outside_plan_reason}
                              </div>
                            )}
                          </td>

                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
                              {course.category || 'إدارية'}
                            </span>
                          </td>

                          <td className="p-3.5 text-slate-600 font-medium">
                            {course.target_audience || course.targetAudience || 'كافة الكوادر'}
                          </td>

                          <td className="p-3.5 font-bold text-slate-800">
                            <div>{course.trainer_name || 'غير محدد'}</div>
                            {(() => {
                              if (!course.trainer_name && !course.trainer_id) return null;
                              const trYearCount = getTrainerCourseCountInYear(course.trainer_id, course.trainer_name, getCourseYear(course));
                              if (trYearCount > 2) {
                                return (
                                  <div className="mt-0.5">
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold" title="أقام المدرب أكثر من دورتين خلال هذا العام: يستحق أجور التدريب فقط بدون كتاب شكر أو مكافأة مالية">
                                      <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                                      تجاوز دورتين (أجور فقط)
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </td>

                          <td className="p-3.5">
                            <span className="font-bold text-slate-800">
                              {course.duration_value || course.days || 1} {course.duration_unit || 'أيام'}
                            </span>
                            <span className="text-[10px] text-slate-500 mr-1">({course.hours || 0} ساعة)</span>
                          </td>

                          <td className="p-3.5">
                            <div className="text-slate-800 font-bold">{course.course_type || 'حضوري'}</div>
                            {course.course_type === 'حضوري' && (
                              <div className="text-[10px] text-slate-500">{course.location || 'م مواقع الشركة'}</div>
                            )}
                          </td>

                          <td className="p-3.5 text-slate-600 text-[11px] font-mono">
                            {course.start_date} إلى {course.end_date}
                          </td>

                          <td className="p-3.5">
                            <Select
                              value={course.status === 'منفذة' || course.status === 'منتهي' || course.status === 'جاري' ? 'منفذة' : course.status === 'ملغاة' || course.status === 'ملغى' ? 'ملغاة' : 'غير منفذة'}
                              onValueChange={(v) => handleUpdateStatus(course, v)}
                            >
                              <SelectTrigger className={`h-8 border text-xs font-bold rounded-xl px-2.5 gap-1.5 w-[125px] ${
                                course.status === 'منفذة' || course.status === 'منتهي' || course.status === 'جاري'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : course.status === 'ملغاة' || course.status === 'ملغى'
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : 'bg-sky-50 text-sky-800 border-sky-200'
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent side="bottom" position="popper">
                                <SelectItem value="منفذة">
                                  <span className="flex items-center gap-1.5 font-bold text-emerald-700">
                                    <CheckCircle2 size={13} /> منفذة
                                  </span>
                                </SelectItem>
                                <SelectItem value="غير منفذة">
                                  <span className="flex items-center gap-1.5 font-bold text-sky-700">
                                    <Clock size={13} /> غير منفذة
                                  </span>
                                </SelectItem>
                                <SelectItem value="ملغاة">
                                  <span className="flex items-center gap-1.5 font-bold text-rose-700">
                                    <XCircle size={13} /> ملغاة
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditCourse(course)}
                                className="h-7 w-7 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg"
                                title="تعديل البيانات في النموذج العلوي"
                              >
                                <Edit size={13} />
                              </Button>

                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteCourse(course.id)}
                                className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                title="حذف"
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Inline Trainer Directory View */}
        {activeView === 'TRAINERS' ? (
          <div className="space-y-6 mt-6 text-right" dir="rtl">
            {/* 1. Summary Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-blue-50 text-[#1B3A6B] rounded-xl shrink-0">
                  <UserCheck size={20} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold">إجمالي المدربين</div>
                  <div className="text-xl font-black text-slate-800">{trainers.length}</div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold">مدربين معتمدين</div>
                  <div className="text-xl font-black text-emerald-600">
                    {trainers.filter(t => t.status === 'معتمد' || !t.status).length}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold">مقيدون ومحظورون</div>
                  <div className="text-xl font-black text-rose-600">
                    {trainers.filter(t => t.status === 'مقيد ومحظور').length}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
                  <Building2 size={20} />
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-bold">داخلي / خارجي</div>
                  <div className="text-sm font-black text-slate-800">
                    {trainers.filter(t => t.trainer_type === 'داخلي').length} داخلي | {trainers.filter(t => t.trainer_type === 'خارجي').length} خارجي
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Add / Edit Trainer Form Panel */}
            {(showTrainerFormPanel || editingTrainer) && (
              <div className="bg-white p-5 rounded-2xl border-2 border-blue-200 shadow-md animate-in fade-in slide-in-from-top-3 duration-200">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 className="font-bold text-[#1B3A6B] text-sm flex items-center gap-2">
                    <UserPlus size={18} className="text-blue-600" />
                    {editingTrainer ? `تعديل بيانات المدرب: ${editingTrainer.full_name}` : 'إضافة مدرب جديد إلى دليل الاعتماد'}
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingTrainer(null);
                      setShowTrainerFormPanel(false);
                    }}
                    className="rounded-xl h-8 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    <X size={16} />
                    إلغاء
                  </Button>
                </div>

                {/* 1. Employee Search Section */}
                <div className="bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/90 mb-5">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Label className="text-xs font-bold text-[#1B3A6B] flex items-center gap-1.5">
                      <Users size={15} className="text-blue-600" />
                      البحث في قيود موظفي الشركة (بالاسم أو رقم الشركة / الموظف)
                    </Label>
                    {trainerForm.employee_code && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-[11px] font-bold">
                        <CheckCircle2 size={12} />
                        رقم الشركة: {trainerForm.employee_code}
                      </Badge>
                    )}
                  </div>

                  <div className="relative">
                    <div className="relative">
                      <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={empSearchQuery || ''}
                        onChange={e => {
                          setEmpSearchQuery(e.target.value);
                          setShowEmpDropdown(true);
                        }}
                        onFocus={() => setShowEmpDropdown(true)}
                        placeholder="اكتب اسم الموظف أو رقم الشركة للبحث التلقائي واختياره..."
                        className="pr-9 rounded-xl bg-white border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                      {empSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setEmpSearchQuery('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Live Search Results Dropdown */}
                    {showEmpDropdown && empSearchQuery.trim().length > 0 && (
                      <div className="absolute z-30 right-0 left-0 mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl max-h-60 overflow-y-auto p-1.5 divide-y divide-slate-100">
                        {searchedEmployees.length === 0 ? (
                          <div className="p-3 text-center text-xs text-slate-400">
                            لم يتم العثور على موظف بمطابقة "{empSearchQuery}"
                          </div>
                        ) : (
                          searchedEmployees.map(emp => {
                            const empName = emp.full_name || emp.fullName || '';
                            const empCode = emp.company_number || emp.companyNumber || emp.employee_number || emp.employeeNumber || emp.id;
                            const empDept = emp.department || emp.section || 'قسم غير محدد';
                            const empTitle = emp.job_title || emp.jobTitle || '';

                            return (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => handleSelectEmployeeForTrainer(emp)}
                                className="w-full text-right p-2.5 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-between gap-2 cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1B3A6B] font-black text-xs flex items-center justify-center shrink-0">
                                    {empName.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-slate-800 text-xs">{empName}</div>
                                    <div className="text-[10px] text-slate-500">{empDept} {empTitle ? `• ${empTitle}` : ''}</div>
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-[10px] bg-slate-50 border-slate-200 shrink-0 font-mono font-bold">
                                  رقم الشركة: {empCode}
                                </Badge>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {trainerForm.employee_code && (
                    <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-900">
                      <span className="font-bold flex items-center gap-1.5">
                        <CheckCircle2 size={15} className="text-emerald-600" />
                        تم ربط المدرب بالموظف: <span className="underline">{trainerForm.full_name}</span> (رقم الشركة: {trainerForm.employee_code})
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setTrainerForm(prev => ({
                            ...prev,
                            employee_id: '',
                            employee_code: ''
                          }));
                          toast({ title: 'تم إلغاء ربط الموظف والتحويل إلى الإدخال اليدوي' });
                        }}
                        className="h-7 text-[11px] text-rose-600 hover:bg-rose-100 rounded-lg font-bold px-2 cursor-pointer"
                      >
                        إلغاء الربط
                      </Button>
                    </div>
                  )}
                </div>

                {/* 2. Main Form Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                  {/* Full Name */}
                  <div className="sm:col-span-2 md:col-span-3">
                    <Label className="text-xs font-bold text-slate-700">اسم المدرب الثلاثي واللقب *</Label>
                    <Input
                      className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                      placeholder="مثال: د. علي عبد الحسين"
                      value={trainerForm.full_name || ''}
                      onChange={e => setTrainerForm(p => ({ ...p, full_name: e.target.value }))}
                    />
                  </div>

                  {/* 3. Nature of Courses (طبيعة الدورات - اختيار متعدد) */}
                  <div className="sm:col-span-2 md:col-span-3 bg-blue-50/40 p-3.5 rounded-2xl border border-blue-100">
                    <Label className="text-xs font-bold text-[#1B3A6B] block mb-2">
                      طبيعة الدورات التي يقدمها (يمكن تحديد أكثر من خيار) *
                    </Label>
                    <div className="flex flex-wrap items-center gap-2">
                      {['إدارية', 'حاسوب', 'HSE', 'اختصاص'].map(cat => {
                        const currentCategories = parseCourseCategories(trainerForm.course_categories);
                        const isSelected = currentCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => toggleCourseCategory(cat)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                              isSelected
                                ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center ${isSelected ? 'bg-white text-[#1B3A6B] border-white' : 'border-slate-300'}`}>
                              {isSelected && <CheckCircle2 size={12} />}
                            </div>
                            <span>{cat}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Conditional Specialty Details Input */}
                    {parseCourseCategories(trainerForm.course_categories).includes('اختصاص') && (
                      <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150 bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80">
                        <div className="flex items-center justify-between mb-1.5">
                          <Label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                            <Sparkles size={14} className="text-amber-600" />
                            طبيعة الاختصاص التفصيلية *
                          </Label>
                          <span className="text-[10px] text-amber-800 font-medium">
                            (حفظ القائمة وإضافة/حذف الاختصاصات بسهولة)
                          </span>
                        </div>

                        <div className="relative">
                          <Input
                            list="saved-specialties-datalist"
                            className="rounded-xl bg-white border-amber-300 focus:border-amber-500 text-xs font-medium text-slate-800 placeholder:text-slate-400"
                            placeholder="اكتب طبيعة الاختصاص أو اختر من الاختصاصات المحفوظة أدناه..."
                            value={trainerForm.specialty_details || ''}
                            onChange={e => setTrainerForm(p => ({ ...p, specialty_details: e.target.value }))}
                          />
                          <datalist id="saved-specialties-datalist">
                            {allSavedSpecialties.map(spec => (
                              <option key={spec} value={spec} />
                            ))}
                          </datalist>
                        </div>

                        {/* Manual Add New Specialty Box */}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <Input
                            className="h-8 rounded-lg bg-white border-amber-300 text-xs text-slate-800 placeholder:text-slate-400"
                            placeholder="+ إضافة اختصاص جديد لقائمة المحفوظات..."
                            value={newSpecialtyInput}
                            onChange={e => setNewSpecialtyInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddManualSpecialty();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleAddManualSpecialty}
                            className="h-8 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold px-3 shrink-0 cursor-pointer"
                          >
                            حفظ بالقائمة
                          </Button>
                        </div>

                        {/* Saved specialties quick selection chips */}
                        <div className="mt-3">
                          <div className="text-[11px] font-bold text-amber-900 mb-1.5 flex items-center justify-between">
                            <span>الاختصاصات المحفوظة والمتاحة للاختيار السريع:</span>
                            <span className="text-[10px] text-amber-700 font-normal">انقر للاختيار/الإلغاء أو (×) للحذف النهائي</span>
                          </div>
                          {allSavedSpecialties.length === 0 ? (
                            <div className="text-[11px] text-amber-800/80 bg-white/60 p-2.5 rounded-xl border border-dashed border-amber-300 text-center">
                              لا توجد اختصاصات محفوظة حالياً. يمكنك إضافة اختصاصات جديدة باستخدام الحقل أعلاه.
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5 max-h-40 overflow-y-auto p-2 bg-white/80 rounded-xl border border-amber-200/60 shadow-xs">
                              {allSavedSpecialties.map(spec => {
                                const currentSpecs = (trainerForm.specialty_details || '')
                                  .split(/[،,]/)
                                  .map(s => s.trim());
                                const isSelected = currentSpecs.includes(spec);

                                return (
                                  <div
                                    key={spec}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                      isSelected
                                        ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                        : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400 hover:bg-amber-50'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => handleSelectSpecialtyChip(spec)}
                                      className="cursor-pointer flex items-center gap-1"
                                    >
                                      <span>{isSelected ? '✓ ' : '+ '}</span>
                                      <span>{spec}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleRemoveSavedSpecialty(e, spec)}
                                      className={`mr-0.5 rounded-full p-0.5 transition-colors cursor-pointer text-xs leading-none ${
                                        isSelected ? 'hover:bg-amber-700 text-amber-100 hover:text-white' : 'hover:bg-rose-100 text-slate-400 hover:text-rose-600'
                                      }`}
                                      title="حذف هذا الاختصاص من القائمة المحفوظة"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Accreditation Status */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700">حالة الحساب والاعتماد *</Label>
                    <Select value={trainerForm.status || 'معتمد'} onValueChange={v => setTrainerForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl bg-slate-50"><SelectValue /></SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="معتمد" className="font-bold text-emerald-700">معتمد (نشط)</SelectItem>
                        <SelectItem value="مقيد ومحظور" className="font-bold text-rose-700">مقيد ومحظور (تقييد الحساب)</SelectItem>
                        <SelectItem value="قيد الاعتماد" className="font-bold text-amber-700">قيد الاعتماد</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Conditional Trainer Code Input (only if status is معتمد) */}
                  {trainerForm.status === 'معتمد' && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                      <Label className="text-xs font-bold text-emerald-800">كود المدرب (رمز الاعتماد) *</Label>
                      <Input
                        className="mt-1 rounded-xl bg-emerald-50/50 border-emerald-300 focus:bg-white text-xs font-mono font-bold"
                        placeholder="مثال: TRN-2026-001"
                        value={trainerForm.trainer_code || ''}
                        onChange={e => setTrainerForm(p => ({ ...p, trainer_code: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Phone Mobile */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700">رقم الهاتف المحمول</Label>
                    <Input
                      className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white font-mono"
                      placeholder="0770XXXXXXX"
                      value={trainerForm.phone || ''}
                      onChange={e => setTrainerForm(p => ({ ...p, phone: e.target.value }))}
                    />
                  </div>

                  {/* Phone Work */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700">رقم هاتف العمل</Label>
                    <Input
                      className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white font-mono"
                      placeholder="01XXXXXXX أو داخلي 1234"
                      value={trainerForm.work_phone || ''}
                      onChange={e => setTrainerForm(p => ({ ...p, work_phone: e.target.value }))}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <Label className="text-xs font-bold text-slate-700">البريد الإلكتروني</Label>
                    <Input
                      className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                      placeholder="example@domain.com"
                      value={trainerForm.email || ''}
                      onChange={e => setTrainerForm(p => ({ ...p, email: e.target.value }))}
                    />
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-2 md:col-span-3">
                    <Label className="text-xs font-bold text-slate-700">حقل مخصص للملاحظات</Label>
                    <Input
                      className="mt-1 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                      placeholder="أدخل أي ملاحظات إضافية بخصوص المدرب، الاعتماد، أو شروط العمل..."
                      value={trainerForm.notes || ''}
                      onChange={e => setTrainerForm(p => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl h-9 text-xs font-bold px-4 cursor-pointer"
                    onClick={() => {
                      setEditingTrainer(null);
                      setShowTrainerFormPanel(false);
                    }}
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveTrainer}
                    className="bg-[#1B3A6B] hover:bg-[#152e55] text-white rounded-xl h-9 text-xs font-bold px-6 shadow-xs cursor-pointer gap-1.5"
                  >
                    <CheckCircle2 size={15} />
                    {editingTrainer ? 'تحديث بيانات المدرب' : 'حفظ وإضافة المدرب'}
                  </Button>
                </div>
              </div>
            )}

            {/* 3. Search and Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative w-full md:w-96">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  value={trainerSearchQuery}
                  onChange={e => setTrainerSearchQuery(e.target.value)}
                  placeholder="ابحث باسم المدرب، التخصص، الجهة، أو الهاتف..."
                  className="pr-9 rounded-xl text-xs bg-slate-50 border-slate-200 focus:bg-white"
                />
                {trainerSearchQuery && (
                  <button
                    onClick={() => setTrainerSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold shrink-0">
                  <Filter size={14} />
                  <span>فلترة:</span>
                </div>

                {/* Type Filter */}
                <Select value={trainerTypeFilter} onValueChange={setTrainerTypeFilter}>
                  <SelectTrigger className="w-32 h-9 rounded-xl text-xs bg-slate-50 border-slate-200">
                    <SelectValue placeholder="النوع" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="ALL">جميع الأنواع</SelectItem>
                    <SelectItem value="داخلي">داخلي</SelectItem>
                    <SelectItem value="خارجي">خارجي</SelectItem>
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select value={trainerStatusFilter} onValueChange={setTrainerStatusFilter}>
                  <SelectTrigger className="w-36 h-9 rounded-xl text-xs bg-slate-50 border-slate-200">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="ALL">جميع الحالات</SelectItem>
                    <SelectItem value="معتمد">معتمد</SelectItem>
                    <SelectItem value="مقيد ومحظور">مقيد ومحظور</SelectItem>
                    <SelectItem value="قيد التجريب">قيد التجريب</SelectItem>
                    <SelectItem value="زائر">زائر</SelectItem>
                    <SelectItem value="معطل">معطل</SelectItem>
                  </SelectContent>
                </Select>

                {(trainerSearchQuery || trainerTypeFilter !== 'ALL' || trainerStatusFilter !== 'ALL') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTrainerSearchQuery('');
                      setTrainerTypeFilter('ALL');
                      setTrainerStatusFilter('ALL');
                    }}
                    className="h-9 px-3 text-xs text-rose-600 hover:bg-rose-50 rounded-xl"
                  >
                    إعادة ضبط
                  </Button>
                )}
              </div>
            </div>

            {/* 4. Trainers Grid Cards */}
            {filteredTrainers.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
                <UserX size={44} className="text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-[#1B3A6B] text-base">لا يوجد مدربين مطابقين للبحث أو الفلترة</h3>
                <p className="text-xs text-slate-400 mt-1">تأكد من عبارة البحث أو اضغط على زر إبقاء جميع الفلاتر.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTrainers.map(tr => {
                  const isRestricted = tr.status === 'مقيد ومحظور';
                  const assignedCoursesCount = courses.filter(c => c.trainer_id == tr.id || c.trainer_name === tr.full_name).length;

                  return (
                    <div
                      key={tr.id}
                      className={`bg-white rounded-2xl p-5 border shadow-xs transition-all flex flex-col justify-between relative overflow-hidden ${
                        isRestricted
                          ? 'border-rose-300 bg-rose-50/20'
                          : 'border-slate-200 hover:border-blue-300 hover:shadow-md'
                      }`}
                    >
                      <div>
                        {/* Card Header Bar */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 border ${
                              isRestricted
                                ? 'bg-rose-100 text-rose-700 border-rose-200'
                                : tr.trainer_type === 'داخلي'
                                ? 'bg-blue-100 text-[#1B3A6B] border-blue-200'
                                : 'bg-purple-100 text-purple-700 border-purple-200'
                            }`}>
                              {(tr.full_name || '?').charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-bold text-[#1B3A6B] text-sm leading-snug flex items-center gap-1.5">
                                {tr.full_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                {tr.trainer_code && (
                                  <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded-md">
                                    كود: {tr.trainer_code}
                                  </span>
                                )}
                                {tr.employee_code && (
                                  <span className="text-[10px] font-mono font-bold bg-blue-50 text-[#1B3A6B] border border-blue-200 px-1.5 py-0.2 rounded-md">
                                    شركة: {tr.employee_code}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shrink-0 ${
                            isRestricted || tr.status === 'محظور'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : tr.status === 'معتمد' || !tr.status
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : tr.status === 'قيد الاعتماد'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {isRestricted || tr.status === 'محظور' ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
                            {tr.status || 'معتمد'}
                          </span>
                        </div>

                        {/* Course Categories Badges */}
                        {(() => {
                          const cats = parseCourseCategories(tr.course_categories || tr.courseCategories);
                          if (cats.length === 0) return null;

                          return (
                            <div className="flex flex-wrap items-center gap-1 mb-2">
                              <span className="text-[10px] text-slate-400 font-bold ml-1">الدورات:</span>
                              {cats.map((c, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[10px] py-0 px-1.5 bg-blue-50 text-[#1B3A6B] border border-blue-100 font-semibold">
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Specialty Details */}
                        {(tr.specialty_details || tr.specialtyDetails) && (
                          <div className="text-[11px] font-bold text-amber-900 bg-amber-50/80 border border-amber-200/80 px-2 py-1 rounded-lg mb-2">
                            الاختصاص: {tr.specialty_details || tr.specialtyDetails}
                          </div>
                        )}

                        {/* Contact Information & Quick Contact QR Code */}
                        <div className="space-y-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                          <div className="bg-slate-50/90 border border-slate-200/80 p-2.5 rounded-2xl flex items-center justify-between gap-2 shadow-xs">
                            <div className="space-y-1 text-xs flex-1">
                              <span className="text-[10px] font-bold text-[#1B3A6B] uppercase tracking-wider block mb-1">
                                معلومات الاتصال المباشر
                              </span>

                              <div className="flex items-center gap-1.5 text-slate-700">
                                <Phone size={12} className="text-emerald-600 shrink-0" />
                                <span className="text-slate-400 text-[11px]">المحمول:</span>
                                <span className="font-mono font-bold text-slate-900 dir-ltr text-[11px]">
                                  {tr.phone || 'غير مدخل'}
                                </span>
                              </div>

                              {tr.work_phone && (
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <PhoneCall size={12} className="text-blue-600 shrink-0" />
                                  <span className="text-slate-400 text-[11px]">العمل:</span>
                                  <span className="font-mono font-bold text-slate-800 dir-ltr text-[11px]">
                                    {tr.work_phone}
                                  </span>
                                </div>
                              )}

                              {tr.email && (
                                <div className="flex items-center gap-1.5 text-slate-700">
                                  <Mail size={12} className="text-amber-600 shrink-0" />
                                  <span className="text-slate-400 text-[11px]">البريد:</span>
                                  <span className="font-bold text-slate-800 text-[11px] truncate max-w-[125px]" title={tr.email}>
                                    {tr.email}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Dynamic Quick Contact QR Code */}
                            {(tr.phone || tr.work_phone || tr.email) && (
                              <div className="flex flex-col items-center justify-center bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm shrink-0" title="رمز وصول سريع للاتصال (امسح بكاميرا الهاتف)">
                                <QRCodeSVG
                                  value={generateContactQRPayload(tr)}
                                  size={52}
                                  level="M"
                                  includeMargin={false}
                                />
                                <span className="text-[8px] font-bold text-[#1B3A6B] mt-1 flex items-center gap-0.5">
                                  <QrCode size={9} />
                                  وصول سريع
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center justify-between px-1">
                            <span className="text-slate-400">إجمالي الدورات بالنظام:</span>
                            <span className="font-bold text-[#1B3A6B] bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                              {assignedCoursesCount} دورة
                            </span>
                          </div>

                          {(() => {
                            const yearCoursesCount = getTrainerCourseCountInYear(tr.id, tr.full_name, selectedYear);
                            return (
                              <div className="space-y-1 mt-2 pt-2 border-t border-slate-100">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-600 font-bold">دورات لعام {selectedYear}:</span>
                                  <span className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                                    yearCoursesCount > 2
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : yearCoursesCount === 2
                                      ? 'bg-blue-100 text-blue-900 border border-blue-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {yearCoursesCount} دورات
                                  </span>
                                </div>
                                {yearCoursesCount > 2 && (
                                  <div className="text-[10px] bg-amber-50 text-amber-900 border border-amber-300 p-1.5 rounded-lg font-bold flex items-center gap-1 leading-tight">
                                    <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                                    <span>تجاوز النصاب (2): يستحق أجور التدريب فقط بدون كتاب شكر أو مكافأة.</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {tr.notes && (
                            <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl mt-2 line-clamp-2">
                              ملاحظات: {tr.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTrainerForView(tr)}
                          className="rounded-xl text-[11px] h-8 px-2.5 font-bold gap-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="عرض بطاقة المدرب والتفاصيل"
                        >
                          <Eye size={13} className="text-blue-600" />
                          عرض
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditTrainer(tr)}
                          className="rounded-xl text-[11px] h-8 px-2.5 font-bold gap-1 text-slate-700 hover:bg-slate-100 cursor-pointer"
                          title="تعديل البيانات"
                        >
                          <Edit size={13} className="text-amber-600" />
                          تعديل
                        </Button>

                        {/* Restrict / Unrestrict Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleToggleRestrictTrainer(tr, e)}
                          className={`rounded-xl text-[11px] h-8 px-2.5 font-bold gap-1 cursor-pointer transition-all ${
                            isRestricted
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                          }`}
                          title={isRestricted ? 'إلغاء حظر واعتماد المدرب' : 'تقييد وحظر المدرب'}
                        >
                          {isRestricted ? <Unlock size={13} /> : <Lock size={13} />}
                          {isRestricted ? 'اعتماد' : 'تقييد'}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => handleDeleteTrainer(tr.id, e)}
                          className="rounded-xl text-[11px] h-8 px-2.5 font-bold gap-1 text-rose-600 bg-rose-50/60 border-rose-200 hover:bg-rose-100 cursor-pointer"
                          title="حذف المدرب"
                        >
                          <Trash2 size={13} className="text-rose-600" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {/* Content View (Courses) */}
        {activeView === 'COURSES' && (
          <TabsContent value={activeTrack} className="mt-6" dir="rtl">
            {/* Filter & Controls Toolbar for Courses Management */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-sm mb-5 flex flex-wrap items-center justify-between gap-3" dir="rtl">
              <div className="flex flex-wrap items-center gap-2 w-full">
                {/* Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="absolute right-3 top-2.5 text-slate-400" size={15} />
                  <Input
                    placeholder="ابحث باسم الدورة / الرمز / المدرب..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pr-9 h-9 rounded-xl text-xs bg-slate-50 border-slate-200"
                  />
                </div>

                {/* Plan Scope Filter (ضمن الخطة / خارج الخطة) */}
                <Select value={filterPlanScope} onValueChange={setFilterPlanScope}>
                  <SelectTrigger className="h-9 w-44 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="نطاق الخطة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كافة الدورات (ضمن وخارج الخطة)</SelectItem>
                    <SelectItem value="PLANNED">ضمن الخطة السنوية المعتمدة</SelectItem>
                    <SelectItem value="OUTSIDE">خارج الخطة السنوية (المستحدثة)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Category Filter */}
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-9 w-36 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="التخصص" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كافة التخصصات</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Month Filter */}
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="h-9 w-44 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="أشهر السنة" />
                  </SelectTrigger>
                  <SelectContent side="bottom" position="popper">
                    <SelectItem value="ALL">كافة الأشهر لعام {selectedYear}</SelectItem>
                    {IRAQ_MONTHS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 w-36 rounded-xl text-xs font-bold bg-slate-50 border-slate-200">
                    <SelectValue placeholder="حالة التنفيذ" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كافة الحالات</SelectItem>
                    {COURSE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 text-center">
              <div className="w-10 h-10 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin mb-3" />
              <p className="text-slate-500 font-bold text-sm">جاري تحميل برامج التدريب...</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm" dir="rtl">
              <GraduationCap size={48} className="text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-[#1B3A6B] text-lg">لا توجد دورات مطابقة للبحث أو الفلاتر لعام {selectedYear}</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
                يرجى تغيير خيارات البحث أو خيارات الفلاتر لعرض الدورات المطلوبة.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-right" dir="rtl">
              {filteredCourses.map(course => {
                const courseEnrollments = enrollments.filter(e => e.training_id === course.id);
                const passedCount = courseEnrollments.filter(e => e.status === 'ناجح' || e.result === 'ناجح').length;
                const yr = getCourseYear(course);
                const isOutside = Boolean(course.is_outside_plan || course.isOutsidePlan);

                const rawStatus = course.status || 'غير منفذة';
                const isExecuted = rawStatus === 'منفذة' || rawStatus === 'جاري' || rawStatus === 'منتهي';
                const isCancelled = rawStatus === 'ملغاة' || rawStatus === 'ملغى';
                const isNotExecuted = !isExecuted && !isCancelled;

                // Card container classes combining plan scope & status distinctions
                let cardClass = "bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all flex flex-col justify-between group text-right relative overflow-hidden ";
                
                if (isOutside) {
                  cardClass += "border-amber-300/90 bg-amber-50/20 ";
                } else {
                  cardClass += "border-slate-200/90 ";
                }

                if (isExecuted) {
                  cardClass += "border-r-4 border-r-emerald-500 ";
                } else if (isCancelled) {
                  cardClass += "border-r-4 border-r-rose-500 opacity-80 bg-rose-50/10 ";
                } else {
                  cardClass += "border-r-4 border-r-sky-500 ";
                }

                return (
                  <div
                    key={course.id}
                    className={cardClass}
                    dir="rtl"
                  >
                    <div>
                      {/* Top Header Bar (RTL Aligned) */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-1.5 justify-start">
                          {/* Plan Scope Badge */}
                          {isOutside ? (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shrink-0">
                              <ShieldAlert size={12} className="text-amber-600" />
                              خارج الخطة
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-[#1B3A6B] border border-blue-200 flex items-center gap-1 shrink-0">
                              <CheckCircle2 size={12} className="text-[#1B3A6B]" />
                              ضمن الخطة
                            </span>
                          )}

                          {/* Execution Status Badge */}
                          {isExecuted && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shrink-0">
                              <CheckCircle2 size={12} className="text-emerald-600" />
                              منفذة
                            </span>
                          )}
                          {isCancelled && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 shrink-0">
                              <XCircle size={12} className="text-rose-600" />
                              ملغاة
                            </span>
                          )}
                          {isNotExecuted && (
                            <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1 shrink-0">
                              <Clock size={12} className="text-sky-600" />
                              غير منفذة
                            </span>
                          )}


                          {/* Category Badge */}
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            course.category === 'إدارية' ? 'bg-purple-100 text-purple-700' :
                            course.category === 'حاسوب' ? 'bg-blue-100 text-blue-700' :
                            course.category === 'اختصاص' ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {course.category || 'إدارية'}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                            {course.course_type}
                          </span>
                        </div>

                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#1B3A6B] border border-blue-100 shrink-0">
                          عام {yr}
                        </span>
                      </div>

                      {/* Course Title */}
                      <h3 className="font-bold text-[#1B3A6B] text-base group-hover:text-blue-700 transition-colors leading-snug text-right mt-1">
                        {course.course_name}
                      </h3>

                      {/* Course Detailed Fields (RTL) */}
                      <div className="mt-3.5 space-y-2 text-xs text-slate-600 text-right">
                        <div className="flex items-center gap-2 justify-start">
                          <UserCheck size={15} className="text-slate-400 shrink-0" />
                          <span>المدرب: <strong className="text-slate-800">{course.trainer_name || 'غير محدد'}</strong></span>
                        </div>

                        <div className="flex items-center gap-2 justify-start">
                          <MapPin size={15} className="text-slate-400 shrink-0" />
                          <span>المكان: <strong className="text-slate-800">{formatLocation(course)}</strong></span>
                        </div>

                        {activeTrack === TRACK_EXTERNAL && course.country && (
                          <div className="flex items-center gap-2 justify-start">
                            <Globe size={15} className="text-blue-500 shrink-0" />
                            <span>الدولة المضيفة: <strong className="text-blue-800">{course.country}</strong></span>
                          </div>
                        )}

                        {course.provider && (
                          <div className="flex items-center gap-2 justify-start">
                            <Building2 size={15} className="text-slate-400 shrink-0" />
                            <span>الجهة المنفذة: <strong className="text-slate-800">{course.provider}</strong></span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 justify-start">
                          <Calendar size={15} className="text-slate-400 shrink-0" />
                          <span>الفترة: <strong className="text-slate-800">{course.start_date} إلى {course.end_date}</strong> ({course.days} أيام / {course.hours} ساعة)</span>
                        </div>

                        {course.order_number && (
                          <div className="flex items-center gap-2 justify-start">
                            <FileText size={15} className="text-slate-400 shrink-0" />
                            <span>الأمر الإداري: <strong className="text-slate-800">{course.order_number}</strong></span>
                          </div>
                        )}

                        {isOutside && (course.outside_plan_reason || course.outsidePlanReason) && (
                          <div className="flex items-start gap-2 justify-start text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200/90 mt-2">
                            <ShieldAlert size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <span className="text-xs leading-snug">
                              سبب الإضافة خارج الخطة: <strong className="font-bold">{course.outside_plan_reason || course.outsidePlanReason}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions Row (RTL Aligned) */}
                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-right" dir="rtl">
                      {/* Enroll Trainees Button */}
                      <Button
                        size="sm"
                        onClick={() => openEnrollModal(course)}
                        className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold h-8.5 px-3 gap-1.5 shadow-xs cursor-pointer"
                        title="إدراج وإدارة المتدربين"
                      >
                        <UserPlus size={14} />
                        إدراج المتدربين ({courseEnrollments.length})
                      </Button>

                      {/* Status Management Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {!isExecuted ? (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(course, 'منفذة')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold h-8.5 px-2.5 gap-1 shadow-xs cursor-pointer"
                            title="تغيير حالة الدورة إلى منفذة"
                          >
                            <PlayCircle size={14} />
                            بدء التنفيذ
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(course, 'غير منفذة')}
                            className="bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold h-8.5 px-2.5 gap-1 cursor-pointer"
                            title="إعادة تعيين الحالة إلى غير منفذة"
                          >
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            منفذة
                          </Button>
                        )}

                        {!isCancelled ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(course, 'ملغاة')}
                            className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 rounded-xl text-xs font-bold h-8.5 px-2.5 gap-1 cursor-pointer"
                            title="إلغاء هذه الدورة التدريبية"
                          >
                            <XCircle size={14} />
                            إلغاء الدورة
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleUpdateStatus(course, 'غير منفذة')}
                            className="bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 rounded-xl text-xs font-bold h-8.5 px-2.5 gap-1 cursor-pointer"
                            title="إعادة تفعيل الدورة"
                          >
                            <RotateCcw size={13} />
                            تفعيل
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
        )}
      </Tabs>



      {/* 2. Modal: Trainers Directory (دليل وتعيين المدربين) */}
      {showTrainerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-700">
                  <UserCheck size={22} />
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-[#1B3A6B]">دليل وسجلات المدربين (الداخليين والخارجيين)</h3>
                  <p className="text-xs text-slate-500">تعيين وإدارة بيانات المدربين المعتمدين وحالات اعتمادهم</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowTrainerModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            {/* Trainer Form Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-6">
              <h4 className="font-bold text-[#1B3A6B] text-xs mb-3 flex items-center gap-2">
                <Plus size={14} />
                {editingTrainer ? 'تعديل بيانات مدرب' : 'إضافة مدرب جديد للدليل'}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <Label className="text-[11px] font-bold">اسم المدرب الثلاثي *</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="مثال: د. علي عبد الحسين"
                    value={trainerForm.full_name}
                    onChange={e => setTrainerForm(p => ({ ...p, full_name: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-bold">التخصص الأساسي</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="إداري، نفطي، حاسوب، HSE"
                    value={trainerForm.specialization}
                    onChange={e => setTrainerForm(p => ({ ...p, specialization: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-bold">نوع المدرب</Label>
                  <Select value={trainerForm.trainer_type} onValueChange={v => setTrainerForm(p => ({ ...p, trainer_type: v }))}>
                    <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="داخلي">داخلي (من كوادر الشركة)</SelectItem>
                      <SelectItem value="خارجي">خارجي (من جهة/معهد خارجي)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] font-bold">حالة اعتماد المدرب</Label>
                  <Select value={trainerForm.status} onValueChange={v => setTrainerForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRAINER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] font-bold">الجهة / الشركة / المعهد</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="اسم الجهة المنتمي إليها"
                    value={trainerForm.organization}
                    onChange={e => setTrainerForm(p => ({ ...p, organization: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-bold">رقم الهاتف</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="0770XXXXXXX"
                    value={trainerForm.phone}
                    onChange={e => setTrainerForm(p => ({ ...p, phone: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-bold">التقييم الأكاديمي/المهني</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="ممتاز / خبير"
                    value={trainerForm.rating}
                    onChange={e => setTrainerForm(p => ({ ...p, rating: e.target.value }))}
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button className="w-full bg-[#1B3A6B] text-white rounded-xl font-bold h-9 text-xs" onClick={handleSaveTrainer}>
                    {editingTrainer ? 'تحديث البيانات' : 'إضافة المدرب'}
                  </Button>
                  {editingTrainer && (
                    <Button variant="outline" className="rounded-xl h-9 text-xs" onClick={() => {
                      setEditingTrainer(null);
                      setTrainerForm({ full_name: '', specialization: '', trainer_type: 'داخلي', organization: '', phone: '', email: '', status: 'معتمد', rating: 'ممتاز', notes: '' });
                    }}>
                      إلغاء
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Trainers Table */}
            <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                  <tr>
                    <th className="p-3">اسم المدرب</th>
                    <th className="p-3">التخصص</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">الجهة</th>
                    <th className="p-3">الهاتف</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {trainers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">لا يوجد مدربين في الدليل حالياً</td>
                    </tr>
                  ) : trainers.map(tr => (
                    <tr key={tr.id} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-[#1B3A6B]">{tr.full_name}</td>
                      <td className="p-3">{tr.specialization || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${tr.trainer_type === 'داخلي' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                          {tr.trainer_type}
                        </span>
                      </td>
                      <td className="p-3">{tr.organization || '—'}</td>
                      <td className="p-3">{tr.phone || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tr.status === 'معتمد' ? 'bg-emerald-100 text-emerald-800' :
                          tr.status === 'قيد التجريب' ? 'bg-amber-100 text-amber-800' :
                          tr.status === 'زائر' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {tr.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50" title="عرض التفاصيل" onClick={() => setSelectedTrainerForView(tr)}>
                            <Eye size={14} />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:bg-amber-50" title="تعديل البيانات" onClick={() => handleEditTrainer(tr)}>
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-7 w-7 ${
                              tr.status === 'مقيد ومحظور' || tr.status === 'محظور'
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-rose-600 hover:bg-rose-50'
                            }`}
                            title={tr.status === 'مقيد ومحظور' || tr.status === 'محظور' ? 'إلغاء تقييد واعتماد' : 'تقييد وحظر'}
                            onClick={(e) => handleToggleRestrictTrainer(tr, e)}
                          >
                            {tr.status === 'مقيد ومحظور' || tr.status === 'محظور' ? <Unlock size={14} /> : <Lock size={14} />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" title="حذف المدرب" onClick={(e) => handleDeleteTrainer(tr.id, e)}>
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
        </div>
      )}

      {/* 3. Modal: Annual Plan Configuration (إعداد أهداف الخطة السنوية) */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Target className="text-amber-600 shrink-0" size={22} />
                <h3 className="font-bold text-[#1B3A6B] text-base">إعداد معيار الخطة السنوية</h3>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowPlanModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-4 text-xs font-bold text-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label>المجال / المسار التدريبي</Label>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 mt-1 font-bold text-[#1B3A6B]">
                    {planForm.track}
                  </div>
                </div>

                <div>
                  <Label>السنة المستهدفة *</Label>
                  <Input
                    type="number"
                    min={1990}
                    max={2100}
                    className="mt-1 rounded-xl font-bold border-slate-200"
                    value={planForm.year}
                    onChange={e => setPlanForm(p => ({ ...p, year: parseInt(e.target.value) || selectedYear }))}
                  />
                </div>
              </div>

              <div>
                <Label>عدد الدورات / البرامج المخططة لسنة {planForm.year} *</Label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1 rounded-xl"
                  value={planForm.planned_courses_count}
                  onChange={e => setPlanForm(p => ({ ...p, planned_courses_count: e.target.value }))}
                />
              </div>

              <div>
                <Label>عدد المتدربين المستهدفين (المخطط) *</Label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1 rounded-xl"
                  value={planForm.planned_trainees_count}
                  onChange={e => setPlanForm(p => ({ ...p, planned_trainees_count: e.target.value }))}
                />
              </div>

              <div>
                <Label>الميزانية التقديرية المخصصة (د.ع / $)</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 rounded-xl"
                  value={planForm.planned_budget}
                  onChange={e => setPlanForm(p => ({ ...p, planned_budget: e.target.value }))}
                />
              </div>

              <div>
                <Label>ملاحظات الخطة والتعليمات الإدارية</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder="ملاحظات توجيهية حول الخطة..."
                  value={planForm.notes}
                  onChange={e => setPlanForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowPlanModal(false)}>إلغاء</Button>
              <Button className="bg-[#1B3A6B] text-white rounded-xl font-bold px-5" onClick={handleSavePlan}>حفظ الأهداف</Button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Trainees Enrollment & Results Management (تسجيل المتدربين والنتائج) */}
      {showEnrollModal && selectedCourseForEnroll && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="text-right">
                <div className="flex items-center gap-2 justify-start">
                  <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{selectedCourseForEnroll.category}</Badge>
                  <h3 className="text-lg font-bold text-[#1B3A6B]">
                    إدارة المتدربين والنتائج: {selectedCourseForEnroll.course_name}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  تاريخ الانعقاد: {selectedCourseForEnroll.start_date} إلى {selectedCourseForEnroll.end_date} | المدرب: {selectedCourseForEnroll.trainer_name || 'غير محدد'}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowEnrollModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            {/* Excel Batch Trainee Import & Template Download Banner Box */}
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 p-4 rounded-2xl border border-emerald-200/90 mb-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                  <FileSpreadsheet size={22} />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950 text-xs sm:text-sm flex items-center gap-1.5">
                    استيراد وجبة متدربين مجمعة بواسطة رقم الشركة (Excel)
                  </h4>
                  <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    رفع ملف إكسل يحتوي فقط على قائمة (رقم الشركة) للموظفين لإدراجهم مباشرة بالدورة وتوفير وقت الإدخال اليدوي (يتم مطابقة الأسماء من قيد الموظفين بالنظام تلقائياً، وإدخال الدرجات والنتائج يتم لاحقاً عبر النظام).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadTraineesTemplate}
                  className="bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300 rounded-xl text-xs font-bold gap-1.5 h-9 px-3.5 cursor-pointer shadow-2xs"
                  title="تنزيل نموذج إكسل يحتوي على عمود رقم الشركة فقط"
                >
                  <Download size={15} className="text-emerald-700" />
                  تنزيل نموذج رقم الشركة
                </Button>

                <label className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold gap-1.5 h-9 px-4 cursor-pointer inline-flex items-center justify-center shadow-xs transition-all">
                  <Upload size={15} />
                  <span>رفع ملف أرقام الشركة (Excel)</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={handleExcelFileUpload}
                  />
                </label>
              </div>
            </div>

            {/* Enroll New Trainee Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-[#1B3A6B] text-xs flex items-center gap-1.5">
                  <UserCheck size={16} className="text-blue-600" />
                  إضافة وتسجيل متدرب / مشارك جديد في هذه الدورة
                </h4>

                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setEnrollType('INTERNAL')}
                    className={`px-3 py-1 rounded-md transition-all ${enrollType === 'INTERNAL' ? 'bg-[#1B3A6B] text-white shadow-sm' : 'text-slate-600'}`}
                  >
                    موظف من الشركة
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnrollType('EXTERNAL')}
                    className={`px-3 py-1 rounded-md transition-all ${enrollType === 'EXTERNAL' ? 'bg-[#1B3A6B] text-white shadow-sm' : 'text-slate-600'}`}
                  >
                    مشارك خارجي / طالب
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {enrollType === 'INTERNAL' ? (
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-bold">اختر الموظف من الشركة *</Label>
                    <Select value={enrollForm.employee_id.toString()} onValueChange={v => setEnrollForm(p => ({ ...p, employee_id: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue placeholder="بحث عن موظف..." /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {employees.map(e => (
                          <SelectItem key={e.id} value={e.id.toString()}>
                            {e.full_name || e.fullName} — (رقم الشركة: {e.company_number || e.employee_number || e.job_number || e.employee_code || e.id}) — ({e.department || 'الشركة'}) — (الدرجة: {e.grade || 'غير محددة'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-[11px] font-bold">اسم المشارك الخارجي *</Label>
                      <Input
                        className="mt-1 rounded-xl bg-white"
                        placeholder="الاسم الثلاثي أو الرباعي"
                        value={enrollForm.external_participant_name}
                        onChange={e => setEnrollForm(p => ({ ...p, external_participant_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold">رقم الشركة / المعرف (يدوياً)</Label>
                      <Input
                        className="mt-1 rounded-xl bg-white font-mono"
                        placeholder="أدخل رقم التعريف الخارجي"
                        value={enrollForm.external_employee_number}
                        onChange={e => setEnrollForm(p => ({ ...p, external_employee_number: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {enrollType === 'EXTERNAL' ? (
                  <div>
                    <Label className="text-[11px] font-bold">الجهة / القسم (تلقائي أو يدوي)</Label>
                    <Input
                      className="mt-1 rounded-xl bg-white"
                      placeholder="اتركه فارغاً ليُكتب تلقائياً: مشارك خارجي"
                      value={enrollForm.external_participant_entity}
                      onChange={e => setEnrollForm(p => ({ ...p, external_participant_entity: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[11px] font-bold">الجهة / القسم الحالي</Label>
                    <Input
                      disabled
                      className="mt-1 rounded-xl bg-slate-100 font-bold text-slate-700"
                      value={enrollForm.employee_id && empMap[enrollForm.employee_id] ? (empMap[enrollForm.employee_id].department || 'الشركة') : 'الشركة العامة'}
                    />
                  </div>
                )}

                <div>
                  <Label className="text-[11px] font-bold">النتيجة والدرجة المئوية (من 100)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    className="mt-1 rounded-xl bg-white font-bold"
                    placeholder="مثال: 85"
                    value={enrollForm.score}
                    onChange={e => setEnrollForm(p => ({ ...p, score: sanitizeScoreInput(e.target.value) }))}
                  />
                </div>

                {/* Grade Mismatch Warning Banner in Form */}
                {enrollType === 'INTERNAL' && enrollForm.employee_id && (() => {
                  const selectedEmp = empMap[enrollForm.employee_id];
                  const gradeCheck = checkEmployeeCourseGradeMatch(selectedEmp, selectedCourseForEnroll);
                  if (!gradeCheck.isMatch) {
                    return (
                      <div className="md:col-span-4 bg-amber-50 border border-amber-300/90 p-2.5 rounded-xl flex items-center gap-2.5 text-xs text-amber-900 animate-in fade-in">
                        <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                        <div className="flex-1 font-medium">
                          <span className="font-bold text-amber-950">تنبيه عدم مطابقة الدرجة الوظيفية: </span>
                          الدرجة الوظيفية للموظف المختار <strong>({gradeCheck.empGradeLabel})</strong> خارج الدرجات المحددة لهذه الدورة التدريبية <strong>({gradeCheck.targetLabel || 'غير محددة'})</strong>. يمكنك الاستمرار بإضافته وسيتم وضع مؤشر عدم المطابقة بوضوح أمام اسمه.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="md:col-span-4 flex items-center gap-3">
                  {/* Live Rating Preview Badge */}
                  <div className="bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200/80 flex items-center gap-2 text-xs flex-1">
                    <span className="font-bold text-blue-900">التقدير المحسوب تلقائياً:</span>
                    {(() => {
                      const calc = computeGradeRating(enrollForm.score);
                      return (
                        <span className={`px-2.5 py-0.5 rounded-md font-extrabold ${
                          calc.rating === 'ممتاز' ? 'bg-emerald-100 text-emerald-800' :
                          calc.rating === 'جيد جداً' ? 'bg-blue-100 text-blue-800' :
                          calc.rating === 'جيد' ? 'bg-indigo-100 text-indigo-800' :
                          calc.rating === 'متوسط' ? 'bg-amber-100 text-amber-800' :
                          calc.rating === 'مقبول' ? 'bg-slate-200 text-slate-800' :
                          calc.rating === 'ضعيف' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {calc.rating}
                        </span>
                      );
                    })()}
                  </div>

                  <Button className="bg-[#1B3A6B] hover:bg-[#142d54] text-white rounded-xl font-bold h-9 text-xs px-6 cursor-pointer" onClick={() => handleSaveEnrollment()}>
                    إضافة المتدرب للقائمة
                  </Button>
                </div>
              </div>
            </div>

            {/* Top Bar for Trainees List Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-slate-100/90 p-3 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-2">
                <UserCheck size={18} className="text-[#1B3A6B]" />
                <h4 className="font-bold text-[#1B3A6B] text-xs">
                  قائمة المتدربين والنتائج لهذه الدورة ({currentCourseEnrollments.length})
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleOpenBatchGradeModal}
                  className="bg-[#1B3A6B] hover:bg-[#142d54] text-white rounded-xl text-xs font-bold gap-1.5 h-8.5 px-3 cursor-pointer"
                  title="إدخال نتائج ودرجات جميع المشاركين"
                >
                  <GraduationCap size={15} />
                  إدخال درجات المشاركين
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleOpenCertTypeSelection('BATCH', selectedCourseForEnroll)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold gap-1.5 h-8.5 px-3 cursor-pointer"
                  title="طباعة الشهادات لجميع المشاركين (اختيار شهادة مشاركة أو شهادة إجتياز)"
                >
                  <Printer size={15} />
                  طباعة الشهادات لجميع المشاركين
                </Button>
              </div>
            </div>

            {/* Enrolled Trainees List Table */}
            <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3">اسم المتدرب</th>
                    <th className="p-3">رقم الشركة</th>
                    <th className="p-3">الجهة / القسم</th>
                    <th className="p-3 text-center">النتيجة</th>
                    <th className="p-3 text-center">التقدير التلقائي</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {currentCourseEnrollments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">لا يوجد متدربين مسجلين في هذه الدورة حتى الآن</td>
                    </tr>
                  ) : currentCourseEnrollments.map(en => {
                    let name = '';
                    let code = '';
                    let entity = '';

                    if (en.is_external_participant) {
                      name = en.external_participant_name || 'مشارك خارجي';
                      code = en.external_employee_number || '—';
                      entity = en.external_participant_entity || 'مشارك خارجي';
                    } else {
                      const emp = empMap[en.employee_id];
                      name = emp ? (emp.full_name || emp.fullName) : `موظف #${en.employee_id}`;
                      code = emp ? (emp.company_number || emp.employee_number || emp.job_number || emp.employee_code || emp.id) : '—';
                      entity = emp ? (emp.department || 'الشركة') : 'الشركة';
                    }

                    const isInternal = !en.is_external_participant;
                    const emp = isInternal ? empMap[en.employee_id] : null;
                    const gradeCheck = isInternal ? checkEmployeeCourseGradeMatch(emp, selectedCourseForEnroll) : { isMatch: true };

                    const scoreDisplay = (en.score !== null && en.score !== undefined && String(en.score).trim() !== '') ? en.score : '-';
                    const calcRating = computeGradeRating(en.score || en.grade);
                    const ratingDisplay = calcRating.rating;
                    const isQualifiedForCert = calcRating.rating !== '—' && scoreDisplay !== '-';

                    return (
                      <tr key={en.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-[#1B3A6B]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{name}</span>
                            {en.is_external_participant && <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-1.5 py-0.5 rounded">(مشارك خارجي)</span>}
                            {isInternal && !gradeCheck.isMatch && (
                              <Badge
                                variant="outline"
                                className="bg-amber-100/90 text-amber-900 border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                                title={gradeCheck.reason}
                              >
                                <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                                غير مطابق للدرجة الوظيفية ({gradeCheck.empGradeLabel})
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">{code}</td>
                        <td className="p-3">{entity}</td>
                        <td className="p-3 text-center font-bold text-slate-800 font-mono">{scoreDisplay}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-lg font-bold text-xs inline-block ${
                            ratingDisplay === 'ممتاز' ? 'bg-emerald-100 text-emerald-800' :
                            ratingDisplay === 'جيد جداً' ? 'bg-blue-100 text-blue-800' :
                            ratingDisplay === 'جيد' ? 'bg-indigo-100 text-indigo-800' :
                            ratingDisplay === 'متوسط' ? 'bg-amber-100 text-amber-800' :
                            ratingDisplay === 'مقبول' ? 'bg-slate-200 text-slate-800' :
                            ratingDisplay === 'ضعيف' ? 'bg-rose-100 text-rose-800' :
                            'text-slate-400 bg-slate-100'
                          }`}>
                            {ratingDisplay}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Enter / Edit Result */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSingleGrade(en)}
                              className="h-7 rounded-lg text-[11px] border-blue-600 text-blue-700 hover:bg-blue-50 gap-1 font-bold cursor-pointer"
                              title="إدخال أو تعديل النتيجة والتقدير"
                            >
                              <Edit size={12} />
                              إدخال النتيجة
                            </Button>

                            {/* Print Certificate (Choice of Participation or Completion) */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenCertTypeSelection('SINGLE', selectedCourseForEnroll, en)}
                              className="h-7 rounded-lg text-[11px] gap-1 font-bold border-emerald-600 text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                              title="طباعة شهادة المتدرب (اختيار شهادة مشاركة أو شهادة إجتياز)"
                            >
                              <Printer size={12} />
                              طباعة الشهادة
                            </Button>

                            {/* Remove Trainee */}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteEnrollment(en.id)}
                              className="h-7 w-7 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="إزالة المتدرب من الدورة"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Certificate Type Selection (تحديد نوع الشهادة: مشاركة أم إجتياز) */}
      {showCertTypeModal && certSelectTarget && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 text-right">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#1B3A6B]/10 text-[#1B3A6B] rounded-2xl border border-blue-200 shrink-0">
                  <Award size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1B3A6B]">تحديد نوع الشهادة التدريبية</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {certSelectTarget.mode === 'SINGLE' && certSelectTarget.enrollment ? (
                      <>
                        المتدرب: <strong className="text-slate-800">
                          {certSelectTarget.enrollment.is_external_participant
                            ? certSelectTarget.enrollment.external_participant_name
                            : (empMap[certSelectTarget.enrollment.employee_id]?.full_name || empMap[certSelectTarget.enrollment.employee_id]?.fullName || 'المتدرب')}
                        </strong>
                      </>
                    ) : (
                      <>
                        طباعة جماعية لجميع المتدربين ({currentCourseEnrollments.length} مشارك)
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowCertTypeModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-3.5 my-4">
              <p className="text-xs font-bold text-slate-600 mb-2">
                يرجى اختيار نموذج الشهادة المطلوب إصداره وطباعته:
              </p>

              {/* Option 1: Participation Certificate */}
              <button
                type="button"
                onClick={() => handleSelectCertType('PARTICIPATION')}
                className="w-full text-right p-4 rounded-2xl border-2 border-amber-200 bg-gradient-to-r from-amber-50/70 to-white hover:border-amber-500 hover:shadow-md transition-all group cursor-pointer flex items-start gap-3.5"
              >
                <div className="p-3 bg-amber-100 text-amber-800 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors shrink-0">
                  <FileText size={22} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#1B3A6B] text-sm group-hover:text-amber-900">1. شهادة مشاركة</span>
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold">بدون درجة او تقدير</Badge>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    تُثبت حضور ومشاركة المتدرب في الدورة التدريبية للفترة المحددة وعدد الأيام والساعات. <strong className="text-amber-900">تطبع مباشرة دون الحاجة لرصد درجة</strong>.
                  </p>
                </div>
              </button>

              {/* Option 2: Achievement / Completion Certificate */}
              <button
                type="button"
                onClick={() => handleSelectCertType('COMPLETION')}
                className="w-full text-right p-4 rounded-2xl border-2 border-emerald-200 bg-gradient-to-r from-emerald-50/70 to-white hover:border-emerald-600 hover:shadow-md transition-all group cursor-pointer flex items-start gap-3.5"
              >
                <div className="p-3 bg-emerald-100 text-emerald-800 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors shrink-0">
                  <GraduationCap size={22} />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#1B3A6B] text-sm group-hover:text-emerald-950">2. شهادة إجتياز</span>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] font-bold">تتطلب درجة وتقدير</Badge>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    تُثبت إجتياز المتدرب للدورة بنجاح وتتطلب وجود درجة مئوية وتقدير محدد وتظهر النتيجة والتقدير صراحةً في الشهادة.
                  </p>
                  {certSelectTarget.mode === 'SINGLE' && certSelectTarget.enrollment && !((computeGradeRating(certSelectTarget.enrollment.score || certSelectTarget.enrollment.grade).rating !== '—') || certSelectTarget.enrollment.score) && (
                    <div className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      ملاحظة: لم يتم رصد درجة لهذا المتدرب بعد (يلزم إدخال الدرجة أولاً قبل إصداره).
                    </div>
                  )}
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <Button variant="ghost" onClick={() => setShowCertTypeModal(false)} className="rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800">
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Printable Certificate Modal (Single Participant) */}
      {showCertModal && certData && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-6 sm:p-8 shadow-2xl relative border-2 border-amber-500/30 my-4 sm:my-8 animate-in fade-in zoom-in-95">
            {/* Top Toolbar (Sticky & Always Visible, Hidden on Print) */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 pt-4 border-b border-slate-200 print:hidden -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 mb-6 shadow-xs rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl border shrink-0 ${
                  certData.certType === 'COMPLETION' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  <Award size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-[#1B3A6B] text-base sm:text-lg">
                    {certData.certType === 'COMPLETION' ? 'معاينة شهادة إجتياز' : 'معاينة شهادة مشاركة'} (A4 Landscape)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    المتدرب: <span className="font-bold text-slate-800">{certData.participantName}</span> | الجهة: <span className="font-bold text-slate-800">{beneficiaryName}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
                {/* Mode Switcher Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setCertData(prev => ({ ...prev, certType: 'PARTICIPATION' }))}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      certData.certType === 'PARTICIPATION' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📜 شهادة مشاركة
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!certData.hasValidScore) {
                        toast({
                          title: '⚠️ تنبيه: الدرجة غير مدخلة',
                          description: 'شهادة الإجتياز تتطلب درجة وتقدير. يرجى رصد الدرجة أولاً لظهور تفاصيل النتيجة.',
                          variant: 'destructive'
                        });
                      }
                      setCertData(prev => ({ ...prev, certType: 'COMPLETION' }));
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      certData.certType === 'COMPLETION' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🏆 شهادة إجتياز
                  </button>
                </div>

                <Button onClick={() => handlePrintCertificates([certData])} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2 px-4 h-9 cursor-pointer shadow-sm text-xs">
                  <Printer size={16} />
                  طباعة الشهادة (A4)
                </Button>
                <Button variant="outline" onClick={() => setShowCertModal(false)} className="rounded-xl border-slate-300 hover:bg-slate-100 text-slate-700 font-bold gap-1.5 px-3.5 h-9 cursor-pointer text-xs">
                  <X size={16} />
                  خروج
                </Button>
              </div>
            </div>

            {/* Printable Certificate Frame */}
            <div className={`p-8 md:p-10 border-8 border-double ${
              certData.certType === 'COMPLETION' ? 'border-[#065f46] outline-2 outline-emerald-500 bg-gradient-to-br from-emerald-50/40 via-white to-emerald-50/40' : 'border-[#1B3A6B] outline-2 outline-amber-600 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/40'
            } -outline-offset-8 rounded-2xl text-center relative overflow-hidden shadow-inner flex flex-col justify-between min-h-[500px]`}>
              {/* Decorative Corner Ornaments */}
              <div className={`absolute top-3 right-3 opacity-30 font-serif text-3xl font-black ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
              <div className={`absolute top-3 left-3 opacity-30 font-serif text-3xl font-black ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
              <div className={`absolute bottom-3 right-3 opacity-30 font-serif text-3xl font-black ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
              <div className={`absolute bottom-3 left-3 opacity-30 font-serif text-3xl font-black ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>

              {/* Header */}
              <div className={`flex items-center justify-between border-b-2 pb-4 mb-4 ${certData.certType === 'COMPLETION' ? 'border-emerald-600/40' : 'border-amber-600/40'}`}>
                <div className="text-right text-xs font-bold text-slate-800 space-y-0.5">
                  <div>جمهورية العراق</div>
                  <div className={`text-base font-black ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>{beneficiaryName || 'شركة نفط الوسط'}</div>
                  <div className={`font-bold text-xs ${certData.certType === 'COMPLETION' ? 'text-emerald-800' : 'text-amber-800'}`}>قسم التدريب والتطوير</div>
                </div>

                <div className="flex flex-col items-center">
                  {logoUrl ? (
                    <img src={logoUrl} alt="شعار المؤسسة" className="w-16 h-16 object-contain mb-1 drop-shadow-xs" />
                  ) : (
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-amber-400 shadow-inner mb-1 ${certData.certType === 'COMPLETION' ? 'bg-[#065f46]' : 'bg-[#1B3A6B]'}`}>
                      <GraduationCap size={36} />
                    </div>
                  )}
                  <div className={`text-[10px] font-black tracking-widest uppercase ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>
                    {certData.certType === 'COMPLETION' ? 'CERTIFICATE OF ACHIEVEMENT' : 'CERTIFICATE OF PARTICIPATION'}
                  </div>
                </div>

                <div className="text-left text-xs font-bold text-slate-700 space-y-0.5 font-mono">
                  <div>الرقم: {certData.certNo}</div>
                  <div>التاريخ: {certData.issueDate}</div>
                </div>
              </div>

              {/* Certificate Main Title */}
              <div className="my-3">
                <h2 className={`text-3xl md:text-4xl font-black tracking-wide font-serif ${certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>
                  {certData.certType === 'COMPLETION' ? 'شهادة إجتياز' : 'شهادة مشاركة'}
                </h2>
                <div className={`w-32 h-1.5 mx-auto mt-2 rounded-full ${certData.certType === 'COMPLETION' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </div>

              {/* Certificate Body Text */}
              <div className="space-y-4 my-4 text-slate-800 leading-relaxed text-sm md:text-base font-medium max-w-3xl mx-auto w-full">
                <p>
                  {certData.certType === 'COMPLETION'
                    ? 'تأكيداً على كفاءة الأداء والتطوير المستمر للمهارات، تُشهد هذه الإدارة بأن السيد / السيدة:'
                    : 'تأكيداً على الحرص والسعي المستمر لتطوير القدرات والمهارات الميدانية، تُشهد هذه الإدارة بأن السيد / السيدة:'}
                </p>

                <div className={`text-2xl md:text-3xl font-black py-2 border-b-2 border-dashed border-slate-300 inline-block px-8 ${
                  certData.certType === 'COMPLETION' ? 'text-[#065f46]' : 'text-[#1B3A6B]'
                }`}>
                  {certData.participantName}
                </div>

                <div className="text-xs md:text-sm text-slate-600 font-bold">
                  من ({certData.participantEntity || beneficiaryName}) — رقم الشركة: ({certData.participantCode || '—'})
                </div>

                <p className="mt-2">
                  {certData.certType === 'COMPLETION'
                    ? <>قد شارك/ت بنجاح واجتاز/ت البرنامج الـ <strong className="text-[#065f46]">({certData.courseType})</strong> التدريبي الموسوم:</>
                    : <>قد شارك/ت في البرنامج التدريبي الـ <strong className="text-amber-800">({certData.courseType})</strong> الموسوم:</>}
                </p>

                <div className={`text-xl md:text-2xl font-extrabold p-3.5 rounded-xl border my-2 shadow-xs ${
                  certData.certType === 'COMPLETION' ? 'text-emerald-950 bg-emerald-100/80 border-emerald-300' : 'text-amber-900 bg-amber-100/70 border-amber-300'
                }`}>
                  "{certData.courseName}"
                </div>

                <div className="text-xs md:text-sm text-slate-600 leading-relaxed">
                  {certData.certType === 'COMPLETION' ? (
                    <>
                      <div>المنعقدة في ({certData.location}) للفترة من <strong className="text-slate-900">{certData.startDate}</strong> إلى <strong className="text-slate-900">{certData.endDate}</strong> ({certData.days} أيام / {certData.hours} ساعة تدريبية)</div>
                      <div className="mt-1">وبنتيجة: <strong className="text-emerald-700 font-bold">({certData.result})</strong> ودرجة: <strong className="text-emerald-700 font-bold">({certData.score || ''})</strong> وتقدير: <strong className="text-emerald-700 font-bold">({certData.grade})</strong>.</div>
                    </>
                  ) : (
                    <>
                      المنعقدة في ({certData.location}) للفترة من <strong className="text-slate-900">{certData.startDate}</strong> إلى <strong className="text-slate-900">{certData.endDate}</strong> ({certData.days} أيام / {certData.hours} ساعة تدريبية).
                    </>
                  )}
                </div>
              </div>

              {/* Signatures Row */}
              <div className="grid grid-cols-3 gap-4 pt-4 mt-6 border-t border-slate-200 text-sm font-extrabold text-slate-800">
                <div className="text-center pt-12 pb-2">
                  <div className="text-slate-900 font-extrabold text-sm md:text-base">المحاضر</div>
                </div>

                <div className="text-center pt-12 pb-2">
                  <div className="text-slate-900 font-extrabold text-sm md:text-base">مدير قسم التدريب</div>
                </div>

                <div className="text-center pt-12 pb-2">
                  <div className="text-slate-900 font-extrabold text-sm md:text-base">مدير هيئة إدارة وتنمية الموارد البشرية</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Single Grade Entry (إدخال نتيجة وتقدير متدرب فردي) */}
      {singleGradeTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-right animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="text-[#1B3A6B]" size={20} />
                <h3 className="font-bold text-[#1B3A6B] text-base">إدخال نتيجة وتقدير المتدرب</h3>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSingleGradeTarget(null)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-4 text-xs font-bold text-slate-700">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-1.5">
                <div>
                  اسم المتدرب: <span className="text-[#1B3A6B] font-extrabold">
                    {singleGradeTarget.is_external_participant
                      ? singleGradeTarget.external_participant_name
                      : (empMap[singleGradeTarget.employee_id]?.full_name || empMap[singleGradeTarget.employee_id]?.fullName || 'متدرب')}
                  </span>
                </div>
                <div>
                  رقم الشركة: <span className="font-mono text-slate-900 font-bold">
                    {singleGradeTarget.is_external_participant
                      ? (singleGradeTarget.external_employee_number || '—')
                      : (empMap[singleGradeTarget.employee_id]?.company_number || empMap[singleGradeTarget.employee_id]?.employee_number || empMap[singleGradeTarget.employee_id]?.job_number || '—')}
                  </span>
                </div>
                <div>
                  الجهة / القسم: <span className="text-slate-800">
                    {singleGradeTarget.is_external_participant
                      ? (singleGradeTarget.external_participant_entity || 'مشارك خارجي')
                      : (empMap[singleGradeTarget.employee_id]?.department || 'الشركة')}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-800 block mb-1">الدرجة المئوية (من 0 إلى 100) *</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className="rounded-xl border-slate-300 font-bold text-base text-center h-10"
                  placeholder="أدخل درجة الاختبار مثلاً 85"
                  value={singleGradeScore}
                  onChange={e => setSingleGradeScore(sanitizeScoreInput(e.target.value))}
                />
              </div>

              {/* Live Rating Preview */}
              {(() => {
                const calc = computeGradeRating(singleGradeScore);
                return (
                  <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-900">التقدير التلقائي المحسوب:</span>
                    <span className={`px-3 py-1 rounded-lg font-black text-xs ${
                      calc.rating === 'ممتاز' ? 'bg-emerald-100 text-emerald-800' :
                      calc.rating === 'جيد جداً' ? 'bg-blue-100 text-blue-800' :
                      calc.rating === 'جيد' ? 'bg-indigo-100 text-indigo-800' :
                      calc.rating === 'متوسط' ? 'bg-amber-100 text-amber-800' :
                      calc.rating === 'مقبول' ? 'bg-slate-200 text-slate-800' :
                      calc.rating === 'ضعيف' ? 'bg-rose-100 text-rose-800' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {calc.rating}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setSingleGradeTarget(null)}>إلغاء</Button>
              <Button className="bg-[#1B3A6B] text-white rounded-xl font-bold px-5 cursor-pointer" onClick={handleSaveSingleGrade}>حفظ النتيجة والتقدير</Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Grade Entry (نافذة إدخال درجات المشاركين الجماعية) */}
      {showBatchGradeModal && selectedCourseForEnroll && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 text-right animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <GraduationCap className="text-[#1B3A6B]" size={22} />
                <div>
                  <h3 className="font-bold text-[#1B3A6B] text-base">نافذة إدخال نتائج ودرجات جميع المشاركين</h3>
                  <p className="text-xs text-slate-500">الدورة التدريبية: {selectedCourseForEnroll.course_name}</p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowBatchGradeModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl mb-4">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">اسم المتدرب</th>
                    <th className="p-3">رقم الشركة</th>
                    <th className="p-3">الجهة / القسم</th>
                    <th className="p-3 w-32 text-center">الدرجة (من 100)</th>
                    <th className="p-3 text-center">التقدير التلقائي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {currentCourseEnrollments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">لا يوجد متدربين مسجلين في هذه الدورة</td>
                    </tr>
                  ) : currentCourseEnrollments.map((en, idx) => {
                    let name = '';
                    let code = '';
                    let entity = '';

                    if (en.is_external_participant) {
                      name = en.external_participant_name || 'مشارك خارجي';
                      code = en.external_employee_number || '—';
                      entity = en.external_participant_entity || 'مشارك خارجي';
                    } else {
                      const emp = empMap[en.employee_id];
                      name = emp ? (emp.full_name || emp.fullName) : `موظف #${en.employee_id}`;
                      code = emp ? (emp.company_number || emp.employee_number || emp.job_number || emp.employee_code || emp.id) : '—';
                      entity = emp ? (emp.department || 'الشركة') : 'الشركة';
                    }

                    const isInternal = !en.is_external_participant;
                    const emp = isInternal ? empMap[en.employee_id] : null;
                    const gradeCheck = isInternal ? checkEmployeeCourseGradeMatch(emp, selectedCourseForEnroll) : { isMatch: true };

                    const currentVal = batchGradeData[en.id] ?? '';
                    const calc = computeGradeRating(currentVal);

                    return (
                      <tr key={en.id} className="hover:bg-slate-50">
                        <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-bold text-[#1B3A6B]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{name}</span>
                            {en.is_external_participant && <span className="mr-1 text-[10px] text-purple-700 font-bold">(خارجي)</span>}
                            {isInternal && !gradeCheck.isMatch && (
                              <Badge
                                variant="outline"
                                className="bg-amber-100/90 text-amber-900 border-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 shadow-2xs"
                                title={gradeCheck.reason}
                              >
                                <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                                غير مطابق للدرجة الوظيفية ({gradeCheck.empGradeLabel})
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-700">{code}</td>
                        <td className="p-3 text-slate-600">{entity}</td>
                        <td className="p-2 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            className="h-8 w-24 mx-auto text-center font-bold text-xs rounded-xl border-slate-300 focus:border-blue-500"
                            placeholder="0 - 100"
                            value={currentVal}
                            onChange={e => setBatchGradeData(prev => ({ ...prev, [en.id]: sanitizeScoreInput(e.target.value) }))}
                          />
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-lg font-bold text-xs inline-block ${
                            calc.rating === 'ممتاز' ? 'bg-emerald-100 text-emerald-800' :
                            calc.rating === 'جيد جداً' ? 'bg-blue-100 text-blue-800' :
                            calc.rating === 'جيد' ? 'bg-indigo-100 text-indigo-800' :
                            calc.rating === 'متوسط' ? 'bg-amber-100 text-amber-800' :
                            calc.rating === 'مقبول' ? 'bg-slate-200 text-slate-800' :
                            calc.rating === 'ضعيف' ? 'bg-rose-100 text-rose-800' :
                            'text-slate-400 bg-slate-100'
                          }`}>
                            {calc.rating}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowBatchGradeModal(false)}>إلغاء</Button>
              <Button className="bg-[#1B3A6B] text-white rounded-xl font-bold px-5 gap-1.5 cursor-pointer" onClick={handleSaveBatchGrades}>
                <CheckCircle2 size={16} />
                حفظ كافة الدرجات والنتائج
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Certificates Printable Modal (طباعة شهادات كافة المشاركين) */}
      {showBatchCertModal && batchCertificatesList.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-5xl w-full p-6 sm:p-8 shadow-2xl relative border-2 border-amber-500/30 my-4 sm:my-8 animate-in fade-in zoom-in-95">
            {/* Top Toolbar (Sticky & Always Visible, Hidden on Print) */}
            <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-4 pt-4 border-b border-slate-200 print:hidden -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 px-6 sm:px-8 mb-6 shadow-xs rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl border shrink-0 ${
                  batchCertType === 'COMPLETION' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  <Award size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-[#1B3A6B] text-base sm:text-lg">
                    {batchCertType === 'COMPLETION' ? 'طباعة شهادات إجتياز جماعية' : 'طباعة شهادات مشاركة جماعية'} ({batchCertificatesList.length} شهادة)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">الجهة: <span className="font-bold text-slate-800">{beneficiaryName}</span> - A4 Landscape</p>
                </div>
              </div>

              {/* Certificate Navigation & Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end shrink-0">
                {/* Certificate Type Switcher */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setBatchCertType('PARTICIPATION');
                      const certs = currentCourseEnrollments.map(en => createCertDataObject(selectedCourseForEnroll, en, 'PARTICIPATION'));
                      setBatchCertificatesList(certs);
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      batchCertType === 'PARTICIPATION' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📜 شهادات مشاركة ({currentCourseEnrollments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const qualified = currentCourseEnrollments.filter(en => {
                        const scoreVal = en.score || en.grade || '';
                        const calc = computeGradeRating(scoreVal);
                        return (calc.rating !== '—' && calc.rating !== '') || (en.score && String(en.score).trim() !== '');
                      });
                      if (qualified.length === 0) {
                        toast({
                          title: '⚠️ لا توجد درجات مدخلة',
                          description: 'لم يتم رصد درجات للمشاركين لشهادات الإجتياز بعد.',
                          variant: 'destructive'
                        });
                        return;
                      }
                      setBatchCertType('COMPLETION');
                      const certs = qualified.map(en => createCertDataObject(selectedCourseForEnroll, en, 'COMPLETION'));
                      setBatchCertificatesList(certs);
                    }}
                    className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                      batchCertType === 'COMPLETION' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🏆 شهادات إجتياز
                  </button>
                </div>

                {batchCertificatesList.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                    <Select
                      onValueChange={(idxStr) => {
                        const el = document.getElementById(`batch-cert-${idxStr}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <SelectTrigger className="h-8 bg-white border-slate-200 rounded-lg text-xs font-bold gap-1 min-w-[170px]">
                        <SelectValue placeholder="انتقل إلى شهادة..." />
                      </SelectTrigger>
                      <SelectContent position="popper" side="bottom">
                        {batchCertificatesList.map((c, i) => (
                          <SelectItem key={i} value={String(i)}>
                            <span className="font-bold">شهادة {i + 1}: {c.participantName}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button onClick={() => handlePrintCertificates(batchCertificatesList)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2 px-4 h-9 cursor-pointer shadow-sm text-xs">
                  <Printer size={16} />
                  طباعة كافة الشهادات ({batchCertificatesList.length})
                </Button>
                <Button variant="outline" onClick={() => setShowBatchCertModal(false)} className="rounded-xl border-slate-300 hover:bg-slate-100 text-slate-700 font-bold gap-1.5 px-3.5 h-9 cursor-pointer text-xs">
                  <X size={16} />
                  خروج
                </Button>
              </div>
            </div>

            {/* Printable Certificates List */}
            <div className="space-y-12">
              {batchCertificatesList.map((cert, index) => {
                const isCompletion = cert.certType === 'COMPLETION';
                return (
                  <div id={`batch-cert-${index}`} key={index} className={`p-8 md:p-10 border-8 border-double ${
                    isCompletion ? 'border-[#065f46] outline-2 outline-emerald-500 bg-gradient-to-br from-emerald-50/40 via-white to-emerald-50/40' : 'border-[#1B3A6B] outline-2 outline-amber-600 bg-gradient-to-br from-amber-50/40 via-white to-amber-50/40'
                  } -outline-offset-8 rounded-2xl text-center relative overflow-hidden shadow-inner flex flex-col justify-between min-h-[500px] scroll-mt-28`}>
                    {/* Badge for viewing order in preview */}
                    <div className={`absolute top-3 left-14 border text-[11px] font-black px-3 py-0.5 rounded-full print:hidden ${
                      isCompletion ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}>
                      شهادة ({index + 1} من {batchCertificatesList.length}) - {isCompletion ? 'إجتياز' : 'مشاركة'}
                    </div>

                    {/* Decorative Corner Ornaments */}
                    <div className={`absolute top-3 right-3 opacity-30 font-serif text-3xl font-black ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
                    <div className={`absolute top-3 left-3 opacity-30 font-serif text-3xl font-black ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
                    <div className={`absolute bottom-3 right-3 opacity-30 font-serif text-3xl font-black ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>
                    <div className={`absolute bottom-3 left-3 opacity-30 font-serif text-3xl font-black ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>❖</div>

                    {/* Header */}
                    <div className={`flex items-center justify-between border-b-2 pb-4 mb-4 ${isCompletion ? 'border-emerald-600/40' : 'border-amber-600/40'}`}>
                      <div className="text-right text-xs font-bold text-slate-800 space-y-0.5">
                        <div>جمهورية العراق</div>
                        <div className={`text-base font-black ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>{beneficiaryName || 'شركة نفط الوسط'}</div>
                        <div className={`font-bold text-xs ${isCompletion ? 'text-emerald-800' : 'text-amber-800'}`}>قسم التدريب والتطوير</div>
                      </div>

                      <div className="flex flex-col items-center">
                        {logoUrl ? (
                          <img src={logoUrl} alt="شعار المؤسسة" className="w-16 h-16 object-contain mb-1 drop-shadow-xs" />
                        ) : (
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-amber-400 shadow-inner mb-1 ${isCompletion ? 'bg-[#065f46]' : 'bg-[#1B3A6B]'}`}>
                            <GraduationCap size={36} />
                          </div>
                        )}
                        <div className={`text-[10px] font-black tracking-widest uppercase ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>
                          {isCompletion ? 'CERTIFICATE OF ACHIEVEMENT' : 'CERTIFICATE OF PARTICIPATION'}
                        </div>
                      </div>

                      <div className="text-left text-xs font-bold text-slate-700 space-y-0.5 font-mono">
                        <div>الرقم: {cert.certNo}</div>
                        <div>التاريخ: {cert.issueDate}</div>
                      </div>
                    </div>

                    {/* Title */}
                    <div className="my-3">
                      <h2 className={`text-3xl md:text-4xl font-black tracking-wide font-serif ${isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'}`}>
                        {isCompletion ? 'شهادة إجتياز' : 'شهادة مشاركة'}
                      </h2>
                      <div className={`w-32 h-1.5 mx-auto mt-2 rounded-full ${isCompletion ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    </div>

                    {/* Body */}
                    <div className="space-y-4 my-4 text-slate-800 leading-relaxed text-sm md:text-base font-medium max-w-3xl mx-auto w-full">
                      <p>
                        {isCompletion
                          ? 'تأكيداً على كفاءة الأداء والتطوير المستمر للمهارات، تُشهد هذه الإدارة بأن السيد / السيدة:'
                          : 'تأكيداً على الحرص والسعي المستمر لتطوير القدرات والمهارات الميدانية، تُشهد هذه الإدارة بأن السيد / السيدة:'}
                      </p>

                      <div className={`text-2xl md:text-3xl font-black py-2 border-b-2 border-dashed border-slate-300 inline-block px-8 ${
                        isCompletion ? 'text-[#065f46]' : 'text-[#1B3A6B]'
                      }`}>
                        {cert.participantName}
                      </div>

                      <div className="text-xs md:text-sm text-slate-600 font-bold">
                        من ({cert.participantEntity || beneficiaryName}) — رقم الشركة: ({cert.participantCode})
                      </div>

                      <p className="mt-2">
                        {isCompletion
                          ? <>قد شارك/ت بنجاح واجتاز/ت البرنامج الـ <strong className="text-[#065f46]">({cert.courseType})</strong> التدريبي الموسوم:</>
                          : <>قد شارك/ت في البرنامج التدريبي الـ <strong className="text-amber-800">({cert.courseType})</strong> الموسوم:</>}
                      </p>

                      <div className={`text-xl md:text-2xl font-extrabold p-3.5 rounded-xl border my-2 shadow-xs ${
                        isCompletion ? 'text-emerald-950 bg-emerald-100/80 border-emerald-300' : 'text-amber-900 bg-amber-100/70 border-amber-300'
                      }`}>
                        "{cert.courseName}"
                      </div>

                      <div className="text-xs md:text-sm text-slate-600 leading-relaxed">
                        {isCompletion ? (
                          <>
                            <div>المنعقدة في ({cert.location}) للفترة من <strong className="text-slate-900">{cert.startDate}</strong> إلى <strong className="text-slate-900">{cert.endDate}</strong> ({cert.days} أيام / {cert.hours} ساعة تدريبية)</div>
                            <div className="mt-1">وبنتيجة: <strong className="text-emerald-700 font-bold">({cert.result})</strong> ودرجة: <strong className="text-emerald-700 font-bold">({cert.score || ''})</strong> وتقدير: <strong className="text-emerald-700 font-bold">({cert.grade})</strong>.</div>
                          </>
                        ) : (
                          <>
                            المنعقدة في ({cert.location}) للفترة من <strong className="text-slate-900">{cert.startDate}</strong> إلى <strong className="text-slate-900">{cert.endDate}</strong> ({cert.days} أيام / {cert.hours} ساعة تدريبية).
                          </>
                        )}
                      </div>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-4 pt-4 mt-6 border-t border-slate-200 text-sm font-extrabold text-slate-800">
                      <div className="text-center pt-12 pb-2">
                        <div className="text-slate-900 font-extrabold text-sm md:text-base">المحاضر</div>
                      </div>

                      <div className="text-center pt-12 pb-2">
                        <div className="text-slate-900 font-extrabold text-sm md:text-base">مدير قسم التدريب</div>
                      </div>

                      <div className="text-center pt-12 pb-2">
                        <div className="text-slate-900 font-extrabold text-sm md:text-base">مدير هيئة إدارة وتنمية الموارد البشرية</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* View Trainer Profile & History Modal */}
      {selectedTrainerForView && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border ${
                  selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور'
                    ? 'bg-rose-100 text-rose-700 border-rose-200'
                    : 'bg-[#1B3A6B]/10 text-[#1B3A6B] border-blue-200'
                }`}>
                  {(selectedTrainerForView.full_name || '?').charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1B3A6B]">{selectedTrainerForView.full_name}</h3>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {selectedTrainerForView.trainer_code && (
                      <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-mono text-[10px] font-bold">
                        كود الاعتماد: {selectedTrainerForView.trainer_code}
                      </Badge>
                    )}
                    {selectedTrainerForView.employee_code && (
                      <Badge className="bg-blue-100 text-[#1B3A6B] border-blue-300 font-mono text-[10px] font-bold">
                        رقم الشركة: {selectedTrainerForView.employee_code}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelectedTrainerForView(null)} className="rounded-full cursor-pointer">
                <X size={18} />
              </Button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block mb-1">نوع المدرب:</span>
                  <span className="font-bold text-slate-800">{selectedTrainerForView.trainer_type || 'داخلي'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block mb-1">حالة الاعتماد:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] inline-flex items-center gap-1 ${
                    selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : selectedTrainerForView.status === 'قيد الاعتماد'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    {selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور' ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
                    {selectedTrainerForView.status || 'معتمد'}
                  </span>
                </div>

                {/* Contact Info & Quick Contact QR Block */}
                <div className="col-span-2 bg-gradient-to-r from-blue-50/90 to-slate-50 border border-blue-200/80 p-3.5 rounded-2xl shadow-xs my-1">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="space-y-2 text-right w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-[#1B3A6B] text-white text-[10px]">معلومات الاتصال المباشر</Badge>
                        <span className="text-[10px] text-slate-500 font-bold">تتحدث تلقائياً مع التعديل</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mt-1">
                        <div className="flex items-center gap-2">
                          <Phone size={14} className="text-emerald-600 shrink-0" />
                          <span className="text-xs text-slate-500">الهاتف المحمول:</span>
                          <span className="font-bold font-mono text-slate-900 dir-ltr text-xs">
                            {selectedTrainerForView.phone || 'غير مدخل'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <PhoneCall size={14} className="text-blue-600 shrink-0" />
                          <span className="text-xs text-slate-500">هاتف العمل:</span>
                          <span className="font-bold font-mono text-slate-900 dir-ltr text-xs">
                            {selectedTrainerForView.work_phone || 'غير مدخل'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 col-span-1 sm:col-span-2">
                          <Mail size={14} className="text-amber-600 shrink-0" />
                          <span className="text-xs text-slate-500">البريد الإلكتروني:</span>
                          <span className="font-bold text-slate-900 text-xs">
                            {selectedTrainerForView.email || 'غير مدخل'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {(selectedTrainerForView.phone || selectedTrainerForView.work_phone || selectedTrainerForView.email) && (
                      <div className="flex flex-col items-center justify-center bg-white p-2.5 rounded-2xl border border-blue-200 shadow-sm shrink-0">
                        <QRCodeSVG
                          value={generateContactQRPayload(selectedTrainerForView)}
                          size={80}
                          level="M"
                          includeMargin={false}
                        />
                        <div className="text-[10px] font-bold text-[#1B3A6B] mt-1.5 flex items-center gap-1">
                          <QrCode size={11} />
                          رمز وصول سريع للاتصال
                        </div>
                        <span className="text-[9px] text-slate-400">امسح بالكاميرا للاتصال وحفظ الرقم</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-2">
                  <span className="text-slate-400 block mb-1">طبيعة الدورات المعتمَدة:</span>
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {(() => {
                      const cats = parseCourseCategories(selectedTrainerForView.course_categories || selectedTrainerForView.courseCategories);
                      if (cats.length === 0) return <span className="font-bold text-slate-500">—</span>;

                      return cats.map((c, i) => (
                        <Badge key={i} className="bg-blue-100 text-[#1B3A6B] border border-blue-200 text-xs font-bold">
                          {c}
                        </Badge>
                      ));
                    })()}
                  </div>
                </div>

                {(selectedTrainerForView.specialty_details || selectedTrainerForView.specialtyDetails) && (
                  <div className="col-span-2 bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-amber-900 font-bold">
                    طبيعة الاختصاص التفصيلية: {selectedTrainerForView.specialty_details || selectedTrainerForView.specialtyDetails}
                  </div>
                )}
              </div>

              {selectedTrainerForView.notes && (
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
                  <span className="font-bold text-slate-800 block mb-1">ملاحظات:</span>
                  <p className="text-xs text-slate-600 leading-relaxed">{selectedTrainerForView.notes}</p>
                </div>
              )}

              {/* System Courses Taught by this Trainer */}
              <div>
                <h4 className="font-bold text-[#1B3A6B] text-xs mb-2 flex items-center gap-1.5">
                  <GraduationCap size={15} />
                  سجل الدورات المنفذة بحسب هذا المدرب بالنظام ({courses.filter(c => c.trainer_id == selectedTrainerForView.id || c.trainer_name === selectedTrainerForView.full_name).length})
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                      <tr>
                        <th className="p-2.5">اسم الدورة</th>
                        <th className="p-2.5">المسار</th>
                        <th className="p-2.5">السنة</th>
                        <th className="p-2.5">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courses.filter(c => c.trainer_id == selectedTrainerForView.id || c.trainer_name === selectedTrainerForView.full_name).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-400">لم يتم إسناد أي دورات لهذا المدرب بالنظام بعد</td>
                        </tr>
                      ) : (
                        courses.filter(c => c.trainer_id == selectedTrainerForView.id || c.trainer_name === selectedTrainerForView.full_name).map(c => (
                          <tr key={c.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-[#1B3A6B]">{c.course_name}</td>
                            <td className="p-2.5">{c.track}</td>
                            <td className="p-2.5">{c.year}</td>
                            <td className="p-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mt-6 pt-4 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={(e) => handleToggleRestrictTrainer(selectedTrainerForView, e)}
                className={`rounded-xl text-xs font-bold gap-1.5 cursor-pointer ${
                  selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                {selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور' ? <Unlock size={14} /> : <Lock size={14} />}
                {selectedTrainerForView.status === 'مقيد ومحظور' || selectedTrainerForView.status === 'محظور' ? 'تنشيط وإلغاء تقييد المدرب' : 'تقييد وحظر حساب المدرب'}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  onClick={(e) => handleDeleteTrainer(selectedTrainerForView.id, e)}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold gap-1 cursor-pointer"
                >
                  <Trash2 size={14} />
                  حذف المدرب
                </Button>
                <Button
                  onClick={() => {
                    const tr = selectedTrainerForView;
                    setSelectedTrainerForView(null);
                    handleEditTrainer(tr);
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold gap-1 cursor-pointer"
                >
                  <Edit size={14} />
                  تعديل البيانات
                </Button>
                <Button variant="ghost" onClick={() => setSelectedTrainerForView(null)} className="rounded-xl text-xs font-bold cursor-pointer">
                  إغلاق
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 8. Modal: Excel Trainees Import & Categorization Preview (نافذة فرز وتأكيد ترحيل ملف الإكسل) */}
      {showExcelImportModal && selectedCourseForEnroll && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right flex flex-col max-h-[90vh]" dir="rtl">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-200">
                  <FileSpreadsheet size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1B3A6B]">
                    فرز وتدقيق ملف إكسل المتدربين: {excelImportResult.fileName}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    الدورة التدريبية المستهدفة: <strong className="text-slate-800">{selectedCourseForEnroll.course_name}</strong>
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowExcelImportModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            {/* Stats Summary Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 shrink-0">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold">إجمالي أسطر الملف</div>
                  <div className="text-xl font-black text-slate-800 mt-0.5">{excelImportResult.totalCount}</div>
                </div>
                <FileText size={24} className="text-slate-400" />
              </div>

              <div className="bg-emerald-50/80 p-3.5 rounded-2xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-800 font-bold">السجلات السليمة (جاهزة للترحيل)</div>
                  <div className="text-xl font-black text-emerald-700 mt-0.5">{excelImportResult.validRows.length}</div>
                </div>
                <CheckCircle2 size={24} className="text-emerald-600" />
              </div>

              <div className="bg-rose-50/80 p-3.5 rounded-2xl border border-rose-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-rose-800 font-bold">الحالات المخالفة (مستبعدة)</div>
                  <div className="text-xl font-black text-rose-700 mt-0.5">{excelImportResult.invalidRows.length}</div>
                </div>
                <AlertCircle size={24} className="text-rose-600" />
              </div>
            </div>

            {/* Tabs Switcher */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 shrink-0">
              <Button
                type="button"
                variant={excelTab === 'VALID' ? 'default' : 'outline'}
                onClick={() => setExcelTab('VALID')}
                className={`rounded-xl font-bold text-xs gap-2 h-9 px-4 cursor-pointer ${
                  excelTab === 'VALID'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Check size={16} />
                السجلات السليمة الجاهزة للترحيل ({excelImportResult.validRows.length})
              </Button>

              <Button
                type="button"
                variant={excelTab === 'INVALID' ? 'default' : 'outline'}
                onClick={() => setExcelTab('INVALID')}
                className={`rounded-xl font-bold text-xs gap-2 h-9 px-4 cursor-pointer ${
                  excelTab === 'INVALID'
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle size={16} />
                الحالات المخالفة والمستبعدة ({excelImportResult.invalidRows.length})
              </Button>
            </div>

            {/* Scrollable Table View */}
            <div className="flex-1 overflow-y-auto min-h-[220px] rounded-2xl border border-slate-200 bg-white">
              {excelTab === 'VALID' ? (
                excelImportResult.validRows.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold">
                    لا توجد سجلات سليمة مطابقة في هذا الملف. يرجى مراجعة الحالات المخالفة بالتبويب المنسدل.
                  </div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="p-3 text-center">#</th>
                        <th className="p-3">رقم الشركة (من الملف)</th>
                        <th className="p-3">اسم الموظف (مطابق من قيد النظام)</th>
                        <th className="p-3">القسم / التشكيل</th>
                        <th className="p-3 text-center">الدرجة الوظيفية</th>
                        <th className="p-3 text-center">حالة المطابقة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {excelImportResult.validRows.map((item, idx) => (
                        <tr key={idx} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-[#1B3A6B]">{item.employee_code}</td>
                          <td className="p-3 font-bold text-slate-800">{item.full_name}</td>
                          <td className="p-3 text-slate-600">{item.department}</td>
                          <td className="p-3 text-center font-bold text-slate-700">{item.grade}</td>
                          <td className="p-3 text-center">
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px]">
                              سليم ومطابق ✓
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : (
                excelImportResult.invalidRows.length === 0 ? (
                  <div className="p-12 text-center text-emerald-600 font-bold flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 size={32} />
                    رائع! جميع السجلات في هذا الملف سليمة ومطابقة بدون أي مخالفات أو تكرار.
                  </div>
                ) : (
                  <table className="w-full text-right text-xs">
                    <thead className="bg-rose-50 text-rose-900 font-bold sticky top-0 border-b border-rose-200">
                      <tr>
                        <th className="p-3 text-center">الصف بالملف</th>
                        <th className="p-3">رقم الشركة المدخل</th>
                        <th className="p-3">سبب الرفض والفرز</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 font-medium">
                      {excelImportResult.invalidRows.map((item, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/60 transition-colors">
                          <td className="p-3 text-center font-mono font-bold text-rose-800">سطر {item.rowNum}</td>
                          <td className="p-3 font-mono font-bold text-slate-800">{item.rawCode}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1.5 text-rose-800 font-bold bg-rose-100/90 px-2.5 py-1 rounded-lg border border-rose-300">
                              <AlertCircle size={14} className="shrink-0 text-rose-600" />
                              {item.reason}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                سيتم ترحيل السجلات السليمة فقط ({excelImportResult.validRows.length}) وتجاهل أي مخالفات تلقائياً.
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl font-bold text-xs h-9 px-4 cursor-pointer"
                  onClick={() => setShowExcelImportModal(false)}
                  disabled={isMigratingExcel}
                >
                  إلغاء
                </Button>

                <Button
                  type="button"
                  disabled={excelImportResult.validRows.length === 0 || isMigratingExcel}
                  onClick={handleConfirmExcelMigration}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-xs h-9 px-5 gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isMigratingExcel ? (
                    <>جاري ترحيل البيانات...</>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      تأكيد ترحيل البيانات السليمة ({excelImportResult.validRows.length} متدرب)
                    </>
                  )}
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Custom Global Confirmation Dialog (Replaces native browser alert/confirm for iframe compatibility) */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => !open && setConfirmDialog(p => ({ ...p, isOpen: false }))}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2">
              {confirmDialog.variant === 'destructive' ? (
                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                  <Trash2 size={20} />
                </div>
              ) : confirmDialog.variant === 'warning' ? (
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                  <AlertTriangle size={20} />
                </div>
              ) : (
                <div className="p-2 bg-blue-100 text-[#1B3A6B] rounded-xl">
                  <Lock size={20} />
                </div>
              )}
              <span>{confirmDialog.title}</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 mt-2 leading-relaxed">
              {confirmDialog.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDialog(p => ({ ...p, isOpen: false }))}
              className="rounded-xl font-bold text-xs px-4 h-9 cursor-pointer"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={() => {
                const fn = confirmDialog.onConfirm;
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                if (fn) fn();
              }}
              className={`rounded-xl font-bold text-xs px-4 h-9 cursor-pointer text-white shadow-sm ${
                confirmDialog.variant === 'destructive'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : confirmDialog.variant === 'warning'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-[#1B3A6B] hover:bg-[#142d54]'
              }`}
            >
              {confirmDialog.actionText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
