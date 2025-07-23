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
        }
      }
    }
  );

  console.log('Callback received:', {
    code: code ? code.substring(0, 20) + '...' : null,
    token: token ? token.substring(0, 20) + '...' : null,
    error,
    type,
    accessToken: !!accessToken,
    refreshToken: !!refreshToken,
    completeSignup,
    fullUrl: requestUrl.toString()
  });

  // Si hay error en la URL, redirigir con error
  if (error) {
    console.error('Callback error:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/auth/login?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription || '')}`, request.url)
    );
  }

  // Manejar reset de contraseña (recovery)
  if (type === 'recovery' && accessToken && refreshToken) {
    try {
      console.log('Handling password recovery...');
      // Establecer la sesión con los tokens de recuperación
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });

      if (sessionError) {
        console.error('Recovery session error:', sessionError);
        return NextResponse.redirect(
          new URL('/auth/forgot-password?error=invalid-link', request.url)
        );
      }

      // Redirigir a la página de reset de contraseña
      return NextResponse.redirect(new URL('/auth/reset-password', request.url));
    } catch (error) {
      console.error('Recovery error:', error);
      return NextResponse.redirect(
        new URL('/auth/forgot-password?error=recovery-failed', request.url)
      );
    }
  }

  // Manejar verificación de email con token PKCE (prioritario)
  if (type === 'signup' && token) {
    try {
      console.log('Handling PKCE email verification with token:', token.substring(0, 20) + '...');
      
      // Verificar el token PKCE
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'signup'
      });
      
      if (verifyError) {
        console.error('PKCE token verification error:', verifyError);
        return NextResponse.redirect(
          new URL('/auth/login?error=email-verification-failed&details=' + encodeURIComponent(verifyError.message), request.url)
        );
      }
      
      if (data.user && data.session) {
        const user = data.user;
        console.log('PKCE email verification successful for user:', user.id);
        
        // Si es completar signup después de verificación de email
        if (completeSignup && user.user_metadata?.signup_data) {
          try {
            console.log('Completing signup process after PKCE verification...');
            const signupData = JSON.parse(user.user_metadata.signup_data);
            await completeSignupProcess(supabase, user.id, signupData, user.user_metadata);
            
            // Limpiar metadata de signup
            await supabase.auth.updateUser({
              data: { signup_data: null }
            });
            
            console.log('Signup completed successfully after PKCE, redirecting to app...');
            return NextResponse.redirect(new URL('/app/inicio', request.url));
          } catch (signupError: any) {
            console.error('Error completando signup después de PKCE:', signupError);
            return NextResponse.redirect(
              new URL('/auth/login?error=signup-completion-failed&details=' + encodeURIComponent(signupError.message || 'Unknown error'), request.url)
            );
          }
        }
        
        // Si no hay datos de signup, redirigir normalmente
        console.log('PKCE verification successful but no signup data, redirecting to:', next);
        return NextResponse.redirect(new URL(next, request.url));
      } else {
        console.error('PKCE verification did not return user or session');
        return NextResponse.redirect(
          new URL('/auth/login?error=pkce-verification-failed', request.url)
        );
      }
    } catch (error: any) {
      console.error('PKCE email verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=email-verification-error&details=' + encodeURIComponent(error.message || 'Unknown error'), request.url)
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
        
        // Si es completar signup después de verificación de email
        if (completeSignup && user.user_metadata?.signup_data) {
          try {
            console.log('Completing signup process...');
            const signupData = JSON.parse(user.user_metadata.signup_data);
            await completeSignupProcess(supabase, user.id, signupData, user.user_metadata);
            
            // Limpiar metadata después de completar
            await supabase.auth.updateUser({
              data: { signup_data: null }
            });
            
            console.log('Signup completed successfully, redirecting to app...');
            return NextResponse.redirect(new URL('/app/inicio', request.url));
          } catch (signupError: any) {
            console.error('Error completando signup:', signupError);
            return NextResponse.redirect(
              new URL('/auth/login?error=signup-completion-failed&details=' + encodeURIComponent(signupError.message || 'Unknown error'), request.url)
            );
          }
        }
        
        // Si no hay datos de signup, redirigir normalmente
        return NextResponse.redirect(new URL(next, request.url));
      }
    } catch (error) {
      console.error('Email verification error:', error);
      return NextResponse.redirect(
        new URL('/auth/login?error=email-verification-error', request.url)
      );
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
        
        // Completar signup después de verificación de email
        if (user.user_metadata?.signup_data) {
          try {
            console.log('Completing signup process after email verification...');
            const signupData = JSON.parse(user.user_metadata.signup_data);
            await completeSignupProcess(supabase, user.id, signupData, user.user_metadata);
            
            // Limpiar metadata después de completar
            await supabase.auth.updateUser({
              data: { signup_data: null }
            });
            
            console.log('Signup completed successfully, redirecting to app...');
            return NextResponse.redirect(new URL('/app/inicio', request.url));
          } catch (signupError: any) {
            console.error('Error completando signup:', signupError);
            return NextResponse.redirect(
              new URL('/auth/login?error=signup-completion-failed&details=' + encodeURIComponent(signupError.message || 'Unknown error'), request.url)
            );
          }
        } else {
          console.log('No signup data found in user metadata, redirecting normally');
          return NextResponse.redirect(new URL(next, request.url));
        }
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
              // No tiene organizaciones, redirigir a paso 2 (organización) del signup
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

  // Si no hay código ni tokens, redirigir a login
  console.log('No code or tokens found, redirecting to login');
  return NextResponse.redirect(new URL('/auth/login', request.url));
}

