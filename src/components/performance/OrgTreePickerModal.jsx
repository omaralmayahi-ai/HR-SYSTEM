import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Network, Building2, Search, X, CheckCircle2, Users, UserX,
  ChevronDown, ChevronLeft, Layers, Maximize2, Minimize2,
  Check
} from 'lucide-react';

export default function OrgTreePickerModal({
  isOpen,
  onClose,
  orgUnits = [],
  employees = [],
  selectedOrgUnit = 'all',
  onSelectOrgUnit
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [tempSelected, setTempSelected] = useState(selectedOrgUnit);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelected(selectedOrgUnit);
      // Default expand all top-level and first-child nodes
      setExpandedIds(new Set(orgUnits.map(u => u.id)));
    }
  }, [isOpen, selectedOrgUnit, orgUnits]);

  // Employee counts per department map
  const empCountsMap = useMemo(() => {
    const map = new Map();
    let unassignedCount = 0;

    employees.forEach(emp => {
      const dept = (emp.department || '').trim();
      if (!dept || dept === 'غير محدد' || dept === 'بدون تشكيل') {
        unassignedCount++;
      } else {
        map.set(dept, (map.get(dept) || 0) + 1);
      }
    });

    return { map, unassignedCount };
  }, [employees]);

  // Build hierarchy chain helper
  const getHierarchyChain = (unit) => {
    if (!unit) return '';
    const chain = [];
    let current = unit;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current.name);
      const parentId = current.parentId;
      current = parentId ? orgUnits.find(u => u.id === parentId) : null;
    }
    return chain.join(' ← ');
  };

  // Build Tree Data Structure
  const treeData = useMemo(() => {
    if (!orgUnits || orgUnits.length === 0) return [];

    const map = {};
    const roots = [];

    orgUnits.forEach(u => {
      map[u.id] = { ...u, children: [] };
    });

    orgUnits.forEach(u => {
      if (u.parentId && map[u.parentId]) {
        map[u.parentId].children.push(map[u.id]);
      } else {
        roots.push(map[u.id]);
      }
    });

    return roots;
  }, [orgUnits]);

  // Expand / Collapse Helpers
  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(orgUnits.map(u => u.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Unit Type Badge Styles
  const getBadgeStyles = (type) => {
    switch (type) {
      case 'مدير عام':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'معاون مدير عام':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      case 'هيئة':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'قسم مركزي':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'قسم':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'شعبة':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'وحدة':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Filtered unit results when searching
  const filteredUnits = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    return orgUnits.filter(u =>
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.code && u.code.toLowerCase().includes(q)) ||
      (u.type && u.type.toLowerCase().includes(q))
    );
  }, [searchQuery, orgUnits]);

  // Selected Unit Info Object
  const selectedUnitObj = useMemo(() => {
    if (tempSelected === 'all' || tempSelected === 'unassigned') return null;
    return orgUnits.find(u => u.name === tempSelected);
  }, [tempSelected, orgUnits]);

  const handleConfirm = () => {
    onSelectOrgUnit(tempSelected);
    onClose();
  };

  if (!isOpen) return null;

  // Recursive Tree Node Component
  const renderTreeNode = (node, level = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const count = empCountsMap.map.get(node.name) || 0;
    const isSelected = tempSelected === node.name;

    return (
      <div key={node.id} className="w-full space-y-1">
        {/* Node Row Card */}
        <div
          onClick={() => setTempSelected(node.name)}
          className={`group flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
            isSelected
              ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-md ring-2 ring-[#1B3A6B]/30'
              : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/80 hover:border-slate-300'
          }`}
          style={{ paddingRight: `${Math.max(12, level * 24 + 12)}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* Expand / Collapse Button */}
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isSelected
                    ? 'hover:bg-white/20 text-white'
                    : 'hover:bg-slate-200 text-slate-500'
                }`}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
              </button>
            ) : (
              <div className="w-6 flex-shrink-0 flex justify-center">
                <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-400' : 'bg-slate-300'}`} />
              </div>
            )}

            {/* Type Badge */}
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-md border flex-shrink-0 ${
                isSelected
                  ? 'bg-white/20 text-white border-white/30'
                  : getBadgeStyles(node.type)
              }`}
            >
              {node.type || 'تشكيل'}
            </span>

            {/* Unit Name & Code */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`font-bold text-xs truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                {node.name}
              </span>
              {node.code && (
                <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                  isSelected ? 'bg-white/10 text-slate-200' : 'bg-slate-100 text-slate-500'
                }`}>
                  [{node.code}]
                </span>
              )}
            </div>
          </div>

          {/* Right Side Info & Select Action */}
          <div className="flex items-center gap-3 flex-shrink-0 mr-2">
            {/* Employee Count Chip */}
            <div
              className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                isSelected
                  ? 'bg-amber-400 text-slate-950'
                  : count > 0
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <Users size={12} />
              <span>{count}</span>
            </div>

            {/* Radio / Check Status */}
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
              isSelected
                ? 'bg-amber-400 border-amber-400 text-slate-950'
                : 'border-slate-300 group-hover:border-slate-400 bg-white'
            }`}>
              {isSelected && <Check size={13} className="stroke-[3]" />}
            </div>
          </div>
        </div>

        {/* Children Sub-tree */}
        {hasChildren && isExpanded && (
          <div className="pr-3 border-r-2 border-indigo-100/80 mr-3 space-y-1 my-1">
            {node.children.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-50 rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-[#1B3A6B] text-white p-5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-amber-300 shadow-inner">
              <Network size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                شجرة الهيكل التنظيمي الموحد
                <span className="bg-amber-400/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-amber-400/30">
                  {orgUnits.length} تشكيلات
                </span>
              </h3>
              <p className="text-xs text-slate-200 mt-0.5">
                حدد التشكيل الإداري أو القسم المطلوب لعرض وتخصيص استمارات الموظفين التابعين له
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-300 hover:text-white hover:bg-white/10 rounded-xl p-2 cursor-pointer transition-colors"
          >
            <X size={20} />
          </Button>
        </div>

        {/* Controls Bar: Search & Expand/Collapse */}
        <div className="p-4 bg-white border-b border-slate-200 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[260px]">
              <Search size={16} className="absolute right-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن اسم التشكيل، الرمز، أو نوع القسم..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-9 py-2 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B3A6B] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Expand / Collapse Actions */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={expandAll}
                className="text-slate-700 border-slate-200 hover:bg-slate-100 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Maximize2 size={13} />
                <span>توسيع الشجرة</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={collapseAll}
                className="text-slate-700 border-slate-200 hover:bg-slate-100 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Minimize2 size={13} />
                <span>طوي الشجرة</span>
              </Button>
            </div>
          </div>

          {/* Quick Universal Select Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {/* All Units Card */}
            <div
              onClick={() => setTempSelected('all')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                tempSelected === 'all'
                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${tempSelected === 'all' ? 'bg-white/10 text-amber-300' : 'bg-blue-100 text-blue-700'}`}>
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="text-xs font-black">عرض جميع التشكيلات والأقسام</p>
                  <p className={`text-[10px] ${tempSelected === 'all' ? 'text-slate-200' : 'text-slate-500'}`}>
                    تشمل كامل الموظفين المسجلين في المؤسسة
                  </p>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                tempSelected === 'all' ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'
              }`}>
                {employees.length} موظف
              </div>
            </div>

            {/* Unassigned Employees Card */}
            <div
              onClick={() => setTempSelected('unassigned')}
              className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                tempSelected === 'unassigned'
                  ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${tempSelected === 'unassigned' ? 'bg-white/10 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                  <UserX size={18} />
                </div>
                <div>
                  <p className="text-xs font-black">الموظفون غير المنسوبين لقسم محدد</p>
                  <p className={`text-[10px] ${tempSelected === 'unassigned' ? 'text-slate-200' : 'text-slate-500'}`}>
                    الموظفون بدون تشكيل أو بقسم غير معيّن
                  </p>
                </div>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono ${
                tempSelected === 'unassigned' ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-800'
              }`}>
                {empCountsMap.unassignedCount} موظف
              </div>
            </div>
          </div>
        </div>

        {/* Tree Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {searchQuery.trim() ? (
            /* Flat search results view with full hierarchy chain */
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-500 mb-2">
                نتائج البحث المباشر ({filteredUnits?.length || 0}):
              </p>
              {filteredUnits && filteredUnits.length > 0 ? (
                filteredUnits.map(unit => {
                  const chain = getHierarchyChain(unit);
                  const isSelected = tempSelected === unit.name;
                  const count = empCountsMap.map.get(unit.name) || 0;

                  return (
                    <div
                      key={unit.id}
                      onClick={() => setTempSelected(unit.name)}
                      className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#1B3A6B] text-white border-[#1B3A6B] shadow-sm'
                          : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1 flex-1 min-w-0 pl-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            isSelected ? 'bg-white/20 text-white border-white/30' : getBadgeStyles(unit.type)
                          }`}>
                            {unit.type || 'تشكيل'}
                          </span>
                          <span className="font-bold text-xs">{unit.name}</span>
                          {unit.code && (
                            <span className="text-[10px] font-mono text-slate-400">[{unit.code}]</span>
                          )}
                        </div>
                        {chain && (
                          <p className={`text-[11px] font-mono dir-rtl ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            المسار الهيكلي: {chain}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {count} موظف
                        </span>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                          isSelected ? 'bg-amber-400 border-amber-400 text-slate-950' : 'border-slate-300 bg-white'
                        }`}>
                          {isSelected && <Check size={13} className="stroke-[3]" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400">
                  <Search size={32} className="mx-auto mb-2 opacity-40 text-slate-500" />
                  <p className="text-xs font-bold">لم يتم العثور على أي تشكيل يطابق "{searchQuery}"</p>
                </div>
              )}
            </div>
          ) : (
            /* Hierarchical Tree Diagram */
            <div className="space-y-1.5 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
                <Layers size={14} className="text-[#1B3A6B]" />
                <span>شجرة الهيكل الإداري التفاعلية:</span>
              </p>
              {treeData.length > 0 ? (
                treeData.map(rootNode => renderTreeNode(rootNode, 0))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Building2 size={32} className="mx-auto mb-2 opacity-40 text-slate-500" />
                  <p className="text-xs font-bold">لا توجد تشكيلات معرفة في الهيكل التنظيمي حالياً</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Confirmation Bar */}
        <div className="bg-white border-t border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#1B3A6B]/10 text-[#1B3A6B] rounded-xl">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold">التشكيل المحدد حالياً:</p>
              <p className="text-xs font-black text-[#1B3A6B]">
                {tempSelected === 'all'
                  ? 'جميع التشكيلات والأقسام'
                  : tempSelected === 'unassigned'
                  ? 'الموظفون غير المنسوبين'
                  : tempSelected}
                {selectedUnitObj && (
                  <span className="mr-2 text-[11px] text-slate-500 font-normal">
                    ({getHierarchyChain(selectedUnitObj)})
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-slate-600 border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-xl px-4 py-2 cursor-pointer"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className="bg-[#1B3A6B] hover:bg-[#152e55] text-white font-black text-xs px-6 py-2 rounded-xl shadow-md cursor-pointer flex items-center gap-2"
            >
              <Check size={16} />
              <span>تأكيد وتطبيق التحديد</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
