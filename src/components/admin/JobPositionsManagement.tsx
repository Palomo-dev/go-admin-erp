'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Briefcase, 
  Search, 
  Users, 
  Shield, 
  Loader2,
  Settings,
  Plus,
  Building2,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  RotateCcw,
  Eye,
  EyeOff,
  Save
} from 'lucide-react';
import rolesManagementService, { JobPositionWithPermissions } from '@/lib/services/rolesManagementService';
import PermissionsMatrix from './PermissionsMatrix';
import { JobPositionsSkeleton } from './RolesSkeleton';

interface JobPositionsManagementProps {
  organizationId: number;
}

export default function JobPositionsManagement({ organizationId }: JobPositionsManagementProps) {
  const [positions, setPositions] = useState<JobPositionWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<JobPositionWithPermissions | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPositions();
  }, [organizationId]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const data = await rolesManagementService.getJobPositions(organizationId);
      setPositions(data);
    } catch (error) {
      console.error('Error loading positions:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los cargos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredPositions = positions.filter(position =>
    position.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    position.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (position.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <JobPositionsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Permisos por Cargo</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gestiona los permisos específicos de cada cargo. Los cargos se crean desde el módulo de HRM.
          </p>
        </div>
      </div>

      {/* Búsqueda */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar cargos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista de Cargos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="border-b border-gray-200 dark:border-gray-700">
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cargos ({filteredPositions.length})
          </CardTitle>
        </CardHeader>

        {filteredPositions.length === 0 ? (
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Briefcase className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">No se encontraron cargos</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {searchTerm 
                  ? 'Intenta ajustar los filtros de búsqueda'
                  : 'Los cargos se crean desde el módulo de HRM'
                }
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredPositions.map((position) => (
              <div key={position.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">{position.name}</h4>
                        <Badge variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                          {position.code}
                        </Badge>
                      </div>
                      {position.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{position.description}</p>
                      )}
                      <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                        {position.department && (
                          <span className="flex items-center">
                            <Building2 className="h-4 w-4 mr-1" />
                            {position.department.name}
                          </span>
                        )}
                        <span className="flex items-center">
                          <Shield className="h-4 w-4 mr-1" />
                          {position.permission_count || 0} permisos
                        </span>
                        <span className="flex items-center">
                          <Users className="h-4 w-4 mr-1" />
                          {position.employee_count || 0} empleados
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botón de acción */}
                  <Button
                    onClick={() => setSelectedPosition(position)}
                    variant="outline"
                    className="ml-4 border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-900/30"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Gestionar Permisos
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Diálogo Gestión de Permisos */}
      {selectedPosition && (
        <JobPositionPermissionsDialog
          position={selectedPosition}
          organizationId={organizationId}
          onClose={() => setSelectedPosition(null)}
          onPermissionsUpdated={loadPositions}
        />
      )}
    </div>
  );
}

// Componente Diálogo para Gestionar Permisos de Cargo
interface JobPositionPermissionsDialogProps {
  position: JobPositionWithPermissions;
  organizationId: number;
  onClose: () => void;
  onPermissionsUpdated: () => void;
}

function JobPositionPermissionsDialog({ 
  position, 
  organizationId, 
  onClose, 
  onPermissionsUpdated 
}: JobPositionPermissionsDialogProps) {
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [currentPermissions, setCurrentPermissions] = useState<number[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPermissions();
  }, [position.id]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const [allPerms, positionPerms] = await Promise.all([
        rolesManagementService.getAllPermissions(),
        rolesManagementService.getJobPositionPermissions(position.id)
      ]);
      
      setAllPermissions(allPerms);
      const permissionIds = positionPerms.map((p: any) => p.id);
      setCurrentPermissions(permissionIds);
      setSelectedPermissions([...permissionIds]);
      
      // Expandir todos los módulos por defecto
      const modules = new Set(allPerms.map((p: any) => p.module || 'Sin módulo'));
      setExpandedModules(modules);
    } catch (error) {
      console.error('Error loading permissions:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los permisos',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

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

  const toggleAllModulePermissions = (modulePerms: any[]) => {
    const modulePermissionIds = modulePerms.map(p => p.id);
    const allSelected = modulePermissionIds.every(id => selectedPermissions.includes(id));
    
    if (allSelected) {
      setSelectedPermissions(prev => prev.filter(id => !modulePermissionIds.includes(id)));
    } else {
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
    setSelectedPermissions(allPermissions.map(p => p.id));
  };

  const deselectAllPermissions = () => {
    setSelectedPermissions([]);
  };

  const resetToOriginal = () => {
    setSelectedPermissions([...currentPermissions]);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await rolesManagementService.setJobPositionPermissions(
        position.id,
        selectedPermissions
      );
      
      setCurrentPermissions([...selectedPermissions]);
      toast({
        title: 'Éxito',
        description: 'Permisos actualizados correctamente'
      });
      onPermissionsUpdated();
      onClose();
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar los permisos',
        variant: 'destructive'
      });
      setSelectedPermissions([...currentPermissions]);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(selectedPermissions.sort()) !== JSON.stringify(currentPermissions.sort());
  };

  // Agrupar permisos por módulo
  const permissionsByModule = allPermissions.reduce((acc, perm) => {
    const module = perm.module || 'Sin módulo';
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(perm);
    return acc;
  }, {} as Record<string, any[]>);

  // Filtrar permisos por búsqueda y solo seleccionados
  const filteredModules = Object.entries(permissionsByModule).reduce((acc, [module, perms]) => {
    let filtered = perms;
    
    if (showOnlySelected) {
      filtered = filtered.filter((p: any) => selectedPermissions.includes(p.id));
    }
    
    if (searchTerm) {
      filtered = filtered.filter((p: any) => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        module.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filtered.length > 0) {
      acc[module] = filtered;
    }
    return acc;
  }, {} as Record<string, any[]>);

  const getModuleStats = (modulePerms: any[]) => {
    const total = modulePerms.length;
    const selected = modulePerms.filter(p => selectedPermissions.includes(p.id)).length;
    return { total, selected };
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900 bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50">
        <div className="relative top-10 mx-auto p-5 border w-4/5 max-w-6xl shadow-lg rounded-md bg-white dark:bg-gray-800">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando permisos...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 dark:bg-gray-900 bg-opacity-50 dark:bg-opacity-70 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-[95%] max-w-7xl shadow-lg rounded-md bg-white dark:bg-gray-800 mb-4">
        <div className="flex flex-col h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Permisos del Cargo - {position.name}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Selecciona los permisos específicos para este cargo
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Controles */}
          <div className="py-4 border-b border-gray-200 dark:border-gray-700 space-y-4">
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
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              <button
                onClick={() => setShowOnlySelected(!showOnlySelected)}
                className={`inline-flex items-center px-3 py-2 border rounded-md text-sm font-medium ${
                  showOnlySelected
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {showOnlySelected ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
                Solo seleccionados
              </button>
            </div>

            {/* Acciones masivas */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectAllPermissions}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Seleccionar todos
              </button>
              <button
                onClick={deselectAllPermissions}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Deseleccionar todos
              </button>
              <button
                onClick={resetToOriginal}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restaurar original
              </button>
            </div>

            {/* Estadísticas */}
            <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Total seleccionados: <strong className="text-gray-900 dark:text-white">{selectedPermissions.length}</strong>
              </span>
              <span>
                Total disponibles: <strong className="text-gray-900 dark:text-white">{allPermissions.length}</strong>
              </span>
              {hasChanges() && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  ⚠ Hay cambios sin guardar
                </span>
              )}
            </div>
          </div>

          {/* Lista de módulos y permisos */}
          <div className="flex-1 overflow-y-auto py-4">
            {Object.keys(filteredModules).length === 0 ? (
              <div className="text-center py-12">
                <Shield className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No hay permisos</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {searchTerm 
                    ? 'No se encontraron permisos con el término de búsqueda.'
                    : 'No hay permisos disponibles para mostrar.'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(filteredModules).map(([module, perms]) => {
                  const stats = getModuleStats(perms);
                  const isExpanded = expandedModules.has(module);
                  
                  return (
                    <div key={module} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                      {/* Header del módulo */}
                      <div 
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
                        onClick={() => toggleModule(module)}
                      >
                        <div className="flex items-center space-x-3">
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                          ) : (
                            <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                          )}
                          <h4 className="text-lg font-medium text-gray-900 dark:text-white capitalize">
                            {module}
                          </h4>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({stats.selected}/{stats.total})
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAllModulePermissions(perms);
                            }}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                          >
                            {stats.selected === stats.total ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                        </div>
                      </div>

                      {/* Lista de permisos */}
                      {isExpanded && (
                        <div className="p-4 space-y-2">
                          {perms.map((permission: any) => {
                            const isSelected = selectedPermissions.includes(permission.id);
                            
                            return (
                              <div
                                key={permission.id}
                                className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                                  isSelected
                                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                                    : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
                                }`}
                                onClick={() => togglePermission(permission.id)}
                              >
                                <div className="flex items-center space-x-3">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-blue-600 border-blue-600'
                                      : 'border-gray-300 dark:border-gray-600'
                                  }`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  
                                  <div>
                                    <h5 className="font-medium text-gray-900 dark:text-white">
                                      {permission.name}
                                    </h5>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                      {permission.code}
                                    </p>
                                    {permission.description && (
                                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
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
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {selectedPermissions.length} permisos seleccionados
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md"
              >
                Cancelar
              </button>
              
              <button
                onClick={handleSave}
                disabled={!hasChanges() || saving}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                  hasChanges() && !saving
                    ? 'text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                    : 'text-gray-400 bg-gray-200 dark:bg-gray-700 cursor-not-allowed'
                }`}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
