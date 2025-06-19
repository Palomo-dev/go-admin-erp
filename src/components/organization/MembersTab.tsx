'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

// Importar las utilidades de roles directamente en lugar de usando importación con ruta relativa
// Esto ayuda a evitar problemas de carga de chunks
const roleCodeMap: {[key: number]: string} = {
  1: 'super_admin',
  2: 'org_admin',
  3: 'manager',
  4: 'employee',
  5: 'customer'
};

const roleNameMap: {[key: number]: string} = {
  1: 'Super Admin',
  2: 'Admin',
  3: 'Manager',
  4: 'Employee',
  5: 'Customer'
};

const roleIdMap: {[key: string]: number} = {
  'super_admin': 1,
  'org_admin': 2,
  'manager': 3,
  'employee': 4,
  'customer': 5
};

const roleDisplayMap: {[key: string]: string} = {
  'super_admin': 'Super Admin',
  'org_admin': 'Admin',
  'manager': 'Manager',
  'employee': 'Employee',
  'customer': 'Customer'
};

const getRoleInfoById = (roleId: number | null): { name: string; code: string } => {
  if (!roleId) return { name: 'Sin rol', code: '' };
  
  return {
    name: roleNameMap[roleId] || `Rol ${roleId}`,
    code: roleCodeMap[roleId] || `role_${roleId}`
  };
};

const getRoleIdByCode = (code: string): number | null => {
  return roleIdMap[code] || null;
};

const formatRolesForDropdown = (roles: any[]): any[] => {
  return roles.map(role => ({
    id: role.id,
    code: roleCodeMap[role.id] || `role_${role.id}`,
    name: role.name
  }));
};

interface MemberProps {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  role_id: number;
  role_code: string;
  is_admin: boolean;
  status: string;
  branch_id: string | null;
  branch_name: string;
  created_at: string;
}

