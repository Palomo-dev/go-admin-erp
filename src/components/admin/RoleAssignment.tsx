'use client';

import { useState, useEffect } from 'react';
import { useRoles } from '@/hooks/useRoles';
import { supabase } from '@/lib/supabase/config';
import { RoleWithPermissions } from '@/lib/services/roleService';
import { 
  Users, 
  UserCheck, 
  Search, 
  Filter,
  ChevronDown,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  User
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface OrganizationMember {
  id: number;
  user_id: string;
  role_id: number;
  is_super_admin: boolean;
  is_active: boolean;
  profiles: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    avatar_url?: string;
  };
  roles: {
    id: number;
    name: string;
    is_system: boolean;
  };
}

interface RoleAssignmentProps {
  organizationId: number;
}

export default function RoleAssignment({ organizationId }: RoleAssignmentProps) {
  const { roles, loading: rolesLoading } = useRoles(organizationId);
  
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<number | 'all'>('all');
  const [pendingChanges, setPendingChanges] = useState<{[memberId: number]: number}>({});

  // Cargar miembros de la organización
  const loadMembers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          role_id,
          is_super_admin,
          is_active,
          profiles(
            id,
            email,
            first_name,
            last_name,
            avatar_url
          ),
          roles(
            id,
            name,
            is_system
          )
        `)
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (error) throw error;
      setMembers((data as any) || []);
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Error al cargar miembros de la organización');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (organizationId) {
      loadMembers();
    }
  }, [organizationId]);

  // Filtrar miembros según búsqueda y filtros
  const filteredMembers = members.filter(member => {
    const matchesSearch = 
      member.profiles.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.profiles.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.profiles.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = filterRole === 'all' || member.role_id === filterRole;
    
    return matchesSearch && matchesRole;
  });

  // Cambiar rol de un miembro (pendiente)
  const handleRoleChange = (memberId: number, newRoleId: number) => {
    setPendingChanges(prev => ({
      ...prev,
      [memberId]: newRoleId
    }));
  };

  // Obtener el rol actual o pendiente de un miembro
  const getMemberRole = (member: OrganizationMember): number => {
    return pendingChanges[member.id] ?? member.role_id;
  };

  // Verificar si hay cambios pendientes
  const hasPendingChanges = () => {
    return Object.keys(pendingChanges).length > 0;
  };

  // Descartar cambios pendientes
  const discardChanges = () => {
    setPendingChanges({});
  };

  // Guardar cambios
  const saveChanges = async () => {
    try {
      setSaving(true);
      
      const updates = Object.entries(pendingChanges).map(([memberId, roleId]) => ({
        id: parseInt(memberId),
        role_id: roleId
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('organization_members')
          .update({ role_id: update.role_id })
          .eq('id', update.id);
        
        if (error) throw error;
      }

      toast.success(`${updates.length} asignaciones de roles actualizadas`);
      setPendingChanges({});
      await loadMembers(); // Recargar datos
      
    } catch (error) {
      console.error('Error saving role assignments:', error);
      toast.error('Error al guardar asignaciones de roles');
    } finally {
      setSaving(false);
    }
  };

  // Obtener estadísticas de roles
  const getRoleStats = () => {
    const stats: {[roleId: number]: {role: RoleWithPermissions; count: number}} = {};
    
    filteredMembers.forEach(member => {
      const roleId = getMemberRole(member);
      const role = roles.find(r => r.id === roleId);
      
      if (role) {
        if (!stats[roleId]) {
          stats[roleId] = { role, count: 0 };
        }
        stats[roleId].count++;
      }
    });
    
    return Object.values(stats).sort((a, b) => b.count - a.count);
  };

  if (loading || rolesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <span className="ml-2 text-gray-600">Cargando miembros...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asignación de Roles</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los roles asignados a los miembros de tu organización
          </p>
        </div>
        
        {hasPendingChanges() && (
          <div className="flex items-center space-x-3">
            <span className="text-sm text-amber-600 font-medium">
              {Object.keys(pendingChanges).length} cambios pendientes
            </span>
            <button
              onClick={discardChanges}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Descartar
            </button>
            <button
              onClick={saveChanges}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Estadísticas de roles */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Distribución de Roles</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {getRoleStats().map(({ role, count }) => (
            <div key={role.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className={`p-2 rounded-lg ${role.is_system ? 'bg-blue-100' : 'bg-green-100'}`}>
                <UserCheck className={`h-4 w-4 ${role.is_system ? 'text-blue-600' : 'text-green-600'}`} />
              </div>
              <div>
                <p className="font-medium text-gray-900">{role.name}</p>
                <p className="text-sm text-gray-500">{count} usuarios</p>
              </div>
            </div>
          ))}
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
                placeholder="Buscar miembros..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filtro por rol */}
          <div className="sm:w-64">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">Todos los roles</option>
              {roles.map(role => (
                <option key={role.id} value={role.id}>
                  {role.name} {role.is_system ? '(Sistema)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de miembros */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Miembros ({filteredMembers.length})
          </h3>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No hay miembros</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || filterRole !== 'all'
                ? 'No se encontraron miembros con los filtros aplicados.'
                : 'No hay miembros en esta organización.'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredMembers.map((member) => {
              const currentRoleId = getMemberRole(member);
              const currentRole = roles.find(r => r.id === currentRoleId);
              const hasChanges = pendingChanges[member.id] !== undefined;
              
              return (
                <div key={member.id} className={`p-6 ${hasChanges ? 'bg-amber-50' : 'hover:bg-gray-50'} transition-colors`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {/* Avatar */}
                      <div className="flex-shrink-0">
                        {member.profiles.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={member.profiles.avatar_url}
                            alt={`${member.profiles.first_name} ${member.profiles.last_name}`}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="h-6 w-6 text-gray-500" />
                          </div>
                        )}
                      </div>
                      
                      {/* Información del usuario */}
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-medium text-gray-900">
                            {member.profiles.first_name} {member.profiles.last_name}
                          </h4>
                          {member.is_super_admin && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              Super Admin
                            </span>
                          )}
                          {hasChanges && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Cambio pendiente
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{member.profiles.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Rol actual: <span className="font-medium">{member.roles.name}</span>
                        </p>
                      </div>
                    </div>

                    {/* Selector de rol */}
                    <div className="flex items-center space-x-3">
                      <div className="relative">
                        <select
                          value={currentRoleId}
                          onChange={(e) => handleRoleChange(member.id, parseInt(e.target.value))}
                          className={`appearance-none bg-white border rounded-md px-3 py-2 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            hasChanges 
                              ? 'border-amber-300 bg-amber-50' 
                              : 'border-gray-300'
                          }`}
                        >
                          {roles.map(role => (
                            <option key={role.id} value={role.id}>
                              {role.name} {role.is_system ? '(Sistema)' : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                      </div>
                      
                      {hasChanges && (
                        <div className="text-amber-600">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Mostrar cambio propuesto */}
                  {hasChanges && (
                    <div className="mt-3 p-3 bg-amber-100 rounded-md border border-amber-200">
                      <div className="flex items-center space-x-2 text-sm">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-amber-800">
                          Cambio propuesto: <strong>{member.roles.name}</strong> → <strong>{currentRole?.name}</strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
