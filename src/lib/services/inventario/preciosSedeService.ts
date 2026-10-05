/**
 * Precios y costos por sede — SOLO SERVIDOR (route handlers de
 * /api/inventario/precios-sede). Trabaja con el cliente de la SESIÓN: la RLS
 * y las guardas de las RPC se aplican como el usuario. La organización llega
 * del contexto de la sesión, nunca del cliente.
 *
 * - Escribir: `fn_productos_sede_fijar` (una transacción: cierra el vigente,
 *   abre el nuevo; permisos y pertenencia los exige la base → 42501 = 403).
 * - Resolver en lote: `fn_precios_vigentes_lote` / `fn_costos_vigentes_lote`
 *   (la regla sede → general vive en la base; aquí no se reimplementa).
 * - Detalle de un producto: el general y lo propio de cada sede.
 * - Costos: solo con `inventory.costs.view` (la misma guarda que las recetas,
 *   `fn_receta_int_puede_ver_costos`); un error cuenta como «no» (fail-closed).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { precioVigente } from '@/lib/pos/precioVigente';
import { vigente } from '@/lib/services/documentos/vigencia';
import {
  TABLA_COSTOS_SEDE,
  TABLA_PRECIOS_SEDE,
  esTablaDeSedeAusente,
  estadoHttpDeErrorSede,
  numeroONulo,
  type DetalleValoresSede,
  type FijarValorSede,
  type FilaCostoSede,
  type FilaPrecioSede,
  type OrigenValorSede,
  type ResolverValoresSede,
  type ResultadoFijarSede,
  type ValorResuelto,
} from './preciosSede';

export interface ContextoPreciosSede {
  organizationId: number;
  userId?: string | null;
  supabase: SupabaseClient;
}

type ErrorDb = { message?: string; code?: string; details?: string | null } | null;

/** Error de la base → error HTTP. Los 403 se registran (regla dura 5). */
function falla(ctx: ContextoPreciosSede, etiqueta: string, error: ErrorDb): never {
  const estado = estadoHttpDeErrorSede(error?.code);
  const codigo = (error?.message ?? '').match(/^[a-z_]+$/) ? (error?.message as string) : null;
  if (estado === 403) {
    console.warn(`[preciosSede] ${etiqueta}: 403`, {
      organizationId: ctx.organizationId,
      userId: ctx.userId ?? null,
      code: error?.code,
      motivo: codigo,
    });
    throw new OrgContextError('No tienes permiso o hay datos de otra organización', 403, codigo ?? 'sin_permiso');
  }
  if (estado === 400) throw new OrgContextError(codigo ?? 'Datos inválidos', 400, codigo ?? 'datos_invalidos');
  console.error(`[preciosSede] ${etiqueta} falló`, { message: error?.message, code: error?.code });
  throw new Error(`precios_sede_${etiqueta}`);
}

/** ¿Puede ver costos? Un error de la RPC cuenta como «no» (fail-closed). */
export async function puedeVerCostos(ctx: ContextoPreciosSede): Promise<boolean> {
  try {
    const { data, error } = await ctx.supabase.rpc('fn_receta_int_puede_ver_costos', { p_org: ctx.organizationId });
    if (error) {
      console.warn('[preciosSede] fn_receta_int_puede_ver_costos falló; se deniega', { organizationId: ctx.organizationId, message: error.message });
      return false;
    }
    return data === true;
  } catch {
    return false;
  }
}

/** La sede debe ser de la organización de la sesión; si no, 404 registrado. */
async function exigirSede(ctx: ContextoPreciosSede, branchId: number): Promise<void> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) falla(ctx, 'sede', error);
  if (!data) {
    console.warn('[preciosSede] sede ajena o inexistente', { organizationId: ctx.organizationId, branchId, userId: ctx.userId ?? null });
    throw new OrgContextError('Sede no encontrada', 404, 'sede_no_encontrada');
  }
}

