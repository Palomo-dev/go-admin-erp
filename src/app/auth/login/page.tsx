'use client';

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  handleEmailLogin, 
  handleGoogleLogin, 
  handleMicrosoftLogin, 
  selectOrganizationFromPopup,
  proceedWithLogin,
  Organization
} from '@/lib/auth';
import GeolocationModal from '@/components/auth/GeolocationModal';
import EmailNotConfirmedAlert from '@/components/auth/EmailNotConfirmedAlert';
import { type GeolocationPreference, shouldShowGeolocationModal, saveGeolocationPreference } from '@/lib/utils/geolocation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userOrganizations, setUserOrganizations] = useState<Organization[]>([]);
  const [showOrgPopup, setShowOrgPopup] = useState(false);
  const [showGeolocationModal, setShowGeolocationModal] = useState(false);
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const searchParams = useSearchParams();
  
 
  useEffect(() => {
    // Check for error in URL
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(
        errorParam === 'auth-callback-failed' 
          ? 'Error al iniciar sesión con proveedor externo' 
          : 'Error al iniciar sesión'
      );
    }
    
    // Check for message parameter (like email-not-confirmed)
    const messageParam = searchParams.get('message');
    if (messageParam === 'email-not-confirmed') {
      setEmailNotConfirmed(true);
      setError('Tu cuenta aún no ha sido verificada.');
    }
    
    // Check for redirectTo parameter
    const redirectTo = searchParams.get('redirectTo');
    if (redirectTo) {
      // Store it in session storage for after login
      sessionStorage.setItem('redirectTo', redirectTo);
    }
    
    // Check if coming from session expired page
    const fromExpired = searchParams.get('fromExpired') === 'true';
    if (fromExpired) {
      // Clear any stored credentials to prevent auto-login
      localStorage.removeItem('rememberMe');
      localStorage.removeItem('userEmail');
      setEmail('');
      setRememberMe(false);
      
      // Show a message about the expired session
      setError('Tu sesión anterior ha expirado. Por favor, inicia sesión nuevamente.');
    }
    
    // Check for success messages (email confirmation)
    const success = searchParams.get('success');
    const message = searchParams.get('message');
    if (success === 'email-confirmed' && message) {
      setSuccessMessage(decodeURIComponent(message));
    }
    
    // Check for corrupted session errors
    const error = searchParams.get('error');
    if (error === 'corrupted-session') {
      setError('Tu sesión estaba corrupta y ha sido limpiada. Por favor, inicia sesión nuevamente.');
    } else if (error === 'session-parse-error') {
      setError('Hubo un problema con tu sesión anterior. Por favor, inicia sesión nuevamente.');
    } else if (error === 'auth-failed') {
      const details = searchParams.get('details');
      setError('Error en la autenticación: ' + (details ? decodeURIComponent(details) : 'Error desconocido'));
    }
    
    // Verificar si necesitamos mostrar el modal de geolocalización
    if (shouldShowGeolocationModal()) {
      // No hay preferencia guardada, mostrar modal después de un breve delay
      setTimeout(() => {
        setShowGeolocationModal(true)
      }, 1000)
    }
  }, [searchParams, userOrganizations]);

  const onEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // Resetear estado de email no confirmado
    setEmailNotConfirmed(false);
    
    await handleEmailLogin({
      email,
      password,
      rememberMe,
      setLoading,
      setError,
      setUserOrganizations,
      setShowOrgPopup,
      proceedWithLogin: (rememberMe: boolean, email: string) => proceedWithLogin(rememberMe, email),
      setEmailNotConfirmed,
      setResendingEmail
    });
  };

  const onGoogleLogin = async () => {
    console.log('Redirect to:', `${window.location.origin}/auth/callback`); 
    await handleGoogleLogin({
      setLoading,
      setError
    });
  };
  


  const onMicrosoftLogin = async () => {
    await handleMicrosoftLogin({
      setLoading,
      setError
    });
  };
  

  // Handle organization selection from popup
  const onSelectOrganizationFromPopup = async (org: Organization) => {
    console.log('📄 [LOGIN PAGE] Usuario seleccionó organización:', {
      orgId: org.id,
      orgName: org.name,
      currentEmail: email
    });
    
    try {
      await selectOrganizationFromPopup({
        organization: org,
        email,
        setShowOrgPopup,
        proceedWithLogin: (rememberMe, email) => {
          console.log('🔗 [LOGIN PAGE] Wrapper proceedWithLogin llamado:', { rememberMe, email });
          return proceedWithLogin(rememberMe, email);
        }
      });
      console.log('✅ [LOGIN PAGE] selectOrganizationFromPopup completado');
    } catch (error) {
      console.error('❌ [LOGIN PAGE] Error en selectOrganizationFromPopup:', error);
    }
  };
  
  // Manejar selección de geolocalización
  const handleGeolocationSelection = (preference: GeolocationPreference) => {
    console.log('Preferencia de geolocalización seleccionada:', preference);
    // El modal ya guarda la preferencia en cookies
    setShowGeolocationModal(false);
  };
  
  const handleCloseGeolocationModal = () => {
    // Si el usuario cierra el modal sin seleccionar, asumir "denied"
    if (shouldShowGeolocationModal()) {
      saveGeolocationPreference('denied')
    }
    
    setShowGeolocationModal(false);
  };
  
  // Load remembered email on component mount
  useEffect(() => {
    // No intentar recuperar el email guardado si venimos de una sesión expirada
    const fromExpired = searchParams.get('fromExpired') === 'true';
    if (fromExpired) {
      return;
    }
    
    // Verificar si hay un email guardado para "recordarme"
    const savedEmail = localStorage.getItem('userEmail');
    if (savedEmail) {
      try {
        // Intentar decodificar el email (base64 + reverse)
        const decodedEmail = atob(savedEmail.split('').reverse().join(''));
        setEmail(decodedEmail);
        setRememberMe(true);
      } catch (e) {
        // Si hay un error al decodificar, limpiar el valor corrupto
        localStorage.removeItem('userEmail');
      }
    }
    
    // Limpiar cualquier token de Supabase que pudiera estar en localStorage
    // para asegurar que solo se usen cookies para la autenticación
    localStorage.removeItem('supabase.auth.token');
    localStorage.removeItem('sb-access-token');
    localStorage.removeItem('sb-refresh-token');
    
    // Limpiar cualquier token específico del proyecto
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? process.env.NEXT_PUBLIC_SUPABASE_URL.split('.')[0].replace('https://', '')
      : '';
    if (projectRef) {
      localStorage.removeItem(`sb-${projectRef}-auth-token`);
    }
  }, []);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md relative">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full border-2 border-blue-500 flex items-center justify-center mb-4">
            <div className="text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-800">
            Iniciar sesión en GO Admin ERP
          </h2>
          
          {/* Organization selector - hidden now, will show popup when needed */}
        </div>
        
        {error && !emailNotConfirmed && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
            {error.includes('El usuario no existe') && (
              <div className="mt-2">
                <Link href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-500">
                  Crear una cuenta nueva
                </Link>
              </div>
            )}
          </div>
        )}
        
        {/* Componente especial para email no confirmado */}
        {emailNotConfirmed && (
          <EmailNotConfirmedAlert 
            email={email}
            onClose={() => {
              setEmailNotConfirmed(false);
              setError(null);
            }}
          />
        )}
        
        {/* Organization selection popup */}
        {showOrgPopup && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Selecciona una organización</h3>
              <p className="text-sm text-gray-500 mb-4">Tu cuenta está asociada a múltiples organizaciones. Por favor selecciona una para continuar.</p>
              
              <div className="max-h-60 overflow-y-auto">
                {userOrganizations.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => onSelectOrganizationFromPopup(org)}
                    className="flex items-center w-full text-left px-4 py-3 mb-2 hover:bg-gray-100 border border-gray-200 rounded-md"
                  >
                    {/* Organization logo or placeholder */}
                    <div className="flex-shrink-0 mr-3">
                      {org.logo_url ? (
                        <img 
                          src={org.logo_url} 
                          alt={`${org.name} logo`} 
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
                          {org.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {/* Organization details */}
                    <div className="flex-grow">
                      <div className="font-medium text-gray-800">{org.name}</div>
                      <div className="text-xs text-gray-500">{org.type_id?.name || 'Organización'}</div>
                    </div>
                    
                    <div className="flex flex-col items-end ml-2 space-y-1">
                      {/* Subscription plan */}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        {org.plan_id?.name || 'Free'}
                      </span>
                      
                      {/* Status badge - only active organizations are shown, but keeping the code in case needed */}
                      {org.status && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Activa
                        </span>
                      )}
                    </div>
                    
                    
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        <form className="mt-8 space-y-6" onSubmit={onEmailLogin}>
          {/* Success Message */}
          {successMessage && (
            <div className="rounded-md bg-green-50 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">
                    {successMessage}
                  </p>
                </div>
                <div className="ml-auto pl-3">
                  <div className="-mx-1.5 -my-1.5">
                    <button
                      type="button"
                      onClick={() => setSuccessMessage(null)}
                      className="inline-flex rounded-md bg-green-50 p-1.5 text-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 focus:ring-offset-green-50"
                    >
                      <span className="sr-only">Dismiss</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-4">
            <div className="relative">
              <div className="flex items-center border border-blue-300 rounded-md">
                <span className="pl-3 pr-2 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                  </svg>
                </span>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full px-2 py-3 focus:outline-none"
                  placeholder="Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="relative">
              <div className="flex items-center border border-blue-300 rounded-md">
                <span className="pl-3 pr-2 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                  </svg>
                </span>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full px-2 py-3 focus:outline-none"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" className="pr-3 text-blue-500">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <Link href="/auth/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
                Forgot password?
              </Link>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {loading ? 'Loading...' : 'LOGIN'}
            </button>
          </div>
          
          <div className="text-center mt-4">
            <Link href="/auth/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-500">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          
          <div className="text-center mt-4">
            <p className="text-sm text-gray-600">
              ¿No tienes una cuenta?{' '}
              <Link href="/auth/signup" className="font-medium text-blue-600 hover:text-blue-500">
                Regístrate aquí
              </Link>
            </p>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">OR</span>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"

            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 23 23">
                <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z" />
                <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z" />
                <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z" />
                <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z" />
              </svg>
              Log in with Google
            </button>
            <button
              type="button"
              onClick={onMicrosoftLogin}
              disabled={loading}
              className="w-full flex items-center justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 23 23">
                <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                <path fill="#f35325" d="M1 1h10v10H1z" />
                <path fill="#81bc06" d="M12 1h10v10H12z" />
                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                <path fill="#ffba08" d="M12 12h10v10H12z" />
              </svg>
              Log in with Microsoft
            </button>
          </div>
        </div>
      </div>
      
      {/* Modal de Geolocalización */}
      <GeolocationModal
        isOpen={showGeolocationModal}
        onClose={handleCloseGeolocationModal}
        onSelection={handleGeolocationSelection}
      />
    </div>
  );
}
