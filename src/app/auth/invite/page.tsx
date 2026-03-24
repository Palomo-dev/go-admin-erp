'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import InvitationWizard from '@/components/auth/InvitationWizard';
import { useTranslations } from 'next-intl';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth.invite');
  const tc = useTranslations('common');
  const inviteCode = searchParams.get('invite_code');
  console.log('🔍 Invite code obtenido:', inviteCode);
  
  // Debug: Mostrar TODOS los parámetros de la URL
  console.log('🔍 Todos los parámetros de URL:');
  searchParams.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('🔍 URL completa:', typeof window !== 'undefined' ? window.location.href : 'SSR');
  

  const [inviteData, setInviteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  console.log('✅ Componente renderizando');
  
  // useEffect para ejecutar la validación una sola vez
  useEffect(() => {
    console.log('🔥 useEffect ejecutándose con inviteCode:', inviteCode);
    validateAndSignInDirectly();
  }, [inviteCode]); // Solo se ejecuta cuando cambia inviteCode

  // Función de validación 
  async function validateAndSignInDirectly() {
    console.log('🚀 validateAndSignInDirectly iniciando...');
    
    if (!inviteCode) {
      console.log('❌ No se proporciono un codigo de invitacion');
      setError(t('noCode'));
      setIsLoading(false);
      return;
    }

    console.log('Limpiando code:', inviteCode);  
    
    // Ignorar errores de Supabase en la URL (son del flujo automático que no usamos)
    // Limpiar la URL de parámetros de error para mejor UX
    if (typeof window !== 'undefined' && (window.location.hash.includes('error=') || searchParams.get('error'))) {
      console.log('Limpiando error de la URL');
      console.log('Limpiando error de la URL:', window.location.hash);
      const cleanUrl = `${window.location.pathname}?code=${inviteCode}`;
      window.history.replaceState({}, '', cleanUrl);
    }
    console.log('Avanzo code:', inviteCode);  
    
    try {
      // PASO 1: Validar código de invitación
      setLoadingMessage(t('validating'));
      const { data: inviteData, error: inviteError } = await supabase
        .rpc('validate_invitation_by_code', {
          invitation_code: inviteCode
        });
      
      console.log('Resultado de validación:', { inviteData, inviteError });
      
      if (inviteError) {
        console.log('Error validando invitación - Error:', inviteError);
        setError(t('errorValidating', { message: inviteError.message }));
        setIsLoading(false);
        return;
      }
      
      if (!inviteData || inviteData.length === 0) {
        console.log('Invite data:', inviteData);
        console.log('Error validando invitación - No se encontró invitación válida para código:', inviteCode);
        setError(t('invalidOrExpired'));
        setIsLoading(false);
        return;
      }
      
      const invitation = inviteData[0]; // La función devuelve un array
      const invitationData = {
        id: invitation.id,
        email: invitation.email,
        code: invitation.code,
        role_id: invitation.role_id,
        organization_id: invitation.organization_id,
        organization_name: invitation.organization_name || 'Organización',
        role_name: invitation.role_name || 'Usuario'
      };
      
      // PASO 2: Intentar login automático con credenciales temporales
      setLoadingMessage(t('autoSignIn'));
      console.log('Intentando login con:', invitation.email, 'temp-password');
      
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password: 'temp-password'
      });
      
      console.log('Resultado de login:', { signInData, signInError });
      
      
      if (signInError) {
        console.log('Error en login automático:', signInError);
        setError(t('errorAutoSignIn', { message: signInError.message }));
        setIsLoading(false);
        return;
      }
      
      if (!signInData.user) {
        console.log('Login exitoso pero no hay usuario');
        setError(t('errorUnexpected'));
        setIsLoading(false);
        return;
      }
      
      // PASO 3: Login exitoso, configurar datos y mostrar wizard
      console.log('Login exitoso, usuario:', signInData.user.email);
      setInviteData(invitationData);
      setIsLoggedIn(true);
      setIsLoading(false);
      
    } catch (err) {
      console.log('Error en el proceso de validación y login:', err);
      setError(t('errorProcessing'));
      setIsLoading(false);
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-t-2 border-b-2 border-blue-600 mx-auto mb-3 sm:mb-4"></div>
          <p className="text-sm sm:text-base text-gray-600">{loadingMessage || t('validating')}</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100">
        <div className="bg-white shadow-lg sm:shadow-2xl rounded-lg sm:rounded-xl w-full max-w-md overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">{t('errorTitle')}</h2>
          </div>
          <div className="p-4 sm:p-6">
            <div className="bg-red-50 border-l-4 border-red-500 p-3 sm:p-4 mb-3 sm:mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-2 sm:ml-3">
                  <p className="text-xs sm:text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-200 space-y-2">
            <button 
              onClick={() => window.location.reload()} 
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              {tc('retry')}
            </button>
            <button 
              onClick={() => router.push('/auth/login')} 
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              {t('goToLogin')}
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Solo mostrar el wizard si estamos loggeados y tenemos datos de invitación
  if (isLoggedIn && inviteData) {
    return (
      <InvitationWizard
        inviteData={inviteData}
        onComplete={() => {
          router.push(`/auth/login?message=${encodeURIComponent(t('completedMessage'))}`);
        }}
      />
    );
  }
  
  // Este caso no debería ocurrir, pero por seguridad
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600">{t('settingUp')}</p>
      </div>
    </div>
  );
}

/**
 * Página de invitación con Suspense
 */
export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
