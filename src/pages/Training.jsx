import { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, GraduationCap, Users } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const COURSE_TYPES = ['داخلية','خارجية','إلكترونية','ورشة عمل','مؤتمر'];
const COURSE_STATUSES = ['مخطط','جاري','منتهي','ملغى'];

export default function Training() {
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const { toast } = useToast();

  const [courseForm, setCourseForm] = useState({
    course_name: '', course_type: 'داخلية', provider: '', location: '',
    start_date: '', end_date: '', hours: 0, days: 0, order_number: '', description: '', status: 'مخطط'
  });

  const [enrollForm, setEnrollForm] = useState({
    training_id: '', employee_id: '', result: 'قيد التقييم', notes: ''
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      apiClient.entities.Training.list('-start_date', 200),
      apiClient.entities.TrainingEnrollment.list(),
      apiClient.entities.Employee.list()
    ]).then(([tr, en, emps]) => {
      setCourses(tr);
      setEnrollments(en);
      setEmployees(emps);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
  const enrollMap = enrollments.reduce((acc, e) => {
    acc[e.training_id] = (acc[e.training_id] || []).concat(e);
    return acc;
  }, {});

  const setC = (f, v) => setCourseForm(p => ({ ...p, [f]: v }));
  const setE = (f, v) => setEnrollForm(p => ({ ...p, [f]: v }));

  const saveCourse = async () => {
    await apiClient.entities.Training.create(courseForm);
    toast({ title: 'تم إضافة الدورة التدريبية' });
    setShowCourseForm(false);
    load();
  };

  const saveEnroll = async () => {
    await apiClient.entities.TrainingEnrollment.create({ ...enrollForm, enrollment_date: new Date().toISOString().split('T')[0] });
    toast({ title: 'تم تسجيل الموظف في الدورة' });
    setShowEnrollForm(false);
    load();
  };

  const openEnroll = (course) => {
    setSelectedCourse(course);
    setEnrollForm({ training_id: course.id, employee_id: '', result: 'قيد التقييم', notes: '' });
    setShowEnrollForm(true);
  };

  const statusColors = { 'مخطط': 'bg-blue-100 text-blue-700', 'جاري': 'bg-green-100 text-green-700', 'منتهي': 'bg-slate-100 text-slate-600', 'ملغى': 'bg-red-100 text-red-700' };
  const typeColors = { 'داخلية': 'bg-purple-50 text-purple-700', 'خارجية': 'bg-orange-50 text-orange-700', 'إلكترونية': 'bg-teal-50 text-teal-700', 'ورشة عمل': 'bg-yellow-50 text-yellow-700', 'مؤتمر': 'bg-blue-50 text-blue-700' };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B3A6B]">التدريب والدورات</h1>
          <p className="text-slate-500 text-sm">الدورات الداخلية والخارجية والإلكترونية</p>
        </div>
        <Button onClick={() => setShowCourseForm(!showCourseForm)} className="bg-[#1B3A6B] hover:bg-[#152d54] text-white rounded-xl gap-2">
          <Plus size={16} /> إضافة دورة تدريبية
        </Button>
      </div>

      {showCourseForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-4">دورة تدريبية جديدة</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label>اسم الدورة *</Label>
              <Input className="mt-1 rounded-xl" value={courseForm.course_name} onChange={e => setC('course_name', e.target.value)} />
            </div>
            <div>
              <Label>نوع الدورة *</Label>
              <Select value={courseForm.course_type} onValueChange={v => setC('course_type', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{COURSE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>الجهة المنفذة</Label>
              <Input className="mt-1 rounded-xl" value={courseForm.provider} onChange={e => setC('provider', e.target.value)} />
            </div>
            <div>
              <Label>المكان</Label>
              <Input className="mt-1 rounded-xl" value={courseForm.location} onChange={e => setC('location', e.target.value)} />
            </div>
            <div>
              <Label>رقم الأمر الإداري</Label>
              <Input className="mt-1 rounded-xl" value={courseForm.order_number} onChange={e => setC('order_number', e.target.value)} />
            </div>
            <div>
              <Label>تاريخ البدء *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={courseForm.start_date} onChange={e => setC('start_date', e.target.value)} />
            </div>
            <div>
              <Label>تاريخ الانتهاء *</Label>
              <Input type="date" className="mt-1 rounded-xl" value={courseForm.end_date} onChange={e => setC('end_date', e.target.value)} />
            </div>
            <div>
              <Label>عدد الساعات</Label>
              <Input type="number" min={0} className="mt-1 rounded-xl" value={courseForm.hours} onChange={e => setC('hours', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>عدد الأيام</Label>
              <Input type="number" min={0} className="mt-1 rounded-xl" value={courseForm.days} onChange={e => setC('days', parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>حالة الدورة</Label>
              <Select value={courseForm.status} onValueChange={v => setC('status', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{COURSE_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3">
              <Label>وصف الدورة</Label>
              <Input className="mt-1 rounded-xl" value={courseForm.description} onChange={e => setC('description', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowCourseForm(false)}>إلغاء</Button>
            <Button className="bg-[#1B3A6B] text-white rounded-xl" onClick={saveCourse}>إضافة الدورة</Button>
          </div>
        </div>
      )}

      {showEnrollForm && selectedCourse && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-[#1B3A6B] mb-4">تسجيل موظف في: {selectedCourse.course_name}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>الموظف *</Label>
              <Select value={enrollForm.employee_id} onValueChange={v => setE('employee_id', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>النتيجة</Label>
              <Select value={enrollForm.result} onValueChange={v => setE('result', v)}>
                <SelectTrigger className="mt-1 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['اجتاز','لم يجتز','انسحب','قيد التقييم'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input className="mt-1 rounded-xl" value={enrollForm.notes} onChange={e => setE('notes', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowEnrollForm(false)}>إلغاء</Button>
            <Button className="bg-[#1B3A6B] text-white rounded-xl" onClick={saveEnroll}>تسجيل</Button>
          </div>
        </div>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-[#1B3A6B]/20 border-t-[#1B3A6B] rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100">
          <GraduationCap size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400">لا توجد دورات تدريبية مضافة</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => (
            <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-bold text-[#1B3A6B] text-sm leading-snug">{c.course_name}</h3>
                  <p className="text-slate-400 text-xs mt-1">{c.provider || 'الجهة المنفذة غير محددة'}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium mr-2 ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs ${typeColors[c.course_type] || 'bg-slate-50 text-slate-600'}`}>{c.course_type}</span>
                {c.days > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500">{c.days} أيام</span>}
                {c.hours > 0 && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500">{c.hours} ساعة</span>}
              </div>
              <div className="text-xs text-slate-500 mb-3">
                {c.start_date} — {c.end_date}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <Users size={12} />
                  <span>{(enrollMap[c.id] || []).length} مشارك</span>
                </div>
                <Button size="sm" variant="outline" className="rounded-lg text-xs h-7 border-[#1B3A6B] text-[#1B3A6B]" onClick={() => openEnroll(c)}>
                  تسجيل موظف
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}