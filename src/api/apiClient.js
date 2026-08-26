// src/api/apiClient.js

// Request helper to handle automatic bearer tokens and json content type
export async function request(path, options = {}) {
  const token = localStorage.getItem('hr_session_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  
  const response = await fetch(path, {
    ...options,
    headers
  });
  
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
    const errorMsg = data?.error || data?.message || `HTTP error! status: ${response.status}`;
    throw new Error(errorMsg);
  }

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
        localStorage.removeItem('hr_session_token');
        return null;
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
    ResponsibilityAllowance: createEntityClient('responsibility-allowances'),
    ShiftSystem: createEntityClient('shift-systems'),
    ServiceRecord: createEntityClient('service-records'),
    PenaltyType: createEntityClient('penalty-types'),
    EvaluationForm: createEntityClient('evaluation-forms'),
    GoverningCourse: createEntityClient('governing-courses'),
    JobTitle: createEntityClient('job-titles')
  },
  settings: {
    get: async () => request('/api/settings'),
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
  leaveAccrual: {
    getStatus: async () => request('/api/leave-accrual/status'),
    execute: async (data = {}) => request('/api/leave-accrual/execute', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
};

export default apiClient;
