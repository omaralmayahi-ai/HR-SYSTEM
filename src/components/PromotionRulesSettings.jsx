import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, Award, Clock, Save, Plus, Edit2, Trash2, CheckCircle2, 
  RotateCcw, Sparkles, AlertCircle, Check, X, Layers, ShieldCheck,
  Bell, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { apiClient } from '@/api/apiClient';

const GRADE_LABELS = {
  1: 'الدرجة الأولى',
  2: 'الدرجة الثانية',
  3: 'الدرجة الثالثة',
  4: 'الدرجة الرابعة',
  5: 'الدرجة الخامسة',
  6: 'الدرجة السادسة',
  7: 'الدرجة السابعة',
  8: 'الدرجة الثامنة',
  9: 'الدرجة التاسعة',
  10: 'الدرجة العاشرة',
  11: 'الدرجة العليا (أ)',
  12: 'الدرجة العليا (ب)',
  13: 'الدرجة الخاصة / خبير'
};

const DEFAULT_GRADE_RULES = [
  { grade: 1, promotion_years: null, notes: 'نهاية سلم الترفيعات للدرجات الاعتيادية' },
  { grade: 2, promotion_years: 5, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 3, promotion_years: 5, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 4, promotion_years: 5, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 5, promotion_years: 5, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 6, promotion_years: 4, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 7, promotion_years: 4, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 8, promotion_years: 4, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 9, promotion_years: 4, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 10, promotion_years: 4, notes: 'قانون رواتب موظفي الدولة 2008 المعدل' },
  { grade: 11, promotion_years: null, notes: 'تعيين بمرسوم جمهوري / لا تخضع لترفيع اعتيادي' },
  { grade: 12, promotion_years: null, notes: 'تعيين بقرار مجلس الوزراء' },
  { grade: 13, promotion_years: null, notes: 'درجة خاصة استشارية' }
];

