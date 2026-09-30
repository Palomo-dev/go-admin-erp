/**
 * Filtros del centro de reportes en la URL (puro: lo usan el inicio, las
 * listas, el visor, los favoritos y los tests). Un enlace copiado abre el
 * mismo reporte con los mismos filtros; la sucursal se vuelve a validar contra
 * el alcance de quien lo abre (`sucursalDeReportes` y la RPC).
 *
 * Parámetros:
 * - `periodo`: tipo de cierre (por defecto `mensual`).
 * - `ref`: un día dentro del periodo (por defecto hoy); con `personalizado`,
 *   `desde` y `hasta`.
 * - `hi` / `hf`: franja horaria `HH:mm` (las dos o ninguna).
 * - `sucursal`: id, o `todas` (consolidado). Sin él manda el selector del
 *   encabezado.
 * - `comparar`: `anterior` | `anio-anterior`.
 * - `vista`: id de la pestaña del visor.
 */
import { esFechaPlana, esHora, esTipoCierre, periodoAnioAnterior, periodoAnterior, resolverPeriodo } from './periodosService';
import type { PeriodoCierre, ReportDefinition, TipoCierre } from './types';

export const COMPARACIONES = ['anterior', 'anio-anterior'] as const;
export type Comparacion = (typeof COMPARACIONES)[number];

export const TIPO_POR_DEFECTO: TipoCierre = 'mensual';

export interface FiltrosReportes {
  periodo: PeriodoCierre;
  /** `undefined`: la del encabezado; `null`: consolidado; número: esa sucursal. */
  sucursal: number | null | undefined;
  comparar: Comparacion | null;
  vista: string | null;
}

type Fuente = { get(clave: string): string | null };

const VISTA_RE = /^[\w-]{1,60}$/;

function esComparacion(v: unknown): v is Comparacion {
  return typeof v === 'string' && (COMPARACIONES as readonly string[]).includes(v);
}

export function leerFiltrosReportes(q: Fuente, hoy: string): FiltrosReportes {
  const tipo = esTipoCierre(q.get('periodo')) ? (q.get('periodo') as TipoCierre) : TIPO_POR_DEFECTO;
  const ref = q.get('ref');
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  const base =
    tipo === 'personalizado'
      ? resolverPeriodo('personalizado', hoy, esFechaPlana(desde) && esFechaPlana(hasta) ? { from: desde, to: hasta } : undefined)
      : resolverPeriodo(tipo, esFechaPlana(ref) && ref <= hoy ? ref : hoy);
  const hi = q.get('hi');
  const hf = q.get('hf');
  const periodo: PeriodoCierre = esHora(hi) && esHora(hf) ? { ...base, horaInicio: hi, horaFin: hf } : base;

  const s = q.get('sucursal');
  const sucursal = s === 'todas' ? null : s && /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : undefined;
  const comparar = q.get('comparar');
  const vista = q.get('vista');
  return {
    periodo,
    sucursal,
    comparar: esComparacion(comparar) ? comparar : null,
    vista: vista && VISTA_RE.test(vista) ? vista : null,
  };
}

/**
 * Parámetros de la URL de unos filtros, sin los valores por defecto. `hoy`
 * decide si `ref` hace falta (el periodo que contiene hoy no lo lleva).
 */
export function escribirFiltrosReportes(f: Partial<FiltrosReportes>, hoy: string): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.periodo) {
    const p = f.periodo;
    if (p.tipo !== TIPO_POR_DEFECTO) q.periodo = p.tipo;
    if (p.tipo === 'personalizado') {
      q.desde = p.fechaInicio;
      q.hasta = p.fechaFin;
    } else if (!(p.fechaInicio <= hoy && hoy <= p.fechaFin)) {
      q.ref = p.fechaInicio;
    }
    if (p.horaInicio && p.horaFin) {
      q.hi = p.horaInicio;
      q.hf = p.horaFin;
    }
  }
  if (f.sucursal === null) q.sucursal = 'todas';
  else if (typeof f.sucursal === 'number') q.sucursal = String(f.sucursal);
  if (f.comparar) q.comparar = f.comparar;
  if (f.vista) q.vista = f.vista;
  return q;
}

/** Query string (`?a=b`, o vacío) de unos parámetros. */
export function aQuery(q: Record<string, string>): string {
  const s = new URLSearchParams(q).toString();
  return s ? `?${s}` : '';
}

/**
 * Lo que el reporte realmente usa de los filtros: sin franja si no la admite,
 * sin comparativo si no depende del periodo y sin sucursal si es de toda la
 * organización. La vista solo si existe en el resultado (la valida quien pinta).
 */
export function filtrosEfectivos(def: Pick<ReportDefinition, 'filtros' | 'alcance'>, f: FiltrosReportes, sucursal: number | null): FiltrosReportes & { sucursal: number | null } {
  const franja = def.filtros.includes('franja');
  return {
    periodo: franja ? f.periodo : { ...f.periodo, horaInicio: null, horaFin: null },
    sucursal: def.alcance === 'organizacion' ? null : sucursal,
    comparar: def.filtros.includes('comparativo') ? f.comparar : null,
    vista: f.vista,
  };
}

/** Periodo de referencia del comparativo, o `null`. */
export function periodoComparado(p: PeriodoCierre, comparar: Comparacion | null): PeriodoCierre | null {
  if (comparar === 'anterior') return periodoAnterior(p);
  if (comparar === 'anio-anterior') return periodoAnioAnterior(p);
  return null;
}

/** Opciones del documento `reporte` (`/api/documentos/reporte/<id>`) con los filtros efectivos. */
export function parametrosDocumento(f: FiltrosReportes & { sucursal: number | null }): {
  desde: string;
  hasta: string;
  parametros: Record<string, string>;
} {
  const parametros: Record<string, string> = { periodo: f.periodo.tipo };
  if (f.sucursal !== null) parametros.sucursal = String(f.sucursal);
  if (f.periodo.horaInicio && f.periodo.horaFin) {
    parametros.hi = f.periodo.horaInicio;
    parametros.hf = f.periodo.horaFin;
  }
  if (f.vista) parametros.vista = f.vista;
  if (f.comparar) parametros.comparar = f.comparar;
  return { desde: f.periodo.fechaInicio, hasta: f.periodo.fechaFin, parametros };
}
