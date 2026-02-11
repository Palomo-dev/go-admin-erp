'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PersonalInfoStep from '../../../components/auth/PersonalInfoStep';
import OrganizationStep from '../../../components/auth/OrganizationStep';
import BranchStep from '../../../components/auth/BranchStep';
import VerificationStep from '../../../components/auth/VerificationStep';
import SubscriptionStep from '../../../components/auth/SubscriptionStep';
import PaymentMethodStep from '../../../components/auth/PaymentMethodStep';
import { supabase } from '@/lib/supabase/config';
import { extractGoogleUserNames } from '@/lib/auth/googleAuth';

// Definición de tipos
interface SignupData {
  // Datos personales
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  avatarUrl?: string; // NUEVO - Storage path del avatar
  preferredLanguage?: string; // NUEVO - Idioma preferido
  // Tipo de unión
  joinType: 'create' | 'join';
  // Si crea organización
  organizationName: string;
  organizationType: number | null;
  organizationLegalName?: string;
  organizationDescription?: string;
  organizationEmail?: string;
  organizationPhone?: string;
  organizationAddress?: string;
  organizationCity?: string;
  organizationState?: string;
  organizationCountry?: string;
  organizationCountryCode?: string;
  organizationPostalCode?: string;
  organizationTaxId?: string;
  organizationNit?: string;
  organizationWebsite?: string;
  organizationPrimaryColor?: string;
  organizationSecondaryColor?: string;
  organizationSubdomain?: string;
  logoUrl?: string; // NUEVO - Storage path del logo
  // Si se une con código
  invitationCode: string;
  // Datos de sucursal principal
  branchName: string;
  branchCode: string;
  branchAddress?: string;
  branchCity?: string;
  branchState?: string;
  branchCountry?: string;
  branchPostalCode?: string;
  branchPhone?: string;
  branchEmail?: string;
  branchTaxIdentification?: string; // NUEVO - NIT/RUT de la sucursal
  branchOpeningHours?: string; // NUEVO - JSON string de horarios
  branchFeatures?: string; // NUEVO - JSON string de características
  // Datos de suscripción
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  // Datos de Stripe (método de pago)
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
}

