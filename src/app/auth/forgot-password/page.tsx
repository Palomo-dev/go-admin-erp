'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resetPassword } from '@/lib/supabase/config';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendTimer, setResendTimer] = useState(0);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const startResendTimer = () => {
    setCanResend(false);
    setResendTimer(60); // 60 segundos
    
    const timer = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage({
        type: 'error',
        text: 'Por favor ingresa tu correo electrónico'
      });
      return;
    }
    
    if (!validateEmail(email)) {
      setMessage({
        type: 'error',
        text: 'Por favor ingresa un correo electrónico válido'
      });
      return;
    }
    
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await resetPassword(email);
      
      if (error) {
        throw error;
      }

      setEmailSent(true);
      setMessage({
        type: 'success',
        text: 'Se ha enviado un correo con instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.'
      });
      
      // Iniciar timer para reenvío
      startResendTimer();
      
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Error al enviar el correo de recuperación'
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendEmail = async () => {
    if (!canResend) return;
    
    setLoading(true);
    setMessage(null);
    
    try {
      const { error } = await resetPassword(email);
      
      if (error) {
        throw error;
      }
      
      setMessage({
        type: 'success',
        text: 'Correo de recuperación reenviado exitosamente.'
      });
      
      startResendTimer();
      
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Error al reenviar el correo'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 py-4 sm:py-8 md:py-12 px-3 sm:px-4 md:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-4 sm:space-y-6 md:space-y-8 bg-white p-4 sm:p-6 md:p-8 rounded-lg sm:rounded-xl shadow-xl sm:shadow-2xl relative border border-gray-100">
        <div>
          <h2 className="mt-2 sm:mt-4 md:mt-6 text-center text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
            Recuperar contraseña
          </h2>
          <p className="mt-1 sm:mt-2 text-center text-xs sm:text-sm text-gray-600">
            Ingresa tu correo electrónico y te enviaremos instrucciones para restablecer tu contraseña.
          </p>
        </div>
        
        {message && (
          <div className={`${message.type === 'success' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700'} px-3 py-2 sm:px-4 sm:py-3 rounded text-sm sm:text-base relative border`} role="alert">
            <span className="block sm:inline">{message.text}</span>
          </div>
        )}
        
        <form className="mt-4 sm:mt-6 md:mt-8 space-y-4 sm:space-y-6" onSubmit={handleResetPassword}>
          <div>
            <label htmlFor="email-address" className="sr-only">Correo electrónico</label>
            <div className="flex items-center border border-blue-300 rounded-md">
              <span className="pl-2 sm:pl-3 pr-1 sm:pr-2 text-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                  <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                  <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                </svg>
              </span>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-2 py-2 sm:py-3 text-sm sm:text-base focus:outline-none"
                placeholder="Correo electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 sm:py-3 px-4 border border-transparent text-sm sm:text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              {loading ? 'Enviando...' : 'Enviar instrucciones'}
            </button>
          </div>
          
          <div className="text-center">
            <Link href="/auth/login" className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-500">
              Volver al inicio de sesión
            </Link>
          </div>
        </form>
        
        {/* Sección de reenvío de email */}
        {emailSent && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gray-50 rounded-lg border">
            <div className="text-center">
              <div className="mb-2 sm:mb-3">
                <svg className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1 sm:mb-2">
                Correo enviado
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                Hemos enviado las instrucciones a <strong>{email}</strong>
              </p>
              
              <div className="space-y-2 sm:space-y-3">
                <p className="text-xs text-gray-500">
                  ¿No recibiste el correo? Revisa tu carpeta de spam o correo no deseado.
                </p>
                
                <button
                  onClick={handleResendEmail}
                  disabled={!canResend || loading}
                  className={`w-full py-2 px-3 sm:px-4 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                    canResend && !loading
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200'
                  }`}
                >
                  {loading
                    ? 'Reenviando...'
                    : canResend
                    ? 'Reenviar correo'
                    : `Reenviar en ${resendTimer}s`
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
