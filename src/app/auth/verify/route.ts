import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

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

  // Verificar token de email
  if (token && type === 'signup') {
    try {
      console.log('Verifying email token...');
      
      // Verificar el token
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup'
      });
      
      if (verifyError) {
        console.error('Token verification error:', verifyError);
        return NextResponse.redirect(
          new URL('/auth/login?error=email-verification-failed&details=' + encodeURIComponent(verifyError.message), request.url)
        );
      }
      
      if (data.user && data.session) {
        const user = data.user;
        console.log('Email verification successful for user:', user.id);
        
        // Si es completar signup, redirigir al callback con sesión establecida
        if (completeSignup) {
          console.log('Redirecting to callback to complete signup...');
          return NextResponse.redirect(new URL('/auth/callback?complete_signup=true', request.url));
        }
        
        // Si no es signup, redirigir a la aplicación
        return NextResponse.redirect(new URL('/app/inicio', request.url));
      } else {
        console.error('Verification did not return user or session');
        return NextResponse.redirect(
          new URL('/auth/login?error=verification-failed', request.url)
        );
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
