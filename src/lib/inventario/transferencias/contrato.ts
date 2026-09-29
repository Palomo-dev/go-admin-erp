/**
 * Contrato de traslados y distribución (inventario B3, INVENTARIO-PLAN.md §5.4).
 *
 * Espejo TypeScript de las RPC `fn_traslado_*`, `fn_traslados_listado` y
 * `fn_distribucion_*` (migraciones `supabase/migrations/20260929073*_inv_b3_*`)
 * y de los cuerpos que aceptan los route handlers `/api/inventario/transferencias/**`
 * y `/api/inventario/distribucion/**`. La organización nunca viaja en el
 * cuerpo: la pone el servidor desde la sesión (regla dura 5).
 *
 * Decisiones del dueño (2026-09-28):
 * - P7: despachar descuenta el origen (queda «en tránsito»); quien recibe
 *   confirma y decide la diferencia: «faltante en el transporte» (con motivo,
 *   merma en el destino) o «sigue en camino».
 * - P5: el traslado no puede dejar el origen en negativo.
 * - Lotes y seriales viajan con el traslado.
 */
import { z } from 'zod';

/** `inventory_transfers.status` (CHECK de la base). */
export const ESTADOS_TRASLADO = ['pending', 'in_transit', 'received', 'cancelled'] as const;
export type EstadoTraslado = (typeof ESTADOS_TRASLADO)[number];

/**
 * Estado que ve el usuario (Figma): el recibido con faltante se muestra aparte.
 * Es también el valor del filtro «Estado».
 */
export const ESTADOS_VISIBLES = ['pending', 'in_transit', 'received', 'con_diferencia', 'cancelled'] as const;
export type EstadoVisibleTraslado = (typeof ESTADOS_VISIBLES)[number];

export interface SucursalRef {
  id: number;
  nombre: string | null;
}

export interface OrdenProduccionRef {
  id: number;
  numero: string;
}

/** Una fila de `fn_traslados_listado`. */
export interface TrasladoFila {
  id: number;
  code: string;
  estado: EstadoTraslado;
  con_diferencia: boolean;
  origen: SucursalRef;
  destino: SucursalRef;
  creado_en: string;
  autor: string | null;
  despachado_en: string | null;
  recibido_en: string | null;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  notas: string | null;
  productos: number;
  renglones: number;
  enviadas: number;
  recibidas: number;
  faltantes: number;
  devueltas: number;
  /** null sin permiso de costos. */
  valor: number | null;
  primer_producto: string | null;
  orden_produccion: OrdenProduccionRef | null;
  /** En tránsito hace más de 30 días. */
  atascado: boolean;
}

export interface KpisTraslados {
  por_despachar: number;
  por_despachar_unidades: number;
  en_transito: number;
  en_transito_unidades: number;
  en_transito_desde: string | null;
  recibidos_mes: number;
  recibidos_mes_unidades: number;
  con_diferencia: number;
  con_diferencia_enviadas: number;
  con_diferencia_recibidas: number;
  total: number;
}

export interface TrasladoAtascado {
  id: number;
  code: string;
  unidades: number;
  origen: string | null;
  destino: string | null;
  desde: string;
}

/** Permisos que la pantalla necesita (de `fn_inventario_permisos`). */
export interface PermisosTraslados {
  ver: boolean;
  trasladar: boolean;
  recibir: boolean;
  costos: boolean;
}

export const PERMISOS_TRASLADOS_VACIOS: PermisosTraslados = { ver: false, trasladar: false, recibir: false, costos: false };

export interface ListadoTraslados {
  filas: TrasladoFila[];
  total: number;
  kpis: KpisTraslados;
  atascados: TrasladoAtascado[];
  /** Día de hoy en la zona de la organización (YYYY-MM-DD). */
  hoy: string;
  permisos: PermisosTraslados;
}

export const PERIODOS = ['hoy', '7d', 'mes'] as const;
export type Periodo = (typeof PERIODOS)[number];

const entero = z.coerce.number().int().positive().max(2_147_483_647);
const fechaPlana = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Booleano de query string: solo `true`/`false` literales (z.coerce.boolean() daría true con «false»). */
const booleanoQuery = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

