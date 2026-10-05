/**
 * Precios y costos por sede — piezas compartidas por navegador y servidor
 * (sin cliente propio: cada llamador pasa el suyo, con su RLS).
 *
 * Modelo (docs/inventario/PRECIOS-POR-SEDE.md):
 * - `product_branch_prices` / `product_branch_costs`: precio/costo de un
 *   producto en UNA sede, con vigencia. El general sigue en `product_prices`
 *   / `product_costs`, intacto.
 * - Resolución: sede → general (`precioVigenteEnSede` en el cliente,
 *   `fn_precios_vigentes_lote` / `fn_costos_vigentes_lote` en la base).
 * - Escritura: SOLO la RPC `fn_productos_sede_fijar` (las tablas no tienen
 *   privilegios de escritura para `authenticated`).
 *
 * Retrocompatibilidad: sin sede (o sin filas de sede) los consumidores se
 * comportan exactamente como antes. Si la migración aún no está aplicada
 * (tabla ausente), `filasDeSede` devuelve un mapa vacío en vez de fallar.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { FilaPrecio } from '@/lib/pos/precioVigente';

export const TABLA_PRECIOS_SEDE = 'product_branch_prices';
export const TABLA_COSTOS_SEDE = 'product_branch_costs';

/** Ids por petición en un filtro `in` (la URL de PostgREST tiene tope). */
const TROZO_IN = 200;

export interface FilaPrecioSede extends FilaPrecio {
  product_id: number;
  price: number | string | null;
  compare_price: number | string | null;
  effective_from: string | null;
  effective_to: string | null;
}

export interface FilaCostoSede {
  product_id: number;
  cost: number | string | null;
  supplier_id: number | null;
  effective_from: string | null;
  effective_to: string | null;
}

export type TipoValorSede = 'precio' | 'costo';

/**
 * ¿El error dice que la tabla de sede no existe? Pasa en la ventana entre
 * desplegar este código y aplicar la migración: se trata como «sin filas».
 */
export function esTablaDeSedeAusente(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /product_branch_(prices|costs)/.test(error.message ?? '') && /does not exist|not find|no existe/i.test(error.message ?? '');
}

function trozos<T>(lista: readonly T[], tamano = TROZO_IN): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

let avisoTablaAusente = false;

/**
 * Filas de precio (o costo) de UNA sede para unos productos, agrupadas por
 * producto. Solo las no cerradas antes de `ahora` (incluye las programadas a
 * futuro: la vigencia exacta la decide `precioVigente`, una sola regla). Sin
 * sede o sin ids no consulta nada.
 *
 * Lanza si la consulta falla (salvo tabla ausente): el llamador decide si
 * cae al general (pantallas) o se niega a cobrar (carrito).
 */
export async function filasDeSede(
  client: SupabaseClient,
  tipo: 'precio',
  branchId: number | null | undefined,
  productIds: readonly number[],
  opciones?: { ahora?: Date; senal?: AbortSignal },
): Promise<Map<number, FilaPrecioSede[]>>;
export async function filasDeSede(
  client: SupabaseClient,
  tipo: 'costo',
  branchId: number | null | undefined,
  productIds: readonly number[],
  opciones?: { ahora?: Date; senal?: AbortSignal },
): Promise<Map<number, FilaCostoSede[]>>;
export async function filasDeSede(
  client: SupabaseClient,
  tipo: TipoValorSede,
  branchId: number | null | undefined,
  productIds: readonly number[],
  opciones: { ahora?: Date; senal?: AbortSignal } = {},
): Promise<Map<number, Array<FilaPrecioSede | FilaCostoSede>>> {
  const mapa = new Map<number, Array<FilaPrecioSede | FilaCostoSede>>();
  const ids = Array.from(new Set(productIds.filter((x) => Number.isInteger(x) && x > 0)));
  if (!branchId || ids.length === 0) return mapa;

  const tabla = tipo === 'precio' ? TABLA_PRECIOS_SEDE : TABLA_COSTOS_SEDE;
  const columnas =
    tipo === 'precio'
      ? 'product_id, price, compare_price, effective_from, effective_to'
      : 'product_id, cost, supplier_id, effective_from, effective_to';
  const ahora = (opciones.ahora ?? new Date()).toISOString();

  for (const trozo of trozos(ids)) {
    let q = client
      .from(tabla)
      .select(columnas)
      .eq('branch_id', branchId)
      .in('product_id', trozo)
      .or(`effective_to.is.null,effective_to.gt.${ahora}`);
    if (opciones.senal) q = q.abortSignal(opciones.senal);
    const { data, error } = await q;
    if (error) {
      if (esTablaDeSedeAusente(error)) {
        if (!avisoTablaAusente) {
          avisoTablaAusente = true;
          console.warn(`[preciosSede] ${tabla} no existe todavía: se usa el ${tipo} general`);
        }
        return new Map();
      }
      throw error;
    }
    for (const f of (data ?? []) as unknown as Array<FilaPrecioSede | FilaCostoSede>) {
      const id = Number(f.product_id);
      const lista = mapa.get(id) ?? [];
      lista.push(f);
      mapa.set(id, lista);
    }
  }
  return mapa;
}

