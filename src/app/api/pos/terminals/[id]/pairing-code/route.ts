import { NextResponse } from 'next/server';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { canManagePosTerminalsSync } from '@/lib/pos/display/terminalPermissions';
import { isTerminalId } from '@/lib/pos/display/terminal';
import {
  PAIRING_CODE_ATTEMPT_RATE_LIMIT,
  PAIRING_CODE_RATE_LIMIT,
  generatePairingCode,
  isPairingCodeShape,
  pairingCodeAttemptRateLimitKey,
  pairingCodeExpiresAt,
  pairingCodeRateLimitKey,
} from '@/lib/pos/display/server/displayTokens';

export const dynamic = 'force-dynamic';

/** Reintentos si el código generado coincide con otro vigente (6 dígitos: colisión improbable, pero /pair solo recibe el código). */
const COLLISION_RETRIES = 5;

/**
 * POST /api/pos/terminals/[id]/pairing-code — genera el código de
 * emparejamiento de una pantalla remota (PLAN §3.3 y §7): 6 dígitos, 5
 * minutos, invalida el anterior. Fase 3, parte A.
 *
 * - Sesión obligatoria; la organización sale de ella (`getServerOrgContext`)
 *   y `readOrgBody` rechaza con 403 cualquier organización ajena en el body
 *   o la query. Solo admin/manager (mismo gate que el PATCH de la terminal:
 *   rol 1/2/5, super admin o `admin.full_access`), resuelto en el servidor.
 * - La terminal se lee con el cliente de sesión (RLS): fila ajena o
 *   inexistente → 404; inactiva → 409 `TERMINAL_INACTIVE`.
 * - El secreto se escribe con el cliente service-role en
 *   `pos_terminal_secrets` (sin permisos para `authenticated`), SOLO después
 *   de validar organización y rol. El código nuevo pisa al anterior; el hash
 *   de una pantalla ya emparejada NO se toca (se sustituye al canjear o se
 *   borra con /revoke).
 * - Un código igual a otro vigente se vuelve a generar (hasta 5 veces): /pair
 *   solo recibe el código y no debe encontrar dos terminales.
 * - Body opcional `{ reuse: true }` (F3-C ronda 4 · 5): si la terminal ya
 *   tiene un código VIGENTE se devuelve ese mismo (`reused: true`) en vez de
 *   emitir uno nuevo. Lo pide el diálogo al ABRIRSE, porque está montado en
 *   dos sitios (la tarjeta de Configuración y el menú del indicador del POS)
 *   y cada apertura quemaba el código que el administrador acababa de dictar:
 *   la tableta recibía «Código inválido o vencido» sin ninguna pista. Sin el
 *   campo, el comportamiento es el de siempre: código nuevo que pisa al
 *   anterior (es lo que hace «Generar otro código»).
 * - DOS cubos por usuario y organización, con claves distintas:
 *   · de INTENTOS (PAIRING_CODE_ATTEMPT_RATE_LIMIT, 60 cada 15 min) ANTES del
 *     gate de rol (ronda 5 · 5): el 403 cuesta una consulta de permisos y sin
 *     este cubo un usuario sin rol podía repetirla sin tope.
 *   · de CÓDIGOS (PAIRING_CODE_RATE_LIMIT, 30 cada 15 min) DESPUÉS del rol,
 *     para que un cajero no consuma el cupo del administrador. Un
 *     administrador real nunca alcanza el primero: sus 30 códigos caben en 60
 *     intentos de sobra.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'POST /api/pos/terminals/[id]/pairing-code' });
    const reuse = typeof body === 'object' && body !== null && (body as { reuse?: unknown }).reuse === true;

    // Cubo de INTENTOS antes del gate de rol (ronda 5 · 5): el 403 se decide con
    // una consulta de permisos, y sin freno un usuario autenticado sin rol podía
    // repetirla sin tope. Clave propia para que esos 403 sigan SIN gastar el
    // cupo de códigos del administrador (que se comprueba más abajo).
    const intentos = await checkRateLimits([{ key: pairingCodeAttemptRateLimitKey(ctx.organizationId, ctx.userId), opts: PAIRING_CODE_ATTEMPT_RATE_LIMIT }], {
      store: getRateLimitStore(),
    });
    if (!intentos.allowed) {
      console.warn('[pos/terminals] pairing-code: rate limit de intentos', {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        resetAt: intentos.resetAt.toISOString(),
      });
      const retryAfter = Math.max(1, Math.ceil((intentos.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiadas peticiones seguidas; espere unos minutos', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
      );
    }

    if (!canManagePosTerminalsSync(ctx) && !(await hasOrgAdminOrPermission(ctx))) {
      console.warn('[pos/terminals] pairing-code sin rol admin/manager', { organizationId: ctx.organizationId, userId: ctx.userId, roleId: ctx.roleId });
      return NextResponse.json({ error: 'Requiere rol de administrador o manager', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }

    const { id } = await params;
    if (!isTerminalId(id)) {
      return NextResponse.json({ error: 'id de terminal inválido', code: 'INVALID_ID' }, { status: 400 });
    }

    const rl = await checkRateLimits([{ key: pairingCodeRateLimitKey(ctx.organizationId, ctx.userId), opts: PAIRING_CODE_RATE_LIMIT }], {
      store: getRateLimitStore(),
    });
    if (!rl.allowed) {
      console.warn('[pos/terminals] pairing-code: rate limit', { organizationId: ctx.organizationId, userId: ctx.userId, resetAt: rl.resetAt.toISOString() });
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiados códigos seguidos; espere unos minutos', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) } },
      );
    }

    const { data: terminal, error: terminalError } = await ctx.supabase
      .from('pos_terminals')
      .select('id, organization_id, is_active')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (terminalError) {
      console.error('[pos/terminals] pairing-code: lectura de la terminal falló:', terminalError.message);
      return NextResponse.json({ error: 'No se pudo leer la terminal', code: 'READ_FAILED' }, { status: 500 });
    }
    if (!terminal) {
      return NextResponse.json({ error: 'Terminal no encontrada', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (!terminal.is_active) {
      return NextResponse.json({ error: 'La terminal está desactivada', code: 'TERMINAL_INACTIVE' }, { status: 409 });
    }

    const service = getServiceClient();
    const nowIso = new Date().toISOString();

    // Reutilización explícita (ronda 4 · 5): solo si el cliente la pide y el
    // código guardado sigue vigente. No se toca la fila: un código reutilizado
    // no alarga su propia caducidad, así que la cuenta atrás que ve el
    // administrador es la de verdad.
    if (reuse) {
      const { data: vigente, error: vigenteError } = await service
        .from('pos_terminal_secrets')
        .select('pairing_code, pairing_code_expires_at')
        .eq('terminal_id', id)
        .eq('organization_id', ctx.organizationId)
        .gt('pairing_code_expires_at', nowIso)
        .maybeSingle();
      if (vigenteError) {
        console.error('[pos/terminals] pairing-code: lectura del código vigente falló:', vigenteError.message);
        return NextResponse.json({ error: 'No se pudo generar el código', code: 'WRITE_FAILED' }, { status: 500 });
      }
      const row = vigente as { pairing_code?: unknown; pairing_code_expires_at?: unknown } | null;
      if (row && isPairingCodeShape(row.pairing_code) && typeof row.pairing_code_expires_at === 'string') {
        return NextResponse.json(
          { data: { terminalId: id, code: row.pairing_code, expiresAt: row.pairing_code_expires_at, reused: true } },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    let code = generatePairingCode();
    for (let attempt = 0; attempt < COLLISION_RETRIES; attempt++) {
      const { data: clash, error: clashError } = await service
        .from('pos_terminal_secrets')
        .select('terminal_id')
        .eq('pairing_code', code)
        .gt('pairing_code_expires_at', nowIso)
        .neq('terminal_id', id)
        .limit(1);
      if (clashError) {
        console.error('[pos/terminals] pairing-code: comprobación de colisión falló:', clashError.message);
        return NextResponse.json({ error: 'No se pudo generar el código', code: 'WRITE_FAILED' }, { status: 500 });
      }
      if (!clash || clash.length === 0) break;
      if (attempt === COLLISION_RETRIES - 1) {
        console.error('[pos/terminals] pairing-code: sin código libre tras varios intentos');
        return NextResponse.json({ error: 'No se pudo generar el código, intente de nuevo', code: 'WRITE_FAILED' }, { status: 503 });
      }
      code = generatePairingCode();
    }

    const expiresAt = pairingCodeExpiresAt();
    const { error: writeError } = await service.from('pos_terminal_secrets').upsert(
      {
        terminal_id: id,
        organization_id: ctx.organizationId,
        pairing_code: code,
        pairing_code_expires_at: expiresAt.toISOString(),
        updated_at: nowIso,
      },
      { onConflict: 'terminal_id' },
    );
    if (writeError) {
      console.error('[pos/terminals] pairing-code: escritura falló:', writeError.message);
      return NextResponse.json({ error: 'No se pudo generar el código', code: 'WRITE_FAILED' }, { status: 500 });
    }

    return NextResponse.json({ data: { terminalId: id, code, expiresAt: expiresAt.toISOString(), reused: false } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[pos/terminals] pairing-code error:', message);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500 });
  }
}
