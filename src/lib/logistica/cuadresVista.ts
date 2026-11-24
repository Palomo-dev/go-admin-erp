/**
 * Pantalla «Cuadres» › Domiciliarios (logística Fase 1). Puro.
 *
 * Arma las filas del listado (cuadres guardados + lo que los domiciliarios cobraron y aún no está
 * en ningún cuadre), los indicadores del día y el reparto de lo contado por medio entre las líneas
 * del cuadre. Lo que mueve dinero lo hace la base (`logistica_cuadre_*`): efectivo a la caja,
 * datáfono a 13802001 y transferencia al banco por `fn_cuenta_cobro`. Un faltante se registra con
 * motivo y responsable, sin asiento (`accounting_status = 'pending_accountant'`).
 */
import { toPlainDate } from '@/lib/utils/dateCore';
import type { EstadoLineaCuadre, LineaCuadre, ResponsableDiferencia } from './cuadre';

/** Columnas de la tabla y del «Recibir dinero»: así se agrupan los medios. */
export const GRUPOS_MEDIO = ['efectivo', 'datafono', 'transferencia'] as const;
export type GrupoMedio = (typeof GRUPOS_MEDIO)[number];

/** Medio reportado por el domiciliario (cash · card · transfer · qr) o código de payment_methods. */
export function grupoDeMedio(metodo: string | null | undefined): GrupoMedio {
  const m = (metodo ?? '').toLowerCase();
  if (m === 'cash') return 'efectivo';
  if (m === 'card' || m.endsWith('_card')) return 'datafono';
  return 'transferencia';
}

/**
 * Código de `payment_methods` con que entra cada línea a la caja. `qr` no existe como medio de
 * pago: es Bre-B (`breb_qr`, la cuenta que ya le asigna `fn_cuenta_cobro`).
 */
export function metodoCajaDeReportado(metodo: string | null | undefined): string {
  const m = (metodo ?? '').toLowerCase();
  if (m === 'qr') return 'breb_qr';
  if (m === 'cash' || m === 'card' || m === 'transfer') return m;
  return m || 'cash';
}

const c = (v: unknown) => Math.round((Number(v) || 0) * 100);
const p = (v: number) => v / 100;

export type PorGrupo = Record<GrupoMedio, number>;
const ceros = (): PorGrupo => ({ efectivo: 0, datafono: 0, transferencia: 0 });

/** Suma un mapa `{metodo: monto}` (expected_by_method / received_by_method) por grupo. */
export function sumarPorGrupo(mapa: Record<string, unknown> | null | undefined): PorGrupo {
  const r = ceros();
  for (const [metodo, monto] of Object.entries(mapa ?? {})) r[grupoDeMedio(metodo)] += c(monto);
  return { efectivo: p(r.efectivo), datafono: p(r.datafono), transferencia: p(r.transferencia) };
}

// ── Filas del listado ───────────────────────────────────────────────────────

export interface CuadreGuardado {
  id: string;
  branch_id: number;
  driver_id: string;
  status: 'open' | 'closed' | 'cancelled';
  expected_total: number | string;
  received_total: number | string;
  difference: number | string;
  expected_by_method: Record<string, unknown> | null;
  received_by_method: Record<string, unknown> | null;
  difference_reason?: string | null;
  difference_responsible?: string | null;
  accounting_status?: string | null;
  opened_at: string;
  closed_at?: string | null;
  lineas?: number;
}

export interface EnvioCobrado {
  id: string;
  shipment_number?: string | null;
  driver_id: string | null;
  branch_id: number | null;
  cod_amount: number | string | null;
  cod_collected_amount: number | string | null;
  cod_collected_method: string | null;
  cod_collected_at: string | null;
}

export type EstadoFilaCuadre = 'por_recibir' | 'abierto' | 'cuadrado' | 'con_diferencia' | 'anulado';

export interface FilaCuadre {
  /** `cuadre:<id>` o `pendiente:<domiciliario>:<sede>`. */
  clave: string;
  cuadreId: string | null;
  driverId: string;
  branchId: number;
  /** Instante de referencia: apertura del cuadre o primer cobro sin cuadrar. */
  fecha: string;
  estado: EstadoFilaCuadre;
  entregas: number;
  esperado: number;
  /** Por medio: lo reportado (pendiente/abierto) o lo recibido (cerrado). */
  porMedio: PorGrupo;
  diferencia: number;
  motivo: string | null;
  responsable: string | null;
  pendienteContador: boolean;
}

