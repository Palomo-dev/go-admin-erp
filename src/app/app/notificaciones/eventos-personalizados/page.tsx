'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// Función temporal para obtener organización
const getCurrentOrganizationId = async (): Promise<number | null> => {
  // Por ahora usar organización fija para pruebas
  return 2;
};
import { CustomEventsManager } from '@/components/notificaciones/custom-events/CustomEventsManager';
import { SimpleBreadcrumb } from '@/components/app/notificaciones/ui/SimpleBreadcrumb';

export default function EventosPersonalizadosPage() {
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const loadOrganization = async () => {
      try {
        const orgId = await getCurrentOrganizationId();
        if (!orgId) {
          router.push('/auth/login');
          return;
        }
        setOrganizationId(orgId);
      } catch (error) {
        console.error('Error al obtener organización:', error);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    loadOrganization();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Error de acceso
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            No se pudo obtener la información de la organización
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="p-6">
        <SimpleBreadcrumb />
        <div className="mt-6">
          <CustomEventsManager organizationId={organizationId} />
        </div>
      </div>
    </div>
  );
}
