'use client';

/**
 * Secciones que la persona ve y cuáles puede editar, tal como las resolvió el
 * servidor (`GET /api/configuracion/secciones`: plan + permisos de la sesión).
 * El cliente no decide nada: sin respuesta, no hay secciones.
 */
import { useCallback, useEffect, useState } from 'react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { isDesktop } from '@/lib/utils/desktop';
import { getConfigModule } from '../config/configModulesRegistry';
import { seccionPorId, type SeccionConfig } from '../config/configSectionsRegistry';
import type { PermisoSeccion } from '../config/permisosSecciones';

export interface SeccionPermitida {
  seccion: SeccionConfig;
  puedeEditar: boolean;
  ajustes: Record<string, boolean>;
}

interface Estado {
  cargando: boolean;
  error: string | null;
  secciones: SeccionPermitida[];
}

/** Une la respuesta del servidor con el registro (lo desconocido se descarta). */
export function seccionesDesdeRespuesta(permisos: readonly PermisoSeccion[], escritorio: boolean): SeccionPermitida[] {
  const out: SeccionPermitida[] = [];
  for (const p of permisos) {
    const seccion = seccionPorId(p.id);
    if (!seccion) continue;
    if (getConfigModule(seccion.modulo)?.desktopOnly && !escritorio) continue;
    out.push({ seccion, puedeEditar: p.puedeEditar === true, ajustes: p.ajustes ?? {} });
  }
  return out;
}

export function useSeccionesPermitidas() {
  const [estado, setEstado] = useState<Estado>({ cargando: true, error: null, secciones: [] });

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const json = await fetchJson<{ secciones?: PermisoSeccion[] }>('/api/configuracion/secciones', { cache: 'no-store' });
      setEstado({ cargando: false, error: null, secciones: seccionesDesdeRespuesta(json?.secciones ?? [], isDesktop()) });
    } catch (err) {
      logError('[Configuración] secciones permitidas', err);
      setEstado({ cargando: false, error: describeError(err), secciones: [] });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { ...estado, recargar: cargar };
}
