'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, ensureSessionSynced } from '@/lib/supabase/config';

function SuperAdminAccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const exchangeToken = async () => {
      const token = searchParams.get('token');
      if (!token) {
        setError('Token no proporcionado');
        setLoading(false);
        return;
      }

      try {
        // Canjear el token por los tokens de sesión
        const res = await fetch('/api/super-admin-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Error al validar el token');
          setLoading(false);
          return;
        }

        // Establecer la sesión de Supabase con los tokens del super admin
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          setError('Error al establecer la sesión');
          setLoading(false);
          return;
        }

        // Guardar el contexto de la organización en localStorage
        localStorage.setItem('currentOrganizationId', data.org_id.toString());
        localStorage.setItem('currentOrganizationName', data.org_name);
        localStorage.setItem('superAdminImpersonating', 'true');
        localStorage.setItem('superAdminName', data.admin_name);
        localStorage.setItem('superAdminUserId', data.user_id || '');
        localStorage.setItem('superAdminOrgId', data.org_id.toString());

        // Actualizar last_org_id en el perfil
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          await supabase
            .from('profiles')
            .update({ last_org_id: data.org_id })
            .eq('id', session.user.id);
        }

        // Sincronizar cookies
        await ensureSessionSynced();

        // Pequeño delay para asegurar que las cookies se establezcan
        await new Promise(resolve => setTimeout(resolve, 500));

        // Redirigir al dashboard del ERP
        window.location.replace('/app/inicio');
      } catch (err) {
        console.error('Error in super admin access:', err);
        setError('Error inesperado al procesar el acceso');
        setLoading(false);
      }
    };

    exchangeToken();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-sm">Accediendo a la organización...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Acceso denegado</h2>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <a href="https://admin.goadmin.io" className="text-sm text-blue-600 hover:text-blue-500">
            Volver al panel de administración
          </a>
        </div>
      </div>
    );
  }

  return null;
}

export default function SuperAdminAccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600 text-sm">Cargando...</p>
        </div>
      </div>
    }>
      <SuperAdminAccessContent />
    </Suspense>
  );
}
