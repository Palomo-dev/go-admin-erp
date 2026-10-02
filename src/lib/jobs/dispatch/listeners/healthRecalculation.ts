import { onCrmEvent, type CrmEventListener } from '../eventDispatcher';

export const healthRecalculationListener: CrmEventListener = async (event, ctx) => {
  if (event.organization_id !== ctx.orgId || event.entity_type !== 'health_config') throw new Error('Evento de salud fuera de contexto');
  if (ctx.signal.aborted) throw new Error('Medición de salud interrumpida');
  const [{ getOrgHealthSettings }, { recalculateOrgHealth }] = await Promise.all([import('@/lib/services/crm/healthScoreServer'), import('../../scheduled/healthRecalculate')]);
  const settings = await getOrgHealthSettings(ctx.orgId, ctx.supabase);
  // Una configuración posterior ya tiene su propio evento transaccional.
  if ((event.payload.config_stamp ?? null) !== (settings.configStamp ?? null)) return { skipped: true, reason: 'config_replaced' };
  const result = await recalculateOrgHealth(ctx.orgId, ctx.supabase, new Date(), { settings, signal: ctx.signal });
  if (ctx.signal.aborted) throw new Error('Medición de salud interrumpida');
  ctx.log.info('health_recalculation_processed', { event_id: event.id, customers: result.customers, snapshots_written: result.snapshots_written });
  return { ...result };
};

let registered = false;
export function registerHealthRecalculationListener(): void {
  if (registered) return;
  registered = true;
  onCrmEvent('health.recalculate_requested', healthRecalculationListener, 'health_recalculation');
}
