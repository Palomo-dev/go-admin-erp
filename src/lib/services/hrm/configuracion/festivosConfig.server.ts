/**
 * Configuración › Recursos humanos › Festivos (diseño 10.RH.1).
 * Los festivos de ley los carga GO Admin; los días propios los agrega la
 * empresa (descanso pagado como día ordinario, sin recargo festivo: decisión
 * del dueño del 2026-11-15, marcado para revisión del Contador).
 */
import type { DatosFestivos, Festivo, NuevoDiaPropio } from '@/lib/hrm/configuracion/tipos';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from '../tipos';
import { exigir, puede, sedes, sinError, type CtxConfig } from './comun.server';
import { hoyOrg } from './parametrosConfig.server';

const PERMISO = 'hr.parameters.manage';

/** `anio` null: el de «hoy» en la zona de la organización. */
export async function cargarFestivos(ctx: CtxConfig, anioPedido: number | null): Promise<DatosFestivos> {
  await exigir(ctx, PERMISO);
  const hoy = await hoyOrg(ctx);
  const anio = anioPedido ?? Number(hoy.slice(0, 4));
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new HrmError(400, 'anio_invalido');
  const [r, listaSedes] = await Promise.all([
    ctx.supabase.rpc('fn_hr_festivos', { p_org: ctx.organizationId, p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31`, p_branch: null }),
    sedes(ctx),
  ]);
  if (r.error) throw errorDeRpc(r.error);
  return { hoy, anio, festivos: (r.data ?? []) as Festivo[], sedes: listaSedes, puedeEditar: await puede(ctx, PERMISO) };
}

export async function agregarDiaPropio(ctx: CtxConfig, d: NuevoDiaPropio): Promise<{ id: string }> {
  if (!d || !esFechaPlana(d.fecha)) throw new HrmError(422, 'fecha_invalida');
  const nombre = typeof d.nombre === 'string' ? d.nombre.trim() : '';
  if (nombre.length < 2 || nombre.length > 80) throw new HrmError(422, 'nombre_invalido');
  if (d.medioDia && !(typeof d.desde === 'string' && /^\d{2}:\d{2}$/.test(d.desde))) throw new HrmError(422, 'hora_invalida');
  const sedesIds = Array.isArray(d.sedes) ? d.sedes.filter((s) => Number.isInteger(s)) : [];
  const r = await ctx.supabase
    .from('hr_org_holidays')
    .insert({
      organization_id: ctx.organizationId,
      holiday_date: d.fecha,
      name: nombre,
      half_day: !!d.medioDia,
      half_day_from: d.medioDia ? d.desde : null,
      branch_ids: sedesIds.length > 0 ? sedesIds : null,
    })
    .select('id');
  if (r.error?.code === '23505') throw new HrmError(409, 'fecha_repetida');
  const filas = sinError(r) as { id: string }[] | null;
  if (!filas || filas.length === 0) throw new HrmError(403, 'sin_permiso');
  return { id: filas[0].id };
}

export async function quitarDiaPropio(ctx: CtxConfig, id: string): Promise<void> {
  if (!esUuid(id)) throw new HrmError(400, 'dia_invalido');
  const r = await ctx.supabase.from('hr_org_holidays').delete().eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  const filas = sinError(r) as { id: string }[] | null;
  if (!filas || filas.length === 0) throw new HrmError(403, 'sin_permiso');
}
