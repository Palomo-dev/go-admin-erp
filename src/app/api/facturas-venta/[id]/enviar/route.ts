/**
 * POST /api/facturas-venta/[id]/enviar — envía la factura por correo con el PDF
 * del motor de documentos adjunto (canal transaccional del CRM, registro en
 * `email_messages` con `related_type = 'invoice_sales'`). Antes era un aviso.
 *
 * `para` es opcional: por defecto el correo del cliente de la factura.
 * Permiso `finance.view` (enviar un documento no cambia nada). Organización
 * de la sesión; factura de otra organización → 404.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { detalleFactura, ErrorFacturaServidor } from '@/lib/services/ventas/facturasVenta.server';
import { estadoHttpErrorFactura } from '@/lib/finanzas/ventas/contratoFacturas';
import { enviarDocumentoPorCorreo, ErrorEnvioServidor, escaparHtml } from '@/lib/services/finanzas/enviarDocumento.server';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';
import { formatMoneda } from '@/lib/utils/moneda';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cuerpoSchema = z
  .object({
    para: z.string().trim().email().max(200).optional(),
    mensaje: z.string().max(2000).nullable().optional(),
    idioma: z.enum(['es', 'en', 'fr', 'pt']).optional(),
    clave: z.string().min(8).max(200).optional(),
  })
  .strict();

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta/[id]/enviar' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  const candidato =
    typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k))) : raw;
  const parsed = cuerpoSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  let detalle;
  try {
    detalle = await detalleFactura(ctx, id);
  } catch (err) {
    if (err instanceof ErrorFacturaServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorFactura(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
  const para = parsed.data.para ?? detalle.cliente?.email?.trim() ?? '';
  if (!para) {
    return NextResponse.json({ error: 'El cliente no tiene correo', codigo: 'cliente_sin_correo' }, { status: 422, headers: SIN_CACHE });
  }
  if (detalle.factura.estado === 'draft') {
    return NextResponse.json({ error: 'La factura está en borrador', codigo: 'factura_borrador' }, { status: 409, headers: SIN_CACHE });
  }

  const idioma = await idiomaDelUsuario(ctx, parsed.data.idioma);
  const t = await traductorFinanzas('facturasVenta', idioma);
  const numero = detalle.factura.numero ?? '';
  const total = detalle.factura.moneda ? formatMoneda(detalle.factura.total, detalle.factura.moneda) : String(detalle.factura.total);
  const nota = parsed.data.mensaje?.trim() ?? '';
  const html = [
    `<p>${escaparHtml(t('correo.saludo', { nombre: detalle.cliente?.nombre ?? '' }))}</p>`,
    `<p>${escaparHtml(t('correo.cuerpo', { organizacion: ctx.organizationName, numero, total }))}</p>`,
    nota ? `<p>${escaparHtml(nota).replace(/\n/g, '<br>')}</p>` : '',
    `<p>${escaparHtml(t('correo.despedida', { organizacion: ctx.organizationName }))}</p>`,
  ].join('');

  try {
    const r = await enviarDocumentoPorCorreo(ctx, {
      tipo: 'factura-venta',
      id,
      para,
      customerId: detalle.cliente?.id ?? null,
      asunto: t('correo.asunto', { organizacion: ctx.organizationName, numero }),
      html,
      relatedType: 'invoice_sales',
      relatedId: id,
      idioma,
      claveCliente: parsed.data.clave ?? null,
    });
    return NextResponse.json({ resultado: { enviado: true, destino: para, adjunto: r.adjunto } }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorEnvioServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'error_desconocido' ? 500 : 422, headers: SIN_CACHE });
    }
    throw err;
  }
});
