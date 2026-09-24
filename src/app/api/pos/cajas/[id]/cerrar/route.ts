/**
 * POST /api/pos/cajas/[id]/cerrar — cierra una caja con red: la propia o la
 * de otro cajero (desde «Cajas abiertas», el detalle o el POS).
 *
 * - La organización sale de la sesión (`getServerOrgContext`); si el body o la
 *   query declaran otra → 403 `FOREIGN_ORGANIZATION` y registro (`readOrgBody`).
 * - Quien abrió la caja la cierra; cualquier otra persona necesita
 *   `pos.cajas.cerrar_ajenas` resuelto aquí (`resolverPermisosCaja`), nunca el
 *   nombre del rol ni un valor del cliente → si no, 403 `CLOSE_FORBIDDEN` y
 *   registro. La base vuelve a comprobarlo (`pos_caja_cerrar`).
 * - Caja de otra organización o inexistente → 404; ya cerrada → 409.
 *
 * El cierre es UNA transacción en la base (`pos_caja_cerrar`, D6 del plan
 * docs/implementacion/CAJAS-VENTAS-PLAN.md): registra el arqueo `closing` con el
 * conteo por método (`method_breakdown`), calcula el esperado y la diferencia
 * en el servidor y cierra. El navegador solo manda lo contado; si el body trae
 * `difference` (clientes anteriores) se ignora. Con cierre ciego la respuesta
 * no trae esperado ni diferencia para quien no puede verlos.
 * `CajasService.closeSession` usa esta ruta también para la caja propia cuando
 * hay red; sin red (Desktop) el cierre va al outbox y se reproduce con la misma
 * RPC (`cashSync.replayClose`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';
import { MOTIVO_NO_PUEDE_CERRAR, puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import { parametrosCierre } from '@/lib/pos/cajas/arqueo';

export const dynamic = 'force-dynamic';

const IMPORTE_MAXIMO = 1e12;

/**
 * `codigo` estable de cada error para que el cliente lo traduzca
 * (`cajas.errores.<codigo>`); `error` sigue en español para los demás
 * consumidores. Solo etiqueta la respuesta: no cambia ninguna comprobación.
 */
function codigoDeContexto(code: string | undefined): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'no_autenticado';
    case 'INVALID_BODY':
    case 'INVALID_JSON':
      return 'datos_cierre_invalidos';
    default:
      return 'organizacion_no_permitida';
  }
}

const importe = z.number().finite().min(0).max(IMPORTE_MAXIMO);

