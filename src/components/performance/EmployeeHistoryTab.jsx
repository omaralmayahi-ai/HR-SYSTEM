import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EVALUATION_GRADE_SCALE } from '@/lib/evaluationEngine';
import {
  User, Search, Calendar, Printer, Eye, Clock,
  Network, TrendingUp, X
} from 'lucide-react';
import PrintSingleEvaluationModal from './PrintSingleEvaluationModal';
import OrgTreePickerModal from './OrgTreePickerModal';

// Custom Responsive SVG Performance Trend Chart Component
function PerformanceSvgTrendChart({ data = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 220;
  const padding = { top: 25, right: 35, bottom: 40, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const getX = (index) => {
    if (data.length === 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (data.length - 1)) * graphWidth;
  };

  const getY = (score) => {
    const clamped = Math.max(0, Math.min(100, score));
    return padding.top + graphHeight - (clamped / 100) * graphHeight;
  };

  const points = data.map((d, i) => ({ x: getX(i), y: getY(d.score), data: d, index: i }));

  let pathD = '';
  let areaD = '';

  if (points.length === 1) {
    const p = points[0];
    pathD = `M ${padding.left} ${p.y} L ${width - padding.right} ${p.y}`;
    areaD = `M ${padding.left} ${height - padding.bottom} L ${padding.left} ${p.y} L ${width - padding.right} ${p.y} L ${width - padding.right} ${height - padding.bottom} Z`;
  } else {
    pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
    const firstP = points[0];
    const lastP = points[points.length - 1];
    areaD = `${pathD} L ${lastP.x} ${height - padding.bottom} L ${firstP.x} ${height - padding.bottom} Z`;
  }

  const thresholdLines = [
    { score: 90, label: 'ممتاز (&ge;90)', color: '#10B981' },
    { score: 80, label: 'جيد جداً (&ge;80)', color: '#3B82F6' },
    { score: 70, label: 'جيد (&ge;70)', color: '#F59E0B' },
  ];

  return (
    <div className="relative w-full pt-1">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1B3A6B" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#1B3A6B" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid lines & Y-axis labels */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = getY(val);
          return (
            <g key={val}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray="3 3"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono font-bold"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Threshold reference lines */}
        {thresholdLines.map((t) => {
          const y = getY(t.score);
          return (
            <line
              key={t.score}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={t.color}
              strokeWidth="1.2"
              strokeDasharray="4 3"
              opacity="0.75"
            />
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#scoreGradient)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke="#1B3A6B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points & X axis labels */}
        {points.map((p, i) => {
          const isHovered = hoveredIdx === i;
          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {/* X label */}
              <text
                x={p.x}
                y={height - 12}
                textAnchor="middle"
                className="text-[11px] font-bold fill-slate-700"
              >
                {p.data.year}
              </text>

              {/* Pulse background if hovered */}
              {isHovered && (
                <circle cx={p.x} cy={p.y} r="10" fill="#1B3A6B" opacity="0.25" />
              )}

              {/* Data Circle */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 7 : 5}
                fill={isHovered ? '#F59E0B' : '#1B3A6B'}
                stroke="#FFFFFF"
                strokeWidth="2"
              />

              {/* Score label above point */}
              <text
                x={p.x}
                y={p.y - 10}
                textAnchor="middle"
                className="text-[11px] font-black fill-indigo-950 font-mono"
              >
                {p.data.score}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hovered Tooltip Overlay */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          className="absolute z-20 bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs font-bold border border-slate-700 space-y-1 pointer-events-none transition-all duration-150"
          style={{
            top: '10px',
            left: `${(points[hoveredIdx].x / width) * 100}%`,
            transform: 'translateX(-50%)'
          }}
          dir="rtl"
        >
          <p className="font-mono text-amber-400 border-b border-slate-700 pb-1">
            {points[hoveredIdx].data.year}
          </p>
          <div className="flex items-center justify-between gap-3">
            <span>الدرجة الكلية:</span>
            <span className="font-mono text-sm font-black text-amber-300">
              {points[hoveredIdx].data.score} / 100
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <span>التقدير المعتمد:</span>
            <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-black">
              {points[hoveredIdx].data.grade}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 pt-1">
            المقيم: {points[hoveredIdx].data.evaluator}
          </p>
        </div>
      )}
    </div>
  );
}

export default function EmployeeHistoryTab({
  employees = [],
  evaluations = [],
  forms = [],
  orgUnits = []
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgUnit, setSelectedOrgUnit] = useState('all');
  const [isOrgTreeModalOpen, setIsOrgTreeModalOpen] = useState(false);

  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [selectedYearFilter, setSelectedYearFilter] = useState('all');

  const [selectedEvalDetail, setSelectedEvalDetail] = useState(null);
  const [activePrintModal, setActivePrintModal] = useState({ isOpen: false, employee: null, evaluation: null });

  // Filter employees matching selected org unit & search query
  const matchingEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Org Unit filter
      if (selectedOrgUnit === 'unassigned') {
        const dept = (emp.department || '').trim();
        const sec = (emp.section || '').trim();
        if ((dept && dept !== 'غير محدد' && dept !== 'بدون تشكيل') || (sec && sec !== 'غير محدد')) return false;
      } else if (selectedOrgUnit !== 'all') {
        const dept = (emp.department || '').trim();
        const sec = (emp.section || '').trim();
        if (dept !== selectedOrgUnit && sec !== selectedOrgUnit) return false;
      }

      // Search Filter
      if (!searchTerm.trim()) return true;
      const q = searchTerm.trim().toLowerCase();
      const name = (emp.full_name || emp.fullName || '').toLowerCase();
      const num = String(
        emp.company_number || emp.companyNumber ||
        emp.badge_number || emp.badgeNumber ||
        emp.employee_id || emp.employeeId ||
        emp.employee_number || emp.employeeNumber ||
        emp.civil_service_number || emp.civilServiceNumber ||
        emp.file_number || emp.fileNumber ||
        emp.id_number || emp.idNumber || ''
      ).toLowerCase();
      const job = (emp.job_title || emp.jobTitle || '').toLowerCase();
      const dept = (emp.department || emp.section || '').toLowerCase();
      return name.includes(q) || num.includes(q) || job.includes(q) || dept.includes(q);
    });
  }, [employees, selectedOrgUnit, searchTerm]);

  // Selected employee object
  const selectedEmp = useMemo(() => {
    if (!selectedEmpId) return null;
    return employees.find(e => String(e.id) === String(selectedEmpId)) || null;
  }, [employees, selectedEmpId]);

  // Filter all historical evaluations for selected employee sorted by year descending
  const empHistoryEvals = useMemo(() => {
    if (!selectedEmp) return [];
    return evaluations
      .filter(e => String(e.employee_id || e.employeeId) === String(selectedEmp.id))
      .sort((a, b) => Number(b.year) - Number(a.year));
  }, [evaluations, selectedEmp]);

  // List of distinct years in which the employee has received an evaluation
  const evaluatedYears = useMemo(() => {
    const set = new Set();
    empHistoryEvals.forEach(e => {
      if (e.year) set.add(String(e.year));
    });
    return Array.from(set).sort((a, b) => Number(b) - Number(a));
  }, [empHistoryEvals]);

  // Filtered evaluations list based on year filter pill selection
  const displayedEvals = useMemo(() => {
    if (selectedYearFilter === 'all') return empHistoryEvals;
    return empHistoryEvals.filter(e => String(e.year) === String(selectedYearFilter));
  }, [empHistoryEvals, selectedYearFilter]);

  // Chart data sorted chronologically (year ascending)
  const chartData = useMemo(() => {
    return [...empHistoryEvals]
      .filter(e => e.status !== 'بانتظار التقييم' || (e.total_score ?? e.totalScore ?? 0) > 0)
      .sort((a, b) => Number(a.year) - Number(b.year))
      .map(e => ({
        year: `سنة ${e.year}`,
        yearNum: e.year,
        score: Number(e.total_score ?? e.totalScore ?? 0),
        grade: e.grade || 'غير محدد',
        evaluator: e.evaluator || 'اللجنة المركزية'
      }));
  }, [empHistoryEvals]);

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Header */}
      <div className="bg-[#1B3A6B] text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-white rounded-full text-xs font-medium">
            <User size={14} />
            السجل التقييمي الشامل والمخطط البياني للموظف
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            البحث والاستعلام عن تقييمات الموظف حسب السنوات
          </h2>
          <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
            تصفح السجل التقييمي للموظفين وفق الهيكل التنظيمي، التنقل بين سنوات التقييم المسجلة، معاينة وطباعة الاستمارات الرسمية، ومتابعة منحنى تطور الأداء عبر المخطط البياني.
          </p>
        </div>
      </div>

      {/* Horizontal Employee Search & Org Selector Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#1B3A6B] text-white rounded-xl">
              <Search size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                اختيار وتحديد الموظف للبحث والاستعلام
                <span className="text-xs bg-slate-100 text-[#1B3A6B] font-bold px-2.5 py-0.5 rounded-full border border-slate-200">
                  {matchingEmployees.length} موظف
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                اختر تشكيلاً من الهيكل التنظيمي أو ابحث بالاسم والرقم الوظيفي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* Org Tree Picker Button */}
            <Button
              type="button"
              onClick={() => setIsOrgTreeModalOpen(true)}
              className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-2xs"
            >
              <div className="p-1 rounded-md bg-[#1B3A6B] text-white flex-shrink-0">
                <Network size={14} />
              </div>
              <span className="truncate max-w-[200px]">
                {selectedOrgUnit === 'all'
                  ? 'جميع التشكيلات والأقسام'
                  : selectedOrgUnit === 'unassigned'
                  ? 'غير منسوبين لقسم'
                  : selectedOrgUnit}
              </span>
              <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                تحديد من الهيكل التنظيمي
              </span>
            </Button>

            {/* Search Input */}
            <div className="w-full md:w-64">
              <Input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="بحث باسم الموظف أو الرقم الوظيفي..."
                className="text-xs rounded-xl border-slate-200 focus:border-[#1B3A6B]"
              />
            </div>
          </div>
        </div>

        {/* Horizontal Employee Cards Scroll List */}
        <div>
          {matchingEmployees.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
              لا يوجد موظفون مطابقون لخيارات الفلترة
            </div>
          ) : (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-2 pt-1">
              {matchingEmployees.map((emp) => {
                const isSelected = selectedEmp && String(emp.id) === String(selectedEmp.id);

                return (
                  <button
                    key={emp.id}
                    onClick={() => {
                      setSelectedEmpId(emp.id);
                      setSelectedYearFilter('all');
                    }}
                    className={`flex-shrink-0 min-w-[220px] max-w-[260px] text-right p-3 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm ring-2 ring-[#1B3A6B]/30'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="font-bold truncate text-xs">{emp.full_name || emp.fullName}</div>
                    <div className={`text-[10px] mt-0.5 font-mono ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                      الرقم الوظيفي: {emp.civil_service_number || emp.civilServiceNumber || emp.employee_number || '—'}
                    </div>
                    <div className={`text-[10px] font-medium truncate mt-0.5 ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                      {emp.job_title || emp.jobTitle || 'موظف'} &bull; {emp.section || emp.department || 'عام'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected Employee History Details View */}
      {selectedEmp ? (
        <div className="space-y-6">
          {/* Employee Summary Card with Close Button */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-[#1B3A6B] text-white rounded-2xl flex items-center justify-center font-bold text-xl shadow-xs">
                <User size={32} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{selectedEmp.full_name || selectedEmp.fullName}</h3>
                  <span className="text-xs bg-slate-100 text-[#1B3A6B] font-medium px-2.5 py-0.5 rounded-full border border-slate-200">
                    {selectedEmp.section || selectedEmp.department || 'غير محدد'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 font-normal flex flex-wrap items-center gap-3">
                  <span>الرقم الوظيفي: <strong className="font-mono text-slate-900">{selectedEmp.civil_service_number || selectedEmp.civilServiceNumber || selectedEmp.employee_number || '—'}</strong></span>
                  <span>المسمى: <strong className="text-slate-900">{selectedEmp.job_title || selectedEmp.jobTitle || 'موظف'}</strong></span>
                  <span>الدرجة والمرحلة: <strong className="text-slate-900">درجة {selectedEmp.grade || '—'} / مرحلة {selectedEmp.step || '—'}</strong></span>
                  <span>الشهادة: <strong className="text-slate-900">{selectedEmp.education_level || selectedEmp.educationLevel || '—'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">سنوات التقييم المسجلة</span>
                <span className="text-xl font-black font-mono text-indigo-950">{evaluatedYears.length} سنوات</span>
              </div>

              {/* Close Employee Card Button */}
              <Button
                onClick={() => setSelectedEmpId(null)}
                className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                <X size={15} />
                <span>إغلاق بطاقة الموظف</span>
              </Button>
            </div>
          </div>

          {/* Performance Trend Chart Section */}
          {chartData.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <TrendingUp size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">
                      المخطط البياني لمنحنى أداء الموظف عبر السنوات
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      تتبع التطور السنوي للدرجات الكلية والتقديرات المعتمدة رسمياً
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> ممتاز (&ge;90)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> جيد جداً (&ge;80)</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> جيد (&ge;70)</span>
                </div>
              </div>

              <div className="w-full pt-2">
                <PerformanceSvgTrendChart data={chartData} />
              </div>
            </div>
          )}

          {/* Evaluation Years Navigation Bar & Cards */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-5">
            {/* Year Navigation Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Calendar size={18} className="text-[#1B3A6B]" />
                  التنقل بين سنوات التقييم السنوي للموظف
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تظهر أدناه حصراً السنوات التي حاز الموظف فيها على تقييم أداء سنوي مسجل
                </p>
              </div>

              {/* Year Pills Navigation */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedYearFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedYearFilter === 'all'
                      ? 'bg-[#1B3A6B] text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  جميع السنوات ({evaluatedYears.length})
                </button>

                {evaluatedYears.map(yr => {
                  const yrEval = empHistoryEvals.find(e => String(e.year) === String(yr));
                  const isSelected = selectedYearFilter === String(yr);
                  const gradeLabel = yrEval?.grade || 'بانتظار التقييم';
                  const gradeBadge = EVALUATION_GRADE_SCALE.find(g => g.label === gradeLabel) || { bg: 'bg-slate-100 text-slate-800' };

                  return (
                    <button
                      key={yr}
                      onClick={() => setSelectedYearFilter(String(yr))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-black'
                          : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                      }`}
                    >
                      <span className="font-mono">سنة {yr}</span>
                      {yrEval && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-black ${gradeBadge.bg}`}>
                          {gradeLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Displayed Evaluations Cards List */}
            {displayedEvals.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <p className="font-bold text-xs">لا يوجد أي تقييم مسجل لهذا الموظف للفلتر المحدد.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {displayedEvals.map((ev) => {
                  const totalScore = ev.total_score ?? ev.totalScore ?? 0;
                  const gradeLabel = ev.grade || 'غير محدد';
                  const gradeBadge = EVALUATION_GRADE_SCALE.find(g => g.label === gradeLabel) || { bg: 'bg-slate-100 text-slate-800' };

                  return (
                    <div
                      key={ev.id}
                      className="border-2 border-slate-200 rounded-2xl p-5 transition-all hover:border-[#1B3A6B]/40 bg-white shadow-2xs space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="bg-[#1B3A6B] text-amber-300 px-3.5 py-1.5 rounded-xl font-black text-sm font-mono shadow-2xs">
                            تقييم سنة {ev.year}
                          </div>

                          <div>
                            <h4 className="font-black text-xs text-indigo-950">{ev.form_title || ev.formTitle || 'استمارة تقييم الأداء السنوي'}</h4>
                            <span className="text-[11px] text-slate-500 font-bold">
                              جهة التقييم / المقيم: <strong className="text-slate-800">{ev.evaluator || 'اللجنة المركزية'}</strong> &bull; تاريخ التحرير: <span className="font-mono">{ev.evaluation_date || ev.evaluationDate || '—'}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {ev.status === 'بانتظار التقييم' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <Clock size={13} />
                              استمارة مطلقة - بانتظار التعبئة
                            </span>
                          ) : (
                            <div className="flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                              <div className="text-right">
                                <span className="text-[9px] text-slate-400 block font-bold">الدرجة الكلية:</span>
                                <span className="font-mono text-xl font-black text-indigo-950">{totalScore} <span className="text-xs text-slate-400 font-normal">/100</span></span>
                              </div>
                              <span className={`px-3 py-1 rounded-lg text-xs font-black ${gradeBadge.bg}`}>
                                التقدير: {gradeLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Custom Fields summary */}
                      {(ev.weaknesses || ev.strengths || ev.training_needs || ev.trainingNeeds || ev.employee_opinion || ev.employeeOpinion) && (
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                          {ev.weaknesses && (
                            <div><strong className="text-rose-700">نقاط الضعف الملاحظة:</strong> <span className="text-slate-700">{ev.weaknesses}</span></div>
                          )}
                          {ev.strengths && (
                            <div><strong className="text-emerald-700">نقاط القوة والإنجازات:</strong> <span className="text-slate-700">{ev.strengths}</span></div>
                          )}
                          {(ev.training_needs || ev.trainingNeeds) && (
                            <div><strong className="text-blue-700">الاحتياجات التدريبية المقترحة:</strong> <span className="text-slate-700">{ev.training_needs || ev.trainingNeeds}</span></div>
                          )}
                          <div>
                            <strong className="text-purple-700">رأي الموظف بالتقييم:</strong>{' '}
                            <span className="text-slate-700">{ev.employee_opinion || ev.employeeOpinion || 'لم يضع الموظف رأيه بهذا التقييم'}</span>
                          </div>
                        </div>
                      )}

                      {/* Actions: Preview & Print with Official Modal */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 font-bold">
                          رمز الاستمارة: <span className="font-mono text-slate-600">{ev.form_id || '—'}</span>
                        </span>

                        <div className="flex items-center gap-2">
                          {/* Main Preview & Print Button using Official Print Single Evaluation Modal */}
                          <Button
                            onClick={() => setActivePrintModal({ isOpen: true, employee: selectedEmp, evaluation: ev })}
                            className="bg-[#1B3A6B] hover:bg-[#152e55] text-white text-xs font-black px-4 py-2 rounded-xl flex items-center gap-2 shadow-xs cursor-pointer transition-all"
                          >
                            <Printer size={15} className="text-amber-400" />
                            <span>معاينة وطباعة استمارة تقييم الأداء الرسمية</span>
                          </Button>

                          <Button
                            onClick={() => setSelectedEvalDetail({ evaluation: ev, employee: selectedEmp })}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye size={14} />
                            <span>تفاصيل</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-2">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <User size={24} />
          </div>
          <h4 className="font-bold text-sm text-slate-700">لم يتم تحديد أي موظف</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            يرجى الضغط على أحد الموظفين من القائمة العرضية أعلاه لمعاينة بياناته وتقييمات أداء السنوات المسجلة له.
          </p>
        </div>
      )}

      {/* Official Print Single Evaluation Modal */}
      {activePrintModal.isOpen && (
        <PrintSingleEvaluationModal
          isOpen={activePrintModal.isOpen}
          onClose={() => setActivePrintModal({ isOpen: false, employee: null, evaluation: null })}
          evaluation={activePrintModal.evaluation}
          employee={activePrintModal.employee}
          form={forms.find(f => f.id === activePrintModal.evaluation?.form_id)}
        />
      )}

      {/* Detail Preview Modal */}
      {selectedEvalDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[85vh] space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-sm text-slate-900">
                تفاصيل تقييم أداء الموظف لسنة {selectedEvalDetail.evaluation.year}
              </h3>
              <Button
                variant="ghost"
                onClick={() => setSelectedEvalDetail(null)}
                className="text-slate-400 hover:text-slate-900 p-1 rounded-lg cursor-pointer"
              >
                ✕
              </Button>
            </div>

            <div className="bg-[#1B3A6B] text-white p-4 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-slate-300 text-[10px] block font-bold">الدرجة النهائية والتقدير</span>
                <span className="text-2xl font-black font-mono text-amber-400">{selectedEvalDetail.evaluation.total_score ?? selectedEvalDetail.evaluation.totalScore} / 100</span>
              </div>
              <span className="text-xs font-black px-3 py-1 bg-amber-500 text-slate-950 rounded-lg">
                التقدير: {selectedEvalDetail.evaluation.grade}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {selectedEvalDetail.evaluation.weaknesses && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                  <strong className="text-rose-800 block font-bold mb-0.5">نقاط الضعف:</strong>
                  <p className="text-slate-700">{selectedEvalDetail.evaluation.weaknesses}</p>
                </div>
              )}

              {selectedEvalDetail.evaluation.strengths && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <strong className="text-emerald-800 block font-bold mb-0.5">نقاط القوة:</strong>
                  <p className="text-slate-700">{selectedEvalDetail.evaluation.strengths}</p>
                </div>
              )}

              {(selectedEvalDetail.evaluation.training_needs || selectedEvalDetail.evaluation.trainingNeeds) && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <strong className="text-blue-800 block font-bold mb-0.5">الاحتياجات التدريبية والدورات:</strong>
                  <p className="text-slate-700">{selectedEvalDetail.evaluation.training_needs || selectedEvalDetail.evaluation.trainingNeeds}</p>
                </div>
              )}

              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl">
                <strong className="text-purple-800 block font-bold mb-0.5">رأي الموظف بالتقييم:</strong>
                <p className="text-slate-700">
                  {selectedEvalDetail.evaluation.employee_opinion || selectedEvalDetail.evaluation.employeeOpinion || 'لم يضع الموظف رأيه بهذا التقييم'}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedEvalDetail(null)} className="bg-slate-800 text-white text-xs px-5 rounded-xl cursor-pointer">
                إغلاق
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Org Structure Tree Selector Modal */}
      <OrgTreePickerModal
        isOpen={isOrgTreeModalOpen}
        onClose={() => setIsOrgTreeModalOpen(false)}
        orgUnits={orgUnits}
        employees={employees}
        selectedOrgUnit={selectedOrgUnit}
        onSelectOrgUnit={(unitName) => {
          setSelectedOrgUnit(unitName);
        }}
      />
    </div>
  );
}