// ─── Contrato de las rutas /api/inventario/precios-sede ──────────────────

const idEntero = z.coerce.number().int().positive().max(2_147_483_647);
const importe = z.coerce.number().finite().min(0).max(1_000_000_000_000);

export const MAX_PRODUCTOS_FIJAR = 1000;
export const MAX_SEDES_FIJAR = 200;
export const MAX_PRODUCTOS_RESOLVER = 500;

/** Fijar (o quitar con `valor: null`) el precio o costo de productos en sedes. */
export const fijarValorSedeSchema = z
  .object({
    tipo: z.enum(['precio', 'costo']),
    branch_ids: z.array(idEntero).min(1).max(MAX_SEDES_FIJAR),
    product_ids: z.array(idEntero).min(1).max(MAX_PRODUCTOS_FIJAR),
    valor: importe.nullable(),
    comparacion: importe.nullable().optional(),
    /** Instante ISO con zona (timestamptz). Omitido = ahora. */
    desde: z.string().datetime({ offset: true }).optional(),
    incluir_variantes: z.boolean().optional().default(false),
    supplier_id: idEntero.nullable().optional(),
  })
  .strict()
  .refine((d) => d.tipo === 'precio' || d.comparacion == null, { path: ['comparacion'], message: 'solo_precio' })
  .refine((d) => d.tipo === 'costo' || d.supplier_id == null, { path: ['supplier_id'], message: 'solo_costo' });
export type FijarValorSede = z.infer<typeof fijarValorSedeSchema>;

/** Resolver en lote el precio/costo vigente de productos en una sede. */
export const resolverValoresSedeSchema = z
  .object({
    tipo: z.enum(['precio', 'costo']).default('precio'),
    branch_id: idEntero.nullable(),
    product_ids: z.array(idEntero).min(1).max(MAX_PRODUCTOS_RESOLVER),
    en: z.string().datetime({ offset: true }).optional(),
    heredar_padre: z.boolean().optional().default(false),
  })
  .strict();
export type ResolverValoresSede = z.infer<typeof resolverValoresSedeSchema>;

/** Detalle por sede de un producto (query string). */
export const detalleValoresSedeSchema = z.object({
  product_id: idEntero,
});

export interface ResultadoFijarSede {
  tipo: TipoValorSede;
  desde: string;
  productos: number;
  sedes: number;
  cambiados: number;
  sin_cambio: number;
  omitidos_eliminados: number;
}

export type OrigenValorSede = 'sede' | 'general' | 'padre_sede' | 'padre_general';

export interface ValorResuelto {
  product_id: number;
  valor: number | null;
  /** Precio de comparación (solo precio). */
  comparacion: number | null;
  origen: OrigenValorSede | null;
}

export interface ValorSedeDeProducto {
  branch_id: number;
  nombre: string;
  /** Precio propio de la sede vigente (null = usa el general). */
  precio_sede: number | null;
  comparacion_sede: number | null;
  /** Costo propio de la sede vigente; null si no tiene o si no puede ver costos. */
  costo_sede: number | null;
}

export interface DetalleValoresSede {
  product_id: number;
  precio_general: number | null;
  comparacion_general: number | null;
  /** null si quien consulta no puede ver costos. */
  costo_general: number | null;
  puede_ver_costos: boolean;
  sedes: ValorSedeDeProducto[];
}

/** Código de error de la RPC → estado HTTP (42501 = permiso u organización). */
export function estadoHttpDeErrorSede(code: string | null | undefined): number {
  if (code === '42501') return 403;
  if (code === '22023' || code === '23514' || code === 'P0002') return 400;
  return 500;
}

export function numeroONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}
