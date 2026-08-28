"use client";
import * as Sentry from "@sentry/react";

function ErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-slate-900">Algo salió mal</h2>
        <p className="mt-2 text-sm text-slate-600">
          Ha ocurrido un error inesperado. El equipo ha sido notificado.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}

export function SentryErrorBoundary({ children }: { children: React.ReactNode }) {
  return <Sentry.ErrorBoundary fallback={ErrorFallback}>{children}</Sentry.ErrorBoundary>;
}
