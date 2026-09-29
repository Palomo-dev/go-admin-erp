/**
 * Piezas de los route handlers de traslados y distribución (inventario B3):
 * cuerpo y query con la organización de la sesión (regla dura 5), llamada a la
 * RPC con el cliente de la sesión (RLS) y la organización de la sesión, y
 * respuesta de error uniforme `{ error, codigo, detalle? }`.
 *
 * Los permisos se resuelven en el servidor (regla 6): cada RPC exige su acción
 * con fn_inventario_exigir_permiso (42501 → 403); los permisos que devuelve la
 * lectura salen de fn_inventario_permisos, nunca del cliente.
 */
import { NextResponse } from 'next/server';
import type { z, ZodTypeAny } from 'zod';
import { OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import {
  PERMISOS_TRASLADOS_VACIOS,
  codigoErrorTraslado,
  detalleErrorTraslado,
  estadoHttpErrorTraslado,
  type DetalleErrorTraslado,
  type ErrorTraslado,
  type PermisosTraslados,
} from './contrato';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export class ErrorDatosTraslado extends Error {
  constructor(public readonly campos: string[]) {
    super('datos_invalidos');
  }
}

export class ErrorRpcTraslado extends Error {
  constructor(
    public readonly codigo: ErrorTraslado,
    public readonly detalle: DetalleErrorTraslado | null,
  ) {
    super(codigo);
  }
}

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw ?? {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

/** Cuerpo JSON validado. Una organización ajena en el cuerpo o en la query es 403 registrado. */
export async function leerCuerpo<S extends ZodTypeAny>(ctx: ServerOrgContext, req: Request, schema: S, ruta: string): Promise<z.output<S>> {
  const raw: unknown = await readOrgBody(ctx, req, { route: ruta });
  const r = schema.safeParse(sinClavesDeOrganizacion(raw));
  if (!r.success) throw new ErrorDatosTraslado(r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

/** Query validada (GET); `listas` son claves repetibles o separadas por coma. */
export async function leerQuery<S extends ZodTypeAny>(
  ctx: ServerOrgContext,
  req: Request,
  schema: S,
  ruta: string,
  listas: readonly string[] = [],
): Promise<z.output<S>> {
  await readOrgBody(ctx, req, { route: ruta });
  const params = new URL(req.url).searchParams;
  const crudo: Record<string, unknown> = {};
  params.forEach((_, clave) => {
    if ((ORG_BODY_KEYS as readonly string[]).includes(clave) || clave in crudo) return;
    if (listas.includes(clave)) {
      crudo[clave] = params
        .getAll(clave)
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean);
    } else {
      const v = params.get(clave);
      if (v !== null && v !== '') crudo[clave] = v;
    }
  });
  const r = schema.safeParse(crudo);
  if (!r.success) throw new ErrorDatosTraslado(r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

/** Llama a la RPC con el cliente de la sesión y traduce su error a un código estable. */
export async function rpc<T>(ctx: ServerOrgContext, nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(nombre, args);
  if (error) {
    const codigo = codigoErrorTraslado(error);
    if (codigo === 'error_desconocido') console.error(`[traslados] ${nombre} falló`, { message: error.message, code: error.code });
    else if (codigo === 'sin_permiso' || codigo === 'sucursal_sin_acceso') {
      console.warn('[traslados] acceso denegado', { rpc: nombre, codigo, organizationId: ctx.organizationId, userId: ctx.userId });
    }
    throw new ErrorRpcTraslado(codigo, detalleErrorTraslado(error.details));
  }
  return data as T;
}

/** Permisos de la pantalla (fn_inventario_permisos). Un error = sin permisos, nunca «todo permitido». */
export async function permisosTraslados(ctx: ServerOrgContext): Promise<PermisosTraslados> {
  const { data, error } = await ctx.supabase.rpc('fn_inventario_permisos', { p_org: ctx.organizationId });
  if (error || !data) return PERMISOS_TRASLADOS_VACIOS;
  const p = data as Record<string, unknown>;
  return { ver: p.ver === true, trasladar: p.trasladar === true, recibir: p.recibir === true, costos: p.costos === true };
}

type ParamsRuta = { params: Promise<Record<string, string | string[] | undefined>> } | undefined;

/** Id numérico de la ruta o 404 (no se distingue «no existe» de «es de otra organización»). */
export async function idDeRuta(routeParams: ParamsRuta, clave = 'id'): Promise<number> {
  const p = routeParams ? await routeParams.params : {};
  const crudo = p[clave];
  const v = Array.isArray(crudo) ? crudo[0] : crudo;
  const n = v && /^\d{1,10}$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0 || n > 2_147_483_647) throw new OrgContextError('No encontrado', 404, 'traslado_no_encontrado');
  return n;
}

/** Respuesta de error uniforme. */
export function respuestaError(ruta: string, err: unknown): Response {
  if (err instanceof ErrorDatosTraslado) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos', campos: err.campos }, { status: 400, headers: SIN_CACHE });
  }
  if (err instanceof ErrorRpcTraslado) {
    return NextResponse.json(
      { error: err.codigo, codigo: err.codigo, detalle: err.detalle },
      { status: estadoHttpErrorTraslado(err.codigo), headers: SIN_CACHE },
    );
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, codigo: err.code, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  return routeErrorResponse(ruta, err);
}
