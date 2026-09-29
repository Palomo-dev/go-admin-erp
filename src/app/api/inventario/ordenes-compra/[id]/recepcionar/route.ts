/**
 * POST /api/inventario/ordenes-compra/[id]/recepcionar — recibe mercancía de
 * una orden de compra (inventario B8) en UNA transacción: `fn_oc_recepcionar`
 * (cantidades con guarda de sobre-recepción, lotes con vencimiento, seriales,
 * kardex por la primitiva, estado de la OC y factura de compra al completarla).
 * `[id]` es el uuid de la orden. Con la misma `clave` no se recibe dos veces.
 *
 * - Sin sesión: 401. La organización sale de la sesión (regla dura 5): una
 *   ajena en el cuerpo o en la query es 403 registrado, sin RPC.
 * - Permiso `recibir` (P6: inventory.create o inventory_management) resuelto
 *   en el servidor con fn_inventario_permisos (regla 6); la RPC lo vuelve a
 *   exigir. Una OC de otra organización es 404 (no se distingue de «no existe»).
 * - Ninguna tabla se escribe desde aquí: todo es la RPC con la sesión (RLS).
 */
import { NextResponse } from 'next/server';
import { withOrg, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import {
  ErrorRecepcionOrdenCompra,
  codigoErrorRecepcionOC,
  detalleErrorRecepcionOC,
  estadoHttpErrorRecepcionOC,
  recepcionSchema,
  type ResultadoRecepcionOC,
} from '@/lib/services/inventario/recepcionOrdenCompra';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/inventario/ordenes-compra/[id]/recepcionar';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParamsRuta = { params: Promise<Record<string, string | string[] | undefined>> } | undefined;

async function uuidDeRuta(routeParams: ParamsRuta): Promise<string> {
  const p = routeParams ? await routeParams.params : {};
  const v = Array.isArray(p.id) ? p.id[0] : p.id;
  if (!v || !UUID_RE.test(v)) throw new ErrorRecepcionOrdenCompra('orden_no_encontrada');
  return v.toLowerCase();
}

function sinClavesDeOrganizacion(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw ?? {};
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)));
}

async function puedeRecibir(ctx: ServerOrgContext): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('fn_inventario_permisos', { p_org: ctx.organizationId });
  if (error || !data) return false; // un error nunca es «todo permitido»
  return (data as Record<string, unknown>).recibir === true;
}

function respuestaError(err: unknown): Response {
  if (err instanceof ErrorRecepcionOrdenCompra) {
    return NextResponse.json(
      { error: err.codigo, codigo: err.codigo, detalle: err.detalle },
      { status: estadoHttpErrorRecepcionOC(err.codigo), headers: SIN_CACHE },
    );
  }
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, codigo: err.code, code: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  return routeErrorResponse(RUTA, err);
}

export const POST = withOrg(async (ctx, req, routeParams) => {
  try {
    const uuid = await uuidDeRuta(routeParams);
    const raw: unknown = await readOrgBody(ctx, req, { route: RUTA });
    const cuerpo = recepcionSchema.safeParse(sinClavesDeOrganizacion(raw));
    if (!cuerpo.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', codigo: 'datos_invalidos', campos: cuerpo.error.issues.map((i) => i.path.join('.')) },
        { status: 400, headers: SIN_CACHE },
      );
    }

    if (!(await puedeRecibir(ctx))) {
      console.warn('[recepcion-oc] sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
      throw new ErrorRecepcionOrdenCompra('sin_permiso');
    }

    const { data, error } = await ctx.supabase.rpc('fn_oc_recepcionar', {
      p_org: ctx.organizationId,
      p_po_uuid: uuid,
      p_lineas: cuerpo.data.lineas,
      p_clave_idempotencia: cuerpo.data.clave,
      p_notas: cuerpo.data.notas ?? null,
    });
    if (error) {
      const codigo = codigoErrorRecepcionOC(error);
      if (codigo === 'error_desconocido') console.error('[recepcion-oc] fn_oc_recepcionar falló', { message: error.message, code: error.code });
      else if (codigo === 'sin_permiso' || codigo === 'sucursal_sin_acceso') {
        console.warn('[recepcion-oc] acceso denegado', { codigo, organizationId: ctx.organizationId, userId: ctx.userId });
      }
      throw new ErrorRecepcionOrdenCompra(codigo, detalleErrorRecepcionOC(error.details));
    }
    return NextResponse.json(data as ResultadoRecepcionOC, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(err);
  }
});