export default function PromotionRulesSettings() {
  const { toast } = useToast();

  // 1. Grade Promotion Rules State
  const [gradeRules, setGradeRules] = useState([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [savingGradeRules, setSavingGradeRules] = useState(false);

  // 2. Commendation Types State
  const [commendationTypes, setCommendationTypes] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeForm, setTypeForm] = useState({ name: '', credit_months: 1, status: 'فعال', notes: '' });
  const [savingType, setSavingType] = useState(false);
  const [deleteTypeConfirm, setDeleteTypeConfirm] = useState({ open: false, id: null, name: '' });

  // 3. Commendation Rules Settings State
  const [rulesSettings, setRulesSettings] = useState({ 
    max_per_year: 3, 
    allowed_combinations: '[]',
    degree_track_auto_settlement: false,
    reminder_days_course: 30,
    reminder_days_penalty: 15,
    reminder_days_leave: 30,
    reminder_days_evaluation: 30,
    reminder_days_absence: 10
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchGradePromotionRules();
    fetchCommendationTypes();
    fetchCommendationRulesSettings();
  }, []);

  // Fetch Grade Promotion Rules
  const fetchGradePromotionRules = async () => {
    try {
      setLoadingRules(true);
      const data = await apiClient.entities.GradePromotionRule.list();
      if (Array.isArray(data) && data.length > 0) {
        // Sort ascending by grade
        setGradeRules(data.sort((a, b) => (a.grade || 0) - (b.grade || 0)));
      } else {
        setGradeRules(DEFAULT_GRADE_RULES);
      }
    } catch (err) {
      console.error('Error fetching grade promotion rules:', err);
      setGradeRules(DEFAULT_GRADE_RULES);
    } finally {
      setLoadingRules(false);
    }
  };

  // Fetch Commendation Types
  const fetchCommendationTypes = async () => {
    try {
      setLoadingTypes(true);
      const data = await apiClient.entities.CommendationType.list();
      setCommendationTypes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching commendation types:', err);
    } finally {
      setLoadingTypes(false);
    }
  };

  // Fetch Commendation Rules Settings
  const fetchCommendationRulesSettings = async () => {
    try {
      const data = await apiClient.entities.CommendationRulesSetting.get();
      if (data) {
        setRulesSettings({
          max_per_year: data.max_per_year || data.maxPerYear || 3,
          allowed_combinations: typeof data.allowed_combinations === 'string' 
            ? data.allowed_combinations 
            : (data.allowedCombinations || '[]'),
          degree_track_auto_settlement: Boolean(
            data.degree_track_auto_settlement ?? data.degreeTrackAutoSettlement
          ),
          reminder_days_course: data.reminder_days_course ?? data.reminderDaysCourse ?? 30,
          reminder_days_penalty: data.reminder_days_penalty ?? data.reminderDaysPenalty ?? 15,
          reminder_days_leave: data.reminder_days_leave ?? data.reminderDaysLeave ?? 30,
          reminder_days_evaluation: data.reminder_days_evaluation ?? data.reminderDaysEvaluation ?? 30,
          reminder_days_absence: data.reminder_days_absence ?? data.reminderDaysAbsence ?? 10,
        });
      }
    } catch (err) {
      console.error('Error fetching commendation rules settings:', err);
    }
  };

  // Handle saving Grade Promotion Rules (Bulk)
  const handleSaveGradeRules = async () => {
    try {
      setSavingGradeRules(true);
      await apiClient.entities.GradePromotionRule.bulkUpdate(gradeRules);
      toast({
        title: 'تم حفظ سنوات الترفيع',
        description: 'تم تحديث جدول مدد الترفيع القانونية لكافة الدرجات بنجاح.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Error saving grade promotion rules:', err);
      toast({
        title: 'خطأ في الحفظ',
        description: err.message || 'تعذر حفظ سنوات الترفيع',
        variant: 'destructive'
      });
    } finally {
      setSavingGradeRules(false);
    }
  };

  // Restore Default Grade Promotion Rules
  const handleRestoreDefaultGradeRules = () => {
    if (!window.confirm('هل تريد استعادة المدد القياسية لسنوات الترفيع وفق قانون الخدمة المدنية ورواتب الدولة؟')) return;
    setGradeRules(DEFAULT_GRADE_RULES);
  };

  // Update specific grade rule in local state
  const handleGradeRuleChange = (gradeNum, field, value) => {
    setGradeRules(prev => prev.map(r => {
      if (r.grade === gradeNum) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  // Commendation Types Modal Handlers
  const handleOpenAddType = () => {
    setEditingType(null);
    setTypeForm({ name: '', credit_months: 1, status: 'فعال', notes: '' });
    setTypeModalOpen(true);
  };

  const handleOpenEditType = (item) => {
    setEditingType(item);
    setTypeForm({
      name: item.name || '',
      credit_months: item.credit_months || item.creditMonths || 1,
      status: item.status || 'فعال',
      notes: item.notes || ''
    });
    setTypeModalOpen(true);
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال اسم كتاب الشكر والتقدير', variant: 'destructive' });
      return;
    }

    try {
      setSavingType(true);
      const payload = {
        name: typeForm.name.trim(),
        credit_months: parseInt(typeForm.credit_months) || 1,
        status: typeForm.status || 'فعال',
        notes: typeForm.notes || ''
      };

      if (editingType) {
        await apiClient.entities.CommendationType.update(editingType.id, payload);
        toast({ title: 'تم التحديث', description: 'تم تعديل نوع كتاب الشكر بنجاح', variant: 'success' });
      } else {
        await apiClient.entities.CommendationType.create(payload);
        toast({ title: 'تمت الإضافة', description: 'تمت إضافة نوع كتاب الشكر الجديد بنجاح', variant: 'success' });
      }
      setTypeModalOpen(false);
      fetchCommendationTypes();
    } catch (err) {
      toast({ title: 'خطأ أثناء الحفظ', description: err.message, variant: 'destructive' });
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteType = async () => {
    if (!deleteTypeConfirm.id) return;
    try {
      await apiClient.entities.CommendationType.delete(deleteTypeConfirm.id);
      toast({ title: 'تم الحذف', description: 'تم حذف نوع كتاب الشكر بنجاح' });
      setDeleteTypeConfirm({ open: false, id: null, name: '' });
      fetchCommendationTypes();
    } catch (err) {
      toast({ title: 'خطأ أثناء الحذف', description: err.message, variant: 'destructive' });
    }
  };

  // Save Commendation Rules Settings
  const handleSaveRulesSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSavingSettings(true);
      await apiClient.entities.CommendationRulesSetting.update({
        max_per_year: parseInt(rulesSettings.max_per_year) || 3,
        allowed_combinations: rulesSettings.allowed_combinations,
        degree_track_auto_settlement: rulesSettings.degree_track_auto_settlement,
        reminder_days_course: parseInt(rulesSettings.reminder_days_course) || 30,
        reminder_days_penalty: parseInt(rulesSettings.reminder_days_penalty) || 15,
        reminder_days_leave: parseInt(rulesSettings.reminder_days_leave) || 30,
        reminder_days_evaluation: parseInt(rulesSettings.reminder_days_evaluation) || 30,
        reminder_days_absence: parseInt(rulesSettings.reminder_days_absence) || 10,
      });
      toast({
        title: 'تم حفظ ضوابط الترقية والتذكيرات',
        description: 'تم تحديث سقف كتب الشكر ومدد التذكير الافتراضية بنجاح.',
        variant: 'success'
      });
    } catch (err) {
      toast({ title: 'خطأ أثناء الحفظ', description: err.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  // Toggle Degree Track Auto Settlement
  const handleToggleAutoSettlement = async (newValue) => {
    try {
      const updated = {
        ...rulesSettings,
        degree_track_auto_settlement: newValue,
        degreeTrackAutoSettlement: newValue
      };
      setRulesSettings(updated);

      await apiClient.entities.CommendationRulesSetting.update({
        max_per_year: parseInt(updated.max_per_year) || 3,
        allowed_combinations: updated.allowed_combinations,
        degree_track_auto_settlement: newValue,
        degreeTrackAutoSettlement: newValue
      });

      toast({
        title: newValue ? 'تم تفعيل التسوية التلقائية' : 'تم تفعيل الوضع اليدوي (الافتراضي الآمن)',
        description: newValue 
          ? 'تتم تسوية موظفي مسار احتساب الشهادات المستوفين للشروط آلياً فور اكتمال المتطلبات.'
          : 'عادت معالجة مسار احتساب الشهادات إلى قائمة الاعتماد اليدوي بانتظار اعتماد الموارد البشرية.',
        variant: newValue ? 'success' : 'default'
      });
    } catch (err) {
      toast({ title: 'خطأ أثناء تحديث الإعداد', description: err.message, variant: 'destructive' });
      // Revert on error
      setRulesSettings(prev => ({ ...prev, degree_track_auto_settlement: !newValue }));
    }
  };

  return (
    <div className="space-y-8" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#1B3A6B]/10 text-[#1B3A6B] rounded-2xl">
              <TrendingUp size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1B3A6B]">ضوابط الترقية والعلاوة السنوية وكتب الشكر</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                إدارة مدد الترفيع القانونية لكل درجة وظيفية، وضوابط احتساب كتب الشكر والقدَم المضاف وفق سلم رواتب الخدمة المدنية 2023.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. قسم سنوات الترفيع القانونية لكل درجة وظيفية */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Clock className="text-[#1B3A6B]" size={18} />
              سنوات الخدمة المطلوبة للترفيع (لكل درجة وظيفية)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تُستخدم هذه القيم في محرك الاستحقاق الآلي لاحتساب تاريخ استحقاق الترفيع القادم لكل موظف.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRestoreDefaultGradeRules}
              className="rounded-xl text-xs gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw size={13} />
              القيم القانونية القياسية
            </Button>
            <Button
              type="button"
              onClick={handleSaveGradeRules}
              disabled={savingGradeRules}
              className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold gap-1.5 shadow-xs px-4"
            >
              <Save size={14} />
              {savingGradeRules ? 'جاري الحفظ...' : 'حفظ سنوات الترفيع'}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-center w-16">رقم الدرجة</th>
                <th className="px-4 py-3">مسمى الدرجة الوظيفية</th>
                <th className="px-4 py-3 text-center w-48">سنوات الترفيع المطلوبة</th>
                <th className="px-4 py-3">ملاحظات والسند القانوني</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {gradeRules.map((rule) => {
                const gNum = rule.grade;
                const isEndOfLadder = rule.promotion_years === null || rule.promotion_years === undefined;

                return (
                  <tr key={gNum} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-center font-bold text-slate-500 font-mono">
                      {gNum}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">
                      {GRADE_LABELS[gNum] || `الدرجة ${gNum}`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <select
                          value={rule.promotion_years === null ? 'null' : String(rule.promotion_years)}
                          onChange={(e) => {
                            const val = e.target.value === 'null' ? null : parseInt(e.target.value);
                            handleGradeRuleChange(gNum, 'promotion_years', val);
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20"
                        >
                          <option value="null">لا يوجد ترفيع أعلى (نهاية السلم)</option>
                          <option value="1">سنة واحدة</option>
                          <option value="2">سنتان (2)</option>
                          <option value="3">3 سنوات</option>
                          <option value="4">4 سنوات (قانوني للدرجات 6-10)</option>
                          <option value="5">5 سنوات (قانوني للدرجات 2-5)</option>
                          <option value="6">6 سنوات</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={rule.notes || ''}
                        onChange={(e) => handleGradeRuleChange(gNum, 'notes', e.target.value)}
                        placeholder="أدخل ملاحظات اختيارية..."
                        className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-2 py-1 text-xs text-slate-600 transition-colors"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. قسم دليل وأنواع كتب الشكر والتقدير (Commendation Types) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Award className="text-amber-600" size={18} />
              دليل أنواع كتب الشكر والتقدير وشهور القدَم الممنوحة
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تحديد مدة القدم بالشهور المترتبة على كل نوع من كتب الشكر (شهر واحد عادي / 6 أشهر استثنائي رئاسي أو وزاري).
            </p>
          </div>

          <Button
            type="button"
            onClick={handleOpenAddType}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold gap-1.5 shadow-xs px-4"
          >
            <Plus size={14} />
            إضافة نوع كتاب شكر جديد
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">اسم نوع كتاب الشكر</th>
                <th className="px-4 py-3 text-center">أشهر القدَم الممنوحة</th>
                <th className="px-4 py-3">الملاحظات والشروط</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-center w-24">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-slate-700">
              {commendationTypes.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-800">
                    {t.name}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                      (t.credit_months || t.creditMonths) >= 6 
                        ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      +{t.credit_months || t.creditMonths || 1} شهر قدَم
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.notes || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {t.status || 'فعال'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleOpenEditType(t)}
                        className="h-7 w-7 rounded-lg text-blue-600 hover:bg-blue-50"
                        title="تعديل"
                      >
                        <Edit2 size={13} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTypeConfirm({ open: true, id: t.id, name: t.name })}
                        className="h-7 w-7 rounded-lg text-rose-600 hover:bg-rose-50"
                        title="حذف"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. قسم ضوابط وقواعد كتب الشكر السنوية المعتمدة */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
          <ShieldCheck className="text-emerald-700" size={18} />
          <div>
            <h3 className="text-base font-bold text-slate-800">ضوابط وسقف احتساب كتب الشكر السنوية</h3>
            <p className="text-xs text-slate-500 mt-0.5">القواعد الحاكمة لمنع تراكم كتب الشكر بما يجاوز الحدود القانونية سنوياً.</p>
          </div>
        </div>

        <form onSubmit={handleSaveRulesSettings} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2">
              <Label className="text-xs font-bold text-slate-700 block">
                الحد الأقصى لعدد كتب الشكر المحتسبة للموظف في السنة الواحدة *
              </Label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={rulesSettings.max_per_year}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, max_per_year: e.target.value }))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-[#1B3A6B] focus:ring-2 focus:ring-[#1B3A6B]/20"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">كتب شكر سنوياً كحد أقصى</span>
              </div>
              <p className="text-[10px] text-slate-400">القانون العراقي: بحد أقصى 3 كتب شكر محتسبة للقدم في السنة التقويمية الواحدة.</p>
            </div>

            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80 space-y-2">
              <Label className="text-xs font-bold text-slate-700 block">
                توليفات الاحتساب المسموحة سنوياً (Combination Rules)
              </Label>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200/70">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold">3 كتب عادية (شهر واحد)</span> = <span className="font-mono font-bold text-emerald-700">3 أشهر قدم</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200/70">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="font-bold">كتابان عاديان + كتاب استثنائي (6 أشهر)</span> = <span className="font-mono font-bold text-purple-700">8 أشهر قدم</span>
                </div>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded-lg border border-slate-200/70">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="font-bold">كتابان استثنائيان (6 أشهر)</span> = <span className="font-mono font-bold text-indigo-700">12 شهر قدم (سنة كاملة)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingSettings}
              className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold gap-1.5 shadow-xs px-5"
            >
              <Save size={14} />
              {savingSettings ? 'جاري الحفظ...' : 'حفظ ضوابط الشكر والتقدير'}
            </Button>
          </div>
        </form>
      </div>

      {/* 4. قسم التسوية التلقائية لمسار احتساب الشهادات أثناء الخدمة */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="text-[#1B3A6B]" size={18} />
              التسوية التلقائية لمسار احتساب الشهادات (Deficit Auto-Settlement)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              التحكم بسلوك تسوية العجز وتثبيت الاستحقاق لموظفي مسار الشهادات أثناء الخدمة عند استيفاء المدة ودورة الاختصاص.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              rulesSettings.degree_track_auto_settlement
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-amber-100 text-amber-800 border border-amber-300'
            }`}>
              {rulesSettings.degree_track_auto_settlement ? 'التسوية التلقائية مفعلة (آلي)' : 'التسوية اليدوية (الافتراضي الآمن)'}
            </span>
          </div>
        </div>

        {/* Toggle & Warning Section */}
        <div className="space-y-4">
          <div className="flex items-start sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200/80 gap-4">
            <div className="space-y-1">
              <Label htmlFor="auto-settlement-toggle" className="text-sm font-bold text-slate-900 cursor-pointer">
                تفعيل التسوية التلقائية لمسار احتساب الشهادات
              </Label>
              <p className="text-xs text-slate-600">
                عند التفعيل، تُنفّذ تسوية الموظفين المستوفين للشروط تلقائياً وتسجيل اعتمادهم الآلي وإغلاق العجز فوراً.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                id="auto-settlement-toggle"
                type="button"
                role="switch"
                aria-checked={rulesSettings.degree_track_auto_settlement}
                onClick={() => handleToggleAutoSettlement(!rulesSettings.degree_track_auto_settlement)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] focus:ring-offset-2 ${
                  rulesSettings.degree_track_auto_settlement ? 'bg-[#1B3A6B]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    rulesSettings.degree_track_auto_settlement ? 'translate-x-0' : '-translate-x-5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Warning / Guidance Alert */}
          <div className="p-4 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-start gap-3 text-xs text-amber-900 leading-relaxed">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-amber-950 block mb-1">تنبيه أمان وإرشادات التشغيل:</strong>
              عند التفعيل، تصير تسوية الموظفين المستوفين للشروط تلقائياً بدون اعتماد يدوي. عطّل هذا الخيار فوراً لو لاحظت أي سلوك غير متوقع، وستعود كل الحالات المعلّقة لقائمة الاعتماد اليدوي تلقائياً.
            </div>
          </div>
        </div>
      </div>

      {/* 5. قسم مدد التذكير الافتراضية لموانع وأسباب التأخير (المرحلة 4: الشفافية والتذكيرات) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Bell className="text-[#1B3A6B]" size={18} />
              فترات التذكير الافتراضية لموانع الترقية والعلاوة (Blocker Reminders)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تحديد عدد الأيام الافتراضية لتوليد تاريخ التذكير التلقائي لكل نوع من أسباب التأخير أو الإيقاف (دورة، عقوبة، إجازة، تقييم، غياب).
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveRulesSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* دورة حاكمة */}
            <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  الدورات التدريبية الحاكمة
                </Label>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">دورة</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={rulesSettings.reminder_days_course}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, reminder_days_course: e.target.value }))}
                  className="bg-white border-blue-200 font-bold text-[#1B3A6B] text-xs pr-3 pl-12"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم</span>
              </div>
              <p className="text-[10px] text-slate-500">فترة التذكير لمتابعة تسجيل أو اجتياز الدورة (افتراضي: 30 يوم).</p>
            </div>

            {/* عقوبة انضباطية */}
            <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-rose-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                  العقوبات الانضباطية النافذة
                </Label>
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">عقوبة</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={rulesSettings.reminder_days_penalty}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, reminder_days_penalty: e.target.value }))}
                  className="bg-white border-rose-200 font-bold text-rose-900 text-xs pr-3 pl-12"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم</span>
              </div>
              <p className="text-[10px] text-slate-500">فترة التذكير لمراجعة انقضاء أثر العقوبة (افتراضي: 15 يوم).</p>
            </div>

            {/* إجازة موقفة */}
            <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                  الإجازات الموقفة للخدمة
                </Label>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">إجازة</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={rulesSettings.reminder_days_leave}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, reminder_days_leave: e.target.value }))}
                  className="bg-white border-amber-200 font-bold text-amber-900 text-xs pr-3 pl-12"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم</span>
              </div>
              <p className="text-[10px] text-slate-500">فترة التذكير لمتابعة انفكاك أو مباشرة الموظف بعد الإجازة (افتراضي: 30 يوم).</p>
            </div>

            {/* تقييم أداء */}
            <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                  تقييم الأداء السنوي
                </Label>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">تقييم</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={rulesSettings.reminder_days_evaluation}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, reminder_days_evaluation: e.target.value }))}
                  className="bg-white border-purple-200 font-bold text-purple-900 text-xs pr-3 pl-12"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم</span>
              </div>
              <p className="text-[10px] text-slate-500">فترة التذكير لاعتماد أو مراجعة استمارة التقييم السنوية (افتراضي: 30 يوم).</p>
            </div>

            {/* غياب بدون عذر */}
            <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-100 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
                  الغياب بدون عذر
                </Label>
                <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-md">غياب</span>
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={rulesSettings.reminder_days_absence}
                  onChange={(e) => setRulesSettings(prev => ({ ...prev, reminder_days_absence: e.target.value }))}
                  className="bg-white border-orange-200 font-bold text-orange-900 text-xs pr-3 pl-12"
                />
                <span className="absolute left-3 top-2.5 text-[11px] text-slate-400 font-bold">يوم</span>
              </div>
              <p className="text-[10px] text-slate-500">فترة التذكير لتسوية أيام الغياب أو تقديم المبررات (افتراضي: 10 أيام).</p>
            </div>

          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingSettings}
              className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs font-bold gap-1.5 shadow-xs px-5"
            >
              <Save size={14} />
              {savingSettings ? 'جاري الحفظ...' : 'حفظ مدد التذكيرات'}
            </Button>
          </div>
        </form>
      </div>

      {/* Add / Edit Commendation Type Dialog */}
      <Dialog open={typeModalOpen} onOpenChange={setTypeModalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2">
              <Award size={20} />
              {editingType ? 'تعديل نوع كتاب الشكر' : 'إضافة نوع كتاب شكر جديد'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveType} className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-bold text-slate-700">اسم نوع كتاب الشكر والتقدير *</Label>
              <Input
                value={typeForm.name}
                onChange={(e) => setTypeForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: كتاب شكر وتقدير وزاري، كتاب شكر من رئيس الوزراء..."
                className="mt-1 rounded-xl text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700">شهور القدم الممنوحة *</Label>
                <select
                  value={typeForm.credit_months}
                  onChange={(e) => setTypeForm(prev => ({ ...prev, credit_months: parseInt(e.target.value) || 1 }))}
                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="1">شهر واحد (1) - كتاب عادي</option>
                  <option value="6">6 أشهر (استثنائي / رئاسي)</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-700">الحالة</Label>
                <select
                  value={typeForm.status}
                  onChange={(e) => setTypeForm(prev => ({ ...prev, status: e.target.value }))}
                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="فعال">فعال ومتاح للاحتساب</option>
                  <option value="معطل">معطل ومحجوب</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700">ملاحظات وسند المنح</Label>
              <Input
                value={typeForm.notes}
                onChange={(e) => setTypeForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="شروط الصدور أو الجهات المخولة بالمنح..."
                className="mt-1 rounded-xl text-xs"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTypeModalOpen(false)}
                className="rounded-xl text-xs h-9"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={savingType}
                className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl text-xs h-9 font-bold px-5"
              >
                {savingType ? 'جاري الحفظ...' : editingType ? 'حفظ التعديلات' : 'إضافة النوع'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Type Confirmation Dialog */}
      <Dialog open={deleteTypeConfirm.open} onOpenChange={(open) => setDeleteTypeConfirm(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-sm rounded-2xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-rose-700 flex items-center gap-2">
              <AlertCircle size={20} />
              تأكيد حذف نوع كتاب الشكر
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600 leading-relaxed mt-2">
            هل أنت متأكد من حذف نوع كتاب الشكر <strong className="text-slate-900">"{deleteTypeConfirm.name}"</strong>؟
          </p>
          <DialogFooter className="gap-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTypeConfirm({ open: false, id: null, name: '' })}
              className="rounded-xl text-xs h-9"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleDeleteType}
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
