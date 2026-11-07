/**
 * Presentación de «Activos fijos» (Figma 36 · F1, F2, G3) sin React: cifras del resumen,
 * buscador y qué campos se bloquean tras la primera depreciación. No calcula depreciación:
 * eso lo hace `fn_depreciar_mes` en la base.
 */

import type { FixedAsset, MotivoPendiente } from './FixedAssetService';

/** Campos que la base no deja cambiar si el activo ya tiene depreciación (`fn_trg_activo_con_depreciacion`). */
export const CAMPOS_BLOQUEADOS_TRAS_DEPRECIAR = [
  'acquisition_date',
  'acquisition_cost',
  'salvage_value',
  'useful_life_months',
  'depreciation_method',
] as const;

/**
 * El activo ya tiene depreciación contabilizada. La fuente es el detalle
 * (`asset_depreciations`), que es lo que mira el trigger; la acumulada queda como respaldo
 * por si la lectura del detalle no llegó.
 */
export function tieneDepreciacion(activo: Pick<FixedAsset, 'accumulated_depreciation'> & { depreciaciones?: number | null }): boolean {
  return (activo.depreciaciones ?? 0) > 0 || Number(activo.accumulated_depreciation) > 0;
}

export interface ResumenActivos {
  costoTotal: number;
  depreciacionAcumulada: number;
  valorEnLibros: number;
  /** Activos activos que el proceso no puede depreciar (`fn_depreciacion_estado.bloqueos`). */
  pendientes: number;
  /** El motivo, si todos los pendientes comparten el mismo; si no, `null`. */
  motivoComun: MotivoPendiente | null;
}

export function resumenActivos(
  activos: readonly Pick<FixedAsset, 'id' | 'acquisition_cost' | 'accumulated_depreciation' | 'current_value'>[],
  bloqueos: readonly { activo_id: string; motivo: MotivoPendiente }[],
): ResumenActivos {
  let costo = 0;
  let acumulada = 0;
  let libros = 0;
  for (const a of activos) {
    costo += Number(a.acquisition_cost) || 0;
    acumulada += Number(a.accumulated_depreciation) || 0;
    libros += Number(a.current_value) || 0;
  }
  const ids = new Set(activos.map((a) => a.id));
  const propios = bloqueos.filter((b) => ids.has(b.activo_id));
  const motivos = new Set(propios.map((b) => b.motivo));
  return {
    costoTotal: redondear(costo),
    depreciacionAcumulada: redondear(acumulada),
    valorEnLibros: redondear(libros),
    pendientes: propios.length,
    motivoComun: motivos.size === 1 ? [...motivos][0] : null,
  };
}

/** Busca por código o nombre, sin tildes ni mayúsculas. */
export function filtrarActivos<T extends Pick<FixedAsset, 'code' | 'name'>>(activos: readonly T[], termino: string): T[] {
  const q = normalizar(termino);
  if (!q) return [...activos];
  return activos.filter((a) => normalizar(a.code).includes(q) || normalizar(a.name).includes(q));
}

/** «Depreciar» solo existe con activos: en el vacío (G3) no se ofrece. */
export function mostrarDepreciar(cantidad: number): boolean {
  return cantidad > 0;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Mes de la primera cuota (`YYYY-MM`): el siguiente al de la adquisición, como en
 * `fn_depreciar_mes` (`date_trunc('month', acquisition_date) + 1 month`). `null` sin fecha válida.
 */
export function mesPrimeraCuota(fechaAdquisicion: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(fechaAdquisicion ?? '');
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return mes === 12 ? `${anio + 1}-01` : `${anio}-${String(mes + 1).padStart(2, '0')}`;
}
