'use client';

import { useOrganization } from '@/lib/hooks/useOrganization';
import { Settings, Loader2 } from 'lucide-react';
import RolesConfigurationSettings from '@/components/admin/RolesConfigurationSettings';

export default function ConfiguracionPage() {
  const { organization, isLoading } = useOrganization();

  if (isLoading || !organization) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 dark:text-blue-400 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Settings className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Configuración de Roles y Permisos
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Gestiona las políticas y comportamiento del sistema de permisos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <RolesConfigurationSettings organizationId={organization.id} />
      </div>
    </div>
  );
}
