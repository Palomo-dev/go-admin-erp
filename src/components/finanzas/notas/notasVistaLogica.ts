/**
 * Presentación de las notas crédito y débito (sin React ni servidor): líneas
 * en positivo para `DocumentoLineas`, impuestos agrupados, cadena de
 * documentos y acciones del detalle. Las pantallas `ListadoNotas` y
 * `DetalleNota` la usan; las pruebas la cubren.
 */
import type { LineaFacturaDetalle, PagoFacturaDetalle } from '@/lib/finanzas/ventas/contratoFacturas';
import { anulabilidadNota, puedeEnviarDian, type DetalleNotaExtra, type EstadoDianNota, type TipoNota } from '@/lib/finanzas/notas/contratoNotas';

const c = (n: number) => Math.round(n * 100);

/** Las líneas de una nota crédito se guardan en negativo: en pantalla van en positivo. */
export function lineasEnPositivo(lineas: readonly LineaFacturaDetalle[]): LineaFacturaDetalle[] {
  return lineas.map((l) => ({
    ...l,
    cantidad: Math.abs(l.cantidad),
    descuento: Math.abs(l.descuento || 0),
    total: Math.abs(l.total),
  }));
}

/** Pagado vivo (solo `completed`). */
export function pagadoNota(pagos: readonly Pick<PagoFacturaDetalle, 'estado' | 'monto'>[]): number {
  return pagos.filter((p) => p.estado === 'completed').reduce((s, p) => s + c(p.monto), 0) / 100;
}

export type AccionDetalleNota =
  | 'descargar_pdf'
  | 'imprimir'
  | 'ver_factura'
  | 'ver_saldo_a_favor'
  | 'enviar_dian'
  | 'reintentar_dian'
  | 'registrar_pago'
  | 'anular';

/**
 * Qué ofrece el detalle de la nota. Conserva las acciones del detalle anterior
 * (imprimir, PDF, enviar a la DIAN, reintentar, anular, ver factura) y añade
 * las del diseño (ver saldo a favor, registrar pago en la nota débito).
 */
export function accionesDetalleNota(p: {
  tipo: TipoNota;
  anulada: boolean;
  dian: EstadoDianNota;
  saldo: number;
  tieneFactura: boolean;
  tieneSaldoAFavor: boolean;
  jobId: string | null;
  permisos: { ver: boolean; crear: boolean; anular: boolean };
}): Set<AccionDetalleNota> {
  const a = new Set<AccionDetalleNota>();
  if (!p.permisos.ver) return a;
  if (p.tipo === 'credito') {
    a.add('descargar_pdf');
    a.add('imprimir');
  }
  if (p.tieneFactura) a.add('ver_factura');
  if (p.tieneSaldoAFavor) a.add('ver_saldo_a_favor');
  if (p.tipo === 'credito' && p.permisos.crear && puedeEnviarDian(p.dian, p.anulada)) {
    a.add(p.jobId && (p.dian === 'rechazada' || p.dian === 'error') ? 'reintentar_dian' : 'enviar_dian');
  }
  if (p.tipo === 'debito' && !p.anulada && p.saldo > 0 && p.permisos.crear) a.add('registrar_pago');
  if (!p.anulada && p.permisos.anular) a.add('anular');
  return a;
}

/** Anulabilidad con los datos del detalle (la base lo vuelve a exigir). */
export function anulabilidadDetalle(extra: Pick<DetalleNotaExtra, 'tipo' | 'dian'>, p: { anulada: boolean; pagado: number; permisoAnular: boolean }) {
  return anulabilidadNota({ tipo: extra.tipo, anulada: p.anulada, dian: extra.dian, pagado: p.pagado, permisoAnular: p.permisoAnular });
}

/** Subtítulo de la columna «Concepto DIAN» del listado (clave + valores). */
export function detalleConceptoFila(f: {
  tipo: TipoNota;
  anulada: boolean;
  motivo: string | null;
  excedente: number;
  conProductos: boolean;
  saldo: number;
}): { clave: 'anulada' | 'anuladaSinMotivo' | 'excedente' | 'productos' | 'sinMercancia' | 'porCobrar'; motivo?: string } {
  if (f.anulada) return f.motivo ? { clave: 'anulada', motivo: f.motivo } : { clave: 'anuladaSinMotivo' };
  if (f.tipo === 'debito') return { clave: 'porCobrar' };
  if (f.excedente > 0) return { clave: 'excedente' };
  return { clave: f.conProductos ? 'productos' : 'sinMercancia' };
}
