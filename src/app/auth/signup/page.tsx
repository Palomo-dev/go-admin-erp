'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PersonalInfoStep from '../../../components/auth/PersonalInfoStep';
import OrganizationStep from '../../../components/auth/OrganizationStep';
import BranchStep from '../../../components/auth/BranchStep';
import VerificationStep from '../../../components/auth/VerificationStep';
import SubscriptionStep from '../../../components/auth/SubscriptionStep';
import { supabase, signUpWithEmail } from '@/lib/supabase/config';
import { extractGoogleUserNames } from '@/lib/auth/googleAuth';

// Definición de tipos
type SignupData = {
  // Datos personales
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  // Datos de organización
  joinType: 'create' | 'join';
  // Si crea organización
  organizationName: string;
  organizationType: number | null;
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
  organizationId?: number;
  // Datos de suscripción
  subscriptionPlan?: string;
  billingPeriod?: 'monthly' | 'yearly';
};

export default function SignupPage() {
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
    joinType: 'create',
    organizationName: '',
    organizationType: null,
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
    
    setCurrentStep((prev) => prev + 1);
  };

  // Retroceder al paso anterior
  const prevStep = () => {
    setCurrentStep((prev) => prev - 1);
  };

  // Manejar el registro de usuario
  const handleSignup = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('Datos de registro:', signupData);
      
      let userId: string;
      
      if (isGoogleUser && googleUserData) {
        // Usuario de Google ya autenticado, usar su ID
        userId = googleUserData.id;
        console.log('Usuario de Google ya autenticado:', userId);
      } else {
        // Usuario regular, crear cuenta nueva
        const { data: authData, error: authError } = await signUpWithEmail(
          signupData.email,
          signupData.password,
          {
            first_name: signupData.firstName,
            last_name: signupData.lastName,
          },
          `${window.location.origin}/auth/callback?next=/app/inicio`
        );
        
        console.log('Respuesta de registro:', authData);

        if (authError) throw authError;
        
        if (!authData.user?.id) throw new Error('No se pudo crear el usuario');
        userId = authData.user.id;
      }

      // 2. Procesar según el tipo de registro (crear organización o unirse)
      if (signupData.joinType === 'create') {
        // Crear nueva organización
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: signupData.organizationName,
            type_id: signupData.organizationType,
            owner_user_id: userId,
            status: 'active',
            plan_id: 1, // Plan gratuito por defecto
            primary_color: '#3B82F6', // Color azul por defecto
            secondary_color: '#1E40AF',
          })
          .select('id')
          .single();

        if (orgError) throw orgError;

        // Crear o actualizar perfil de usuario
        if (isGoogleUser) {
          // Usuario de Google: actualizar perfil existente
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              last_org_id: orgData.id, // Actualizar última organización
              phone: signupData.phone || null,
            })
            .eq('id', userId);

          if (profileError) throw profileError;
        } else {
          // Usuario regular: crear perfil nuevo
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({
              id: userId,
              email: signupData.email,
              first_name: signupData.firstName,
              last_name: signupData.lastName,
              last_org_id: orgData.id, // Campo correcto para última organización
              status: 'active',
              phone: signupData.phone,
            });

          if (profileError) throw profileError;
        }

        // Crear membresía del usuario como administrador de la organización
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: orgData.id,
            user_id: userId,
            role: 'org_admin',
            role_id: 2, // org_admin
            is_super_admin: true, // El propietario es super admin
            is_active: true,
          });

        if (memberError) throw memberError;
        
        // Crear sucursal principal
        const { error: branchError } = await supabase
          .from('branches')
          .insert({
            name: signupData.branchName,
            branch_code: signupData.branchCode,
            address: signupData.branchAddress,
            city: signupData.branchCity,
            state: signupData.branchState,
            country: signupData.branchCountry,
            postal_code: signupData.branchPostalCode,
            phone: signupData.branchPhone,
            email: signupData.branchEmail,
            organization_id: orgData.id,
            is_main: true,
            is_active: true,
            status: 'active',
          });

        if (branchError) throw branchError;
      } else {
        // Unirse con código de invitación
        const { data: invitationData, error: invitationError } = await supabase
          .from('invitations')
          .select('organization_id, role_id')
          .eq('code', signupData.invitationCode)
          .eq('status', 'pending')
          .single();

        if (invitationError) throw new Error('Código de invitación inválido o expirado');

        // Crear perfil de usuario
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: signupData.email,
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            last_org_id: invitationData.organization_id, // Campo correcto
            status: 'active',
            phone: signupData.phone,
          });

        if (profileError) throw profileError;

        // Crear membresía del usuario con el rol asignado en la invitación
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            organization_id: invitationData.organization_id,
            user_id: userId,
            role: invitationData.role_id === 2 ? 'org_admin' : 
                  invitationData.role_id === 3 ? 'employee' : 'client',
            role_id: invitationData.role_id || 4, // employee por defecto
            is_super_admin: false, // Los invitados no son super admin
            is_active: true,
          });

        if (memberError) throw memberError;

        // Marcar invitación como utilizada
        await supabase
          .from('invitations')
          .update({
            status: 'used',
            used_at: new Date().toISOString(),
          })
          .eq('code', signupData.invitationCode);
      }

      // Para usuarios de Google, redirigir directamente a la app
      if (isGoogleUser) {
        // Usuarios de Google ya están verificados, ir directamente a la app
        router.push('/app/inicio');
        return;
      }

      // Para usuarios regulares, avanzar al paso de verificación
      nextStep();
    } catch (err: any) {
      console.error('Error en registro:', err);
      setError(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full border-2 border-blue-500 flex items-center justify-center mb-4">
            <div className="text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-800">
            {isGoogleUser ? 'Configuración de cuenta' : 'Registro en GO Admin ERP'}
          </h2>
          {isGoogleUser && (
            <p className="text-center text-sm text-gray-600 mt-2">
              Cuenta de Google: {signupData.email}
            </p>
          )}
          
          {/* Indicador de pasos */}
          <div className="flex justify-center w-full mt-4 mb-6">
            <div className="flex items-center sm:space-x-4 space-x-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                1
              </div>
              <div className={`w-1/2 sm:w-16 h-1 ${currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                2
              </div>
              <div className={`w-1/2 sm:w-16 h-1 ${currentStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                3
              </div>
              <div className={`w-1/2 sm:w-16 h-1 ${currentStep >= 4 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                4
              </div>
              <div className={`w-1/2 sm:w-16 h-1 ${currentStep >= 5 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 5 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                5
              </div>
            </div>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
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
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                ¡Bienvenido, {signupData.firstName}!
              </h3>
              <p className="text-gray-600 mb-6">
                Tu cuenta de Google ha sido vinculada exitosamente. Ahora necesitas configurar tu organización.
              </p>
            </div>
            <button
              onClick={nextStep}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            onNext={handleSignup}
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
        <div className="text-center mt-4">
          <p className="text-sm text-gray-600">
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
