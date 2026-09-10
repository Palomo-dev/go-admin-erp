'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserCircle } from 'lucide-react';
import { useSession } from '@/lib/context/SessionContext';
import { LoadErrorState } from '@/components/common/LoadErrorState';
import { limpiarSesionMuerta } from '@/lib/auth/deadSession';

/**
 * AuthGuard - Bloquea el renderizado de hijos hasta que la sesión esté confirmada.
 * Esto previene race conditions donde hooks como useOrganization se ejecutan
 * antes de que Supabase Auth haya restaurado la sesión client-side.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, initError, retryInit } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Con `initError` no sabemos si hay sesión (red/base caída): mandar al login
    // sería expulsar a un usuario que sí está autenticado. Mostramos el error.
    if (!loading && !session && !initError) {
      router.replace('/auth/login');
    }
  }, [loading, session, initError, router]);

  // No se pudo comprobar la sesión (red, base caída): error con reintento en
  // vez de dejar el spinner girando para siempre. Las sesiones MUERTAS
  // (refresh token inexistente) no llegan aquí: SessionContext las limpia y
  // deja `session = null` sin `initError`, así que el efecto de arriba manda
  // al login directamente.
  if (!loading && initError && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
        <div className="w-full max-w-lg space-y-4">
          <LoadErrorState
            title="No pudimos comprobar tu sesión"
            // Nunca el texto crudo de Supabase: el detalle técnico ya quedó en
            // la consola vía logError. Al usuario, algo que pueda entender.
            message="No hay conexión con el servidor en este momento. Revisa tu conexión a internet e inténtalo de nuevo."
            onRetry={retryInit}
          />
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Si el problema continúa,{' '}
            <button
              type="button"
              onClick={async () => {
                // Borrar la sesión local ANTES de ir al login. Sin esto, el
                // middleware ve la cookie del token viejo y devuelve a
                // /app/inicio: el enlace "no hacía nada".
                await limpiarSesionMuerta();
                router.replace('/auth/login');
              }}
              className="underline underline-offset-2 hover:text-gray-700 dark:hover:text-gray-200"
            >
              inicia sesión de nuevo
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

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
