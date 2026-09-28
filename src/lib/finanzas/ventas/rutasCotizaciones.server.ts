/**
 * Piezas comunes de las rutas `/api/cotizaciones/**`: permiso resuelto en el
 * servidor (basta uno de los códigos), respuesta de error con código estable y
 * texto en el idioma del usuario, id de la ruta y cuerpo sin claves de
 * organización (`readOrgBody` ya rechazó con 403 una organización ajena).
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS } from '@/lib/security/organizationBody';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';
import { estadoHttpErrorCotizacion, type ErrorCotizacion } from './contratoCotizaciones';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = ServerOrgContext;

export async function tieneAlguno(ctx: Ctx, codigos: readonly string[]): Promise<boolean> {
  for (const codigo of codigos) {
    if (await hasOrgAdminOrPermission(ctx, codigo)) return true;
  }
  return false;
}

export async function errorCotizacion(ctx: Ctx, codigo: ErrorCotizacion, ruta?: string): Promise<Response> {
  if (codigo === 'sin_permiso') {
    console.warn('[cotizaciones] permiso faltante → 403', { ruta: ruta ?? null, organizationId: ctx.organizationId, userId: ctx.userId });
  }
  let mensaje: string = codigo;
  try {
    const t = await traductorFinanzas('documentosVenta', await idiomaDelUsuario(ctx));
    mensaje = t(`cotizaciones.errores.${codigo}`);
  } catch {
    /* sin textos: el código */
  }
  return NextResponse.json({ error: mensaje, codigo }, { status: estadoHttpErrorCotizacion(codigo), headers: SIN_CACHE });
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
