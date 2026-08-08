import { apiClient } from '@/api/apiClient';

/**
 * Dispatch event when any system setting is updated, added, deleted, reordered or toggled.
 */
export function notifySettingsChanged(settingType, data = null) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('SYSTEM_SETTINGS_UPDATED', {
        detail: { type: settingType, data, timestamp: Date.now() },
      })
    );
    window.dispatchEvent(new Event('storage'));
  }
}

/**
 * Helper to sort array by an array of ordered IDs stored in localStorage.
 */
export function applySavedOrder(items, storageKey) {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  if (typeof window === 'undefined') return items;

  const savedOrder = localStorage.getItem(storageKey);
  if (!savedOrder) return items;

  try {
    const orderIds = JSON.parse(savedOrder);
    if (!Array.isArray(orderIds)) return items;

    return [...items].sort((a, b) => {
      const indexA = orderIds.indexOf(a.id);
      const indexB = orderIds.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  } catch (e) {
    console.error(`Error applying order for ${storageKey}:`, e);
    return items;
  }
}

/**
 * Fetch Education Degrees sorted according to user preference in EducationDegreesSettings.
 */
export async function fetchEducationDegreesSorted() {
  try {
    const data = await apiClient.entities.EducationDegree.list();
    const sortedData = applySavedOrder(data || [], 'EDUCATION_DEGREES_ORDER');
    if (typeof window !== 'undefined') {
      localStorage.setItem('EDUCATION_DEGREES_PRESETS', JSON.stringify(sortedData));
    }
    return sortedData;
  } catch (err) {
    console.warn('Could not fetch education degrees from API:', err?.message || err);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('EDUCATION_DEGREES_PRESETS');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return [];
  }
}

/**
 * Fetch Responsibility Allowances sorted according to user preference.
 */
export async function fetchResponsibilityAllowancesSorted() {
  try {
    const data = await apiClient.entities.ResponsibilityAllowance.list();
    const sortedData = applySavedOrder(data || [], 'RESPONSIBILITY_ALLOWANCES_ORDER');
    if (typeof window !== 'undefined') {
      localStorage.setItem('RESPONSIBILITY_ALLOWANCES_PRESETS', JSON.stringify(sortedData));
    }
    return sortedData;
  } catch (err) {
    console.warn('Could not fetch responsibility allowances from API:', err?.message || err);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('RESPONSIBILITY_ALLOWANCES_PRESETS');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return [];
  }
}

/**
 * Fetch Penalty Types sorted according to user preference in PenaltyTypesSettings.
 */
export async function fetchPenaltyTypesSorted() {
  try {
    const data = await apiClient.entities.PenaltyType.list();
    const sortedData = applySavedOrder(data || [], 'PENALTY_TYPES_ORDER');
    if (typeof window !== 'undefined') {
      localStorage.setItem('PENALTY_TYPES_PRESETS', JSON.stringify(sortedData));
    }
    return sortedData;
  } catch (err) {
    console.warn('Could not fetch penalty types from API:', err?.message || err);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('PENALTY_TYPES_PRESETS');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return [];
  }
}

/**
 * Fetch Evaluation Forms sorted according to user preference.
 */
export async function fetchEvaluationFormsSorted() {
  try {
    const data = await apiClient.entities.EvaluationForm.list();
    const sortedData = applySavedOrder(data || [], 'EVALUATION_FORMS_ORDER');
    if (typeof window !== 'undefined') {
      localStorage.setItem('EVALUATION_FORMS_PRESETS', JSON.stringify(sortedData));
    }
    return sortedData;
  } catch (err) {
    console.warn('Could not fetch evaluation forms from API:', err?.message || err);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('EVALUATION_FORMS_PRESETS');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return [];
  }
}

/**
 * Fetch Governing Courses sorted according to user preference.
 */
export async function fetchGoverningCoursesSorted() {
  try {
    const data = await apiClient.entities.GoverningCourse.list();
    const sortedData = applySavedOrder(data || [], 'GOVERNING_COURSES_ORDER');
    if (typeof window !== 'undefined') {
      localStorage.setItem('GOVERNING_COURSES_PRESETS', JSON.stringify(sortedData));
    }
    return sortedData;
  } catch (err) {
    console.warn('Could not fetch governing courses from API:', err?.message || err);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('GOVERNING_COURSES_PRESETS');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return [];
  }
}

/**
 * Subscribe to settings changes across components.
 */
export function subscribeToSettingsUpdates(callback) {
  if (typeof window === 'undefined') return () => {};

  const handleCustomEvent = (e) => {
    if (callback) callback(e.detail);
  };
  const handleStorage = () => {
    if (callback) callback({ type: 'all' });
  };

  window.addEventListener('SYSTEM_SETTINGS_UPDATED', handleCustomEvent);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener('SYSTEM_SETTINGS_UPDATED', handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
  };
}
