'use client';

import { useState } from 'react';

interface EmailResendComponentProps {
  email: string;
  onResend: () => Promise<void>;
  title?: string;
  description?: string;
  className?: string;
}

export default function EmailResendComponent({
  email,
  onResend,
  title = "Correo enviado",
  description = "Hemos enviado las instrucciones a",
  className = ""
}: EmailResendComponentProps) {
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(true);
  const [resendTimer, setResendTimer] = useState(0);

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

  const handleResend = async () => {
    if (!canResend || loading) return;
    
    setLoading(true);
    
    try {
      await onResend();
      startResendTimer();
    } catch (error) {
      console.error('Error resending email:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`p-4 bg-gray-50 rounded-lg border ${className}`}>
      <div className="text-center">
        <div className="mb-3">
          <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {title}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {description} <strong>{email}</strong>
        </p>
        
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            ¿No recibiste el correo? Revisa tu carpeta de spam o correo no deseado.
          </p>
          
          <button
            onClick={handleResend}
            disabled={!canResend || loading}
            className={`w-full py-2 px-4 text-sm font-medium rounded-md transition-colors ${
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
  );
}