const bodySchema = z
  .object({
    final_amount: importe,
    // Aceptada por compatibilidad y descartada: la diferencia es del servidor.
    difference: z.number().finite().min(-IMPORTE_MAXIMO).max(IMPORTE_MAXIMO).optional(),
    notes: z.string().max(5000).nullable().optional(),
    /** Lo contado de cada otro método (tarjeta, transferencia…), por código. */
    counted_by_method: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), importe).optional(),
    /** Billetes y monedas contados: `{ bills: { "50000": 2 }, coins: { "500": 4 } }`. */
    denominations: z
      .object({
        bills: z.record(z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().int().min(0).max(1e6)).optional(),
        coins: z.record(z.string().regex(/^\d+(\.\d{1,2})?$/), z.number().int().min(0).max(1e6)).optional(),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();

function errorRpc(err: { code?: string; message?: string }) {
  const m = err.message ?? '';
  if (err.code === '42501' && m.includes('sin_permiso')) {
    return NextResponse.json({ error: MOTIVO_NO_PUEDE_CERRAR, code: 'CLOSE_FORBIDDEN', codigo: 'sin_permiso' }, { status: 403 });
  }
  if (err.code === 'P0002') {
    return NextResponse.json({ error: 'La caja no existe', code: 'NOT_FOUND', codigo: 'caja_no_encontrada' }, { status: 404 });
  }
  if (err.code === '42501') {
    return NextResponse.json({ error: 'No tienes acceso a esta caja', code: 'FORBIDDEN', codigo: 'organizacion_no_permitida' }, { status: 403 });
  }
  if (err.code === '22023') {
    return NextResponse.json({ error: 'Datos de cierre inválidos', code: 'INVALID_BODY', codigo: 'datos_cierre_invalidos' }, { status: 400 });
  }
  return null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'POST /api/pos/cajas/[id]/cerrar' });

    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: 'Número de caja inválido', code: 'INVALID_ID', codigo: 'caja_invalida' }, { status: 400 });
    }

    const candidate =
      typeof body === 'object' && body !== null
        ? Object.fromEntries(Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key)))
        : body;
    const parsed = bodySchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de cierre inválidos', code: 'INVALID_BODY', codigo: 'datos_cierre_invalidos' }, { status: 400 });
    }

    const { data: caja, error: errorCaja } = await ctx.supabase
      .from('cash_sessions')
      .select('id, opened_by, status')
      .eq('id', sessionId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (errorCaja) {
      console.error('[pos/cajas/cerrar] lectura', { sessionId, organizationId: ctx.organizationId, message: errorCaja.message });
      return NextResponse.json({ error: 'No se pudo leer la caja', codigo: 'lectura_fallida' }, { status: 500 });
    }
    if (!caja) {
      return NextResponse.json({ error: 'La caja no existe', code: 'NOT_FOUND', codigo: 'caja_no_encontrada' }, { status: 404 });
    }
    if (caja.status !== 'open') {
      return NextResponse.json({ error: 'La caja ya está cerrada', code: 'ALREADY_CLOSED', codigo: 'caja_ya_cerrada' }, { status: 409 });
    }

    const esDeQuienCierra = caja.opened_by === ctx.userId;
    const permisos = esDeQuienCierra ? null : await resolverPermisosCaja(ctx);
    if (!puedeCerrarCaja(caja, ctx.userId, permisos?.cerrarCajasAjenas ?? false)) {
      console.warn('[pos/cajas/cerrar] cierre de caja ajena sin permiso', {
        sessionId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      return NextResponse.json({ error: MOTIVO_NO_PUEDE_CERRAR, code: 'CLOSE_FORBIDDEN', codigo: 'sin_permiso' }, { status: 403 });
    }

    const { data, error } = await ctx.supabase.rpc(
      'pos_caja_cerrar',
      parametrosCierre(sessionId, {
        counted_amount: parsed.data.final_amount,
        counted_by_method: parsed.data.counted_by_method,
        denominations: parsed.data.denominations ?? undefined,
        notes: parsed.data.notes ?? undefined,
      }),
    );
    if (error) {
      const conocido = errorRpc(error);
      if (conocido) {
        if (conocido.status === 403) {
          console.warn('[pos/cajas/cerrar] la base negó el cierre', { sessionId, organizationId: ctx.organizationId, userId: ctx.userId });
        }
        return conocido;
      }
      console.error('[pos/cajas/cerrar] escritura', { sessionId, organizationId: ctx.organizationId, message: error.message });
      return NextResponse.json({ error: 'No se pudo cerrar la caja', codigo: 'cierre_fallido' }, { status: 500 });
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ya_cerrada === true) {
      return NextResponse.json({ error: 'La caja ya está cerrada', code: 'ALREADY_CLOSED', codigo: 'caja_ya_cerrada' }, { status: 409 });
    }

    const session = {
      id: Number(r.session_id),
      uuid: r.uuid,
      organization_id: ctx.organizationId,
      branch_id: r.branch_id ?? null,
      opened_by: r.opened_by,
      opened_at: r.opened_at,
      closed_at: r.closed_at,
      closed_by: r.closed_by,
      initial_amount: Number(r.initial_amount),
      final_amount: Number(r.final_amount),
      difference: r.difference == null ? null : Number(r.difference),
      status: 'closed' as const,
    };
    return NextResponse.json(
      {
        session,
        arqueoId: r.arqueo_id ?? null,
        esperado: r.expected_amount == null ? null : Number(r.expected_amount),
        oculto: r.oculto === true,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code, codigo: codigoDeContexto(err.code) }, { status: err.statusCode });
    }
    throw err;
  }
}
