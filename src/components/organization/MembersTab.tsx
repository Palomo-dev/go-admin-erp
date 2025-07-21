'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getRoleInfoById, getRoleIdByCode, formatRolesForDropdown, roleDisplayMap } from '@/utils/roleUtils';
import BranchAssignmentModal from './BranchAssignmentModal';

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
  
  // Estados para los filtros
  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(true); // Por defecto mostramos los filtros
  
  // Estado para el modal de asignación de sucursales
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{id: string, name: string} | null>(null);

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

      // Fetch members from profiles with a join to roles and branches to get role and branch names
      const { data: membersData, error: membersError } = await supabase
        .rpc('get_profiles_by_organization', { org_id: orgId });

      console.log('Members data:', membersData);

      if (membersError) {
        console.error('Error al obtener miembros:', membersError);
        throw membersError;
      }

      // Only proceed if we have members
      if (!membersData || membersData.length === 0) {
        setMembers([]);
        return;
      }

      // Group members by organization_member_id to handle multiple branch assignments
      const memberMap = new Map();
      
      membersData.forEach((member: any) => {
        const memberId = member.id;
        
        if (!memberMap.has(memberId)) {
          const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Sin nombre';
          const roleInfo = getRoleInfoById(member.role_id);
          
          memberMap.set(memberId, {
            id: member.id,
            user_id: member.user_id || member.id,
            full_name: fullName,
            email: member.email || 'Sin email',
            role: roleInfo.name,
            role_id: member.role_id,
            role_code: roleInfo.code,
            is_admin: member.is_super_admin || false,
            status: member.is_active ? "Activo" : "Inactivo",
            branch_id: member.branch_id,
            branch_name: member.branch_name || 'Sin sucursal',
            branch_names: [], // Array to store all branch names
            created_at: new Date(member.created_at).toLocaleDateString()
          });
        }
        
        // Add branch information if it exists
        if (member.branch_id && member.branch_name) {
          const existingMember = memberMap.get(memberId);
          if (!existingMember.branch_names.includes(member.branch_name)) {
            existingMember.branch_names.push(member.branch_name);
          }
        }
      });

      // Convert map to array and update branch display
      const formattedMembers = Array.from(memberMap.values()).map(member => ({
        ...member,
        branch_name: member.branch_names.length > 0 
          ? member.branch_names.join(', ') 
          : 'Sin sucursal'
      }));

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
  
  const openBranchAssignmentModal = (memberId: string, memberName: string) => {
    setSelectedMember({id: memberId, name: memberName});
    setIsBranchModalOpen(true);
  };

  const closeBranchAssignmentModal = () => {
    setIsBranchModalOpen(false);
    // Refrescar la lista de miembros para ver las actualizaciones
    fetchMembers();
  };

  // Función heredada - ya no se usa directamente pero se mantiene por compatibilidad
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
      
      // Update the member's status in organization_members table
      const { error } = await supabase
        .from('organization_members')
        .update({ is_active: newStatus })
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

  // Filtrar miembros en memoria con useMemo
  const filteredMembers = useMemo(() => {
    return members.filter(member => {
      const nameMatches = !nameFilter || member.full_name.toLowerCase().includes(nameFilter.toLowerCase());
      const emailMatches = !emailFilter || member.email.toLowerCase().includes(emailFilter.toLowerCase());
      const roleMatches = !roleFilter || member.role === roleFilter;
      const branchMatches = !branchFilter || member.branch_id === branchFilter;
      const statusMatches = statusFilter === 'all' || 
        (statusFilter === 'active' && member.status === 'Activo') ||
        (statusFilter === 'inactive' && member.status === 'Inactivo');
      
      return nameMatches && emailMatches && roleMatches && branchMatches && statusMatches;
    });
  }, [members, nameFilter, emailFilter, roleFilter, branchFilter, statusFilter]);
  
  // Calcular arrays de roles únicos para select
  const uniqueRoles = useMemo(() => {
    const roles = Array.from(new Set(members.map(member => member.role)));
    return roles.filter(Boolean);
  }, [members]);
  
  // Componente para renderizar la barra de filtros
  const renderFilters = () => {
    if (!showFilters) return null;
    
    // Calcular conteo de filtros activos
    const activeFiltersCount = [
      nameFilter !== '',
      emailFilter !== '',
      roleFilter !== '',
      branchFilter !== '',
      statusFilter !== 'all'
    ].filter(Boolean).length;
    
    return (
      <div className="mb-6 bg-white border rounded-lg shadow-sm overflow-hidden">
        {/* Encabezado de filtros */}
        <div className="bg-gradient-to-r from-blue-50 to-white p-4 border-b flex justify-between items-center">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            <h3 className="font-medium text-gray-700">Filtrar miembros</h3>
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                {activeFiltersCount} {activeFiltersCount === 1 ? 'filtro activo' : 'filtros activos'}
              </span>
            )}
          </div>
          
          {/* Botón para limpiar filtros */}
          {activeFiltersCount > 0 && (
            <button
              onClick={() => {
                setNameFilter('');
                setEmailFilter('');
                setRoleFilter('');
                setBranchFilter('');
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors flex items-center border border-blue-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar todos
            </button>
          )}
        </div>
        
        {/* Contenido de filtros */}
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Filtro por nombre */}
            <div className="relative">
              <label htmlFor="name-filter" className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  id="name-filter"
                  type="text"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Buscar por nombre..."
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                {nameFilter && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button 
                      onClick={() => setNameFilter('')}
                      className="text-gray-400 hover:text-gray-500 focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Filtro por email */}
            <div className="relative">
              <label htmlFor="email-filter" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email-filter"
                  type="text"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  placeholder="Buscar por email..."
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                {emailFilter && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button 
                      onClick={() => setEmailFilter('')}
                      className="text-gray-400 hover:text-gray-500 focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Filtro por rol */}
            <div>
              <label htmlFor="role-filter" className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <select
                  id="role-filter"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Todos los roles</option>
                  {uniqueRoles.map((role: string) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Filtro por sucursal */}
            <div>
              <label htmlFor="branch-filter" className="block text-sm font-medium text-gray-700 mb-1">Sucursal</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <select
                  id="branch-filter"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Todas las sucursales</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Filtro por estado */}
            <div>
              <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
    <div className="space-y-4">
      {/* Sección de filtros */}
      {renderFilters()}
      
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">Miembros de la Organización</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Lista de miembros actuales {members.length > 0 && filteredMembers.length !== members.length && ` (${filteredMembers.length} de ${members.length})`}</p>
          </div>
          
          {/* Botón para alternar filtros */}
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            {showFilters ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Ocultar filtros
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Mostrar filtros
              </>
            )}
          </button>
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
            {filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  {members.length === 0 ? "No hay miembros registrados" : "No se encontraron miembros con los filtros aplicados"}
                </td>
              </tr>
            ) : (
              filteredMembers.map((member) => (
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
                      <option value="">Seleccionar rol</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.code}>
                          {roleDisplayMap[role.code] || role.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button
                      onClick={() => openBranchAssignmentModal(member.user_id, member.full_name)}
                      className="inline-flex items-center px-2 py-1 border border-primary text-xs font-medium rounded-md text-primary hover:bg-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                      disabled={member.is_admin}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {member.branch_name === 'Sin sucursal' ? 'Asignar' : 'Gestionar'} Sucursales
                    </button>
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
                      onClick={() => removeMember(member.id)}
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
      {/* Modal de asignación de sucursales */}
      {isBranchModalOpen && selectedMember && (
        <BranchAssignmentModal
          isOpen={isBranchModalOpen}
          onClose={closeBranchAssignmentModal}
          memberId={selectedMember.id}
          memberName={selectedMember.name}
          organizationId={orgId}
        />
      )}
    </div>
  );
}
