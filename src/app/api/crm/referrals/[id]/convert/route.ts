import { NextRequest } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { convertReferral } from '@/lib/services/crm/referralsService';
import { isUuid } from '@/lib/services/crm/f12Validation';
import { jsonFail, jsonOk, readJson, rejectForeignOrganization, routeError } from '@/lib/services/crm/f12RouteSupport';

const TAG = 'CRM Referrals Convert';

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * POST /api/crm/referrals/[id]/convert — convierte un referido `qualified`
 * en lead: ficha de cliente (`lifecycle_stage='lead'`) y oportunidad
 * (`record_type='lead'`, `source='referral'`, `deal_type='referral'`) con el
 * MISMO alta que `POST /api/crm/leads`; el referido pasa a `converted` con
 * `opportunity_id` y `referred_customer_id`.
 * Body (todo opcional): { customer_id, referred_email, referred_phone, name,
 *   pipeline_id, stage_id, amount, currency, salesperson_id }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await readJson(request);
    rejectForeignOrganization(TAG, body, ctx, request);
    const customerId = text(body.customer_id);
    if (customerId && !isUuid(customerId)) {
      return jsonFail(400, 'customer_id no es un identificador válido', { code: 'VALIDATION' });
    }
    const result = await convertReferral(
      { organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase },
      id,
      {
        customer_id: customerId,
        referred_email: body.referred_email === undefined ? undefined : (text(body.referred_email) ?? null),
        referred_phone: body.referred_phone === undefined ? undefined : (text(body.referred_phone) ?? null),
        name: text(body.name),
        pipeline_id: text(body.pipeline_id),
        stage_id: text(body.stage_id),
        amount: typeof body.amount === 'number' ? body.amount : undefined,
        currency: text(body.currency),
        salesperson_id: text(body.salesperson_id),
      },
    );
    if ('status' in result) {
      // El alta de lead no cuajó (400/409 del servicio de leads): se devuelve tal cual, honesto.
      const failed = result as { status: 400 | 409; error: string; extra?: Record<string, unknown> };
      return jsonFail(failed.status, failed.error, failed.extra ?? {});
    }
    return jsonOk(result, {}, 201);
  } catch (error) {
    return routeError(error, TAG);
  }
}
