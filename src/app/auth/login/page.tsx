'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, signInWithEmail, signInWithGoogle, signInWithMicrosoft, getOrganizations } from '@/lib/supabase/config';

// Definir el tipo para organizaciones
type Organization = {
  id: string;
  name: string;
  slug: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [showOrgSelector, setShowOrgSelector] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Cargar organizaciones desde Supabase
  useEffect(() => {
    const loadOrganizations = async () => {
      setLoadingOrgs(true);
      try {
        const orgs = await getOrganizations();
        setOrganizations(orgs);
      } catch (err) {
        console.error('Error al cargar organizaciones:', err);
      } finally {
        setLoadingOrgs(false);
      }
    };
    
    loadOrganizations();
  }, []);
  
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
    
    // Check for organization in subdomain
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];
    
    if (subdomain !== 'www' && !hostname.includes('localhost')) {
      // Buscar organización por slug
      const matchingOrg = organizations.find(org => org.slug === subdomain);
      if (matchingOrg) {
        setOrganization(matchingOrg);
      }
    }
    
    // Check for redirectTo parameter
    const redirectTo = searchParams.get('redirectTo');
    if (redirectTo) {
      // Store it in session storage for after login
      sessionStorage.setItem('redirectTo', redirectTo);
    }
  }, [searchParams, organizations]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Verificar si se ha seleccionado una organización
    if (!organization) {
      setError('Por favor selecciona una organización para continuar');
      setLoading(false);
      return;
    }

    try {
      // Add remember me option to the login
      const { data, error } = await signInWithEmail(email, password);
      
      if (error) {
        // Personalizar mensajes de error para hacerlos más amigables
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('El usuario no existe o las credenciales son incorrectas. Por favor verifica tu email y contraseña.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Tu cuenta aún no ha sido verificada. Por favor revisa tu correo electrónico y haz clic en el enlace de verificación.');
        } else if (error.message.includes('User not found')) {
          throw new Error('El usuario no existe. ¿Quieres crear una cuenta nueva?');
        } else {
          throw error;
        }
      }
      
      // Verificar si el usuario pertenece a la organización seleccionada
      if (data.user) {
        // Obtener el perfil del usuario usando su email
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email) // Usar el email ingresado en el formulario
          .single();
          
        console.log('Perfil del usuario:', profileData, 'Error:', profileError);
        
        if (profileError) {
          console.error('Error al obtener perfil:', profileError);
          throw new Error('Error al verificar acceso. Por favor intenta nuevamente.');
        }
        
        if (!profileData) {
          throw new Error('No se encontró un perfil asociado a este usuario.');
        }
        
        // Verificar si el perfil pertenece a la organización seleccionada
        if (profileData.organization_id !== organization.id) {
          throw new Error('No tienes acceso a esta organización. Por favor selecciona otra o contacta al administrador.');
        }
        
        // Guardar información relevante en localStorage para uso posterior
        localStorage.setItem('currentOrganizationId', organization.id);
        localStorage.setItem('currentOrganizationName', organization.name);
        localStorage.setItem('userRole', profileData.role || 'user');
      }
      
      // Set remember me preference in local storage if checked
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('userEmail', email);
      } else {
        localStorage.removeItem('rememberMe');
        localStorage.removeItem('userEmail');
      }

      // Agregar un log para depurar el proceso de redirección
      console.log('Autenticación exitosa, intentando redireccionar...');
      
      // Check if there's a redirectTo in session storage
      const redirectTo = sessionStorage.getItem('redirectTo');
      console.log('Destino de redirección:', redirectTo || '/app/inicio');
      
      // Forzar a Supabase a persistir la sesión correctamente
      console.log('Verificando y reforzando persistencia de sesión...');
      await supabase.auth.refreshSession();
      
      // Verificar que la sesión se haya establecido correctamente
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('Sesión establecida:', sessionData.session ? 'Sí' : 'No');
      
      // Guardar token de sesión en localStorage manualmente para garantizar disponibilidad
      if (sessionData.session) {
        console.log('Guardando token de sesión en localStorage');
        localStorage.setItem('supabase.auth.token', JSON.stringify({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          expires_at: sessionData.session.expires_at
        }));
      }
      console.log('Detalles de sesión:', sessionData.session);
      
      // Establecer una cookie para ayudar al middleware a detectar la sesión
      document.cookie = `sb-auth-token=${sessionData.session?.access_token || ''}; path=/; max-age=3600; SameSite=Lax`;
      
      // Forzar un refresco completo de la página para que el middleware detecte la sesión correctamente
      console.log('Esperando para redirigir y asegurar que la sesión sea detectada...');
      
      setTimeout(() => {
        try {
          // Verificar nuevamente la sesión antes de redireccionar
          supabase.auth.getSession().then(({ data: finalSession }) => {
            console.log('Estado final de sesión antes de redireccionar:', finalSession.session ? 'Autenticado' : 'No autenticado');
            
            if (finalSession.session) {
              if (redirectTo) {
                sessionStorage.removeItem('redirectTo');
                console.log('Redireccionando a:', redirectTo);
                // Usar window.location.replace para forzar recarga completa
                window.location.replace(redirectTo);
              } else {
                // Redirect to dashboard on successful login
                console.log('Redireccionando al dashboard');
                window.location.replace('/app/inicio');
              }
            } else {
              console.error('No se pudo establecer la sesión correctamente');
              alert('Error al establecer la sesión. Por favor, intenta nuevamente.');
            }
          });
        } catch (redirectError) {
          console.error('Error al redireccionar:', redirectError);
          alert('Error al redireccionar. Por favor, intenta nuevamente.');
        }
      }, 1000); // Aumentar el retraso a 1 segundo
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
      // Redirect happens automatically via OAuth
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Google');
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { error } = await signInWithMicrosoft();
      if (error) throw error;
      // Redirect happens automatically via OAuth
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Microsoft');
      setLoading(false);
    }
  };

  // Toggle organization selector
  const toggleOrgSelector = () => {
    setShowOrgSelector(!showOrgSelector);
  };
  
  // Handle organization selection
  const selectOrganization = (org: Organization) => {
    setOrganization(org);
    setShowOrgSelector(false);
  };
  
  // Load remembered email on component mount
  useEffect(() => {
    if (localStorage.getItem('rememberMe') === 'true') {
      const savedEmail = localStorage.getItem('userEmail');
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }
  }, []);
  
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
            Iniciar sesión en GO Admin ERP
          </h2>
          
          {/* Organization selector */}
          <div className="mt-2 relative w-full">
            <button 
              type="button" 
              onClick={toggleOrgSelector}
              className="w-full flex items-center justify-between px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>{organization ? organization.name : 'Seleccionar organización'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            
            {showOrgSelector && (
              <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-1">
                {loadingOrgs ? (
                  <div className="px-4 py-2 text-sm text-gray-500">Cargando organizaciones...</div>
                ) : organizations.length > 0 ? (
                  organizations.map((org) => (
                    <button
                      key={org.id}
                      type="button"
                      onClick={() => selectOrganization(org)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      {org.name}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-gray-500">No hay organizaciones disponibles</div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {error && (
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
        
        <form className="mt-8 space-y-6" onSubmit={handleEmailLogin}>
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
              onClick={handleGoogleLogin}
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
              onClick={handleMicrosoftLogin}
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
    </div>
  );
}
