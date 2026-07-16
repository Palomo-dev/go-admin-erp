import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();

    // Buscar en auth.users por email
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1,
    });

    // listUsers no filtra por email, usamos getUserByEmail alternativo
    // Mejor: intentar recuperar usuario por email via from('profiles') o auth.users
    const { data: existingUser, error: queryError } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (queryError) {
      console.error('Error checking email:', queryError);
      return NextResponse.json({ exists: false });
    }

    if (existingUser) {
      return NextResponse.json({ exists: true });
    }

    // Fallback: buscar en auth.users directamente (si RLS lo permite con service role)
    const { data: authUser } = await admin.auth.admin.getUserByEmail(email);

    if (authUser?.user) {
      return NextResponse.json({ exists: true });
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    console.error('Error in check-email:', error);
    return NextResponse.json({ exists: false });
  }
}
