/**
 * GET /api/me/plan — plan de la organización activa y cuánto se ha usado.
 *
 * Alimenta la tarjeta del plan y el medidor de uso del bloque de sesión
 * (Figma `02 Componentes` › Sesión › PlanCard y PlanUsageMeter).
 *
 * La organización sale de la sesión (`withOrg`). Los conteos que la RLS no deja
 * ver a un miembro corriente (complementos de la suscripción, cupo de IA, que
 * solo ejecuta `service_role`) se leen con el cliente de servicio, SIEMPRE
 * filtrados por la organización ya validada: nunca por un id que venga del
 * cliente.
 *
 * Los mismos números ya existían repartidos: el nombre del plan lo consultaban
 * por separado el menú de perfil y el selector de cuentas, y el límite de
 * usuarios `organizationLimitsService`. Aquí se leen una vez.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';

export const dynamic = 'force-dynamic';

type Estado = 'prueba' | 'activo' | 'vencido' | 'cancelado' | 'sin_plan';

interface PlanFila {
  name: string | null;
  code: string | null;
  price_cop_month: number | null;
  price_cop_year: number | null;
  price_usd_month: number | null;
  trial_days: number | null;
  max_users: number | null;
  max_branches: number | null;
  ai_credits_monthly: number | null;
}

const DIA = 24 * 60 * 60 * 1000;

function estadoDe(status: string | null): Estado {
  switch (status) {
    case 'trialing':
      return 'prueba';
    case 'active':
      return 'activo';
    case 'past_due':
    case 'unpaid':
    case 'incomplete_expired':
      return 'vencido';
    case 'canceled':
      return 'cancelado';
    default:
      return 'sin_plan';
  }
}

export const GET = withOrg(async (ctx) => {
  const org = ctx.organizationId;
  const servicio = getServiceClient();

  const [suscripcion, miembros, sucursales, complementos, ia, cupoIa, renovacionIa] = await Promise.all([
    servicio
      .from('subscriptions')
      .select(
        'status, trial_start, trial_end, current_period_end, billing_period, cancel_at_period_end, plans(name, code, price_cop_month, price_cop_year, price_usd_month, trial_days, max_users, max_branches, ai_credits_monthly)'
      )
      .eq('organization_id', org)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    servicio
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
      .eq('is_active', true),
    servicio
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
      .eq('is_active', true),
    servicio
      .from('subscription_addons')
      .select('addon_type, quantity')
      .eq('organization_id', org)
      .eq('status', 'active'),
    servicio
      .from('ai_settings')
      .select('credits_remaining, purchased_credits, credits_reset_at')
      .eq('organization_id', org)
      .maybeSingle(),
    servicio.rpc('fn_ai_plan_quota', { p_org: org }),
    servicio.rpc('fn_ai_credits_proxima_renovacion', { p_org: org }),
  ]);

  if (suscripcion.error) {
    console.error('[api/me/plan] suscripción', suscripcion.error.message);
    return NextResponse.json({ error: 'No se pudo leer el plan' }, { status: 500 });
  }

  const sub = suscripcion.data;
  const plan = (Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans) as PlanFila | null | undefined;
  const extra = (tipo: string) =>
    (complementos.data ?? []).filter((c) => c.addon_type === tipo).reduce((s, c) => s + (c.quantity ?? 0), 0);

  const estado = estadoDe(sub?.status ?? null);
  const finPrueba = sub?.trial_end ? new Date(sub.trial_end) : null;
  const inicioPrueba = sub?.trial_start ? new Date(sub.trial_start) : null;
  const diasTotales =
    finPrueba && inicioPrueba ? Math.max(1, Math.round((finPrueba.getTime() - inicioPrueba.getTime()) / DIA)) : plan?.trial_days ?? null;
  const diasRestantes = estado === 'prueba' && finPrueba ? Math.max(0, Math.ceil((finPrueba.getTime() - Date.now()) / DIA)) : null;

  const anual = sub?.billing_period === 'yearly';
  const precio = anual ? plan?.price_cop_year ?? null : plan?.price_cop_month ?? null;

  // `fn_ai_plan_quota` devuelve una tabla (una fila con `monthly`), no un número:
  // antes se comparaba con 'number' y siempre caía al plan, ignorando los cupos a medida.
  const filaCupo = (Array.isArray(cupoIa.data) ? cupoIa.data[0] : cupoIa.data) as { monthly?: unknown } | null | undefined;
  const cupo = Number.isFinite(Number(filaCupo?.monthly)) ? Number(filaCupo!.monthly) : plan?.ai_credits_monthly ?? null;
  if (cupoIa.error) console.warn('[api/me/plan] fn_ai_plan_quota', cupoIa.error.message);
  if (renovacionIa.error) console.warn('[api/me/plan] fn_ai_credits_proxima_renovacion', renovacionIa.error.message);
  const saldoIa = Math.max(0, ia.data?.credits_remaining ?? 0);
  const compradosIa = Math.min(Math.max(0, ia.data?.purchased_credits ?? 0), saldoIa);

  return NextResponse.json(
    {
      plan: plan
        ? {
            nombre: plan.name,
            codigo: plan.code,
            estado,
            diasPruebaRestantes: diasRestantes,
            diasPruebaTotales: diasTotales,
            precio,
            moneda: 'COP',
            periodo: anual ? 'anual' : 'mensual',
            proximoCobro: estado === 'prueba' ? sub?.trial_end ?? null : sub?.current_period_end ?? null,
            cancelaAlFinal: sub?.cancel_at_period_end ?? false,
          }
        : null,
      uso: {
        usuarios: {
          actual: miembros.count ?? 0,
          // null = ilimitado (plan a medida).
          maximo: plan?.max_users == null ? null : plan.max_users + extra('extra_users'),
        },
        sucursales: {
          actual: sucursales.count ?? 0,
          maximo: plan?.max_branches == null ? null : plan.max_branches + extra('extra_branches'),
        },
        creditosIa: {
          // `credits_remaining` es el saldo TOTAL (cupo del plan + comprados):
          // el cupo que queda es el saldo menos los comprados. Antes se mostraba
          // el total como «del plan» y los comprados se contaban dos veces.
          restantesPlan: saldoIa - compradosIa,
          comprados: compradosIa,
          cupoMensual: cupo,
          // El cupo se renueva al empezar el mes en la zona de la organización
          // (`fn_renovar_creditos_ia`). Antes se mostraba la fecha del último
          // reinicio, que siempre estaba en el pasado y no salía nunca.
          seRenuevan: typeof renovacionIa.data === 'string' ? renovacionIa.data : null,
        },
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
});
