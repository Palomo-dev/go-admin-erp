import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { completeSignupAfterEmailConfirmation } from '@/app/auth/callback/route';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get('token');
  const type = requestUrl.searchParams.get('type');
  const completeSignup = requestUrl.searchParams.get('complete_signup') === 'true';

  console.log('Verify endpoint called:', {
    token: token ? token.substring(0, 20) + '...' : null,
    type,
    completeSignup,
    fullUrl: requestUrl.toString()
  });

  // Crear cliente Supabase para server-side
  const cookieStore = await cookies();
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        storage: {
          getItem: (key: string) => {
            return cookieStore.get(key)?.value ?? null;
          },
          setItem: (key: string, value: string) => {
            cookieStore.set(key, value, {
              httpOnly: false,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/'
            });
          },
          removeItem: (key: string) => {
            cookieStore.delete(key);
          }
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // Tipos de OTP soportados por verifyOtp para links de email (sin PKCE, funcionan cross-device)
  const supportedTypes = ['signup', 'recovery', 'email_change', 'invite'];

  if (token && type && supportedTypes.includes(type)) {
    try {
      console.log('Verifying email token, type:', type);
      
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: type as 'signup' | 'recovery' | 'email_change' | 'invite'
      });
      
      if (verifyError) {
        console.error('Token verification error:', verifyError);
        return NextResponse.redirect(
          new URL('/auth/login?error=email-verification-failed&details=' + encodeURIComponent(verifyError.message), request.url)
        );
      }
      
      if (!data.user || !data.session) {
        console.error('Verification did not return user or session');
        return NextResponse.redirect(
          new URL('/auth/login?error=verification-failed', request.url)
        );
      }

      const user = data.user;
      console.log('Email verification successful for user:', user.id, 'type:', type);

      // signup: completar registro (crear perfil, organización, etc.) y redirigir
      if (type === 'signup') {
        if (completeSignup) {
          console.log('Completando registro tras verificación de email...');
          const { alreadyExisted } = await completeSignupAfterEmailConfirmation(supabase, user);

          if (alreadyExisted) {
            // El perfil ya existía (signup con sesión inmediata, sin bloqueo por
            // confirmación). Este correo solo confirma el email; la sesión sigue
            // activa, así que se manda directo a la app sin re-loguear.
            return NextResponse.redirect(new URL('/app/inicio?email_confirmed=true', request.url));
          }

          // Caso legado: el perfil se creó apenas ahora, se pide login limpio.
          await supabase.auth.signOut();
          return NextResponse.redirect(
            new URL('/auth/login?success=email-confirmed&message=' + encodeURIComponent('Tu cuenta ha sido confirmada exitosamente. Por favor, inicia sesión con tu email y contraseña.'), request.url)
          );
        }
        return NextResponse.redirect(new URL('/app/inicio', request.url));
      }

      // recovery: la sesión ya queda establecida (cookies); redirigir a reset-password
      // para que el usuario defina su nueva contraseña
      if (type === 'recovery') {
        return NextResponse.redirect(new URL('/auth/reset-password', request.url));
      }

      // email_change: el correo ya fue actualizado por verifyOtp; cerrar sesión y
      // pedir que inicie sesión de nuevo con el nuevo correo
      if (type === 'email_change') {
        await supabase.auth.signOut();
        return NextResponse.redirect(
          new URL('/auth/login?success=email-changed&message=' + encodeURIComponent('Tu correo electrónico ha sido actualizado exitosamente. Por favor, inicia sesión con tu nuevo correo.'), request.url)
        );
      }

      // invite: sesión establecida con contraseña temporal; redirigir a reset-password
      // para que el usuario defina su contraseña definitiva
      if (type === 'invite') {
        return NextResponse.redirect(new URL('/auth/reset-password', request.url));
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=email-verification-error&details=' + encodeURIComponent(error.message || 'Unknown error'), request.url)
      );
    }
  }

  // Si no hay token válido, redirigir a login
  console.log('No valid token found, redirecting to login');
  return NextResponse.redirect(new URL('/auth/login?error=invalid-verification-link', request.url));
}
