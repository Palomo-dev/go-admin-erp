'use client';

import { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase/config';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { DocumentTextIcon, ClockIcon } from '@heroicons/react/24/outline';

// Dynamic import for the PlanTab component
const PlanTab = dynamic(() => import('../../../components/organization/PlanTab'), {
  loading: () => <div className="text-center py-10">
    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
    <p className="mt-2">Cargando...</p>
  </div>
});

export default function PlanPage() {
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
          .eq('organization_id', currentOrgId || '')
          .single();

        if (memberError) {
          console.error('Error fetching member data:', memberError);
          setError('Error al obtener datos del miembro');
          return;
        }

        if (!memberData) {
          setError('No se encontraron datos de membresía');
          return;
        }

        setOrgData(memberData.organizations);
        setUserRole(memberData.role_id);
        
      } catch (err) {
        console.error('Error in fetchOrgData:', err);
        setError('Error inesperado al cargar datos');
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2">Cargando información del plan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">No se encontró información de la organización</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Planes y Suscripciones</h1>
            <p className="text-gray-600 mt-2">
              Gestiona tu plan actual y revisa el historial de suscripciones
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/app/plan/billing"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <DocumentTextIcon className="h-4 w-4 mr-2" />
              Facturación
            </Link>
            <Link
              href="/app/plan/historial"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <ClockIcon className="h-4 w-4 mr-2" />
              Historial
            </Link>
          </div>
        </div>
      </div>

      <Suspense fallback={
        <div className="text-center py-10">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2">Cargando plan...</p>
        </div>
      }>
        <PlanTab orgId={orgData.id} />
      </Suspense>
    </div>
  );
}
