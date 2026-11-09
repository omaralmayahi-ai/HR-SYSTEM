// جدول سلم الرواتب الحالي لجمهورية العراق
// الدرجات من 1 إلى 10، المراحل من 1 إلى 11
// الأرقام بالدينار العراقي

export const SALARY_TABLE = {
  1: { 1: 910000, 2: 930000, 3: 950000, 4: 970000, 5: 990000, 6: 1010000, 7: 1030000, 8: 1050000, 9: 1070000, 10: 1090000, 11: 1110000 },
  2: { 1: 723000, 2: 740000, 3: 757000, 4: 774000, 5: 791000, 6: 808000, 7: 825000, 8: 842000, 9: 859000, 10: 876000, 11: 893000 },
  3: { 1: 600000, 2: 610000, 3: 620000, 4: 630000, 5: 640000, 6: 650000, 7: 660000, 8: 670000, 9: 680000, 10: 690000, 11: 700000 },
  4: { 1: 509000, 2: 517000, 3: 525000, 4: 533000, 5: 541000, 6: 549000, 7: 557000, 8: 565000, 9: 573000, 10: 581000, 11: 589000 },
  5: { 1: 429000, 2: 435000, 3: 441000, 4: 447000, 5: 453000, 6: 459000, 7: 465000, 8: 471000, 9: 477000, 10: 483000, 11: 489000 },
  6: { 1: 362000, 2: 368000, 3: 374000, 4: 380000, 5: 386000, 6: 392000, 7: 398000, 8: 404000, 9: 410000, 10: 416000, 11: 422000 },
  7: { 1: 296000, 2: 302000, 3: 308000, 4: 314000, 5: 320000, 6: 326000, 7: 332000, 8: 338000, 9: 344000, 10: 350000, 11: 356000 },
  8: { 1: 260000, 2: 263000, 3: 266000, 4: 269000, 5: 272000, 6: 275000, 7: 278000, 8: 281000, 9: 284000, 10: 287000, 11: 290000 },
  9: { 1: 210000, 2: 213000, 3: 216000, 4: 219000, 5: 222000, 6: 225000, 7: 228000, 8: 231000, 9: 234000, 10: 237000, 11: 240000 },
  10: { 1: 170000, 2: 173000, 3: 176000, 4: 179000, 5: 182000, 6: 185000, 7: 188000, 8: 191000, 9: 194000, 10: 197000, 11: 200000 },
  11: { 1: 2413000, 2: 2496000, 3: 2579000, 4: 2662000, 5: 2745000, 6: 2828000, 7: 2911000, 8: 2994000, 9: 3077000, 10: 3160000, 11: 3243000 },
  12: { 1: 2000000, 2: 2083000, 3: 2166000, 4: 2249000, 5: 2332000, 6: 2415000, 7: 2498000, 8: 2581000, 9: 2664000, 10: 2747000, 11: 2830000 },
  13: { 1: 1500000, 2: 1583000, 3: 1666000, 4: 1749000, 5: 1832000, 6: 1915000, 7: 1998000, 8: 2081000, 9: 2164000, 10: 2247000, 11: 2330000 }
};

// سنوات الخدمة/الترفيع المحددة لكل درجة
const defaultPromotionYears = {
  1: null,
  2: 5,
  3: 5,
  4: 5,
  5: 5,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 4,
  11: null,
  12: null,
  13: null
};

// مقدار مبلغ الزيادة في العلاوة السنوية لكل درجة
const defaultAnnualIncrements = {
  1: 20000,
  2: 17000,
  3: 10000,
  4: 8000,
  5: 6000,
  6: 6000,
  7: 6000,
  8: 3000,
  9: 3000,
  10: 3000,
  11: 83000,
  12: 83000,
  13: 83000
};

const isClient = typeof window !== 'undefined';

export const PROMOTION_YEARS = { ...defaultPromotionYears };
export const ANNUAL_INCREMENTS = { ...defaultAnnualIncrements };

if (isClient) {
  try {
    const savedPromo = localStorage.getItem('PROMOTION_YEARS');
    if (savedPromo) {
      Object.assign(PROMOTION_YEARS, JSON.parse(savedPromo));
    }
  } catch (e) {
    console.error('Error loading PROMOTION_YEARS', e);
  }

  try {
    const savedIncrements = localStorage.getItem('ANNUAL_INCREMENTS');
    if (savedIncrements) {
      Object.assign(ANNUAL_INCREMENTS, JSON.parse(savedIncrements));
    }
  } catch (e) {
    console.error('Error loading ANNUAL_INCREMENTS', e);
  }
}

export function updatePromotionYear(grade, years) {
  PROMOTION_YEARS[grade] = years === null || years === undefined || years === '' ? null : parseInt(years);
  if (isClient) {
    localStorage.setItem('PROMOTION_YEARS', JSON.stringify(PROMOTION_YEARS));
  }
}

export function deletePromotionYear(grade) {
  PROMOTION_YEARS[grade] = null;
  if (isClient) {
    localStorage.setItem('PROMOTION_YEARS', JSON.stringify(PROMOTION_YEARS));
  }
}

export function updateAnnualIncrement(grade, amount) {
  ANNUAL_INCREMENTS[grade] = amount === null || amount === undefined || amount === '' ? 0 : parseInt(amount);
  if (isClient) {
    localStorage.setItem('ANNUAL_INCREMENTS', JSON.stringify(ANNUAL_INCREMENTS));
  }
}

export function deleteAnnualIncrement(grade) {
  ANNUAL_INCREMENTS[grade] = 0;
  if (isClient) {
    localStorage.setItem('ANNUAL_INCREMENTS', JSON.stringify(ANNUAL_INCREMENTS));
  }
}

// ============================================================================
// القيم القانونية الافتراضية
// ============================================================================

// مخصصات الشهادة والحرفة — قانون رواتب موظفي الدولة والقطاع العام رقم 22 لسنة 2008،
// المادة 11/أولاً (الشهادة) و11/ثانياً (الحرفة 15% لغير حملة الشهادات المذكورة).
// النسب من الراتب الاسمي (راتب الجدول). لا يوجد في المادة 11 أي "مخصص شهادة عليا إضافي".
export const LEGAL_EDUCATION_DEGREES = [
  { name: 'دكتوراه', is_higher_education: true, allowance_rate: 100, higher_allowance_rate: 0, baseline_grade: 5, baseline_step: 1 },
  { name: 'ماجستير', is_higher_education: true, allowance_rate: 75, higher_allowance_rate: 0, baseline_grade: 6, baseline_step: 1 },
  { name: 'دبلوم عالي', is_higher_education: true, allowance_rate: 55, higher_allowance_rate: 0, baseline_grade: 6, baseline_step: 1 },
  { name: 'بكالوريوس', is_higher_education: false, allowance_rate: 45, higher_allowance_rate: 0, baseline_grade: 7, baseline_step: 1 },
  { name: 'دبلوم فني', is_higher_education: false, allowance_rate: 35, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1 },
  // "دبلوم" هو الاسم المستخدم في بيانات الموظفين للدبلوم الفني (سنتان بعد الإعدادية)
  { name: 'دبلوم', is_higher_education: false, allowance_rate: 35, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1 },
  { name: 'إعدادية', is_higher_education: false, allowance_rate: 25, higher_allowance_rate: 0, baseline_grade: 8, baseline_step: 1 },
  // ما دون الإعدادية: مخصصات حرفة 15% (المادة 11/ثانياً)
  { name: 'متوسطة', is_higher_education: false, allowance_rate: 15, higher_allowance_rate: 0, baseline_grade: 9, baseline_step: 1 },
  { name: 'ابتدائية', is_higher_education: false, allowance_rate: 15, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1 },
  { name: 'يقرأ ويكتب', is_higher_education: false, allowance_rate: 15, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1 },
  { name: 'دون الابتدائية (يقرأ ويكتب)', is_higher_education: false, allowance_rate: 15, higher_allowance_rate: 0, baseline_grade: 10, baseline_step: 1 },
];

