import { NextRequest, NextResponse } from 'next/server';

/**
 * Bridge API route para OAuth redirects en app móvil (Capacitor).
 *
 * Flujo:
 * 1. App móvil inicia OAuth con `signInWithOAuth({ redirectTo: 'https://app.goadmin.io/api/auth/native-callback' })`
 * 2. Supabase redirige a esta ruta con `?code=...` (PKCE) o `?access_token=...&refresh_token=...`
 * 3. Esta ruta responde con redirect 302 a `goadmin://auth-callback?...` (custom URL scheme)
 * 4. El SO abre la app móvil via deep link
 * 5. El listener `App.addListener('appUrlOpen')` en login page captura la URL
 * 6. Se extraen los tokens y se llama `supabase.auth.setSession()`
 *
 * En web/desktop esta ruta no se usa (el callback normal es /auth/callback).
 *
 * Configuración necesaria en Supabase Dashboard → Authentication → URL Configuration:
 * - Additional Redirect URLs: https://app.goadmin.io/api/auth/native-callback
 */

const DEEP_LINK_SCHEME = 'goadmin://auth-callback';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Caso 1: PKCE flow — Supabase envía ?code=...&next=...
  const code = searchParams.get('code');
  if (code) {
    const next = searchParams.get('next') || '/app/inicio';
    const redirectUrl = `${DEEP_LINK_SCHEME}?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(redirectUrl);
  }

  // Caso 2: Token flow — algunos providers envían tokens directamente
  const accessToken = searchParams.get('access_token');
  const refreshToken = searchParams.get('refresh_token');
  if (accessToken && refreshToken) {
    const redirectUrl = `${DEEP_LINK_SCHEME}?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}`;
    return NextResponse.redirect(redirectUrl);
  }

  // Caso 3: Error en OAuth
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  if (error) {
    const redirectUrl = `${DEEP_LINK_SCHEME}?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`;
    return NextResponse.redirect(redirectUrl);
  }

  // Fallback: sin parámetros reconocidos, redirigir a login web
  return NextResponse.redirect(new URL('/auth/login?error=native-callback-invalid-params', request.url));
}
