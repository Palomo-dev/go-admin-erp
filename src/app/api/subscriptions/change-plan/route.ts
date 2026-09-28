import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';

type PlanRow = { id: number; code: string; name: string; max_modules: number | null; trial_days: number | null; price_usd_month: number; price_usd_year: number; stripe_price_monthly_id: string | null };
type ModuloRow = { code: string; is_core: boolean };
type ModuloOrgRow = { id: number; module_code: string; is_active: boolean };

/**
 * GO-sec (2026-09-24): sesión verificada (`auth.getUser`, no `getSession`),
 * membresía activa y permiso de facturación resuelto en el servidor
 * (`contextoDeFacturacion`: admin o `billing_management`), en lugar de
 * `role_id !== 2`, que dejaba fuera al rol 1 y a los cargos con permiso.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { organizationId?: unknown; newPlanCode?: unknown; billingPeriod?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, 'subscriptions/change-plan');
    const supabase = ctx.supabase;
    const organizationId = ctx.organizationId;
    const newPlanCode = typeof body.newPlanCode === 'string' ? body.newPlanCode : '';
    const billingPeriod = body.billingPeriod === 'yearly' ? 'yearly' : body.billingPeriod === 'monthly' ? 'monthly' : null;

    // Validar parámetros requeridos
    if (!newPlanCode || !billingPeriod) {
      return NextResponse.json(
        { error: 'Parámetros faltantes: newPlanCode, billingPeriod son requeridos' },
        { status: 400 }
      );
    }

    // Obtener información del nuevo plan
    const { data: newPlan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('code', newPlanCode)
      .eq('is_active', true)
      .single();

    if (planError || !newPlan) {
      return NextResponse.json(
        { error: 'Plan no encontrado o no disponible' },
        { status: 404 }
      );
    }

    // Obtener suscripción actual
    const { data: currentSubscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    let subscriptionResult;
    const now = new Date();
    const nextPeriodEnd = new Date();
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + (billingPeriod === 'yearly' ? 12 : 1));

    if (subError && subError.code === 'PGRST116') {
      // No hay suscripción activa, crear nueva
      const { data: newSubscription, error: createError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: organizationId,
          plan_id: newPlan.id,
          status: newPlan.code === 'free' ? 'active' : 'trialing',
          current_period_start: now.toISOString(),
          current_period_end: nextPeriodEnd.toISOString(),
          trial_start: newPlan.trial_days > 0 ? now.toISOString() : null,
          trial_end: newPlan.trial_days > 0 ? 
            new Date(now.getTime() + newPlan.trial_days * 24 * 60 * 60 * 1000).toISOString() : null
        })
        .select()
        .single();

      if (createError) throw createError;
      subscriptionResult = newSubscription;
    } else if (currentSubscription) {
      // Actualizar suscripción existente
      const { data: updatedSubscription, error: updateError } = await supabase
        .from('subscriptions')
        .update({
          plan_id: newPlan.id,
          updated_at: now.toISOString()
        })
        .eq('id', currentSubscription.id)
        .select()
        .single();

      if (updateError) throw updateError;
      subscriptionResult = updatedSubscription;
    }

    // Actualizar el plan en la organización
    const { error: orgUpdateError } = await supabase
      .from('organizations')
      .update({
        plan_id: newPlan.id,
        updated_at: now.toISOString()
      })
      .eq('id', organizationId);

    if (orgUpdateError) throw orgUpdateError;

    // Gestionar módulos según el nuevo plan
    await updateOrganizationModules(organizationId, newPlan, supabase);

    // Determinar el tipo de cambio
    let changeType = 'change';
    let message = `Plan cambiado a ${newPlan.name}`;
    
    if (currentSubscription?.plan) {
      const currentPrice = billingPeriod === 'yearly' ? 
        currentSubscription.plan.price_usd_year : 
        currentSubscription.plan.price_usd_month;
      const newPrice = billingPeriod === 'yearly' ? 
        newPlan.price_usd_year : 
        newPlan.price_usd_month;

      if (newPrice > currentPrice) {
        changeType = 'upgrade';
        message = `Plan actualizado a ${newPlan.name} (Upgrade)`;
      } else if (newPrice < currentPrice) {
        changeType = 'downgrade';
        message = `Plan actualizado a ${newPlan.name} (Downgrade)`;
      }
    }

    // Integración con Stripe - Cambiar plan en Stripe si existe suscripción
    let stripeResult = null;
    if (currentSubscription?.stripe_subscription_id && newPlan.stripe_price_monthly_id) {
      try {
        const { changeSubscriptionPlan } = await import('@/lib/stripe/subscriptionService');
        stripeResult = await changeSubscriptionPlan(
          currentSubscription.stripe_subscription_id,
          newPlanCode,
          billingPeriod
        );
        
        if (stripeResult.success) {
          console.log('✅ Plan actualizado en Stripe:', stripeResult.subscriptionId);
          message += ' - Stripe actualizado';
        } else {
          console.warn('⚠️ Error actualizando Stripe:', stripeResult.error);
        }
      } catch (stripeError: unknown) {
        console.error('⚠️ Error en integración con Stripe:', stripeError);
        // No lanzar error, el cambio en Supabase ya se realizó
      }
    }

    return NextResponse.json({
      success: true,
      message,
      changeType,
      subscription: subscriptionResult,
      plan: newPlan,
      stripeUpdated: stripeResult?.success || false
    });

  } catch (error: unknown) {
    return routeErrorResponse('subscriptions/change-plan', error);
  }
}

// Función auxiliar para actualizar módulos según el plan
async function updateOrganizationModules(organizationId: number, newPlan: Pick<PlanRow, 'max_modules'>, supabase: SupabaseClient) {
  try {
    // Obtener todos los módulos
    const { data: allModules, error: modulesError } = await supabase
      .from('modules')
      .select('*')
      .eq('is_active', true)
      .order('rank');

    if (modulesError) throw modulesError;

    // Obtener módulos actuales de la organización
    const { data: currentOrgModules, error: currentError } = await supabase
      .from('organization_modules')
      .select('*')
      .eq('organization_id', organizationId);

    if (currentError) throw currentError;

    // Determinar qué módulos debería tener según el nuevo plan
    const modulos = (allModules ?? []) as ModuloRow[];
    const actuales = (currentOrgModules ?? []) as ModuloOrgRow[];
    const coreModules = modulos.filter((m) => m.is_core);
    const optionalModules = modulos.filter((m) => !m.is_core);
    
    // Los módulos core siempre están disponibles
    let allowedModules = [...coreModules];
    
    // Agregar módulos opcionales según el límite del plan
    if (newPlan.max_modules) {
      const remainingSlots = newPlan.max_modules - coreModules.length;
      if (remainingSlots > 0) {
        allowedModules = [...allowedModules, ...optionalModules.slice(0, remainingSlots)];
      }
    } else {
      // Plan ilimitado
      allowedModules = modulos;
    }

    // Desactivar módulos que ya no están permitidos
    const allowedCodes = allowedModules.map((m) => m.code);
    const modulesToDisable = actuales.filter(
      (om) => !allowedCodes.includes(om.module_code) && om.is_active
    );

    for (const moduleToDisable of modulesToDisable) {
      await supabase
        .from('organization_modules')
        .update({
          is_active: false,
          disabled_at: new Date().toISOString()
        })
        .eq('id', moduleToDisable.id);
    }

    // Activar módulos que ahora están permitidos
    const currentCodes = actuales.map((om) => om.module_code);
    const modulesToAdd = allowedModules.filter((m) => !currentCodes.includes(m.code));

    for (const moduleToAdd of modulesToAdd) {
      await supabase
        .from('organization_modules')
        .insert({
          organization_id: organizationId,
          module_code: moduleToAdd.code,
          is_active: true,
          enabled_at: new Date().toISOString()
        });
    }

    // Reactivar módulos que estaban desactivados pero ahora están permitidos
    const modulesToReactivate = actuales.filter(
      (om) => allowedCodes.includes(om.module_code) && !om.is_active
    );

    for (const moduleToReactivate of modulesToReactivate) {
      await supabase
        .from('organization_modules')
        .update({
          is_active: true,
          enabled_at: new Date().toISOString(),
          disabled_at: null
        })
        .eq('id', moduleToReactivate.id);
    }

  } catch (error) {
    console.error('Error updating organization modules:', error);
    // No lanzar error para no interrumpir el cambio de plan
  }
}