export default function MembersTab({ orgId }: { orgId: number }) {
  const [members, setMembers] = useState<MemberProps[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingBranch, setUpdatingBranch] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newRole, setNewRole] = useState<string>('');

  useEffect(() => {
    if (orgId) {
      fetchMembers();
      fetchRoles();
      fetchBranches();
    }
  }, [orgId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      // Fetch members from organization_members joined with profiles and roles
      const { data: membersData, error: membersError } = await supabase
        .rpc('get_profiles_by_organization', { org_id: orgId });

      console.log('Members data:', membersData);

      if (membersError) {
        console.error('Error al obtener información de miembro:', membersError);
        throw membersError;
      }

      // Only proceed if we have members
      if (!membersData || membersData.length === 0) {
        setMembers([]);
        return;
      }
      
      // Eliminar duplicados basados en user_id
      // Esto asegura que cada usuario aparezca solo una vez en la lista
      const uniqueUserIds = new Set<string>();
      const uniqueMembersData = membersData.filter(member => {
        // Si ya hemos visto este user_id, lo filtramos
        if (uniqueUserIds.has(member.user_id)) {
          return false;
        }
        // Si es la primera vez que vemos este user_id, lo mantenemos
        uniqueUserIds.add(member.user_id);
        return true;
      });
      
      console.log('Datos de miembros sin duplicados:', uniqueMembersData.length, 'de', membersData.length, 'registros originales');

      // We'll use the roleUtils functions instead of defining the map here

      // Type assertion for the data from Supabase
      type MemberData = any;

      // Format the member data with proper role names
      const formattedMembers = uniqueMembersData.map((member: MemberData) => {
        const profile = member.profiles || {};
        const role = member.roles || {};
        const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre';
        
        // Para obtener información de roles, ahora usamos los datos relacionados directamente
        const roleName = role.name || 'Sin rol';
        const roleCode = roleName.toLowerCase().replace(' ', '_');
        
        // Obtener información de la primera sucursal asignada (si existe)
        let branchId = null;
        let branchName = 'Sin sucursal';
        
        if (member.branchAssignments && member.branchAssignments.length > 0) {
          branchId = member.branchAssignments[0].branch_id;
          branchName = member.branchAssignments[0].branch_name;
        }
        
        return {
          id: member.id,
          user_id: member.user_id,
          full_name: fullName,
          email: profile.email || 'Sin email',
          role: roleName,
          role_id: member.role_id,
          role_code: roleCode,
          is_admin: member.is_super_admin || false,
          status: member.is_active ? "Activo" : "Inactivo",
          branch_id: branchId,
          branch_name: branchName,
          branch_assignments: member.branchAssignments || [],
          created_at: new Date(member.created_at).toLocaleDateString()
        };
      });

      setMembers(formattedMembers);
    } catch (err: any) {
      console.error('Error al obtener miembros:', err);
      setError(err.message || 'Error al cargar los miembros');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .order('name');

      if (error) throw error;
      
      const formattedRoles = formatRolesForDropdown(data);
      setRoles(formattedRoles);
    } catch (err: any) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name');

      if (error) throw error;
      setBranches(data);
    } catch (err: any) {
      console.error('Error fetching branches:', err);
    }
  };

  const updateMemberRole = async (memberId: string, roleCode: string) => {
    try {
      setUpdatingRole(true);
      
      // Find the role ID that corresponds to this role code using our utility function
      const roleId = getRoleIdByCode(roleCode);
      
      if (roleId === null) {
        throw new Error(`Role code ${roleCode} not found`);
      }
      
      // Update the member's role_id in profiles table
      const { error } = await supabase
        .from('organization_members')
        .update({ role_id: roleId })
        .eq('id', memberId)
        .eq('organization_id', orgId);

      if (error) throw error;
      
      // Get role info using our utility function
      const roleInfo = getRoleInfoById(roleId);
      
      // Update local member data
      setMembers(prev => prev.map(m => {
        if (m.id === memberId) {
          return { 
            ...m, 
            role: roleInfo.name,
            role_id: roleId,
            role_code: roleCode
          };
        }
        return m;
      }));
      
      setSuccess('Rol actualizado correctamente');
    } catch (err: any) {
      console.error('Error al actualizar rol:', err);
      setError(err.message || 'Error al actualizar el rol del miembro');
    } finally {
      setUpdatingRole(false);
    }
  };
  
  const updateMemberBranch = async (memberId: string, branchId: string) => {
    try {
      setUpdatingBranch(true);
      console.log(memberId);  
      // Update the member's branch_id in profiles table
      const { error } = await supabase
        .from('member_branches')
        .update({ branch_id: branchId })
        .eq('id', memberId)
      
      if (error) throw error;
      
      // Find the branch name
      const branch = branches.find(b => b.id === branchId);
      const branchName = branch ? branch.name : 'Sin sucursal';
      
      // Update local member data
      setMembers(prev => prev.map(m => {
        if (m.id === memberId) {
          return { 
            ...m, 
            branch_id: branchId,
            branch_name: branchName
          };
        }
        return m;
      }));
      
      setSuccess('Sucursal actualizada correctamente');
    } catch (err: any) {
      console.error('Error al actualizar sucursal:', err);
      setError(err.message || 'Error al actualizar la sucursal del miembro');
    } finally {
      setUpdatingBranch(false);
    }
  };
  
  const toggleMemberStatus = async (memberId: string, currentStatus: boolean) => {
    try {
      setUpdatingStatus(true);
      
      // Toggle the status
      const newStatus = !currentStatus;
      
      // Update the member's status in profiles table
      const { error } = await supabase
        .from('organization_members')
        .update({ status: newStatus })
        .eq('id', memberId)
        .eq('organization_id', orgId);
      
      if (error) throw error;
      
      // Update local member data
      setMembers(prev => prev.map(m => {
        if (m.id === memberId) {
          return { 
            ...m, 
            status: newStatus ? 'Activo' : 'Inactivo'
          };
        }
        return m;
      }));
      
      setSuccess(`Usuario ${newStatus ? 'activado' : 'desactivado'} correctamente`);
    } catch (err: any) {
      console.error('Error al actualizar estado:', err);
      setError(err.message || 'Error al actualizar el estado del miembro');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (confirm('¿Estás seguro de que deseas eliminar este miembro de la organización?')) {
      try {
        setLoading(true);
        
        // Remove from organization_members
        const { error } = await supabase
          .from('organization_members')
          .delete()
          .eq('id', memberId)
          .eq('organization_id', orgId);

        if (error) throw error;
        
        // Update the local state to remove the member
        setMembers(prev => prev.filter(m => m.id !== memberId));
        setSuccess('Miembro eliminado correctamente');
        
        // Refresh the members list
        await fetchMembers();
      } catch (err: any) {
        console.error('Error removing member:', err);
        setError(err.message || 'Error al eliminar el miembro');
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
        <div>
          <h3 className="text-lg leading-6 font-medium text-gray-900">Miembros de la Organización</h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">Lista de miembros actuales</p>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sucursal
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha de Registro
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  No hay miembros registrados
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {member.full_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {member.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select 
                      className="rounded-md border border-gray-300 p-1"
                      value={member.role_code || ""}
                      onChange={(e) => updateMemberRole(member.id, e.target.value)}
                      disabled={member.is_admin} // Disable changing role for owners/admins
                    >
                      <option key={`select-role-default-${member.id}`} value="">Seleccionar rol</option>
                      {roles.map((role, roleIndex) => (
                        <option key={`role-${role.id || roleIndex}-${member.id}`} value={role.code}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select 
                      className="rounded-md border border-gray-300 p-1"
                      value={member.branch_id || ""}
                      onChange={(e) => updateMemberBranch(member.id, e.target.value)}
                      disabled={member.is_admin} // Disable changing branch for owners/admins
                    >
                      <option key={`no-branch-default-${member.id}`} value="">Sin sucursal</option>
                      {branches.map((branch, branchIndex) => (
                        <option key={`branch-${branch.id || branchIndex}-${member.id}`} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button 
                      onClick={() => !member.is_admin && toggleMemberStatus(member.id, member.status === 'Activo')}
                      disabled={member.is_admin}
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        member.status === 'Activo' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      } ${!member.is_admin ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed opacity-75'}`}
                    >
                      {member.status}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {member.created_at}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => removeMember(member.user_id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
