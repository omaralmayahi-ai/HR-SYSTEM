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

// علاوات الشهادات العلمية (شهرياً بالدينار)
export const EDUCATION_ALLOWANCES = {
  "دكتوراه":    350000,
  "ماجستير":    250000,
  "بكالوريوس":  150000,
  "دبلوم عالي": 100000,
  "دبلوم":       75000,
  "إعدادية":     50000,
  "متوسطة":      35000,
  "ابتدائية":    25000
};

// مخصصات المسؤولية / المنصب (كنسبة مئوية من الراتب الاسمي)
export const RESPONSIBILITY_ALLOWANCE_RATES = {
  "مدير عام": 0.50, // 50%
  "معاون مدير عام": 0.40, // 40%
  "مدير هيئة": 0.35, // 35%
  "مدير قسم مركزي": 0.30, // 30%
  "مدير قسم": 0.25, // 25%
  "مسؤول شعبة": 0.20, // 20%
  "مسؤول وحدة": 0.15, // 15%
  "مسؤول وجبة": 0.10, // 10%
  "بلا مسؤولية": 0.00
};

// علاوة الزوجية
export const SPOUSE_ALLOWANCE = 75000;

// علاوة الأولاد (لكل ولد، بحد أقصى 4)
export const CHILD_ALLOWANCE = 30000;

// نسبة الاستقطاع التقاعدي
export const RETIREMENT_RATE = 0.05;

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

// Helper to check if an employee matches custom allowance/deduction rules
export function checkEmployeeMatchesRule(employee, allowanceId) {
  if (typeof window === 'undefined') return true; // Server-side fallback or default
  try {
    const saved = localStorage.getItem(`ALLOWANCE_RULES_${allowanceId}`);
    if (!saved) return true; // No custom rules means granted to all by default!
    const rule = JSON.parse(saved);

    // 1. Blocklist check (حجب)
    const empId = employee.id;
    const empNum = employee.employee_number || employee.employeeNumber || employee.civil_service_number || employee.civilServiceNumber;
    if (rule.blockedEmployees && rule.blockedEmployees.length > 0) {
      if (
        rule.blockedEmployees.includes(empId) || 
        rule.blockedEmployees.includes(String(empId)) || 
        rule.blockedEmployees.includes(Number(empId)) || 
        (empNum && rule.blockedEmployees.includes(empNum)) ||
        (empNum && rule.blockedEmployees.includes(String(empNum)))
      ) {
        return false; // Excluded!
      }
    }

    // 2. Evaluate criteria
    return doesEmployeeMatchCriteria(employee, rule);
  } catch (e) {
    console.error("Error evaluating custom allowance rule:", e);
    return true; // fail-safe to grant if evaluation fails
  }
}

// Helper to get active rates from localStorage
export function getActiveFinancialRates() {
  let spouse = SPOUSE_ALLOWANCE;
  let child = CHILD_ALLOWANCE;
  let retirement = RETIREMENT_RATE;
  
  if (typeof window !== 'undefined') {
    const savedSpouse = localStorage.getItem('SPOUSE_ALLOWANCE');
    if (savedSpouse) spouse = parseInt(savedSpouse) || SPOUSE_ALLOWANCE;
    
    const savedChild = localStorage.getItem('CHILD_ALLOWANCE');
    if (savedChild) child = parseInt(savedChild) || CHILD_ALLOWANCE;
    
    const savedRetirement = localStorage.getItem('RETIREMENT_RATE');
    if (savedRetirement) retirement = parseFloat(savedRetirement) || RETIREMENT_RATE;
  }
  
  return { spouse, child, retirement };
}