export function estadoDeCuadre(cu: Pick<CuadreGuardado, 'status' | 'difference'>): EstadoFilaCuadre {
  if (cu.status === 'cancelled') return 'anulado';
  if (cu.status === 'open') return 'abierto';
  return c(cu.difference) === 0 ? 'cuadrado' : 'con_diferencia';
}

/**
 * Filas del listado. `enCuadreAbierto` son los envíos que ya tienen línea en un cuadre abierto:
 * no se repiten como «por recibir». Los cobros sin cuadre se agrupan por domiciliario y sede (el
 * cuadre es por sede: `logistica_cuadre_abrir` trae solo los de esa sede).
 */
export function filasCuadres(
  cuadres: readonly CuadreGuardado[],
  cobrados: readonly EnvioCobrado[],
  enCuadreAbierto: ReadonlySet<string>,
): FilaCuadre[] {
  const pendientes = new Map<string, { driverId: string; branchId: number; fecha: string; esperado: number; porMedio: PorGrupo; entregas: number }>();
  for (const e of cobrados) {
    if (!e.driver_id || e.branch_id == null || enCuadreAbierto.has(e.id)) continue;
    if (c(e.cod_amount) <= 0) continue;
    const clave = `pendiente:${e.driver_id}:${e.branch_id}`;
    const actual = pendientes.get(clave) ?? { driverId: e.driver_id, branchId: e.branch_id, fecha: e.cod_collected_at ?? '', esperado: 0, porMedio: ceros(), entregas: 0 };
    actual.esperado += c(e.cod_amount);
    actual.porMedio[grupoDeMedio(e.cod_collected_method)] += c(e.cod_collected_amount);
    actual.entregas += 1;
    if (e.cod_collected_at && (!actual.fecha || e.cod_collected_at < actual.fecha)) actual.fecha = e.cod_collected_at;
    pendientes.set(clave, actual);
  }

  const filasPendientes: FilaCuadre[] = [...pendientes.entries()].map(([clave, v]) => ({
    clave,
    cuadreId: null,
    driverId: v.driverId,
    branchId: v.branchId,
    fecha: v.fecha,
    estado: 'por_recibir',
    entregas: v.entregas,
    esperado: p(v.esperado),
    porMedio: { efectivo: p(v.porMedio.efectivo), datafono: p(v.porMedio.datafono), transferencia: p(v.porMedio.transferencia) },
    diferencia: 0,
    motivo: null,
    responsable: null,
    pendienteContador: false,
  }));

  const filasCuadre: FilaCuadre[] = cuadres.map((cu) => {
    const estado = estadoDeCuadre(cu);
    const cerrado = cu.status === 'closed';
    return {
      clave: `cuadre:${cu.id}`,
      cuadreId: cu.id,
      driverId: cu.driver_id,
      branchId: cu.branch_id,
      fecha: cu.opened_at,
      estado,
      entregas: cu.lineas ?? 0,
      esperado: p(c(cu.expected_total)),
      porMedio: sumarPorGrupo(cerrado ? cu.received_by_method : cu.expected_by_method),
      diferencia: cerrado ? p(c(cu.difference)) : 0,
      motivo: cu.difference_reason ?? null,
      responsable: cu.difference_responsible ?? null,
      pendienteContador: cu.accounting_status === 'pending_accountant',
    };
  });

  // Primero lo que espera dinero (por recibir, abiertos); después lo cerrado, lo más reciente arriba.
  const enEspera = (f: FilaCuadre) => (f.estado === 'por_recibir' || f.estado === 'abierto' ? 0 : 1);
  return [...filasPendientes, ...filasCuadre].sort(
    (a, b) => enEspera(a) - enEspera(b) || new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );
}

export interface KpisCuadres {
  porRecibir: number;
  domiciliariosPorRecibir: number;
  cuadradosHoy: number;
  recibidoHoy: number;
  conDiferenciaHoy: number;
  faltanteHoy: number;
  abiertosAnteriores: number;
}

/** Dinero aún en la calle: lo cobrado sin cuadre y los cuadres abiertos («Por recibir»). */
export function esPorRecibir(f: Pick<FilaCuadre, 'estado'>): boolean {
  return f.estado === 'por_recibir' || f.estado === 'abierto';
}

