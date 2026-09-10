import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  listCallsWithRelations,
  createCall,
  type CallFilters,
  type CallCreateInput,
} from '@/lib/services/crm/callManagementService';
import { CALL_DIRECTIONS, CALL_MODES, CALL_STATUSES } from '@/lib/crm/enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
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
  has_recording: z.enum(['true', '1']).optional(),
  q: z.string().max(40).optional(),
  from_date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  to_date: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/crm/calls — Lista llamadas de la organización (FASE-03 §4.1) con
 * cliente, oportunidad, usuario y grabaciones. Filtros validados con zod:
 *   status, direction, mode, customer_id, user_id ('me'), opportunity_id,
 *   provider_call_sid, outcome, has_recording, q, from_date, to_date, limit≤200, offset
 * Respuesta: { success, data: CallListRow[], count }
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const raw: Record<string, string> = {};
  for (const [k, v] of new URL(request.url).searchParams.entries()) if (v !== '') raw[k] = v;
  const parsed = filtersSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Filtros inválidos', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const f = parsed.data;
    const filters: CallFilters = {
      ...f,
      user_id: f.user_id === 'me' ? ctx.userId : f.user_id,
      has_recording: f.has_recording ? true : undefined,
    };
    const result = await listCallsWithRelations(ctx.organizationId, ctx.supabase, filters);
    return NextResponse.json({ success: true, data: result.data, count: result.count }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
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
