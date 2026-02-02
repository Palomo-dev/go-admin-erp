'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { toast } from 'react-hot-toast';
import { Key, Search, Filter, Plus, Edit, Trash2 } from 'lucide-react';

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
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

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
      toast.error('Error al cargar permisos');
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
                         permission.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = selectedModule === 'all' || permission.module === selectedModule;
    return matchesSearch && matchesModule;
  });

  const handleCreatePermission = async (permissionData: Omit<Permission, 'id'>) => {
    try {
      const { error } = await supabase
        .from('permissions')
        .insert([permissionData]);

      if (error) throw error;
      
      toast.success('Permiso creado exitosamente');
      setShowCreateForm(false);
      loadPermissions();
    } catch (error) {
      console.error('Error creating permission:', error);
      toast.error('Error al crear permiso');
    }
  };

  const handleUpdatePermission = async (id: number, permissionData: Partial<Permission>) => {
    try {
      const { error } = await supabase
        .from('permissions')
        .update(permissionData)
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Permiso actualizado exitosamente');
      setEditingPermission(null);
      loadPermissions();
    } catch (error) {
      console.error('Error updating permission:', error);
      toast.error('Error al actualizar permiso');
    }
  };

  const handleDeletePermission = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este permiso?')) return;
    
    try {
      const { error } = await supabase
        .from('permissions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Permiso eliminado exitosamente');
      loadPermissions();
    } catch (error) {
      console.error('Error deleting permission:', error);
      toast.error('Error al eliminar permiso');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-2 text-gray-600">Cargando permisos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Permisos</h2>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona permisos individuales y por módulo del sistema
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>Crear Permiso</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="inline h-4 w-4 mr-1" />
              Buscar permisos
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, código o descripción..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="inline h-4 w-4 mr-1" />
              Filtrar por módulo
            </label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center">
            <Key className="h-8 w-8 text-indigo-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Permisos</p>
              <p className="text-2xl font-bold text-gray-900">{permissions.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center">
            <Filter className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Permisos Filtrados</p>
              <p className="text-2xl font-bold text-gray-900">{filteredPermissions.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-600 font-bold text-sm">{modules.length}</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Módulos Activos</p>
              <p className="text-2xl font-bold text-gray-900">{modules.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de permisos */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permiso
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Módulo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Descripción
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPermissions.map((permission) => (
                  <tr key={permission.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {permission.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {permission.modules?.name || permission.module_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {permission.code}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {permission.description || 'Sin descripción'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setEditingPermission(permission)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3 inline-flex items-center"
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeletePermission(permission.id)}
                        className="text-red-600 hover:text-red-900 inline-flex items-center"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredPermissions.length === 0 && (
              <div className="text-center py-8">
                <Key className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No se encontraron permisos</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm || selectedModule !== 'all' 
                    ? 'Intenta ajustar los filtros de búsqueda'
                    : 'Comienza creando un nuevo permiso'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal para crear/editar permiso */}
      {(showCreateForm || editingPermission) && (
        <PermissionFormModal
          permission={editingPermission}
          modules={modules}
          onSave={editingPermission ? 
            (data) => handleUpdatePermission(editingPermission.id, data) :
            handleCreatePermission
          }
          onCancel={() => {
            setShowCreateForm(false);
            setEditingPermission(null);
          }}
        />
      )}
    </div>
  );
}

// Modal para crear/editar permisos
interface PermissionFormModalProps {
  permission?: Permission | null;
  modules: Module[];
  onSave: (data: any) => void;
  onCancel: () => void;
}

function PermissionFormModal({ permission, modules, onSave, onCancel }: PermissionFormModalProps) {
  const [formData, setFormData] = useState({
    name: permission?.name || '',
    code: permission?.code || '',
    description: permission?.description || '',
    module_code: permission?.module_code || ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    
    if (!formData.code.trim()) {
      newErrors.code = 'El código es requerido';
    } else if (!/^[A-Z_]+$/.test(formData.code)) {
      newErrors.code = 'El código debe contener solo letras mayúsculas y guiones bajos';
    }
    
    if (!formData.module_code) {
      newErrors.module_code = 'El módulo es requerido';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {permission ? 'Editar Permiso' : 'Crear Nuevo Permiso'}
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Permiso *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Ej: Gestionar usuarios"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Código del Permiso *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono ${
                  errors.code ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Ej: USER_MANAGE"
              />
              {errors.code && <p className="mt-1 text-sm text-red-600">{errors.code}</p>}
              <p className="mt-1 text-xs text-gray-500">Solo letras mayúsculas y guiones bajos</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Módulo *
              </label>
              <select
                value={formData.module_code}
                onChange={(e) => setFormData({ ...formData, module_code: e.target.value })}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  errors.module_code ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="">Seleccionar módulo</option>
                {modules.map((module) => (
                  <option key={module.code} value={module.code}>
                    {module.name}
                  </option>
                ))}
              </select>
              {errors.module_code && <p className="mt-1 text-sm text-red-600">{errors.module_code}</p>}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Describe qué permite hacer este permiso..."
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                {permission ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
