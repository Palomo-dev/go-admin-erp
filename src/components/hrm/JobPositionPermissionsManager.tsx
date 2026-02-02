'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePermissions } from '@/hooks/useRoles';
import { jobPositionPermissionsService } from '@/lib/services/jobPositionPermissionsService';
import { 
  X, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Shield,
  Save,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface JobPositionPermissionsManagerProps {
  jobPositionId: string;
  jobPositionName: string;
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

export default function JobPositionPermissionsManager({
  jobPositionId,
  jobPositionName,
  onClose,
  onPermissionsUpdated
}: JobPositionPermissionsManagerProps) {
  const { permissions: allPermissions, loading: permissionsLoading } = usePermissions(1);
  
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [currentPermissions, setCurrentPermissions] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Función auxiliar para obtener nombre del módulo
  const getModuleName = (module: string): string => {
    const names: Record<string, string> = {
      'hr': 'Recursos Humanos',
      'finance': 'Finanzas',
      'inventory': 'Inventario',
      'pos': 'Punto de Venta',
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
      'other': 'Otros'
    };
    return names[module] || module;
  };

  // Cargar permisos actuales del cargo
  useEffect(() => {
    loadCurrentPermissions();
  }, [jobPositionId]);

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

  // Agrupar permisos por módulo
  const modulePermissions = useMemo(() => {
    if (!allPermissions || allPermissions.length === 0) return [];

    const modules = new Map<string, ModulePermissions>();

    allPermissions.forEach(permission => {
      const module = permission.module || 'other';
      
      if (!modules.has(module)) {
        modules.set(module, {
          module,
          moduleName: getModuleName(module),
          permissions: []
        });
      }

      modules.get(module)!.permissions.push(permission);
    });

    return Array.from(modules.values()).sort((a, b) => 
      a.moduleName.localeCompare(b.moduleName)
    );
  }, [allPermissions]);

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

          {/* Controles */}
          <div className="py-4 border-b border-gray-200 space-y-4">
            {/* Búsqueda y filtros */}
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

            {/* Acciones masivas */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectAllPermissions}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Seleccionar todos
              </button>
              <button
                onClick={deselectAllPermissions}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Deseleccionar todos
              </button>
              <button
                onClick={resetToOriginal}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restaurar original
              </button>
            </div>

            {/* Estadísticas */}
            <div className="flex items-center space-x-6 text-sm text-gray-600">
              <span>
                Total seleccionados: <strong>{selectedPermissions.length}</strong>
              </span>
              <span>
                Total disponibles: <strong>{modulePermissions.reduce((acc, m) => acc + m.permissions.length, 0)}</strong>
              </span>
              {hasChanges() && (
                <span className="text-amber-600 font-medium">
                  ⚠ Hay cambios sin guardar
                </span>
              )}
            </div>
          </div>

          {/* Lista de módulos y permisos */}
          <div className="flex-1 overflow-y-auto py-4">
            {filteredModules.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No hay permisos</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm 
                    ? 'No se encontraron permisos con el término de búsqueda.'
                    : 'No hay permisos disponibles para mostrar.'
                  }
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
                      {/* Header del módulo */}
                      <div className="flex items-center justify-between p-4 bg-gray-50">
                        <div 
                          className="flex items-center space-x-3 flex-1 cursor-pointer"
                          onClick={() => toggleModule(module.module)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-500" />
                          )}
                          <h4 className="text-lg font-medium text-gray-900">
                            {module.moduleName}
                          </h4>
                          <span className="text-sm text-gray-500">
                            ({stats.selected}/{stats.total})
                          </span>
                        </div>
                        
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() => toggleModulePermissions(module)}
                          className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                        />
                      </div>

                      {/* Permisos del módulo */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {module.permissions.map((permission) => (
                              <label
                                key={permission.id}
                                className="flex items-start p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedPermissions.includes(permission.id)}
                                  onChange={() => togglePermission(permission.id)}
                                  className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <div className="ml-3 flex-1">
                                  <p className="text-sm font-medium text-gray-900">
                                    {permission.name}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {permission.description}
                                  </p>
                                  <p className="text-xs text-gray-400 mt-1 font-mono">
                                    {permission.code}
                                  </p>
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

          {/* Footer con botones */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {selectedPermissions.length} permisos seleccionados
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancelar
              </button>
              
              <button
                onClick={savePermissions}
                disabled={!hasChanges() || saving}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                  hasChanges() && !saving
                    ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                    : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                }`}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar Permisos
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
