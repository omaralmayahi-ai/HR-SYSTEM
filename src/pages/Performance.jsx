import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { useSearchParams } from 'react-router-dom';
import {
  Send, Clock, CheckCircle2, User, Calendar, RefreshCw, Loader2, Award
} from 'lucide-react';
import ReleaseFormsTab from '@/components/performance/ReleaseFormsTab';
import PendingEvaluationsTab from '@/components/performance/PendingEvaluationsTab';
import CompletedEvaluationsTab from '@/components/performance/CompletedEvaluationsTab';
import EmployeeHistoryTab from '@/components/performance/EmployeeHistoryTab';

const currentYearNum = new Date().getFullYear();
const baseStartYear = 2010;
const baseEndYear = Math.max(currentYearNum + 10, 2035);
const DEFAULT_YEARS = Array.from({ length: baseEndYear - baseStartYear + 1 }, (_, i) => baseEndYear - i);

export default function Performance() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Active Tab State: 'release', 'pending', 'completed', 'history'
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'release');
  const [selectedYear, setSelectedYear] = useState(currentYearNum);

  // Data States
  const [evaluations, setEvaluations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [forms, setForms] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dynamic years list combining default range (2010..2035+) and any existing evaluation years
  const yearsList = useMemo(() => {
    const set = new Set(DEFAULT_YEARS);
    evaluations.forEach((ev) => {
      if (ev.year) {
        const y = parseInt(ev.year, 10);
        if (!isNaN(y)) set.add(y);
      }
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [evaluations]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [evalsData, empsData, formsData, orgsData] = await Promise.all([
        apiClient.entities.PerformanceEvaluation.list().catch(() => []),
        apiClient.entities.Employee.list().catch(() => []),
        apiClient.entities.EvaluationForm.list().catch(() => []),
        apiClient.entities.OrgUnit.list().catch(() => []),
      ]);

      setEvaluations(evalsData || []);
      setEmployees(empsData || []);
      setForms(formsData || []);
      setOrgUnits(orgsData || []);
    } catch (err) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء تحميل بيانات تقييم الأداء', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Calculate year counts for badges
  const pendingCountForYear = evaluations.filter(
    ev => String(ev.year) === String(selectedYear) && (ev.status === 'بانتظار التقييم' || (ev.status || '').includes('انتظار') || ev.total_score === 0)
  ).length;

  const completedCountForYear = evaluations.filter(
    ev => String(ev.year) === String(selectedYear) && ev.status !== 'بانتظار التقييم' && !(ev.status || '').includes('انتظار') && (ev.total_score > 0 || ev.totalScore > 0)
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans" dir="rtl">
      {/* Top Main Navigation Header */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#1B3A6B]/10 text-[#1B3A6B] rounded-2xl">
            <Award size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#1B3A6B]">
              إدارة وتقييم الأداء السنوي للموظفين
            </h1>
            <p className="text-slate-500 text-sm">
              نظام متكامل لتعبئة درجات التقييمات، اعتماد النتائج، ومتابعة السجل السنوي وفق الهيكل التنظيمي المعتمد
            </p>
          </div>
        </div>

        {/* Flexible Unlimited Year Selector & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar size={16} className="text-[#1B3A6B]" />
            <span className="text-xs font-bold text-slate-700">سنة التقييم:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedYear(prev => (Number(prev) || currentYearNum) - 1)}
                className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                title="السنة السابقة"
              >
                -
              </button>
              <input
                type="number"
                value={selectedYear ?? ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) setSelectedYear(val);
                  else if (e.target.value === '') setSelectedYear('');
                }}
                onBlur={() => {
                  if (!selectedYear || isNaN(selectedYear)) setSelectedYear(currentYearNum);
                }}
                placeholder="السنة"
                className="w-16 text-center font-black text-xs text-[#1B3A6B] bg-white border border-slate-300 rounded-lg py-1 focus:ring-2 focus:ring-[#1B3A6B] focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setSelectedYear(prev => (Number(prev) || currentYearNum) + 1)}
                className="w-6 h-6 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center transition-colors cursor-pointer"
                title="السنة التالية"
              >
                +
              </button>
            </div>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all shadow-2xs"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-[#1B3A6B]' : ''} />
          </button>
        </div>
      </div>

      {/* Main Tabs Bar */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setActiveTab('release')}
          className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'release'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-[#1B3A6B] hover:bg-slate-50'
          }`}
        >
          <Send size={15} />
          <span>إطلاق استمارات التقييم</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 relative ${
            activeTab === 'pending'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-[#1B3A6B] hover:bg-slate-50'
          }`}
        >
          <Clock size={15} />
          <span>استمارات بانتظار التقييم</span>
          {pendingCountForYear > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
            }`}>
              {pendingCountForYear}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'completed'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-[#1B3A6B] hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 size={15} />
          <span>التقييمات المنجزة</span>
          {completedCountForYear > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
              activeTab === 'completed' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {completedCountForYear}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'history'
              ? 'bg-[#1B3A6B] text-white shadow-sm'
              : 'text-slate-600 hover:text-[#1B3A6B] hover:bg-slate-50'
          }`}
        >
          <User size={15} />
          <span>سجل وتاريخ موظف محدد</span>
        </button>
      </div>

      {/* Loading Overlay or Sub-View Content */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center space-y-3 shadow-sm">
          <Loader2 className="animate-spin text-indigo-600 mx-auto" size={32} />
          <p className="text-xs font-bold text-slate-600">جاري تحميل بيانات التقييمات والهيكل التنظيمي...</p>
        </div>
      ) : (
        <>
          {activeTab === 'release' && (
            <ReleaseFormsTab
              employees={employees}
              evaluations={evaluations}
              forms={forms}
              orgUnits={orgUnits}
              year={selectedYear}
              onRefreshData={fetchData}
            />
          )}

          {activeTab === 'pending' && (
            <PendingEvaluationsTab
              evaluations={evaluations}
              employees={employees}
              forms={forms}
              orgUnits={orgUnits}
              year={selectedYear}
              onRefreshData={fetchData}
            />
          )}

          {activeTab === 'completed' && (
            <CompletedEvaluationsTab
              evaluations={evaluations}
              employees={employees}
              forms={forms}
              orgUnits={orgUnits}
              year={selectedYear}
              onRefreshData={fetchData}
            />
          )}

          {activeTab === 'history' && (
            <EmployeeHistoryTab
              employees={employees}
              evaluations={evaluations}
              forms={forms}
              orgUnits={orgUnits}
              onRefreshData={fetchData}
            />
          )}
        </>
      )}
    </div>
  );
}
