import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  Star,
  UserX,
  UserPlus,
  Filter,
  Lock,
  Unlock,
  QrCode,
  Phone,
  PhoneCall,
  Mail
} from 'lucide-react';

// Constants & Types
const TRACK_INTERNAL = 'تدريب داخلي';
const TRACK_EXTERNAL = 'تدريب خارجي وإيفادات';
const TRACK_SUMMER = 'تدريب صيفي';

const CATEGORIES = ['إدارية', 'حاسوب', 'HSE', 'اختصاص'];
const COURSE_TYPES = ['حضوري', 'إلكتروني'];
const COURSE_STATUSES = ['مخطط', 'جاري', 'منتهي', 'ملغى'];

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

const COURSE_TYPES = ['حضوري', 'إلكتروني'];
const LOCATION_TYPES = ['موقعي', 'خارجي', 'دولي'];
const COURSE_STATUSES = ['مخطط', 'جاري', 'منتهي', 'ملغى'];

const TRAINER_STATUSES = ['معتمد', 'قيد الاعتماد', 'محظور', 'مقيد ومحظور', 'قيد التجريب', 'زائر', 'معطل'];
const RESULTS = ['قيد التقييم', 'اجتاز', 'لم يجتز', 'مشارك', 'انسحب'];
const GRADES = ['ممتاز', 'جيد جداً', 'جيد', 'متوسط', 'مقبول', 'ضعيف'];

