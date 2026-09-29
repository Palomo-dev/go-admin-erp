'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

/**
 * Datos de apoyo de Planes que `/api/membresias/planes` no trae: el uuid de cada producto
 * (las rutas de inventario van por uuid) y el nombre de las sedes (texto de «Acceso»).
 * Lectura con el cliente del navegador, RLS por pertenencia y filtro de la organización activa.
 * Si falla, las pantallas siguen: sin uuid no se ofrece «Editar producto» y las sedes se cuentan.
 */
export interface ContextoPlanes {
  uuidProducto: ReadonlyMap<number, string>;
  nombreSede: ReadonlyMap<number, string>;
}

const VACIO: ContextoPlanes = { uuidProducto: new Map(), nombreSede: new Map() };

export async function cargarContextoPlanes(productIds: readonly number[]): Promise<ContextoPlanes> {
  const org = getOrganizationId();
  if (!(org > 0)) return VACIO;
  const ids = Array.from(new Set(productIds.filter((n) => Number.isInteger(n) && n > 0)));
  const [productos, sedes] = await Promise.all([
    ids.length > 0
      ? supabase.from('products').select('id, uuid').eq('organization_id', org).in('id', ids)
      : Promise.resolve({ data: [] as { id: number; uuid: string }[], error: null }),
    supabase.from('branches').select('id, name').eq('organization_id', org),
  ]);
  return {
    uuidProducto: new Map(((productos.data ?? []) as { id: number; uuid: string | null }[]).filter((p) => p.uuid).map((p) => [Number(p.id), String(p.uuid)])),
    nombreSede: new Map(((sedes.data ?? []) as { id: number; name: string | null }[]).map((s) => [Number(s.id), s.name ?? `#${s.id}`])),
  };
}

/** `clave` cambia cuando cambian los productos a resolver. */
export function useContextoPlanes(productIds: readonly number[]): ContextoPlanes {
  const [ctx, setCtx] = useState<ContextoPlanes>(VACIO);
  const clave = Array.from(new Set(productIds)).sort((a, b) => a - b).join(',');
  useEffect(() => {
    let vivo = true;
    cargarContextoPlanes(clave ? clave.split(',').map(Number) : [])
      .then((c) => {
        if (vivo) setCtx(c);
      })
      .catch(() => {
        if (vivo) setCtx(VACIO);
      });
    return () => {
      vivo = false;
    };
  }, [clave]);
  return ctx;
}
