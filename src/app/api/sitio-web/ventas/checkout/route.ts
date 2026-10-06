/**
 * PUT /api/sitio-web/ventas/checkout — opciones del checkout del sitio (lo
 * único que se edita en «Ventas en línea», B/10-04 nota 1). Reemplaza la
 * escritura desde el navegador de BrandingCheckoutTab.
 *
 * Cuerpo (todos opcionales, lista blanca): modo, tiposEntrega, invitado,
 * pedidoMinimo, sellos, listaSellos, logosPago, ventaEnLinea, envioActivo,
 * tarifaPlana, envioGratisDesde. Cualquier otra clave → 400.
 *
 * Organización de la sesión (`withOrg` + `readOrgBody`: una organización
 * ajena en el body → 403 y registro). Permiso `website.sites.edit`.
 * Devuelve el tablero ya recalculado.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError, ORG_BODY_KEYS } from '@/lib/utils/orgContext';
import { ErrorVentas, guardarCheckout, leerVentasSitio, respuestaErrorVentas } from '@/lib/website/ventasSitio.server';
import { validarCambiosCheckout } from '@/components/sitio-web/ventas/estadoVentas';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

export const PUT = withOrg(async (ctx, request) => {
  try {
    const raw = await readOrgBody(ctx, request, { route: 'sitio-web/ventas/checkout' });
    const v = validarCambiosCheckout(sinClavesDeOrganizacion(raw));
    if (!v.ok) throw new ErrorVentas('peticion_invalida', 400, 'Revisa los datos del checkout.', v.campos);
    await guardarCheckout(ctx, v.cambios);
    return NextResponse.json(await leerVentasSitio(ctx), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof OrgContextError) throw error;
    return respuestaErrorVentas(error, 'sitio-web/ventas/checkout', ctx.organizationId);
  }
});
