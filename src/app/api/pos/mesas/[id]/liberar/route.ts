/**
 * /api/pos/mesas/[id]/liberar — liberar una mesa resolviendo antes su saldo.
 *
 * GET  → resumen para el diálogo (mesa, mesero, tiempo abierta, cocina sin
 *        entregar, total, pagado, saldo, cliente) + qué opciones hay y por qué
 *        no está cada una (`decidirLiberacion`).
 * POST → `{ accion: 'liberar' | 'cartera' | 'anular', motivo? }`. Valida con la
 *        misma decisión y llama a `pos_mesa_liberar`, que en UNA transacción
 *        resuelve el saldo (cartera vía `pos_checkout_v1`, anulación) y solo
 *        después cierra la sesión y suelta la mesa.
 *
 * - La organización sale de la sesión (`getServerOrgContext`); una organización
 *   ajena en la query o el body → 403 `FOREIGN_ORGANIZATION` y registro.
 * - Anular exige `pos.void` (o administración), resuelto aquí con
 *   `hasOrgAdminOrPermission`: nunca por el nombre del rol ni por un valor del
 *   cliente. Un intento sin permiso → 403 y registro.
 * - Las RPC solo las ejecuta `service_role` (se revocaron a `authenticated`):
 *   así nadie las llama por PostgREST saltándose la comprobación de permiso.
 *   Van con la organización y el actor YA validados, y la base vuelve a
 *   comprobar pertenencia y que la mesa y la venta sean de la organización.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, hasOrgAdminOrPermission, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  decidirLiberacion,
  errorDeRpc,
  MOTIVO_MAX,
  validarAccion,
  type PermisosLiberacion,
  type ResumenLiberacion,
} from '@/lib/pos/mesas/liberacionMesa';

export const dynamic = 'force-dynamic';

const RUTA = '/api/pos/mesas/[id]/liberar';
const PERMISO_ANULAR = 'pos.void';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    accion: z.enum(['liberar', 'cartera', 'anular']),
    motivo: z.string().max(MOTIVO_MAX * 2).nullable().optional(),
  })
  .strict();

function error(status: number, codigo: string) {
  return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
}

async function mesaId(params: Promise<{ id: string }>): Promise<string | null> {
  const { id } = await params;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

async function permisos(ctx: ServerOrgContext): Promise<PermisosLiberacion> {
  return { puedeAnular: await hasOrgAdminOrPermission(ctx, PERMISO_ANULAR) };
}

async function leerResumen(ctx: ServerOrgContext, tableId: string) {
  const { data, error: rpcError } = await getServiceClient().rpc('pos_mesa_resumen_liberacion', {
    p_organization_id: ctx.organizationId,
    p_table_id: tableId,
  });
  if (rpcError) return { error: errorDeRpc(rpcError), resumen: null };
  return { error: null, resumen: data as ResumenLiberacion };
}

function respuestaContexto(err: unknown) {
  if (err instanceof OrgContextError) {
    return NextResponse.json({ error: err.message, code: err.code, codigo: err.code }, { status: err.statusCode, headers: SIN_CACHE });
  }
  throw err;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: `GET ${RUTA}` });
    const tableId = await mesaId(params);
    if (!tableId) return error(400, 'mesa_invalida');

    const { error: fallo, resumen } = await leerResumen(ctx, tableId);
    if (fallo || !resumen) {
      if (fallo?.status === 500) console.error('[pos/mesas/liberar] resumen', { tableId, organizationId: ctx.organizationId });
      return error(fallo?.status ?? 500, fallo?.codigo ?? 'error_interno');
    }

    const perms = await permisos(ctx);
    return NextResponse.json({ resumen, decision: decidirLiberacion(resumen, perms), permisos: perms }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: `POST ${RUTA}` });
    const tableId = await mesaId(params);
    if (!tableId) return error(400, 'mesa_invalida');

    const candidato =
      typeof body === 'object' && body !== null
        ? Object.fromEntries(Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key)))
        : body;
    const parsed = bodySchema.safeParse(candidato);
    if (!parsed.success) return error(400, 'datos_invalidos');
    const { accion, motivo } = parsed.data;

    const { error: fallo, resumen } = await leerResumen(ctx, tableId);
    if (fallo || !resumen) return error(fallo?.status ?? 500, fallo?.codigo ?? 'error_interno');

    const perms = await permisos(ctx);
    const decision = decidirLiberacion(resumen, perms);
    const validacion = validarAccion(decision, accion, motivo);
    if (!validacion.ok) {
      if (validacion.codigo === 'sin_permiso') {
        console.warn('[pos/mesas/liberar] anulación sin permiso', {
          tableId,
          organizationId: ctx.organizationId,
          userId: ctx.userId,
        });
      }
      return error(validacion.status, validacion.codigo);
    }

    const { data, error: rpcError } = await getServiceClient().rpc('pos_mesa_liberar', {
      p_organization_id: ctx.organizationId,
      p_table_id: tableId,
      p_actor: ctx.userId,
      p_accion: accion,
      p_motivo: validacion.motivo,
      p_puede_anular: perms.puedeAnular,
    });
    if (rpcError) {
      const traducido = errorDeRpc(rpcError);
      const registro = { tableId, accion, organizationId: ctx.organizationId, codigo: traducido.codigo };
      if (traducido.status >= 500) console.error('[pos/mesas/liberar] liberar', { ...registro, message: rpcError.message });
      else if (traducido.status === 403) console.warn('[pos/mesas/liberar] rechazado por la base', registro);
      return error(traducido.status, traducido.codigo);
    }

    return NextResponse.json({ resultado: data }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaContexto(err);
  }
}
