"use client";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-slate-900">Algo salió mal</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ha ocurrido un error inesperado. El equipo ha sido notificado.
            </p>
            <button
              onClick={() => reset()}
              className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
