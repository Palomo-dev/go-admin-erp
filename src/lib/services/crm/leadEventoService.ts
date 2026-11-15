import { CrmHttpError, type CrmSesion } from './crmRouteSupport';
import { eventoPrivadoDeLead, type ContextoEventoLead } from '@/lib/crm/eventoPrivadoLead';

/**
 * Contexto del detalle rápido de un lead (Figma 1951:941568): el nombre de la
 * sede de su última solicitud de evento privado y sus inasistencias a reservas
 * de restaurante. Lectura con la sesión del usuario (RLS) y, además, filtro
 * explícito por la organización de la sesión en cada consulta.
 *
 * - La sede sale de `customers.metadata.lead.capturas` LEÍDO AQUÍ, nunca de un
 *   parámetro del navegador, y se busca en `branches` de la misma organización.
 * - Inasistencias: `restaurant_reservations` del cliente con `status = no_show`
 *   (conteo exacto + la más reciente por `reservation_date`, que es `date`).
 */
export async function contextoEventoLead(ctx: CrmSesion, customerId: string): Promise<ContextoEventoLead> {
  const cliente = await ctx.supabase
    .from('customers')
    .select('id, metadata_lead:metadata->lead')
    .eq('id', customerId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (cliente.error) throw cliente.error;
  if (!cliente.data) throw new CrmHttpError(404, 'no_encontrado', 'Lead no encontrado');

  const evento = eventoPrivadoDeLead((cliente.data as { metadata_lead?: unknown }).metadata_lead);

  const noShows = await ctx.supabase
    .from('restaurant_reservations')
    .select('reservation_date, branch_id', { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .eq('customer_id', customerId)
    .eq('status', 'no_show')
    .order('reservation_date', { ascending: false })
    .order('reservation_time', { ascending: false })
    .limit(1);
  if (noShows.error) throw noShows.error;
  const ultima = (noShows.data?.[0] ?? null) as { reservation_date: string; branch_id: number | null } | null;

  const ids = [...new Set([evento?.branchId, ultima?.branch_id].filter((x): x is number => typeof x === 'number'))];
  const nombres = new Map<number, string>();
  if (ids.length > 0) {
    const sedes = await ctx.supabase.from('branches').select('id, name').eq('organization_id', ctx.organizationId).in('id', ids);
    if (sedes.error) throw sedes.error;
    for (const s of (sedes.data ?? []) as { id: number; name: string | null }[]) nombres.set(s.id, s.name?.trim() || `#${s.id}`);
  }

  const sedeId = evento?.branchId ?? null;
  return {
    sede: sedeId != null && nombres.has(sedeId) ? { id: sedeId, nombre: nombres.get(sedeId) as string } : null,
    inasistencias: {
      total: noShows.count ?? 0,
      ultima: ultima ? { fecha: ultima.reservation_date, sede: ultima.branch_id != null ? nombres.get(ultima.branch_id) ?? null : null } : null,
    },
  };
}
