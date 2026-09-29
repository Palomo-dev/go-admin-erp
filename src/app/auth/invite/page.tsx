'use client';

/**
 * Aceptar invitación — acceso v3 (R11; Figma sección 18, filas 7 a 7c;
 * docs/design/AUTH-ACCESO-V2.md §11 y §13).
 *
 * Valida el código en el servidor (/api/auth/invite/context: 404 uniforme,
 * nunca devuelve el código; 39999d0f) y pasa al asistente. Estados: sin
 * código, invitación no válida o vencida (con «Pedir un enlace nuevo»), error
 * con Reintentar. Al terminar se entra directo a la organización.
 */
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link2Off, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import InvitationWizard, { type InvitationWizardData } from '@/components/auth/InvitationWizard';
import type { EstadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';
import { clasesBoton } from '@/components/kit/botonClases';
import { EscenaAcceso, TarjetaAcceso, IconoDestacado, Enlace } from '@/components/kit/acceso';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin_codigo' }
  | { tipo: 'no_valida' }
  | { tipo: 'error' }
  | { tipo: 'lista'; datos: InvitationWizardData; cuenta: EstadoCuentaInvitacion; sesion: string | null };

function InviteContent() {
  const t = useTranslations('acceso.invitacion');
  const tc = useTranslations('acceso.comun');
  const params = useSearchParams();
  const codigo = params?.get('invite_code') ?? null;
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!codigo) {
        setEstado({ tipo: 'sin_codigo' });
        return;
      }
      // Errores de Supabase en el fragmento (flujo automático que no se usa): fuera de la URL.
      if (typeof window !== 'undefined' && (window.location.hash.includes('error=') || params?.get('error'))) {
        window.history.replaceState({}, '', `${window.location.pathname}?invite_code=${encodeURIComponent(codigo)}`);
      }
      try {
        const res = await fetch(`/api/auth/invite/context?code=${encodeURIComponent(codigo)}`, { cache: 'no-store' });
        const contexto = (await res.json().catch(() => null)) as {
          invitation?: Omit<InvitationWizardData, 'code'>;
          account_state?: EstadoCuentaInvitacion;
        } | null;
        if (!vivo) return;
        if (res.status === 404) {
          setEstado({ tipo: 'no_valida' });
          return;
        }
        if (!res.ok || !contexto?.invitation) {
          setEstado({ tipo: 'error' });
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (!vivo) return;
        setEstado({
          tipo: 'lista',
          // El servidor no devuelve el código: se canjea el del enlace.
          datos: { ...contexto.invitation, code: codigo } as InvitationWizardData,
          cuenta: contexto.account_state ?? 'nueva',
          sesion: data.session?.user?.email ?? null,
        });
      } catch {
        if (vivo) setEstado({ tipo: 'error' });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [codigo, params]);

  if (estado.tipo === 'lista') {
    return (
      <InvitationWizard
        inviteData={estado.datos}
        accountState={estado.cuenta}
        sessionEmail={estado.sesion}
        // Navegación completa: la organización activa acaba de cambiar.
        onComplete={() => window.location.assign('/app/inicio')}
      />
    );
  }

  if (estado.tipo === 'cargando') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso titulo={t('validando')} centrado icono={<Loader2 className="size-8 animate-spin text-brand" aria-hidden="true" />} />
      </EscenaAcceso>
    );
  }

  const pie = <p className="text-center"><Enlace href="/auth/login">{tc('irAlLogin')}</Enlace></p>;

  if (estado.tipo === 'error') {
    return (
      <EscenaAcceso>
        <TarjetaAcceso titulo={t('errorTitulo')} descripcion={t('errorDescripcion')} icono={<IconoDestacado icono={Link2Off} tono="peligro" />} centrado pie={pie}>
          <button type="button" onClick={() => window.location.reload()} className={clasesBoton({ anchoCompleto: true })}>
            {tc('reintentar')}
          </button>
        </TarjetaAcceso>
      </EscenaAcceso>
    );
  }

  return (
    <EscenaAcceso>
      <TarjetaAcceso
        titulo={estado.tipo === 'sin_codigo' ? t('sinCodigoTitulo') : t('vencidaTitulo')}
        descripcion={estado.tipo === 'sin_codigo' ? t('sinCodigo') : t('vencidaDescripcion')}
        icono={<IconoDestacado icono={Link2Off} tono="advertencia" />}
        centrado
        pie={pie}
      >
        <Link href="/auth/verify/failed?type=invite" className={clasesBoton({ anchoCompleto: true })}>
          {t('pedirEnlace')}
        </Link>
      </TarjetaAcceso>
    </EscenaAcceso>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteContent />
    </Suspense>
  );
}
