/**
 * Piezas comunes de los route handlers de compras y CxP (plan F2): cuerpo con
 * la organización de la sesión, permisos resueltos en el servidor, pertenencia
 * del recurso y respuesta de error uniforme con `codigo` estable.
 */
import { NextResponse } from 'next/server';
import type { z, ZodTypeAny } from 'zod';
import { OrgContextError, hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { ErrorCompraServidor } from './facturasCompra.server';
import { estadoHttpErrorCompra } from './contrato';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export class ErrorDatos extends Error {
  constructor(public readonly campos: string[]) {
    super('datos_invalidos');
  }
}

/**
 * Cuerpo JSON validado. Una organización ajena en el body o en la query es 403
 * y queda registrada (`readOrgBody`); la propia se ignora.
 */
export async function leerCuerpo<S extends ZodTypeAny>(ctx: ServerOrgContext, req: Request, schema: S, ruta: string): Promise<z.output<S>> {
  const raw: unknown = await readOrgBody(ctx, req, { route: ruta });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : (raw ?? {});
  const r = schema.safeParse(candidato);
  if (!r.success) throw new ErrorDatos(r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

/** 403 `sin_permiso` si falta ALGUNO de los permisos (todos son obligatorios). */
export async function exigirPermisos(ctx: ServerOrgContext, codigos: readonly string[], ruta: string): Promise<void> {
  for (const codigo of codigos) {
    if (!(await hasOrgAdminOrPermission(ctx, codigo))) {
      console.warn('[compras] permiso faltante → 403', { ruta, permiso: codigo, organizationId: ctx.organizationId, userId: ctx.userId });
      throw new OrgContextError(`Requiere el permiso ${codigo}`, 403, 'sin_permiso');
    }
  }
}

/** 403 `sin_permiso` si no tiene NINGUNO de los permisos. */
export async function exigirAlgunPermiso(ctx: ServerOrgContext, codigos: readonly string[], ruta: string): Promise<void> {
  for (const codigo of codigos) {
    if (await hasOrgAdminOrPermission(ctx, codigo)) return;
  }
  console.warn('[compras] permiso faltante → 403', { ruta, permisos: codigos, organizationId: ctx.organizationId, userId: ctx.userId });
  throw new OrgContextError(`Requiere uno de los permisos ${codigos.join(', ')}`, 403, 'sin_permiso');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de la ruta: uuid válido o 404 (no se distingue «no existe» de «es de otro»). */
export async function idDeRuta(routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined, clave = 'id'): Promise<string> {
  const p = routeParams ? await routeParams.params : {};
  const v = p[clave];
  const id = Array.isArray(v) ? v[0] : v;
  if (!id || !UUID_RE.test(id)) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
  return id;
}

/**
 * 404 si la fila no es de la organización de la sesión. Con el cliente de la
 * sesión (RLS, que además aplica la restricción por sucursal) Y el filtro por
 * organización.
 */
export async function exigirDeLaOrg(ctx: ServerOrgContext, tabla: string, id: string | number): Promise<void> {
  const { data, error } = await ctx.supabase.from(tabla).select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
  if (error || !data) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
}

/** Respuesta de error uniforme: `{ error, codigo }` con su estado. */
export function respuestaError(etiqueta: string, err: unknown): Response {
  if (err instanceof ErrorDatos) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos', campos: err.campos }, { status: 400, headers: SIN_CACHE });
  }
  if (err instanceof ErrorCompraServidor) {
    return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorCompra(err.codigo), headers: SIN_CACHE });
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, codigo: err.code, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  return routeErrorResponse(etiqueta, err);
}
