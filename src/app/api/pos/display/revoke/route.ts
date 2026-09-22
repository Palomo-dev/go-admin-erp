import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError, ORG_BODY_KEYS, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { canManagePosTerminalsSync } from '@/lib/pos/display/terminalPermissions';
import { isTerminalId } from '@/lib/pos/display/terminal';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ terminalId: z.string().refine(isTerminalId, 'terminalId inválido') }).strict();

/**
 * POST /api/pos/display/revoke — desempareja la pantalla remota de una
 * terminal (PLAN §7 y §11): borra el hash del token (y cualquier código
 * pendiente). Fase 3, parte A. La tableta deja de autenticar en su siguiente
 * petición (bootstrap/heartbeat → 401).
 *
 * - Sesión obligatoria (esta ruta vive bajo /api/pos/display/, excluida del
 *   middleware, así que es `getServerOrgContext` quien responde 401 sin
 *   sesión). La organización sale de la sesión; `readOrgBody` da 403 ante
 *   una ajena en body o query. Solo admin/manager (mismo gate que el PATCH
 *   de la terminal), resuelto en el servidor.
 * - Body `{ terminalId }` (UUID). La terminal se comprueba con el cliente
 *   de sesión (RLS): ajena o inexistente → 404.
 * - La escritura va con service-role a `pos_terminal_secrets`, filtrando
 *   también por `organization_id`. Idempotente: sin fila de secretos también
 *   es «revocada».
 * - Y se limpia `pos_terminals.display_last_seen_at` (F3-C ronda 4 · 3): es
 *   lo único que la caja puede leer sobre la pantalla remota, así que dejarlo
 *   puesto hacía que la interfaz siguiera diciendo «conectada» justo después
 *   de revocar. La tableta puede seguir recibiendo hasta 5 min (el TTL de su
 *   JWT de Realtime); eso lo explica la UI, no se puede acortar desde aquí.
 */
export async function POST(request: Request) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'POST /api/pos/display/revoke' });

    if (!canManagePosTerminalsSync(ctx) && !(await hasOrgAdminOrPermission(ctx))) {
      console.warn('[pos-display/revoke] sin rol admin/manager', { organizationId: ctx.organizationId, userId: ctx.userId, roleId: ctx.roleId });
      return NextResponse.json({ error: 'Requiere rol de administrador o manager', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }

    const candidate = typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key))) : body;
    const parsed = bodySchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: 'terminalId inválido', code: 'INVALID_BODY', details: parsed.error.flatten() }, { status: 400 });
    }
    const terminalId = parsed.data.terminalId;

    const { data: terminal, error: terminalError } = await ctx.supabase
      .from('pos_terminals')
      .select('id')
      .eq('id', terminalId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (terminalError) {
      console.error('[pos-display/revoke] lectura de la terminal falló:', terminalError.message);
      return NextResponse.json({ error: 'No se pudo leer la terminal', code: 'READ_FAILED' }, { status: 500 });
    }
    if (!terminal) {
      return NextResponse.json({ error: 'Terminal no encontrada', code: 'NOT_FOUND' }, { status: 404 });
    }

    const { error: writeError } = await getServiceClient()
      .from('pos_terminal_secrets')
      .update({ display_token_hash: null, pairing_code: null, pairing_code_expires_at: null, updated_at: new Date().toISOString() })
      .eq('terminal_id', terminalId)
      .eq('organization_id', ctx.organizationId);
    if (writeError) {
      console.error('[pos-display/revoke] escritura falló:', writeError.message);
      return NextResponse.json({ error: 'No se pudo revocar la pantalla', code: 'WRITE_FAILED' }, { status: 500 });
    }

    // Se borra también la última señal de la pantalla remota (F3-C ronda 4 · 3).
    // Sin esto, la tarjeta de Configuración seguía pintando el punto VERDE con
    // «hace menos de un minuto» hasta tres minutos después de revocar: el
    // administrador hacía una acción de seguridad y la interfaz le respondía
    // que la tableta seguía conectada. Idempotente y en su propia sentencia:
    // si fallara, lo revocado (el hash) ya lo está y eso es lo que importa, así
    // que se registra y la respuesta no cambia.
    const { error: seenError } = await getServiceClient()
      .from('pos_terminals')
      .update({ display_last_seen_at: null })
      .eq('id', terminalId)
      .eq('organization_id', ctx.organizationId);
    if (seenError) {
      console.error('[pos-display/revoke] no se pudo limpiar display_last_seen_at:', seenError.message);
    }

    return NextResponse.json({ data: { terminalId, revoked: true } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error('[pos-display/revoke] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500 });
  }
}
