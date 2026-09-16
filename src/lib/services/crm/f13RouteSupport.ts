/**
 * F13 — soporte común de las rutas de cuotas, comisiones y panel del vendedor.
 * Convierte errores en respuestas JSON con el código correcto y centraliza
 * la autorización «gestiona equipo/dinero» (admin o manager, por id de rol)
 * y la regla dura 5 (organización ajena en el body → 403 + registro).
 */

import { NextResponse } from 'next/server';
import { OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CommissionTransitionError, canManageCommissions } from './commissionTransitions';
import { DataSourceError } from './salesTargetService';

/** 403 si la sesión no es admin/manager. Resuelto en servidor: `ctx.roleId`, nunca el body. */
export function requireTeamManager(ctx: Pick<ServerOrgContext, 'roleId' | 'isSuperAdmin'>): void {
  if (!canManageCommissions(ctx)) {
    throw new OrgContextError('Requiere rol de administrador o manager de la organización', 403, 'MANAGER_REQUIRED');
  }
}

/**
 * Regla dura 5: si el body (o el query) trae `organization_id` de OTRA
 * organización, 403 y se registra; la misma organización se ignora. Una sola
 * implementación (`readOrgBody`, el punto único de F0-SEC).
 */
export function rejectForeignOrganization(tag: string, body: unknown, ctx: Pick<ServerOrgContext, 'organizationId' | 'userId'>, request?: Pick<Request, 'url'>): void {
  // Azúcar sobre el punto único `readOrgBody` (body completo + query). Deuda C de F0-SEC, 2026-09-16.
  readOrgBody(ctx, body, { route: tag, request });
}

export function jsonOk<T>(data: T, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ success: true, data, ...extra }, { status });
}

export function jsonFail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

/** Mapea cualquier error lanzado por la ruta a su respuesta (401/403/400/409/502/500). */
export function routeError(error: unknown, tag: string) {
  if (error instanceof OrgContextError) return jsonFail(error.statusCode, error.message, { code: error.code });
  if (error instanceof CommissionTransitionError) return jsonFail(error.statusCode, error.message, { code: error.code });
  const pg = error as { code?: string; message?: string } | null;
  if (pg && pg.code === '23505') return jsonFail(409, 'Ya existe un registro igual (mismo periodo y tipo).', { code: 'DUPLICATE' });
  // Errores de BD (objeto PostgREST con `code`, o `DataSourceError` de los servicios): 502 honesto, nunca ceros ni listas vacías.
  if (error instanceof DataSourceError || (pg && typeof pg.code === 'string' && typeof pg.message === 'string')) {
    const message = pg?.message || 'error desconocido';
    console.error(`[${tag}] base de datos:`, message);
    return jsonFail(502, `La base de datos no respondió: ${message}`, { code: 'UPSTREAM_DATA' });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[${tag}] error:`, message);
  return jsonFail(500, message);
}

/** Lee el body JSON tolerando cuerpos vacíos o inválidos (→ `{}`). */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
