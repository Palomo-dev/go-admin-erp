import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { countConditionRules } from '@/lib/services/crm/automation/conditionsDsl';

/**
 * GET /api/crm/sequences/[id]/enroll/preview?q=texto
 *
 * Alimenta el selector y la confirmación de "Inscribir" (tester r2 N7: la
 * única acción que dispara envíos reales desde la interfaz era un UUID pegado
 * a mano, sin selector, sin previsualizar los pasos y sin confirmación).
 *
 * Devuelve:
 *  - `steps`: los pasos ACTIVOS de la secuencia, en orden, para que el usuario
 *    vea exactamente qué se va a enviar y cuándo antes de confirmar.
 *  - `candidates`: oportunidades abiertas de la organización que casan con `q`,
 *    con el nombre del cliente, su email y si ya tienen una inscripción viva.
 *
 * Solo lectura y solo de la organización de la sesión. No exige rol de admin
 * (como el resto de los GET); inscribir sí lo exige.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const orgId = ctx.organizationId;
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120);

    const { data: sequence, error: seqError } = await ctx.supabase
      .from('sequences')
      .select('id, name, is_active')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (seqError) throw new Error(seqError.message);
    if (!sequence) {
      return NextResponse.json({ success: false, error: 'Secuencia no encontrada' }, { status: 404 });
    }

    const { data: steps, error: stepsError } = await ctx.supabase
      .from('sequence_steps')
      .select('id, step_number, channel, delay_days, delay_hours, name, is_active, condition')
      .eq('organization_id', orgId)
      .eq('sequence_id', id)
      .eq('is_active', true)
      .order('step_number', { ascending: true });
    if (stepsError) throw new Error(stepsError.message);

    let query = ctx.supabase
      .from('opportunities')
      .select('id, name, amount, currency, status, customer_id')
      .eq('organization_id', orgId)
      .eq('status', 'open')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (q) query = query.ilike('name', `%${q}%`);

    const { data: opportunities, error: oppError } = await query;
    if (oppError) throw new Error(oppError.message);

    const opps = (opportunities ?? []) as {
      id: string; name: string; amount: number | null; currency: string | null;
      status: string; customer_id: string | null;
    }[];

    const customerIds = Array.from(new Set(opps.map((o) => o.customer_id).filter((c): c is string => !!c)));
    const customerById = new Map<string, { full_name: string | null; email: string | null }>();
    if (customerIds.length > 0) {
      const { data: customers, error: custError } = await ctx.supabase
        .from('customers')
        .select('id, full_name, email')
        .eq('organization_id', orgId)
        .in('id', customerIds);
      if (custError) throw new Error(custError.message);
      for (const c of (customers ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        customerById.set(c.id, { full_name: c.full_name, email: c.email });
      }
    }

    const liveIds = new Set<string>();
    if (opps.length > 0) {
      const { data: live, error: liveError } = await ctx.supabase
        .from('sequence_enrollments')
        .select('opportunity_id')
        .eq('organization_id', orgId)
        .eq('sequence_id', id)
        .in('status', ['active', 'paused'])
        .in('opportunity_id', opps.map((o) => o.id));
      if (liveError) throw new Error(liveError.message);
      for (const row of (live ?? []) as { opportunity_id: string | null }[]) {
        if (row.opportunity_id) liveIds.add(row.opportunity_id);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          sequence: { id: sequence.id, name: (sequence as { name: string }).name, is_active: (sequence as { is_active: boolean }).is_active },
          // `condition_rules` deja ver ANTES de inscribir si un paso de
          // condicion lleva reglas: una condicion sin reglas ya no se puede
          // crear, pero una secuencia antigua puede tenerla y ahora corta la
          // secuencia en vez de dejar pasar (tester r3 N10).
          steps: ((steps ?? []) as { channel: string; condition?: unknown }[]).map((s) => {
            const { condition, ...rest } = s;
            return rest.channel === 'condition'
              ? { ...rest, condition_rules: countConditionRules(condition) }
              : rest;
          }),
          candidates: opps.map((o) => {
            const customer = o.customer_id ? customerById.get(o.customer_id) : undefined;
            return {
              id: o.id,
              name: o.name,
              amount: o.amount,
              currency: o.currency,
              customer_name: customer?.full_name ?? null,
              customer_email: customer?.email ?? null,
              already_enrolled: liveIds.has(o.id),
            };
          }),
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Sequences Enroll Preview] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
