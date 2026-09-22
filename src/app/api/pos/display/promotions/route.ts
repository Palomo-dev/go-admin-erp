import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { displayCostRateLimitStore } from '@/lib/pos/display/server/displayRateLimit';
import { resolveDisplayActor } from '@/lib/pos/display/server/displayActor';
import { DISPLAY_PROMOTIONS_MAX, toDisplayPromotion, type DisplayPromotion } from '@/lib/pos/display/promotions';
import { PROMOTIONS_RATE_LIMIT, PROMOTIONS_RATE_LIMIT_PREFIX } from '@/lib/pos/display/server/displayFeedback';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/**
 * GET /api/pos/display/promotions — las promociones ACTIVAS que la pantalla
 * del cliente puede rotar en reposo (PLAN §5.2, modo «promociones»).
 *
 * Mismo control de acceso que /feedback (`resolveDisplayActor`): token de la
 * tableta emparejada, o sesión del POS para la pantalla local. La
 * organización y la sucursal salen de la terminal, nunca de la petición, así
 * que una pantalla no puede pedir la cartelera de otro comercio.
 *
 * «Activa» es lo mismo que entiende el módulo de promociones del POS:
 * `is_active`, vigente ahora (`start_date <= now` y `end_date` nula o
 * futura), aplicable al POS y de esta sucursal (las globales llevan
 * `branches` nulo o vacío). Se devuelven como mucho `DISPLAY_PROMOTIONS_MAX`,
 * las de mayor prioridad primero, y de cada una solo lo que se va a pintar:
 * nombre, descripción corta y vigencia. Sin importes ni reglas: la pantalla
 * es un cartel, no una calculadora de descuentos (quien decide el descuento
 * sigue siendo `promotionEngine`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const resolved = await resolveDisplayActor(request, { terminalId: url.searchParams.get('terminalId') ?? undefined });
  if (!resolved.ok) return resolved.response;
  const { terminalId, organizationId, branchId } = resolved.actor;

  const rl = await checkRateLimit(`${PROMOTIONS_RATE_LIMIT_PREFIX}${terminalId}`, PROMOTIONS_RATE_LIMIT, { store: displayCostRateLimitStore() });
  if (!rl.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'Demasiadas peticiones; espere un momento', code: 'RATE_LIMITED' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await getServiceClient()
      .from('promotions')
      .select('id, name, description, start_date, end_date')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .eq('applies_to_pos', true)
      .lte('start_date', now)
      .or(`end_date.is.null,end_date.gte.${now}`)
      // `branches` es JSONB: el valor del `cs` va como JSON (`[7]`), no como array literal.
      .or(`branches.is.null,branches.eq.[],branches.cs.[${branchId}]`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(DISPLAY_PROMOTIONS_MAX);
    if (error) {
      console.error('[pos-display/promotions] lectura falló:', error.message);
      return NextResponse.json({ error: 'No se pudieron leer las promociones', code: 'PROMOTIONS_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }

    const promotions: DisplayPromotion[] = (Array.isArray(data) ? data : [])
      .map(toDisplayPromotion)
      .filter((p): p is DisplayPromotion => p !== null);
    return NextResponse.json({ data: { promotions } }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error('[pos-display/promotions] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
