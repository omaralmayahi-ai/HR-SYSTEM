import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardCheck,
  Plus,
  Search,
  Edit2,
  Trash2,
  Copy,
  Eye,
  CheckCircle2,
  X,
  AlertCircle,
  Award,
  Users,
  FileText,
  Sliders,
  Printer,
  AlertTriangle,
  ShieldAlert,
  RotateCcw
} from 'lucide-react';
import apiClient, { request } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { notifySettingsChanged } from '@/lib/settingsUtils';
import { useAuth } from '@/lib/AuthContext';

const RESPONSIBILITY_OPTIONS = [
  'مدير عام',
  'معاون مدير عام',
  'مدير هيئة',
  'مدير قسم مركزي',
  'مدير قسم',
  'مسؤول شعبة',
  'مسؤول وحدة',
  'مسؤول وجبة',
  'بلا مسؤولية'
];

const QUALIFICATION_OPTIONS = [
  'دكتوراه',
  'ماجستير',
  'دبلوم عالي',
  'بكالوريوس',
  'دبلوم',
  'إعدادية',
  'متوسطة',
  'ابتدائية',
  'يقرأ ويكتب',
  'أمي'
];

const CATEGORY_OPTIONS = [
  'الوظائف القيادية والإشرافية',
  'الكادر التنفيذي والتخصصي (شهادة إعدادية فأعلى)',
  'المهن الحرفية والخدمية (شهادة متوسطة فأدنى)',
  'جميع الفئات الوظيفية'
];

