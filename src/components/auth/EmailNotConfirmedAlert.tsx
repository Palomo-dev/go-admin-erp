'use client';

import { useState } from 'react';
import { resendVerificationEmail } from '@/lib/auth/emailAuth';

interface EmailNotConfirmedAlertProps {
  email: string;
  onClose?: () => void;
}

export default function EmailNotConfirmedAlert({ email, onClose }: EmailNotConfirmedAlertProps) {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const handleResendEmail = async () => {
    setResending(true);
    setMessage(null);
    
    const result = await resendVerificationEmail(email);
    
    setMessage(result.message);
    setMessageType(result.success ? 'success' : 'error');
    setResending(false);
    
    // Si fue exitoso, ocultar el mensaje después de 5 segundos
    if (result.success) {
      setTimeout(() => {
        setMessage(null);
      }, 5000);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Email no verificado
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p>
              Tu cuenta con email <span className="font-semibold">{email}</span> necesita verificación para continuar.
            </p>
            <p className="mt-1">
              Revisa tu bandeja de entrada y carpeta de spam, luego haz clic en el enlace de verificación.
            </p>
          </div>
          
          {/* Mensaje de resultado */}
          {message && (
            <div className={`mt-3 p-3 rounded-md text-sm ${
              messageType === 'success' 
                ? 'bg-green-100 text-green-700 border border-green-200' 
                : 'bg-red-100 text-red-700 border border-red-200'
            }`}>
              {message}
            </div>
          )}
          
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleResendEmail}
              disabled={resending}
              className="inline-flex items-center px-3 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-800 bg-yellow-100 hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-yellow-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Enviando...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Reenviar email de verificación
                </>
              )}
            </button>
            
            {onClose && (
              <button
                onClick={onClose}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cerrar
              </button>
            )}
          </div>
          
          <div className="mt-3 text-xs text-yellow-600">
            <p>
              💡 <strong>Consejo:</strong> Si no recibes el email en unos minutos, revisa tu carpeta de spam o correo no deseado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
