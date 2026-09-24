/**
 * POST /api/super-admin-cleanup — al cerrar sesión, el administrador de
 * plataforma que entró a una organización con acceso temporal (ver
 * `/api/super-admin-access`) borra SU membresía temporal.
 *
 * GO-sec (auditoría 2026-09-24): no tenía autenticación (el comentario del
 * middleware decía «autenticación propia via body», y no la había) y borraba
 * con service role la membresía temporal de CUALQUIER `user_id` en CUALQUIER
 * organización que llegara en el body. Ahora:
 *  - exige sesión verificada (`requireSessionUser` → `auth.getUser`, 401), y
 *    la ruta vuelve a pasar por el middleware;
 *  - el usuario es SIEMPRE el de la sesión; un `user_id` del body distinto →
 *    403 y se registra (antes era el único dato que se usaba);
 *  - solo borra filas `is_temporary = true` de ese usuario, y solo en la
 *    organización indicada (si no se indica, todas sus temporales).
 * Service role justificado: la fila es del propio usuario de la sesión y el
 * filtro por `user_id` + `is_temporary` va en la misma sentencia.
 *
 * Llamador: `signOut` en `src/lib/supabase/config.ts`, antes de cerrar la
 * sesión (las cookies todavía están).
 */

import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/security/platformAdmin';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';
import { OrgContextError } from '@/lib/utils/orgContextError';

const RUTA = 'super-admin-cleanup';

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();

    let body: { user_id?: unknown; org_id?: unknown } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      body = {};
    }

    if (body.user_id != null && String(body.user_id) !== userId) {
      console.warn(`[${RUTA}] user_id del body distinto del de la sesión → 403`, { userId });
      throw new OrgContextError('Solo puedes limpiar tu propio acceso temporal', 403, 'FOREIGN_USER');
    }

    let orgId: number | null = null;
    if (body.org_id != null && String(body.org_id).trim() !== '') {
      const n = Number.parseInt(String(body.org_id), 10);
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: 'org_id inválido' }, { status: 400 });
      }
      orgId = n;
    }

    let borrado = getServiceClient()
      .from('organization_members')
      .delete()
      .eq('user_id', userId)
      .eq('is_temporary', true);
    if (orgId) borrado = borrado.eq('organization_id', orgId);

    const { error } = await borrado;
    if (error) {
      console.error(`[${RUTA}] no se pudo limpiar el acceso temporal:`, error.message);
      return NextResponse.json({ error: 'Error al limpiar acceso temporal' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}
