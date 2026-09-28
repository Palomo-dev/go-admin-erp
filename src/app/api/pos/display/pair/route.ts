import { NextResponse } from 'next/server';
import type { RateLimitStore } from '@/lib/security/rateLimit';
import { checkRateLimit, checkRateLimits, getClientIp, isRateLimitExhausted } from '@/lib/security/rateLimit';
import { requireDisplayRateLimitStore } from '@/lib/pos/display/server/displayRateLimit';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT_KEY,
  PAIR_GLOBAL_SLOW_RATE_LIMIT,
  PAIR_GLOBAL_SLOW_RATE_LIMIT_KEY,
  PAIR_RATE_LIMIT,
  PAIR_RATE_LIMIT_PREFIX,
  generateDisplayToken,
  hashDisplayToken,
  isPairingCodeShape,
} from '@/lib/pos/display/server/displayTokens';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** Misma respuesta para código inexistente, vencido, ya canjeado o de terminal inactiva: no se filtra existencia. */
interface PairCandidateTerminal {
  id: string;
  organization_id: number;
  is_active: boolean;
}
interface PairCandidate {
  terminal_id: string;
  organization_id: number;
  /** Embed a-uno de PostgREST (objeto); se tolera el array por si el cliente lo devolviera así. */
  pos_terminals: PairCandidateTerminal | PairCandidateTerminal[] | null;
}

function codeRejected(): NextResponse {
  return NextResponse.json({ error: 'Código inválido o vencido', code: 'CODE_INVALID' }, { status: 404, headers: NO_STORE });
}

function rateLimited(resetAt: Date): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json(
    { error: 'Demasiados intentos; espere unos minutos', code: 'RATE_LIMITED' },
    { status: 429, headers: { ...NO_STORE, 'Retry-After': String(retryAfter) } },
  );
}

/**
 * Registra el canje FALLIDO en el cubo global y devuelve el 429 si con este
 * fallo se agotó; null si todavía cabe y hay que devolver la respuesta
 * normal. Mismo patrón que `authenticateDisplayRequest` (parte A): el cubo se
 * comprueba antes del trabajo y solo lo consumen los fallos.
 */
async function registerGlobalPairFailure(store: RateLimitStore | null): Promise<NextResponse | null> {
  const rl = await checkRateLimit(PAIR_GLOBAL_RATE_LIMIT_KEY, PAIR_GLOBAL_RATE_LIMIT, { store });
  if (rl.allowed) return null;
  console.warn('[pos-display/pair] cubo global de canjes fallidos agotado', { resetAt: rl.resetAt.toISOString() });
  return rateLimited(rl.resetAt);
}

