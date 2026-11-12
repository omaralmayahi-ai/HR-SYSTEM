// src/api/apiClient.js

// Request helper to handle automatic bearer tokens and json content type
// مهلة قصوى لأي طلب API (مضافة 31-08-2026): طلب متوقف بلا استجابة (hang) في الخادم كان
// يُجمِّد صفحات كاملة إلى الأبد رغم وجود .catch(() => []) لدى المستدعي، لأن fetch بلا AbortController
// لا يرفض (reject) أبداً إن لم يستجب الخادم إطلاقاً - فقط يرفض عند خطأ فعلي أو استجابة غير ناجحة.
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

// حالة قاعدة البيانات كما يراها المتصفح (B2d): تُبثّ كحدث فقط عند تغيّرها
let dbDown = false;
export function setDbDown(down) {
  if (dbDown === down) return;
  dbDown = down;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hr:db-status', { detail: { down } }));
}
export function isDbDown() { return dbDown; }

export async function request(path, options = {}) {
  const token = localStorage.getItem('hr_session_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      signal: options.signal || controller.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`انتهت مهلة الاتصال بالخادم لهذا الطلب (${path}) - الخادم لم يستجب خلال الوقت المحدد`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/settings/public') {
      localStorage.removeItem('hr_session_token');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    const errorMsg = data?.error ? (data.details ? `${data.error} - [${data.details}]` : data.error) : (data?.message || `HTTP error! status: ${response.status}`);
    const err = new Error(errorMsg);
    if (data?.details) err.details = data.details;
    err.status = response.status;
    if (data?.code) err.code = data.code;
    err.data = data; // B6: تفاصيل التعارض (409) للإعدادات المشتركة
    // B2d: انقطاع قاعدة البيانات يُعرض شريطاً واضحاً في أعلى الشاشة (DbStatusBanner)
    if (data?.code === 'DB_UNAVAILABLE') setDbDown(true);
    throw err;
  }
  setDbDown(false);

  if (data === null) {
    if (text && text.trim().startsWith('<')) {
      throw new Error(`Server returned HTML response for ${path}`);
    }
    return text;
  }

  return data;
}

