'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getRoleInfoById, getRoleIdByCode, formatRolesForDropdown, roleDisplayMap } from '@/utils/roleUtils';
import { InvitationsSkeleton } from './OrganizationSkeletons';
import { useTranslations } from 'next-intl';
import { EmailConfirmedGate, EmailConfirmedWarning } from '@/components/auth/EmailConfirmedGate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';

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
  const t = useTranslations('org.invitationsTab');
  const [invitations, setInvitations] = useState<InvitationProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string; code: string }[]>([]);

  // Form state
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [sendingInvitation, setSendingInvitation] = useState(false);

  // Límite de usuarios del plan
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [currentMemberCount, setCurrentMemberCount] = useState(0);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  
  // Estados para los filtros
  const [emailFilter, setEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(true); // Por defecto mostramos los filtros

  useEffect(() => {
    if (orgId) {
      fetchInvitations();
      fetchRoles();
      fetchUserLimits();
    }
  }, [orgId]);

  const fetchUserLimits = async () => {
    try {
      // Obtener max_users del plan actual
      const { data: planData, error: planError } = await supabase
        .rpc('get_current_plan', { org_id: orgId });

      if (!planError && planData && planData.length > 0) {
        const planMaxUsers = planData[0].max_users || null;

        // Obtener addons activos de usuarios extra
        const { data: addonsData } = await supabase
          .from('subscription_addons')
          .select('quantity')
          .eq('organization_id', orgId)
          .eq('addon_type', 'extra_users')
          .eq('status', 'active');

        const extraUsers = (addonsData || []).reduce((sum, a) => sum + (a.quantity || 0), 0);
        setMaxUsers(planMaxUsers !== null ? planMaxUsers + extraUsers : null);
      }

      // Contar miembros activos
      const { data: membersData, error: membersError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (!membersError) {
        setCurrentMemberCount(membersData?.length || 0);
      }

      // Contar invitaciones pendientes
      const { data: pendingData, error: pendingError } = await supabase
        .from('invitations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('status', 'pending');

      if (!pendingError) {
        setPendingInvitationsCount(pendingData?.length || 0);
      }
    } catch (err) {
      console.error('Error fetching user limits:', err);
    }
  };

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
          expires_at: invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : t('noExpires'),
          status: invite.status,
          used: invite.status === 'used',
          revoked: invite.status === 'revoked'
        };
      });

      setInvitations(formattedInvitations);
    } catch (err: any) {
      console.error('Error fetching invitations:', err);
      setError(err.message || t('errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('id, name')
        .neq('id', 1) // Excluir Super Admin
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
        setError(t('requiredFields'));
        return;
      }

      // Validar límite de usuarios del plan
      if (maxUsers && (currentMemberCount + pendingInvitationsCount) >= maxUsers) {
        setError(t('userLimitReached', { max: maxUsers }));
        return;
      }
      
      // Check if email is already invited or is an existing user
      const { data: existingInvites } = await supabase
        .from('invitations')
        .select('id')
        .eq('email', email.toLowerCase())
        .eq('organization_id', orgId)
        .eq('status', 'pending');
      
      if (existingInvites && existingInvites.length > 0) {
        setError(t('alreadyInvited'));
        return;
      }

      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();
      
      if (existingUser) {
        setError(t('alreadyRegistered'));
        return;
      }
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      
      if (!currentUserId) {
        setError(t('noCurrentUser'));
        return;
      }

      // Get organization data for the invitation
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      if (orgError || !orgData) {
        setError(t('noOrgInfo'));
        return;
      }
      
      // Generate unique code
      const code = Math.random().toString(36).substring(2, 10);
      
      // Generate expiration date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Create invitation record in our custom table
      const { data: invite, error: inviteError } = await supabase
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
        .select()
        .single();
        
      if (inviteError) throw inviteError;

      // Send invitation email using Supabase's native invite flow (admin.inviteUserByEmail)
      // via API route, para que se use el template "Invite user" en el Dashboard
      const inviteUrl = `${window.location.origin}/auth/invite?invite_code=${code}`;
      
      try {
        const res = await fetch('/api/auth/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase(),
            organizationId: orgId,
            organizationName: orgData.name,
            roleId,
            invitationCode: code,
            invitedBy: currentUserId,
            origin: window.location.origin
          })
        });
        const result = await res.json();

        if (!res.ok || result.error) {
          console.warn('Error enviando invitación:', result.error);
          setSuccess(t('inviteCreatedManual', { email, url: inviteUrl }));
        } else {
          setSuccess(t('inviteSent', { email }));
          console.log('📧 Invitation email sent via Supabase Auth to:', email);
        }
      } catch (emailSendError: any) {
        console.warn('Error sending invitation email:', emailSendError);
        setSuccess(t('inviteCreatedManual', { email, url: inviteUrl }));
      }
      
      // Reset form
      setEmail('');
      setRoleId('');
      
      // Refresh invitations list y conteos de límite
      fetchInvitations();
      fetchUserLimits();
      
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setError(err.message || t('errorSending'));
    } finally {
      setSendingInvitation(false);
    }
  };

  // Revoke invitation
  const revokeInvitation = async (id: string) => {
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
      
      setSuccess(t('inviteRevoked'));
    } catch (err: any) {
      console.error('Error al revocar invitación:', err);
      setError(err.message || t('errorRevoking'));
    } finally {
      setLoading(false);
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
      
      // Fetch the updated invitation to get the code and org info
      const { data: inviteData } = await supabase
        .from('invitations')
        .select(`
          code,
          role_id,
          organization_id,
          organizations!inner(name)
        `)
        .eq('id', id)
        .single();

      if (!inviteData) {
        throw new Error(t('noInviteInfo'));
      }
      
      // Generate the invitation URL
      const inviteCode = inviteData.code;
      const inviteUrl = `${window.location.origin}/auth/invite?invite_code=${inviteCode}`;
      
      // Get organization name safely
      const orgName = Array.isArray(inviteData.organizations) 
        ? (inviteData.organizations[0] as any)?.name 
        : (inviteData.organizations as any)?.name || 'la organización';
      
      // Resend invitation email using la ruta nativa de invitación (Invite user template)
      try {
        const res = await fetch('/api/auth/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.toLowerCase(),
            organizationId: inviteData.organization_id,
            organizationName: orgName,
            roleId: inviteData.role_id,
            invitationCode: inviteCode,
            origin: window.location.origin,
            resend: true
          })
        });
        const result = await res.json();

        if (!res.ok || result.error) {
          console.warn('Error reenviando invitación:', result.error);
          setSuccess(t('inviteUpdatedUrl', { email, url: inviteUrl }));
        } else {
          setSuccess(t('inviteResent', { email }));
          console.log('📧 Invitation email resent via Supabase Auth to:', email);
        }
      } catch (emailSendError: any) {
        console.warn('Error reenviando invitación:', emailSendError);
        setSuccess(t('inviteUpdatedUrl', { email, url: inviteUrl }));
      }
      
      // Refresh the invitations list
      await fetchInvitations();
    } catch (err: any) {
      console.error('Error al reenviar invitación:', err);
      setError(err.message || t('errorResending'));
    } finally {
      setLoading(false);
    }
  };
  const getStatusBadge = (invitation: InvitationProps) => {
    if (invitation.status === 'revoked' || invitation.revoked) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          {t('statusRevoked')}
        </span>
      );
    } else if (invitation.status === 'used' || invitation.used) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          {t('statusAccepted')}
        </span>
      );
    } else if (new Date(invitation.expires_at || '') < new Date()) {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
          {t('statusExpired')}
        </span>
      );
    } else {
      return (
        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {t('statusPending')}
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
      <div className="mb-6 bg-white dark:bg-gray-900 dark:border-gray-800 border rounded-lg shadow-sm overflow-hidden">
        {/* Encabezado de filtros */}
        <div className="bg-gradient-to-r from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-900 p-4 border-b dark:border-gray-800 flex justify-between items-center">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 dark:text-blue-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            <h3 className="font-medium text-gray-700 dark:text-gray-200">{t('filterInvitations')}</h3>
            {activeFiltersCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">
                {activeFiltersCount} {activeFiltersCount === 1 ? t('activeFilter') : t('activeFilters')}
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
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center border border-blue-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              {t('clearAll')}
            </button>
          )}
        </div>
        
        {/* Contenido de filtros */}
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Filtro por email */}
            <div className="relative">
              <label htmlFor="email-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('emailLabel')}</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  id="email-filter"
                  type="text"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                {emailFilter && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <button 
                      onClick={() => setEmailFilter('')}
                      className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 focus:outline-none"
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
              <label htmlFor="role-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('roleLabel')}</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <select
                  id="role-filter"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">{t('allRoles')}</option>
                  {uniqueRoles.map((role: string) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Filtro por estado */}
            <div>
              <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('statusLabel')}</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="all">{t('allStatuses')}</option>
                  <option value="pending">{t('pendingStatus')}</option>
                  <option value="used">{t('acceptedStatus')}</option>
                  <option value="revoked">{t('revokedStatus')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  if (loading && invitations.length === 0) {
    return <InvitationsSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Sección de filtros */}
      {renderFilters()}
      
      <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow overflow-hidden sm:rounded-lg">

        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{t('sendNewTitle')}</h3>

          {/* Banner de límite de usuarios */}
          {maxUsers && (
            <div className={`mt-3 p-3 rounded-md border ${
              (currentMemberCount + pendingInvitationsCount) >= maxUsers
                ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
            }`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${
                  (currentMemberCount + pendingInvitationsCount) >= maxUsers
                    ? 'text-red-800 dark:text-red-400'
                    : 'text-blue-800 dark:text-blue-400'
                }`}>
                  {t('usersCount', { current: currentMemberCount, max: maxUsers })}
                  {pendingInvitationsCount > 0 && (
                    <span className="font-normal text-xs ml-1">
                      {t('pendingInvitations', { count: pendingInvitationsCount })}
                    </span>
                  )}
                </p>
                {(currentMemberCount + pendingInvitationsCount) >= maxUsers && (
                  <a
                    href="/app/organizacion/plan"
                    className="text-xs font-medium text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 underline"
                  >
                    {t('upgradePlan')}
                  </a>
                )}
              </div>
              {(currentMemberCount + pendingInvitationsCount) >= maxUsers && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {t('userLimitMessage')}
                </p>
              )}
            </div>
          )}
          
          {error && (
            <div className="mt-2 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500 dark:text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              </div>
            </div>
          )}
          
          {success && (
            <div className="mt-2 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-500 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
                </div>
              </div>
            </div>
          )}
          
          <EmailConfirmedWarning message="Debes confirmar tu correo electrónico para invitar nuevos usuarios." />
          <form onSubmit={handleSendInvitation} className="space-y-4 mt-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('emailField')}
              </label>
              <input
                type="email"
                name="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!(maxUsers && (currentMemberCount + pendingInvitationsCount) >= maxUsers)}
                className="mt-1 block w-full border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                placeholder={t('emailFieldPlaceholder')}
                required
              />
            </div>
            
            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('roleField')}
              </label>
              <select
                id="role"
                name="role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={!!(maxUsers && (currentMemberCount + pendingInvitationsCount) >= maxUsers)}
                className="mt-1 block w-full bg-white dark:bg-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                required
              >
                <option value="" disabled>{t('selectRole')}</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {roleDisplayMap[role.code] || role.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="pt-2">
              <EmailConfirmedGate>
                <button
                  type="submit"
                  disabled={sendingInvitation || !!(maxUsers && (currentMemberCount + pendingInvitationsCount) >= maxUsers)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingInvitation ? t('sending') : t('sendInvitation')}
                </button>
              </EmailConfirmedGate>
            </div>
          </form>
        </div>
      </div>
      
      {/* Invitations List */}
      <div className="bg-white dark:bg-gray-900 dark:border dark:border-gray-800 shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">
              {t('invitationsTitle')}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              {t('invitationsDesc')}
              {invitations.length > 0 && filteredInvitations.length !== invitations.length && 
                ` (${filteredInvitations.length} de ${invitations.length})`}
            </p>
          </div>
          
          {/* Botón para alternar filtros */}
          <button 
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {showFilters ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                {t('hideFilters')}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {t('showFilters')}
              </>
            )}
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thEmail')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thRole')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thStatus')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thSentDate')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thExpirationDate')}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('thActions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredInvitations.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-sm font-medium text-gray-500 dark:text-gray-400"
                  >
                    {invitations.length === 0 ? 
                      t('noInvitations') : 
                      t('noResults')}
                  </td>
                </tr>
              ) : (
                filteredInvitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invitation.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invitation.role_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(invitation)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invitation.created_at}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {invitation.expires_at}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {!invitation.used && !invitation.revoked && (
                        <>
                          <button
                            onClick={() => resendInvitation(invitation.id, invitation.email)}
                            className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                          >
                            {t('resend')}
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                              >
                                {t('revoke')}
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-white dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100">
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('confirmRevoke')}</AlertDialogTitle>
                                <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
                                  {t('revokeDescription', { email: invitation.email })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="dark:bg-gray-800 dark:hover:bg-gray-700">
                                  {t('cancel')}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revokeInvitation(invitation.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  {t('revoke')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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

      {/* AlertDialog de confirmación de revocación */}
    </div>
  );
}