/** Fija (o quita con `valor: null`) el precio/costo de productos en sedes. */
export async function fijarValoresSede(ctx: ContextoPreciosSede, entrada: FijarValorSede): Promise<ResultadoFijarSede> {
  const { data, error } = await ctx.supabase.rpc('fn_productos_sede_fijar', {
    p_organization_id: ctx.organizationId,
    p_tipo: entrada.tipo,
    p_branch_ids: entrada.branch_ids,
    p_product_ids: entrada.product_ids,
    p_valor: entrada.valor,
    p_comparacion: entrada.comparacion ?? null,
    p_desde: entrada.desde ?? null,
    p_incluir_variantes: entrada.incluir_variantes ?? false,
    p_supplier_id: entrada.supplier_id ?? null,
  });
  if (error) falla(ctx, 'fijar', error);
  return data as ResultadoFijarSede;
}

interface FilaLotePrecio {
  product_id: number;
  precio: number | string | null;
  precio_comparacion: number | string | null;
  origen: OrigenValorSede | null;
}

interface FilaLoteCosto {
  product_id: number;
  costo: number | string | null;
  origen: OrigenValorSede | null;
}

/**
 * Precio (o costo) vigente de unos productos en una sede, en lote. Sin sede
 * (`branch_id: null`) es el general. Los costos exigen `inventory.costs.view`.
 */