/** Query de `GET /api/inventario/transferencias` (→ `p_filtros` de fn_traslados_listado). */
export const filtrosTrasladosSchema = z.object({
  busqueda: z.string().trim().max(200).optional(),
  estados: z.array(z.enum(ESTADOS_VISIBLES)).max(5).optional(),
  sucursal: entero.optional(),
  origen: entero.optional(),
  destino: entero.optional(),
  orden_produccion: entero.optional(),
  solo_produccion: booleanoQuery.optional(),
  excluir_cancelados: booleanoQuery.optional(),
  desde: fechaPlana.optional(),
  hasta: fechaPlana.optional(),
  periodo: z.enum(PERIODOS).optional(),
  orden: z.enum(['fecha', 'codigo']).optional(),
  direccion: z.enum(['asc', 'desc']).optional(),
  desde_fila: z.coerce.number().int().min(0).max(1_000_000).optional(),
  limite: z.coerce.number().int().min(1).max(5000).optional(),
});
export type FiltrosTraslados = z.infer<typeof filtrosTrasladosSchema>;

// ─── Detalle ──────────────────────────────────────────────────────────────

export interface LoteRef {
  id: number;
  codigo: string;
  /** Columna `date`: se muestra con formatPlainDate. */
  vence: string | null;
}

export interface SerialRef {
  id: number;
  serial: string;
  estado?: string;
}

export interface RenglonTraslado {
  id: number;
  product_id: number;
  nombre: string;
  sku: string | null;
  unidad: string | null;
  variante: string | null;
  track_serial: boolean;
  track_lots: boolean;
  lote: LoteRef | null;
  cantidad: number;
  recibido: number;
  faltante: number;
  devuelto: number;
  pendiente: number;
  /** Costo con que salió (o el promedio del origen si aún no sale). null sin permiso de costos. */
  costo: number | null;
  motivo: string | null;
  estado: 'pending' | 'in_transit' | 'received';
  seriales: SerialRef[];
  /** Solo pendientes: lo disponible hoy en el origen. */
  disponible: number | null;
  /** Solo pendientes con seriales: los que se pueden escanear al despachar. */
  seriales_disponibles: SerialRef[] | null;
}

export type TipoEventoTraslado = 'creado' | 'editado' | 'despachado' | 'recibido' | 'cancelado' | 'devuelto';

export interface EventoTraslado {
  id: number;
  tipo: TipoEventoTraslado;
  fecha: string;
  autor: string | null;
  detalle: {
    unidades?: number;
    renglones?: number;
    faltantes?: number;
    en_camino?: number;
    valor?: number;
    valor_faltante?: number;
    motivo?: string | null;
    legado?: boolean;
    limpieza?: string;
    lineas?: { item_id: number; recibido: number; diferencia: number; decision: string | null; motivo: string | null }[];
  };
}

export interface MovimientoTraslado {
  id: number;
  branch_id: number;
  product_id: number;
  lot_id: number | null;
  direccion: 'in' | 'out';
  cantidad: number;
  origen: string;
  fecha: string;
  costo: number | null;
}

export interface CabeceraTraslado {
  id: number;
  code: string;
  estado: EstadoTraslado;
  notas: string | null;
  origen: SucursalRef;
  destino: SucursalRef;
  creado_en: string;
  despachado_en: string | null;
  recibido_en: string | null;
  cancelado_en: string | null;
  motivo_cancelacion: string | null;
  autor: string | null;
  despachado_por: string | null;
  recibido_por: string | null;
  orden_produccion: OrdenProduccionRef | null;
  atascado: boolean;
  legado: boolean;
}

export interface DetalleTraslado {
  traslado: CabeceraTraslado;
  items: RenglonTraslado[];
  eventos: EventoTraslado[];
  movimientos: MovimientoTraslado[];
  ver_costos: boolean;
  permisos: PermisosTraslados;
}

// ─── Escritura ────────────────────────────────────────────────────────────

const cantidad = z.coerce.number().positive().max(1_000_000_000);