// مخصصات المنصب (كنسبة من الراتب الاسمي) — قانون 22 لسنة 2008، المادة 10:
// 30% معاون مدير عام؛ 25% مدير (مدير إدارة تشكيل دون مستوى دائرة)؛ 20% مدير قسم؛
// 15% معاونو مديري التشكيلات ورؤساء/مسؤولو الشُّعب.
// القيمة null تعني: المسمّى غير منصوص عليه في المادة 10 ونسبته **يُتحقق** منها
// (لا تُصرف تلقائياً حتى يُعرَّف لها سند في شاشة مخصصات المسؤولية والمنصب).
export const RESPONSIBILITY_ALLOWANCE_RATES = {
  "معاون مدير عام": 0.30,
  "مدير": 0.25,
  "مدير قسم": 0.20,
  "مسؤول شعبة": 0.15,
  "رئيس شعبة": 0.15,
  "معاون مدير": 0.15,
  "مدير عام": null,        // يُتحقق — غير وارد في المادة 10
  "مدير هيئة": null,       // يُتحقق — مقابلة بفئات المادة 10 غير محسومة
  "مدير قسم مركزي": null,  // يُتحقق
  "مسؤول وحدة": null,      // يُتحقق
  "مسؤول وجبة": null,      // يُتحقق
  "بلا مسؤولية": 0.00
};

// مخصص الإعالة (الزوجية) — المادة 14 من القانون 22 لسنة 2008 بنصها المعدل بالقانون 103 لسنة 2012
export const SPOUSE_ALLOWANCE = 50000;

// مخصص الأطفال لكل طفل حتى الطفل الرابع — المادة 14 المعدلة
export const CHILD_ALLOWANCE = 10000;
export const DEFAULT_MAX_CHILDREN = 4;

// نسبة الاستقطاع التقاعدي (حصة الموظف 10% من الراتب الوظيفي دون المخصصات)
// وفق قانون التقاعد الموحد رقم 9 لسنة 2014
export const RETIREMENT_RATE = 0.10;

// ============================================================================
// فئات البنود (بدلاً من استنتاج النوع من كلمات في الاسم)
// ============================================================================
export const ITEM_CATEGORIES = {
  SPOUSE: 'spouse',
  CHILD: 'child',
  RETIREMENT: 'retirement',
  CERTIFICATE: 'certificate',
  POSITION: 'position',
  TAX: 'tax',
  GENERAL: 'general',
};

const KNOWN_CATEGORIES = new Set(Object.values(ITEM_CATEGORIES));

