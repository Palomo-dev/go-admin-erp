/**
 * GET /api/crm/config/credits — saldos, consumo del mes y presupuesto.
 *
 * Sesión (cualquier miembro). Lee con service role pero SIEMPRE filtrado por
 * la org de sesión. El consumo del mes se agrega en SQL
 * (`fn_ai_usage_month` / `fn_comm_usage_month`, migración crm_v4_f00_39) con
 * el costo `coalesce(cost_amount, metadata.cost_amount)` y los días cortados
 * en la zona horaria de la organización; el mes empieza en el primer día
 * calendario de esa zona, no en UTC (reglas de fechas 3 y 6). Mientras la 39
 * no esté aplicada, `aiUsageStatsService` agrega en Node y avisa con
 * `truncated` si superó su tope.
 *
 * Respuesta:
 * {
 *   ai:   { credits_remaining, purchased_credits, credits_reset_at,
 *           monthly_budget_usd, spent_month_usd, spent_month_credits, budget_used_pct,
 *           by_model[], by_day[], truncated },
 *   comm: { sms_remaining, whatsapp_remaining, voice_minutes_remaining, is_active,
 *           spent_month_usd, by_channel[], truncated },
 *   pricing: ProviderPricing[]
 * }
 */

import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getMonthlyBudgetUsd } from '@/lib/services/crm/aiCostService';
import { listPricing } from '@/lib/services/crm/pricingService';
import { getOrgTimezoneServer } from '@/lib/services/crm/revenueOsService';
import { getAiUsageMonth, getCommUsageMonth, monthStartInTz } from '@/lib/services/crm/aiUsageStatsService';

export const dynamic = 'force-dynamic';

export async function GET() {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const orgId = ctx.organizationId;
  const sb = getServiceClient();

  try {
    const timezone = await getOrgTimezoneServer(orgId, ctx.supabase);
    const since = monthStartInTz(timezone);

    const [aiSettings, commSettings, aiUsage, commUsage, monthlyBudget, pricing] = await Promise.all([
      sb.from('ai_settings').select('credits_remaining, purchased_credits, credits_reset_at').eq('organization_id', orgId).maybeSingle(),
      sb.from('comm_settings').select('sms_remaining, whatsapp_remaining, voice_minutes_remaining, is_active, credits_reset_at').eq('organization_id', orgId).maybeSingle(),
      getAiUsageMonth(sb, orgId, since, timezone),
      getCommUsageMonth(sb, orgId, since),
      getMonthlyBudgetUsd(sb, orgId),
      listPricing(),
    ]);

    const aiUsd = aiUsage.spent_usd;

    return NextResponse.json({
      success: true,
      period: { since, until: new Date().toISOString(), timezone },
      ai: {
        credits_remaining: aiSettings.data?.credits_remaining ?? null,
        purchased_credits: aiSettings.data?.purchased_credits ?? 0,
        credits_reset_at: aiSettings.data?.credits_reset_at ?? null,
        monthly_budget_usd: monthlyBudget,
        spent_month_usd: Math.round(aiUsd * 1e4) / 1e4,
        spent_month_credits: aiUsage.spent_credits,
        budget_used_pct: monthlyBudget ? Math.min(999, Math.round((aiUsd / monthlyBudget) * 100)) : null,
        by_model: aiUsage.by_model,
        by_day: aiUsage.by_day,
        truncated: aiUsage.truncated,
      },
      comm: {
        sms_remaining: commSettings.data?.sms_remaining ?? null,
        whatsapp_remaining: commSettings.data?.whatsapp_remaining ?? null,
        voice_minutes_remaining: commSettings.data?.voice_minutes_remaining ?? null,
        is_active: commSettings.data?.is_active ?? false,
        credits_reset_at: commSettings.data?.credits_reset_at ?? null,
        spent_month_usd: Math.round(commUsage.spent_usd * 1e4) / 1e4,
        by_channel: commUsage.by_channel,
        truncated: commUsage.truncated,
      },
      pricing,
    });
  } catch (err) {
    console.error('[config/credits GET]', err);
    return NextResponse.json({ success: false, error: 'No se pudo obtener el estado de créditos' }, { status: 500 });
  }
}
