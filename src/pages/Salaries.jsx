import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculateSalary, formatCurrency, SALARY_TABLE, PROMOTION_YEARS, ANNUAL_INCREMENTS } from '@/lib/salaryTable';
import { Plus, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function Salaries() {
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dbSalaryScale, setDbSalaryScale] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    apiClient.entities.Employee.filter({ status: 'فعال' }).then(setEmployees);
    loadSalaries();
    
    // Load dynamic salary scale from DB
    apiClient.entities.SalaryScale.list().then(records => {
      if (records && records.length > 0) {
        const scaleMap = {};
        records.forEach(r => {
          if (!scaleMap[r.grade]) scaleMap[r.grade] = {};
          scaleMap[r.grade][r.step] = r.amount;
        });
        setDbSalaryScale(scaleMap);
      }
    }).catch(err => {
      console.error("Error fetching db salary scale:", err);
    });

    // Sync custom allowances/deductions to presets cache
    apiClient.entities.AllowanceDeduction.list().then(records => {
      if (records) {
        localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(records));
      }
    }).catch(err => {
      console.error("Error syncing custom allowances/deductions:", err);
    });
  }, [month, year]);

  const loadSalaries = () => {
    setLoading(true);
    apiClient.entities.SalaryRecord.filter({ month, year }).then(data => {
      setSalaries(data);
      setLoading(false);
    });
  };

  const generateSalaries = async () => {
    setGenerating(true);
    
    // Auto expiration check for temporary allowances/deductions
    try {
      const presetsStr = localStorage.getItem('ALLOWANCES_DEDUCTIONS_PRESETS');
      if (presetsStr) {
        const presets = JSON.parse(presetsStr);
        let updated = false;
        const nextPresets = presets.map(p => {
          let isTemp = false;
          let meta = null;
          try {
            const metaStr = localStorage.getItem(`TEMPORARY_META_${p.id}`);
            if (metaStr) {
              meta = JSON.parse(metaStr);
              isTemp = meta.isTemporary;
            }
          } catch (e) {}

          if (isTemp && meta && p.status === 'فعال') {
            let expired = false;
            if (meta.timingType === 'single') {
              if (meta.paymentYear < year || (meta.paymentYear === year && meta.paymentMonth < month)) {
                expired = true;
              }
            } else if (meta.timingType === 'range') {
              if (meta.endYear < year || (meta.endYear === year && meta.endMonth < month)) {
                expired = true;
              }
            }

            if (expired) {
              updated = true;
              return { ...p, status: 'موقوف' };
            }
          }
          return p;
        });

        if (updated) {
          localStorage.setItem('ALLOWANCES_DEDUCTIONS_PRESETS', JSON.stringify(nextPresets));
          console.log('Expired temporary allowances/deductions have been automatically stopped.');
        }
      }
    } catch (errExpire) {
      console.error('Error in automatic expiration logic:', errExpire);
    }

    const existing = await apiClient.entities.SalaryRecord.filter({ month, year });
    const existingIds = new Set(existing.map(s => s.employee_id));
    const toCreate = employees
      .filter(e => !existingIds.has(e.id))
      .map(emp => {
        const calc = calculateSalary(emp, 0, 0, 0, 0, 0, dbSalaryScale, null, null, null, null, month, year);
        return { employee_id: emp.id, month, year, ...calc, status: 'مسودة' };
      });
    if (toCreate.length > 0) {
      await apiClient.entities.SalaryRecord.bulkCreate(toCreate);
    }
    toast({ title: `تم توليد ${toCreate.length} قسيمة راتب` });
    loadSalaries();
    setGenerating(false);
  };

  const approveSalary = async (salaryId) => {
    await apiClient.entities.SalaryRecord.update(salaryId, { status: 'معتمد' });
    loadSalaries();
  };

  const employeeMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const totalNet = salaries.reduce((s, r) => s + (r.net_salary || 0), 0);

  const YEARS = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">إدارة الرواتب</h1>
          <p className="text-slate-500 text-sm">وفق الجدول الموحد للرواتب 2023</p>
        </div>
        <Button onClick={generateSalaries} disabled={generating} className="bg-[#C8960C] hover:bg-[#a67a0a] text-white rounded-xl gap-2">
          <Plus size={16} /> {generating ? 'جاري التوليد...' : 'توليد رواتب الشهر'}
        </Button>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-3 items-center">
        <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
          <SelectTrigger className="w-36 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
          <SelectTrigger className="w-28 rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex-1" />
        <div className="bg-[#1B3A6B]/5 rounded-xl px-4 py-2">
          <span className="text-slate-500 text-sm">إجمالي كتلة الرواتب: </span>
          <span className="font-bold text-[#1B3A6B]">{formatCurrency(totalNet)}</span>
        </div>
      </div>

      {/* Salary Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1B3A6B] text-white">
                  <th className="text-right px-4 py-3 font-medium">#</th>
                  <th className="text-right px-4 py-3 font-medium">الموظف</th>
                  <th className="text-right px-4 py-3 font-medium">الدرجة/المرحلة</th>
                  <th className="text-right px-4 py-3 font-medium">الراتب الأساسي</th>
                  <th className="text-right px-4 py-3 font-medium">العلاوات</th>
                  <th className="text-right px-4 py-3 font-medium">الاستقطاعات</th>
                  <th className="text-right px-4 py-3 font-medium">الصافي</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((s, idx) => {
                  const emp = employeeMap[s.employee_id];
                  return (
                    <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium text-[#1B3A6B]">{emp?.full_name || s.employee_id}</td>
                      <td className="px-4 py-3 text-slate-600">{emp?.grade || '—'}/{emp?.step || '—'}</td>
                      <td className="px-4 py-3">{formatCurrency(s.base_salary)}</td>
                      <td className="px-4 py-3 text-green-600">+{formatCurrency(s.total_allowances)}</td>
                      <td className="px-4 py-3 text-red-600">-{formatCurrency(s.total_deductions)}</td>
                      <td className="px-4 py-3 font-bold text-[#1B3A6B]">{formatCurrency(s.net_salary)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'معتمد' ? 'bg-green-100 text-green-700' :
                          s.status === 'مدفوع' ? 'bg-blue-100 text-blue-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'مسودة' && (
                          <button onClick={() => approveSalary(s.id)} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
                            <CheckCircle size={14} /> اعتماد
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {salaries.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    لا توجد رواتب محوّلة لهذا الشهر — اضغط "توليد رواتب الشهر"
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Salary Scale Reference */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
        <h3 className="font-bold text-[#1B3A6B] mb-4">جدول سلم الرواتب الحالي (د.ع)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-[#1B3A6B]/5">
                <th className="px-3 py-2 text-right font-semibold border-b border-slate-200">الدرجة</th>
                <th className="px-3 py-2 text-center font-semibold border-b border-slate-200">سنوات الترفيع</th>
                <th className="px-3 py-2 text-center font-semibold border-b border-slate-200">العلاوة السنوية</th>
                {[1,2,3,4,5,6,7,8,9,10,11].map(s => (
                  <th key={s} className="px-3 py-2 font-semibold border-b border-slate-200 text-center">م{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1,2,3,4,5,6,7,8,9,10].map(g => (
                <tr key={g} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-[#1B3A6B]">الدرجة {g}</td>
                  <td className="px-3 py-2 text-center font-bold text-slate-700">{PROMOTION_YEARS[g] ? `${PROMOTION_YEARS[g]} سنوات` : '-'}</td>
                  <td className="px-3 py-2 text-center font-bold text-emerald-700">{new Intl.NumberFormat('ar-IQ').format(ANNUAL_INCREMENTS[g])} د.ع</td>
                  {[1,2,3,4,5,6,7,8,9,10,11].map(s => {
                    const currentScale = dbSalaryScale || SALARY_TABLE;
                    const amount = currentScale[g]?.[s] || 0;
                    return (
                      <td key={s} className="px-3 py-2 text-center text-slate-600 font-mono">
                        {amount > 0 ? new Intl.NumberFormat('ar-IQ').format(amount) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}