/**
 * Alcance de una lectura de PayFac: la PLATAFORMA (admin verificado con
 * `fn_is_platform_admin()`) ve cualquier organización; un usuario de una
 * organización cliente solo ve la suya, con `finance.view`.
 *
 * Antes (auditoría 2026-09-23 §2.4) el control de admin solo se aplicaba si NO
 * venía `organizationId`, y con `?organizationId=` cualquiera con sesión leía
 * los payouts de otra organización.
 *
 * - Sin sesión → 401.
 * - Admin de plataforma → `{ tipo: 'plataforma', organizationId }`, con el
 *   filtro opcional `?organizationId=` que la plataforma sí puede elegir.
 * - Resto → `getServerOrgContext` (organización de la sesión; 403 si no es
 *   miembro), `readOrgBody` (`?organizationId=` ajeno → 403 y registro) y
 *   `finance.view` resuelto en el servidor.
 */

import { getServerOrgContext, readOrgBody, type ServerOrgContext } from '@/lib/utils/orgContext';
import { isPlatformAdmin, requireSessionUser } from '@/lib/security/platformAdmin';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';

export type AlcancePayfac =
  | { tipo: 'plataforma'; userId: string; organizationId: number | null }
  | { tipo: 'organizacion'; ctx: ServerOrgContext };

function organizacionDeLaQuery(req: Request): number | null {
  try {
    const valor = new URL(req.url).searchParams.get('organizationId');
    const n = valor ? Number.parseInt(valor, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function resolverAlcancePayfac(req: Request, ruta: string): Promise<AlcancePayfac> {
  const sesion = await requireSessionUser();
  if (await isPlatformAdmin(sesion.supabase)) {
    return { tipo: 'plataforma', userId: sesion.userId, organizationId: organizacionDeLaQuery(req) };
  }
  const ctx = await getServerOrgContext(req);
  await readOrgBody(ctx, req, { route: ruta });
  await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, ruta);
  return { tipo: 'organizacion', ctx };
}

/** Organización por la que filtrar: la de la sesión, o la elegida por la plataforma (o ninguna). */
export function organizacionDelAlcance(alcance: AlcancePayfac): number | undefined {
  if (alcance.tipo === 'organizacion') return alcance.ctx.organizationId;
  return alcance.organizationId ?? undefined;
}
