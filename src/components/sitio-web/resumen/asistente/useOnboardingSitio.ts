'use client';

/**
 * Avance del asistente (`/api/sitio-web/onboarding`): lo guardado en
 * `website_site_states.onboarding` y el contexto del ERP (organización, sede,
 * dirección, pasarela, permisos). `guardar(parche)` funde en el servidor y
 * devuelve `true` si quedó guardado.
 */
import { useCallback, useEffect, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { OnboardingSitio } from '@/lib/website/onboardingSitio';
import type { ContextoAsistente } from '@/lib/website/contextoAsistente';

const RUTA = '/api/sitio-web/onboarding';

export type FalloOnboarding = 'error' | 'sin_permiso';

export interface Onboarding {
  onboarding: OnboardingSitio;
  contexto: ContextoAsistente | null;
  cargando: boolean;
  fallo: FalloOnboarding | null;
  guardando: boolean;
  /** Mensaje del último guardado fallido. */
  errorGuardar: string | null;
  guardar: (parche: OnboardingSitio) => Promise<boolean>;
  recargar: () => Promise<void>;
}

function cabeceras(): HeadersInit {
  const org = getOrganizationId();
  return { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) };
}

export function useOnboardingSitio(): Onboarding {
  const [onboarding, setOnboarding] = useState<OnboardingSitio>({});
  const [contexto, setContexto] = useState<ContextoAsistente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<FalloOnboarding | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setFallo(null);
    try {
      const r = await fetch(RUTA, { credentials: 'same-origin', headers: cabeceras() });
      if (r.status === 401 || r.status === 403) {
        setFallo('sin_permiso');
        return;
      }
      if (!r.ok) {
        setFallo('error');
        return;
      }
      const cuerpo = (await r.json()) as { onboarding: OnboardingSitio; contexto: ContextoAsistente };
      setOnboarding(cuerpo.onboarding ?? {});
      setContexto(cuerpo.contexto);
      if (!cuerpo.contexto.permisos.editar) setFallo('sin_permiso');
    } catch {
      setFallo('error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardar = useCallback(async (parche: OnboardingSitio) => {
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const r = await fetch(RUTA, { method: 'PATCH', credentials: 'same-origin', headers: cabeceras(), body: JSON.stringify(parche) });
      const cuerpo = (await r.json().catch(() => null)) as { onboarding?: OnboardingSitio; error?: { message?: string } } | null;
      if (!r.ok || !cuerpo?.onboarding) {
        setErrorGuardar(cuerpo?.error?.message ?? 'No se pudo guardar.');
        return false;
      }
      setOnboarding(cuerpo.onboarding);
      return true;
    } catch {
      setErrorGuardar('Revisa tu conexión e inténtalo de nuevo.');
      return false;
    } finally {
      setGuardando(false);
    }
  }, []);

  return { onboarding, contexto, cargando, fallo, guardando, errorGuardar, guardar, recargar };
}
