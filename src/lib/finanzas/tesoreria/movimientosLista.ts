/**
 * Lista de Tesorería (ronda 3, frente T): una sola lógica para las tres
 * pantallas que muestran dinero que entra y sale.
 *
 * - «Movimientos» (`/app/finanzas/tesoreria/movimientos`): entradas, salidas y
 *   traslados juntos, con pestañas Todos · Entradas · Salidas · Traslados.
 * - «Ingresos» y «Egresos» (rutas de siempre): la misma lista filtrada.
 *
 * Las tres leen los mismos servicios (`movimientosService`,
 * `transferenciasService`); aquí solo se arma la fila, se filtra, se resume y
 * se exporta. Sin React ni Supabase: todo con pruebas.
 */

export type TipoFila = 'entrada' | 'salida' | 'traslado';
export type FiltroTipo = 'todos' | 'entradas' | 'salidas' | 'traslados';
export const FILTROS_TIPO: readonly FiltroTipo[] = ['todos', 'entradas', 'salidas', 'traslados'];

/** Lo mínimo de un ingreso/egreso que devuelve `movimientosService.getAllMovements`. */
export interface MovimientoOrigen {
  id: number;
  uuid: string;
  source: 'cash' | 'bank';
  concept: string;
  amount: number;
  notes?: string | null;
  created_at: string;
  bank_account_name?: string | null;
  categoria_nombre?: string | null;
  es_reverso?: boolean;
  /** Solo banco. */
  conciliado?: boolean;
}

/** Lo mínimo de una transferencia (`transferenciasService.getTransfers`). */
export interface TransferenciaOrigen {
  id: string;
  amount: number | string;
  transfer_date: string;
  reference?: string | null;
  notes?: string | null;
  status: string;
  from_account?: { name?: string | null; bank_name?: string | null } | null;
  to_account?: { name?: string | null; bank_name?: string | null } | null;
}

export interface FilaMovimiento {
  /** Única en la lista: los ids de caja, banco y traslado son secuencias distintas. */
  clave: string;
  fuente: 'caja' | 'banco' | 'traslado';
  tipo: TipoFila;
  /** Id del registro en su tabla (número para caja y banco, uuid para traslado). */
  id: string;
  uuid: string;
  fecha: string;
  concepto: string;
  categoria: string | null;
  /** Cuenta de dinero: nombre del banco o null para caja (la pantalla pone «Caja»). */
  cuenta: string | null;
  cuentaDestino: string | null;
  importe: number;
  notas: string | null;
  referencia: string | null;
  /** Reverso de una anulación (no se anula ni se duplica) o traslado anulado. */
  anulado: boolean;
  esReverso: boolean;
  /** Banco: pendiente o conciliado; caja y traslado: no aplica (`null`). */
  conciliacion: 'pendiente' | 'conciliado' | null;
  /** Detalle propio de la fila. */
  href: string;
}

const RUTA_DETALLE = {
  entrada: '/app/finanzas/ingresos',
  salida: '/app/finanzas/egresos',
  traslado: '/app/finanzas/tesoreria/transferencias',
} as const;

function nombreCuenta(c: { name?: string | null; bank_name?: string | null } | null | undefined): string | null {
  return c?.name || c?.bank_name || null;
}

function aImporte(v: number | string | null | undefined): number {
  const n = Math.abs(Number(v));
  return Number.isFinite(n) ? n : 0;
}

export function filaDeMovimiento(m: MovimientoOrigen, tipo: 'entrada' | 'salida'): FilaMovimiento {
  const fuente = m.source === 'cash' ? 'caja' : 'banco';
  return {
    clave: `${fuente}:${m.id}`,
    fuente,
    tipo,
    id: String(m.id),
    uuid: m.uuid,
    fecha: m.created_at,
    concepto: m.concept,
    categoria: m.categoria_nombre ?? null,
    cuenta: m.source === 'bank' ? m.bank_account_name ?? null : null,
    cuentaDestino: null,
    importe: aImporte(m.amount),
    notas: m.notes ?? null,
    referencia: null,
    anulado: false,
    esReverso: m.es_reverso === true,
    conciliacion: m.source === 'bank' ? (m.conciliado ? 'conciliado' : 'pendiente') : null,
    href: `${RUTA_DETALLE[tipo]}/${m.uuid}`,
  };
}

export function filaDeTransferencia(t: TransferenciaOrigen): FilaMovimiento {
  return {
    clave: `traslado:${t.id}`,
    fuente: 'traslado',
    tipo: 'traslado',
    id: t.id,
    uuid: t.id,
    fecha: t.transfer_date,
    concepto: t.reference || '',
    categoria: null,
    cuenta: nombreCuenta(t.from_account),
    cuentaDestino: nombreCuenta(t.to_account),
    importe: aImporte(t.amount),
    notas: t.notes ?? null,
    referencia: t.reference ?? null,
    anulado: t.status === 'cancelled',
    esReverso: false,
    conciliacion: null,
    href: `${RUTA_DETALLE.traslado}/${t.id}`,
  };
}

/** Las tres fuentes en una lista, la más reciente primero. */
export function unirMovimientos(
  ingresos: readonly MovimientoOrigen[],
  egresos: readonly MovimientoOrigen[],
  transferencias: readonly TransferenciaOrigen[] = [],
): FilaMovimiento[] {
  const filas = [
    ...ingresos.map((m) => filaDeMovimiento(m, 'entrada')),
    ...egresos.map((m) => filaDeMovimiento(m, 'salida')),
    ...transferencias.map(filaDeTransferencia),
  ];
  return filas.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha) || a.clave.localeCompare(b.clave));
}

