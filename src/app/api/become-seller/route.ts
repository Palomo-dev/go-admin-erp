import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getServerUserClient } from '@/lib/supabase/server-user';

/**
 * POST /api/become-seller — convierte al usuario de la SESIÓN en vendedor.
 *
 * El usuario y su email salen de la sesión (cookies), nunca del body: antes
 * se confiaba en `auth_user_id`/`email` del body con service role, así que
 * cualquiera podía crear o vincular (por email) la ficha de vendedor de otra
 * persona. Si el body trae un `auth_user_id` o `email` distinto → 403.
 */
export async function POST(request: NextRequest) {
  try {
    const userClient = await getServerUserClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, phone, avatar_url } = body ?? {};

    if (body?.auth_user_id && body.auth_user_id !== user.id) {
      console.warn('[api/become-seller] auth_user_id del body distinto de la sesión → 403', { userId: user.id });
      return NextResponse.json({ error: 'Usuario no permitido' }, { status: 403 });
    }
    const sessionEmail = (user.email ?? '').trim();
    if (body?.email && String(body.email).trim().toLowerCase() !== sessionEmail.toLowerCase()) {
      console.warn('[api/become-seller] email del body distinto del de la sesión → 403', { userId: user.id });
      return NextResponse.json({ error: 'Email no permitido' }, { status: 403 });
    }

    const auth_user_id = user.id;
    const email = sessionEmail;

    if (!email) {
      return NextResponse.json(
        { error: 'La cuenta no tiene email' },
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
