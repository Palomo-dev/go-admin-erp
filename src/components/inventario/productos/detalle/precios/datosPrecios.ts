import type { EventoHistorial } from '@/lib/services/productoService';

/**
 * Historial de precios y costos a partir de `fn_producto_historial` (tipos
 * `precio` y `costo`). Puro: sin React ni Supabase, con «ahora» inyectable.
 *
 * Vigencias (ver fn_producto_int_fijar_precio): una fila con
 * `effective_to <= effective_from` quedó cancelada (se programó y luego se
 * reemplazó); `effective_from` futuro = programada; `effective_to` nulo o
 * futuro = vigente; si no, cerrada.
 */
export type TipoVigencia = 'precio' | 'costo';
export type EstadoVigencia = 'vigente' | 'programado' | 'cancelado' | 'cerrado';

export interface FilaVigencia {
  clave: string;
  tipo: TipoVigencia;
  productId: number;
  productoNombre: string | null;
  valor: number;
  comparacion: number | null;
  anterior: number | null;
  desde: string;
  hasta: string | null;
  cancelado: boolean;
  proveedor: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function aFilasVigencia(eventos: readonly EventoHistorial[]): FilaVigencia[] {
  return eventos
    .filter((e) => e.tipo === 'precio' || e.tipo === 'costo')
    .map((e) => {
      const d = e.detalle;
      const tipo = e.tipo as TipoVigencia;
      return {
        clave: e.clave,
        tipo,
        productId: e.product_id,
        productoNombre: e.producto_nombre,
        valor: num(tipo === 'precio' ? d.precio : d.costo) ?? 0,
        comparacion: tipo === 'precio' ? num(d.comparacion) : null,
        anterior: num(d.anterior),
        desde: texto(d.desde) ?? e.fecha,
        hasta: texto(d.hasta),
        cancelado: d.cancelado === true,
        proveedor: texto(d.proveedor),
      };
    });
}

export function estadoVigencia(f: Pick<FilaVigencia, 'desde' | 'hasta' | 'cancelado'>, ahora: number): EstadoVigencia {
  if (f.cancelado) return 'cancelado';
  if (new Date(f.desde).getTime() > ahora) return 'programado';
  if (f.hasta === null || new Date(f.hasta).getTime() > ahora) return 'vigente';
  return 'cerrado';
}

/** El próximo cambio programado (el más cercano) de un tipo para el producto. */
export function programadoDe(
  filas: readonly FilaVigencia[],
  tipo: TipoVigencia,
  productId: number,
  ahora: number,
): FilaVigencia | null {
  return (
    filas
      .filter((f) => f.tipo === tipo && f.productId === productId && estadoVigencia(f, ahora) === 'programado')
      .sort((a, b) => new Date(a.desde).getTime() - new Date(b.desde).getTime())[0] ?? null
  );
}

export interface PuntoSerie {
  /** Instante (ms). */
  t: number;
  precio: number | null;
  costo: number | null;
}

function valorEn(filas: readonly FilaVigencia[], t: number): number | null {
  let mejor: FilaVigencia | null = null;
  for (const f of filas) {
    const desde = new Date(f.desde).getTime();
    const hasta = f.hasta === null ? Infinity : new Date(f.hasta).getTime();
    if (desde <= t && t < hasta && (!mejor || desde >= new Date(mejor.desde).getTime())) mejor = f;
  }
  return mejor ? mejor.valor : null;
}

/**
 * Serie escalonada para el gráfico: un punto en cada cambio (incluidos los
 * programados) y uno en «ahora», con el precio y el costo que rigen en ese
 * instante. Las filas canceladas no cuentan.
 */
export function serieGrafico(filas: readonly FilaVigencia[], productId: number, ahora: number): PuntoSerie[] {
  const propias = filas.filter((f) => f.productId === productId && !f.cancelado);
  if (propias.length === 0) return [];
  const precios = propias.filter((f) => f.tipo === 'precio');
  const costos = propias.filter((f) => f.tipo === 'costo');
  const tiempos = Array.from(new Set([...propias.map((f) => new Date(f.desde).getTime()), ahora]))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  return tiempos.map((t) => ({ t, precio: valorEn(precios, t), costo: valorEn(costos, t) }));
}
