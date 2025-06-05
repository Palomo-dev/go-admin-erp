'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updatePassword, getSession } from '@/lib/supabase/config';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { session, error } = await getSession();
      if (session && !error) {
        setHasSession(true);
      } else {
        // If no session, redirect to login
        setMessage({
          type: 'error',
          text: 'El enlace de restablecimiento no es válido o ha expirado. Por favor solicita un nuevo enlace.'
        });
      }
    };

    checkSession();
  }, [router]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setMessage({
        type: 'error',
        text: 'Las contraseñas no coinciden'
      });
      return;
    }

    if (password.length < 8) {
      setMessage({
        type: 'error',
        text: 'La contraseña debe tener al menos 8 caracteres'
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { data, error } = await updatePassword(password);
      
      if (error) {
        throw error;
      }

      setMessage({
        type: 'success',
        text: 'Tu contraseña ha sido actualizada correctamente'
      });
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Error al actualizar la contraseña'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
        <div>
          <h2 className="mt-6 text-center text-2xl font-bold text-gray-800">
            Restablecer contraseña
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Ingresa tu nueva contraseña
          </p>
        </div>
        
        {message && (
          <div className={`${message.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'} px-4 py-3 rounded relative border`} role="alert">
            <span className="block sm:inline">{message.text}</span>
          </div>
        )}
        
        {hasSession ? (
          <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="sr-only">Nueva contraseña</label>
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
                    required
                    className="w-full px-2 py-3 focus:outline-none"
                    placeholder="Nueva contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">Confirmar contraseña</label>
                <div className="flex items-center border border-blue-300 rounded-md">
                  <span className="pl-3 pr-2 text-blue-500">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    required
                    className="w-full px-2 py-3 focus:outline-none"
                    placeholder="Confirmar contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {loading ? 'Actualizando...' : 'Actualizar contraseña'}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 text-center">
            <Link href="/auth/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
              Solicitar un nuevo enlace de restablecimiento
            </Link>
          </div>
        )}
        
        <div className="text-center mt-4">
          <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-500">
            Volver al inicio de sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
