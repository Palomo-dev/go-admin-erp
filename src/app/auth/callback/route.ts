import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const next = requestUrl.searchParams.get('next') || '/app/inicio';
  const redirectTo = requestUrl.searchParams.get('redirect_to');

  // Almacenar cookies pendientes para aplicar al redirect response
  const pendingCookies = new Map<string, string | null>();
  const cookieStore = await cookies();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'pkce',
        storage: {
          getItem: (key: string) => {
            // Primero buscar en cookies pendientes (guardadas por exchangeCodeForSession)
            if (pendingCookies.has(key)) {
              return pendingCookies.get(key) ?? null;
            }
            return cookieStore.get(key)?.value ?? null;
          },
          setItem: (key: string, value: string) => {
            pendingCookies.set(key, value);
          },
          removeItem: (key: string) => {
            pendingCookies.set(key, null);
          }
        },
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  // Helper: crear redirect con cookies de sesión aplicadas
  function redirectWithCookies(url: string) {
    const response = NextResponse.redirect(new URL(url, request.url));
    pendingCookies.forEach((value, name) => {
      if (value !== null) {
        response.cookies.set(name, value, {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 604800
        });
      } else {
        response.cookies.delete(name);
      }
    });
    return response;
  }

  // Manejar errores de autenticación
  if (error) {
    console.error('Auth callback error:', error, errorDescription);
    return redirectWithCookies(`/auth/login?error=${error}&error_description=${encodeURIComponent(errorDescription || '')}`);
  }

  // Procesar código de confirmación (tanto OAuth como confirmación de email)
  if (code) {
    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (exchangeError) {
        console.error('Code exchange error:', exchangeError);
        return redirectWithCookies('/auth/login?error=auth-failed&details=' + encodeURIComponent(exchangeError.message));
      }
      
      if (data.session && data.user) {
        const user = data.user;
        console.log('Authentication successful for user:', user.id, 'Email:', user.email);
        
        // Para OAuth (Google login), crear o actualizar perfil
        if (user.app_metadata?.provider === 'google') {
          await createOrUpdateUserProfile(supabase, user);
          
          const hasOrganization = await checkUserOrganization(supabase, user.id);
          
          if (hasOrganization) {
            return redirectWithCookies(next);
          } else {
            return redirectWithCookies('/auth/select-organization');
          }
        } else {
          // Para confirmación de email, verificar si es una invitación
          if (redirectTo && redirectTo.includes('/auth/invite?code=')) {
            return redirectWithCookies(redirectTo);
          } else {
            await completeSignupAfterEmailConfirmation(supabase, user);
            await supabase.auth.signOut();
            return redirectWithCookies('/auth/login?success=email-confirmed&message=' + encodeURIComponent('Tu cuenta ha sido confirmada exitosamente. Por favor, inicia sesión con tu email y contraseña.'));
          }
        }
      }
    } catch (error: any) {
      console.error('Error processing auth callback:', error);
      return redirectWithCookies('/auth/login?error=callback-processing-failed');
    }
  }

  return redirectWithCookies('/auth/login');
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

