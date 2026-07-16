/**
 * API para validar cupones de suscripción
 * Verifica que el cupón exista, esté activo y no haya excedido su límite de redenciones
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Código de cupón requerido' },
        { status: 400 }
      );
    }

    const normalizedCode = code.toUpperCase().trim();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: coupon, error } = await supabase
      .from('subscription_coupons')
      .select('*')
      .eq('code', normalizedCode)
      .eq('is_active', true)
      .single();

    if (error || !coupon) {
      return NextResponse.json({
        valid: false,
        error: 'Cupón no válido o no encontrado',
      });
    }

    // Verificar vigencia por fechas
    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return NextResponse.json({
        valid: false,
        error: 'Este cupón aún no está disponible',
      });
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return NextResponse.json({
        valid: false,
        error: 'Este cupón ha expirado',
      });
    }

    // Verificar límite de redenciones
    if (coupon.max_redemptions && coupon.redemption_count >= coupon.max_redemptions) {
      return NextResponse.json({
        valid: false,
        error: 'Este cupón ha alcanzado su límite de uso',
      });
    }

    // Construir descripción del descuento
    let discountDescription = '';
    if (coupon.discount_type === 'percentage') {
      discountDescription = `${coupon.discount_value}% de descuento`;
    } else {
      discountDescription = `$${coupon.discount_value} de descuento`;
    }

    let durationDescription = '';
    if (coupon.duration_months === 0 || coupon.duration_months === null) {
      durationDescription = 'para siempre';
    } else if (coupon.duration_months === 1) {
      durationDescription = 'por 1 mes';
    } else {
      durationDescription = `por ${coupon.duration_months} meses`;
    }

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name,
        discountType: coupon.discount_type,
        discountValue: Number(coupon.discount_value),
        durationMonths: coupon.duration_months,
        stripeCouponId: coupon.stripe_coupon_id,
        discountDescription,
        durationDescription,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error del servidor';
    return NextResponse.json(
      { valid: false, error: errorMessage },
      { status: 500 }
    );
  }
}
