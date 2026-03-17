import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    // Obtener token de auth desde el header Authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No autorizado - Token no proporcionado' },
        { status: 401 }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user?.id) {
      return NextResponse.json(
        { error: 'No autorizado - Token inválido' },
        { status: 401 }
      );
    }

    const userId = user.id;

    const { organizationId, billingPeriod } = await request.json();

    // Validar parámetros requeridos
    if (!organizationId || !billingPeriod) {
      return NextResponse.json(
        { error: 'Parámetros faltantes: organizationId y billingPeriod son requeridos' },
        { status: 400 }
      );
    }

    // Validar billingPeriod
    if (!['monthly', 'yearly'].includes(billingPeriod)) {
      return NextResponse.json(
        { error: 'billingPeriod debe ser "monthly" o "yearly"' },
        { status: 400 }
      );
    }

    // Verificar permisos
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('role_id, is_super_admin')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar esta organización' },
        { status: 403 }
      );
    }

    if (memberData.role_id !== 2 && !memberData.is_super_admin) {
      return NextResponse.json(
        { error: 'Solo los administradores pueden cambiar el ciclo de facturación' },
        { status: 403 }
      );
    }

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

  } catch (error: any) {
    console.error('Error changing billing cycle:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
