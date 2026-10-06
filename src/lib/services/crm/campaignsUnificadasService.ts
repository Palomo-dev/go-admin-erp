/**
 * Campañas de mensajes y de voz en un solo listado (Figma CRM «Campañas»).
 * Una sola RPC (`crm_campaigns_unificadas`) con la sesión del usuario; aquí
 * solo se proyecta, filtra y pagina. SOLO servidor.
 *
 * `canManage` es el MISMO predicado que exigen las acciones de la lista
 * (`/api/crm/campaigns/*` y `/api/crm/voice-agents/campaigns/*`: admin de la
 * organización), para no ofrecer botones que devuelvan 403.
 */
import { z } from 'zod';
import { isOrgAdminContext, type ServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm } from './crmRouteSupport';
import { CANALES_CAMPANA, filtrarCampanas, proyectarCampana, type CampanaUnificadaRaw } from './campaignsUnificadasLogica';

export const campanasUnificadasQuery = z.object({
  channel: z.enum(CANALES_CAMPANA).default('all'),
  q: z.string().trim().max(200).default(''),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export async function listarCampanasUnificadas(ctx: ServerOrgContext, filtros: z.infer<typeof campanasUnificadasQuery>) {
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'ver campañas');
  const { data, error } = await ctx.supabase.rpc('crm_campaigns_unificadas', { p_org: ctx.organizationId });
  if (error) throw error;
  const filas = (Array.isArray(data) ? (data as CampanaUnificadaRaw[]) : []).map(proyectarCampana);
  return { ...filtrarCampanas(filas, filtros), canManage: isOrgAdminContext(ctx) };
}
