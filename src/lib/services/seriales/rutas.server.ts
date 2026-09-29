/**
 * Piezas de los route handlers de seriales, garantías y trazabilidad
 * (inventario B4): cuerpo y query con la organización de la sesión (regla dura
 * 5), permisos resueltos en el servidor (regla 6), llamada a la RPC con la
 * organización de la sesión y respuesta de error uniforme con `codigo` estable.
 *
 * La RPC vuelve a exigir el permiso (DEFINER + fn_inventario_exigir_permiso):
 * la comprobación de aquí responde 403 sin tocar la base y deja registro.
 */
import { NextResponse } from 'next/server';
import type { z, ZodTypeAny } from 'zod';
import { OrgContextError, hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import {
  PERMISOS_ESTADO_SERIAL,
  PERMISOS_GESTIONAR_SERIALES,
  PERMISOS_VER_SERIALES,
  codigoErrorSeriales,
  estadoHttpErrorSeriales,
  type ErrorSeriales,
} from './contrato';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

export class ErrorDatosSeriales extends Error {
  constructor(public readonly campos: string[]) {
    super('datos_invalidos');
  }
}

export class ErrorRpcSeriales extends Error {
  constructor(public readonly codigo: ErrorSeriales) {
    super(codigo);
  }
}

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw ?? {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

/** Cuerpo JSON validado. Una organización ajena en el body o en la query es 403 registrado. */
export async function leerCuerpo<S extends ZodTypeAny>(ctx: ServerOrgContext, req: Request, schema: S, ruta: string): Promise<z.output<S>> {
  const raw: unknown = await readOrgBody(ctx, req, { route: ruta });
  const r = schema.safeParse(sinClavesDeOrganizacion(raw));
  if (!r.success) throw new ErrorDatosSeriales(r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

/**
 * Query validada (GET). Las claves repetidas (`estados=sold&estados=rma`) o
 * separadas por coma llegan como arreglo. Organización ajena en la query → 403.
 */
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
  if (!r.success) throw new ErrorDatosSeriales(r.error.issues.map((i) => i.path.join('.')));
  return r.data;
}

async function exigirAlguno(ctx: ServerOrgContext, codigos: readonly string[], ruta: string): Promise<void> {
  for (const codigo of codigos) {
    if (await hasOrgAdminOrPermission(ctx, codigo)) return;
  }
  console.warn('[seriales] permiso faltante → 403', { ruta, permisos: codigos, organizationId: ctx.organizationId, userId: ctx.userId });
  throw new OrgContextError('Sin permiso para esta acción de inventario', 403, 'sin_permiso');
}

/** Ver seriales, garantías y trazabilidad. */
export const exigirVer = (ctx: ServerOrgContext, ruta: string) => exigirAlguno(ctx, PERMISOS_VER_SERIALES, ruta);
/** Abrir, aprobar, rechazar, enviar y resolver reclamos (acción `garantias` del núcleo). */
export const exigirGestionar = (ctx: ServerOrgContext, ruta: string) => exigirAlguno(ctx, PERMISOS_GESTIONAR_SERIALES, ruta);
/** Cambiar el estado de un serial (los permisos de `fn_producto_serial_cambiar_estado`). */
export const exigirCambiarEstado = (ctx: ServerOrgContext, ruta: string) => exigirAlguno(ctx, PERMISOS_ESTADO_SERIAL, ruta);

/** Llama a la RPC con el cliente de la sesión (RLS) y traduce su error. */
export async function rpc<T>(ctx: ServerOrgContext, nombre: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await ctx.supabase.rpc(nombre, args);
  if (error) {
    const codigo = codigoErrorSeriales(error);
    if (codigo === 'error_desconocido') console.error(`[seriales] ${nombre} falló`, { message: error.message, code: error.code });
    throw new ErrorRpcSeriales(codigo);
  }
  return data as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParamsRuta = { params: Promise<Record<string, string | string[] | undefined>> } | undefined;

async function paramDeRuta(routeParams: ParamsRuta, clave: string): Promise<string | undefined> {
  const p = routeParams ? await routeParams.params : {};
  const v = p[clave];
  return Array.isArray(v) ? v[0] : v;
}

/** Id numérico de la ruta o 404 (no se distingue «no existe» de «es de otro»). */
export async function idNumericoDeRuta(routeParams: ParamsRuta, clave = 'id'): Promise<number> {
  const v = await paramDeRuta(routeParams, clave);
  const n = v && /^\d{1,10}$/.test(v) ? Number(v) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
  return n;
}

/** Id uuid de la ruta o 404. */
export async function uuidDeRuta(routeParams: ParamsRuta, clave = 'id'): Promise<string> {
  const v = await paramDeRuta(routeParams, clave);
  if (!v || !UUID_RE.test(v)) throw new OrgContextError('No encontrado', 404, 'no_encontrado');
  return v;
}

/** Respuesta de error uniforme: `{ error, codigo }` con su estado. */
export function respuestaError(ruta: string, err: unknown): Response {
  if (err instanceof ErrorDatosSeriales) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos', campos: err.campos }, { status: 400, headers: SIN_CACHE });
  }
  if (err instanceof ErrorRpcSeriales) {
    return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorSeriales(err.codigo), headers: SIN_CACHE });
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, codigo: err.code, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  return routeErrorResponse(ruta, err);
}
