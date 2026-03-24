'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { proceedWithLogin } from '@/lib/auth';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('auth.selectOrganization');
  const tc = useTranslations('common');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  useEffect(() => {
    loadUserOrganizations();
  }, []);

  // Intentar obtener sesión o hidratar desde URL params / cookie OAuth (flujo Google)
  const getActiveSession = async () => {
    // 1. Hidratar desde URL query param _oauth (más confiable que cookies)
    const oauthParam = searchParams.get('_oauth');
    if (oauthParam) {
      try {
        const { at, rt } = JSON.parse(oauthParam);
        if (at && rt) {
          const { data, error } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          // Limpiar tokens de la URL
          if (typeof window !== 'undefined') {
            const dest = searchParams.get('dest');
            const cleanUrl = dest ? `/auth/select-organization?dest=${encodeURIComponent(dest)}` : '/auth/select-organization';
            window.history.replaceState(null, '', cleanUrl);
          }
          if (!error && data.session) return data.session;
        }
      } catch (e) {
        console.error('Error hydrating OAuth session from URL:', e);
      }
    }

    // 2. Fallback: cookie OAuth
    if (typeof document !== 'undefined') {
      const oauthCookie = document.cookie
        .split(';')
        .map(c => c.trim())
        .find(c => c.startsWith('go-admin-oauth-session='));
      if (oauthCookie) {
        try {
          const eqIndex = oauthCookie.indexOf('=');
          const value = decodeURIComponent(oauthCookie.substring(eqIndex + 1));
          const { access_token, refresh_token } = JSON.parse(value);
          if (access_token && refresh_token) {
            const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
            document.cookie = 'go-admin-oauth-session=; path=/; max-age=0';
            if (!error && data.session) return data.session;
          }
        } catch (e) {
          console.error('Error hydrating OAuth session from cookie:', e);
        }
      }
    }

    // 3. Fallback: sesión existente (login normal o ya hidratada)
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  const loadUserOrganizations = async () => {
    try {
      setLoading(true);
      
      // Verificar sesión activa (o hidratar desde cookie OAuth)
      const session = await getActiveSession();
      
      if (!session) {
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

      // Verificar sesión activa (usa hidratación OAuth si es necesario)
      const session = await getActiveSession();
      
      if (!session) {
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

      // Sincronizar localStorage ANTES de proceedWithLogin para evitar lectura de valor viejo
      localStorage.setItem('currentOrganizationId', org.id.toString());
      localStorage.setItem('currentOrganizationName', org.name);

      // Proceder con el login usando la función existente
      const next = searchParams.get('dest') || searchParams.get('next') || '/app/inicio';
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Header skeleton */}
          <div>
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-200 animate-pulse" />
            <div className="mt-6 mx-auto h-8 w-64 bg-gray-200 rounded animate-pulse" />
            <div className="mt-2 mx-auto h-4 w-80 bg-gray-100 rounded animate-pulse" />
          </div>
          {/* Org cards skeleton */}
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="w-full flex items-center p-4 border border-gray-200 rounded-lg">
                <div className="flex-shrink-0 mr-4">
                  <div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" />
                </div>
                <div className="flex-grow space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="flex-shrink-0">
                  <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          {/* Divider + button skeleton */}
          <div className="mt-6">
            <div className="w-full border-t border-gray-200" />
            <div className="mt-6 h-10 w-full bg-gray-100 rounded-md animate-pulse" />
          </div>
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
            {t('title')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('subtitle')}
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
              <span className="px-2 bg-gray-50 text-gray-500">{tc('or')}</span>
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
              {t('createNew')}
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-200 animate-pulse" />
            <div className="mt-6 mx-auto h-8 w-64 bg-gray-200 rounded animate-pulse" />
            <div className="mt-2 mx-auto h-4 w-80 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="w-full flex items-center p-4 border border-gray-200 rounded-lg">
                <div className="flex-shrink-0 mr-4"><div className="w-12 h-12 rounded-full bg-gray-200 animate-pulse" /></div>
                <div className="flex-grow space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                </div>
                <div className="flex-shrink-0"><div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    }>
      <SelectOrganizationContent />
    </Suspense>
  );
}
