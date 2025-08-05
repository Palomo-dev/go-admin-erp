'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateInvitation, acceptInvitation } from '@/lib/supabase/config';
import Link from 'next/link';
import RegistrationForm, { RegistrationFormData } from '@/components/auth/RegistrationForm';
import { AutomaticTriggers } from '@/lib/services/automaticTriggerIntegrations';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export default function InvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams?.get('code') || null;
  
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteData, setInviteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkInvitation() {
      if (!inviteCode) {
        setError('Código de invitación no proporcionado');
        setIsLoading(false);
        return;
      }
      
      try {
        const { data, error } = await validateInvitation(inviteCode);
        
        if (error) {
          setError(error.message);
          setIsLoading(false);
          return;
        }
        
        if (!data) {
          setError('La invitación no es válida o ha expirado');
          setIsLoading(false);
          return;
        }
        
        setInviteData(data);
        setIsLoading(false);
      } catch (err) {
        console.error('Error al validar invitación:', err);
        setError('Error al validar la invitación');
        setIsLoading(false);
      }
    }
    
    checkInvitation();
  }, [inviteCode]);

  const handleSubmit = async (formData: RegistrationFormData) => {
    setIsLoading(true);
    setError(null);
    setFormError(null);

    // Validar que las contraseñas coincidan
    if (formData.password !== formData.confirmPassword) {
      setFormError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    try {
      // Llamar a la función para aceptar la invitación
      const { error } = await acceptInvitation({
        inviteCode: inviteCode!,
        password: formData.password,
        userData: {
          firstName: formData.firstName,
          lastName: formData.lastName,
          phoneNumber: formData.phoneNumber
        }
      });

      if (error) {
        console.error('Error al aceptar la invitación:', error);
        setError(error.message || 'Error al aceptar la invitación');
        setIsLoading(false);
        return;
      }

      // 🚀 TRIGGER AUTOMÁTICO: user.created
      try {
        const organizationId = inviteData?.organization_id || getOrganizationId();
        await AutomaticTriggers.userCreated({
          user_id: inviteData?.id || 'new-user', // El ID del usuario recién creado
          name: `${formData.firstName} ${formData.lastName}`,
          email: inviteData?.email || formData.email,
          role: inviteData?.role_name || 'employee',
          organization_id: organizationId,
          department: inviteData?.department || 'General',
          phone: formData.phoneNumber || '',
          invitation_accepted: true,
          invitation_code: inviteCode
        }, organizationId);
        console.log('✅ Trigger user.created ejecutado exitosamente');
      } catch (triggerError) {
        console.error('⚠️ Error en trigger user.created (no afecta el registro):', triggerError);
      }

      // Redirigir al usuario a la página de inicio de sesión
      router.push('/auth/login?message=Invitación aceptada correctamente. Inicia sesión con tu nueva cuenta.');
    } catch (err: any) {
      console.error('Error inesperado al aceptar la invitación:', err);
      setError(err.message || 'Error inesperado al aceptar la invitación');
      setIsLoading(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-white shadow rounded-lg w-full max-w-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Error en la invitación</h2>
          </div>
          <div className="p-6">
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button 
              onClick={() => router.push('/auth/login')} 
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Ir al inicio de sesión
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      <div className="mb-8">
        <img
          src="/logo.png"
          alt="GO Admin ERP Logo"
          width={180}
          height={60}
        />
      </div>
      
      <div className="bg-white shadow rounded-lg w-full max-w-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Aceptar invitación</h2>
          <p className="mt-1 text-sm text-gray-600">
            Has sido invitado a unirte a <strong>{inviteData?.organization_name}</strong> como <strong>{inviteData?.role_name}</strong>
          </p>
        </div>
        
        <div className="p-6">
          <RegistrationForm
            initialEmail={inviteData?.email || ''}
            isEmployee={true}
            isReadOnlyEmail={true}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={formError}
          />
          
          <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Al aceptar la invitación, se creará una cuenta con el correo electrónico proporcionado y serás añadido a la organización.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button 
            type="button"
            onClick={() => router.push('/auth/login')} 
            className="py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