export default function EvaluationFormsSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const secondaryColor = appPublicSettings?.secondaryColor || '#C8960C';
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [selectedStatus, setSelectedStatus] = useState('الكل');

  // Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState(null);
  const [previewingForm, setPreviewingForm] = useState(null);
  const [deletingForm, setDeletingForm] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Builder Data
  const [formData, setFormData] = useState({
    title: '',
    category: CATEGORY_OPTIONS[0],
    targetGrades: 'جميع الدرجات',
    applicableResponsibilities: RESPONSIBILITY_OPTIONS.slice(0, 8),
    applicableQualifications: QUALIFICATION_OPTIONS,
    maxScore: 100,
    passingScore: 50,
    description: '',
    status: 'فعال',
    enableWeaknesses: false,
    enableStrengths: false,
    enableTrainingNeeds: false,
    enableEmployeeOpinion: false,
    sections: [
      {
        id: 'sec_1',
        title: 'محور الأداء والتنفيذ المهني',
        weight: 50,
        criteria: [
          { id: 'crit_1', name: 'جودة ودقة المخرجات الإدارية/الفنية', maxScore: 25 },
          { id: 'crit_2', name: 'السرعة والالتزام بالتوقيتات المحددة', maxScore: 25 }
        ]
      },
      {
        id: 'sec_2',
        title: 'محور الانضباط والسلوك الوظيفي',
        weight: 50,
        criteria: [
          { id: 'crit_3', name: 'الالتزام بساعات الدوام والتعليمات الرسمية', maxScore: 25 },
          { id: 'crit_4', name: 'التعاون وحسن التعامل مع المراجعين وفريق العمل', maxScore: 25 }
        ]
      }
    ]
  });

  const loadForms = async () => {
    setLoading(true);
    try {
      const res = await apiClient.entities.EvaluationForm.list();
      setForms(res || []);
    } catch (err) {
      console.error('Error loading evaluation forms:', err);
      toast({
        title: 'خطأ في تحميل الاستمارات',
        description: err.message || 'تعذر تحميل استمارات تقييم الأداء',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  const handleOpenCreate = () => {
    setEditingForm(null);
    setFormData({
      title: '',
      category: CATEGORY_OPTIONS[0],
      targetGrades: 'جميع الدرجات',
      applicableResponsibilities: RESPONSIBILITY_OPTIONS.slice(0, 8),
      applicableQualifications: QUALIFICATION_OPTIONS,
      maxScore: 100,
      passingScore: 50,
      description: '',
      status: 'فعال',
      enableWeaknesses: false,
      enableStrengths: false,
      enableTrainingNeeds: false,
      enableEmployeeOpinion: false,
      sections: [
        {
          id: 'sec_1',
          title: 'محور الأداء والتنفيذ المهني',
          weight: 50,
          criteria: [
            { id: 'crit_1', name: 'جودة ودقة المخرجات والمهام', maxScore: 25 },
            { id: 'crit_2', name: 'السرعة والالتزام بالتوقيتات المعتمدة', maxScore: 25 }
          ]
        },
        {
          id: 'sec_3',
          title: 'محور الانضباط والسلوك الوظيفي',
          weight: 50,
          criteria: [
            { id: 'crit_3', name: 'الالتزام بضوابط الدوام الرسمي والقوانين', maxScore: 25 },
            { id: 'crit_4', name: 'حسن التعامل مع المراجعين وفريق العمل', maxScore: 25 }
          ]
        }
      ]
    });
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (form) => {
    setEditingForm(form);
    let parsedSections = [];
    try {
      if (typeof form.sections === 'string') {
        parsedSections = JSON.parse(form.sections);
      } else if (Array.isArray(form.sections)) {
        parsedSections = form.sections;
      }
    } catch (e) {
      parsedSections = [];
    }

    let parsedResp = RESPONSIBILITY_OPTIONS;
    try {
      const rawResp = form.applicable_responsibilities || form.applicableResponsibilities;
      if (typeof rawResp === 'string') {
        parsedResp = JSON.parse(rawResp);
      } else if (Array.isArray(rawResp)) {
        parsedResp = rawResp;
      }
    } catch (e) {
      parsedResp = RESPONSIBILITY_OPTIONS;
    }

    let parsedQual = QUALIFICATION_OPTIONS;
    try {
      const rawQual = form.applicable_qualifications || form.applicableQualifications;
      if (typeof rawQual === 'string') {
        parsedQual = JSON.parse(rawQual);
      } else if (Array.isArray(rawQual)) {
        parsedQual = rawQual;
      }
    } catch (e) {
      parsedQual = QUALIFICATION_OPTIONS;
    }

    setFormData({
      title: form.title || '',
      category: form.category || CATEGORY_OPTIONS[0],
      targetGrades: form.targetGrades || 'جميع الدرجات',
      applicableResponsibilities: Array.isArray(parsedResp) && parsedResp.length > 0 ? parsedResp : RESPONSIBILITY_OPTIONS,
      applicableQualifications: Array.isArray(parsedQual) && parsedQual.length > 0 ? parsedQual : QUALIFICATION_OPTIONS,
      maxScore: form.maxScore || 100,
      passingScore: form.passingScore || 50,
      description: form.description || '',
      status: form.status || 'فعال',
      enableWeaknesses: Boolean(form.enable_weaknesses || form.enableWeaknesses),
      enableStrengths: Boolean(form.enable_strengths || form.enableStrengths),
      enableTrainingNeeds: Boolean(form.enable_training_needs || form.enableTrainingNeeds),
      enableEmployeeOpinion: Boolean(form.enable_employee_opinion || form.enableEmployeeOpinion),
      sections: parsedSections.length > 0 ? parsedSections : [
        {
          id: 'sec_1',
          title: 'محور الأداء العام',
          weight: 100,
          criteria: [{ id: 'crit_1', name: 'مستوى الأداء العام', maxScore: 100 }]
        }
      ]
    });
    setIsEditorOpen(true);
  };

  const handleDuplicate = async (form) => {
    try {
      let parsedSections = [];
      try {
        parsedSections = typeof form.sections === 'string' ? JSON.parse(form.sections) : (form.sections || []);
      } catch (e) {
        parsedSections = [];
      }

      const payload = {
        title: `${form.title} (نسخة مكررة)`,
        category: form.category,
        target_grades: form.targetGrades,
        max_score: form.maxScore,
        passing_score: form.passingScore,
        description: form.description,
        sections: JSON.stringify(parsedSections),
        enable_weaknesses: Boolean(form.enable_weaknesses || form.enableWeaknesses),
        enable_strengths: Boolean(form.enable_strengths || form.enableStrengths),
        enable_training_needs: Boolean(form.enable_training_needs || form.enableTrainingNeeds),
        enable_employee_opinion: Boolean(form.enable_employee_opinion || form.enableEmployeeOpinion),
        status: 'مسودة'
      };

      await apiClient.entities.EvaluationForm.create(payload);
      toast({
        title: 'تم تكرار الاستمارة',
        description: 'تم إنشاء نسخة مكررة بحالة مسودة بنجاح'
      });
      notifySettingsChanged('evaluationForms');
      loadForms();
    } catch (err) {
      toast({
        title: 'خطأ',
        description: err.message || 'فشل تكرار الاستمارة',
        variant: 'destructive'
      });
    }
  };

  const handleOpenDelete = (form) => {
    setDeletingForm(form);
    setDeleteConfirmText('');
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingForm) return;

    // Strict Rule 1: If active, require explicit text confirmation "حذف"
    if (deletingForm.status === 'فعال' && deleteConfirmText.trim() !== 'حذف') {
      toast({
        title: 'تأكيد الحذف مطلوب',
        description: 'يرجى كتابة كلمة (حذف) بشكل صحيح لتأكيد عملية الحذف النهائية للاستمارة الفعالة',
        variant: 'destructive'
      });
      return;
    }

    setIsDeleting(true);
    try {
      await apiClient.entities.EvaluationForm.delete(deletingForm.id);
      toast({
        title: 'تم الحذف بنجاح',
        description: `تم إزالة استمارة "${deletingForm.title}" بشكل نهائي من النظام.`
      });
      setIsDeleteModalOpen(false);
      setDeletingForm(null);
      setDeleteConfirmText('');
      notifySettingsChanged('evaluationForms');
      loadForms();
    } catch (err) {
      console.error('Error deleting evaluation form:', err);
      toast({
        title: 'فشل عملية الحذف',
        description: err.message || 'تعذر حذف الاستمارة، قد تكون مرتبطة بسجلات تقييم سابقة محفوطة للموظفين.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      await request('/api/evaluation-forms/seed-defaults', { method: 'POST' });
      toast({
        title: 'تم استعادة القوالب الثلاثة الموحدة',
        description: 'تمت إضافة وإعادة ضبط القوالب القياسية الثلاثة (FORM_1, FORM_2, FORM_3) المعتمدة بنجاح.'
      });
      notifySettingsChanged('evaluationForms');
      loadForms();
    } catch (err) {
      toast({
        title: 'خطأ',
        description: err.message || 'فشل استعادة القوالب القياسية',
        variant: 'destructive'
      });
    }
  };

  const handleToggleStatus = async (form) => {
    const nextStatus = form.status === 'فعال' ? 'غير فعال' : 'فعال';
    try {
      await apiClient.entities.EvaluationForm.update(form.id, { status: nextStatus });
      toast({
        title: 'تم تحديث الحالة',
        description: `أصبحت الاستمارة الآن بحالة: ${nextStatus}`
      });
      notifySettingsChanged('evaluationForms');
      loadForms();
    } catch (err) {
      toast({
        title: 'خطأ',
        description: 'فشل تغيير حالة الاستمارة',
        variant: 'destructive'
      });
    }
  };

  // Sections Builder Actions
  const handleAddSection = () => {
    const newSecId = `sec_${Date.now()}`;
    setFormData((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: newSecId,
          title: `محور جديد ${prev.sections.length + 1}`,
          weight: 20,
          criteria: [
            { id: `crit_${Date.now()}`, name: 'معيار تقييم فرعي', maxScore: 20 }
          ]
        }
      ]
    }));
  };

  const handleRemoveSection = (secId) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== secId)
    }));
  };

  const handleUpdateSectionTitle = (secId, title) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, title } : s))
    }));
  };

  const handleAddCriteria = (secId) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id === secId) {
          return {
            ...s,
            criteria: [
              ...s.criteria,
              { id: `crit_${Date.now()}`, name: 'معيار تقييم فرعي جديد', maxScore: 10 }
            ]
          };
        }
        return s;
      })
    }));
  };

  const handleRemoveCriteria = (secId, critId) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id === secId) {
          return {
            ...s,
            criteria: s.criteria.filter((c) => c.id !== critId)
          };
        }
        return s;
      })
    }));
  };

  const handleUpdateCriteria = (secId, critId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => {
        if (s.id === secId) {
          return {
            ...s,
            criteria: s.criteria.map((c) => {
              if (c.id === critId) {
                return { ...c, [field]: field === 'maxScore' ? Math.max(1, parseInt(value) || 0) : value };
              }
              return c;
            })
          };
        }
        return s;
      })
    }));
  };

  // Calculate current criteria score sum across all sections
  const currentTotalCriteriaScore = formData.sections.reduce((accSec, sec) => {
    const secSum = (sec.criteria || []).reduce((accCrit, c) => accCrit + (Number(c.maxScore) || 0), 0);
    return accSec + secSum;
  }, 0);

  const handleSaveForm = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast({ title: 'تنبيه', description: 'عنوان استمارة التقييم مطلوب', variant: 'destructive' });
      return;
    }

    if (formData.sections.length === 0) {
      toast({ title: 'تنبيه', description: 'يجب إضافة محور تقييم واحد على الأقل', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        title: formData.title.trim(),
        category: formData.category,
        target_grades: formData.targetGrades,
        applicable_responsibilities: JSON.stringify(formData.applicableResponsibilities || []),
        applicable_qualifications: JSON.stringify(formData.applicableQualifications || []),
        max_score: formData.maxScore,
        passing_score: formData.passingScore,
        description: formData.description,
        sections: JSON.stringify(formData.sections),
        enable_weaknesses: formData.enableWeaknesses,
        enable_strengths: formData.enableStrengths,
        enable_training_needs: formData.enableTrainingNeeds,
        enable_employee_opinion: formData.enableEmployeeOpinion,
        status: formData.status
      };

      if (editingForm) {
        await apiClient.entities.EvaluationForm.update(editingForm.id, payload);
        toast({ title: 'نجاح', description: 'تم تحديث استمارة التقييم بنجاح' });
      } else {
        await apiClient.entities.EvaluationForm.create(payload);
        toast({ title: 'نجاح', description: 'تم إنشاء استمارة تقييم جديدة بنجاح' });
      }

      setIsEditorOpen(false);
      notifySettingsChanged('evaluationForms');
      loadForms();
    } catch (err) {
      toast({
        title: 'خطأ الحفظ',
        description: err.message || 'فشل حفظ استمارة التقييم',
        variant: 'destructive'
      });
    }
  };

  // Filter forms
  const filteredForms = forms.filter((f) => {
    const matchSearch = (f.title || '').includes(searchTerm) || (f.category || '').includes(searchTerm) || (f.description || '').includes(searchTerm);
    const matchCat = selectedCategory === 'الكل' || f.category === selectedCategory;
    const matchStat = selectedStatus === 'الكل' || f.status === selectedStatus;
    return matchSearch && matchCat && matchStat;
  });

  const activeFormsCount = forms.filter((f) => f.status === 'فعال').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner & Action */}
      <div 
        className="p-6 rounded-2xl text-white shadow-md relative overflow-hidden transition-all duration-300 border border-white/10"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0d1f3c 100%)` }}
      >
        <div 
          className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full blur-3xl pointer-events-none" 
          style={{ backgroundColor: `${secondaryColor}25` }}
        />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-xs" style={{ color: secondaryColor }}>
              <Award size={16} />
              <span>نظام تقييم الأداء والكفاءة السنوي</span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white">
              إدارة وتخصيص استمارات تقييم الأداء حسب الفئات الوظيفية
            </h2>
            <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
              قم بإنشاء وتخصيص نماذج تقييم الأداء وتحديد المحاور والمعايير الفرعية والدرجات المستهدفة لكل فئة وظيفية (قيادية، هندسية، إدارية، صحية، أو خدمة مساندة).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleSeedDefaults}
              title="إعادة جلب القوالب الثلاثة القياسية الموحدة (FORM_1, FORM_2, FORM_3) وتثبيتها"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-bold text-xs border border-white/20 backdrop-blur-sm transition-all"
            >
              <RotateCcw size={15} />
              <span>استعادة القوالب الموحدة (1,2,3)</span>
            </button>
            <button
              onClick={handleOpenCreate}
              style={{
                backgroundColor: secondaryColor,
                color: '#0f172a',
                boxShadow: `0 4px 14px ${secondaryColor}40`
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-black text-xs transition-all hover:brightness-110 active:scale-95"
            >
              <Plus size={16} />
              <span>إنشاء استمارة تقييم جديدة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-500">إجمالي استمارات التقييم</span>
            <div className="text-2xl font-black text-slate-800">{forms.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            <ClipboardCheck size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-500">الاستمارات الفعالة بالخدمة</span>
            <div className="text-2xl font-black text-emerald-600">{activeFormsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-slate-500">الفئات المخصصة المتاحة</span>
            <div className="text-2xl font-black text-amber-600">
              {new Set(forms.map((f) => f.category)).size}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* Filters and Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث بعنوان الاستمارة أو الفئة الوظيفية..."
              className="w-full pr-9 pl-3 py-2 text-xs font-medium rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
          >
            <option value="الكل">جميع الفئات الوظيفية</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700"
          >
            <option value="الكل">جميع الحالات</option>
            <option value="فعال">فعال فقط</option>
            <option value="غير فعال">غير فعال</option>
            <option value="مسودة">مسودة</option>
          </select>
        </div>
      </div>

      {/* Forms List Grid */}
      {loading ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500">جاري تحميل استمارات التقييم المخصصة...</p>
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center space-y-3">
          <FileText className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">لا توجد استمارات تقييم تطابق البحث</h3>
          <p className="text-xs text-slate-400">يمكنك إضافة استمارة جديدة أو تعديل خيارات التصفية أعلاه.</p>
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors mt-2"
          >
            <Plus size={14} />
            <span>إضافة استمارة جديدة</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredForms.map((form) => {
            let sectionsCount = 0;
            let criteriaCount = 0;
            try {
              const secs = typeof form.sections === 'string' ? JSON.parse(form.sections) : (form.sections || []);
              sectionsCount = secs.length;
              criteriaCount = secs.reduce((acc, s) => acc + (s.criteria || []).length, 0);
            } catch (e) {
              sectionsCount = 0;
              criteriaCount = 0;
            }

            const isActive = form.status === 'فعال';

            return (
              <motion.div
                key={form.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white rounded-2xl border p-5 shadow-sm space-y-4 hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between ${
                  isActive ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-80'
                }`}
              >
                {/* Header Info */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                      <Users size={12} />
                      <span>{form.category}</span>
                    </span>

                    <button
                      onClick={() => handleToggleStatus(form)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                      title="انقر لتغيير الحالة"
                    >
                      {form.status || 'فعال'}
                    </button>
                  </div>

                  <h3 className="text-sm font-black text-slate-900 leading-snug">{form.title}</h3>
                  {form.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{form.description}</p>
                  )}
                </div>

                {/* Details Pills */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center border border-slate-100">
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold">الدرجة القصوى</span>
                    <span className="text-xs font-black text-slate-800">{form.maxScore || 100} / {form.passingScore || 50}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold">عدد المحاور</span>
                    <span className="text-xs font-black text-indigo-600">{sectionsCount} محاور</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 font-bold">المعايير الفرعية</span>
                    <span className="text-xs font-black text-indigo-600">{criteriaCount} معايير</span>
                  </div>
                </div>

                {/* Configured Rules Summary Badges */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400">المسؤوليات:</span>
                    {(() => {
                      let resps = [];
                      try {
                        const raw = form.applicable_responsibilities || form.applicableResponsibilities;
                        resps = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
                      } catch (e) {
                        resps = [];
                      }
                      if (!Array.isArray(resps) || resps.length === 0 || resps.length === 9) {
                        return <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">كافة المسؤوليات</span>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1">
                          {resps.slice(0, 3).map((r, idx) => (
                            <span key={idx} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                              {r}
                            </span>
                          ))}
                          {resps.length > 3 && (
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              +{resps.length - 3} أخرى
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400">الشهادات:</span>
                    {(() => {
                      let quals = [];
                      try {
                        const raw = form.applicable_qualifications || form.applicableQualifications;
                        quals = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
                      } catch (e) {
                        quals = [];
                      }
                      if (!Array.isArray(quals) || quals.length === 0 || quals.length === 10) {
                        return <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">كافة الشهادات</span>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1">
                          {quals.slice(0, 3).map((q, idx) => (
                            <span key={idx} className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                              {q}
                            </span>
                          ))}
                          {quals.length > 3 && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                              +{quals.length - 3} أخرى
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setPreviewingForm(form);
                      setIsPreviewOpen(true);
                    }}
                    className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                    title="معاينة الاستمارة"
                  >
                    <Eye size={15} />
                    <span>معاينة</span>
                  </button>

                  <button
                    onClick={() => handleDuplicate(form)}
                    className="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                    title="تكرار الاستمارة"
                  >
                    <Copy size={15} />
                    <span>نسخ</span>
                  </button>

                  <button
                    onClick={() => handleOpenEdit(form)}
                    className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
                    title="تعديل الاستمارة"
                  >
                    <Edit2 size={15} />
                    <span>تعديل</span>
                  </button>

                  <button
                    onClick={() => handleOpenDelete(form)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1"
                    title="حذف الاستمارة وفق الضوابط"
                  >
                    <Trash2 size={15} />
                    <span>حذف</span>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
              dir="rtl"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                    <ClipboardCheck size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">
                      {editingForm ? 'تعديل استمارة تقييم أداء' : 'إنشاء استمارة تقييم أداء جديدة'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      خصص البيانات الأساسية والمحاور والمعايير الفرعية المستهدفة
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSaveForm} className="p-6 space-y-6 overflow-y-auto flex-1">
                {/* Section 1: Basic Information */}
                <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200/80">
                  <h4 className="text-xs font-black text-indigo-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <FileText size={14} />
                    <span>المعلومات الأساسية للاستمارة</span>
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        عنوان الاستمارة الرسمي <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        placeholder="مثلاً: استمارة تقييم الكوادر الهندسية والفنية"
                        className="w-full px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>



                    {/* Responsibilities Multi-Select */}
                    <div className="md:col-span-2 space-y-1.5 bg-white p-3 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800">
                          المسؤوليات المشمولة بهذه الاستمارة <span className="text-indigo-600 font-semibold">(اختيار متعدد)</span>
                        </label>
                        <div className="flex items-center gap-2 text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, applicableResponsibilities: RESPONSIBILITY_OPTIONS })}
                            className="text-indigo-600 hover:underline"
                          >
                            تحديد الكل
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, applicableResponsibilities: [] })}
                            className="text-rose-600 hover:underline"
                          >
                            إلغاء الكل
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {RESPONSIBILITY_OPTIONS.map((resp) => {
                          const isSelected = (formData.applicableResponsibilities || []).includes(resp);
                          return (
                            <button
                              key={resp}
                              type="button"
                              onClick={() => {
                                const current = formData.applicableResponsibilities || [];
                                const next = isSelected ? current.filter(r => r !== resp) : [...current, resp];
                                setFormData({ ...formData, applicableResponsibilities: next });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span>{resp}</span>
                              {isSelected && <CheckCircle2 size={12} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Qualifications Multi-Select */}
                    <div className="md:col-span-2 space-y-1.5 bg-white p-3 rounded-xl border border-slate-200/80">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-800">
                          الشهادات الدراسية المشمولة بهذه الاستمارة <span className="text-indigo-600 font-semibold">(اختيار متعدد)</span>
                        </label>
                        <div className="flex items-center gap-2 text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, applicableQualifications: QUALIFICATION_OPTIONS })}
                            className="text-indigo-600 hover:underline"
                          >
                            تحديد الكل
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, applicableQualifications: [] })}
                            className="text-rose-600 hover:underline"
                          >
                            إلغاء الكل
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {QUALIFICATION_OPTIONS.map((qual) => {
                          const isSelected = (formData.applicableQualifications || []).includes(qual);
                          return (
                            <button
                              key={qual}
                              type="button"
                              onClick={() => {
                                const current = formData.applicableQualifications || [];
                                const next = isSelected ? current.filter(q => q !== qual) : [...current, qual];
                                setFormData({ ...formData, applicableQualifications: next });
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <span>{qual}</span>
                              {isSelected && <CheckCircle2 size={12} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">الدرجة القصوى للاستمارة</label>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={formData.maxScore}
                        onChange={(e) => setFormData({ ...formData, maxScore: parseInt(e.target.value) || 100 })}
                        className="w-full px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">درجة النجاح / الحد الأدنى</label>
                      <input
                        type="number"
                        min="1"
                        max={formData.maxScore}
                        value={formData.passingScore}
                        onChange={(e) => setFormData({ ...formData, passingScore: parseInt(e.target.value) || 50 })}
                        className="w-full px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">وصف الاستمارة والتعليمات الرسمية</label>
                      <textarea
                        rows="2"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="أدخل توجيهات أو تعليمات ملء الاستمارة للجان التقييم..."
                        className="w-full px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Additional Fields Toggles */}
                <div className="space-y-4 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-2 text-indigo-900">
                    <Sliders size={16} className="text-indigo-600" />
                    <h4 className="text-xs font-black uppercase tracking-wider">
                      خيارات وإعدادات إدخال حقول التقييم الإضافية (مخصصة حسب الفئة)
                    </h4>
                  </div>
                  <p className="text-[11px] font-medium text-slate-600">
                    حدد الحقول الإضافية المراد تفعيلها في شاشة تقييم الأداء عند اختيار أو تخصيص هذه الاستمارة للموظف:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Enable Weaknesses Toggle */}
                    <div
                      onClick={() => setFormData({ ...formData, enableWeaknesses: !formData.enableWeaknesses })}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        formData.enableWeaknesses
                          ? 'bg-white border-rose-400 shadow-xs ring-2 ring-rose-500/10'
                          : 'bg-white/60 border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.enableWeaknesses}
                        onChange={(e) => setFormData({ ...formData, enableWeaknesses: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded-md text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-800">
                          تفعيل تسجيل نقاط الضعف
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 leading-tight block mt-0.5">
                          إتاحة حقول إدخال نقاط الضعف الملاحظة على أداء الموظف أثناء التقييم (غير إلزامي الإدخال).
                        </span>
                      </div>
                    </div>

                    {/* Enable Strengths Toggle */}
                    <div
                      onClick={() => setFormData({ ...formData, enableStrengths: !formData.enableStrengths })}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        formData.enableStrengths
                          ? 'bg-white border-emerald-400 shadow-xs ring-2 ring-emerald-500/10'
                          : 'bg-white/60 border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.enableStrengths}
                        onChange={(e) => setFormData({ ...formData, enableStrengths: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-800">
                          تفعيل تسجيل نقاط القوة
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 leading-tight block mt-0.5">
                          إتاحة حقول إدخال نقاط القوة والإنجازات المتميزة للموظف أثناء التقييم (غير إلزامي الإدخال).
                        </span>
                      </div>
                    </div>

                    {/* Enable Training Needs Toggle */}
                    <div
                      onClick={() => setFormData({ ...formData, enableTrainingNeeds: !formData.enableTrainingNeeds })}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        formData.enableTrainingNeeds
                          ? 'bg-white border-blue-400 shadow-xs ring-2 ring-blue-500/10'
                          : 'bg-white/60 border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.enableTrainingNeeds}
                        onChange={(e) => setFormData({ ...formData, enableTrainingNeeds: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded-md text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-800">
                          تفعيل تسجيل الاحتياجات التدريبية
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 leading-tight block mt-0.5">
                          إتاحة حقول إدخال الدورات التدريبية والبرامج التطويرية المقترحة للموظف (غير إلزامي الإدخال).
                        </span>
                      </div>
                    </div>

                    {/* Enable Employee Opinion Toggle */}
                    <div
                      onClick={() => setFormData({ ...formData, enableEmployeeOpinion: !formData.enableEmployeeOpinion })}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                        formData.enableEmployeeOpinion
                          ? 'bg-white border-purple-400 shadow-xs ring-2 ring-purple-500/10'
                          : 'bg-white/60 border-slate-200 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.enableEmployeeOpinion}
                        onChange={(e) => setFormData({ ...formData, enableEmployeeOpinion: e.target.checked })}
                        className="mt-1 h-4 w-4 rounded-md text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <div>
                        <span className="block text-xs font-black text-slate-800">
                          تفعيل رأي الموظف
                        </span>
                        <span className="text-[11px] font-medium text-slate-500 leading-tight block mt-0.5">
                          إتاحة حقل لإدخال رأي وتدوين الموظف بالتقييم الحاصل عليه (في حال لم يتم الإدخال تُحفظ تلقائياً عبارة: &quot;لم يضع الموظف رأيه بهذا التقييم&quot;).
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Sections & Criteria Builder */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <Sliders size={16} className="text-indigo-600" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        محاور ومعايير التقييم التفصيلية
                      </h4>
                    </div>

                    {/* Total Sum Indicator */}
                    <div className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                      currentTotalCriteriaScore === formData.maxScore
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      <span>إجمالي درجات المعايير:</span>
                      <span>{currentTotalCriteriaScore} / {formData.maxScore}</span>
                      {currentTotalCriteriaScore === formData.maxScore ? (
                        <CheckCircle2 size={14} className="text-emerald-600" />
                      ) : (
                        <AlertCircle size={14} className="text-amber-600" />
                      )}
                    </div>
                  </div>

                  {/* Sections List */}
                  <div className="space-y-4">
                    {formData.sections.map((sec, sIdx) => {
                      const secCriteriaSum = (sec.criteria || []).reduce((sum, c) => sum + (Number(c.maxScore) || 0), 0);

                      return (
                        <div
                          key={sec.id}
                          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm relative"
                        >
                          {/* Section Header */}
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                              {sIdx + 1}
                            </span>

                            <input
                              type="text"
                              value={sec.title}
                              onChange={(e) => handleUpdateSectionTitle(sec.id, e.target.value)}
                              placeholder="عنوان المحور الرئيسي..."
                              className="flex-1 px-3 py-1.5 text-xs font-black rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />

                            <div className="text-xs font-bold text-slate-500 px-2">
                              مجموع المحور: <span className="text-indigo-600 font-black">{secCriteriaSum}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveSection(sec.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="حذف هذا المحور"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          {/* Criteria Sub-Items */}
                          <div className="pr-8 space-y-2 border-r-2 border-indigo-100 mr-3">
                            <span className="block text-[11px] font-bold text-slate-400">المعايير الفرعية لهذا المحور:</span>

                            {(sec.criteria || []).map((crit) => (
                              <div key={crit.id} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <input
                                  type="text"
                                  value={crit.name}
                                  onChange={(e) => handleUpdateCriteria(sec.id, crit.id, 'name', e.target.value)}
                                  placeholder="اسم المعيار الفرعي..."
                                  className="flex-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                />

                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-[11px] font-bold text-slate-500">الدرجة:</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={crit.maxScore}
                                    onChange={(e) => handleUpdateCriteria(sec.id, crit.id, 'maxScore', e.target.value)}
                                    className="w-16 px-2 py-1 text-xs font-bold rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-center"
                                  />
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleRemoveCriteria(sec.id, crit.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                                  title="حذف المعيار"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}

                            <button
                              type="button"
                              onClick={() => handleAddCriteria(sec.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors pt-1"
                            >
                              <Plus size={13} />
                              <span>إضافة معيار فرعي إلى هذا المحور</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={handleAddSection}
                      className="w-full py-2.5 border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-xl text-indigo-600 hover:bg-indigo-50/50 text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Plus size={15} />
                      <span>إضافة محور رئيسي جديد للاستمارة</span>
                    </button>
                  </div>
                </div>

                {/* Footer buttons inside form */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    إلغاء
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                  >
                    <ClipboardCheck size={16} />
                    <span>حفظ الاستمارة</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Live Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && previewingForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden my-auto border border-slate-200"
              dir="rtl"
            >
              {/* Preview Header */}
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="text-amber-400" size={20} />
                  <div>
                    <h3 className="text-base font-black">معاينة استمارة تقييم الأداء الرسمية</h3>
                    <p className="text-xs text-slate-300">{previewingForm.category}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Printer size={14} />
                    <span>طباعة</span>
                  </button>
                  <button
                    onClick={() => setIsPreviewOpen(false)}
                    className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Preview Content Document Style */}
              <div className="p-8 space-y-6 overflow-y-auto flex-1 bg-slate-50/30">
                {/* Official Title Block */}
                <div className="text-center space-y-2 border-b-2 border-slate-900 pb-4">
                  <h2 className="text-lg font-black text-slate-900">{previewingForm.title}</h2>
                  <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-600">
                    <span>الفئة المستهدفة: {previewingForm.category}</span>
                    <span>•</span>
                    <span>الدرجات المشمولة: {previewingForm.targetGrades || 'جميع الدرجات'}</span>
                  </div>
                </div>

                {previewingForm.description && (
                  <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
                    <span className="font-bold block mb-0.5">تعليمات وإرشادات:</span>
                    {previewingForm.description}
                  </div>
                )}

                {/* Sections & Criteria Render */}
                <div className="space-y-6">
                  {(() => {
                    let secs = [];
                    try {
                      secs = typeof previewingForm.sections === 'string' ? JSON.parse(previewingForm.sections) : (previewingForm.sections || []);
                    } catch (e) {
                      secs = [];
                    }

                    return secs.map((sec, idx) => (
                      <div key={sec.id || idx} className="bg-white rounded-xl border border-slate-300 overflow-hidden shadow-sm">
                        <div className="bg-slate-100 p-3 border-b border-slate-300 flex items-center justify-between">
                          <h4 className="text-xs font-black text-slate-900">
                            {idx + 1}. {sec.title}
                          </h4>
                          <span className="text-[11px] font-bold text-slate-600">المحور ({sec.weight || ''}%)</span>
                        </div>

                        <div className="divide-y divide-slate-200">
                          {(sec.criteria || []).map((crit, cIdx) => (
                            <div key={crit.id || cIdx} className="p-3 flex items-center justify-between gap-4 text-xs">
                              <span className="font-bold text-slate-800">{crit.name}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-bold text-slate-400">الدرجة القصوى:</span>
                                <span className="px-2.5 py-1 bg-slate-100 rounded text-xs font-black text-slate-900 border border-slate-200">
                                  {crit.maxScore}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Score Total Summary */}
                <div className="p-4 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs font-bold">
                  <span>إجمالي الدرجة الكلية للاستمارة:</span>
                  <span className="text-base font-black text-amber-400">{previewingForm.maxScore || 100} درجة</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Strict Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && deletingForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
              dir="rtl"
            >
              {/* Modal Danger Header */}
              <div className="p-5 bg-rose-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <ShieldAlert size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black">تأكيد حذف استمارة التقييم</h3>
                    <p className="text-[11px] text-rose-100">ضوابط حماية البيانات ومنع الحذف الخاطئ</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingForm(null);
                  }}
                  className="p-1.5 text-rose-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                {/* Form Target Info Box */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 block">الاستمارة المستهدفة بالحذف:</span>
                  <h4 className="text-xs font-black text-slate-900">{deletingForm.title}</h4>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600 pt-1">
                    <span>الفئة: {deletingForm.category}</span>
                    <span>•</span>
                    <span className={deletingForm.status === 'فعال' ? 'text-emerald-700 font-black' : 'text-slate-500'}>
                      الحالة: {deletingForm.status || 'فعال'}
                    </span>
                  </div>
                </div>

                {/* Status-dependent Warning Callout */}
                {deletingForm.status === 'فعال' ? (
                  <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-rose-800 text-xs font-black">
                      <AlertTriangle size={16} className="shrink-0" />
                      <span>تنبيه أمني: الاستمارة حالياً (فعالة بالخدمة)</span>
                    </div>
                    <p className="text-[11px] text-rose-700 leading-relaxed font-medium">
                      هذه الاستمارة نشطة ومتاحة للجان التقييم. لحمايتها من الحذف المفاجئ، يُرجى كتابة كلمة <strong className="font-black text-rose-900 underline">حذف</strong> في الحقل التالي لتأكيد العملية:
                    </p>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="اكتب كلمة (حذف) هنا للتأكيد..."
                      className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start gap-2.5">
                    <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-900 leading-relaxed font-medium">
                      هل أنت أواثق من حذف هذه الاستمارة نهائياً من النظام؟ لن تتمكن من استرجاع محاورها ومعاييرها المحددة لاحقاً.
                    </p>
                  </div>
                )}

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeleteModalOpen(false);
                      setDeletingForm(null);
                    }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    إلغاء
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting || (deletingForm.status === 'فعال' && deleteConfirmText.trim() !== 'حذف')}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5"
                  >
                    {isDeleting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>جاري الحذف...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={15} />
                        <span>تأكيد الحذف النهائي</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
