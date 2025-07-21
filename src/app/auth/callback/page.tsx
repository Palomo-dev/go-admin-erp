'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { handleGoogleCallback, type GoogleUser } from '@/lib/auth/googleAuth';
import { getUserOrganization } from '@/lib/supabase/config';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Procesando autenticación...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Obtener parámetros de la URL
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        const type = searchParams.get('type');
        const accessToken = searchParams.get('access_token');
        const refreshToken = searchParams.get('refresh_token');
        const next = searchParams.get('next') || '/app/inicio';

        // Si hay error en la URL, mostrar error
        if (error) {
          setStatus('error');
          setMessage(errorDescription || 'Error en la autenticación');
          setTimeout(() => {
            router.push('/auth/login?error=' + encodeURIComponent(error));
          }, 3000);
          return;
        }
        
        // Manejar reset de contraseña
        if (type === 'recovery' && accessToken && refreshToken) {
          console.log('Password recovery callback detected');
          setStatus('success');
          setMessage('Enlace de recuperación válido. Redirigiendo...');
          
          // Establecer la sesión con los tokens de recuperación
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          
          if (sessionError) {
            console.error('Error setting recovery session:', sessionError);
            setStatus('error');
            setMessage('Error al procesar el enlace de recuperación');
            setTimeout(() => {
              router.push('/auth/forgot-password?error=invalid-link');
            }, 3000);
            return;
          }
          
          // Redirigir a la página de reset de contraseña
          setTimeout(() => {
            router.push('/auth/reset-password');
          }, 1500);
          return;
        }

        // Procesar el callback de autenticación
        const { data, error: authError } = await supabase.auth.getSession();
        
        if (authError) {
          throw authError;
        }

        // Verificar si hay sesión activa
        if (data.session) {
          setStatus('success');
          setMessage('¡Autenticación exitosa! Redirigiendo...');
          
          const user = data.session.user;
          
          // Verificar si es un login con Google (OAuth)
          const isGoogleAuth = user.app_metadata?.provider === 'google';
          
          if (isGoogleAuth) {
            // Manejar callback de Google OAuth
            const googleUser: GoogleUser = {
              id: user.id,
              email: user.email || '',
              user_metadata: user.user_metadata || {}
            };
            
            const googleResult = await handleGoogleCallback(googleUser);
            
            if (!googleResult.success) {
              setStatus('error');
              setMessage(googleResult.error || 'Error procesando login con Google');
              setTimeout(() => {
                router.push('/auth/login?error=google-callback-failed');
              }, 3000);
              return;
            }
            
            // Si el usuario de Google necesita seleccionar organización
            if (googleResult.needsOrganization) {
              // Verificar si el usuario tiene organizaciones disponibles
              const { data: memberData, error: memberError } = await supabase
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', user.id)
                .eq('is_active', true);
              
              if (!memberError && memberData && memberData.length > 0) {
                // Tiene organizaciones, redirigir a selección
                router.push('/auth/select-organization');
                return;
              } else {
                // No tiene organizaciones, redirigir a crear una o unirse
                router.push('/auth/signup?step=organization&google=true');
                return;
              }
            }
          }
          
          // Verificar si el usuario tiene perfil completo
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, last_org_id')
            .eq('id', user.id)
            .single();

          if (profileError || !profile) {
            // Si no hay perfil, redirigir a completar registro
            setTimeout(() => {
              router.push('/auth/signup?step=2');
            }, 1000);
            return;
          }

          // Redirigir a la página solicitada
          setTimeout(() => {
            router.push(next);
          }, 1000);
        } else {
          // No hay sesión, posiblemente email no confirmado
          setStatus('error');
          setMessage('Email no confirmado o sesión expirada');
          setTimeout(() => {
            router.push('/auth/login?message=email-not-confirmed');
          }, 3000);
        }
      } catch (error: any) {
        console.error('Error durante callback de autenticación:', error);
        setStatus('error');
        setMessage(error.message || 'Error en la autenticación');
        setTimeout(() => {
          router.push('/auth/login?error=auth-callback-failed');
        }, 3000);
      }
    };

    handleAuthCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center mb-4 ${
            status === 'loading' ? 'border-blue-500' : 
            status === 'success' ? 'border-green-500' : 'border-red-500'
          }`}>
            <div className={`${
              status === 'loading' ? 'text-blue-500' : 
              status === 'success' ? 'text-green-500' : 'text-red-500'
            }`}>
              {status === 'loading' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14 animate-pulse">
                  <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                </svg>
              )}
              {status === 'success' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              )}
              {status === 'error' && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14">
                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
          <h2 className={`text-center text-2xl font-bold ${
            status === 'loading' ? 'text-gray-800' : 
            status === 'success' ? 'text-green-800' : 'text-red-800'
          }`}>
            {status === 'loading' && 'Iniciando sesión...'}
            {status === 'success' && '¡Éxito!'}
            {status === 'error' && 'Error'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
