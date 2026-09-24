'use client';

/**
 * «/» no tiene contenido propio: pinta la pantalla de arranque de marca
 * mientras decide a dónde ir.
 *
 * - Con sesión → /app/inicio (antes, estado «Entrando a tu organización»).
 * - Sin sesión → /auth/login.
 * - Sin poder comprobarla (red o base caída) → estado sin conexión, con
 *   reintento; nunca se expulsa al login a quien quizá sí tiene sesión.
 *
 * La decisión se toma AQUÍ, en el cliente, y no en el middleware: iOS instala
 * la PWA desde la URL en la que está la persona al pulsar «Añadir a pantalla de
 * inicio», y el manifest declara `start_url: "/"` y `scope: "/"`. Un redirect
 * 302 en el servidor cambiaría esa URL a /app/inicio. Por eso el middleware
 * solo redirige «/» cuando NO hay cookie de sesión (ruta no pública → login).
 *
 * Antes esta página era un panel de desarrollo con una lista de módulos
 * escrita a mano y un «Cerrar sesión», que se alcanzaba a ver antes del
 * redirect. Qué módulos ve cada organización lo decide el catálogo de
 * navegación (src/lib/navigation), no esta página.
 */
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/context/SessionContext';
import { PantallaArranque } from '@/components/shell/arranque/PantallaArranque';
import { almacenDelNavegador, leerDatosArranque } from '@/components/shell/arranque/datosArranque';
import { useIniciarSesionDeNuevo } from '@/components/shell/arranque/useIniciarSesionDeNuevo';

export default function Raiz() {
  const { session, loading, initError, retryInit } = useSession();
  const router = useRouter();
  const iniciarSesionDeNuevo = useIniciarSesionDeNuevo();

  useEffect(() => {
    if (loading) return;
    if (session) router.replace('/app/inicio');
    else if (!initError) router.replace('/auth/login');
  }, [loading, session, initError, router]);

  const datos = useMemo(() => (session ? leerDatosArranque(session, almacenDelNavegador()) : null), [session]);

  if (!loading && initError && !session) {
    return <PantallaArranque estado="sinConexion" onReintentar={retryInit} onIniciarSesion={iniciarSesionDeNuevo} />;
  }
  if (datos) {
    return <PantallaArranque estado="entrando" datos={datos} />;
  }
  return <PantallaArranque estado="comprobando" />;
}
