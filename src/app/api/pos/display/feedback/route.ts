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
 * única posible y se deduplica por tiempo (`FEEDBACK_ANONYMOUS_WINDOW_MS`,
 * definido en `feedback.ts` y compartido con la caja). En los dos casos la
 * respuesta es la misma para el cliente: la pantalla ya dio las gracias y no
 * debe enterarse de si esta fue la primera.
 *
 * Venta todavía en el outbox del escritorio: `sale_id` es una FK a `sales`,
 * así que un id que aún no se ha sincronizado da 23503. No se pierde la
 * calificación: se reintenta sin venta (ver más abajo).
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

    const fila = { organization_id: organizationId, branch_id: branchId, terminal_id: terminalId, rating };
    const { error: insertError } = await service.from('pos_display_feedback').insert({ ...fila, sale_id: saleId });
    if (insertError) {
      // 23505: otro intento ganó la carrera por la misma venta. Es el mismo
      // resultado deseado (una calificación por venta), no un error.
      if (insertError.code === '23505') {
        return NextResponse.json({ data: { registered: false, duplicate: true } }, { headers: NO_STORE });
      }
      // 23503: la venta AÚN NO EXISTE en `sales`. Pasa en el escritorio sin
      // conexión: la venta se guarda en el outbox y se reproduce después, y
      // si vuelve la red en ese hueco el cliente califica una venta que la FK
      // no encuentra. La opinión del cliente vale más que la venta a la que
      // se cuelga, así que se guarda sin venta —el mismo caso anónimo que ya
      // contempla esta ruta— en vez de perderse con un 503 (ronda 1, QA bajo).
      if (insertError.code === '23503' && saleId !== null) {
        const { error: retryError } = await service.from('pos_display_feedback').insert({ ...fila, sale_id: null });
        if (!retryError) {
          return NextResponse.json({ data: { registered: true, duplicate: false, unlinkedSale: true } }, { headers: NO_STORE });
        }
        console.error('[pos-display/feedback] reintento sin venta falló:', retryError.message);
        return NextResponse.json({ error: 'No se pudo registrar la calificación', code: 'FEEDBACK_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
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
