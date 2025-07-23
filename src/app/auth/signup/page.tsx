'use client';

import { useState, useEffect } from 'react';
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
        await createOrganizationData(googleUserData.id);
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
              joinType: signupData.joinType,
              organizationName: signupData.organizationName,
              organizationType: signupData.organizationType,
              invitationCode: signupData.invitationCode,
              branchName: signupData.branchName,
              branchCode: signupData.branchCode,
              branchAddress: signupData.branchAddress,
              branchCity: signupData.branchCity,
              branchState: signupData.branchState,
              branchCountry: signupData.branchCountry,
              branchPostalCode: signupData.branchPostalCode,
              branchPhone: signupData.branchPhone,
              branchEmail: signupData.branchEmail,
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

  // Crear datos de organización después de verificación de email
  const createOrganizationData = async (userId: string) => {
    console.log('Iniciando creación de datos de organización para usuario:', userId);
    
    try {
      // Obtener datos del usuario desde auth metadata o desde signupData
      const { data: { user } } = await supabase.auth.getUser();
      const userMetadata = user?.user_metadata || {};
      const savedSignupData = userMetadata.signup_data ? JSON.parse(userMetadata.signup_data) : signupData;
      
      console.log('Datos de signup recuperados:', savedSignupData);
      
      if (savedSignupData.joinType === 'create') {
        console.log('Creando nueva organización...');
        
        // 1. Crear nueva organización
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: savedSignupData.organizationName,
            legal_name: savedSignupData.organizationName,
            type_id: parseInt(savedSignupData.organizationType),
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
        const profileData = {
          id: userId,
          email: userMetadata.email || savedSignupData.email,
          first_name: userMetadata.first_name || savedSignupData.firstName,
          last_name: userMetadata.last_name || savedSignupData.lastName,
          last_org_id: orgData.id,
          status: 'active',
          phone: userMetadata.phone || savedSignupData.phone,
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .insert(profileData);

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
            name: savedSignupData.branchName,
            branch_code: savedSignupData.branchCode,
            address: savedSignupData.branchAddress || '',
            city: savedSignupData.branchCity || '',
            state: savedSignupData.branchState || '',
            country: savedSignupData.branchCountry || '',
            postal_code: savedSignupData.branchPostalCode || '',
            phone: savedSignupData.branchPhone || '',
            email: savedSignupData.branchEmail || '',
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
        
      } else if (savedSignupData.joinType === 'join') {
        console.log('Uniéndose a organización existente con código:', savedSignupData.invitationCode);
        
        // 1. Validar código de invitación
        const { data: invitationData, error: invitationError } = await supabase
          .from('invitations')
          .select('organization_id, role_id')
          .eq('code', savedSignupData.invitationCode)
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
            email: userMetadata.email || savedSignupData.email,
            first_name: userMetadata.first_name || savedSignupData.firstName,
            last_name: userMetadata.last_name || savedSignupData.lastName,
            last_org_id: invitationData.organization_id,
            status: 'active',
            phone: userMetadata.phone || savedSignupData.phone,
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
            is_super_admin: false,
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
          .eq('code', savedSignupData.invitationCode);

        if (updateInvitationError) {
          console.warn('Error actualizando invitación:', updateInvitationError);
        }
      }
      
      console.log('Proceso de creación de datos completado exitosamente');
      
    } catch (error: any) {
      console.error('Error en createOrganizationData:', error);
      throw error;
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
