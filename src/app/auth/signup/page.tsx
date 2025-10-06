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
    subscriptionPlan: 'free',
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

  // Manejar el registro de usuario - solo crear en Supabase Auth
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
              organizationCountryCode: signupData.organizationCountryCode || 'COL', // Cambiar a COL
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
              branchCountry: signupData.branchCountry || 'COL', // Cambiar a COL
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
      console.log('Email de verificación enviado a:', signupData.email);
      
      // Avanzar al paso de verificación
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 py-4 sm:py-8 md:py-12 px-3 sm:px-4 md:px-6 lg:px-8">
      <div className="max-w-3xl w-full space-y-4 sm:space-y-6 md:space-y-8 bg-white p-4 sm:p-6 md:p-8 rounded-lg sm:rounded-xl shadow-xl sm:shadow-2xl relative border border-gray-100">
        <div className="flex flex-col items-center">
          {/* Logo GO Admin con diseño moderno */}
          <div className="mb-3 sm:mb-4">
            <div className="relative">
              {/* Círculo decorativo con gradiente de fondo */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-lg sm:rounded-xl blur-md sm:blur-lg opacity-30 animate-pulse"></div>
              
              {/* Contenedor del logo */}
              <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl p-3 sm:p-4 shadow-lg">
                <div className="flex flex-col items-center justify-center space-y-0.5">
                  {/* Texto GO con estilo bold */}
                  <div className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-none">
                    GO
                  </div>
                  {/* Texto Admin con estilo más ligero */}
                  <div className="text-xs sm:text-sm font-medium text-blue-100 tracking-wide uppercase">
                    Admin
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Título mejorado */}
          <h2 className="text-center text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-1 sm:mb-2">
            {isGoogleUser ? 'Configuración de cuenta' : 'Registro en GO Admin ERP'}
          </h2>
          {isGoogleUser && (
            <p className="text-center text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
              Cuenta de Google: {signupData.email}
            </p>
          )}
          
          {/* Indicador de pasos */}
          <div className="flex justify-center w-full mt-3 sm:mt-4 mb-4 sm:mb-6">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${currentStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                1
              </div>
              <div className={`w-8 sm:w-16 h-1 ${currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                2
              </div>
              <div className={`w-8 sm:w-16 h-1 ${currentStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${currentStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                3
              </div>
              <div className={`w-8 sm:w-16 h-1 ${currentStep >= 4 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${currentStep >= 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                4
              </div>
              <div className={`w-8 sm:w-16 h-1 ${currentStep >= 5 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium ${currentStep >= 5 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                5
              </div>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 sm:px-4 sm:py-3 rounded text-sm sm:text-base relative" role="alert">
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
          <div className="text-center py-6 sm:py-8">
            <div className="mb-4 sm:mb-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 sm:w-8 sm:h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
                ¡Bienvenido, {signupData.firstName}!
              </h3>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 px-4">
                Tu cuenta de Google ha sido vinculada exitosamente. Ahora necesitas configurar tu organización.
              </p>
            </div>
            <button
              onClick={nextStep}
              className="bg-blue-600 text-white px-6 py-2 sm:px-8 sm:py-3 text-sm sm:text-base rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
            onNext={handleAuthSignup}
            onBack={prevStep}
            loading={loading}
          />
        )}
        
        {currentStep === 5 && (
          <VerificationStep 
            email={signupData.email}
          />
        )}
        
        {/* Enlace a login */}
        <div className="text-center mt-3 sm:mt-4">
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
