import { NextRequest } from 'next/server';
import { emailErrorResponse, getServerOrgContext, ok } from '@/lib/services/crm/email/http';
import { buildContext, sampleContext, VARIABLE_CATALOG } from '@/lib/services/crm/email/variables';
import { parseWith, queryObject, zVariablesQuery } from '@/lib/services/crm/email/schemas';

export const runtime = 'nodejs';

/**
 * GET /api/email/variables?opportunity_id=&customer_id=&quote_id=
 * → { catalog: VariableDef[], values: RenderContext } (valores reales si hay ids; ejemplo si no)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const q = parseWith(zVariablesQuery, queryObject(request.nextUrl.searchParams, ['opportunity_id', 'customer_id', 'quote_id']), 'query');
    const opportunityId = q.opportunity_id ?? null;
    const customerId = q.customer_id ?? null;
    const quoteId = q.quote_id ?? null;
    const values = opportunityId || customerId || quoteId
      ? await buildContext(ctx.organizationId, { opportunityId, customerId, quoteId, userId: ctx.userId }, ctx.supabase)
      : sampleContext();
    return ok({ catalog: VARIABLE_CATALOG, values, sample: !(opportunityId || customerId || quoteId) });
  } catch (err) {
    return emailErrorResponse(err, 'email/variables');
  }
}
