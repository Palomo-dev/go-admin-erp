/**
 * Listado de cuentas por cobrar en el servidor (`GET /api/cartera` →
 * `fn_cxc_listado`), para Finanzas y para el POS (`origen=pos`). Módulo hoja:
 * listas blancas de filtros y orden compartidas por la ruta y la pantalla.
 */
import { TRAMOS_ANTIGUEDAD, type TramoAntiguedad } from './antiguedad';

export const FILTROS_CARTERA = ['estado', 'tramo', 'cliente', 'sin_recordatorio_dias'] as const;
export const CAMPOS_ORDEN_CARTERA = ['vencimiento', 'saldo', 'antiguedad', 'cliente', 'creada'] as const;

export const ESTADOS_CARTERA = ['abiertas', 'todos', 'current', 'partial', 'overdue', 'paid', 'cancelled'] as const;
export type EstadoFiltroCartera = (typeof ESTADOS_CARTERA)[number];

const ORDENES_RPC: Record<string, string> = {
  vencimiento_asc: 'vencimiento_asc',
  vencimiento_desc: 'vencimiento_asc',
  saldo_desc: 'saldo_desc',
  saldo_asc: 'saldo_desc',
  antiguedad_desc: 'antiguedad_desc',
  antiguedad_asc: 'antiguedad_desc',
  cliente_asc: 'cliente_asc',
  cliente_desc: 'cliente_asc',
  creada_desc: 'creada_desc',
  creada_asc: 'creada_desc',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ordenCarteraRpc(campo: string | null | undefined, direccion: 'asc' | 'desc' | null | undefined): string {
  return ORDENES_RPC[`${campo ?? 'vencimiento'}_${direccion ?? 'asc'}`] ?? 'vencimiento_asc';
}

export interface ConsultaCartera {
  filtros: Record<string, string | number>;
  orden: string;
  pagina: number;
  tamano: number;
  origen: 'pos' | 'todos';
}

export function consultaCarteraDesde(params: URLSearchParams): ConsultaCartera {
  const filtros: Record<string, string | number> = {};
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  if (q) filtros.q = q;
  const estado = params.get('estado') ?? '';
  if ((ESTADOS_CARTERA as readonly string[]).includes(estado)) filtros.estado = estado;
  const tramo = params.get('tramo') ?? '';
  if ((TRAMOS_ANTIGUEDAD as readonly string[]).includes(tramo)) filtros.tramo = tramo as TramoAntiguedad;
  const cliente = params.get('cliente') ?? '';
  if (UUID_RE.test(cliente)) filtros.cliente = cliente;
  const sinRec = Number(params.get('sin_recordatorio_dias'));
  if (Number.isInteger(sinRec) && sinRec > 0 && sinRec <= 365) filtros.sin_recordatorio_dias = sinRec;
  const sucursal = Number(params.get('sucursal'));
  if (Number.isInteger(sucursal) && sucursal > 0) filtros.sucursal = sucursal;
  const origen = params.get('origen') === 'pos' ? 'pos' : 'todos';
  filtros.origen = origen;
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina')) || 1));
  const tamano = Math.min(200, Math.max(1, Math.floor(Number(params.get('tamano')) || 25)));
  const orden = Object.values(ORDENES_RPC).includes(params.get('orden') ?? '') ? (params.get('orden') as string) : 'vencimiento_asc';
  return { filtros, orden, pagina, tamano, origen };
}

export interface FilaCartera {
  id: string;
  invoice_id: string | null;
  numero: string | null;
  sale_id: string | null;
  origen: 'pos' | 'web' | 'factura' | 'otro';
  cliente_id: string | null;
  cliente: string | null;
  cliente_doc: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  branch_id: number | null;
  sucursal: string | null;
  vencimiento: string | null;
  monto: number;
  saldo: number;
  moneda: string;
  estado: string;
  dias: number;
  cuotas: number;
  cuotas_pendientes: number;
  ultimo_recordatorio: string | null;
}

export interface ResumenCartera {
  monedas: string[];
  por_cobrar: number;
  al_dia: number;
  vencida: number;
  cuentas_abiertas: number;
  cuentas_vencidas: number;
  promedio_cobro_dias: number | null;
  tramos: { tramo: TramoAntiguedad; saldo: number; cuentas: number }[];
}

export interface RespuestaListadoCartera {
  total: number;
  filas: FilaCartera[];
  resumen: ResumenCartera;
}
