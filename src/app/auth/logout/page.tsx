'use client';

/**
 * /auth/logout — cierre de sesión real (R3, docs/design/AUTH-ACCESO-V2.md §6).
 *
 * Existía en el middleware pero no como ruta. Es pantalla del navegador (no
 * route handler) porque la limpieza del almacenamiento local —la que hacía
 * `/auth/session-expired`— solo se puede hacer aquí: reutiliza `signOut()`
 * (cookies, localStorage, impersonación de super admin y Auth) y va al login.
 * `?reason=expired` se conserva para que el login pinte el aviso de sesión
 * vencida; cualquier otro valor se ignora.
 */
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { signOut } from '@/lib/supabase/config';
import { EscenaAcceso, TarjetaAcceso } from '@/components/kit/acceso';

function Salida() {
  const t = useTranslations('acceso.salida');
  const params = useSearchParams();
  const motivo = params.get('reason') === 'expired' ? 'expired' : null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await signOut();
      } catch (err) {
        // Aunque Auth no responda, la limpieza local ya se hizo: se sigue al login.
        console.warn('[logout] signOut falló; se sigue al login:', err);
      }
      if (vivo) window.location.replace(motivo ? `/auth/login?reason=${motivo}` : '/auth/login');
    })();
    return () => {
      vivo = false;
    };
  }, [motivo]);

  return (
    <EscenaAcceso>
      <TarjetaAcceso titulo={t('cerrando')} centrado icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />} />
    </EscenaAcceso>
  );
}

export default function LogoutPage() {
  return (
    <Suspense fallback={null}>
      <Salida />
    </Suspense>
  );
}
