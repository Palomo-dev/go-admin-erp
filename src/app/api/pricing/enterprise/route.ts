import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * API: Obtener precios de Enterprise
 * GET /api/pricing/enterprise
 * 
 * Retorna los precios unitarios configurados para plan Enterprise
 * desde la tabla pricing_config de forma segura (sin exponer service key)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await supabase
      .from('pricing_config')
      .select('base_price, module_unit_price, branch_unit_price, user_unit_price, ai_credit_unit_price, currency')
      .eq('config_key', 'enterprise_default')
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error('Error fetching enterprise pricing:', error);
      // Retornar valores por defecto
      return NextResponse.json({
        basePrice: 199,
        moduleUnitPrice: 49,
        branchUnitPrice: 59,
        userUnitPrice: 19,
        aiCreditUnitPrice: 1,
        currency: 'usd',
      });
    }

    return NextResponse.json({
      basePrice: data.base_price,
      moduleUnitPrice: data.module_unit_price,
      branchUnitPrice: data.branch_unit_price,
      userUnitPrice: data.user_unit_price,
      aiCreditUnitPrice: data.ai_credit_unit_price || 1,
      currency: data.currency,
    });

  } catch (error: any) {
    console.error('Error in enterprise pricing API:', error);
    return NextResponse.json(
      { error: 'Error fetching pricing' },
      { status: 500 }
    );
  }
}
