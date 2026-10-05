import { applyRange, atOr, DESC_NULLS_LAST, finish, ID_DESC } from './cursor';
import type { Ctx, Raw, Row, SourceResult } from './types';

/** Un origen paginado para ventas, reservas/folios y pedidos propios. */
export async function fetchFinancialHistory(ctx: Ctx): Promise<SourceResult> {
  if (ctx.entityType !== 'customer') return { rows: [], tail: null };
  let query = ctx.supabase.from('crm_customer_financial_history')
    .select('id,kind,source_id,occurred_at,user_id,amount,status,payment_status,reference,notes,end_at,checkin,checkout,delivery_type,spaces,folios')
    .eq('organization_id', ctx.orgId).eq('timeline_customer_id', ctx.entityId);
  const financialKinds = ctx.q.kinds?.filter(k => ['sale', 'reservation', 'web_order'].includes(k));
  if (financialKinds?.length) query = query.in('kind', financialKinds);
  if (ctx.q.userId) query = query.eq('user_id', ctx.q.userId);
  query = applyRange(query, 'occurred_at', ctx, 'text');
  const { data, error } = await query.order('occurred_at', DESC_NULLS_LAST).order('id', ID_DESC).limit(ctx.limit + 1);
  if (error) throw error;
  const raw = (data ?? []) as Row[];
  const rows: Raw[] = raw.map(row => ({ kind: row.kind, id: row.id, occurred_at: atOr(row.occurred_at), user_id: row.user_id ?? null, row }));
  return finish(rows, ctx, raw.length);
}
