'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/config';

type VerificationStepProps = {
  email: string;
};

export default function VerificationStep({ email }: VerificationStepProps) {
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleResendEmail = async () => {
    setResendStatus('sending');
    setError(null);
    
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/inicio`,
        }
      });
      
      if (error) throw error;
      setResendStatus('sent');
    } catch (err: any) {
      console.error('Error al reenviar correo:', err);
      setError(err.message || 'Error al reenviar el correo de verificación');
      setResendStatus('error');
    }
  };
  
  return (
    <div className="mt-8 space-y-6">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-3 text-lg font-medium text-gray-900">¡Registro completado!</h3>
        <div className="mt-2 px-2">
          <p className="text-sm text-gray-500">
            Hemos enviado un correo de verificación a <span className="font-medium text-gray-900">{email}</span>.
            Por favor, revisa tu bandeja de entrada y haz clic en el enlace de verificación para activar tu cuenta.
          </p>
        </div>
      </div>

      {/* Mensaje de estado para reenvío de correo */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      
      {resendStatus === 'sent' && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">Correo de verificación reenviado correctamente.</span>
        </div>
      )}

      <div className="bg-yellow-50 p-4 rounded-md">
        <h3 className="text-sm font-medium text-yellow-800">¿No has recibido el correo?</h3>
        <p className="mt-1 text-sm text-yellow-700">
          Revisa tu carpeta de spam o correo no deseado. Si aún no lo encuentras, puedes:
        </p>
        <div className="mt-3">
          <button
            onClick={handleResendEmail}
            disabled={resendStatus === 'sending'}
            className="inline-flex items-center px-3 py-1.5 border border-yellow-300 text-xs font-medium rounded-md text-yellow-700 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            {resendStatus === 'sending' ? 'Enviando...' : 'Reenviar correo de verificación'}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-md">
        <h3 className="text-sm font-medium text-blue-800">Próximos pasos:</h3>
        <ul className="mt-2 text-sm text-blue-700 list-disc pl-5 space-y-1">
          <li>Verifica tu correo electrónico</li>
          <li>Inicia sesión en tu cuenta</li>
          <li>Completa el proceso de onboarding para personalizar tu organización</li>
          <li>Explora las funcionalidades de GO Admin ERP</li>
        </ul>
      </div>

      <div className="flex justify-center space-x-4">
        <Link 
          href="/auth/login" 
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Ir a iniciar sesión
        </Link>
      </div>
    </div>
  );
}
