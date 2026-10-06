'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { movimientosService } from '@/lib/services/movimientosService';
import { webOrderConfirmationService } from '@/lib/services/webOrderConfirmationService';
import type { WebOrder } from '@/lib/services/webOrdersService';

/**
 * Lo que el detalle del pedido web muestra alrededor del cobro (Figma
 * `1981:175699`, tarjetas «Pagos» y «Documentos y trazabilidad»), leído de la
 * base. Columnas verificadas por MCP (2026-10-06): `invoice_sales(id, number,
 * status, sale_id)`, `kitchen_tickets(id, sale_id)`, `payments(source,
 * source_id, method, amount, status, payment_date, voided_at)` y
 * `stock_reservations(ref_type='web_order', ref_id, released_at)`.
 *
 * La caja sale de `fn_caja_abierta_para` (vía `movimientosService`), la misma
 * regla con que `fn_cobrar_pedido_web_en_caja` elige la caja al cobrar.
 */
export interface PagoDelPedido {
  id: string;
  metodo: string;
  monto: number;
  estado: string;
  fecha: string | null;
}

export interface TrazabilidadPedido {
  /** La base ya tiene el cobro en caja (E4). Mientras no, el cobro usa el respaldo sin caja. */
  cobroEnCaja: boolean;
  /** Caja abierta de la sede del pedido (id de `cash_sessions`), o null. */
  cajaId: number | null;
  factura: { id: string; numero: string | null } | null;
  comandaId: number | null;
  pagos: PagoDelPedido[];
  reservaActiva: boolean;
}

const VACIA: TrazabilidadPedido = {
  cobroEnCaja: false,
  cajaId: null,
  factura: null,
  comandaId: null,
  pagos: [],
  reservaActiva: false,
};

export function useTrazabilidadPedido(order: WebOrder | null) {
  const [datos, setDatos] = useState<TrazabilidadPedido>(VACIA);
  const [cargando, setCargando] = useState(true);

  const orderId = order?.id;
  const orgId = order?.organization_id;
  const branchId = order?.branch_id ?? null;
  const saleId = order?.sale_id ?? null;
  // Cada recarga del pedido (cobro, cambio de estado) vuelve a leer pagos y documentos.
  const version = order?.updated_at;

  const recargar = useCallback(async () => {
    if (!orderId || !orgId) return;
    setCargando(true);
    try {
      const [cobroEnCaja, cajaId, factura, comanda, reserva] = await Promise.all([
        webOrderConfirmationService.cobroEnCajaDisponible().catch(() => false),
        movimientosService.getOpenSessionIdForBranch(branchId).catch(() => null),
        saleId
          ? supabase
              .from('invoice_sales')
              .select('id, number')
              .eq('organization_id', orgId)
              .eq('sale_id', saleId)
              .neq('status', 'void')
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        saleId
          ? supabase
              .from('kitchen_tickets')
              .select('id')
              .eq('organization_id', orgId)
              .eq('sale_id', saleId)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('stock_reservations')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('ref_type', 'web_order')
          .eq('ref_id', orderId)
          .is('released_at', null),
      ]);

      const fila = factura.data as { id: string; number: string | null } | null;
      const filtroPagos = fila
        ? `and(source.eq.web_order,source_id.eq.${orderId}),and(source.eq.invoice_sales,source_id.eq.${fila.id})`
        : `and(source.eq.web_order,source_id.eq.${orderId})`;
      const { data: pagos } = await supabase
        .from('payments')
        .select('id, method, amount, status, payment_date, created_at')
        .eq('organization_id', orgId)
        .is('voided_at', null)
        .or(filtroPagos)
        .order('created_at', { ascending: true });

      setDatos({
        cobroEnCaja,
        cajaId,
        factura: fila ? { id: fila.id, numero: fila.number } : null,
        comandaId: (comanda.data as { id: number } | null)?.id ?? null,
        pagos: ((pagos ?? []) as Array<{ id: string; method: string; amount: number; status: string; payment_date: string | null; created_at: string }>).map(
          (p) => ({ id: p.id, metodo: p.method, monto: Number(p.amount) || 0, estado: p.status, fecha: p.payment_date ?? p.created_at }),
        ),
        reservaActiva: (('count' in reserva ? reserva.count : 0) ?? 0) > 0,
      });
    } catch (error) {
      console.error('Error leyendo la trazabilidad del pedido:', error);
    } finally {
      setCargando(false);
    }
  }, [orderId, orgId, branchId, saleId]);

  useEffect(() => {
    void recargar();
  }, [recargar, version]);

  return { ...datos, cargando, recargar };
}
