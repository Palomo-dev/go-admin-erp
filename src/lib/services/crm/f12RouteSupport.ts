/**
 * F12 — soporte común de las rutas de referidos y partners.
 *
 * - La organización sale de la sesión (`getServerOrgContext`); si el body o el
 *   query traen `organization_id` de OTRA organización → 403 y se registra
 *   (regla dura 5), con el helper único `foreignOrganizationInBody`.
 * - Quien aprueba/paga/rechaza una comisión de partner o borra un partner
 *   debe ser admin o manager, resuelto en servidor POR ID DE ROL
 *   (`STAGE_MANAGER_ROLE_IDS`), nunca por nombre ni por un valor del cliente.
 * - Errores de máquina de estados → 409; UNIQUE de Postgres → 409; errores de
 *   BD → 502 honesto; el resto 500.
 */

import { NextResponse } from 'next/server';
import { OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { foreignOrganizationInBody } from '@/lib/security/organizationBody';
import { STAGE_MANAGER_ROLE_IDS } from './stagePermissions';
import { ReferralTransitionError } from './referralStateMachine';
import { CommissionTransitionError } from './partnerCommission';
import { type FieldError, firstErrorMessage } from './f12Validation';

export { F12Error, notFound } from './f12Errors';
import { F12Error } from './f12Errors';

/** Admin o manager por id de rol (misma lista que el gate de etapas y F13). */
export function canManagePartners(ctx: Pick<ServerOrgContext, 'roleId' | 'isSuperAdmin'>): boolean {
  return ctx.isSuperAdmin === true || STAGE_MANAGER_ROLE_IDS.includes(ctx.roleId);
}

export function requirePartnerManager(ctx: Pick<ServerOrgContext, 'roleId' | 'isSuperAdmin'>): void {
  if (!canManagePartners(ctx)) {
    throw new OrgContextError('Requiere rol de administrador o manager de la organización', 403, 'MANAGER_REQUIRED');
  }
}

/** Regla dura 5: `organization_id` ajeno en body/query → 403 + registro. */
export function rejectForeignOrganization(tag: string, claimed: unknown, ctx: Pick<ServerOrgContext, 'organizationId'>): void {
  const foreign = foreignOrganizationInBody(claimed, ctx.organizationId);
  if (foreign === null) return;
  console.warn(`[${tag}] organization_id ajeno en la petición`, { session: ctx.organizationId, body: foreign });
  throw new OrgContextError('Organización no permitida', 403, 'FOREIGN_ORGANIZATION');
}

export function jsonOk<T>(data: T, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ success: true, data, ...extra }, { status });
}

export function jsonFail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export function validationFail(errors: FieldError[]) {
  return jsonFail(400, firstErrorMessage(errors), { code: 'VALIDATION', errors });
}

/** Mapea cualquier error lanzado por la ruta a su respuesta. */
export function routeError(error: unknown, tag: string) {
  if (error instanceof OrgContextError) return jsonFail(error.statusCode, error.message, { code: error.code });
  if (error instanceof F12Error) return jsonFail(error.statusCode, error.message, { code: error.code, ...error.extra });
  if (error instanceof ReferralTransitionError || error instanceof CommissionTransitionError) {
    return jsonFail(error.statusCode, error.message, { code: error.code });
  }
  const pg = error as { code?: string; message?: string } | null;
  if (pg && pg.code === '23505') return jsonFail(409, 'Ya existe un registro con ese nombre o correo en esta organización.', { code: 'DUPLICATE' });
  if (pg && pg.code === '23503') return jsonFail(409, 'El registro está enlazado a otros datos y no se puede borrar.', { code: 'IN_USE' });
  if (pg && typeof pg.code === 'string' && typeof pg.message === 'string') {
    console.error(`[${tag}] base de datos:`, pg.message);
    return jsonFail(502, `La base de datos no respondió: ${pg.message}`, { code: 'UPSTREAM_DATA' });
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

/** `limit`/`offset` del query acotados (1..200 / ≥ 0). */
export function readPage(searchParams: URLSearchParams): { limit: number; offset: number } {
  const limitRaw = Number.parseInt(searchParams.get('limit') ?? '', 10);
  const offsetRaw = Number.parseInt(searchParams.get('offset') ?? '', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  return { limit, offset };
}