export const renglonNuevoSchema = z.object({
  product_id: entero,
  quantity: cantidad,
  lot_id: entero.nullable().optional(),
});
export type RenglonNuevo = z.infer<typeof renglonNuevoSchema>;

/** Cuerpo de crear (POST) y editar (PUT) un traslado pendiente. */
export const guardarTrasladoSchema = z.object({
  origen: entero,
  destino: entero,
  notas: z.string().trim().max(500).optional().nullable(),
  production_order_id: entero.nullable().optional(),
  items: z.array(renglonNuevoSchema).min(1).max(500),
  /** Crear y despachar en el mismo paso («Crear y despachar»). */
  despachar: z.boolean().optional(),
  /** Seriales por renglón si se despacha al crear: índice del renglón → ids. */
  seriales: z.record(z.string().regex(/^\d{1,4}$/), z.array(entero).max(1000)).optional(),
  clave: z.string().trim().min(8).max(100).optional(),
});
export type GuardarTraslado = z.infer<typeof guardarTrasladoSchema>;

export const despacharSchema = z.object({
  /** item_id → ids de serial_numbers. */
  seriales: z.record(z.string().regex(/^\d{1,10}$/), z.array(entero).max(1000)).optional(),
  clave: z.string().trim().min(8).max(100).optional(),
});
export type DespacharTraslado = z.infer<typeof despacharSchema>;

export const DECISIONES_DIFERENCIA = ['faltante', 'en_camino'] as const;
export type DecisionDiferencia = (typeof DECISIONES_DIFERENCIA)[number];

export const lineaRecibirSchema = z.object({
  item_id: entero,
  recibido: z.coerce.number().min(0).max(1_000_000_000),
  decision: z.enum(DECISIONES_DIFERENCIA).nullable().optional(),
  motivo: z.string().trim().max(300).nullable().optional(),
  seriales: z.array(entero).max(1000).optional(),
});
export type LineaRecibir = z.infer<typeof lineaRecibirSchema>;

export const recibirSchema = z.object({
  lineas: z.array(lineaRecibirSchema).min(1).max(1000),
  clave: z.string().trim().min(8).max(100),
});
export type RecibirTraslado = z.infer<typeof recibirSchema>;

export const motivoSchema = z.object({
  motivo: z.string().trim().max(300).optional().nullable(),
  clave: z.string().trim().min(8).max(100).optional(),
});

export interface ResultadoOperacion {
  id: number;
  code: string;
  status: EstadoTraslado;
  repetido?: boolean;
  ya_despachado?: boolean;
  ya_recibido?: boolean;
  ya_cancelado?: boolean;
  unidades?: number;
  faltantes?: number;
  en_camino?: number;
  valor_faltante?: number;
  /** «Crear y despachar»: se creó pero el despacho falló (HTTP 207); `codigo` dice por qué. */
  creado?: boolean;
  codigo?: ErrorTraslado;
  detalle?: DetalleErrorTraslado | null;
}

// ─── Buscador de productos del origen ─────────────────────────────────────

export interface LoteDisponibleTraslado {
  lot_id: number;
  codigo: string;
  vence: string | null;
  disponible: number;
  vencido: boolean;
}

export interface ProductoTrasladable {
  product_id: number;
  nombre: string;
  sku: string | null;
  barcode: string | null;
  unidad: string | null;
  variante: string | null;
  track_lots: boolean;
  track_serial: boolean;
  disponible: number;
  costo_promedio: number | null;
  lotes: LoteDisponibleTraslado[];
}

export const productosQuerySchema = z.object({
  origen: entero,
  q: z.string().trim().max(120).optional(),
  ids: z.array(entero).max(200).optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});

// ─── Distribución ─────────────────────────────────────────────────────────

export interface OrdenDistribuible {
  id: number;
  numero: string;
  completado_en: string | null;
  producto: { id: number; nombre: string; sku: string | null; unidad: string | null };
  producido: number;
  ya_distribuido: number;
  disponible: number;
  por_distribuir: number;
}

