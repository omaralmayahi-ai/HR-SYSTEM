import React from 'react';
import { Button } from '@/components/ui/button';
import { Printer, X, Award, FileText } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { EVALUATION_GRADE_SCALE } from '@/lib/evaluationEngine';

export default function PrintSingleEvaluationModal({ isOpen, onClose, evaluation, employee, form }) {
  const { appPublicSettings } = useAuth();

  if (!isOpen || !evaluation) return null;

  const beneficiaryName = appPublicSettings?.beneficiaryName || 'اسم الجهة المستفيدة';
  const platformName = appPublicSettings?.platformName || 'منصة إدارة الموارد البشرية وتقييم الأداء';
  const logoUrl = appPublicSettings?.logoUrl;

  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.warn('Standard print failed, falling back to print window:', e);
      handlePrintNewWindow();
    }
  };

  const handlePrintNewWindow = () => {
    const sheet = document.querySelector('.single-printable-sheet');
    if (!sheet) return;

    const printWin = window.open('', '_blank', 'width=1000,height=900');
    if (!printWin) {
      window.focus();
      window.print();
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>استمارة تقييم الأداء الوظيفي - ${employee?.full_name || employee?.fullName || ''}</title>
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
            @page {
              size: A4 portrait;
              margin: 6mm;
            }
          </style>
        </head>
        <body dir="rtl" class="p-6">
          ${sheet.innerHTML}
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

  const scoresBreakdown = (() => {
    if (!evaluation.scores_json && !evaluation.scoresJson) return [];
    try {
      return typeof evaluation.scores_json === 'string'
        ? JSON.parse(evaluation.scores_json)
        : (evaluation.scores_json || JSON.parse(evaluation.scoresJson || '[]'));
    } catch {
      return [];
    }
  })();

  const totalScore = evaluation.total_score ?? evaluation.totalScore ?? 0;
  const gradeLabel = evaluation.grade || 'غير محدد';
  const gradeBadge = EVALUATION_GRADE_SCALE.find(g => g.label === gradeLabel) || { bg: 'bg-slate-100 text-slate-800' };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0 print:z-auto">
      {/* Print-specific CSS override */}
      <style>{`
        @media print {
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
          .single-printable-sheet, .single-printable-sheet * {
            visibility: visible !important;
          }
          .single-printable-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-height: 285mm !important;
            height: 285mm !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 4mm 6mm !important;
            box-sizing: border-box !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          .print-modal-container {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <div className="print-modal-container bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-6 flex flex-col max-h-[90vh] print:max-h-none print:my-0 print:rounded-none">
        {/* Toolbar */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Printer className="text-amber-400" size={20} />
            <h3 className="font-black text-sm">معاينة وطباعة استمارة تقييم الأداء الرسمية للموظف</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <Printer size={16} />
              طباعة الاستمارة الرسمية (A4)
            </Button>

            <Button
              onClick={handlePrintNewWindow}
              variant="outline"
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/40 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
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

        {/* Printable Evaluation Sheet Canvas */}
        <div className="single-printable-sheet p-6 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible text-slate-900 font-sans" dir="rtl">
          {/* Header */}
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
                  <div className="inline-flex items-center justify-center w-8 h-8 bg-slate-100 rounded-full border border-slate-300 mb-0.5">
                    <Award className="text-amber-600" size={20} />
                  </div>
                )}
                <h2 className="text-sm font-black text-slate-900 tracking-wide leading-none">
                  استمارة تقييم الأداء الوظيفي السنوي
                </h2>
                <p className="text-[10px] font-bold text-slate-600 mt-0.5">
                  السنة التقييمية: <span className="text-amber-800 font-black">{evaluation.year}</span>
                </p>
              </div>

              <div className="text-left text-[10px] leading-tight font-bold text-slate-700">
                <p>رقم التقييم: <span className="font-mono text-slate-900">#EVAL-{evaluation.id}</span></p>
                <p>تاريخ التقييم: <span className="font-mono text-slate-900">{evaluation.evaluation_date || evaluation.evaluationDate || '—'}</span></p>
                <p>الحالة: <span className="font-black text-emerald-700">{evaluation.status || 'متمّـم'}</span></p>
              </div>
            </div>
          </div>

          {/* Employee Card Info Table */}
          <div className="bg-slate-50 border border-slate-300 rounded-lg p-2 mb-2">
            <h4 className="text-[11px] font-black text-slate-900 border-b border-slate-200 pb-0.5 mb-1">
              بيانات الموظف المستهدف بالتقييم:
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-0.5 text-[10px] font-bold text-slate-700">
              <div>
                <span className="text-slate-400 block text-[9px]">اسم الموظف الرباعي:</span>
                <span className="text-slate-900 font-black">{employee?.full_name || employee?.fullName || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">الرقم الوظيفي / الرقم:</span>
                <span className="font-mono text-slate-900">{employee?.civil_service_number || employee?.civilServiceNumber || employee?.employee_number || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">المسمى الوظيفي:</span>
                <span className="text-slate-900">{employee?.job_title || employee?.jobTitle || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">التشكيل / القسم:</span>
                <span className="text-slate-900">{employee?.section || employee?.department || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">الدرجة / المرحلة:</span>
                <span className="text-slate-900">درجة {employee?.grade || '—'} &bull; مرحلة {employee?.step || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">التحصيل الدراسي:</span>
                <span className="text-slate-900">{employee?.education_level || employee?.educationLevel || '—'} ({employee?.specialization || 'عام'})</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">نوع الاستمارة:</span>
                <span className="text-indigo-900 font-black">{evaluation.form_title || evaluation.formTitle || 'استمارة قياسية'}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[9px]">المقيم / جهة التقييم:</span>
                <span className="text-slate-900">{evaluation.evaluator || 'اللجنة المركزية للتقييم'}</span>
              </div>
            </div>
          </div>

          {/* Scores Breakdown Table */}
          {scoresBreakdown.length > 0 && (
            <div className="mb-2">
              <h4 className="text-[11px] font-black text-slate-900 mb-1">
                تفاصيل نتائج معايير ومحاور التقييم:
              </h4>
              <table className="w-full text-right border-collapse text-[10px] border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 text-slate-900 font-black border-b border-slate-300">
                    <th className="py-0.5 px-1.5 border border-slate-300">المحور / المعيار الفرعي</th>
                    <th className="py-0.5 px-1 border border-slate-300 text-center w-20">الدرجة القصوى</th>
                    <th className="py-0.5 px-1 border border-slate-300 text-center w-20">الدرجة الممنوحة</th>
                  </tr>
                </thead>
                <tbody>
                  {scoresBreakdown.map((sec, sIdx) => (
                    <React.Fragment key={sec.sectionId || sIdx}>
                      <tr className="bg-slate-50 font-black text-slate-900 border-b border-slate-300">
                        <td colSpan={3} className="py-0.5 px-1.5 border border-slate-300 bg-slate-100/80">
                          {sec.sectionTitle}
                        </td>
                      </tr>
                      {(sec.criteria || []).map((crit, cIdx) => (
                        <tr key={crit.id || cIdx} className="border-b border-slate-200">
                          <td className="py-0.5 px-1.5 border border-slate-300 pr-4 text-slate-800">
                            &bull; {crit.name}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-center font-mono text-slate-600">
                            {crit.maxScore}
                          </td>
                          <td className="py-0.5 px-1 border border-slate-300 text-center font-mono font-black text-slate-900">
                            {crit.assignedScore}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Final Score & Grade Box */}
          <div className="bg-slate-900 text-white p-2.5 rounded-lg mb-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-300 font-bold">النتيجة النهائية والتقييم الإجمالي المعتمد:</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-black font-mono text-amber-400">{totalScore}</span>
                <span className="text-xs font-bold text-slate-300">من 100</span>
              </div>
            </div>
            <div className="text-left">
              <span className={`inline-block text-xs font-black px-3 py-1 rounded-md ${gradeBadge.bg}`}>
                التقدير النهائي: {gradeLabel}
              </span>
            </div>
          </div>

          {/* Custom Fields (Weaknesses, Strengths, Training Needs, Employee Opinion) */}
          <div className="space-y-1.5 mb-2 text-[10px]">
            {evaluation.weaknesses && (
              <div className="border border-rose-200 bg-rose-50/50 p-1.5 rounded-lg">
                <strong className="text-rose-900 block font-black mb-0.5">نقاط الضعف الملاحظة:</strong>
                <p className="text-slate-800 font-medium">{evaluation.weaknesses}</p>
              </div>
            )}

            {evaluation.strengths && (
              <div className="border border-emerald-200 bg-emerald-50/50 p-1.5 rounded-lg">
                <strong className="text-emerald-900 block font-black mb-0.5">نقاط القوة والإنجازات المتميزة:</strong>
                <p className="text-slate-800 font-medium">{evaluation.strengths}</p>
              </div>
            )}

            {(evaluation.training_needs || evaluation.trainingNeeds) && (
              <div className="border border-blue-200 bg-blue-50/50 p-1.5 rounded-lg">
                <strong className="text-blue-900 block font-black mb-0.5">الاحتياجات التدريبية والدورات المقترحة:</strong>
                <p className="text-slate-800 font-medium">{evaluation.training_needs || evaluation.trainingNeeds}</p>
              </div>
            )}

            <div className="border border-purple-200 bg-purple-50/50 p-1.5 rounded-lg">
              <strong className="text-purple-900 block font-black mb-0.5">رأي الموظف بالتقييم الحاصل عليه:</strong>
              <p className="text-slate-800 font-medium">
                {evaluation.employee_opinion || evaluation.employeeOpinion || 'لم يضع الموظف رأيه بهذا التقييم'}
              </p>
            </div>

            {evaluation.notes && (
              <div className="border border-slate-200 bg-slate-50 p-1.5 rounded-lg">
                <strong className="text-slate-900 block font-black mb-0.5">ملاحظات وقرارات التقييم العام:</strong>
                <p className="text-slate-800 font-medium">{evaluation.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
