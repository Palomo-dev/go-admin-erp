/**
 * /api/facturas-venta/[id]/nota-credito
 *
 * GET  — lo que aún se puede acreditar por línea, el tope y los datos que el
 *        diálogo necesita (permiso `finance.void`, el mismo que emitir).
 * POST — emite la nota crédito en una transacción (`fn_nota_credito_emitir`):
 *        modos total · por líneas · por valor, tope por línea y global,
 *        reingreso de mercancía opcional, excedente sobre lo pagado como saldo a
 *        favor o devolución (efectivo solo con caja abierta). Si la factura fue
 *        aceptada por la DIAN, la nota se encola después en la cola única.
 *
 * La organización sale de la sesión; una en el cuerpo distinta → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorNota, solicitudNotaSchema } from '@/lib/finanzas/ventas/contratoNotaCredito';
import { contextoNota, emitirNotaCredito, ErrorNotaServidor } from '@/lib/services/ventas/notaCredito.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function idDe(routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  return typeof params.id === 'string' && UUID_RE.test(params.id) ? params.id : '';
}

function respuestaError(err: unknown) {
  if (err instanceof ErrorNotaServidor) {
    return NextResponse.json(
      { error: err.codigo, codigo: err.codigo, detalle: err.detalle ?? undefined },
      { status: estadoHttpErrorNota(err.codigo), headers: SIN_CACHE },
    );
  }
  throw err;
}

export const GET = withOrg(async (ctx, _req, routeParams) => {
  const id = await idDe(routeParams);
  if (!id) return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json({ contexto: await contextoNota(ctx, id) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta/[id]/nota-credito' });
  const id = await idDe(routeParams);
  if (!id) return NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = solicitudNotaSchema.safeParse(candidato);
  if (!parsed.success) {
    const primero = parsed.error.issues[0]?.message;
    const codigo = primero && /^[a-z_]+$/.test(primero) ? primero : 'datos_invalidos';
    return NextResponse.json({ error: 'Datos inválidos', codigo }, { status: 400, headers: SIN_CACHE });
  }
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[facturas-venta/nota-credito] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const resultado = await emitirNotaCredito(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});
