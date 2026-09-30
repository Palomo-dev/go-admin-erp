import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { parseCodigoTarifaPorDefecto, setOrganizationDefaultTaxByCode } from '@/lib/services/defaultTaxService';

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
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  // Helper: crear redirect con cookies de sesión aplicadas.
  // Incluye chunking para cookies grandes (sesiones con user_metadata extenso
  // pueden exceder el límite de 4096 bytes por cookie). El cliente (config.ts)
  // ya lee cookies chunked (name.0, name.1, ...).
  // Codificamos nosotros mismos y dividimos el valor YA CODIFICADO, seteando
  // los Set-Cookie headers directamente para evitar la doble codificación de
  // Next.js (que expande cada char especial 3x, haciendo que chunks de 3500
  // raw chars se conviertan en 7000+ bytes codificados, excediendo el límite).
  function redirectWithCookies(url: string) {
    const response = NextResponse.redirect(new URL(url, request.url));
    const isProduction = process.env.NODE_ENV === 'production';
    const flags = `Path=/; Max-Age=604800; SameSite=Lax${isProduction ? '; Secure' : ''}`;
    const deleteFlags = `Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`;

    pendingCookies.forEach((value, name) => {
      if (value !== null) {
        // Primero, borrar cookie simple y chunks anteriores
        response.headers.append('Set-Cookie', `${name}=; ${deleteFlags}`);
        for (let i = 0; i < 10; i++) {
          response.headers.append('Set-Cookie', `${name}.${i}=; ${deleteFlags}`);
        }

        const encodedValue = encodeURIComponent(value);

        if (encodedValue.length < 3600) {
          response.headers.append('Set-Cookie', `${name}=${encodedValue}; ${flags}`);
        } else {
          const CHUNK_SIZE = 3500;
          let chunkIndex = 0;
          let offset = 0;
          while (offset < encodedValue.length) {
            let end = Math.min(offset + CHUNK_SIZE, encodedValue.length);
            if (end < encodedValue.length) {
              if (encodedValue[end - 2] === '%') end -= 2;
              else if (encodedValue[end - 1] === '%') end -= 1;
            }
            const chunk = encodedValue.substring(offset, end);
            response.headers.append('Set-Cookie', `${name}.${chunkIndex}=${chunk}; ${flags}`);
            offset = end;
            chunkIndex++;
          }
          console.log(`🍪 [CALLBACK] Cookie chunked: ${name} (${chunkIndex} chunks, ${encodedValue.length} bytes encoded)`);
        }
      } else {
        response.headers.append('Set-Cookie', `${name}=; ${deleteFlags}`);
        for (let i = 0; i < 10; i++) {
          response.headers.append('Set-Cookie', `${name}.${i}=; ${deleteFlags}`);
        }
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
        
        // Si el código ya fue consumido (request concurrente), redirigir sin error
        // La autenticación probablemente ya tuvo éxito en la otra request
        if (exchangeError.code === 'flow_state_not_found') {
          console.log('Code already consumed by concurrent request, redirecting to select-organization');
          return redirectWithCookies('/auth/select-organization');
        }
        
        return redirectWithCookies('/auth/login?error=auth-failed&details=' + encodeURIComponent(exchangeError.message));
      }
      
      if (data.session && data.user) {
        const user = data.user;
        console.log('Authentication successful for user:', user.id, 'Email:', user.email);
        
        // OAuth (Google y, en la app, Microsoft): crear o actualizar el perfil.
        // Antes solo se reconocía Google y cualquier otro proveedor se trataba
        // como confirmación de correo (Microsoft terminaba en un login vacío).
        const proveedor = user.app_metadata?.provider;
        if (proveedor && proveedor !== 'email' && proveedor !== 'phone') {
          // Cookie para hidratación client-side (la página select-organization la lee como fallback)
          pendingCookies.set('go-admin-oauth-session', JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          }));

          await createOrUpdateUserProfile(supabase, user);
          
          const hasOrganization = await checkUserOrganization(supabase, user.id);
          
          // NO eliminar la cookie sb-${projectRef}-auth-token: el cliente la necesita para persistir la sesión
          // La cookie go-admin-oauth-session sirve como fallback para hidratar en select-organization
          
          // Redirigir sin tokens en URL (la cookie go-admin-oauth-session se usa como fallback)
          if (hasOrganization) {
            return redirectWithCookies('/auth/select-organization?dest=' + encodeURIComponent(next));
          } else {
            return redirectWithCookies('/auth/select-organization');
          }
        } else {
          // Para confirmación de email, verificar si es una invitación
          if (redirectTo && redirectTo.includes('/auth/invite?code=')) {
            return redirectWithCookies(redirectTo);
          } else {
            // Confirmación del correo (acceso v3, R5 opción B): perfil (y la
            // organización de altas antiguas con signup_data) y se sigue con la
            // sesión abierta: sin organización, al asistente de alta.
            await completeSignupAfterEmailConfirmation(supabase, user);
            const tieneOrganizacion = await checkUserOrganization(supabase, user.id);
            return redirectWithCookies(tieneOrganizacion ? '/app/inicio?email_confirmed=true' : '/auth/signup/organizacion');
          }
        }
      }
    } catch (error: unknown) {
      console.error('Error processing auth callback:', error);
      return redirectWithCookies('/auth/login?error=callback-processing-failed');
    }
  }

  return redirectWithCookies('/auth/login');
}

