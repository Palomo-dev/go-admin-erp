import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { COBROS_PARA_PROMEDIO, creditLevel, promedioPorRespuesta } from '@/lib/ai/assistant/credits';

/**
 * GET /api/ai-assistant/credits — saldo de créditos de IA de la organización.
 *
 * Hasta ahora el saldo solo se veía cuando ya era tarde: el usuario escribía,
 * el turno fallaba con "créditos insuficientes" y ahí se enteraba. El panel lo
 * enseña al pie del composer desde que se abre, con aviso ámbar por debajo de
 * 50 y bloqueo en 0 (§8 del diseño de escritorio).
 *
 * Solo lectura y sin coste de IA. La organización sale de la sesión.
 *
 * Además del saldo devuelve lo que el panel necesita saber al abrirse para no
 * prometer lo que no hay: `avgPerReply` (lo que cuesta de verdad una respuesta
 * en esta organización) y `ttsEnabled` (si «Escuchar» funciona).
 */

export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:credits:${ctx.userId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas consultas seguidas.', code: 'RATE_LIMITED' }, { status: 429 });
  }

  try {
    const balance = await checkAICredits(ctx.organizationId);
    const credits = Math.max(0, Math.floor(balance.creditsRemaining ?? 0));

    // Lo que cuesta de verdad una respuesta en esta organización (RLS de
    // `ai_usage_logs`: miembros de la organización). Si la lectura falla, el
    // aviso simplemente no estima: el saldo sigue siendo lo importante.
    let avgPerReply: number | null = null;
    const usage = await ctx.supabase
      .from('ai_usage_logs')
      .select('credits_consumed')
      .eq('organization_id', ctx.organizationId)
      .eq('action_type', 'assistant_chat')
      .order('created_at', { ascending: false })
      .limit(COBROS_PARA_PROMEDIO);
    if (!usage.error && Array.isArray(usage.data)) {
      avgPerReply = promedioPorRespuesta(usage.data as Array<{ credits_consumed: number | null }>);
    }

    // ¿La organización activó la respuesta en audio? Sin esto el panel
    // ofrecía «Escuchar» a todos y solo al primer clic descubría que no (el
    // 2026-09-29 ninguna organización la tiene activa). `null` = no se sabe.
    const tts = await ctx.supabase
      .from('ai_assistant_settings')
      .select('tts_enabled')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    const ttsEnabled = tts.error ? null : Boolean((tts.data as { tts_enabled?: boolean } | null)?.tts_enabled);

    return NextResponse.json(
      {
        credits,
        allowed: balance.allowed,
        level: creditLevel(credits),
        avgPerReply,
        ttsEnabled,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    // Que no se pueda leer el saldo no puede dejar mudo al asistente: el panel
    // simplemente no enseña el pie.
    console.warn('[GO Assistant] No se pudo leer el saldo:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo leer el saldo.', code: 'UNAVAILABLE' }, { status: 503 });
  }
}
