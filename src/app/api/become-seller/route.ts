import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { auth_user_id, name, email, phone, avatar_url } = await request.json();

    if (!auth_user_id || !email) {
      return NextResponse.json(
        { error: 'auth_user_id y email son requeridos' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: existingSeller } = await supabaseAdmin
      .from('sellers')
      .select('id, referral_code')
      .eq('auth_user_id', auth_user_id)
      .single();

    if (existingSeller) {
      return NextResponse.json({
        seller: existingSeller,
        alreadyExists: true,
        error: null,
      });
    }

    const { data: existingByEmail } = await supabaseAdmin
      .from('sellers')
      .select('id, referral_code')
      .eq('email', email)
      .single();

    if (existingByEmail) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('sellers')
        .update({
          auth_user_id,
          avatar_url: avatar_url || null,
        })
        .eq('id', existingByEmail.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: 'Error al vincular cuenta de vendedor' }, { status: 500 });
      }

      const { password_hash, ...sellerWithoutHash } = updated;
      return NextResponse.json({ seller: sellerWithoutHash, alreadyExists: true, error: null });
    }

    const referralCode = `VEND-${Date.now().toString().slice(-6)}`;
    const { data: sellerData, error: sellerError } = await supabaseAdmin
      .from('sellers')
      .insert({
        name: name || email.split('@')[0],
        email,
        phone: phone || null,
        avatar_url: avatar_url || null,
        referral_code: referralCode,
        status: 'active',
        commission_rate: 10,
        auth_user_id,
      })
      .select()
      .single();

    if (sellerError) {
      if (sellerError.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un vendedor con este email' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Error al crear la cuenta de vendedor' }, { status: 500 });
    }

    const { password_hash, ...sellerWithoutHash } = sellerData;

    try {
      await supabaseAdmin.from('notifications').insert({
        recipient_user_id: auth_user_id,
        channel: 'app',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload: {
          type: 'welcome',
          title: '¡Bienvenido al Portal de Vendedores! 🎉',
          content: `Hola ${sellerWithoutHash.name}, te damos la bienvenida al portal de vendedores de GO Admin. Aquí podrás gestionar tus referidos, comisiones y solicitudes de pago.`,
          seller_id: sellerWithoutHash.id,
        },
      });
    } catch {
      // No interrumpir el flujo si falla la notificación
    }

    return NextResponse.json({
      seller: sellerWithoutHash,
      alreadyExists: false,
      error: null,
    });
  } catch {
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
  }
}