/** Cuadre cerrado HOY (día de la organización) con diferencia: la cifra «Con diferencia». */
export function cerradoHoyConDiferencia(
  cu: Pick<CuadreGuardado, 'status' | 'closed_at' | 'difference'>,
  hoy: string,
  zona: string,
): boolean {
  return cu.status === 'closed' && !!cu.closed_at && toPlainDate(new Date(cu.closed_at), zona) === hoy && c(cu.difference) !== 0;
}

/**
 * Filtros que la pantalla lee de la URL (`?filtro=`): los abre el Inicio desde «1 cuadre con
 * diferencia» y «2 cuadres abiertos» (Figma `03` › Inicio, 2917:45049). Misma regla que sus
 * indicadores.
 */
export const FILTROS_CUADRES = ['con_diferencia_hoy', 'por_recibir'] as const;
export type FiltroCuadres = (typeof FILTROS_CUADRES)[number];

export function leerFiltroCuadres(v: string | null | undefined): FiltroCuadres | null {
  return (FILTROS_CUADRES as readonly string[]).includes(v ?? '') ? (v as FiltroCuadres) : null;
}

export function filtrarCuadres(
  filas: readonly FilaCuadre[],
  cuadres: readonly Pick<CuadreGuardado, 'id' | 'status' | 'closed_at' | 'difference'>[],
  filtro: FiltroCuadres | null,
  hoy: string,
  zona: string,
): FilaCuadre[] {
  if (filtro === 'por_recibir') return filas.filter(esPorRecibir);
  if (filtro === 'con_diferencia_hoy') {
    const ids = new Set(cuadres.filter((cu) => cerradoHoyConDiferencia(cu, hoy, zona)).map((cu) => cu.id));
    return filas.filter((f) => f.cuadreId !== null && ids.has(f.cuadreId));
  }
  return [...filas];
}

/** Indicadores del día (en la zona de la organización). */
export function kpisCuadres(
  filas: readonly FilaCuadre[],
  cuadres: readonly Pick<CuadreGuardado, 'id' | 'status' | 'closed_at' | 'opened_at' | 'received_total' | 'difference'>[],
  hoy: string,
  zona: string,
): KpisCuadres {
  const dia = (v: string | null | undefined) => (v ? toPlainDate(new Date(v), zona) : '');
  const porRecibirFilas = filas.filter(esPorRecibir);
  const cerradosHoy = cuadres.filter((cu) => cu.status === 'closed' && dia(cu.closed_at) === hoy);
  const conDiferencia = cerradosHoy.filter((cu) => cerradoHoyConDiferencia(cu, hoy, zona));
  return {
    porRecibir: p(porRecibirFilas.reduce((s, f) => s + c(f.esperado), 0)),
    domiciliariosPorRecibir: new Set(porRecibirFilas.map((f) => f.driverId)).size,
    cuadradosHoy: cerradosHoy.length,
    recibidoHoy: p(cerradosHoy.reduce((s, cu) => s + c(cu.received_total), 0)),
    conDiferenciaHoy: conDiferencia.length,
    faltanteHoy: p(conDiferencia.reduce((s, cu) => s + Math.min(0, c(cu.difference)), 0)),
    abiertosAnteriores: cuadres.filter((cu) => cu.status === 'open' && dia(cu.opened_at) < hoy).length,
  };
}

// ── Recibir dinero ──────────────────────────────────────────────────────────

export interface ResumenMedio {
  grupo: GrupoMedio;
  envios: number;
  /** Suma de la contraentrega esperada de sus líneas. */
  esperado: number;
  /** Lo que el domiciliario dijo que cobró (valor inicial de «Contado»). */
  reportado: number;
  /** Ya recibido en un intento anterior (líneas no pendientes). */
  yaRecibido: number;
}

type LineaReparto = Pick<LineaCuadre, 'id' | 'esperado' | 'recibido' | 'status' | 'metodo_reportado'> & { reportado?: number | null };

export function resumenPorMedio(lineas: readonly LineaReparto[]): ResumenMedio[] {
  return GRUPOS_MEDIO.map((grupo) => {
    const del = lineas.filter((l) => l.status !== 'cancelled' && grupoDeMedio(l.metodo_reportado) === grupo);
    return {
      grupo,
      envios: del.length,
      esperado: p(del.reduce((s, l) => s + c(l.esperado), 0)),
      reportado: p(del.reduce((s, l) => s + c(l.reportado ?? l.esperado), 0)),
      yaRecibido: p(del.filter((l) => l.status !== 'pending').reduce((s, l) => s + c(l.recibido), 0)),
    };
  });
}

