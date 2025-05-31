'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Handle the OAuth callback
    const handleAuthCallback = async () => {
      try {
        // Get the session from the URL
        const { error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }
        
        // Redirect to dashboard on successful login
        router.push('/app/inicio');
      } catch (error) {
        console.error('Error during OAuth callback:', error);
        router.push('/auth/login?error=auth-callback-failed');
      }
    };

    handleAuthCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div className="flex flex-col items-center">
          <div className="w-20 h-20 rounded-full border-2 border-blue-500 flex items-center justify-center mb-4">
            <div className="text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-14 h-14 animate-pulse">
                <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <h2 className="text-center text-2xl font-bold text-gray-800">
            Iniciando sesión...
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Por favor espere mientras procesamos su inicio de sesión
          </p>
        </div>
      </div>
    </div>
  );
}
