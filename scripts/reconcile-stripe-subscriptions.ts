/**
 * Script de reconciliación Stripe ↔ Base de Datos (solo lectura)
 * 
 * Compara el estado de las suscripciones entre Stripe y la base de datos,
 * reportando discrepancias sin realizar cambios.
 * 
 * Uso:
 *   npx tsx scripts/reconcile-stripe-subscriptions.ts [--org-ids=145,197,198,199,200]
 * 
 * Parámetros:
 *   --org-ids: IDs de organizaciones a verificar (separados por coma). Si no se especifica, verifica todas.
 *   --fix: Ejecuta correcciones automáticas (NO IMPLEMENTADO aún, solo reporte)
 * 
 * Ejemplo:
 *   npx tsx scripts/reconcile-stripe-subscriptions.ts
 *   npx tsx scripts/reconcile-stripe-subscriptions.ts --org-ids=145,197,198,199,200
 */

import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Verificar variables de entorno
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL no está configurado');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY no está configurado');
  process.exit(1);
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY no está configurado');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover',
});

interface Discrepancia {
  tipo: 'ids_faltantes' | 'estado_distinto' | 'trial_end_distinto' | 'plan_distinto' | 'customer_no_existe' | 'subscription_no_existe';
  organizationId: number;
  organizationName: string;
  detalles: string;
  baseValues?: Record<string, unknown>;
  stripeValues?: Record<string, unknown>;
}

interface Reporte {
  total: number;
  conProblemas: number;
  discrepancias: Discrepancia[];
}

