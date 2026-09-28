/**
 * Listado de facturas de venta en el servidor (`GET /api/facturas-venta` →
 * `fn_facturas_venta_listado`). Módulo hoja: la ruta valida la query con estas
 * mismas listas blancas y la pantalla arma la query desde `useListadoServidor`.
 */

export const FILTROS_FACTURAS = ['estado_doc', 'estado_pago', 'moneda', 'desde', 'hasta', 'cliente', 'fe', 'monto_min', 'monto_max'] as const;
export type FiltroFacturas = (typeof FILTROS_FACTURAS)[number];

/**
 * Claves que solo viven en la URL de la pantalla (no llegan a la RPC):
 * `periodo=todo` quita el límite de emisión del listado (lo pone el KPI
 * «Vencido» o «Por cobrar», que miran toda la cartera).
 */
export const FILTROS_PANTALLA_FACTURAS = [...FILTROS_FACTURAS, 'periodo'] as const;

export const CAMPOS_ORDEN_FACTURAS = ['emision', 'numero', 'cliente', 'total', 'saldo', 'vencimiento'] as const;

const ORDENES_RPC = new Set([
  'emision_desc',
  'emision_asc',
  'numero_asc',
  'numero_desc',
  'cliente_asc',
  'total_desc',
  'total_asc',
  'saldo_desc',
  'vencimiento_asc',
]);

const VALORES: Partial<Record<FiltroFacturas, readonly string[]>> = {
  estado_doc: ['borrador', 'emitida', 'anulada'],
  estado_pago: ['pendiente', 'parcial', 'pagada', 'vencida', 'abiertas'],
  fe: ['sin', 'pending', 'processing', 'sent', 'accepted', 'rejected', 'failed', 'cancelled'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Orden del kit (campo + dirección) → orden de la RPC (con respaldo seguro). */
export function ordenFacturasRpc(campo: string | null | undefined, direccion: 'asc' | 'desc' | null | undefined): string {
  const clave = `${campo ?? 'emision'}_${direccion ?? 'desc'}`;
  if (ORDENES_RPC.has(clave)) return clave;
  if (campo === 'cliente') return 'cliente_asc';
  if (campo === 'saldo') return 'saldo_desc';
  if (campo === 'vencimiento') return 'vencimiento_asc';
  return 'emision_desc';
}

export interface ConsultaFacturas {
  filtros: Record<string, string | number | boolean>;
  orden: string;
  pagina: number;
  tamano: number;
}

/** Query de la URL (o de la petición) → parámetros de la RPC, sin nada fuera de las listas blancas. */
export function consultaFacturasDesde(params: URLSearchParams): ConsultaFacturas {
  const filtros: Record<string, string | number | boolean> = {};
  const q = (params.get('q') ?? '').trim().slice(0, 120);
  if (q) filtros.q = q;
  for (const clave of FILTROS_FACTURAS) {
    const valor = (params.get(clave) ?? '').trim();
    if (!valor) continue;
    const permitidos = VALORES[clave];
    if (permitidos && !permitidos.includes(valor)) continue;
    if ((clave === 'desde' || clave === 'hasta') && !DIA_RE.test(valor)) continue;
    if (clave === 'cliente' && !UUID_RE.test(valor)) continue;
    if (clave === 'moneda' && !/^[A-Za-z]{3}$/.test(valor)) continue;
    if ((clave === 'monto_min' || clave === 'monto_max') && !Number.isFinite(Number(valor))) continue;
    filtros[clave] = clave === 'monto_min' || clave === 'monto_max' ? Number(valor) : valor;
  }
  // Periodo de los KPIs («Facturado en el periodo»), independiente del filtro de
  // emisión del listado: al tocar «Vencido» el listado deja de limitar por
  // emisión y el KPI sigue siendo el del periodo elegido.
  for (const clave of ['kpi_desde', 'kpi_hasta'] as const) {
    const valor = (params.get(clave) ?? '').trim();
    if (DIA_RE.test(valor)) filtros[clave] = valor;
  }
  const sucursal = Number(params.get('sucursal'));
  if (Number.isInteger(sucursal) && sucursal > 0) filtros.sucursal = sucursal;
  if (params.get('incluir_nc') === '1') filtros.incluir_nc = true;
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina')) || 1));
  const tamano = Math.min(200, Math.max(1, Math.floor(Number(params.get('tamano')) || 25)));
  const orden = ORDENES_RPC.has(params.get('orden') ?? '') ? (params.get('orden') as string) : 'emision_desc';
  return { filtros, orden, pagina, tamano };
}

export interface FilaFacturaListado {
  id: string;
  numero: string | null;
  estado: string;
  tipo: string;
  emision: string | null;
  vencimiento: string | null;
  moneda: string | null;
  total: number;
  saldo: number;
  metodo: string | null;
  /** Nombre del método en el catálogo `payment_methods` (respaldo si no hay traducción). */
  metodo_nombre?: string | null;
  branch_id: number | null;
  sucursal: string | null;
  fe: string | null;
  sale_id: string | null;
  origen: string | null;
  pms: boolean;
  cliente_id: string | null;
  cliente: string | null;
  cliente_doc: string | null;
  dias_vencida: number;
}

export interface KpiFacturas {
  moneda: string;
  /** Emitidas en el periodo de los KPIs (`kpi_desde`/`kpi_hasta`). */
  facturado: number;
  facturas_emitidas: number;
  /** Cartera abierta, sin límite de emisión. */
  por_cobrar: number;
  facturas_con_saldo: number;
  vencido: number;
  facturas_vencidas: number;
  vence_15: number;
  facturas_vence_15: number;
}

export interface RespuestaListadoFacturas {
  total: number;
  filas: FilaFacturaListado[];
  kpis: KpiFacturas[];
}
