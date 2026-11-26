/**
 * POST /api/pos/cajas/[id]/descuadre — un supervisor aprueba el descuadre de
 * un cierre («por revisar»: la diferencia superó la tolerancia aun después del
 * reconteo). Nota obligatoria; queda en la bitácora `cash_session_revisiones`
 * (quién y cuándo). Migración 20261126070000.
 *
 * - La organización sale de la sesión; un body con otra → 403 y registro.
 * - El permiso `pos.cajas.explicar_diferencias` se resuelve aquí
 *   (`resolverPermisosCaja`, nunca el nombre del rol ni un valor del cliente)
 *   y otra vez en la base (`pos_caja_revisar_descuadre`).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ nota: z.string().trim().min(1).max(2000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: unknown = await readOrgBody(ctx, request, { route: 'POST /api/pos/cajas/[id]/descuadre' });
    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: 'Número de caja inválido', codigo: 'caja_invalida' }, { status: 400 });
    }
    const candidato =
      typeof body === 'object' && body !== null
        ? Object.fromEntries(Object.entries(body).filter(([k]) => !(ORG_BODY_KEYS as readonly string[]).includes(k)))
        : body;
    const parsed = bodySchema.safeParse(candidato);
    if (!parsed.success) {
      return NextResponse.json({ error: 'La nota es obligatoria', code: 'INVALID_BODY', codigo: 'nota_requerida' }, { status: 400 });
    }

    const permisos = await resolverPermisosCaja(ctx);
    if (!permisos.explicarDiferencias) {
      console.warn('[pos/cajas/descuadre] aprobación sin permiso', { sessionId, organizationId: ctx.organizationId, userId: ctx.userId });
      return NextResponse.json({ error: 'No tienes permiso para aprobar descuadres', code: 'FORBIDDEN', codigo: 'sin_permiso' }, { status: 403 });
    }

    const { data, error } = await ctx.supabase.rpc('pos_caja_revisar_descuadre', { p_session_id: sessionId, p_nota: parsed.data.nota });
    if (error) {
      const m = error.message ?? '';
      if (error.code === 'P0002') return NextResponse.json({ error: 'La caja no existe', codigo: 'caja_no_encontrada' }, { status: 404 });
      if (error.code === '42501') return NextResponse.json({ error: 'No tienes permiso', codigo: 'sin_permiso' }, { status: 403 });
      if (m.startsWith('descuadre_no_pendiente')) {
        return NextResponse.json({ error: 'Este cierre no tiene un descuadre por revisar', codigo: 'descuadre_no_pendiente' }, { status: 409 });
      }
      if (m.startsWith('nota_requerida')) return NextResponse.json({ error: 'La nota es obligatoria', codigo: 'nota_requerida' }, { status: 400 });
      console.error('[pos/cajas/descuadre]', { sessionId, organizationId: ctx.organizationId, message: m });
      return NextResponse.json({ error: 'No se pudo aprobar el descuadre', codigo: 'aprobacion_fallida' }, { status: 500 });
    }
    return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { error: err.message, code: err.code, codigo: err.code === 'UNAUTHENTICATED' ? 'no_autenticado' : 'organizacion_no_permitida' },
        { status: err.statusCode },
      );
    }
    throw err;
  }
}
