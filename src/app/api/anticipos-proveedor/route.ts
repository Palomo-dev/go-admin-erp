/**
 * /api/anticipos-proveedor
 *
 * GET — anticipos a proveedores de la organización de la sesión, con lo
 * aplicado (Figma `2335:140495`). Lectura con el cliente de la sesión (RLS por
 * pertenencia). Sin la migración 20261108120000: `{ pendiente: true }`.
 * Permiso `finance.view`.
 *
 * POST — registra un anticipo con su NATURALEZA (obligatoria) y las retenciones
 * que la base evalúa (P1): lo girado sale como un pago real (comprobante CE,
 * payments y caja abierta si es efectivo) y el bruto queda a favor en la cuenta
 * de detalle configurada (P6; sin ella, 409 `cuenta_anticipos_no_configurada`),
 * en UNA RPC (`fn_anticipo_proveedor_registrar`) con el cliente de la sesión.
 * Permiso `finance.create`.
 *
 * La organización es la de la sesión (`withOrg`); otra en el body o la query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { crearAnticipoSchema } from '@/lib/finanzas/anticiposProveedor/contrato';
import { sinClavesDeOrganizacion } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  crearAnticipo,
  ErrorAnticipoServidor,
  listarAnticipos,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/anticipos-proveedor' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorAnticipo('sin_permiso');
  try {
    return NextResponse.json(await listarAnticipos(ctx), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo);
    throw err;
  }
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/anticipos-proveedor' });
  const parsed = crearAnticipoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => i.path.join('.'));
    // P1: la naturaleza no tiene valor por defecto; el pago anticipado exige la tarifa de IVA de la operación.
    if (campos.includes('naturaleza')) return respuestaErrorAnticipo('naturaleza_obligatoria');
    if (campos.includes('tarifa_iva')) return respuestaErrorAnticipo('tarifa_iva_obligatoria');
    return respuestaErrorAnticipo('datos_invalidos', campos);
  }

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[anticipos-proveedor] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorAnticipo('sin_permiso');
  }

  try {
    const resultado = await crearAnticipo(ctx, parsed.data);
    return NextResponse.json({ resultado }, { status: resultado.repetida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo, err.detalle);
    throw err;
  }
});
