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
  Save,
  Clock,
  Calendar,
  Filter,
  CheckCheck,
  HelpCircle,
  Eye,
  Info,
  TrendingUp,
  Briefcase
} from 'lucide-react';
import { notifySettingsChanged, applySavedOrder, fetchEducationDegreesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';
import { useAuth } from '@/lib/AuthContext';

export const JOB_GRADES_LIST = [
  { value: 10, label: 'الدرجة العاشرة (للترفيع للتاسعة)', shortLabel: 'الدرجة 10', target: '9' },
  { value: 9, label: 'الدرجة التاسعة (للترفيع للثامنة)', shortLabel: 'الدرجة 9', target: '8' },
  { value: 8, label: 'الدرجة الثامنة (للترفيع للسابعة)', shortLabel: 'الدرجة 8', target: '7' },
  { value: 7, label: 'الدرجة السابعة (للترفيع للسادسة)', shortLabel: 'الدرجة 7', target: '6' },
  { value: 6, label: 'الدرجة السادسة (للترفيع للخامسة)', shortLabel: 'الدرجة 6', target: '5' },
  { value: 5, label: 'الدرجة الخامسة (للترفيع للرابعة)', shortLabel: 'الدرجة 5', target: '4' },
  { value: 4, label: 'الدرجة الرابعة (للترفيع للثالثة)', shortLabel: 'الدرجة 4', target: '3' },
  { value: 3, label: 'الدرجة الثالثة (للترفيع للثانية)', shortLabel: 'الدرجة 3', target: '2' },
  { value: 2, label: 'الدرجة الثانية (للترفيع للأولى)', shortLabel: 'الدرجة 2', target: '1' },
  { value: 1, label: 'الدرجة الأولى (التطوير القيادي)', shortLabel: 'الدرجة 1', target: 'عليا' },
];

export const ALL_JOB_GRADES_OPTIONS = [
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

export const EXEMPTION_TYPES_OPTIONS = [
  { value: 'كامل', label: 'إعفاء كامل (تام من كافة الدورات الحاكمة)', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'جزئي', label: 'إعفاء جزئي (تخفيض عدد الساعات والدورات)', color: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  { value: 'دورة_بديلة', label: 'دورة تطويرية بديلة واحدة', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'استثناء_خدمة', label: 'استثناء بسبب الخدمة الوظيفية (25 سنة+)', color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'لا_يوجد_إعفاء', label: 'شمول كامل (لا يوجد إعفاء)', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
];

export const COURSE_CATEGORY_OPTIONS = [
  { value: 'اختصاص', label: 'دورة اختصاص (تخصصية / فنية / هندسية / علمية)', defaultDays: 10, defaultHours: 40, badge: 'اختصاص', bg: 'bg-blue-50 text-blue-900 border-blue-200' },
  { value: 'إدارية', label: 'دورة إدارية (إدارة وقيادة / قانونية / موارد بشرية)', defaultDays: 5, defaultHours: 20, badge: 'إدارية', bg: 'bg-amber-50 text-amber-900 border-amber-200' },
  { value: 'سلامة وبيئة (H.S.E)', label: 'دورة سلامة وصحة مهنية وبيئة (H.S.E / دفاع مدني)', defaultDays: 5, defaultHours: 20, badge: 'H.S.E', bg: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
  { value: 'حاسوب وتكنولوجيا', label: 'دورة حاسوب ومعلوماتية وبرمجيات وتطبيقات العمل', defaultDays: 5, defaultHours: 20, badge: 'حاسوب', bg: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  { value: 'إدارية أو حاسوب', label: 'دورة إدارية أو حاسوب (خيار تبادلي)', defaultDays: 5, defaultHours: 20, badge: 'إدارية أو حاسوب', bg: 'bg-teal-50 text-teal-900 border-teal-200' },
  { value: 'إدارية متقدمة أو حاسوب أو لغة إنكليزية', label: 'إدارية متقدمة أو حاسوب أو لغة (مجموع شهر تدريبي)', defaultDays: 20, defaultHours: 80, badge: 'إدارية/حاسوب/لغة', bg: 'bg-purple-50 text-purple-900 border-purple-200' },
  { value: 'اختصاص متقدمة', label: 'دورة اختصاص متقدمة (تطويرية عليا)', defaultDays: 10, defaultHours: 40, badge: 'اختصاص متقدمة', bg: 'bg-sky-50 text-sky-900 border-sky-200' },
  { value: 'إدارية متقدمة / إدارة وقيادة', label: 'إدارية متقدمة / إدارة وقيادة عليا', defaultDays: 5, defaultHours: 20, badge: 'إدارة وقيادة', bg: 'bg-amber-50 text-amber-900 border-amber-200' },
  { value: 'تفاوض ولجان خارجية', label: 'دورة تفاوض ولغات أو لجان خارجية مؤيدة', defaultDays: 5, defaultHours: 20, badge: 'تفاوض ولجان', bg: 'bg-rose-50 text-rose-900 border-rose-200' },
  { value: 'مالية ومحاسبية', label: 'دورة مالية ومحاسبية ورقابية', defaultDays: 5, defaultHours: 20, badge: 'مالية', bg: 'bg-cyan-50 text-cyan-900 border-cyan-200' },
];

export const DEFAULT_GRADE_TRAINING_REQUIREMENTS = {
  '8': [
    { id: 'gr_8_1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاصية فنية / هندسية / مالية حسب العنوان الوظيفي' },
    { id: 'gr_8_2', category: 'إدارية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة إدارية وقانونية وتنظيمية' },
    { id: 'gr_8_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة (H.S.E)' },
    { id: 'gr_8_4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'حاسبة وتطبيقات مكتبية ومعلوماتية' }
  ],
  '7': [
    { id: 'gr_7_1', category: 'اختصاص', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاصية فنية / هندسية / مالية حسب العنوان الوظيفي' },
    { id: 'gr_7_2', category: 'إدارية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'دورة إدارية وتنظيمية' },
    { id: 'gr_7_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة' },
    { id: 'gr_7_4', category: 'حاسوب وتكنولوجيا', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'حاسبة وبرمجيات وتطبيقات العمل' }
  ],
  '6': [
    { id: 'gr_6_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص معمقة (أسبوعين - 10 أيام تدريبية أو دورتين 5 أيام)' },
    { id: 'gr_6_2', category: 'إدارية أو حاسوب', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية أو حاسوب (أسبوع تدريبي)' },
    { id: 'gr_6_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة (أسبوع تدريبي)' }
  ],
  '5': [
    { id: 'gr_5_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص معمقة (أسبوعين - 10 أيام تدريبية أو دورتين 5 أيام)' },
    { id: 'gr_5_2', category: 'إدارية أو حاسوب', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية أو حاسوب (أسبوع تدريبي)' },
    { id: 'gr_5_3', category: 'سلامة وبيئة (H.S.E)', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'السلامة والصحة المهنية والبيئة (أسبوع تدريبي)' }
  ],
  '4': [
    { id: 'gr_4_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص متقدمة (أسبوعين - 10 أيام تدريبية)' },
    { id: 'gr_4_2', category: 'إدارية متقدمة أو حاسوب أو لغة إنكليزية', requiredDays: 20, requiredHours: 80, isMandatory: true, alternativeTo: 'بديل إداري', notes: 'مجموع شهر تدريبي (20 يوم / 80 ساعة) أو بديل إداري' }
  ],
  '3': [
    { id: 'gr_3_1', category: 'اختصاص', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'دورة اختصاص متقدمة (أسبوعين - 10 أيام تدريبية)' },
    { id: 'gr_3_2', category: 'إدارية متقدمة أو حاسوب أو لغة إنكليزية', requiredDays: 20, requiredHours: 80, isMandatory: true, alternativeTo: 'بديل إداري', notes: 'مجموع شهر تدريبي (20 يوم / 80 ساعة) أو بديل إداري كامل للعنوان الإداري' }
  ],
  '2': [
    { id: 'gr_2_1', category: 'اختصاص متقدمة', requiredDays: 10, requiredHours: 40, isMandatory: true, alternativeTo: '', notes: 'اختصاص متقدمة (أسبوعين - 10 أيام تدريبية)' },
    { id: 'gr_2_2', category: 'إدارية متقدمة / إدارة وقيادة', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: '', notes: 'إدارية متقدمة أو إدارة وقيادة (أسبوع على الأقل)' },
    { id: 'gr_2_3', category: 'تفاوض ولجان خارجية', requiredDays: 5, requiredHours: 20, isMandatory: true, alternativeTo: 'لجان واجتماعات مع شركات أجنبية', notes: 'تفاوض أو تعويض بلجان رسمية مؤيدة بكتاب رسمي' }
  ]
};

export const DEFAULT_DYNAMIC_EXEMPTION_RULES = [
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
    qualifications: ['متوسطة فما دون'],
    grades: ['الكل'],
    exemptionType: 'كامل',
    isExempt: true,
    legalBasis: 'إعفاء تلقائي لمؤهلات ما دون الإعدادية (متوسطة، ابتدائية، يقرأ ويكتب، بدون مؤهل) من حتميات الترفيع',
    category: 'qualification',
  },
  {
    id: 'rule_senior_leadership',
    title: 'إعفاء العناوين القيادية العليا والدرجات الخاصة',
    qualifications: ['الكل'],
    grades: ['الخاصة_أ', 'الخاصة_ب', 'المناصب_القيادية'],
    exemptionType: 'كامل',
    isExempt: true,
    legalBasis: 'إعفاء شاغلي الدرجات العليا والخاصة والمناصب القيادية من الدورات الحاكمة التقليدية',
    category: 'grade',
  },
  {
    id: 'rule_long_service',
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

export const DEFAULT_PROMOTION_PATHS_MATRIX = [
  {
    id: 'mat_2_1',
    trackName: 'الثانية ← الأولى',
    fromGrade: 2,
    toGrade: 1,
    requiredCoursesText: '1) اختصاص متقدمة (أسبوعين - 10 أيام)\n2) إدارية متقدمة / إدارة وقيادة (أسبوع على الأقل)\n3) تفاوض — يمكن تعويضها بلجان/اجتماعات مع شركات أجنبية بكتاب رسمي مؤيد',
    alternativeText: 'دورة تطويرية قيادية عليا معتمدة',
    notes: 'الدرجة 2 إلى 1 (التطوير القيادي المتقدم)'
  },
  {
    id: 'mat_3_2',
    trackName: 'الثالثة ← الثانية',
    fromGrade: 3,
    toGrade: 2,
    requiredCoursesText: '1) اختصاص (أسبوعين - 10 أيام)\n2) (إدارية متقدمة) أو (حاسبة) أو (لغة إنكليزية) بمجموع شهر تدريبي',
    alternativeText: '💡 بديل كامل: للعنوان الإداري (مدير / مدير أقدم) دورة واحدة ≥ شهر تغني عن كل الحتميات',
    notes: 'الدرجة 3 إلى 2'
  },
  {
    id: 'mat_4_3',
    trackName: 'الرابعة ← الثالثة',
    fromGrade: 4,
    toGrade: 3,
    requiredCoursesText: 'نفس متطلبات الترفيع (3 ← 2): دورة اختصاص (أسبوعين) + (إدارية متقدمة/حاسبة/إنكليزي مجموع شهر) أو البديل الإداري الكامل',
    alternativeText: '💡 بديل كامل: للعنوان الإداري دورة تدريبية واحدة مدتها شهر فأكثر',
    notes: 'الدرجة 4 إلى 3'
  },
  {
    id: 'mat_5_4',
    trackName: 'الخامسة ← الرابعة',
    fromGrade: 5,
    toGrade: 4,
    requiredCoursesText: '1) اختصاص (أسبوعين)\n2) إدارية أو حاسبة (أسبوع)\n3) السلامة والصحة المهنية والبيئة (H.S.E)',
    alternativeText: '',
    notes: 'الدرجة 5 إلى 4'
  },
  {
    id: 'mat_6_5',
    trackName: 'السادسة ← الخامسة',
    fromGrade: 6,
    toGrade: 5,
    requiredCoursesText: 'نفس متطلبات الترفيع (5 ← 4): دورة اختصاص (أسبوعين) + إدارية/حاسبة (أسبوع) + H.S.E',
    alternativeText: '',
    notes: 'الدرجة 6 إلى 5'
  },
  {
    id: 'mat_7_6',
    trackName: 'السابعة ← السادسة',
    fromGrade: 7,
    toGrade: 6,
    requiredCoursesText: '1) اختصاص (أسبوع)   2) إدارية (أسبوع)\n3) H.S.E (أسبوع)   4) حاسبة (أسبوع)',
    alternativeText: '',
    notes: 'الدرجة 7 إلى 6'
  },
  {
    id: 'mat_8_7',
    trackName: 'الثامنة ← السابعة',
    fromGrade: 8,
    toGrade: 7,
    requiredCoursesText: 'نفس متطلبات الترفيع (7 ← 6): اختصاص (أسبوع) + إدارية (أسبوع) + H.S.E + حاسبة',
    alternativeText: '',
    notes: 'الدرجة 8 إلى 7'
  }
];

// Helper: Normalize category string
export const normalizeCategory = (cat) => {
  if (!cat) return '';
  const s = String(cat).toLowerCase().trim();
  if (s.includes('اختصاص') || s.includes('تخصص') || s.includes('هندس') || s.includes('فني') || s.includes('علمي')) return 'اختصاص';
  if (s.includes('إدار') || s.includes('ادار') || s.includes('قانون') || s.includes('موارد') || s.includes('قياد') || s.includes('اشراف')) return 'إدارية';
  if (s.includes('حاس') || s.includes('برمج') || s.includes('تقني') || s.includes('معلومات') || s.includes('it') || s.includes('computer')) return 'حاسوب';
  if (s.includes('سلام') || s.includes('hse') || s.includes('صحة') || s.includes('بيئ') || s.includes('دفاع')) return 'سلامة وبيئة (H.S.E)';
  if (s.includes('لغ') || s.includes('انكليز') || s.includes('إنكليز') || s.includes('تفاوض') || s.includes('english')) return 'لغات وتفاوض';
  if (s.includes('مال') || s.includes('محاسب') || s.includes('تدقيق')) return 'مالية ومحاسبية';
  return cat.trim();
};

// Helper: Check if course matches requirement category
export const matchesRequirementCategory = (courseCategory, courseName, reqCategory) => {
  if (!reqCategory) return false;
  const normReq = normalizeCategory(reqCategory);
  const normCourse = normalizeCategory(courseCategory);
  const cName = (courseName || '').toLowerCase();

  if (reqCategory.includes('أو') || reqCategory.includes('او')) {
    const parts = reqCategory.split(/أو|او/).map((p) => p.trim());
    return parts.some((part) => matchesRequirementCategory(courseCategory, courseName, part));
  }

  if (normReq === normCourse) return true;
  if (normReq === 'اختصاص' && (normCourse === 'اختصاص' || cName.includes('اختصاص') || cName.includes('تخصص') || cName.includes('هندسة') || cName.includes('فني'))) return true;
  if (normReq === 'إدارية' && (normCourse === 'إدارية' || cName.includes('ادار') || cName.includes('إدار') || cName.includes('قياد') || cName.includes('قانون') || cName.includes('موارد'))) return true;
  if (normReq === 'حاسوب' && (normCourse === 'حاسوب' || cName.includes('حاس') || cName.includes('برمج') || cName.includes('كمبيوتر') || cName.includes('excel') || cName.includes('word'))) return true;
  if (normReq.includes('H.S.E') && (normCourse.includes('H.S.E') || cName.includes('سلام') || cName.includes('hse') || cName.includes('بيئ') || cName.includes('اطفاء') || cName.includes('دفاع مدني'))) return true;
  if (normReq.includes('تفاوض') && (normCourse.includes('تفاوض') || cName.includes('تفاوض') || cName.includes('لغ') || cName.includes('لجان') || cName.includes('إنكليز') || cName.includes('علاقات'))) return true;

  return false;
};

export default function GoverningCoursesSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const secondaryColor = appPublicSettings?.secondaryColor || '#C8960C';

  // Tabs: 'catalog' | 'rules' | 'inclusions' | 'assignments'
  const [activeTab, setActiveTab] = useState('catalog');

  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeAssignments, setEmployeeAssignments] = useState({});
  const [trainingsList, setTrainingsList] = useState([]);
  const [enrollmentsList, setEnrollmentsList] = useState([]);
  const [systemEducationDegrees, setSystemEducationDegrees] = useState([]);

  // Grade Requirements State (Tab 4)
  const [gradeRequirements, setGradeRequirements] = useState(() => {
    try {
      const saved = localStorage.getItem('GOVERNING_GRADE_REQUIREMENTS');
      return saved ? JSON.parse(saved) : DEFAULT_GRADE_TRAINING_REQUIREMENTS;
    } catch (e) {
      return DEFAULT_GRADE_TRAINING_REQUIREMENTS;
    }
  });
  const [selectedGradeForReqs, setSelectedGradeForReqs] = useState('8');

  // Grade Requirement Modal State
  const [gradeReqModal, setGradeReqModal] = useState({
    isOpen: false,
    isEditing: false,
    id: null,
    grade: '8',
    category: 'اختصاص',
    requiredDays: 5,
    requiredHours: 20,
    isMandatory: true,
    alternativeTo: '',
    notes: '',
  });

  const [deleteGradeReqConfirm, setDeleteGradeReqConfirm] = useState({
    isOpen: false,
    id: null,
    grade: '8',
    category: '',
  });

  // Matrix Paths State (Tab 1)
  const [matrixPaths, setMatrixPaths] = useState(() => {
    try {
      const saved = localStorage.getItem('PROMOTION_PATHS_MATRIX');
      return saved ? JSON.parse(saved) : DEFAULT_PROMOTION_PATHS_MATRIX;
    } catch (e) {
      return DEFAULT_PROMOTION_PATHS_MATRIX;
    }
  });

  const [matrixModal, setMatrixModal] = useState({
    isOpen: false,
    isEditing: false,
    id: null,
    trackName: '',
    fromGrade: 8,
    toGrade: 7,
    requiredCoursesText: '',
    alternativeText: '',
    notes: '',
  });

  const [deleteMatrixConfirm, setDeleteMatrixConfirm] = useState({
    isOpen: false,
    id: null,
    trackName: '',
  });

  const [matrixSearch, setMatrixSearch] = useState('');

  // Exemption Rules State (Tab 2)
  const [exemptionRules, setExemptionRules] = useState({
    rules: DEFAULT_DYNAMIC_EXEMPTION_RULES,
    qualificationsExemptions: [],
    gradeTitleExemptions: [],
    autoApplyRules: true,
  });

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
  const [deleteRuleConfirm, setDeleteRuleConfirm] = useState({ isOpen: false, id: null, title: '' });

  // Inclusions & Fulfillment State (Tab 3)
  const [incSearch, setIncSearch] = useState('');
  const [incStatusFilter, setIncStatusFilter] = useState('all'); // all | exempt | completed_full | partial | not_completed
  const [incGradeFilter, setIncGradeFilter] = useState('all');

  const [exemptionModal, setExemptionModal] = useState({
    isOpen: false,
    employee: null,
    status: 'مشمول',
    exemptionReason: '',
    exemptionOrderNumber: '',
    exemptionOrderDate: '',
    notes: '',
  });

  // Detailed Employee Fulfillment Modal
  const [employeeFulfillmentModal, setEmployeeFulfillmentModal] = useState({
    isOpen: false,
    employee: null,
  });

  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load Grade Requirements from Server
  const fetchGradeRequirements = async () => {
    try {
      const data = await request('/api/governing-courses/grade-requirements');
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        setGradeRequirements(data);
        localStorage.setItem('GOVERNING_GRADE_REQUIREMENTS', JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Using local grade requirements fallback');
    }
  };

  // Load Matrix Paths
  const fetchMatrixPaths = async () => {
    try {
      const data = await request('/api/governing-courses/matrix');
      if (Array.isArray(data) && data.length > 0) {
        setMatrixPaths(data);
        localStorage.setItem('PROMOTION_PATHS_MATRIX', JSON.stringify(data));
      }
    } catch (e) {
      console.warn('Using local matrix paths fallback');
    }
  };

  // Load Exemption Rules
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

  // Load Employees, Assignments, Trainings & Enrollments
  const fetchEmployeesAndTrainingData = async () => {
    try {
      const [emps, assigns, trList, enList] = await Promise.all([
        apiClient.entities.Employee.list(),
        request('/api/governing-courses/employee-assignments').catch(() => ({})),
        apiClient.entities.Training.list().catch(() => []),
        apiClient.entities.TrainingEnrollment.list().catch(() => [])
      ]);

      setEmployees(emps || []);
      setEmployeeAssignments(assigns || {});
      setTrainingsList(trList || []);
      setEnrollmentsList(enList || []);
    } catch (err) {
      console.log('Error fetching training or employee data:', err);
    }
  };

  const loadSystemDegrees = async () => {
    try {
      const degrees = await fetchEducationDegreesSorted();
      setSystemEducationDegrees(degrees || []);
    } catch (err) {
      console.error('Error loading system education degrees:', err);
    }
  };

  useEffect(() => {
    fetchGradeRequirements();
    fetchMatrixPaths();
    fetchExemptionRules();
    fetchEmployeesAndTrainingData();
    loadSystemDegrees();

    const unsubscribe = subscribeToSettingsUpdates((detail) => {
      if (detail?.type === 'education_degrees' || detail?.type === 'all') {
        loadSystemDegrees();
      }
    });
    return () => unsubscribe();
  }, []);

  // Compute qualification options dynamically
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

  // Helpers for grade parsing
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

  // Evaluate inclusion & exemption info for an employee
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

  // Detailed cumulative fulfillment calculation for an employee
  const getEmployeeFulfillmentDetails = (emp) => {
    if (!emp) return null;
    const incInfo = getEmployeeInclusionInfo(emp);
    const empIdStr = String(emp.id || emp.employeeId || emp.employee_id || '');

    const rawGrade = emp.grade ?? emp.jobGrade ?? emp.job_grade ?? emp.grade_level ?? emp.degree ?? 8;
    const empGradeNum = extractGradeNumber(rawGrade) || 8;
    const targetGradeNum = Math.max(1, empGradeNum - 1);

    const reqs = gradeRequirements[String(empGradeNum)] || [];

    // Collect all passed/completed training programs for this employee
    const empEnrollments = enrollmentsList.filter(
      (en) =>
        String(en.employee_id) === empIdStr &&
        (en.result === 'اجتاز' ||
          en.result === 'ناجح' ||
          en.result === 'مشارك' ||
          (en.score && Number(en.score) >= 50))
    );

    const completedCourses = [];

    empEnrollments.forEach((en) => {
      const tr = trainingsList.find((t) => String(t.id) === String(en.training_id));
      if (tr) {
        const days = parseInt(tr.days) || parseInt(tr.duration_value) || 5;
        const hours = parseInt(tr.hours) || (days * 4) || 20;
        completedCourses.push({
          id: `tr_${tr.id}_${en.id}`,
          source: 'training_plan',
          name: tr.course_name || tr.title || 'برنامج تدريبي',
          category: tr.category || tr.course_type || 'اختصاص',
          days: days,
          hours: hours,
          score: en.score || tr.min_passing_score || 75,
          certNum: en.certificate_number || '-',
          certDate: en.certificate_date || tr.start_date || '-',
          result: en.result || 'اجتاز',
        });
      }
    });

    // Check custom completed progress from assignments
    const customAssignment = employeeAssignments[empIdStr] || {};
    const customProgress = customAssignment.courseProgress || {};
    Object.entries(customProgress).forEach(([key, prog]) => {
      if (prog && prog.status === 'مكتملة') {
        const cName = prog.name || `دورة حتمية مسجلة (#${key})`;
        const cCat = prog.category || 'اختصاص';
        const cDays = prog.days || 5;
        const cHours = prog.hours || cDays * 4;

        if (!completedCourses.some((c) => c.name === cName)) {
          completedCourses.push({
            id: `custom_${key}`,
            source: 'manual_assignment',
            name: cName,
            category: cCat,
            days: cDays,
            hours: cHours,
            score: prog.score || 80,
            certNum: prog.certNum || '-',
            certDate: prog.certDate || '-',
            result: 'اجتاز',
          });
        }
      }
    });

    // Check each requirement for the current grade
    const evaluatedReqs = reqs.map((req) => {
      const matched = completedCourses.filter((c) =>
        matchesRequirementCategory(c.category, c.name, req.category)
      );

      const totalDays = matched.reduce((sum, c) => sum + (Number(c.days) || 0), 0);
      const totalHours = matched.reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
      const isSatisfied = totalDays >= req.requiredDays || totalHours >= req.requiredHours;
      const remainingDays = Math.max(0, req.requiredDays - totalDays);
      const remainingHours = Math.max(0, req.requiredHours - totalHours);

      return {
        ...req,
        matchedCourses: matched,
        totalCompletedDays: totalDays,
        totalCompletedHours: totalHours,
        isSatisfied,
        remainingDays,
        remainingHours,
      };
    });

    const totalReqsCount = evaluatedReqs.length;
    const satisfiedCount = evaluatedReqs.filter((r) => r.isSatisfied).length;
    const totalDaysDone = completedCourses.reduce((sum, c) => sum + (Number(c.days) || 0), 0);

    let progressPercent = 0;
    if (incInfo.isExempt) {
      progressPercent = 100;
    } else if (totalReqsCount === 0) {
      progressPercent = 100;
    } else {
      progressPercent = Math.round((satisfiedCount / totalReqsCount) * 100);
    }

    let fulfillmentKey = 'غير_مستوفي';
    let fulfillmentLabel = 'غير مستوفي (0%)';
    let fulfillmentBadgeClass = 'bg-red-50 text-red-700 border-red-200';

    if (incInfo.isExempt) {
      fulfillmentKey = 'معفى';
      fulfillmentLabel = 'معفى من الدورات (مستوفي حكماً)';
      fulfillmentBadgeClass = 'bg-blue-50 text-blue-800 border-blue-200';
    } else if (progressPercent === 100) {
      fulfillmentKey = 'مستوفي_كامل';
      fulfillmentLabel = 'مستوفي بالكامل (100% - جاهز للترقية)';
      fulfillmentBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
    } else if (satisfiedCount > 0 || totalDaysDone > 0) {
      fulfillmentKey = 'مستوفي_جزئي';
      fulfillmentLabel = `مستوفي جزئياً (${progressPercent}%)`;
      fulfillmentBadgeClass = 'bg-amber-50 text-amber-900 border-amber-300';
    }

    return {
      emp,
      incInfo,
      empGradeNum,
      targetGradeNum,
      reqs: evaluatedReqs,
      completedCourses,
      totalReqsCount,
      satisfiedCount,
      progressPercent,
      fulfillmentKey,
      fulfillmentLabel,
      fulfillmentBadgeClass,
      isFullyReady: incInfo.isExempt || progressPercent === 100,
    };
  };

  // Processed employees with complete cumulative fulfillment evaluations
  const processedEmployees = useMemo(() => {
    return employees.map((emp) => getEmployeeFulfillmentDetails(emp));
  }, [employees, employeeAssignments, exemptionRules, gradeRequirements, trainingsList, enrollmentsList]);

  // Filtered employees for Tab 3
  const filteredInclusionEmployees = useMemo(() => {
    return processedEmployees.filter((item) => {
      if (!item) return false;
      const emp = item.emp;
      const name = (emp.fullName || emp.full_name || emp.name || '').toLowerCase();
      const civil = (
        emp.civilServiceNumber ||
        emp.civil_service_number ||
        emp.employeeNumber ||
        emp.employee_number ||
        emp.companyNumber ||
        emp.company_number ||
        emp.employee_id_number ||
        String(emp.id || '')
      ).toLowerCase();
      const title = (emp.jobTitle || emp.job_title || '').toLowerCase();
      const dept = (emp.department || emp.section || '').toLowerCase();
      const query = incSearch.toLowerCase().trim();

      const matchQuery = !query || name.includes(query) || civil.includes(query) || title.includes(query) || dept.includes(query);
      const matchGrade = incGradeFilter === 'all' || item.empGradeNum === parseInt(incGradeFilter);

      let matchStatus = true;
      if (incStatusFilter === 'exempt') matchStatus = item.incInfo.isExempt;
      if (incStatusFilter === 'completed_full') matchStatus = item.fulfillmentKey === 'مستوفي_كامل';
      if (incStatusFilter === 'partial') matchStatus = item.fulfillmentKey === 'مستوفي_جزئي';
      if (incStatusFilter === 'not_completed') matchStatus = item.fulfillmentKey === 'غير_مستوفي';

      return matchQuery && matchGrade && matchStatus;
    });
  }, [processedEmployees, incSearch, incStatusFilter, incGradeFilter]);

  // Statistics for Inclusions Tab
  const inclusionStats = useMemo(() => {
    const total = processedEmployees.length;
    const exempt = processedEmployees.filter((e) => e && e.incInfo.isExempt).length;
    const completedFull = processedEmployees.filter((e) => e && e.fulfillmentKey === 'مستوفي_كامل').length;
    const partial = processedEmployees.filter((e) => e && e.fulfillmentKey === 'مستوفي_جزئي').length;
    const notCompleted = processedEmployees.filter((e) => e && e.fulfillmentKey === 'غير_مستوفي').length;
    return { total, exempt, completedFull, partial, notCompleted };
  }, [processedEmployees]);

  // ----------------------------------------------------
  // GRADE REQUIREMENTS (TAB 4) HANDLERS
  // ----------------------------------------------------
  const handleOpenAddGradeReqModal = (grade) => {
    setGradeReqModal({
      isOpen: true,
      isEditing: false,
      id: null,
      grade: String(grade || selectedGradeForReqs),
      category: 'اختصاص',
      requiredDays: 5,
      requiredHours: 20,
      isMandatory: true,
      alternativeTo: '',
      notes: '',
    });
  };

  const handleOpenEditGradeReqModal = (grade, req) => {
    setGradeReqModal({
      isOpen: true,
      isEditing: true,
      id: req.id,
      grade: String(grade),
      category: req.category || 'اختصاص',
      requiredDays: req.requiredDays || 5,
      requiredHours: req.requiredHours || 20,
      isMandatory: req.isMandatory !== undefined ? req.isMandatory : true,
      alternativeTo: req.alternativeTo || '',
      notes: req.notes || '',
    });
  };

  const handleSaveGradeReqModal = async () => {
    if (!gradeReqModal.category || !gradeReqModal.category.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى اختيار أو كتابة تصنيف الدورة', variant: 'destructive' });
      return;
    }

    const gKey = String(gradeReqModal.grade);
    const currentList = gradeRequirements[gKey] || [];
    let updatedList = [];

    if (gradeReqModal.isEditing && gradeReqModal.id) {
      updatedList = currentList.map((r) =>
        r.id === gradeReqModal.id
          ? {
              ...r,
              category: gradeReqModal.category.trim(),
              requiredDays: parseInt(gradeReqModal.requiredDays) || 5,
              requiredHours: parseInt(gradeReqModal.requiredHours) || 20,
              isMandatory: Boolean(gradeReqModal.isMandatory),
              alternativeTo: gradeReqModal.alternativeTo ? gradeReqModal.alternativeTo.trim() : '',
              notes: gradeReqModal.notes ? gradeReqModal.notes.trim() : '',
            }
          : r
      );
    } else {
      const newReq = {
        id: `gr_${gKey}_${Date.now()}`,
        category: gradeReqModal.category.trim(),
        requiredDays: parseInt(gradeReqModal.requiredDays) || 5,
        requiredHours: parseInt(gradeReqModal.requiredHours) || 20,
        isMandatory: Boolean(gradeReqModal.isMandatory),
        alternativeTo: gradeReqModal.alternativeTo ? gradeReqModal.alternativeTo.trim() : '',
        notes: gradeReqModal.notes ? gradeReqModal.notes.trim() : '',
      };
      updatedList = [...currentList, newReq];
    }

    const newGradeState = {
      ...gradeRequirements,
      [gKey]: updatedList,
    };

    setGradeRequirements(newGradeState);
    localStorage.setItem('GOVERNING_GRADE_REQUIREMENTS', JSON.stringify(newGradeState));
    setGradeReqModal({ ...gradeReqModal, isOpen: false });

    try {
      await request('/api/governing-courses/grade-requirements', {
        method: 'POST',
        body: JSON.stringify(newGradeState),
      });
      toast({
        title: 'تم الحفظ بنجاح',
        description: `تم تحديث وحفظ متطلبات الترفيع للدرجة (${gKey}) بنجاح`,
      });
    } catch (err) {
      toast({ title: 'تم الحفظ محلياً', description: 'تم حفظ المتطلبات بنجاح' });
    }
  };

  const handleDeleteGradeReq = async () => {
    if (!deleteGradeReqConfirm.id) return;
    const gKey = String(deleteGradeReqConfirm.grade);
    const currentList = gradeRequirements[gKey] || [];
    const updatedList = currentList.filter((r) => r.id !== deleteGradeReqConfirm.id);

    const newGradeState = {
      ...gradeRequirements,
      [gKey]: updatedList,
    };

    setGradeRequirements(newGradeState);
    localStorage.setItem('GOVERNING_GRADE_REQUIREMENTS', JSON.stringify(newGradeState));
    setDeleteGradeReqConfirm({ isOpen: false, id: null, grade: '8', category: '' });

    try {
      await request('/api/governing-courses/grade-requirements', {
        method: 'POST',
        body: JSON.stringify(newGradeState),
      });
      toast({ title: 'تم الحذف', description: 'تم حذف المتطلب التدريبي بنجاح' });
    } catch (err) {
      toast({ title: 'تم الحذف', description: 'تم حذف المتطلب بنجاح' });
    }
  };

  const handleResetGradeRequirements = async (grade) => {
    const gKey = String(grade);
    if (!window.confirm(`هل أنت متأكد من رغبتك في استعادة الحتميات التدريبية القياسية للدرجة (${gKey})؟`)) return;

    const defaultForGrade = DEFAULT_GRADE_TRAINING_REQUIREMENTS[gKey] || [];
    const newGradeState = {
      ...gradeRequirements,
      [gKey]: defaultForGrade,
    };

    setGradeRequirements(newGradeState);
    localStorage.setItem('GOVERNING_GRADE_REQUIREMENTS', JSON.stringify(newGradeState));

    try {
      await request('/api/governing-courses/grade-requirements', {
        method: 'POST',
        body: JSON.stringify(newGradeState),
      });
      toast({ title: 'تمت الاستعادة', description: `تمت استعادة المتطلبات القياسية للدرجة (${gKey})` });
    } catch (err) {
      toast({ title: 'تمت الاستعادة', description: 'تمت استعادة المتطلبات القياسية' });
    }
  };

  // ----------------------------------------------------
  // MATRIX PATHS (TAB 1) HANDLERS
  // ----------------------------------------------------
  const handleOpenAddMatrixModal = () => {
    setMatrixModal({
      isOpen: true,
      isEditing: false,
      id: null,
      trackName: '',
      fromGrade: 8,
      toGrade: 7,
      requiredCoursesText: '',
      alternativeText: '',
      notes: '',
    });
  };

  const handleOpenEditMatrixModal = (item) => {
    setMatrixModal({
      isOpen: true,
      isEditing: true,
      id: item.id,
      trackName: item.trackName || '',
      fromGrade: item.fromGrade || 1,
      toGrade: item.toGrade || 1,
      requiredCoursesText: item.requiredCoursesText || '',
      alternativeText: item.alternativeText || '',
      notes: item.notes || '',
    });
  };

  const handleSaveMatrixPathModal = async () => {
    if (!matrixModal.trackName || !matrixModal.trackName.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال اسم مسار الترقية', variant: 'destructive' });
      return;
    }
    if (!matrixModal.requiredCoursesText || !matrixModal.requiredCoursesText.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال الدورات الحاكمة المطلوبة', variant: 'destructive' });
      return;
    }

    let updated = [];
    if (matrixModal.isEditing && matrixModal.id) {
      updated = matrixPaths.map((item) =>
        item.id === matrixModal.id
          ? {
              ...item,
              trackName: matrixModal.trackName.trim(),
              fromGrade: parseInt(matrixModal.fromGrade) || 1,
              toGrade: parseInt(matrixModal.toGrade) || 1,
              requiredCoursesText: matrixModal.requiredCoursesText.trim(),
              alternativeText: matrixModal.alternativeText ? matrixModal.alternativeText.trim() : '',
              notes: matrixModal.notes ? matrixModal.notes.trim() : '',
            }
          : item
      );
    } else {
      const newItem = {
        id: `mat_${Date.now()}`,
        trackName: matrixModal.trackName.trim(),
        fromGrade: parseInt(matrixModal.fromGrade) || 1,
        toGrade: parseInt(matrixModal.toGrade) || 1,
        requiredCoursesText: matrixModal.requiredCoursesText.trim(),
        alternativeText: matrixModal.alternativeText ? matrixModal.alternativeText.trim() : '',
        notes: matrixModal.notes ? matrixModal.notes.trim() : '',
      };
      updated = [newItem, ...matrixPaths];
    }

    setMatrixPaths(updated);
    localStorage.setItem('PROMOTION_PATHS_MATRIX', JSON.stringify(updated));
    setMatrixModal({ ...matrixModal, isOpen: false });

    try {
      await request('/api/governing-courses/matrix', {
        method: 'POST',
        body: JSON.stringify(updated),
      });
      toast({ title: 'تم الحفظ', description: 'تم حفظ مسار الترقية والدورات المطلوبة بنجاح' });
    } catch (err) {
      toast({ title: 'تم الحفظ محلياً', description: 'تم حفظ التعديلات بنجاح' });
    }
  };

  const handleDeleteMatrixPath = async () => {
    if (!deleteMatrixConfirm.id) return;
    const updated = matrixPaths.filter((m) => m.id !== deleteMatrixConfirm.id);
    setMatrixPaths(updated);
    localStorage.setItem('PROMOTION_PATHS_MATRIX', JSON.stringify(updated));
    setDeleteMatrixConfirm({ isOpen: false, id: null, trackName: '' });

    try {
      await request('/api/governing-courses/matrix', {
        method: 'POST',
        body: JSON.stringify(updated),
      });
      toast({ title: 'تم الحذف', description: 'تم حذف مسار الترقية بنجاح' });
    } catch (err) {
      toast({ title: 'تم الحذف', description: 'تم حذف المسار بنجاح' });
    }
  };

  // ----------------------------------------------------
  // EXEMPTION RULES (TAB 2) HANDLERS
  // ----------------------------------------------------
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
      toast({ title: 'تم الحذف بنجاح', description: 'تمت إزالة ضابطة الإعفاء وحفظ التغييرات في قاعدة البيانات' });
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

  const openFulfillmentModalForEmployee = (emp) => {
    setEmployeeFulfillmentModal({
      isOpen: true,
      employee: emp,
    });
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B]">
              <GraduationCap size={22} />
            </div>
            <h2 className="text-xl font-bold text-[#1B3A6B]">إدارة الدورات التدريبية الحاكمة والمشمولين والإعفاءات</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            تحديد محددات وحتميات الدورات الحاكمة للترفيع، وضوابط الإعفاء حسب الشهادات الأكاديمية والدرجات الوظيفية، ومتابعة الاستيفاء التراكمي للموظفين.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => {
              fetchEmployeesAndTrainingData();
              fetchGradeRequirements();
              fetchMatrixPaths();
              fetchExemptionRules();
            }}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="تحديث البيانات"
          >
            <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => {
              if (activeTab === 'rules') {
                handleOpenAddRuleModal();
              } else if (activeTab === 'assignments') {
                handleOpenAddGradeReqModal(selectedGradeForReqs);
              } else {
                handleOpenAddMatrixModal();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus size={16} />
            {activeTab === 'rules'
              ? 'إضافة ضابطة إعفاء جديدة'
              : activeTab === 'assignments'
              ? `إضافة متطلب تدريبي للدرجة (${selectedGradeForReqs})`
              : 'إضافة مسار ترقية جديد'}
          </button>
        </div>
      </div>

      {/* KPI Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">مسارات الترقية والحتميات</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700"><GraduationCap size={15} /></span>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{matrixPaths.length}</p>
          <span className="text-[10px] text-slate-400 font-medium">مسار ترقية معتمد بالدليل</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-600">ضوابط وقواعد الإعفاء</span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-700"><ShieldCheck size={15} /></span>
          </div>
          <p className="text-2xl font-black text-amber-700 mt-2">{(exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES).length}</p>
          <span className="text-[10px] text-amber-600/80 font-medium">ضوابط إعفاء معتمدة بالشهادة والدرجة</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600">مستوفي بالكامل (جاهز للترقية)</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700"><CheckCheck size={15} /></span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{inclusionStats.completedFull}</p>
          <span className="text-[10px] text-emerald-600/80 font-medium">موظف استوفى الحتميات 100%</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-600">المعفيين من الدورات</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700"><CheckCircle2 size={15} /></span>
          </div>
          <p className="text-2xl font-black text-purple-700 mt-2">{inclusionStats.exempt}</p>
          <span className="text-[10px] text-purple-600/80 font-medium">إعفاء بالشهادة العليا / المتوسطة فما دون</span>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('catalog')}
          className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
              : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200/70'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'catalog' ? 'bg-white/15 text-white' : 'bg-blue-50 text-[#1B3A6B]'}`}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs block font-bold">1. دليل الدورات الحاكمة</span>
            <span className={`text-[11px] block mt-0.5 leading-snug ${activeTab === 'catalog' ? 'text-slate-200' : 'text-slate-500'}`}>
              الدورات الحتمية اللازم استيفاؤها لأغراض الترقية مع إمكانية الإضافة والتعديل
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rules')}
          className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
              : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200/70'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'rules' ? 'bg-white/15 text-white' : 'bg-amber-50 text-amber-700'}`}>
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs block font-bold">2. ضوابط الإعفاء</span>
            <span className={`text-[11px] block mt-0.5 leading-snug ${activeTab === 'rules' ? 'text-slate-200' : 'text-slate-500'}`}>
              الشهادات المعفاة من استيفاء الدورات الحتمية المؤثرة مباشرة على شروط الترقية
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('inclusions')}
          className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
            activeTab === 'inclusions'
              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
              : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200/70'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'inclusions' ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs block font-bold">3. المشمولين وغير المشمولين</span>
            <span className={`text-[11px] block mt-0.5 leading-snug ${activeTab === 'inclusions' ? 'text-slate-200' : 'text-slate-500'}`}>
              استعراض الموظفين والبحث بالاسم أو رقم الشركة ومتابعة الاستيفاء التراكمي
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('assignments')}
          className={`p-3.5 rounded-xl border text-right transition-all flex items-start gap-3 cursor-pointer ${
            activeTab === 'assignments'
              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
              : 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border-slate-200/70'
          }`}
        >
          <div className={`p-2 rounded-lg shrink-0 ${activeTab === 'assignments' ? 'bg-white/15 text-white' : 'bg-purple-50 text-purple-700'}`}>
            <Award className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-xs block font-bold">4. تحديد الدورات للمشمولين</span>
            <span className={`text-[11px] block mt-0.5 leading-snug ${activeTab === 'assignments' ? 'text-slate-200' : 'text-slate-500'}`}>
              تحديد الدرجة وتعيين تصنيفات وساعات وأيام الدورات الحتمية للترقية
            </span>
          </div>
        </button>
      </div>

      {/* TAB 1: CATALOG OF GOVERNING COURSES (OFFICIAL PROMOTION PATHS MATRIX TABLE) */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Header & Controls for Promotion Matrix Table */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">جدول حتميات مسارات الترقية والدرجات الوظيفية المعتمدة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  محددات الدورات الحاكمة وفق سلم الرواتب والخدمة المدنية (من الدرجة 8 إلى الدرجة 1)
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    placeholder="ابحث بالمسار أو الدرجة أو الشروط..."
                    className="w-full pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-hidden"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleOpenAddMatrixModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مسار ترقية</span>
                </button>
              </div>
            </div>

            {/* Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-3.5 w-44">مسار الترقية</th>
                    <th className="p-3.5 w-36 text-center">الدرجة (من ← إلى)</th>
                    <th className="p-3.5">الدورات الحاكمة المطلوبة والبدائل المعتمدة</th>
                    <th className="p-3.5 w-24 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matrixPaths
                    .filter((item) => {
                      if (!matrixSearch) return true;
                      const q = matrixSearch.toLowerCase().trim();
                      const t = (item.trackName || '').toLowerCase();
                      const c = (item.requiredCoursesText || '').toLowerCase();
                      const a = (item.alternativeText || '').toLowerCase();
                      return t.includes(q) || c.includes(q) || a.includes(q) || String(item.fromGrade).includes(q) || String(item.toGrade).includes(q);
                    })
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900 align-top">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100/80 text-amber-900 font-bold border border-amber-200/80 inline-block">
                            {item.trackName}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-mono font-bold text-slate-800 bg-slate-50/50 align-top text-sm">
                          {item.fromGrade} ← {item.toGrade}
                        </td>
                        <td className="p-3.5 space-y-2 align-top">
                          <div className="whitespace-pre-line text-slate-800 leading-relaxed font-medium">
                            {item.requiredCoursesText}
                          </div>
                          {item.alternativeText && (
                            <div className="text-emerald-800 font-medium text-[11px] bg-emerald-50/90 p-2 rounded-xl border border-emerald-200 leading-relaxed">
                              {item.alternativeText}
                            </div>
                          )}
                          {item.notes && !item.alternativeText && (
                            <p className="text-[11px] text-slate-500">{item.notes}</p>
                          )}
                        </td>
                        <td className="p-3.5 text-center align-top">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditMatrixModal(item)}
                              className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                              title="تعديل المسار"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteMatrixConfirm({ isOpen: true, id: item.id, trackName: item.trackName })}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف المسار"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                    إضافة وتعديل ضوابط الإعفاء المستندة إلى الشهادة الأكاديمية والدرجات الوظيفية
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
                <select
                  value={ruleCategoryFilter}
                  onChange={(e) => setRuleCategoryFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden"
                >
                  <option value="all">كافة الفئات (شهادات / درجات / استثناءات)</option>
                  <option value="qualification">تعتمد على الشهادة الأكاديمية</option>
                  <option value="grade">تعتمد على الدرجة أو العنوان الإداري</option>
                  <option value="general">استثناء عام / خدمة وظيفية</option>
                </select>

                <select
                  value={ruleStatusFilter}
                  onChange={(e) => setRuleStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden"
                >
                  <option value="all">كافة الحالات</option>
                  <option value="active">مفعلة وتطبق تلقائياً</option>
                  <option value="inactive">معطلة مؤقتاً</option>
                </select>
              </div>
            </div>

            {/* Dynamic Rules Cards List */}
            <div className="grid grid-cols-1 gap-3.5">
              {(exemptionRules.rules || DEFAULT_DYNAMIC_EXEMPTION_RULES)
                .filter((r) => {
                  if (ruleCategoryFilter !== 'all' && r.category !== ruleCategoryFilter) return false;
                  if (ruleStatusFilter === 'active' && !r.isExempt) return false;
                  if (ruleStatusFilter === 'inactive' && r.isExempt) return false;
                  if (ruleSearch) {
                    const q = ruleSearch.toLowerCase();
                    const title = (r.title || '').toLowerCase();
                    const basis = (r.legalBasis || '').toLowerCase();
                    return title.includes(q) || basis.includes(q);
                  }
                  return true;
                })
                .map((rule) => {
                  const typeObj = EXEMPTION_TYPES_OPTIONS.find((t) => t.value === rule.exemptionType) || EXEMPTION_TYPES_OPTIONS[0];

                  return (
                    <div
                      key={rule.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        rule.isExempt
                          ? 'bg-white border-slate-200 hover:border-amber-400 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${typeObj.color}`}>
                              {typeObj.label}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
                              {rule.category === 'qualification'
                                ? 'التحصيل الدراسي'
                                : rule.category === 'grade'
                                ? 'الدرجة والعنوان'
                                : 'عام / خدمة'}
                            </span>
                          </div>

                          <h4 className="font-bold text-base text-slate-900 leading-snug">{rule.title}</h4>

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

                          {rule.legalBasis && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 mt-2 leading-relaxed">
                              <span className="font-bold text-slate-700 ml-1">السند والضابطة:</span>
                              {rule.legalBasis}
                            </p>
                          )}
                        </div>

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
                            onClick={() => handleConfirmDeleteRule(rule.id)}
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

      {/* TAB 3: INCLUSION & EXEMPTION MANAGEMENT DASHBOARD & CUMULATIVE FULFILLMENT */}
      {activeTab === 'inclusions' && (
        <div className="space-y-5">
          {/* Quick Stats Grid for Inclusions & Training Readiness */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-slate-500 font-medium block">إجمالي الموظفين</span>
              <span className="text-xl font-black text-slate-800 mt-0.5 block">{inclusionStats.total}</span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-blue-700 font-medium block">معفيين (الشهادات والضوابط)</span>
              <span className="text-xl font-black text-blue-800 mt-0.5 block">{inclusionStats.exempt}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-emerald-700 font-medium block">مستوفي بالكامل (100%)</span>
              <span className="text-xl font-black text-emerald-800 mt-0.5 block">{inclusionStats.completedFull}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-amber-700 font-medium block">مستوفي جزئياً (قيد الإنجاز)</span>
              <span className="text-xl font-black text-amber-800 mt-0.5 block">{inclusionStats.partial}</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 shadow-2xs">
              <span className="text-[11px] text-red-700 font-medium block">غير مستوفي (0%)</span>
              <span className="text-xl font-black text-red-800 mt-0.5 block">{inclusionStats.notCompleted}</span>
            </div>
          </div>

          {/* Filters Bar with Instant Company Number / ID & Name Search */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={incSearch}
                  onChange={(e) => setIncSearch(e.target.value)}
                  placeholder="ابحث باسم الموظف أو رقم الشركة أو الرقم الوظيفي..."
                  className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <select
                  value={incStatusFilter}
                  onChange={(e) => setIncStatusFilter(e.target.value)}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="all">كافة حالات الاستيفاء والشمول</option>
                  <option value="exempt">🛡️ المعفيين من الدورات (بالشهادة / الإداري)</option>
                  <option value="completed_full">🏆 مستوفي بالكامل 100% (جاهز للترقية)</option>
                  <option value="partial">⏳ مستوفي جزئياً (قيد استكمال الحتميات)</option>
                  <option value="not_completed">❌ غير مستوفي (0%)</option>
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

          {/* Employees Table with Comprehensive Fulfillment Indicators */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="p-3.5">اسم الموظف / رقم الشركة والرقم الوظيفي</th>
                    <th className="p-3.5 text-center">الدرجة الحالية والترقية المستهدفة</th>
                    <th className="p-3.5">الشهادة الأكاديمية والعنوان الوظيفي</th>
                    <th className="p-3.5 text-center">حالة الاستيفاء والشمول التدريبي</th>
                    <th className="p-3.5 text-center">مؤشر الإنجاز التراكمي</th>
                    <th className="p-3.5 text-center">الإجراءات والتفاصيل</th>
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
                    filteredInclusionEmployees.map((item) => {
                      const emp = item.emp;
                      const empName = emp.fullName || emp.full_name || emp.name || 'موظف بدون اسم';
                      const empCompanyNo = emp.companyNumber || emp.company_number || emp.employeeNumber || emp.employee_number || emp.civilServiceNumber || emp.civil_service_number || String(emp.id);
                      const empEdu = emp.educationLevel || emp.education_level || 'غير مسجلة';
                      const empTitle = emp.jobTitle || emp.job_title || 'غير محدد';
                      const empDept = emp.department || emp.section || 'المقر الرئيسي';

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5">
                            <span className="font-bold text-slate-900 block text-xs">{empName}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-1.5 py-0.2 rounded">
                                رقم الشركة: {empCompanyNo}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ID: #{emp.id}
                              </span>
                            </div>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-xl font-bold text-slate-800 text-[11px]">
                              <span>الدرجة {item.empGradeNum}</span>
                              <span className="text-amber-600">←</span>
                              <span className="text-emerald-700">الدرجة {item.targetGradeNum}</span>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <span className="font-semibold text-slate-800 block text-xs">{empTitle}</span>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                              <GraduationCap className="w-3 h-3 text-amber-700 shrink-0" />
                              <span>{empEdu}</span>
                              <span>•</span>
                              <span>{empDept}</span>
                            </div>
                          </td>

                          <td className="p-3.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${item.fulfillmentBadgeClass}`}>
                              {item.incInfo.isExempt ? (
                                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                              ) : item.fulfillmentKey === 'مستوفي_كامل' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              ) : item.fulfillmentKey === 'مستوفي_جزئي' ? (
                                <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                              )}
                              {item.fulfillmentLabel}
                            </span>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="w-28 mx-auto space-y-1">
                              <div className="flex justify-between text-[10px] font-bold text-slate-600">
                                <span>{item.incInfo.isExempt ? 'معفى' : `${item.satisfiedCount} من ${item.totalReqsCount}`}</span>
                                <span className="font-mono">{item.progressPercent}%</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 rounded-full ${
                                    item.incInfo.isExempt
                                      ? 'bg-blue-600'
                                      : item.progressPercent === 100
                                      ? 'bg-emerald-600'
                                      : item.progressPercent > 0
                                      ? 'bg-amber-500'
                                      : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${item.progressPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => openFulfillmentModalForEmployee(emp)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#1B3A6B]/10 hover:bg-[#1B3A6B]/20 text-[#1B3A6B] font-bold text-[11px] rounded-xl transition-all cursor-pointer"
                                title="استعراض الحتميات والدورات التراكمية"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>تفاصيل الاستيفاء</span>
                              </button>

                              <button
                                onClick={() => openExemptionModalForEmployee(emp)}
                                className="p-1.5 text-slate-500 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-all border border-slate-200"
                                title="تعديل ضابطة الإعفاء"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
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
        </div>
      )}

      {/* TAB 4: GRADE TRAINING REQUIREMENTS DEFINITION (تحديد الدورات للمشمولين بالدرجات) */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          {/* Grade Selector Strip */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-700" />
                  <span>تحديد متطلبات وحتميات الترفيع حسب الدرجة الوظيفية</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  اختر الدرجة الوظيفية الحالية لتحديد حزم تصنيفات الدورات ومدد التدريب (أيام وساعات) اللازمة للترقية للدرجة التالية.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAddGradeReqModal(selectedGradeForReqs)}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة متطلب تدريبي للدرجة</span>
                </button>
              </div>
            </div>

            {/* Grades Selection Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {[8, 7, 6, 5, 4, 3, 2].map((g) => {
                const isSelected = String(selectedGradeForReqs) === String(g);
                const reqCount = (gradeRequirements[String(g)] || []).length;
                const target = g - 1;

                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedGradeForReqs(String(g))}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs">الدرجة {g}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        ← {target}
                      </span>
                    </div>
                    <span className={`text-[10px] block mt-1 ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                      {reqCount} متطلبات محددة
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Grade Requirements Cards Grid */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  {selectedGradeForReqs}
                </div>
                <div>
                  <h4 className="font-bold text-base text-slate-900">
                    متطلبات الترقية: من الدرجة ({selectedGradeForReqs}) إلى الدرجة ({Math.max(1, parseInt(selectedGradeForReqs) - 1)})
                  </h4>
                  <p className="text-xs text-slate-500">
                    هذه الحزم تحدد نوع وتصنيف التدريب وساعات وأيام الاستيفاء التراكمي المطلوبة من الموظف للترقية
                  </p>
                </div>
              </div>

              <span className="px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                إجمالي المتطلبات: {(gradeRequirements[selectedGradeForReqs] || []).length} حتميات
              </span>
            </div>

            {/* Informational Guidance Alert */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-2.5 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">مبدأ الاستيفاء التراكمي بالبرامج التدريبية:</span> عند إنشاء خطة وبرامج تدريبية واجتياز الموظف لأي دورة (مثال: دورة اختصاص 5 أيام)، يقوم النظام تلقائياً بتجميع ساعات وأيام الموظف المنجزة من نفس التصنيف. فإذا كان متطلب الدرجة هو 10 أيام واجتاز الموظف دورتين (5 أيام + 5 أيام)، يُعتبر الموظف مستوفياً للشرط التدريبي لهذا التصنيف بالكامل.
              </div>
            </div>

            {/* Requirements Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(gradeRequirements[selectedGradeForReqs] || []).length === 0 ? (
                <div className="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-400 space-y-2">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-bold">لا توجد متطلبات مضافة حالياً لهذه الدرجة</p>
                  <button
                    onClick={() => handleOpenAddGradeReqModal(selectedGradeForReqs)}
                    className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl"
                  >
                    إضافة متطلب تدريبي جديد
                  </button>
                </div>
              ) : (
                (gradeRequirements[selectedGradeForReqs] || []).map((req) => {
                  const catMatch = COURSE_CATEGORY_OPTIONS.find((c) => c.value === req.category) || {
                    badge: req.category,
                    bg: 'bg-slate-50 text-slate-800 border-slate-200',
                  };

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 shadow-2xs transition-all space-y-3"
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold border ${catMatch.bg}`}>
                            {catMatch.badge}
                          </span>
                          <h4 className="font-bold text-sm text-slate-900 pt-1">{req.category}</h4>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditGradeReqModal(selectedGradeForReqs, req)}
                            className="p-1.5 text-slate-500 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="تعديل المتطلب"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteGradeReqConfirm({
                                isOpen: true,
                                id: req.id,
                                grade: selectedGradeForReqs,
                                category: req.category,
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف المتطلب"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Required Duration Metric */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">المدة بالأيام</span>
                            <span className="font-bold text-xs text-slate-800">{req.requiredDays} أيام تدريبية</span>
                          </div>
                        </div>

                        <div className="p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-700 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-500 block">المدة بالساعات</span>
                            <span className="font-bold text-xs text-slate-800">{req.requiredHours} ساعة تدريبية</span>
                          </div>
                        </div>
                      </div>

                      {/* Mandatory / Alternative / Notes */}
                      <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                        {req.alternativeTo && (
                          <div className="text-emerald-800 font-medium text-[11px] bg-emerald-50/90 p-2 rounded-xl border border-emerald-200">
                            💡 {req.alternativeTo}
                          </div>
                        )}
                        {req.notes && (
                          <p className="text-[11px] text-slate-500 leading-relaxed">{req.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD/EDIT GRADE REQUIREMENT (TAB 4) */}
      {gradeReqModal.isOpen && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 my-8 animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {gradeReqModal.isEditing ? 'تعديل متطلب تدريبي للدرجة' : 'إضافة متطلب تدريبي جديد للدرجة'} ({gradeReqModal.grade})
                  </h3>
                  <p className="text-xs text-slate-500">تحديد تصنيف الدورة والمدة المطلوبة بالأيام والساعات للترقية</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGradeReqModal({ ...gradeReqModal, isOpen: false })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              {/* Category selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف ونوع الدورة الحتمية *</label>
                <select
                  value={gradeReqModal.category}
                  onChange={(e) => {
                    const selectedCat = e.target.value;
                    const matchedOpt = COURSE_CATEGORY_OPTIONS.find((c) => c.value === selectedCat);
                    setGradeReqModal({
                      ...gradeReqModal,
                      category: selectedCat,
                      requiredDays: matchedOpt ? matchedOpt.defaultDays : gradeReqModal.requiredDays,
                      requiredHours: matchedOpt ? matchedOpt.defaultHours : gradeReqModal.requiredHours,
                    });
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white"
                >
                  {COURSE_CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Category name if not in standard */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسمى النصي للتصنيف / المتطلب</label>
                <input
                  type="text"
                  value={gradeReqModal.category}
                  onChange={(e) => setGradeReqModal({ ...gradeReqModal, category: e.target.value })}
                  placeholder="مثال: دورة اختصاص متقدمة أو إدارية"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>

              {/* Days & Hours */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدة المطلوبة (بالأيام) *</label>
                  <input
                    type="number"
                    min="1"
                    value={gradeReqModal.requiredDays}
                    onChange={(e) => {
                      const d = parseInt(e.target.value) || 1;
                      setGradeReqModal({
                        ...gradeReqModal,
                        requiredDays: d,
                        requiredHours: d * 4,
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدة المطلوبة (بالساعات) *</label>
                  <input
                    type="number"
                    min="1"
                    value={gradeReqModal.requiredHours}
                    onChange={(e) => setGradeReqModal({ ...gradeReqModal, requiredHours: parseInt(e.target.value) || 1 })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono"
                  />
                </div>
              </div>

              {/* Alternative Text */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البديل الإداري أو الاستثناء التبادلي (اختياري)</label>
                <input
                  type="text"
                  value={gradeReqModal.alternativeTo}
                  onChange={(e) => setGradeReqModal({ ...gradeReqModal, alternativeTo: e.target.value })}
                  placeholder="مثال: 💡 للعنوان الإداري دورة واحدة ≥ شهر تغني عن الحتميات"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات وضوابط تفصيلية</label>
                <textarea
                  rows="2"
                  value={gradeReqModal.notes}
                  onChange={(e) => setGradeReqModal({ ...gradeReqModal, notes: e.target.value })}
                  placeholder="ملاحظات توضيحية حول شروط استيفاء هذا المتطلب..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGradeReqModal({ ...gradeReqModal, isOpen: false })}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveGradeReqModal}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                حفظ المتطلب التدريبي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DELETE GRADE REQUIREMENT CONFIRMATION */}
      {deleteGradeReqConfirm.isOpen && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">تأكيد حذف المتطلب التدريبي</h3>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت متأكد من حذف متطلب <span className="font-bold text-slate-800">"{deleteGradeReqConfirm.category}"</span> من شروط الترقية للدرجة ({deleteGradeReqConfirm.grade})؟
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteGradeReqConfirm({ isOpen: false, id: null, grade: '8', category: '' })}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteGradeReq}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                حذف المتطلب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EMPLOYEE DETAILED FULFILLMENT & COURSES HISTORY MODAL */}
      {employeeFulfillmentModal.isOpen && employeeFulfillmentModal.employee && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[90vh] overflow-y-auto animate-scaleUp">
            {(() => {
              const details = getEmployeeFulfillmentDetails(employeeFulfillmentModal.employee);
              if (!details) return null;
              const emp = details.emp;

              return (
                <div className="space-y-5">
                  {/* Header */}
                  <div className="flex justify-between items-start pb-4 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 inline-block mb-1">
                        بطاقة الاستيفاء التراكمي للترقية
                      </span>
                      <h3 className="font-black text-lg text-slate-900">
                        {emp.fullName || emp.full_name || emp.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        رقم الشركة: <span className="font-mono font-bold text-slate-700">{emp.companyNumber || emp.employeeNumber || emp.civilServiceNumber || emp.id}</span> • {emp.jobTitle || emp.job_title || 'بدون عنوان'} • {emp.department || 'المقر الرئيسي'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEmployeeFulfillmentModal({ isOpen: false, employee: null })}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Status Banner */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">مسار الترقية المستهدف:</span>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-md font-bold text-xs font-mono">
                          الدرجة {details.empGradeNum} ← الدرجة {details.targetGradeNum}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        التحصيل الدراسي المعتمد: <span className="font-bold text-slate-800">{emp.educationLevel || emp.education_level || 'غير مسجل'}</span>
                      </p>
                    </div>

                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${details.fulfillmentBadgeClass}`}>
                      {details.fulfillmentLabel}
                    </span>
                  </div>

                  {/* If exempt, show details */}
                  {details.incInfo.isExempt && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-1.5">
                      <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                        <ShieldCheck className="w-4 h-4 text-blue-700" />
                        <span>الموظف معفى من الدورات الحتمية للترقية</span>
                      </div>
                      <p className="text-xs text-blue-800 leading-relaxed">{details.incInfo.reason}</p>
                      {details.incInfo.orderNo && (
                        <span className="inline-block text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          أمر رقم: {details.incInfo.orderNo} بتاريخ {details.incInfo.orderDate || '-'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Requirements vs Completed Comparison Table */}
                  <div className="space-y-3">
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-700" />
                      <span>مقارنة متطلبات الدرجة مع الدورات المنجزة تراكمياً:</span>
                    </h4>

                    {details.reqs.length === 0 ? (
                      <p className="text-xs text-slate-400 p-4 bg-slate-50 rounded-xl text-center">
                        لا توجد حتميات تدريبية مسجلة لهذه الدرجة في النظام
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {details.reqs.map((req) => (
                          <div
                            key={req.id}
                            className={`p-3.5 rounded-2xl border transition-all ${
                              req.isSatisfied
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : req.totalCompletedDays > 0
                                ? 'bg-amber-50/60 border-amber-200'
                                : 'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <span className="font-bold text-xs text-slate-900 block">{req.category}</span>
                                <span className="text-[10px] text-slate-500">
                                  المطلوب: {req.requiredDays} أيام ({req.requiredHours} ساعة)
                                </span>
                              </div>

                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  req.isSatisfied
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : req.totalCompletedDays > 0
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-red-100 text-red-700 border-red-200'
                                }`}
                              >
                                {req.isSatisfied
                                  ? '✅ مستوفى بالكامل'
                                  : req.totalCompletedDays > 0
                                  ? `⏳ مستوفى جزئياً (متبقي ${req.remainingDays} أيام)`
                                  : `❌ غير مستوفى (مطلوب ${req.requiredDays} أيام)`}
                              </span>
                            </div>

                            <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-700">
                              <span>المنجز الفعلي: <span className="font-bold">{req.totalCompletedDays}</span> أيام ({req.totalCompletedHours} ساعة)</span>
                              <span className="text-[10px] text-slate-400">عدد الدورات المحتسبة: {req.matchedCourses.length}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* List of Completed Courses */}
                  <div className="space-y-3 pt-2">
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-700" />
                      <span>سجل البرامج والدورات التدريبية المجتازة للموظف ({details.completedCourses.length}):</span>
                    </h4>

                    {details.completedCourses.length === 0 ? (
                      <p className="text-xs text-slate-400 p-4 bg-slate-50 rounded-xl text-center">
                        لم يتم تسجيل أي دورات أو برامج تدريبية مجتازة للموظف حتى الآن
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                        {details.completedCourses.map((c, idx) => (
                          <div key={idx} className="p-2.5 bg-white border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                            <div>
                              <span className="font-bold text-slate-900 block">{c.name}</span>
                              <span className="text-[10px] text-slate-500">التصنيف: {c.category} • المدة: {c.days} أيام ({c.hours} ساعة)</span>
                            </div>
                            <div className="text-left">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                                {c.result} (الدرجة: {c.score}%)
                              </span>
                              <span className="block text-[9px] text-slate-400 mt-0.5">بتاريخ: {c.certDate}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEmployeeFulfillmentModal({ isOpen: false, employee: null })}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                    >
                      إغلاق
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmployeeFulfillmentModal({ isOpen: false, employee: null });
                        openExemptionModalForEmployee(emp);
                      }}
                      className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                    >
                      تعديل حالة الإعفاء
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 4: EMPLOYEE EXEMPTION EDIT MODAL */}
      {exemptionModal.isOpen && exemptionModal.employee && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">تعديل شمول وإعفاء الموظف</h3>
                  <p className="text-xs text-slate-500">
                    الموظف: {exemptionModal.employee.fullName || exemptionModal.employee.full_name || exemptionModal.employee.name}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExemptionModal({ isOpen: false, employee: null, status: 'مشمول', exemptionReason: '', exemptionOrderNumber: '', exemptionOrderDate: '', notes: '' })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">حالة الشمول بالدورات الحاكمة *</label>
                <select
                  value={exemptionModal.status}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, status: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  <option value="مشمول">مشمول بالدورات الحاكمة (ملزم باستيفاء الحتميات للترقية)</option>
                  <option value="معفى_شهادة">معفى تلقائياً (بحكم الشهادة الأكاديمية العليا أو المتوسطة فما دون)</option>
                  <option value="معفى_درجة">معفى بحكم الدرجة أو العنوان الوظيفي القيادي</option>
                  <option value="معفى_استثناء">معفى استثناءً بأمر أو قرار إداري وزاري</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب أو سند الإعفاء</label>
                <input
                  type="text"
                  value={exemptionModal.exemptionReason}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionReason: e.target.value })}
                  placeholder="مثال: حاصل على شهادة الدكتوراه / استثناء وزاري خاص..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الأمر الإداري للإعفاء</label>
                  <input
                    type="text"
                    value={exemptionModal.exemptionOrderNumber}
                    onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionOrderNumber: e.target.value })}
                    placeholder="رقم الكتاب / الأمر..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الأمر الإداري</label>
                  <input
                    type="date"
                    value={exemptionModal.exemptionOrderDate}
                    onChange={(e) => setExemptionModal({ ...exemptionModal, exemptionOrderDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                <textarea
                  rows="2"
                  value={exemptionModal.notes}
                  onChange={(e) => setExemptionModal({ ...exemptionModal, notes: e.target.value })}
                  placeholder="ملاحظات توضيحية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setExemptionModal({ isOpen: false, employee: null, status: 'مشمول', exemptionReason: '', exemptionOrderNumber: '', exemptionOrderDate: '', notes: '' })}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEmployeeExemptionModal}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md"
              >
                حفظ حالة الموظف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: EXEMPTION RULE ADD/EDIT (TAB 2) */}
      {ruleModal.isOpen && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {ruleModal.isEditing ? 'تعديل ضابطة وقاعدة الإعفاء' : 'إضافة ضابطة إعفاء جديدة'}
                  </h3>
                  <p className="text-xs text-slate-500">تحديد شروط وسند الإعفاء التلقائي من الدورات الحاكمة</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setRuleModal({ ...ruleModal, isOpen: false })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
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

      {/* MODAL 6: MATRIX PATH ADD/EDIT (TAB 1) */}
      {matrixModal.isOpen && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 my-8 max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {matrixModal.isEditing ? 'تعديل مسار الترقية والحتميات' : 'إضافة مسار ترقية وحتميات جديدة'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    تحديد مسمى المسار، الدرجة من وإلى، والدورات الحاكمة المطلوبة
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMatrixModal({ ...matrixModal, isOpen: false })}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مسمى مسار الترقية *</label>
                <input
                  type="text"
                  value={matrixModal.trackName}
                  onChange={(e) => setMatrixModal({ ...matrixModal, trackName: e.target.value })}
                  placeholder="مثال: الثانية ← الأولى أو الثالثة ← الثانية"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدرجة الحالية (من) *</label>
                  <select
                    value={matrixModal.fromGrade}
                    onChange={(e) => setMatrixModal({ ...matrixModal, fromGrade: parseInt(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
                      <option key={g} value={g}>
                        الدرجة {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الدرجة المترفع إليها (إلى) *</label>
                  <select
                    value={matrixModal.toGrade}
                    onChange={(e) => setMatrixModal({ ...matrixModal, toGrade: parseInt(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
                  >
                    {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
                      <option key={g} value={g}>
                        الدرجة {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدورات الحاكمة المطلوبة (نص مفصل) *</label>
                <textarea
                  rows="4"
                  value={matrixModal.requiredCoursesText}
                  onChange={(e) => setMatrixModal({ ...matrixModal, requiredCoursesText: e.target.value })}
                  placeholder="اكتب الدورات المطلوبة مع الترقيم أو الترتيب..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البديل الإداري أو الاستثناءات (اختياري)</label>
                <textarea
                  rows="2"
                  value={matrixModal.alternativeText}
                  onChange={(e) => setMatrixModal({ ...matrixModal, alternativeText: e.target.value })}
                  placeholder="مثال: 💡 بديل كامل: للعنوان الإداري دورة واحدة..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
                <input
                  type="text"
                  value={matrixModal.notes}
                  onChange={(e) => setMatrixModal({ ...matrixModal, notes: e.target.value })}
                  placeholder="ملاحظات توضيحية..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMatrixModal({ ...matrixModal, isOpen: false })}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveMatrixPathModal}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                حفظ مسار الترقية
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: DELETE MATRIX CONFIRMATION */}
      {deleteMatrixConfirm.isOpen && (
        <div className="fixed inset-0 pointer-events-auto z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-slate-900">تأكيد حذف مسار الترقية</h3>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت متأكد من رغبتك في حذف مسار الترقية{' '}
                <span className="font-bold text-slate-800">"{deleteMatrixConfirm.trackName}"</span> من الدليل؟
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteMatrixConfirm({ isOpen: false, id: null, trackName: '' })}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteMatrixPath}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
              >
                حذف المسار
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
