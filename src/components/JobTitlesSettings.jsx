import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, Plus, Search, Filter, Edit3, Trash2, CheckCircle2, XCircle, 
  RefreshCw, Power, AlertCircle, Award, Sparkles, Layers, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/api/apiClient';

const CATEGORIES = [
  'الكل',
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
  'أخرى',
  'عام'
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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [titleToDelete, setTitleToDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    category: 'عام',
    min_grade: 7,
    min_step: 1,
    next_title_id: null,
    status: 'فعال',
    notes: ''
  });

  const fetchTitles = async () => {
    try {
      setLoading(true);
      const data = await apiClient.entities.JobTitle.list();
      setTitles(data || []);
    } catch (err) {
      console.error('Error loading job titles:', err);
      toast({
        title: 'خطأ في جلب العناوين الوظيفية',
        description: err.message || 'تعذر تحميل قائمة العناوين الوظيفية',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTitles();
  }, []);

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
    const categoriesCount = new Set(titles.map(t => t.category).filter(Boolean)).size;
    return { total, active, inactive, categoriesCount };
  }, [titles]);

  const handleOpenAddModal = () => {
    setEditingTitle(null);
    setForm({
      name: '',
      category: 'عام',
      min_grade: 7,
      min_step: 1,
      next_title_id: null,
      status: 'فعال',
      notes: ''
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (titleItem) => {
    setEditingTitle(titleItem);
    setForm({
      name: titleItem.name || '',
      category: titleItem.category || 'عام',
      min_grade: titleItem.min_grade || titleItem.minGrade || 7,
      min_step: titleItem.min_step || titleItem.minStep || 1,
      next_title_id: titleItem.next_title_id || titleItem.nextTitleId || null,
      status: titleItem.status || 'فعال',
      notes: titleItem.notes || ''
    });
    setModalOpen(true);
  };

  const handleToggleStatus = async (titleItem) => {
    const newStatus = titleItem.status === 'معطل' ? 'فعال' : 'معطل';
    try {
      // Optimistic update
      setTitles(prev => prev.map(t => t.id === titleItem.id ? { ...t, status: newStatus } : t));
      
      await apiClient.entities.JobTitle.update(titleItem.id, {
        ...titleItem,
        status: newStatus
      });

      toast({
        title: newStatus === 'فعال' ? 'تم تفعيل العنوان الوظيفي' : 'تم تعطيل العنوان الوظيفي',
        description: `العنوان "${titleItem.name}" أصبح الآن (${newStatus}).`,
      });
    } catch (err) {
      console.error('Error toggling status:', err);
      // Revert optimistic update
      fetchTitles();
      toast({
        title: 'فشل تغيير الحالة',
        description: err.message || 'حدث خطأ أثناء تعديل حالة العنوان',
        variant: 'destructive'
      });
    }
  };

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

    try {
      setSaving(true);
      if (editingTitle) {
        const updated = await apiClient.entities.JobTitle.update(editingTitle.id, form);
        setTitles(prev => prev.map(t => t.id === editingTitle.id ? { ...t, ...updated } : t));
        toast({
          title: 'تم تعديل العنوان الوظيفي بنجاح',
          description: `تم حفظ بيانات "${form.name}" بنجاح.`
        });
      } else {
        const created = await apiClient.entities.JobTitle.create(form);
        setTitles(prev => [created, ...prev]);
        toast({
          title: 'تمت إضافة العنوان الوظيفي',
          description: `تم تسجيل "${form.name}" كعنوان وظيفي جديد في النظام.`
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

  const handleDeleteConfirm = async () => {
    if (!titleToDelete) return;
    try {
      setTitles(prev => prev.filter(t => t.id !== titleToDelete.id));
      await apiClient.entities.JobTitle.delete(titleToDelete.id);
      toast({
        title: 'تم حذف العنوان الوظيفي',
        description: `تم حذف "${titleToDelete.name}" من النظام.`
      });
      setDeleteDialogOpen(false);
      setTitleToDelete(null);
    } catch (err) {
      console.error('Error deleting job title:', err);
      fetchTitles();
      toast({
        title: 'فشل الحذف',
        description: err.message || 'تعذر حذف العنوان الوظيفي',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header and Statistics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2 rounded-xl bg-[#1B3A6B]/10 text-[#1B3A6B]">
              <Briefcase size={22} />
            </div>
            <h2 className="text-xl font-bold text-[#1B3A6B]">دليل العناوين الوظيفية والمهنية</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            إدارة كافة التوصيفات والعناوين الوظيفية في الشركة، وتفعيلها أو إيقافها، حيث تنعكس العناوين الفعالة مباشرة في بطاقة وقيد الموظف وسجل التكاليف.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={fetchTitles}
            variant="outline"
            size="sm"
            className="rounded-xl h-10 px-3 border-slate-200 text-slate-600 hover:bg-slate-50"
            title="تحديث البيانات"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
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
        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">إجمالي العناوين</span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-700"><Briefcase size={15} /></span>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-2">{stats.total}</p>
          <span className="text-[10px] text-slate-400">عنوان مسجل في قاعدة البيانات</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-600">العناوين الفعالة</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700"><CheckCircle2 size={15} /></span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">{stats.active}</p>
          <span className="text-[10px] text-emerald-600/80 font-medium">متاحة للاختيار في القيود</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-600">العناوين المعطلة</span>
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-700"><XCircle size={15} /></span>
          </div>
          <p className="text-2xl font-black text-rose-700 mt-2">{stats.inactive}</p>
          <span className="text-[10px] text-rose-500 font-medium">محجوبة من قوائم الاختيار</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-600">المجالات والتخصصات</span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-700"><Layers size={15} /></span>
          </div>
          <p className="text-2xl font-black text-purple-800 mt-2">{stats.categoriesCount}</p>
          <span className="text-[10px] text-purple-600/80">فئات وظيفية متخصصة</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
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
              <SelectContent>
                <SelectItem value="all">كل الحالات ({stats.total})</SelectItem>
                <SelectItem value="active">الفعالة فقط ({stats.active})</SelectItem>
                <SelectItem value="inactive">المعطلة فقط ({stats.inactive})</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-slate-400 shrink-0 ml-1">التصنيف:</span>
          {CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat;
            const count = cat === 'الكل' 
              ? titles.length 
              : titles.filter(t => t.category === cat).length;

            return (
              <button
                key={cat}
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-100">
                <th className="px-4 py-3.5 w-12 text-center">#</th>
                <th className="px-4 py-3.5">العنوان الوظيفي</th>
                <th className="px-4 py-3.5">المجال / التخصص</th>
                <th className="px-4 py-3.5">الدرجة المقترحة</th>
                <th className="px-4 py-3.5">العنوان التالي بالترقية</th>
                <th className="px-4 py-3.5 text-center">الحالة</th>
                <th className="px-4 py-3.5">الملاحظات</th>
                <th className="px-4 py-3.5 w-28 text-center">الإجراءات</th>
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
                  const catClass = CATEGORY_COLORS[item.category] || CATEGORY_COLORS['عام'];
                  const nextId = item.next_title_id || item.nextTitleId;
                  const nextObj = nextId ? titles.find(t => t.id === nextId) : null;

                  return (
                    <tr 
                      key={item.id || index}
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

                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          الدرجة {item.min_grade || item.minGrade || 7} / المرحلة {item.min_step || item.minStep || 1}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        {nextObj ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200">
                            {nextObj.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
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

                      <td className="px-4 py-3.5 text-slate-500 max-w-[200px] truncate text-[11px]">
                        {item.notes || <span className="text-slate-300">-</span>}
                      </td>

                      <td className="px-4 py-3.5 text-center">
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
                            onClick={() => {
                              setTitleToDelete(item);
                              setDeleteDialogOpen(true);
                            }}
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

      {/* Add / Edit Dialog */}
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
                placeholder="مثال: مهندس أقدم، معاون رئيس مبرمجين..."
                className="mt-1 rounded-xl text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">المجال / الفئة</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl text-xs">
                    <SelectValue placeholder="اختر الفئة" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {CATEGORIES.filter(c => c !== 'الكل').map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">الدرجة الأساس</Label>
                <Select
                  value={String(form.min_grade)}
                  onValueChange={(v) => setForm(prev => ({ ...prev, min_grade: parseInt(v) }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl text-xs">
                    <SelectValue placeholder="اختر الدرجة" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {[1,2,3,4,5,6,7,8,9,10].map(g => (
                      <SelectItem key={g} value={String(g)}>الدرجة {g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">المرحلة الأساس</Label>
                <Select
                  value={String(form.min_step || 1)}
                  onValueChange={(v) => setForm(prev => ({ ...prev, min_step: parseInt(v) }))}
                >
                  <SelectTrigger className="mt-1 rounded-xl text-xs">
                    <SelectValue placeholder="المرحلة" />
                  </SelectTrigger>
                  <SelectContent className="z-[9999]">
                    {[1,2,3,4,5,6,7,8,9,10,11].map(s => (
                      <SelectItem key={s} value={String(s)}>المرحلة {s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">العنوان التالي بالترقية (المسار الوظيفي)</Label>
              <Select
                value={form.next_title_id ? String(form.next_title_id) : 'none'}
                onValueChange={(v) => setForm(prev => ({ ...prev, next_title_id: v === 'none' ? null : parseInt(v) }))}
              >
                <SelectTrigger className="mt-1 rounded-xl text-xs">
                  <SelectValue placeholder="اختر العنوان التالي (اختياري)" />
                </SelectTrigger>
                <SelectContent className="z-[9999] max-h-56">
                  <SelectItem value="none">بدون تحديد (نهاية السلم أو غير مقيد)</SelectItem>
                  {titles
                    .filter(t => !editingTitle || t.id !== editingTitle.id)
                    .map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} (الدرجة {t.min_grade || t.minGrade || '-'})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
              <Label className="text-xs font-bold text-slate-700">ملاحظات وشروط إضافية</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="شروط خاصة بالعنوان الوظيفي أو التسكين..."
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

      {/* Delete Confirmation Dialog */}
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
            لن يظهر هذا العنوان بعد الآن في الخيارات المقترحة.
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
    </div>
  );
}
