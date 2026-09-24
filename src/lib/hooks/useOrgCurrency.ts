'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { resolverContextoMoneda } from '@/lib/services/monedaOrganizacion';
import {
  contextoMoneda,
  crearFormateadorMoneda,
  formatMoneda,
  type ContextoMoneda,
} from '@/lib/utils/moneda';

const CACHE_KEY = 'org_base_currency';

interface CacheLocal {
  orgId: number;
  code: string;
  decimals?: number;
  locale?: string;
}

/**
 * Valor inicial mientras llega la respuesta: lo último que se resolvió para
 * esta organización (localStorage) o el respaldo del ERP. Nunca es la verdad:
 * la verdad la trae `resolverContextoMoneda` un instante después.
 */
function contextoEnCache(orgId?: number | null): { ctx: ContextoMoneda; resuelta: boolean } {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const c = JSON.parse(cached) as CacheLocal;
      const localOrg = orgId ?? Number(localStorage.getItem('currentOrganizationId'));
      if (localOrg && Number(localOrg) === c.orgId) {
        return { ctx: contextoMoneda(c.code, { decimals: c.decimals, locale: c.locale }), resuelta: true };
      }
    }
  } catch {
    /* usar respaldo */
  }
  // Marcador de posición mientras llega la respuesta: NO es la moneda de la
  // organización. Por eso `resuelta` es false: un formulario que inicializa
  // su moneda con el hook debe esperar a `resuelta` (o no enviar moneda y
  // dejar que la base la ponga: trigger `trg_00_moneda_base_por_defecto`).
  return { ctx: contextoMoneda('COP'), resuelta: false };
}

/**
 * Contexto de moneda de la organización actual: moneda base (con la cadena de
 * respaldo de `resolveOrgCurrency`), sus decimales y el locale del país.
 * Para documentos, tablas y exportaciones del navegador.
 */
export function useMonedaOrganizacion(): ContextoMoneda & {
  /** Formatea en la moneda base de la organización. */
  formatear: (valor: number | string | null | undefined) => string;
  /** Contexto para un documento con moneda propia (base como respaldo). */
  paraDocumento: (monedaDocumento?: string | null) => ContextoMoneda;
  /**
   * true cuando `code` es la moneda de la organización (resuelta o de la
   * caché de esta misma organización); false mientras es el marcador inicial.
   */
  resuelta: boolean;
} {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [estado, setEstado] = useState<{ ctx: ContextoMoneda; resuelta: boolean }>(() => contextoEnCache(orgId));

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    resolverContextoMoneda(supabase, orgId)
      .then((resuelto) => {
        try {
          const guardar: CacheLocal = { orgId, code: resuelto.code, decimals: resuelto.decimals, locale: resuelto.locale };
          localStorage.setItem(CACHE_KEY, JSON.stringify(guardar));
        } catch {
          /* sin almacenamiento local: no pasa nada */
        }
        if (!cancelado) setEstado({ ctx: resuelto, resuelta: true });
      })
      .catch(() => {
        /* se queda el valor inicial */
      });
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  const { ctx, resuelta } = estado;
  return useMemo(
    () => ({
      ...ctx,
      resuelta,
      formatear: crearFormateadorMoneda(ctx),
      paraDocumento: (monedaDocumento?: string | null) => {
        const doc = (monedaDocumento ?? '').trim().toUpperCase();
        return /^[A-Z]{3}$/.test(doc) && doc !== ctx.code ? contextoMoneda(doc, { locale: ctx.locale }) : ctx;
      },
    }),
    [ctx, resuelta]
  );
}

/**
 * Hook que retorna el código de moneda base de la organización actual.
 * Delegado en `useMonedaOrganizacion` (fuente única:
 * `src/lib/services/monedaOrganizacion.ts`).
 */
export function useOrgCurrency(): string {
  return useMonedaOrganizacion().code;
}

/**
 * Formatea un valor monetario sin decimales según la moneda indicada.
 * Delegado en `formatMoneda` (`src/lib/utils/moneda.ts`). El `locale` es
 * opcional para no romper a los llamadores antiguos; respaldo `es-CO`.
 */
export function formatMonedaSinDecimales(value: number | string, currency: string = 'COP', locale?: string): string {
  return formatMoneda(Math.round(Number(value) || 0), currency, { decimals: 0, locale });
}
