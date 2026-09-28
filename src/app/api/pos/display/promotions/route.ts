import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { displayCostRateLimitStore } from '@/lib/pos/display/server/displayRateLimit';
import { resolveDisplayActor } from '@/lib/pos/display/server/displayActor';
import { DISPLAY_PROMOTIONS_MAX, toDisplayPromotion, type DisplayPromotion } from '@/lib/pos/display/promotions';
import { PROMOTIONS_RATE_LIMIT, PROMOTIONS_RATE_LIMIT_PREFIX, PROMOTIONS_READ_LIMIT } from '@/lib/pos/display/server/displayFeedback';
import { appliesOnWeekDay, appliesToBranch, isWithinEndDate, weekDayOfPlainDate } from '@/lib/promotions/vigencia';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import { toPlainDate } from '@/lib/utils/dateDisplay';

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
 * «Activa» es EXACTAMENTE lo que entiende `promotionEngine`, y ya no una
 * segunda definición parecida: `is_active`, `applies_to_pos`,
 * `start_date <= now` en SQL, y después, en memoria y con los predicados
 * compartidos de `lib/promotions/vigencia.ts`, `end_date`, el DÍA DE LA
 * SEMANA (`applicable_days`) y la sucursal (`branches`).
 *
 * Ronda 2 · QA-3 y QA-4. El día no se miraba: la pantalla anunciaba la
 * promoción de los sábados un martes (12 de las 19 filas de la base llevan
 * días restringidos), que es justo la contradicción con `promotionEngine`
 * que esta cabecera decía querer evitar. Y la vigencia y la sucursal se
 * filtraban con dos `.or()` encadenados que nunca se habían ejecutado contra
 * datos con `branches` no nulo —las 19 filas lo tienen nulo—: si la consulta
 * fallaba, la ruta respondía 503 y el reposo caía a la marca sin que nadie
 * se enterara. El propio `promotionEngine` documenta que combinar
 * `or(is.null,gte)` con otros filtros en PostgREST no va bien y por eso
 * filtra en memoria; aquí se hacía al revés.
 *
 * El día se resuelve con la ZONA HORARIA de la organización, no con el reloj
 * del proceso (que en el servidor va en UTC): a las 20:00 de Bogotá ya es el
 * día siguiente en UTC y el cartel cambiaría cuatro horas antes de tiempo.
 *
 * Se devuelven como mucho `DISPLAY_PROMOTIONS_MAX`, las de mayor prioridad
 * primero, y de cada una solo lo que se va a pintar: nombre, descripción
 * corta y vigencia. Sin importes ni reglas: la pantalla es un cartel, no una
 * calculadora de descuentos (quien decide el descuento sigue siendo
 * `promotionEngine`).
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
    const service = getServiceClient();
    const now = new Date();
    // El SQL se queda con lo barato e indexable; lo que PostgREST no expresa
    // bien sobre `jsonb` se decide en memoria, unas decenas de filas.
    // `PROMOTIONS_READ_LIMIT` es holgado a propósito: recortar a diez ANTES
    // de filtrar por día y sucursal dejaría la cartelera vacía en un comercio
    // con muchas promociones de otros días.
    const [promotionsRes, orgRes] = await Promise.all([
      service
        .from('promotions')
        .select('id, name, description, start_date, end_date, applicable_days, branches')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .eq('applies_to_pos', true)
        .lte('start_date', now.toISOString())
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(PROMOTIONS_READ_LIMIT),
      service.from('organizations').select('timezone').eq('id', organizationId).maybeSingle(),
    ]);
    if (promotionsRes.error) {
      console.error('[pos-display/promotions] lectura falló:', promotionsRes.error.message);
      return NextResponse.json({ error: 'No se pudieron leer las promociones', code: 'PROMOTIONS_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }
    // La zona horaria solo decide QUÉ DÍA es; que no se pueda leer no puede
    // dejar la pantalla sin cartelera (CLAUDE.md: America/Bogota solo como respaldo).
    if (orgRes.error) console.warn('[pos-display/promotions] zona horaria no legible; se usa la de respaldo:', orgRes.error.message);
    const timezone = (orgRes.data as { timezone?: string | null } | null)?.timezone || DEFAULT_TIMEZONE;
    let weekDay: ReturnType<typeof weekDayOfPlainDate>;
    try {
      weekDay = weekDayOfPlainDate(toPlainDate(now, timezone));
    } catch {
      weekDay = weekDayOfPlainDate(toPlainDate(now, DEFAULT_TIMEZONE));
    }

    const rows = (Array.isArray(promotionsRes.data) ? promotionsRes.data : []) as Array<Record<string, unknown>>;
    const promotions: DisplayPromotion[] = rows
      .filter((row) => isWithinEndDate(row, now) && appliesOnWeekDay(row, weekDay) && appliesToBranch(row, branchId))
      .map(toDisplayPromotion)
      .filter((p): p is DisplayPromotion => p !== null)
      .slice(0, DISPLAY_PROMOTIONS_MAX);
    return NextResponse.json({ data: { promotions } }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error('[pos-display/promotions] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
