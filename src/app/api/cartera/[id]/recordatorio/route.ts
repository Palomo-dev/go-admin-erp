/**
 * POST /api/cartera/[id]/recordatorio — envía un recordatorio de cobro por
 * correo (canal transaccional del CRM) con el estado de cuenta del cliente en
 * PDF (motor de documentos) y lo registra en `ar_reminders`
 * (`fn_cxc_registrar_recordatorio`, que también pone `last_reminder_date`).
 * Antes el envío era simulado.
 *
 * Permiso `finance.create` (o `pos.create` con `origen: 'pos'`), aquí y en la
 * base. Organización de la sesión; cuenta de otra organización → 404.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { detalleCuenta, ErrorCarteraServidor, registrarRecordatorio } from '@/lib/services/cartera/cuentasPorCobrar.server';
import { enviarDocumentoPorCorreo, ErrorEnvioServidor, escaparHtml } from '@/lib/services/finanzas/enviarDocumento.server';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';
import { formatMoneda } from '@/lib/utils/moneda';
import { formatDateInTz } from '@/lib/utils/dateDisplay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cuerpoSchema = z
  .object({
    canal: z.literal('correo'),
    mensaje: z.string().max(2000).nullable().optional(),
    origen: z.enum(['pos', 'finanzas']).optional(),
    idioma: z.enum(['es', 'en', 'fr', 'pt']).optional(),
  })
  .strict();

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cartera/[id]/recordatorio' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Cuenta no encontrada', codigo: 'cuenta_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  const candidato =
    typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k))) : raw;
  const parsed = cuerpoSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const pos = parsed.data.origen === 'pos';
  const puede = (await hasOrgAdminOrPermission(ctx, 'finance.create')) || (pos && (await hasOrgAdminOrPermission(ctx, 'pos.create')));
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  let detalle;
  try {
    detalle = await detalleCuenta(ctx, id);
  } catch (err) {
    if (err instanceof ErrorCarteraServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'cuenta_no_encontrada' ? 404 : 500, headers: SIN_CACHE });
    }
    throw err;
  }
  const para = detalle.cliente?.email?.trim() ?? '';
  if (!detalle.cliente || !para) {
    return NextResponse.json({ error: 'El cliente no tiene correo', codigo: 'cliente_sin_correo' }, { status: 422, headers: SIN_CACHE });
  }
  if (detalle.cuenta.saldo <= 0) {
    return NextResponse.json({ error: 'La cuenta no tiene saldo', codigo: 'cuenta_sin_saldo' }, { status: 409, headers: SIN_CACHE });
  }

  const idioma = await idiomaDelUsuario(ctx, parsed.data.idioma);
  const t = await traductorFinanzas('cartera', idioma);
  // Moneda del documento (o la base de la organización) y zona de la sucursal de la cuenta.
  const monto = detalle.cuenta.moneda ? formatMoneda(detalle.cuenta.saldo, detalle.cuenta.moneda) : String(detalle.cuenta.saldo);
  const { data: zona } = await ctx.supabase.rpc('fn_timezone_for', { p_organization_id: ctx.organizationId, p_branch_id: detalle.cuenta.branchId });
  const vence = detalle.cuenta.vencimiento && typeof zona === 'string' ? formatDateInTz(detalle.cuenta.vencimiento, zona) : '—';
  const numero = detalle.factura?.numero ?? '';
  const nota = parsed.data.mensaje?.trim() ?? '';
  const html = [
    `<p>${escaparHtml(t('correo.saludo', { nombre: detalle.cliente.nombre ?? '' }))}</p>`,
    `<p>${escaparHtml(t('correo.recordatorio', { organizacion: ctx.organizationName, numero, saldo: monto, vence }))}</p>`,
    nota ? `<p>${escaparHtml(nota).replace(/\n/g, '<br>')}</p>` : '',
    `<p>${escaparHtml(t('correo.adjunto'))}</p>`,
    `<p>${escaparHtml(t('correo.despedida', { organizacion: ctx.organizationName }))}</p>`,
  ].join('');

  try {
    const r = await enviarDocumentoPorCorreo(ctx, {
      tipo: 'estado-cuenta',
      id: detalle.cliente.id,
      para,
      customerId: detalle.cliente.id,
      asunto: t('correo.asuntoRecordatorio', { organizacion: ctx.organizationName, numero }),
      html,
      relatedType: 'account_receivable',
      relatedId: id,
      idioma,
    });
    await registrarRecordatorio(ctx, { id, estado: 'enviado', destino: para, mensaje: nota || null, emailMessageId: r.emailMessageId, error: null });
    return NextResponse.json({ resultado: { enviado: true, destino: para, adjunto: r.adjunto } }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorEnvioServidor) {
      await registrarRecordatorio(ctx, { id, estado: 'fallido', destino: para, mensaje: nota || null, emailMessageId: null, error: err.codigo });
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'error_desconocido' ? 500 : 422, headers: SIN_CACHE });
    }
    throw err;
  }
});
