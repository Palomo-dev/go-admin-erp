/**
 * Cifras del bloque «Hoy» del inicio, leídas en el servidor con el cliente de
 * la SESIÓN (RLS) y la organización del contexto — nunca de la petición.
 *
 * No hay lógica de negocio nueva: la cartera sale de `listadoCartera`
 * (`fn_cxc_listado`, que resuelve el permiso en la base y deriva el vencido
 * vivo) y el stock de `listarStock` (`fn_stock_listado`, mismo criterio que
 * Inventario › Stock). Lo demás son conteos directos:
 * - pedidos web pendientes: mismo criterio que la observabilidad de la tienda
 *   (`status` y `payment_status` = pending, stock sin liberar);
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
import { diasDesde, enteroNoNegativo, ESTADOS_TAREA_ABIERTA, type DatosHoy } from './bloqueHoy';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

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
  let pendientesQ = ctx.supabase
    .from('web_orders')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'pending')
    .eq('payment_status', 'pending')
    .is('stock_released_at', null);
  if (sucursal) pendientesQ = pendientesQ.eq('branch_id', sucursal);
  const [pendientes, alguno] = await Promise.all([
    pendientesQ,
    // ¿La organización vende por la tienda web? Sin ningún pedido nunca, la
    // casilla sobra (no se pinta «Al día» de algo que no existe).
    ctx.supabase.from('web_orders').select('id').eq('organization_id', ctx.organizationId).limit(1),
  ]);
  if (pendientes.error) throw pendientes.error;
  if (alguno.error) throw alguno.error;
  const n = enteroNoNegativo(pendientes.count);
  if (n === 0 && (alguno.data ?? []).length === 0) return null;
  return { pendientes: n };
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

  const [cartera, existencias, web, cajas, misTareas] = await Promise.all([
    activo('finance') ? seguro('cartera', ctx, () => porCobrar(ctx, sucursal)) : null,
    activo('inventory') ? seguro('stock', ctx, () => stock(ctx, sucursal)) : null,
    activo('pos') ? seguro('pedidos web', ctx, () => pedidosWeb(ctx, sucursal)) : null,
    activo('pos') ? seguro('cajas', ctx, () => cajasAnteriores(ctx, sucursal, inicioHoy, ahora)) : null,
    seguro('tareas', ctx, () => tareas(ctx, inicioHoy, inicioManana)),
  ]);

  return {
    porCobrar: cartera,
    stock: existencias,
    pedidosWeb: web,
    cajasAnteriores: cajas,
    tareas: misTareas,
    unaSucursal: sucursal !== null,
  };
}