// تطبيع خفيف للمقارنة الحرفية للاسم كاملاً (ليس بحثاً عن جزء من الاسم)
export function normalizeItemName(name) {
  return String(name ?? '')
    .replace(/[ً-ْـ]/g, '') // التشكيل والتطويل
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

const certificateLegacyNames = [];
['دكتوراه', 'ماجستير', 'دبلوم عالي', 'بكالوريوس', 'دبلوم فني', 'دبلوم', 'إعدادية', 'متوسطة', 'ابتدائية'].forEach(d => {
  certificateLegacyNames.push(`مخصصات شهادة ${d}`, `مخصص شهادة ${d}`, `مخصصات شهادة ال${d}`);
});

// أسماء البنود القديمة المعروفة (تطابق الاسم كاملاً فقط) — للتوافق مع السجلات التي أُنشئت قبل إضافة حقل الفئة
const LEGACY_CATEGORY_NAMES = {
  [ITEM_CATEGORIES.SPOUSE]: [
    'مخصصات الزوجية المقطوعة', 'مخصصات الزوجية الثابتة', 'مخصصات الزوجية', 'مخصص الزوجية',
    'المخصص الزوجي', 'المخصصات الزوجية', 'الزوجية', 'مخصصات الإعالة', 'مخصص الإعالة', 'مخصصات الزوجية والإعالة',
  ],
  [ITEM_CATEGORIES.CHILD]: [
    'مخصصات الأطفال (لكل طفل)', 'مخصصات الأطفال لكل طفل', 'مخصصات الأطفال', 'مخصص الأطفال', 'مخصص الطفل',
    'مخصصات الأولاد', 'مخصص الأولاد', 'مخصصات الأولاد (لكل ولد)', 'مخصص الأولاد (لكل ولد)', 'الأطفال', 'الأولاد',
  ],
  [ITEM_CATEGORIES.RETIREMENT]: [
    'استقطاع توفير التقاعد الوطني', 'استقطاع التقاعد', 'الاستقطاع التقاعدي', 'استقطاع تقاعدي',
    'التوقيفات التقاعدية', 'استقطاع التوقيفات التقاعدية', 'التقاعد', 'نسبة الاستقطاع التقاعدي الموحد',
  ],
  [ITEM_CATEGORIES.CERTIFICATE]: [
    'مخصصات الشهادة', 'مخصص الشهادة', 'مخصصات شهادة', 'مخصصات الشهادة والحرفة', 'مخصصات الحرفة', ...certificateLegacyNames,
  ],
  [ITEM_CATEGORIES.POSITION]: [
    'مخصصات منصب / إشرافية', 'مخصصات منصب', 'مخصصات المنصب', 'مخصص المنصب', 'مخصصات المسؤولية',
    'مخصصات المسؤولية والمنصب', 'مخصصات إشرافية',
  ],
  [ITEM_CATEGORIES.TAX]: [
    'استقطاع ضريبة الدخل المباشرة', 'استقطاع ضريبة الدخل', 'ضريبة الدخل',
  ],
};

const LEGACY_NAME_TO_CATEGORY = new Map();
Object.entries(LEGACY_CATEGORY_NAMES).forEach(([cat, names]) => {
  names.forEach(n => LEGACY_NAME_TO_CATEGORY.set(normalizeItemName(n), cat));
});

/**
 * يُرجع فئة البند: الحقل الصريح `category` أولاً، ثم مطابقة الاسم كاملاً مع أسماء البنود القديمة المعروفة.
 * لا يُستخدم البحث عن كلمة داخل الاسم إطلاقاً ("مخصصات المولدات" ليست مخصص أطفال).
 */
export function getItemCategory(item) {
  if (!item) return ITEM_CATEGORIES.GENERAL;
  const explicit = item.category ?? item.item_category ?? item.itemCategory;
  if (explicit && KNOWN_CATEGORIES.has(String(explicit))) return String(explicit);
  const type = item.type;
  const legacy = LEGACY_NAME_TO_CATEGORY.get(normalizeItemName(item.name));
  if (!legacy) return ITEM_CATEGORIES.GENERAL;
  // تحقق من اتساق الاتجاه: التقاعد والضريبة استقطاعات، والبقية مخصصات
  const isDeductionType = type === 'deduction' || type === 'M_DEDUCTION';
  const isDeductionCat = legacy === ITEM_CATEGORIES.RETIREMENT || legacy === ITEM_CATEGORIES.TAX;
  if (type && isDeductionType !== isDeductionCat) return ITEM_CATEGORIES.GENERAL;
  return legacy;
}

// ============================================================================
// أدوات مساعدة
// ============================================================================
const hasBrowserStorage = () => {
  try {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (e) {
    return false;
  }
};

function readStorage(key) {
  if (!hasBrowserStorage()) return null;
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function readStorageJson(key, warnings) {
  const raw = readStorage(key);
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    if (warnings) warnings.push(`تعذّرت قراءة الإعداد المحلي ${key}`);
    return null;
  }
}

const toNumber = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

const ACTIVE_STATUSES = new Set(['فعال', 'active', 'نشط', 'مفعل']);
const INACTIVE_STATUSES = new Set(['متوقف مؤقتاً', 'متوقف', 'موقوف', 'inactive', 'غير فعال', 'معطل']);

function statusFlag(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value).trim();
  if (ACTIVE_STATUSES.has(s)) return true;
  if (INACTIVE_STATUSES.has(s)) return false;
  return undefined;
}

function parseDateOnly(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getPeriod(targetMonth, targetYear) {
  const now = new Date();
  const month = parseInt(targetMonth || (now.getMonth() + 1), 10);
  const year = parseInt(targetYear || now.getFullYear(), 10);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { month, year, start, end };
}

function parseJsonArray(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// ============================================================================
// الشروط والاستحقاق
// ============================================================================

// Helper to check if an employee matches custom allowance/deduction criteria
export function doesEmployeeMatchCriteria(employee, rule) {
  if (!rule) return true;

  const matchesCondition = (empVal, ruleArray) => {
    if (!ruleArray || !Array.isArray(ruleArray) || ruleArray.length === 0) return true; // no restriction
    if (empVal === undefined || empVal === null || empVal === '') return false;
    const normalizedRuleArray = ruleArray.map(item => String(item).trim().toLowerCase());
    const normalizedEmpVal = String(empVal).trim().toLowerCase();
    return normalizedRuleArray.includes(normalizedEmpVal);
  };

  const matchesGrade = matchesCondition(employee.grade, rule.grades);
  const matchesStep = matchesCondition(employee.step, rule.steps);
  const matchesEducation = matchesCondition(employee.education_level || employee.educationLevel, rule.educations);
  const matchesResponsibility = matchesCondition(employee.primary_responsibility || employee.primaryResponsibility, rule.responsibilities);
  const matchesLocation = matchesCondition(employee.work_location || employee.workLocation, rule.locations);
  const matchesTitle = matchesCondition(employee.job_title || employee.jobTitle, rule.titles);
  const matchesWorkNature = matchesCondition(employee.work_nature || employee.workNature, rule.workNatures);
  const matchesDept = matchesCondition(employee.department, rule.departments);
  const matchesStatus = matchesCondition(employee.status || employee.employeeStatus, rule.employeeStatuses);
  const matchesMarital = matchesCondition(employee.marital_status || employee.maritalStatus, rule.maritalStatuses);
  const matchesServiceType = matchesCondition(employee.service_type || employee.serviceType, rule.serviceTypes);

  const matchesGender = matchesCondition(employee.gender, rule.genders);
  const matchesEthnicity = matchesCondition(employee.ethnicity || employee.nationality, rule.ethnicities || rule.nationalities);
  const matchesReligion = matchesCondition(employee.religion, rule.religions);
  const matchesActingResponsibility = matchesCondition(employee.acting_responsibility || employee.actingResponsibility, rule.actingResponsibilities);
  const matchesDeputyLevel = matchesCondition(employee.deputy_level || employee.deputyLevel || employee.deputy_status || employee.deputyStatus, rule.deputyLevels || rule.deputyStatuses);
  const matchesWorkShiftType = matchesCondition(employee.work_shift_type || employee.workShiftType, rule.workShiftTypes);

  const empShiftSys = String(employee.shift_system_name || employee.shiftSystemName || employee.shift_system_id || employee.shiftSystemId || '');
  const matchesShiftSystem = matchesCondition(empShiftSys, rule.shiftSystems);

  return (
    matchesGrade &&
    matchesStep &&
    matchesEducation &&
    matchesResponsibility &&
    matchesLocation &&
    matchesTitle &&
    matchesWorkNature &&
    matchesDept &&
    matchesStatus &&
    matchesMarital &&
    matchesServiceType &&
    matchesGender &&
    matchesEthnicity &&
    matchesReligion &&
    matchesActingResponsibility &&
    matchesDeputyLevel &&
    matchesWorkShiftType &&
    matchesShiftSystem
  );
}

/**
 * تقييم قاعدة استحقاق/حجب لموظف. يفشل مغلقاً: أي خطأ في التقييم = غير مستحق + تحذير.
 * @returns {{ matched: boolean, error: string|null }}
 */
export function evaluateEmployeeRule(employee, rule) {
  if (rule === null || rule === undefined) return { matched: true, error: null }; // لا شروط = للجميع
  try {
    const parsed = typeof rule === 'string' ? JSON.parse(rule) : rule;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('صيغة الشروط غير صالحة');
    }

    // 1. Blocklist check (حجب)
    const empId = employee.id;
    const empNum = employee.employee_number || employee.employeeNumber || employee.civil_service_number || employee.civilServiceNumber;
    const blocked = parsed.blockedEmployees;
    if (blocked !== undefined && blocked !== null && !Array.isArray(blocked)) {
      throw new Error('قائمة الحجب غير صالحة');
    }
    if (blocked && blocked.length > 0) {
      const blockedSet = new Set(blocked.map(String));
      if ((empId !== undefined && empId !== null && blockedSet.has(String(empId))) || (empNum && blockedSet.has(String(empNum)))) {
        return { matched: false, error: null };
      }
    }

    // 2. Evaluate criteria
    return { matched: doesEmployeeMatchCriteria(employee, parsed), error: null };
  } catch (e) {
    return { matched: false, error: e?.message || String(e) };
  }
}

// Helper to check if an employee matches custom allowance/deduction rules.
// `rule` يمكن تمريره صراحة؛ وإلا يُقرأ من localStorage (توافق قديم في المتصفح فقط).
// فشل التقييم لا يمنح البند (fail closed) ويُضاف تحذير إلى `warnings` إن مُرِّرت.
export function checkEmployeeMatchesRule(employee, allowanceId, rule = undefined, warnings = null) {
  let effectiveRule = rule;
  if (effectiveRule === undefined) {
    const raw = readStorage(`ALLOWANCE_RULES_${allowanceId}`);
    effectiveRule = raw ? raw : null;
  }
  const { matched, error } = evaluateEmployeeRule(employee, effectiveRule);
  if (error) {
    const msg = `تعذّر تقييم شروط البند ${allowanceId}: ${error} — لم يُمنح البند`;
    if (Array.isArray(warnings)) warnings.push(msg);
    else console.warn(msg);
  }
  return matched;
}

// ============================================================================
// الإعالة والأطفال
// ============================================================================

// الحالات الاجتماعية المستحقة للإعالة: المتزوج/ة، وبنص المادة 14 المعدلة: الأرملة والمطلقة والأرمل.
const SPOUSE_ELIGIBLE_STATUSES = new Set(['متزوج', 'متزوجة', 'أرمل', 'ارمل', 'أرملة', 'ارملة', 'مطلقة']);

/**
 * عدد الإعالات المستحقة (0 أو 1). المادة 14 تمنح مخصص إعالة واحداً للموظف بصرف النظر عن عدد الزوجات.
 * توزيع الإعالة إذا كان الزوجان موظفين **يُتحقق** (لم يُطبق هنا).
 */
export function getEligibleSpouseCount(employee) {
  const status = String(employee?.marital_status || employee?.maritalStatus || '').trim();
  return SPOUSE_ELIGIBLE_STATUSES.has(status) ? 1 : 0;
}

const MALE_VALUES = new Set(['ذكر', 'male', 'm', 'ابن', 'ولد']);
const FEMALE_VALUES = new Set(['أنثى', 'انثى', 'female', 'f', 'بنت', 'ابنة']);
const MARRIED_VALUES = new Set(['متزوج', 'متزوجة', 'married']);
const UNMARRIED_VALUES = new Set(['أعزب', 'عزباء', 'غير متزوجة', 'غير متزوج', 'single', 'مطلقة', 'أرملة', 'ارملة']);

function ageInYearsAt(birth, at) {
  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * استحقاق طفل لمخصص الأطفال في فترة معيّنة (المادة 14 المعدلة بالقانون 103 لسنة 2012):
 *  - دون 18 سنة: مستحق.
 *  - الابن: يستمر حتى 24 سنة ما دام طالباً (بأمر تمديد نافذ في الفترة)، ويتوقف عند 18 إن ترك الدراسة.
 *  - البنت: ما دامت غير متزوجة وغير موظفة (يجب أن تكون البيانات مسجلة صراحة)، أو بأمر تمديد نافذ.
 * @returns {{ eligible: boolean, reason: string }}
 */
export function evaluateChildEligibility(child, periodStart = new Date()) {
  if (!child || typeof child !== 'object') return { eligible: false, reason: 'بيانات الطفل غير صالحة' };
  const at = periodStart instanceof Date ? periodStart : new Date(periodStart);
  const birth = parseDateOnly(child.birth_date || child.birthDate || child.dob);
  if (!birth) return { eligible: false, reason: `تاريخ ميلاد الطفل ${child.name || ''} غير معروف` };
  if (birth > at) return { eligible: false, reason: `تاريخ ميلاد الطفل ${child.name || ''} بعد فترة الراتب` };
  if (child.is_deceased || child.isDeceased) return { eligible: false, reason: 'متوفى' };

  const age = ageInYearsAt(birth, at);
  if (age < 18) return { eligible: true, reason: 'دون 18 سنة' };

  const extStart = parseDateOnly(child.extension_start_date || child.extensionStartDate);
  const extEnd = parseDateOnly(child.extension_end_date || child.extensionEndDate);
  const hasOrder = !!(child.extension_order_number || child.extensionOrderNumber);
  const extensionActive = hasOrder && extStart && extEnd && extStart <= at && at <= extEnd;

  const gender = String(child.gender || '').trim().toLowerCase();
  const isFemale = FEMALE_VALUES.has(gender);
  const isMale = MALE_VALUES.has(gender);

  if (isFemale) {
    const marital = String(child.marital_status || child.maritalStatus || '').trim();
    const married = child.is_married === true || MARRIED_VALUES.has(marital);
    const employedRaw = child.is_employed ?? child.isEmployed ?? child.employed;
    const employed = employedRaw === true || employedRaw === 'نعم' || employedRaw === 'موظفة';
    if (married) return { eligible: false, reason: 'البنت متزوجة' };
    if (employed) return { eligible: false, reason: 'البنت موظفة' };
    const knownUnmarried = child.is_married === false || UNMARRIED_VALUES.has(marital);
    const knownNotEmployed = employedRaw === false || employedRaw === 'لا' || employedRaw === 'غير موظفة';
    if (knownUnmarried && knownNotEmployed) return { eligible: true, reason: 'بنت غير متزوجة وغير موظفة' };
    if (extensionActive) return { eligible: true, reason: 'أمر تمديد نافذ' };
    return { eligible: false, reason: `بيانات البنت ${child.name || ''} (الزواج/التوظيف) غير مكتملة` };
  }

  // الابن (أو جنس غير معروف): يحتاج أمر تمديد نافذ للدراسة وعمراً دون 24 سنة
  if (!extensionActive) return { eligible: false, reason: 'تجاوز 18 سنة بلا تمديد نافذ' };
  if (age >= 24) return { eligible: false, reason: 'تجاوز 24 سنة' };
  return { eligible: true, reason: isMale ? 'ابن طالب بأمر تمديد نافذ' : 'أمر تمديد نافذ' };
}

export function isChildEligible(child, periodStart = new Date()) {
  return evaluateChildEligibility(child, periodStart).eligible;
}

// Helper to get active rates (legacy: localStorage in the browser, otherwise legal defaults)
export function getActiveFinancialRates(overrides = {}) {
  let spouse = SPOUSE_ALLOWANCE;
  let child = CHILD_ALLOWANCE;
  let retirement = RETIREMENT_RATE;

  const savedSpouse = toNumber(readStorage('SPOUSE_ALLOWANCE'));
  if (Number.isFinite(savedSpouse) && savedSpouse >= 0) spouse = savedSpouse;
  const savedChild = toNumber(readStorage('CHILD_ALLOWANCE'));
  if (Number.isFinite(savedChild) && savedChild >= 0) child = savedChild;
  const savedRetirement = toNumber(readStorage('RETIREMENT_RATE'));
  if (Number.isFinite(savedRetirement) && savedRetirement >= 0 && savedRetirement <= 1) retirement = savedRetirement;

  if (Number.isFinite(toNumber(overrides.spouse))) spouse = toNumber(overrides.spouse);
  if (Number.isFinite(toNumber(overrides.child))) child = toNumber(overrides.child);
  if (Number.isFinite(toNumber(overrides.retirement))) retirement = toNumber(overrides.retirement);

  return { spouse, child, retirement };
}

// ============================================================================
// محرك الاحتساب
// ============================================================================

const LEGACY_POSITIONAL_KEYS = [
  'extraAllowances', 'loanDeduction', 'penaltyDeduction', 'absenceDeduction', 'otherDeductions',
  'customSalaryTable', 'customWorkLocations', 'customEducationDegrees', 'allowancesDeductions',
  'systemSettings', 'targetMonth', 'targetYear',
];

function normalizeOptions(args) {
  const [second] = args;
  if (second && typeof second === 'object' && !Array.isArray(second)) {
    const o = { ...second };
    if (o.customAllowances && !o.allowancesDeductions) o.allowancesDeductions = o.customAllowances;
    if (o.customSystemSettings && !o.systemSettings) o.systemSettings = o.customSystemSettings;
    if (o.educationDegrees && !o.customEducationDegrees) o.customEducationDegrees = o.educationDegrees;
    if (o.workLocations && !o.customWorkLocations) o.customWorkLocations = o.workLocations;
    if (o.salaryTable && !o.customSalaryTable) o.customSalaryTable = o.salaryTable;
    return o;
  }
  const o = {};
  LEGACY_POSITIONAL_KEYS.forEach((k, i) => {
    if (args[i] !== undefined && args[i] !== null) o[k] = args[i];
  });
  return o;
}

function lookupScale(table, grade, step) {
  if (!table) return undefined;
  const row = table[grade] || table[String(grade)];
  if (!row) return undefined;
  const v = row[step] ?? row[String(step)];
  const n = toNumber(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const MISSING_FIELDS = [
  'base_salary', 'degree_allowance', 'higher_degree_allowance', 'spouse_allowance', 'children_allowance',
  'position_allowance', 'experience_allowance', 'region_allowance', 'extra_allowances', 'general_custom_allowances',
  'general_custom_deductions', 'total_allowances', 'retirement_deduction', 'tax_deduction', 'loan_deduction',
  'penalty_deduction', 'absence_deduction', 'other_deductions', 'total_deductions', 'net_salary',
];

function missingDataResult(reason, warnings) {
  const res = {
    status: 'missing_data',
    missing_data: true,
    reason,
    warnings,
    allowances_breakdown: [],
    deductions_breakdown: [],
  };
  MISSING_FIELDS.forEach(f => { res[f] = null; });
  return res;
}

function pctLabel(v) {
  return `${Number(v)}%`;
}

const BASE_LABELS = {
  nominal: 'من الراتب الاسمي',
  gross: 'من الراتب الكلي قبل الاستقطاعات',
  net: 'من صافي الراتب بعد الاستقطاعات الأخرى',
};

/**
 * احتساب راتب موظف.
 *
 * التوقيع الجديد: calculateSalary(employee, options)
 *   options: {
 *     customSalaryTable, customEducationDegrees, responsibilityAllowances, customWorkLocations,
 *     allowancesDeductions, systemSettings, rules: {[itemId]: rule}, temporaryMeta: {[itemId]: meta},
 *     itemOrder: { allowances: [], deductions: [] },
 *     spouseStatus, childStatus, retirementStatus ('active'|'inactive'|'فعال'|'متوقف مؤقتاً'),
 *     spouseAmount, childAmount, retirementRate (كسر عشري: 0.10),
 *     extraAllowances, loanDeduction, penaltyDeduction, absenceDeduction, otherDeductions,
 *     targetMonth, targetYear, useBrowserStorage (افتراضي true: localStorage كمصدر احتياطي قديم في المتصفح فقط)
 *   }
 * التوقيع القديم الموضعي ما زال مدعوماً.
 *
 * إذا كانت الدرجة أو المرحلة مفقودة أو غير موجودة في السلم يُرجع { status: 'missing_data', reason } ولا يُحتسب راتب.
 */
export function calculateSalary(employee, ...args) {
  const opts = normalizeOptions(args);
  const warnings = [];
  const useStorage = opts.useBrowserStorage !== false && hasBrowserStorage();
  const fromStorage = (key) => (useStorage ? readStorageJson(key, warnings) : null);
  const rawStorage = (key) => (useStorage ? readStorage(key) : null);

  if (!employee || typeof employee !== 'object') {
    return missingDataResult('بيانات الموظف غير متوفرة', warnings);
  }

  // 0. الراتب الاسمي — لا قيم افتراضية للدرجة أو المرحلة
  const grade = toNumber(employee.grade);
  const step = toNumber(employee.step);
  const missing = [];
  if (!Number.isInteger(grade) || grade <= 0) missing.push('الدرجة');
  if (!Number.isInteger(step) || step <= 0) missing.push('المرحلة');
  if (missing.length > 0) {
    return missingDataResult(`بيانات ناقصة: ${missing.join(' و')} غير مسجلة للموظف`, warnings);
  }
  const baseSalary = lookupScale(opts.customSalaryTable, grade, step) ?? lookupScale(SALARY_TABLE, grade, step);
  if (!baseSalary) {
    return missingDataResult(`بيانات ناقصة: لا يوجد راتب في السلم للدرجة ${grade} المرحلة ${step}`, warnings);
  }

  const period = getPeriod(opts.targetMonth, opts.targetYear);
  const legacyRates = getActiveFinancialRates();

  const allowances_breakdown = [];
  const deductions_breakdown = [];
  const pushAllowance = (entry) => { if (entry.amount) allowances_breakdown.push(entry); };

  // البنود (مخصصات/استقطاعات) — من المعامل أولاً، ثم من النسخة المحلية القديمة في المتصفح
  let items = Array.isArray(opts.allowancesDeductions) ? opts.allowancesDeductions : fromStorage('ALLOWANCES_DEDUCTIONS_PRESETS');
  if (!Array.isArray(items)) items = [];

  const isItemInPeriod = (item) => {
    const effective = parseDateOnly(item.effective_date || item.effectiveDate || item.effective_from || item.effectiveFrom);
    if (effective && effective > period.end) return false;
    const deactivated = parseDateOnly(item.deactivated_at || item.deactivatedAt);
    if (deactivated) return deactivated > period.start; // يُصرف للفترات السابقة لتاريخ الإيقاف فقط
    if (item.status === undefined || item.status === null || item.status === '') return true;
    return statusFlag(item.status) === true; // حالة غير معروفة = غير فعال
  };

  const findCategoryItem = (category) => {
    const matches = items.filter(i => getItemCategory(i) === category);
    if (matches.length === 0) return null;
    const inPeriod = matches.filter(isItemInPeriod);
    if (matches.length > 1) warnings.push(`يوجد أكثر من بند واحد من فئة ${category}؛ اعتُمد الأول فقط`);
    return { item: inPeriod[0] || matches[0], active: inPeriod.length > 0 };
  };

  const resolveFlag = (explicit, record, storageKey) => {
    const e = statusFlag(explicit);
    if (e !== undefined) return e;
    if (record) return record.active;
    const s = rawStorage(storageKey);
    if (s === 'متوقف مؤقتاً') return false;
    return true;
  };

  const itemAmount = (item, base) => {
    const calcType = item.calcType || item.calc_type || 'flat';
    const val = toNumber(item.value);
    if (!Number.isFinite(val)) return 0;
    return calcType === 'percentage' ? Math.round(base * (val / 100)) : val;
  };

  // 1. مخصصات الشهادة
  let degreeAllowance = 0;
  let higherDegreeAllowance = 0;
  const employeeEducationLevel = employee.education_level || employee.educationLevel;
  let degrees = Array.isArray(opts.customEducationDegrees) ? opts.customEducationDegrees : fromStorage('EDUCATION_DEGREES_PRESETS');
  if (!Array.isArray(degrees) || degrees.length === 0) degrees = LEGAL_EDUCATION_DEGREES;
  if (employeeEducationLevel) {
    const target = normalizeItemName(employeeEducationLevel);
    const matched = degrees.find(d => normalizeItemName(d.name) === target);
    if (matched) {
      const rate = toNumber(matched.allowance_rate ?? matched.allowanceRate);
      if (Number.isFinite(rate)) {
        degreeAllowance = Math.round(baseSalary * (rate / 100));
        pushAllowance({ id: 'certificate', category: ITEM_CATEGORIES.CERTIFICATE, name: `مخصصات الشهادة (${employeeEducationLevel})`, amount: degreeAllowance, calcType: 'percentage', calculationBase: 'nominal', baseAmount: baseSalary, details: `${pctLabel(rate)} ${BASE_LABELS.nominal}` });
      } else {
        warnings.push(`نسبة مخصص الشهادة "${employeeEducationLevel}" غير معرّفة`);
      }
      const isHigher = matched.is_higher_education || matched.isHigherEducation;
      const higherRate = toNumber(matched.higher_allowance_rate ?? matched.higherAllowanceRate);
      if (isHigher && Number.isFinite(higherRate) && higherRate > 0) {
        // قيمة مُعرَّفة صراحة من المسؤول؛ المادة 11 لا تنص على مخصص إضافي للشهادة العليا
        higherDegreeAllowance = Math.round(baseSalary * (higherRate / 100));
        warnings.push(`مخصص الشهادة العليا الإضافي (${pctLabel(higherRate)}) غير منصوص عليه في المادة 11 من القانون 22 لسنة 2008 — يُتحقق`);
        pushAllowance({ id: 'certificate_higher', category: ITEM_CATEGORIES.CERTIFICATE, name: 'مخصص الشهادة العليا الإضافي', amount: higherDegreeAllowance, calcType: 'percentage', calculationBase: 'nominal', baseAmount: baseSalary, details: `${pctLabel(higherRate)} ${BASE_LABELS.nominal}` });
      }
    } else {
      warnings.push(`الشهادة "${employeeEducationLevel}" غير معرّفة في جدول الشهادات — لم يُحتسب مخصص الشهادة`);
    }
  } else {
    warnings.push('التحصيل الدراسي غير مسجل — لم يُحتسب مخصص الشهادة');
  }

  // 2. مخصص الإعالة (الزوجية)
  const spouseRec = findCategoryItem(ITEM_CATEGORIES.SPOUSE);
  const spouseEnabled = resolveFlag(opts.spouseStatus, spouseRec, 'SPOUSE_ALLOWANCE_STATUS');
  let spouseUnit;
  let spouseCalcType = 'flat';
  let spouseValue;
  if (Number.isFinite(toNumber(opts.spouseAmount))) {
    spouseUnit = toNumber(opts.spouseAmount);
  } else if (spouseRec && Number.isFinite(toNumber(spouseRec.item.value))) {
    spouseCalcType = spouseRec.item.calcType || spouseRec.item.calc_type || 'flat';
    spouseValue = toNumber(spouseRec.item.value);
    spouseUnit = itemAmount(spouseRec.item, baseSalary);
  } else {
    spouseUnit = legacyRates.spouse;
  }
  const spouseCount = getEligibleSpouseCount(employee);
  const spouseAllowance = spouseEnabled && spouseCount > 0 ? spouseUnit : 0;
  pushAllowance({ id: spouseRec?.item?.id ?? 'spouse', category: ITEM_CATEGORIES.SPOUSE, name: 'مخصصات الزوجية (الإعالة)', amount: spouseAllowance, calcType: spouseCalcType, calculationBase: 'nominal', baseAmount: baseSalary, details: spouseCalcType === 'percentage' ? `${pctLabel(spouseValue)} ${BASE_LABELS.nominal}` : 'مبلغ مقطوع' });

  // 3. مخصصات الأطفال
  const childRec = findCategoryItem(ITEM_CATEGORIES.CHILD);
  const childEnabled = resolveFlag(opts.childStatus, childRec, 'CHILD_ALLOWANCE_STATUS');
  let childUnit;
  if (Number.isFinite(toNumber(opts.childAmount))) {
    childUnit = toNumber(opts.childAmount);
  } else if (childRec && Number.isFinite(toNumber(childRec.item.value))) {
    childUnit = itemAmount(childRec.item, baseSalary);
  } else {
    childUnit = legacyRates.child;
  }

  let maxChildren = DEFAULT_MAX_CHILDREN;
  const settings = (opts.systemSettings && typeof opts.systemSettings === 'object') ? opts.systemSettings : fromStorage('SYSTEM_SETTINGS_PRESETS');
  const settingsMax = toNumber(settings?.maxChildrenCount ?? settings?.max_children_count);
  if (Number.isFinite(settingsMax) && settingsMax >= 0) maxChildren = settingsMax;
  let childRules = childRec?.item?.rules;
  if (typeof childRules === 'string') { try { childRules = JSON.parse(childRules); } catch (e) { childRules = null; } }
  const ruleMax = toNumber(childRules?.maxChildrenCount);
  if (Number.isFinite(ruleMax) && ruleMax >= 0) maxChildren = ruleMax;

  let eligibleChildren = 0;
  const details = parseJsonArray(employee.children_details ?? employee.childrenDetails);
  if (details && details.length > 0) {
    details.forEach(c => {
      const r = evaluateChildEligibility(c, period.start);
      if (r.eligible) eligibleChildren++;
      else if (/غير معروف|غير مكتملة|غير صالحة/.test(r.reason)) warnings.push(`طفل غير محتسب: ${r.reason}`);
    });
  } else {
    const count = toNumber(employee.children_count ?? employee.childrenCount);
    if (Number.isFinite(count) && count > 0) {
      eligibleChildren = count;
      warnings.push('لا تتوفر تفاصيل الأطفال (تواريخ الميلاد)؛ اعتُمد العدد المسجل دون التحقق من العمر');
    }
  }
  const childrenCount = Math.min(eligibleChildren, maxChildren);
  const childrenAllowance = childEnabled ? childrenCount * childUnit : 0;
  pushAllowance({ id: childRec?.item?.id ?? 'children', category: ITEM_CATEGORIES.CHILD, name: `مخصصات الأطفال (${childrenCount})`, amount: childrenAllowance, calcType: 'flat', calculationBase: 'nominal', baseAmount: baseSalary, details: `${childrenCount} × ${childUnit}` });

  // 4. مخصصات المسؤولية / المنصب
  const responsibilityName = employee.primary_responsibility || employee.primaryResponsibility || '';
  let responsibilityRate = 0;
  if (responsibilityName && responsibilityName !== 'بلا مسؤولية') {
    const resps = Array.isArray(opts.responsibilityAllowances) ? opts.responsibilityAllowances : fromStorage('RESPONSIBILITY_ALLOWANCES_PRESETS');
    const target = normalizeItemName(responsibilityName);
    const matched = Array.isArray(resps) ? resps.find(r => normalizeItemName(r.name) === target) : null;
    const matchedRate = matched ? toNumber(matched.allowance_rate ?? matched.allowanceRate) : NaN;
    if (matched && Number.isFinite(matchedRate)) {
      responsibilityRate = matchedRate / 100;
    } else if (Object.prototype.hasOwnProperty.call(RESPONSIBILITY_ALLOWANCE_RATES, responsibilityName)) {
      const legal = RESPONSIBILITY_ALLOWANCE_RATES[responsibilityName];
      if (legal === null) {
        warnings.push(`نسبة مخصص المسؤولية "${responsibilityName}" غير منصوص عليها في المادة 10 — يُتحقق، ولم تُحتسب`);
      } else {
        responsibilityRate = legal;
      }
    } else {
      warnings.push(`المسؤولية "${responsibilityName}" غير معرّفة — لم يُحتسب مخصص المنصب`);
    }
  }
  const positionAllowance = Math.round(baseSalary * responsibilityRate);
  pushAllowance({ id: 'position', category: ITEM_CATEGORIES.POSITION, name: `مخصصات المنصب (${responsibilityName})`, amount: positionAllowance, calcType: 'percentage', calculationBase: 'nominal', baseAmount: baseSalary, details: `${pctLabel(Math.round(responsibilityRate * 10000) / 100)} ${BASE_LABELS.nominal}` });

  // 5. مخصصات موقع العمل الجغرافية/النائية
  const selectedLocationName = employee.work_location || employee.workLocation;
  let regionAllowance = 0;
  if (selectedLocationName) {
    const locs = Array.isArray(opts.customWorkLocations) ? opts.customWorkLocations : fromStorage('WORK_LOCATIONS');
    if (Array.isArray(locs)) {
      const matched = locs.find(l => l.name === selectedLocationName);
      const amt = matched ? toNumber(matched.allowance_amount ?? matched.allowanceAmount) : NaN;
      if (Number.isFinite(amt)) regionAllowance = amt;
    }
  }
  pushAllowance({ id: 'region', category: 'region', name: `مخصصات الموقع (${selectedLocationName || ''})`, amount: regionAllowance, calcType: 'flat', calculationBase: 'nominal', baseAmount: baseSalary, details: 'مبلغ مقطوع' });

  // 6. البنود العامة (المستمرة والمؤقتة)
  const allowancesOrder = opts.itemOrder?.allowances || fromStorage('CUSTOM_ALLOWANCES_ORDER') || [];
  const deductionsOrder = opts.itemOrder?.deductions || fromStorage('CUSTOM_DEDUCTIONS_ORDER') || [];
  const orderIndex = (list, id) => {
    const idx = Array.isArray(list) ? list.map(String).indexOf(String(id)) : -1;
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  const sortedItems = items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      if (a.it.type !== b.it.type) return a.idx - b.idx;
      const list = (a.it.type === 'deduction' || a.it.type === 'M_DEDUCTION') ? deductionsOrder : allowancesOrder;
      const d = orderIndex(list, a.it.id) - orderIndex(list, b.it.id);
      return d !== 0 ? d : a.idx - b.idx;
    })
    .map(x => x.it);

  const getRule = (item) => {
    if (item.rules !== undefined) return item.rules;
    if (opts.rules && Object.prototype.hasOwnProperty.call(opts.rules, item.id)) return opts.rules[item.id];
    const raw = rawStorage(`ALLOWANCE_RULES_${item.id}`);
    return raw ? raw : null;
  };
  const getTempMeta = (item) => {
    let meta = item.temporary_meta ?? item.temporaryMeta;
    if (meta === undefined && opts.temporaryMeta) meta = opts.temporaryMeta[item.id];
    if (meta === undefined) meta = rawStorage(`TEMPORARY_META_${item.id}`);
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch (e) { warnings.push(`تعذّرت قراءة بيانات البند المؤقت ${item.name} — لم يُطبَّق`); return { invalid: true }; }
    }
    return meta || null;
  };
  const ruleMatches = (item) => {
    const { matched, error } = evaluateEmployeeRule(employee, getRule(item));
    if (error) warnings.push(`تعذّر تقييم شروط البند "${item.name}": ${error} — لم يُمنح`);
    return matched;
  };

  const seenIds = new Set();
  const eligibleAllowances = [];
  const eligibleDeductions = [];
  let retirementRecordSeen = null;

  sortedItems.forEach(a => {
    if (!a || typeof a !== 'object') return;
    const category = getItemCategory(a);
    if (category === ITEM_CATEGORIES.SPOUSE || category === ITEM_CATEGORIES.CHILD) return; // محتسبة أعلاه
    if (category === ITEM_CATEGORIES.RETIREMENT) { retirementRecordSeen = retirementRecordSeen || a; return; } // يُستقطع مرة واحدة أدناه
    if (category === ITEM_CATEGORIES.CERTIFICATE || category === ITEM_CATEGORIES.POSITION) {
      // مخصص الشهادة والمنصب يُحتسبان من جداولهما فقط؛ السجلات المكررة لا تُضاف فوقهما
      if (isItemInPeriod(a)) warnings.push(`البند "${a.name}" مكرر لمخصص ${category === ITEM_CATEGORIES.CERTIFICATE ? 'الشهادة' : 'المنصب'} المحتسب من جدوله — لم يُضف`);
      return;
    }
    if (category === ITEM_CATEGORIES.TAX) {
      if (isItemInPeriod(a)) warnings.push(`البند "${a.name}" (ضريبة الدخل) لم يُطبَّق: محرك الضريبة بالشرائح غير منفذ بعد`);
      return;
    }

    if (a.id !== undefined && a.id !== null) {
      const key = `${a.type}:${a.id}`;
      if (seenIds.has(key)) return; // منع التكرار في الفترة نفسها
      seenIds.add(key);
    }

    if (!isItemInPeriod(a)) return;

    const tempMeta = getTempMeta(a);
    if (tempMeta && tempMeta.invalid) return;
    if (tempMeta && tempMeta.isTemporary) {
      if (tempMeta.timingType === 'range') {
        const startVal = parseInt(tempMeta.startYear, 10) * 12 + parseInt(tempMeta.startMonth, 10);
        const endVal = parseInt(tempMeta.endYear, 10) * 12 + parseInt(tempMeta.endMonth, 10);
        const currentVal = period.year * 12 + period.month;
        if (!(currentVal >= startVal && currentVal <= endVal)) return;
      } else if (parseInt(tempMeta.paymentYear, 10) !== period.year || parseInt(tempMeta.paymentMonth, 10) !== period.month) {
        return;
      }
      if (tempMeta.beneficiaryType === 'direct') {
        const directIds = Array.isArray(tempMeta.directEmployeeIds) ? tempMeta.directEmployeeIds : [];
        if (!directIds.map(String).includes(String(employee.id))) return;
      } else if (!ruleMatches(a)) {
        return;
      }
    } else if (!ruleMatches(a)) {
      return;
    }

    if (a.type === 'allowance' || a.type === 'M_ALLOWANCE') eligibleAllowances.push(a);
    else if (a.type === 'deduction' || a.type === 'M_DEDUCTION') eligibleDeductions.push(a);
  });

  const entryFor = (a, amount, base, calcBase) => {
    const calcType = a.calcType || a.calc_type || 'flat';
    return {
      id: a.id,
      name: a.name,
      category: ITEM_CATEGORIES.GENERAL,
      amount,
      calcType,
      calculationBase: calcType === 'percentage' ? calcBase : 'flat',
      baseAmount: calcType === 'percentage' ? base : null,
      value: toNumber(a.value),
      details: calcType === 'percentage' ? `${pctLabel(toNumber(a.value))} ${BASE_LABELS[calcBase]}` : 'مبلغ مقطوع',
    };
  };
  const calcBaseOf = (a) => {
    const b = a.calculationBase || a.calculation_base || 'nominal';
    return BASE_LABELS[b] ? b : 'nominal';
  };
  const isPct = (a) => (a.calcType || a.calc_type) === 'percentage';

  const extraAllowances = toNumber(opts.extraAllowances) || 0;
  const loanDeduction = toNumber(opts.loanDeduction) || 0;
  const penaltyDeduction = toNumber(opts.penaltyDeduction) || 0;
  const absenceDeduction = toNumber(opts.absenceDeduction) || 0;
  const otherDeductions = toNumber(opts.otherDeductions) || 0;

  const fixedAllowances = degreeAllowance + higherDegreeAllowance + spouseAllowance + childrenAllowance + positionAllowance + regionAllowance + extraAllowances;
  let generalCustomAllowances = 0;

  // المخصصات: الاسمي والمقطوع أولاً، ثم النسبية من الراتب الكلي (كل منها على ما سبقها، دون نفسها)
  const allowancePass = (predicate) => {
    eligibleAllowances.filter(predicate).forEach(a => {
      const calcBase = isPct(a) ? calcBaseOf(a) : 'nominal';
      const base = calcBase === 'nominal' ? baseSalary : baseSalary + fixedAllowances + generalCustomAllowances;
      const amount = isPct(a) ? itemAmount(a, base) : itemAmount(a, baseSalary);
      generalCustomAllowances += amount;
      allowances_breakdown.push(entryFor(a, amount, base, calcBase));
    });
  };
  allowancePass(a => !(isPct(a) && calcBaseOf(a) !== 'nominal'));
  allowancePass(a => isPct(a) && calcBaseOf(a) !== 'nominal');

  const totalAllowances = fixedAllowances + generalCustomAllowances;
  const grossSalary = baseSalary + totalAllowances;

  // 7. التوقيفات التقاعدية — مرة واحدة فقط، من الراتب الاسمي
  const retirementRec = retirementRecordSeen ? { item: retirementRecordSeen, active: isItemInPeriod(retirementRecordSeen) } : null;
  const retirementEnabled = resolveFlag(opts.retirementStatus, retirementRec, 'RETIREMENT_STATUS');
  let retirementRate = legacyRates.retirement;
  if (Number.isFinite(toNumber(opts.retirementRate))) {
    retirementRate = toNumber(opts.retirementRate);
  } else if (retirementRec && (retirementRec.item.calcType || retirementRec.item.calc_type) === 'percentage' && Number.isFinite(toNumber(retirementRec.item.value))) {
    retirementRate = toNumber(retirementRec.item.value) / 100;
  }
  const retirementDeduction = retirementEnabled ? Math.round(baseSalary * retirementRate) : 0;
  if (retirementDeduction) {
    deductions_breakdown.push({ id: retirementRec?.item?.id ?? 'retirement', category: ITEM_CATEGORIES.RETIREMENT, name: 'التوقيفات التقاعدية', amount: retirementDeduction, calcType: 'percentage', calculationBase: 'nominal', baseAmount: baseSalary, details: `${pctLabel(Math.round(retirementRate * 10000) / 100)} ${BASE_LABELS.nominal}` });
  }

  // 8. الاستقطاعات العامة: الاسمي والكلي والمقطوع، ثم النسبية من الصافي
  let generalCustomDeductions = 0;
  const fixedDeductions = retirementDeduction + loanDeduction + penaltyDeduction + absenceDeduction + otherDeductions;
  eligibleDeductions.filter(a => !(isPct(a) && calcBaseOf(a) === 'net')).forEach(a => {
    const calcBase = isPct(a) ? calcBaseOf(a) : 'nominal';
    const base = calcBase === 'gross' ? grossSalary : baseSalary;
    const amount = itemAmount(a, base);
    generalCustomDeductions += amount;
    deductions_breakdown.push(entryFor(a, amount, base, calcBase));
  });
  eligibleDeductions.filter(a => isPct(a) && calcBaseOf(a) === 'net').forEach(a => {
    const base = grossSalary - fixedDeductions - generalCustomDeductions;
    const amount = itemAmount(a, base);
    generalCustomDeductions += amount;
    deductions_breakdown.push(entryFor(a, amount, base, 'net'));
  });

  const experienceAllowance = 0; // غير منفذ

  const totalDeductions = fixedDeductions + generalCustomDeductions;
  const netSalary = baseSalary + totalAllowances - totalDeductions;

  return {
    status: 'ok',
    missing_data: false,
    reason: null,
    warnings,
    base_salary: baseSalary,
    degree_allowance: degreeAllowance,
    higher_degree_allowance: higherDegreeAllowance,
    spouse_allowance: spouseAllowance,
    children_allowance: childrenAllowance,
    eligible_children_count: childrenCount,
    position_allowance: positionAllowance,
    experience_allowance: experienceAllowance,
    region_allowance: regionAllowance,
    extra_allowances: extraAllowances + generalCustomAllowances,
    general_custom_allowances: generalCustomAllowances,
    general_custom_deductions: generalCustomDeductions,
    total_allowances: totalAllowances,
    gross_salary: grossSalary,
    retirement_deduction: retirementDeduction,
    tax_deduction: 0, // محرك ضريبة الدخل غير منفذ بعد
    loan_deduction: loanDeduction,
    penalty_deduction: penaltyDeduction,
    absence_deduction: absenceDeduction,
    other_deductions: otherDeductions + generalCustomDeductions,
    total_deductions: totalDeductions,
    net_salary: netSalary,
    allowances_breakdown,
    deductions_breakdown,
  };
}

// ============================================================================
// إعدادات الرواتب المشتركة بين شاشة الرواتب والتقارير
// ============================================================================

// حالات الموظف التي يُولَّد لها راتب. "مستمر" هي الحالة الافتراضية في قاعدة البيانات،
// و"فعال"/"مستمر بالخدمة" قيم قديمة مكافئة. الحالات الأخرى (منسب، مجاز، متقاعد، مستقيل، موقوف)
// لا يُولَّد لها راتب تلقائياً.
export const PAYROLL_ACTIVE_STATUSES = ['مستمر', 'مستمر بالخدمة', 'فعال'];

export function isPayrollActiveEmployee(employee) {
  const status = String(employee?.status ?? employee?.employeeStatus ?? '').trim();
  return PAYROLL_ACTIVE_STATUSES.includes(status);
}

export function buildSalaryScaleMap(records) {
  if (!Array.isArray(records) || records.length === 0) return null;
  const scaleMap = {};
  records.forEach(r => {
    const g = r.grade;
    const st = r.step;
    const amount = toNumber(r.amount);
    if (g === undefined || g === null || st === undefined || st === null || !Number.isFinite(amount)) return;
    if (!scaleMap[g]) scaleMap[g] = {};
    scaleMap[g][st] = amount;
  });
  return Object.keys(scaleMap).length > 0 ? scaleMap : null;
}

/**
 * تحميل كل إعدادات الاحتساب من الـ API (سلم الرواتب، البنود، الشهادات، المسؤوليات، المواقع، إعدادات النظام).
 * لا يبتلع الأخطاء: كل فشل يُضاف إلى `errors` برسالة عربية لعرضها في الواجهة.
 * @param {object} api - apiClient
 * @returns {Promise<{ options: object, errors: string[] }>}
 */
export async function loadPayrollSettings(api) {
  const errors = [];
  const safe = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`تعذّر تحميل ${label}: ${e?.message || e}`);
      return null;
    }
  };
  const [scale, items, degrees, resps, locations, settings] = await Promise.all([
    safe('سلم الرواتب', () => api.entities.SalaryScale.list()),
    safe('المخصصات والاستقطاعات', () => api.entities.AllowanceDeduction.list()),
    safe('جدول الشهادات', () => api.entities.EducationDegree.list()),
    safe('مخصصات المسؤولية', () => api.entities.ResponsibilityAllowance.list()),
    safe('مواقع العمل', () => api.entities.WorkLocation.list()),
    safe('إعدادات النظام', () => api.settings.get()),
  ]);
  const options = {
    customSalaryTable: buildSalaryScaleMap(scale),
    allowancesDeductions: Array.isArray(items) ? items : undefined,
    customEducationDegrees: Array.isArray(degrees) && degrees.length > 0 ? degrees : undefined,
    responsibilityAllowances: Array.isArray(resps) && resps.length > 0 ? resps : undefined,
    customWorkLocations: Array.isArray(locations) ? locations : undefined,
    systemSettings: settings && typeof settings === 'object' ? settings : undefined,
  };
  return { options, errors };
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '' || !Number.isFinite(Number(amount))) return 'بيانات ناقصة';
  return new Intl.NumberFormat('ar-IQ').format(Number(amount)) + ' د.ع';
}

