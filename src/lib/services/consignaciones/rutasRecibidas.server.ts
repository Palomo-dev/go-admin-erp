/**
 * Puerta común de las rutas de consignación recibida y vínculos: la
 * organización sale de la sesión (`withOrg` + `readOrgBody`: otra en el body →
 * 403 y se registra), el cuerpo se valida con su esquema, el permiso se
 * resuelve en el servidor y los errores llegan con su `codigo` estable.
 */
import { NextResponse } from 'next/server';
import type { ZodTypeAny, z } from 'zod';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { ErrorConsignacionServidor } from '@/lib/services/consignaciones/consignaciones.server';
import type { ErrorRecibida } from '@/lib/inventario/consignaciones/recibidas';
import { ErrorRecibidaServidor, respuestaErrorRecibida, SIN_CACHE } from './recibidas.server';

export { UUID_RE };

export async function idDeRuta(routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  return UUID_RE.test(id) ? id : '';
}

export async function ejecutar<S extends ZodTypeAny | null, R>(
  ctx: ServerOrgContext,
  req: Request,
  opciones: {
    ruta: string;
    permisos: readonly string[];
    esquema: S;
    accion: (cuerpo: S extends ZodTypeAny ? z.output<S> : null) => Promise<R>;
    estado?: number;
  },
): Promise<NextResponse> {
  const raw: unknown = await readOrgBody(ctx, req, { route: opciones.ruta });
  let cuerpo: unknown = null;
  if (opciones.esquema) {
    const parsed = opciones.esquema.safeParse(sinClavesDeOrganizacion(raw));
    if (!parsed.success) return respuestaErrorRecibida('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));
    cuerpo = parsed.data;
  }
  let permitido = false;
  for (const p of opciones.permisos) {
    if (await hasOrgAdminOrPermission(ctx, p)) {
      permitido = true;
      break;
    }
  }
  if (!permitido) {
    console.warn(`[consignaciones] ${opciones.ruta}: permiso faltante → 403`, { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorRecibida('sin_permiso');
  }
  try {
    const resultado = await opciones.accion(cuerpo as S extends ZodTypeAny ? z.output<S> : null);
    return NextResponse.json({ resultado }, { status: opciones.estado ?? 200, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorRecibidaServidor) return respuestaErrorRecibida(err.codigo, err.detalle);
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorRecibida(err.codigo as ErrorRecibida, err.detalle);
    throw err;
  }
}
