/**
 * POST /api/clientes/[id]/estado-cuenta/enviar — envía por correo el estado de
 * cuenta del cliente (PDF del motor de documentos, `estado-cuenta`, con el
 * periodo pedido y el texto legal configurable de la organización). Descargarlo
 * es `GET /api/documentos/estado-cuenta/<cliente>?desde&hasta`.
 *
 * Permiso `finance.view` (o `pos.view` con `origen: 'pos'`). Cliente de otra
 * organización → 404.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { enviarDocumentoPorCorreo, ErrorEnvioServidor, escaparHtml } from '@/lib/services/finanzas/enviarDocumento.server';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const cuerpoSchema = z
  .object({
    para: z.string().trim().email().max(200).optional(),
    desde: DIA.nullable().optional(),
    hasta: DIA.nullable().optional(),
    mensaje: z.string().max(2000).nullable().optional(),
    idioma: z.enum(['es', 'en', 'fr', 'pt']).optional(),
    origen: z.enum(['pos', 'finanzas']).optional(),
  })
  .strict();

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/clientes/[id]/estado-cuenta/enviar' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Cliente no encontrado', codigo: 'cliente_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const candidato =
    typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k))) : raw;
  const parsed = cuerpoSchema.safeParse(candidato);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const pos = parsed.data.origen === 'pos';
  const puede = (await hasOrgAdminOrPermission(ctx, 'finance.view')) || (pos && (await hasOrgAdminOrPermission(ctx, 'pos.view')));
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  const { data: cliente } = await ctx.supabase
    .from('customers')
    .select('id, full_name, email')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!cliente) {
    return NextResponse.json({ error: 'Cliente no encontrado', codigo: 'cliente_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const c = cliente as { id: string; full_name: string | null; email: string | null };
  const para = parsed.data.para ?? c.email?.trim() ?? '';
  if (!para) {
    return NextResponse.json({ error: 'El cliente no tiene correo', codigo: 'cliente_sin_correo' }, { status: 422, headers: SIN_CACHE });
  }

  const idioma = await idiomaDelUsuario(ctx, parsed.data.idioma);
  const t = await traductorFinanzas('cartera', idioma);
  const nota = parsed.data.mensaje?.trim() ?? '';
  const html = [
    `<p>${escaparHtml(t('correo.saludo', { nombre: c.full_name ?? '' }))}</p>`,
    `<p>${escaparHtml(t('correo.estadoCuenta', { organizacion: ctx.organizationName }))}</p>`,
    nota ? `<p>${escaparHtml(nota).replace(/\n/g, '<br>')}</p>` : '',
    `<p>${escaparHtml(t('correo.despedida', { organizacion: ctx.organizationName }))}</p>`,
  ].join('');

  try {
    const r = await enviarDocumentoPorCorreo(ctx, {
      tipo: 'estado-cuenta',
      id,
      para,
      customerId: id,
      asunto: t('correo.asuntoEstadoCuenta', { organizacion: ctx.organizationName }),
      html,
      relatedType: 'customer',
      relatedId: id,
      idioma,
      desde: parsed.data.desde ?? null,
      hasta: parsed.data.hasta ?? null,
    });
    return NextResponse.json({ resultado: { enviado: true, destino: para, adjunto: r.adjunto } }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorEnvioServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'error_desconocido' ? 500 : 422, headers: SIN_CACHE });
    }
    throw err;
  }
});
