'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';

interface MemberProps {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function MembersTab({ orgId }: { orgId: number }) {
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [newRole, setNewRole] = useState<string>('');

  useEffect(() => {
    if (orgId) {
      fetchMembers();
      fetchRoles();
    }
  }, [orgId]);

  const fetchMembers = async () => {
    try {
      setLoading(true);

      console.log('Organization ID:', orgId);

      // First fetch members from organization_members
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select('id, user_id, role, is_super_admin, is_active, created_at')
        .eq('organization_id', orgId);
        
      if (membersError) {
        console.error('Error al obtener miembros:', membersError);
        throw membersError;
      }

      // Then fetch profiles for those members
      const userIds = membersData.map(member => member.user_id);
      
      // Only fetch profiles if we have members
      if (userIds.length === 0) {
        setMembers([]);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error al obtener perfiles:', profilesError);
        throw profilesError;
      }

      // Combine the data
      const formattedMembers = membersData.map(member => {
        const profile = profilesData.find(p => p.id === member.user_id) || {};
        const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Sin nombre';
        
        return {
          id: member.id,
          user_id: member.user_id,
          full_name: fullName,
          email: profile?.email || 'Sin email',
          role: member.role || 'Sin rol',
          is_admin: member.is_super_admin,
          status: member.is_active ? 'Activo' : 'Inactivo',
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
      setRoles(data);
    } catch (err: any) {
      console.error('Error fetching roles:', err);
    }
  };

  const updateMemberRole = async (memberId: string, roleName: string) => {
    try {
      setUpdatingRole(true);
      
      // Update the member's role directly in organization_members
      const { error } = await supabase
        .from('organization_members')
        .update({ role: roleName })
        .eq('id', memberId)
        .eq('organization_id', orgId);

      if (error) throw error;
      
      // Update local member data
      setMembers(prev => prev.map(m => {
        if (m.id === memberId) {
          return { 
            ...m, 
            role: roleName || 'Sin rol'
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
                      defaultValue={member.role}
                      onChange={(e) => updateMemberRole(member.id, e.target.value)}
                    >
                      <option value="">Seleccionar rol</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.name}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      member.status === 'Activo' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {member.status}
                    </span>
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
