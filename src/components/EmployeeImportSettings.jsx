import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, 
  RefreshCw, ShieldCheck, Users,
  Database, Check, ShieldAlert, RefreshCw as ReplaceIcon, ArrowRightLeft,
  FileCheck2, Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { validateEmployeeImportRow } from '@/lib/referentialIntegrity';

export default function EmployeeImportSettings() {
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
  const secondaryColor = appPublicSettings?.secondaryColor || '#C8960C';
  const { toast } = useToast();
  
  const [existingEmployees, setExistingEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [lookupJobTitles, setLookupJobTitles] = useState([]);
  const [lookupEducationDegrees, setLookupEducationDegrees] = useState([]);
  const [lookupShiftSystems, setLookupShiftSystems] = useState([]);
  
  // File processing state
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [headerError, setHeaderError] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  
  // Filtering & Selection state
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'valid', 'duplicate', 'invalid'
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  
  // Migration state
  const [migrating, setMigrating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [migrationSuccess, setMigrationSuccess] = useState(false);
  const [migrationReport, setMigrationReport] = useState(null);

  // Fetch current database employees and lookup data on mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const [emps, jts, eds, sss] = await Promise.all([
        apiClient.entities.Employee.list().catch(() => []),
        apiClient.entities.JobTitle.list().catch(() => []),
        apiClient.entities.EducationDegree.list().catch(() => []),
        apiClient.entities.ShiftSystem.list().catch(() => [])
      ]);
      setExistingEmployees(emps || []);
      setLookupJobTitles(jts || []);
      setLookupEducationDegrees(eds || []);
      setLookupShiftSystems(sss || []);
    } catch (err) {
      console.error('Error fetching data for import inspection:', err);
      toast({
        title: 'تنبيه',
        description: 'تعذر جلب بيانات النظام للتحقق من التكرار والإعدادات الحاكمة',
        variant: 'destructive',
      });
    } finally {
      setLoadingEmployees(false);
    }
  };

  // 1. Download Standard Excel Template with Data Validation & Options Sheet
  const handleDownloadTemplate = () => {
    // Helper to generate Excel column letters (0 -> A, 8 -> I, 26 -> AA, 51 -> AZ)
    const getColLetter = (colIdx) => {
      let letter = '';
      let temp = colIdx;
      while (temp >= 0) {
        letter = String.fromCharCode((temp % 26) + 65) + letter;
        temp = Math.floor(temp / 26) - 1;
      }
      return letter;
    };

    // Unified 66 Columns Definition matching database schema & UI form inputs
    const templateColumns = [
      // Personal Basics (1-8)
      { key: 'الاسم الأول', val1: 'عمر', val2: 'زينة' },
      { key: 'اسم الأب', val1: 'محمود', val2: 'عبد الله' },
      { key: 'اسم الجد', val1: 'سلمان', val2: 'جاسم' },
      { key: 'اسم والد الجد', val1: 'محيميد', val2: 'كريم' },
      { key: 'اللقب', val1: 'المياحي', val2: 'الربيعي' },
      { key: 'رقم الشركة الموحد', val1: '5001', val2: '5002' },
      { key: 'الرقم الوظيفي', val1: '100201', val2: '100202' },
      { key: 'الرقم الوطني', val1: '199012345678', val2: '199387654321' },

      // Demographics & Contact (9-17)
      { key: 'الجنس', val1: 'ذكر', val2: 'أنثى', validation: "'خيارات_النظام'!$A$2:$A$3" },
      { key: 'تاريخ الميلاد', val1: '1988-05-14', val2: '1992-09-20' },
      { key: 'محل الميلاد', val1: 'بغداد', val2: 'البصرة' },
      { key: 'الجنسية', val1: 'عراقي', val2: 'عراقي', validation: "'خيارات_النظام'!$B$2:$B$3" },
      { key: 'القومية', val1: 'عربي/ة', val2: 'كردي/ة', validation: "'خيارات_النظام'!$O$2:$O$9" },
      { key: 'الديانة', val1: 'مسلم', val2: 'مسلم', validation: "'خيارات_النظام'!$C$2:$C$7" },
      { key: 'الحالة الزوجية', val1: 'متزوج', val2: 'أعزب', validation: "'خيارات_النظام'!$D$2:$D$5" },
      { key: 'عدد الأطفال', val1: '2', val2: '0' },
      { key: 'فصيلة الدم', val1: 'O+', val2: 'A+', validation: "'خيارات_النظام'!$E$2:$E$10" },

      // IDs & Contact Info (18-29)
      { key: 'بطاقة السكن', val1: '12345678', val2: '87654321' },
      { key: 'البطاقة التموينية', val1: '123456789', val2: '987654321' },
      { key: 'شهادة الجنسية', val1: '987654', val2: '654321' },
      { key: 'رقم الجواز', val1: 'A1234567', val2: 'B8765432' },
      { key: 'عنوان السكن', val1: 'بغداد - الجادرية - محلة 901', val2: 'البصرة - الجزائر - محلة 204' },
      { key: 'رقم الهاتف', val1: '07701234567', val2: '07809876543' },
      { key: 'البريد الإلكتروني', val1: 'omar@company.iq', val2: 'zeina@company.iq' },
      { key: 'رقم إضبارة الموظف', val1: 'إضبارة-102', val2: 'إضبارة-103' },
      { key: 'رقم هوية الموظف', val1: 'BA-5001', val2: 'BA-5002' },
      { key: 'الرقم التقاعدي', val1: 'RET-12345', val2: 'RET-67890' },
      { key: 'رقم التصريح الأمني', val1: 'SEC-889', val2: 'SEC-990' },
      { key: 'تاريخ التصريح الأمني', val1: '2021-06-15', val2: '2022-01-10' },

      // Employment Administrative (30-35)
      { key: 'أمر التعيين', val1: 'أمر 123 لسنة 2012', val2: 'أمر 456 لسنة 2015' },
      { key: 'تاريخ أمر التعيين', val1: '2012-02-10', val2: '2015-11-01' },
      { key: 'تاريخ المباشرة الأولى', val1: '2012-03-01', val2: '2015-11-15' },
      { key: 'تاريخ المباشرة بالجهة الحالية', val1: '2015-01-01', val2: '2018-06-01' },
      { key: 'تاريخ العمل في القطاع النفطي', val1: '2012-03-01', val2: '2015-11-15' },
      { key: 'العنوان الوظيفي', val1: 'مهندس أقدم', val2: 'مبرمج أقدم' },

      // Responsibilities & Structure (36-40)
      { key: 'المسؤولية الأساسية', val1: 'مسؤول شعبة', val2: 'بلا مسؤولية', validation: "'خيارات_النظام'!$F$2:$F$10" },
      { key: 'المسؤولية بالوكالة', val1: 'بلا مسؤولية', val2: 'مسؤول شعبة', validation: "'خيارات_النظام'!$F$2:$F$10" },
      { key: 'درجة الوكيل', val1: 'لا يوجد', val2: 'وكيل أول', validation: "'خيارات_النظام'!$G$2:$G$4" },
      { key: 'القسم/الدائرة', val1: 'قسم تكنولوجيا المعلومات', val2: 'قسم تكنولوجيا المعلومات' },
      { key: 'الشعبة/الوحدة', val1: 'شعبة البرمجيات', val2: 'شعبة الشبكات' },

      // Service Status & Shift/Work Nature (41-51)
      { key: 'نوع الخدمة', val1: 'دائم', val2: 'دائم', validation: "'خيارات_النظام'!$H$2:$H$5" },
      { key: 'حالة الموظف', val1: 'مستمر', val2: 'مستمر', validation: "'خيارات_النظام'!$I$2:$I$8" },
      { key: 'رقم أمر الحالة', val1: '45/أ', val2: '' },
      { key: 'تاريخ أمر الحالة', val1: '2023-01-15', val2: '' },
      { key: 'ملاحظات حالة الموظف', val1: 'مستمر بالخدمة الفعلية', val2: '' },
      { key: 'طبيعة العمل', val1: 'مكتبي', val2: 'ميداني', validation: "'خيارات_النظام'!$J$2:$J$3" },
      { key: 'طبيعة الدوام', val1: 'صباحي', val2: 'مناوب', validation: "'خيارات_النظام'!$K$2:$K$3" },
      { key: 'نظام المناوبة', val1: '', val2: '14*14' },
      { key: 'عدد أيام دوام المناوبة', val1: '0', val2: '14' },
      { key: 'عدد أيام استراحة المناوبة', val1: '0', val2: '14' },
      { key: 'موقع العمل', val1: 'المقر الرئيسي', val2: 'موقع الرميلة الميداني' },

      // Salary Grade & Balances (52-56)
      { key: 'الدرجة الوظيفية', val1: '5', val2: '6', validation: "'خيارات_النظام'!$L$2:$L$14" },
      { key: 'المرحلة الوظيفية', val1: '3', val2: '2', validation: "'خيارات_النظام'!$M$2:$M$12" },
      { key: 'تاريخ الدرجة الحالية', val1: '2021-01-01', val2: '2022-06-01' },
      { key: 'رصيد الإجازات الاعتيادية الابتدائي', val1: '36', val2: '24' },
      { key: 'رصيد الإجازات المرضية الابتدائي', val1: '12', val2: '6' },

      // Education & Qualifications (57-61)
      { key: 'التحصيل الدراسي', val1: 'بكالوريوس', val2: 'ماجستير', validation: "'خيارات_النظام'!$N$2:$N$11" },
      { key: 'التخصص الدقيق', val1: 'هندسة حاسبات', val2: 'علوم حاسوب' },
      { key: 'الجامعة / المعهد', val1: 'جامعة بغداد', val2: 'جامعة البصرة' },
      { key: 'سنة التخرج', val1: '2010', val2: '2014' },
      { key: 'رقم أمر احتساب الشهادة', val1: 'أمر 441 لسنة 2011', val2: 'أمر 980 لسنة 2015' },

      // Retirement Extension (62-66)
      { key: 'رقم أمر تمديد التقاعد', val1: '', val2: 'أمر 88 لسنة 2024' },
      { key: 'تاريخ أمر تمديد التقاعد', val1: '', val2: '2024-01-01' },
      { key: 'سنوات تمديد التقاعد', val1: '0', val2: '2' },
      { key: 'أشهر تمديد التقاعد', val1: '0', val2: '0' },
      { key: 'ملاحظة تمديد التقاعد', val1: '', val2: 'تمديد لحاجة العمل' }
    ];

    const headers = templateColumns.map(col => col.key);
    const sampleRow1 = templateColumns.map(col => col.val1);
    const sampleRow2 = templateColumns.map(col => col.val2);

    const wsData = [headers, sampleRow1, sampleRow2];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set Column Widths nicely
    ws['!cols'] = headers.map(() => ({ wch: 22 }));

    // Define System Options for Sheet 2 (خيارات_النظام)
    const optionsData = [
      [
        'الجنس', 
        'الجنسية', 
        'الديانة', 
        'الحالة الزوجية', 
        'فصيلة الدم', 
        'المسؤولية الأساسية', 
        'درجة الوكيل', 
        'نوع الخدمة', 
        'حالة الموظف', 
        'طبيعة العمل', 
        'طبيعة الدوام', 
        'الدرجة الوظيفية', 
        'المرحلة الوظيفية', 
        'التحصيل الدراسي',
        'القومية'
      ],
      ['ذكر', 'عراقي', 'مسلم', 'أعزب', 'A+', 'بلا مسؤولية', 'لا يوجد', 'دائم', 'مستمر', 'مكتبي', 'صباحي', '1', '1', 'دكتوراه', 'عربي/ة'],
      ['أنثى', 'أخرى', 'مسيحي', 'متزوج', 'A-', 'مسؤول وجبة', 'وكيل أول', 'مؤقت', 'منسب', 'ميداني', 'مناوب', '2', '2', 'ماجستير', 'كردي/ة'],
      ['', '', 'صابئي', 'مطلق', 'B+', 'مسؤول وحدة', 'وكيل ثاني', 'عقد', 'منقول', '', '', '3', '3', 'دبلوم عالي', 'تركماني/ة'],
      ['', '', 'يزيدي', 'أرمل', 'B-', 'مسؤول شعبة', '', 'إعارة', 'متقاعد', '', '', '4', '4', 'بكالوريوس', 'كلداني/ة'],
      ['', '', 'أخرى', '', 'AB+', 'مدير قسم', '', '', 'مستقيل', '', '', '5', '5', 'دبلوم', 'آشوري/ة'],
      ['', '', 'غير محدد', '', 'AB-', 'مدير قسم مركزي', '', '', 'موقوف', '', '', '6', '6', 'إعدادية', 'سرياني/ة'],
      ['', '', '', '', 'O+', 'مدير هيئة', '', '', 'مجاز', '', '', '7', '7', 'متوسطة', 'أرمني/ة'],
      ['', '', '', '', 'O-', 'معاون مدير عام', '', '', '', '', '', '8', '8', 'ابتدائية', 'أخرى'],
      ['', '', '', '', 'غير معروف', 'مدير عام', '', '', '', '', '', '9', '9', 'يقرأ ويكتب', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '10', '10', 'بدون', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '11', '11', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '12', '', '', ''],
      ['', '', '', '', '', '', '', '', '', '', '', '13', '', '', '']
    ];

    const optionsWs = XLSX.utils.aoa_to_sheet(optionsData);
    optionsWs['!cols'] = optionsData[0].map(() => ({ wch: 22 }));

    // Generate strict cell data validations dynamically based on exact column index
    const dataValidations = templateColumns
      .map((col, idx) => {
        if (!col.validation) return null;
        const colLetter = getColLetter(idx);
        return {
          sqref: `${colLetter}2:${colLetter}1000`,
          type: 'list',
          formula1: col.validation,
          allowBlank: true,
        };
      })
      .filter(Boolean);

    ws['!dataValidation'] = dataValidations;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات الموظفين');
    XLSX.utils.book_append_sheet(wb, optionsWs, 'خيارات_النظام');

    XLSX.writeFile(wb, 'نموذج_استيراد_الموظفين_النظام_العراقي_المكتمل.xlsx');

    toast({
      title: 'تم تنزيل النموذج المطور الشامل بنجاح',
      description: 'تم إصلاح محاذاة كافة الحقول الـ 52 وتحديث القوائم المنسدلة للنموذج.',
    });
  };

  // Helper to normalize header key string
  const cleanKey = (k) => {
    if (!k) return '';
    return String(k).trim().replace(/\s+/g, ' ').replace(/[^\u0621-\u064Aa-zA-Z0-9]/g, '');
  };

  // Helper to find matching value from row object
  const getColValue = (rowObj, possibleKeys) => {
    for (const p of possibleKeys) {
      const normalizedP = cleanKey(p);
      for (const [k, v] of Object.entries(rowObj)) {
        if (cleanKey(k) === normalizedP || cleanKey(k).includes(normalizedP)) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            return String(v).trim();
          }
        }
      }
    }
    return '';
  };

  // 2. Read and Inspect Excel File
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setFileName(uploadedFile.name);
    inspectExcelFile(uploadedFile);
  };

  const inspectExcelFile = (fileToRead) => {
    setInspecting(true);
    setHeaderError(null);
    setParsedRows([]);
    setMigrationSuccess(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];

        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawData || rawData.length === 0) {
          setHeaderError('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.');
          setInspecting(false);
          return;
        }

        // Map database existing employees by company_number (primary duplicate key) and civil_service_number
        const dbCompanyMap = new Map();
        const dbCivilMap = new Map();

        existingEmployees.forEach(emp => {
          if (emp.company_number) {
            dbCompanyMap.set(String(emp.company_number).trim(), emp);
          }
          if (emp.civil_service_number) {
            dbCivilMap.set(String(emp.civil_service_number).trim(), emp);
          }
        });

        // Track occurrences within the Excel file itself
        const excelCompanyMap = new Map(); // companyNumber -> index of first row

        const processed = rawData.map((row, idx) => {
          const rowNum = idx + 2;

          const firstName = getColValue(row, ['الاسم الأول', 'الاسم الاول', 'اسم الموظف']);
          const fatherName = getColValue(row, ['اسم الأب', 'اسم الاب']);
          const grandfatherName = getColValue(row, ['اسم الجد']);
          const greatGrandfatherName = getColValue(row, ['اسم والد الجد', 'الاسم الرابع']);
          const surname = getColValue(row, ['اللقب', 'العشيرة']);
          const fullNameFromCol = getColValue(row, ['الاسم الكامل', 'الاسم الرباعي', 'الاسم الخماسي']);

          const constructedFullName = [firstName, fatherName, grandfatherName, greatGrandfatherName].filter(Boolean).join(' ');
          const fullName = constructedFullName || fullNameFromCol;

          const companyNumber = getColValue(row, ['رقم الشركة الموحد', 'رقم الشركة', 'كود الموظف']);
          const civilServiceNumber = getColValue(row, ['الرقم الوظيفي', 'رقم وزارة التخطيط', 'الرقم المالي']);
          const nationalId = getColValue(row, ['الرقم الوطني', 'الرقم القومي', 'الموحدة', 'رقم الهوية']);
          const gender = getColValue(row, ['الجنس', 'النوع']) || 'ذكر';
          const birthDate = getColValue(row, ['تاريخ الميلاد', 'تاريخ ولادة']);
          const birthPlace = getColValue(row, ['محل الميلاد', 'محل الولادة']);
          const nationality = getColValue(row, ['الجنسية']) || 'عراقي';
          const ethnicity = getColValue(row, ['القومية']) || 'عربي/ة';
          const religion = getColValue(row, ['الديانة']) || 'مسلم';
          const maritalStatus = getColValue(row, ['الحالة الزوجية']) || 'أعزب';
          const childrenCount = getColValue(row, ['عدد الأطفال', 'عدد الاطفال']) || '0';
          const phone = getColValue(row, ['رقم الهاتف', 'الهاتف', 'الموبايل']);
          const email = getColValue(row, ['البريد الإلكتروني', 'البريد الالكتروني', 'الإيميل']);
          const address = getColValue(row, ['عنوان السكن', 'العنوان']);
          const residenceCard = getColValue(row, ['بطاقة السكن', 'رقم بطاقة السكن']);
          const rationCard = getColValue(row, ['البطاقة التموينية', 'رقم البطاقة التموينية']);
          const nationalityCert = getColValue(row, ['شهادة الجنسية', 'رقم شهادة الجنسية']);
          const passportNumber = getColValue(row, ['رقم الجواز', 'جواز السفر']);
          const bloodType = getColValue(row, ['فصيلة الدم']);
          
          const serviceRecordNumber = getColValue(row, ['رقم إضبارة الموظف', 'رقم الاضبارة']);
          const employeeIdNumber = getColValue(row, ['رقم هوية الموظف', 'باج الموظف']);
          const retirementNumber = getColValue(row, ['الرقم التقاعدي', 'رقم التقاعد']);
          const securityClearanceNumber = getColValue(row, ['رقم التصريح الأمني', 'التصريح الأمني']);
          const securityClearanceDate = getColValue(row, ['تاريخ التصريح الأمني']);

          const firstAppointmentDate = getColValue(row, ['تاريخ المباشرة الأولى', 'تاريخ اول تعيين']);
          const currentAppointmentDate = getColValue(row, ['تاريخ المباشرة بالجهة الحالية', 'تاريخ المباشرة الحالية', 'المباشرة الحالية']);
          const oilSectorStartDate = getColValue(row, ['تاريخ العمل في القطاع النفطي', 'تاريخ الخدمة النفطية', 'تاريخ النفط']);
          const appointmentDate = getColValue(row, ['تاريخ أمر التعيين', 'تاريخ التعيين']);
          const appointmentOrder = getColValue(row, ['أمر التعيين', 'امر التعيين']);

          const jobTitle = getColValue(row, ['العنوان الوظيفي', 'المسمى الوظيفي']);
          const primaryResponsibility = getColValue(row, ['المسؤولية الأساسية', 'المسؤولية']) || 'بلا مسؤولية';
          const actingResponsibility = getColValue(row, ['المسؤولية بالوكالة', 'مسؤولية الوكالة']) || 'بلا وكالة';
          const deputyLevel = getColValue(row, ['درجة الوكيل']) || 'لا يوجد';
          const department = getColValue(row, ['القسم/الدائرة', 'القسم', 'الدائرة']);
          const section = getColValue(row, ['الشعبة/الوحدة', 'الشعبة', 'الوحدة']);
          const serviceType = getColValue(row, ['نوع الخدمة', 'نوع الملاك', 'الصفة']) || 'دائم';
          const status = getColValue(row, ['حالة الموظف', 'الحالة']) || 'مستمر';
          const statusOrderNumber = getColValue(row, ['رقم أمر الحالة']);
          const statusOrderDate = getColValue(row, ['تاريخ أمر الحالة']);
          const statusNotes = getColValue(row, ['ملاحظات حالة الموظف', 'ملاحظات الحالة']);
          const workNature = getColValue(row, ['طبيعة العمل']) || 'مكتبي';
          const workShiftType = getColValue(row, ['طبيعة الدوام', 'نوع الدوام']) || 'صباحي';
          const shiftSystemName = getColValue(row, ['نظام المناوبة', 'اسم نظام المناوبة']);
          const shiftWorkDays = getColValue(row, ['عدد أيام دوام المناوبة', 'أيام دوام المناوبة', 'أيام المناوبة']);
          const shiftRestDays = getColValue(row, ['عدد أيام استراحة المناوبة', 'أيام استراحة المناوبة']);
          const workLocation = getColValue(row, ['موقع العمل', 'مقر العمل']);

          let grade = getColValue(row, ['الدرجة الوظيفية', 'الدرجة']);
          let step = getColValue(row, ['المرحلة الوظيفية', 'المرحلة']);
          grade = grade ? String(grade).replace(/[^\d]/g, '') : '';
          step = step ? String(step).replace(/[^\d]/g, '') : '';
          const gradeDate = getColValue(row, ['تاريخ الدرجة الحالية', 'تاريخ الترفيع']);
          const initialRegularLeaveBalance = getColValue(row, ['رصيد الإجازات الاعتيادية الابتدائي', 'رصيد الاعتيادية']);
          const initialSickLeaveBalance = getColValue(row, ['رصيد الإجازات المرضية الابتدائي', 'رصيد المرضية']);

          const educationLevel = getColValue(row, ['التحصيل الدراسي', 'الشهادة', 'مستوى الدراسة']) || 'بكالوريوس';
          const specialization = getColValue(row, ['التخصص الدقيق', 'التخصص', 'الفرع']);
          const university = getColValue(row, ['الجامعة / المعهد', 'الجامعة']);
          const graduationYear = getColValue(row, ['سنة التخرج']);
          const educationOrder = getColValue(row, ['رقم أمر احتساب الشهادة', 'أمر الشهادة']);

          const retirementExtensionOrderNumber = getColValue(row, ['رقم أمر تمديد التقاعد', 'أمر تمديد التقاعد']);
          const retirementExtensionOrderDate = getColValue(row, ['تاريخ أمر تمديد التقاعد', 'تاريخ تمديد التقاعد']);
          const retirementExtensionYears = getColValue(row, ['سنوات تمديد التقاعد', 'سنوات التمديد']);
          const retirementExtensionMonths = getColValue(row, ['أشهر تمديد التقاعد', 'اشهر تمديد التقاعد', 'أشهر التمديد']);
          const retirementExtensionNote = getColValue(row, ['ملاحظة تمديد التقاعد', 'ملاحظات تمديد التقاعد', 'سبب التمديد']);

          const errors = [];
          const warnings = [];

          // 1. Mandatory Field Checks
          if (!firstName && !fullName) {
            errors.push('الاسم الأول مفقود');
          }
          if (!companyNumber) {
            errors.push('رقم الشركة الموحد مفقود (المفتاح الأساسي للمطابقة)');
          }
          if (!grade) {
            errors.push('الدرجة الوظيفية مفقودة');
          }
          if (!step) {
            errors.push('المرحلة الوظيفية مفقودة');
          }

          // 2. Authoritative Settings Validation (مطابقة الجداول الحاكمة)
          const settingsCheck = validateEmployeeImportRow(
            {
              firstName: firstName || fullName,
              fullName,
              companyNumber,
              jobTitle,
              educationLevel,
              shiftSystemName,
              workShiftType,
              grade,
              step
            },
            {
              jobTitles: lookupJobTitles,
              educationDegrees: lookupEducationDegrees,
              shiftSystems: lookupShiftSystems
            }
          );

          if (!settingsCheck.isValid) {
            settingsCheck.errors.forEach(err => {
              if (!errors.includes(err)) errors.push(err);
            });
          }

          // 3. Duplication Checks
          let isFileDuplicate = false;
          let isDbDuplicate = false;
          let matchedDbEmployee = null;

          // Check Internal Excel Duplication first by company_number
          if (companyNumber) {
            if (excelCompanyMap.has(companyNumber)) {
              isFileDuplicate = true;
              const originalRow = excelCompanyMap.get(companyNumber);
              warnings.push(`مكرر بداخل ملف الاكسل نفسه (الصف ${originalRow}) برقم الشركة (${companyNumber})`);
            } else {
              excelCompanyMap.set(companyNumber, rowNum);
            }
          }

          // Check System Database Duplication second by company_number or civil_service_number
          if (companyNumber && dbCompanyMap.has(companyNumber)) {
            isDbDuplicate = true;
            matchedDbEmployee = dbCompanyMap.get(companyNumber);
            warnings.push(`مسجل سابقاً بالنظام برقم الشركة (${companyNumber}) - [الاسم: ${matchedDbEmployee.full_name || matchedDbEmployee.first_name}]`);
          } else if (civilServiceNumber && dbCivilMap.has(civilServiceNumber)) {
            isDbDuplicate = true;
            matchedDbEmployee = dbCivilMap.get(civilServiceNumber);
            warnings.push(`مسجل سابقاً بالنظام بالرقم الوظيفي (${civilServiceNumber}) - [الاسم: ${matchedDbEmployee.full_name || matchedDbEmployee.first_name}]`);
          }

          // Determine Overall Row Status
          let rowStatus = 'valid'; // 🟢
          if (errors.length > 0) {
            rowStatus = 'invalid'; // 🔴
          } else if (isDbDuplicate || isFileDuplicate) {
            rowStatus = 'duplicate'; // 🟡
          }

          // Default Action for duplicates: 'update' (استبدال وتحديث المعلومات), for valid: 'insert'
          const duplicateAction = (isDbDuplicate || isFileDuplicate) ? 'update' : 'insert';

          return {
            rowIndex: idx,
            excelRowNumber: rowNum,
            status: rowStatus,
            duplicateAction, // 'update' (استبدال), 'skip' (عدم استبدال/تجاوز), 'insert' (إضافة جديد)
            isDbDuplicate,
            isFileDuplicate,
            matchedDbEmployee,
            errors,
            warnings,
            data: {
              first_name: firstName,
              father_name: fatherName,
              grandfather_name: grandfatherName,
              great_grandfather_name: greatGrandfatherName,
              surname,
              full_name: fullName,
              company_number: companyNumber,
              civil_service_number: civilServiceNumber,
              national_id: nationalId,
              gender,
              birth_date: birthDate,
              birth_place: birthPlace,
              nationality,
              ethnicity,
              religion,
              marital_status: maritalStatus,
              children_count: parseInt(childrenCount) || 0,
              phone,
              email,
              address,
              residence_card: residenceCard,
              ration_card: rationCard,
              nationality_cert: nationalityCert,
              passport_number: passportNumber,
              blood_type: bloodType,
              service_record_number: serviceRecordNumber,
              employee_id_number: employeeIdNumber,
              retirement_number: retirementNumber,
              security_clearance_number: securityClearanceNumber,
              security_clearance_date: securityClearanceDate,
              first_appointment_date: firstAppointmentDate,
              current_appointment_date: currentAppointmentDate,
              oil_sector_start_date: oilSectorStartDate,
              appointment_date: appointmentDate,
              appointment_order: appointmentOrder,
              job_title: jobTitle || 'موظف',
              primary_responsibility: primaryResponsibility,
              acting_responsibility: actingResponsibility,
              deputy_level: deputyLevel,
              department: department || 'لم يحدد بعد',
              section,
              service_type: serviceType,
              status,
              status_order_number: statusOrderNumber,
              status_order_date: statusOrderDate,
              status_notes: statusNotes,
              work_nature: workNature,
              work_shift_type: workShiftType,
              shift_system_name: shiftSystemName,
              shift_work_days: parseInt(shiftWorkDays) || 0,
              shift_rest_days: parseInt(shiftRestDays) || 0,
              work_location: workLocation,
              grade: grade ? parseInt(grade) : 10,
              step: step ? parseInt(step) : 1,
              grade_date: gradeDate,
              initial_regular_leave_balance: parseInt(initialRegularLeaveBalance) || 0,
              initial_sick_leave_balance: parseInt(initialSickLeaveBalance) || 0,
              education_level: educationLevel,
              specialization,
              university,
              graduation_year: parseInt(graduationYear) || undefined,
              education_order: educationOrder,
              retirement_extension_order_number: retirementExtensionOrderNumber,
              retirement_extension_order_date: retirementExtensionOrderDate,
              retirement_extension_years: parseInt(retirementExtensionYears) || 0,
              retirement_extension_months: parseInt(retirementExtensionMonths) || 0,
              retirement_extension_note: retirementExtensionNote,
            }
          };
        });

        setParsedRows(processed);

        // Pre-select all valid AND duplicate rows set to 'update'
        const initialSelected = new Set(
          processed.filter(r => r.status === 'valid' || (r.status === 'duplicate' && r.duplicateAction === 'update')).map(r => r.rowIndex)
        );
        setSelectedIndices(initialSelected);

        toast({
          title: 'اكتمل مطابقة وفحص الملف بنجاح',
          description: `تم تدقيق ${processed.length} موظفاً وتحديد المكررات برقم الشركة مع خيارات الاستبدال.`,
        });

      } catch (err) {
        console.error('Error reading excel file:', err);
        setHeaderError('فشل قراءة الملف! يرجى التأكد من أن صيغة الملف هي Excel (.xlsx أو .xls) وغير تالفة.');
      } finally {
        setInspecting(false);
      }
    };

    reader.readAsArrayBuffer(fileToRead);
  };

  // Change individual duplicate row action
  const handleRowActionChange = (rowIndex, action) => {
    setParsedRows(prev => prev.map(r => {
      if (r.rowIndex === rowIndex) {
        return { ...r, duplicateAction: action };
      }
      return r;
    }));

    // If set to skip, automatically uncheck selection, if update or insert, check selection
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (action === 'skip') {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  // Bulk action buttons for duplicates
  const setAllDuplicatesAction = (action) => {
    setParsedRows(prev => prev.map(r => {
      if (r.status === 'duplicate') {
        return { ...r, duplicateAction: action };
      }
      return r;
    }));

    setSelectedIndices(prev => {
      const next = new Set(prev);
      parsedRows.filter(r => r.status === 'duplicate').forEach(r => {
        if (action === 'skip') {
          next.delete(r.rowIndex);
        } else {
          next.add(r.rowIndex);
        }
      });
      return next;
    });

    toast({
      title: 'تم تحديث خيار المكررات',
      description: action === 'update' ? 'تم ضبط جميع الموظفين المكررين للاستبدال والتحديث' : 'تم ضبط جميع الموظفين المكررين لعدم الاستبدال (التجاوز)',
    });
  };

  // Checkbox Selection handlers
  const toggleSelectRow = (idx) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllValid = () => {
    const validIndices = parsedRows.filter(r => r.status === 'valid' || r.status === 'duplicate').map(r => r.rowIndex);
    setSelectedIndices(new Set(validIndices));
  };

  const clearSelection = () => {
    setSelectedIndices(new Set());
  };

  // Calculated Inspection Stats
  const totalCount = parsedRows.length;
  const validCount = parsedRows.filter(r => r.status === 'valid').length;
  const duplicateCount = parsedRows.filter(r => r.status === 'duplicate').length;
  const invalidCount = parsedRows.filter(r => r.status === 'invalid').length;

  const filteredRows = parsedRows.filter(r => {
    if (statusFilter === 'valid') return r.status === 'valid';
    if (statusFilter === 'duplicate') return r.status === 'duplicate';
    if (statusFilter === 'invalid') return r.status === 'invalid';
    return true;
  });

  // Selected for migration items
  const selectedRowsList = parsedRows.filter(r => selectedIndices.has(r.rowIndex));

  // 3. Confirm & Execute Bulk Migration
  const handleConfirmMigration = async () => {
    if (selectedRowsList.length === 0) {
      toast({
        title: 'تنبيه',
        description: 'يرجى تحديد موظف واحد على الأقل للترحيل.',
        variant: 'destructive',
      });
      return;
    }

    setMigrating(true);
    setShowConfirmModal(false);

    try {
      const payloadEmployees = selectedRowsList.map(r => ({
        action: r.duplicateAction || 'insert',
        data: r.data
      }));

      const token = localStorage.getItem('hr_session_token');
      const res = await fetch('/api/employees/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ employees: payloadEmployees })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'فشلت عملية ترحيل الموظفين');
      }

      const result = await res.json();

      setMigrationReport({
        totalCount: result.totalCount || selectedRowsList.length,
        acceptedCount: result.acceptedCount || 0,
        rejectedCount: result.rejectedCount || 0,
        insertedCount: result.insertedCount || 0,
        updatedCount: result.updatedCount || 0,
        rejectedRows: result.rejectedRows || []
      });

      if (result.rejectedCount > 0) {
        toast({
          title: 'اكتمل الترحيل مع رفض بعض الصفوف ⚠️',
          description: `تم قبول ${result.acceptedCount} صفاً بنجاح، ورفض ${result.rejectedCount} صفاً لعدم مطابقة الإعدادات الحاكمة.`,
          variant: 'warning'
        });
      } else {
        toast({
          title: 'تم الترحيل والمطابقة بنجاح 🚀',
          description: `تمت إضافة ${result.insertedCount || 0} جديد، واستبدال وتحديث ${result.updatedCount || 0} موظفاً بنجاح في قاعدة البيانات.`,
        });
      }

      setMigrationSuccess(true);
      fetchEmployees();

    } catch (err) {
      console.error('Migration error:', err);
      toast({
        title: 'خطأ أثناء الترحيل',
        description: err.message || 'تعذر ترحيل البيانات إلى النظام',
        variant: 'destructive',
      });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      
      {/* Migration Results Report (If migration completed) */}
      {migrationReport && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-2xl ${migrationReport.rejectedCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {migrationReport.rejectedCount > 0 ? <AlertTriangle size={24} /> : <FileCheck2 size={24} />}
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1B3A6B]">
                  تقرير نتائج الاستيراد والمطابقة مع الجداول الحاكمة
                </h3>
                <p className="text-xs text-slate-500">
                  إجمالي الصفوف: <strong>{migrationReport.totalCount}</strong> | المقبولة: <strong className="text-emerald-700">{migrationReport.acceptedCount}</strong> (إضافة: {migrationReport.insertedCount}، تحديث: {migrationReport.updatedCount}) | المرفوضة: <strong className="text-red-700">{migrationReport.rejectedCount}</strong>
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setMigrationReport(null)}
              className="text-xs font-bold rounded-xl"
            >
              إغلاق التقرير
            </Button>
          </div>

          {migrationReport.rejectedCount > 0 ? (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 font-semibold flex items-center gap-2">
                <Ban size={16} className="shrink-0 text-red-600" />
                تم رفض الصفوف التالية ولم يتم إدخالها لقاعدة البيانات نظراً لعدم مطابقتها للجداول الحاكمة (العناوين الوظيفية، الشهادات، المناوبات، أو سلم الرواتب):
              </div>

              <div className="overflow-x-auto rounded-xl border border-red-200">
                <table className="w-full text-xs text-right border-collapse">
                  <thead className="bg-red-100/70 text-red-900 font-bold border-b border-red-200">
                    <tr>
                      <th className="px-4 py-2.5 w-16 text-center">رقم الصف</th>
                      <th className="px-4 py-2.5">رقم الشركة الموحد</th>
                      <th className="px-4 py-2.5">اسم الموظف</th>
                      <th className="px-4 py-2.5">سبب الرفض الدقيق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100 bg-white">
                    {migrationReport.rejectedRows.map((rej, rejIdx) => (
                      <tr key={rejIdx} className="hover:bg-red-50/50">
                        <td className="px-4 py-2.5 text-center font-mono font-bold text-red-800">{rej.rowNumber}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{rej.companyNumber || '-'}</td>
                        <td className="px-4 py-2.5 font-bold text-slate-900">{rej.name}</td>
                        <td className="px-4 py-2.5 text-red-700 font-semibold leading-relaxed">
                          {rej.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-700 shrink-0" />
              تم قبول واعتماد جميع الصفوف بنجاح ومطابقتها بالكامل مع الجداول الحاكمة وسلم الرواتب.
            </div>
          )}
        </div>
      )}

      {/* Top Banner & Header */}
      <div 
        className="text-white rounded-2xl p-6 shadow-md border border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative overflow-hidden transition-all duration-300"
        style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, #0d1f3c 100%)` }}
      >
        <div 
          className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full blur-3xl pointer-events-none" 
          style={{ backgroundColor: `${secondaryColor}25` }}
        />
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/10 rounded-xl">
              <FileSpreadsheet style={{ color: secondaryColor }} size={24} />
            </div>
            <h2 className="text-lg font-black tracking-wide text-white">إدارة واستيراد بيانات الموظفين (Excel Import)</h2>
          </div>
          <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
            استيراد ومطابقة بيانات الموظفين الشاملة (66 حقل مغطية لقيد الموظف بالكامل) مع نموذج القوائم المنسدلة، ومطابقة التكرار المباشر برقم الشركة مع خيارات الاستبدال والتحديث الذكي.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleDownloadTemplate}
          style={{
            backgroundColor: secondaryColor,
            color: '#0f172a',
            boxShadow: `0 4px 14px ${secondaryColor}40`
          }}
          className="font-black text-xs rounded-xl px-5 py-3 gap-2 shrink-0 border border-white/20 hover:brightness-110 active:scale-95 transition-all relative z-10"
        >
          <Download size={16} />
          تنزيل نموذج Excel المطور الشامل (66 حقل - قيد كامل)
        </Button>
      </div>

      {/* Upload Zone & Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* File Dropzone */}
        <div className="md:col-span-8 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: primaryColor }}>
            <Upload size={18} style={{ color: primaryColor }} />
            خطوة 1: رفع ملف Excel وقراءته
          </h3>

          <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 transition-colors rounded-2xl p-8 text-center bg-slate-50/50 flex flex-col items-center justify-center gap-3">
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: `${primaryColor}15`,
                color: primaryColor
              }}
            >
              <FileSpreadsheet size={28} />
            </div>
            
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-800">
                {fileName ? `الملف المحدد: ${fileName}` : 'اسحب ملف Excel هنا أو اضغط للاختيار'}
              </p>
              <p className="text-xs text-slate-500">يدعم صيغ .xlsx و .xls و .csv بحجم أقصى 10 ميغابايت</p>
            </div>

            <div className="flex items-center gap-3 mt-2">
              <label 
                style={{
                  backgroundColor: primaryColor,
                  color: '#ffffff',
                  boxShadow: `0 4px 12px ${primaryColor}30`
                }}
                className="cursor-pointer text-xs font-bold px-5 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 hover:brightness-110 active:scale-95"
              >
                <Upload size={14} />
                اختر ملف من الجهاز
                <input 
                  type="file" 
                  accept=".xlsx, .xls, .csv" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
              </label>

              {parsedRows.length > 0 && (
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setFileName('');
                    setParsedRows([]);
                    setHeaderError(null);
                  }}
                  className="rounded-xl text-xs font-bold text-red-600 border-red-200 hover:bg-red-50"
                >
                  إلغاء الملف
                </Button>
              )}
            </div>
          </div>

          {inspecting && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-center gap-3 text-blue-800 text-xs font-bold animate-pulse">
              <RefreshCw className="animate-spin" size={16} />
              جاري فحص وتدقيق هيكل البيانات وتتبع التكرارات برقم الشركة مع بيانات النظام...
            </div>
          )}

          {headerError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-red-800 text-xs">
              <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold mb-0.5">خطأ توافق الشيت:</p>
                <p>{headerError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Requirements Card */}
        <div className="md:col-span-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-[#1B3A6B] flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            آلية مطابقة وتحديد التكرار
          </h4>
          <ul className="text-[11px] text-slate-600 space-y-2 leading-relaxed">
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 font-bold">1.</span>
              <span><strong>المطابقة برقم الشركة:</strong> يُعتبر رقم الشركة الموحد هو المعيار الرئيسي لمنع وتحديد التكرار.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 font-bold">2.</span>
              <span><strong>تكرار الشيت الداخلي:</strong> يتم رصد تكرار رقم الشركة بين صفوف الشيت نفسه أولاً.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 font-bold">3.</span>
              <span><strong>تكرار قاعدة البيانات:</strong> تُطابق الأرقام مع السجلات الحالية بالنظام فوراً.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-600 font-bold">4.</span>
              <span><strong>قرار الاستبدال:</strong> يمكنك اختيار <strong>[استبدال وتحديث]</strong> لتحديث سجل الموظف أو <strong>[عدم الاستبدال]</strong> لتجاوزه.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Inspection Results Dashboard (If File Parsed) */}
      {parsedRows.length > 0 && (
        <div className="space-y-6">
          
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            {/* Total */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500">إجمالي سجلات الملف</p>
                <p className="text-2xl font-black text-[#1B3A6B] mt-1">{totalCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Users size={20} />
              </div>
            </div>

            {/* Valid Ready */}
            <div className={`bg-white p-4 rounded-2xl border ${validCount > 0 ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200/80'} shadow-sm flex items-center justify-between`}>
              <div>
                <p className="text-[11px] font-bold text-emerald-700">سجلات جديدة سليمة 🟢</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{validCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <CheckCircle2 size={20} />
              </div>
            </div>

            {/* Duplicates */}
            <div className={`bg-white p-4 rounded-2xl border ${duplicateCount > 0 ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200/80'} shadow-sm flex items-center justify-between`}>
              <div>
                <p className="text-[11px] font-bold text-amber-700">بيانات مكررة (رقم الشركة) 🟡</p>
                <p className="text-2xl font-black text-amber-700 mt-1">{duplicateCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <ArrowRightLeft size={20} />
              </div>
            </div>

            {/* Invalid */}
            <div className={`bg-white p-4 rounded-2xl border ${invalidCount > 0 ? 'border-red-200 bg-red-50/20' : 'border-slate-200/80'} shadow-sm flex items-center justify-between`}>
              <div>
                <p className="text-[11px] font-bold text-red-700">بيانات غير صالحة 🔴</p>
                <p className="text-2xl font-black text-red-700 mt-1">{invalidCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-800 flex items-center justify-center">
                <XCircle size={20} />
              </div>
            </div>

          </div>

          {/* Table Container & Filter Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            
            {/* Header & Controls */}
            <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              
              <div>
                <h3 className="text-sm font-bold text-[#1B3A6B] flex items-center gap-2">
                  <ShieldAlert size={18} className="text-blue-600" />
                  جدول التثبت والتوجيه لاستيراد/استبدال الموظفين
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  محدد حالياً <strong className="text-blue-700">{selectedIndices.size}</strong> موظفاً للترحيل الفعلي
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-[#1B3A6B] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  الكل ({totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('valid')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'valid' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'}`}
                >
                  الجديدة (🟢 {validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('duplicate')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'duplicate' ? 'bg-amber-600 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-50'}`}
                >
                  المكررة (🟡 {duplicateCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('invalid')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'invalid' ? 'bg-red-600 text-white shadow-sm' : 'text-red-700 hover:bg-red-50'}`}
                >
                  الغير صالحة (🔴 {invalidCount})
                </button>
              </div>

            </div>

            {/* Quick Bulk Selection Buttons & Batch Actions for Duplicates */}
            <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAllValid} className="h-8 rounded-lg text-xs font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-50">
                  تحديد الكل الجاهز
                </Button>
                <Button size="sm" variant="ghost" onClick={clearSelection} className="h-8 rounded-lg text-xs font-bold text-slate-500">
                  إلغاء التحديد
                </Button>
              </div>

              {/* Batch duplicate controls */}
              {duplicateCount > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 p-1.5 rounded-xl">
                  <span className="text-[11px] font-bold text-amber-900 px-2">إجراء المكررات الجماعي:</span>
                  <Button 
                    size="sm" 
                    onClick={() => setAllDuplicatesAction('update')}
                    className="h-7 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg px-3 gap-1"
                  >
                    <ReplaceIcon size={12} /> استبدال وتحديث الكُل ({duplicateCount})
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setAllDuplicatesAction('skip')}
                    className="h-7 text-amber-800 border-amber-300 hover:bg-amber-100 text-[11px] font-bold rounded-lg px-3"
                  >
                    عدم الاستبدال (تجاوز الكُل)
                  </Button>
                </div>
              )}

              {migrationSuccess && (
                <div className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full text-xs flex items-center gap-1">
                  <CheckCircle2 size={13} /> تم ترحيل وتحديث السجلات بنجاح في قاعدة البيانات
                </div>
              )}
            </div>

            {/* Detailed Inspection Table */}
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100/80 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th className="px-4 py-3 text-center w-12">ترحيل؟</th>
                    <th className="px-4 py-3 font-bold">رقم الشركة الموحد</th>
                    <th className="px-4 py-3 font-bold">اسم الموظف والعنوان الوظيفي</th>
                    <th className="px-4 py-3 font-bold">الدرجة والمرحلة والشهادة</th>
                    <th className="px-4 py-3 font-bold">حالة المطابقة والتكرار</th>
                    <th className="px-4 py-3 font-bold text-center w-48">إجراء الاستبدال / المعالجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.map((item) => {
                    const isSelected = selectedIndices.has(item.rowIndex);
                    
                    return (
                      <tr 
                        key={item.rowIndex} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          item.status === 'invalid' ? 'bg-red-50/30' : item.status === 'duplicate' ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-center font-mono text-slate-400 font-bold">
                          {item.excelRowNumber}
                        </td>

                        <td className="px-4 py-3 text-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            disabled={item.status === 'invalid' || item.duplicateAction === 'skip'}
                            onChange={() => toggleSelectRow(item.rowIndex)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                          />
                        </td>

                        <td className="px-4 py-3 font-mono text-xs">
                          <span className="font-black text-blue-900 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                            {item.data.company_number || 'مفقود'}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-bold text-[#1B3A6B]">
                          <div>
                            <p className="text-sm font-bold">{item.data.full_name || 'بدون اسم'}</p>
                            <p className="text-[11px] text-slate-500 font-semibold">{item.data.job_title} - {item.data.department}</p>
                          </div>
                        </td>

                        <td className="px-4 py-3 font-mono text-xs">
                          <div className="space-y-0.5">
                            <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded border border-emerald-200 text-[11px]">
                              د {item.data.grade} / م {item.data.step}
                            </span>
                            <p className="text-[10px] text-slate-500 font-sans">{item.data.education_level}</p>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs">
                          {item.status === 'valid' && (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                              <CheckCircle2 size={12} /> سجل جديد غير مكرر
                            </span>
                          )}

                          {item.status === 'duplicate' && (
                            <div className="space-y-1">
                              <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                                <AlertTriangle size={12} /> مكرر برقم الشركة ({item.data.company_number})
                              </span>
                              {item.warnings.map((w, wIdx) => (
                                <p key={wIdx} className="text-[10px] text-amber-900 font-semibold leading-tight">
                                  • {w}
                                </p>
                              ))}
                            </div>
                          )}

                          {item.status === 'invalid' && (
                            <div className="space-y-1">
                              <span className="bg-red-100 text-red-800 border border-red-300 px-2.5 py-1 rounded-full text-[11px] font-bold inline-flex items-center gap-1">
                                <XCircle size={12} /> غير صالح للترحيل
                              </span>
                              {item.errors.map((e, eIdx) => (
                                <p key={eIdx} className="text-[10px] text-red-700 font-semibold">
                                  • {e}
                                </p>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Duplication Action Dropdown / Selector */}
                        <td className="px-4 py-3 text-center">
                          {item.status === 'duplicate' ? (
                            <select
                              value={item.duplicateAction}
                              onChange={(e) => handleRowActionChange(item.rowIndex, e.target.value)}
                              className="w-full text-xs font-bold border-2 border-amber-400 bg-amber-50/90 text-amber-900 rounded-xl px-2 py-1.5 focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-sm"
                            >
                              <option value="update">🔄 استبدال وتحديث بيانات الموظف</option>
                              <option value="skip">⏭️ عدم الاستبدال (تجاوز وتجاهل الصف)</option>
                              <option value="insert">➕ إضافة كـ سجل جديد منفصل</option>
                            </select>
                          ) : item.status === 'valid' ? (
                            <span className="text-emerald-700 font-bold text-[11px]">إضافة كـ جديد</span>
                          ) : (
                            <span className="text-red-500 font-bold text-[11px]">يتطلب تصحيح</span>
                          )}
                        </td>

                      </tr>
                    );
                  })}

                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400 font-bold">
                        لا توجد سجلات تنطبق عليها تصفية العرض المحددة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Action Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-600 font-medium">
                سيتم معالجة <strong>{selectedIndices.size}</strong> موظفاً وفق خيارات الاستبدال والتحديث المحددة لكل صف.
              </div>

              <Button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={selectedIndices.size === 0 || migrating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-6 py-2.5 gap-2 shadow-sm shrink-0"
              >
                {migrating ? <RefreshCw className="animate-spin" size={15} /> : <Database size={15} />}
                تنفيذ الترحيل والاستبدال الموحد ({selectedIndices.size} موظف)
              </Button>
            </div>

          </div>

        </div>
      )}

      {/* Confirmation Approval Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            
            <div className="flex items-center gap-3 text-emerald-700 border-b border-slate-100 pb-3">
              <div className="p-2.5 bg-emerald-100 rounded-xl">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-[#1B3A6B]">موافقة مدير النظام على الاستبدال والترحيل</h3>
                <p className="text-xs text-slate-500">تأكيد الاعتماد المالي والإداري النهائي</p>
              </div>
            </div>

            <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-4 text-xs text-blue-900 space-y-2">
              <p className="font-bold">ملخص السجلات المحددة للمعالجة:</p>
              <ul className="space-y-1 list-disc list-inside text-[11px]">
                <li>عدد الموظفين المحدد للتنفيذ: <strong>{selectedIndices.size} موظفاً</strong></li>
                <li>الموظفون المحددون بـ <strong>[استبدال وتحديث]</strong> سيتم تحديث سجلاتهم المالية والإدارية الحالية بنفس رقم الشركة.</li>
                <li>الموظفون الجدد سيتم إنشاء سجل موحد وتسكينهم بالدرجة والمرحلة تلقائياً.</li>
              </ul>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              هل أنت متأكد من تنفيذ عملية الترحيل والاستبدال في قاعدة البيانات الحالية للنظام؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-xl text-xs font-bold"
              >
                إلغاء
              </Button>

              <Button
                type="button"
                onClick={handleConfirmMigration}
                disabled={migrating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl px-5 gap-2"
              >
                {migrating ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                تأكيد وبدء الترحيل والاستبدال
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
