import { useState, useEffect, Fragment } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  RefreshCw, 
  Coins, 
  GripVertical,
  Save,
  Users,
  AlertCircle,
  Filter,
  UserX,
  Search,
  Sliders,
  Play,
  Pause,
  CalendarDays
} from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

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

const STANDARD_DEPARTMENTS = [
  "الدائرة الإدارية والمالية",
  "قسم الموارد البشرية",
  "قسم الحسابات والتدقيق",
  "قسم تقنية المعلومات",
  "القسم القانوني",
  "قسم الرقابة الداخلية",
  "قسم العلاقات والإعلام",
  "قسم المشاريع والهندسة",
  "مكتب المدير العام",
  "قسم التخطيط والمتابعة"
];


export default function FixedCustomAllowancesSettings() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState('custom'); // 'custom' or 'temporary'

  // Temporary Allowances Form State
  const [tempName, setTempName] = useState('');
  const [tempCalcType, setTempCalcType] = useState('flat');
  const [tempValue, setTempValue] = useState('');
  const [tempTimingType, setTempTimingType] = useState('single'); // 'single' or 'range'
  const [tempPaymentYear, setTempPaymentYear] = useState(new Date().getFullYear());
  const [tempPaymentMonth, setTempPaymentMonth] = useState(new Date().getMonth() + 1);
  const [tempStartYear, setTempStartYear] = useState(new Date().getFullYear());
  const [tempStartMonth, setTempStartMonth] = useState(new Date().getMonth() + 1);
  const [tempEndYear, setTempEndYear] = useState(new Date().getFullYear());
  const [tempEndMonth, setTempEndMonth] = useState(new Date().getMonth() + 1);
  const [tempReason, setTempReason] = useState('');
  const [tempBeneficiaryType, setTempBeneficiaryType] = useState('direct'); // 'direct' or 'category'
  const [tempDirectEmployeeIds, setTempDirectEmployeeIds] = useState([]);
  const [addingTemp, setAddingTemp] = useState(false);
  const [editingTempRecord, setEditingTempRecord] = useState(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [addedEmployeeSearch, setAddedEmployeeSearch] = useState('');

  const getTempMeta = (id) => {
    try {
      const saved = localStorage.getItem(`TEMPORARY_META_${id}`);
      return saved ? JSON.parse(saved) : { isTemporary: false };
    } catch (e) {
      return { isTemporary: false };
    }
  };

  const saveTempMeta = (id, meta) => {
    localStorage.setItem(`TEMPORARY_META_${id}`, JSON.stringify(meta));
  };

  const [activeTempAllowanceIdForEmployees, setActiveTempAllowanceIdForEmployees] = useState(null);

  const handleUpdateTemporary = async (e) => {
    e.preventDefault();
    if (!editingTempRecord) return;
    if (!tempName || !tempValue || !tempReason) {
      toast({
        title: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: tempName,
        calcType: tempCalcType,
        value: parseInt(tempValue),
      };

      await apiClient.entities.AllowanceDeduction.update(editingTempRecord.id, payload);

      const meta = {
        isTemporary: true,
        timingType: tempTimingType,
        paymentYear: parseInt(tempPaymentYear),
        paymentMonth: parseInt(tempPaymentMonth),
        startYear: parseInt(tempStartYear),
        startMonth: parseInt(tempStartMonth),
        endYear: parseInt(tempEndYear),
        endMonth: parseInt(tempEndMonth),
        reason: tempReason,
        beneficiaryType: tempBeneficiaryType,
        directEmployeeIds: tempDirectEmployeeIds
      };
      saveTempMeta(editingTempRecord.id, meta);

      toast({
        title: 'تم تحديث المخصص المؤقت بنجاح',
        variant: 'success',
      });

      setTempName('');
      setTempValue('');
      setTempReason('');
      setTempDirectEmployeeIds([]);
      setTempTimingType('single');
      setTempPaymentYear(new Date().getFullYear());
      setTempPaymentMonth(new Date().getMonth() + 1);
      setTempStartYear(new Date().getFullYear());
      setTempStartMonth(new Date().getMonth() + 1);
      setTempEndYear(new Date().getFullYear());
      setTempEndMonth(new Date().getMonth() + 1);
      setEmployeeSearch('');
      setEditingTempRecord(null);
      fetchCustomRecords();

      // Log action
      const dateDetails = tempTimingType === 'range' 
        ? `للفترة من ${tempStartMonth}/${tempStartYear} إلى ${tempEndMonth}/${tempEndYear}`
        : `لشهر ${tempPaymentMonth}/${tempPaymentYear}`;
      await apiClient.logs.create({
        action: 'تعديل مخصص مؤقت',
        details: `تم تعديل المخصص المؤقت "${tempName}" ${dateDetails}`,
        userId: user?.id
      });
    } catch (error) {
      console.error('Error updating temporary allowance:', error);
      toast({
        title: 'خطأ أثناء حفظ التعديل',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAddTemporary = async (e) => {
    e.preventDefault();
    if (!tempName || !tempValue || !tempReason) {
      toast({
        title: 'يرجى ملء جميع الحقول المطلوبة',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: tempName,
        type: 'allowance',
        calcType: tempCalcType,
        value: parseInt(tempValue),
        status: 'فعال',
      };

      const created = await apiClient.entities.AllowanceDeduction.create(payload);
      let targetId = created?.id || created?.insertId;
      if (!targetId) {
        const currentList = await apiClient.entities.AllowanceDeduction.list();
        const matches = currentList.filter(item => item.name === tempName);
        if (matches.length > 0) {
          targetId = matches[matches.length - 1].id;
        }
      }

      if (targetId) {
        const meta = {
          isTemporary: true,
          timingType: tempTimingType,
          paymentYear: parseInt(tempPaymentYear),
          paymentMonth: parseInt(tempPaymentMonth),
          startYear: parseInt(tempStartYear),
          startMonth: parseInt(tempStartMonth),
          endYear: parseInt(tempEndYear),
          endMonth: parseInt(tempEndMonth),
          reason: tempReason,
          beneficiaryType: tempBeneficiaryType,
          directEmployeeIds: tempDirectEmployeeIds
        };
        saveTempMeta(targetId, meta);
      }

      toast({
        title: 'تم حفظ المخصص المؤقت بنجاح',
        variant: 'success',
      });

      setTempName('');
      setTempValue('');
      setTempReason('');
      setTempDirectEmployeeIds([]);
      setTempTimingType('single');
      setTempPaymentYear(new Date().getFullYear());
      setTempPaymentMonth(new Date().getMonth() + 1);
      setTempStartYear(new Date().getFullYear());
      setTempStartMonth(new Date().getMonth() + 1);
      setTempEndYear(new Date().getFullYear());
      setTempEndMonth(new Date().getMonth() + 1);
      setEmployeeSearch('');
      setAddingTemp(false);
      fetchCustomRecords();

      // Log action
      const dateDetails = tempTimingType === 'range' 
        ? `للفترة من ${tempStartMonth}/${tempStartYear} إلى ${tempEndMonth}/${tempEndYear}`
        : `لشهر ${tempPaymentMonth}/${tempPaymentYear}`;
      await apiClient.logs.create({
        action: 'إضافة مخصص مؤقت جديد',
        details: `تمت إضافة مخصص مؤقت باسم "${tempName}" ${dateDetails}`,
        userId: user?.id
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'فشل حفظ المخصص المؤقت',
        variant: 'destructive',
      });
    }
  };
  
  // 1. Fixed Allowances State
  const [spouseAllowance, setSpouseAllowance] = useState(75000);
  const [childAllowance, setChildAllowance] = useState(30000);
  const [spouseAllowanceStatus, setSpouseAllowanceStatus] = useState('فعال');
  const [childAllowanceStatus, setChildAllowanceStatus] = useState('فعال');
  const [savingFixed, setSavingFixed] = useState(false);

  // 2. Custom Allowances State
  const [records, setRecords] = useState([]);
  const [unfilteredRecords, setUnfilteredRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  
  // Form state for adding custom allowance
  const [newName, setNewName] = useState('');
  const [newCalcType, setNewCalcType] = useState('flat'); // 'flat' or 'percentage'
  const [newValue, setNewValue] = useState('');
  const [newStatus, setNewStatus] = useState('فعال');

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCalcType, setEditCalcType] = useState('flat');
  const [editValue, setEditValue] = useState('');
  const [editStatus, setEditStatus] = useState('فعال');

  // Rules Configuration State
  const [employees, setEmployees] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [workLocations, setWorkLocations] = useState([]);
  const [educationDegrees, setEducationDegrees] = useState([]);
  const [responsibilityAllowances, setResponsibilityAllowances] = useState([]);
  const [expandedRuleId, setExpandedRuleId] = useState(null);
  const [currentRule, setCurrentRule] = useState(null);
  const [searchBlockEmployee, setSearchBlockEmployee] = useState('');
  const [titleSearch, setTitleSearch] = useState('');
  const [deptSearch, setDeptSearch] = useState('');
  const [employeeBlockSearch, setEmployeeBlockSearch] = useState('');

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState(null);

  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null, name: '' });

  useEffect(() => {
    fetchFixedSettings();
    fetchCustomRecords();
    
    // Fetch employees for custom rule engine
    apiClient.entities.Employee.list().then(data => {
      setEmployees(data || []);
    }).catch(err => {
      console.error('Error loading employees for rules:', err);
    });

    // Fetch established org units
    apiClient.entities.OrgUnit.list().then(data => {
      setOrgUnits(data || []);
    }).catch(err => {
      console.error('Error loading org units for rules:', err);
    });

    // Fetch established work locations
    apiClient.entities.WorkLocation.list().then(data => {
      setWorkLocations(data || []);
    }).catch(err => {
      console.error('Error loading work locations for rules:', err);
    });

    // Fetch education degrees
    apiClient.entities.EducationDegree.list().then(data => {
      setEducationDegrees(data || []);
    }).catch(err => {
      console.error('Error loading education degrees:', err);
    });

    // Fetch responsibility allowances
    apiClient.entities.ResponsibilityAllowance.list().then(data => {
      setResponsibilityAllowances(data || []);
    }).catch(err => {
      console.error('Error loading responsibility allowances:', err);
    });
  }, []);

  const loadRuleForAllowance = (id) => {
    const saved = localStorage.getItem(`ALLOWANCE_RULES_${id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          grades: parsed.grades || [],
          steps: parsed.steps || [],
          educations: parsed.educations || [],
          responsibilities: parsed.responsibilities || [],
          locations: parsed.locations || [],
          titles: parsed.titles || [],
          workNatures: parsed.workNatures || [],
          departments: parsed.departments || [],
          employeeStatuses: parsed.employeeStatuses || [],
          maritalStatuses: parsed.maritalStatuses || [],
          serviceTypes: parsed.serviceTypes || [],
          blockedEmployees: parsed.blockedEmployees || []
        };
      } catch (e) {
        console.error(e);
      }
    }
    return {
      grades: [],
      steps: [],
      educations: [],
      responsibilities: [],
      locations: [],
      titles: [],
      workNatures: [],
      departments: [],
      employeeStatuses: [],
      maritalStatuses: [],
      serviceTypes: [],
      blockedEmployees: []
    };
  };

  const handleToggleRuleConfig = (id) => {
    if (expandedRuleId === id) {
      setExpandedRuleId(null);
      setCurrentRule(null);
    } else {
      setExpandedRuleId(id);
      setCurrentRule(loadRuleForAllowance(id));
      setSearchBlockEmployee('');
    }
  };

  const toggleRuleValue = (field, value) => {
    setCurrentRule(prev => {
      if (!prev) return null;
      const arr = prev[field] || [];
      const exists = arr.includes(value);
      const updated = exists ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [field]: updated };
    });
  };

  const handleBlockEmployee = (emp) => {
    setCurrentRule(prev => {
      if (!prev) return null;
      const blocked = prev.blockedEmployees || [];
      if (blocked.includes(emp.id)) return prev;
      return { ...prev, blockedEmployees: [...blocked, emp.id] };
    });
    setSearchBlockEmployee('');
  };

  const handleUnblockEmployee = (empId) => {
    setCurrentRule(prev => {
      if (!prev) return null;
      const blocked = prev.blockedEmployees || [];
      return { ...prev, blockedEmployees: blocked.filter(id => id !== empId) };
    });
  };

  const handleSaveRule = (id) => {
    localStorage.setItem(`ALLOWANCE_RULES_${id}`, JSON.stringify(currentRule));
    toast({
      title: 'تم حفظ الشروط والحجب بنجاح',
      description: 'تم تحديث شروط الاستحقاق وموظفي الحجب لهذا البند المالي المخصص.',
      variant: 'success',
    });
    setExpandedRuleId(null);
    setCurrentRule(null);
  };

  const fetchFixedSettings = () => {
    if (typeof window !== 'undefined') {
      const savedSpouse = localStorage.getItem('SPOUSE_ALLOWANCE');
      if (savedSpouse) setSpouseAllowance(parseInt(savedSpouse) || 75000);
      
      const savedChild = localStorage.getItem('CHILD_ALLOWANCE');
      if (savedChild) setChildAllowance(parseInt(savedChild) || 30000);

      const savedSpouseStatus = localStorage.getItem('SPOUSE_ALLOWANCE_STATUS');
      setSpouseAllowanceStatus(savedSpouseStatus || 'فعال');

      const savedChildStatus = localStorage.getItem('CHILD_ALLOWANCE_STATUS');
      setChildAllowanceStatus(savedChildStatus || 'فعال');
    }
  };

  const handleSaveFixed = async (e) => {
    e.preventDefault();
    setSavingFixed(true);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('SPOUSE_ALLOWANCE', spouseAllowance.toString());
        localStorage.setItem('CHILD_ALLOWANCE', childAllowance.toString());
        localStorage.setItem('SPOUSE_ALLOWANCE_STATUS', spouseAllowanceStatus);
        localStorage.setItem('CHILD_ALLOWANCE_STATUS', childAllowanceStatus);
      }

      // Log action
      await apiClient.logs.create({
        action: 'تعديل المخصصات الثابتة والقانونية',
        details: `تحديث علاوة الزوجية إلى (${spouseAllowance} د.ع - الحالة: ${spouseAllowanceStatus})، وعلاوة الأطفال إلى (${childAllowance} د.ع - الحالة: ${childAllowanceStatus})`
      }).catch(() => {});

      toast({
        title: 'تم حفظ المخصصات الثابتة',
        description: 'تم تحديث مخصصات الزوجية والأولاد وحالتها بنجاح في النظام.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحفظ',
        description: error.message || 'فشل حفظ الإعدادات الثابتة',
        variant: 'destructive',
      });
    } finally {
      setSavingFixed(false);
    }
  };

  const handleToggleStatus = async (record) => {
    try {
      const newStatus = record.status === 'فعال' ? 'متوقف مؤقتاً' : 'فعال';
      const payload = {
        name: record.name,
        type: record.type || 'allowance',
        calcType: record.calcType || record.calc_type || 'flat',
        value: parseInt(record.value || 0),
        status: newStatus,
      };

      await apiClient.entities.AllowanceDeduction.update(record.id, payload);
      
      toast({
        title: newStatus === 'فعال' ? 'تم التفعيل بنجاح' : 'تم الإيقاف مؤقتاً',
        description: `تم ${newStatus === 'فعال' ? 'تفعيل' : 'إيقاف'} البند المالي "${record.name}" لجميع الموظفين.`,
        variant: 'success',
      });

      fetchCustomRecords();

      await apiClient.logs.create({
        action: newStatus === 'فعال' ? 'تفعيل مخصص مخصص' : 'إيقاف مخصص مخصص مؤقتاً',
        details: `تغيير حالة البند المالي (${record.name}) إلى: ${newStatus}`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء تغيير الحالة',
        description: error.message || 'تعذر حفظ التعديلات',
        variant: 'destructive',
      });
    }
  };

  const fetchCustomRecords = async () => {
    setLoading(true);
    try {
      // Get all allowances and filter only custom ones
      // Custom ones are allowances from the database that aren't marital/child
      const data = await apiClient.entities.AllowanceDeduction.list();
      
      // Filter only allowances (not deductions) and exclude standard marital/child ones and temporary ones
      const customOnly = (data || []).filter(item => {
        const isSpouse = (item.name.includes('زوجية') || item.name.includes('الزوجية'));
        const isChild = (item.name.includes('أطفال') || item.name.includes('الاطفال') || item.name.includes('أولاد') || item.name.includes('الاولاد') || item.name.includes('طفل') || item.name.includes('ولد'));
        
        let isTemp = false;
        try {
          const saved = localStorage.getItem(`TEMPORARY_META_${item.id}`);
          if (saved) isTemp = JSON.parse(saved).isTemporary;
        } catch (e) {}

        return item.type === 'allowance' && !isSpouse && !isChild && !isTemp;
      });

      let sortedData = customOnly;
      const savedOrder = localStorage.getItem('CUSTOM_ALLOWANCES_ORDER');
      if (savedOrder) {
        try {
          const orderIds = JSON.parse(savedOrder);
          sortedData = [...sortedData].sort((a, b) => {
            const indexA = orderIds.indexOf(a.id);
            const indexB = orderIds.indexOf(b.id);
            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
          });
        } catch (e) {
          console.error('Error parsing CUSTOM_ALLOWANCES_ORDER:', e);
        }
      }
      setRecords(sortedData);
      setUnfilteredRecords(data || []);
      localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(data || []));
    } catch (error) {
      toast({
        title: 'خطأ في جلب البيانات',
        description: 'تعذر تحميل المخصصات المخصصة من الخادم',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDraggedOverIndex(index);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDraggedOverIndex(null);
      return;
    }

    const nextRecords = [...records];
    const [removed] = nextRecords.splice(draggedIndex, 1);
    nextRecords.splice(targetIndex, 0, removed);
    setRecords(nextRecords);

    // Save order to localStorage
    localStorage.setItem('CUSTOM_ALLOWANCES_ORDER', JSON.stringify(nextRecords.map(r => r.id)));

    // Sync updated presets array in localStorage for immediate effect
    const nextUnfiltered = (unfilteredRecords || []).map(item => {
      const found = nextRecords.find(r => r.id === item.id);
      return found ? found : item;
    });
    localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(nextUnfiltered));

    setDraggedIndex(null);
    setDraggedOverIndex(null);

    toast({
      title: 'تمت إعادة الترتيب',
      description: 'تم تحديث ترتيب المخصصات المخصصة بنجاح',
    });
  };

  const handleAddCustom = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newValue) {
      toast({
        title: 'بيانات غير مكتملة',
        description: 'يرجى إدخال اسم المخصص وقيمته',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: newName,
        type: 'allowance',
        calcType: newCalcType,
        value: parseInt(newValue),
        status: newStatus,
      };

      await apiClient.entities.AllowanceDeduction.create(payload);
      
      toast({
        title: 'تمت إضافة المخصص المخصص',
        description: `تمت إضافة بند مالي مخصص باسم "${newName}" بنجاح`,
        variant: 'success',
      });

      setNewName('');
      setNewValue('');
      setAdding(false);
      fetchCustomRecords();

      // Log action
      await apiClient.logs.create({
        action: 'إضافة مخصص مخصص جديد',
        details: `إضافة بند مالي جديد (${newName} - طريقة الاحتساب: ${newCalcType === 'percentage' ? 'نسبة مئوية' : 'مبلغ مقطوع'}، القيمة: ${newValue})`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الإضافة',
        description: error.message || 'تعذر إضافة المخصص المخصص',
        variant: 'destructive',
      });
    }
  };

  const startEdit = (rec) => {
    setEditingId(rec.id);
    setEditName(rec.name);
    setEditCalcType(rec.calcType || rec.calc_type || 'flat');
    setEditValue(rec.value || 0);
    setEditStatus(rec.status || 'فعال');
  };

  const handleUpdate = async (id) => {
    if (!editName.trim() || !editValue) {
      toast({
        title: 'تنبيه',
        description: 'لا يمكن حفظ قيم فارغة للمخصص المخصص',
        variant: 'destructive',
      });
      return;
    }

    try {
      const payload = {
        name: editName,
        type: 'allowance',
        calcType: editCalcType,
        value: parseInt(editValue),
        status: editStatus,
      };

      await apiClient.entities.AllowanceDeduction.update(id, payload);
      
      toast({
        title: 'تم التحديث بنجاح',
        description: 'تم حفظ تعديلات بند المخصص المخصص',
        variant: 'success',
      });

      setEditingId(null);
      fetchCustomRecords();

      await apiClient.logs.create({
        action: 'تعديل مخصص مخصص',
        details: `تحديث البند المالي ذو الرقم المعرف (${id}) إلى الاسم: ${editName}، القيمة: ${editValue}`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء التحديث',
        description: error.message || 'تعذر حفظ التعديلات',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (id, name) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    const { id, name } = deleteConfirm;
    if (!id) return;

    try {
      await apiClient.entities.AllowanceDeduction.delete(id);
      toast({
        title: 'تم الحذف',
        description: `تم حذف مخصص "${name}" بنجاح`,
        variant: 'success',
      });
      setDeleteConfirm({ isOpen: false, id: null, name: '' });
      fetchCustomRecords();

      await apiClient.logs.create({
        action: 'حذف مخصص مخصص',
        details: `حذف البند المالي المخصص باسم (${name}) رقم المعرف: ${id}`
      }).catch(() => {});
    } catch (error) {
      toast({
        title: 'خطأ أثناء الحذف',
        description: error.message || 'تعذر حذف المخصص',
        variant: 'destructive',
      });
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ar-IQ').format(amount) + ' د.ع';
  };

  const availableTitles = Array.from(new Set(
    employees.map(e => e.job_title || e.jobTitle).filter(Boolean)
  )).sort();

  const availableDepartments = orgUnits.length > 0
    ? Array.from(new Set(orgUnits.map(unit => unit.name).filter(Boolean))).sort()
    : Array.from(new Set([
        ...STANDARD_DEPARTMENTS,
        ...employees.map(e => e.department).filter(Boolean)
      ])).sort();

  const availableLocations = workLocations.length > 0
    ? Array.from(new Set(workLocations.map(loc => loc.name).filter(Boolean))).sort()
    : Array.from(new Set(employees.map(e => e.work_location || e.workLocation).filter(Boolean))).sort();

  return (
    <div className="space-y-6" dir="rtl">
      {/* Sub-tab navigation */}
      <div className="flex bg-slate-100 p-1.5 rounded-xl w-fit border border-slate-200">
        <button
          type="button"
          onClick={() => setActiveSubTab('custom')}
          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
            activeSubTab === 'custom'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          المخصصات المستمرة والمخصصة
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('temporary')}
          className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${
            activeSubTab === 'temporary'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          المخصصات المؤقتة والاستثنائية
        </button>
      </div>

      {activeSubTab === 'custom' && (
        <>
          {/* 1. Fixed Legislative Allowances Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#1B3A6B]">المخصصات الثابتة (قوانين الخدمة المدنية العراقية)</h2>
              <p className="text-[11px] text-slate-500">تعديل قيمة العلاوات الثابتة الممنوحة افتراضياً لجميع الموظفين.</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={fetchFixedSettings}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
            title="إعادة جلب المخصصات الافتراضية"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="p-6">
          <form onSubmit={handleSaveFixed} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Marital Allowance */}
              <div className="space-y-2 bg-slate-50/30 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">مخصصات الزوجية الثابتة</label>
                  <button
                    type="button"
                    onClick={() => setSpouseAllowanceStatus(prev => prev === 'فعال' ? 'متوقف مؤقتاً' : 'فعال')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                      spouseAllowanceStatus === 'فعال' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {spouseAllowanceStatus === 'فعال' ? 'نشط/فعال' : 'متوقف مؤقتاً'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled={spouseAllowanceStatus === 'متوقف مؤقتاً'}
                    value={spouseAllowance}
                    onChange={(e) => setSpouseAllowance(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] text-slate-800 disabled:opacity-50"
                    placeholder="75,000"
                  />
                  <div className="absolute left-3 top-2.5 text-[10px] font-bold text-slate-400">
                    د.ع
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">تُمنح شهرياً للموظف المتزوج.</p>
              </div>

              {/* Child Allowance */}
              <div className="space-y-2 bg-slate-50/30 p-4 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">مخصصات الأطفال لكل طفل</label>
                  <button
                    type="button"
                    onClick={() => setChildAllowanceStatus(prev => prev === 'فعال' ? 'متوقف مؤقتاً' : 'فعال')}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center gap-1 ${
                      childAllowanceStatus === 'فعال' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {childAllowanceStatus === 'فعال' ? 'نشط/فعال' : 'متوقف مؤقتاً'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled={childAllowanceStatus === 'متوقف مؤقتاً'}
                    value={childAllowance}
                    onChange={(e) => setChildAllowance(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] text-slate-800 disabled:opacity-50"
                    placeholder="30,000"
                  />
                  <div className="absolute left-3 top-2.5 text-[10px] font-bold text-slate-400">
                    د.ع
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">تُمنح لكل طفل حتى الحد الأقصى للمؤسسة.</p>
              </div>

            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingFixed}
                className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-black px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-55"
              >
                {savingFixed ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                حفظ المخصصات الثابتة
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 2. Custom/Flexible Allowances Card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Coins size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#1B3A6B]">المخصصات المخصصة والمقطوعة للرواتب</h2>
              <p className="text-[11px] text-slate-500">إدارة البنود المالية المخصصة الأخرى (مثلاً مخصصات الخطورة، مخصصات النقل، مخصصات الإيفاد، إلخ).</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAdding(!adding)}
              className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
            >
              <Plus size={12} />
              مخصص مخصص جديد
            </button>
            <button
              onClick={fetchCustomRecords}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
              title="تحديث القائمة"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Adding Form Block */}
        {adding && (
          <div className="p-5 bg-slate-50/70 border-b border-slate-150 animate-fadeIn">
            <form onSubmit={handleAddCustom} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">اسم المخصص المخصص</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                  placeholder="مثال: مخصصات نقل خاص، خطورة عمل"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">طريقة الاحتساب</label>
                <select
                  value={newCalcType}
                  onChange={(e) => setNewCalcType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                >
                  <option value="flat">مبلغ مقطوع ثابت (د.ع)</option>
                  <option value="percentage">نسبة مئوية من الراتب الاسمي (%)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">القيمة</label>
                <div className="relative">
                  <input
                    type="number"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                    placeholder={newCalcType === 'percentage' ? 'مثال: 15' : 'مثال: 50000'}
                  />
                  <div className="absolute left-2.5 top-2.5 text-[10px] font-bold text-slate-400">
                    {newCalcType === 'percentage' ? '%' : 'د.ع'}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <Check size={14} />
                  إضافة
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold py-2 rounded-xl transition-all"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Custom Allowances Table */}
        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw size={24} className="animate-spin text-[#1B3A6B]" />
              <span className="text-xs font-bold">جاري تحميل البنود المالية المخصصة...</span>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 border-2 border-dashed border-slate-150 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-2">
              <Coins size={32} className="text-slate-300" />
              <span className="text-xs font-bold">لا توجد مخصصات مخصصة مسجلة حالياً.</span>
              <p className="text-[10px] text-slate-400">يمكنك إضافة بنود مخصصات غير اعتيادية كالخطورة أو بدل النقل من الزاوية العلوية.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-150 rounded-xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-3 text-center w-10">سحب</th>
                    <th className="px-4 py-3">اسم البند المالي المخصص</th>
                    <th className="px-4 py-3 text-center">طريقة الاحتساب</th>
                    <th className="px-4 py-3 text-center">القيمة المحددة</th>
                    <th className="px-4 py-3 text-center">الحالة</th>
                    <th className="px-4 py-3 text-center w-24">الخيارات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-700">
                  {records.map((r, idx) => {
                    const isEditing = editingId === r.id;
                    const isPaused = r.status === 'متوقف مؤقتاً';
                    const displayCalcType = r.calcType || r.calc_type || 'flat';
                    const displayValue = r.value || 0;

                    return (
                      <Fragment key={r.id}>
                        <tr 
                          draggable
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDrop={(e) => handleDrop(e, idx)}
                          className={`hover:bg-slate-50/50 transition-all ${isPaused ? 'bg-slate-50/40 text-slate-400' : ''} ${
                            draggedOverIndex === idx ? 'border-t-2 border-dashed border-[#1B3A6B] bg-[#1B3A6B]/5' : ''
                          }`}
                        >
                          {/* Drag Handle */}
                          <td className="px-2 py-3 text-center text-slate-400 cursor-grab active:cursor-grabbing hover:text-slate-600 transition-colors">
                            <GripVertical size={14} className="inline" />
                          </td>

                          {/* Name */}
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-[#1B3A6B] w-full"
                              />
                            ) : (
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-slate-800">{r.name}</span>
                                {(() => {
                                  const rule = loadRuleForAllowance(r.id);
                                  const hasConditions = 
                                    rule.grades.length > 0 || 
                                    rule.steps.length > 0 || 
                                    rule.educations.length > 0 || 
                                    rule.responsibilities.length > 0 || 
                                    rule.locations.length > 0 || 
                                    rule.titles.length > 0 || 
                                    rule.workNatures.length > 0 || 
                                    rule.departments.length > 0 || 
                                    rule.employeeStatuses.length > 0 || 
                                    rule.maritalStatuses.length > 0 || 
                                    rule.serviceTypes.length > 0;
                                  const hasBlocked = rule.blockedEmployees && rule.blockedEmployees.length > 0;
                                  if (!hasConditions && !hasBlocked) return null;
                                  return (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {hasConditions && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                                          شروط نشطة
                                        </span>
                                      )}
                                      {hasBlocked && (
                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                          محجوب عن {rule.blockedEmployees.length}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </td>

                          {/* Calculation Type */}
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <select
                                value={editCalcType}
                                onChange={(e) => setEditCalcType(e.target.value)}
                                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-[#1B3A6B]"
                              >
                                <option value="flat">مبلغ مقطوع (د.ع)</option>
                                <option value="percentage">نسبة مئوية (%)</option>
                              </select>
                            ) : (
                              <span className={`px-2 py-1 rounded-md font-bold text-[10px] ${
                                displayCalcType === 'percentage' 
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-150' 
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {displayCalcType === 'percentage' ? 'نسبة مئوية (%)' : 'مبلغ مقطوع (د.ع)'}
                              </span>
                            )}
                          </td>

                          {/* Value */}
                          <td className="px-4 py-3 text-center font-black">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center focus:ring-1 focus:ring-[#1B3A6B] w-24"
                              />
                            ) : (
                              <span>
                                {displayCalcType === 'percentage' 
                                  ? `${displayValue}%` 
                                  : formatCurrency(displayValue)
                                }
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value)}
                                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-[#1B3A6B]"
                              >
                                <option value="فعال">فعال</option>
                                <option value="متوقف مؤقتاً">متوقف مؤقتاً</option>
                              </select>
                            ) : (
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                !isPaused 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {r.status || 'فعال'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleUpdate(r.id)}
                                  className="p-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors"
                                  title="حفظ التعديلات"
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="p-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                                  title="إلغاء"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleToggleRuleConfig(r.id)}
                                  className={`p-1 rounded-md transition-all ${
                                    expandedRuleId === r.id 
                                      ? 'bg-amber-100 text-amber-700' 
                                      : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                                  }`}
                                  title="تخصيص الشروط والحجب"
                                >
                                  <Filter size={13} />
                                </button>
                                <button
                                  onClick={() => handleToggleStatus(r)}
                                  className={`p-1 rounded-md transition-all ${
                                    isPaused 
                                      ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50' 
                                      : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                  }`}
                                  title={isPaused ? 'تفعيل البند' : 'إيقاف البند مؤقتاً'}
                                >
                                  {isPaused ? <Play size={13} /> : <Pause size={13} />}
                                </button>
                                <button
                                  onClick={() => startEdit(r)}
                                  className="p-1 text-slate-500 hover:text-[#1B3A6B] hover:bg-slate-100 rounded-md transition-all"
                                  title="تعديل"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(r.id, r.name)}
                                  className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all"
                                  title="حذف"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>

                        {expandedRuleId === r.id && currentRule && (
                          <tr className="bg-slate-50/75 select-none">
                            <td colSpan={6} className="p-6 border-b border-slate-200">
                              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-fadeIn text-right" dir="rtl">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                  <div className="flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-amber-600" />
                                    <h4 className="font-black text-xs text-[#1B3A6B]">شروط الاستحقاق وموظفي الحجب: "{r.name}"</h4>
                                  </div>
                                  <span className="text-[10px] text-slate-400">إذا لم يتم تحديد أي شرط، سيُمنح المخصص لجميع الموظفين تلقائياً.</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                  {/* 1. الدرجة والمرحلة */}
                                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <h5 className="font-bold text-[11px] text-slate-700">الدرجة والمرحلة</h5>
                                    <div className="space-y-3">
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">الدرجات المحددة:</span>
                                        <div className="flex flex-wrap gap-1">
                                          {[1,2,3,4,5,6,7,8,9,10,11,12,13].map(g => {
                                            const active = currentRule.grades.includes(g);
                                            return (
                                              <button
                                                key={g}
                                                type="button"
                                                onClick={() => toggleRuleValue('grades', g)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                                                  active ? 'bg-[#1B3A6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {g}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">المراحل المحددة:</span>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                          {[1,2,3,4,5,6,7,8,9,10,11].map(s => {
                                            const active = currentRule.steps.includes(s);
                                            return (
                                              <button
                                                key={s}
                                                type="button"
                                                onClick={() => toggleRuleValue('steps', s)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                                                  active ? 'bg-[#1B3A6B] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {s}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 2. الشهادة والمنصب */}
                                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <h5 className="font-bold text-[11px] text-slate-700">الشهادة ومستوى المسؤولية</h5>
                                    <div className="space-y-3">
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">الشهادات المحددة:</span>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                          {(educationDegrees.length > 0 ? educationDegrees.map(d => d.name) : ['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية']).map(edu => {
                                            const active = currentRule.educations.includes(edu);
                                            return (
                                              <button
                                                key={edu}
                                                type="button"
                                                onClick={() => toggleRuleValue('educations', edu)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                  active ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {edu}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">المسؤولية/المنصب:</span>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                          {(responsibilityAllowances.length > 0 ? responsibilityAllowances.map(r => r.name) : ['مدير عام', 'معاون مدير عام', 'مدير قسم', 'رئيس شعبة', 'رئيس مجموعة', 'بلا مسؤولية']).map(resp => {
                                            const active = currentRule.responsibilities.includes(resp);
                                            return (
                                              <button
                                                key={resp}
                                                type="button"
                                                onClick={() => toggleRuleValue('responsibilities', resp)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                  active ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {resp}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 3. طبيعة العمل وموقع العمل */}
                                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <h5 className="font-bold text-[11px] text-slate-700">طبيعة وموقع العمل</h5>
                                    <div className="space-y-3">
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">طبيعة العمل:</span>
                                        <div className="flex gap-1">
                                          {['مكتبي', 'ميداني'].map(nature => {
                                            const active = currentRule.workNatures.includes(nature);
                                            return (
                                              <button
                                                key={nature}
                                                type="button"
                                                onClick={() => toggleRuleValue('workNatures', nature)}
                                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                                  active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {nature}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">مواقع العمل المحددة:</span>
                                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                          {availableLocations.map(loc => {
                                            const active = currentRule.locations.includes(loc);
                                            return (
                                              <button
                                                key={loc}
                                                type="button"
                                                onClick={() => toggleRuleValue('locations', loc)}
                                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                  active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                              >
                                                {loc}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 4. العنوان الوظيفي والجهة */}
                                  <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
                                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                                      <h5 className="font-bold text-xs text-slate-700">تخصيص العناوين الوظيفية وجهات العمل (الأقسام)</h5>
                                      <span className="text-[10px] text-slate-400">ابحث وحدد المسميات والأقسام المشمولة بالبند المالي</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                      {/* العناوين الوظيفية */}
                                      <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] font-bold text-slate-700">العناوين الوظيفية ({currentRule.titles.length} محددة)</span>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const filtered = availableTitles.filter(t => t.includes(titleSearch));
                                                setCurrentRule(prev => {
                                                  const titles = Array.from(new Set([...prev.titles, ...filtered]));
                                                  return { ...prev, titles };
                                                });
                                              }}
                                              className="text-[9px] font-black text-indigo-600 hover:underline bg-indigo-50 px-1.5 py-0.5 rounded"
                                            >
                                              تحديد الكل المصفى
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const filtered = availableTitles.filter(t => t.includes(titleSearch));
                                                setCurrentRule(prev => {
                                                  const titles = prev.titles.filter(t => !filtered.includes(t));
                                                  return { ...prev, titles };
                                                });
                                              }}
                                              className="text-[9px] font-black text-rose-600 hover:underline bg-rose-50 px-1.5 py-0.5 rounded"
                                            >
                                              إلغاء الكل المصفى
                                            </button>
                                          </div>
                                        </div>
                                        <input
                                          type="text"
                                          placeholder="ابحث عن عنوان وظيفي..."
                                          value={titleSearch}
                                          onChange={(e) => setTitleSearch(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-600"
                                        />
                                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded p-1.5 bg-slate-50/20">
                                          {availableTitles.filter(t => !titleSearch || t.includes(titleSearch)).map(title => {
                                            const active = currentRule.titles.includes(title);
                                            return (
                                              <label
                                                key={title}
                                                className={`flex items-center justify-between p-1.5 rounded text-[10px] font-semibold cursor-pointer select-none transition-all ${
                                                  active ? 'bg-indigo-50/60 text-indigo-800 border border-indigo-100' : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5">
                                                  <input
                                                    type="checkbox"
                                                    checked={active}
                                                    onChange={() => toggleRuleValue('titles', title)}
                                                    className="rounded text-indigo-600 focus:ring-0 w-3 h-3 cursor-pointer"
                                                  />
                                                  <span>{title}</span>
                                                </div>
                                                {active && <span className="text-[8px] bg-indigo-100 text-indigo-700 px-1 rounded">محدد</span>}
                                              </label>
                                            );
                                          })}
                                          {availableTitles.filter(t => !titleSearch || t.includes(titleSearch)).length === 0 && (
                                            <div className="text-center py-4 text-slate-400 text-[10px]">لا توجد نتائج مطابقة</div>
                                          )}
                                        </div>
                                      </div>

                                      {/* جهات العمل / الأقسام */}
                                      <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] font-bold text-slate-700">جهة العمل / الأقسام ({currentRule.departments.length} محددة)</span>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const filtered = availableDepartments.filter(d => d.includes(deptSearch));
                                                setCurrentRule(prev => {
                                                  const departments = Array.from(new Set([...prev.departments, ...filtered]));
                                                  return { ...prev, departments };
                                                });
                                              }}
                                              className="text-[9px] font-black text-pink-600 hover:underline bg-pink-50 px-1.5 py-0.5 rounded"
                                            >
                                              تحديد الكل المصفى
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const filtered = availableDepartments.filter(d => d.includes(deptSearch));
                                                setCurrentRule(prev => {
                                                  const departments = prev.departments.filter(d => !filtered.includes(d));
                                                  return { ...prev, departments };
                                                });
                                              }}
                                              className="text-[9px] font-black text-rose-600 hover:underline bg-rose-50 px-1.5 py-0.5 rounded"
                                            >
                                              إلغاء الكل المصفى
                                            </button>
                                          </div>
                                        </div>
                                        <input
                                          type="text"
                                          placeholder="ابحث عن قسم أو جهة عمل..."
                                          value={deptSearch}
                                          onChange={(e) => setDeptSearch(e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-pink-600"
                                        />
                                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1 border border-slate-100 rounded p-1.5 bg-slate-50/20">
                                          {availableDepartments.filter(d => !deptSearch || d.includes(deptSearch)).map(dept => {
                                            const active = currentRule.departments.includes(dept);
                                            return (
                                              <label
                                                key={dept}
                                                className={`flex items-center justify-between p-1.5 rounded text-[10px] font-semibold cursor-pointer select-none transition-all ${
                                                  active ? 'bg-pink-50/60 text-pink-800 border border-pink-100' : 'hover:bg-slate-50 text-slate-600 border border-transparent'
                                                }`}
                                              >
                                                <div className="flex items-center gap-1.5">
                                                  <input
                                                    type="checkbox"
                                                    checked={active}
                                                    onChange={() => toggleRuleValue('departments', dept)}
                                                    className="rounded text-pink-600 focus:ring-0 w-3 h-3 cursor-pointer"
                                                  />
                                                  <span>{dept}</span>
                                                </div>
                                                {active && <span className="text-[8px] bg-pink-100 text-pink-700 px-1 rounded">محدد</span>}
                                              </label>
                                            );
                                          })}
                                          {availableDepartments.filter(d => !deptSearch || d.includes(deptSearch)).length === 0 && (
                                            <div className="text-center py-4 text-slate-400 text-[10px]">لا توجد نتائج مطابقة</div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 5. الحالة والخدمة والزوجية */}
                                  <div className="space-y-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <h5 className="font-bold text-[11px] text-slate-700">الحالة والخدمة</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">حالة الموظف:</span>
                                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                                          {['مستمر', 'منسب', 'منقول', 'متقاعد', 'مستقيل', 'موقوف', 'مجاز'].map(st => {
                                            const active = currentRule.employeeStatuses.includes(st);
                                            return (
                                              <label key={st} className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold text-slate-600">
                                                <input
                                                  type="checkbox"
                                                  checked={active}
                                                  onChange={() => toggleRuleValue('employeeStatuses', st)}
                                                  className="rounded text-[#1B3A6B] focus:ring-0 w-3 h-3"
                                                />
                                                {st}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div>
                                        <span className="text-[10px] text-slate-400 block mb-1">الحالة الزوجية:</span>
                                        <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                                          {['أعزب', 'متزوج', 'مطلق', 'أرمل'].map(ms => {
                                            const active = currentRule.maritalStatuses.includes(ms);
                                            return (
                                              <label key={ms} className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold text-slate-600">
                                                <input
                                                  type="checkbox"
                                                  checked={active}
                                                  onChange={() => toggleRuleValue('maritalStatuses', ms)}
                                                  className="rounded text-[#1B3A6B] focus:ring-0 w-3 h-3"
                                                />
                                                {ms}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="border-t border-slate-200/60 pt-2">
                                      <span className="text-[10px] text-slate-400 block mb-1 font-bold">نوع الخدمة:</span>
                                      <div className="flex flex-wrap gap-1.5">
                                        {['دائم', 'عقد', 'مؤقت', 'إعارة'].map(srv => {
                                          const active = currentRule.serviceTypes.includes(srv);
                                          return (
                                            <button
                                              key={srv}
                                              type="button"
                                              onClick={() => toggleRuleValue('serviceTypes', srv)}
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                active ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                              }`}
                                            >
                                              {srv}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>

                                  {/* 6. قائمة الحجب والاستثناء */}
                                  <div className="space-y-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 col-span-1 md:col-span-2 lg:col-span-3">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-2">
                                      <h5 className="font-bold text-xs text-rose-700 flex items-center gap-1.5">
                                        <UserX size={14} className="text-rose-600 animate-pulse" />
                                        نظام حجب البند المالي والاستثناء (حجب عن موظفين محددين)
                                      </h5>
                                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                                        <span className="text-[10px] font-extrabold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                          المحجوبون حالياً: <strong className="text-rose-600">{currentRule.blockedEmployees.length}</strong> من <strong className="text-slate-700">{employees.length}</strong>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const allIds = employees.map(e => e.id);
                                            setCurrentRule(prev => ({ ...prev, blockedEmployees: allIds }));
                                          }}
                                          className="text-[9px] font-black text-rose-700 hover:bg-rose-100 bg-rose-50 border border-rose-200 px-2 py-1 rounded"
                                        >
                                          حجب الجميع
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCurrentRule(prev => ({ ...prev, blockedEmployees: [] }));
                                          }}
                                          className="text-[9px] font-black text-emerald-700 hover:bg-emerald-100 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded"
                                        >
                                          إلغاء حجب الجميع (شمل الكل)
                                        </button>
                                      </div>
                                    </div>
                                    
                                    <p className="text-[10px] text-slate-500 leading-relaxed">
                                      ملاحظة هامة: الموظف المحجوب سيتم استثناؤه كلياً من استلام هذا البند المالي حتى وإن تحققت لديه شروط الاستحقاق المحددة في الأقسام السابقة.
                                    </p>

                                    {/* Employee search */}
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={employeeBlockSearch}
                                        onChange={(e) => setEmployeeBlockSearch(e.target.value)}
                                        placeholder="ابحث عن موظف بالاسم، الرقم الوظيفي، القسم، أو العنوان الوظيفي لتغيير حالة الحجب..."
                                        className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-rose-500"
                                      />
                                      <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                    </div>

                                    {/* Compact Employees Table with scroll */}
                                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg bg-white">
                                      <table className="w-full text-right text-[11px] border-collapse">
                                        <thead className="bg-slate-50 text-slate-600 font-bold sticky top-0 border-b border-slate-200 z-10">
                                          <tr>
                                            <th className="px-3 py-2">الموظف</th>
                                            <th className="px-3 py-2">القسم / جهة العمل</th>
                                            <th className="px-3 py-2">العنوان الوظيفي</th>
                                            <th className="px-3 py-2 text-center w-32">حالة الشمول</th>
                                            <th className="px-3 py-2 text-center w-28">الإجراء</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {employees
                                            .filter(emp => {
                                              if (!employeeBlockSearch.trim()) return true;
                                              const searchLower = employeeBlockSearch.trim();
                                              const name = emp.full_name || '';
                                              const empNo = emp.employee_number || emp.employeeNumber || '';
                                              const dept = emp.department || '';
                                              const title = emp.job_title || emp.jobTitle || '';
                                              return name.includes(searchLower) || 
                                                     String(empNo).includes(searchLower) || 
                                                     dept.includes(searchLower) || 
                                                     title.includes(searchLower);
                                            })
                                            .map(emp => {
                                              const isBlocked = currentRule.blockedEmployees.includes(emp.id);
                                              return (
                                                <tr key={emp.id} className={`hover:bg-slate-50/50 transition-colors ${isBlocked ? 'bg-rose-50/30' : ''}`}>
                                                  <td className="px-3 py-2 font-bold text-slate-800">
                                                    <div className="flex flex-col">
                                                      <span>{emp.full_name}</span>
                                                      <span className="text-[9px] text-slate-400 font-medium">رقم: #{emp.employee_number || emp.id}</span>
                                                    </div>
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-600">{emp.department || 'غير محدد'}</td>
                                                  <td className="px-3 py-2 text-slate-600">{emp.job_title || emp.jobTitle || 'غير محدد'}</td>
                                                  <td className="px-3 py-2 text-center">
                                                    {isBlocked ? (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                                                        محجوب من الصرف ❌
                                                      </span>
                                                    ) : (
                                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        مشمول بالصرف ✓
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 text-center">
                                                    {isBlocked ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleUnblockEmployee(emp.id)}
                                                        className="px-2 py-1 rounded text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-all w-24"
                                                      >
                                                        إلغاء الحجب (شمل)
                                                      </button>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleBlockEmployee(emp)}
                                                        className="px-2 py-1 rounded text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all w-24"
                                                      >
                                                        حجب الموظف
                                                      </button>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          {employees.length === 0 && (
                                            <tr>
                                              <td colSpan={5} className="text-center py-6 text-slate-400 italic">لا يوجد موظفون في النظام</td>
                                            </tr>
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveRule(r.id)}
                                    className="bg-[#1B3A6B] hover:bg-[#152e54] text-white text-[11px] font-black px-4 py-2 rounded-xl flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                                  >
                                    <Check size={14} />
                                    حفظ الشروط والحجب
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRuleConfig(r.id)}
                                    className="bg-slate-150 hover:bg-slate-200 text-slate-700 text-[11px] font-black px-4 py-2 rounded-xl transition-all"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {activeSubTab === 'temporary' && (
        <div className="space-y-6">
          {/* Temporary Allowances Card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-[#1B3A6B]">المخصصات المؤقتة والاستثنائية</h2>
                  <p className="text-[11px] text-slate-500">إدارة المخصصات المالية التي تمنح لمرة واحدة في شهر وسنة محددين مع تحديد موعد الدفع وسبب الصرف.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAddingTemp(!addingTemp)}
                  className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                >
                  <Plus size={12} />
                  مخصص مؤقت جديد
                </button>
                <button
                  type="button"
                  onClick={fetchCustomRecords}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                  title="تحديث القائمة"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Add/Edit Temporary Allowance Form */}
            {(addingTemp || editingTempRecord) && (
              <div className="p-5 bg-slate-50/70 border-b border-slate-150 animate-fadeIn">
                <form onSubmit={editingTempRecord ? handleUpdateTemporary : handleAddTemporary} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        {editingTempRecord ? 'تعديل اسم المخصص المؤقت *' : 'اسم المخصص المؤقت *'}
                      </label>
                      <input
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                        placeholder="مثال: مكافأة الأداء المتميز، مخصص استثنائي"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">طريقة الاحتساب *</label>
                      <select
                        value={tempCalcType}
                        onChange={(e) => setTempCalcType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                      >
                        <option value="flat">مبلغ مقطوع (د.ع)</option>
                        <option value="percentage">نسبة مئوية من الراتب الأساسي (%)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">القيمة *</label>
                      <input
                        type="number"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                        placeholder={tempCalcType === 'percentage' ? 'مثال: 10' : 'مثال: 150000'}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">موعد الدفع المالي *</label>
                      <select
                        value={tempTimingType}
                        onChange={(e) => setTempTimingType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                      >
                        <option value="single">موعد ثابت (شهر وسنة محددة)</option>
                        <option value="range">فترة زمنية محددة (من - إلى)</option>
                      </select>
                    </div>

                    {tempTimingType === 'single' ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">السنة المالية للدفع *</label>
                          <select
                            value={tempPaymentYear}
                            onChange={(e) => setTempPaymentYear(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                          >
                            {Array.from({ length: 31 }, (_, i) => new Date().getFullYear() - 10 + i).map(yr => (
                              <option key={yr} value={yr}>{yr}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">الشهر المالي للدفع *</label>
                          <select
                            value={tempPaymentMonth}
                            onChange={(e) => setTempPaymentMonth(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                              <option key={m} value={m}>{m} - {['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'][m-1]}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">بداية الفترة (من شهر/سنة) *</label>
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={tempStartMonth}
                              onChange={(e) => setTempStartMonth(e.target.value)}
                              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <select
                              value={tempStartYear}
                              onChange={(e) => setTempStartYear(e.target.value)}
                              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                            >
                              {Array.from({ length: 31 }, (_, i) => new Date().getFullYear() - 10 + i).map(yr => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">نهاية الفترة (إلى شهر/سنة) *</label>
                          <div className="grid grid-cols-2 gap-1">
                            <select
                              value={tempEndMonth}
                              onChange={(e) => setTempEndMonth(e.target.value)}
                              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                            <select
                              value={tempEndYear}
                              onChange={(e) => setTempEndYear(e.target.value)}
                              className="px-2 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                            >
                              {Array.from({ length: 31 }, (_, i) => new Date().getFullYear() - 10 + i).map(yr => (
                                <option key={yr} value={yr}>{yr}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700">طريقة تحديد المستفيدين *</label>
                      <select
                        value={tempBeneficiaryType}
                        onChange={(e) => setTempBeneficiaryType(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                      >
                        <option value="direct">إضافة موظفين بشكل مباشر</option>
                        <option value="category">تخصيصه لفئة محددة (شروط الاستحقاق)</option>
                      </select>
                    </div>
                  </div>

                  {/* Direct Employee Selection for Temporary Allowance */}
                  {tempBeneficiaryType === 'direct' && (
                    <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 animate-fadeIn">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        البحث وإضافة الموظفين المستفيدين مباشرة *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={employeeSearch}
                          onChange={(e) => setEmployeeSearch(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B] focus:bg-white"
                          placeholder="ابحث باسم الموظف، الرقم الوظيفي، رقم الشركة، العنوان أو القسم..."
                        />
                      </div>

                      {/* Search results */}
                      {employeeSearch.trim() !== '' && (
                        <div className="bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100 shadow-sm">
                          {employees.filter(emp => {
                            const query = employeeSearch.toLowerCase().trim();
                            const name = (emp.full_name || emp.fullName || emp.name || '').toLowerCase();
                            const code = String(emp.company_number || emp.companyNumber || emp.employee_code || emp.employeeCode || emp.id || '');
                            const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
                            const dep = (emp.department || '').toLowerCase();
                            return (name.includes(query) || code.includes(query) || title.includes(query) || dep.includes(query)) && !tempDirectEmployeeIds.map(String).includes(String(emp.id));
                          }).length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">لا توجد نتائج بحث مطابقة أو تم اختيار الموظفين بالفعل</div>
                          ) : (
                            employees.filter(emp => {
                              const query = employeeSearch.toLowerCase().trim();
                              const name = (emp.full_name || emp.fullName || emp.name || '').toLowerCase();
                              const code = String(emp.company_number || emp.companyNumber || emp.employee_code || emp.employeeCode || emp.id || '');
                              const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
                              const dep = (emp.department || '').toLowerCase();
                              return (name.includes(query) || code.includes(query) || title.includes(query) || dep.includes(query)) && !tempDirectEmployeeIds.map(String).includes(String(emp.id));
                            }).map(emp => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setTempDirectEmployeeIds(prev => [...prev, emp.id]);
                                  setEmployeeSearch('');
                                }}
                                className="w-full text-right px-4 py-2 hover:bg-slate-50 text-xs font-medium flex justify-between items-center transition-all"
                              >
                                <div className="flex flex-col text-right">
                                  <span className="font-bold text-slate-800">{emp.full_name || emp.name}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">رقم الشركة: {emp.company_number || 'بلا'} | الرقم الوظيفي: {emp.employee_code || emp.id} | {emp.job_title || emp.jobTitle || 'بدون عنوان'}</span>
                                </div>
                                <span className="text-[#1B3A6B] text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-md hover:bg-indigo-50">انقر للإضافة +</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      {/* Selected employees chips */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-500">المستفيدون المختارون حالياً ({tempDirectEmployeeIds.length}):</div>
                        {tempDirectEmployeeIds.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic">يرجى البحث واختيار موظف واحد على الأقل ليتم تطبيق هذا المخصص عليه.</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                            {tempDirectEmployeeIds.map(id => {
                              const emp = employees.find(e => String(e.id) === String(id));
                              if (!emp) return null;
                              return (
                                <div key={id} className="flex items-center gap-1.5 bg-white border border-slate-200 pl-1.5 pr-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-800 shadow-2xs">
                                  <span>{emp.full_name || emp.name} <span className="text-[9px] text-slate-400 font-normal">({emp.company_number || emp.employee_code || emp.id})</span></span>
                                  <button
                                    type="button"
                                    onClick={() => setTempDirectEmployeeIds(prev => prev.filter(x => x !== id))}
                                    className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded p-0.5 transition-all"
                                    title="إزالة"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">سبب صرف المخصص المؤقت *</label>
                    <input
                      type="text"
                      value={tempReason}
                      onChange={(e) => setTempReason(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                      placeholder="اكتب تفاصيل سبب صرف المخصص والمناسبة..."
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="submit"
                      className="bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
                    >
                      {editingTempRecord ? 'حفظ التعديلات' : 'حفظ المخصص المؤقت'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTemp(false);
                        setEditingTempRecord(null);
                        setTempName('');
                        setTempValue('');
                        setTempReason('');
                        setTempDirectEmployeeIds([]);
                        setTempTimingType('single');
                        setTempPaymentYear(new Date().getFullYear());
                        setTempPaymentMonth(new Date().getMonth() + 1);
                        setTempStartYear(new Date().getFullYear());
                        setTempStartMonth(new Date().getMonth() + 1);
                        setTempEndYear(new Date().getFullYear());
                        setTempEndMonth(new Date().getMonth() + 1);
                        setEmployeeSearch('');
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Temporary Allowances List */}
            <div className="p-0">
              {unfilteredRecords.filter(r => {
                const meta = getTempMeta(r.id);
                return r.type === 'allowance' && meta && meta.isTemporary;
              }).length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">
                  لا توجد مخصصات مؤقتة مضافة حالياً. اضغط "مخصص مؤقت جديد" لإدراج واحد.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50/70 border-b border-slate-100 text-[#1B3A6B] font-bold">
                      <tr>
                        <th className="px-5 py-3">اسم المخصص</th>
                        <th className="px-5 py-3">القيمة</th>
                        <th className="px-5 py-3">موعد الدفع (شهر/سنة)</th>
                        <th className="px-5 py-3">سبب الصرف</th>
                        <th className="px-5 py-3">طريقة الاستحقاق</th>
                        <th className="px-5 py-3 text-center">الحالة</th>
                        <th className="px-5 py-3 text-center w-52">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {unfilteredRecords
                        .filter(r => {
                          const meta = getTempMeta(r.id);
                          return r.type === 'allowance' && meta && meta.isTemporary;
                        })
                        .map(rec => {
                          const meta = getTempMeta(rec.id);
                          const isExpanded = expandedRuleId === rec.id;
                          return (
                            <Fragment key={rec.id}>
                              <tr className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5 text-[#1B3A6B] font-bold">{rec.name}</td>
                                <td className="px-5 py-3.5 font-mono">
                                  {rec.calcType === 'percentage' || rec.calc_type === 'percentage'
                                    ? `${rec.value}% من الراتب`
                                    : formatCurrency(rec.value)}
                                </td>
                                <td className="px-5 py-3.5">
                                  {meta.timingType === 'range' ? (
                                    <span className="bg-indigo-50 text-indigo-800 border border-indigo-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      من {meta.startMonth}/{meta.startYear} إلى {meta.endMonth}/{meta.endYear}
                                    </span>
                                  ) : (
                                    <span className="bg-amber-50 text-amber-800 border border-amber-100 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                      {meta.paymentMonth || 1} / {meta.paymentYear || new Date().getFullYear()}
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 max-w-xs truncate" title={meta.reason}>
                                  {meta.reason}
                                </td>
                                <td className="px-5 py-3.5 text-slate-600">
                                  {meta.beneficiaryType === 'direct' ? (
                                    <span className="text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md text-[10px] font-bold">
                                      موظفين محددين ({meta.directEmployeeIds?.length || 0})
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md text-[10px] font-bold">
                                      فئات محددة (شروط الاستحقاق)
                                    </span>
                                  )}
                                </td>
                                <td className="px-5 py-3.5 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    rec.status === 'فعال' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {rec.status === 'فعال' ? 'نشط' : 'متوقف'}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    {meta.beneficiaryType === 'category' ? (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRuleConfig(rec.id)}
                                        className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 font-bold text-[11px]"
                                      >
                                        <Sliders size={12} />
                                        تعديل الشروط
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveTempAllowanceIdForEmployees(activeTempAllowanceIdForEmployees === rec.id ? null : rec.id);
                                        }}
                                        className="text-violet-600 hover:text-violet-900 flex items-center gap-1 font-bold text-[11px]"
                                      >
                                        <Users size={12} />
                                        {activeTempAllowanceIdForEmployees === rec.id ? 'إخفاء الموظفين' : 'إدارة الموظفين'}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const nextStatus = rec.status === 'فعال' ? 'متوقف مؤقتاً' : 'فعال';
                                        await apiClient.entities.AllowanceDeduction.update(rec.id, { status: nextStatus });
                                        fetchCustomRecords();
                                        toast({ title: 'تم تحديث الحالة بنجاح' });
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-[#1B3A6B]"
                                      title={rec.status === 'فعال' ? 'تعطيل مؤقت' : 'تفعيل'}
                                    >
                                      {rec.status === 'فعال' ? <Pause size={13} /> : <Play size={13} />}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingTempRecord(rec);
                                        setTempName(rec.name);
                                        setTempCalcType(rec.calcType || rec.calc_type || 'flat');
                                        setTempValue(String(rec.value));
                                        setTempTimingType(meta.timingType || 'single');
                                        setTempPaymentYear(String(meta.paymentYear || new Date().getFullYear()));
                                        setTempPaymentMonth(String(meta.paymentMonth || 1));
                                        setTempStartYear(String(meta.startYear || new Date().getFullYear()));
                                        setTempStartMonth(String(meta.startMonth || 1));
                                        setTempEndYear(String(meta.endYear || new Date().getFullYear()));
                                        setTempEndMonth(String(meta.endMonth || 1));
                                        setTempReason(meta.reason || '');
                                        setTempBeneficiaryType(meta.beneficiaryType || 'direct');
                                        setTempDirectEmployeeIds(meta.directEmployeeIds || []);
                                        setAddingTemp(false);
                                      }}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                                      title="تعديل تفاصيل المخصص"
                                    >
                                      <Edit2 size={13} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteClick(rec.id, rec.name)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-rose-600"
                                      title="حذف"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {/* Rule Editor block for temporary category based */}
                              {meta.beneficiaryType === 'category' && isExpanded && currentRule && (
                                <tr>
                                  <td colSpan={7} className="px-6 py-4 bg-slate-50/40">
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-2 text-[#1B3A6B] font-bold text-xs">
                                        <Sliders size={14} />
                                        <span>شروط استحقاق المخصص المؤقت: {rec.name}</span>
                                      </div>

                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white p-4 rounded-xl border border-slate-200">
                                        {/* Grades */}
                                        <div className="space-y-1.5">
                                          <span className="text-[11px] font-bold text-slate-700 block">الدرجات المشمولة</span>
                                          <div className="flex flex-wrap gap-1">
                                            {[1,2,3,4,5,6,7,8,9,10].map(g => {
                                              const active = currentRule.grades?.includes(g);
                                              return (
                                                <button
                                                  key={g}
                                                  type="button"
                                                  onClick={() => toggleRuleValue('grades', g)}
                                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                    active ? 'bg-[#1B3A6B] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                                  }`}
                                                >
                                                  د{g}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {/* Steps */}
                                        <div className="space-y-1.5">
                                          <span className="text-[11px] font-bold text-slate-700 block">المراحل المشمولة</span>
                                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white border border-slate-150 rounded-lg">
                                            {[1,2,3,4,5,6,7,8,9,10,11].map(s => {
                                              const active = currentRule.steps?.includes(s);
                                              return (
                                                <button
                                                  key={s}
                                                  type="button"
                                                  onClick={() => toggleRuleValue('steps', s)}
                                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                    active ? 'bg-[#1B3A6B] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                  }`}
                                                >
                                                  م{s}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {/* Locations */}
                                        <div className="space-y-1.5">
                                          <span className="text-[11px] font-bold text-slate-700 block">موقع العمل</span>
                                          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white border border-slate-150 rounded-lg">
                                            {availableLocations.map(loc => {
                                              const active = currentRule.locations?.includes(loc);
                                              return (
                                                <button
                                                  key={loc}
                                                  type="button"
                                                  onClick={() => toggleRuleValue('locations', loc)}
                                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                                                    active ? 'bg-[#1B3A6B] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                  }`}
                                                >
                                                  {loc}
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {/* Statuses & Services */}
                                        <div className="space-y-1.5">
                                          <span className="text-[11px] font-bold text-slate-700 block">نوع الخدمة</span>
                                          <div className="flex flex-col gap-1 max-h-24 overflow-y-auto bg-white p-1.5 border border-slate-150 rounded-lg">
                                            {['دائم', 'عقد', 'مؤقت', 'إعارة'].map(srv => {
                                              const active = currentRule.serviceTypes?.includes(srv);
                                              return (
                                                <label key={srv} className="flex items-center gap-1 cursor-pointer text-[10px] font-bold text-slate-700">
                                                  <input
                                                    type="checkbox"
                                                    checked={active}
                                                    onChange={() => toggleRuleValue('serviceTypes', srv)}
                                                    className="rounded text-[#1B3A6B] focus:ring-0 w-3 h-3"
                                                  />
                                                  {srv}
                                                </label>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                                        <button
                                          type="button"
                                          onClick={() => handleSaveRule(rec.id)}
                                          className="bg-[#1B3A6B] hover:bg-[#152e54] text-white text-[11px] font-black px-4 py-2 rounded-xl flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                                        >
                                          <Check size={14} />
                                          حفظ الشروط
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleToggleRuleConfig(rec.id)}
                                          className="bg-slate-150 hover:bg-slate-200 text-slate-700 text-[11px] font-black px-4 py-2 rounded-xl transition-all"
                                        >
                                          إلغاء
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}

                              {/* Direct Employee Selector block */}
                              {meta.beneficiaryType === 'direct' && activeTempAllowanceIdForEmployees === rec.id && (
                                <tr>
                                  <td colSpan={7} className="px-6 py-4 bg-slate-50/50">
                                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                                      <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                                        <span className="text-xs font-bold text-[#1B3A6B]">قائمة الموظفين المستفيدين المباشرين ({meta.directEmployeeIds?.length || 0})</span>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-bold text-slate-600 block">البحث وإضافة موظف جديد للمستفيدين:</label>
                                          <div className="relative">
                                            <input
                                            type="text"
                                            placeholder="ابحث باسم الموظف، رقم الشركة، الرقم الوظيفي، العنوان أو القسم..."
                                            value={employeeSearch}
                                            onChange={(e) => setEmployeeSearch(e.target.value)}
                                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                                          />
                                          {employeeSearch.trim() !== '' && (
                                            <div className="absolute top-full left-0 right-0 z-50 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg mt-1 text-right">
                                              {employees
                                                .filter(emp => {
                                                  const query = employeeSearch.toLowerCase().trim();
                                                  const fullName = (emp.full_name || emp.fullName || emp.name || '').toLowerCase();
                                                  const code = String(emp.company_number || emp.companyNumber || emp.employee_code || emp.employeeCode || emp.id || '');
                                                  const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
                                                  const dep = (emp.department || '').toLowerCase();
                                                  const phone = (emp.phone || '').toLowerCase();
                                                  return fullName.includes(query) || code.includes(query) || title.includes(query) || dep.includes(query) || phone.includes(query);
                                                })
                                                .slice(0, 8)
                                                .map(emp => {
                                                  const isAdded = meta.directEmployeeIds?.map(String).includes(String(emp.id));
                                                  return (
                                                    <button
                                                      key={emp.id}
                                                      type="button"
                                                      disabled={isAdded}
                                                      onClick={() => {
                                                        const currentIds = meta.directEmployeeIds || [];
                                                        const nextIds = [...currentIds, emp.id];
                                                        const nextMeta = { ...meta, directEmployeeIds: nextIds };
                                                        saveTempMeta(rec.id, nextMeta);
                                                        setEmployeeSearch('');
                                                        fetchCustomRecords();
                                                        toast({ title: 'تمت إضافة الموظف للمستفيدين' });
                                                      }}
                                                      className="w-full text-right px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center disabled:opacity-50 border-b border-slate-100 last:border-b-0"
                                                    >
                                                      <div className="flex flex-col text-right">
                                                        <span className="font-bold text-slate-800">{emp.full_name}</span>
                                                        <span className="text-[10px] text-slate-500 font-mono">رقم الشركة: {emp.company_number || 'بلا'} | الرقم الوظيفي: {emp.employee_code || emp.id} | {emp.job_title || 'بلا عنوان'}</span>
                                                      </div>
                                                      {isAdded ? (
                                                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">مضاف مسبقاً</span>
                                                      ) : (
                                                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded hover:bg-indigo-100">إضافة</span>
                                                      )}
                                                    </button>
                                                  );
                                                })}
                                              {employees.filter(emp => {
                                                const query = employeeSearch.toLowerCase().trim();
                                                const fullName = (emp.full_name || emp.fullName || emp.name || '').toLowerCase();
                                                const code = String(emp.company_number || emp.companyNumber || emp.employee_code || emp.employeeCode || emp.id || '');
                                                const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
                                                const dep = (emp.department || '').toLowerCase();
                                                return fullName.includes(query) || code.includes(query) || title.includes(query) || dep.includes(query);
                                              }).length === 0 && (
                                                <div className="p-3 text-center text-slate-400 text-xs">لا يوجد نتائج تطابق البحث</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-600 block">البحث والفلترة داخل قائمة المستفيدين حالياً:</label>
                                        <input
                                          type="text"
                                          placeholder="ابحث بالاسم أو رقم الشركة لتصفية المضافين..."
                                          value={addedEmployeeSearch}
                                          onChange={(e) => setAddedEmployeeSearch(e.target.value)}
                                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#1B3A6B]"
                                        />
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 bg-slate-50 rounded-lg">
                                        {(meta.directEmployeeIds || []).filter(empId => {
                                          if (!addedEmployeeSearch.trim()) return true;
                                          const emp = employees.find(e => String(e.id) === String(empId));
                                          if (!emp) return false;
                                          const query = addedEmployeeSearch.toLowerCase().trim();
                                          const fullName = (emp.full_name || emp.fullName || emp.name || '').toLowerCase();
                                          const code = String(emp.company_number || emp.companyNumber || emp.employee_code || emp.employeeCode || emp.id || '');
                                          const title = (emp.job_title || emp.jobTitle || '').toLowerCase();
                                          const dep = (emp.department || '').toLowerCase();
                                          return fullName.includes(query) || code.includes(query) || title.includes(query) || dep.includes(query);
                                        }).map(empId => {
                                          const emp = employees.find(e => String(e.id) === String(empId));
                                          return (
                                            <div key={empId} className="flex items-center gap-1.5 bg-white text-slate-800 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200">
                                              <span>{emp?.full_name || emp?.name || empId} <span className="text-[9px] font-normal text-slate-400">({emp?.company_number || emp?.employee_code || empId})</span></span>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const nextIds = (meta.directEmployeeIds || []).filter(id => String(id) !== String(empId));
                                                  const nextMeta = { ...meta, directEmployeeIds: nextIds };
                                                  saveTempMeta(rec.id, nextMeta);
                                                  fetchCustomRecords();
                                                  toast({ title: 'تمت إزالة الموظف' });
                                                }}
                                                className="text-slate-400 hover:text-red-600 text-xs font-bold"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          );
                                        })}
                                        {(meta.directEmployeeIds || []).length === 0 && (
                                          <div className="text-center w-full py-3 text-slate-400 text-[11px]">لا يوجد موظفون مضافون حالياً. يرجى البحث والإضافة.</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Notice card */}
      <div className="bg-amber-50/60 rounded-2xl border border-amber-200/60 p-5 flex items-start gap-4">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0">
          <AlertCircle size={18} />
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-black text-amber-900">ملاحظة تنظيمية هامة</h3>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            يتم احتساب المخصصات الثابتة والمخصصة تلقائياً وتنعكس على الفور في سلم الراتب الشهري وجميع نماذج الرواتب النشطة ومحاكاة الرواتب للموظفين. يمكنك إعادة ترتيب المخصصات المخصصة عن طريق سحب الصفوف يدوياً لتغيير أولويتها أو ترتيب ظهورها في التقارير والمسيرات.
          </p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 animate-scaleIn shadow-2xl">
            <h3 className="text-sm font-black text-slate-900 mb-2">تأكيد حذف المخصص المخصص</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              هل أنت متأكد من رغبتك في حذف البند المالي المخصص <strong className="text-slate-800">"{deleteConfirm.name}"</strong>؟ هذا الإجراء نهائي ولا يمكن التراجع عنه وسيتوقف احتسابه فوراً من كافة كشوفات الرواتب.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDelete}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 rounded-xl transition-all shadow-md active:scale-95"
              >
                تأكيد الحذف
              </button>
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '' })}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
