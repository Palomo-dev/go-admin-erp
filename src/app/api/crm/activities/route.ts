import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  activityInputSchema,
  createActivity,
  DuplicateActivityError,
  RelatedNotFoundError,
} from '@/lib/services/crm/activityService';
import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { leerFiltrosFeed, listarActividadesOrg } from '@/lib/services/crm/actividadesOrgService';

/**
 * GET /api/crm/activities — línea de tiempo de la organización (CRM ola 3A,
 * pantalla Actividades, plan §4.9): `activities`, `notes` y tareas del CRM.
 *
 * Query: types=call,email,…(activity_type; `note` y `task` suman sus tablas) ·
 *        q · user_id · customer_id | opportunity_id · from/to (ISO, `to`
 *        exclusivo; la pantalla los calcula en la zona de la organización) ·
 *        cursor · limit (≤ 50, por defecto 20).
 * 200 { data, next_cursor, total (solo sin cursor) } · 400 parámetros.
 * Lectura de miembro (RLS de pertenencia + organización de la sesión); cada
 * entrada trae `editable`, resuelto en el servidor (D5).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const sp = request.nextUrl.searchParams;
    const filtros = leerFiltrosFeed(sp);
    const pagina = await listarActividadesOrg(ctx, filtros, { cursor: sp.get('cursor'), limite: Number.parseInt(sp.get('limit') ?? '20', 10) });
    return NextResponse.json(
      { success: true, data: pagina.entradas, next_cursor: pagina.cursor, total: pagina.total },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/activities');
  }
}

/**
 * POST /api/crm/activities — crea una actividad CRM (FASE-09 §4.1).
 *
 * Body: { activity_type, related_type: 'opportunity'|'customer', related_id, notes?, channel?,
 *         outcome?, duration_seconds?, occurred_at?, metadata?, call_id?, email_message_id?, message_id? }
 * 201 { success, data } · 400 zod · 404 entidad ajena · 409 call_id ya tiene actividad
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const json = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const parsed = activityInputSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const activity = await createActivity(ctx.organizationId, ctx.userId, parsed.data, ctx.supabase);
    return NextResponse.json({ success: true, data: activity }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof RelatedNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof DuplicateActivityError) {
      return NextResponse.json({ success: false, error: error.message, data: error.existing }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Activities] POST error:', message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
