/**
 * GET /api/crm/config/credits — saldos, consumo del mes y presupuesto.
 *
 * Sesión (cualquier miembro). Lee con service role pero SIEMPRE filtrado por
 * la org de sesión. Respuesta:
 * {
 *   ai:   { credits_remaining, purchased_credits, credits_reset_at,
 *           monthly_budget_usd, spent_month_usd, spent_month_credits, by_model[], by_day[] },
 *   comm: { sms_remaining, whatsapp_remaining, voice_minutes_remaining, is_active,
 *           spent_month_usd, by_channel[] },
 *   pricing: ProviderPricing[]
 * }
 */

import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getProviderSettings } from '@/lib/services/providerCredentials.server';
import { listPricing } from '@/lib/services/crm/pricingService';

export const dynamic = 'force-dynamic';

interface AiLogRow {
  model: string | null;
  action_type: string | null;
  credits_consumed: number | null;
  total_tokens: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
interface CommLogRow {
  channel: string;
  credits_used: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function costOf(meta: Record<string, unknown> | null): number {
  const v = meta?.cost_amount;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

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
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const since = monthStart.toISOString();

  try {
    const [aiSettings, commSettings, aiLogs, commLogs, llm, pricing] = await Promise.all([
      sb.from('ai_settings').select('credits_remaining, purchased_credits, credits_reset_at').eq('organization_id', orgId).maybeSingle(),
      sb.from('comm_settings').select('sms_remaining, whatsapp_remaining, voice_minutes_remaining, is_active, credits_reset_at').eq('organization_id', orgId).maybeSingle(),
      sb.from('ai_usage_logs').select('model, action_type, credits_consumed, total_tokens, metadata, created_at').eq('organization_id', orgId).gte('created_at', since).limit(5000),
      sb.from('comm_usage_logs').select('channel, credits_used, metadata, created_at').eq('organization_id', orgId).gte('created_at', since).limit(5000),
      getProviderSettings(orgId, 'llm', 'openai'),
      listPricing(),
    ]);

    const aiRows = (aiLogs.data ?? []) as AiLogRow[];
    const commRows = (commLogs.data ?? []) as CommLogRow[];

    const byModel = new Map<string, { model: string; credits: number; cost_usd: number; tokens: number; calls: number }>();
    const byDay = new Map<string, { day: string; credits: number; cost_usd: number }>();
    let aiCredits = 0;
    let aiUsd = 0;
    for (const r of aiRows) {
      const credits = r.credits_consumed ?? 0;
      const usd = costOf(r.metadata);
      aiCredits += credits;
      aiUsd += usd;
      const m = r.model || 'desconocido';
      const cur = byModel.get(m) ?? { model: m, credits: 0, cost_usd: 0, tokens: 0, calls: 0 };
      cur.credits += credits;
      cur.cost_usd += usd;
      cur.tokens += r.total_tokens ?? 0;
      cur.calls += credits >= 0 ? 1 : 0;
      byModel.set(m, cur);
      const day = r.created_at.slice(0, 10);
      const d = byDay.get(day) ?? { day, credits: 0, cost_usd: 0 };
      d.credits += credits;
      d.cost_usd += usd;
      byDay.set(day, d);
    }

    const byChannel = new Map<string, { channel: string; credits: number; cost_usd: number; count: number }>();
    let commUsd = 0;
    for (const r of commRows) {
      const usd = costOf(r.metadata);
      commUsd += usd;
      const c = byChannel.get(r.channel) ?? { channel: r.channel, credits: 0, cost_usd: 0, count: 0 };
      c.credits += r.credits_used ?? 0;
      c.cost_usd += usd;
      c.count += 1;
      byChannel.set(r.channel, c);
    }

    const budget = Number(llm.settings.monthly_budget_usd);
    const monthlyBudget = Number.isFinite(budget) && budget > 0 ? budget : null;

    return NextResponse.json({
      success: true,
      period: { since, until: new Date().toISOString() },
      ai: {
        credits_remaining: aiSettings.data?.credits_remaining ?? null,
        purchased_credits: aiSettings.data?.purchased_credits ?? 0,
        credits_reset_at: aiSettings.data?.credits_reset_at ?? null,
        monthly_budget_usd: monthlyBudget,
        spent_month_usd: Math.round(aiUsd * 1e4) / 1e4,
        spent_month_credits: aiCredits,
        budget_used_pct: monthlyBudget ? Math.min(999, Math.round((aiUsd / monthlyBudget) * 100)) : null,
        by_model: [...byModel.values()].sort((a, b) => b.credits - a.credits),
        by_day: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
      },
      comm: {
        sms_remaining: commSettings.data?.sms_remaining ?? null,
        whatsapp_remaining: commSettings.data?.whatsapp_remaining ?? null,
        voice_minutes_remaining: commSettings.data?.voice_minutes_remaining ?? null,
        is_active: commSettings.data?.is_active ?? false,
        credits_reset_at: commSettings.data?.credits_reset_at ?? null,
        spent_month_usd: Math.round(commUsd * 1e4) / 1e4,
        by_channel: [...byChannel.values()],
      },
      pricing,
    });
  } catch (err) {
    console.error('[config/credits GET]', err);
    return NextResponse.json({ success: false, error: 'No se pudo obtener el estado de créditos' }, { status: 500 });
  }
}
