/**
 * GET /api/pagos/contexto — lo que necesita el diálogo único de pago antes de
 * abrir: documentos abiertos (uno, o todos los del cliente para el reparto),
 * cuotas, métodos de la organización, cuentas bancarias, caja abierta y el día
 * de hoy en la zona de la sucursal del documento.
 *
 * Query: `direccion=cobro` y `documento` + `id`, o `cliente=<uuid>`.
 * Lectura con el cliente de la sesión (RLS) y filtrada por la organización de
 * la sesión. Ver: `finance.view` o `pos.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { estadoHttpErrorPago, DOCUMENTOS_COBRO, DOCUMENTOS_PAGO, type DocumentoPago } from '@/lib/finanzas/pagos/contrato';
import { contextoPago, ErrorPagoServidor } from '@/lib/services/pagos/pagos.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENTOS: readonly string[] = [...DOCUMENTOS_COBRO, ...DOCUMENTOS_PAGO];

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/pagos/contexto' });
  const url = new URL(req.url);
  const direccion = url.searchParams.get('direccion') === 'pago' ? 'pago' : 'cobro';
  const documento = url.searchParams.get('documento');
  const id = url.searchParams.get('id');
  const cliente = url.searchParams.get('cliente');

  const valido =
    (documento && DOCUMENTOS.includes(documento) && id && UUID_RE.test(id)) || (cliente && UUID_RE.test(cliente));
  if (!valido) {
    return NextResponse.json({ error: 'Parámetros inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }

  const puedeVer = (await hasOrgAdminOrPermission(ctx, 'finance.view')) || (await hasOrgAdminOrPermission(ctx, 'pos.view'));
  if (!puedeVer) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  try {
    const contexto = await contextoPago(ctx, {
      direccion,
      documento: (documento as DocumentoPago | null) ?? undefined,
      id: id ?? undefined,
      customerId: cliente ?? undefined,
    });
    return NextResponse.json(contexto, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorPagoServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorPago(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
