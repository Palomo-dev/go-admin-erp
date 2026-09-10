"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Frontera de errores de la app.
 *
 * IMPORTANTE — por qué NO importa `@sentry/react` de forma estática:
 * este componente envuelve a `children` en el layout raíz, así que su import
 * entraba en el chunk del layout y arrastraba el SDK entero. En desarrollo ese
 * chunk iba sin minificar y superó los 6,7 MB, con Sentry como mayor parte; el
 * navegador agotaba el tiempo de espera y la app no arrancaba con
 * `ChunkLoadError: Loading chunk app/layout failed`.
 *
 * La frontera es ahora un componente de clase de React, que es lo único que hace
 * falta para capturar el error y pintar el aviso. El SDK se carga **solo cuando
 * ocurre un error**, que es el único momento en que se necesita. Sentry web se
 * sigue inicializando por su vía propia (`sentry.client.config.ts`), así que el
 * error llega igual al panel.
 */

function ErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md text-center">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-lg shadow-sm">
            GO
          </span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">
            Admin ERP
          </span>
        </div>

        {/* Alert card */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4 shadow-sm">
          <div className="flex items-start gap-3 text-left">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Se ha producido un error inesperado
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                El equipo ha sido notificado automáticamente. Puedes intentar
                recargar la página para continuar.
              </p>
            </div>
          </div>
        </div>

        {/* Action */}
        <button
          onClick={() => window.location.reload()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          Recargar página
        </button>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class SentryErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Carga diferida: el SDK solo se descarga si de verdad hubo un error.
    void import("@sentry/react")
      .then((Sentry) => {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      })
      .catch((err) => {
        // Si ni el reporte se puede cargar, al menos queda constancia local:
        // tragarlo en silencio dejaría el fallo sin ningún rastro.
        console.error("[sentry] No se pudo reportar el error", err, error);
      });
  }

  render(): ReactNode {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
