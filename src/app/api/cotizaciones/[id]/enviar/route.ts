/**
 * POST /api/cotizaciones/[id]/enviar — { para?, mensaje?, idioma?, clave? }
 * envía la cotización por correo con el PDF del motor de documentos (tipo
 * 'cotizacion', `enviarDocumentoPorCorreo`: canal transaccional del CRM y
 * registro en `email_messages` con related_type 'quotations') y marca como
 * enviada una cotización en borrador. Antes el botón «Email» mostraba que la
 * había enviado sin enviar nada.
 *
 * `para` es opcional: por defecto el correo del cliente. Permiso
 * finance.create o sales_management (cambia el estado). Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { enviarCotizacionSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { enviarCotizacion, ErrorCotizacionServidor } from '@/lib/services/ventas/cotizaciones.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cotizaciones/[id]/enviar' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  const parsed = enviarCotizacionSchema.safeParse(sinClavesDeOrganizacion(raw ?? {}));
  if (!parsed.success) return errorCotizacion(ctx, 'datos_invalidos');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'POST /api/cotizaciones/[id]/enviar');
  try {
    return NextResponse.json({ resultado: await enviarCotizacion(ctx, id, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});
