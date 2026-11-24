/**
 * Lectura de las fotos diarias de la operación para el inicio (ver `fotosOperacion.ts`).
 *
 * Con el cliente de la SESIÓN: la RLS de `ops_daily_snapshots` solo deja ver las fotos de la
 * organización de la persona y, por métrica, con el mismo permiso que abre su widget. Consulta
 * acotada al índice único (organización + sucursal + días) y a las métricas pedidas. Si falla,
 * `null`: el widget se pinta sin comparación (nunca con un delta inventado).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { DIAS_SERIE, leerFotos, type FotoDia, type MetricaFoto } from './fotosOperacion';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export async function leerFotosOperacion(
  ctx: Ctx,
  p: { sucursal: number | null; hoy: string; metricas: readonly MetricaFoto[] },
): Promise<FotoDia[] | null> {
  try {
    let q = ctx.supabase
      .from('ops_daily_snapshots')
      .select('fecha, metrica, valor')
      .eq('organization_id', ctx.organizationId)
      .gte('fecha', addPlainDays(p.hoy, -DIAS_SERIE))
      .lt('fecha', p.hoy)
      .in('metrica', [...p.metricas])
      .order('fecha', { ascending: true })
      .limit(DIAS_SERIE * p.metricas.length);
    q = p.sucursal ? q.eq('branch_id', p.sucursal) : q.is('branch_id', null);
    const { data, error } = await q;
    if (error) throw error;
    return leerFotos(data);
  } catch (err) {
    console.error('[inicio/fotos]', {
      organizationId: ctx.organizationId,
      message: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err),
    });
    return null;
  }
}