export default function Training() {
  const { toast } = useToast();
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';

  // Primary States
  const [activeTrack, setActiveTrack] = useState(TRACK_INTERNAL);
  const [activeView, setActiveView] = useState('COURSES'); // 'COURSES' | 'TRAINERS'
  const [selectedYear, setSelectedYear] = useState(2026);
  const [loading, setLoading] = useState(true);

  // Data Collections
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [annualPlans, setAnnualPlans] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Filters (Courses)
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterLocation, setFilterLocation] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

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

  const [showCertModal, setShowCertModal] = useState(false);
  const [certData, setCertData] = useState(null);

  // Forms State
  const [courseForm, setCourseForm] = useState({
    track: TRACK_INTERNAL,
    year: 2026,
    course_name: '',
    category: 'إدارية',
    course_type: 'حضوري',
    location_type: 'موقعي',
    location: '',
    country: 'العراق',
    provider: '',
    trainer_id: '',
    trainer_name: '',
    start_date: '',
    end_date: '',
    days: 1,
    hours: 8,
    order_number: '',
    description: '',
    status: 'مخطط'
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

  const [enrollType, setEnrollType] = useState('INTERNAL'); // INTERNAL or EXTERNAL
  const [enrollForm, setEnrollForm] = useState({
    training_id: '',
    employee_id: '',
    is_external_participant: false,
    external_participant_name: '',
    external_participant_entity: '',
    external_participant_phone: '',
    result: 'قيد التقييم',
    score: '',
    grade: '',
    certificate_number: '',
    notes: ''
  });

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

  // Track & Year filtered courses
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchTrack = (c.track || TRACK_INTERNAL) === activeTrack;
      const matchYear = getCourseYear(c) === parseInt(selectedYear);
      const matchCat = filterCategory === 'ALL' || c.category === filterCategory;
      const matchType = filterType === 'ALL' || c.course_type === filterType;
      const matchLoc = filterLocation === 'ALL' || c.location_type === filterLocation;
      const matchStatus = filterStatus === 'ALL' || c.status === filterStatus;
      const matchQuery = !searchQuery ||
        (c.course_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.provider || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.trainer_name || '').toLowerCase().includes(searchQuery.toLowerCase());

      return matchTrack && matchYear && matchCat && matchType && matchLoc && matchStatus && matchQuery;
    });
  }, [courses, activeTrack, selectedYear, filterCategory, filterType, filterLocation, filterStatus, searchQuery]);

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

  // Metrics (Planned vs Actual)
  const actualCoursesCount = useMemo(() => {
    return courses.filter(c => (c.track || TRACK_INTERNAL) === activeTrack && getCourseYear(c) === parseInt(selectedYear) && c.status !== 'ملغى').length;
  }, [courses, activeTrack, selectedYear]);

  const actualTraineesCount = useMemo(() => {
    const trackCourseIds = new Set(courses.filter(c => (c.track || TRACK_INTERNAL) === activeTrack && getCourseYear(c) === parseInt(selectedYear) && c.status !== 'ملغى').map(c => c.id));
    return enrollments.filter(e => trackCourseIds.has(e.training_id)).length;
  }, [courses, enrollments, activeTrack, selectedYear]);

  const actualPassedTrainees = useMemo(() => {
    const trackCourseIds = new Set(courses.filter(c => (c.track || TRACK_INTERNAL) === activeTrack && getCourseYear(c) === parseInt(selectedYear)).map(c => c.id));
    return enrollments.filter(e => trackCourseIds.has(e.training_id) && (e.result === 'اجتاز' || e.result === 'مشارك')).length;
  }, [courses, enrollments, activeTrack, selectedYear]);

  // Open Course Modal
  const openNewCourseModal = () => {
    setEditingCourse(null);
    setCourseForm({
      track: activeTrack,
      year: selectedYear,
      course_name: '',
      category: 'إدارية',
      course_type: 'حضوري',
      location_type: 'موقعي',
      location: '',
      country: activeTrack === TRACK_EXTERNAL ? 'الإمارات' : 'العراق',
      provider: activeTrack === TRACK_SUMMER ? 'جامعة بغداد' : '',
      trainer_id: '',
      trainer_name: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      days: 5,
      hours: 30,
      order_number: '',
      description: '',
      status: 'مخطط'
    });
    setShowCourseModal(true);
  };

  const openEditCourseModal = (course) => {
    setEditingCourse(course);
    setCourseForm({
      track: course.track || activeTrack,
      year: course.year || selectedYear,
      course_name: course.course_name || '',
      category: course.category || 'إدارية',
      course_type: course.course_type || 'حضوري',
      location_type: course.location_type || 'موقعي',
      location: course.location || '',
      country: course.country || 'العراق',
      provider: course.provider || '',
      trainer_id: course.trainer_id || '',
      trainer_name: course.trainer_name || '',
      start_date: course.start_date || '',
      end_date: course.end_date || '',
      days: course.days || 1,
      hours: course.hours || 0,
      order_number: course.order_number || '',
      description: course.description || '',
      status: course.status || 'مخطط'
    });
    setShowCourseModal(true);
  };

  const handleSaveCourse = async () => {
    if (!courseForm.course_name.trim()) {
      toast({ title: 'يرجى إدخال اسم الدورة / البرنامج', variant: 'destructive' });
      return;
    }

    try {
      // Resolve trainer name if trainer_id is selected
      let tName = courseForm.trainer_name;
      if (courseForm.trainer_id && trainerMap[courseForm.trainer_id]) {
        tName = trainerMap[courseForm.trainer_id].full_name;
      }

      let trainerIdNum = null;
      if (courseForm.trainer_id && String(courseForm.trainer_id).trim() !== '') {
        const parsed = parseInt(courseForm.trainer_id);
        if (!isNaN(parsed)) trainerIdNum = parsed;
      }

      const payload = {
        ...courseForm,
        trainer_id: trainerIdNum,
        trainer_name: tName,
        year: parseInt(courseForm.year) || 2026,
        days: parseInt(courseForm.days) || 1,
        hours: parseInt(courseForm.hours) || 0
      };

      if (editingCourse) {
        await apiClient.entities.Training.update(editingCourse.id, payload);
        toast({ title: 'تم تعديل بيانات الدورة بنجاح' });
      } else {
        await apiClient.entities.Training.create(payload);
        toast({ title: 'تمت إضافة الدورة التدريبية الجديدة بنجاح' });
      }

      setShowCourseModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'حدث خطأ أثناء حفظ الدورة', variant: 'destructive' });
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

  const handleSaveEnrollment = async () => {
    if (enrollType === 'INTERNAL' && !enrollForm.employee_id) {
      toast({ title: 'يرجى اختيار الموظف المطلوب تسجيله', variant: 'destructive' });
      return;
    }
    if (enrollType === 'EXTERNAL' && !enrollForm.external_participant_name.trim()) {
      toast({ title: 'يرجى كتابة اسم المتدرب / الطالب الخارجي', variant: 'destructive' });
      return;
    }

    try {
      const payload = {
        training_id: selectedCourseForEnroll.id,
        employee_id: enrollType === 'INTERNAL' ? parseInt(enrollForm.employee_id) : null,
        is_external_participant: enrollType === 'EXTERNAL',
        external_participant_name: enrollType === 'EXTERNAL' ? enrollForm.external_participant_name : '',
        external_participant_entity: enrollType === 'EXTERNAL' ? enrollForm.external_participant_entity : '',
        external_participant_phone: enrollType === 'EXTERNAL' ? enrollForm.external_participant_phone : '',
        result: enrollForm.result,
        score: enrollForm.score,
        grade: enrollForm.grade,
        certificate_number: enrollForm.certificate_number,
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
        external_participant_phone: '',
        score: '',
        certificate_number: `CERT-${selectedCourseForEnroll.id}-${Math.floor(1000 + Math.random() * 9000)}`
      }));

      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: 'تعذر إتمام التسجيل', variant: 'destructive' });
    }
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
  const openCertificate = (course, enrollment) => {
    let participantName = '';
    let participantEntity = '';

    if (enrollment.is_external_participant) {
      participantName = enrollment.external_participant_name;
      participantEntity = enrollment.external_participant_entity || 'مشارك خارجي';
    } else {
      const emp = empMap[enrollment.employee_id];
      participantName = emp ? (emp.full_name || emp.fullName) : 'الموظف المتدرب';
      participantEntity = emp ? (emp.department || 'الشركة العامة') : 'شركة النفط الوطنية';
    }

    setCertData({
      courseName: course.course_name,
      courseType: course.course_type,
      location: course.location || course.location_type,
      startDate: course.start_date,
      endDate: course.end_date,
      days: course.days || 1,
      hours: course.hours || 0,
      participantName,
      participantEntity,
      result: enrollment.result || 'اجتاز',
      grade: enrollment.grade || enrollment.score || 'ممتاز',
      certNo: enrollment.certificate_number || `CERT-${course.id}-${enrollment.id}`,
      issueDate: new Date().toLocaleDateString('ar-IQ')
    });
    setShowCertModal(true);
  };

  const triggerPrint = () => {
    window.print();
  };

  // Course Enrollments for Modal
  const currentCourseEnrollments = useMemo(() => {
    if (!selectedCourseForEnroll) return [];
    return enrollments.filter(e => e.training_id === selectedCourseForEnroll.id);
  }, [enrollments, selectedCourseForEnroll]);

  return (
    <div className="space-y-6 pb-12" dir="rtl">
      {/* Main Track Selection & KPI Banner */}
      <Tabs value={activeTrack} onValueChange={setActiveTrack} className="w-full">
        {/* Unified Planned vs Actual KPI Banner - Single Seamless Card */}
        <div 
          className="rounded-2xl p-6 text-white shadow-md relative overflow-hidden text-right transition-colors" 
          style={{ background: `linear-gradient(to left, ${primaryColor}, ${primaryColor}e6, ${primaryColor}cc)` }}
          dir="rtl"
        >
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 -skew-x-12 pointer-events-none" />
          
          <div className="flex flex-col gap-6 relative z-10">
            {/* Top Row: Main Title, Logo, Subtitle & Directly Integrated KPI Metrics */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              {/* Main Title, Logo & Subtitle on Top Right */}
              <div className="flex items-start gap-3.5 text-right max-w-lg">
                <div className="p-3 bg-white/10 backdrop-blur-sm rounded-2xl text-amber-300 border border-white/20 shrink-0 mt-0.5 shadow-sm">
                  <GraduationCap size={28} />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                    التدريب والدورات والتطوير الوظيفي
                  </h1>
                  <p className="text-blue-100 text-xs mt-1 leading-relaxed">
                    إدارة خطط التدريب الداخلي والخارجي والتدريب الصيفي ودليل المدربين المعتمدين
                  </p>
                  <div className="flex items-center gap-1.5 text-amber-300 text-xs font-bold mt-2">
                    <Sparkles size={14} className="shrink-0" />
                    <span>معيار خطة {activeTrack} — لعام {selectedYear}</span>
                  </div>
                </div>
              </div>

              {/* Integrated Metrics (Flat layout without nested cards or backdrop filters) */}
              <div className="flex flex-wrap sm:flex-nowrap items-center justify-start lg:justify-end gap-6 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-white/15 text-right">
                {/* Courses Metric */}
                <div className="pt-2 sm:pt-0 sm:pr-4 min-w-[130px]">
                  <div className="text-blue-200 text-xs font-bold mb-1">الدورات التدريبية</div>
                  <div className="flex items-baseline gap-1.5 justify-start dir-rtl">
                    <span className="text-2xl font-black text-white">{actualCoursesCount}</span>
                    <span className="text-xs text-blue-200">/ {currentPlan.planned_courses_count || 0} مخطط</span>
                  </div>
                  <div className="w-32 bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, currentPlan.planned_courses_count ? (actualCoursesCount / currentPlan.planned_courses_count) * 100 : 0)}%`
                      }}
                    />
                  </div>
                </div>

                {/* Trainees Metric */}
                <div className="pt-3 sm:pt-0 sm:pr-6 min-w-[130px]">
                  <div className="text-blue-200 text-xs font-bold mb-1">المتدربين المسجلين</div>
                  <div className="flex items-baseline gap-1.5 justify-start dir-rtl">
                    <span className="text-2xl font-black text-white">{actualTraineesCount}</span>
                    <span className="text-xs text-blue-200">/ {currentPlan.planned_trainees_count || 0} مخطط</span>
                  </div>
                  <div className="w-32 bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, currentPlan.planned_trainees_count ? (actualTraineesCount / currentPlan.planned_trainees_count) * 100 : 0)}%`
                      }}
                    />
                  </div>
                </div>

                {/* Execution Rate */}
                <div className="pt-3 sm:pt-0 sm:pr-6 min-w-[120px]">
                  <div className="text-blue-200 text-xs font-bold mb-1">اجتازوا بنجاح</div>
                  <div className="flex items-baseline gap-1.5 justify-start dir-rtl">
                    <span className="text-2xl font-black text-emerald-300">{actualPassedTrainees}</span>
                    <span className="text-xs text-blue-200">متدرب</span>
                  </div>
                  <div className="text-[10px] text-blue-200 mt-2 font-medium">
                    إنجاز الخطة: {currentPlan.planned_courses_count ? Math.round((actualCoursesCount / currentPlan.planned_courses_count) * 100) : 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row inside KPI Card: Integrated Track Selection, Buttons & Year Control */}
            <div className="pt-4 border-t border-white/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              {/* Right Side: Training Track Selector */}
              <div className="flex flex-col gap-2.5 w-full md:w-auto">
                {/* 1. Track Types Tabs */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <span className="text-xs font-bold text-blue-200 shrink-0">أنواع التدريب:</span>
                  <TabsList className="bg-white/10 p-1 rounded-xl h-auto flex flex-wrap sm:flex-nowrap gap-1">
                    <TabsTrigger
                      value={TRACK_INTERNAL}
                      className="rounded-lg px-3.5 py-1.5 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center justify-center gap-1.5"
                    >
                      <Building2 size={14} />
                      التدريب الداخلي
                    </TabsTrigger>
                    <TabsTrigger
                      value={TRACK_EXTERNAL}
                      className="rounded-lg px-3.5 py-1.5 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center justify-center gap-1.5"
                    >
                      <Globe size={14} />
                      التدريب الخارجي والإيفادات
                    </TabsTrigger>
                    <TabsTrigger
                      value={TRACK_SUMMER}
                      className="rounded-lg px-3.5 py-1.5 font-bold text-xs text-blue-100 data-[state=active]:bg-white data-[state=active]:text-[#1B3A6B] transition-all flex items-center justify-center gap-1.5"
                    >
                      <School size={14} />
                      التدريب الصيفي (الطلاب)
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>

              {/* Left Side: Training Year Selector */}
              <div className="flex items-center gap-2 text-white shrink-0 self-start md:self-auto">
                <Calendar size={18} className="text-amber-300 shrink-0" />
                <span className="text-xs font-bold text-blue-100 hidden sm:inline">السنة التدريبية:</span>

                <div className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded-lg">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedYear(prev => prev - 1)}
                    className="h-7 w-7 rounded-md text-white hover:bg-white/20 hover:text-white transition-colors"
                    title="السنة السابقة"
                  >
                    <ChevronRight size={16} />
                  </Button>

                  <div className="px-2 font-black text-lg text-white text-center min-w-[50px] select-none">
                    {selectedYear}
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setSelectedYear(prev => prev + 1)}
                    className="h-7 w-7 rounded-md text-white hover:bg-white/20 hover:text-white transition-colors"
                    title="السنة التالية"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Bar & Primary Section View Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-sm mt-6" dir="rtl">
          <div className="flex flex-wrap items-center gap-2">
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
              البرامج والدورات التدريبية ({filteredCourses.length})
            </Button>

            <Button
              type="button"
              variant={activeView === 'TRAINERS' ? 'default' : 'ghost'}
              onClick={() => setActiveView('TRAINERS')}
              className={`rounded-xl font-bold text-xs gap-2 px-4 py-2 h-9 transition-all cursor-pointer ${
                activeView === 'TRAINERS'
                  ? 'bg-[#1B3A6B] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <UserCheck size={16} />
              دليل وسجلات المدربين ({trainers.length})
              {trainers.filter(t => t.status === 'مقيد ومحظور').length > 0 && (
                <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {trainers.filter(t => t.status === 'مقيد ومحظور').length} مقيد
                </span>
              )}
            </Button>
          </div>

          {activeView === 'TRAINERS' && (
            <Button
              type="button"
              onClick={() => {
                setEditingTrainer(null);
                setTrainerForm({
                  full_name: '', specialization: '', trainer_type: 'داخلي', organization: '', phone: '', email: '', status: 'معتمد', rating: 'ممتاز', notes: ''
                });
                setShowTrainerFormPanel(prev => !prev);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 font-bold text-xs h-9 px-4 cursor-pointer transition-all shadow-xs"
            >
              <Plus size={16} />
              {showTrainerFormPanel ? 'إغلاق نموذج الإضافة' : 'إضافة مدرب جديد للدليل'}
            </Button>
          )}
        </div>

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
                            <span className="text-slate-400">الدورات المنفذة بالنظام:</span>
                            <span className="font-bold text-[#1B3A6B] bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                              {assignedCoursesCount} دورة
                            </span>
                          </div>

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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100 text-center">
              <div className="w-10 h-10 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin mb-3" />
              <p className="text-slate-500 font-bold text-sm">جاري تحميل برامج التدريب...</p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-sm" dir="rtl">
              <GraduationCap size={48} className="text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-[#1B3A6B] text-lg">لا توجد دورات مسجلة لـ {activeTrack}</h3>
              <p className="text-slate-400 text-sm mt-1 max-w-md mx-auto">
                يمكنك إضافة دورة أو برنامج جديد للخطة التدريبية المعتمدة لعام {selectedYear} بالضغط على زر إضافة دورة.
              </p>
              <Button onClick={openNewCourseModal} className="mt-4 bg-[#1B3A6B] text-white rounded-xl gap-2 font-bold mx-auto">
                <Plus size={16} /> إضافة دورة تدريبية
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-right" dir="rtl">
              {filteredCourses.map(course => {
                const courseEnrollments = enrollments.filter(e => e.training_id === course.id);
                const passedCount = courseEnrollments.filter(e => e.result === 'اجتاز' || e.result === 'مشارك').length;
                const yr = getCourseYear(course);

                return (
                  <div
                    key={course.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group text-right relative overflow-hidden"
                    dir="rtl"
                  >
                    <div>
                      {/* Top Header Bar (RTL Aligned) */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-1.5 justify-start">
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                            course.status === 'مخطط' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            course.status === 'جاري' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse' :
                            course.status === 'منتهي' ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {course.status}
                          </span>

                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
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
                          <span>المكان: <strong className="text-slate-800">{course.location || (course.location_type === 'موقعي' ? 'مواقع الشركة' : 'موقع خارجي')}</strong></span>
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
                      </div>
                    </div>

                    {/* Bottom Actions & Trainee Count (RTL Aligned) */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-right" dir="rtl">
                      <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold justify-start">
                        <Users size={15} className="text-blue-600 shrink-0" />
                        <span>{courseEnrollments.length} مشارك</span>
                        {passedCount > 0 && (
                          <span className="text-emerald-600 text-[11px] font-bold">({passedCount} اجتازوا)</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm"
                          onClick={() => openEnrollModal(course)}
                          className="bg-blue-50 hover:bg-blue-100 text-[#1B3A6B] rounded-lg text-xs font-bold h-8 px-2.5 gap-1"
                        >
                          <Users size={13} />
                          المتدربين والنتائج
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditCourseModal(course)}
                          className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg"
                          title="تعديل"
                        >
                          <Edit size={14} />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDeleteCourse(course.id)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="حذف"
                        >
                          <Trash2 size={14} />
                        </Button>
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

      {/* 1. Modal: Add / Edit Course */}
      {showCourseModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#1B3A6B]/10 rounded-xl text-[#1B3A6B]">
                  <GraduationCap size={22} />
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-[#1B3A6B]">
                    {editingCourse ? 'تعديل بيانات الدورة التدريبية' : 'إضافة دورة / برنامج تدريبي جديد'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    الخطة السنوية لـ {courseForm.track} — لعام {courseForm.year}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowCourseModal(false)} className="rounded-full">
                <X size={18} />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-bold text-slate-700">
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label className="text-xs font-bold">عنوان الدورة / اسم البرنامج التدريبي *</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    placeholder="مثال: دورة السلامة والصحة المهنية المتقدمة"
                    value={courseForm.course_name}
                    onChange={e => setCourseForm(p => ({ ...p, course_name: e.target.value }))}
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold">السنة التدريبية *</Label>
                  <Input
                    type="number"
                    min={1990}
                    max={2100}
                    className="mt-1 rounded-xl font-bold border-slate-200"
                    value={courseForm.year}
                    onChange={e => setCourseForm(p => ({ ...p, year: parseInt(e.target.value) || selectedYear }))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold">تصنيف الدورة *</Label>
                <Select value={courseForm.category} onValueChange={v => setCourseForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">نوع الانعقاد *</Label>
                <Select value={courseForm.course_type} onValueChange={v => setCourseForm(p => ({ ...p, course_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COURSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">مكان الانعقاد *</Label>
                <Select value={courseForm.location_type} onValueChange={v => setCourseForm(p => ({ ...p, location_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="موقعي">موقعي (داخل مواقع الشركة)</SelectItem>
                    <SelectItem value="خارجي">خارجي (معهد نفطي / وزارة / مركز محلي)</SelectItem>
                    <SelectItem value="دولي">دولي (خارج العراق)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">تفاصيل القاعة / المكان</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder="مثال: القاعة المركزية / معهد النفط ببغداد"
                  value={courseForm.location}
                  onChange={e => setCourseForm(p => ({ ...p, location: e.target.value }))}
                />
              </div>

              {activeTrack === TRACK_EXTERNAL && (
                <div>
                  <Label className="text-xs font-bold">الدولة المضيفة</Label>
                  <Input
                    className="mt-1 rounded-xl"
                    placeholder="مثال: الإمارات / الأردن"
                    value={courseForm.country}
                    onChange={e => setCourseForm(p => ({ ...p, country: e.target.value }))}
                  />
                </div>
              )}

              <div>
                <Label className="text-xs font-bold">الجهة المنفذة / الجامعة</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder={activeTrack === TRACK_SUMMER ? 'مثال: جامعة بغداد - كلية الهندسة' : 'اسم المعهد أو الشركة المُنظمة'}
                  value={courseForm.provider}
                  onChange={e => setCourseForm(p => ({ ...p, provider: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">تعيين المدرب (من الدليل)</Label>
                <Select
                  value={courseForm.trainer_id ? courseForm.trainer_id.toString() : 'CUSTOM'}
                  onValueChange={v => {
                    if (v === 'CUSTOM') {
                      setCourseForm(p => ({ ...p, trainer_id: '', trainer_name: '' }));
                    } else {
                      const tr = trainerMap[v];
                      setCourseForm(p => ({ ...p, trainer_id: v, trainer_name: tr ? tr.full_name : '' }));
                    }
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر مدرباً..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CUSTOM">إدخال اسم المدرب يدوياً</SelectItem>
                    {trainers.map(t => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.full_name} ({t.specialization || 'عام'}) — {t.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-bold">اسم المدرب المباشر</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder="اسم المدرب المحاضر"
                  value={courseForm.trainer_name}
                  onChange={e => setCourseForm(p => ({ ...p, trainer_name: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">تاريخ البدء *</Label>
                <Input
                  type="date"
                  className="mt-1 rounded-xl"
                  value={courseForm.start_date}
                  onChange={e => setCourseForm(p => ({ ...p, start_date: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">تاريخ الانتهاء *</Label>
                <Input
                  type="date"
                  className="mt-1 rounded-xl"
                  value={courseForm.end_date}
                  onChange={e => setCourseForm(p => ({ ...p, end_date: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">عدد الأيام التدريبية</Label>
                <Input
                  type="number"
                  min={1}
                  className="mt-1 rounded-xl"
                  value={courseForm.days}
                  onChange={e => setCourseForm(p => ({ ...p, days: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">عدد الساعات التدريبية</Label>
                <Input
                  type="number"
                  min={0}
                  className="mt-1 rounded-xl"
                  value={courseForm.hours}
                  onChange={e => setCourseForm(p => ({ ...p, hours: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">رقم الأمر الإداري / الإيفاد</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder="مثال: 4521/ت/2026"
                  value={courseForm.order_number}
                  onChange={e => setCourseForm(p => ({ ...p, order_number: e.target.value }))}
                />
              </div>

              <div>
                <Label className="text-xs font-bold">حالة الدورة التدريبية</Label>
                <Select value={courseForm.status} onValueChange={v => setCourseForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COURSE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs font-bold">الوصف والأهداف المفصلة</Label>
                <Input
                  className="mt-1 rounded-xl"
                  placeholder="أهداف البرامج التدريبية والفئة المشمولة..."
                  value={courseForm.description}
                  onChange={e => setCourseForm(p => ({ ...p, description: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
              <Button variant="outline" className="rounded-xl" onClick={() => setShowCourseModal(false)}>
                إلغاء
              </Button>
              <Button className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl font-bold px-6" onClick={handleSaveCourse}>
                {editingCourse ? 'حفظ التعديلات' : 'إضافة الدورة للخطة'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

            {/* Enroll New Trainee Box */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-[#1B3A6B] text-xs flex items-center gap-1.5">
                  <UserCheck size={16} className="text-blue-600" />
                  تسجيل متدرب / مشارك جديد في هذه الدورة
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
                    مشارك / طالب خارجي
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                {enrollType === 'INTERNAL' ? (
                  <div className="md:col-span-2">
                    <Label className="text-[11px] font-bold">اختر الموظف من الكادر الداخلي *</Label>
                    <Select value={enrollForm.employee_id.toString()} onValueChange={v => setEnrollForm(p => ({ ...p, employee_id: v }))}>
                      <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue placeholder="بحث عن موظف..." /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {employees.map(e => (
                          <SelectItem key={e.id} value={e.id.toString()}>
                            {e.full_name || e.fullName} — ({e.department || 'الشركة'}) — {e.job_title || e.jobTitle || 'موظف'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <>
                    <div>
                      <Label className="text-[11px] font-bold">اسم المشارك / الطالب الخارجي *</Label>
                      <Input
                        className="mt-1 rounded-xl bg-white"
                        placeholder="الاسم الكامل"
                        value={enrollForm.external_participant_name}
                        onChange={e => setEnrollForm(p => ({ ...p, external_participant_name: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-bold">الجهة / الجامعة المستنِد إليها</Label>
                      <Input
                        className="mt-1 rounded-xl bg-white"
                        placeholder="الوزارة / الجامعة / الشركة"
                        value={enrollForm.external_participant_entity}
                        onChange={e => setEnrollForm(p => ({ ...p, external_participant_entity: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label className="text-[11px] font-bold">نتيجة المشاركة الحالية</Label>
                  <Select value={enrollForm.result} onValueChange={v => setEnrollForm(p => ({ ...p, result: v }))}>
                    <SelectTrigger className="mt-1 rounded-xl bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[11px] font-bold">الدرجة المئوية / التقدير</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="مثال: 88% أو ممتاز"
                    value={enrollForm.score}
                    onChange={e => setEnrollForm(p => ({ ...p, score: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-3">
                  <Label className="text-[11px] font-bold">رقم الشهادة / ملاحظات التسجيل</Label>
                  <Input
                    className="mt-1 rounded-xl bg-white"
                    placeholder="رقم شهادة التخرج والملاحظات..."
                    value={enrollForm.certificate_number}
                    onChange={e => setEnrollForm(p => ({ ...p, certificate_number: e.target.value }))}
                  />
                </div>

                <div className="flex items-end">
                  <Button className="w-full bg-[#1B3A6B] text-white rounded-xl font-bold h-9 text-xs" onClick={handleSaveEnrollment}>
                    تسجيل المشارك
                  </Button>
                </div>
              </div>
            </div>

            {/* Enrolled Trainees List */}
            <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                  <tr>
                    <th className="p-3">المشارك</th>
                    <th className="p-3">الجهة / القسم</th>
                    <th className="p-3">تاريخ التسجيل</th>
                    <th className="p-3">النتيجة</th>
                    <th className="p-3">الدرجة / التقدير</th>
                    <th className="p-3">رقم الشهادة</th>
                    <th className="p-3 text-center">الشهادات والإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {currentCourseEnrollments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">لا يوجد متدربين مسجلين في هذه الدورة حتى الآن</td>
                    </tr>
                  ) : currentCourseEnrollments.map(en => {
                    let name = '';
                    let entity = '';

                    if (en.is_external_participant) {
                      name = en.external_participant_name || 'مشارك خارجي';
                      entity = en.external_participant_entity || 'جهة خارجية';
                    } else {
                      const emp = empMap[en.employee_id];
                      name = emp ? (emp.full_name || emp.fullName) : `موظف #${en.employee_id}`;
                      entity = emp ? (emp.department || 'الشركة') : 'داخلي';
                    }

                    return (
                      <tr key={en.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-[#1B3A6B]">
                          {name}
                          {en.is_external_participant && <span className="mr-1.5 text-[10px] text-purple-600 font-normal">(خارجي/طالب)</span>}
                        </td>
                        <td className="p-3">{entity}</td>
                        <td className="p-3 text-slate-500">{en.enrollment_date || en.createdAt?.split('T')[0]}</td>
                        <td className="p-3">
                          <Select
                            value={en.result || 'قيد التقييم'}
                            onValueChange={v => handleUpdateEnrollmentResult(en.id, v, en.score, en.grade)}
                          >
                            <SelectTrigger className="h-7 w-28 rounded-lg text-[11px] font-bold border-slate-200">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RESULTS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-slate-800">{en.score || en.grade || '—'}</span>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-500">{en.certificate_number || '—'}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openCertificate(selectedCourseForEnroll, en)}
                              className="h-7 rounded-lg text-[11px] border-emerald-600 text-emerald-700 hover:bg-emerald-50 gap-1 font-bold"
                            >
                              <Printer size={12} />
                              شهادة المشاركة
                            </Button>

                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteEnrollment(en.id)}
                              className="h-7 w-7 text-slate-400 hover:text-red-500"
                              title="إلغاء التسجيل"
                            >
                              <X size={14} />
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

      {/* 5. Printable Participation Certificate Modal (تهيئة شهادة المشاركة للطباعة) */}
      {showCertModal && certData && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-8 shadow-2xl relative border-4 border-amber-600/30">
            {/* Top Toolbar (Hidden on Print) */}
            <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-200 print:hidden">
              <div className="flex items-center gap-2">
                <Award size={24} className="text-amber-600" />
                <h3 className="font-bold text-[#1B3A6B] text-lg">معاينة شهادة المشاركة الجاهزة للطباعة</h3>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={triggerPrint} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold gap-2">
                  <Printer size={18} />
                  طباعة الشهادة الآن
                </Button>
                <Button variant="ghost" onClick={() => setShowCertModal(false)} className="rounded-full">
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Printable Certificate Frame */}
            <div className="p-8 border-8 border-double border-[#1B3A6B] rounded-2xl bg-gradient-to-b from-amber-50/30 via-white to-amber-50/30 text-center relative overflow-hidden print:p-6 print:border-4">
              {/* Decorative Corner Ornaments */}
              <div className="absolute top-2 right-2 text-[#1B3A6B] opacity-20 font-serif text-3xl font-black">❖</div>
              <div className="absolute top-2 left-2 text-[#1B3A6B] opacity-20 font-serif text-3xl font-black">❖</div>
              <div className="absolute bottom-2 right-2 text-[#1B3A6B] opacity-20 font-serif text-3xl font-black">❖</div>
              <div className="absolute bottom-2 left-2 text-[#1B3A6B] opacity-20 font-serif text-3xl font-black">❖</div>

              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-amber-600/40 pb-4 mb-6">
                <div className="text-right text-xs font-bold text-slate-700 space-y-0.5">
                  <div>جمهورية العراق</div>
                  <div>وزارة النفط</div>
                  <div>شركة النفط الوطنية / العامة</div>
                  <div>قسم التدريب والتطوير الوظيفي</div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-[#1B3A6B] rounded-full flex items-center justify-center text-amber-400 shadow-inner mb-1">
                    <GraduationCap size={36} />
                  </div>
                  <div className="text-[10px] font-black text-[#1B3A6B] tracking-widest uppercase">TRAINING CERTIFICATE</div>
                </div>

                <div className="text-left text-xs font-bold text-slate-700 space-y-0.5 font-mono">
                  <div>الرقم: {certData.certNo}</div>
                  <div>التاريخ: {certData.issueDate}</div>
                </div>
              </div>

              {/* Certificate Main Title */}
              <div className="my-6">
                <h2 className="text-3xl font-black text-[#1B3A6B] tracking-wide font-serif">شهادة مشاركة وتطوير وظيفي</h2>
                <div className="w-24 h-1 bg-amber-500 mx-auto mt-2 rounded-full" />
              </div>

              {/* Certificate Body Text */}
              <div className="space-y-4 my-8 text-slate-800 leading-relaxed text-sm md:text-base font-medium max-w-xl mx-auto">
                <p>تأكيداً على كفاءة الأداء والتطوير المستمر للمهارات، تُشهد هذه الإدارة بأن السيد / السيدة:</p>

                <div className="text-2xl font-black text-[#1B3A6B] py-2 border-b-2 border-dashed border-slate-300">
                  {certData.participantName}
                </div>

                <div className="text-xs text-slate-600 font-bold">
                  من ({certData.participantEntity})
                </div>

                <p className="mt-4">
                  قد شارك/ت بنجاح واجتاز/ت بنوع <strong className="text-[#1B3A6B]">({certData.courseType})</strong> البرامج التدريبي الموسوم:
                </p>

                <div className="text-xl font-extrabold text-amber-900 bg-amber-100/60 p-3 rounded-xl border border-amber-200 my-2">
                  "{certData.courseName}"
                </div>

                <p className="text-xs text-slate-600">
                  المنعقدة في ({certData.location}) للفترة من <strong className="text-slate-900">{certData.startDate}</strong> إلى <strong className="text-slate-900">{certData.endDate}</strong> ({certData.days} أيام / {certData.hours} ساعة تدريبية) وبنتيجة: <strong className="text-emerald-700 font-bold">({certData.result})</strong> وتقدير: <strong className="text-emerald-700 font-bold">({certData.grade})</strong>.
                </p>
              </div>

              {/* Signatures Row */}
              <div className="grid grid-cols-3 gap-4 pt-10 mt-8 border-t border-slate-200 text-xs font-bold text-slate-800">
                <div>
                  <div className="mb-8 text-slate-500">مدرب الدورة</div>
                  <div className="border-t border-slate-400 w-28 mx-auto pt-1">التوقيع والاسم</div>
                </div>

                <div>
                  <div className="mb-8 text-slate-500">مسؤول شعبة التدريب</div>
                  <div className="border-t border-slate-400 w-28 mx-auto pt-1">التوقيع والاسم</div>
                </div>

                <div>
                  <div className="mb-8 text-slate-500">مدير قسم التدريب والتطوير</div>
                  <div className="border-t border-slate-400 w-28 mx-auto pt-1">الختم والتوقيع الرسمي</div>
                </div>
              </div>
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
      {/* Custom Global Confirmation Dialog (Replaces native browser alert/confirm for iframe compatibility) */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => !open && setConfirmDialog(p => ({ ...p, isOpen: false }))}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-200" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-lg font-bold text-[#1B3A6B] flex items-center gap-2">
              {confirmDialog.variant === 'destructive' ? (
                <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                  <Trash2 size={20} />
                </div>
              ) : (
                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
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
