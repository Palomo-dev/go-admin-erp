import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { creditLevel } from '@/lib/ai/assistant/credits';

/**
 * GET /api/ai-assistant/credits — saldo de créditos de IA de la organización.
 *
 * Hasta ahora el saldo solo se veía cuando ya era tarde: el usuario escribía,
 * el turno fallaba con "créditos insuficientes" y ahí se enteraba. El panel lo
 * enseña al pie del composer desde que se abre, con aviso ámbar por debajo de
 * 50 y bloqueo en 0 (§8 del diseño de escritorio).
 *
 * Solo lectura y sin coste de IA. La organización sale de la sesión.
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
    return NextResponse.json(
      {
        credits,
        allowed: balance.allowed,
        level: creditLevel(credits),
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
