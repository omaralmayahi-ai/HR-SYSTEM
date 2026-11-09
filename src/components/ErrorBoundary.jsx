import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="max-w-2xl mx-auto my-12 p-6 bg-white border border-rose-200 rounded-3xl shadow-sm text-right font-sans" dir="rtl">
          <div className="flex items-center gap-3 text-rose-600 mb-4 pb-3 border-b border-rose-100">
            <div className="p-2.5 bg-rose-50 rounded-2xl">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-base font-black text-rose-800">حدث خطأ غير متوقع أثناء عرض هذه الصفحة</h2>
              <p className="text-xs text-rose-600">تم التقاط الاستثناء البرمجي لمنع توقف النظام</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 mb-6 font-mono text-xs text-slate-700 overflow-x-auto text-left" dir="ltr">
            {this.state.error?.message || String(this.state.error)}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => { window.location.href = '/'; }}
              className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
            >
              <Home size={15} />
              <span>الرئيسية</span>
            </Button>
            <Button
              onClick={this.handleReset}
              className="bg-[#1B3A6B] hover:bg-[#2C5282] text-white rounded-xl text-xs font-bold gap-1.5 shadow-sm cursor-pointer"
            >
              <RefreshCw size={15} />
              <span>إعادة المحاولة</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
