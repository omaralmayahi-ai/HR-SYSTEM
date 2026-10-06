import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, Plus, Search, Filter, Edit3, Trash2, CheckCircle2, XCircle, 
  RefreshCw, Power, AlertCircle, Award, Sparkles, Layers, FileText, 
  PlusCircle, Check, Users, ShieldAlert, FolderKanban, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/api/apiClient';

const INITIAL_DEFAULT_CATEGORIES = [
  'عام',
  'هندسي',
  'حاسبات وتقنية',
  'إداري',
  'مالي',
  'قانوني',
  'فني',
  'طبي وصحي',
  'مهني وحرفي',
  'خدمات',
  'أمن وحماية',
  'أخرى'
];

const CATEGORY_COLORS = {
  'هندسي': 'bg-blue-50 text-blue-700 border-blue-200',
  'حاسبات وتقنية': 'bg-purple-50 text-purple-700 border-purple-200',
  'إداري': 'bg-slate-50 text-slate-700 border-slate-200',
  'مالي': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'قانوني': 'bg-amber-50 text-amber-800 border-amber-200',
  'فني': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'طبي وصحي': 'bg-rose-50 text-rose-700 border-rose-200',
  'مهني وحرفي': 'bg-orange-50 text-orange-700 border-orange-200',
  'خدمات': 'bg-teal-50 text-teal-700 border-teal-200',
  'أمن وحماية': 'bg-zinc-100 text-zinc-800 border-zinc-300',
  'أخرى': 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  'عام': 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function JobTitlesSettings() {
  const { toast } = useToast();
  const [titles, setTitles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive

  // Deleted Categories tracker (persisted locally so deleted categories don't reappear)
  const [deletedCategories, setDeletedCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('DELETED_JOB_CATEGORIES');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Custom Categories tracker
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('CUSTOM_JOB_CATEGORIES');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [titleToDelete, setTitleToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Category Manager Modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Referential Integrity Block Modal
  const [blockedModal, setBlockedModal] = useState({
    open: false,
    titleName: '',
    actionType: 'delete', // 'delete' | 'deactivate'
    affectedEmployees: []
  });

  // Form state
  const [form, setForm] = useState({
    name: '',
    category: 'عام',
    min_grade: 7,
    status: 'فعال',
    notes: ''
  });
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [titlesData, empsData] = await Promise.all([
        apiClient.entities.JobTitle.list().catch(() => []),
        apiClient.entities.Employee.list().catch(() => [])
      ]);
      setTitles(titlesData || []);
      setEmployees(empsData || []);
    } catch (err) {
      console.error('Error loading job titles/employees data:', err);
      toast({
        title: 'خطأ في جلب البيانات',
        description: err.message || 'تعذر تحميل قائمة العناوين الوظيفية والموظفين',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Dynamically extract all available categories
  const allCategories = useMemo(() => {
    const set = new Set([...INITIAL_DEFAULT_CATEGORIES, ...customCategories]);
    // Add any category from existing titles
    titles.forEach(t => {
      if (t.category && t.category.trim()) {
        set.add(t.category.trim());
      }
    });
    // Filter out user-deleted categories (unless actively held by existing titles)
    const activeUsedCategories = new Set(titles.map(t => (t.category || '').trim()).filter(Boolean));
    return Array.from(set).filter(cat => !deletedCategories.includes(cat) || activeUsedCategories.has(cat));
  }, [titles, customCategories, deletedCategories]);

  // Find active employees assigned to a specific job title
  const getEmployeesForTitle = (titleItem) => {
    if (!titleItem) return [];
    const targetName = (titleItem.name || '').trim().toLowerCase();
    const targetId = String(titleItem.id);

    return employees.filter(e => {
      const s = e.status || e.employeeStatus || '';
      const isActive = s !== 'مستقيل' && s !== 'مفصول' && s !== 'منقول خارجياً';
      if (!isActive) return false;
      const empTitle = (e.job_title || e.jobTitle || '').trim().toLowerCase();
      const empTitleId = String(e.job_title_id || e.jobTitleId || '');
      return (empTitle && empTitle === targetName) || (empTitleId && empTitleId === targetId);
    });
  };

  const filteredTitles = useMemo(() => {
    return titles.filter(t => {
      const nameMatch = !searchQuery.trim() || 
        (t.name && t.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) ||
        (t.notes && t.notes.toLowerCase().includes(searchQuery.trim().toLowerCase()));
      
      const categoryMatch = selectedCategory === 'الكل' || t.category === selectedCategory;
      
      const statusMatch = 
        statusFilter === 'all' || 
        (statusFilter === 'active' && (t.status === 'فعال' || !t.status)) ||
        (statusFilter === 'inactive' && t.status === 'معطل');

      return nameMatch && categoryMatch && statusMatch;
    });
  }, [titles, searchQuery, selectedCategory, statusFilter]);

  const stats = useMemo(() => {
    const total = titles.length;
    const active = titles.filter(t => t.status === 'فعال' || !t.status).length;
    const inactive = total - active;
    const categoriesCount = allCategories.length;
    return { total, active, inactive, categoriesCount };
  }, [titles, allCategories]);

  const handleOpenAddModal = () => {
    setEditingTitle(null);
    setIsCustomCategory(false);
    setCustomCategoryName('');
    setForm({
      name: '',
      category: 'عام',
      min_grade: 7,
      status: 'فعال',
      notes: ''
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (titleItem) => {
    setEditingTitle(titleItem);
    const cat = titleItem.category || 'عام';
    const isCustom = !INITIAL_DEFAULT_CATEGORIES.includes(cat);
    setIsCustomCategory(isCustom);
    setCustomCategoryName(isCustom ? cat : '');
    setForm({
      name: titleItem.name || '',
      category: cat,
      min_grade: titleItem.min_grade || titleItem.minGrade || 7,
      status: titleItem.status || 'فعال',
      notes: titleItem.notes || ''
    });
    setModalOpen(true);
  };

  // Toggle status with strict referential validation
  const handleToggleStatus = async (titleItem) => {
    const targetStatus = titleItem.status === 'معطل' ? 'فعال' : 'معطل';

    // If attempting to deactivate, verify no active employees occupy this title
    if (targetStatus === 'معطل') {
      const activeOccupants = getEmployeesForTitle(titleItem);
      if (activeOccupants.length > 0) {
        setBlockedModal({
          open: true,
          titleName: titleItem.name,
          actionType: 'deactivate',
          affectedEmployees: activeOccupants
        });
        return;
      }
    }

    try {
      // Optimistic update
      setTitles(prev => prev.map(t => t.id === titleItem.id ? { ...t, status: targetStatus } : t));
      
      await apiClient.entities.JobTitle.update(titleItem.id, {
        ...titleItem,
        status: targetStatus
      });

      toast({
        title: targetStatus === 'فعال' ? 'تم تفعيل العنوان الوظيفي' : 'تم تعطيل العنوان الوظيفي',
        description: `العنوان "${titleItem.name}" أصبح الآن (${targetStatus}).`,
        variant: targetStatus === 'فعال' ? 'success' : 'default'
      });
    } catch (err) {
      console.error('Error toggling status:', err);
      fetchData();

      // If backend referential check blocked it, show blocked modal
      const occupants = err?.affectedEmployees || getEmployeesForTitle(titleItem);
      if (occupants.length > 0 || err?.status === 400) {
        setBlockedModal({
          open: true,
          titleName: titleItem.name,
          actionType: 'deactivate',
          affectedEmployees: occupants.length > 0 ? occupants : getEmployeesForTitle(titleItem)
        });
      } else {
        toast({
          title: 'فشل تغيير الحالة',
          description: err.message || 'حدث خطأ أثناء تعديل حالة العنوان',
          variant: 'destructive'
        });
      }
    }
  };

  // Save Title
  const handleSaveTitle = async (e) => {
    e.preventDefault();
    if (!form.name || !form.name.trim()) {
      toast({
        title: 'حقل مطلوب',
        description: 'يرجى إدخال اسم العنوان الوظيفي',
        variant: 'destructive'
      });
      return;
    }

    const trimmedName = form.name.trim();
    const normalizeArabic = (text) => {
      if (!text) return '';
      return text
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/[ةه]/g, 'ه')
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };

    const normInput = normalizeArabic(trimmedName);
    const isDuplicate = titles.some(t => 
      (!editingTitle || String(t.id) !== String(editingTitle.id)) && 
      t.name && normalizeArabic(t.name) === normInput
    );

    if (isDuplicate) {
      toast({
        title: 'العنوان الوظيفي موجود مسبقاً',
        description: `اسم العنوان الوظيفي "${trimmedName}" مسجل بالفعل في النظام، يجب أن يكون كل عنوان وظيفي مميزاً وفريداً.`,
        variant: 'destructive'
      });
      return;
    }

    const resolvedCategory = (isCustomCategory ? customCategoryName.trim() : form.category) || 'عام';

    // If new custom category, add to custom categories list
    if (isCustomCategory && resolvedCategory && !allCategories.includes(resolvedCategory)) {
      const updatedCustom = [...customCategories, resolvedCategory];
      setCustomCategories(updatedCustom);
      try {
        localStorage.setItem('CUSTOM_JOB_CATEGORIES', JSON.stringify(updatedCustom));
      } catch (e) {}
    }

    const payload = {
      ...form,
      category: resolvedCategory,
      name: trimmedName
    };

    try {
      setSaving(true);
      if (editingTitle) {
        const updated = await apiClient.entities.JobTitle.update(editingTitle.id, payload);
        setTitles(prev => prev.map(t => t.id === editingTitle.id ? { ...t, ...updated, ...payload } : t));
        toast({
          title: 'تم تعديل العنوان الوظيفي بنجاح',
          description: `تم حفظ بيانات "${payload.name}" بنجاح.`,
          variant: 'success'
        });
      } else {
        const created = await apiClient.entities.JobTitle.create(payload);
        setTitles(prev => [created, ...prev]);
        toast({
          title: 'تمت إضافة العنوان الوظيفي',
          description: `تم تسجيل "${payload.name}" كعنوان وظيفي جديد في النظام.`,
          variant: 'success'
        });
      }
      setModalOpen(false);
    } catch (err) {
      console.error('Error saving job title:', err);
      toast({
        title: 'خطأ أثناء الحفظ',
        description: err.message || 'تعذر حفظ العنوان الوظيفي',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Trigger Delete flow with referential integrity pre-check
  const handleInitiateDelete = (titleItem) => {
    const activeOccupants = getEmployeesForTitle(titleItem);
    if (activeOccupants.length > 0) {
      setBlockedModal({
        open: true,
        titleName: titleItem.name,
        actionType: 'delete',
        affectedEmployees: activeOccupants
      });
      return;
    }

    setTitleToDelete(titleItem);
    setDeleteDialogOpen(true);
  };

  // Confirm Delete
  const handleDeleteConfirm = async () => {
    if (!titleToDelete) return;
    try {
      await apiClient.entities.JobTitle.delete(titleToDelete.id);
      setTitles(prev => prev.filter(t => t.id !== titleToDelete.id));
      toast({
        title: 'تم حذف العنوان الوظيفي',
        description: `تم حذف "${titleToDelete.name}" من النظام.`,
        variant: 'success'
      });
      setDeleteDialogOpen(false);
      setTitleToDelete(null);
    } catch (err) {
      console.error('Error deleting job title:', err);
      fetchData();
      setDeleteDialogOpen(false);

      const occupants = err?.affectedEmployees || getEmployeesForTitle(titleToDelete);
      if (occupants.length > 0 || err?.status === 400) {
        setBlockedModal({
          open: true,
          titleName: titleToDelete.name,
          actionType: 'delete',
          affectedEmployees: occupants.length > 0 ? occupants : getEmployeesForTitle(titleToDelete)
        });
      } else {
        toast({
          title: 'فشل الحذف',
          description: err.message || 'تعذر حذف العنوان الوظيفي',
          variant: 'destructive'
        });
      }
    }
  };

  // Category Management Handlers
  const handleAddCategory = (e) => {
    e?.preventDefault?.();
    const cat = newCategoryInput.trim();
    if (!cat) return;
    if (allCategories.includes(cat)) {
      toast({
        title: 'المجال موجود مسبقاً',
        description: `المجال / التخصص "${cat}" موجود بالفعل ضمن القائمة.`,
        variant: 'warning'
      });
      return;
    }

    // Remove from deleted list if it was deleted before
    const nextDeleted = deletedCategories.filter(c => c !== cat);
    setDeletedCategories(nextDeleted);
    localStorage.setItem('DELETED_JOB_CATEGORIES', JSON.stringify(nextDeleted));

    // Add to custom list
    const nextCustom = [...customCategories, cat];
    setCustomCategories(nextCustom);
    localStorage.setItem('CUSTOM_JOB_CATEGORIES', JSON.stringify(nextCustom));

    setNewCategoryInput('');
    toast({
      title: 'تمت إضافة المجال / التخصص',
      description: `تمت إضافة "${cat}" بنجاح.`,
      variant: 'success'
    });
  };

  const handleDeleteCategory = (categoryName) => {
    const titlesCount = titles.filter(t => t.category === categoryName).length;
    if (titlesCount > 0) {
      toast({
        title: 'لا يمكن حذف المجال / التخصص',
        description: `يحتوي المجال "${categoryName}" على (${titlesCount}) عناوين وظيفية. يجب إعادة تصنيف هذه العناوين أو حذفها أولاً.`,
        variant: 'destructive'
      });
      return;
    }

    // Persist category deletion
    const nextDeleted = [...deletedCategories, categoryName];
    setDeletedCategories(nextDeleted);
    localStorage.setItem('DELETED_JOB_CATEGORIES', JSON.stringify(nextDeleted));

    const nextCustom = customCategories.filter(c => c !== categoryName);
    setCustomCategories(nextCustom);
    localStorage.setItem('CUSTOM_JOB_CATEGORIES', JSON.stringify(nextCustom));

    if (selectedCategory === categoryName) {
      setSelectedCategory('الكل');
    }

    toast({
      title: 'تم حذف المجال / التخصص',
      description: `تم حذف التصنيف "${categoryName}" بنجاح.`,
      variant: 'success'
    });
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header and Statistics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B]">
              <Briefcase size={22} />
            </div>
            <h2 className="text-xl font-bold text-[#1B3A6B]">دليل العناوين الوظيفية والمهنية</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            إدارة كافة التوصيفات والعناوين الوظيفية والمجالات المهنية، وتحديد درجات ومراحل الأساس، مع حماية نزاهة القيود لمنع حذف أو تعطيل أي عنوان مستخدم.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Button
            onClick={fetchData}
            variant="outline"
            size="sm"
            className="rounded-xl h-10 px-3 border-slate-200 text-slate-600 hover:bg-slate-50"
            title="تحديث البيانات"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </Button>

          <Button
            onClick={() => setCategoryModalOpen(true)}
            variant="outline"
            className="rounded-xl h-10 border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-2 text-xs"
          >
            <FolderKanban size={16} className="text-[#1B3A6B]" />
            إدارة المجالات والتخصصات
          </Button>

          <Button
            onClick={handleOpenAddModal}
            className="rounded-xl h-10 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white font-bold gap-2 text-xs shadow-sm"
          >
            <Plus size={16} />
            إضافة عنوان وظيفي جديد
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">إجمالي العناوين</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700"><Briefcase size={15} /></span>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{stats.total}</p>
          <span className="text-[10px] text-slate-400">عنوان مسجل في قاعدة البيانات</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600">العناوين الفعالة</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700"><CheckCircle2 size={15} /></span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{stats.active}</p>
          <span className="text-[10px] text-emerald-600/80 font-medium">متاحة للاختيار في القيود</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600">العناوين المعطلة</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-700"><XCircle size={15} /></span>
          </div>
          <p className="text-2xl font-black text-rose-700 mt-2">{stats.inactive}</p>
          <span className="text-[10px] text-rose-500 font-medium">محجوبة من قوائم الاختيار</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-600">المجالات والتخصصات</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700"><Layers size={15} /></span>
          </div>
          <p className="text-2xl font-black text-purple-800 mt-2">{stats.categoriesCount}</p>
          <span className="text-[10px] text-purple-600/80">فئات وتخصصات مهنية</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن العنوان الوظيفي أو التخصص أو الملاحظات..."
              className="pr-9 rounded-xl text-xs h-10 border-slate-200"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                مسح
              </button>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] rounded-xl h-10 text-xs border-slate-200">
                <SelectValue placeholder="حالة التفعيل" />
              </SelectTrigger>
              <SelectContent className="z-[9999]">
                <SelectItem value="all">كل الحالات ({stats.total})</SelectItem>
                <SelectItem value="active">الفعالة فقط ({stats.active})</SelectItem>
                <SelectItem value="inactive">المعطلة فقط ({stats.inactive})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category Pills Strip */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 ml-1">المجال / التخصص:</span>
          {['الكل', ...allCategories].map(cat => {
            const isSelected = selectedCategory === cat;
            const count = cat === 'الكل' 
              ? titles.length 
              : titles.filter(t => t.category === cat).length;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[#1B3A6B] text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                }`}
              >
                <span>{cat}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Job Titles Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200/80">
                <th className="px-4 py-3.5 w-12 text-center">#</th>
                <th className="px-4 py-3.5">العنوان الوظيفي</th>
                <th className="px-4 py-3.5">المجال / التخصص</th>
                <th className="px-4 py-3.5">الدرجة الوظيفية</th>
                <th className="px-4 py-3.5 text-center">الموظفون الشاغلون</th>
                <th className="px-4 py-3.5 text-center">الحالة</th>
                <th className="px-4 py-3.5">الملاحظات والشروط</th>
                <th className="px-4 py-3.5 w-24 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#1B3A6B]" />
                    <p className="font-semibold text-xs">جاري تحميل دليل العناوين الوظيفية...</p>
                  </td>
                </tr>
              ) : filteredTitles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <Briefcase size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-sm text-slate-600">لا توجد عناوين وظيفية مطابقة</p>
                    <p className="text-xs text-slate-400 mt-1">جرّب تغيير كلمات البحث أو التصنيف المحدد، أو أضف عنواناً جديداً.</p>
                  </td>
                </tr>
              ) : (
                filteredTitles.map((item, index) => {
                  const isActive = item.status === 'فعال' || !item.status;
                  const catClass = CATEGORY_COLORS[item.category] || 'bg-indigo-50 text-indigo-700 border-indigo-200';
                  const titleOccupants = getEmployeesForTitle(item);
                  const occupantsCount = titleOccupants.length;

                  return (
                    <tr 
                      key={item.id ?? `job-title-${index}-${item.name || index}`}
                      className={`hover:bg-slate-50/70 transition-colors ${!isActive ? 'bg-slate-50/40 opacity-75' : ''}`}
                    >
                      <td className="px-4 py-3.5 text-center font-bold text-slate-400">
                        {index + 1}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className="font-bold text-slate-800 text-xs sm:text-sm">
                            {item.name}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-[11px] font-bold border ${catClass}`}>
                          {item.category || 'عام'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-800 border border-slate-200/80">
                          الدرجة {item.min_grade || item.minGrade || 7}
                        </span>
                      </td>

                      {/* Number of Occupant Employees with quick preview */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {occupantsCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setBlockedModal({
                                open: true,
                                titleName: item.name,
                                actionType: 'info',
                                affectedEmployees: titleOccupants
                              });
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold transition-colors cursor-pointer"
                            title="عرض قائمة الموظفين الشاغلين لهذا العنوان"
                          >
                            <Users size={13} className="text-blue-600" />
                            <span>{occupantsCount} موظف</span>
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">غير مشغول</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold transition-all shadow-2xs ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                          title="اضغط لتغيير حالة التفعيل"
                        >
                          <Power size={12} className={isActive ? 'text-emerald-600' : 'text-rose-600'} />
                          <span>{isActive ? 'فعال ومتاح' : 'معطل ومحجوب'}</span>
                        </button>
                      </td>

                      <td className="px-4 py-3.5 text-slate-500 max-w-[220px] truncate text-[11px]">
                        {item.notes || <span className="text-slate-300">-</span>}
                      </td>

                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleOpenEditModal(item)}
                            className="h-8 w-8 rounded-lg text-blue-600 hover:bg-blue-50"
                            title="تعديل العنوان الوظيفي"
                          >
                            <Edit3 size={14} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleInitiateDelete(item)}
                            className="h-8 w-8 rounded-lg text-rose-600 hover:bg-rose-50"
                            title="حذف العنوان"
                          >
                            <Trash2 size={14} />
                          </Button>
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

      {/* Add / Edit Job Title Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2">
              <Briefcase size={20} />
              {editingTitle ? 'تعديل العنوان الوظيفي' : 'إضافة عنوان وظيفي جديد'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveTitle} className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">اسم العنوان الوظيفي *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: مهندس أقدم، معاون رئيس مبرمجين، مدقق حسابات..."
                className="mt-1 rounded-xl text-xs"
                required
                autoFocus
              />
            </div>

            {/* Field / Specialization Selection with option to add new */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-700">المجال / الفئة والتخصص</Label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(!isCustomCategory);
                    if (!isCustomCategory) {
                      setCustomCategoryName('');
                    } else {
                      setForm(prev => ({ ...prev, category: 'عام' }));
                    }
                  }}
                  className="text-[11px] text-[#1B3A6B] hover:text-[#1B3A6B]/80 font-bold flex items-center gap-1 transition-colors"
                >
                  {isCustomCategory ? '← الاختيار من القائمة' : '➕ إضافة مجال/تخصص جديد'}
                </button>
              </div>

              {isCustomCategory ? (
                <div className="relative">
                  <Input
                    value={customCategoryName}
                    onChange={(e) => {
                      setCustomCategoryName(e.target.value);
                      setForm(prev => ({ ...prev, category: e.target.value }));
                    }}
                    placeholder="اكتب اسم المجال أو التخصص الجديد (مثلاً: بيئة وسلامة، حفر وآبار)..."
                    className="rounded-xl text-xs border-[#1B3A6B]/40 focus:border-[#1B3A6B] bg-blue-50/20"
                    autoFocus
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    سيتم حفظ هذا التخصص وإضافته تلقائياً لقائمة الفئات المتاحة.
                  </span>
                </div>
              ) : (
                <Select
                  value={form.category || 'عام'}
                  onValueChange={(v) => {
                    if (v === '__add_new__') {
                      setIsCustomCategory(true);
                      setCustomCategoryName('');
                      setForm(prev => ({ ...prev, category: '' }));
                    } else {
                      setForm(prev => ({ ...prev, category: v }));
                    }
                  }}
                >
                  <SelectTrigger className="rounded-xl text-xs">
                    <SelectValue placeholder="اختر الفئة أو التخصص" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999] max-h-56">
                    {allCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__add_new__" className="text-[#1B3A6B] font-bold border-t border-slate-100 mt-1">
                      ➕ إضافة مجال / فئة جديدة...
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">الدرجة الوظيفية المحددة للعنوان (من 1 إلى 10) *</Label>
              <Select
                value={String(form.min_grade || 7)}
                onValueChange={(v) => setForm(prev => ({ ...prev, min_grade: parseInt(v) }))}
              >
                <SelectTrigger className="mt-1 rounded-xl text-xs font-bold">
                  <SelectValue placeholder="اختر الدرجة الوظيفية" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  {[1,2,3,4,5,6,7,8,9,10].map(g => (
                    <SelectItem key={g} value={String(g)} className="font-bold">
                      الدرجة {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400 mt-1">
                يرتبط كل عنوان وظيفي بالدرجة الوظيفية حصراً، لكي يتغير العنوان تلقائياً عند ترفيع الموظف إلى هذه الدرجة.
              </p>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">حالة التفعيل</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}
              >
                <SelectTrigger className="mt-1 rounded-xl text-xs">
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent className="z-[9999]">
                  <SelectItem value="فعال">فعال ومتاح للاختيار في القيود</SelectItem>
                  <SelectItem value="معطل">معطل ومحجوب من القوائم</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">ملاحظات وشروط التسكين</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="شروط خاصة بالعنوان الوظيفي أو التسكين والترفيع..."
                className="mt-1 rounded-xl text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl text-xs h-9"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl text-xs h-9 font-bold px-5"
              >
                {saving ? 'جاري الحفظ...' : editingTitle ? 'حفظ التعديلات' : 'إضافة العنوان'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog (إدارة المجالات والتخصصات وحذفها) */}
      <Dialog open={categoryModalOpen} onOpenChange={setCategoryModalOpen}>
        <DialogContent className="max-w-lg rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1B3A6B] flex items-center gap-2">
              <FolderKanban size={20} />
              إدارة وحذف المجالات والتخصصات الوظيفية
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <p className="text-xs text-slate-500 leading-relaxed">
              يمكنك إضافة مجالات وتخصصات جديدة أو حذف المجالات الشاغرة. في حال كان المجال يحتوي على عناوين وظيفية مسجلة، يمنع حذفه حتى يتم نقل أو حذف عناوينه أولاً.
            </p>

            {/* Quick Add Form */}
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <Input
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                placeholder="اكتب اسم المجال أو التخصص الجديد..."
                className="rounded-xl text-xs"
              />
              <Button
                type="submit"
                disabled={!newCategoryInput.trim()}
                className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl text-xs font-bold px-4 shrink-0"
              >
                <Plus size={15} />
                إضافة
              </Button>
            </form>

            {/* Categories List */}
            <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {allCategories.map(cat => {
                const titlesCount = titles.filter(t => t.category === cat).length;
                const canDelete = titlesCount === 0;

                return (
                  <div key={cat} className="flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${titlesCount > 0 ? 'bg-[#1B3A6B]' : 'bg-slate-300'}`} />
                      <span className="font-bold text-xs text-slate-800">{cat}</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                        titlesCount > 0 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {titlesCount > 0 ? `${titlesCount} عنوان وظيفي` : 'فارغ (لا عناوين)'}
                      </span>

                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteCategory(cat)}
                        className={`h-7 w-7 rounded-lg ${
                          canDelete ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 hover:text-rose-500 hover:bg-slate-100'
                        }`}
                        title={canDelete ? 'حذف هذا المجال' : 'يمنع الحذف: يحتوي على عناوين وظيفية'}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryModalOpen(false)}
              className="rounded-xl text-xs h-9 px-5"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog (Only opens when title is NOT used by any employee) */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle size={20} />
              تأكيد حذف العنوان الوظيفي
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600 leading-relaxed mt-2">
            هل أنت متأكد من رغبتك بحذف العنوان الوظيفي <strong className="text-slate-900">"{titleToDelete?.name}"</strong>؟
            العنوان غير مشغول حالياً من قبل أي موظف نشط وسيتم حذفه نهائياً.
          </p>
          <DialogFooter className="gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-xl text-xs h-9"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleDeleteConfirm}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-9 font-bold px-4"
            >
              تأكيد الحذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Strict Referential Block Modal (يمنع الحذف أو التعطيل إذا كان هناك موظفون شاغلون للعنوان) */}
      <Dialog 
        open={blockedModal.open} 
        onOpenChange={(open) => setBlockedModal(prev => ({ ...prev, open }))}
      >
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <div className="flex items-center gap-2.5 text-amber-600">
              <div className="p-2 rounded-xl bg-amber-50">
                <ShieldAlert size={22} className="text-amber-600" />
              </div>
              <DialogTitle className="text-base font-black text-slate-800">
                {blockedModal.actionType === 'delete' 
                  ? 'يُمنع حذف هذا العنوان الوظيفي'
                  : blockedModal.actionType === 'deactivate'
                  ? 'يُمنع إيقاف تفعيل هذا العنوان الوظيفي'
                  : 'الموظفون الشاغلون لهذا العنوان'}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 mt-2">
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/80 text-xs text-amber-900 leading-relaxed space-y-1.5">
              <p className="font-bold">
                العنوان الوظيفي <span className="text-[#1B3A6B] underline font-black">"{blockedModal.titleName}"</span> مسند حالياً إلى ({blockedModal.affectedEmployees?.length}) موظف/ين نشطين في النظام.
              </p>
              {blockedModal.actionType !== 'info' && (
                <p className="text-[11px] text-amber-800/90 font-medium">
                  وفقاً لقواعد النزاهة الإدارية وقوانين الخدمة، لا يمكن {blockedModal.actionType === 'delete' ? 'حذف' : 'تعطيل'} هذا العنوان حتى يتم نقل الموظفين الشاغلين له إلى عنوان وظيفي آخر متوفر.
                </p>
              )}
            </div>

            {/* List of Affected Employees */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Users size={14} className="text-slate-500" />
                  قائمة الموظفين الشاغلين للعنوان:
                </span>
                <span className="text-[10px] text-slate-400 font-bold">
                  {blockedModal.affectedEmployees?.length} موظف
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-52 overflow-y-auto bg-slate-50/50">
                {blockedModal.affectedEmployees?.map((emp, idx) => (
                  <div key={emp.id ?? idx} className="p-2.5 flex items-center justify-between text-xs hover:bg-white transition-colors">
                    <div>
                      <p className="font-bold text-slate-800">
                        {emp.fullName || emp.full_name || emp.name || `موظف #${emp.id}`}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        رقم الشركة: <span className="font-mono font-bold text-slate-700">{emp.companyNumber || emp.company_number || emp.companyCode || emp.company_code || emp.company_no || emp.civilServiceNumber || emp.civil_service_number || '—'}</span> | جهة العمل: <span className="font-bold text-slate-700">{emp.workLocation || emp.work_location || emp.department || '—'}</span>
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                      د{emp.grade || '—'} / م{emp.step || '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              onClick={() => setBlockedModal(prev => ({ ...prev, open: false }))}
              className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl text-xs font-bold h-9 px-6 w-full"
            >
              فهمت ذلك (إغلاق)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