export async function resolverValoresSede(ctx: ContextoPreciosSede, entrada: ResolverValoresSede): Promise<ValorResuelto[]> {
  if (entrada.branch_id !== null) await exigirSede(ctx, entrada.branch_id);
  const args = {
    p_organization_id: ctx.organizationId,
    p_branch_id: entrada.branch_id,
    p_product_ids: entrada.product_ids,
    p_at: entrada.en ?? null,
    p_heredar_padre: entrada.heredar_padre ?? false,
  };
  if (entrada.tipo === 'costo') {
    if (!(await puedeVerCostos(ctx))) {
      console.warn('[preciosSede] costos sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId ?? null });
      throw new OrgContextError('No tienes permiso para ver costos', 403, 'sin_permiso');
    }
    const { data, error } = await ctx.supabase.rpc('fn_costos_vigentes_lote', args);
    if (error) falla(ctx, 'resolver_costos', error);
    return ((data ?? []) as FilaLoteCosto[]).map((f) => ({
      product_id: Number(f.product_id),
      valor: numeroONulo(f.costo),
      comparacion: null,
      origen: f.origen ?? null,
    }));
  }
  const { data, error } = await ctx.supabase.rpc('fn_precios_vigentes_lote', args);
  if (error) falla(ctx, 'resolver_precios', error);
  return ((data ?? []) as FilaLotePrecio[]).map((f) => ({
    product_id: Number(f.product_id),
    valor: numeroONulo(f.precio),
    comparacion: numeroONulo(f.precio_comparacion),
    origen: f.origen ?? null,
  }));
}

/** Detalle de un producto: precio/costo general y lo propio de cada sede activa. */
export async function detalleValoresSede(ctx: ContextoPreciosSede, productId: number): Promise<DetalleValoresSede> {
  const { data: producto, error: errorProducto } = await ctx.supabase
    .from('products')
    .select('id')
    .eq('id', productId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errorProducto) falla(ctx, 'producto', errorProducto);
  if (!producto) {
    console.warn('[preciosSede] producto ajeno o inexistente', { organizationId: ctx.organizationId, productId, userId: ctx.userId ?? null });
    throw new OrgContextError('Producto no encontrado', 404, 'producto_no_encontrado');
  }

  const verCostos = await puedeVerCostos(ctx);
  const ahora = new Date();
  const ahoraIso = ahora.toISOString();

  const [sedes, generales, costosGenerales, preciosSede, costosSede] = await Promise.all([
    ctx.supabase.from('branches').select('id, name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name', { ascending: true }),
    ctx.supabase.from('product_prices').select('price, compare_price, effective_from, effective_to').eq('product_id', productId).lte('effective_from', ahoraIso),
    verCostos
      ? ctx.supabase.from('product_costs').select('cost, effective_from, effective_to').eq('product_id', productId).lte('effective_from', ahoraIso)
      : Promise.resolve({ data: [], error: null }),
    ctx.supabase
      .from(TABLA_PRECIOS_SEDE)
      .select('branch_id, product_id, price, compare_price, effective_from, effective_to')
      .eq('organization_id', ctx.organizationId)
      .eq('product_id', productId)
      .lte('effective_from', ahoraIso)
      .or(`effective_to.is.null,effective_to.gt.${ahoraIso}`),
    verCostos
      ? ctx.supabase
          .from(TABLA_COSTOS_SEDE)
          .select('branch_id, product_id, cost, supplier_id, effective_from, effective_to')
          .eq('organization_id', ctx.organizationId)
          .eq('product_id', productId)
          .lte('effective_from', ahoraIso)
          .or(`effective_to.is.null,effective_to.gt.${ahoraIso}`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (sedes.error) falla(ctx, 'sedes', sedes.error);
  if (generales.error) falla(ctx, 'precio_general', generales.error);
  if (costosGenerales.error) falla(ctx, 'costo_general', costosGenerales.error);
  const filasPrecioSede = preciosSede.error && esTablaDeSedeAusente(preciosSede.error) ? [] : preciosSede.data;
  if (preciosSede.error && !esTablaDeSedeAusente(preciosSede.error)) falla(ctx, 'precios_sede', preciosSede.error);
  const filasCostoSede = costosSede.error && esTablaDeSedeAusente(costosSede.error) ? [] : costosSede.data;
  if (costosSede.error && !esTablaDeSedeAusente(costosSede.error)) falla(ctx, 'costos_sede', costosSede.error);

  const precioPorSede = new Map<number, FilaPrecioSede[]>();
  for (const f of (filasPrecioSede ?? []) as Array<FilaPrecioSede & { branch_id: number }>) {
    const lista = precioPorSede.get(Number(f.branch_id)) ?? [];
    lista.push(f);
    precioPorSede.set(Number(f.branch_id), lista);
  }
  const costoPorSede = new Map<number, FilaCostoSede[]>();
  for (const f of (filasCostoSede ?? []) as Array<FilaCostoSede & { branch_id: number }>) {
    const lista = costoPorSede.get(Number(f.branch_id)) ?? [];
    lista.push(f);
    costoPorSede.set(Number(f.branch_id), lista);
  }

  type FilaGeneral = { price: number | string | null; compare_price: number | string | null; effective_from: string | null; effective_to: string | null };
  type FilaCostoGeneral = { cost: number | string | null; effective_from: string | null; effective_to: string | null };
  const general = precioVigente((generales.data ?? []) as FilaGeneral[], ahora);
  const costoGeneral = verCostos ? vigente((costosGenerales.data ?? []) as FilaCostoGeneral[], ahora.getTime()) : null;

  return {
    product_id: productId,
    precio_general: numeroONulo(general?.price),
    comparacion_general: numeroONulo(general?.compare_price),
    costo_general: verCostos ? numeroONulo(costoGeneral?.cost) : null,
    puede_ver_costos: verCostos,
    sedes: ((sedes.data ?? []) as Array<{ id: number; name: string }>).map((s) => {
      const p = precioVigente(precioPorSede.get(Number(s.id)) ?? [], ahora);
      const c = verCostos ? vigente(costoPorSede.get(Number(s.id)) ?? [], ahora.getTime()) : null;
      return {
        branch_id: Number(s.id),
        nombre: s.name,
        precio_sede: numeroONulo(p?.price),
        comparacion_sede: numeroONulo(p?.compare_price),
        costo_sede: verCostos ? numeroONulo(c?.cost) : null,
      };
    }),
  };
}
