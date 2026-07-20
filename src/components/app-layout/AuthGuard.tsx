'use client';

import React from 'react';
import { useSession } from '@/lib/context/SessionContext';

/**
 * AuthGuard - Bloquea el renderizado de hijos hasta que la sesión esté confirmada.
 * Esto previene race conditions donde hooks como useOrganization se ejecutan
 * antes de que Supabase Auth haya restaurado la sesión client-side.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando sesión...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Redirigiendo a login...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
