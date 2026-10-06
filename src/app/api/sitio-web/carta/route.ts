/**
 * /api/sitio-web/carta — «Carta» (Figma B/13-01, 13-04, 13-06).
 *
 * GET  → cartas con horario, sedes, conteos y «Visible ahora» (de la RPC
 *        `get_public_menu`, la misma del sitio), el banner por sede, permisos y
 *        si la organización es restaurante.
 * POST { nombre, icono?, duplicarDe?, todasLasCategorias? } → `crear_carta`
 *        (una transacción) y devuelve `{ id }`.
 *
 * Organización de la sesión (`withOrg`); otra organización en la query o el
 * body → 403 registrado (`readOrgBody`). Escribe quien tiene
 * `website.sites.edit` (resuelto en la base).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { esquemaNuevaCarta } from '@/lib/website/carta';
import { ErrorCarta, crearCarta, listarCartas, respuestaErrorCarta } from '@/lib/website/carta.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/carta';

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    return NextResponse.json(await listarCartas(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});

export const POST = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody(ctx, request, { route: RUTA });
    const r = esquemaNuevaCarta.safeParse(sinClavesDeOrganizacion(raw));
    if (!r.success) throw new ErrorCarta('peticion_invalida', 400, 'Escribe el nombre de la carta.');
    const id = await crearCarta(ctx, r.data);
    return NextResponse.json({ id }, { status: 201, headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorCarta(error, RUTA, ctx.organizationId);
  }
});
