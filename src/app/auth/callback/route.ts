import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback, type GoogleUser } from '@/lib/auth/googleAuth';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token = requestUrl.searchParams.get('token');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const type = requestUrl.searchParams.get('type');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = requestUrl.searchParams.get('next') || '/app/inicio';
  const completeSignup = requestUrl.searchParams.get('complete_signup') === 'true';

  // Crear cliente Supabase para server-side con manejo de cookies
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

  console.log('Callback received:', {
    code: code ? code.substring(0, 20) + '...' : null,
    token: token ? token.substring(0, 20) + '...' : null,
    error,
    errorDescription,
    type,
    accessToken: accessToken ? accessToken.substring(0, 20) + '...' : null,
    refreshToken: refreshToken ? refreshToken.substring(0, 20) + '...' : null,
    next,
    completeSignup
  });

  // Manejar errores de autenticación
  if (error) {
    console.error('Auth callback error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/login?error=${error}&error_description=${encodeURIComponent(errorDescription || '')}`, request.url)
    );
  }

  // Nota: La creación de datos de signup ahora se maneja automáticamente
  // por el trigger de base de datos 'complete_signup_after_email_verification'
  // que se ejecuta cuando el email es confirmado.

  // Verificar si hay sesión activa primero (para complete_signup)
  if (completeSignup) {
    try {
      console.log('Complete signup requested, checking current session first...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session && session.user) {
        console.log('Found active session for complete signup, user:', session.user.id);
        
        // El trigger de base de datos ya procesó los datos de signup
        console.log('Active session found for complete signup, redirecting to app...');
        return NextResponse.redirect(new URL('/app/inicio', request.url));
      }
    } catch (error: any) {
      console.error('Error checking active session:', error);
      // Continuar con el flujo normal si falla la verificación de sesión
    }
  }

  // Procesar código de verificación de email (con complete_signup)
  if (code && completeSignup) {
    try {
      console.log('Handling email verification code exchange for signup completion...');
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('Email verification code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL('/auth/login?error=email-verification-failed&details=' + encodeURIComponent(exchangeError.message), request.url)
        );
      }
      
      if (data.session && data.user) {
        const user = data.user;
        console.log('Email verification successful for user:', user.id);
        
        // El trigger de base de datos ya procesó los datos de signup automáticamente
        console.log('Email verification successful, trigger handled signup completion, redirecting to app...');
        return NextResponse.redirect(new URL('/app/inicio', request.url));
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=email-verification-error&details=' + encodeURIComponent(error.message || 'Unknown error'), request.url)
      );
    }
  }

  // Procesar código OAuth (para Google, etc.)
  if (code && !type && !completeSignup) {
    try {
      console.log('Handling OAuth code exchange...');
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('OAuth exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL('/auth/login?error=auth-callback-failed&details=' + encodeURIComponent(exchangeError.message), request.url)
        );
      }

      if (data.session) {
        const user = data.session.user;
        console.log('OAuth session established for user:', user.id);
        
        // Verificar si es un login con Google (OAuth)
        const isGoogleAuth = user.app_metadata?.provider === 'google';
        
        if (isGoogleAuth) {
          console.log('Handling Google OAuth callback for user:', user.id);
          
          // Verificar si el usuario ya tiene un perfil
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, last_org_id')
            .eq('id', user.id)
            .single();
          
          if (profileError || !profile) {
            // Usuario de Google sin perfil, redirigir a paso 2 del signup
            console.log('Google user without profile, redirecting to signup step 2');
            return NextResponse.redirect(new URL('/auth/signup?step=2&google=true', request.url));
          }
          
          // Usuario tiene perfil, verificar si tiene organizaciones
          if (!profile.last_org_id) {
            // Verificar organizaciones disponibles
            const { data: memberData, error: memberError } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', user.id)
              .eq('is_active', true);
            
            if (!memberError && memberData && memberData.length > 0) {
              // Tiene organizaciones, redirigir a selección
              return NextResponse.redirect(new URL('/auth/select-organization', request.url));
            } else {
              // No tiene organizaciones, redirigir a signup paso 2
              return NextResponse.redirect(new URL('/auth/signup?step=2&google=true', request.url));
            }
          }
        }

        // Verificar si el usuario tiene perfil completo
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, last_org_id')
          .eq('id', user.id)
          .single();

        if (profileError || !profile) {
          // Si no hay perfil, redirigir a completar registro
          return NextResponse.redirect(new URL('/auth/signup?step=2', request.url));
        }

        // Redirigir a la página solicitada
        return NextResponse.redirect(new URL(next, request.url));
      } else {
        // No hay sesión, posiblemente email no confirmado
        return NextResponse.redirect(
          new URL('/auth/login?message=email-not-confirmed', request.url)
        );
      }
    } catch (error: any) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=callback-error&details=' + encodeURIComponent(error.message || 'Unknown error'), request.url)
      );
    }
  }

  // Manejar verificación de email con tokens directos
  if (type === 'signup' && accessToken && refreshToken) {
    try {
      console.log('Handling email verification with tokens...');
      
      // Establecer la sesión con los tokens de verificación
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        console.error('Email verification session error:', sessionError);
        return NextResponse.redirect(
          new URL('/auth/login?error=email-verification-failed', request.url)
        );
      }

      if (sessionData.session && sessionData.user) {
        const user = sessionData.user;
        console.log('Email verification successful for user:', user.id);
        
        // Si es completar signup, el trigger ya procesó los datos automáticamente
        if (completeSignup) {
          console.log('Email verification with tokens successful, trigger handled signup, redirecting to app...');
          return NextResponse.redirect(new URL('/app/inicio', request.url));
        }
        
        // Si no hay datos de signup, redirigir normalmente
        return NextResponse.redirect(new URL(next, request.url));
      }
    } catch (error: any) {
      console.error('Email verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=email-verification-error', request.url)
      );
    }
  }

  // Si no hay código ni tokens, redirigir a login
  console.log('No code or tokens found, redirecting to login');
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