export const crearDistribucionSchema = z.object({
  origen: entero,
  production_order_id: entero.nullable().optional(),
  despachar: z.boolean().optional(),
  notas: z.string().trim().max(500).optional().nullable(),
  envios: z
    .array(
      z.object({
        destino: entero,
        items: z.array(renglonNuevoSchema).min(1).max(500),
      }),
    )
    .min(1)
    .max(30),
  clave: z.string().trim().min(8).max(100),
});
export type CrearDistribucion = z.infer<typeof crearDistribucionSchema>;

export interface ResultadoDistribucion {
  traslados: { id: number; code: string; status: EstadoTraslado; destino: number }[];
  repetido: boolean;
}

// ─── Errores ──────────────────────────────────────────────────────────────

/** Códigos estables que devuelven los route handlers (`{ codigo, detalle? }`). */
export const ERRORES_TRASLADO = [
  'datos_invalidos',
  'sin_permiso',
  'sucursal_sin_acceso',
  'sucursal_ajena',
  'producto_ajeno',
  'traslado_no_encontrado',
  'estado_invalido',
  'stock_insuficiente',
  'seriales_requeridos',
  'seriales_no_cuadran',
  'serial_no_disponible',
  'serial_repetido',
  'decision_requerida',
  'motivo_requerido',
  'recibido_invalido',
  'nada_que_recibir',
  'nada_que_devolver',
  'misma_sucursal',
  'sucursales_requeridas',
  'sucursal_inactiva',
  'producto_no_trasladable',
  'lote_invalido',
  'renglon_repetido',
  'renglon_invalido',
  'cantidad_invalida',
  'items_requeridos',
  'demasiados_renglones',
  'orden_produccion_invalida',
  'excede_orden_produccion',
  'organizacion_no_permitida',
  'sin_sesion',
  'error_desconocido',
] as const;
export type ErrorTraslado = (typeof ERRORES_TRASLADO)[number];

/** Mensajes de la base que no coinciden con el código de la interfaz. */
const ALIAS: Record<string, ErrorTraslado> = {
  SUCURSAL_NO_ES_DE_LA_ORG: 'sucursal_ajena',
  PRODUCTO_NO_ES_DE_LA_ORG: 'producto_ajeno',
};

/** Error de PostgREST → código estable. */
export function codigoErrorTraslado(error: { message?: string | null; code?: string | null } | null | undefined): ErrorTraslado {
  const mensaje = (error?.message ?? '').trim();
  if (ALIAS[mensaje]) return ALIAS[mensaje];
  const conocido = (ERRORES_TRASLADO as readonly string[]).find((c) => mensaje === c || mensaje.startsWith(`${c}:`));
  if (conocido) return conocido as ErrorTraslado;
  if (error?.code === '42501' || /sin_permiso|acceso denegado/i.test(mensaje)) return 'sin_permiso';
  if (error?.code === 'P0002') return 'traslado_no_encontrado';
  if (error?.code === '23514') return 'stock_insuficiente';
  return 'error_desconocido';
}

export function estadoHttpErrorTraslado(codigo: ErrorTraslado): number {
  switch (codigo) {
    case 'sin_permiso':
    case 'sucursal_sin_acceso':
    case 'sucursal_ajena':
    case 'producto_ajeno':
    case 'organizacion_no_permitida':
      return 403;
    case 'sin_sesion':
      return 401;
    case 'traslado_no_encontrado':
      return 404;
    case 'estado_invalido':
    case 'stock_insuficiente':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

/** Detalle estructurado que algunas RPC mandan en `details` (JSON). */
export interface DetalleErrorTraslado {
  product_id?: number;
  branch_id?: number;
  lot_id?: number | null;
  disponible?: number;
  solicitado?: number;
  item_id?: number;
  producto?: string;
  pendiente?: number;
  producido?: number;
  ya_distribuido?: number;
}

export function detalleErrorTraslado(details: string | null | undefined): DetalleErrorTraslado | null {
  if (!details) return null;
  try {
    const d = JSON.parse(details) as unknown;
    return d && typeof d === 'object' && !Array.isArray(d) ? (d as DetalleErrorTraslado) : null;
  } catch {
    return null;
  }
}
