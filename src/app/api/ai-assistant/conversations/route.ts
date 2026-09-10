import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { listConversations } from '@/lib/ai/agent/conversationStore';

/**
 * GET /api/ai-assistant/conversations
 *
 * Cierra la deuda que la F1 dejó anotada en el ADR-003: la conversación **ya**
 * se persiste en `ai_assistant_conversations` / `ai_assistant_messages`, pero
 * el panel no tenía por dónde recuperarla, así que a efectos del usuario seguía
 * perdiéndose al cerrar (C6). `listConversations` estaba escrita y sin usar.
 *
 * Seguridad (§9.1): la organización y el usuario salen de la sesión, nunca de
 * la petición. Se listan **solo los hilos del propio usuario**: la RLS deja que
 * un administrador vea los de su organización para auditar, y ese es un camino
 * distinto —con su propia pantalla y su propio registro—, no este.
 */

const LIMITE_DEFECTO = 30;
const LIMITE_MAXIMO = 50;

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

  // Sin coste de IA, pero el panel puede pedirlo en cada apertura. Mismo
  // criterio que el resto de la superficie del asistente.
  const rl = await checkRateLimit(`assistant:conversations:${ctx.userId}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Intenta de nuevo en un momento.', code: 'RATE_LIMITED' },
      { status: 429 }
    );
  }

  const crudo = Number(request.nextUrl.searchParams.get('limit'));
  const limite = Number.isFinite(crudo)
    ? Math.min(Math.max(Math.trunc(crudo), 1), LIMITE_MAXIMO)
    : LIMITE_DEFECTO;

  const conversations = await listConversations(ctx.supabase, ctx.organizationId, ctx.userId, limite);

  // `listConversations` ya registra el error y devuelve `[]`: el historial vacío
  // no puede tumbar el panel (§3.1).
  return NextResponse.json({ conversations });
}
