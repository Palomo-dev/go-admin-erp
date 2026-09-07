import React, { useEffect, useRef, useState } from 'react';
import { Branch, BranchFormData, OpeningHours, DayHours, BRANCH_TYPES } from '@/types/branch';
import { branchService } from '@/lib/services/branchService';
import { supabase } from '@/lib/supabase/config';
import { BranchForm, BranchFormRef } from '@/components/branches/BranchForm';
import { AssignManagerModal } from '@/components/branches/AssignManagerModal';
import AssignMembersModal from '@/components/branches/AssignMembersModal';
import BranchesMap from '@/components/maps/BranchesMap';
import BranchMapModal from '@/components/maps/BranchMapModal';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';
import { BranchesSkeleton } from './OrganizationSkeletons';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { BRANCHES_UPDATED_EVENT } from '@/lib/context/BranchContext';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Cargar el mapa dinámicamente para evitar problemas de SSR
const DynamicBranchesMap = dynamic(() => import('@/components/maps/BranchesMap'), {
  ssr: false,
  loading: () => (
    <Skeleton className="h-64 w-full rounded-lg" />
  )
});

const DynamicBranchMapModal = dynamic(() => import('@/components/maps/BranchMapModal'), {
  ssr: false
});

interface BranchAssignment {
  branch_id: number;
  branch_name?: string;
  role_id?: number;
}

interface BranchesTabProps {
  orgId: number;
  userBranches?: BranchAssignment[];
}

// Helper function to format opening hours for display
const formatOpeningHours = (openingHours?: OpeningHours): string => {
  if (!openingHours) return 'Sin horarios';

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const dayNames = {
    monday: 'Lun',
    tuesday: 'Mar',
    wednesday: 'Mié',
    thursday: 'Jue',
    friday: 'Vie',
    saturday: 'Sáb',
    sunday: 'Dom'
  };

  // Helper function to check if a day is closed
  const isDayClosed = (dayHours: any): boolean => {
    if (!dayHours) return true;
    // Handle both formats: with 'closed' field and without
    if (typeof dayHours.closed === 'boolean') {
      return dayHours.closed;
    }
    // If no 'closed' field, check if open and close times exist
    return !dayHours.open || !dayHours.close;
  };

  // Find common patterns to create a summary
  const weekdays = days.slice(0, 5); // Monday to Friday
  
  // Check if all weekdays have the same hours
  const weekdayHours = weekdays.map(day => {
    const dayHours = openingHours[day as keyof OpeningHours];
    if (isDayClosed(dayHours) || !dayHours) return null;
    return `${dayHours.open}-${dayHours.close}`;
  }).filter(Boolean);

  // If all weekdays are the same, show a summary
  if (weekdayHours.length > 0 && weekdayHours.every(h => h === weekdayHours[0])) {
    const weekdaySchedule = `Lun-Vie: ${weekdayHours[0]}`;
    
    // Check weekend
    const satHours = openingHours.saturday;
    const sunHours = openingHours.sunday;
    
    if (!isDayClosed(satHours) && !isDayClosed(sunHours) && 
        satHours && sunHours &&
        `${satHours.open}-${satHours.close}` === `${sunHours.open}-${sunHours.close}`) {
      return `${weekdaySchedule}, Sáb-Dom: ${satHours.open}-${satHours.close}`;
    } else if (!isDayClosed(satHours) && satHours) {
      return `${weekdaySchedule}, Sáb: ${satHours.open}-${satHours.close}`;
    } else {
      return weekdaySchedule;
    }
  }

  // Otherwise show individual days that are open
  const openDays = days
    .map(day => {
      const dayHours = openingHours[day as keyof OpeningHours];
      if (isDayClosed(dayHours) || !dayHours) return null;
      return `${dayNames[day as keyof typeof dayNames]}: ${dayHours.open}-${dayHours.close}`;
    })
    .filter(Boolean);

  if (openDays.length === 0) return 'Cerrado';
  if (openDays.length <= 2) return openDays.join(', ');
  return `${openDays.slice(0, 2).join(', ')}...`;
};

