/**
 * Periodos contables (Figma 991:77842 rejilla del año, 991:78604/991:78713
 * cerrar con avisos o bloqueado). Lógica de presentación sin React ni base:
 * los datos llegan de `PeriodosFiscalesService` y las RPC del cierre.
 *
 * Fechas: `start_date`/`end_date` son `date` (días calendario). Se comparan
 * como texto `YYYY-MM-DD`, nunca convertidos a `Date`.
 */

export interface PeriodoBasico {
  id: string;
  year: number;
  month: number | null;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status: 'open' | 'closing' | 'closed';
}

/** Situación del mes frente a hoy de la organización. */
export type SituacionMes = 'pasado' | 'actual' | 'futuro';

export interface CeldaMes<P extends PeriodoBasico = PeriodoBasico> {
  mes: number;
  /** Periodo mensual del mes, si se generó. */
  periodo: P | null;
  situacion: SituacionMes;
  /** Mes pasado y abierto: hay que cerrarlo. */
  pendienteDeCierre: boolean;
}

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Años con periodos, más el actual; del más reciente al más antiguo. */
export function aniosDisponibles(periodos: readonly PeriodoBasico[], anioHoy: number): number[] {
  const anios = new Set<number>(periodos.map((p) => p.year));
  anios.add(anioHoy);
  return [...anios].sort((a, b) => b - a);
}

export function situacionDelMes(anio: number, mes: number, hoy: string): SituacionMes {
  const clave = `${anio}-${dos(mes)}`;
  const actual = hoy.slice(0, 7);
  if (clave < actual) return 'pasado';
  if (clave > actual) return 'futuro';
  return 'actual';
}

/** Las 12 celdas del año, con su periodo mensual si existe. */
export function rejillaDelAnio<P extends PeriodoBasico>(periodos: readonly P[], anio: number, hoy: string): CeldaMes<P>[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const periodo = periodos.find((p) => p.year === anio && p.period_type === 'monthly' && p.month === mes) ?? null;
    const situacion = situacionDelMes(anio, mes, hoy);
    return {
      mes,
      periodo,
      situacion,
      pendienteDeCierre: situacion === 'pasado' && periodo?.status === 'open',
    };
  });
}

/** El periodo anual del año, si se generó. */
export function periodoAnual<P extends PeriodoBasico>(periodos: readonly P[], anio: number): P | null {
  return periodos.find((p) => p.year === anio && p.period_type === 'yearly') ?? null;
}

/**
 * Estado del año: el del periodo anual si existe; si no, cerrado cuando los 12
 * meses existen y están cerrados; abierto si hay alguno; null sin periodos.
 */
export function estadoDelAnio(periodos: readonly PeriodoBasico[], anio: number): 'open' | 'closed' | null {
  const anual = periodoAnual(periodos, anio);
  if (anual) return anual.status === 'closed' ? 'closed' : 'open';
  const meses = periodos.filter((p) => p.year === anio && p.period_type === 'monthly');
  if (meses.length === 0) return null;
  return meses.length === 12 && meses.every((p) => p.status === 'closed') ? 'closed' : 'open';
}

/** Meses pasados aún abiertos (para «agosto sin cerrar»). */
export function mesesSinCerrar(celdas: readonly CeldaMes[]): number[] {
  return celdas.filter((c) => c.pendienteDeCierre).map((c) => c.mes);
}

/** Año que propone «Generar»: el siguiente al último con periodos, o el actual si no hay. */
export function anioParaGenerar(periodos: readonly PeriodoBasico[], anioHoy: number): number {
  const anios = periodos.map((p) => p.year);
  if (anios.length === 0) return anioHoy;
  return Math.max(...anios) + 1;
}

/** Ya existen periodos de ese tipo en ese año: generar de nuevo duplicaría filas. */
export function yaGenerado(periodos: readonly PeriodoBasico[], anio: number, tipo: 'monthly' | 'yearly'): boolean {
  return periodos.some((p) => p.year === anio && p.period_type === tipo);
}

