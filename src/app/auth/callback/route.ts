import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { handleGoogleCallback, type GoogleUser } from '@/lib/auth/googleAuth';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const type = requestUrl.searchParams.get('type');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = requestUrl.searchParams.get('next') || '/app/inicio';

  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  // Si hay error en la URL, redirigir con error
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`, request.url)
    );
  }

  // Manejar reset de contraseña (recovery)
  if (type === 'recovery' && accessToken && refreshToken) {
    try {
      // Establecer la sesión con los tokens de recuperación
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        return NextResponse.redirect(
          new URL('/auth/forgot-password?error=invalid-link', request.url)
        );
      }

      // Redirigir a la página de reset de contraseña
      return NextResponse.redirect(new URL('/auth/reset-password', request.url));
    } catch (error) {
      return NextResponse.redirect(
        new URL('/auth/forgot-password?error=recovery-failed', request.url)
      );
    }
  }

  // Procesar código OAuth
  if (code) {
    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        return NextResponse.redirect(
          new URL('/auth/login?error=auth-callback-failed', request.url)
        );
      }

      if (data.session) {
        const user = data.session.user;
        
        // Verificar si es un login con Google (OAuth)
        const isGoogleAuth = user.app_metadata?.provider === 'google';
        
        if (isGoogleAuth) {
          // Manejar callback de Google OAuth
          const googleUser: GoogleUser = {
            id: user.id,
            email: user.email || '',
            user_metadata: user.user_metadata || {}
          };
          
          const googleResult = await handleGoogleCallback(googleUser);
          
          if (!googleResult.success) {
            return NextResponse.redirect(
              new URL('/auth/login?error=google-callback-failed', request.url)
            );
          }
          
          // Si el usuario de Google necesita seleccionar organización
          if (googleResult.needsOrganization) {
            // Verificar si el usuario tiene organizaciones disponibles
            const { data: memberData, error: memberError } = await supabase
              .from('organization_members')
              .select('organization_id')
              .eq('user_id', user.id)
              .eq('is_active', true);
            
            if (!memberError && memberData && memberData.length > 0) {
              // Tiene organizaciones, redirigir a selección
              return NextResponse.redirect(new URL('/auth/select-organization', request.url));
            } else {
              // No tiene organizaciones, redirigir a crear una o unirse
              return NextResponse.redirect(new URL('/auth/signup?step=organization&google=true', request.url));
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
    } catch (error) {
      return NextResponse.redirect(
        new URL('/auth/login?error=auth-callback-failed', request.url)
      );
    }
  }

  // Si no hay código ni es recovery, redirigir a login
  return NextResponse.redirect(new URL('/auth/login', request.url));
}
