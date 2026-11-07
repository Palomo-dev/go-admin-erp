/**
 * Piezas comunes de `/api/documentos-soporte/**`: respuesta de error con
 * código estable (el navegador lo traduce), id de la ruta y permiso resuelto
 * en el servidor.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import type { PermisoFinanzas } from '@/lib/security/orgGuards';
import { estadoHttpErrorSoporte, type ErrorSoporte } from './contratoSoporte';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function errorSoporte(ctx: Pick<ServerOrgContext, 'organizationId' | 'userId'>, codigo: ErrorSoporte, ruta?: string): Response {
  if (codigo === 'sin_permiso') {
    console.warn('[documentos-soporte] permiso faltante → 403', { ruta: ruta ?? null, organizationId: ctx.organizationId, userId: ctx.userId });
  }
  return NextResponse.json({ error: codigo, codigo }, { status: estadoHttpErrorSoporte(codigo), headers: SIN_CACHE });
}

export async function tienePermiso(ctx: ServerOrgContext, codigo: PermisoFinanzas): Promise<boolean> {
  return hasOrgAdminOrPermission(ctx, codigo);
}

export async function idDeRuta(
  routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined,
): Promise<string | null> {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  return UUID_RE.test(id) ? id : null;
}

export function sinClavesDeOrganizacion(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
    : raw;
}
