'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Permission } from '@/lib/services/roleService';
import { Search, Shield, Filter, Key, Package } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { PermissionsSkeleton } from './RolesSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface PermissionsManagementProps {
  organizationId: number;
}

interface Permission {
  id: number;
  name: string;
  code: string;
  description?: string;
  module: string;
  category?: string;
}

interface Module {
  code: string;
  name: string;
}

export default function PermissionsManagement({ organizationId }: PermissionsManagementProps) {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
    loadModules();
  }, [organizationId]);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('module')
        .order('name');

      if (error) throw error;
      setPermissions(data || []);
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

  const loadModules = async () => {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('module')
        .order('module');

      if (error) throw error;
      
      // Obtener módulos únicos
      const uniqueModules = Array.from(
        new Set((data || []).map(p => p.module).filter(Boolean))
      ).map(module => ({
        code: module,
        name: module
      }));
      
      setModules(uniqueModules);
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  };

  const filteredPermissions = permissions.filter(permission => {
    const matchesSearch = permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         permission.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         permission.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         permission.module?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         permission.category?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = selectedModule === 'all' || permission.module === selectedModule;
    return matchesSearch && matchesModule;
  });

  // Agrupar permisos por módulo
  const permissionsByModule = filteredPermissions.reduce((acc, permission) => {
    const module = permission.module || 'Sin módulo';
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const getModuleColor = (module: string) => {
    const colors: Record<string, string> = {
      'admin': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      'inventory': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      'pos': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      'crm': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
      'hrm': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      'finanzas': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      'pms': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
      'transporte': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
    };
    return colors[module.toLowerCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  if (loading) {
    return <PermissionsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Catálogo de Permisos</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Visualiza todos los permisos disponibles en el sistema organizados por módulo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <Shield className="h-3 w-3 mr-1" />
            Solo lectura
          </Badge>
        </div>
      </div>

      {/* Filtros */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Search className="inline h-4 w-4 mr-1" />
                Buscar permisos
              </label>
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, código, módulo o categoría..."
                className="bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Filter className="inline h-4 w-4 mr-1" />
                Filtrar por módulo
              </label>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos los módulos</option>
                {modules.map((module) => (
                  <option key={module.code} value={module.code}>
                    {module.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Key className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Permisos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{permissions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Filter className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Permisos Filtrados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredPermissions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Package className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Módulos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{modules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de permisos agrupados por módulo */}
      <div className="space-y-4">
        {Object.entries(permissionsByModule).map(([moduleName, modulePermissions]) => (
          <Card key={moduleName} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                      {moduleName}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {modulePermissions.length} {modulePermissions.length === 1 ? 'permiso' : 'permisos'}
                    </p>
                  </div>
                </div>
                <Badge className={getModuleColor(moduleName)}>
                  {moduleName}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Permiso
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Código
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Categoría
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Descripción
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {modulePermissions.map((permission) => (
                      <tr key={permission.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {permission.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-xs font-mono px-2 py-1 bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-300 rounded">
                            {permission.code}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {permission.category ? (
                            <Badge variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                              {permission.category}
                            </Badge>
                          ) : (
                            <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {permission.description || 'Sin descripción'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {filteredPermissions.length === 0 && (
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Key className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
                <h3 className="mt-4 text-sm font-medium text-gray-900 dark:text-white">No se encontraron permisos</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  {searchTerm || selectedModule !== 'all' 
                    ? 'Intenta ajustar los filtros de búsqueda'
                    : 'No hay permisos disponibles en el sistema'
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