// ── Checklist del cierre ────────────────────────────────────────────────────

export type EstadoItem = 'ok' | 'aviso' | 'bloquea';

export interface ItemCierre {
  id: 'balance' | 'pendientes' | 'borradores' | 'consecutivos';
  estado: EstadoItem;
  /** Cifra que acompaña el texto (pendientes, borradores, números faltantes). */
  cantidad: number;
}

export interface DatosCierre {
  /** Σ débitos y Σ créditos del periodo; null si no se pudo leer. */
  cuadre: { debitos: number; creditos: number } | null;
  /** Lo que devuelve `fn_periodo_pendientes`; null si no se pudo leer. */
  pendientes: { borradores: number; pendientes: number } | null;
  /** Números faltantes en los consecutivos de comprobante del periodo. */
  saltosConsecutivo: number;
}

/**
 * Bloquean (igual que `fn_cierre_periodo` para pendientes y borradores): el
 * balance que no cuadra, los hechos pendientes de contabilizar y los
 * borradores. Avisan: los saltos de consecutivo. Lo que no se pudo leer
 * bloquea: no se cierra a ciegas.
 */
export function checklistCierre(datos: DatosCierre): { items: ItemCierre[]; bloqueado: boolean } {
  const cuadra = datos.cuadre ? Math.abs(datos.cuadre.debitos - datos.cuadre.creditos) < 0.005 : null;
  const items: ItemCierre[] = [
    { id: 'balance', estado: cuadra === true ? 'ok' : 'bloquea', cantidad: datos.cuadre ? Math.abs(datos.cuadre.debitos - datos.cuadre.creditos) : 0 },
    {
      id: 'pendientes',
      estado: datos.pendientes === null || datos.pendientes.pendientes > 0 ? 'bloquea' : 'ok',
      cantidad: datos.pendientes?.pendientes ?? 0,
    },
    {
      id: 'borradores',
      estado: datos.pendientes === null || datos.pendientes.borradores > 0 ? 'bloquea' : 'ok',
      cantidad: datos.pendientes?.borradores ?? 0,
    },
    { id: 'consecutivos', estado: datos.saltosConsecutivo > 0 ? 'aviso' : 'ok', cantidad: datos.saltosConsecutivo },
  ];
  return { items, bloqueado: items.some((i) => i.estado === 'bloquea') };
}

// ── Errores de las RPC de cierre ────────────────────────────────────────────

export type CodigoErrorPeriodo =
  | 'sinPermiso'
  | 'faltanCuentasCierre'
  | 'periodoNoAbierto'
  | 'periodoNoCerrado'
  | 'conPendientes'
  | 'motivo'
  | 'sinSucursal'
  | 'duplicado'
  | 'desconocido';

/** Código traducible del error de `fn_cierre_periodo`, `fn_reabrir_periodo`, `fn_cierre_ejercicio` o el alta. */
export function codigoErrorPeriodo(error: unknown): CodigoErrorPeriodo {
  const e = (typeof error === 'object' && error ? error : {}) as { message?: unknown; code?: unknown };
  const msg = String(e.message ?? '');
  const code = String(e.code ?? '');
  if (msg.includes('sin_permiso') || code === '42501') return 'sinPermiso';
  if (msg.includes('faltan_cuentas_cierre')) return 'faltanCuentasCierre';
  if (msg.includes('periodo_con_pendientes')) return 'conPendientes';
  if (msg.includes('periodo_cerrado') || msg.includes('periodo_no_abierto')) return 'periodoNoAbierto';
  if (msg.includes('periodo_no_cerrado')) return 'periodoNoCerrado';
  if (msg.includes('motivo_obligatorio')) return 'motivo';
  if (msg.includes('sin_sucursal')) return 'sinSucursal';
  if (code === '23505') return 'duplicado';
  return 'desconocido';
}
