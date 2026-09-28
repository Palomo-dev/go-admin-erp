/**
 * POST   /api/cartera/[id]/cuotas — crea (o reemplaza, si ninguna cuota tiene
 *        abonos) el plan de cuotas: `fn_cxc_crear_plan_cuotas`. El capital debe
 *        sumar el saldo de la cuenta.
 * DELETE /api/cartera/[id]/cuotas — elimina el plan sin abonos.
 *
 * Pagar una cuota es el pago único (`POST /api/pagos` con `cuota_id`), no esta
 * ruta. Permiso `finance.create`, aquí y en la base. Mismo contrato que
 * `/api/cuentas-por-pagar/[id]/cuotas`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { crearPlanCuotas, eliminarPlanCuotas, ErrorCuotasServidor } from '@/lib/services/cartera/cuentasPorCobrar.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const planSchema = z
  .object({
    cuotas: z
      .array(
        z
          .object({
            vence: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            capital: z.number().finite().min(0),
            interes: z.number().finite().min(0).optional(),
            valor: z.number().finite().positive(),
          })
          .strict(),
      )
      .min(1)
      .max(120),
  })
  .strict();

function estado(codigo: string): number {
  if (codigo === 'cuenta_no_encontrada') return 404;
  if (codigo === 'sin_permiso' || codigo === 'sin_acceso_sucursal') return 403;
  if (codigo === 'error_desconocido') return 500;
  return 422;
}

async function idDe(routeParams?: { params: Promise<Record<string, string | string[] | undefined>> }): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  return typeof params.id === 'string' && UUID_RE.test(params.id) ? params.id : '';
}

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cartera/[id]/cuotas' });
  const id = await idDe(routeParams);
  if (!id) return NextResponse.json({ error: 'Cuenta no encontrada', codigo: 'cuenta_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  const candidato =
    typeof raw === 'object' && raw !== null ? Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k))) : raw;
  const parsed = planSchema.safeParse(candidato);
  if (!parsed.success) return NextResponse.json({ error: 'Cuotas inválidas', codigo: 'cuotas_invalidas' }, { status: 400, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const n = await crearPlanCuotas(ctx, id, parsed.data.cuotas);
    return NextResponse.json({ resultado: { cuotas: n } }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCuotasServidor) return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estado(err.codigo), headers: SIN_CACHE });
    throw err;
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'DELETE /api/cartera/[id]/cuotas' });
  const id = await idDe(routeParams);
  if (!id) return NextResponse.json({ error: 'Cuenta no encontrada', codigo: 'cuenta_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    const n = await eliminarPlanCuotas(ctx, id);
    return NextResponse.json({ resultado: { eliminadas: n } }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCuotasServidor) return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estado(err.codigo), headers: SIN_CACHE });
    throw err;
  }
});