export interface ReciboLinea {
  lineaId: string;
  monto: number;
  faltante: boolean;
}

export type ErrorReparto = { error: 'SOBRANTE'; grupo: GrupoMedio; sobrante: number } | { error: 'MONTO_INVALIDO'; grupo: GrupoMedio };

/**
 * Reparte lo contado de cada medio entre sus líneas pendientes, en orden: cada línea recibe hasta
 * lo esperado y el faltante queda en las últimas. Lo ya recibido en un intento anterior se descuenta
 * (reintento tras un error a mitad de camino). Contar MÁS de lo esperado es un error: la base no
 * admite sobrantes en una línea (MONTO_MAYOR_AL_ESPERADO).
 */
export function repartirContado(
  lineas: readonly LineaReparto[],
  contado: Readonly<Partial<Record<GrupoMedio, number>>>,
): { ok: true; recibos: ReciboLinea[] } | ({ ok: false } & ErrorReparto) {
  const recibos: ReciboLinea[] = [];
  for (const grupo of GRUPOS_MEDIO) {
    const del = lineas.filter((l) => l.status !== 'cancelled' && grupoDeMedio(l.metodo_reportado) === grupo);
    if (del.length === 0) continue;
    const valor = contado[grupo];
    if (valor == null || !Number.isFinite(valor) || valor < 0) return { ok: false, error: 'MONTO_INVALIDO', grupo };
    const yaRecibido = del.filter((l) => l.status !== 'pending').reduce((s, l) => s + c(l.recibido), 0);
    const esperado = del.reduce((s, l) => s + c(l.esperado), 0);
    if (c(valor) > esperado) return { ok: false, error: 'SOBRANTE', grupo, sobrante: p(c(valor) - esperado) };
    let restante = Math.max(0, c(valor) - yaRecibido);
    for (const l of del.filter((x) => x.status === 'pending')) {
      const monto = Math.min(c(l.esperado), restante);
      restante -= monto;
      recibos.push({ lineaId: l.id, monto: p(monto), faltante: monto < c(l.esperado) });
    }
  }
  return { ok: true, recibos };
}

/** Diferencia de cada medio (contado − esperado) y la total. */
export function diferenciasContado(resumen: readonly ResumenMedio[], contado: Readonly<Partial<Record<GrupoMedio, number>>>) {
  const porGrupo = ceros();
  let total = 0;
  for (const r of resumen) {
    if (r.envios === 0) continue;
    const d = c(contado[r.grupo] ?? 0) - c(r.esperado);
    porGrupo[r.grupo] = p(d);
    total += d;
  }
  return { porGrupo, total: p(total) };
}

/** Motivos rápidos de una diferencia (el texto lo pone la pantalla en su idioma). */
export const MOTIVOS_DIFERENCIA = ['cambio_de_mas', 'cliente_pago_menos', 'dinero_perdido', 'error_conteo', 'otro'] as const;
export type MotivoDiferencia = (typeof MOTIVOS_DIFERENCIA)[number];

/** Motivo que se guarda: la etiqueta y la nota («Cambio entregado de más: en WO-431 dio …»). */
export function textoMotivo(etiqueta: string, nota: string): string {
  const n = nota.trim();
  return n ? `${etiqueta}: ${n}` : etiqueta;
}

export function faltanteRecibir(p: {
  diferencia: number;
  motivo: MotivoDiferencia | null;
  nota: string;
  responsable: ResponsableDiferencia | null;
  cajaAbierta: boolean;
  lineas: number;
}): 'sin_caja' | 'sin_lineas' | 'motivo' | 'nota' | 'responsable' | null {
  if (!p.cajaAbierta) return 'sin_caja';
  if (p.lineas === 0) return 'sin_lineas';
  if (Math.round(p.diferencia * 100) !== 0) {
    if (!p.motivo) return 'motivo';
    if (p.motivo === 'otro' && !p.nota.trim()) return 'nota';
    if (!p.responsable) return 'responsable';
  }
  return null;
}

/** Estado de línea → tono de badge. */
export const TONO_LINEA: Readonly<Record<EstadoLineaCuadre, 'neutro' | 'exito' | 'peligro'>> = {
  pending: 'neutro',
  received: 'exito',
  shortage: 'peligro',
  cancelled: 'neutro',
};
