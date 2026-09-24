import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';

/**
 * GO-sec (2026-09-24): la puerta es `contextoDeFacturacion` (sesión
 * verificada, membresía activa y admin o `billing_management` resuelto en la
 * base), no `role_id !== 2`, que dejaba fuera al rol 1 y a los cargos con
 * permiso. El cliente sigue mandando el Bearer; la sesión es la de las
 * cookies, que el middleware ya exige en esta ruta.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { organizationId?: unknown; billingPeriod?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, 'subscriptions/change-billing');
    const organizationId = ctx.organizationId;
    const billingPeriod = body.billingPeriod;

    // Validar billingPeriod
    if (billingPeriod !== 'monthly' && billingPeriod !== 'yearly') {
      return NextResponse.json(
        { error: 'billingPeriod debe ser "monthly" o "yearly"' },
        { status: 400 }
      );
    }

    // Service role solo tras validar la organización.
    const supabase = getSupabaseAdmin();

    // Obtener suscripción actual (incluir trialing ya que cuentas nuevas están en período de prueba)
    const { data: currentSubscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, plan:plans(*)')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'trialing'])
      .single();

    if (subError || !currentSubscription) {
      return NextResponse.json(
        { error: 'No se encontró una suscripción activa para esta organización' },
        { status: 404 }
      );
    }

    // Calcular nueva fecha de fin del período
    const newPeriodEnd = new Date();
    
    if (billingPeriod === 'yearly') {
      newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
    } else {
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
    }

    // Actualizar suscripción
    const { data: updatedSubscription, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        billing_period: billingPeriod,
        current_period_end: newPeriodEnd.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', currentSubscription.id)
      .select('*, plan:plans(*)')
      .single();

    if (updateError) throw updateError;

    // Calcular nuevo precio según el ciclo de facturación
    const newAmount = billingPeriod === 'yearly' ? 
      currentSubscription.plan.price_usd_year : 
      currentSubscription.plan.price_usd_month;

    // Calcular ahorro/costo adicional
    const currentMonthlyEquivalent = billingPeriod === 'yearly' ? 
      newAmount / 12 : newAmount;
    
    // Determinar el precio anterior basado en el período actual
    const currentPeriodStart = new Date(currentSubscription.current_period_start);
    const currentPeriodEnd = new Date(currentSubscription.current_period_end);
    const currentDiffMonths = (currentPeriodEnd.getFullYear() - currentPeriodStart.getFullYear()) * 12 + 
      (currentPeriodEnd.getMonth() - currentPeriodStart.getMonth());
    const wasYearly = currentDiffMonths >= 11;
    
    const previousAmount = wasYearly ? 
      currentSubscription.plan.price_usd_year : 
      currentSubscription.plan.price_usd_month;
    const previousMonthlyEquivalent = wasYearly ? 
      previousAmount / 12 : previousAmount;
    
    const monthlySavings = previousMonthlyEquivalent - currentMonthlyEquivalent;
    const annualSavings = monthlySavings * 12;

    let message = `Ciclo de facturación cambiado a ${billingPeriod === 'yearly' ? 'anual' : 'mensual'}`;
    
    if (billingPeriod === 'yearly' && annualSavings > 0) {
      message += `. Ahorrarás $${annualSavings.toFixed(2)} USD al año`;
    } else if (billingPeriod === 'monthly' && annualSavings < 0) {
      message += `. El costo adicional será de $${Math.abs(annualSavings).toFixed(2)} USD al año`;
    }

    // Si hay integración con Stripe, aquí se manejaría el cambio de ciclo de facturación
    // TODO: Implementar integración con Stripe para cambios de ciclo reales

    return NextResponse.json({
      success: true,
      message,
      subscription: updatedSubscription,
      savings: {
        monthly: monthlySavings,
        annual: annualSavings
      },
      newAmount,
      billingPeriod
    });

  } catch (error: unknown) {
    return routeErrorResponse('subscriptions/change-billing', error);
  }
}
