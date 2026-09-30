/**
 * Cifras del bloque «Hoy» del inicio, leídas en el servidor con el cliente de
 * la SESIÓN (RLS) y la organización del contexto — nunca de la petición.
 *
 * No hay lógica de negocio nueva: la cartera sale de `listadoCartera`
 * (`fn_cxc_listado`, que resuelve el permiso en la base y deriva el vencido
 * vivo) y el stock de `listarStock` (`fn_stock_listado`, mismo criterio que
 * Inventario › Stock). Lo demás son conteos directos:
 * - pedidos web pendientes y por expirar: `fn_inicio_pedidos_web_pendientes`
 *   (`status` y `payment_status` = pending, stock sin liberar; expiración con
 *   el criterio de `expire_pending_web_orders`), la misma de «Tienda web»;
 * - reservas de stock de la tienda sin moverse hace más de 24 h (regla de
 *   `lib/pos/reservasStock.ts`, la del panel de observabilidad);
 * - cajas abiertas desde un día anterior de la organización;
 * - tareas abiertas asignadas a la persona, cuántas vencen hoy y cuántas ya
 *   vencieron (día calendario de la organización).
 *
 * Cada casilla depende de su módulo (`organization_modules`); si el módulo
 * está apagado, la persona no tiene permiso o la consulta falla, la casilla
 * llega `null` y no se pinta. Un fallo parcial no tumba el bloque.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { listadoCartera } from '@/lib/services/cartera/cuentasPorCobrar.server';
import { listarStock } from '@/lib/services/stockService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { nextPlainDay, plainDateToInstant, todayInTz } from '@/lib/utils/dateDisplay';
import { limiteReservaHuerfana } from '@/lib/pos/reservasStock';
import { diasDesde, enteroNoNegativo, ESTADOS_TAREA_ABIERTA, type DatosHoy } from './bloqueHoy';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

/** Ventana de «expiran en menos de N min» del bloque «Hoy» (Figma 445:137185). */
export const MINUTOS_POR_EXPIRAR = 30;

