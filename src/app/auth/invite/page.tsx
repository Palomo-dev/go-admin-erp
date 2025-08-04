'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import InvitationWizard from '@/components/auth/InvitationWizard';

export default function InvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('code');
  
  const [inviteData, setInviteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateInvitationCode() {
      if (!inviteCode) {
        setError('Código de invitación no proporcionado');
        setIsLoading(false);
        return;
      }
      
      // Ignorar errores de Supabase en la URL (son del flujo automático que no usamos)
      // Limpiar la URL de parámetros de error para mejor UX
      if (window.location.hash.includes('error=') || searchParams.get('error')) {
        const cleanUrl = `${window.location.pathname}?code=${inviteCode}`;
        window.history.replaceState({}, '', cleanUrl);
      }
      
      try {
        // Usar función de base de datos que bypassa RLS
        const { data: inviteData, error: inviteError } = await supabase
          .rpc('validate_invitation_by_code', {
            invitation_code: inviteCode
          });
        
        console.log('Resultado de validación:', { inviteData, inviteError });
        
        if (inviteError) {
          console.error('Error validando invitación - Error:', inviteError);
          setError(`Error al validar la invitación: ${inviteError.message}`);
          setIsLoading(false);
          return;
        }
        
        if (!inviteData || inviteData.length === 0) {
          console.error('Error validando invitación - No se encontró invitación válida para código:', inviteCode);
          setError('La invitación no es válida, ha expirado o ya fue utilizada');
          setIsLoading(false);
          return;
        }
        
        const invitation = inviteData[0]; // La función devuelve un array
        
        setInviteData({
          id: invitation.id,
          email: invitation.email,
          code: invitation.code,
          role_id: invitation.role_id,
          organization_id: invitation.organization_id,
          organization_name: invitation.organization_name || 'Organización',
          role_name: invitation.role_name || 'Usuario'
        });
        setIsLoading(false);
      } catch (err) {
        console.error('Error al validar invitación:', err);
        setError('Error al validar la invitación');
        setIsLoading(false);
      }
    }

    validateInvitationCode();
  }, [inviteCode]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Validando invitación...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
        <div className="bg-white shadow-lg rounded-lg w-full max-w-md overflow-hidden">
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
    <InvitationWizard
      inviteData={inviteData}
      onComplete={() => {
        router.push('/auth/login?message=Registro completado correctamente. Inicia sesión con tu nueva contraseña.');
      }}
    />
  );
}
