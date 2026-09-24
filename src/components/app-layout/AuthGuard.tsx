'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/context/SessionContext';
import { PantallaArranque } from '@/components/shell/arranque/PantallaArranque';
import { useIniciarSesionDeNuevo } from '@/components/shell/arranque/useIniciarSesionDeNuevo';

/**
 * AuthGuard - Bloquea el renderizado de hijos hasta que la sesión esté confirmada.
 * Esto previene race conditions donde hooks como useOrganization se ejecutan
 * antes de que Supabase Auth haya restaurado la sesión client-side.
 *
 * Mientras espera pinta la MISMA pantalla de arranque que «/»
 * (src/components/shell/arranque/PantallaArranque.tsx).
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, initError, retryInit } = useSession();
  const router = useRouter();
  const iniciarSesionDeNuevo = useIniciarSesionDeNuevo();

  useEffect(() => {
    // Con `initError` no sabemos si hay sesión (red/base caída): mandar al login
    // sería expulsar a un usuario que sí está autenticado. Mostramos el error.
    if (!loading && !session && !initError) {
      router.replace('/auth/login');
    }
  }, [loading, session, initError, router]);

  // No se pudo comprobar la sesión (red, base caída): error con reintento en
  // vez de dejar el cargador girando para siempre. Las sesiones MUERTAS
  // (refresh token inexistente) no llegan aquí: SessionContext las limpia y
  // deja `session = null` sin `initError`, así que el efecto de arriba manda
  // al login directamente. El detalle técnico ya quedó en la consola vía
  // logError; al usuario, solo algo que pueda entender.
  if (!loading && initError && !session) {
    return <PantallaArranque estado="sinConexion" onReintentar={retryInit} onIniciarSesion={iniciarSesionDeNuevo} />;
  }

  // Comprobando la sesión, o sin sesión mientras el efecto redirige al login.
  if (loading || !session) {
    return <PantallaArranque estado="comprobando" />;
  }

  return <>{children}</>;
}