async function seguro<T>(etiqueta: string, ctx: Ctx, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[inicio/hoy] ${etiqueta}`, {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function porCobrar(ctx: Ctx, sucursal: number | null): Promise<DatosHoy['porCobrar']> {
  const filtros: Record<string, string | number> = { estado: 'abiertas', origen: 'todos' };
  if (sucursal) filtros.sucursal = sucursal;
  const r = await listadoCartera(ctx, { filtros, orden: 'antiguedad_desc', pagina: 1, tamano: 1, origen: 'todos' });
  return {
    vencido: Math.max(0, r.resumen.vencida),
    cuentas: enteroNoNegativo(r.resumen.cuentas_vencidas),
    diasMasVieja: enteroNoNegativo(r.filas[0]?.dias),
    monedas: r.resumen.monedas,
  };
}

async function stock(ctx: Ctx, sucursal: number | null): Promise<DatosHoy['stock']> {
  const r = await listarStock(ctx.organizationId, { sucursales: sucursal ? [sucursal] : undefined }, 0, 1, ctx.supabase);
  return { bajoMinimo: enteroNoNegativo(r.kpis.bajo_minimo), agotados: enteroNoNegativo(r.kpis.agotados) };
}

async function pedidosWeb(ctx: Ctx, sucursal: number | null): Promise<DatosHoy['pedidosWeb']> {
  // Una sola función para el bloque «Hoy» y la tarjeta «Tienda web»:
  // pendientes (status y payment_status pending, stock sin liberar) y los que
  // expiran en los próximos 30 min con el criterio de `expire_pending_web_orders`.
  const { data, error } = await ctx.supabase.rpc('fn_inicio_pedidos_web_pendientes', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursal,
    p_minutos: MINUTOS_POR_EXPIRAR,
  });
  if (error) throw error;
  const r = (data ?? {}) as { pendientes?: number; por_expirar?: number; hay_pedidos?: boolean };
  const n = enteroNoNegativo(r.pendientes);
  // Sin ningún pedido nunca, la casilla sobra (no se pinta «Al día» de algo
  // que no existe).
  if (n === 0 && !r.hay_pedidos) return null;
  return { pendientes: n, porExpirar: enteroNoNegativo(r.por_expirar), minutos: MINUTOS_POR_EXPIRAR };
}

/**
 * Reservas de stock sin moverse hace más de 24 h (regla única de
 * `lib/pos/reservasStock.ts`, la del panel de observabilidad): solo productos
 * con control de stock y sin lote, en las sucursales de la organización (la
 * política de `stock_levels` deja ver las de TODAS las organizaciones de la
 * persona: por eso se filtra por las sucursales de esta).
 */
async function reservasStock(ctx: Ctx, sucursal: number | null, ahora: Date): Promise<DatosHoy['reservasStock']> {
  let ids: number[];
  if (sucursal) {
    ids = [sucursal];
  } else {
    const r = await ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId);
    if (r.error) throw r.error;
    ids = (r.data ?? []).map((b: { id: number }) => b.id);
  }
  if (ids.length === 0) return { huerfanas: 0, unidades: 0 };
  const { data, count, error } = await ctx.supabase
    .from('stock_levels')
    .select('qty_reserved, products!inner(track_stock)', { count: 'exact' })
    .in('branch_id', ids)
    .gt('qty_reserved', 0)
    .is('lot_id', null)
    .eq('products.track_stock', true)
    .lt('updated_at', limiteReservaHuerfana(ahora))
    .limit(1000);
  if (error) throw error;
  const unidades = (data ?? []).reduce((s: number, x: { qty_reserved: number | string | null }) => s + (Number(x.qty_reserved) || 0), 0);
  return { huerfanas: enteroNoNegativo(count ?? (data ?? []).length), unidades: Math.round(unidades) };
}

async function cajasAnteriores(
  ctx: Ctx,
  sucursal: number | null,
  inicioHoy: string,
  ahora: Date
): Promise<DatosHoy['cajasAnteriores']> {
  let q = ctx.supabase
    .from('cash_sessions')
    .select('opened_at', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'open')
    .lt('opened_at', inicioHoy)
    .order('opened_at', { ascending: true })
    .limit(1);
  if (sucursal) q = q.eq('branch_id', sucursal);
  const { data, count, error } = await q;
  if (error) throw error;
  return { cantidad: enteroNoNegativo(count), diasMasVieja: diasDesde(data?.[0]?.opened_at as string | undefined, ahora) };
}

async function tareas(ctx: Ctx, inicioHoy: string, inicioManana: string): Promise<DatosHoy['tareas']> {
  const base = () =>
    ctx.supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('assigned_to', ctx.userId)
      .in('status', [...ESTADOS_TAREA_ABIERTA]);
  const [abiertas, hoy, vencidas] = await Promise.all([
    base(),
    base().gte('due_date', inicioHoy).lt('due_date', inicioManana),
    base().lt('due_date', inicioHoy),
  ]);
  for (const r of [abiertas, hoy, vencidas]) if (r.error) throw r.error;
  return {
    abiertas: enteroNoNegativo(abiertas.count),
    vencenHoy: enteroNoNegativo(hoy.count),
    vencidas: enteroNoNegativo(vencidas.count),
  };
}

/**
 * La sucursal que llega en la query solo se acepta si es de la organización
 * del contexto (con el cliente de la sesión: RLS). Si no, `null` = error del
 * llamador, que responde 400.
 */
export async function sucursalValida(ctx: Ctx, sucursal: number): Promise<boolean> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id')
    .eq('id', sucursal)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  return !error && !!data;
}

export async function datosHoy(ctx: Ctx, sucursal: number | null, ahora: Date = new Date()): Promise<DatosHoy> {
  const [modulos, zona] = await Promise.all([
    moduleManagementService.getActiveModules(ctx.organizationId, ctx.supabase).catch(() => null),
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
  ]);
  const activos = new Set((modulos ?? []).map((m) => m.code));
  // Sin la lista de módulos no se adivina: solo se pinta lo que no depende de
  // uno (las tareas asignadas a la persona).
  const activo = (codigo: string) => modulos !== null && activos.has(codigo);

  const hoy = todayInTz(zona);
  const inicioHoy = plainDateToInstant(hoy, zona);
  const inicioManana = plainDateToInstant(nextPlainDay(hoy), zona);

  const [cartera, existencias, web, reservas, cajas, misTareas] = await Promise.all([
    activo('finance') ? seguro('cartera', ctx, () => porCobrar(ctx, sucursal)) : null,
    activo('inventory') ? seguro('stock', ctx, () => stock(ctx, sucursal)) : null,
    activo('pos') ? seguro('pedidos web', ctx, () => pedidosWeb(ctx, sucursal)) : null,
    activo('pos') ? seguro('reservas de stock', ctx, () => reservasStock(ctx, sucursal, ahora)) : null,
    activo('pos') ? seguro('cajas', ctx, () => cajasAnteriores(ctx, sucursal, inicioHoy, ahora)) : null,
    seguro('tareas', ctx, () => tareas(ctx, inicioHoy, inicioManana)),
  ]);

  return {
    porCobrar: cartera,
    stock: existencias,
    pedidosWeb: web,
    reservasStock: reservas,
    cajasAnteriores: cajas,
    tareas: misTareas,
    unaSucursal: sucursal !== null,
  };
}
