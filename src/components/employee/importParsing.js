// أدوات تحليل ملف استيراد الموظفين (Excel) — دوال نقية قابلة للاختبار

const pad2 = (n) => String(n).padStart(2, '0');

function isValidYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= maxDay;
}

/**
 * تطبيع اسم العمود: حذف المسافات والرموز وتوحيد الهمزات والياء والتاء المربوطة.
 * المطابقة بعدها تكون بالمساواة التامة فقط (لا includes)، فلا يطابق «الحالة» عمود «الحالة الاجتماعية».
 */
export function normalizeHeader(k) {
  if (k === undefined || k === null) return '';
  return String(k)
    .trim()
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '') // تشكيل وتطويل
    .replace(/[^ء-يa-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** القيمة الخام لأول عمود يطابق أحد الأسماء الممكنة تماماً بعد التطبيع وليست فارغة */
export function getColRaw(rowObj, possibleKeys) {
  const entries = Object.entries(rowObj || {}).map(([k, v]) => [normalizeHeader(k), v]);
  for (const p of possibleKeys) {
    const np = normalizeHeader(p);
    for (const [nk, v] of entries) {
      if (nk === np && v !== undefined && v !== null && String(v).trim() !== '') {
        return v;
      }
    }
  }
  return '';
}

export function getColValue(rowObj, possibleKeys) {
  const v = getColRaw(rowObj, possibleKeys);
  if (v === '' || v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * تحويل قيمة تاريخ من Excel إلى yyyy-mm-dd دون انزياح المنطقة الزمنية.
 * يقبل: رقماً تسلسلياً (نظام 1900)، كائن Date، نصاً yyyy-mm-dd أو yyyy/mm/dd أو dd/mm/yyyy أو dd-mm-yyyy.
 * يعيد { value, error }: value = '' عند الفراغ، و error عند قيمة غير صالحة.
 */
export function toIsoDate(raw) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: '', error: null };
  }
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return { value: '', error: 'تاريخ غير صالح' };
    // SheetJS ينشئ التواريخ بمنتصف الليل المحلي: نأخذ مكونات التاريخ المحلية لتجنب انزياح يوم
    const y = raw.getFullYear(), m = raw.getMonth() + 1, d = raw.getDate();
    return { value: `${y}-${pad2(m)}-${pad2(d)}`, error: null };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const serial = Math.floor(raw);
    if (serial < 1) return { value: '', error: `تاريخ غير صالح (${raw})` };
    // عصر Excel الفعلي 1899-12-30 (يعالج خطأ 29 شباط 1900 للأرقام > 60)
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const dt = new Date(ms);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    if (!isValidYmd(y, m, d)) return { value: '', error: `تاريخ غير صالح (${raw})` };
    return { value: `${y}-${pad2(m)}-${pad2(d)}`, error: null };
  }
  const s = String(raw).trim().replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)));
  let m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m1) {
    const y = +m1[1], m = +m1[2], d = +m1[3];
    if (isValidYmd(y, m, d)) return { value: `${y}-${pad2(m)}-${pad2(d)}`, error: null };
    return { value: '', error: `تاريخ غير صالح (${s})` };
  }
  m1 = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m1) {
    // الصيغة العراقية: يوم/شهر/سنة
    const d = +m1[1], m = +m1[2], y = +m1[3];
    if (isValidYmd(y, m, d)) return { value: `${y}-${pad2(m)}-${pad2(d)}`, error: null };
    return { value: '', error: `تاريخ غير صالح (${s})` };
  }
  if (/^\d+(\.\d+)?$/.test(s)) return toIsoDate(Number(s));
  return { value: '', error: `صيغة تاريخ غير معروفة (${s}) — المطلوب yyyy-mm-dd` };
}

/** الإجراء الافتراضي للصف: المكرر يُتجاوز (لا كتابة فوق القيد القائم إلا باختيار صريح) */
export function defaultDuplicateAction(isDuplicate) {
  return isDuplicate ? 'skip' : 'insert';
}
