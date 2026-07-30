import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { useSearchParams } from 'react-router-dom';
import {
  Send, Clock, CheckCircle2, User, Calendar, RefreshCw, Loader2, Award, ChevronRight, ChevronLeft
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
  const { appPublicSettings } = useAuth();
  const primaryColor = appPublicSettings?.primaryColor || '#1B3A6B';
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
      {/* Unified Master Banner Card */}
      <div 
        className="rounded-2xl p-6 text-white shadow-md relative overflow-hidden text-right transition-colors"
        style={{ background: `linear-gradient(to left, ${primaryColor}, ${primaryColor}e6, ${primaryColor}cc)` }}
        dir="rtl"
      >
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 -skew-x-12 pointer-events-none" />

        <div className="flex flex-col gap-6 relative z-10">
          {/* Top Row: Main Title, Logo & Year Control */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Top Right: Logo, Main Title & Description */}
            <div className="flex items-start gap-3.5 text-right max-w-2xl">
              <div className="p-3 bg-white/10 backdrop-blur-sm rounded-2xl text-amber-300 border border-white/20 shrink-0 mt-0.5 shadow-sm">
                <Award size={28} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
                  إدارة وتقييم الأداء السنوي للموظفين
                </h1>
              </div>
            </div>

            {/* Top Left: Prominent Year Selector */}
            <div className="flex items-center gap-2 text-white shrink-0 self-start lg:self-center">
              <Calendar size={18} className="text-amber-300 shrink-0" />
              <span className="text-xs font-bold text-blue-100 hidden sm:inline">سنة التقييم:</span>

              <div className="flex items-center gap-1 bg-white/10 px-1 py-0.5 rounded-lg border border-white/15">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white hover:bg-white/20 hover:text-white rounded-md"
                  onClick={() => setSelectedYear(prev => (Number(prev) || currentYearNum) - 1)}
                  title="السنة السابقة"
                >
                  <ChevronRight size={16} />
                </Button>

                <div className="px-2 font-black text-lg text-white text-center min-w-[50px] select-none font-mono">
                  {selectedYear}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-white hover:bg-white/20 hover:text-white rounded-md"
                  onClick={() => setSelectedYear(prev => (Number(prev) || currentYearNum) + 1)}
                  title="السنة التالية"
                >
                  <ChevronLeft size={16} />
                </Button>
              </div>

              <button
                onClick={fetchData}
                disabled={loading}
                className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/15 cursor-pointer"
                title="تحديث البيانات"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin text-amber-300' : ''} />
              </button>
            </div>
          </div>

          {/* Bottom Row: Centered Navigation Tabs */}
          <div className="pt-4 border-t border-white/15 flex justify-center w-full">
            <div className="bg-white/10 p-1.5 rounded-2xl border border-white/20 flex flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 max-w-full">
              <button
                onClick={() => setActiveTab('release')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'release'
                    ? 'bg-white text-[#1B3A6B] shadow-sm'
                    : 'text-blue-100 hover:bg-white/15 hover:text-white'
                }`}
              >
                <Send size={15} />
                <span>إطلاق استمارة التقييم</span>
              </button>

              <button
                onClick={() => setActiveTab('pending')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 relative cursor-pointer ${
                  activeTab === 'pending'
                    ? 'bg-white text-[#1B3A6B] shadow-sm'
                    : 'text-blue-100 hover:bg-white/15 hover:text-white'
                }`}
              >
                <Clock size={15} />
                <span>استمارات بانتظار التقييم</span>
                {pendingCountForYear > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                    activeTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-400/30 text-amber-200 border border-amber-400/30'
                  }`}>
                    {pendingCountForYear}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('completed')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'completed'
                    ? 'bg-white text-[#1B3A6B] shadow-sm'
                    : 'text-blue-100 hover:bg-white/15 hover:text-white'
                }`}
              >
                <CheckCircle2 size={15} />
                <span>التقييمات المنجزة</span>
                {completedCountForYear > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                    activeTab === 'completed' ? 'bg-emerald-500 text-white' : 'bg-emerald-400/30 text-emerald-200 border border-emerald-400/30'
                  }`}>
                    {completedCountForYear}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-[#1B3A6B] shadow-sm'
                    : 'text-blue-100 hover:bg-white/15 hover:text-white'
                }`}
              >
                <User size={15} />
                <span>سجل وتاريخ موظف محدد</span>
              </button>
            </div>
          </div>
        </div>
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
