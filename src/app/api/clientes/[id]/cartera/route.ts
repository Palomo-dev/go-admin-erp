/**
 * GET /api/clientes/[id]/cartera — cabecera de la «Cartera del cliente»
 * (Figma X2 `740:51004`): nombre, documento, correo y saldo a favor disponible
 * (`credit_notes` activas). Las cuentas abiertas y los tramos salen de
 * `GET /api/cartera?cliente=<id>`. `finance.view`, o `pos.view` con `?origen=pos`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/clientes/[id]/cartera' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Cliente no encontrado', codigo: 'cliente_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const pos = new URL(req.url).searchParams.get('origen') === 'pos';
  const puede = (await hasOrgAdminOrPermission(ctx, 'finance.view')) || (pos && (await hasOrgAdminOrPermission(ctx, 'pos.view')));
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }

  const [clienteRes, creditosRes] = await Promise.all([
    ctx.supabase
      .from('customers')
      .select('id, full_name, doc_type, doc_number, email, phone')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle(),
    ctx.supabase
      .from('credit_notes')
      .select('balance')
      .eq('organization_id', ctx.organizationId)
      .eq('customer_id', id)
      .eq('status', 'active')
      .gt('balance', 0),
  ]);
  const c = clienteRes.data as { id: string; full_name: string | null; doc_type: string | null; doc_number: string | null; email: string | null; phone: string | null } | null;
  if (!c) {
    return NextResponse.json({ error: 'Cliente no encontrado', codigo: 'cliente_no_encontrado' }, { status: 404, headers: SIN_CACHE });
  }
  const saldoAFavor = ((creditosRes.data ?? []) as { balance: number | string | null }[]).reduce((s, r) => s + (Number(r.balance) || 0), 0);
  return NextResponse.json(
    {
      cliente: {
        id: c.id,
        nombre: c.full_name,
        documento: [c.doc_type, c.doc_number].filter(Boolean).join(' ') || null,
        email: c.email,
        telefono: c.phone,
      },
      saldoAFavor,
    },
    { headers: SIN_CACHE },
  );
});
