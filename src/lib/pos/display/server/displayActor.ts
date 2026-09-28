/**
 * ¿Quién habla en una ruta de la pantalla del cliente? (Fase 4). SOLO servidor.
 *
 * Las rutas de la Fase 3 tenían un único actor: la tableta emparejada, con su
 * token Bearer. La Fase 4 añade rutas que usan LAS DOS pantallas:
 * - la REMOTA (tableta): `Authorization: Bearer <token>` → displayAuth.ts
 *   resuelve la terminal y, con ella, la organización y la sucursal.
 * - la LOCAL (segunda pantalla del mismo equipo) y la CAJA: comparten navegador
 *   y sesión con el POS, así que hablan con cookies → `getServerOrgContext`.
 *   Ahí la organización sale de la SESIÓN (CLAUDE.md regla 5) y la terminal se
 *   comprueba contra `pos_terminals` con el cliente de la sesión (RLS): un
 *   `terminalId` de otra organización no existe para esa consulta y la ruta
 *   responde 404, nunca escribe.
 *
 * En ningún camino la organización sale del cuerpo ni de la query: con token
 * la pone la terminal; con sesión, la sesión. El `terminalId` sí viaja del
 * cliente, pero solo como CLAVE de búsqueda dentro de la organización ya
 * resuelta, y la sucursal se lee de la fila, nunca de la petición.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isTerminalId } from '@/lib/pos/display/terminal';
import { authenticateDisplayRequest, type DisplayAuthOptions } from './displayAuth';

/** Terminal (y su organización) detrás de una petición, venga por token o por sesión. */
export interface DisplayActorTerminal {
  terminalId: string;
  organizationId: number;
  branchId: number;
  /** 'token' = tableta emparejada; 'session' = caja o pantalla local con sesión. */
  via: 'token' | 'session';
}

export type DisplayActorResult = { ok: true; actor: DisplayActorTerminal } | { ok: false; response: NextResponse };

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** ¿La petición trae un token Bearer? (entonces manda el camino de token, sin mirar cookies). */
function hasBearer(request: Pick<Request, 'headers'>): boolean {
  const header = request.headers.get('authorization');
  return typeof header === 'string' && /^Bearer\s+\S/i.test(header);
}

export interface ResolveDisplayActorOptions extends DisplayAuthOptions {
  /** `terminalId` que dice el cliente. Solo se usa en el camino de SESIÓN. */
  terminalId?: unknown;
}

/**
 * Resuelve la terminal de la petición. Con token: la del token (y ahí no se
 * mira `terminalId`, que sería una terminal elegida por el cliente). Con
 * sesión: la fila de `pos_terminals` con ese id DENTRO de la organización de
 * la sesión; sin fila → 404 `TERMINAL_NOT_FOUND` (una caja de la Fase 0, con
 * un UUID local que nunca se registró, cae aquí y la ruta no escribe nada).
 */
export async function resolveDisplayActor(request: Request, options: ResolveDisplayActorOptions = {}): Promise<DisplayActorResult> {
  if (hasBearer(request)) {
    const auth = await authenticateDisplayRequest(request, options);
    if (!auth.ok) return { ok: false, response: auth.response };
    return {
      ok: true,
      actor: { terminalId: auth.terminal.id, organizationId: auth.terminal.organizationId, branchId: auth.terminal.branchId, via: 'token' },
    };
  }

  if (!isTerminalId(options.terminalId)) {
    return { ok: false, response: json({ error: 'terminalId inválido', code: 'INVALID_TERMINAL' }, 400) };
  }
  const terminalId = options.terminalId;

  let ctx: { organizationId: number; supabase: SupabaseClient };
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) return { ok: false, response: json({ error: err.message, code: err.code }, err.statusCode) };
    console.error('[pos-display/actor] sesión no resuelta:', err instanceof Error ? err.message : err);
    return { ok: false, response: json({ error: 'Error interno', code: 'INTERNAL' }, 500) };
  }

  const { data, error } = await ctx.supabase
    .from('pos_terminals')
    .select('id, organization_id, branch_id, is_active')
    .eq('id', terminalId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) {
    console.error('[pos-display/actor] lectura de la terminal falló:', error.message);
    return { ok: false, response: json({ error: 'No se pudo leer la terminal', code: 'READ_FAILED' }, 500) };
  }
  const row = data as { id: string; organization_id: number; branch_id: number | null; is_active: boolean | null } | null;
  if (!row || row.is_active !== true || typeof row.branch_id !== 'number') {
    return { ok: false, response: json({ error: 'Terminal no encontrada', code: 'TERMINAL_NOT_FOUND' }, 404) };
  }
  return { ok: true, actor: { terminalId: row.id, organizationId: row.organization_id, branchId: row.branch_id, via: 'session' } };
}