// Generic CRUD entity client creator
function createEntityClient(endpoint) {
  return {
    list: async (order, limit) => {
      return request(`/api/${endpoint}`);
    },
    filter: async (query = {}) => {
      const q = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          q.append(k, v);
        }
      });
      const qs = q.toString() ? `?${q.toString()}` : '';
      return request(`/api/${endpoint}${qs}`);
    },
    get: async (id) => {
      return request(`/api/${endpoint}/${id}`);
    },
    create: async (data) => {
      return request(`/api/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    update: async (id, data) => {
      return request(`/api/${endpoint}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    delete: async (id) => {
      return request(`/api/${endpoint}/${id}`, {
        method: 'DELETE'
      });
    },
    bulkCreate: async (data) => {
      return request(`/api/${endpoint}/bulk`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    }
  };
}

// Custom handling for TrainingEnrollment due to endpoint variations
const TrainingEnrollmentClient = {
  list: async () => request('/api/trainings/enrollments'),
  filter: async (query = {}) => {
    const q = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) q.append(k, v);
    });
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request(`/api/trainings/enrollments${qs}`);
  },
  create: async (data) => {
    return request('/api/trainings/enroll', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
};

export const apiClient = {
  auth: {
    me: async () => {
      const token = localStorage.getItem('hr_session_token');
      if (!token) return null;
      try {
        const user = await request('/api/auth/me');
        return user;
      } catch (e) {
        // الجلسة تُلغى فقط إذا رفضها الخادم (401). انقطاع مؤقت أو 503 لا يُخرج المستخدم (مراجعة B2: M1).
        if (e?.status === 401) {
          localStorage.removeItem('hr_session_token');
          return null;
        }
        throw e;
      }
    },
    loginViaEmailPassword: async (username, password) => {
      const res = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (res.token) {
        localStorage.setItem('hr_session_token', res.token);
      }
      return res.user;
    },
    logout: async () => {
      localStorage.removeItem('hr_session_token');
      return true;
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    },
    users: {
      list: () => request('/api/auth/users'),
      create: (data) => request('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      update: (id, data) => request(`/api/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
      delete: (id) => request(`/api/auth/users/${id}`, {
        method: 'DELETE'
      })
    }
  },
  entities: {
    Employee: createEntityClient('employees'),
    CareerHistory: createEntityClient('career'),
    LeaveRequest: createEntityClient('leaves'),
    Penalty: createEntityClient('penalties'),
    Appreciation: createEntityClient('appreciations'),
    PerformanceEvaluation: createEntityClient('performance'),
    Training: createEntityClient('trainings'),
    TrainingEnrollment: {
      ...TrainingEnrollmentClient,
      update: (id, data) => request(`/api/trainings/enrollments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      delete: (id) => request(`/api/trainings/enrollments/${id}`, { method: 'DELETE' })
    },
    Trainer: createEntityClient('trainers'),
    AnnualPlan: createEntityClient('annual-plans'),
    SalaryRecord: createEntityClient('salaries'),
    Attendance: createEntityClient('attendance'),
    OrgUnit: createEntityClient('org-units'),
    Qualification: {
      ...createEntityClient('qualifications'),
      toggle: async (id) => request(`/api/qualifications/${id}/toggle`, { method: 'PATCH' })
    },
    JobAssignment: createEntityClient('job-assignments'),
    PromotionIncrement: createEntityClient('promotions'),
    SalaryAllowance: createEntityClient('salary-allowances'),
    AnnualEvaluation: createEntityClient('annual-evaluations'),
    TrainingCourse: createEntityClient('training-courses'),
    Transfer: createEntityClient('transfers'),
    Retirement: createEntityClient('retirements'),
    Document: createEntityClient('documents'),
    SalaryScale: createEntityClient('salary-scale'),
    AllowanceDeduction: createEntityClient('allowances-deductions'),
    LeaveType: createEntityClient('leave-types'),
    WorkLocation: createEntityClient('work-locations'),
    EducationDegree: createEntityClient('education-degrees'),
    ServiceType: createEntityClient('service-types'),
    EmployeeStatus: createEntityClient('employee-statuses'),
    ResponsibilityAllowance: createEntityClient('responsibility-allowances'),
    ShiftSystem: createEntityClient('shift-systems'),
    ServiceRecord: createEntityClient('service-records'),
    ServiceCredit: createEntityClient('service-credits'),
    PenaltyType: createEntityClient('penalty-types'),
    EvaluationForm: createEntityClient('evaluation-forms'),
    GoverningCourse: createEntityClient('governing-courses'),
    JobTitle: createEntityClient('job-titles'),
    GradePromotionRule: createEntityClient('grade-promotion-rules'),
    CommendationType: createEntityClient('commendation-types'),
    EmployeeCommendation: createEntityClient('employee-commendations'),
    SpecializationCredit: createEntityClient('specialization-credits'),
    CommendationRulesSetting: {
      get: async () => request('/api/commendation-rules-settings'),
      update: async (data) => request('/api/commendation-rules-settings', {
        method: 'PUT',
        body: JSON.stringify(data)
      })
    },
    PromotionDelayReason: createEntityClient('promotion-delay-reasons')
  },
  settings: {
    get: async () => request('/api/settings'),
    getPublic: async () => request('/api/settings/public'),
    update: async (data) => request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  },
  logs: {
    list: async () => request('/api/logs'),
    create: async (data) => request('/api/logs', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  archive: {
    list: async (entityType) => request(entityType ? `/api/archive?entity_type=${encodeURIComponent(entityType)}` : '/api/archive'),
    restore: async (id) => request(`/api/archive/${id}/restore`, { method: 'POST' }),
    permanentDelete: async (id) => request(`/api/archive/${id}`, { method: 'DELETE' })
  },
  leaveAccrual: {
    getStatus: async () => request('/api/leave-accrual/status'),
    execute: async (data = {}) => request('/api/leave-accrual/execute', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  promotionsDue: {
    // احتساب لكل الموظفين: مهلة أطول من الافتراضية (15 ثانية)
    getDueList: async ({ summaryOnly = false } = {}) => request(`/api/promotions/due-list${summaryOnly ? '?summary=1' : ''}`, { timeoutMs: 90000 }),
    approveBatch: async (data) => request('/api/promotions/approve-batch', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  },
  promotionDelayReasons: {
    getByEmployee: (empId) => request(`/api/promotion-delay-reasons/employee/${empId}`),
    toggleHide: (id, isHidden) => request(`/api/promotion-delay-reasons/${id}/hide`, {
      method: 'PATCH',
      body: JSON.stringify({ isHidden })
    }),
    updateReminder: (id, reminderDate) => request(`/api/promotion-delay-reasons/${id}/reminder`, {
      method: 'PATCH',
      body: JSON.stringify({ reminderDate })
    }),
    getDueReminders: () => request('/api/promotion-delay-reasons/due-reminders')
  },
  // B6 (ق-13): أسابيع دورة الاختصاص لكل ترفيع
  degreeTrackSettings: {
    get: () => request('/api/settings/degree-track'),
    put: (weeks) => request('/api/settings/degree-track', { method: 'PUT', body: JSON.stringify({ weeks_per_promotion: weeks }) }),
  },
  // B6: الإعدادات المشتركة (كانت بالمتصفح فقط)
  sharedSettings: {
    getAll: () => request('/api/shared-settings'),
    put: (key, value, source, base) => request(`/api/shared-settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value, source, base }) }),
  },
  // B5: إنهاء الوحدة التنظيمية بتاريخ
  orgUnits: {
    end: (id, data) => request(`/api/org-units/${id}/end`, { method: 'POST', body: JSON.stringify(data || {}) }),
  },
  // B8a1: بنود الرواتب والإسناد والعائلة والاعتماد الثاني
  // B9: الأدوار والصلاحيات وسجل التدقيق
  roles: {
    list: () => request('/api/roles'),
    create: (data) => request('/api/roles', { method: 'POST', body: JSON.stringify(data) }),
    update: (name, data) => request(`/api/roles/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (name) => request(`/api/roles/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    linkEmployee: (userId, employee_id) => request(`/api/auth/users/${userId}/employee-link`, { method: 'PUT', body: JSON.stringify({ employee_id }) }),
    audit: (params = {}) => request(`/api/admin/audit?${new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)))}`),
  },
  payroll: {
    meta: () => request('/api/payroll/meta'),
    items: () => request('/api/payroll/items'),
    itemHistory: (id) => request(`/api/payroll/items/${id}/history`),
    proposeVersion: (id, data) => request(`/api/payroll/items/${id}/versions`, { method: 'POST', body: JSON.stringify(data) }),
    assignments: (employeeId) => request(`/api/payroll/assignments${employeeId ? `?employee_id=${employeeId}` : ''}`),
    assign: (data) => request('/api/payroll/assignments', { method: 'POST', body: JSON.stringify(data) }),
    endAssignment: (id, data) => request(`/api/payroll/assignments/${id}/end`, { method: 'POST', body: JSON.stringify(data) }),
    family: (employeeId) => request(`/api/payroll/family/${employeeId}`),
    addMember: (employeeId, data) => request(`/api/payroll/family/${employeeId}/members`, { method: 'POST', body: JSON.stringify(data) }),
    addFact: (data) => request('/api/payroll/family/facts', { method: 'POST', body: JSON.stringify(data) }),
    setMode: (employeeId, data) => request(`/api/payroll/family/${employeeId}/mode`, { method: 'POST', body: JSON.stringify(data) }),
    addExtension: (data) => request('/api/payroll/family/extensions', { method: 'POST', body: JSON.stringify(data) }),
    pending: (state) => request(`/api/payroll/pending${state ? `?state=${encodeURIComponent(state)}` : ''}`),
    approve: (id, reason) => request(`/api/payroll/pending/${id}/approve`, { method: 'POST', body: JSON.stringify({ reason }) }),
    reject: (id, reason) => request(`/api/payroll/pending/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    cancel: (id) => request(`/api/payroll/pending/${id}/cancel`, { method: 'POST' }),
    dataQuality: () => request('/api/payroll/data-quality', { timeoutMs: 60000 }),
    // B8a3: الفترات والاحتساب والاعتماد والكشوف
    periods: (category = 'PERM') => request(`/api/payroll/periods?category=${encodeURIComponent(category)}`),
    openPeriod: (data) => request('/api/payroll/periods', { method: 'POST', body: JSON.stringify(data) }),
    period: (id, check) => request(`/api/payroll/periods/${id}${check ? '?check=1' : ''}`, { timeoutMs: 60000 }),
    computePeriod: (id) => request(`/api/payroll/periods/${id}/compute`, { method: 'POST', timeoutMs: 300000 }),
    review: (id, threshold) => request(`/api/payroll/periods/${id}/review${threshold ? `?threshold=${threshold}` : ''}`, { timeoutMs: 60000 }),
    approvePeriod: (id) => request(`/api/payroll/periods/${id}/approve`, { method: 'POST', timeoutMs: 300000 }),
    issuePeriod: (id, dispatch_letter) => request(`/api/payroll/periods/${id}/issue`, { method: 'POST', body: JSON.stringify({ dispatch_letter }) }),
    unapprovePeriod: (id, reason) => request(`/api/payroll/periods/${id}/unapprove`, { method: 'POST', body: JSON.stringify({ reason }) }),
    periodResults: (id, params = {}) => request(`/api/payroll/periods/${id}/results?${new URLSearchParams(params)}`),
    periodEmployee: (id, employeeId) => request(`/api/payroll/periods/${id}/employees/${employeeId}`),
    employeeHistory: (employeeId) => request(`/api/payroll/employees/${employeeId}/history`),
    // B8b: حالات الاستحقاق وربطها والأرصدة
    states: () => request('/api/payroll/states'),
    createState: (fields) => request('/api/payroll/states', { method: 'POST', body: JSON.stringify(fields) }),
    updateState: (id, fields) => request(`/api/payroll/states/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),
    mapState: (data) => request('/api/payroll/state-mappings', { method: 'POST', body: JSON.stringify(data) }),
    employeeBalances: (employeeId, asOfPeriod) => request(`/api/payroll/employees/${employeeId}/balances${asOfPeriod ? `?as_of_period=${asOfPeriod}` : ''}`),
    // B8a4: المطابقة مع الكشف الخارجي
    importProfiles: (category = 'PERM') => request(`/api/payroll/import-profiles?category=${encodeURIComponent(category)}`),
    saveImportProfile: (id, data) => request(id ? `/api/payroll/import-profiles/${id}` : '/api/payroll/import-profiles', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }),
    inspectExternal: (file_base64, sheet) => request('/api/payroll/external/inspect', { method: 'POST', body: JSON.stringify({ file_base64, sheet }), timeoutMs: 120000 }),
    confirmExternalImport: (periodId, importId) => request(`/api/payroll/periods/${periodId}/external-import/${importId}/confirm`, { method: 'POST' }),
    importExternal: (periodId, data) => request(`/api/payroll/periods/${periodId}/external-import`, { method: 'POST', body: JSON.stringify(data), timeoutMs: 300000 }),
    reconciliation: (periodId) => request(`/api/payroll/periods/${periodId}/reconciliation`, { timeoutMs: 120000 }),
    downloadReconciliation: async (periodId) => {
      const token = localStorage.getItem('hr_session_token');
      const res = await fetch(`/api/payroll/periods/${periodId}/reconciliation?format=xlsx`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { let msg = 'تعذّر التصدير'; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `المطابقة-${periodId}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
    // B8c: المصرف والملخص المحاسبي
    bankRejection: (periodId, employee_id, reason) => request(`/api/payroll/periods/${periodId}/bank-rejections`, { method: 'POST', body: JSON.stringify({ employee_id, reason }) }),
    bankAccounts: (employeeId) => request(`/api/payroll/employees/${employeeId}/bank-accounts`),
    addBankAccount: (employeeId, data) => request(`/api/payroll/employees/${employeeId}/bank-accounts`, { method: 'POST', body: JSON.stringify(data) }),
    setAccountCode: (itemId, account_code) => request(`/api/payroll/items/${itemId}/account-code`, { method: 'PUT', body: JSON.stringify({ account_code }) }),
    preview: (employeeId, year, month) => request(`/api/payroll/preview/${employeeId}?year=${year}&month=${month}`, { timeoutMs: 60000 }),
    downloadStatement: async (id, kind, item) => {
      const token = localStorage.getItem('hr_session_token');
      const res = await fetch(`/api/payroll/periods/${id}/statements/${kind}${item ? `?item=${encodeURIComponent(item)}` : ''}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { let msg = 'تعذّر التصدير'; try { msg = (await res.json()).error || msg; } catch {} throw new Error(msg); }
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = m ? decodeURIComponent(m[1]) : `${kind}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    },
  },
  // B4d: إصدارات سلّم الرواتب
  salaryScaleVersions: {
    list: () => request('/api/salary-scale/versions'),
    create: (data) => request('/api/salary-scale/versions', { method: 'POST', body: JSON.stringify(data) }),
    activate: (id) => request(`/api/salary-scale/versions/${id}/approve`, { method: 'POST' }),
    approve: (id) => request(`/api/salary-scale/versions/${id}/approve`, { method: 'POST' }),
    update: (id, data) => request(`/api/salary-scale/versions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    remove: (id) => request(`/api/salary-scale/versions/${id}`, { method: 'DELETE' }),
    rows: (id) => request(`/api/salary-scale/versions/${id}/rows`),
    saveRows: (id, rows) => request(`/api/salary-scale/bulk?version_id=${id}`, { method: 'POST', body: JSON.stringify(rows) }),
    diff: (from, to) => request(`/api/salary-scale/diff?from=${from}&to=${to}`, { timeoutMs: 60000 }),
  },
  // B4: الأوامر الإدارية والسجل الوظيفي المؤرخ
  careerHistory: {
    get: (employeeId) => request(`/api/employees/${employeeId}/history`),
    recordMovement: (employeeId, data) => request(`/api/employees/${employeeId}/movements`, { method: 'POST', body: JSON.stringify(data) }),
    listOrders: () => request('/api/administrative-orders'),
    createOrder: (data) => request('/api/administrative-orders', { method: 'POST', body: JSON.stringify(data) }),
    cancelOrder: (id, data) => request(`/api/administrative-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(data) }),
  }
};

export default apiClient;
