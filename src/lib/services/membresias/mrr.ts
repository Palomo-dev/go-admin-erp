/**
 * Ingreso recurrente mensual (MRR) de membresías: funciones puras.
 *
 * - El precio de un plan es el precio VIGENTE de su producto en `product_prices` (P9), nunca
 *   `membership_plans.price` (copia para master y goadmin-websites que se retira).
 * - Ese precio cubre `duration_value` periodos de `duration_unit`; el MRR lo lleva a un mes:
 *   1 mes → precio; 3 meses → precio / 3; 1 año → precio / 12;
 *   15 días → precio · (365/12) / 15; 1 semana → precio · (365/12) / 7.
 *   Días y semanas usan el mes promedio del año (365/12 = 30,42 días), no el mes de 30 días de
 *   `duration_days`, para que 12 cuotas mensuales sumen el año.
 * - Solo suman las membresías que dan acceso hoy: activas y en gracia (`estadoVisual`, la misma
 *   regla que los badges y el check-in). Pendientes, congeladas, vencidas y canceladas no.
 */
import { estadoVisual, type MembresiaParaEstado, type UnidadDuracion } from './vigencia';

/** Días de un mes promedio (año de 365 días / 12). */
export const DIAS_POR_MES = 365 / 12;

const UNIDADES: readonly UnidadDuracion[] = ['day', 'week', 'month', 'year'];

export interface DuracionPlan {
  duration_unit?: string | null;
  duration_value?: number | string | null;
  /** Columna vieja (siempre en días). Respaldo si faltara la unidad o el valor. */
  duration_days?: number | string | null;
}

/** Unidad y cantidad de periodos del plan, con respaldo en `duration_days`. */
export function duracionDelPlan(plan: DuracionPlan): { unidad: UnidadDuracion; valor: number } {
  const unidad = UNIDADES.find((u) => u === plan.duration_unit);
  const valor = Number(plan.duration_value);
  if (unidad && Number.isFinite(valor) && valor >= 1) return { unidad, valor };
  const dias = Number(plan.duration_days);
  return { unidad: 'day', valor: Number.isFinite(dias) && dias >= 1 ? dias : 30 };
}

/** Cuántas veces cabe un periodo completo del plan en un mes. */
export function periodosPorMes(unidad: UnidadDuracion, valor: number): number {
  const v = Number.isFinite(valor) && valor >= 1 ? valor : 1;
  switch (unidad) {
    case 'day':
      return DIAS_POR_MES / v;
    case 'week':
      return DIAS_POR_MES / (7 * v);
    case 'year':
      return 1 / (12 * v);
    default:
      return 1 / v;
  }
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cuota mensual equivalente de un precio que cubre `valor` periodos de `unidad`. */
export function cuotaMensual(precio: number, unidad: UnidadDuracion, valor: number): number {
  const p = Number(precio);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return redondear(p * periodosPorMes(unidad, valor));
}

export interface FilaPrecio {
  product_id: number | string;
  price: number | string;
  effective_from: string;
  effective_to?: string | null;
  id?: number | string | null;
}

/**
 * Precio vigente por producto: la fila con el `effective_from` más reciente que ya empezó y no
 * terminó (misma regla que `fn_membresias_int_precio_vigente` y el POS).
 */
export function preciosVigentesPorProducto(filas: FilaPrecio[], ahora: Date): Map<number, number> {
  const t = ahora.getTime();
  const elegida = new Map<number, { desde: number; id: number; precio: number }>();
  for (const f of filas) {
    const desde = new Date(f.effective_from).getTime();
    if (!Number.isFinite(desde) || desde > t) continue;
    if (f.effective_to && new Date(f.effective_to).getTime() <= t) continue;
    const pid = Number(f.product_id);
    const id = Number(f.id ?? 0);
    const actual = elegida.get(pid);
    if (!actual || desde > actual.desde || (desde === actual.desde && id > actual.id)) {
      elegida.set(pid, { desde, id, precio: Number(f.price) });
    }
  }
  return new Map(Array.from(elegida, ([pid, v]) => [pid, v.precio]));
}

/** ¿La membresía suma al MRR hoy? Activa o en gracia. */
export function sumaAlMrr(m: MembresiaParaEstado, ahora: Date, tz: string): boolean {
  const { estado } = estadoVisual(m, ahora, tz);
  return estado === 'activa' || estado === 'en_gracia';
}

export interface MembresiaMrr extends MembresiaParaEstado {
  plan: (DuracionPlan & { product_id?: number | string | null }) | null;
  /** Producto de la membresía (M3), por si el plan no lo trae. */
  product_id?: number | string | null;
}

/** Cuota mensual de una membresía con el precio vigente de su producto (0 si no tiene precio). */
export function cuotaMensualDeMembresia(m: MembresiaMrr, precios: Map<number, number>): number {
  const pid = Number(m.plan?.product_id ?? m.product_id);
  const precio = Number.isFinite(pid) ? precios.get(pid) : undefined;
  if (precio === undefined) return 0;
  const { unidad, valor } = duracionDelPlan(m.plan ?? {});
  return cuotaMensual(precio, unidad, valor);
}

/** MRR: suma de las cuotas mensuales de las membresías activas o en gracia. */
export function calcularMrr(membresias: MembresiaMrr[], precios: Map<number, number>, ahora: Date, tz: string): number {
  const total = membresias
    .filter((m) => sumaAlMrr(m, ahora, tz))
    .reduce((s, m) => s + cuotaMensualDeMembresia(m, precios), 0);
  return redondear(total);
}
