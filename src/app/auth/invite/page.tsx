'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { validateInvitation, createProfileFromInvitation } from '@/lib/supabase/config';
import { supabase } from '@/lib/supabase/config';
import Link from 'next/link';
import InvitationForm, { InvitationFormData } from '@/components/auth/InvitationForm';

export default function InvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('code');
  
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

  const handleSubmit = async (formData: InvitationFormData) => {
    setIsLoading(true);
    setError(null);
    setFormError(null);

    try {
      // Verificar si el usuario ya está autenticado (email confirmado)
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session && session.user && session.user.email?.toLowerCase() === inviteData.email.toLowerCase()) {
        // Usuario ya confirmado, crear perfil directamente
        console.log('Usuario ya confirmado, creando perfil directamente');
        
        const { error } = await createProfileFromInvitation({
          inviteCode: inviteCode!,
          userData: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            phoneNumber: formData.phoneNumber
          },
          authUserId: session.user.id,
          password: formData.password
        });

        if (error) {
          console.error('Error al crear perfil:', error);
          setError(error.message || 'Error al crear el perfil');
          setIsLoading(false);
          return;
        }

        // Redirigir al login con mensaje de éxito
        router.push('/auth/login?message=Registro completado correctamente. Inicia sesión para continuar.');
        return;
      }

      // Si no hay sesión activa, significa que algo salió mal
      setError('No se encontró una sesión activa. Por favor, haz clic en el enlace del email nuevamente.');
      setIsLoading(false);

    } catch (err: any) {
      console.error('Error inesperado al procesar la invitación:', err);
      setError(err.message || 'Error inesperado al procesar la invitación');
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
    <InvitationForm
      inviteData={{
        email: inviteData?.email || '',
        organization_name: inviteData?.organization_name || '',
        role_name: inviteData?.role_name || ''
      }}
      onSubmit={handleSubmit}
      isLoading={isLoading}
      error={error}
    />
  );
}
