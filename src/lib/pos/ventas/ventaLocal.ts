/**
 * Fila de `sales` de la réplica local del Desktop → fila del listado de ventas
 * (`FilaVenta`), para el modo sin red de `clienteVentas.ts`. Módulo hoja.
 * Sin documentos, métodos ni devoluciones: la réplica no los trae.
 */
import { estadoVenta, origenVenta } from './estadoVenta';
import type { FilaVenta } from './listadoServidor';

export interface FilaSalesLocal {
  id: string;
  sale_date: string | null;
  created_at: string | null;
  total: number | string | null;
  balance: number | string | null;
  status: string | null;
  payment_status: string | null;
  source: string | null;
  web_order_id?: string | null;
  table_session_id?: string | null;
  customer_id: string | null;
  user_id: string | null;
  branch_id: number | null;
  pending_sync?: boolean | null;
}

/** Fila de `sales` de la réplica → fila del listado (sin documentos: no están en la réplica). */
export function filaVentaLocal(s: FilaSalesLocal, cliente?: { nombre: string | null; documento: string | null }): FilaVenta {
  const total = Number(s.total) || 0;
  return {
    id: s.id,
    fecha: s.sale_date ?? s.created_at ?? '',
    creada: s.created_at ?? s.sale_date ?? '',
    total,
    saldo: Number(s.balance) || 0,
    status: s.status ?? '',
    payment_status: s.payment_status,
    estado: estadoVenta({ status: s.status, payment_status: s.payment_status, total, pendiente_sync: s.pending_sync }),
    origen: origenVenta({ source: s.source, web_order_id: s.web_order_id, table_session_id: s.table_session_id }),
    numero: null,
    tipo_numero: null,
    factura_id: null,
    cxc_id: null,
    web_order_id: s.web_order_id ?? null,
    cliente: s.customer_id ? { id: s.customer_id, nombre: cliente?.nombre ?? null, documento: cliente?.documento ?? null } : null,
    cajero: { id: s.user_id ?? '', nombre: null },
    sucursal: { id: s.branch_id ?? 0, nombre: null },
    metodos: [],
    devuelto: 0,
    notas_credito: 0,
  };
}