async function obtenerSuscripcionesBase(orgIds?: number[]) {
  let query = supabase
    .from('subscriptions')
    .select(`
      id,
      organization_id,
      stripe_subscription_id,
      stripe_customer_id,
      status,
      trial_end,
      plan_id,
      organizations (
        id,
        name
      ),
      plans (
        id,
        code
      )
    `)
    .order('organization_id', { ascending: true });

  if (orgIds && orgIds.length > 0) {
    query = query.in('organization_id', orgIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('❌ Error obteniendo suscripciones de la base:', error);
    throw error;
  }

  return data || [];
}

async function verificarCustomerEnStripe(customerId: string): Promise<boolean> {
  try {
    await stripe.customers.retrieve(customerId);
    return true;
  } catch (err: unknown) {
    const error = err as { type?: string };
    if (error.type === 'StripeInvalidRequestError') {
      return false;
    }
    throw err;
  }
}

async function verificarSuscripcionEnStripe(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (err: unknown) {
    const error = err as { type?: string };
    if (error.type === 'StripeInvalidRequestError') {
      return null;
    }
    throw err;
  }
}

function formatearFecha(fecha: string | null): string {
  if (!fecha) return 'null';
  return new Date(fecha).toISOString().split('T')[0];
}

function compararFechas(fecha1: string | null, fecha2: number | null): boolean {
  if (!fecha1 && !fecha2) return true;
  if (!fecha1 || !fecha2) return false;
  
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2 * 1000);
  
  // Comparar solo año-mes-día
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

async function reconciliar(orgIds?: number[]): Promise<Reporte> {
  console.log('\n🔍 Iniciando reconciliación Stripe ↔ Base de Datos\n');
  
  if (orgIds && orgIds.length > 0) {
    console.log(`📋 Verificando organizaciones: ${orgIds.join(', ')}\n`);
  } else {
    console.log('📋 Verificando todas las organizaciones\n');
  }

  const suscripciones = await obtenerSuscripcionesBase(orgIds);
  console.log(`📊 Total de suscripciones en la base: ${suscripciones.length}\n`);

  const discrepancias: Discrepancia[] = [];

  for (const sub of suscripciones) {
    const orgData = Array.isArray(sub.organizations) ? sub.organizations[0] : sub.organizations;
    const planData = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
    
    const organizationName = orgData?.name || `Org ${sub.organization_id}`;
    
    console.log(`\n🔎 Verificando org ${sub.organization_id} (${organizationName})...`);

    // Verificar IDs faltantes
    if (!sub.stripe_customer_id || !sub.stripe_subscription_id) {
      console.log('  ⚠️  Faltan IDs de Stripe');
      discrepancias.push({
        tipo: 'ids_faltantes',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `stripe_customer_id=${sub.stripe_customer_id || 'NULL'}, stripe_subscription_id=${sub.stripe_subscription_id || 'NULL'}`,
        baseValues: {
          stripe_customer_id: sub.stripe_customer_id,
          stripe_subscription_id: sub.stripe_subscription_id,
        },
      });
      continue;
    }

    // Verificar que el customer existe en Stripe
    const customerExists = await verificarCustomerEnStripe(sub.stripe_customer_id);
    if (!customerExists) {
      console.log('  ❌ Customer no existe en Stripe');
      discrepancias.push({
        tipo: 'customer_no_existe',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `stripe_customer_id=${sub.stripe_customer_id} no existe en Stripe`,
        baseValues: {
          stripe_customer_id: sub.stripe_customer_id,
        },
      });
      continue;
    }

    // Verificar que la suscripción existe en Stripe
    const stripeSub = await verificarSuscripcionEnStripe(sub.stripe_subscription_id);
    if (!stripeSub) {
      console.log('  ❌ Suscripción no existe en Stripe');
      discrepancias.push({
        tipo: 'subscription_no_existe',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `stripe_subscription_id=${sub.stripe_subscription_id} no existe en Stripe`,
        baseValues: {
          stripe_subscription_id: sub.stripe_subscription_id,
        },
      });
      continue;
    }

    // Comparar estados
    if (sub.status !== stripeSub.status) {
      console.log(`  ⚠️  Estado distinto: Base=${sub.status}, Stripe=${stripeSub.status}`);
      discrepancias.push({
        tipo: 'estado_distinto',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `Base: ${sub.status}, Stripe: ${stripeSub.status}`,
        baseValues: { status: sub.status },
        stripeValues: { status: stripeSub.status },
      });
    }

    // Comparar trial_end
    if (!compararFechas(sub.trial_end, stripeSub.trial_end)) {
      console.log(`  ⚠️  trial_end distinto: Base=${formatearFecha(sub.trial_end)}, Stripe=${formatearFecha(stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null)}`);
      discrepancias.push({
        tipo: 'trial_end_distinto',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `Base: ${formatearFecha(sub.trial_end)}, Stripe: ${formatearFecha(stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null)}`,
        baseValues: { trial_end: sub.trial_end },
        stripeValues: { trial_end: stripeSub.trial_end },
      });
    }

    // Comparar plan (si hay metadata en Stripe)
    if (stripeSub.metadata?.planCode && planData?.code && stripeSub.metadata.planCode !== planData.code) {
      console.log(`  ⚠️  Plan distinto: Base=${planData.code}, Stripe metadata=${stripeSub.metadata.planCode}`);
      discrepancias.push({
        tipo: 'plan_distinto',
        organizationId: sub.organization_id,
        organizationName,
        detalles: `Base: ${planData.code}, Stripe metadata: ${stripeSub.metadata.planCode}`,
        baseValues: { plan_code: planData.code },
        stripeValues: { plan_code: stripeSub.metadata.planCode },
      });
    }

    if (discrepancias.filter(d => d.organizationId === sub.organization_id).length === 0) {
      console.log('  ✅ Sincronizada correctamente');
    }
  }

  return {
    total: suscripciones.length,
    conProblemas: new Set(discrepancias.map(d => d.organizationId)).size,
    discrepancias,
  };
}

function imprimirReporte(reporte: Reporte) {
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 REPORTE DE RECONCILIACIÓN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Total de suscripciones verificadas: ${reporte.total}`);
  console.log(`Organizaciones con problemas: ${reporte.conProblemas}`);
  console.log(`Total de discrepancias encontradas: ${reporte.discrepancias.length}\n`);

  if (reporte.discrepancias.length === 0) {
    console.log('✅ Todas las suscripciones están sincronizadas correctamente\n');
    return;
  }

  // Agrupar por tipo
  const porTipo: Record<string, Discrepancia[]> = {};
  for (const disc of reporte.discrepancias) {
    if (!porTipo[disc.tipo]) {
      porTipo[disc.tipo] = [];
    }
    porTipo[disc.tipo].push(disc);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 DISCREPANCIAS POR TIPO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const [tipo, discrepancias] of Object.entries(porTipo)) {
    console.log(`\n🔸 ${tipo.toUpperCase().replace(/_/g, ' ')} (${discrepancias.length})`);
    console.log('─'.repeat(60));
    
    for (const disc of discrepancias) {
      console.log(`\n  Org ${disc.organizationId} - ${disc.organizationName}`);
      console.log(`  ${disc.detalles}`);
      
      if (disc.baseValues) {
        console.log(`  Base: ${JSON.stringify(disc.baseValues)}`);
      }
      if (disc.stripeValues) {
        console.log(`  Stripe: ${JSON.stringify(disc.stripeValues)}`);
      }
    }
    console.log();
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💡 RECOMENDACIONES');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (porTipo.ids_faltantes) {
    console.log('📌 IDs faltantes:');
    console.log('   Las organizaciones sin stripe_customer_id o stripe_subscription_id necesitan');
    console.log('   que se cree la suscripción en Stripe manualmente o mediante corrección automática.\n');
  }

  if (porTipo.estado_distinto) {
    console.log('📌 Estados distintos:');
    console.log('   Revisar si las suscripciones en Stripe fueron canceladas/modificadas');
    console.log('   y actualizar la base de datos con el webhook o manualmente.\n');
  }

  if (porTipo.trial_end_distinto) {
    console.log('📌 Fechas de fin de trial distintas:');
    console.log('   Sincronizar la fecha correcta desde Stripe hacia la base de datos.\n');
  }

  if (porTipo.customer_no_existe || porTipo.subscription_no_existe) {
    console.log('📌 Recursos no existen en Stripe:');
    console.log('   Posible cambio de ambiente (test vs live) o IDs incorrectos.');
    console.log('   Verificar el ambiente de Stripe y corregir los IDs en la base de datos.\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Ejecutar
async function main() {
  try {
    const args = process.argv.slice(2);
    let orgIds: number[] | undefined;

    for (const arg of args) {
      if (arg.startsWith('--org-ids=')) {
        const ids = arg.replace('--org-ids=', '').split(',');
        orgIds = ids.map(id => parseInt(id.trim())).filter(id => !isNaN(id) && id > 0);
      }
    }

    const reporte = await reconciliar(orgIds);
    imprimirReporte(reporte);

    // Exit code 0 si todo está bien, 1 si hay problemas
    process.exit(reporte.discrepancias.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error durante la reconciliación:', error);
    process.exit(1);
  }
}

main();
