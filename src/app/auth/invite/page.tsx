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
    async function checkInvitationAndSession() {
      if (!inviteCode) {
        setError('Código de invitación no proporcionado');
        setIsLoading(false);
        return;
      }
      
      try {
        // Primero verificar si hay una sesión activa
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!session || !session.user) {
          setError('No se encontró una sesión activa. El enlace de invitación debe confirmar automáticamente tu email. Por favor, intenta hacer clic en el enlace nuevamente.');
          setIsLoading(false);
          return;
        }

        // Validar la invitación
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

        // Verificar que el email de la sesión coincida con el de la invitación
        if (session.user.email?.toLowerCase() !== data.email.toLowerCase()) {
          setError('El email de la sesión no coincide con el email de la invitación. Por favor, cierra sesión e intenta nuevamente.');
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

    checkInvitationAndSession();
  }, [inviteCode]);

  const handleSubmit = async (formData: InvitationFormData) => {
    setIsLoading(true);
    setError(null);
    setFormError(null);

    try {
      // Verificar sesión nuevamente antes de procesar
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !session.user) {
        setError('Sesión expirada. Por favor, haz clic en el enlace del email nuevamente.');
        setIsLoading(false);
        return;
      }

      if (session.user.email?.toLowerCase() !== inviteData.email.toLowerCase()) {
        setError('Error de validación de email. Por favor, intenta nuevamente.');
        setIsLoading(false);
        return;
      }

      console.log('Procesando invitación para usuario autenticado:', session.user.id);
      
      // Crear/actualizar perfil con los datos del formulario
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
        console.error('Error al procesar invitación:', error);
        setError(error.message || 'Error al procesar la invitación');
        setIsLoading(false);
        return;
      }

      console.log('Invitación procesada exitosamente');
      
      // Cerrar sesión para forzar un nuevo login con la contraseña actualizada
      await supabase.auth.signOut();
      
      // Redirigir al login con mensaje de éxito
      router.push('/auth/login?message=Registro completado correctamente. Inicia sesión con tu nueva contraseña.');

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
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 space-y-2">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Reintentar
            </button>
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
