'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PersonalInfoStep from '../../../components/auth/PersonalInfoStep';
import OrganizationStep from '../../../components/auth/OrganizationStep';
import BranchStep from '../../../components/auth/BranchStep';
import VerificationStep from '../../../components/auth/VerificationStep';
import SubscriptionStep from '../../../components/auth/SubscriptionStep';
import { supabase, signUpWithEmail } from '@/lib/supabase/config';

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
};

export default function SignupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  });

  // Actualizar datos del formulario
  const updateFormData = (data: Partial<SignupData>) => {
    setSignupData((prev) => ({ ...prev, ...data }));
  };

  // Avanzar al siguiente paso
  const nextStep = async () => {
    if (currentStep === 1) {
      setLoading(true);
      setError(null);
      
      // Verificar si el correo ya está registrado
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
      // 1. Crear cuenta de usuario en Supabase Auth usando la función mejorada
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
      
      const userId = authData.user?.id;
      if (!userId) throw new Error('No se pudo crear el usuario');

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
            subscription_status: 'trial',
            subscription_plan: 'free',
            primary_color: '#3B82F6', // Color azul por defecto
            secondary_color: '#1E40AF',
          })
          .select('id')
          .single();

        if (orgError) throw orgError;

        // Crear perfil de usuario con rol de administrador
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: signupData.email,
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            organization_id: orgData.id,
            role_id: 2, // org_admin
            is_owner: true,
            status: 'active',
            phone: signupData.phone,
          });

        if (profileError) throw profileError;
        
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

        // Crear perfil de usuario con rol asignado en la invitación
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            email: signupData.email,
            first_name: signupData.firstName,
            last_name: signupData.lastName,
            organization_id: invitationData.organization_id,
            role_id: invitationData.role_id || 4, // employee por defecto
            is_owner: false,
            status: 'active',
            phone: signupData.phone,
          });

        if (profileError) throw profileError;

        // Marcar invitación como utilizada
        await supabase
          .from('invitations')
          .update({
            status: 'used',
            used_at: new Date().toISOString(),
          })
          .eq('code', signupData.invitationCode);
      }

      // Avanzar al paso de verificación
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
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full border-2 border-blue-500 flex items-center justify-center mb-4">
            <div className="text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-800">
            Registro en GO Admin ERP
          </h2>
          
          {/* Indicador de pasos */}
          <div className="flex justify-center w-full mt-4 mb-6">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 1 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                1
              </div>
              <div className={`w-16 h-1 ${currentStep >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 2 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                2
              </div>
              <div className={`w-16 h-1 ${currentStep >= 3 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                3
              </div>
              <div className={`w-16 h-1 ${currentStep >= 4 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep >= 4 ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                4
              </div>
              <div className={`w-16 h-1 ${currentStep >= 5 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
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
        {currentStep === 1 && (
          <PersonalInfoStep 
            formData={signupData} 
            updateFormData={updateFormData} 
            onNext={nextStep}
            error={error}
            loading={loading}
          />
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
