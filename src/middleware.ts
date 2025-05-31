import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// This function can be marked `async` if using `await` inside
export async function middleware(request: NextRequest) {
  // Create a Supabase client configured to use cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Refresh session if expired - required for Server Components
  const { data: { session } } = await supabase.auth.getSession();

  // If the user is not signed in and the current path is not /auth/*, redirect to /auth/login
  if (!session && !request.nextUrl.pathname.startsWith('/auth/')) {
    const redirectUrl = new URL('/auth/login', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is signed in and the current path is /auth/login, redirect to /app/inicio
  if (session && request.nextUrl.pathname === '/auth/login') {
    const redirectUrl = new URL('/app/inicio', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is signed in and the current path is /auth/* (except /auth/logout), redirect to /app/inicio
  if (session && 
      request.nextUrl.pathname.startsWith('/auth/') && 
      request.nextUrl.pathname !== '/auth/logout') {
    const redirectUrl = new URL('/app/inicio', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  // If the user is not signed in and the current path is /app/*, redirect to /auth/login
  if (!session && request.nextUrl.pathname.startsWith('/app/')) {
    const redirectUrl = new URL('/auth/login', request.url);
    // Add the current URL as a query parameter so we can redirect back after login
    redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Check for organization in subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = hostname.split('.')[0];
  
  // If there's a subdomain that's not 'www' and not localhost, set it in a cookie
  if (subdomain !== 'www' && !hostname.includes('localhost')) {
    const response = NextResponse.next();
    response.cookies.set('organization', subdomain, { 
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
    return response;
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
