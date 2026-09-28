import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';

/**
 * Pública a propósito (el registro pregunta si el correo ya existe antes de
 * que haya cuenta). GO-sec (2026-09-24): con freno por IP, porque sin él
 * servía para enumerar en bloque qué correos tienen cuenta.
 */
const LIMITE_IP = { limit: 20, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  try {
    const rl = await checkRateLimits([{ key: `auth:check-email:ip:${getClientIp(request)}`, opts: LIMITE_IP }]);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, { status: 429 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Usar RPC function que consulta auth.users directamente (SECURITY DEFINER)
    const { data: existsInAuth, error: rpcError } = await admin
      .rpc('check_email_exists', { p_email: email.toLowerCase() });

    if (rpcError) {
      console.error('Error en RPC check_email_exists:', rpcError);
      // Fallback: buscar en profiles
      const { data: existingUser } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .limit(1)
        .maybeSingle();

      return NextResponse.json({ exists: !!existingUser });
    }

    if (existsInAuth) {
      return NextResponse.json({ exists: true });
    }

    // Verificar también en profiles por si acaso
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ exists: !!existingProfile });
  } catch (error) {
    console.error('Error in check-email:', error);
    return NextResponse.json({ exists: false });
  }
}