// Función para completar el proceso de signup después de verificación
async function completeSignupProcess(supabase: any, userId: string, signupData: any, userMetadata: any) {
  console.log('Completando proceso de signup para usuario:', userId);
  console.log('Datos de signup:', signupData);
  
  try {
    if (signupData.joinType === 'create') {
      console.log('Creando nueva organización...');
      
      // 1. Crear nueva organización
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: signupData.organizationName,
          legal_name: signupData.organizationName,
          type_id: parseInt(signupData.organizationType),
          owner_user_id: userId,
          status: 'active',
          plan_id: 1, // Plan gratuito por defecto
          primary_color: '#3B82F6',
          secondary_color: '#1E40AF',
        })
        .select('id')
        .single();

      if (orgError) {
        console.error('Error creando organización:', orgError);
        throw new Error(`Error al crear organización: ${orgError.message}`);
      }

      console.log('Organización creada con ID:', orgData.id);

      // 2. Crear perfil de usuario
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: userMetadata.email,
          first_name: userMetadata.first_name,
          last_name: userMetadata.last_name,
          last_org_id: orgData.id,
          status: 'active',
          phone: signupData.phone || null,
        });

      if (profileError) {
        console.error('Error creando perfil:', profileError);
        throw new Error(`Error al crear perfil: ${profileError.message}`);
      }

      console.log('Perfil de usuario creado exitosamente');

      // 3. Crear membresía del usuario como administrador
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgData.id,
          user_id: userId,
          role: 'org_admin',
          role_id: 2,
          is_super_admin: true,
          is_active: true,
        })
        .select('id')
        .single();

      if (memberError) {
        console.error('Error creando membresía:', memberError);
        throw new Error(`Error al crear membresía: ${memberError.message}`);
      }

      console.log('Membresía de administrador creada exitosamente');
      
      // 4. Crear sucursal principal
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .insert({
          name: signupData.branchName,
          branch_code: signupData.branchCode,
          address: signupData.branchAddress || '',
          city: signupData.branchCity || '',
          state: signupData.branchState || '',
          country: signupData.branchCountry || '',
          postal_code: signupData.branchPostalCode || '',
          phone: signupData.branchPhone || '',
          email: signupData.branchEmail || '',
          organization_id: orgData.id,
          is_main: true,
          is_active: true,
        })
        .select('id')
        .single();

      if (branchError) {
        console.error('Error creando sucursal:', branchError);
        throw new Error(`Error al crear sucursal: ${branchError.message}`);
      }

      console.log('Sucursal principal creada exitosamente');
      
      // 4.1. Asignar usuario a la sucursal principal
      const { error: memberBranchError } = await supabase
        .from('member_branches')
        .insert({
          organization_member_id: memberData.id,
          branch_id: branchData.id,
        });
      
      if (memberBranchError) {
        console.error('Error asignando usuario a sucursal:', memberBranchError);
        throw new Error(`Error al asignar usuario a sucursal: ${memberBranchError.message}`);
      }
      
      console.log('Usuario asignado a sucursal principal exitosamente');
      
      // 5. Habilitar módulos básicos para la organización
      const basicModules = ['organizations', 'branches', 'roles'];
      const moduleInserts = basicModules.map(moduleCode => ({
        organization_id: orgData.id,
        module_code: moduleCode,
        is_active: true
      }));
      
      const { error: modulesError } = await supabase
        .from('organization_modules')
        .insert(moduleInserts);
      
      if (modulesError) {
        console.error('Error habilitando módulos:', modulesError);
        // No lanzar error, solo advertir ya que no es crítico
        console.warn('Continuando sin habilitar módulos básicos');
      } else {
        console.log('Módulos básicos habilitados exitosamente');
      }
      
      // 6. Configurar moneda base (COP para Colombia)
      const { error: currencyError } = await supabase
        .from('organization_currencies')
        .insert({
          organization_id: orgData.id,
          currency_code: 'COP',
          is_base: true,
          auto_update: true
        });
      
      if (currencyError) {
        console.error('Error configurando moneda:', currencyError);
        console.warn('Continuando sin configurar moneda base');
      } else {
        console.log('Moneda base configurada exitosamente');
      }
      
      // 7. Registrar historial del plan inicial
      const { error: planHistoryError } = await supabase
        .from('plan_history')
        .insert({
          organization_id: orgData.id,
          old_plan_id: null,
          new_plan_id: 1, // Plan gratuito
          user_id: userId,
          reason: 'Organización creada con plan gratuito inicial'
        });
      
      if (planHistoryError) {
        console.error('Error registrando historial de plan:', planHistoryError);
        console.warn('Continuando sin registrar historial de plan');
      } else {
        console.log('Historial de plan registrado exitosamente');
      }
      
    } else if (signupData.joinType === 'join') {
      console.log('Uniéndose a organización existente con código:', signupData.invitationCode);
      
      // 1. Validar código de invitación
      const { data: invitationData, error: invitationError } = await supabase
        .from('invitations')
        .select('organization_id, role_id')
        .eq('code', signupData.invitationCode)
        .eq('status', 'pending')
        .single();

      if (invitationError || !invitationData) {
        throw new Error('Código de invitación inválido o expirado');
      }

      console.log('Invitación válida para organización:', invitationData.organization_id);

      // 2. Crear perfil de usuario
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: userMetadata.email,
          first_name: userMetadata.first_name,
          last_name: userMetadata.last_name,
          last_org_id: invitationData.organization_id,
          status: 'active',
          phone: signupData.phone || null,
        });

      if (profileError) {
        console.error('Error creando perfil:', profileError);
        throw new Error(`Error al crear perfil: ${profileError.message}`);
      }

      console.log('Perfil de usuario creado exitosamente');

      // 3. Crear membresía del usuario en la organización
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: invitationData.organization_id,
          user_id: userId,
          role_id: invitationData.role_id,
          is_super_admin: true,
          is_active: true,
        });

      if (memberError) {
        console.error('Error creando membresía:', memberError);
        throw new Error(`Error al crear membresía: ${memberError.message}`);
      }

      console.log('Membresía creada exitosamente');

      // 4. Marcar invitación como usada
      const { error: updateInvitationError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          used_at: new Date().toISOString(),
          used_by: userId
        })
        .eq('code', signupData.invitationCode);

      if (updateInvitationError) {
        console.warn('Error actualizando invitación:', updateInvitationError);
      }
    }
    
    console.log('Proceso de signup completado exitosamente');
    
  } catch (error: any) {
    console.error('Error en completeSignupProcess:', error);
    throw error;
  }
}
