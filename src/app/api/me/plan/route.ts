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
 *
 * Cupos de usuarios y sucursales (auditoría 2026-10, P0-4): salen de
 * `fn_cupo_plan`, la MISMA función con la que los disparadores de la base
 * rechazan invitar, aceptar, reactivar o crear sucursal fuera del plan. Así la
 * pantalla nunca dice «queda sitio» cuando la base va a decir que no.
 */
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOrg } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { leerCupoPlan, type UsoCupo } from '@/lib/services/cupoPlanService';

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

/**
 * Respaldo SOLO mientras la migración 20261006150000_cupo_plan_servidor no
 * esté aplicada (`leerCupoPlan` devuelve null): el cálculo de antes. Se borra
 * en cuanto `fn_cupo_plan` exista en producción.
 */
async function usoSinMigracion(
  servicio: SupabaseClient,
  org: number,
  plan: Pick<PlanFila, 'max_users' | 'max_branches'> | null | undefined
): Promise<UsoCupo> {
  const [miembros, sucursales, complementos, invitaciones] = await Promise.all([
    servicio.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true),
    servicio.from('branches').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true),
    servicio.from('subscription_addons').select('addon_type, quantity').eq('organization_id', org).eq('status', 'active'),
    servicio
      .from('invitations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()),
  ]);
  const extra = (tipo: string) =>
    (complementos.data ?? []).filter((c) => c.addon_type === tipo).reduce((s, c) => s + (c.quantity ?? 0), 0);
  return {
    usuarios: {
      actual: miembros.count ?? 0,
      maximo: plan?.max_users == null ? null : plan.max_users + extra('extra_users'),
      comprados: extra('extra_users'),
      invitacionesVigentes: invitaciones.count ?? 0,
    },
    sucursales: {
      actual: sucursales.count ?? 0,
      maximo: plan?.max_branches == null ? null : plan.max_branches + extra('extra_branches'),
      comprados: extra('extra_branches'),
    },
  };
}

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

  const [suscripcion, cupoPlan, ia, cupoIa, renovacionIa] = await Promise.all([
    servicio
      .from('subscriptions')
      .select(
        'status, trial_start, trial_end, current_period_end, billing_period, cancel_at_period_end, stripe_subscription_id, stripe_customer_id, plans(name, code, price_cop_month, price_cop_year, price_usd_month, trial_days, max_users, max_branches, ai_credits_monthly)'
      )
      .eq('organization_id', org)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    leerCupoPlan(servicio, org).catch((err: unknown) => {
      console.error('[api/me/plan] fn_cupo_plan', err instanceof Error ? err.message : err);
      return undefined;
    }),
    servicio
      .from('ai_settings')
      .select('credits_remaining, purchased_credits, credits_reset_at')
      .eq('organization_id', org)
      .maybeSingle(),
    servicio.rpc('fn_ai_plan_quota', { p_org: org }),
    servicio.rpc('fn_ai_credits_proxima_renovacion', { p_org: org }),
  ]);

  if (suscripcion.error || cupoPlan === undefined) {
    if (suscripcion.error) console.error('[api/me/plan] suscripción', suscripcion.error.message);
    return NextResponse.json({ error: 'No se pudo leer el plan' }, { status: 500 });
  }

  const sub = suscripcion.data;
  const plan = (Array.isArray(sub?.plans) ? sub?.plans[0] : sub?.plans) as PlanFila | null | undefined;
  // Invitaciones que ocupan cupo: pendientes y SIN vencer (P1-5). Una vencida
  // no se puede aceptar ni ocupa sitio.
  const uso = cupoPlan ?? (await usoSinMigracion(servicio, org, plan));

  const estado = estadoDe(sub?.status ?? null);
  const finPrueba = sub?.trial_end ? new Date(sub.trial_end) : null;
  const inicioPrueba = sub?.trial_start ? new Date(sub.trial_start) : null;
  const diasTotales =
    finPrueba && inicioPrueba ? Math.max(1, Math.round((finPrueba.getTime() - inicioPrueba.getTime()) / DIA)) : plan?.trial_days ?? null;
  const diasRestantes = estado === 'prueba' && finPrueba ? Math.max(0, Math.ceil((finPrueba.getTime() - Date.now()) / DIA)) : null;
  // Prueba vencida (P0-5): `trialing` con `trial_end` pasado. El estado se
  // conserva como «prueba» para no romper a los consumidores actuales; la
  // pantalla de Plan lo distingue con este campo.
  const pruebaVencida = estado === 'prueba' && !!finPrueba && finPrueba.getTime() < Date.now();

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
            pruebaVencida,
            finPrueba: sub?.trial_end ?? null,
            finPeriodo: sub?.current_period_end ?? null,
            // Solo si está enlazada a Stripe (portal, reactivar). No es el id.
            conStripe: !!sub?.stripe_subscription_id,
            clienteStripe: !!sub?.stripe_customer_id,
          }
        : null,
      uso: {
        // Máximos null = ilimitado (plan a medida). Las invitaciones vigentes
        // ocupan cupo junto a los miembros activos (src/lib/organizacion/cupo.ts).
        usuarios: uso.usuarios,
        sucursales: uso.sucursales,
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
