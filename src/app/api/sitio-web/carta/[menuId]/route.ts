/**
 * /api/sitio-web/carta/[menuId] — detalle de una carta (Figma B/13-02).
 *
 * GET    → carta, categorías del inventario con sus productos (precio vigente,
 *          etiquetas de dieta) y las excepciones de esta carta.
 * PUT    → todo el detalle en UNA transacción (`guardar_carta_y_sedes`):
 *          nombre, horario, sedes, PDF, categorías en orden, excepciones por
 *          producto (con variantes y extras ocultos) y los cambios de la pestaña
 *          «Por sede». O queda todo o no queda nada.
 * DELETE → elimina la carta (las secciones y excepciones caen en cascada).
 *
 * `principal` es la carta implícita mientras la migración no esté aplicada:
 * se lee, pero no se guarda (409 `pendiente_migracion`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { ID_CARTA_PRINCIPAL_IMPLICITA, esquemaGuardarCarta } from '@/lib/website/carta';
import { ErrorCarta, detalleCarta, eliminarCarta, guardarCartaYSedes, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/carta/[menuId]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = { params: Promise<Record<string, string | string[] | undefined>> } | undefined;

/** Id de la carta: un uuid o `principal` (la carta implícita). */
async function idDe(routeParams: Params): Promise<string> {
  const crudo = (await routeParams?.params)?.menuId;
  const id = typeof crudo === 'string' ? crudo : '';
  if (id !== ID_CARTA_PRINCIPAL_IMPLICITA && !UUID.test(id)) throw new ErrorCarta('no_encontrada', 404, 'No encontramos esa carta.');
  return id;
}

export const GET = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    return NextResponse.json(await detalleCarta(ctx, await idDe(routeParams)), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request, routeParams) => {
  try {
    const id = await idDe(routeParams);
    const raw = await readOrgBody(ctx, request, { route: RUTA });
    const limpio =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
        : raw;
    const r = esquemaGuardarCarta.safeParse(limpio);
    if (!r.success) throw new ErrorCarta('peticion_invalida', 400, 'Revisa los datos de la carta.');
    const { porSede, ...carta } = r.data;
    // La carta implícita no tiene fila propia, pero su «Por sede» sí se guarda.
    await guardarCartaYSedes(ctx, id, carta, porSede);
    return NextResponse.json(await detalleCarta(ctx, id), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});

export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    const id = await idDe(routeParams);
    await readOrgBody(ctx, request, { route: RUTA });
    if (id === ID_CARTA_PRINCIPAL_IMPLICITA) throw new ErrorCarta('pendiente_migracion', 409, 'Las cartas por horario se activan con una actualización pendiente.');
    await eliminarCarta(ctx, id);
    return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