function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleUser, setIsGoogleUser] = useState(false);
  const [googleUserData, setGoogleUserData] = useState<any>(null);
  const [signupData, setSignupData] = useState<SignupData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    avatarUrl: '',
    preferredLanguage: 'es',
    joinType: 'create',
    organizationName: '',
    organizationType: null,
    organizationLegalName: '',
    organizationDescription: '',
    organizationEmail: '',
    organizationPhone: '',
    organizationAddress: '',
    organizationCity: '',
    organizationState: '',
    organizationCountry: '',
    organizationCountryCode: '',
    organizationPostalCode: '',
    organizationTaxId: '',
    organizationNit: '',
    organizationWebsite: '',
    organizationPrimaryColor: '',
    organizationSecondaryColor: '',
    organizationSubdomain: '',
    logoUrl: undefined,
    invitationCode: '',
    branchName: 'Sucursal Principal',
    branchCode: 'MAIN-001',
    branchAddress: '',
    branchCity: '',
    branchState: '',
    branchCountry: '',
    branchPostalCode: '',
    branchPhone: '',
    branchEmail: '',
    branchTaxIdentification: '',
    branchOpeningHours: '',
    branchFeatures: '',
    subscriptionPlan: 'pro',
    billingPeriod: 'monthly',
  });

  // Verificar si viene de Google OAuth
  useEffect(() => {
    const checkGoogleUser = async () => {
      const isFromGoogle = searchParams.get('google') === 'true';
      const stepParam = searchParams.get('step');
      
      if (isFromGoogle) {
        // Verificar sesión activa de Google
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session || session.user.app_metadata?.provider !== 'google') {
          // No hay sesión de Google válida, redirigir a login
          router.push('/auth/login?error=google-session-expired');
          return;
        }
        
        setIsGoogleUser(true);
        setGoogleUserData(session.user);
        
        // Extraer datos del usuario de Google
        const { firstName, lastName } = extractGoogleUserNames({
          id: session.user.id,
          email: session.user.email || '',
          user_metadata: session.user.user_metadata || {}
        });
        
        // Actualizar datos del formulario con información de Google
        updateFormData({
          firstName,
          lastName,
          email: session.user.email || '',
          password: '', // No necesario para usuarios de Google
          confirmPassword: ''
        });
        
        // Si viene con step=organization, ir directamente al paso 2
        if (stepParam === 'organization') {
          setCurrentStep(2);
        }
      }
    };
    
    checkGoogleUser();
  }, [searchParams, router]);

  // Actualizar datos del formulario
  const updateFormData = (data: Partial<SignupData>) => {
    setSignupData((prev) => ({ ...prev, ...data }));
  };

  // Avanzar al siguiente paso
  const nextStep = async () => {
    console.log(`SignupPage: Avanzando del paso ${currentStep} al paso ${currentStep + 1}`);
    
    if (currentStep === 1 && !isGoogleUser) {
      setLoading(true);
      setError(null);
      
      // Verificar si el correo ya está registrado (solo para usuarios no-Google)
      const { data: existingUsers } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', signupData.email)
        .maybeSingle();

      if (existingUsers) {
        setError('Este correo electrónico ya está registrado');
        setLoading(false);
        return;
      }
      
      setLoading(false);
    }
    
    setCurrentStep((prev) => {
      const newStep = prev + 1;
      console.log(`SignupPage: Paso actualizado a ${newStep}`);
      return newStep;
    });
  };

  // Retroceder al paso anterior
  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };

  // Función para crear todos los datos del registro (perfil, org, branch, etc.)
  const createSignupData = async (userId: string, email: string) => {
    console.log('🚀 Creando datos de registro para usuario:', userId);
    
    try {
      // 1. Crear perfil del usuario
      console.log('1️⃣ Creando perfil...');
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          first_name: signupData.firstName,
          last_name: signupData.lastName,
          email: email,
          phone: signupData.phone || null,
          avatar_url: signupData.avatarUrl || null,
          preferred_language: signupData.preferredLanguage || 'es',
          status: 'active'
        });
      
      if (profileError) {
        console.error('❌ Error creando perfil:', profileError);
        throw profileError;
      }
      console.log('✅ Perfil creado exitosamente');
      
      // 2. Crear organización (solo si joinType es 'create')
      if (signupData.joinType === 'create' && signupData.organizationName) {
        console.log('2️⃣ Creando organización:', signupData.organizationName);
        
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: signupData.organizationName,
            legal_name: signupData.organizationLegalName || signupData.organizationName,
            type_id: signupData.organizationType || 2,
            description: signupData.organizationDescription || null,
            email: signupData.organizationEmail || email,
            phone: signupData.organizationPhone || null,
            website: signupData.organizationWebsite || null,
            tax_id: signupData.organizationTaxId || null,
            nit: signupData.organizationNit || null,
            address: signupData.organizationAddress || null,
            city: signupData.organizationCity || null,
            state: signupData.organizationState || null,
            country: signupData.organizationCountry || 'Colombia',
            country_code: signupData.organizationCountryCode || 'COL',
            postal_code: signupData.organizationPostalCode || null,
            primary_color: signupData.organizationPrimaryColor || '#3B82F6',
            secondary_color: signupData.organizationSecondaryColor || '#F59E0B',
            subdomain: signupData.organizationSubdomain || null,
            logo_url: signupData.logoUrl || null,
            owner_user_id: userId,
            created_by: userId,
            status: 'active'
          })
          .select('id')
          .single();
        
        if (orgError) {
          console.error('❌ Error creando organización:', orgError);
          throw orgError;
        }
        
        const orgId = orgData.id;
        console.log('✅ Organización creada con ID:', orgId);
        // NOTA: El trigger create_default_subscription ya crea la suscripción automáticamente
        // NOTA: El trigger setup_organization_defaults configura impuestos, monedas y métodos de pago
        
        // 3. Crear membresía del usuario como super admin (ANTES de branches para cumplir RLS)
        console.log('3️⃣ Creando membresía de organización...');
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: orgId,
            user_id: userId,
            role_id: 2, // Admin de organización
            is_super_admin: true,
            is_active: true
          });
        
        if (memberError) {
          console.error('❌ Error creando membresía:', memberError);
          throw memberError;
        }
        console.log('✅ Membresía creada exitosamente');
        
        // 4. Crear sucursal principal (después de membresía para cumplir RLS)
        console.log('4️⃣ Creando sucursal principal...');
        const openingHours = signupData.branchOpeningHours ? 
          (typeof signupData.branchOpeningHours === 'string' ? JSON.parse(signupData.branchOpeningHours) : signupData.branchOpeningHours) :
          {
            monday: { open: '09:00', close: '18:00', closed: false },
            tuesday: { open: '09:00', close: '18:00', closed: false },
            wednesday: { open: '09:00', close: '18:00', closed: false },
            thursday: { open: '09:00', close: '18:00', closed: false },
            friday: { open: '09:00', close: '18:00', closed: false },
            saturday: { open: '10:00', close: '15:00', closed: false },
            sunday: { closed: true }
          };
        
        const features = signupData.branchFeatures ?
          (typeof signupData.branchFeatures === 'string' ? JSON.parse(signupData.branchFeatures) : signupData.branchFeatures) :
          {};
        
        const { error: branchError } = await supabase
          .from('branches')
          .insert({
            organization_id: orgId,
            name: signupData.branchName || 'Sucursal Principal',
            branch_code: signupData.branchCode || 'MAIN-001',
            address: signupData.branchAddress || null,
            city: signupData.branchCity || null,
            state: signupData.branchState || null,
            country: signupData.branchCountry === 'COL' ? 'Colombia' : (signupData.branchCountry || 'Colombia'),
            postal_code: signupData.branchPostalCode || null,
            phone: signupData.branchPhone || null,
            email: signupData.branchEmail || null,
            tax_identification: signupData.branchTaxIdentification || null,
            opening_hours: openingHours,
            features: features,
            is_main: true,
            is_active: true
          });
        
        if (branchError) {
          console.error('❌ Error creando sucursal:', branchError);
          throw branchError;
        }
        console.log('✅ Sucursal creada exitosamente');
        
        // 5. Crear suscripción en Stripe
        console.log('5️⃣ Creando suscripción en Stripe...');
        console.log('🔍 DEBUG signup - Plan:', signupData.subscriptionPlan);
        
        // Determinar planCode y planId basado en selección
        let planCode: string;
        let planId: number;
        
        if (signupData.subscriptionPlan.includes('ultimate')) {
          planCode = 'ultimate';
          planId = 5; // Ultimate plan ID
        } else if (signupData.subscriptionPlan.includes('business')) {
          planCode = 'business';
          planId = 3;
        } else {
          planCode = 'pro';
          planId = 2;
        }
          
          try {
            // Llamar a la API de Stripe para crear la suscripción con trial
            console.log('🔍 DEBUG signup - Llamando a /api/stripe/create-subscription...');
            console.log('🔍 DEBUG signup - userId:', userId);
            console.log('🔍 DEBUG signup - email:', email);
            const stripeResponse = await fetch('/api/stripe/create-subscription', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                organizationId: orgId,
                planCode: planCode,
                billingPeriod: signupData.billingPeriod || 'monthly',
                useTrial: true,
                userId: userId,
                email: email,
                customerName: `${signupData.firstName} ${signupData.lastName || ''}`.trim(),
                // Incluir customer y método de pago si existen (del paso PaymentMethod)
                ...(signupData.stripeCustomerId ? { existingCustomerId: signupData.stripeCustomerId } : {}),
                ...(signupData.stripePaymentMethodId ? { paymentMethodId: signupData.stripePaymentMethodId } : {}),
              }),
            });

            console.log('🔍 DEBUG signup - Response status:', stripeResponse.status);
            const stripeResult = await stripeResponse.json();
            console.log('🔍 DEBUG signup - Response:', stripeResult);

            if (stripeResponse.ok && stripeResult.success) {
              console.log('✅ Suscripción creada en Stripe:', stripeResult.subscriptionId);
              console.log('✅ Customer ID de Stripe:', stripeResult.customerId);
              
              // Actualizar la suscripción local
              const updatePayload: any = {
                plan_id: planId,
                stripe_subscription_id: stripeResult.subscriptionId,
                stripe_customer_id: stripeResult.customerId,
                billing_period: signupData.billingPeriod || 'monthly',
                trial_start: new Date().toISOString(),
                trial_end: stripeResult.trialEnd || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
                status: 'trialing'
              };
              
              
              console.log('🔍 DEBUG signup - Actualizando BD con:', updatePayload);
              
              const { data: updateData, error: updateError } = await supabase
                .from('subscriptions')
                .update(updatePayload)
                .eq('organization_id', orgId)
                .select();

              if (updateError) {
                console.error('❌ Error actualizando suscripción:', updateError);
              } else {
                console.log('✅ Suscripción actualizada en BD:', updateData);
              }
            } else {
              console.error('❌ Error en respuesta de Stripe API:', stripeResult);
            }
          } catch (stripeError) {
            console.error('❌ Error en llamada a Stripe API:', stripeError);
          }
        
        // Actualizar last_org_id en el perfil
        await supabase
          .from('profiles')
          .update({ last_org_id: orgId })
          .eq('id', userId);
        
        console.log('🎉 ¡Registro completo exitosamente!');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error en createSignupData:', error);
      throw error;
    }
  };

  // Manejar el registro de usuario - crear en Supabase Auth y datos
  const handleAuthSignup = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Iniciando proceso de registro para:', signupData.email);
      
      // Verificar si el email ya existe
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', signupData.email)
        .maybeSingle();

      if (existingUser) {
        throw new Error('Este correo electrónico ya está registrado');
      }
      
      if (isGoogleUser && googleUserData) {
        // Usuario de Google ya autenticado, crear datos con el flujo completo
        console.log('Usuario de Google completando signup:', googleUserData.id);
        await createSignupData(googleUserData.id, googleUserData.email);
        router.push('/app/inicio');
        return;
      }

      // Crear usuario en Supabase Auth con todos los datos en metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupData.email,
        password: signupData.password,
        options: {
          data: {
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            phone: signupData.phone,
            // Guardar todos los datos del signup para usar después de verificación
            signup_data: JSON.stringify({
              // Datos personales
              firstName: signupData.firstName,
              lastName: signupData.lastName,
              phone: signupData.phone,
              avatarUrl: signupData.avatarUrl,
              preferredLanguage: signupData.preferredLanguage || 'es',
              // Tipo de unión
              joinType: signupData.joinType,
              // Datos de organización
              organizationName: signupData.organizationName,
              organizationTypeId: signupData.organizationType?.toString(),
              organizationLegalName: signupData.organizationLegalName,
              organizationDescription: signupData.organizationDescription,
              organizationEmail: signupData.organizationEmail,
              organizationPhone: signupData.organizationPhone,
              organizationAddress: signupData.organizationAddress,
              organizationCity: signupData.organizationCity,
              organizationState: signupData.organizationState,
              organizationCountry: signupData.organizationCountry || 'Colombia',
              organizationCountryCode: signupData.organizationCountryCode || 'COL',
              organizationPostalCode: signupData.organizationPostalCode,
              organizationTaxId: signupData.organizationTaxId,
              organizationNit: signupData.organizationNit,
              organizationWebsite: signupData.organizationWebsite,
              organizationPrimaryColor: signupData.organizationPrimaryColor,
              organizationSecondaryColor: signupData.organizationSecondaryColor,
              organizationSubdomain: signupData.organizationSubdomain,
              logoUrl: signupData.logoUrl,
              // Código de invitación
              invitationCode: signupData.invitationCode,
              // Datos de sucursal
              branchName: signupData.branchName,
              branchCode: signupData.branchCode,
              branchAddress: signupData.branchAddress,
              branchCity: signupData.branchCity,
              branchState: signupData.branchState,
              branchCountry: signupData.branchCountry || 'COL',
              branchPostalCode: signupData.branchPostalCode,
              branchPhone: signupData.branchPhone,
              branchEmail: signupData.branchEmail,
              branchTaxIdentification: signupData.branchTaxIdentification,
              branchOpeningHours: signupData.branchOpeningHours,
              branchFeatures: signupData.branchFeatures,
              // Datos de suscripción
              subscriptionPlan: signupData.subscriptionPlan,
              billingPeriod: signupData.billingPeriod
            })
          },
          emailRedirectTo: `${window.location.origin}/auth/callback?complete_signup=true`
        }
      });

      if (authError) {
        console.error('Error en Supabase Auth:', authError);
        throw new Error(authError.message || 'Error al crear la cuenta');
      }

      if (!authData.user) {
        throw new Error('No se pudo crear el usuario');
      }

      console.log('Usuario creado exitosamente en Auth:', authData.user.id);
      
      // IMPORTANTE: Verificar si el email ya está confirmado (confirmación deshabilitada)
      // Si email_confirmed_at existe, el email ya está confirmado y debemos crear los datos inmediatamente
      if (authData.user.email_confirmed_at || authData.session) {
        console.log('📧 Email ya confirmado o sesión activa, creando datos inmediatamente...');
        
        try {
          await createSignupData(authData.user.id, signupData.email);
          
          // Cerrar sesión para que el usuario inicie sesión de nuevo
          await supabase.auth.signOut();
          
          // Redirigir al login con mensaje de éxito
          router.push('/auth/login?success=signup-complete&message=' + 
            encodeURIComponent('¡Cuenta creada exitosamente! Por favor, inicia sesión.'));
          return;
        } catch (createError: any) {
          console.error('Error creando datos de registro:', createError);
          // Si falla la creación de datos, aún así el usuario existe
          // Intentar limpiar y mostrar error
          throw new Error('Error al configurar tu cuenta. Por favor, contacta a soporte.');
        }
      }
      
      // Si llegamos aquí, el email necesita confirmación
      console.log('Email de verificación enviado a:', signupData.email);
      nextStep();
      
    } catch (err: any) {
      console.error('Error en registro:', err);
      setError(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  // Nota: La creación de datos de organización ahora se maneja automáticamente
  // por el trigger de base de datos 'complete_signup_after_email_verification'
  // que se ejecuta cuando el email es confirmado por Supabase.

  return (
    <div className="min-h-screen overflow-y-auto flex items-start sm:items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 py-4 sm:py-6 md:py-10 px-4 sm:px-6 md:px-8 lg:px-10">
      <div className={`${currentStep === 4 ? 'max-w-3xl' : 'max-w-2xl'} w-full space-y-3 sm:space-y-5 md:space-y-6 bg-white p-5 pb-20 sm:p-6 sm:pb-8 md:p-8 md:pb-10 rounded-lg sm:rounded-xl shadow-xl sm:shadow-2xl relative border border-gray-100 my-4 max-h-[88vh] overflow-y-auto`}>
        <div className="flex flex-col items-center">
          {/* Logo GO Admin con diseño moderno */}
          <div className="mb-2 sm:mb-3">
            <div className="relative">
              {/* Círculo decorativo con gradiente de fondo */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-lg blur-sm sm:blur-md opacity-30 animate-pulse"></div>
              
              {/* Contenedor del logo */}
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg p-2 sm:p-3 shadow-lg">
                <div className="flex flex-col items-center justify-center space-y-0">
                  {/* Texto GO con estilo bold */}
                  <div className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none">
                    GO
                  </div>
                  {/* Texto Admin con estilo más ligero */}
                  <div className="text-[10px] sm:text-xs font-medium text-blue-100 tracking-wide uppercase">
                    Admin
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Título mejorado */}
          <h2 className="text-center text-lg sm:text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-1">
            {isGoogleUser ? 'Configuración de cuenta' : 'Registro en GO Admin ERP'}
          </h2>
          {isGoogleUser && (
            <p className="text-center text-xs text-gray-500 mt-1">
              Cuenta de Google: {signupData.email}
            </p>
          )}
          
          {/* Indicador de pasos (6 pasos) */}
          <div className="flex justify-center w-full mt-2 sm:mt-3 mb-3 sm:mb-4">
            <div className="flex items-center space-x-1 sm:space-x-2">
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                1
              </div>
              <div className={`w-4 sm:w-8 h-0.5 ${currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                2
              </div>
              <div className={`w-4 sm:w-8 h-0.5 ${currentStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                3
              </div>
              <div className={`w-4 sm:w-8 h-0.5 ${currentStep >= 4 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                4
              </div>
              <div className={`w-4 sm:w-8 h-0.5 ${currentStep >= 5 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 5 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                5
              </div>
              <div className={`w-4 sm:w-8 h-0.5 ${currentStep >= 6 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-medium ${currentStep >= 6 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                6
              </div>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        
        {/* Pasos del formulario */}
        {currentStep === 1 && !isGoogleUser && (
          <PersonalInfoStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={nextStep}
            error={error}
            loading={loading}
          />
        )}
        
        {/* Para usuarios de Google, mostrar información de bienvenida en el paso 1 */}
        {currentStep === 1 && isGoogleUser && (
          <div className="text-center py-4 sm:py-6">
            <div className="mb-3 sm:mb-5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2 sm:mb-3 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1.5">
                ¡Bienvenido, {signupData.firstName}!
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 px-3">
                Tu cuenta de Google ha sido vinculada exitosamente. Ahora necesitas configurar tu organización.
              </p>
            </div>
            <button
              onClick={nextStep}
              className="bg-blue-600 text-white px-5 py-2 sm:px-7 sm:py-2.5 text-xs sm:text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              Continuar con la configuración
            </button>
          </div>
        )}
        
        {currentStep === 2 && (
          <OrganizationStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={nextStep}
            onBack={prevStep}
            loading={loading}
          />
        )}
        
        {currentStep === 3 && (
          <BranchStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={nextStep}
            onBack={prevStep}
            loading={loading}
          />
        )}
        
        {currentStep === 4 && (
          <SubscriptionStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={nextStep}
            onBack={prevStep}
            loading={loading}
          />
        )}
        
        {currentStep === 5 && (
          <PaymentMethodStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={handleAuthSignup}
            onBack={prevStep}
            onSkip={handleAuthSignup}
            loading={loading}
          />
        )}
        
        {currentStep === 6 && (
          <VerificationStep 
            email={signupData.email}
          />
        )}
        
        {/* Enlace a login */}
        <div className="text-center mt-4 sm:mt-5 pt-3 sm:pt-4 border-t border-gray-100">
          <p className="text-xs sm:text-sm text-gray-600">
            ¿Ya tienes una cuenta?{' '}
            <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    }>
      <SignupContent />
    </Suspense>
  );
}
