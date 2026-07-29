import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, Award, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { determineTargetForm, getAdjustedFormStructure } from '@/lib/evaluationEngine';

export default function PrintBatchEmployeesFormsModal({
  isOpen,
  onClose,
  selectedEmployees = [],
  employees = [],
  forms = [],
  year = '2026'
}) {
  const { appPublicSettings } = useAuth();
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);

  const beneficiaryName = appPublicSettings?.beneficiaryName || 'اسم الجهة المستفيدة';
  const platformName = appPublicSettings?.platformName || 'منصة إدارة الموارد البشرية وتقييم الأداء';
  const logoUrl = appPublicSettings?.logoUrl;

  const targetEmployees = (selectedEmployees && selectedEmployees.length > 0) ? selectedEmployees : (employees || []);

  if (!isOpen || targetEmployees.length === 0) return null;

  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.warn('Standard window.print failed, opening print window:', e);
      handlePrintNewWindow();
    }
  };

  const handlePrintNewWindow = () => {
    const container = document.querySelector('.printable-forms-container');
    if (!container) return;

    const printWin = window.open('', '_blank', 'width=1000,height=900');
    if (!printWin) {
      // If popup blocker blocked it, try direct focus print
      window.focus();
      window.print();
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>طباعة استمارات التقييم المخصصة (${targetEmployees.length} موظف)</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
            body {
              font-family: 'Cairo', sans-serif;
              background: white;
              color: black;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .hidden-on-screen {
              display: block !important;
              visibility: visible !important;
            }
            @page {
              size: A4 portrait;
              margin: 6mm;
            }
            .page-break-sheet {
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              padding: 6mm !important;
              margin: 0 0 10mm 0 !important;
              box-sizing: border-box !important;
              background: white !important;
              border: none !important;
              box-shadow: none !important;
              display: block !important;
              width: 100% !important;
            }
            .page-break-sheet:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
              margin-bottom: 0 !important;
            }
          </style>
        </head>
        <body dir="rtl" class="p-4 print:p-0">
          ${container.innerHTML}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
              }, 600);
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  };

  const currentPreviewEmp = targetEmployees[activePreviewIndex] || targetEmployees[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 md:p-4 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0 print:z-auto">
      
      {/* Print-specific style override */}
      <style>{`
        @media screen {
          .hidden-on-screen {
            display: none !important;
          }
        }
        @media print {
          .hidden-on-screen {
            display: block !important;
            visibility: visible !important;
          }
          @page {
            size: A4 portrait;
            margin: 4mm;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden;
          }
          .printable-forms-container, .printable-forms-container * {
            visibility: visible !important;
          }
          .printable-forms-container {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
          }
          .page-break-sheet {
            display: block !important;
            visibility: visible !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            max-height: 285mm !important;
            height: 285mm !important;
            overflow: hidden !important;
            padding: 4mm 6mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
          }
          .page-break-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden my-4 flex flex-col max-h-[92vh] print:max-h-none print:my-0 print:rounded-none print:shadow-none print:w-full">
        {/* Top Header / Actions Bar (Hidden during print) */}
        <div className="p-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Printer size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm">
                طباعة استمارات التقييم المخصصة دُفعة واحدة ({targetEmployees.length} موظف)
              </h3>
              <p className="text-[11px] text-slate-300">
                سيتم طباعة الاستمارة الرسمية المخصصة تلقائياً لكل موظف بشكل متتالي ومفصل.
              </p>
            </div>
          </div>

          {/* Quick Pagination Control & Print Button */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {targetEmployees.length > 1 && (
              <div className="flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700 text-xs font-bold">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActivePreviewIndex(prev => Math.max(0, prev - 1))}
                  disabled={activePreviewIndex === 0}
                  className="text-slate-300 hover:text-white px-2 py-1 h-7 cursor-pointer"
                >
                  <ChevronRight size={16} />
                </Button>
                <span className="px-2 text-amber-300 font-mono text-[11px]">
                  معاينة {activePreviewIndex + 1} من {targetEmployees.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActivePreviewIndex(prev => Math.min(targetEmployees.length - 1, prev + 1))}
                  disabled={activePreviewIndex === targetEmployees.length - 1}
                  className="text-slate-300 hover:text-white px-2 py-1 h-7 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </Button>
              </div>
            )}

            <Button
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Printer size={16} />
              طباعة الاستمارات (A4) ({targetEmployees.length})
            </Button>

            <Button
              onClick={handlePrintNewWindow}
              variant="outline"
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
              title="فتح الاستمارات في نافذة طباعة جديدة لتفادي قيود المتصفح"
            >
              <FileText size={15} />
              نافذة طباعة مستقلة
            </Button>

            <Button
              variant="ghost"
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl p-2 cursor-pointer"
            >
              <X size={18} />
            </Button>
          </div>
        </div>

        {/* Printable Area - Contains sheets for all selected employees */}
        <div className="printable-forms-container p-6 md:p-8 overflow-y-auto flex-1 bg-slate-100 print:bg-white print:p-0 print:overflow-visible text-slate-900 font-sans" dir="rtl">
          
          {/* Print instructions banner for preview mode */}
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold print:hidden flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText size={16} className="text-amber-600" />
              تتيح هذه الشاشة طباعة استمارات التقييم المخصصة لكل موظف حسب شهادته ومسؤوليته، بصفحات متتالية مستقلة.
            </span>
            <span className="text-[10px] bg-amber-200/60 px-2 py-0.5 rounded-md font-mono">
              الموظف المعاين: {currentPreviewEmp?.full_name || currentPreviewEmp?.fullName}
            </span>
          </div>

          {/* Loop over selected employees for printing */}
          <div className="space-y-12 print:space-y-0">
            {targetEmployees.map((emp, empIdx) => {
              // Determine form specifically for this employee
              const targetFormResult = emp.assignedFormId
                ? forms.find(f => f.id === emp.assignedFormId) || determineTargetForm(emp, forms).form
                : determineTargetForm(emp, forms).form;

              const adjustedForm = targetFormResult ? getAdjustedFormStructure(targetFormResult, emp) : null;
              const sections = adjustedForm?.sections || [];

              const enableWeaknesses = adjustedForm?.enable_weaknesses !== undefined ? Boolean(adjustedForm.enable_weaknesses) : (adjustedForm?.enableWeaknesses !== undefined ? Boolean(adjustedForm.enableWeaknesses) : true);
              const enableStrengths = adjustedForm?.enable_strengths !== undefined ? Boolean(adjustedForm.enable_strengths) : (adjustedForm?.enableStrengths !== undefined ? Boolean(adjustedForm.enableStrengths) : true);
              const enableTraining = adjustedForm?.enable_training_needs !== undefined ? Boolean(adjustedForm.enable_training_needs) : (adjustedForm?.enableTrainingNeeds !== undefined ? Boolean(adjustedForm.enableTrainingNeeds) : true);
              const enableOpinion = adjustedForm?.enable_employee_opinion !== undefined ? Boolean(adjustedForm.enable_employee_opinion) : (adjustedForm?.enableEmployeeOpinion !== undefined ? Boolean(adjustedForm.enableEmployeeOpinion) : true);

              // Unique Quick Access Reference Code
              const empCode = emp.company_number || emp.companyNumber || emp.badge_number || emp.badgeNumber || emp.employee_id || emp.id || (empIdx + 1);
              const refCode = `REF-${year}-${String(empCode).padStart(5, '0')}`;

              // Hide non-active preview items in screen view to save space, but show ALL in print mode
              const isCurrentPreview = empIdx === activePreviewIndex;

              return (
                <div
                  key={emp.id || empIdx}
                  className={`page-break-sheet bg-white p-8 rounded-2xl border border-slate-300 shadow-sm print:shadow-none print:border-none print:p-0 print:mb-0 ${
                    !isCurrentPreview ? 'hidden-on-screen' : 'block'
                  }`}
                >
                  {/* Official Sheet Header */}
                  <div className="border-b-2 border-slate-900 pb-2 mb-2">
                    <div className="flex items-center justify-between text-center">
                      <div className="text-right text-[11px] leading-tight font-bold text-slate-800">
                        <p className="text-xs font-black text-slate-900">{beneficiaryName}</p>
                        <p className="text-[10px] text-slate-700">{platformName}</p>
                      </div>

                      <div className="text-center flex flex-col items-center">
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Logo"
                            className="w-9 h-9 object-contain mb-0.5"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 rounded-full border border-slate-300 mb-0.5 print:border-slate-800">
                            <Award className="text-amber-700 print:text-slate-900" size={18} />
                          </div>
                        )}
                        <h2 className="text-sm font-black text-slate-900 tracking-wide leading-none">
                          استمارة تقييم الأداء الوظيفي السنوي
                        </h2>
                        <p className="text-[10px] font-black text-indigo-950 print:text-slate-900 mt-0.5">
                          {adjustedForm?.title || 'استمارة تقييم أداء الكوادر'}
                        </p>
                      </div>

                      <div className="text-left text-[10px] leading-tight font-bold text-slate-800 flex flex-col items-end">
                        <p>السنة التقييمية: <span className="font-mono font-black text-slate-900">{year}</span></p>
                        <p>تاريخ الطباعة: <span className="font-mono text-slate-900">{new Date().toISOString().split('T')[0]}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Employee Information Block */}
                  <div className="border border-slate-400 rounded-lg p-2 mb-2 bg-slate-50/70 print:bg-white text-[11px]">
                    <h4 className="font-black text-slate-900 border-b border-slate-300 pb-0.5 mb-1 flex items-center justify-between text-[11px]">
                      <span>بيانات الموظف المستهدف بالتقييم السنوي:</span>
                      <span className="text-[9px] text-slate-600 font-bold bg-slate-200/70 print:bg-slate-100 px-1.5 py-0.2 rounded">
                        الاستمارة المخصصة: {adjustedForm?.title || 'استمارة قياسية'}
                      </span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-1 font-bold text-slate-800 text-[10px]">
                      <div>
                        <span className="text-slate-500 block text-[9px]">الاسم الرباعي واللقب:</span>
                        <span className="text-slate-900 font-black">{emp.full_name || emp.fullName || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">الرقم الوظيفي / الخدمة:</span>
                        <span className="font-mono text-slate-900">{emp.civil_service_number || emp.civilServiceNumber || emp.employee_number || emp.employeeNumber || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">المسمى الوظيفي:</span>
                        <span className="text-slate-900">{emp.job_title || emp.jobTitle || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">التشكيل / القسم:</span>
                        <span className="text-slate-900">{emp.section || emp.department || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">الدرجة والمرحلة:</span>
                        <span className="text-slate-900">درجة {emp.grade || '—'} &bull; مرحلة {emp.step || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">التحصيل الدراسي:</span>
                        <span className="text-slate-900">{emp.education_level || emp.educationLevel || '—'} ({emp.specialization || 'عام'})</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">المسؤولية الإشرافية:</span>
                        <span className="text-slate-900">{emp.primary_responsibility || emp.primaryResponsibility || 'بلا مسؤولية'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px]">الدرجة القصوى للاستمارة:</span>
                        <span className="font-mono font-black text-amber-900 print:text-slate-900">
                          {adjustedForm?.adjustedMaxScore || 100} درجة
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Criteria & Sections Table */}
                  <div className="mb-2">
                    <h4 className="text-[11px] font-black text-slate-900 mb-1 flex items-center justify-between">
                      <span>محاور وفقرات تقييم الأداء المخصصة:</span>
                      <span className="text-[9px] text-slate-500 font-normal">
                        (تدون الدرجة المستحقة لكل فقرة بوضوح)
                      </span>
                    </h4>

                    <table className="w-full text-right border-collapse text-[10px] border border-slate-400">
                      <thead>
                        <tr className="bg-slate-200/90 text-slate-900 font-black border-b border-slate-400 print:bg-slate-200">
                          <th className="py-0.5 px-1 border border-slate-400 w-8 text-center">ت</th>
                          <th className="py-0.5 px-1.5 border border-slate-400">المحور ومعايير التقييم الفرعية</th>
                          <th className="py-0.5 px-1 border border-slate-400 text-center w-20">الدرجة القصوى</th>
                          <th className="py-0.5 px-1 border border-slate-400 text-center w-20">الدرجة الممنوحة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="p-2 text-center text-slate-400">
                              لا توجد فقرات محددة لهذه الاستمارة.
                            </td>
                          </tr>
                        ) : (
                          sections.map((sec, sIdx) => (
                            <React.Fragment key={sec.id || sIdx}>
                              {/* Section Title Header Row */}
                              <tr className="bg-slate-100 font-black text-slate-900 border-b border-slate-400 print:bg-slate-100">
                                <td className="py-0.5 px-1 border border-slate-400 text-center font-mono font-bold bg-slate-200/60">
                                  {sIdx + 1}
                                </td>
                                <td className="py-0.5 px-1.5 border border-slate-400 font-black text-slate-900">
                                  {sec.title}
                                </td>
                                <td className="py-0.5 px-1 border border-slate-400 text-center font-mono font-black text-slate-900 bg-slate-200/60">
                                  {sec.weight || (sec.criteria || []).reduce((sum, c) => sum + (c.maxScore || 0), 0)}
                                </td>
                                <td className="py-0.5 px-1 border border-slate-400 text-center bg-slate-100/50">
                                </td>
                              </tr>

                              {/* Criteria Rows */}
                              {(sec.criteria || []).map((crit, cIdx) => (
                                <tr key={crit.id || cIdx} className="border-b border-slate-300">
                                  <td className="py-0.5 px-1 border border-slate-300 text-center text-slate-500 font-mono text-[9px]">
                                    {sIdx + 1}.{cIdx + 1}
                                  </td>
                                  <td className="py-0.5 px-1.5 border border-slate-300 text-slate-800">
                                    <span className="font-bold text-slate-900">{crit.name}</span>
                                    {crit.isHseCapApplied && (
                                      <span className="inline-block mr-1 text-[8px] text-amber-800 print:text-slate-600 font-semibold">
                                        * {crit.notice || 'معدلة لحملة الشهادات العليا'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-0.5 px-1 border border-slate-300 text-center font-mono font-bold text-slate-700">
                                    {crit.maxScore}
                                  </td>
                                  <td className="py-0.5 px-1 border border-slate-300 text-center">
                                    <div className="w-12 h-4 border border-dashed border-slate-400 mx-auto rounded bg-slate-50/50 print:bg-white flex items-center justify-center text-[9px] text-slate-300 font-mono">
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))
                        )}

                        {/* Total Row */}
                        <tr className="bg-slate-900 text-white font-black print:bg-slate-200 print:text-slate-900">
                          <td colSpan={2} className="py-1 px-2 border border-slate-400 text-left font-black text-[11px] pl-2">
                            المجموع النهائي المكتسب للتقييم السنوي:
                          </td>
                          <td className="py-1 px-1 border border-slate-400 text-center font-mono text-[11px] font-black text-amber-300 print:text-slate-900">
                            {adjustedForm?.adjustedMaxScore || 100}
                          </td>
                          <td className="py-1 px-1 border border-slate-400 text-center">
                            <div className="w-16 h-5 border-2 border-slate-700 print:border-slate-900 mx-auto bg-white rounded flex items-center justify-center font-mono text-[11px] font-black text-slate-900">
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Form Dynamic Fields: Strengths, Weaknesses, Training, Opinion */}
                  <div className="space-y-1.5 mb-2 text-[10px]">
                    {enableStrengths && (
                      <div className="border border-slate-400 rounded-lg p-1.5 bg-white">
                        <strong className="text-slate-900 block font-black mb-0.5 text-[10px]">
                          1. نقاط القوة والإنجازات المتميزة الملاحظة خلال السنة:
                        </strong>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                      </div>
                    )}

                    {enableWeaknesses && (
                      <div className="border border-slate-400 rounded-lg p-1.5 bg-white">
                        <strong className="text-slate-900 block font-black mb-0.5 text-[10px]">
                          2. نقاط الضعف والجوانب التي تحتاج إلى تطوير ومعالجة:
                        </strong>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                      </div>
                    )}

                    {enableTraining && (
                      <div className="border border-slate-400 rounded-lg p-1.5 bg-white">
                        <strong className="text-slate-900 block font-black mb-0.5 text-[10px]">
                          3. الدورات والاحتياجات التدريبية المقترحة للموظف:
                        </strong>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                      </div>
                    )}

                    {enableOpinion && (
                      <div className="border border-slate-400 rounded-lg p-1.5 bg-white">
                        <strong className="text-slate-900 block font-black mb-0.5 text-[10px]">
                          4. رأي وملاحظات الموظف على نتائج التقييم الحاصل عليه:
                        </strong>
                        <div className="border-b border-dashed border-slate-300 h-3"></div>
                      </div>
                    )}
                  </div>

                  {/* Official Signatures Section */}
                  <div className="mt-2 pt-2 border-t-2 border-slate-800 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-900">
                    <div className="border border-slate-300 rounded-lg p-1.5 bg-slate-50/50 print:bg-white">
                      <p className="font-black mb-3 text-slate-900">توقيع الموظف (اطلعت على الاستمارة)</p>
                      <p className="text-slate-500 font-normal">التوقيع: ...........................</p>
                      <p className="text-slate-500 font-normal mt-0.5">التاريخ: .... / .... / {year}م</p>
                    </div>

                    <div className="border border-slate-300 rounded-lg p-1.5 bg-slate-50/50 print:bg-white">
                      <p className="font-black mb-3 text-slate-900">توقيع المقيم المباشر</p>
                      <p className="text-slate-500 font-normal">التوقيع: ...........................</p>
                      <p className="text-slate-500 font-normal mt-0.5">التاريخ: .... / .... / {year}م</p>
                    </div>

                    <div className="border border-slate-300 rounded-lg p-1.5 bg-slate-50/50 print:bg-white">
                      <p className="font-black mb-3 text-slate-900">توقيع مسؤول الجهة</p>
                      <p className="text-slate-500 font-normal">التوقيع: ...........................</p>
                      <p className="text-slate-500 font-normal mt-0.5">التاريخ: .... / .... / {year}م</p>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
