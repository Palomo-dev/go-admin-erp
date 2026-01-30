import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    // Crear cliente de Supabase con cookies para autenticación del servidor
    const supabase = createRouteHandlerClient({ cookies });
    
    // Verificar autenticación
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const { organizationId, newPlanCode, billingPeriod } = await request.json();

    // Validar parámetros requeridos
    if (!organizationId || !newPlanCode || !billingPeriod) {
      return NextResponse.json(
        { error: 'Parámetros faltantes: organizationId, newPlanCode, billingPeriod son requeridos' },
        { status: 400 }
      );
    }

    // Verificar que el usuario tiene permisos para cambiar el plan de esta organización
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('role_id, is_super_admin')
      .eq('organization_id', organizationId)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar esta organización' },
        { status: 403 }
      );
    }

    // Solo admins y super admins pueden cambiar planes
    if (memberData.role_id !== 2 && !memberData.is_super_admin) {
      return NextResponse.json(
        { error: 'Solo los administradores pueden cambiar el plan' },
        { status: 403 }
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
      } catch (stripeError: any) {
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

  } catch (error: any) {
    console.error('Error changing plan:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Función auxiliar para actualizar módulos según el plan
async function updateOrganizationModules(organizationId: number, newPlan: any, supabase: any) {
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
    const coreModules = allModules.filter((m: any) => m.is_core);
    const optionalModules = allModules.filter((m: any) => !m.is_core);
    
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
      allowedModules = allModules;
    }

    // Desactivar módulos que ya no están permitidos
    const allowedCodes = allowedModules.map((m: any) => m.code);
    const modulesToDisable = currentOrgModules.filter(
      (om: any) => !allowedCodes.includes(om.module_code) && om.is_active
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
    const currentCodes = currentOrgModules.map((om: any) => om.module_code);
    const modulesToAdd = allowedModules.filter((m: any) => !currentCodes.includes(m.code));

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
    const modulesToReactivate = currentOrgModules.filter(
      (om: any) => allowedCodes.includes(om.module_code) && !om.is_active
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
