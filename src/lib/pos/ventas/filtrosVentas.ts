/**
 * Filtros del listado de ventas con lista blanca (V-b de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Lo que llega de la URL o del
 * cliente se valida aquí y termina como parámetros de la RPC de lectura
 * (`pos_ventas_listado_v2` y `pos_ventas_cifras`): nunca se interpola en un `.or()` de PostgREST (antes
 * la búsqueda se pegaba sin escapar, V10). Módulo hoja.
 */
import { ESTADOS_VENTA, ORIGENES_VENTA, type EstadoVenta, type OrigenVenta } from './estadoVenta';
import { CANALES_VENTA, type CanalVenta } from './canalVenta';

export const CAMPOS_ORDEN_VENTAS = ['fecha', 'total', 'numero', 'cliente'] as const;
export type CampoOrdenVentas = (typeof CAMPOS_ORDEN_VENTAS)[number];

export const TAMANOS_VENTAS = [10, 20, 50, 100] as const;

/** Estado de pago (`sales.payment_status`, con `status` si viene vacío). */
export const ESTADOS_PAGO_VENTA = ['paid', 'partial', 'pending', 'refunded'] as const;
export type EstadoPagoVenta = (typeof ESTADOS_PAGO_VENTA)[number];

export interface FiltrosVentas {
  busqueda: string | null;
  origenes: OrigenVenta[];
  /** Canal (Figma 24 Ventas): `?canal=pos,tienda_web`. */
  canales: CanalVenta[];
  estados: EstadoVenta[];
  metodos: string[];
  clienteId: string | null;
  cajeroId: string | null;
  /** Días calendario de la organización (YYYY-MM-DD), `hasta` incluido. */
  desde: string | null;
  hasta: string | null;
  importeMin: number | null;
  importeMax: number | null;
  pagos: EstadoPagoVenta[];
  /** Casillas del panel (Figma 329:111220). */
  conSaldo: boolean;
  conDevolucion: boolean;
  pendientesSync: boolean;
  orden: { campo: CampoOrdenVentas; direccion: 'asc' | 'desc' };
  pagina: number;
  tamano: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const METODO = /^[A-Za-z0-9_-]{1,40}$/;

type Crudo = Record<string, string | string[] | null | undefined>;

function lista(valor: string | string[] | null | undefined): string[] {
  if (valor == null) return [];
  const partes = (Array.isArray(valor) ? valor : [valor]).flatMap((v) => String(v).split(','));
  return [...new Set(partes.map((v) => v.trim()).filter(Boolean))];
}

function uno(valor: string | string[] | null | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v == null || v === '' ? null : String(v);
}

function fecha(valor: string | string[] | null | undefined): string | null {
  const v = uno(valor);
  if (!v || !FECHA.test(v)) return null;
  // Día calendario puro: se valida por sus partes, sin pasar por un instante.
  const [a, m, d] = v.split('-').map(Number);
  const diasDelMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return m >= 1 && m <= 12 && d >= 1 && d <= diasDelMes ? v : null;
}

/** Casilla: solo `1` o `true` la marcan. */
function casilla(valor: string | string[] | null | undefined): boolean {
  const v = uno(valor);
  return v === '1' || v === 'true';
}

function importe(valor: string | string[] | null | undefined): number | null {
  const v = uno(valor);
  if (v == null) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null;
}

/** Búsqueda limpia: sin caracteres de control, espacios colapsados, máx. 80. */
export function limpiarBusqueda(texto: string | null | undefined): string | null {
  if (!texto) return null;
  // eslint-disable-next-line no-control-regex
  const t = String(texto).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t.length > 0 ? t : null;
}

/** Valida todo lo que viene del cliente; lo desconocido se descarta. */
export function filtrosVentas(crudo: Crudo): FiltrosVentas {
  const campo = uno(crudo.orden);
  const direccion = uno(crudo.dir);
  const tamano = Number(uno(crudo.tamano));
  const pagina = Math.trunc(Number(uno(crudo.pagina)));
  let desde = fecha(crudo.desde);
  let hasta = fecha(crudo.hasta);
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
  let min = importe(crudo.min);
  let max = importe(crudo.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const cliente = uno(crudo.cliente);
  const cajero = uno(crudo.cajero);
  return {
    busqueda: limpiarBusqueda(uno(crudo.q)),
    origenes: lista(crudo.origen).filter((o): o is OrigenVenta => (ORIGENES_VENTA as readonly string[]).includes(o)),
    canales: lista(crudo.canal).filter((c): c is CanalVenta => (CANALES_VENTA as readonly string[]).includes(c)),
    estados: lista(crudo.estado).filter((e): e is EstadoVenta => (ESTADOS_VENTA as readonly string[]).includes(e)),
    metodos: lista(crudo.metodo).filter((m) => METODO.test(m)),
    clienteId: cliente && UUID.test(cliente) ? cliente.toLowerCase() : null,
    cajeroId: cajero && UUID.test(cajero) ? cajero.toLowerCase() : null,
    desde,
    hasta,
    importeMin: min,
    importeMax: max,
    pagos: lista(crudo.pago).filter((p): p is EstadoPagoVenta => (ESTADOS_PAGO_VENTA as readonly string[]).includes(p)),
    conSaldo: casilla(crudo.saldo),
    conDevolucion: casilla(crudo.devolucion),
    pendientesSync: casilla(crudo.sync),
    orden: {
      campo: (CAMPOS_ORDEN_VENTAS as readonly string[]).includes(campo ?? '') ? (campo as CampoOrdenVentas) : 'fecha',
      direccion: direccion === 'asc' ? 'asc' : 'desc',
    },
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, 100000) : 1,
    tamano: (TAMANOS_VENTAS as readonly number[]).includes(tamano) ? tamano : 20,
  };
}

interface ContextoParametros {
  organizacionId: number;
  sucursalId: number | null;
  desde: string | null;
  hasta: string | null;
}

/**
 * Filtros comunes del listado y de las cifras (`pos_ventas_filtradas`): la
 * misma lista para que «N ventas encontradas» y «Transacciones» coincidan.
 */
export function parametrosFiltro(f: FiltrosVentas, ctx: ContextoParametros) {
  return {
    p_organization_id: ctx.organizacionId,
    p_branch_id: ctx.sucursalId,
    p_desde: ctx.desde,
    p_hasta: ctx.hasta,
    p_busqueda: f.busqueda,
    p_origenes: f.origenes.length ? f.origenes : null,
    p_canales: f.canales.length ? f.canales : null,
    p_estados: f.estados.length ? f.estados : null,
    p_metodos: f.metodos.length ? f.metodos : null,
    p_cliente_id: f.clienteId,
    p_cajero_id: f.cajeroId,
    p_importe_min: f.importeMin,
    p_importe_max: f.importeMax,
    p_pagos: f.pagos.length ? f.pagos : null,
    p_con_saldo: f.conSaldo,
    p_con_devolucion: f.conDevolucion,
    p_pendientes_sync: f.pendientesSync,
  };
}

/** Parámetros de `pos_ventas_listado_v2` (el rango de instantes lo calcula el servidor con la zona). */
export function parametrosListado(f: FiltrosVentas, ctx: ContextoParametros) {
  return {
    ...parametrosFiltro(f, ctx),
    p_orden: f.orden.campo,
    p_direccion: f.orden.direccion,
    p_limite: f.tamano,
    p_desplazamiento: (f.pagina - 1) * f.tamano,
  };
}

/** Días entre dos fechas calendario (YYYY-MM-DD), `hasta` incluido. */
function diasIncluidos(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000) + 1;
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + dias));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Periodo anterior de igual duración en días calendario («1–20 nov» → «12–31
 * oct»): contra él se calcula la variación de «Ventas del periodo».
 */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const n = Math.max(1, diasIncluidos(desde, hasta));
  return { desde: sumarDias(desde, -n), hasta: sumarDias(desde, -1) };
}

/** El mismo día de la semana anterior («domingo 23» → «domingo 16»): contra él se compara «Ventas de hoy». */
export function mismoDiaSemanaAnterior(fecha: string): string {
  return sumarDias(fecha, -7);
}
