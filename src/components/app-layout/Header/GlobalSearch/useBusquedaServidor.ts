'use client';

/**
 * Datos del servidor para el buscador global (`GET /api/busqueda-global`).
 *
 * - Acciones rápidas: se piden al abrir la paleta (una vez por organización).
 * - Entidades: con debounce; cada petición nueva cancela la anterior
 *   (`AbortController`) y una respuesta vieja nunca pisa a una nueva: el
 *   resultado se guarda con la consulta que lo produjo y solo se pinta si
 *   coincide con la consulta actual.
 * - Un tope de 8 s convierte una petición colgada en error con «Reintentar».
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type { GrupoResultados, IdAccion, RespuestaBusquedaGlobal, TipoEntidad } from '@/lib/busquedaGlobal/definiciones';
import { DEBOUNCE_MS, LARGO_MAXIMO_CONSULTA, MIN_CARACTERES_ENTIDADES } from '@/lib/busquedaGlobal/logica';

const TOPE_MS = 8000;

interface Resuelta {
  consulta: string;
  grupos: GrupoResultados[];
  fallidos: TipoEntidad[];
  error: boolean;
}

export interface EstadoServidor {
  grupos: GrupoResultados[];
  fallidos: TipoEntidad[];
  acciones: { id: IdAccion; href: string }[];
  cargando: boolean;
  error: boolean;
  reintentar: () => void;
}

async function pedir(consulta: string, signal: AbortSignal): Promise<RespuestaBusquedaGlobal> {
  const org = getOrganizationId();
  const qs = consulta ? `?q=${encodeURIComponent(consulta)}` : '';
  const r = await fetch(`/api/busqueda-global${qs}`, {
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: org > 0 ? { 'x-organization-id': String(org) } : {},
  });
  if (!r.ok) throw new Error(`busqueda-global ${r.status}`);
  return (await r.json()) as RespuestaBusquedaGlobal;
}

function conTope(externa: AbortController): () => void {
  const t = setTimeout(() => externa.abort(new DOMException('tope', 'TimeoutError')), TOPE_MS);
  return () => clearTimeout(t);
}

export function useBusquedaServidor(consultaCruda: string, abierto: boolean, organizacionId: string | null): EstadoServidor {
  const consulta = consultaCruda.trim().slice(0, LARGO_MAXIMO_CONSULTA);
  const buscable = consulta.length >= MIN_CARACTERES_ENTIDADES;
  const [resuelta, setResuelta] = useState<Resuelta | null>(null);
  const [acciones, setAcciones] = useState<{ org: string | null; lista: EstadoServidor['acciones'] }>({ org: null, lista: [] });
  const [intento, setIntento] = useState(0);
  const enVuelo = useRef<AbortController | null>(null);

  // Acciones: al abrir, si no están cargadas para esta organización.
  useEffect(() => {
    if (!abierto || !organizacionId || acciones.org === organizacionId) return;
    const control = new AbortController();
    const quitarTope = conTope(control);
    pedir('', control.signal)
      .then((r) => setAcciones({ org: organizacionId, lista: r.acciones ?? [] }))
      .catch(() => {
        /* Sin acciones: la paleta sigue funcionando con páginas y datos. */
      })
      .finally(quitarTope);
    return () => control.abort();
  }, [abierto, organizacionId, acciones.org]);

  useEffect(() => {
    if (!abierto || !buscable) {
      enVuelo.current?.abort();
      return;
    }
    const temporizador = setTimeout(() => {
      enVuelo.current?.abort();
      const control = new AbortController();
      enVuelo.current = control;
      const quitarTope = conTope(control);
      pedir(consulta, control.signal)
        .then((r) => {
          if (enVuelo.current !== control) return;
          setResuelta({ consulta, grupos: r.grupos ?? [], fallidos: r.fallidos ?? [], error: false });
        })
        .catch(() => {
          // Cancelada por una consulta más nueva o por cerrar: no es un error.
          // Cancelada por el tope de 8 s: sí lo es.
          if (enVuelo.current !== control) return;
          const razon = control.signal.reason as { name?: string } | undefined;
          if (control.signal.aborted && razon?.name !== 'TimeoutError') return;
          setResuelta({ consulta, grupos: [], fallidos: [], error: true });
        })
        .finally(quitarTope);
    }, DEBOUNCE_MS);
    return () => clearTimeout(temporizador);
  }, [consulta, buscable, abierto, intento]);

  useEffect(() => () => enVuelo.current?.abort(), []);

  // Al cambiar de organización, nada de lo anterior sirve.
  useEffect(() => {
    setResuelta(null);
  }, [organizacionId]);

  const reintentar = useCallback(() => {
    setResuelta(null);
    setIntento((n) => n + 1);
  }, []);

  const vigente = buscable && resuelta?.consulta === consulta ? resuelta : null;
  return {
    grupos: vigente?.grupos ?? [],
    fallidos: vigente?.fallidos ?? [],
    acciones: acciones.org === organizacionId ? acciones.lista : [],
    cargando: buscable && abierto && !vigente,
    error: vigente?.error ?? false,
    reintentar,
  };
}
