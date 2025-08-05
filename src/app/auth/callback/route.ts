import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  console.log('Request URL:', requestUrl);
  const code = requestUrl.searchParams.get('code');
  const token = requestUrl.searchParams.get('token');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const next = requestUrl.searchParams.get('next') || '/app/inicio';
  
  // Extraer redirect_to para manejar invitaciones
  const redirectTo = requestUrl.searchParams.get('redirect_to');
  console.log('Redirect to:', redirectTo);

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
    error,
    errorDescription,
    next
  });

  // Manejar errores de autenticación
  if (error) {
    console.error('Auth callback error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/login?error=${error}&error_description=${encodeURIComponent(errorDescription || '')}`, request.url)
    );
  }

  // Procesar código de confirmación (tanto OAuth como confirmación de email)
  if (code) {
    try {
      console.log('Processing code exchange (OAuth or email confirmation)...');
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(token);
      console.log('Code exchange result:', data, exchangeError);
      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return NextResponse.redirect(
          new URL('/auth/login?error=auth-failed&details=' + encodeURIComponent(exchangeError.message), request.url)
        );
      }
      
      if (data.session && data.user) {
        const user = data.user;
        console.log('Authentication successful for user:', user.id, 'Email:', user.email);
        
        // Para OAuth (Google login), crear o actualizar perfil
        if (user.app_metadata?.provider === 'google') {
          console.log('Processing Google OAuth login...');
          await createOrUpdateUserProfile(supabase, user);
          
          // Verificar si el usuario tiene una organización asignada
          const hasOrganization = await checkUserOrganization(supabase, user.id);
          
          if (hasOrganization) {
            console.log('Google user has organization, redirecting to app...');
            return NextResponse.redirect(new URL(next, request.url));
          } else {
            console.log('Google user has no organization, redirecting to organization creation...');
            return NextResponse.redirect(new URL('/auth/select-organization', request.url));
          }
        } else {
          // Para confirmación de email, verificar si es una invitación
          console.log('Email confirmation successful, checking for invitation...');
          
          // Verificar si redirect_to contiene un código de invitación
          if (redirectTo && redirectTo.includes('/auth/invite?code=')) {
            console.log('Invitation detected in redirect_to, redirecting to invitation page...');
            // Mantener la sesión activa para invitaciones
            return NextResponse.redirect(new URL(redirectTo, request.url));
          } else {
            // Para signup normal, cerrar sesión y redirigir al login
            console.log('Normal signup, redirecting to login...');
            await supabase.auth.signOut();
            
            return NextResponse.redirect(
              new URL('/auth/login?success=email-confirmed&message=' + encodeURIComponent('Tu cuenta ha sido confirmada exitosamente. Por favor, inicia sesión con tu email y contraseña.'), request.url)
            );
          }
        }
      }
    } catch (error: any) {
      console.error('Error processing auth callback:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=callback-processing-failed', request.url)
      );
    }
  }

  // Fallback: si no hay código, redirigir al login
  return NextResponse.redirect(new URL('/auth/login', request.url));
}

// Función para crear o actualizar el perfil del usuario con datos de Google
async function createOrUpdateUserProfile(supabase: any, user: any) {
  try {
    console.log('Creating/updating user profile for:', user.id);
    
    // Extraer datos de Google
    const metadata = user.user_metadata || {};
    const email = user.email;
    const fullName = metadata.full_name || metadata.name || '';
    const firstName = metadata.given_name || metadata.first_name || '';
    const lastName = metadata.family_name || metadata.last_name || '';
    const avatarUrl = metadata.avatar_url || metadata.picture || null;
    
    // Si no tenemos first_name y last_name, intentar dividir full_name
    let finalFirstName = firstName;
    let finalLastName = lastName;
    
    if (!firstName && !lastName && fullName) {
      const nameParts = fullName.trim().split(' ');
      finalFirstName = nameParts[0] || '';
      finalLastName = nameParts.slice(1).join(' ') || '';
    }
    
    // Si aún no tenemos nombres, usar el email como base
    if (!finalFirstName && !finalLastName) {
      finalFirstName = email?.split('@')[0] || 'Usuario';
    }
    
    console.log('Extracted user data:', {
      email,
      firstName: finalFirstName,
      lastName: finalLastName,
      avatarUrl
    });
    
    // Verificar si el perfil ya existe
    const { data: existingProfile, error: profileCheckError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();
    
    if (profileCheckError && profileCheckError.code !== 'PGRST116') {
      console.error('Error checking existing profile:', profileCheckError);
      throw profileCheckError;
    }
    
    if (existingProfile) {
      // Actualizar perfil existente
      console.log('Updating existing profile...');
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          email,
          first_name: finalFirstName,
          last_name: finalLastName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('Error updating profile:', updateError);
        throw updateError;
      }
      
      console.log('Profile updated successfully');
    } else {
      // Crear nuevo perfil
      console.log('Creating new profile...');
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email,
          first_name: finalFirstName,
          last_name: finalLastName,
          avatar_url: avatarUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Error creating profile:', insertError);
        throw insertError;
      }
      
      console.log('Profile created successfully');
    }
  } catch (error: any) {
    console.error('Error in createOrUpdateUserProfile:', error);
    // No lanzar error para no interrumpir el flujo de login
  }
}

// Función para verificar si el usuario tiene una organización asignada
async function checkUserOrganization(supabase: any, userId: string): Promise<boolean> {
  try {
    console.log('Checking user organization for:', userId);
    
    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking organization membership:', error);
      return false;
    }
    
    const hasOrganization = !!membership;
    console.log('User has organization:', hasOrganization);
    
    return hasOrganization;
  } catch (error: any) {
    console.error('Error in checkUserOrganization:', error);
    return false;
  }
}
