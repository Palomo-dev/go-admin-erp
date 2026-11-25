/**
 * Finanzas › Movimientos / Ingresos / Egresos con el recaudo por medio (Figma «05 POS y ventas»
 * 3300-420896, aprobado el 2026-11-25). Puro: lo prueba `__tests__/movimientosRecaudo.test.ts`.
 *
 * - Lo cobrado por pasarela o datáfono se ve EL DÍA DEL COBRO (antes solo aparecía con el abono):
 *   una fila «Por abonar» por pago, desde `payments` (está en la CxC del procesador, 138020xx).
 * - Los abonos del procesador al banco (`payment_processor_payouts`) son TRASLADOS: se ven como
 *   «Bold → Bancolombia» y NO suman a Recaudado (decisión 6: ya se contaron al cobrar).
 * - Fecha (con «Hoy» por defecto) y medio filtran filas y tarjetas. El medio de una fila de caja
 *   es efectivo y el de una de banco, transferencia; un traslado no tiene medio.
 */
import type { FilaMovimiento } from '@/lib/finanzas/tesoreria/movimientosLista';
import { esMedioPasarela, type ClaveMedio, type PagoRecaudo } from './recaudoPorMedio';

/** ¿El pago queda en la CxC de un procesador hasta el abono? (pasarela o datáfono). */
export function esCobroPorAbonar(p: Pick<PagoRecaudo, 'medio'>): boolean {
  return esMedioPasarela(p.medio) || p.medio === 'datafono';
}

export interface TextosFilaPago {
  /** «Pedido online · WO-…», «Venta · FV-…» o «Cobro». */
  concepto: (p: PagoRecaudo) => string;
  /** «Bold · Nequi», «Datáfono». */
  detalle: (p: PagoRecaudo) => string | null;
  /** «Bold · 13802003». */
  cuenta: (p: PagoRecaudo) => string;
}

export function filaDeCobroPasarela(p: PagoRecaudo, textos: TextosFilaPago): FilaMovimiento {
  return {
    clave: `pasarela:${p.id}`,
    fuente: 'pasarela',
    tipo: 'entrada',
    id: p.id,
    uuid: p.id,
    fecha: p.fecha,
    concepto: textos.concepto(p),
    categoria: textos.detalle(p),
    cuenta: textos.cuenta(p),
    cuentaDestino: null,
    importe: p.monto,
    notas: null,
    referencia: p.referencia,
    anulado: false,
    esReverso: false,
    conciliacion: 'porAbonar',
    href: p.pedidoId ? `/app/pos/pedidos-online/${p.pedidoId}` : p.ventaId ? `/app/pos/ventas/${p.ventaId}` : '/app/finanzas/tesoreria/procesadores-pago',
  };
}

/** Abono de un procesador al banco tal como lo lee la pantalla (`payment_processor_payouts`). */
export interface AbonoOrigen {
  id: string;
  procesador: string;
  /** Instante del abono (la pantalla convierte `payout_date` a mediodía en la zona de la organización). */
  fecha: string;
  neto: number;
  bruto: number;
  referencia: string | null;
  banco: string | null;
}

export function filaDeAbono(a: AbonoOrigen, textos: { concepto: (a: AbonoOrigen) => string; procesador: (codigo: string) => string; nota: string }): FilaMovimiento {
  return {
    clave: `abono:${a.id}`,
    fuente: 'abono',
    tipo: 'traslado',
    id: a.id,
    uuid: a.id,
    fecha: a.fecha,
    concepto: textos.concepto(a),
    categoria: textos.nota,
    cuenta: textos.procesador(a.procesador),
    cuentaDestino: a.banco,
    importe: a.neto,
    notas: textos.nota,
    referencia: a.referencia,
    anulado: false,
    esReverso: false,
    conciliacion: 'conciliado',
    href: '/app/finanzas/tesoreria/procesadores-pago?pestana=abonos',
  };
}

/** Medio de una fila para el filtro: caja = efectivo, banco = transferencia, cobro = su medio. */
export function medioDeFila(f: FilaMovimiento, mediosCobro: ReadonlyMap<string, ClaveMedio>): ClaveMedio | null {
  if (f.fuente === 'caja') return 'efectivo';
  if (f.fuente === 'banco') return 'transferencia';
  if (f.fuente === 'pasarela') return mediosCobro.get(f.id) ?? null;
  return null;
}

/**
 * Filas del periodo (día de la ORGANIZACIÓN: `diaDe` = `toDate` de `useFormatDate`) y de los medios
 * elegidos. Con un medio elegido, los traslados y abonos salen (no son de ningún medio).
 */
export function filtrarFilasRecaudo(
  filas: readonly FilaMovimiento[],
  rango: { desde: string; hasta: string } | null,
  diaDe: (iso: string) => string,
  medios: readonly ClaveMedio[],
  mediosCobro: ReadonlyMap<string, ClaveMedio>,
): FilaMovimiento[] {
  const elegidos = new Set(medios);
  return filas.filter((f) => {
    if (rango) {
      const dia = diaDe(f.fecha);
      if (dia < rango.desde || dia > rango.hasta) return false;
    }
    if (elegidos.size === 0) return true;
    const medio = medioDeFila(f, mediosCobro);
    return medio !== null && elegidos.has(medio);
  });
}

export interface TarjetasMovimientos {
  salidas: number;
  conteoSalidas: number;
  /** Lo cobrado por pasarelas y datáfono en el periodo (aún en 138020xx hasta el abono). */
  porAbonar: number;
  conteoPorAbonar: number;
  /** Medios con cobro por abonar (para el detalle «Bold, Mercado Pago y datáfono»). */
  mediosPorAbonar: ClaveMedio[];
  /** Abonos registrados (traslados): se muestran, no suman. */
  abonos: number;
}

export function tarjetasMovimientos(filas: readonly FilaMovimiento[], pagos: readonly PagoRecaudo[]): TarjetasMovimientos {
  const r: TarjetasMovimientos = { salidas: 0, conteoSalidas: 0, porAbonar: 0, conteoPorAbonar: 0, mediosPorAbonar: [], abonos: 0 };
  for (const f of filas) {
    if (f.anulado || f.esReverso) continue;
    if (f.tipo === 'salida') {
      r.salidas += f.importe;
      r.conteoSalidas += 1;
    } else if (f.fuente === 'abono') {
      r.abonos += f.importe;
    }
  }
  const medios = new Set<ClaveMedio>();
  for (const p of pagos) {
    if (!esCobroPorAbonar(p)) continue;
    r.porAbonar += p.monto;
    r.conteoPorAbonar += 1;
    medios.add(p.medio);
  }
  r.mediosPorAbonar = [...medios];
  r.salidas = Math.round(r.salidas * 100) / 100;
  r.porAbonar = Math.round(r.porAbonar * 100) / 100;
  r.abonos = Math.round(r.abonos * 100) / 100;
  return r;
}
