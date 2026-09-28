'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

export interface OpcionMoneda {
  code: string;
  name: string;
}

interface FilaMonedaOrganizacion {
  code: string | null;
  name: string | null;
}

/**
 * Opciones del selector de moneda de los formularios de transporte: las
 * monedas asignadas a la organización (RPC `get_organization_currencies`).
 * Siempre incluye la moneda base y la del documento que se edita, para que el
 * selector nunca quede sin su valor (también si la RPC no responde).
 */
export function useOpcionesMoneda(monedaActual?: string | null) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { code: monedaBase, resuelta } = useMonedaOrganizacion();
  const [deLaOrganizacion, setDeLaOrganizacion] = useState<OpcionMoneda[] | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelado = false;
    supabase
      .rpc('get_organization_currencies', { p_organization_id: orgId })
      .then(({ data, error }) => {
        if (cancelado || error || !Array.isArray(data)) return;
        const opciones: OpcionMoneda[] = [];
        for (const fila of data as FilaMonedaOrganizacion[]) {
          const code = normalizarCodigoMoneda(fila.code);
          if (code && !opciones.some((o) => o.code === code)) {
            opciones.push({ code, name: fila.name?.trim() || code });
          }
        }
        if (opciones.length > 0) setDeLaOrganizacion(opciones);
      });
    return () => {
      cancelado = true;
    };
  }, [orgId]);

  const opciones = useMemo(() => {
    const lista = [...(deLaOrganizacion ?? [])];
    for (const extra of [resuelta ? monedaBase : null, monedaActual]) {
      const code = normalizarCodigoMoneda(extra);
      if (code && !lista.some((o) => o.code === code)) lista.push({ code, name: code });
    }
    return lista;
  }, [deLaOrganizacion, resuelta, monedaBase, monedaActual]);

  return { opciones, monedaBase, resuelta };
}
