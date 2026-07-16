import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
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