/**
 * POST /api/pos/display/pair — canjea el código de 6 dígitos por el token
 * largo de la pantalla remota (PLAN §3.3, §7 y §11). Fase 3, parte A.
 *
 * SIN sesión: la tableta aún no es nadie. Por eso:
 * - `RATE_LIMIT_STORE=db` es REQUISITO DE DESPLIEGUE de esta ruta (F3-B ronda
 *   4 · 1). En modo memoria los dos cubos viven en el `Map` de cada instancia
 *   y el techo real es `limit × instancias`, que en serverless crece con el
 *   propio tráfico del atacante; el análisis de `PAIR_GLOBAL_RATE_LIMIT` está
 *   escrito suponiendo un contador del DESPLIEGUE, y solo `db` lo cumple.
 *   `requireDisplayRateLimitStore` responde 503 `RATE_LIMIT_STORE_REQUIRED`
 *   en producción si falta (fail-closed, nunca un canje con el contador
 *   flojo); en local y en pruebas se sigue con el Map y un aviso.
 * - Rate limit ANTES de tocar la base. Dos cubos con semánticas distintas:
 *   · por IP (10 / 15 min): lo consume CADA intento de esa IP. Solo vale si
 *     el proxy sobreescribe `x-forwarded-for` —`getClientIp` toma el PRIMER
 *     elemento de la cabecera—, de ahí el cubo global.
 *   · GLOBAL de respaldo (60 / min en TODO el despliegue). Se mira al entrar
 *     y solo lo consumen los canjes que FALLAN (F3-B ronda 3 · 4): contando
 *     también los correctos, 60 peticiones por minuto desde cualquier sitio
 *     dejaban sin emparejar a TODAS las organizaciones durante la ventana.
 *   · CARRIL LENTO (6 / min, F3-C ronda 5 · 4): por donde pasa la petición
 *     cuando el global ya está agotado, para que el abuso de un tercero con la
 *     IP rotada no sea un interruptor de apagado del emparejamiento de todo el
 *     mundo. El global sigue mirándose ANTES del lookup porque es el techo de
 *     conjeturas; moverlo detrás le daría al atacante intentos ilimitados.
 *   Una petición bloqueada no consume cupo (ventana fija).
 * - EL ESPACIO DEL CÓDIGO ES DEL DESPLIEGUE, NO DE UNA TERMINAL (F3-B ronda
 *   4 · 2): esta ruta no recibe terminal ni organización, así que un acierto
 *   ciego empareja con CUALQUIER terminal con código vivo y la probabilidad
 *   por intento es N / 10^6 con N códigos vivos. El cálculo completo, con el
 *   techo de 300 intentos por vida de código y qué hacer si N crece, está en
 *   `PAIR_GLOBAL_RATE_LIMIT`.
 * - Body `{ code }`: seis dígitos o 400. Nada más se acepta del cliente: ni
 *   terminal ni organización (regla 5: la organización sale de la fila).
 * - Lookup con service-role en `pos_terminal_secrets` por código vigente, en
 *   UNA consulta con la terminal embebida (`pos_terminals!inner`, filtrada
 *   por activa): inexistente, vencido, canjeado o de terminal inactiva
 *   cuestan lo mismo. Debe haber EXACTAMENTE una fila (dos → se rechaza
 *   igual) y su organización debe coincidir con la de la terminal. Cualquier
 *   fallo → 404 uniforme.
 * - Canje atómico: el UPDATE que guarda el hash exige `pairing_code = code` y
 *   `pairing_code_expires_at > now()` en el WHERE, así dos canjes simultáneos
 *   del mismo código solo dejan uno con token; el otro recibe 404. El código
 *   se borra (`pairing_code = null`).
 * - El token en claro se devuelve UNA vez y no se guarda: solo su sha256.
 *   Un token anterior de la misma terminal queda revocado al sustituir el hash.
 */