// Función para completar el registro después de confirmar el email
async function completeSignupAfterEmailConfirmation(supabase: any, user: any) {
  try {
    console.log('🚀 Starting complete signup for user:', user.id);
    
    // Extraer datos del signup guardados en metadata
    const metadata = user.user_metadata || {};
    let signupData: any = {};
    
    if (metadata.signup_data) {
      try {
        signupData = JSON.parse(metadata.signup_data);
      } catch (e) {
        console.error('Error parsing signup_data:', e);
        signupData = {};
      }
    }
    
    // 1. Crear perfil del usuario
    console.log('1️⃣ Creating user profile...');
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        first_name: signupData.firstName || metadata.first_name || '',
        last_name: signupData.lastName || metadata.last_name || '',
        email: user.email,
        avatar_url: signupData.avatarUrl || '',
        preferred_language: signupData.preferredLanguage || 'es',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    
    if (profileError) {
      console.error('❌ Error creating profile:', profileError);
      throw profileError;
    }
    console.log('✅ Profile created successfully');
    
    // 2. Crear organización (solo si es tipo 'create')
    if (signupData.joinType === 'create' && signupData.organizationName) {
      console.log('2️⃣ Creating organization...');
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: signupData.organizationName,
          legal_name: signupData.organizationLegalName || signupData.organizationName,
          type_id: parseInt(signupData.organizationTypeId) || 2,
          country: signupData.organizationCountry || 'Colombia',
          country_code: signupData.organizationCountryCode || 'COL',
          tax_id: signupData.organizationTaxId || '',
          email: signupData.organizationEmail || user.email,
          phone: signupData.organizationPhone || '',
          address: signupData.organizationAddress || '',
          city: signupData.organizationCity || '',
          state: signupData.organizationState || '',
          postal_code: signupData.organizationPostalCode || '',
          primary_color: signupData.organizationPrimaryColor || '#3B82F6',
          secondary_color: signupData.organizationSecondaryColor || '#F59E0B',
          created_by: user.id,
          owner_user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (orgError) {
        console.error('❌ Error creating organization:', orgError);
        throw orgError;
      }
      console.log('✅ Organization created with ID:', orgData.id);
      
      // 3. Crear sucursal principal
      console.log('3️⃣ Creating main branch...');
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .insert({
          organization_id: orgData.id,
          name: signupData.branchName || 'Sucursal Principal',
          branch_code: signupData.branchCode || 'MAIN-001',
          address: signupData.branchAddress || '',
          city: signupData.branchCity || '',
          state: signupData.branchState || '',
          country: signupData.branchCountry === 'COL' ? 'Colombia' : (signupData.branchCountry || 'Colombia'),
          postal_code: signupData.branchPostalCode || '',
          phone: signupData.branchPhone || '',
          email: signupData.branchEmail || '',
          is_main: true,
          is_active: true,
          opening_hours: signupData.branchOpeningHours || {
            monday: { open: '09:00', close: '18:00', closed: false },
            tuesday: { open: '09:00', close: '18:00', closed: false },
            wednesday: { open: '09:00', close: '18:00', closed: false },
            thursday: { open: '09:00', close: '18:00', closed: false },
            friday: { open: '09:00', close: '18:00', closed: false },
            saturday: { open: '10:00', close: '15:00', closed: false },
            sunday: { closed: true }
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (branchError) {
        console.error('❌ Error creating branch:', branchError);
        throw branchError;
      }
      console.log('✅ Branch created with ID:', branchData.id);
      
      // 4. Crear membresía del usuario como super admin
      console.log('4️⃣ Creating organization membership...');
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgData.id,
          user_id: user.id,
          role_id: 2, // Admin de organización
          is_super_admin: true,
          is_active: true,
          created_at: new Date().toISOString()
        });
      
      if (memberError) {
        console.error('❌ Error creating membership:', memberError);
        throw memberError;
      }
      console.log('✅ Membership created successfully');
      
      // 5. Crear suscripción
      console.log('5️⃣ Creating subscription...');
      const planId = signupData.subscriptionPlan === 'business' ? 3 : (signupData.subscriptionPlan === 'pro' ? 2 : 1);
      const trialDays = planId === 3 ? 30 : (planId === 2 ? 15 : 0);
      
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .insert({
          organization_id: orgData.id,
          plan_id: planId,
          status: 'active',
          billing_period: signupData.billingPeriod || 'monthly',
          trial_start: new Date().toISOString(),
          trial_end: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          stripe_subscription_id: null,
          stripe_customer_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (subscriptionError) {
        console.error('❌ Error creating subscription:', subscriptionError);
        throw subscriptionError;
      }
      console.log('✅ Subscription created successfully');
      
      console.log('🎉 Complete signup finished successfully!');
    } else {
      console.log('⚠️ Skipping organization creation - join type is not "create" or no organization name');
    }
  } catch (error: any) {
    console.error('❌ Error in completeSignupAfterEmailConfirmation:', error);
    // No lanzar error para no interrumpir el flujo de confirmación
  }
}
