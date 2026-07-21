import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Link } from 'react-router-dom';
import { Plus, Search, Eye, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const STATUS_COLORS = {
  'مستمر': 'bg-green-100 text-green-700',
  'منسب': 'bg-blue-100 text-blue-700',
  'منقول': 'bg-purple-100 text-purple-700',
  'متقاعد': 'bg-slate-100 text-slate-600',
  'مستقيل': 'bg-stone-100 text-stone-600',
  'موقوف': 'bg-red-100 text-red-700',
  'مجاز': 'bg-orange-100 text-orange-700',
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiClient.entities.Employee.list('-created_date', 200).then(data => {
      setEmployees(data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.full_name?.includes(search) || e.civil_service_number?.includes(search) || e.service_record_number?.includes(search) || e.job_title?.includes(search);
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    await apiClient.entities.Employee.delete(id);
    toast({ title: 'تم حذف الموظف', description: 'تم حذف الموظف بنجاح' });
    load();
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">الموظفون</h1>
          <p className="text-slate-500 text-sm">{filtered.length} موظف</p>
        </div>
        <Link to="/employees/new">
          <Button className="bg-[#1B3A6B] hover:bg-[#152d54] text-white gap-2 rounded-xl">
            <Plus size={16} /> إضافة موظف جديد
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="بحث بالاسم أو الرقم أو العنوان الوظيفي..." className="pr-9 rounded-xl border-slate-200" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 rounded-xl border-slate-200">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
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
                  <th className="text-right px-4 py-3 font-medium">الاسم الكامل</th>
                  <th className="text-right px-4 py-3 font-medium">العنوان الوظيفي</th>
                  <th className="text-right px-4 py-3 font-medium">جهة العمل</th>
                  <th className="text-right px-4 py-3 font-medium">الدرجة / المرحلة</th>
                  <th className="text-right px-4 py-3 font-medium">نوع الخدمة</th>
                  <th className="text-right px-4 py-3 font-medium">الحالة</th>
                  <th className="text-right px-4 py-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, idx) => (
                  <tr key={emp.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#1B3A6B]/10 flex items-center justify-center text-[#1B3A6B] font-bold text-xs">
                          {emp.full_name?.charAt(0)}
                        </div>
                        <div>
                          <Link to={`/employees/${emp.id}`} className="font-medium text-[#1B3A6B] hover:underline block">{emp.full_name}</Link>
                          <span className="text-slate-400 text-xs">الرقم الوظيفي: {emp.civil_service_number || '—'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{emp.job_title || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.section || emp.department || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{emp.grade || '—'} / {emp.step || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        emp.service_type === 'دائم' ? 'bg-blue-50 text-blue-700' :
                        emp.service_type === 'عقد' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-slate-50 text-slate-600'
                      }`}>{emp.service_type || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[emp.status] || 'bg-slate-100 text-slate-600'}`}>
                        {emp.status || 'مستمر'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/employees/${emp.id}`}>
                          <button className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition-colors">
                            <Eye size={14} className="text-blue-600" />
                          </button>
                        </Link>
                        <Link to={`/employees/${emp.id}/edit`}>
                          <button className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 flex items-center justify-center transition-colors">
                            <Edit size={14} className="text-slate-600" />
                          </button>
                        </Link>
                        <button onClick={() => handleDelete(emp.id)} className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">لا يوجد موظفون مطابقون للبحث</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}