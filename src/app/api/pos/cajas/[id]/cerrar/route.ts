/**
 * POST /api/pos/cajas/[id]/cerrar — cierra una caja con red: la propia o la
 * de otro cajero (desde «Cajas abiertas» o el detalle).
 *
 * - La organización sale de la sesión (`getServerOrgContext`); si el body o la
 *   query declaran otra → 403 `FOREIGN_ORGANIZATION` y registro (`readOrgBody`).
 * - Quien abrió la caja la cierra; cualquier otra persona necesita el permiso
 *   de administración resuelto aquí (`resolverPermisosCaja`), nunca el nombre
 *   del rol ni un valor del cliente → si no, 403 `CLOSE_FORBIDDEN` y registro.
 * - Caja de otra organización o inexistente → 404; ya cerrada → 409.
 * - La escritura va con el cliente de sesión (`ctx.supabase`): la RLS de
 *   `cash_sessions` (pertenencia + acceso a la sucursal) sigue aplicando.
 *
 * El esperado lo calcula el servidor (`pos_caja_esperado`, mismas reglas que
 * `CajasService.getCashSummary`) y la diferencia = contado − esperado se
 * calcula aquí. Si el body trae `difference` (clientes anteriores) se ignora:
 * hasta 2026-09-23 se guardaba tal cual la mandaba el navegador.
 * `CajasService.closeSession` usa esta ruta también para la caja propia cuando
 * hay red; sin red (Desktop) el cierre va al outbox con el cálculo local.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';
import { MOTIVO_NO_PUEDE_CERRAR, puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';
import { diferenciaEfectivo } from '@/lib/pos/cajas/arqueo';

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

const bodySchema = z
  .object({
    final_amount: z.number().finite().min(0).max(IMPORTE_MAXIMO),
    // Aceptada por compatibilidad y descartada: la diferencia es del servidor.
    difference: z.number().finite().min(-IMPORTE_MAXIMO).max(IMPORTE_MAXIMO).optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

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
      .select('id, opened_by, status, notes')
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

    const { final_amount, notes } = parsed.data;
    const { data: esperado, error: errorEsperado } = await ctx.supabase.rpc('pos_caja_esperado', { p_session_id: sessionId });
    const esperadoEfectivo = Number((esperado as { efectivo_esperado?: unknown } | null)?.efectivo_esperado);
    if (errorEsperado || !Number.isFinite(esperadoEfectivo)) {
      console.error('[pos/cajas/cerrar] esperado', { sessionId, organizationId: ctx.organizationId, message: errorEsperado?.message });
      return NextResponse.json({ error: 'No se pudo calcular el esperado de la caja', codigo: 'cierre_fallido' }, { status: 500 });
    }
    const difference = diferenciaEfectivo(final_amount, esperadoEfectivo);

    const { data: cerrada, error } = await ctx.supabase
      .from('cash_sessions')
      .update({
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId,
        final_amount,
        difference,
        notes: notes || caja.notes,
        status: 'closed',
      })
      .eq('id', sessionId)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'open')
      .select()
      .maybeSingle();
    if (error) {
      console.error('[pos/cajas/cerrar] escritura', { sessionId, organizationId: ctx.organizationId, message: error.message });
      return NextResponse.json({ error: 'No se pudo cerrar la caja', codigo: 'cierre_fallido' }, { status: 500 });
    }
    if (!cerrada) {
      return NextResponse.json({ error: 'La caja ya está cerrada', code: 'ALREADY_CLOSED', codigo: 'caja_ya_cerrada' }, { status: 409 });
    }

    return NextResponse.json({ session: cerrada }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code, codigo: codigoDeContexto(err.code) }, { status: err.statusCode });
    }
    throw err;
  }
}
