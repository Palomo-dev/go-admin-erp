'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/useRoles';
import { jobPositionPermissionsService } from '@/lib/services/jobPositionPermissionsService';
import { jobPositionModuleAccessService } from '@/lib/services/jobPositionModuleAccessService';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { MODULE_PAGES, MODULE_HREF_TO_CODE, getModuleCodeByHref } from '@/lib/config/modulePages';
import { 
  X, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Shield,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  LayoutGrid,
  FileText,
  Lock,
  Unlock
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface JobPositionPermissionsManagerProps {
  jobPositionId: string;
  jobPositionName: string;
  organizationId: number;
  onClose: () => void;
  onPermissionsUpdated?: () => void;
}

interface ModulePermissions {
  module: string;
  moduleName: string;
  permissions: Array<{
    id: number;
    code: string;
    name: string;
    description: string;
  }>;
}

type TabType = 'permissions' | 'modules' | 'pages';

interface ModuleAccessState {
  module_code: string;
  can_view: boolean;
  can_access: boolean;
}

interface PageAccessState {
  module_code: string;
  page_href: string;
  page_name: string;
  can_view: boolean;
  can_access: boolean;
}

export default function JobPositionPermissionsManager({
  jobPositionId,
  jobPositionName,
  organizationId,
  onClose,
  onPermissionsUpdated
}: JobPositionPermissionsManagerProps) {
  // usePermissions() retorna ModulePermissions[] (ya agrupados por módulo)
  const { permissions: modulePermissionsData, loading: permissionsLoading } = usePermissions();
  
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [currentPermissions, setCurrentPermissions] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('permissions');
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[]>([]);
  const [activeModulePages, setActiveModulePages] = useState<Record<string, string[]>>({});
  const [moduleAccess, setModuleAccess] = useState<ModuleAccessState[]>([]);
  const [pageAccess, setPageAccess] = useState<PageAccessState[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [expandedAccessModules, setExpandedAccessModules] = useState<Set<string>>(new Set());

  // Función auxiliar para obtener nombre del módulo
  const getModuleName = (module: string): string => {
    const names: Record<string, string> = {
      'hr': 'Recursos Humanos',
      'finance': 'Finanzas',
      'inventory': 'Inventario',
      'pos': 'Ventas',
      'crm': 'CRM',
      'pms': 'PMS',
      'admin': 'Administración',
      'reports': 'Reportes',
      'calendar': 'Calendario',
      'transport': 'Transporte',
      'notifications': 'Notificaciones',
      'integrations': 'Integraciones',
      'branches': 'Sucursales',
      'organizations': 'Organizaciones',
      'users': 'Usuarios',
      'roles': 'Roles',
      'catalog': 'Catálogo',
      'operations': 'Operaciones',
      'sales': 'Ventas',
      'other': 'Otros'
    };
    return names[module] || module;
  };

  // Cargar permisos actuales del cargo
  useEffect(() => {
    loadCurrentPermissions();
  }, [jobPositionId]);

  // Cargar módulos activos de la organización y acceso del cargo
  useEffect(() => {
    if (organizationId) {
      loadOrgModulesAndAccess();
    }
  }, [organizationId, jobPositionId]);

  const loadCurrentPermissions = async () => {
    try {
      setLoading(true);
      const permissions = await jobPositionPermissionsService.getJobPositionPermissions(jobPositionId);
      setCurrentPermissions(permissions);
      setSelectedPermissions([...permissions]);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast.error('Error al cargar permisos');
    } finally {
      setLoading(false);
    }
  };

  const loadOrgModulesAndAccess = async () => {
    try {
      setAccessLoading(true);
      const [modules, pages, access] = await Promise.all([
        moduleManagementService.getActiveModules(organizationId),
        moduleManagementService.getActiveModulePages(organizationId),
        jobPositionModuleAccessService.getJobPositionAccess(jobPositionId),
      ]);

      const moduleCodes = modules.map(m => m.code);
      setActiveModuleCodes(moduleCodes);
      setActiveModulePages(pages);

      // Construir estado de acceso a módulos
      const moduleAccessState: ModuleAccessState[] = moduleCodes.map(code => {
        const existing = access.modules.find(m => m.module_code === code);
        return {
          module_code: code,
          can_view: existing?.can_view ?? true,
          can_access: existing?.can_access ?? true,
        };
      });
      setModuleAccess(moduleAccessState);

      // Construir estado de acceso a páginas
      const pageAccessState: PageAccessState[] = [];
      for (const code of moduleCodes) {
        const activeHrefs = pages[code] || [];
        const modulePages = MODULE_PAGES[code] || [];
        for (const href of activeHrefs) {
          const pageDef = modulePages.find(p => p.href === href);
          const existing = access.pages.find(p => p.page_href === href);
          pageAccessState.push({
            module_code: code,
            page_href: href,
            page_name: pageDef?.name || href,
            can_view: existing?.can_view ?? true,
            can_access: existing?.can_access ?? true,
          });
        }
      }
      setPageAccess(pageAccessState);
    } catch (error) {
      console.error('Error loading module access:', error);
      toast.error('Error al cargar acceso a módulos');
    } finally {
      setAccessLoading(false);
    }
  };

  const toggleModuleView = (moduleCode: string) => {
    setModuleAccess(prev => prev.map(m =>
      m.module_code === moduleCode ? { ...m, can_view: !m.can_view } : m
    ));
  };

  const toggleModuleAccess = (moduleCode: string) => {
    setModuleAccess(prev => prev.map(m =>
      m.module_code === moduleCode ? { ...m, can_access: !m.can_access } : m
    ));
  };

  const togglePageView = (pageHref: string) => {
    setPageAccess(prev => prev.map(p =>
      p.page_href === pageHref ? { ...p, can_view: !p.can_view } : p
    ));
  };

  const togglePageAccess = (pageHref: string) => {
    setPageAccess(prev => prev.map(p =>
      p.page_href === pageHref ? { ...p, can_access: !p.can_access } : p
    ));
  };

  const toggleAllModuleView = (moduleCode: string, value: boolean) => {
    setModuleAccess(prev => prev.map(m =>
      m.module_code === moduleCode ? { ...m, can_view: value, can_access: value } : m
    ));
    setPageAccess(prev => prev.map(p =>
      p.module_code === moduleCode ? { ...p, can_view: value, can_access: value } : p
    ));
  };

  const toggleAccessModule = (moduleCode: string) => {
    setExpandedAccessModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleCode)) next.delete(moduleCode);
      else next.add(moduleCode);
      return next;
    });
  };

  const saveModuleAccess = async () => {
    try {
      setAccessSaving(true);
      await jobPositionModuleAccessService.setModuleAccess(
        jobPositionId,
        moduleAccess.map(m => ({ module_code: m.module_code, can_view: m.can_view, can_access: m.can_access }))
      );
      await jobPositionModuleAccessService.setPageAccess(
        jobPositionId,
        pageAccess.map(p => ({
          module_code: p.module_code,
          page_href: p.page_href,
          can_view: p.can_view,
          can_access: p.can_access,
        }))
      );
      toast.success('Acceso a módulos y páginas actualizado correctamente');
      onPermissionsUpdated?.();
    } catch (error) {
      console.error('Error saving module access:', error);
      toast.error('Error al guardar acceso a módulos');
    } finally {
      setAccessSaving(false);
    }
  };

  // Agrupar páginas por módulo para la vista de páginas
  const pagesByModule = useMemo(() => {
    const grouped: Record<string, PageAccessState[]> = {};
    for (const p of pageAccess) {
      if (!grouped[p.module_code]) grouped[p.module_code] = [];
      grouped[p.module_code].push(p);
    }
    return grouped;
  }, [pageAccess]);

  const hasAccessChanges = () => {
    return false; // Simplificado: siempre permite guardar
  };

  // Los permisos ya vienen agrupados por módulo desde el hook
  // Solo necesitamos agregar nombres localizados y ordenar
  const modulePermissions = useMemo((): ModulePermissions[] => {
    if (!modulePermissionsData || modulePermissionsData.length === 0) return [];

    return modulePermissionsData
      .map(mod => ({
        module: mod.module,
        moduleName: mod.moduleName || getModuleName(mod.module),
        permissions: mod.permissions.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description || ''
        }))
      }))
      .sort((a, b) => a.moduleName.localeCompare(b.moduleName));
  }, [modulePermissionsData]);

  // Filtrar módulos según búsqueda y filtro
  const filteredModules = useMemo(() => {
    let filtered = modulePermissions;

    // Filtrar por término de búsqueda
    if (searchTerm) {
      filtered = filtered
        .map(module => ({
          ...module,
          permissions: module.permissions.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchTerm.toLowerCase())
          )
        }))
        .filter(module => module.permissions.length > 0);
    }

    // Filtrar solo seleccionados
    if (showOnlySelected) {
      filtered = filtered
        .map(module => ({
          ...module,
          permissions: module.permissions.filter(p => selectedPermissions.includes(p.id))
        }))
        .filter(module => module.permissions.length > 0);
    }

    return filtered;
  }, [modulePermissions, searchTerm, showOnlySelected, selectedPermissions]);

  // Expandir módulos al buscar
  useEffect(() => {
    if (searchTerm) {
      setExpandedModules(new Set(filteredModules.map(m => m.module)));
    }
  }, [searchTerm, filteredModules]);

  const toggleModule = (module: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(module)) {
      newExpanded.delete(module);
    } else {
      newExpanded.add(module);
    }
    setExpandedModules(newExpanded);
  };

  const togglePermission = (permissionId: number) => {
    setSelectedPermissions(prev => {
      if (prev.includes(permissionId)) {
        return prev.filter(id => id !== permissionId);
      } else {
        return [...prev, permissionId];
      }
    });
  };

  const toggleModulePermissions = (module: ModulePermissions) => {
    const modulePermissionIds = module.permissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => selectedPermissions.includes(id));

    if (allSelected) {
      setSelectedPermissions(prev => prev.filter(id => !modulePermissionIds.includes(id)));
    } else {
      setSelectedPermissions(prev => {
        const newSet = new Set([...prev, ...modulePermissionIds]);
        return Array.from(newSet);
      });
    }
  };

  const selectAllPermissions = () => {
    const allPermissionIds = modulePermissions.flatMap(m => m.permissions.map(p => p.id));
    setSelectedPermissions(allPermissionIds);
  };

  const deselectAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const resetToOriginal = () => {
    setSelectedPermissions([...currentPermissions]);
  };

  const savePermissions = async () => {
    try {
      setSaving(true);
      await jobPositionPermissionsService.setJobPositionPermissions(jobPositionId, selectedPermissions);
      setCurrentPermissions([...selectedPermissions]);
      toast.success('Permisos actualizados correctamente');
      onPermissionsUpdated?.();
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast.error('Error al guardar permisos');
      setSelectedPermissions([...currentPermissions]);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(selectedPermissions.sort()) !== JSON.stringify(currentPermissions.sort());
  };

  const getModuleStats = (module: ModulePermissions) => {
    const total = module.permissions.length;
    const selected = module.permissions.filter(p => selectedPermissions.includes(p.id)).length;
    return { total, selected };
  };

  if (loading || permissionsLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-10 mx-auto p-5 border w-4/5 max-w-6xl shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-2 text-gray-600">Cargando permisos...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-[95%] max-w-7xl shadow-lg rounded-md bg-white mb-4">
        <div className="flex flex-col h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                Gestionar Permisos - {jobPositionName}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Los empleados con este cargo tendrán estos permisos
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('permissions')}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'permissions'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield className="h-4 w-4 mr-2" />
              Permisos
            </button>
            <button
              onClick={() => setActiveTab('modules')}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'modules'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Módulos
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'pages'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="h-4 w-4 mr-2" />
              Páginas
            </button>
          </div>

          {/* === TAB: PERMISOS === */}
          {activeTab === 'permissions' && (
            <>
              <div className="py-4 border-b border-gray-200 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar permisos o módulos..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setShowOnlySelected(!showOnlySelected)}
                    className={`inline-flex items-center px-3 py-2 border rounded-md text-sm font-medium ${
                      showOnlySelected
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {showOnlySelected ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                    {showOnlySelected ? 'Ver todos' : 'Solo seleccionados'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={selectAllPermissions} className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50">
                    Seleccionar todos
                  </button>
                  <button onClick={deselectAllPermissions} className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50">
                    Deseleccionar todos
                  </button>
                  <button onClick={resetToOriginal} className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50">
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restaurar original
                  </button>
                </div>
                <div className="flex items-center space-x-6 text-sm text-gray-600">
                  <span>Total seleccionados: <strong>{selectedPermissions.length}</strong></span>
                  <span>Total disponibles: <strong>{modulePermissions.reduce((acc, m) => acc + m.permissions.length, 0)}</strong></span>
                  {hasChanges() && <span className="text-amber-600 font-medium">⚠ Hay cambios sin guardar</span>}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                {filteredModules.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No hay permisos</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchTerm ? 'No se encontraron permisos con el término de búsqueda.' : 'No hay permisos disponibles para mostrar.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredModules.map((module) => {
                      const stats = getModuleStats(module);
                      const isExpanded = expandedModules.has(module.module);
                      const allSelected = stats.selected === stats.total;
                      const someSelected = stats.selected > 0 && stats.selected < stats.total;
                      return (
                        <div key={module.module} className="border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between p-4 bg-gray-50">
                            <div className="flex items-center space-x-3 flex-1 cursor-pointer" onClick={() => toggleModule(module.module)}>
                              {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                              <h4 className="text-lg font-medium text-gray-900">{module.moduleName}</h4>
                              <span className="text-sm text-gray-500">({stats.selected}/{stats.total})</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = someSelected; }}
                              onChange={() => toggleModulePermissions(module)}
                              className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                            />
                          </div>
                          {isExpanded && (
                            <div className="p-4 bg-white">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {module.permissions.map((permission) => (
                                  <label key={permission.id} className="flex items-start p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={selectedPermissions.includes(permission.id)}
                                      onChange={() => togglePermission(permission.id)}
                                      className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <div className="ml-3 flex-1">
                                      <p className="text-sm font-medium text-gray-900">{permission.name}</p>
                                      <p className="text-xs text-gray-500 mt-1">{permission.description}</p>
                                      <p className="text-xs text-gray-400 mt-1 font-mono">{permission.code}</p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">{selectedPermissions.length} permisos seleccionados</div>
                <div className="flex space-x-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Cancelar</button>
                  <button
                    onClick={savePermissions}
                    disabled={!hasChanges() || saving}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      hasChanges() && !saving ? 'text-white bg-indigo-600 hover:bg-indigo-700' : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {saving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Guardando...</>) : (<><Save className="h-4 w-4 mr-2" />Guardar Permisos</>)}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* === TAB: MÓDULOS === */}
          {activeTab === 'modules' && (
            <>
              <div className="py-4 border-b border-gray-200">
                <div className="flex items-center space-x-6 text-sm text-gray-600">
                  <span>Módulos activos: <strong>{moduleAccess.length}</strong></span>
                  <span>Visibles: <strong>{moduleAccess.filter(m => m.can_view).length}</strong></span>
                  <span>Accesibles: <strong>{moduleAccess.filter(m => m.can_access).length}</strong></span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                {accessLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2 text-gray-600">Cargando módulos...</span>
                  </div>
                ) : moduleAccess.length === 0 ? (
                  <div className="text-center py-12">
                    <LayoutGrid className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No hay módulos activos</h3>
                    <p className="mt-1 text-sm text-gray-500">La organización no tiene módulos activados.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {moduleAccess.map((mod) => (
                      <div key={mod.module_code} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <LayoutGrid className="h-5 w-5 text-gray-400" />
                            <div>
                              <h4 className="text-sm font-medium text-gray-900">{getModuleName(mod.module_code)}</h4>
                              <p className="text-xs text-gray-500 font-mono">{mod.module_code}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <button
                                onClick={() => toggleModuleView(mod.module_code)}
                                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                                  mod.can_view ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {mod.can_view ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                <span>Ver</span>
                              </button>
                            </label>
                            <label className="flex items-center space-x-2 cursor-pointer">
                              <button
                                onClick={() => toggleModuleAccess(mod.module_code)}
                                className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                                  mod.can_access ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {mod.can_access ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                <span>Acceder</span>
                              </button>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Controla qué módulos puede ver y acceder este cargo
                </div>
                <div className="flex space-x-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Cancelar</button>
                  <button
                    onClick={saveModuleAccess}
                    disabled={accessSaving}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      !accessSaving ? 'text-white bg-indigo-600 hover:bg-indigo-700' : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {accessSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Guardando...</>) : (<><Save className="h-4 w-4 mr-2" />Guardar Acceso</>)}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* === TAB: PÁGINAS === */}
          {activeTab === 'pages' && (
            <>
              <div className="py-4 border-b border-gray-200">
                <div className="flex items-center space-x-6 text-sm text-gray-600">
                  <span>Total páginas: <strong>{pageAccess.length}</strong></span>
                  <span>Visibles: <strong>{pageAccess.filter(p => p.can_view).length}</strong></span>
                  <span>Accesibles: <strong>{pageAccess.filter(p => p.can_access).length}</strong></span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-4">
                {accessLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2 text-gray-600">Cargando páginas...</span>
                  </div>
                ) : pageAccess.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No hay páginas activas</h3>
                    <p className="mt-1 text-sm text-gray-500">La organización no tiene páginas activadas en sus módulos.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(pagesByModule).map(([moduleCode, pages]) => {
                      const isExpanded = expandedAccessModules.has(moduleCode);
                      const moduleMod = moduleAccess.find(m => m.module_code === moduleCode);
                      return (
                        <div key={moduleCode} className="border border-gray-200 rounded-lg">
                          <div className="flex items-center justify-between p-4 bg-gray-50">
                            <div className="flex items-center space-x-3 flex-1 cursor-pointer" onClick={() => toggleAccessModule(moduleCode)}>
                              {isExpanded ? <ChevronDown className="h-5 w-5 text-gray-500" /> : <ChevronRight className="h-5 w-5 text-gray-500" />}
                              <h4 className="text-lg font-medium text-gray-900">{getModuleName(moduleCode)}</h4>
                              <span className="text-sm text-gray-500">({pages.filter(p => p.can_view).length}/{pages.length})</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => toggleAllModuleView(moduleCode, true)}
                                className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200"
                              >
                                Habilitar todo
                              </button>
                              <button
                                onClick={() => toggleAllModuleView(moduleCode, false)}
                                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
                              >
                                Bloquear todo
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="p-4 bg-white">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {pages.map((page) => (
                                  <div key={page.page_href} className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">{page.page_name}</p>
                                      <p className="text-xs text-gray-400 font-mono truncate">{page.page_href}</p>
                                    </div>
                                    <div className="flex items-center space-x-2 ml-2">
                                      <button
                                        onClick={() => togglePageView(page.page_href)}
                                        className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                                          page.can_view ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}
                                      >
                                        {page.can_view ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                                        <span>Ver</span>
                                      </button>
                                      <button
                                        onClick={() => togglePageAccess(page.page_href)}
                                        className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium ${
                                          page.can_access ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                        }`}
                                      >
                                        {page.can_access ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                        <span>Acceder</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Controla qué páginas puede ver y acceder este cargo
                </div>
                <div className="flex space-x-3">
                  <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Cancelar</button>
                  <button
                    onClick={saveModuleAccess}
                    disabled={accessSaving}
                    className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      !accessSaving ? 'text-white bg-indigo-600 hover:bg-indigo-700' : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {accessSaving ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>Guardando...</>) : (<><Save className="h-4 w-4 mr-2" />Guardar Acceso</>)}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
