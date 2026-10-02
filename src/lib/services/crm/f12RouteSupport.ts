/**
 * F12 — soporte común de las rutas de referidos y partners.
 *
 * - La organización sale de la sesión (`getServerOrgContext`); si el body o el
 *   query traen `organization_id` de OTRA organización → 403 y se registra
 *   (regla dura 5), con el punto único `readOrgBody`.
 * - Quien aprueba/paga/rechaza una comisión de partner o borra un partner
 *   exige administración canónica resuelta en el servidor, incluido un cargo
 *   personalizado con admin.full_access; nunca un valor enviado por el cliente.
 * - Errores de máquina de estados → 409; UNIQUE de Postgres → 409; errores de
 *   BD → 502 honesto; el resto 500.
 */

import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { respuestaErrorCrm } from './crmRouteSupport';
import { ReferralTransitionError } from './referralStateMachine';
import { CommissionTransitionError } from './partnerCommission';
import { type FieldError, firstErrorMessage } from './f12Validation';

export { F12Error, notFound } from './f12Errors';
import { F12Error } from './f12Errors';

type F12Session = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'roleId' | 'isSuperAdmin'>;

/** Configuración y registros de pago: administración canónica, incluidos cargos personalizados. */
export async function canManagePartners(ctx: F12Session): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx);
}
export async function requirePartnerManager(ctx: F12Session): Promise<void> {
  if (!(await canManagePartners(ctx))) {
    console.warn('[F12] gestión denegada', { roleId: ctx.roleId });
    throw new OrgContextError('No tienes permiso para gestionar esta configuración', 403, 'MANAGER_REQUIRED');
  }
}
export async function canRegisterPartnerDeal(ctx: F12Session): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx, 'crm.opportunities.edit');
}
export async function canConvertReferral(ctx: F12Session): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx, 'crm.leads.create');
}

/** Regla dura 5: `organization_id` ajeno en body/query → 403 + registro. */
/**
 * Azúcar sobre el punto único `readOrgBody`: body ya parseado (todas las
 * claves de organización) y query string de la petición → 403 registrado.
 * Deuda C de F0-SEC (2026-09-16): antes solo miraba `body.organization_id`.
 */
export function rejectForeignOrganization(tag: string, body: unknown, ctx: Pick<ServerOrgContext, 'organizationId' | 'userId'>, request?: Pick<Request, 'url'>): void {
  readOrgBody(ctx, body, { route: tag, request });
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
  return respuestaErrorCrm(error, tag);
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
  const read = (key: string, fallback: number, min: number, max: number) => {
    const raw = searchParams.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) throw new F12Error(400, 'VALIDATION', `${key} inválido`);
    return value;
  };
  return { limit: read('limit', 50, 1, 200), offset: read('offset', 0, 0, Number.MAX_SAFE_INTEGER - 200) };
}
