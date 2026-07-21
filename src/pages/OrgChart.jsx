import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { useToast } from '@/components/ui/use-toast';
import { 
  Network, Plus, Edit2, Trash2, ChevronDown, ChevronRight, 
  User, CornerDownLeft, Loader2, RefreshCw, Layers, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const UNIT_TYPES = [
  'مدير عام',
  'معاون مدير عام',
  'هيئة',
  'قسم مركزي',
  'قسم',
  'شعبة',
  'وحدة'
];

const IRAQ_PROVINCES = [
  'بغداد',
  'نينوى',
  'البصرة',
  'أربيل',
  'بابل',
  'الأنبار',
  'ذي قار',
  'ديالى',
  'كربلاء',
  'ميسان',
  'واسط',
  'المثنى',
  'النجف',
  'القادسية',
  'صلاح الدين',
  'السليمانية',
  'دهوك',
  'حلبجة',
  'كركوك'
];

export default function OrgChart() {
  const { toast } = useToast();
  const [orgUnits, setOrgUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Tab State
  const [activeTab, setActiveTab] = useState('structure'); // 'structure' or 'locations'
  const [workLocations, setWorkLocations] = useState([]);
  const [isEditingLoc, setIsEditingLoc] = useState(false);
  const [editingLocId, setEditingLocId] = useState(null);
  const [locFormData, setLocFormData] = useState({
    name: '',
    province: 'بغداد',
    allowance_amount: 0,
    work_start_hour: '08:00',
    work_end_hour: '15:00'
  });
  
  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'قسم',
    parentId: '',
    managerId: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    id: null,
    name: '',
    hasChildren: false,
    step: 1
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const unitsData = await apiClient.entities.OrgUnit.list();
      const usersData = await apiClient.auth.users.list();
      const locationsData = await apiClient.entities.WorkLocation.list();
      
      setOrgUnits(unitsData || []);
      setUsers(usersData || []);
      setWorkLocations(locationsData || []);
      
      // Store in localStorage for instant access by the salary calculator
      localStorage.setItem('WORK_LOCATIONS', JSON.stringify(locationsData || []));

      // By default, expand all units
      if (unitsData && unitsData.length > 0) {
        setExpandedIds(new Set(unitsData.map(u => u.id)));
      }
    } catch (err) {
      console.error('Error fetching org chart data:', err);
      toast({
        title: 'خطأ في جلب البيانات',
        description: 'حدث خطأ أثناء تحميل الهيكل التنظيمي، المستخدمين ومواقع العمل.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLocSubmit = async (e) => {
    e.preventDefault();
    if (!locFormData.name.trim()) {
      toast({ title: 'خطأ', description: 'يرجى إدخال اسم موقع العمل', variant: 'destructive' });
      return;
    }
    if (!locFormData.province) {
      toast({ title: 'خطأ', description: 'يرجى اختيار المحافظة', variant: 'destructive' });
      return;
    }
    try {
      setSubmitting(true);
      if (isEditingLoc) {
        await apiClient.entities.WorkLocation.update(editingLocId, {
          name: locFormData.name,
          province: locFormData.province,
          allowance_amount: 0,
          work_start_hour: '08:00',
          work_end_hour: '15:00'
        });
        toast({ title: 'نجاح', description: 'تم تحديث موقع العمل بنجاح' });
      } else {
        await apiClient.entities.WorkLocation.create({
          name: locFormData.name,
          province: locFormData.province,
          allowance_amount: 0,
          work_start_hour: '08:00',
          work_end_hour: '15:00'
        });
        toast({ title: 'نجاح', description: 'تم إضافة موقع العمل بنجاح' });
      }
      setLocFormData({ name: '', province: 'بغداد', allowance_amount: 0, work_start_hour: '08:00', work_end_hour: '15:00' });
      setIsEditingLoc(false);
      setEditingLocId(null);
      
      const locationsData = await apiClient.entities.WorkLocation.list();
      setWorkLocations(locationsData || []);
      localStorage.setItem('WORK_LOCATIONS', JSON.stringify(locationsData || []));
    } catch (err) {
      console.error('Error submitting work location:', err);
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء حفظ موقع العمل.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditLoc = (loc) => {
    setIsEditingLoc(true);
    setEditingLocId(loc.id);
    setLocFormData({
      name: loc.name,
      province: loc.province || 'بغداد',
      allowance_amount: loc.allowance_amount || loc.allowanceAmount || 0,
      work_start_hour: loc.work_start_hour || loc.workStartHour || '08:00',
      work_end_hour: loc.work_end_hour || loc.workEndHour || '15:00'
    });
  };

  const handleDeleteLoc = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف موقع العمل هذا؟')) return;
    try {
      setLoading(true);
      await apiClient.entities.WorkLocation.delete(id);
      toast({ title: 'نجاح', description: 'تم حذف موقع العمل بنجاح' });
      const locationsData = await apiClient.entities.WorkLocation.list();
      setWorkLocations(locationsData || []);
      localStorage.setItem('WORK_LOCATIONS', JSON.stringify(locationsData || []));
    } catch (err) {
      console.error('Error deleting work location:', err);
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء حذف موقع العمل.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Seed default hierarchy if database is completely empty
  const handleSeedDefaults = async () => {
    try {
      setLoading(true);
      
      // Step 1: Create top General Manager
      const gm = await apiClient.entities.OrgUnit.create({
        name: 'المدير العام للمؤسسة',
        type: 'مدير عام',
        parentId: null,
        managerId: users[0]?.id || null
      });

      // Step 2: Create department under GM
      const dept = await apiClient.entities.OrgUnit.create({
        name: 'قسم التدريب و التطوير',
        type: 'قسم',
        parentId: gm.id,
        managerId: users[1]?.id || null
      });

      // Step 3: Create sub-units under Department
      await apiClient.entities.OrgUnit.create({
        name: 'وحدة الادارة',
        type: 'وحدة',
        parentId: dept.id,
        managerId: users[2]?.id || null
      });

      await apiClient.entities.OrgUnit.create({
        name: 'وحدة الحاسبة',
        type: 'وحدة',
        parentId: dept.id,
        managerId: users[3]?.id || null
      });

      await apiClient.entities.OrgUnit.create({
        name: 'وحدة متابعة حملة الشهادات العليا',
        type: 'وحدة',
        parentId: dept.id,
        managerId: users[4]?.id || null
      });

      toast({
        title: 'تم إنشاء الهيكل التنظيمي الافتراضي',
        description: 'تم تجهيز الهيكل الإداري للمؤسسة بنجاح وفق النموذج القياسي.'
      });
      fetchData();
    } catch (err) {
      console.error('Failed to seed defaults:', err);
      toast({
        title: 'فشل تهيئة الهيكل',
        description: 'حدث خطأ أثناء محاولة إنشاء الوحدات الافتراضية.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'قسم',
      parentId: '',
      managerId: ''
    });
    setIsEditing(false);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: 'حقل مطلوب',
        description: 'يرجى إدخال اسم الوحدة التنظيمية.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        parentId: formData.parentId ? parseInt(formData.parentId) : null,
        managerId: formData.managerId ? parseInt(formData.managerId) : null
      };

      if (isEditing) {
        await apiClient.entities.OrgUnit.update(editingId, payload);
        toast({
          title: 'تم تعديل التشكيل الإداري',
          description: 'تم تحديث بيانات الوحدة التنظيمية في الهيكل بنجاح.'
        });
      } else {
        const created = await apiClient.entities.OrgUnit.create(payload);
        toast({
          title: 'تمت إضافة تشكيل جديد',
          description: `تم إدراج "${created.name}" ضمن الهيكل التنظيمي.`
        });
        // Auto expand new parent
        if (payload.parentId) {
          setExpandedIds(prev => {
            const next = new Set(prev);
            next.add(payload.parentId);
            return next;
          });
        }
      }

      resetForm();
      fetchData();
    } catch (err) {
      console.error('Error saving org unit:', err);
      toast({
        title: 'فشل حفظ التشكيل الإداري',
        description: err.message || 'حدث خطأ أثناء تحديث الهيكل التنظيمي.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (unit) => {
    setIsEditing(true);
    setEditingId(unit.id);
    setFormData({
      name: unit.name,
      type: unit.type,
      parentId: unit.parentId ? String(unit.parentId) : '',
      managerId: unit.managerId ? String(unit.managerId) : ''
    });
    // Scroll to form smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = (id, name) => {
    const hasChildren = orgUnits.some(u => u.parentId === id);
    setDeleteConfirm({
      isOpen: true,
      id,
      name,
      hasChildren,
      step: 1
    });
  };

  const confirmDelete = async () => {
    const { id, name, hasChildren, step } = deleteConfirm;
    
    if (hasChildren && step === 1) {
      setDeleteConfirm(prev => ({ ...prev, step: 2 }));
      return;
    }

    try {
      setLoading(true);
      await apiClient.entities.OrgUnit.delete(id);
      toast({
        title: 'تم حذف الوحدة التنظيمية',
        description: `تمت إزالة "${name}" من الهيكل التنظيمي بنجاح.`
      });
      setDeleteConfirm({ isOpen: false, id: null, name: '', hasChildren: false, step: 1 });
      fetchData();
    } catch (err) {
      console.error('Error deleting org unit:', err);
      toast({
        title: 'خطأ أثناء الحذف',
        description: err.message || 'فشل حذف الوحدة التنظيمية.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubunit = (parentUnit) => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      name: '',
      type: 'شعبة',
      parentId: String(parentUnit.id),
      managerId: ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(orgUnits.map(u => u.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Build hierarchical structure on client-side
  const buildTree = (units) => {
    const map = {};
    const roots = [];

    // Initialize map
    units.forEach(u => {
      map[u.id] = { ...u, children: [] };
    });

    // Populate children
    units.forEach(u => {
      if (u.parentId && map[u.parentId]) {
        map[u.parentId].children.push(map[u.id]);
      } else {
        roots.push(map[u.id]);
      }
    });

    return roots;
  };

  const orgTree = buildTree(orgUnits);

  // Helper to render unit list item recursively
  const renderNode = (node, level = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const manager = users.find(u => u.id === node.managerId);

    // Styling badge for unit types
    const getBadgeStyles = (type) => {
      switch (type) {
        case 'مدير عام':
          return 'bg-purple-100 text-purple-700 border-purple-200';
        case 'معاون مدير عام':
          return 'bg-indigo-100 text-indigo-700 border-indigo-200';
        case 'هيئة':
          return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'قسم مركزي':
          return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        case 'قسم':
          return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'شعبة':
          return 'bg-slate-100 text-slate-700 border-slate-200';
        case 'وحدة':
          return 'bg-teal-50 text-teal-700 border-teal-100';
        default:
          return 'bg-slate-50 text-slate-600 border-slate-100';
      }
    };

    return (
      <div key={node.id} className="w-full">
        {/* Unit Row */}
        <div 
          className="flex flex-col md:flex-row items-stretch md:items-center justify-between border-b border-slate-200/70 hover:bg-slate-50/50 py-3 px-4 transition-colors"
          style={{ paddingRight: `${Math.max(16, level * 28)}px` }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Indent connector line indicators */}
            {level > 0 && (
              <CornerDownLeft size={14} className="text-slate-300 mr-1 flex-shrink-0" />
            )}

            {/* Expand/Collapse Trigger */}
            <button 
              type="button"
              onClick={() => toggleExpand(node.id)}
              className={`w-6 h-6 rounded flex items-center justify-center hover:bg-slate-200 transition-colors flex-shrink-0 ${hasChildren ? 'text-slate-600' : 'text-slate-300 cursor-default'}`}
              disabled={!hasChildren}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              )}
            </button>

            {/* Title / Name */}
            <span className="font-bold text-slate-800 text-sm md:text-base truncate">
              {node.name}
            </span>

            {/* Badge type */}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getBadgeStyles(node.type)}`}>
              {node.type}
            </span>

            {/* Index order */}
            <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[10px] flex items-center justify-center">
              {node.children ? node.children.length : 0}
            </span>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-3 mt-2 md:mt-0">
            {/* Manager pill */}
            {manager ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-xs font-semibold">
                <User size={12} className="text-green-600" />
                <span>المسؤول: {manager.name} ({manager.username && `@${manager.username}`})</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-full text-xs">
                <User size={12} className="text-slate-300" />
                <span>لم يتم تعيين المسؤول</span>
              </div>
            )}

            {/* Action buttons on hover/action */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleAddSubunit(node)}
                title="إضافة تشكيل فرعي تابع"
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <Plus size={15} />
              </button>
              <button
                type="button"
                onClick={() => handleEdit(node)}
                title="تعديل التشكيل"
                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(node.id, node.name)}
                title="حذف التشكيل الإداري"
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Child units recursively */}
        {hasChildren && isExpanded && (
          <div className="w-full bg-slate-50/20">
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 text-right" dir="rtl">
      
      {/* Header section matching visual standard */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#1B3A6B] flex items-center justify-center text-white shadow-md">
              <Network size={22} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">إدارة الهيكل والمواقع</h1>
              <p className="text-xs text-slate-500">إدارة وتعديل تشكيلات الهيكل التنظيمي ومواقع عمل فروع الشركة ومخصصاتها الموقعية</p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {activeTab === 'structure' && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={expandAll}
                className="text-xs font-semibold border-slate-200 shadow-sm gap-1 bg-white hover:bg-slate-50"
              >
                <span>فتح الكل</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={collapseAll}
                className="text-xs font-semibold border-slate-200 shadow-sm gap-1 bg-white hover:bg-slate-50"
              >
                <span>طي الكل</span>
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            title="تحديث البيانات"
            className="p-2 border-slate-200 hover:bg-slate-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 mb-8 gap-6">
        <button
          onClick={() => setActiveTab('structure')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'structure'
              ? 'border-[#1B3A6B] text-[#1B3A6B]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Network size={16} />
          <span>الهيكل الإداري والهرمي</span>
        </button>
        <button
          onClick={() => setActiveTab('locations')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'locations'
              ? 'border-[#1B3A6B] text-[#1B3A6B]'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <MapPin size={16} />
          <span>مواقع الشركة والعمل</span>
        </button>
      </div>

      {activeTab === 'structure' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Right side form block: adding or editing unit (12 cols on mobile, 4 cols on desktop) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
            <Layers className="text-[#1B3A6B]" size={18} />
            <h2 className="font-bold text-slate-800 text-base">
              {isEditing ? 'تعديل تشكيل إداري' : 'إضافة تشكيل إداري جديد للهيكل الهرمي'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <span>اسم الوحدة التنظيمية</span>
                <span className="text-red-500">*</span>
              </Label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleFormChange}
                placeholder="مثال: هيئة الخدمات، قسم الاتصالات، شعبة العلاقات العامة"
                className="text-xs font-medium text-slate-700 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#1B3A6B]"
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <span>نوع الوحدة الإدارية</span>
                <span className="text-red-500">*</span>
              </Label>
              <select
                name="type"
                value={formData.type}
                onChange={handleFormChange}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-[#1B3A6B] outline-none"
                required
              >
                {UNIT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Parent (Superior) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 block">الوحدة الأعلى (التبعية)</Label>
              <select
                name="parentId"
                value={formData.parentId}
                onChange={handleFormChange}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-[#1B3A6B] outline-none"
              >
                <option value="">لا يوجد (مستوى رئيسي أول)</option>
                {orgUnits
                  .filter(u => u.id !== editingId) // exclude current unit being edited to prevent circular hierarchy
                  .map(unit => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.type})
                    </option>
                  ))
                }
              </select>
            </div>

            {/* Manager */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700 block">حساب المستخدم المسؤول (المدير)</Label>
              <select
                name="managerId"
                value={formData.managerId}
                onChange={handleFormChange}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 focus:bg-white focus:border-[#1B3A6B] outline-none"
              >
                <option value="">تأجيل تعيين حساب المستخدم (لم يتم التعيين حالياً)</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.username ? `(@${u.username})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Buttons */}
            <div className="pt-2 flex gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 text-xs font-bold bg-[#1B3A6B] hover:bg-[#152e54] text-white py-2.5 rounded-xl transition-all shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin ml-1.5 inline" />
                    جاري الحفظ...
                  </>
                ) : (
                  isEditing ? 'حفظ التعديلات' : 'إضافة الوحدة وتثبيتها'
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                className="text-xs font-semibold border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 py-2.5"
              >
                إلغاء الإجراء
              </Button>
            </div>

          </form>
        </div>

        {/* Left side list block: hierarchical layout (12 cols on mobile, 8 cols on desktop) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 text-sm md:text-base">مخطط الهيكل التنظيمي الحالي</h3>
            <span className="text-xs text-slate-500">إجمالي الوحدات: {orgUnits.length}</span>
          </div>

          {loading ? (
            <div className="py-24 text-center">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-[#1B3A6B] rounded-full animate-spin mx-auto mb-4" />
              <p className="text-xs text-slate-400 font-semibold">جاري تحميل مخطط الهيكل التنظيمي...</p>
            </div>
          ) : orgUnits.length === 0 ? (
            <div className="py-20 text-center px-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-100 text-slate-400 mb-4">
                <Network size={28} />
              </div>
              <h4 className="text-sm font-bold text-slate-700 mb-1">الهيكل التنظيمي فارغ</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
                لم يتم إدراج أي وحدات تنظيمية حتى الآن. اضغط على الزر بالأسفل لإنشاء هيكل إداري نموذجي للمنصة تلقائياً.
              </p>
              <Button
                onClick={handleSeedDefaults}
                className="text-xs font-bold bg-[#1B3A6B] hover:bg-[#152e54] text-white rounded-xl py-2 px-4 shadow-sm"
              >
                تهيئة الهيكل النموذجي للمنصة تلقائياً
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orgTree.map(root => renderNode(root, 0))}
            </div>
          )}

        </div>

      </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Right side: Add / Edit Location form (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-3 flex items-center gap-2">
              <MapPin className="text-[#1B3A6B]" size={18} />
              <h2 className="font-bold text-slate-800 text-base">
                {isEditingLoc ? 'تعديل موقع عمل للشركة' : 'إضافة موقع عمل جديد للشركة'}
              </h2>
            </div>

            <form onSubmit={handleLocSubmit} className="space-y-4">
              
              {/* Location Name */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span>اسم موقع العمل</span>
                  <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={locFormData.name}
                  onChange={e => setLocFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: المقر الرئيسي، موقع البصرة، حقل الرميلة"
                  className="text-xs font-medium text-slate-700 bg-slate-50/50 border-slate-200 rounded-xl focus:bg-white focus:border-[#1B3A6B]"
                  required
                />
              </div>

              {/* Province / Governorate */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <span>المحافظة</span>
                  <span className="text-red-500">*</span>
                </Label>
                <select
                  value={locFormData.province || 'بغداد'}
                  onChange={e => setLocFormData(prev => ({ ...prev, province: e.target.value }))}
                  className="w-full text-xs font-medium text-slate-700 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#1B3A6B] p-2.5 outline-none"
                  required
                >
                  {IRAQ_PROVINCES.map(prov => (
                    <option key={prov} value={prov}>{prov}</option>
                  ))}
                </select>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-[#1B3A6B] hover:bg-[#1B3A6B]/90 text-white rounded-xl text-xs font-bold h-10 shadow-sm"
                >
                  {submitting ? (
                    <span className="flex items-center gap-1 justify-center">
                      <Loader2 size={14} className="animate-spin" /> جاري الحفظ...
                    </span>
                  ) : (
                    isEditingLoc ? 'حفظ التعديلات' : 'إضافة الموقع'
                  )}
                </Button>
                {isEditingLoc && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditingLoc(false);
                      setEditingLocId(null);
                      setLocFormData({ name: '', province: 'بغداد', allowance_amount: 0, work_start_hour: '08:00', work_end_hour: '15:00' });
                    }}
                    className="border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50 text-slate-500 h-10"
                  >
                    إلغاء
                  </Button>
                )}
              </div>
            </form>
          </div>

          {/* Left side: List of work locations (8 cols) */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 text-sm md:text-base">قائمة مواقع العمل المسجلة</h3>
              <span className="text-xs text-slate-500">إجمالي المواقع: {workLocations.length}</span>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="animate-spin text-[#1B3A6B]" size={32} />
                  <p className="text-xs text-slate-400 font-semibold">جاري تحميل مواقع العمل...</p>
                </div>
              ) : workLocations.length === 0 ? (
                <div className="text-center py-16 px-4 bg-slate-50/40 rounded-xl border border-dashed border-slate-200">
                  <MapPin className="mx-auto text-slate-300 mb-3" size={40} />
                  <h4 className="text-sm font-bold text-slate-700 mb-1">لا توجد مواقع عمل مسجلة بعد</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed mb-4">
                    قم بإضافة مواقع عمل الشركة لتوزيع الموظفين عليها مع تحديد المحافظة الخاصة بكل موقع.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[#1B3A6B] font-bold font-sans">
                        <th className="pb-3 text-right">اسم موقع العمل</th>
                        <th className="pb-3 text-right">المحافظة</th>
                        <th className="pb-3 text-left">العمليات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-sans">
                      {workLocations.map((loc) => (
                        <tr key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 font-bold text-slate-700">{loc.name}</td>
                          <td className="py-3.5 font-medium text-slate-500">
                            {loc.province || 'بغداد'}
                          </td>
                          <td className="py-3.5 text-left">
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditLoc(loc)}
                                className="h-8 w-8 p-0 rounded-lg text-slate-500 hover:text-[#1B3A6B] hover:bg-slate-100"
                              >
                                <Edit2 size={14} />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteLoc(loc.id)}
                                className="h-8 w-8 p-0 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      )}

    {/* Custom Delete Confirmation Modal */}
    {deleteConfirm.isOpen && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-right p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${deleteConfirm.hasChildren ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                {deleteConfirm.hasChildren 
                  ? (deleteConfirm.step === 1 ? 'تنبيه: التشكيل يحتوي على تفرعات' : 'تحذير نهائي وقاطع!') 
                  : 'تأكيد حذف التشكيل الإداري'}
              </h3>
              <p className="text-xs text-slate-400">إجراء غير قابل للتراجع</p>
            </div>
          </div>

          <div className="text-slate-600 text-sm leading-relaxed py-2">
            {deleteConfirm.hasChildren ? (
              deleteConfirm.step === 1 ? (
                <span>
                  إن التشكيل <strong>"{deleteConfirm.name}"</strong> يحتوي على تشكيلات إدارية فرعية تابعة له. هل أنت متأكد من رغبتك في حذفه؟
                </span>
              ) : (
                <span className="text-red-600 font-bold">
                  تحذير نهائي وقاطع: الاستمرار في هذا الإجراء سيؤدي إلى إزالة هذا التشكيل ("{deleteConfirm.name}") وجميع التشكيلات الإدارية الفرعية المرتبطة به نهائياً من النظام! هل تريد الاستمرار وتأكيد الحذف بالتأكيد؟
                </span>
              )
            ) : (
              <span>
                تحذير: هل أنت متأكد من رغبتك في حذف التشكيل الإداري <strong>"{deleteConfirm.name}"</strong>؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.
              </span>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              className="flex-1 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 shadow-sm"
            >
              {deleteConfirm.hasChildren 
                ? (deleteConfirm.step === 1 ? 'نعم، الاستمرار والتأكيد (1/2)' : 'تأكيد الحذف النهائي (2/2)') 
                : 'تأكيد الحذف'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirm({ isOpen: false, id: null, name: '', hasChildren: false, step: 1 })}
              className="flex-1 text-xs font-semibold border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 py-2.5"
            >
              إلغاء الإجراء
            </Button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}
