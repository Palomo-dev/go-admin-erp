/**
 * Acciones en lote del listado de facturas de venta (Figma «Facturas de venta —
 * selección y acciones en lote»). Módulo hoja, sin React: decide QUÉ se puede
 * hacer con la selección; el trabajo lo hacen las rutas que ya existen
 * (`POST /api/pagos` con el reparto del cliente, `POST /api/facturas-venta/[id]/anular`,
 * el motor de documentos). Ninguna regla nueva: anular usa `puedeAnular` (L4),
 * la misma que aplica `fn_factura_venta_anular`.
 */
import { puedeAnular, type MotivoNoAnulable } from './reglasFactura';
import type { FilaFacturaListado } from './listadoFacturas';

/** Pestañas de impresión que se abren de una vez (el navegador bloquea más). */
export const MAX_IMPRESION_LOTE = 10;

type FilaLote = Pick<FilaFacturaListado, 'id' | 'numero' | 'estado' | 'tipo' | 'total' | 'saldo' | 'fe' | 'cliente_id'>;

/** Estados con cartera viva: se les puede registrar pago si tienen saldo. */
const ESTADOS_COBRABLES = ['issued', 'partial', 'paid'];

/** La fila admite un pago (misma regla que la acción rápida de la fila). */
export function filaCobrable(f: Pick<FilaFacturaListado, 'estado' | 'saldo' | 'tipo'>): boolean {
  return f.saldo > 0 && ESTADOS_COBRABLES.includes(f.estado) && (f.tipo ?? 'invoice') === 'invoice';
}

export type MotivoPagoLote = 'vacio' | 'sin_permiso' | 'sin_saldo' | 'sin_cliente' | 'varios_clientes';

/**
 * «Registrar pago» en lote. El único flujo que existe para varias facturas es el
 * reparto FIFO del cliente (`RegistrarPagoConectado destino=tercero`): por eso
 * solo aplica a facturas cobrables de UN mismo cliente. Con clientes distintos
 * no se inventa un pago múltiple: el botón queda deshabilitado con el motivo.
 */
export function elegibilidadPagoLote(
  filas: readonly FilaLote[],
  puedeCrear: boolean,
): { ok: true; clienteId: string; facturaIds: string[] } | { ok: false; motivo: MotivoPagoLote } {
  if (filas.length === 0) return { ok: false, motivo: 'vacio' };
  if (!puedeCrear) return { ok: false, motivo: 'sin_permiso' };
  if (filas.some((f) => !filaCobrable(f))) return { ok: false, motivo: 'sin_saldo' };
  if (filas.some((f) => !f.cliente_id)) return { ok: false, motivo: 'sin_cliente' };
  const clientes = new Set(filas.map((f) => f.cliente_id));
  if (clientes.size > 1) return { ok: false, motivo: 'varios_clientes' };
  return { ok: true, clienteId: filas[0].cliente_id as string, facturaIds: filas.map((f) => f.id) };
}

export interface RepartoAnulacion<F extends FilaLote> {
  anulables: F[];
  /** Las que la regla L4 no deja anular directo (con pagos, FE aceptada, ya anulada, nota crédito). */
  excluidas: { fila: F; motivo: MotivoNoAnulable }[];
}

/** Separa la selección en anulables y excluidas, con el motivo de cada excluida. */
export function repartirAnulacion<F extends FilaLote>(filas: readonly F[]): RepartoAnulacion<F> {
  const anulables: F[] = [];
  const excluidas: { fila: F; motivo: MotivoNoAnulable }[] = [];
  for (const f of filas) {
    const r = puedeAnular({ status: f.estado, total: f.total, balance: f.saldo, document_type: f.tipo, einvoice_status: f.fe });
    if (r.ok) anulables.push(f);
    else excluidas.push({ fila: f, motivo: r.motivo });
  }
  return { anulables, excluidas };
}

export interface ResultadoAnulacionLote {
  anuladas: string[];
  fallidas: { id: string; numero: string | null; codigo: string }[];
  /** Avisos del servidor (p. ej. `comision_ya_pagada`), sin repetir. */
  avisos: string[];
}

/**
 * Anula una a una por la ruta existente (cada una en su transacción: si una
 * falla, las demás siguen). `anular` es `anularFacturaVenta` en la pantalla.
 */
export async function anularEnLote(
  filas: readonly Pick<FilaFacturaListado, 'id' | 'numero'>[],
  motivo: string,
  anular: (id: string, motivo: string) => Promise<{ avisos?: string[] } | void>,
  codigoDeError: (e: unknown) => string,
): Promise<ResultadoAnulacionLote> {
  const resultado: ResultadoAnulacionLote = { anuladas: [], fallidas: [], avisos: [] };
  for (const f of filas) {
    try {
      const r = await anular(f.id, motivo);
      resultado.anuladas.push(f.id);
      for (const a of (r && r.avisos) ?? []) if (!resultado.avisos.includes(a)) resultado.avisos.push(a);
    } catch (e) {
      resultado.fallidas.push({ id: f.id, numero: f.numero, codigo: codigoDeError(e) });
    }
  }
  return resultado;
}
