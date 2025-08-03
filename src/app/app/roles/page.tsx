'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Users, Settings, Lock } from 'lucide-react';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { PERMISSIONS, MODULES } from '@/lib/middleware/permissions';
import PermissionGuard from '@/components/auth/PermissionGuard';

export default function AdminPage() {
  const router = useRouter();
  const { context, loading } = usePermissionContext();

  // Redirigir a la página de roles por defecto
  useEffect(() => {
    if (!loading && context) {
      router.push('/app/roles/roles');
    }
  }, [loading, context, router]);

  if (loading || !context) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Esta página normalmente redirigirá, pero mostramos contenido por si acaso
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <PermissionGuard
          permissions={[PERMISSIONS.ROLES_MANAGE, PERMISSIONS.USER_MANAGEMENT, PERMISSIONS.ADMIN_FULL_ACCESS]}
          requireAll={false}
          moduleCode={MODULES.ADMIN}
          organizationId={context.organizationId}
        >
          <div className="text-center">
            <Shield className="mx-auto h-16 w-16 text-indigo-600" />
            <h1 className="mt-4 text-3xl font-bold text-gray-900">Administración del Sistema</h1>
            <p className="mt-2 text-lg text-gray-600">
              Gestión de roles, permisos y configuración del sistema
            </p>
            
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div 
                onClick={() => router.push('/app/roles/roles')}
                className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-indigo-100 rounded-md p-3">
                    <Lock className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div className="ml-5">
                    <h3 className="text-lg font-medium text-gray-900">Roles y Permisos</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Gestiona roles y asigna permisos a usuarios
                    </p>
                  </div>
                </div>
              </div>
              
              <div 
                onClick={() => router.push('/app/roles/configuracion')}
                className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0 bg-indigo-100 rounded-md p-3">
                    <Settings className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div className="ml-5">
                    <h3 className="text-lg font-medium text-gray-900">Configuración</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Ajustes generales del sistema
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </PermissionGuard>
      </div>
    </div>
  );
}
