'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase/config';
import dynamic from 'next/dynamic';

// Dynamic import for the OrganizationInfoTab component
const OrganizationInfoTab = dynamic(() => import('../../../../components/organization/OrganizationInfoTab'), {
  loading: () => <div className="text-center py-10">
    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
    <p className="mt-2">Cargando...</p>
  </div>
});

export default function InformacionPage() {
  const [orgData, setOrgData] = useState<any>(null);
  const [userRole, setUserRole] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        setLoading(true);
        
        // Get current user session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setError('No se encontró sesión de usuario');
          return;
        }
        
        // Get user ID
        const userId = session.user.id;
        const currentOrgId = localStorage.getItem('currentOrganizationId');
        
        // Get user's organization and role from organization_members
        const { data: memberData, error: memberError } = await supabase
          .from('organization_members')
          .select(`
            organization_id,
            role_id,
            is_super_admin,
            organizations!inner (
              id,
              name,
              type_id,
              status
            )
          `)
          .eq('user_id', userId)
          .eq('is_active', true);

        if (memberError) {
          console.error('Error fetching organization data:', memberError);
          setError('Error al cargar datos de la organización');
          return;
        }

        if (!memberData || memberData.length === 0) {
          setError('No perteneces a ninguna organización');
          return;
        }

        // If currentOrgId is set, find that organization, otherwise use the first one
        let selectedOrg = memberData[0];
        if (currentOrgId) {
          const foundOrg = memberData.find(member => member.organization_id.toString() === currentOrgId);
          if (foundOrg) {
            selectedOrg = foundOrg;
          }
        }

        setOrgData(selectedOrg.organization_id);
        setUserRole(selectedOrg.role_id);
        
      } catch (err: any) {
        console.error('Error in fetchOrgData:', err);
        setError('Error inesperado al cargar datos');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, []);

  // Check if user is admin (role_id 2 or is_super_admin)
  const isOrgAdmin = userRole === 2 || userRole === 1; // Assuming 1 is super admin, 2 is org admin

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center py-10">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2">Cargando datos de la organización...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
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
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">No tienes permisos para administrar la organización. Contacta a un administrador.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">Información de la Organización</h1>
        </div>
        <p className="mt-2 text-gray-600">Gestiona la información y configuración de tu organización</p>
        
        <div className="mt-8">
          <Suspense fallback={<div className="text-center py-10">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
            <p className="mt-2">Cargando información...</p>
          </div>}>
            <OrganizationInfoTab orgData={orgData} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
