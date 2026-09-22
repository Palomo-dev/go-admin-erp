import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { canManagePosTerminalsSync } from '@/lib/pos/display/terminalPermissions';
import { isTerminalId } from '@/lib/pos/display/terminal';
import {
  TERMINAL_CODE_PATTERN,
  TERMINAL_COLUMNS,
  TERMINAL_NAME_MAX,
  normalizeTerminalCode,
  type PosTerminal,
} from '@/lib/pos/display/terminalIdentity';

export const dynamic = 'force-dynamic';

/** Cuerpo del PATCH: nombre, código y/o activo. Al menos uno. */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(TERMINAL_NAME_MAX).optional(),
    code: z
      .string()
      .trim()
      .transform(normalizeTerminalCode)
      .refine((value) => TERMINAL_CODE_PATTERN.test(value), 'code_invalid')
      .optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.code !== undefined || value.is_active !== undefined, 'nada que actualizar');

/** Código de error de Postgres para violación de UNIQUE: pos_terminals_code_unico (code) y pos_terminals_code_unico_ci (upper(code)). */
const UNIQUE_VIOLATION = '23505';

/**
 * PATCH /api/pos/terminals/[id] — renombra, cambia el código o activa /
 * desactiva una terminal del POS (`public.pos_terminals`, solo identidad).
 * PLAN pos-doble-pantalla §7: Admin/manager. El ROL se comprueba aquí, en el
 * servidor (regla dura 6), antes de tocar la fila, y el cliente de sesión
 * (`ctx.supabase`) sigue aplicando la RLS por debajo. Desde la ronda 3 de
 * F2-A la política `pos_terminals_update` exige el mismo criterio (role_id
 * 1/2/5, super admin o `admin.full_access` vía `check_user_permission`,
 * migración 20260921150000, PLAN §6.5): defensa en profundidad, no un
 * sustituto de este gate, que es quien da el 403 `ADMIN_REQUIRED` legible.
 *
 * - La organización sale de la sesión (`getServerOrgContext`); si el body o la
 *   query traen otra → 403 `FOREIGN_ORGANIZATION` y registro (`readOrgBody`).
 * - Sin rol → 403 `ADMIN_REQUIRED`. Id que no es UUID / body inválido → 400.
 *   Fila ajena o inexistente → 404. Código repetido en la sucursal → 409
 *   `DUPLICATE_CODE`.
 * - Nunca borra ni toca la tabla de secretos del emparejamiento (Fase 3).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'PATCH /api/pos/terminals/[id]' });

    if (!canManagePosTerminalsSync(ctx) && !(await hasOrgAdminOrPermission(ctx))) {
      console.warn('[pos/terminals] PATCH sin rol admin/manager', { organizationId: ctx.organizationId, userId: ctx.userId, roleId: ctx.roleId });
      return NextResponse.json({ error: 'Requiere rol de administrador o manager', code: 'ADMIN_REQUIRED' }, { status: 403 });
    }

    const { id } = await params;
    if (!isTerminalId(id)) {
      return NextResponse.json({ error: 'id de terminal inválido', code: 'INVALID_ID' }, { status: 400 });
    }
    // Las claves de organización ya las juzgó readOrgBody (misma organización = inofensiva): se
    // retiran antes del esquema estricto para no responder 400 a un cliente que manda la suya.
    const candidate = typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key))) : body;
    const parsed = patchSchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: 'terminal inválida', code: 'INVALID_BODY', details: parsed.error.flatten() }, { status: 400 });
    }
    const patch: Partial<Pick<PosTerminal, 'name' | 'code' | 'is_active'>> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.code !== undefined) patch.code = parsed.data.code;
    if (parsed.data.is_active !== undefined) patch.is_active = parsed.data.is_active;

    const { data, error } = await ctx.supabase
      .from('pos_terminals')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select(TERMINAL_COLUMNS)
      .maybeSingle();

    if (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        return NextResponse.json({ error: 'Ese código ya existe en la sucursal', code: 'DUPLICATE_CODE' }, { status: 409 });
      }
      console.error('[pos/terminals] PATCH falló:', error.message);
      return NextResponse.json({ error: 'No se pudo actualizar la terminal', code: 'UPDATE_FAILED' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Terminal no encontrada', code: 'NOT_FOUND' }, { status: 404 });
    }
    return NextResponse.json({ data: data as PosTerminal });
  } catch (err: unknown) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[pos/terminals] PATCH error:', message);
    return NextResponse.json({ error: 'Error interno', code: 'INTERNAL' }, { status: 500 });
  }
}
