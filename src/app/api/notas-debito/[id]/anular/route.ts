/**
 * POST /api/notas-debito/[id]/anular — anula una nota débito con motivo
 * (`fn_nota_debito_anular`): bloquea si la DIAN la aceptó, si está en envío o
 * si tiene pagos; los disparadores revierten el asiento y la cartera.
 * Permiso `finance.void` aquí y en la base. Organización de la sesión: una nota
 * ajena → 404. Mientras la migración no esté aplicada: 501 `nota_debito_no_disponible`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { anulacionNotaDebitoSchema, estadoHttpErrorNotaDebito } from '@/lib/finanzas/notas/contratoNotas';
import { anularNotaDebito, ErrorNotaDebitoServidor } from '@/lib/services/ventas/notas.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/notas-debito/[id]/anular' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Nota no encontrada', codigo: 'nota_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  const candidato =
    typeof raw === 'object' && raw !== null
      ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
      : raw;
  const parsed = anulacionNotaDebitoSchema.safeParse(candidato);
  if (!parsed.success) return NextResponse.json({ error: 'Motivo obligatorio', codigo: 'motivo_obligatorio' }, { status: 400, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.void'))) {
    console.warn('[notas-debito/anular] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json({ resultado: await anularNotaDebito(ctx, id, parsed.data.motivo) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorNotaDebitoServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estadoHttpErrorNotaDebito(err.codigo), headers: SIN_CACHE });
    }
    throw err;
  }
});
