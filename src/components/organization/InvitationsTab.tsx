'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getRoleInfoById, getRoleIdByCode, formatRolesForDropdown, roleDisplayMap } from '@/utils/roleUtils';

interface InvitationProps {
  id: string;
  email: string;
  code?: string;
  role_name: string;
  created_at: string;
  expires_at: string | null;
  used: boolean;
  revoked: boolean;
  status?: 'pending' | 'used' | 'revoked';
}

export default function InvitationsTab({ orgId }: { orgId: number }) {
  const [invitations, setInvitations] = useState<InvitationProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string; code: string }[]>([]);

  // Form state
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [sendingInvitation, setSendingInvitation] = useState(false);
  
  // Estados para los filtros
  const [emailFilter, setEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(true); // Por defecto mostramos los filtros

  useEffect(() => {
    if (orgId) {
      fetchInvitations();
      fetchRoles();
    }
  }, [orgId]);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
      .from('invitations')
      .select('id, email, code, role_id, created_at, expires_at, used_at, status')
      .eq('organization_id', orgId);

      if (error) throw error;

      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('id, name');

      let roleMap: { [key: number]: string } = {};
      if (rolesData) {
        roleMap = rolesData.reduce((acc: any, role: any) => {
          acc[role.id] = role.name;
          return acc;
        }, {});
      }

      const formattedInvitations = data.map((invite) => {
        const roleInfo = getRoleInfoById(invite.role_id);

        return {
          id: invite.id,
          email: invite.email,
          code: invite.code,
          role_name: roleInfo.name,
          created_at: new Date(invite.created_at).toLocaleDateString(),
          expires_at: invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : 'No expira',
          status: invite.status,
          used: invite.status === 'used',
          revoked: invite.status === 'revoked'
        };
      });

      setInvitations(formattedInvitations);
    } catch (err: any) {
      console.error('Error fetching invitations:', err);
      setError(err.message || 'Error al cargar invitaciones');
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

      if (formattedRoles.length > 0) {
        const employeeRole = formattedRoles.find(r => r.code === 'employee') || formattedRoles[0];
        setRoleId(employeeRole.id);
      }
    } catch (err: any) {
      console.error('Error fetching roles:', err);
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSendingInvitation(true);
      setError(null);
      setSuccess(null);
      
      if (!email || !roleId) {
        setError('Por favor completa todos los campos obligatorios');
        return;
      }
      
      // Check if email is already invited
      const { data: existingInvites } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('organization_id', orgId)
        .eq('status', 'pending');
      
      if (existingInvites && existingInvites.length > 0) {
        setError('Ya existe una invitación activa para este correo electrónico');
        return;
      }
      
      // Generate unique code
      const code = Math.random().toString(36).substring(2, 10);
      
      // Generate expiration date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Get current user from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      
      if (!currentUserId) {
        setError('No se pudo obtener la información del usuario actual');
        return;
      }
      
      // Create invitation
      const { data: invite, error } = await supabase
        .from('invitations')
        .insert([
          {
            email: email.toLowerCase(),
            code: code,
            role_id: roleId,
            organization_id: orgId,
            created_by: currentUserId,
            expires_at: expiresAt.toISOString(),
            status: 'pending'
          }
        ])
        
        .select();
        
      if (error) throw error;

      // Send invitation email
      // This would typically call a server function to send an email
      // For now, we'll just log it and update the UI
      console.log(`Invitation sent to ${email} with code ${code}`);
      
      // Update UI
      setSuccess(`Invitación enviada a ${email}`);
      
      // Reset form
      setEmail('');
      setRoleId('');
      
      // Refresh invitations list
      fetchInvitations();
      
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.message || 'Error al enviar la invitación');
    } finally {
      setSendingInvitation(false);
    }
  };

  // Revoke invitation
  const revokeInvitation = async (id: string) => {
    if (confirm('¿Estás seguro de que deseas revocar esta invitación?')) {
      try {
        setLoading(true);
        
        const { error } = await supabase
          .from('invitations')
          .update({ status: 'revoked' })
          .eq('id', id);
          
        if (error) throw error;
        
        // Update local invitations list
        setInvitations(prev => 
          prev.map(inv => 
            inv.id === id ? { ...inv, status: 'revoked', revoked: true } : inv
          )
        );
        
        setSuccess('Invitación revocada correctamente');
      } catch (err: any) {
        console.error('Error al revocar invitación:', err);
        setError(err.message || 'Error al revocar la invitación');
      } finally {
        setLoading(false);
      }
    }
  };

  // Resend invitation
  const resendInvitation = async (id: string, email: string) => {
    try {
      setLoading(true);
      
      // Set a new expiration date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Update the invitation with new expiration date
      const { error } = await supabase
        .from('invitations')
        .update({ expires_at: expiresAt.toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      // Fetch the updated invitation to get the code
      const { data } = await supabase
        .from('invitations')
        .select('code')
        .eq('id', id)
        .single();
      
      // Generate the invitation URL
      const inviteCode = data?.code;
      const inviteUrl = `${window.location.origin}/auth/invite?code=${inviteCode}`;
      
      // Here you would typically resend the email
      setSuccess(`Invitación reenviada a ${email}. URL de invitación: ${inviteUrl}`);
      
      // Refresh the invitations list
      await fetchInvitations();
    } catch (err: any) {
      console.error('Error al reenviar invitación:', err);
      setError(err.message || 'Error al reenviar la invitación');
    } finally {
      setLoading(false);
    }
  };
  const getStatusBadge = (invitation: InvitationProps) => {
    if (invitation.status === 'revoked' || invitation.revoked) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
          Revocada
        </span>
      );
    } else if (invitation.status === 'used' || invitation.used) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
          Aceptada
        </span>
      );
    } else if (new Date(invitation.expires_at || '') < new Date()) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
          Expirada
        </span>
      );
    } else {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
          Pendiente
        </span>
      );
    }
  };

  // Filtrar invitaciones en memoria con useMemo
  const filteredInvitations = useMemo(() => {
    return invitations.filter(invitation => {
      const emailMatches = !emailFilter || invitation.email.toLowerCase().includes(emailFilter.toLowerCase());
      const roleMatches = !roleFilter || invitation.role_name === roleFilter;
      
      let statusMatches = statusFilter === 'all';
      if (statusFilter === 'pending') {
        statusMatches = !invitation.used && !invitation.revoked;
      } else if (statusFilter === 'used') {
        statusMatches = invitation.used;
      } else if (statusFilter === 'revoked') {
        statusMatches = invitation.revoked;
      }
      
      return emailMatches && roleMatches && statusMatches;
    });
  }, [invitations, emailFilter, roleFilter, statusFilter]);
  
  // Calcular arrays de roles únicos para select
  const uniqueRoles = useMemo(() => {
    const roles = Array.from(new Set(invitations.map(invite => invite.role_name)));
    return roles.filter(Boolean);
  }, [invitations]);
  
  // Componente para renderizar la barra de filtros
  const renderFilters = () => {
    if (!showFilters) return null;
    
    // Calcular conteo de filtros activos
    const activeFiltersCount = [
      emailFilter !== '',
      roleFilter !== '',
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
            <h3 className="font-medium text-gray-700">Filtrar invitaciones</h3>
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
                setEmailFilter('');
                setRoleFilter('');
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            
            {/* Filtro por estado */}
            <div>
              <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="used">Aceptadas</option>
                  <option value="revoked">Revocadas</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  if (loading && invitations.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sección de filtros */}
      {renderFilters()}
      
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">

        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Enviar Nueva Invitación</h3>
          
          {error && (
            <div className="mt-2 bg-red-50 border-l-4 border-red-500 p-4">
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
          )}
          
          {success && (
            <div className="mt-2 bg-green-50 border-l-4 border-green-500 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              </div>
            </div>
          )}
          
          <form onSubmit={handleSendInvitation} className="space-y-4 mt-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Correo Electrónico
              </label>
              <input
                type="email"
                name="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="ejemplo@correo.com"
                required
              />
            </div>
            
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Rol
              </label>
              <select
                id="role"
                name="role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                <option value="" disabled>Selecciona un rol</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {roleDisplayMap[role.code] || role.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="pt-2">
              <button
                type="submit"
                disabled={sendingInvitation}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {sendingInvitation ? 'Enviando...' : 'Enviar Invitación'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Invitations List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Invitaciones
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Envía invitaciones a nuevos miembros para tu organización
              {invitations.length > 0 && filteredInvitations.length !== invitations.length && 
                ` (${filteredInvitations.length} de ${invitations.length})`}
            </p>
          </div>
          
          {/* Botón para alternar filtros */}
          <button 
            type="button"
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
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rol
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha de Envío
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha de Expiración
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredInvitations.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm font-medium text-gray-500"
                  >
                    {invitations.length === 0 ? 
                      "No hay invitaciones pendientes" : 
                      "No se encontraron invitaciones con los filtros aplicados"}
                  </td>
                </tr>
              ) : (
                filteredInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invitation.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invitation.role_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(invitation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invitation.created_at}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invitation.expires_at}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {!invitation.used && !invitation.revoked && (
                        <>
                          <button
                            onClick={() => resendInvitation(invitation.id, invitation.email)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Reenviar
                          </button>
                          <button
                            onClick={() => revokeInvitation(invitation.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Revocar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