export async function POST(request: Request) {
  try {
    // Sin contador del despliegue no hay canje (en producción): el análisis
    // de PAIR_GLOBAL_RATE_LIMIT no se sostiene con `limit × instancias`.
    const storeResult = requireDisplayRateLimitStore('pair');
    if (!storeResult.ok) return storeResult.response;
    const store = storeResult.store;

    const ip = getClientIp(request);
    // Cubo GLOBAL: se MIRA aquí y solo lo consumen los canjes que fallan
    // (ronda 3 · 4). Registrarlo también con los canjes correctos convertía
    // 60 peticiones por minuto desde cualquier sitio en «ninguna organización
    // puede emparejar su pantalla»; un canje que acierta no es abuso. El cubo
    // por IP sí cuenta todos los intentos: es de esta IP.
    // Ojo: esta mirada es solo del Map del proceso (`isRateLimitExhausted` no
    // consulta el store a propósito: es un atajo para no tocar la base). La
    // barrera de verdad es el hit de `registerGlobalPairFailure`, que sí pasa
    // por el store persistente.
    if (isRateLimitExhausted(PAIR_GLOBAL_RATE_LIMIT_KEY, PAIR_GLOBAL_RATE_LIMIT)) {
      // CARRIL LENTO (ronda 5 · 4): agotado el cubo global ya no se rechaza a
      // todo el mundo. El cubo global tiene que seguir mirándose ANTES del
      // lookup —es el techo de conjeturas: comprobarlo después dejaría al
      // atacante evaluar todas las que quisiera y solo le cambiaría el código
      // de respuesta—, pero devolver 429 de plano convertía 60 códigos
      // equivocados por minuto, con la IP rotada, en un interruptor de apagado
      // del emparejamiento para TODAS las organizaciones. Aquí caben seis
      // peticiones más por minuto en todo el despliegue: el techo de conjeturas
      // sube un 10 % y una organización que empareja de verdad tiene por dónde
      // entrar. Ver PAIR_GLOBAL_SLOW_RATE_LIMIT para la aritmética.
      const lento = await checkRateLimit(PAIR_GLOBAL_SLOW_RATE_LIMIT_KEY, PAIR_GLOBAL_SLOW_RATE_LIMIT, { store });
      if (!lento.allowed) {
        console.warn('[pos-display/pair] cubo global y carril lento agotados; se rechaza sin tocar la base', { ip });
        return rateLimited(lento.resetAt);
      }
      console.warn('[pos-display/pair] cubo global agotado; la petición pasa por el carril lento', { ip });
    }
    const rl = await checkRateLimits([{ key: `${PAIR_RATE_LIMIT_PREFIX}${ip}`, opts: PAIR_RATE_LIMIT }], { store });
    if (!rl.allowed) {
      console.warn('[pos-display/pair] rate limit', { ip, blockedKey: rl.blockedKey, resetAt: rl.resetAt.toISOString() });
      return rateLimited(rl.resetAt);
    }

    let body: unknown = null;
    try {
      body = await request.json();
    } catch {
      return (
        (await registerGlobalPairFailure(store)) ??
        NextResponse.json({ error: 'Body inválido (se espera JSON)', code: 'INVALID_JSON' }, { status: 400, headers: NO_STORE })
      );
    }
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    if (!isPairingCodeShape(code)) {
      return (
        (await registerGlobalPairFailure(store)) ??
        NextResponse.json({ error: 'El código debe tener 6 dígitos', code: 'INVALID_CODE' }, { status: 400, headers: NO_STORE })
      );
    }

    const service = getServiceClient();
    const nowIso = new Date().toISOString();
    // UNA consulta: secreto vigente + su terminal (embed `!inner`, filtrada por
    // activa). Código inexistente, vencido, ya canjeado o de terminal inactiva
    // cuestan lo mismo (ronda 2, qa bajo 6: sin oráculo de tiempo).
    const { data: candidates, error: lookupError } = await service
      .from('pos_terminal_secrets')
      .select('terminal_id, organization_id, pos_terminals!inner(id, organization_id, is_active)')
      .eq('pairing_code', code)
      .gt('pairing_code_expires_at', nowIso)
      .eq('pos_terminals.is_active', true)
      .limit(2);
    if (lookupError) {
      console.error('[pos-display/pair] lectura de secretos falló:', lookupError.message);
      return NextResponse.json({ error: 'No se pudo canjear el código', code: 'PAIR_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }
    if (!candidates || candidates.length !== 1) {
      if (candidates && candidates.length > 1) console.error('[pos-display/pair] código vigente en más de una terminal; se rechaza');
      return (await registerGlobalPairFailure(store)) ?? codeRejected();
    }
    const secret = candidates[0] as unknown as PairCandidate;
    const terminal = Array.isArray(secret.pos_terminals) ? secret.pos_terminals[0] : secret.pos_terminals;
    if (!terminal || terminal.is_active !== true || terminal.organization_id !== secret.organization_id) {
      return (await registerGlobalPairFailure(store)) ?? codeRejected();
    }

    const token = generateDisplayToken();
    // Canje atómico: el UPDATE repite código Y caducidad en el WHERE, así ni
    // otro canje simultáneo ni un código que venció entre el SELECT y el
    // UPDATE dejan token.
    const { data: updated, error: writeError } = await service
      .from('pos_terminal_secrets')
      .update({ display_token_hash: hashDisplayToken(token), pairing_code: null, pairing_code_expires_at: null, updated_at: nowIso })
      .eq('terminal_id', secret.terminal_id)
      .eq('pairing_code', code)
      .gt('pairing_code_expires_at', nowIso)
      .select('terminal_id');
    if (writeError) {
      console.error('[pos-display/pair] escritura del hash falló:', writeError.message);
      return NextResponse.json({ error: 'No se pudo canjear el código', code: 'PAIR_UNAVAILABLE' }, { status: 503, headers: NO_STORE });
    }
    if (!updated || updated.length !== 1) {
      // Otro canje ganó la carrera entre el SELECT y el UPDATE, o el código venció en medio.
      return (await registerGlobalPairFailure(store)) ?? codeRejected();
    }

    return NextResponse.json({ data: { token, terminalId: secret.terminal_id } }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error('[pos-display/pair] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500, headers: NO_STORE });
  }
}
