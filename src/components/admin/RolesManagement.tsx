'use client';

import { useState, useEffect } from 'react';
import { useRoles, usePermissions } from '@/hooks/useRoles';
import { Role, RoleWithPermissions } from '@/lib/services/roleService';
import { 
  Users, 
  Shield, 
  Plus, 
  Edit, 
  Copy, 
  Trash2, 
  Settings,
  Search,
  Filter,
  MoreVertical,
  Lock,
  Unlock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import PermissionsMatrix from './PermissionsMatrix';
import { RolesListSkeleton } from './RolesSkeleton';

interface RolesManagementProps {
  organizationId: number;
}

export default function RolesManagement({ organizationId }: RolesManagementProps) {
  const {
    roles,
    loading,
    error,
    createRole,
    updateRole,
    deleteRole,
    cloneRole,
    refreshRoles
  } = useRoles(organizationId);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'system' | 'custom'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);

  // Filtrar roles según búsqueda y filtros
  const filteredRoles = roles.filter(role => {
    const matchesSearch = role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (role.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'all' || 
                         (filterType === 'system' && role.is_system) ||
                         (filterType === 'custom' && !role.is_system);
    
    return matchesSearch && matchesFilter;
  });

  const handleCreateRole = async (roleData: { name: string; description: string }) => {
    const newRole = await createRole(roleData);
    if (newRole) {
      setShowCreateForm(false);
    }
  };

  const handleUpdateRole = async (roleId: number, roleData: { name: string; description: string }) => {
    const updatedRole = await updateRole(roleId, roleData);
    if (updatedRole) {
      setEditingRole(null);
    }
  };

  const handleDeleteRole = async (role: RoleWithPermissions) => {
    if (role.is_system) {
      toast.error('No se pueden eliminar roles del sistema');
      return;
    }

    if (role.member_count && role.member_count > 0) {
      toast.error('No se puede eliminar un rol que tiene usuarios asignados');
      return;
    }

    if (window.confirm(`¿Estás seguro de eliminar el rol "${role.name}"?`)) {
      await deleteRole(role.id);
    }
  };

  const handleCloneRole = async (role: RoleWithPermissions) => {
    const newName = prompt(`Ingresa el nombre para el nuevo rol (basado en "${role.name}"):`);
    if (newName && newName.trim()) {
      await cloneRole(role.id, newName.trim());
    }
  };

  if (loading) {
    return <RolesListSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Shield className="h-5 w-5 text-red-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error al cargar roles</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <button
              onClick={refreshRoles}
              className="mt-2 text-sm text-red-800 underline hover:text-red-900"
            >
              Intentar nuevamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles del Sistema</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Roles globales - Asigna permisos granulares por cargo en HRM
          </p>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Búsqueda */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filtro por tipo */}
          <div className="sm:w-48">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'system' | 'custom')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Todos los roles</option>
              <option value="system">Roles del sistema</option>
              <option value="custom">Roles personalizados</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de roles */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Roles ({filteredRoles.length})
          </h3>
        </div>

        {filteredRoles.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay roles</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || filterType !== 'all' 
                ? 'No se encontraron roles con los filtros aplicados.'
                : 'Comienza creando tu primer rol personalizado.'
              }
            </p>
            {!searchTerm && filterType === 'all' && (
              <div className="mt-6">
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Rol
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredRoles.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                onEdit={() => setEditingRole(role)}
                onDelete={() => handleDeleteRole(role)}
                onClone={() => handleCloneRole(role)}
                onManagePermissions={() => setSelectedRole(role)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modales */}
      {showCreateForm && (
        <CreateRoleModal
          onClose={() => setShowCreateForm(false)}
          onSubmit={handleCreateRole}
        />
      )}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSubmit={(data) => handleUpdateRole(editingRole.id, data)}
        />
      )}

      {selectedRole && (
        <PermissionsModal
          role={selectedRole}
          organizationId={organizationId}
          onClose={() => setSelectedRole(null)}
          onPermissionsUpdated={refreshRoles}
        />
      )}
    </div>
  );
}

// Componente para cada tarjeta de rol
interface RoleCardProps {
  role: RoleWithPermissions;
  onEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
  onManagePermissions: () => void;
}

function RoleCard({ role, onEdit, onDelete, onClone, onManagePermissions }: RoleCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="p-6 hover:bg-gray-50 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className={`p-2 rounded-lg ${role.is_system ? 'bg-blue-100' : 'bg-green-100'}`}>
            {role.is_system ? (
              <Lock className="h-5 w-5 text-blue-600" />
            ) : (
              <Unlock className="h-5 w-5 text-green-600" />
            )}
          </div>
          
          <div>
            <div className="flex items-center space-x-2">
              <h4 className="text-lg font-medium text-gray-900">{role.name}</h4>
              {role.is_system && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Sistema
                </span>
              )}
            </div>
            {role.description && (
              <p className="text-sm text-gray-500 mt-1">{role.description}</p>
            )}
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center">
                <Shield className="h-4 w-4 mr-1" />
                {role.permission_count || 0} permisos
              </span>
              <span className="flex items-center">
                <Users className="h-4 w-4 mr-1" />
                {role.member_count || 0} usuarios
              </span>
            </div>
          </div>
        </div>

        {/* Menú de acciones */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-10">
              <div className="py-1">
                <button
                  onClick={() => {
                    onManagePermissions();
                    setShowMenu(false);
                  }}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Gestionar Permisos
                </button>
                
                {!role.is_system && (
                  <>
                    <button
                      onClick={() => {
                        onEdit();
                        setShowMenu(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </button>
                    
                    <button
                      onClick={() => {
                        onClone();
                        setShowMenu(false);
                      }}
                      className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Clonar
                    </button>
                    
                    {(!role.member_count || role.member_count === 0) && (
                      <button
                        onClick={() => {
                          onDelete();
                          setShowMenu(false);
                        }}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Componente modal para crear rol
interface CreateRoleModalProps {
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
}

function CreateRoleModal({ onClose, onSubmit }: CreateRoleModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit({ name: name.trim(), description: description.trim() });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Crear Nuevo Rol</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Rol *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Ej: Vendedor, Supervisor, etc."
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Describe las responsabilidades de este rol..."
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
              >
                Crear Rol
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Componente modal para editar rol
interface EditRoleModalProps {
  role: RoleWithPermissions;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string }) => void;
}

function EditRoleModal({ role, onClose, onSubmit }: EditRoleModalProps) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit({ name: name.trim(), description: description.trim() });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Editar Rol</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Rol *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
              >
                Guardar Cambios
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Componente modal para gestionar permisos
interface PermissionsModalProps {
  role: RoleWithPermissions;
  organizationId: number;
  onClose: () => void;
  onPermissionsUpdated?: () => void;
}

function PermissionsModal({ role, organizationId, onClose, onPermissionsUpdated }: PermissionsModalProps) {
  const handlePermissionsUpdated = () => {
    onPermissionsUpdated?.();
    // Opcional: cerrar el modal después de actualizar
    // onClose();
  };

  return (
    <PermissionsMatrix
      role={role}
      organizationId={organizationId}
      onClose={onClose}
      onPermissionsUpdated={handlePermissionsUpdated}
    />
  );
}
