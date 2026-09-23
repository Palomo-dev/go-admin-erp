/**
 * POST /api/pos/cajas/[id]/cerrar — cierra una caja que NO es la activa de
 * quien cierra: la de otro cajero, desde «Cajas abiertas» o el detalle.
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
 * El esperado lo calcula `CajasService.getCashSummary` en el navegador, igual
 * que en el cierre de la caja propia: aquí llegan el contado y la diferencia.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';
import { MOTIVO_NO_PUEDE_CERRAR, puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';

export const dynamic = 'force-dynamic';

const IMPORTE_MAXIMO = 1e12;

const bodySchema = z
  .object({
    final_amount: z.number().finite().min(0).max(IMPORTE_MAXIMO),
    difference: z.number().finite().min(-IMPORTE_MAXIMO).max(IMPORTE_MAXIMO),
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
      return NextResponse.json({ error: 'Número de caja inválido', code: 'INVALID_ID' }, { status: 400 });
    }

    const candidate =
      typeof body === 'object' && body !== null
        ? Object.fromEntries(Object.entries(body).filter(([key]) => !(ORG_BODY_KEYS as readonly string[]).includes(key)))
        : body;
    const parsed = bodySchema.safeParse(candidate);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de cierre inválidos', code: 'INVALID_BODY' }, { status: 400 });
    }

    const { data: caja, error: errorCaja } = await ctx.supabase
      .from('cash_sessions')
      .select('id, opened_by, status, notes')
      .eq('id', sessionId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (errorCaja) {
      console.error('[pos/cajas/cerrar] lectura', { sessionId, organizationId: ctx.organizationId, message: errorCaja.message });
      return NextResponse.json({ error: 'No se pudo leer la caja' }, { status: 500 });
    }
    if (!caja) {
      return NextResponse.json({ error: 'La caja no existe', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (caja.status !== 'open') {
      return NextResponse.json({ error: 'La caja ya está cerrada', code: 'ALREADY_CLOSED' }, { status: 409 });
    }

    const esDeQuienCierra = caja.opened_by === ctx.userId;
    const permisos = esDeQuienCierra ? null : await resolverPermisosCaja(ctx);
    if (!puedeCerrarCaja(caja, ctx.userId, permisos?.cerrarCajasAjenas ?? false)) {
      console.warn('[pos/cajas/cerrar] cierre de caja ajena sin permiso', {
        sessionId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      return NextResponse.json({ error: MOTIVO_NO_PUEDE_CERRAR, code: 'CLOSE_FORBIDDEN' }, { status: 403 });
    }

    const { final_amount, difference, notes } = parsed.data;
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
      return NextResponse.json({ error: 'No se pudo cerrar la caja' }, { status: 500 });
    }
    if (!cerrada) {
      return NextResponse.json({ error: 'La caja ya está cerrada', code: 'ALREADY_CLOSED' }, { status: 409 });
    }

    return NextResponse.json({ session: cerrada }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }
}
