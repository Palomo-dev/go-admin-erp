import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Reenvía un magic link a un usuario con invitación pendiente.
 *
 * Se usa cuando el magic link original fue consumido por email prefetch
 * (Gmail/Outlook abren el link automáticamente al recibir el correo,
 * consumiendo el token antes de que el usuario haga clic).
 *
 * Flujo:
 * 1. Recibe email + origin
 * 2. Verifica que haya invitación pendiente para ese email
 * 3. Reenvía magic link con signInWithOtp (mismo flujo que invite/route.ts)
 */
export async function POST(request: Request) {
  try {
    const { email, origin } = await request.json();

    if (!email || !origin) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (email, origin)' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase().trim();

    // Buscar invitación pendiente para este email
    const { data: pendingInvite, error: inviteError } = await admin
      .from('invitations')
      .select('code, organization_id, organization_name, role_id')
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error('Error buscando invitación pendiente:', inviteError);
      return NextResponse.json(
        { error: 'Error buscando invitación pendiente' },
        { status: 500 }
      );
    }

    if (!pendingInvite) {
      return NextResponse.json(
        { error: 'No hay invitaciones pendientes para este correo' },
        { status: 404 }
      );
    }

    const inviteUrl = `${origin}/auth/invite?invite_code=${pendingInvite.code}`;

    // Reenviar magic link (mismo flujo que invite/route.ts para usuarios existentes)
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: otpError } = await anonClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: inviteUrl,
        data: {
          invitation_code: pendingInvite.code,
          organization_id: pendingInvite.organization_id,
          organization_name: pendingInvite.organization_name,
        },
      },
    });

    if (otpError) {
      console.error('Error reenviando Magic Link:', otpError);
      return NextResponse.json(
        { error: 'No se pudo reenviar el enlace. Intenta nuevamente.' },
        { status: 500 }
      );
    }

    console.log('📧 Magic Link reenviado a:', normalizedEmail, 'para invitación:', pendingInvite.code);
    return NextResponse.json({
      success: true,
      email: normalizedEmail,
    });
  } catch (error: any) {
    console.error('Error en /api/auth/invite/resend:', error);
    return NextResponse.json(
      { error: error.message || 'Error inesperado reenviando la invitación' },
      { status: 500 }
    );
  }
}
