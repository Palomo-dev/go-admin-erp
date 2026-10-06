/**
 * POST /api/organizacion/desactivar — «Desactivar organización» desde
 * Organización › Mis organizaciones. Body: `{ organizationId }`.
 *
 * Antes lo hacía el navegador (auditoría 2026-10, P0-9 y P1-2): decidía «¿es
 * admin?» con `role_id !== 2`, escribía `organizations.status` con la clave
 * anónima y no miraba Stripe, así que la suscripción seguía cobrando, y otra
 * pantalla podía reactivar una organización suspendida por la plataforma.
 *
 * Aquí:
 * - la organización llega en el body porque se desactiva una de la lista (no
 *   necesariamente la activa); no es un dato de confianza:
 *   `getServerOrgContextFor` exige sesión y membresía ACTIVA en ella;
 * - permiso: administrador (super admin o rol 1/2), igual que `requireOrgAdmin`;
 * - las reglas (solo `active`, 409 `SUSCRIPCION_VIVA` si Stripe sigue
 *   cobrando) viven en `organizacionEstadoService`, igual que las de reactivar.
 */
import { NextResponse } from 'next/server';
import { getServerOrgContextFor, requireOrgAdmin, OrgContextError } from '@/lib/utils/orgContext';
import { idDeOrganizacion } from '@/lib/stripe/contextoFacturacion';
import { getServiceClient } from '@/lib/supabase/server-service';
import { desactivarOrganizacion } from '@/lib/services/organizacionEstadoService';

const RUTA = 'organizacion/desactivar';

export async function POST(request: Request) {
  let body: { organizationId?: unknown };
  try {
    body = (await request.json()) as { organizationId?: unknown };
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  try {
    const ctx = await getServerOrgContextFor(idDeOrganizacion(body.organizationId));
    requireOrgAdmin(ctx);
    const r = await desactivarOrganizacion(getServiceClient(), ctx.organizationId, ctx.userId);
    if (!r.ok) {
      return NextResponse.json({ error: r.rechazo.mensaje, code: r.rechazo.codigo }, { status: r.rechazo.status });
    }
    console.info(`[${RUTA}] organización desactivada`, { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ success: true, organizationId: ctx.organizationId });
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    console.error(`[${RUTA}]`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo desactivar la organización' }, { status: 500 });
  }
}
