'use client';

import { useState, useEffect, ReactElement, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import ChangePlanModal from './ChangePlanModal';

type ProfileData = {
  organization_id: number | null;
  role_id: number | null;
};

type SupabaseOrganization = {
  id: number;
  name: string;
  type_id: number;
  organization_types?: {
    name: string;
  };
  plan_id?: {
    id: number;
    name: string;
  };
  status?: string;
};

interface Organization {
  id: number;
  name: string;
  type_id: { name: string };
  role_id?: number;
  is_current?: boolean;
  plan_name: string;
  status: string;
}

interface OrganizationListProps {
  showActions?: boolean;
  onDelete?: (orgId: number) => void;
  filterActive?: boolean; // Si es true, solo muestra organizaciones activas
  showFilters?: boolean; // Si es true, muestra la barra de filtros
}

export default function OrganizationList({ showActions = false, onDelete, filterActive = false, showFilters = false }: OrganizationListProps): ReactElement {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [changePlanModalOpen, setChangePlanModalOpen] = useState(false);
  const [selectedOrgForPlan, setSelectedOrgForPlan] = useState<{id: number, name: string, currentPlanId: string} | null>(null);
  
  // Estados para filtros
  const [nameFilter, setNameFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all', 'active', 'inactive'
  
  // Tipos únicos y planes basados en las organizaciones cargadas
  const uniqueTypes = useMemo(() => {
    const types = Array.from(new Set(organizations.map(org => org.type_id.name)));
    return types.sort();
  }, [organizations]);
  
  const uniquePlans = useMemo(() => {
    const plans = Array.from(new Set(organizations.map(org => org.plan_name)));
    return plans.sort();
  }, [organizations]);
  
  // Organizaciones filtradas
  const filteredOrganizations = useMemo(() => {
    return organizations.filter(org => {
      // Filtrar por nombre
      const nameMatches = !nameFilter || org.name.toLowerCase().includes(nameFilter.toLowerCase());
      
      // Filtrar por tipo
      const typeMatches = !typeFilter || org.type_id.name === typeFilter;
      
      // Filtrar por plan
      const planMatches = !planFilter || org.plan_name === planFilter;
      
      // Filtrar por estado
      const statusMatches = statusFilter === 'all' || org.status === statusFilter;
      
      return nameMatches && typeMatches && planMatches && statusMatches;
    });
  }, [organizations, nameFilter, typeFilter, planFilter, statusFilter]);

  useEffect(() => {
    fetchUserOrganizations();
  }, []);

  const fetchUserOrganizations = async () => {
    try {
      setLoading(true);
      
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');
    
      // Get user's profile to know their current organization
      const { data: profileData, error: profileError } = await supabase
        .from('organization_members')
        .select('organization_id, role_id')
        .eq('user_id', session.user.id)
        .eq('organization_id', localStorage.getItem('currentOrganizationId'))
        .single();
    
      if (profileError) throw profileError;
      
      const profile = profileData || { organization_id: null, role_id: null };

      // Get organizations where user is owner
      let query = supabase
        .from('organizations')
        .select(`
          id,
          name,
          type_id,
          organization_types!fk_organizations_organization_type(name),
          plans!organizations_plan_id_fkey(id, name),
          status
        `)
        .eq('owner_user_id', session.user.id);
        
      // Si filterActive es true, solo mostrar organizaciones activas
      if (filterActive) {
        query = query.eq('status', 'active');
      }
      
      const { data: ownedOrgs, error: ownedError } = await query;

      if (ownedError) throw ownedError;

      // Transform organizations data
      const orgs = (ownedOrgs || []).map(org => {
        // Safely extract organization type name
        const typeName = org.organization_types && typeof org.organization_types === 'object' && 'name' in org.organization_types
          ? String(org.organization_types.name) || 'Unknown'
          : 'Unknown';
        
        // Safely extract plan name
        let planName = 'Free';
        if (org.plan_id && typeof org.plan_id === 'object' && 'name' in org.plan_id) {
          planName = String(org.plan_id.name) || 'Free';
        }
        
        return {
          id: org.id,
          name: org.name,
          type_id: { name: typeName },
          role_id: profile.role_id || 2, // Default to owner/admin role if not found
          is_current: org.id === profile.organization_id,
          plan_name: planName,
          status: typeof org.status === 'string' ? org.status : 'inactive'
        };
      });
    
      setOrganizations(orgs);
    } catch (err: any) {
      console.error('Error fetching organizations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const handleToggleStatus = async (orgId: number, currentStatus: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar que el click llegue al elemento padre
    
    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      console.log('User ID:', session.user.id);
      console.log('Org ID:', orgId);
      console.log('Org ID:', orgId, typeof orgId);

      // Actualizar el estado de la organización
      const { data, error } = await supabase
        .from('organizations')
        .update({ status: newStatus })
        .eq('id', orgId);

        console.log('Update result:', data);
        console.log('Error:', error);

      if (error) throw error;
            
      // Actualizar la organización localmente para mostrar el cambio sin recargar
      setOrganizations(prevOrgs => 
        prevOrgs.map(org => 
          org.id === orgId ? { ...org, status: newStatus } : org
        )
      );
      
    } catch (err: any) {
      console.error('Error al cambiar estado de organización:', err);
      setError(err.message);
    }
  };
  
  const handleSelectOrganization = async (orgId: number) => {
    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No se encontró sesión de usuario');

      // Update user's organization
      const { error } = await supabase
        .from('profiles')
        .update({ last_org_id: orgId })
        .eq('id', session.user.id);

      if (error) throw error;

      // Reload page to reflect changes
      window.location.reload();
    } catch (err: any) {
      console.error('Error selecting organization:', err);
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  // Componente para renderizar la barra de filtros
  const renderFilters = () => {
    if (!showFilters) return null;
    
    // Calcular conteo de filtros activos
    const activeFiltersCount = [
      nameFilter !== '',
      typeFilter !== '',
      planFilter !== '',
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
            <h3 className="font-medium text-gray-700">Filtros</h3>
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
                setTypeFilter('');
                setPlanFilter('');
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filtro por nombre */}
            <div className="relative">
              <label htmlFor="name-filter" className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
            
            {/* Filtro por tipo */}
            <div>
              <label htmlFor="type-filter" className="block text-sm font-medium text-gray-700 mb-1">Tipo de organización</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <select
                  id="type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Todos los tipos</option>
                  {uniqueTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Filtro por plan */}
            <div>
              <label htmlFor="plan-filter" className="block text-sm font-medium text-gray-700 mb-1">Plan de suscripción</label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <select
                  id="plan-filter"
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="">Todos los planes</option>
                  {uniquePlans.map(plan => (
                    <option key={plan} value={plan}>{plan}</option>
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

  return (
    <>
      {/* Mostrar los filtros solo si showFilters es true */}
      {renderFilters()}
      
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        {filteredOrganizations.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-gray-500">No se encontraron organizaciones con los filtros aplicados</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredOrganizations.map((org) => (
              <li key={org.id}>
                <div
                  onClick={() => handleSelectOrganization(org.id)}
                  className="w-full hover:bg-gray-50 p-4 focus:outline-none cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelectOrganization(org.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-blue-600 truncate">{org.name}</p>
                          {org.is_current && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Actual
                            </span>
                          )}
                        </div>
                        <div className="ml-2 flex-shrink-0 flex">
                          <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {org.type_id.name}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex space-x-4">
                          <p className="text-sm text-gray-500">
                            {org.role_id === 2 ? 'Administrador' : 'Miembro'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Plan: <span className="font-medium text-purple-600">{org.plan_name}</span>
                          </p>
                        </div>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                          {org.status === 'active' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                    <div className="ml-5 flex space-x-3 items-center">
                      {showActions && org.role_id === 2 && (
                        <>
                          {/* Botón para cambiar estado activo/inactivo */}
                          <div
                            onClick={(e) => handleToggleStatus(org.id, org.status, e)}
                            className={`cursor-pointer ${org.status === 'active' ? 'text-green-600 hover:text-green-800' : 'text-gray-500 hover:text-gray-700'}`}
                            role="button"
                            tabIndex={0}
                            aria-label={org.status === 'active' ? 'Desactivar organización' : 'Activar organización'}
                            title={org.status === 'active' ? 'Desactivar organización' : 'Activar organización'}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Space') {
                                e.stopPropagation();
                                handleToggleStatus(org.id, org.status, e as unknown as React.MouseEvent);
                              }
                            }}
                          >
                            {org.status === 'active' ? (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          
                          {/* Botón para cambiar plan */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedOrgForPlan({
                                id: org.id,
                                name: org.name,
                                currentPlanId: org.plan_name.toLowerCase() === 'free' ? 'free' : 
                                             org.plan_name.toLowerCase() === 'básico' ? 'basic' : 
                                             org.plan_name.toLowerCase() === 'profesional' ? 'pro' : 'free'
                              });
                              setChangePlanModalOpen(true);
                            }}
                            className="text-purple-600 hover:text-purple-900 cursor-pointer"
                            role="button"
                            tabIndex={0}
                            aria-label="Cambiar plan"
                            title="Cambiar plan de suscripción"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Space') {
                                e.stopPropagation();
                                setSelectedOrgForPlan({
                                  id: org.id,
                                  name: org.name,
                                  currentPlanId: org.plan_name.toLowerCase() === 'free' ? 'free' : 
                                               org.plan_name.toLowerCase() === 'básico' ? 'basic' : 
                                               org.plan_name.toLowerCase() === 'profesional' ? 'pro' : 'free'
                                });
                                setChangePlanModalOpen(true);
                              }
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                              <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                            </svg>
                          </div>
                          
                          {/* Botón para eliminar */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete?.(org.id);
                            }}
                            className="text-red-600 hover:text-red-900 cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Space') {
                                e.stopPropagation();
                                onDelete?.(org.id);
                              }
                            }}
                          >
                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </>
                      )}
                      <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* Modal para cambiar plan */}
      {selectedOrgForPlan && (
        <ChangePlanModal
          isOpen={changePlanModalOpen}
          onClose={() => setChangePlanModalOpen(false)}
          organizationId={selectedOrgForPlan.id}
          organizationName={selectedOrgForPlan.name}
          currentPlanId={selectedOrgForPlan.currentPlanId}
          onPlanChanged={() => fetchUserOrganizations()}
        />
      )}
    </>
  );
}
