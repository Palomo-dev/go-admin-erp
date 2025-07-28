'use client';

import { useState, useEffect } from 'react';
import { usePermissions, useRoles } from '@/hooks/useRoles';
import { Permission, RoleWithPermissions } from '@/lib/services/roleService';
import { ModulePermissions } from '@/lib/services/permissionService';
import { 
  Check, 
  X, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  Shield,
  Save,
  RotateCcw,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface PermissionsMatrixProps {
  role: RoleWithPermissions;
  organizationId: number;
  onClose: () => void;
  onPermissionsUpdated?: () => void;
}

export default function PermissionsMatrix({ 
  role, 
  organizationId, 
  onClose, 
  onPermissionsUpdated 
}: PermissionsMatrixProps) {
  const { permissions: modulePermissions, loading: permissionsLoading } = usePermissions();
  const { setRolePermissions, getRolePermissions } = useRoles(organizationId);

  const [currentPermissions, setCurrentPermissions] = useState<number[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // Cargar permisos actuales del rol
  useEffect(() => {
    const loadCurrentPermissions = async () => {
      try {
        setLoading(true);
        const rolePermissions = await getRolePermissions(role.id);
        const permissionIds = rolePermissions.map(p => p.id);
        setCurrentPermissions(permissionIds);
        setSelectedPermissions([...permissionIds]);
      } catch (error) {
        console.error('Error loading role permissions:', error);
        toast.error('Error al cargar permisos del rol');
      } finally {
        setLoading(false);
      }
    };

    loadCurrentPermissions();
  }, [role.id, getRolePermissions]);

  // Expandir todos los módulos por defecto
  useEffect(() => {
    if (modulePermissions.length > 0) {
      setExpandedModules(new Set(modulePermissions.map(m => m.module)));
    }
  }, [modulePermissions]);

  // Filtrar módulos y permisos según búsqueda
  const filteredModules = modulePermissions.filter(module => {
    if (!searchTerm) return true;
    
    const moduleMatches = module.moduleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         module.module.toLowerCase().includes(searchTerm.toLowerCase());
    
    const permissionMatches = module.permissions.some(permission =>
      permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      permission.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (permission.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return moduleMatches || permissionMatches;
  }).map(module => ({
    ...module,
    permissions: showOnlySelected 
      ? module.permissions.filter(p => selectedPermissions.includes(p.id))
      : module.permissions.filter(permission => {
          if (!searchTerm) return true;
          return permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 permission.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                 (permission.description || '').toLowerCase().includes(searchTerm.toLowerCase());
        })
  })).filter(module => module.permissions.length > 0);

  const toggleModule = (moduleCode: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleCode)) {
      newExpanded.delete(moduleCode);
    } else {
      newExpanded.add(moduleCode);
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

  const toggleAllModulePermissions = (module: ModulePermissions) => {
    const modulePermissionIds = module.permissions.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => selectedPermissions.includes(id));
    
    if (allSelected) {
      // Deseleccionar todos los permisos del módulo
      setSelectedPermissions(prev => prev.filter(id => !modulePermissionIds.includes(id)));
    } else {
      // Seleccionar todos los permisos del módulo
      setSelectedPermissions(prev => {
        const newSelected = [...prev];
        modulePermissionIds.forEach(id => {
          if (!newSelected.includes(id)) {
            newSelected.push(id);
          }
        });
        return newSelected;
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
      const success = await setRolePermissions(role.id, selectedPermissions);
      
      if (success) {
        setCurrentPermissions([...selectedPermissions]);
        toast.success('Permisos actualizados correctamente');
        onPermissionsUpdated?.();
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast.error('Error al guardar permisos');
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
                Gestionar Permisos - {role.name}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Selecciona los permisos que tendrá este rol
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
                  
                  return (
                    <div key={module.module} className="border border-gray-200 rounded-lg">
                      {/* Header del módulo */}
                      <div 
                        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                        onClick={() => toggleModule(module.module)}
                      >
                        <div className="flex items-center space-x-3">
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
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAllModulePermissions(module);
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-800"
                          >
                            {stats.selected === stats.total ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                        </div>
                      </div>

                      {/* Lista de permisos */}
                      {isExpanded && (
                        <div className="p-4 space-y-2">
                          {module.permissions.map((permission) => {
                            const isSelected = selectedPermissions.includes(permission.id);
                            
                            return (
                              <div
                                key={permission.id}
                                className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-indigo-50 border-indigo-200'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                }`}
                                onClick={() => togglePermission(permission.id)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-indigo-600 border-indigo-600'
                                      : 'border-gray-300'
                                  }`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  
                                  <div>
                                    <h5 className="font-medium text-gray-900">
                                      {permission.name}
                                    </h5>
                                    <p className="text-sm text-gray-500">
                                      {permission.code}
                                    </p>
                                    {permission.description && (
                                      <p className="text-xs text-gray-400 mt-1">
                                        {permission.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer con acciones */}
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
