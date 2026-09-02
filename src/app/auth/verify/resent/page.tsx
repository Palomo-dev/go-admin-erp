'use client';

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthSceneBackground from '@/components/auth/AuthSceneBackground';

function ResentContent() {
  const searchParams = useSearchParams();
  const email = searchParams?.get('email');

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
          <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 dark:border-green-500 p-3 sm:p-4 mb-3 sm:mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-2 sm:ml-3">
                <p className="text-xs sm:text-sm text-green-700 dark:text-green-300">
                  Hemos enviado un nuevo enlace de acceso a tu correo
                  {email ? (
                    <strong className="block mt-1 break-all">{email}</strong>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
            Revisa tu bandeja de entrada (y la carpeta de spam) y haz clic en el
            botón <strong>&quot;Acceder a mi cuenta&quot;</strong> del nuevo correo.
          </p>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-500">
            Si el enlace no funciona nuevamente, es posible que tu cliente de
            correo (Gmail, Outlook) lo esté abriendo autom&aacute;ticamente por
            seguridad. En ese caso, copia el enlace del correo y p&eacute;galo
            directamente en tu navegador.
          </p>
        </div>
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <a
            href="/auth/login"
            className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            Ir al inicio de sesi&oacute;n
          </a>
        </div>
      </div>
    </div>
  );
}

export default function ResentPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 dark:from-gray-800 dark:via-gray-900 dark:to-black">
        <div className="text-center">
          <p className="text-white">Loading...</p>
        </div>
      </div>
    }>
      <ResentContent />
    </Suspense>
  );
}
