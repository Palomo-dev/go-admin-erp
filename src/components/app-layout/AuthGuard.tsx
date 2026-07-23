'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle } from 'lucide-react';
import { useSession } from '@/lib/context/SessionContext';

/**
 * AuthGuard - Bloquea el renderizado de hijos hasta que la sesión esté confirmada.
 * Esto previene race conditions donde hooks como useOrganization se ejecutan
 * antes de que Supabase Auth haya restaurado la sesión client-side.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/auth/login');
    }
  }, [loading, session, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-8">
          {/* User + ondas de radar */}
          <div className="relative h-24 w-24 flex items-center justify-center">
            {/* Onda 3 - más grande, más lenta */}
            <div className="absolute inset-0 rounded-full border-2 border-blue-600/20 dark:border-blue-500/20 animate-ping" style={{ animationDuration: '3s' }} />
            {/* Onda 2 - mediana */}
            <div className="absolute inset-3 rounded-full border-2 border-blue-600/30 dark:border-blue-500/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            {/* Onda 1 - pequeña, más rápida */}
            <div className="absolute inset-6 rounded-full border-2 border-blue-600/40 dark:border-blue-500/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
            {/* Icono User centrado */}
            <div className="relative z-10 flex items-center justify-center">
              <UserCircle className="h-10 w-10 text-blue-600 dark:text-blue-500 animate-pulse" style={{ animationDuration: '2s' }} />
            </div>
          </div>

          {/* Texto */}
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Cargando sesión
            </p>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '200ms', animationDuration: '1s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-8">
          {/* User + ondas de radar (azul) */}
          <div className="relative h-24 w-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-blue-600/20 dark:border-blue-500/20 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute inset-3 rounded-full border-2 border-blue-600/30 dark:border-blue-500/30 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
            <div className="absolute inset-6 rounded-full border-2 border-blue-600/40 dark:border-blue-500/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '1s' }} />
            <div className="relative z-10 flex items-center justify-center">
              <UserCircle className="h-10 w-10 text-blue-600 dark:text-blue-500 animate-pulse" style={{ animationDuration: '2s' }} />
            </div>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Redirigiendo a login
            </p>
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '200ms', animationDuration: '1s' }} />
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
