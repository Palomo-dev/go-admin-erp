/**
 * CRM ola 1 — soporte común de las rutas de oportunidades, pipelines, leads y
 * actividades (docs/crm/PLAN-FIGMA-A-CODIGO.md §7.1).
 *
 * - Permisos: los códigos `crm.*` de la migración 20260930160100 (D5). Se
 *   resuelven en el SERVIDOR con `hasOrgAdminOrPermission` —super admin y roles
 *   1/2 por id, el resto con `check_user_permission` (rol + cargo)— usando el
 *   usuario y la organización de la sesión. Nunca por nombre de rol ni con un
 *   valor del cliente (regla dura 6). La base vuelve a comprobarlo dentro de las
 *   RPC (`fn_crm_exigir_permiso`): la ruta da el 403 limpio y registrado, la
 *   RPC es la barrera.
 * - Errores: las RPC lanzan con SQLSTATE; aquí se traducen a HTTP en un solo
 *   sitio (42501→403, P0002→404, 22xxx→400, P0001/40001/23505→409).
 */

import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';

export const CRM_PERMISOS = {
  oportunidadesVer: 'crm.opportunities.view',
  oportunidadesCrear: 'crm.opportunities.create',
  oportunidadesEditar: 'crm.opportunities.edit',
  oportunidadesEditarCualquiera: 'crm.opportunities.edit_any',
  oportunidadesEliminar: 'crm.opportunities.delete',
  oportunidadesCerrar: 'crm.opportunities.close',
  etapasGestionar: 'crm.stages.manage',
  etapasSaltarGate: 'crm.stages.override_gate',
  pipelinesGestionar: 'crm.pipelines.manage',
  actividadesEditarCualquiera: 'crm.activities.edit_any',
  leadsVer: 'crm.leads.view',
  leadsCrear: 'crm.leads.create',
  leadsEditar: 'crm.leads.edit',
  leadsAsignar: 'crm.leads.assign',
  leadsConvertir: 'crm.leads.convert',
} as const;

export type CrmPermiso = (typeof CRM_PERMISOS)[keyof typeof CRM_PERMISOS];

/** Lo que necesita la resolución de permisos (subconjunto de la sesión). */
export type CrmSesion = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;

/** Error de negocio con estado HTTP (lo lanzan los servicios de la ola 1). */
export class CrmHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CrmHttpError';
  }
}

export function tienePermisoCrm(ctx: CrmSesion, codigo: CrmPermiso): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx, codigo);
}

/**
 * Exige AL MENOS UNO de los permisos. Devuelve el primero que concede; si
 * ninguno, registra (sin datos personales) y lanza 403 `CRM_FORBIDDEN`.
 */
export async function exigirPermisoCrm(ctx: CrmSesion, codigos: readonly CrmPermiso[], etiqueta: string): Promise<CrmPermiso> {
  for (const c of codigos) {
    if (await tienePermisoCrm(ctx, c)) return c;
  }
  console.warn('[crm] %s sin permiso %s (org %s, rol %s)', etiqueta, codigos.join('|'), ctx.organizationId, ctx.roleId);
  throw new OrgContextError('No tienes permiso para esta acción', 403, 'CRM_FORBIDDEN');
}

interface ErrorConCodigo {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function comoErrorConCodigo(e: unknown): ErrorConCodigo | null {
  return typeof e === 'object' && e !== null && 'code' in e ? (e as ErrorConCodigo) : null;
}

/** SQLSTATE de una RPC → estado HTTP (null si no es un error de negocio conocido). */
export function estadoDeSqlState(code: string): number | null {
  if (code === '42501') return 403;
  if (code === 'P0002') return 404;
  if (code === 'P0001' || code === '40001' || code === '23505') return 409;
  if (code.startsWith('22') || code === '23514' || code === '23503') return 400;
  return null;
}

/**
 * Convierte cualquier error de una ruta CRM en respuesta. El mensaje de una RPC
 * es un código corto (`sin_permiso`, `no_es_propia`, `sin_embudo_ventas`…) y
 * viaja como `code`; un error inesperado nunca filtra el texto de Postgres.
 */
export function respuestaErrorCrm(error: unknown, etiqueta: string): NextResponse {
  const conocido = clasificarErrorCrm(error);
  if (conocido) {
    if (conocido.status === 403 && conocido.origen === 'base') console.warn('[crm] %s denegado por la base: %s', etiqueta, conocido.code);
    return NextResponse.json({ success: false, error: conocido.error, code: conocido.code, ...conocido.extra }, { status: conocido.status });
  }
  console.error('[crm] %s error:', etiqueta, mensajeCrudo(error));
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}

/** Error de negocio reconocido: estado HTTP, código corto y mensaje apto para el cliente. */
export interface ErrorCrmClasificado {
  status: number;
  code: string;
  error: string;
  extra: Record<string, unknown>;
  /** 'base' = SQLSTATE de una RPC; 'ruta' = error lanzado en Node. */
  origen: 'ruta' | 'base';
}

/**
 * Clasifica un error como lo hace `respuestaErrorCrm`, sin responder: lo usan
 * las operaciones en lote para informar el fallo de cada elemento. `null` si
 * es inesperado (nunca se filtra el texto de Postgres).
 */
export function clasificarErrorCrm(error: unknown): ErrorCrmClasificado | null {
  if (error instanceof OrgContextError) {
    return { status: error.statusCode, code: error.code, error: error.message, extra: {}, origen: 'ruta' };
  }
  if (error instanceof CrmHttpError) {
    return { status: error.status, code: error.code, error: error.message, extra: error.extra, origen: 'ruta' };
  }
  const pg = comoErrorConCodigo(error);
  if (pg && typeof pg.code === 'string') {
    const status = estadoDeSqlState(pg.code);
    if (status) {
      const code = typeof pg.message === 'string' && /^[a-z_]{3,60}$/.test(pg.message) ? pg.message : 'error_de_datos';
      return { status, code, error: code, extra: {}, origen: 'base' };
    }
  }
  return null;
}

/** Texto crudo de un error inesperado, solo para el registro del servidor. */
export function mensajeCrudo(error: unknown): string {
  const pg = comoErrorConCodigo(error);
  return error instanceof Error ? error.message : typeof pg?.message === 'string' ? pg.message : String(error);
}

/** Cuerpo sin las claves de organización (ya comprobadas por `readOrgBody`). */
export function sinClavesDeOrganizacion<T extends Record<string, unknown>>(body: T | null | undefined): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  const { organization_id: _a, organizationId: _b, orgId: _c, org_id: _d, ...resto } = body as Record<string, unknown>;
  void _a; void _b; void _c; void _d;
  return resto;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 400 si el id de la ruta no es un uuid (evita un 500 de Postgres por el cast). */
export function exigirUuid(id: string, campo = 'id'): string {
  if (!UUID_RE.test(id)) throw new CrmHttpError(400, 'id_invalido', `${campo} inválido`);
  return id;
}
