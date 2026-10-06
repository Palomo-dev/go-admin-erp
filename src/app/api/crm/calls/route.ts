import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  listCallsWithRelations,
  createCall,
  type CallFilters,
  type CallCreateInput,
} from '@/lib/services/crm/callManagementService';
import { CALL_DIRECTIONS, CALL_MODES, CALL_STATUSES } from '@/lib/crm/enums';
import { CRM_PERMISOS, CrmHttpError, respuestaErrorCrm, tienePermisoCrm } from '@/lib/services/crm/crmRouteSupport';
import { normalizarFechasLlamadas } from '@/lib/services/crm/callFiltersLogica';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz } from '@/lib/utils/dateCore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const fecha = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));
const filtersSchema = z.object({
  status: z.enum(CALL_STATUSES).optional(),
  direction: z.enum(CALL_DIRECTIONS).optional(),
  mode: z.enum(CALL_MODES).optional(),
  customer_id: uuid.optional(),
  /** uuid o 'me' */
  user_id: z.union([uuid, z.literal('me')]).optional(),
  opportunity_id: uuid.optional(),
  provider_call_sid: z.string().max(64).optional(),
  outcome: z.string().max(40).optional(),
  has_recording: z.enum(['true', '1', 'false', '0']).optional(),
  /** Número, cliente o palabra dicha en la llamada (transcripción). */
  q: z.string().max(200).optional(),
  from_date: fecha.optional(),
  to_date: fecha.optional(),
  /** Cifras de HOY en la zona de la organización (las fija el servidor). */
  stats_today: z.enum(['true', '1']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/crm/calls — llamadas de la organización de la SESIÓN (FASE-03 §4.1;
 * Figma 1351:18). Una sola RPC (`crm_calls_list`) aplica los mismos filtros al
 * listado, al total y a las cifras, y resuelve en la base el permiso
 * `crm.calls.view_all` y el alcance por sucursal.
 *
 * - Los días `YYYY-MM-DD` son de la zona de la organización (`to_date` exclusivo
 *   al inicio del día siguiente). Un instante con offset se respeta.
 * - Sin `crm.calls.view_all` solo ves las tuyas; pedir las de otro → 403.
 * - `q` busca también en la transcripción.
 * Respuesta: { success, data: CallListRow[], count, stats, canViewAll }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    const raw: Record<string, string> = {};
    for (const [k, v] of new URL(request.url).searchParams.entries()) if (v !== '') raw[k] = v;
    const parsed = filtersSchema.safeParse(raw);
    if (!parsed.success) throw new CrmHttpError(400, 'filtros_invalidos', 'Filtros inválidos');
    const { stats_today, ...f } = parsed.data;

    const canViewAll = await tienePermisoCrm(ctx, CRM_PERMISOS.llamadasVerTodas);
    const requested = f.user_id === 'me' ? ctx.userId : f.user_id;
    if (!canViewAll && requested && requested !== ctx.userId) {
      console.warn('[crm] GET /api/crm/calls: llamadas de otro usuario sin crm.calls.view_all (org %s)', ctx.organizationId);
      throw new CrmHttpError(403, 'sin_permiso', 'No puedes ver las llamadas de otra persona');
    }
    const timezone = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const hoy = todayInTz(timezone);
    const filters: CallFilters = normalizarFechasLlamadas(
      {
        ...f,
        user_id: canViewAll ? requested : ctx.userId,
        has_recording: f.has_recording === undefined ? undefined : f.has_recording === 'true' || f.has_recording === '1',
        ...(stats_today ? { from_date: hoy, to_date: hoy } : {}),
      },
      timezone,
    );
    const result = await listCallsWithRelations(ctx.organizationId, ctx.supabase, filters);
    return NextResponse.json({ success: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/calls');
  }
}

const createSchema = z.object({
  provider: z.string().min(1).max(40),
  direction: z.enum(CALL_DIRECTIONS),
  mode: z.enum(CALL_MODES).optional(),
  from_number: z.string().min(3).max(32),
  to_number: z.string().min(3).max(32),
  status: z.enum(CALL_STATUSES).optional(),
  customer_id: uuid.nullable().optional(),
  opportunity_id: uuid.nullable().optional(),
  started_at: z.string().datetime({ offset: true }).optional(),
  ended_at: z.string().datetime({ offset: true }).nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
  recording_enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * POST /api/crm/calls — Crea un registro de llamada manual (mode 'manual' por
 * defecto; el registro con audio va por /api/crm/calls/manual, F4/F5).
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const parsed = createSchema.safeParse(readOrgBody(ctx, await request.json().catch(() => null), { request }));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const input: CallCreateInput = {
      ...parsed.data,
      mode: parsed.data.mode ?? 'manual',
      status: parsed.data.status ?? 'completed',
      user_id: ctx.userId,
      duration_source: parsed.data.duration_seconds != null ? 'manual' : 'estimated',
    };
    const call = await createCall(ctx.organizationId, input, ctx.supabase);
    return NextResponse.json({ success: true, data: call }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