export function getGradeLabel(grade) {
  const grades = { 
    1: 'الأولى', 
    2: 'الثانية', 
    3: 'الثالثة', 
    4: 'الرابعة', 
    5: 'الخامسة', 
    6: 'السادسة', 
    7: 'السابعة', 
    8: 'الثامنة', 
    9: 'التاسعة', 
    10: 'العاشرة',
    11: 'وكيل الوزارة ومن بدرجته ومن يتقاضى راتبه والمستشار الذي يتقاضى راتب وكيل وزارة',
    12: 'الدرجة الخاصة',
    13: 'المدير العام ومن بدرجته ومن يتقاضى راتبه'
  };
  return grades[grade] || grade;
}

export function getGradeType(grade) {
  return grade >= 11 ? 'درجة عليا' : 'درجة اعتيادية';
}

export function getStepLabel(step) {
  const steps = { 
    1: 'الأولى', 2: 'الثانية', 3: 'الثالثة', 4: 'الرابعة', 5: 'الخامسة', 
    6: 'السادسة', 7: 'السابعة', 8: 'الثامنة', 9: 'التاسعة', 10: 'العاشرة',
    11: 'الحادية عشرة', 12: 'الثانية عشرة', 13: 'الثالثة عشرة', 14: 'الرابعة عشرة', 15: 'الخامسة عشرة'
  };
  return steps[step] || step;
}