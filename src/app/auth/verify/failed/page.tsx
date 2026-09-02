'use client';

export const dynamic = 'force-dynamic';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthSceneBackground from '@/components/auth/AuthSceneBackground';

function FailedContent() {
  const searchParams = useSearchParams();
  const type = searchParams?.get('type') || 'magiclink';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/invite/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          origin: window.location.origin,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('sent');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'No se pudo reenviar el enlace.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Error de conexión. Intenta nuevamente.');
    }
  }

  // Estado: enlace reenviado exitosamente
  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-4 bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 dark:from-gray-800 dark:via-gray-900 dark:to-black relative overflow-hidden">
        <AuthSceneBackground />
        <div className="bg-white dark:bg-gray-800 shadow-lg sm:shadow-2xl rounded-lg sm:rounded-xl w-full max-w-md overflow-hidden relative z-10">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Enlace reenviado
            </h2>
          </div>
          <div className="p-4 sm:p-6">
            <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 p-3 sm:p-4">
              <p className="text-xs sm:text-sm text-green-700 dark:text-green-300">
                Hemos enviado un nuevo enlace a <strong className="break-all">{email}</strong>.
                Revisa tu correo (y spam) y haz clic en &quot;Acceder a mi cuenta&quot;.
              </p>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
            <a
              href="/auth/login"
              className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Ir al inicio de sesi&oacute;n
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Estado: formulario para ingresar email
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-3 sm:p-4 bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 dark:from-gray-800 dark:via-gray-900 dark:to-black relative overflow-hidden">
      <AuthSceneBackground />
      <div className="bg-white dark:bg-gray-800 shadow-lg sm:shadow-2xl rounded-lg sm:rounded-xl w-full max-w-md overflow-hidden relative z-10">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            El enlace ha expirado
          </h2>
        </div>
        <div className="p-4 sm:p-6">
          <div className="bg-amber-50 dark:bg-amber-900/30 border-l-4 border-amber-500 p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">
              El enlace de acceso ya fue utilizado o ha expirado. Esto puede
              ocurrir cuando tu cliente de correo (Gmail, Outlook) abre el
              enlace autom&aacute;ticamente por seguridad antes de que hagas clic.
            </p>
          </div>

          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3">
            Ingresa tu correo y te enviaremos un nuevo enlace para aceptar la
            invitaci&oacute;n:
          </p>

          <form onSubmit={handleResend} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              disabled={status === 'sending'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />

            {status === 'error' && (
              <div className="bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 p-2 sm:p-3">
                <p className="text-xs text-red-700 dark:text-red-300">{errorMsg}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'sending' ? 'Enviando...' : 'Reenviar enlace'}
            </button>
          </form>
        </div>
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <a
            href="/auth/login"
            className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Ir al inicio de sesi&oacute;n
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FailedPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 dark:from-gray-800 dark:via-gray-900 dark:to-black">
        <div className="text-center">
          <p className="text-white">Loading...</p>
        </div>
      </div>
    }>
      <FailedContent />
    </Suspense>
  );
}