const BranchesTab: React.FC<BranchesTabProps> = ({ orgId, userBranches = [] }) => {
  const t = useTranslations('org.branchesTab');
  // Corrección QA R3 (Issue 3): ref al BranchForm para invocar submitForm()
  // desde el botón del footer. Con noFormWrapper=true el form se renderiza
  // como <div id="branch-form">, por lo que type="submit" form="branch-form"
  // no dispara el envío (un div no es un formulario asociable). Usamos el ref
  // expuesto vía useImperativeHandle para ejecutar handleSubmit con todas sus
  // validaciones de identidad web.
  const formRef = useRef<BranchFormRef>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showManagerModal, setShowManagerModal] = useState(false);
  const [selectedBranchForManager, setSelectedBranchForManager] = useState<Branch | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [selectedBranchForMap, setSelectedBranchForMap] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  const [maxBranches, setMaxBranches] = useState<number | null>(null);
  const [detailBranch, setDetailBranch] = useState<Branch | null>(null);
  const [branchMembers, setBranchMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [showAssignMembers, setShowAssignMembers] = useState(false);
  // Subdominio y dominio propio de la organización, para construir la URL
  // pública por path en la columna "Sitio Web".
  const [orgSubdomain, setOrgSubdomain] = useState<string>('');
  const [orgCustomDomain, setOrgCustomDomain] = useState<string>('');

  const fetchBranchLimit = async () => {
    try {
      const { data: planData, error: planError } = await supabase
        .rpc('get_current_plan', { org_id: orgId });

      if (!planError && planData && planData.length > 0) {
        const planMaxBranches = planData[0].max_branches || null;

        const { data: addonsData } = await supabase
          .from('subscription_addons')
          .select('quantity')
          .eq('organization_id', orgId)
          .eq('addon_type', 'extra_branches')
          .eq('status', 'active');

        const extraBranches = (addonsData || []).reduce((sum, a) => sum + (a.quantity || 0), 0);
        setMaxBranches(planMaxBranches !== null ? planMaxBranches + extraBranches : null);
      }
    } catch (err) {
      console.error('Error fetching branch limit:', err);
    }
  };

  const fetchBranches = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await branchService.getBranchesWithManagers(orgId);
      setBranches(data);
    } catch (err: any) {
      setError(err.message || t('errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchBranches();
      fetchBranchLimit();
      // Fetch org subdomain + custom_domain for URL preview por path
      supabase
        .from('organizations')
        .select('subdomain, custom_domain')
        .eq('id', orgId)
        .single()
        .then(({ data }) => {
          if (data?.subdomain) setOrgSubdomain(data.subdomain);
          if (data?.custom_domain) setOrgCustomDomain(data.custom_domain);
        });
    }
  }, [orgId]);

  const [autoBranchCode, setAutoBranchCode] = useState<string>('');
  const [branchToDelete, setBranchToDelete] = useState<number | null>(null);

  const handleCreate = async () => {
    if (maxBranches !== null && branches.length >= maxBranches) {
      setError(t('branchLimitReached', { max: maxBranches }));
      return;
    }
    setEditingBranch(null);
    setError(null);
    try {
      const code = await branchService.generateBranchCode(orgId);
      setAutoBranchCode(code);
    } catch {
      setAutoBranchCode(`SUC-${orgId}-001`);
    }
    setShowForm(true);
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setError(null);
    setShowForm(true);
  };

  const handleDelete = (branchId: number) => {
    setBranchToDelete(branchId);
  };

  const confirmDeleteBranch = async () => {
    if (branchToDelete === null) return;
    setFormLoading(true);
    try {
      await branchService.deleteBranch(branchToDelete);
      await fetchBranches();
      window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
    } catch (err: any) {
      setError(err.message || t('errorDeleting'));
    } finally {
      setFormLoading(false);
      setBranchToDelete(null);
    }
  };

  // F6 R4 (Issue 3) — Tipar formData como BranchFormData en vez de any.
  const handleFormSubmit = async (formData: BranchFormData) => {
    setFormLoading(true);
    setError(null);
    try {
      let savedBranch: Branch;
      let message: string;
      if (editingBranch) {
        // BranchFormData tiene opening_hours/features como string (JSON);
        // updateBranch los parsea internamente via normalizeOpeningHours.
        savedBranch = await branchService.updateBranch(
          editingBranch.id!,
          formData as Partial<Branch>,
          orgId,
        );
        message = t('branchUpdated');
      } else {
        savedBranch = await branchService.createBranch({
          ...formData,
          organization_id: orgId,
        } as Branch);
        message = t('branchCreated');

        // Asignar al usuario creador como miembro de la nueva sucursal
        if (savedBranch.id) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            const { data: member } = await supabase
              .from('organization_members')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('organization_id', orgId)
              .maybeSingle();

            if (member?.id) {
              // Verificar si ya existe para no violar el constraint UNIQUE
              const { data: existing } = await supabase
                .from('member_branches')
                .select('id')
                .eq('organization_member_id', member.id)
                .eq('branch_id', savedBranch.id)
                .maybeSingle();

              if (!existing) {
                await supabase
                  .from('member_branches')
                  .insert({
                    organization_member_id: member.id,
                    branch_id: savedBranch.id,
                  });
              }
            }
          }
        }
      }
      setSuccessMessage(message);

      // Si quedó publicado, enriquecer el mensaje con la URL pública
      if (savedBranch.is_web_published) {
        const publicUrl = savedBranch.custom_domain
          ? `https://${savedBranch.custom_domain}`
          : savedBranch.subdomain
            ? `https://${savedBranch.subdomain}.goadmin.io`
            : savedBranch.slug
              ? (orgCustomDomain
                  ? `https://${orgCustomDomain}/${savedBranch.slug}`
                  : orgSubdomain
                    ? `https://${orgSubdomain}.goadmin.io/${savedBranch.slug}`
                    : null)
              : null;
        if (publicUrl) {
          setSuccessMessage(`${message} — URL pública: ${publicUrl}`);
        } else if (savedBranch.slug) {
          setSuccessMessage(`${message} — Configura un dominio o subdominio de organización para tener URL pública.`);
        }
      }

      setShowForm(false);
      setEditingBranch(null);
      await fetchBranches();
      window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setError(err.message || t('errorSaving'));
    } finally {
      setFormLoading(false);
    }
  };

  // Toggle rápido de publicación web desde la tabla.
  // Usa setWebPublished (no updateBranch) para que se validen branch_type y
  // slug antes de activar is_web_published=true (reglas de F4/F6).
  const handleToggleWebPublished = async (branch: Branch) => {
    setFormLoading(true);
    setError(null);
    try {
      await branchService.setWebPublished(branch.id!, !branch.is_web_published, orgId);
      await fetchBranches();
      window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
    } catch (err: any) {
      setError(err.message || 'Error al cambiar publicación');
    } finally {
      setFormLoading(false);
    }
  };

  const handleAssignManager = (branch: Branch) => {
    setSelectedBranchForManager(branch);
    setShowManagerModal(true);
  };

  const handleViewDetail = async (branch: Branch) => {
    setDetailBranch(branch);
    setBranchMembers([]);
    setLoadingMembers(true);
    try {
      // Cargar miembros asignados a esta sucursal
      const { data, error } = await supabase
        .from('member_branches')
        .select(`
          organization_member_id,
          organization_members (
            id,
            user_id,
            is_super_admin,
            role_id,
            profiles ( first_name, last_name, email, avatar_url )
          )
        `)
        .eq('branch_id', branch.id);

      if (error) throw error;

      const members = (data || []).map((item: any) => ({
        member_id: item.organization_members?.id,
        user_id: item.organization_members?.user_id,
        full_name: `${item.organization_members?.profiles?.first_name || ''} ${item.organization_members?.profiles?.last_name || ''}`.trim() || 'Sin nombre',
        email: item.organization_members?.profiles?.email || 'Sin email',
        avatar_url: item.organization_members?.profiles?.avatar_url,
        is_super_admin: item.organization_members?.is_super_admin,
        role_id: item.organization_members?.role_id,
      }));

      setBranchMembers(members);
    } catch (err) {
      console.error('Error cargando miembros:', err);
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleManagerAssignmentSuccess = async (updatedBranch: Branch) => {
    // Recargar todas las sucursales para tener datos completos (nombre del gerente, etc.)
    await fetchBranches();
    window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
    setSuccessMessage(t('managerAssigned'));
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCloseManagerModal = () => {
    setShowManagerModal(false);
    setSelectedBranchForManager(null);
  };

  const handleShowMap = () => {
    setShowMapModal(true);
  };

  const handleCloseMapModal = () => {
    setShowMapModal(false);
    setSelectedBranchForMap(null);
  };

  const handleBranchSelectFromMap = (branch: Branch) => {
    setSelectedBranchForMap(branch.id!);
  };

  const handleBranchesUpdateFromMap = (updatedBranches: Branch[]) => {
    setBranches(updatedBranches);
    setSuccessMessage(t('coordsUpdated'));
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  return (
    <div className="w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100">{t('title')}</h2>
          <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{branches.length} {branches.length === 1 ? t('branchSingular') : t('branchPlural')} {t('registered')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Selector de vista */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1 dark:bg-gray-800">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50'
              }`}
            >
              <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
              </svg>
              {t('tableView')}
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === 'map'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-50'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50'
              }`}
            >
              <svg className="w-4 h-4 inline mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('mapView')}
            </button>
          </div>

          {/* Botón de mapa expandido */}
          <button
            onClick={handleShowMap}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors dark:text-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-900 dark:focus:ring-blue-400"
            title={t('fullMapTitle')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v4m0 0h-4" />
            </svg>
            {t('fullMap')}
          </button>

          {maxBranches && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              branches.length >= maxBranches
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-100'
            }`}>
              {branches.length}/{maxBranches}
            </span>
          )}

          <button
            className="flex items-center gap-2 px-5 py-2 text-base font-semibold rounded-lg shadow bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors dark:focus:ring-blue-500"
            onClick={handleCreate}
            aria-label={t('newBranchAria')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('newBranch')}
          </button>
        </div>
      </div>
      
      {successMessage && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-green-50 text-green-800 border border-green-200 shadow-sm flex items-center dark:bg-green-900/30 dark:text-green-100 dark:border-green-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}
      
      {userBranches && userBranches.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 dark:text-gray-50">{t('yourBranches')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {userBranches.map((branch) => (
              <div key={branch.branch_id} className="bg-white overflow-hidden shadow-sm rounded-lg border border-blue-100 dark:bg-gray-800 dark:border-blue-800">
                <div className="px-4 py-4 flex items-center">
                  <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-700 font-bold dark:bg-blue-800/30 dark:text-blue-200">
                    {branch.branch_name ? branch.branch_name.substring(0, 2).toUpperCase() : 'BR'}
                  </div>
                  <div className="ml-4">
                    <div className="font-medium text-gray-900 dark:text-gray-50">
                      {branch.branch_name || `${t('branchFallback')} #${branch.branch_id}`}
                    </div>
                    <div className="text-sm text-blue-600 dark:text-blue-300">
                      {t('assignedMember')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Vista condicional: Tabla o Mapa */}
      {viewMode === 'map' ? (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden dark:bg-gray-800">
          {loading ? (
            <div className="p-4 sm:p-6">
              <BranchesSkeleton />
            </div>
          ) : error ? (
            <div className="p-4 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4 dark:bg-red-800/30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-500 font-medium dark:text-red-400">{error}</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="p-4 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4 dark:bg-blue-800/30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium mb-2 dark:text-gray-300">{t('noBranches')}</p>
              <p className="text-gray-500 text-sm dark:text-gray-400">{t('noBranchesHint')}</p>
            </div>
          ) : (
            <div className="p-4">
              <DynamicBranchesMap
                branches={branches}
                selectedBranchId={selectedBranchForMap}
                onBranchSelect={handleBranchSelectFromMap}
                height="500px"
                className="w-full"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden dark:bg-gray-800">
          {loading ? (
            <div className="p-4 sm:p-6">
              <BranchesSkeleton />
            </div>
          ) : error ? (
            <div className="p-4 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4 dark:bg-red-800/30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-red-500 font-medium dark:text-red-400">{error}</p>
            </div>
          ) : branches.length === 0 ? (
            <div className="p-4 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4 dark:bg-blue-800/30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium mb-2 dark:text-gray-300">{t('noBranches')}</p>
              <p className="text-gray-500 text-sm dark:text-gray-400">{t('noBranchesHint')}</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] table-auto">
              <thead className="bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thBranch')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thLocation')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thContact')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thManager')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thSchedule')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thStatus')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Sitio Web</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">{t('thAssignment')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider">{t('thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:bg-gray-800">
                {branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-gray-50 transition-colors dark:hover:bg-gray-900">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-md bg-blue-100 flex items-center justify-center text-blue-700 font-bold dark:bg-blue-800/30 dark:text-blue-200">
                          {branch.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="font-medium text-gray-900 flex items-center dark:text-gray-50">
                            {branch.name}
                            {branch.is_main && (
                              <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-100">
                                {t('main')}
                              </span>
                            )}
                            {branch.is_web_stock_source && (
                              <span
                                className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-100"
                                title="El sitio web usa el inventario de esta sucursal"
                              >
                                Web
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{branch.branch_code || t('noCode')}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium">{branch.city || 'N/A'}</div>
                        <div className="text-gray-500 min-w-0 break-words max-w-[200px] dark:text-gray-400">{branch.address || t('noAddress')}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium">{branch.phone || 'N/A'}</div>
                        <div className="text-gray-500 dark:text-gray-400">{branch.email || t('noEmail')}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {(branch as any).manager ? (
                          <div className="flex items-center">
                            {(branch as any).manager.avatar_url && getAvatarUrl((branch as any).manager.avatar_url) ? (
                              <img
                                className="flex-shrink-0 h-8 w-8 rounded-full"
                                src={getAvatarUrl((branch as any).manager.avatar_url)}
                                alt=""
                              />
                            ) : (
                              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center dark:bg-gray-700">
                                <svg className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                            <div className="ml-3">
                              <div className="font-medium text-gray-900 dark:text-gray-50">
                                {(branch as any).manager.first_name} {(branch as any).manager.last_name}
                              </div>
                              <div className="text-gray-500 text-xs dark:text-gray-400">
                                {t('assignedManager')}
                              </div>
                            </div>
                          </div>
                        ) : branch.manager_id ? (
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-800/30">
                              <svg className="h-4 w-4 text-blue-600 dark:text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <div className="font-medium text-gray-900 dark:text-gray-50">
                                {t('assignedManager')}
                              </div>
                              <button
                                onClick={() => handleAssignManager(branch)}
                                className="text-xs text-blue-600 hover:text-blue-800 transition-colors dark:text-blue-300 dark:hover:text-blue-100"
                              >
                                {t('assignManager')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center text-gray-400 dark:text-gray-500">
                            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center dark:bg-gray-800">
                              <svg className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {t('noManager')}
                              </div>
                              <button
                                onClick={() => handleAssignManager(branch)}
                                className="text-xs text-blue-600 hover:text-blue-800 transition-colors dark:text-blue-300 dark:hover:text-blue-100"
                              >
                                {t('assignManager')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        <div className="font-medium text-gray-900 dark:text-gray-50">
                          {formatOpeningHours(branch.opening_hours)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                          {branch.opening_hours ? (
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {t('scheduleDefined')}
                            </div>
                          ) : (
                            <div className="flex items-center">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              {t('noSchedule')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {branch.is_active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100">
                          <svg className="mr-1.5 h-2 w-2 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          {t('active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100">
                          <svg className="mr-1.5 h-2 w-2 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          {t('inactive')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {branch.is_web_published ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100">
                              <svg className="mr-1.5 h-2 w-2 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 8 8">
                                <circle cx="4" cy="4" r="3" />
                              </svg>
                              Publicado
                            </span>
                            <div className="text-xs text-gray-500 dark:text-gray-400 break-all">
                              {branch.custom_domain
                                ? `https://${branch.custom_domain}`
                                : branch.subdomain
                                  ? `https://${branch.subdomain}.goadmin.io`
                                  : branch.slug
                                    ? (orgCustomDomain
                                        ? `https://${orgCustomDomain}/${branch.slug}`
                                        : orgSubdomain
                                          ? `https://${orgSubdomain}.goadmin.io/${branch.slug}`
                                          : 'Configura un dominio o subdominio de organización')
                                    : 'Sin URL'}
                            </div>
                            {/* Botón Ver sitio — solo si hay URL pública real */}
                            {(branch.custom_domain || branch.subdomain || (branch.slug && (orgCustomDomain || orgSubdomain))) && (
                              <a
                                href={
                                  branch.custom_domain
                                    ? `https://${branch.custom_domain}`
                                    : branch.subdomain
                                      ? `https://${branch.subdomain}.goadmin.io`
                                      : orgCustomDomain
                                        ? `https://${orgCustomDomain}/${branch.slug}`
                                        : `https://${orgSubdomain}.goadmin.io/${branch.slug}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                              >
                                <svg className="h-3 w-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Ver sitio
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                            No publicado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {userBranches?.some(ub => ub.branch_id === branch.id) || branch.manager_id ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-100">
                          <svg className="mr-1.5 h-2 w-2 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 8 8">
                            <circle cx="4" cy="4" r="3" />
                          </svg>
                          {t('assigned')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {t('notAssigned')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        {/* Toggle publicación web */}
                        <button
                          className={`inline-flex items-center px-2.5 py-1.5 border text-xs font-medium rounded focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors ${
                            branch.is_web_published
                              ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-600 dark:text-green-200 dark:bg-green-900/30'
                              : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900'
                          }`}
                          onClick={() => handleToggleWebPublished(branch)}
                          disabled={formLoading}
                          title={branch.is_web_published ? 'Despublicar sitio' : 'Publicar sitio'}
                        >
                          <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                          </svg>
                          {branch.is_web_published ? 'Despublicar' : 'Publicar'}
                        </button>
                        <button 
                          className="inline-flex items-center px-2.5 py-1.5 border border-blue-300 text-xs font-medium rounded text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:border-blue-600 dark:text-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/30 dark:focus:ring-blue-400"
                          onClick={() => handleAssignManager(branch)}
                          title={(branch as any).manager ? t('changeManager') : t('assignManager')}
                        >
                          <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                          {(branch as any).manager ? t('change') : t('assign')}
                        </button>
                        <button
                          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900 dark:focus:ring-blue-400"
                          onClick={() => handleViewDetail(branch)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Ver
                        </button>
                        <button
                          className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900 dark:focus:ring-blue-400"
                          onClick={() => handleEdit(branch)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          {t('edit')}
                        </button>
                        <button 
                          className="inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:text-red-200 dark:bg-red-800/30 dark:hover:bg-red-700/30 dark:focus:ring-red-400"
                          onClick={() => handleDelete(branch.id!)}
                          disabled={formLoading}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          {t('delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
      {/* Modal for create/edit form */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50">
                    {editingBranch ? t('editBranch') : t('newBranch')}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                    {editingBranch ? t('editBranchDesc') : t('newBranchDesc')}
                  </p>
                </div>
                <button 
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-800" 
                  onClick={() => setShowForm(false)}
                  disabled={formLoading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Error Message */}
              {error && (
                <div className="mx-4 sm:mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-700">
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400 mr-2 dark:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm text-red-800 dark:text-red-100">{error}</p>
                  </div>
                </div>
              )}
              
              {/* Form Content */}
              <div className="overflow-y-auto max-h-[calc(90vh-80px)] pb-24">
                <BranchForm
                  ref={formRef}
                  initialData={editingBranch ? editingBranch : { organization_id: orgId, branch_code: autoBranchCode }}
                  onSubmit={handleFormSubmit}
                  isLoading={formLoading}
                  submitLabel={editingBranch ? t('updateBranch') : t('createBranch')}
                  noFormWrapper={true}
                />
              </div>
              
              {/* Footer with actions */}
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 dark:bg-gray-800 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors dark:text-gray-200 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-900 dark:focus:ring-blue-400"
                  disabled={formLoading}
                >
                  {t('cancel')}
                </button>
                <div className="flex items-center gap-3">
                  {formLoading && (
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span className="loading loading-spinner loading-sm mr-2"></span>
                      {t('saving')}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => formRef.current?.submitForm()}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:focus:ring-blue-400"
                    disabled={formLoading}
                  >
                    {editingBranch ? t('updateBranch') : t('createBranch')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal for manager assignment */}
      {selectedBranchForManager && (
        <AssignManagerModal
          branch={selectedBranchForManager}
          organizationId={orgId}
          isOpen={showManagerModal}
          onClose={handleCloseManagerModal}
          onSuccess={handleManagerAssignmentSuccess}
        />
      )}
      
      {/* Modal for map view */}
      <DynamicBranchMapModal
        isOpen={showMapModal}
        branches={branches}
        selectedBranchId={selectedBranchForMap}
        onClose={handleCloseMapModal}
        onBranchSelect={handleBranchSelectFromMap}
        onBranchesUpdate={handleBranchesUpdateFromMap}
      />

      {/* Confirmación de eliminación (reemplaza window.confirm nativo) */}
      <ConfirmDialog
        open={branchToDelete !== null}
        onOpenChange={(open) => !open && setBranchToDelete(null)}
        title={t('confirmDelete')}
        description={t('errorDeleting')}
        confirmLabel={t('confirmDelete')}
        cancelLabel={t('cancel')}
        variant="destructive"
        loading={formLoading}
        onConfirm={confirmDeleteBranch}
      />

      {/* Diálogo de detalle de sucursal */}
      {detailBranch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
          <div className="min-h-screen px-2 sm:px-4 py-4 sm:py-8 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden relative dark:bg-gray-800">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50 truncate">
                    {detailBranch.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">
                    {detailBranch.branch_code}
                  </p>
                </div>
                <button
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700 flex-shrink-0"
                  onClick={() => setDetailBranch(null)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Contenido */}
              <div className="overflow-y-auto max-h-[calc(95vh-80px)] p-4 sm:p-6 space-y-6">
                {/* Badges de estado */}
                <div className="flex flex-wrap gap-2">
                  {detailBranch.is_main && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-100">
                      Principal
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    detailBranch.is_active
                      ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-100'
                  }`}>
                    {detailBranch.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                  {detailBranch.is_web_published && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-100">
                      Web
                    </span>
                  )}
                  {detailBranch.is_web_stock_source && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-800/30 dark:text-indigo-100" title="El sitio web usa el inventario de esta sucursal">
                      Fuente Web
                    </span>
                  )}
                </div>

                {/* === Información general === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    Información general
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Nombre</p>
                      <p className="text-gray-900 dark:text-gray-100">{detailBranch.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Código de sucursal</p>
                      <p className="text-gray-900 dark:text-gray-100">{detailBranch.branch_code}</p>
                    </div>
                    {detailBranch.tax_identification && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">NIT / Identificación fiscal</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.tax_identification}</p>
                      </div>
                    )}
                    {detailBranch.branch_type && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de negocio</p>
                        <p className="text-gray-900 dark:text-gray-100">
                          {BRANCH_TYPES.find(bt => bt.value === detailBranch.branch_type)?.label || detailBranch.branch_type}
                        </p>
                      </div>
                    )}
                    {detailBranch.zone && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Zona</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.zone}</p>
                      </div>
                    )}
                    {detailBranch.capacity != null && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Capacidad</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.capacity}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* === Ubicación === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Ubicación
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {detailBranch.address && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Dirección</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.address}</p>
                      </div>
                    )}
                    {detailBranch.city && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Ciudad</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.city}</p>
                      </div>
                    )}
                    {detailBranch.state && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Departamento / Estado</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.state}</p>
                      </div>
                    )}
                    {detailBranch.country && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">País</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.country}</p>
                      </div>
                    )}
                    {detailBranch.postal_code && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Código postal</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.postal_code}</p>
                      </div>
                    )}
                    {detailBranch.latitude && detailBranch.longitude && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Coordenadas</p>
                        <p className="text-gray-900 dark:text-gray-100 font-mono text-xs">
                          {parseFloat(detailBranch.latitude.toString()).toFixed(6)}, {parseFloat(detailBranch.longitude.toString()).toFixed(6)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* === Contacto === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Contacto
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {detailBranch.phone && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Teléfono</p>
                        <p className="text-gray-900 dark:text-gray-100">{detailBranch.phone}</p>
                      </div>
                    )}
                    {detailBranch.email && (
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                        <p className="text-gray-900 dark:text-gray-100 break-words">{detailBranch.email}</p>
                      </div>
                    )}
                    {!detailBranch.phone && !detailBranch.email && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Sin información de contacto</p>
                    )}
                  </div>
                </div>

                {/* === Horarios === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Horarios
                  </h3>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {formatOpeningHours(detailBranch.opening_hours)}
                  </p>
                </div>

                {/* === Identidad Web === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                    Identidad Web
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {/* Tipo de negocio */}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de negocio</p>
                      <p className="text-gray-900 dark:text-gray-100">
                        {detailBranch.branch_type
                          ? (BRANCH_TYPES.find(bt => bt.value === detailBranch.branch_type)?.label || detailBranch.branch_type)
                          : 'Sin especificar'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Determina las secciones del editor de branding.</p>
                    </div>

                    {/* Estado de publicación */}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Sitio web publicado</p>
                      {detailBranch.is_web_published ? (
                        <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-300">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Sí, sitio público activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1-4a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                          No publicado
                        </span>
                      )}
                    </div>

                    {/* Slug */}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Slug (URL path)</p>
                      <p className="text-gray-900 dark:text-gray-100 font-mono text-xs">{detailBranch.slug || '—'}</p>
                      {detailBranch.slug && <p className="text-xs text-gray-400 mt-0.5">Único por organización.</p>}
                    </div>

                    {/* Subdominio */}
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Subdominio</p>
                      <p className="text-gray-900 dark:text-gray-100 font-mono text-xs">
                        {detailBranch.subdomain ? `${detailBranch.subdomain}.goadmin.io` : '—'}
                      </p>
                      {detailBranch.subdomain && <p className="text-xs text-gray-400 mt-0.5">Único global.</p>}
                    </div>

                    {/* Dominio personalizado */}
                    <div className="sm:col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Dominio personalizado</p>
                      {detailBranch.custom_domain ? (
                        <p className="text-gray-900 dark:text-gray-100 font-mono text-xs">{detailBranch.custom_domain}</p>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400 text-xs">Sin dominio propio configurado</p>
                      )}
                      {detailBranch.custom_domain && <p className="text-xs text-gray-400 mt-0.5">Requiere configurar DNS (registro A/CNAME).</p>}
                    </div>

                    {/* URL pública construida */}
                    {detailBranch.is_web_published && (() => {
                      const publicUrl = detailBranch.custom_domain
                        ? `https://${detailBranch.custom_domain}`
                        : detailBranch.subdomain
                          ? `https://${detailBranch.subdomain}.goadmin.io`
                          : detailBranch.slug
                            ? (orgCustomDomain
                                ? `https://${orgCustomDomain}/${detailBranch.slug}`
                                : orgSubdomain
                                  ? `https://${orgSubdomain}.goadmin.io/${detailBranch.slug}`
                                  : null)
                            : null;
                      return publicUrl ? (
                        <div className="sm:col-span-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400">URL pública</p>
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs break-all inline-flex items-center gap-1"
                          >
                            {publicUrl}
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        </div>
                      ) : null;
                    })()}

                    {/* Logo web */}
                    {detailBranch.website_logo_url && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Logo web</p>
                        <img src={detailBranch.website_logo_url} alt="Logo" className="mt-1 h-12 w-auto rounded" />
                      </div>
                    )}

                    {/* Cover web */}
                    {detailBranch.website_cover_url && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">Imagen de portada</p>
                        <img src={detailBranch.website_cover_url} alt="Cover" className="mt-1 h-24 w-full object-cover rounded" />
                      </div>
                    )}

                    {!detailBranch.slug && !detailBranch.subdomain && !detailBranch.custom_domain && !detailBranch.branch_type && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 sm:col-span-2">Sin identidad web configurada</p>
                    )}
                  </div>
                </div>

                {/* === Gerente === */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Gerente
                  </h3>
                  {(detailBranch as any).manager ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center dark:bg-gray-700">
                        {(detailBranch as any).manager?.avatar_url ? (
                          <img
                            src={getAvatarUrl((detailBranch as any).manager.avatar_url) || ''}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <svg className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {`${(detailBranch as any).manager?.first_name || ''} ${(detailBranch as any).manager?.last_name || ''}`.trim() || 'Sin nombre'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(detailBranch as any).manager?.email}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Sin gerente asignado</p>
                  )}
                </div>

                {/* === Miembros asignados === */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                      Miembros asignados ({branchMembers.length})
                    </h3>
                    <button
                      onClick={() => setShowAssignMembers(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100 dark:text-blue-200 dark:bg-blue-900/30 dark:border-blue-600 dark:hover:bg-blue-800/30"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                      Asignar miembros
                    </button>
                  </div>
                  {loadingMembers ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      Cargando miembros...
                    </div>
                  ) : branchMembers.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No hay miembros asignados a esta sucursal</p>
                  ) : (
                    <div className="space-y-2">
                      {branchMembers.map((member) => (
                        <div
                          key={member.member_id}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg dark:border-gray-700"
                        >
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center dark:bg-blue-800/30">
                            {member.avatar_url ? (
                              <img
                                src={getAvatarUrl(member.avatar_url) || ''}
                                alt=""
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-blue-700 dark:text-blue-200">
                                {member.full_name.substring(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                              {member.full_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {member.email}
                            </p>
                          </div>
                          {member.is_super_admin && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-800/30 dark:text-purple-100">
                              Admin
                            </span>
                          )}
                          {detailBranch.manager_id === member.user_id && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-800/30 dark:text-blue-100">
                              Gerente
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para asignar miembros a la sucursal desde el detalle */}
      {detailBranch && (
        <AssignMembersModal
          isOpen={showAssignMembers}
          onClose={() => setShowAssignMembers(false)}
          branchId={detailBranch.id!}
          branchName={detailBranch.name}
          organizationId={orgId}
          onSuccess={async () => {
            // Recargar miembros y refrescar la tabla
            await handleViewDetail(detailBranch);
            await fetchBranches();
            window.dispatchEvent(new CustomEvent(BRANCHES_UPDATED_EVENT));
          }}
        />
      )}
    </div>
  );
};

export default BranchesTab;
