/**
 * /api/facturas-venta/[id]/nota-debito
 *
 * GET  — lo que el diálogo necesita: la factura (número, cliente, saldo, si la
 *        DIAN la aceptó), los impuestos de la organización y si la nota débito
 *        ya está disponible (migración 20261108030000 aplicada). `finance.create`.
 * POST — emite la nota débito en una transacción (`fn_nota_debito_emitir`):
 *        número de la numeración de notas débito, líneas con el impuesto
 *        resuelto en el servidor, cuenta por cobrar propia y asiento por los
 *        disparadores. Idempotente por clave. Mientras la función no exista:
 *        501 `nota_debito_no_disponible`, sin escribir nada.
 *
 * Sustituye a POST /api/factus/debit-note (501), que enviaba ítems crudos a la
 * DIAN sin un documento detrás. La organización sale de la sesión; una en el
 * cuerpo distinta → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorNotaDebito, solicitudNotaDebitoSchema } from '@/lib/finanzas/notas/contratoNotas';
import { contextoNotaDebito, emitirNotaDebito, ErrorNotaDebitoServidor } from '@/lib/services/ventas/notas.server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function idDe(routeParams: { params: Promise<Record<string, string | string[] | undefined>> } | undefined): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  return typeof params.id === 'string' && UUID_RE.test(params.id) ? params.id : '';
}

const noEncontrada = () =>
  NextResponse.json({ error: 'Factura no encontrada', codigo: 'factura_no_encontrada' }, { status: 404, headers: SIN_CACHE });
const sinPermiso = () => NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });

function respuestaError(err: unknown) {
  if (err instanceof ErrorNotaDebitoServidor) {
    return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorNotaDebito(err.codigo), headers: SIN_CACHE });
  }
  throw err;
}

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/facturas-venta/[id]/nota-debito' });
  const id = await idDe(routeParams);
  if (!id) return noEncontrada();
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return sinPermiso();
  try {
    return NextResponse.json({ contexto: await contextoNotaDebito(ctx, id) }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/facturas-venta/[id]/nota-debito' });
  const id = await idDe(routeParams);
  if (!id) return noEncontrada();
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = solicitudNotaDebitoSchema.safeParse(candidato);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[facturas-venta/nota-debito] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return sinPermiso();
  }
  try {
    const resultado = await emitirNotaDebito(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});
