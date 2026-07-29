import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { fetchEducationDegreesSorted, fetchResponsibilityAllowancesSorted, subscribeToSettingsUpdates } from '@/lib/settingsUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { ArrowRight, Save, User, Briefcase, GraduationCap, ChevronDown, ChevronRight, Search, X, Camera, Trash2, Upload, AlertTriangle, Clock } from 'lucide-react';
import { getGradeLabel } from '@/lib/salaryTable';
import { isSupervisoryPosition } from '@/lib/evaluationEngine';

const GRADES = [1,2,3,4,5,6,7,8,9,10,11,12,13];
const STEPS = [1,2,3,4,5,6,7,8,9,10,11];

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
  "طبيب", "طبيب اختصاص", "ممرض", "ممرض ماهر"
];

const normalizeArabic = (text) => {
  if (!text) return '';
  return text
    .replace(/[أإآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .replace(/[\u064B-\u065F]/g, '') // remove diacritics
    .trim()
    .toLowerCase();
};

export default function EmployeeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = !!id;

  const [form, setForm] = useState({
    first_name: '', father_name: '', grandfather_name: '', great_grandfather_name: '',
    full_name: '', surname: '', company_number: '', civil_service_number: '',
    gender: 'ذكر', birth_date: '', birth_place: '', nationality: 'عراقي', ethnicity: 'عربي/ة',
    religion: 'مسلم', marital_status: 'أعزب', children_count: 0,
    national_id: '', passport_number: '', blood_type: 'غير معروف',
    residence_card: '', ration_card: '', nationality_cert: '', address: '', phone: '', email: '',
    appointment_date: '', first_appointment_date: '', current_appointment_date: '', oil_sector_start_date: '', appointment_order: '', job_title: '', department: '', section: '',
    service_record_number: '', employee_id_number: '', employee_number: '',
    service_type: 'دائم', grade: 1, step: 1, grade_date: '', status: 'مستمر',
    status_order_number: '', status_order_date: '', status_notes: '',
    work_nature: 'مكتبي',
    work_shift_type: 'صباحي',
    shift_system_id: null,
    shift_system_name: '',
    shift_work_days: 0,
    shift_rest_days: 0,
    retirement_number: '', security_clearance_number: '', security_clearance_date: '',
    education_level: 'بكالوريوس', specialization: '', university: '',
    graduation_year: '', education_order: '', notes: '', role: 'employee', photo: '',
    job_responsibility: 'بلا مسؤولية', deputy_status: 'أصيل',
    primary_responsibility: 'بلا مسؤولية',
    acting_responsibility: 'بلا وكالة',
    deputy_level: 'لا يوجد',
    initial_regular_leave_balance: 0,
    initial_sick_leave_balance: 0
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [workLocations, setWorkLocations] = useState([]);
  const [educationDegrees, setEducationDegrees] = useState([]);
  const [responsibilityAllowances, setResponsibilityAllowances] = useState([]);
  const [shiftSystems, setShiftSystems] = useState([]);
  const [allJobTitles, setAllJobTitles] = useState([]);
  const [showJobSuggestions, setShowJobSuggestions] = useState(false);

  const loadSystemSettingsData = () => {
    apiClient.entities.WorkLocation.list().then(data => {
      setWorkLocations(data || []);
    }).catch(err => {
      console.error('Error fetching work locations:', err);
    });

    fetchEducationDegreesSorted().then(data => {
      setEducationDegrees(data || []);
    }).catch(err => {
      console.error('Error fetching education degrees:', err);
    });

    fetchResponsibilityAllowancesSorted().then(data => {
      setResponsibilityAllowances(data || []);
    }).catch(err => {
      console.error('Error fetching responsibility allowances:', err);
    });

    apiClient.entities.ShiftSystem.list().then(data => {
      setShiftSystems(data || []);
    }).catch(err => {
      console.error('Error fetching shift systems:', err);
    });
  };

  useEffect(() => {
    loadSystemSettingsData();

    apiClient.entities.Employee.list().then(data => {
      const dbTitles = data ? data.map(e => e.job_title || e.jobTitle).filter(Boolean) : [];
      const combined = Array.from(new Set([...STANDARD_JOB_TITLES, ...dbTitles])).sort();
      setAllJobTitles(combined);
    }).catch(err => {
      console.error('Error fetching employees for job titles:', err);
      setAllJobTitles(STANDARD_JOB_TITLES);
    });

    const unsubscribe = subscribeToSettingsUpdates(() => {
      loadSystemSettingsData();
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isEdit) {
      setLoading(true);
      apiClient.entities.Employee.get(id).then(data => {
        setForm(prev => {
          const merged = { ...prev };
          if (data) {
            Object.keys(data).forEach(key => {
              if (data[key] !== null && data[key] !== undefined) {
                merged[key] = data[key];
              }
            });
            if (!merged.first_name && merged.full_name) {
              const parts = (merged.full_name || '').trim().split(/\s+/);
              merged.first_name = parts[0] || '';
              merged.father_name = parts[1] || '';
              merged.grandfather_name = parts[2] || '';
              merged.great_grandfather_name = parts.slice(3).join(' ') || '';
            }
            merged.university = data.university || data.institution || merged.university || '';
            merged.graduation_year = data.graduation_year || data.graduationYear || merged.graduation_year || '';
            merged.education_order = data.education_order || data.evaluation_order || data.educationOrder || data.evaluationOrder || merged.education_order || '';
          }
          return merged;
        });
        setLoading(false);
      });
    }
  }, [id]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const setNameField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      const parts = [next.first_name, next.father_name, next.grandfather_name, next.great_grandfather_name].filter(Boolean);
      next.full_name = parts.join(' ');
      return next;
    });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        set('photo', reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const [showOrgPicker, setShowOrgPicker] = useState(false);
  const [orgUnits, setOrgUnits] = useState([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [expandedPickerIds, setExpandedPickerIds] = useState(new Set());
  const [orgLoading, setOrgLoading] = useState(false);
  const [formSwitchModal, setFormSwitchModal] = useState(null);

  const handleResponsibilityChange = (newResp) => {
    const currentResp = form.primary_responsibility || 'بلا مسؤولية';
    const wasSupervisory = isSupervisoryPosition({ primary_responsibility: currentResp });
    const isNowSupervisory = isSupervisoryPosition({ primary_responsibility: newResp });

    if (!wasSupervisory && isNowSupervisory) {
      setFormSwitchModal({
        newResp,
        type: 'to_supervisory',
        message: `تم منح الموظف مسؤولية إشرافية جديدة (${newResp}). هل ترغب بتعديل استمارة تقييم الأداء المعتمدة له تلقائياً إلى (FORM_1 - الوظائف القيادية والإشرافية)؟`
      });
    } else if (wasSupervisory && !isNowSupervisory) {
      setFormSwitchModal({
        newResp,
        type: 'from_supervisory',
        message: `تم سحب المسؤولية الإشرافية عن الموظف. هل ترغب بتحويل استمارة تقييم الأداء المستحقة إلى استمارة الكادر التنفيذي (FORM_2 / FORM_3)؟`
      });
    } else {
      set('primary_responsibility', newResp);
    }
  };

  useEffect(() => {
    if (showOrgPicker) {
      setOrgLoading(true);
      apiClient.entities.OrgUnit.list().then(data => {
        setOrgUnits(data || []);
        if (data && data.length > 0) {
          setExpandedPickerIds(new Set(data.map(u => u.id)));
        }
        setOrgLoading(false);
      }).catch(err => {
        console.error(err);
        setOrgLoading(false);
      });
    }
  }, [showOrgPicker]);

  const toggleExpandPicker = (id) => {
    const next = new Set(expandedPickerIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedPickerIds(next);
  };

  const getHierarchyChain = (unit, allUnits) => {
    const chain = [];
    let current = unit;
    while (current) {
      chain.unshift(current.name);
      const parentId = current.parentId;
      current = parentId ? allUnits.find(u => u.id === parentId) : null;
    }
    return chain.join(' -> ');
  };

  const handleSelectUnit = (unit) => {
    const chain = getHierarchyChain(unit, orgUnits);
    setForm(prev => ({
      ...prev,
      department: unit.name,
      section: chain
    }));
    setShowOrgPicker(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.service_record_number) {
        const allEmployees = await apiClient.entities.Employee.list();
        const duplicate = allEmployees.find(emp => 
          emp.service_record_number === form.service_record_number && 
          String(emp.id) !== String(id || '')
        );
        if (duplicate) {
          toast({
            title: 'تنبيه تكرار رقم الإضبارة',
            description: 'رقم اضبارة الموظف يجب أن يكون فريداً ولا يتكرر لموظف آخر!',
            variant: 'destructive'
          });
          setSaving(false);
          return;
        }
      }

      if (isEdit) {
        await apiClient.entities.Employee.update(id, form);
      } else {
        await apiClient.entities.Employee.create(form);
      }
      toast({ title: isEdit ? 'تم تحديث الموظف' : 'تم إضافة الموظف', description: 'تمت العملية بنجاح' });
      navigate('/employees');
    } catch (error) {
      console.error('Error saving employee:', error);
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'حدث خطأ غير متوقع',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
    </div>
  );

  const defaultResponsibilities = ['بلا مسؤولية', 'مسؤول وجبة', 'مسؤول وحدة', 'مسؤول شعبة', 'مدير قسم', 'مدير قسم مركزي', 'مدير هيئة', 'معاون مدير عام', 'مدير عام'];
  const primaryResponsibilityOptions = responsibilityAllowances.length > 0
    ? responsibilityAllowances.map(r => r.name)
    : defaultResponsibilities;

  const hasNoResponsibility = primaryResponsibilityOptions.includes('بلا مسؤولية');
  const finalPrimaryOptions = hasNoResponsibility ? primaryResponsibilityOptions : ['بلا مسؤولية', ...primaryResponsibilityOptions];
  const actingResponsibilityOptions = ['بلا وكالة', ...finalPrimaryOptions.filter(r => r !== 'بلا مسؤولية' && r !== 'بلا وكالة')];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/employees')} className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
          <ArrowRight size={16} className="text-slate-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">{isEdit ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}</h1>
          <p className="text-slate-500 text-sm">وفق نماذج ديوان الخدمة المدنية العراقي</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs defaultValue="personal" dir="rtl">
          <TabsList className="bg-white border border-slate-200 rounded-xl p-1 mb-5">
            <TabsTrigger value="personal" className="rounded-lg gap-2 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">
              <User size={14} /> البيانات الشخصية
            </TabsTrigger>
            <TabsTrigger value="job" className="rounded-lg gap-2 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">
              <Briefcase size={14} /> البيانات الوظيفية
            </TabsTrigger>
            <TabsTrigger value="education" className="rounded-lg gap-2 data-[state=active]:bg-[#1B3A6B] data-[state=active]:text-white">
              <GraduationCap size={14} /> التحصيل الدراسي
            </TabsTrigger>
          </TabsList>

          {/* Personal Tab */}
          <TabsContent value="personal">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
              <div>
                <h2 className="font-bold text-[#1B3A6B] text-lg">البيانات الشخصية</h2>
                <p className="text-xs text-slate-400 mt-0.5">المعلومات الأساسية وبيانات التعريف والاتصال بالموظف</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* 1. معلومات الهوية الأساسية */}
                <div className="col-span-full pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">معلومات الهوية الأساسية</h3>
                </div>

                {/* 1. الاسم الخماسي/الرباعي واللقب */}
                <div>
                  <Label>الاسم الأول *</Label>
                  <Input className="mt-1 rounded-xl" value={form.first_name || ''} onChange={e => setNameField('first_name', e.target.value)} required placeholder="مثال: عمر" />
                </div>
                <div>
                  <Label>اسم الأب *</Label>
                  <Input className="mt-1 rounded-xl" value={form.father_name || ''} onChange={e => setNameField('father_name', e.target.value)} required placeholder="مثال: محمود" />
                </div>
                <div>
                  <Label>اسم الجد *</Label>
                  <Input className="mt-1 rounded-xl" value={form.grandfather_name || ''} onChange={e => setNameField('grandfather_name', e.target.value)} required placeholder="مثال: سلمان" />
                </div>
                <div>
                  <Label>اسم والد الجد (الاسم الرابع) *</Label>
                  <Input className="mt-1 rounded-xl" value={form.great_grandfather_name || ''} onChange={e => setNameField('great_grandfather_name', e.target.value)} required placeholder="مثال: محيميد" />
                </div>
                <div>
                  <Label>اللقب *</Label>
                  <Input className="mt-1 rounded-xl" value={form.surname || ''} onChange={e => set('surname', e.target.value)} required placeholder="مثال: المياحي" />
                </div>

                <div className="col-span-full bg-blue-50/60 border border-blue-200/80 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-blue-900 font-semibold">معاينة الاسم الكامل المعتمد:</span>
                  <span className="font-bold text-[#1B3A6B] text-sm">
                    {[form.first_name, form.father_name, form.grandfather_name, form.great_grandfather_name, form.surname].filter(Boolean).join(' ') || 'لم يتم إدخال الاسم بعد'}
                  </span>
                </div>
                <div>
                  <Label>الرقم الوظيفي (رقم وزارة التخطيط) *</Label>
                  <Input className="mt-1 rounded-xl" value={form.civil_service_number || ''} onChange={e => set('civil_service_number', e.target.value)} required placeholder="الرقم الوظيفي الموحد" />
                </div>
                <div>
                  <Label>رقم الشركة (رقم فريد للموظف) *</Label>
                  <Input className="mt-1 rounded-xl" value={form.company_number || ''} onChange={e => set('company_number', e.target.value)} required placeholder="رقم فريد ضمن الشركة (7 رموز)" />
                </div>

                {/* 2. المعلومات الحيوية والاجتماعية */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">المعلومات الحيوية والاجتماعية</h3>
                </div>

                <div>
                  <Label>الجنس *</Label>
                  <Select value={form.gender} onValueChange={v => set('gender', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="ذكر">ذكر</SelectItem><SelectItem value="أنثى">أنثى</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>تاريخ الميلاد *</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.birth_date || ''} onChange={e => set('birth_date', e.target.value)} required />
                </div>
                <div>
                  <Label>محل الميلاد</Label>
                  <Input className="mt-1 rounded-xl" value={form.birth_place || ''} onChange={e => set('birth_place', e.target.value)} />
                </div>
                <div>
                  <Label>الجنسية</Label>
                  <Input className="mt-1 rounded-xl" value={form.nationality || ''} onChange={e => set('nationality', e.target.value)} />
                </div>
                <div>
                  <Label>القومية</Label>
                  <Select value={form.ethnicity || 'عربي/ة'} onValueChange={v => set('ethnicity', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['عربي/ة', 'كردي/ة', 'تركماني/ة', 'كلداني/ة', 'آشوري/ة', 'سرياني/ة', 'أرمني/ة', 'أخرى', 'غير محدد'].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الديانة *</Label>
                  <Select value={form.religion} onValueChange={v => set('religion', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['مسلم','مسيحي','صابئي','يزيدي','أخرى','غير محدد'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>فصيلة الدم</Label>
                  <Select value={form.blood_type || 'غير معروف'} onValueChange={v => set('blood_type', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'غير معروف'].map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الحالة الاجتماعية *</Label>
                  <Select value={form.marital_status} onValueChange={v => set('marital_status', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['أعزب','متزوج','مطلق','أرمل'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>عدد الأولاد المعالين</Label>
                  <Input type="number" min={0} max={20} className="mt-1 rounded-xl" value={form.children_count || 0} onChange={e => set('children_count', parseInt(e.target.value) || 0)} />
                </div>

                {/* 3. المستندات الثبوتية */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">المستندات الثبوتية</h3>
                </div>

                <div>
                  <Label>رقم البطاقة الوطنية / الهوية *</Label>
                  <Input className="mt-1 rounded-xl" value={form.national_id || ''} onChange={e => set('national_id', e.target.value)} required />
                </div>
                <div>
                  <Label>رقم بطاقة السكن</Label>
                  <Input className="mt-1 rounded-xl" value={form.residence_card || ''} onChange={e => set('residence_card', e.target.value)} />
                </div>
                <div>
                  <Label>البطاقة التموينية</Label>
                  <Input className="mt-1 rounded-xl" value={form.ration_card || ''} onChange={e => set('ration_card', e.target.value)} placeholder="رقم البطاقة التموينية" />
                </div>
                <div>
                  <Label>رقم الجواز</Label>
                  <Input className="mt-1 rounded-xl" value={form.passport_number || ''} onChange={e => set('passport_number', e.target.value)} />
                </div>

                {/* 4. بيانات الاتصال والسكن والصورة */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">بيانات الاتصال والصورة الشخصية</h3>
                </div>

                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <Label>عنوان السكن الكامل</Label>
                    <Input className="mt-1 rounded-xl" value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="المحافظة / المنطقة / زقاق، محلة، دار" />
                  </div>
                  <div>
                    <Label>رقم الهاتف</Label>
                    <Input className="mt-1 rounded-xl" value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="07XXXXXXXXX" />
                  </div>
                  <div>
                    <Label>البريد الإلكتروني</Label>
                    <Input type="email" className="mt-1 rounded-xl" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="example@domain.com" />
                  </div>
                </div>

                <div className="flex flex-col">
                  <Label className="block mb-2 text-slate-700 font-semibold text-xs">الصورة الشخصية للموظف</Label>
                  <div className="flex flex-col items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-dashed border-slate-200">
                    <div className="relative w-28 h-28 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-slate-100 group">
                      {form.photo ? (
                        <img 
                          src={form.photo} 
                          alt="صورة الموظف" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                          <User size={36} className="stroke-[1.5]" />
                          <span className="text-[10px] mt-1 text-slate-400 font-medium">صورة افتراضية</span>
                        </div>
                      )}
                      
                      {/* Overlay label acting as click target */}
                      <label 
                        htmlFor="photo-upload-input" 
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] cursor-pointer transition-opacity duration-200 gap-1"
                      >
                        <Camera size={14} />
                        <span>تغيير الصورة</span>
                      </label>
                    </div>

                    <div className="flex flex-col gap-2 w-full">
                      {/* Hidden file input */}
                      <input 
                        type="file" 
                        id="photo-upload-input" 
                        accept="image/*" 
                        onChange={handlePhotoChange} 
                        className="hidden" 
                      />
                      
                      <div className="flex gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="flex-1 rounded-xl text-[10px] gap-1 h-8 border-slate-200 hover:bg-slate-100 px-2"
                          onClick={() => document.getElementById('photo-upload-input').click()}
                        >
                          <Upload size={12} className="text-slate-500" />
                          <span>تحميل صورة</span>
                        </Button>

                        {form.photo && (
                          <Button 
                            type="button" 
                            variant="ghost" 
                            className="rounded-xl px-2 h-8 text-red-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
                            onClick={() => set('photo', '')}
                            title="إزالة الصورة"
                          >
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Job Tab */}
          <TabsContent value="job">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
              <div>
                <h2 className="font-bold text-[#1B3A6B] text-lg">البيانات الوظيفية</h2>
                <p className="text-xs text-slate-400 mt-0.5">معلومات التعيين والمباشرة، السلم الوظيفي والجهة التنظيمية</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* 1. معلومات التعيين والمباشرة */}
                <div className="col-span-full pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">معلومات التعيين والمباشرة (المعلومات الإدارية)</h3>
                </div>

                <div>
                  <Label>أمر التعيين (رقم الأمر الإداري)</Label>
                  <Input className="mt-1 rounded-xl" value={form.appointment_order || ''} onChange={e => set('appointment_order', e.target.value)} placeholder="مثال: م.أ/2451" />
                </div>
                <div>
                  <Label>تاريخ أمر التعيين</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.appointment_date || ''} onChange={e => set('appointment_date', e.target.value)} />
                </div>
                <div>
                  <Label>تاريخ المباشرة الأولى *</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.first_appointment_date || ''} onChange={e => set('first_appointment_date', e.target.value)} required />
                  <span className="text-[10px] text-slate-400 mt-1 block">تاريخ أول مباشرة في الوظيفة الحكومية</span>
                </div>
                <div>
                  <Label>تاريخ المباشرة في هذه الشركة *</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.current_appointment_date || ''} onChange={e => set('current_appointment_date', e.target.value)} required />
                  <span className="text-[10px] text-slate-400 mt-1 block">تاريخ المباشرة الحالية في هذه الشركة (قد يكون منقولاً)</span>
                </div>
                <div>
                  <Label>تاريخ العمل في القطاع النفطي</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.oil_sector_start_date || ''} onChange={e => set('oil_sector_start_date', e.target.value)} />
                  <span className="text-[10px] text-slate-400 mt-1 block">تاريخ أول مباشرة/التحاق للعمل في الشركات أو القطاع النفطي</span>
                </div>

                {/* 2. الموقع الوظيفي والجهة التنظيمية */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">الموقع الوظيفي والجهة التنظيمية</h3>
                </div>

                <div className="relative">
                  <Label>العنوان الوظيفي *</Label>
                  <Input 
                    className="mt-1 rounded-xl" 
                    value={form.job_title || ''} 
                    onChange={e => {
                      set('job_title', e.target.value);
                      setShowJobSuggestions(true);
                    }} 
                    onFocus={() => setShowJobSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowJobSuggestions(false), 250)}
                    placeholder="مثال: معاون مدير عام" 
                    required
                  />
                  {showJobSuggestions && (
                    (() => {
                      const query = form.job_title || '';
                      const filtered = allJobTitles.filter(title => {
                        const normTitle = normalizeArabic(title);
                        const normQuery = normalizeArabic(query);
                        return normTitle.includes(normQuery);
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <div className="absolute right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 py-1.5">
                          {filtered.map((title) => {
                            const isExactMatch = (form.job_title || '').trim() === title.trim();
                            return (
                              <div
                                key={title}
                                onMouseDown={() => {
                                  set('job_title', title);
                                  setShowJobSuggestions(false);
                                }}
                                className="px-3 py-2 text-right text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#1B3A6B] cursor-pointer transition-colors flex items-center justify-between"
                              >
                                <span>{title}</span>
                                {isExactMatch && (
                                  <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-bold">مطابق للعنوان المكتوب</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()
                  )}
                </div>
                <div>
                  <Label>المسؤولية الأساسية</Label>
                  <Select value={form.primary_responsibility || 'بلا مسؤولية'} onValueChange={v => handleResponsibilityChange(v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {finalPrimaryOptions.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المسؤولية في حالة الوكالة</Label>
                  <Select value={form.acting_responsibility || 'بلا وكالة'} onValueChange={v => set('acting_responsibility', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {actingResponsibilityOptions.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>تحديد درجة الوكيل</Label>
                  <Select value={form.deputy_level || 'لا يوجد'} onValueChange={v => set('deputy_level', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['لا يوجد', 'وكيل أول', 'وكيل ثاني'].map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="lg:col-span-3">
                  <Label>جهة العمل *</Label>
                  <div className="mt-1 flex flex-col sm:flex-row gap-2">
                    <Input 
                      className="rounded-xl bg-slate-50 flex-1 font-semibold text-[#1B3A6B]" 
                      value={form.section || form.department || ''} 
                      readOnly 
                      placeholder="اضغط لتحديد جهة العمل أو اختر 'لم يحدد بعد'" 
                      required 
                    />
                    <div className="flex gap-2 shrink-0">
                      <Button 
                        type="button" 
                        onClick={() => setShowOrgPicker(true)} 
                        className="bg-[#1B3A6B] text-white hover:bg-[#1B3A6B]/90 rounded-xl px-3 text-xs h-10 flex-1 sm:flex-initial"
                      >
                        تحديد من الهيكل
                      </Button>
                      <Button 
                        type="button" 
                        onClick={() => {
                          setForm(prev => ({
                            ...prev,
                            department: 'لم يحدد بعد',
                            section: 'لم يحدد بعد'
                          }));
                        }} 
                        variant="outline"
                        className="border-slate-200 hover:bg-slate-50 hover:text-[#1B3A6B] text-slate-600 rounded-xl px-3 text-xs h-10 flex-1 sm:flex-initial"
                      >
                        لم يحدد بعد
                      </Button>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>نوع الخدمة *</Label>
                  <Select value={form.service_type} onValueChange={v => set('service_type', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['دائم','مؤقت','عقد','إعارة'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>حالة الموظف</Label>
                  <Select value={form.status} onValueChange={v => {
                    set('status', v);
                    if (v === 'مستمر') {
                      setForm(prev => ({
                        ...prev,
                        status: v,
                        status_order_number: '',
                        status_order_date: '',
                        status_notes: ''
                      }));
                    }
                  }}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['مستمر','منسب','منقول','متقاعد','متقاعد مع تمديد','مستقيل','موقوف','مجاز'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {form.status && form.status !== 'مستمر' && (
                  <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-5 bg-amber-50/40 p-5 rounded-2xl border border-amber-100/60 mt-1">
                    <div>
                      <Label className="text-amber-800">رقم الأمر الإداري للحالة *</Label>
                      <Input 
                        className="mt-1 rounded-xl bg-white border-amber-200 focus:border-amber-500 focus:ring-amber-500" 
                        value={form.status_order_number || ''} 
                        onChange={e => set('status_order_number', e.target.value)}
                        required
                        placeholder="أدخل رقم الأمر الإداري"
                      />
                    </div>
                    <div>
                      <Label className="text-amber-800">تاريخ الأمر الإداري للحالة *</Label>
                      <Input 
                        type="date"
                        className="mt-1 rounded-xl bg-white border-amber-200 focus:border-amber-500 focus:ring-amber-500" 
                        value={form.status_order_date || ''} 
                        onChange={e => set('status_order_date', e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <Label className="text-amber-800">الملاحظات *</Label>
                      <Input 
                        className="mt-1 rounded-xl bg-white border-amber-200 focus:border-amber-500 focus:ring-amber-500" 
                        value={form.status_notes || ''} 
                        onChange={e => set('status_notes', e.target.value)}
                        required
                        placeholder="ملاحظات توضيحية"
                      />
                    </div>
                  </div>
                )}

                {/* Service Extension Section */}
                <div className="col-span-full pt-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-4 bg-amber-600 rounded-full" />
                    <h3 className="font-bold text-sm text-[#1B3A6B]">تمديد الخدمة وتأجيل الإحالة للتقاعد</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">(اختياري للموظفين الحاصلين على أسباب تمديد الخدمة)</span>
                </div>

                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
                  <div>
                    <Label>رقم أمر تمديد التقاعد</Label>
                    <Input
                      className="mt-1 rounded-xl bg-white"
                      value={form.retirement_extension_order_number || form.retirementExtensionOrderNumber || ''}
                      onChange={e => set('retirement_extension_order_number', e.target.value)}
                      placeholder="مثال: أمر 454/ث"
                    />
                  </div>
                  <div>
                    <Label>تاريخ أمر تمديد التقاعد</Label>
                    <Input
                      type="date"
                      className="mt-1 rounded-xl bg-white"
                      value={form.retirement_extension_order_date || form.retirementExtensionOrderDate || ''}
                      onChange={e => set('retirement_extension_order_date', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>سنوات التمديد المضافة</Label>
                    <Select
                      value={String(form.retirement_extension_years ?? form.retirementExtensionYears ?? 0)}
                      onValueChange={v => set('retirement_extension_years', parseInt(v) || 0)}
                    >
                      <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(y => (
                          <SelectItem key={y} value={String(y)}>{y === 0 ? 'بلا تمديد (0 سنة)' : `${y} سنة`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>أشهر التمديد المضافة</Label>
                    <Select
                      value={String(form.retirement_extension_months ?? form.retirementExtensionMonths ?? 0)}
                      onValueChange={v => set('retirement_extension_months', parseInt(v) || 0)}
                    >
                      <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(m => (
                          <SelectItem key={m} value={String(m)}>{m === 0 ? '0 شهر' : `${m} شهر`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-full">
                    <Label>سبب / ملاحظة تمديد الخدمة</Label>
                    <Input
                      className="mt-1 rounded-xl bg-white"
                      value={form.retirement_extension_note || form.retirementExtensionNote || ''}
                      onChange={e => set('retirement_extension_note', e.target.value)}
                      placeholder="أدخل سبب التأجيل أو ملاحظات أمر التمديد..."
                    />
                  </div>
                </div>
                <div>
                  <Label>موقع العمل للشركة</Label>
                  <Select value={form.work_location || 'غير محدد'} onValueChange={v => set('work_location', v)}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="اختر موقع العمل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="غير محدد">-- لم يحدد بعد --</SelectItem>
                      {workLocations.map(loc => (
                        <SelectItem key={loc.id} value={loc.name}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>طبيعة العمل</Label>
                  <Select value={form.work_nature || 'مكتبي'} onValueChange={v => set('work_nature', v)}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="اختر طبيعة العمل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="مكتبي">مكتبي</SelectItem>
                      <SelectItem value="ميداني">ميداني</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>نوع عمل الموظف</Label>
                  <Select
                    value={form.work_shift_type || 'صباحي'}
                    onValueChange={v => {
                      set('work_shift_type', v);
                      if (v === 'صباحي') {
                        setForm(prev => ({
                          ...prev,
                          work_shift_type: 'صباحي',
                          shift_system_id: null,
                          shift_system_name: '',
                          shift_work_days: 0,
                          shift_rest_days: 0,
                        }));
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="اختر نوع عمل الموظف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="صباحي">صباحي</SelectItem>
                      <SelectItem value="مناوب">مناوب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.work_shift_type === 'مناوب' && (
                  <>
                    {shiftSystems.length === 0 ? (
                      <div className="col-span-full bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-2.5 text-amber-900 text-xs font-bold">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                          <span>
                            لا توجد أنظمة مناوبة مثبتة. يرجى إضافة أنظمة مناوبة أولاً من إعدادات النظام الإدارية والمالية.
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => navigate('/settings')}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 rounded-xl shadow-xs"
                        >
                          إضافة أنظمة مناوبة من الإعدادات
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label>نظام المناوبة المثبت <span className="text-red-500">*</span></Label>
                          <Select
                            value={form.shift_system_id ? String(form.shift_system_id) : ''}
                            onValueChange={v => {
                              const selectedSys = shiftSystems.find(s => String(s.id) === String(v));
                              if (selectedSys) {
                                setForm(prev => ({
                                  ...prev,
                                  shift_system_id: selectedSys.id,
                                  shift_system_name: selectedSys.name,
                                  shift_work_days: selectedSys.work_days ?? selectedSys.workDays ?? 0,
                                  shift_rest_days: selectedSys.rest_days ?? selectedSys.restDays ?? 0,
                                }));
                              }
                            }}
                          >
                            <SelectTrigger className="mt-1 rounded-xl">
                              <SelectValue placeholder="اختر نظام المناوبة" />
                            </SelectTrigger>
                            <SelectContent>
                              {shiftSystems.map(sys => {
                                const wD = sys.work_days ?? sys.workDays ?? 0;
                                const rD = sys.rest_days ?? sys.restDays ?? 0;
                                return (
                                  <SelectItem key={sys.id} value={String(sys.id)}>
                                    {sys.name} ({wD} أيام عمل * {rD} استراحة)
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Summary of Selected Shift System */}
                        {form.shift_system_id && (() => {
                          const sys = shiftSystems.find(s => String(s.id) === String(form.shift_system_id));
                          if (!sys) return null;
                          const wD = sys.work_days ?? sys.workDays ?? form.shift_work_days;
                          const rD = sys.rest_days ?? sys.restDays ?? form.shift_rest_days;
                          const dHours = sys.daily_hours ?? sys.dailyHours ?? 24;
                          const hType = sys.shift_hours_type ?? sys.shiftHoursType ?? '24h';
                          const hTypeLabel = hType === 'rotational' ? 'متناوب' : hType === '24h' ? '24 ساعة' : 'ساعات محددة';

                          return (
                            <div className="col-span-full bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 text-xs space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="font-black text-blue-900 flex items-center gap-1.5">
                                  <Clock size={15} className="text-blue-600" />
                                  مواصفات نظام المناوبة: {sys.name}
                                </span>
                                <span className="bg-blue-100 text-blue-800 text-[11px] font-black px-2.5 py-0.5 rounded-full border border-blue-200">
                                  {wD} أيام دوام / {rD} أيام استراحة
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                  <span className="text-slate-400 block font-bold">ساعات وطبيعة العمل اليومية</span>
                                  <span className="font-bold text-slate-800">{dHours} ساعة/يوم ({hTypeLabel})</span>
                                </div>

                                <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                                  <span className="text-slate-400 block font-bold">الجدول والتناوب</span>
                                  <span className="font-bold text-slate-800">{wD}d عمل + {rD}d راحة</span>
                                </div>
                              </div>

                              {sys.description && (
                                <p className="text-slate-600 text-[11px] bg-white p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                                  {sys.description}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}

                {/* 3. التسكين والدرجة الوظيفية */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">التسكين والدرجة الوظيفية (سلم الرواتب)</h3>
                </div>

                <div>
                  <Label>الدرجة الوظيفية *</Label>
                  <Select value={String(form.grade)} onValueChange={v => set('grade', parseInt(v))}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRADES.map(g => (
                        <SelectItem key={g} value={String(g)}>
                          {g >= 11 ? getGradeLabel(g) : `الدرجة ${getGradeLabel(g)}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>المرحلة *</Label>
                  <Select value={String(form.step)} onValueChange={v => set('step', parseInt(v))}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STEPS.map(s => <SelectItem key={s} value={String(s)}>المرحلة {s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>تاريخ الدرجة الحالية</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.grade_date || ''} onChange={e => set('grade_date', e.target.value)} />
                </div>

                {/* 4. الأرقام الثبوتية الإدارية */}
                <div className="col-span-full pt-2 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#1B3A6B] rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">الأرقام التعريفية والسجلات الإدارية</h3>
                </div>

                <div>
                  <Label>رقم اضبارة الموظف (رقم فريد لا يكرر)</Label>
                  <Input className="mt-1 rounded-xl" value={form.service_record_number || ''} onChange={e => set('service_record_number', e.target.value)} placeholder="مثال: إضبارة-4512" />
                </div>
                <div>
                  <Label>رقم هوية الموظف</Label>
                  <Input className="mt-1 rounded-xl" value={form.employee_id_number || ''} onChange={e => set('employee_id_number', e.target.value)} placeholder="مثال: 12044" />
                </div>
                <div>
                  <Label>رقم التصريح الأمني</Label>
                  <Input className="mt-1 rounded-xl" value={form.security_clearance_number || ''} onChange={e => set('security_clearance_number', e.target.value)} placeholder="رقم التصريح الأمني" />
                </div>
                <div>
                  <Label>تاريخ التصريح الأمني</Label>
                  <Input type="date" className="mt-1 rounded-xl" value={form.security_clearance_date || ''} onChange={e => set('security_clearance_date', e.target.value)} />
                </div>
                <div>
                  <Label>الدور في النظام</Label>
                  <Select value={form.role} onValueChange={v => set('role', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">موظف</SelectItem>
                      <SelectItem value="manager">مدير</SelectItem>
                      <SelectItem value="hr_admin">مسؤول شؤون موظفين</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 5. أرصدة الإجازات الافتتاحية */}
                <div className="col-span-full pt-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-teal-500 rounded-full" />
                  <h3 className="font-bold text-sm text-[#1B3A6B]">أرصدة الإجازات الافتتاحية (عند المباشرة الأولى)</h3>
                </div>

                <div>
                  <Label>رصيد الإجازات الاعتيادية الابتدائي (يوم)</Label>
                  <Input type="number" min={0} className="mt-1 rounded-xl" value={form.initial_regular_leave_balance || 0} onChange={e => set('initial_regular_leave_balance', parseInt(e.target.value) || 0)} />
                  <span className="text-[10px] text-slate-400 mt-1 block">رصيد الموظف التراكمي المدور عند المباشرة</span>
                </div>
                <div>
                  <Label>رصيد الإجازات المرضية الابتدائي (يوم)</Label>
                  <Input type="number" min={0} className="mt-1 rounded-xl" value={form.initial_sick_leave_balance || 0} onChange={e => set('initial_sick_leave_balance', parseInt(e.target.value) || 0)} />
                  <span className="text-[10px] text-slate-400 mt-1 block">رصيد الموظف المرضي الافتتاحي</span>
                </div>

                <div className="lg:col-span-3 pt-2">
                  <Label>ملاحظات إدارية</Label>
                  <textarea className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B3A6B]/30" rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Education Tab */}
          <TabsContent value="education">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h2 className="font-bold text-[#1B3A6B] mb-5 pb-3 border-b border-slate-100">التحصيل الدراسي</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                <div>
                  <Label>الشهادة العلمية</Label>
                  <Select value={form.education_level} onValueChange={v => set('education_level', v)}>
                    <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {educationDegrees.length > 0 
                        ? educationDegrees.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)
                        : ['دكتوراه','ماجستير','بكالوريوس','دبلوم عالي','دبلوم','إعدادية','متوسطة','ابتدائية'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>الاختصاص</Label>
                  <Input className="mt-1 rounded-xl" value={form.specialization || ''} onChange={e => set('specialization', e.target.value)} />
                </div>
                <div>
                  <Label>الجامعة / المعهد</Label>
                  <Input className="mt-1 rounded-xl" value={form.university || ''} onChange={e => set('university', e.target.value)} />
                </div>
                <div>
                  <Label>سنة التخرج</Label>
                  <Input type="number" className="mt-1 rounded-xl" value={form.graduation_year || ''} onChange={e => set('graduation_year', parseInt(e.target.value) || '')} placeholder="مثال: 2015" />
                </div>
                <div>
                  <Label>رقم أمر احتساب الشهادة</Label>
                  <Input className="mt-1 rounded-xl" value={form.education_order || ''} onChange={e => set('education_order', e.target.value)} />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-5">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate('/employees')}>إلغاء</Button>
          <Button type="submit" disabled={saving} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
            <Save size={16} /> {saving ? 'جاري الحفظ...' : (isEdit ? 'حفظ التعديلات' : 'إضافة الموظف')}
          </Button>
        </div>
      </form>

      {/* Organizational Unit Picker Modal */}
      {showOrgPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white rounded-2xl w-full max-w-2xl h-[550px] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200" dir="rtl">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-6 bg-[#1B3A6B] rounded-full" />
                <h3 className="font-bold text-[#1B3A6B]">تحديد جهة العمل من الهيكل التنظيمي</h3>
              </div>
              <Button type="button" size="icon" variant="ghost" onClick={() => setShowOrgPicker(false)} className="rounded-full h-8 w-8 hover:bg-slate-200 text-slate-500">
                <X size={16} />
              </Button>
            </div>

            {/* Search Box */}
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={16} className="absolute right-3 top-3 text-slate-400" />
                <Input className="pr-9 rounded-xl border-slate-200 focus-visible:ring-[#1B3A6B]/30" placeholder="ابحث عن دائرة، قسم، أو شعبة..." value={orgSearch} onChange={e => setOrgSearch(e.target.value)} />
              </div>
            </div>

            {/* Tree or Search List */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/20">
              {orgLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
                  <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
                  <p className="text-sm font-semibold">جاري تحميل الهيكل التنظيمي...</p>
                </div>
              ) : orgSearch ? (
                /* Flat search results with full paths */
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 mb-2">نتائج البحث ({orgUnits.filter(u => u.name.toLowerCase().includes(orgSearch.toLowerCase())).length}):</p>
                  {orgUnits.filter(u => u.name.toLowerCase().includes(orgSearch.toLowerCase())).map(unit => {
                    const chain = getHierarchyChain(unit, orgUnits);
                    return (
                      <div key={unit.id} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between hover:shadow-sm hover:border-slate-200 transition-all group">
                        <div className="space-y-1 min-w-0 flex-1 pl-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {unit.type}
                            </span>
                            <span className="font-semibold text-slate-800 text-sm">{unit.name}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-mono" dir="ltr" style={{ textAlign: 'right' }}>{chain}</p>
                        </div>
                        <Button type="button" size="sm" onClick={() => handleSelectUnit(unit)} className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-lg px-3 text-xs">
                          تحديد
                        </Button>
                      </div>
                    );
                  })}
                  {orgUnits.filter(u => u.name.toLowerCase().includes(orgSearch.toLowerCase())).length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <p className="text-sm">لم يتم العثور على أي جهة عمل تطابق "{orgSearch}"</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Recursive Hierarchical Tree */
                <div className="space-y-2">
                  {orgUnits.length > 0 ? (
                    (() => {
                      const topUnits = orgUnits.filter(u => !u.parentId || !orgUnits.some(parent => parent.id === u.parentId));
                      return (
                        <div className="pr-2">
                          <p className="text-xs font-semibold text-slate-400 mb-3">اختر جهة العمل من شجرة الهيكل التنظيمي أدناه:</p>
                          {(() => {
                            const renderTreeNodes = (nodes) => {
                              return (
                                <ul className="space-y-1 pr-3 border-r border-slate-100/80 mt-1">
                                  {nodes.map(node => {
                                    const children = orgUnits.filter(u => u.parentId === node.id);
                                    const hasChildren = children.length > 0;
                                    const isExpanded = expandedPickerIds.has(node.id);

                                    return (
                                      <li key={node.id} className="space-y-1">
                                        <div className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white hover:shadow-sm transition-all group">
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {hasChildren ? (
                                              <button type="button" onClick={() => toggleExpandPicker(node.id)} className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors">
                                                {isExpanded ? <ChevronDown size={14} className="stroke-[2.5]" /> : <ChevronRight size={14} className="stroke-[2.5]" />}
                                              </button>
                                            ) : (
                                              <span className="w-6" />
                                            )}
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                              node.type === 'مدير عام' ? 'bg-red-50 text-red-700 border border-red-100' :
                                              node.type === 'قسم مركزي' || node.type === 'قسم' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                              node.type === 'شعبة' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                              'bg-slate-50 text-slate-700 border border-slate-200'
                                            }`}>
                                              {node.type}
                                            </span>
                                            <span className="text-sm font-semibold text-slate-700">
                                              {node.name}
                                            </span>
                                          </div>
                                          <Button type="button" size="sm" onClick={() => handleSelectUnit(node)} className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs h-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                            تحديد جهة العمل
                                          </Button>
                                        </div>
                                        {hasChildren && isExpanded && (
                                          <div className="mr-2">
                                            {renderTreeNodes(children)}
                                          </div>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              );
                            };
                            return renderTreeNodes(topUnits);
                          })()}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center py-12 text-slate-400 bg-white border border-dashed rounded-xl">
                      <p className="text-sm">الهيكل التنظيمي فارغ حالياً.</p>
                      <p className="text-xs mt-1">يرجى إضافة وحدات تنظيمية في صفحة الهيكل التنظيمي أولاً.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/50">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setShowOrgPicker(false)}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal for evaluation form classification switch upon responsibility change */}
      {formSwitchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-2.5 text-indigo-700">
              <AlertTriangle size={22} className="text-amber-500 shrink-0" />
              <h3 className="font-bold text-slate-900 text-base">تأكيد تحويل استمارة تقييم الأداء</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              {formSwitchModal.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl text-xs font-bold"
                onClick={() => {
                  set('primary_responsibility', formSwitchModal.newResp);
                  setFormSwitchModal(null);
                }}
              >
                تغيير المسؤولية فقط دون تحويل الاستمارة
              </Button>
              <Button
                type="button"
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md"
                onClick={() => {
                  set('primary_responsibility', formSwitchModal.newResp);
                  toast({
                    title: 'تم تحديث المسؤولية وتحويل فئة التقييم',
                    description: `تم تحديث مسؤولية الموظف وسيتم توجيه تقييماته السنوية القادمة تلقائياً وفق الاستمارة المخصصة.`
                  });
                  setFormSwitchModal(null);
                }}
              >
                تأكيد وتحويل فئة الاستمارة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}