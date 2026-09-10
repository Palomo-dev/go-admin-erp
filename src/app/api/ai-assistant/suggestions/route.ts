import { NextRequest, NextResponse } from 'next/server';
import { aiAssistantService } from '@/lib/services/aiAssistantService';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/ai-assistant/suggestions
 *
 * Seguridad (F0): era el otro endpoint de `ai-assistant/` sin sesión. Ahora
 * exige `getServerOrgContext()` y la organización sale de ahí.
 *
 * Las sugerencias se generan del estado REAL de la organización (métodos de
 * pago sin configurar, productos sin categoría…) en vez del array literal de
 * cinco frases que había antes (C11). Si algo falla, se responde con las
 * genéricas: el asistente nunca deja de funcionar por esto (§3.1).
 */
export async function POST(request: NextRequest) {
  const FALLBACK = [
    '¿Cómo creo un producto nuevo?',
    '¿Cómo genero un reporte de ventas del mes?',
    '¿Cómo registro un cliente?',
  ];

  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  // Sin coste de IA, pero sí de base de datos: son tres consultas agregadas por
  // llamada. `chat`, `execute-action`, `reject-action` y `transcribe` ya lo
  // tenían; estas dos no (problema 9 del qa-reviewer).
  const rl = await checkRateLimit(`assistant:suggestions:${ctx.userId}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ suggestions: FALLBACK }, { status: 200 });
  }

  try {
    const caps = await getAssistantCapabilities(ctx);
    const suggestions = await aiAssistantService.generateQuickSuggestions(
      ctx.supabase,
      ctx.organizationId,
      caps
    );
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error obteniendo sugerencias:', error);
    return NextResponse.json({ suggestions: FALLBACK }, { status: 200 });
  }
}
