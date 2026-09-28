/**
 * POST /api/notas-credito/[id]/anular — anula una nota crédito de venta con
 * motivo, en una transacción (`fn_nota_credito_anular`): saldo a favor sin
 * usar, devolución (fn_anular_pago), contra-asiento e inventario; el saldo de
 * la factura lo recalcula el disparador de notas. Antes lo hacía el navegador
 * sin permiso y reescribía el saldo de la factura a mano (lo sumaba dos veces).
 *
 * Permiso `finance.void` aquí y en la base. Organización de la sesión: una
 * nota de otra organización → 404. Una nota aceptada por la DIAN → 409 (se
 * corrige con una nota débito). Idempotente: anularla otra vez devuelve
 * `yaAnulada`. El error sale con su código y el texto en el idioma del usuario.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import {
  anulacionNotaSchema,
  estadoHttpErrorAnularNota,
  type ErrorAnularNota,
} from '@/lib/finanzas/ventas/contratoNotaCredito';
import { anularNotaCredito, ErrorAnularNotaServidor } from '@/lib/services/ventas/notaCredito.server';
import { idiomaDelUsuario, traductorFinanzas } from '@/lib/finanzas/textosServidor.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = ServerOrgContext;

async function error(ctx: Ctx, codigo: ErrorAnularNota): Promise<Response> {
  let mensaje: string = codigo;
  try {
    const t = await traductorFinanzas('documentosVenta', await idiomaDelUsuario(ctx));
    mensaje = t(`notaCreditoAnular.errores.${codigo}`);
  } catch {
    /* sin textos: el código */
  }
  return NextResponse.json({ error: mensaje, codigo }, { status: estadoHttpErrorAnularNota(codigo), headers: SIN_CACHE });
}

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/notas-credito/[id]/anular' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return error(ctx, 'nota_no_encontrada');
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = anulacionNotaSchema.safeParse(candidato);
  if (!parsed.success) return error(ctx, 'motivo_obligatorio');
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[notas-credito/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return error(ctx, 'sin_permiso');
  }
  try {
    const resultado = await anularNotaCredito(ctx, id, parsed.data.motivo);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnularNotaServidor) return error(ctx, err.codigo);
    throw err;
  }
});
