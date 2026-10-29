'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Cotizacion } from '@/lib/services/webOrderChanges/cotizarCambio';

export interface CambioPedido {
  id: string;
  estado: 'draft' | 'pending_payment' | 'pending_refund' | 'applied' | 'cancelled' | 'expired';
  delta_total: number;
  payment_link_url: string | null;
  provider_code: string | null;
  expires_at: string | null;
  paid_at: string | null;
  refund_mode: 'gateway' | 'manual' | 'customer_credit' | null;
  refund_status: 'pending' | 'manual_pending' | 'done' | 'failed' | null;
  motivo: string | null;
  created_at: string;
  applied_at: string | null;
  cancelled_at: string | null;
  /** Pago que llegó con el cambio ya cancelado o vencido (no se aplicó). */
  late_payment_at?: string | null;
  alerta?: string | null;
  link_disabled_at?: string | null;
}

export interface RespuestaApi<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/** Cambios de productos del pedido (`/api/web-orders/[id]/changes`). */
export function useCambiosPedido(orderId: string, organizationId: number | null | undefined) {
  const [cambios, setCambios] = useState<CambioPedido[]>([]);
  const [puedeCambiar, setPuedeCambiar] = useState(false);
  const [puedeReembolsar, setPuedeReembolsar] = useState(false);
  const [negocio, setNegocio] = useState('');
  const [pasarelas, setPasarelas] = useState<Array<{ id: string; code: string }>>([]);

  const llamar = useCallback(
    async <T,>(ruta: string, body?: unknown): Promise<RespuestaApi<T>> => {
      try {
        const r = await fetch(`/api/web-orders/${encodeURIComponent(orderId)}/changes${ruta}`, {
          method: body === undefined ? 'GET' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json = await r.json().catch(() => ({}));
        return r.ok ? { ok: true, data: json as T } : { ok: false, error: json.error, code: json.code };
      } catch {
        return { ok: false, code: 'RED' };
      }
    },
    [orderId, organizationId],
  );

  const recargar = useCallback(async () => {
    const r = await llamar<{ cambios: CambioPedido[]; puedeCambiar: boolean; puedeReembolsar: boolean; negocio: string; pasarelas: Array<{ id: string; code: string }> }>('');
    if (r.ok && r.data) {
      setCambios(r.data.cambios);
      setPuedeCambiar(r.data.puedeCambiar);
      setPuedeReembolsar(r.data.puedeReembolsar);
      setPasarelas(r.data.pasarelas);
      setNegocio(r.data.negocio);
    }
  }, [llamar]);

  useEffect(() => {
    if (organizationId) void recargar();
  }, [organizationId, recargar]);

  const cotizar = (items: Array<{ product_id: number; quantity: number }>) =>
    llamar<{ cotizacion: Cotizacion }>('', { items, soloCotizar: true });
  const crear = (items: Array<{ product_id: number; quantity: number }>, motivo: string) =>
    llamar<{ cotizacion: Cotizacion; change: CambioPedido }>('', { items, motivo });
  const aplicar = (id: string, body: { reembolso?: 'refund' | 'customer_credit'; connection_id?: string | null }) =>
    llamar<{ cambio: CambioPedido; accion: 'link' | 'aplicado' | 'ya_aplicado' }>(`/${id}/apply`, body);
  const cancelar = (id: string) => llamar(`/${id}/cancel`, {});
  const enviarCorreo = (id: string) => llamar(`/${id}/send`, {});
  const reembolsoHecho = (id: string) => llamar(`/${id}/refund-done`, {});

  const abierto = cambios.find((c) => ['draft', 'pending_payment', 'pending_refund'].includes(c.estado)) ?? null;
  return { cambios, abierto, negocio, puedeCambiar, puedeReembolsar, pasarelas, recargar, cotizar, crear, aplicar, cancelar, enviarCorreo, reembolsoHecho };
}