export function coincideTipo(fila: FilaMovimiento, filtro: FiltroTipo): boolean {
  if (filtro === 'todos') return true;
  if (filtro === 'entradas') return fila.tipo === 'entrada';
  if (filtro === 'salidas') return fila.tipo === 'salida';
  return fila.tipo === 'traslado';
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Búsqueda: la de las listas viejas (concepto o notas) más categoría, cuenta
 * y referencia. Sin tildes ni mayúsculas.
 */
export function coincideBusqueda(fila: FilaMovimiento, termino: string): boolean {
  const q = normalizar(termino);
  if (!q) return true;
  return [fila.concepto, fila.notas, fila.categoria, fila.cuenta, fila.cuentaDestino, fila.referencia]
    .some((v) => typeof v === 'string' && normalizar(v).includes(q));
}

export function filtrarMovimientos(filas: readonly FilaMovimiento[], filtro: FiltroTipo, termino = ''): FilaMovimiento[] {
  return filas.filter((f) => coincideTipo(f, filtro) && coincideBusqueda(f, termino));
}

export function contarPorTipo(filas: readonly FilaMovimiento[]): Record<FiltroTipo, number> {
  return {
    todos: filas.length,
    entradas: filas.filter((f) => f.tipo === 'entrada').length,
    salidas: filas.filter((f) => f.tipo === 'salida').length,
    traslados: filas.filter((f) => f.tipo === 'traslado').length,
  };
}

export interface ResumenMovimientos {
  /** Suma de todas las filas (sin traslados anulados). */
  total: number;
  registros: number;
  mes: number;
  hoy: number;
  entradasMes: number;
  salidasMes: number;
  conteoEntradasMes: number;
  conteoSalidasMes: number;
  trasladosMes: number;
  /** Entradas − salidas del mes; los traslados no cambian el dinero total. */
  netoMes: number;
  /** Movimientos bancarios sin conciliar (todas las fechas): conteo, importe y cuántos bancos. */
  porConciliar: number;
  importePorConciliar: number;
  bancosPorConciliar: number;
}

/**
 * KPI con el día de la ORGANIZACIÓN: `diaDe(fecha)` convierte el instante en
 * su `YYYY-MM-DD` (`toDate` de `useFormatDate`) y `hoy` es `getToday()`. Las
 * listas viejas comparaban contra la medianoche del navegador.
 */
export function resumirMovimientos(
  filas: readonly FilaMovimiento[],
  hoy: string,
  diaDe: (fechaIso: string) => string,
): ResumenMovimientos {
  const mesActual = hoy.slice(0, 7);
  const r: ResumenMovimientos = {
    total: 0, registros: 0, mes: 0, hoy: 0,
    entradasMes: 0, salidasMes: 0, conteoEntradasMes: 0, conteoSalidasMes: 0, trasladosMes: 0, netoMes: 0,
    porConciliar: 0, importePorConciliar: 0, bancosPorConciliar: 0,
  };
  const bancos = new Set<string>();
  for (const f of filas) {
    if (f.anulado) continue;
    if (f.conciliacion === 'pendiente') {
      r.porConciliar += 1;
      r.importePorConciliar += f.importe;
      bancos.add(f.cuenta ?? '');
    }
    const dia = diaDe(f.fecha);
    const delMes = !!hoy && dia.slice(0, 7) === mesActual;
    r.total += f.importe;
    r.registros += 1;
    if (delMes) r.mes += f.importe;
    if (hoy && dia === hoy) r.hoy += f.importe;
    if (!delMes) continue;
    if (f.tipo === 'entrada') {
      r.entradasMes += f.importe;
      r.conteoEntradasMes += 1;
    } else if (f.tipo === 'salida') {
      r.salidasMes += f.importe;
      r.conteoSalidasMes += 1;
    } else {
      r.trasladosMes += 1;
    }
  }
  r.netoMes = r.entradasMes - r.salidasMes;
  r.bancosPorConciliar = bancos.size;
  return r;
}

/** Signo con el que se pinta el importe: + entra, − sale, sin signo un traslado. */
export function signoFila(fila: Pick<FilaMovimiento, 'tipo'>): '+' | '-' | '' {
  return fila.tipo === 'entrada' ? '+' : fila.tipo === 'salida' ? '-' : '';
}

/** Acciones que admite la fila (las de las listas viejas: duplicar y anular solo caja/banco vigentes). */
export function accionesFila(fila: FilaMovimiento): { duplicar: boolean; anular: boolean } {
  if (fila.fuente === 'traslado') return { duplicar: false, anular: !fila.anulado };
  const vigente = !fila.esReverso && !fila.anulado;
  return { duplicar: vigente, anular: vigente };
}

function celdaCsv(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * CSV de la lista visible. Conserva las columnas de las listas viejas
 * (ID, Fecha, Concepto, Monto, Notas) y suma Tipo y Cuenta; ahora escapa
 * comas y comillas (antes un concepto con coma partía la fila).
 */
export function csvMovimientos(
  filas: readonly FilaMovimiento[],
  formatearFecha: (iso: string) => string,
  textos: { tipo: Record<TipoFila, string>; caja: string; encabezados: readonly [string, string, string, string, string, string, string] },
): string {
  const lineas = [textos.encabezados.map(celdaCsv).join(',')];
  for (const f of filas) {
    const cuenta = f.tipo === 'traslado' ? `${f.cuenta ?? ''} → ${f.cuentaDestino ?? ''}` : f.cuenta ?? textos.caja;
    lineas.push(
      [f.id, formatearFecha(f.fecha), f.concepto, f.importe, f.notas ?? '', textos.tipo[f.tipo], cuenta].map(celdaCsv).join(','),
    );
  }
  return lineas.join('\n');
}
