import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { displayCostRateLimitStore } from '@/lib/pos/display/server/displayRateLimit';
import { resolveDisplayActor } from '@/lib/pos/display/server/displayActor';
import { FEEDBACK_ANONYMOUS_WINDOW_MS, FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_LIMIT_PREFIX } from '@/lib/pos/display/server/displayFeedback';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const bodySchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    /** Solo se usa con sesión; con token la terminal sale del token. */
    terminalId: z.string().optional(),
    /** Venta recién confirmada, si la caja la conoce. */
    saleId: z.string().uuid().nullish(),
  })
  .strict();

/**
 * POST /api/pos/display/feedback — el cliente calificó su atención en la
 * pantalla del POS (PLAN §4.2, Fase 4).
 *
 * Qué se guarda: organización, sucursal, terminal, venta (si se conoce), un
 * número de 1 a 5 y la fecha. NADA del cliente: ni nombre, ni documento, ni
 * texto libre. La pantalla no tiene forma de mandar nada más, y esta ruta no
 * leería ningún otro campo.
 *
 * Quién puede escribir (`resolveDisplayActor`): la tableta emparejada con su
 * token, o la caja / pantalla local con la sesión del POS. La organización y
 * la sucursal salen SIEMPRE de la fila de `pos_terminals`, nunca del cuerpo
 * (CLAUDE.md regla 5). La escritura va con service-role porque
 * `pos_display_feedback` solo tiene política de lectura para miembros: nadie
 * inserta desde el navegador.
 *
 * Idempotencia (una calificación por venta): con `saleId` se comprueba antes
 * y, si la carrera la gana otro, el índice único
 * `pos_display_feedback_venta_unica (terminal_id, sale_id)` devuelve 23505 y
 * la ruta responde 200 `{ duplicate: true }` igual. Sin `saleId` no hay clave
 * única posible y se deduplica por tiempo (`FEEDBACK_ANONYMOUS_WINDOW_MS`).
 * En los dos casos la respuesta es la misma para el cliente: la pantalla ya
 * dio las gracias y no debe enterarse de si esta fue la primera.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido', code: 'INVALID_BODY' }, { status: 400, headers: NO_STORE });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Calificación inválida', code: 'INVALID_BODY', details: parsed.error.flatten() }, { status: 400, headers: NO_STORE });
  }
  const { rating } = parsed.data;
  const saleId = parsed.data.saleId ?? null;

  const resolved = await resolveDisplayActor(request, { terminalId: parsed.data.terminalId });
  if (!resolved.ok) return resolved.response;
  const { terminalId, organizationId, branchId } = resolved.actor;

  const rl = await checkRateLimit(`${FEEDBACK_RATE_LIMIT_PREFIX}${terminalId}`, FEEDBACK_RATE_LIMIT, { store: displayCostRateLimitStore() });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Demasiadas calificaciones; espere un momento', code: 'RATE_LIMITED' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const service = getServiceClient();

    let existing = service.from('pos_display_feedback').select('id').eq('terminal_id', terminalId).eq('organization_id', organizationId);
    existing = saleId
      ? existing.eq('sale_id', saleId)
      : existing.is('sale_id', null).gte('created_at', new Date(Date.now() - FEEDBACK_ANONYMOUS_WINDOW_MS).toISOString());
    const { data: previous, error: readError } = await existing.limit(1);
    if (readError) {
      console.error('[pos-display/feedback] lectura previa falló:', readError.message);
      return NextResponse.json({ error: 'No se pudo registrar la calificación', code: 'FEEDBACK_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }
    if (Array.isArray(previous) && previous.length > 0) {
      return NextResponse.json({ data: { registered: false, duplicate: true } }, { headers: NO_STORE });
    }

    const { error: insertError } = await service
      .from('pos_display_feedback')
      .insert({ organization_id: organizationId, branch_id: branchId, terminal_id: terminalId, sale_id: saleId, rating });
    if (insertError) {
      // 23505: otro intento ganó la carrera por la misma venta. Es el mismo
      // resultado deseado (una calificación por venta), no un error.
      if (insertError.code === '23505') {
        return NextResponse.json({ data: { registered: false, duplicate: true } }, { headers: NO_STORE });
      }
      console.error('[pos-display/feedback] inserción falló:', insertError.message);
      return NextResponse.json({ error: 'No se pudo registrar la calificación', code: 'FEEDBACK_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }

    return NextResponse.json({ data: { registered: true, duplicate: false } }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error('[pos-display/feedback] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
