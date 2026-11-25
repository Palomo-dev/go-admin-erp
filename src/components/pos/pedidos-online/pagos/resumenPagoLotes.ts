'use client';

/**
 * Resumen de pago (vence, intentos, último evento) de los pedidos del listado, por lotes:
 * cada celda pide su pedido y en la misma microtarea sale UNA sola llamada a
 * `fn_web_orders_resumen_pago(p_ids)` (máx. 200 ids por llamada) para toda la página. La caché
 * va por id + `updated_at`: si el pedido cambia, la celda vuelve a pedir el suyo. Así la tabla no
 * necesita cargar nada aparte.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase/config';
import type { ResumenPago } from '@/lib/pos/pedidosWeb/intentosPago';

const MAX_IDS = 200;
const MAX_CACHE = 2000;

/** clave (`id|updated_at`) → resumen (`null` = el pedido no devolvió fila). */
const cache = new Map<string, ResumenPago | null>();
/** id → clave pedida en este lote. */
const pendientes = new Map<string, string>();
const enVuelo = new Set<string>();
const oyentes = new Set<() => void>();
let programado = false;

const claveDe = (id: string, version?: string | null) => `${id}|${version ?? ''}`;

function avisar() {
  oyentes.forEach((o) => o());
}

async function cargarLote() {
  programado = false;
  const lote = Array.from(pendientes.entries());
  pendientes.clear();
  if (!lote.length) return;
  lote.forEach(([, clave]) => enVuelo.add(clave));
  for (let i = 0; i < lote.length; i += MAX_IDS) {
    const parte = lote.slice(i, i + MAX_IDS);
    try {
      const { data, error } = await supabase.rpc('fn_web_orders_resumen_pago', { p_ids: parte.map(([id]) => id) });
      const filas = new Map(((error ? [] : data ?? []) as ResumenPago[]).map((r) => [r.web_order_id, r]));
      if (cache.size > MAX_CACHE) cache.clear();
      for (const [id, clave] of parte) cache.set(clave, error ? null : filas.get(id) ?? null);
    } catch {
      for (const [, clave] of parte) cache.set(clave, null);
    } finally {
      parte.forEach(([, clave]) => enVuelo.delete(clave));
    }
  }
  avisar();
}

function pedir(id: string, clave: string) {
  if (cache.has(clave) || enVuelo.has(clave)) return;
  pendientes.set(id, clave);
  if (!programado) {
    programado = true;
    queueMicrotask(() => void cargarLote());
  }
}

function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/**
 * Resumen de pago de un pedido del listado: `undefined` mientras carga, `null` si no hay.
 * `version` (el `updated_at` del pedido) invalida la caché cuando el pedido cambia.
 */
export function useResumenPago(id: string, version?: string | null, activo = true): ResumenPago | null | undefined {
  const clave = claveDe(id, version);
  useEffect(() => {
    if (activo) pedir(id, clave);
  }, [id, clave, activo]);
  return useSyncExternalStore(
    suscribir,
    () => (activo ? cache.get(clave) : null),
    () => undefined,
  );
}

/** Solo para pruebas: vacía la caché. */
export function vaciarResumenPago() {
  cache.clear();
  pendientes.clear();
  enVuelo.clear();
}