export function calculateSalary(employee, extraAllowances = 0, loanDeduction = 0, penaltyDeduction = 0, absenceDeduction = 0, otherDeductions = 0, customSalaryTable = null, customWorkLocations = null, customEducationDegrees = null, customAllowances = null, customSystemSettings = null, targetMonth = null, targetYear = null) {
  const grade = employee.grade || 1;
  const step = employee.step || 1;
  const baseSalary = (customSalaryTable && (customSalaryTable[grade]?.[step] || customSalaryTable[String(grade)]?.[String(step)]))
    || (SALARY_TABLE[grade] && SALARY_TABLE[grade][step])
    || (SALARY_TABLE[String(grade)] && SALARY_TABLE[String(grade)][String(step)])
    || 250000;

  const rates = getActiveFinancialRates();
  const activeSpouseAllowance = rates.spouse;
  const activeChildAllowance = rates.child;
  const activeRetirementRate = rates.retirement;

  // 1. مخصصات الشهادة ومخصصات الشهادة العليا الإضافية
  let degreeAllowance = 0;
  let higherDegreeAllowance = 0;
  const employeeEducationLevel = employee.education_level || employee.educationLevel;
  
  if (employeeEducationLevel) {
    let degrees = customEducationDegrees;
    if (!degrees && isClient) {
      try {
        const savedDegrees = localStorage.getItem('EDUCATION_DEGREES_PRESETS');
        if (savedDegrees) degrees = JSON.parse(savedDegrees);
      } catch (e) {}
    }
    
    if (degrees && Array.isArray(degrees) && degrees.length > 0) {
      const matched = degrees.find(d => d.name === employeeEducationLevel);
      if (matched) {
        const allowanceRate = matched.allowance_rate || matched.allowanceRate || 0;
        degreeAllowance = Math.round(baseSalary * (allowanceRate / 100));
        
        const isHigher = matched.is_higher_education || matched.isHigherEducation;
        if (isHigher) {
          const higherRate = matched.higher_allowance_rate || matched.higherAllowanceRate || 0;
          higherDegreeAllowance = Math.round(baseSalary * (higherRate / 100));
        }
      } else {
        // Fallback to static flat rate if not matched
        degreeAllowance = EDUCATION_ALLOWANCES[employeeEducationLevel] || 0;
      }
    } else {
      // Fallback to static flat rate
      degreeAllowance = EDUCATION_ALLOWANCES[employeeEducationLevel] || 0;
    }
  }

  // 2. مخصصات الزوجية من جدول المخصصات والاستقطاعات
  let localAllowances = customAllowances;
  if (!localAllowances && isClient) {
    try {
      const savedAllowances = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
      if (savedAllowances) localAllowances = JSON.parse(savedAllowances);
    } catch (e) {}
  }

  let spouseAllowanceEnabled = true;
  let childAllowanceEnabled = true;
  if (isClient) {
    try {
      spouseAllowanceEnabled = localStorage.getItem('SPOUSE_ALLOWANCE_STATUS') !== 'متوقف مؤقتاً';
      childAllowanceEnabled = localStorage.getItem('CHILD_ALLOWANCE_STATUS') !== 'متوقف مؤقتاً';
    } catch (e) {}
  }

  let finalSpouseAllowanceVal = activeSpouseAllowance; // Fallback 75000
  if (localAllowances && Array.isArray(localAllowances)) {
    const matchedSpouse = localAllowances.find(a => a.type === 'allowance' && a.status === 'فعال' && (a.name.includes('زوجية') || a.name.includes('الزوجية')));
    if (matchedSpouse) {
      if (matchedSpouse.calcType === 'percentage' || matchedSpouse.calc_type === 'percentage') {
        finalSpouseAllowanceVal = Math.round(baseSalary * (matchedSpouse.value / 100));
      } else {
        finalSpouseAllowanceVal = matchedSpouse.value;
      }
    }
  }
  const spouseAllowance = (spouseAllowanceEnabled && (employee.marital_status === "متزوج" || employee.maritalStatus === "متزوج")) ? finalSpouseAllowanceVal : 0;

  // 3. مخصصات الأولاد (بحد أقصى يتم الحصول عليه من إعدادات النظام المالية)
  let maxChildren = 4; // default
  let localSettings = customSystemSettings;
  if (!localSettings && isClient) {
    try {
      const savedSettings = localStorage.getItem('SYSTEM_SETTINGS_PRESETS');
      if (savedSettings) localSettings = JSON.parse(savedSettings);
    } catch (e) {}
  }
  if (localSettings) {
    maxChildren = localSettings.maxChildrenCount !== undefined ? localSettings.maxChildrenCount : (localSettings.max_children_count !== undefined ? localSettings.max_children_count : 4);
  }

  let finalChildAllowanceVal = activeChildAllowance; // Fallback 30000
  if (localAllowances && Array.isArray(localAllowances)) {
    const matchedChild = localAllowances.find(a => a.type === 'allowance' && a.status === 'فعال' && (a.name.includes('أطفال') || a.name.includes('الاطفال') || a.name.includes('أولاد') || a.name.includes('الاولاد') || a.name.includes('طفل') || a.name.includes('ولد')));
    if (matchedChild) {
      if (matchedChild.calcType === 'percentage' || matchedChild.calc_type === 'percentage') {
        finalChildAllowanceVal = Math.round(baseSalary * (matchedChild.value / 100));
      } else {
        finalChildAllowanceVal = matchedChild.value;
      }
    }
  }

  const empChildrenCount = employee.children_count !== undefined ? employee.children_count : (employee.childrenCount !== undefined ? employee.childrenCount : 0);
  const childrenCount = Math.min(empChildrenCount, maxChildren);
  const childrenAllowance = childAllowanceEnabled ? childrenCount * finalChildAllowanceVal : 0;

  // 4. مخصصات المسؤولية / المنصب
  const responsibilityName = employee.primary_responsibility || employee.primaryResponsibility || "بلا مسؤولية";
  
  let responsibilityRate = RESPONSIBILITY_ALLOWANCE_RATES[responsibilityName] !== undefined 
    ? RESPONSIBILITY_ALLOWANCE_RATES[responsibilityName] 
    : 0;

  // Check for dynamic presets in localStorage
  let responsibilities = null;
  if (isClient) {
    try {
      const savedResps = localStorage.getItem('RESPONSIBILITY_ALLOWANCES_PRESETS');
      if (savedResps) responsibilities = JSON.parse(savedResps);
    } catch (e) {}
  }
  
  if (responsibilities && Array.isArray(responsibilities) && responsibilities.length > 0) {
    const matched = responsibilities.find(r => r.name === responsibilityName);
    if (matched) {
      const rateVal = matched.allowance_rate !== undefined ? matched.allowance_rate : (matched.allowanceRate !== undefined ? matched.allowanceRate : 0);
      responsibilityRate = rateVal / 100;
    }
  }
  
  const positionAllowance = Math.round(baseSalary * responsibilityRate);

  // 5. مخصصات موقع العمل الجغرافية/النائية
  const selectedLocationName = employee.work_location || employee.workLocation;
  let regionAllowance = 0;
  if (selectedLocationName) {
    let locs = customWorkLocations;
    if (!locs && isClient) {
      try {
        const savedLocs = localStorage.getItem('WORK_LOCATIONS');
        if (savedLocs) locs = JSON.parse(savedLocs);
      } catch (e) {}
    }
    if (locs && Array.isArray(locs)) {
      const matched = locs.find(l => l.name === selectedLocationName);
      if (matched) {
        regionAllowance = parseInt(matched.allowance_amount || matched.allowanceAmount || 0);
      }
    }
  }

  // 6. مخصصات أخرى واستقطاعات رسمية فعالة مضافة لجميع الموظفين من جدول المخصصات والاستقطاعات
  let generalCustomAllowances = 0;
  let generalCustomDeductions = 0;

  let sortedLocalAllowances = localAllowances;
  if (localAllowances && Array.isArray(localAllowances) && isClient) {
    try {
      const allowancesOrderStr = localStorage.getItem('CUSTOM_ALLOWANCES_ORDER');
      const deductionsOrderStr = localStorage.getItem('CUSTOM_DEDUCTIONS_ORDER');
      const allowancesOrder = allowancesOrderStr ? JSON.parse(allowancesOrderStr) : [];
      const deductionsOrder = deductionsOrderStr ? JSON.parse(deductionsOrderStr) : [];
      
      sortedLocalAllowances = [...localAllowances].sort((a, b) => {
        if (a.type !== b.type) return 0;
        if (a.type === 'allowance') {
          const idxA = allowancesOrder.indexOf(a.id);
          const idxB = allowancesOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        } else if (a.type === 'deduction') {
          const idxA = deductionsOrder.indexOf(a.id);
          const idxB = deductionsOrder.indexOf(b.id);
          if (idxA === -1 && idxB === -1) return 0;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        }
        return 0;
      });
    } catch (e) {
      console.error("Error sorting custom allowances/deductions:", e);
    }
  }

  if (sortedLocalAllowances && Array.isArray(sortedLocalAllowances)) {
    sortedLocalAllowances.forEach(a => {
      if (a.status === 'فعال' || a.status === 'active') {
        const isSpouse = (a.name.includes('زوجية') || a.name.includes('الزوجية'));
        const isChild = (a.name.includes('أطفال') || a.name.includes('الاطفال') || a.name.includes('أولاد') || a.name.includes('الاولاد') || a.name.includes('طفل') || a.name.includes('ولد'));
        
        if (!isSpouse && !isChild) {
          // Check if there is temporary metadata
          let tempMeta = null;
          if (isClient) {
            try {
              const savedMeta = localStorage.getItem(`TEMPORARY_META_${a.id}`);
              if (savedMeta) tempMeta = JSON.parse(savedMeta);
            } catch (e) {}
          }

          if (tempMeta && tempMeta.isTemporary) {
            // 1. Check date matching (payment month and year or range)
            const finalMonth = parseInt(targetMonth || (new Date().getMonth() + 1));
            const finalYear = parseInt(targetYear || new Date().getFullYear());
            
            if (tempMeta.timingType === 'range') {
              const startYear = parseInt(tempMeta.startYear);
              const startMonth = parseInt(tempMeta.startMonth);
              const endYear = parseInt(tempMeta.endYear);
              const endMonth = parseInt(tempMeta.endMonth);
              
              const startVal = startYear * 12 + startMonth;
              const endVal = endYear * 12 + endMonth;
              const currentVal = finalYear * 12 + finalMonth;
              
              if (currentVal < startVal || currentVal > endVal) {
                return; // Out of temporary period range!
              }
            } else {
              if (parseInt(tempMeta.paymentYear) !== finalYear || parseInt(tempMeta.paymentMonth) !== finalMonth) {
                return; // Skip: temporary item is not for this month/year!
              }
            }

            // 2. Check beneficiary eligibility
            if (tempMeta.beneficiaryType === 'direct') {
              const directIds = tempMeta.directEmployeeIds || [];
              const isBeneficiary = directIds.map(String).includes(String(employee.id));
              if (!isBeneficiary) {
                return; // Skip: employee is not directly selected
              }
            } else {
              // criteria-based
              if (!checkEmployeeMatchesRule(employee, a.id)) {
                return; // Skip: employee doesn't match criteria
              }
            }
          } else {
            // Check custom rules for normal allowances/deductions (eligibility and blocking)
            if (!checkEmployeeMatchesRule(employee, a.id)) {
              return; // Skip this allowance/deduction if the employee doesn't match conditions
            }
          }

          const calcType = a.calcType || a.calc_type;
          const aVal = a.value || 0;
          let calculatedVal = 0;
          if (calcType === 'percentage') {
            calculatedVal = Math.round(baseSalary * (aVal / 100));
          } else {
            calculatedVal = aVal;
          }

          if (a.type === 'allowance' || a.type === 'M_ALLOWANCE') {
            generalCustomAllowances += calculatedVal;
          } else if (a.type === 'deduction' || a.type === 'M_DEDUCTION') {
            generalCustomDeductions += calculatedVal;
          }
        }
      }
    });
  }

  const experienceAllowance = 0; // يمكن تعديله لاحقاً

  let retirementEnabled = true;
  if (isClient) {
    try {
      retirementEnabled = localStorage.getItem('RETIREMENT_STATUS') !== 'متوقف مؤقتاً';
    } catch (e) {}
  }

  const totalAllowances = degreeAllowance + higherDegreeAllowance + spouseAllowance + childrenAllowance + positionAllowance + regionAllowance + extraAllowances + generalCustomAllowances;
  const retirementDeduction = retirementEnabled ? Math.round(baseSalary * activeRetirementRate) : 0;
  const totalDeductions = retirementDeduction + loanDeduction + penaltyDeduction + absenceDeduction + otherDeductions + generalCustomDeductions;
  const netSalary = baseSalary + totalAllowances - totalDeductions;

  return {
    base_salary: baseSalary,
    degree_allowance: degreeAllowance,
    higher_degree_allowance: higherDegreeAllowance,
    spouse_allowance: spouseAllowance,
    children_allowance: childrenAllowance,
    position_allowance: positionAllowance,
    experience_allowance: experienceAllowance,
    region_allowance: regionAllowance,
    extra_allowances: extraAllowances + generalCustomAllowances,
    general_custom_allowances: generalCustomAllowances,
    general_custom_deductions: generalCustomDeductions,
    total_allowances: totalAllowances,
    retirement_deduction: retirementDeduction,
    tax_deduction: 0,
    loan_deduction: loanDeduction,
    penalty_deduction: penaltyDeduction,
    absence_deduction: absenceDeduction,
    other_deductions: otherDeductions + generalCustomDeductions,
    total_deductions: totalDeductions,
    net_salary: netSalary
  };
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('ar-IQ').format(amount) + ' د.ع';
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