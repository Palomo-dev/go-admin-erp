'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import BillingTab from '@/components/subscription/BillingTab';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<number | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }

      // Obtener organización del usuario
      const { data: profile } = await supabase
        .from('profiles')
        .select('last_org_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.last_org_id) {
        setError('No se encontró una organización asociada');
        return;
      }

      // Obtener nombre de la organización
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('id', profile.last_org_id)
        .single();

      if (org) {
        setOrgId(org.id);
        setOrganizationName(org.name);
      }
    } catch (err: any) {
      console.error('Error loading organization:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 p-4 sm:p-6 space-y-4 sm:space-y-6">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  if (error || !orgId) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow text-center">
          <p className="text-red-600 dark:text-red-400">{error || 'Error cargando la organización'}</p>
          <button
            onClick={() => router.push('/app/plan')}
            className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-800"
          >
            Volver al plan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/app/plan')}
            className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Volver al Plan
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Facturación y Pagos</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Gestiona tus métodos de pago y revisa tu historial de facturas para {organizationName}
          </p>
        </div>

        {/* Billing Tab Component */}
        <BillingTab orgId={orgId} />
      </div>
    </div>
  );
}
