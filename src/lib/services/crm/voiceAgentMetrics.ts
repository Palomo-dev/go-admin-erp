import { z } from 'zod';
import { VOICE_AGENT_CALL_STATUSES } from '@/lib/crm/enums';
import { CrmHttpError, exigirUuid, type CrmSesion } from './crmRouteSupport';

const count = z.number().int().nonnegative();
export const voiceAgentMetricsSchema = z.object({
  period_days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  total: count, effective: count, average_duration_seconds: z.number().nonnegative().nullable(), credits_consumed: count,
  omissions: z.object({ rne_excluded: count, law_rescheduled: count, other_skipped: count }).optional(),
  statuses: z.array(z.object({ status: z.enum(VOICE_AGENT_CALL_STATUSES), total: count })),
  tools: z.array(z.object({ tool: z.string(), status: z.enum(['applied', 'suggested', 'denied', 'failed']), total: count })),
  rows: z.array(z.object({ id: z.string().uuid(), call_id: z.string().uuid().nullable(), customer_name: z.string().nullable(), status: z.enum(VOICE_AGENT_CALL_STATUSES), outcome: z.string().nullable(), duration_seconds: z.number().nonnegative().nullable(), created_at: z.string().datetime({ offset: true }), source: z.enum(['campaign', 'stage', 'direct']), last_error_code: z.string().nullable() })),
  limit: count, offset: count,
});
export type VoiceAgentMetrics = z.infer<typeof voiceAgentMetricsSchema>;
export async function getVoiceAgentMetrics(ctx: CrmSesion, agentId: string, params: URLSearchParams): Promise<VoiceAgentMetrics> {
  exigirUuid(agentId, 'agente');
  const period = params.get('periodo') ?? '30d';
  if (!['7d', '30d', '90d'].includes(period)) throw new CrmHttpError(400, 'periodo_invalido', 'Periodo inválido');
  const limit = Number(params.get('limit') ?? 20), offset = Number(params.get('offset') ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw new CrmHttpError(400, 'paginacion_invalida', 'Paginación inválida');
  const { data, error } = await ctx.supabase.rpc('crm_voice_agent_metrics', { p_org: ctx.organizationId, p_agent: agentId, p_days: Number(period.slice(0, -1)), p_limit: limit, p_offset: offset });
  if (error) throw error;
  const parsed = voiceAgentMetricsSchema.safeParse(data);
  if (!parsed.success) throw new CrmHttpError(502, 'datos_invalidos', 'Métricas inválidas');
  return parsed.data;
}
