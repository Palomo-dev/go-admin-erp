'use client';

/**
 * Preferencias del inicio de la persona en la organización activa
 * (`/api/inicio/preferencias` → `user_dashboard_preferences`): se guardan en
 * la base, así que viajan entre dispositivos. Sin preferencias (o si la
 * lectura falla), el inicio se pinta completo en el orden por defecto.
 */
import { useCallback, useEffect, useState } from 'react';
import { PREFERENCIAS_VACIAS, type PreferenciasInicio } from '@/lib/dashboard/preferenciasInicio';

export function usePreferenciasInicio(organizationId: number | null | undefined) {
  const [prefs, setPrefs] = useState<PreferenciasInicio>(PREFERENCIAS_VACIAS);
  const [cargadas, setCargadas] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    setCargadas(false);
    fetch('/api/inicio/preferencias', { headers: { 'X-Organization-Id': String(organizationId) }, cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<PreferenciasInicio>) : PREFERENCIAS_VACIAS))
      .catch(() => PREFERENCIAS_VACIAS)
      .then((p) => {
        if (cancelado) return;
        setPrefs(p);
        setCargadas(true);
      });
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  /** Guarda y devuelve true si la base aceptó; en error conserva lo anterior. */
  const guardar = useCallback(
    async (nuevas: PreferenciasInicio): Promise<boolean> => {
      if (!organizationId) return false;
      setGuardando(true);
      try {
        const res = await fetch('/api/inicio/preferencias', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Organization-Id': String(organizationId) },
          body: JSON.stringify(nuevas),
        });
        if (!res.ok) return false;
        setPrefs((await res.json()) as PreferenciasInicio);
        return true;
      } catch {
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [organizationId],
  );

  return { prefs, cargadas, guardando, guardar };
}
