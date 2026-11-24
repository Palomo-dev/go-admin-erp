/**
 * /api/sitio-web/ventas/contraentrega — «Pago contra entrega» de Ventas en línea (Figma «05 POS
 * y ventas» 01–03, aprobado 2026-11-24).
 *
 * GET               → método Efectivo, sedes, condiciones por sede, zonas, pasarelas, categorías.
 * GET ?buscar=texto → productos para «Agregar categoría o producto» (máx. 20).
 * PUT { branchId, condiciones | null } → guarda (o quita) las condiciones de esa sede.
 *
 * La organización sale de la sesión (`withOrg`); otra en la query o el body → 403 y registro
 * (`readOrgBody`). Permiso `website.sites.edit` resuelto en la base. Lista blanca del cuerpo en
 * `leerCuerpoCondiciones` (cualquier otra clave → 400).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { ErrorVentas, respuestaErrorVentas } from '@/lib/website/ventasSitio.server';
import { buscarProductosContraentrega, guardarContraentrega, leerContraentrega } from '@/lib/website/contraentregaSitio.server';
import { leerCuerpoCondiciones } from '@/lib/contraentrega/condicionesWeb';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const RUTA = 'sitio-web/ventas/contraentrega';

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    const buscar = new URL(request.url).searchParams.get('buscar');
    if (buscar !== null) {
      return NextResponse.json({ productos: await buscarProductosContraentrega(ctx, buscar) }, { headers: SIN_CACHE });
    }
    return NextResponse.json(await leerContraentrega(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorVentas(error, RUTA, ctx.organizationId);
  }
});

export const PUT = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody(ctx, request, { route: RUTA });
    const v = leerCuerpoCondiciones(sinClavesDeOrganizacion(raw));
    if (!v.ok) throw new ErrorVentas('peticion_invalida', 400, 'Revisa las condiciones de la contraentrega.', v.campos);
    await guardarContraentrega(ctx, v.branchId, v.condiciones);
    return NextResponse.json(await leerContraentrega(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorVentas(error, RUTA, ctx.organizationId);
  }
});
