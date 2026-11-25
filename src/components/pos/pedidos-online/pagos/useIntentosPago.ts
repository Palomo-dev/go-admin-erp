'use client';

/**
 * Intentos de pago de un pedido y su vencimiento, para la tarjeta «Pagos» del detalle.
 * Cliente de navegador (RLS: solo miembros activos de la organización leen la tabla; la RPC
 * filtra igual). Se recarga cuando cambia el pedido (estado, pago o `updated_at`).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { COLUMNAS_INTENTO, type IntentoPago, type ResumenPago } from '@/lib/pos/pedidosWeb/intentosPago';

export interface DatosIntentosPago {
  intentos: IntentoPago[];
  /** Hora en que vence el pedido sin pagar (misma regla de `expire_pending_web_orders`). */
  venceAt: string | null;
  plazoMinutos: number | null;
  cargando: boolean;
}

const VACIO: DatosIntentosPago = { intentos: [], venceAt: null, plazoMinutos: null, cargando: false };

interface PedidoClave {
  id: string;
  organization_id: number;
  status?: string | null;
  payment_status?: string | null;
  updated_at?: string | null;
}

export function useIntentosPago(order: PedidoClave | null | undefined): DatosIntentosPago & { recargar: () => void } {
  const [datos, setDatos] = useState<DatosIntentosPago>(VACIO);
  const [vuelta, setVuelta] = useState(0);
  const id = order?.id ?? null;
  const org = order?.organization_id ?? null;
  const estado = order?.status ?? null;
  const pago = order?.payment_status ?? null;
  const actualizado = order?.updated_at ?? null;

  useEffect(() => {
    if (!id || org === null) {
      setDatos(VACIO);
      return;
    }
    let vivo = true;
    setDatos((d) => ({ ...d, cargando: true }));
    void Promise.all([
      supabase
        .from('web_order_payment_attempts')
        .select(COLUMNAS_INTENTO)
        .eq('web_order_id', id)
        .eq('organization_id', org)
        .order('created_at', { ascending: true }),
      supabase.rpc('fn_web_orders_resumen_pago', { p_ids: [id] }),
    ]).then(([intentos, resumen]) => {
      if (!vivo) return;
      const fila = ((resumen.data ?? []) as ResumenPago[]).find((r) => r.web_order_id === id) ?? null;
      setDatos({
        intentos: intentos.error ? [] : ((intentos.data ?? []) as unknown as IntentoPago[]),
        venceAt: fila?.vence_at ?? null,
        plazoMinutos: fila?.plazo_minutos ?? null,
        cargando: false,
      });
    }, () => {
      // Sin intentos (red caída): la tarjeta queda como antes de esta función.
      if (vivo) setDatos(VACIO);
    });
    return () => {
      vivo = false;
    };
    // Se recarga cuando el pedido cambia de estado o de pago (o se pide a mano).
  }, [id, org, estado, pago, actualizado, vuelta]);

  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...datos, recargar };
}
