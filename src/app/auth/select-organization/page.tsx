'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { proceedWithLogin } from '@/lib/auth';

interface Organization {
  id: string;
  name: string;
  type_name?: string;
  plan_name?: string;
  status: string;
  logo_url?: string;
}

function SelectOrganizationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    loadUserOrganizations();
  }, []);

  const loadUserOrganizations = async () => {
    try {
      setLoading(true);
      
      // Verificar sesión activa
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        router.push('/auth/login');
        return;
      }

      // Obtener organizaciones del usuario con plan via subscriptions
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          organizations!inner(
            id,
            name,
            status,
            logo_url,
            organization_types(name),
            subscriptions(
              plan_id,
              status,
              plans(name)
            )
          )
        `)
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .eq('organizations.status', 'active');

      if (memberError) {
        throw memberError;
      }

      if (!memberData || memberData.length === 0) {
        // No tiene organizaciones, redirigir a signup
        router.push('/auth/signup?step=organization&google=true');
        return;
      }

      // Transformar datos para la UI
      const orgs: Organization[] = memberData.map((member: any) => {
        // Obtener la suscripción activa (puede haber varias, tomamos la última activa)
        const subscriptions = member.organizations.subscriptions || [];
        const activeSub = subscriptions.find((s: any) => s.status === 'active') || subscriptions[0];
        const planName = activeSub?.plans?.name || 'Free';
        
        return {
          id: member.organizations.id,
          name: member.organizations.name,
          type_name: member.organizations.organization_types?.name || 'Organización',
          plan_name: planName,
          status: member.organizations.status,
          logo_url: member.organizations.logo_url
        };
      });

      setOrganizations(orgs);
      
    } catch (err: any) {
      console.error('Error loading organizations:', err);
      setError(err.message || 'Error al cargar organizaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrganization = async (org: Organization) => {
    try {
      setSelecting(true);
      setError(null);

      // Verificar sesión activa
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        router.push('/auth/login');
        return;
      }

      // Actualizar last_org_id en el perfil del usuario
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ last_org_id: parseInt(org.id) })
        .eq('id', session.user.id);

      if (updateError) {
        throw updateError;
      }

      // Proceder con el login usando la función existente
      const next = searchParams.get('next') || '/app/inicio';
      await proceedWithLogin(false, session.user.email || '');
      
      // Redirigir al destino final
      router.push(next);
      
    } catch (err: any) {
      console.error('Error selecting organization:', err);
      setError(err.message || 'Error al seleccionar organización');
    } finally {
      setSelecting(false);
    }
  };

  const handleCreateOrganization = () => {
    router.push('/auth/signup?step=organization&google=true');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando organizaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-2m-2 0H7m5 0v-5a2 2 0 00-2-2H8a2 2 0 00-2 2v5m5 0V9a2 2 0 012-2h2a2 2 0 012 2v12" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Selecciona una organización
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Tu cuenta está asociada a múltiples organizaciones. Selecciona una para continuar.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {organizations.map((org) => (
            <button
              key={org.id}
              onClick={() => handleSelectOrganization(org)}
              disabled={selecting}
              className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Organization logo or placeholder */}
              <div className="flex-shrink-0 mr-4">
                {org.logo_url ? (
                  <img 
                    src={org.logo_url} 
                    alt={`${org.name} logo`} 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium text-lg">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              {/* Organization details */}
              <div className="flex-grow text-left">
                <div className="font-medium text-gray-900">{org.name}</div>
                <div className="text-sm text-gray-500">{org.type_name}</div>
              </div>
              
              {/* Plan badge */}
              <div className="flex-shrink-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {org.plan_name}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">O</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleCreateOrganization}
              disabled={selecting}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Crear nueva organización
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SelectOrganizationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <SelectOrganizationContent />
    </Suspense>
  );
}