// Función para crear o actualizar el perfil del usuario con datos de Google
async function createOrUpdateUserProfile(supabase: SupabaseClient, user: User) {
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
          auth_provider: user.app_metadata?.provider || 'email',
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
          auth_provider: user.app_metadata?.provider || 'email',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('Error creating profile:', insertError);
        throw insertError;
      }
      
      console.log('Profile created successfully');
    }
  } catch (error: unknown) {
    console.error('Error in createOrUpdateUserProfile:', error);
    // No lanzar error para no interrumpir el flujo de login
  }
}

// Función para verificar si el usuario tiene una organización asignada
async function checkUserOrganization(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    console.log('Checking user organization for:', userId);
    
    const { data: membership, error } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error checking organization membership:', error);
      return false;
    }
    
    const hasOrganization = !!membership;
    console.log('User has organization:', hasOrganization);
    
    return hasOrganization;
  } catch (error: unknown) {
    console.error('Error in checkUserOrganization:', error);
    return false;
  }
}

// Función para completar el registro después de confirmar el email
// Devuelve { alreadyExisted: true } si el perfil ya existía (creado en el signup
// inmediato, ya que "Confirm email" está desactivado) para que el caller decida
// el redirect sin repetir la creación de datos.
export async function completeSignupAfterEmailConfirmation(supabase: SupabaseClient, user: User): Promise<{ alreadyExisted: boolean }> {
  try {
    console.log('🚀 Starting complete signup for user:', user.id);

    // Idempotencia: si el perfil ya existe, todo el registro ya se creó
    // (signup con sesión inmediata) y este correo solo confirma el email.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) {
      console.log('ℹ️ Profile ya existe, se omite la creación de datos (idempotente)');
      return { alreadyExisted: true };
    }
    
    // Extraer datos del signup guardados en metadata
    const metadata = user.user_metadata || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON heredado de altas antiguas (signup_data), sin esquema
    let signupData: Record<string, any> = {};
    
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

      // Determinar plan_id desde el nombre del plan (soporta sufijos como 'ultimate-yearly')
      const planSlug = (signupData.subscriptionPlan || '').toLowerCase();
      const planId = planSlug.startsWith('ultimate') ? 5 : (planSlug.startsWith('business') ? 3 : (planSlug.startsWith('pro') ? 2 : 1));

      // Determinar billing_period desde subscriptionPlan si billingPeriod no está explícitamente
      const billingPeriod = signupData.billingPeriod || (planSlug.includes('yearly') ? 'yearly' : 'monthly');

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
          plan_id: planId,
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
      
      // 3. Actualizar la sucursal principal
      // NOTA: un trigger de la BD (trg_create_default_branch_and_period) ya crea
      // automáticamente la sucursal principal al insertar la organización.
      // Aquí solo actualizamos sus datos con la información capturada en el signup.
      console.log('3️⃣ Updating main branch with signup data...');
      const { error: branchError } = await supabase
        .from('branches')
        .update({
          name: signupData.branchName || 'Sucursal Principal',
          branch_code: signupData.branchCode || 'MAIN-001',
          address: signupData.branchAddress || signupData.organizationAddress || null,
          city: signupData.branchCity || signupData.organizationCity || null,
          state: signupData.branchState || signupData.organizationState || null,
          country: (signupData.branchCountry || signupData.organizationCountry || 'Colombia') === 'COL' ? 'Colombia' : (signupData.branchCountry || signupData.organizationCountry || 'Colombia'),
          postal_code: signupData.branchPostalCode || signupData.organizationPostalCode || null,
          phone: signupData.branchPhone || signupData.organizationPhone || null,
          email: signupData.branchEmail || signupData.organizationEmail || user.email || null,
          manager_id: user.id,
          opening_hours: signupData.branchOpeningHours || {
            monday: { open: '09:00', close: '18:00', closed: false },
            tuesday: { open: '09:00', close: '18:00', closed: false },
            wednesday: { open: '09:00', close: '18:00', closed: false },
            thursday: { open: '09:00', close: '18:00', closed: false },
            friday: { open: '09:00', close: '18:00', closed: false },
            saturday: { open: '10:00', close: '15:00', closed: false },
            sunday: { closed: true }
          },
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', orgData.id)
        .eq('is_main', true);
      
      if (branchError) {
        console.error('❌ Error updating branch:', branchError);
        throw branchError;
      }
      console.log('✅ Branch updated successfully with org data fallback and manager assigned');
      
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

      // 4.1. Tarifa por defecto para productos sin impuesto, elegida en el
      // registro. La organización es la recién creada en esta misma función
      // con la sesión del usuario (no viene del cuerpo); el código se valida
      // contra la lista cerrada de opciones. No bloquea el registro.
      const defaultTaxCode = parseCodigoTarifaPorDefecto(signupData.defaultTaxCode);
      if (defaultTaxCode) {
        try {
          await setOrganizationDefaultTaxByCode(supabase, orgData.id, defaultTaxCode);
        } catch (taxError) {
          console.warn('⚠️ No se pudo guardar la tarifa por defecto:', taxError);
        }
      }
      
      // 4.5. Crear registro en member_branches para que la asignación sea visible
      const { data: memberRecord, error: memberFetchError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgData.id)
        .eq('user_id', user.id)
        .single();

      if (memberFetchError) {
        console.warn('⚠️ No se pudo obtener el member_id para member_branches:', memberFetchError);
      } else if (memberRecord) {
        const { data: mainBranch, error: branchFetchError } = await supabase
          .from('branches')
          .select('id')
          .eq('organization_id', orgData.id)
          .eq('is_main', true)
          .single();

        if (branchFetchError) {
          console.warn('⚠️ No se pudo obtener la sucursal principal para member_branches:', branchFetchError);
        } else if (mainBranch) {
          const { error: memberBranchError } = await supabase
            .from('member_branches')
            .insert({
              organization_member_id: memberRecord.id,
              branch_id: mainBranch.id
            });
          if (memberBranchError) {
            console.warn('⚠️ No se pudo crear registro en member_branches:', memberBranchError);
          } else {
            console.log('✅ Usuario asignado a la sucursal principal en member_branches');
          }
        }
      }
      
      // 5. Crear customer y suscripción en Stripe (siempre, incluso si se salta la tarjeta)
      console.log('5️⃣ Syncing Stripe customer and subscription...');

      let stripeCustomerId = signupData.stripeCustomerId;
      let stripeSubscriptionId: string | null = null;
      let trialDays = 15; // default
      let trialEndTimestamp: number | null = null;
      let currentPeriodStartTimestamp: number | null = null;
      let currentPeriodEndTimestamp: number | null = null;

      // Obtener datos del plan de la BD (trial_days, price_ids)
      const { data: planData } = await supabase
        .from('plans')
        .select('code, trial_days, stripe_price_monthly_id, stripe_price_yearly_id')
        .eq('id', planId)
        .maybeSingle();

      trialDays = planData?.trial_days || 15;
      const planCode = planData?.code || (planId === 5 ? 'ultimate' : planId === 3 ? 'business' : 'pro');
      const priceId = billingPeriod === 'yearly' ? planData?.stripe_price_yearly_id : planData?.stripe_price_monthly_id;

      if (process.env.STRIPE_SECRET_KEY && priceId) {
        try {
          // Importar Stripe de forma lazy para no bloquear si no está configurado
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: '2024-11-20.acacia',
          });

          // Caso 1: Usuario saltó la tarjeta -> crear customer y subscription
          if (!stripeCustomerId) {
            // Idempotencia: verificar si ya existe una suscripción para esta organización
            const { data: existingSub } = await supabase
              .from('subscriptions')
              .select('stripe_subscription_id, stripe_customer_id')
              .eq('organization_id', orgData.id)
              .maybeSingle();

            if (existingSub?.stripe_subscription_id) {
              console.log('✅ Subscription already exists, reusing:', existingSub.stripe_subscription_id);
              stripeSubscriptionId = existingSub.stripe_subscription_id;
              stripeCustomerId = existingSub.stripe_customer_id;
              
              // Obtener datos actuales de Stripe para sincronizar fechas
              const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
              trialEndTimestamp = subscription.trial_end;
              currentPeriodStartTimestamp = (subscription as unknown as { current_period_start?: number }).current_period_start || null;
              currentPeriodEndTimestamp = (subscription as unknown as { current_period_end?: number }).current_period_end || null;
            } else {
              // Crear customer en Stripe con idempotencyKey
              const customer = await stripe.customers.create({
                email: user.email || signupData.organizationEmail || '',
                name: signupData.organizationName,
                metadata: {
                  organizationId: orgData.id.toString(),
                  userId: user.id,
                  createdFrom: 'registration',
                },
              }, {
                idempotencyKey: `signup-customer-${orgData.id}`,
              });
              stripeCustomerId = customer.id;
              console.log('✅ Stripe customer created:', stripeCustomerId);

              // Crear suscripción en trial en Stripe con idempotencyKey
              const subscription = await stripe.subscriptions.create({
                customer: customer.id,
                items: [{ price: priceId }],
                trial_period_days: trialDays,
                payment_behavior: 'default_incomplete',
                payment_settings: {
                  save_default_payment_method: 'on_subscription',
                },
                metadata: {
                  organizationId: orgData.id.toString(),
                  planCode: planCode,
                  billingPeriod: billingPeriod,
                  createdFrom: 'registration',
                },
              }, {
                idempotencyKey: `signup-sub-${orgData.id}`,
              });
              stripeSubscriptionId = subscription.id;
              trialEndTimestamp = subscription.trial_end;
              currentPeriodStartTimestamp = (subscription as unknown as { current_period_start?: number }).current_period_start || null;
              currentPeriodEndTimestamp = (subscription as unknown as { current_period_end?: number }).current_period_end || null;
              console.log('✅ Stripe subscription created in trial:', stripeSubscriptionId);
            }
          } 
          // Caso 2: Usuario proporcionó tarjeta -> buscar la suscripción existente
          else {
            console.log('✅ User provided payment method, customer exists:', stripeCustomerId);
            
            // Buscar la suscripción del customer en Stripe
            const subscriptions = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              limit: 1,
              status: 'all',
            });

            if (subscriptions.data.length > 0) {
              const subscription = subscriptions.data[0];
              stripeSubscriptionId = subscription.id;
              trialEndTimestamp = subscription.trial_end;
              currentPeriodStartTimestamp = (subscription as unknown as { current_period_start?: number }).current_period_start || null;
              currentPeriodEndTimestamp = (subscription as unknown as { current_period_end?: number }).current_period_end || null;
              console.log('✅ Found existing subscription:', stripeSubscriptionId);
            } else {
              console.warn('⚠️ Customer has payment method but no subscription found');
            }
          }
        } catch (stripeError) {
          // No bloquear el registro si falla Stripe, pero registrar el error
          console.error('⚠️ Error syncing with Stripe (no bloquea registro):', stripeError);
        }
      } else {
        console.warn('⚠️ Stripe not configured or plan without price_id, skipping Stripe sync');
      }

      // Calcular fechas desde Stripe si están disponibles, sino calcular localmente
      const trialEnd = trialEndTimestamp 
        ? new Date(trialEndTimestamp * 1000).toISOString()
        : new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
      
      const currentPeriodStart = currentPeriodStartTimestamp
        ? new Date(currentPeriodStartTimestamp * 1000).toISOString()
        : new Date().toISOString();
      
      const periodDays = billingPeriod === 'yearly' ? 365 : 30;
      const currentPeriodEnd = currentPeriodEndTimestamp
        ? new Date(currentPeriodEndTimestamp * 1000).toISOString()
        : new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();

      // Actualizar la suscripción en la BD con los datos de Stripe
      // Estado siempre 'trialing' durante la prueba, nunca 'active' sin cobro
      const { error: subscriptionError } = await supabase
        .from('subscriptions')
        .update({
          plan_id: planId,
          billing_period: billingPeriod,
          skip_trial: !!signupData.skipTrial,
          trial_start: new Date().toISOString(),
          trial_end: trialEnd,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          stripe_customer_id: stripeCustomerId || null,
          stripe_subscription_id: stripeSubscriptionId || null,
          status: 'trialing',
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', orgData.id);
      
      if (subscriptionError) {
        console.error('❌ Error updating subscription:', subscriptionError);
        throw subscriptionError;
      }
      console.log('✅ Subscription synced successfully in database');
      
      console.log('🎉 Complete signup finished successfully!');
    } else {
      console.log('⚠️ Skipping organization creation - join type is not "create" or no organization name');
    }
    return { alreadyExisted: false };
  } catch (error: unknown) {
    console.error('❌ Error in completeSignupAfterEmailConfirmation:', error);
    // No lanzar error para no interrumpir el flujo de confirmación
    return { alreadyExisted: false };
  }
}
