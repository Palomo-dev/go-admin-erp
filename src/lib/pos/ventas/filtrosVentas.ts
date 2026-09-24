/**
 * Filtros del listado de ventas con lista blanca (V-b de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). Lo que llega de la URL o del
 * cliente se valida aquí y termina como parámetros de la RPC de lectura
 * (`pos_ventas_listado`): nunca se interpola en un `.or()` de PostgREST (antes
 * la búsqueda se pegaba sin escapar, V10). Módulo hoja.
 */
import { ESTADOS_VENTA, ORIGENES_VENTA, type EstadoVenta, type OrigenVenta } from './estadoVenta';

export const CAMPOS_ORDEN_VENTAS = ['fecha', 'total', 'numero', 'cliente'] as const;
export type CampoOrdenVentas = (typeof CAMPOS_ORDEN_VENTAS)[number];

export const TAMANOS_VENTAS = [10, 20, 50, 100] as const;

export interface FiltrosVentas {
  busqueda: string | null;
  origenes: OrigenVenta[];
  estados: EstadoVenta[];
  metodos: string[];
  clienteId: string | null;
  cajeroId: string | null;
  /** Días calendario de la organización (YYYY-MM-DD), `hasta` incluido. */
  desde: string | null;
  hasta: string | null;
  importeMin: number | null;
  importeMax: number | null;
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
    estados: lista(crudo.estado).filter((e): e is EstadoVenta => (ESTADOS_VENTA as readonly string[]).includes(e)),
    metodos: lista(crudo.metodo).filter((m) => METODO.test(m)),
    clienteId: cliente && UUID.test(cliente) ? cliente.toLowerCase() : null,
    cajeroId: cajero && UUID.test(cajero) ? cajero.toLowerCase() : null,
    desde,
    hasta,
    importeMin: min,
    importeMax: max,
    orden: {
      campo: (CAMPOS_ORDEN_VENTAS as readonly string[]).includes(campo ?? '') ? (campo as CampoOrdenVentas) : 'fecha',
      direccion: direccion === 'asc' ? 'asc' : 'desc',
    },
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, 100000) : 1,
    tamano: (TAMANOS_VENTAS as readonly number[]).includes(tamano) ? tamano : 20,
  };
}

/** Parámetros de `pos_ventas_listado` (el rango de instantes lo calcula el servidor con la zona). */
export function parametrosListado(
  f: FiltrosVentas,
  ctx: { organizacionId: number; sucursalId: number | null; desde: string | null; hasta: string | null },
) {
  return {
    p_organization_id: ctx.organizacionId,
    p_branch_id: ctx.sucursalId,
    p_desde: ctx.desde,
    p_hasta: ctx.hasta,
    p_busqueda: f.busqueda,
    p_origenes: f.origenes.length ? f.origenes : null,
    p_estados: f.estados.length ? f.estados : null,
    p_metodos: f.metodos.length ? f.metodos : null,
    p_cliente_id: f.clienteId,
    p_cajero_id: f.cajeroId,
    p_importe_min: f.importeMin,
    p_importe_max: f.importeMax,
    p_orden: f.orden.campo,
    p_direccion: f.orden.direccion,
    p_limite: f.tamano,
    p_desplazamiento: (f.pagina - 1) * f.tamano,
  };
}
