/**
 * POST /api/dinero-terceros/categorias — crea las categorías de tesorería de
 * recaudos que falten («Recaudos para terceros» de ingreso y «Pago de recaudos
 * a terceros» de egreso) con la cuenta de recaudos, para que el formulario
 * único de Movimientos registre y liquide con esa cuenta. Misma alta que la
 * pantalla de Categorías de tesorería (RLS y su disparador validan).
 *
 * Body: `{ ingreso: string, egreso: string }` (los nombres en el idioma de la
 * persona). Permiso `finance.create`. Organización de la sesión; otra en el
 * body → 403.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { asegurarCategoriasRecaudo, ErrorDineroTerceros } from '@/lib/services/dineroTerceros/dineroTerceros.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const esquema = z.object({ ingreso: z.string().trim().min(3).max(80), egreso: z.string().trim().min(3).max(80) }).strict();

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/dinero-terceros/categorias' });
  const parsed = esquema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[dinero-terceros/categorias] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json({ categorias: await asegurarCategoriasRecaudo(ctx, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorDineroTerceros) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: 500, headers: SIN_CACHE });
    }
    throw err;
  }
});
