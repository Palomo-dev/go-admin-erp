#!/usr/bin/env node

/**
 * Script de análisis de organizaciones con módulos fuera de su plan (GO-156)
 *
 * SOLO LECTURA: no modifica datos de producción.
 *
 * Identifica organizaciones que tienen módulos activos que su plan actual
 * no incluye en module_config.available_modules.
 *
 * Uso:
 *   node scripts/analyze-module-plan-compliance.js
 *   node scripts/analyze-module-plan-compliance.js --format=json
 *   node scripts/analyze-module-plan-compliance.js --format=csv
 *
 * Salida:
 *   - Cuenta de organizaciones afectadas
 *   - Lista detallada: org_id, plan, módulos no permitidos
 *   - Totales por módulo "fuera de lugar"
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Cliente de solo lectura
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

async function analyzeModulePlanCompliance() {
  console.log('='.repeat(70));
  console.log('Análisis de módulos activos vs restricciones de plan (GO-156)');
  console.log('='.repeat(70));
  console.log();

  // 1. Obtener todos los planes con su configuración de módulos
  const { data: plans, error: plansError } = await supabase
    .from('plans')
    .select('id, code, name, module_config, is_active');

  if (plansError) {
    console.error('Error obteniendo planes:', plansError);
    process.exit(1);
  }

  // Construir mapa: plan_id -> módulos permitidos
  const planModules = new Map();
  plans.forEach(plan => {
    if (!plan.module_config) {
      planModules.set(plan.id, { code: plan.code, name: plan.name, allowed: [] });
      return;
    }

    const coreModules = plan.module_config.core_modules || [];
    const availableModules = plan.module_config.available_modules || [];
    const allAllowed = [...coreModules, ...availableModules];

    planModules.set(plan.id, {
      code: plan.code,
      name: plan.name,
      allowed: allAllowed,
      is_active: plan.is_active
    });
  });

  // 2. Obtener organizaciones activas con sus módulos activos
  const { data: orgs, error: orgsError } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      subscriptions!inner(
        id,
        plan_id,
        status,
        plans!inner(
          id,
          code,
          name
        )
      )
    `)
    .eq('subscriptions.status', 'active')
    .order('id');

  if (orgsError) {
    console.error('Error obteniendo organizaciones:', orgsError);
    process.exit(1);
  }

  // 3. Para cada organización, obtener sus módulos activos
  const affectedOrgs = [];
  const moduleViolationCounts = {};

  for (const org of orgs) {
    const subscription = Array.isArray(org.subscriptions)
      ? org.subscriptions[0]
      : org.subscriptions;

    if (!subscription) continue;

    const plan = subscription.plans;
    const planInfo = planModules.get(plan.id);

    if (!planInfo) continue;

    // Obtener módulos activos no-core de esta organización
    const { data: activeModules, error: modulesError } = await supabase
      .from('organization_modules')
      .select('module_code, modules!inner(is_core)')
      .eq('organization_id', org.id)
      .eq('is_active', true);

    if (modulesError) {
      console.warn(`Error obteniendo módulos de org ${org.id}:`, modulesError);
      continue;
    }

    // Filtrar módulos que NO están permitidos en el plan
    const unauthorizedModules = activeModules
      .filter(am => !planInfo.allowed.includes(am.module_code))
      .map(am => am.module_code);

    if (unauthorizedModules.length > 0) {
      affectedOrgs.push({
        org_id: org.id,
        // No incluimos el nombre real de la organización (repositorio público)
        plan_code: planInfo.code,
        plan_name: planInfo.name,
        subscription_status: subscription.status,
        unauthorized_modules: unauthorizedModules
      });

      // Contar por módulo
      unauthorizedModules.forEach(moduleCode => {
        moduleViolationCounts[moduleCode] = (moduleViolationCounts[moduleCode] || 0) + 1;
      });
    }
  }

  // 4. Mostrar resultados
  console.log(`Total de organizaciones analizadas: ${orgs.length}`);
  console.log(`Organizaciones con módulos fuera de plan: ${affectedOrgs.length}`);
  console.log();

  if (affectedOrgs.length === 0) {
    console.log('✅ No se encontraron organizaciones con módulos fuera de su plan.');
    return;
  }

  console.log('Resumen por módulo:');
  console.log('-'.repeat(50));
  Object.entries(moduleViolationCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([moduleCode, count]) => {
      console.log(`  ${moduleCode}: ${count} organizaciones`);
    });
  console.log();

  console.log('Detalle de organizaciones afectadas:');
  console.log('-'.repeat(70));
  console.log('Org ID | Plan       | Estado    | Módulos no permitidos');
  console.log('-'.repeat(70));

  affectedOrgs.forEach(org => {
    const modulesStr = org.unauthorized_modules.join(', ');
    console.log(
      `${String(org.org_id).padEnd(6)} | ` +
      `${org.plan_code.padEnd(10)} | ` +
      `${org.subscription_status.padEnd(9)} | ` +
      modulesStr
    );
  });

  console.log();
  console.log('Nota: los nombres de organizaciones no se muestran (repositorio público).');
  console.log();

  // Salida en formato JSON si se solicita
  const args = process.argv.slice(2);
  if (args.includes('--format=json')) {
    console.log('='.repeat(70));
    console.log('Salida JSON:');
    console.log(JSON.stringify({
      total_analyzed: orgs.length,
      total_affected: affectedOrgs.length,
      module_violations: moduleViolationCounts,
      affected_organizations: affectedOrgs
    }, null, 2));
  }

  if (args.includes('--format=csv')) {
    console.log('='.repeat(70));
    console.log('Salida CSV:');
    console.log('org_id,plan_code,plan_name,subscription_status,unauthorized_modules');
    affectedOrgs.forEach(org => {
      console.log(
        `${org.org_id},${org.plan_code},"${org.plan_name}",${org.subscription_status},"${org.unauthorized_modules.join(';')}"`
      );
    });
  }
}

analyzeModulePlanCompliance().catch(err => {
  console.error('Error ejecutando análisis:', err);
  process.exit(1);
});
