"use client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Copy, RefreshCw } from "lucide-react";

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

/**
 * Texto para soporte: qué falló, dónde y cuándo. Sin datos del usuario: solo
 * el mensaje del error, la ruta y el navegador (la app de escritorio se
 * reconoce en el user agent).
 */
function detalleError(error: Error | null): string {
  const lineas = [
    `Error: ${error?.message || "desconocido"}`,
    typeof window !== "undefined" ? `Ruta: ${window.location.pathname}` : "",
    `Hora: ${new Date().toISOString()}`,
    typeof navigator !== "undefined" ? `Navegador: ${navigator.userAgent}` : "",
    error?.stack ? `\n${error.stack.split("\n").slice(0, 6).join("\n")}` : "",
  ];
  return lineas.filter(Boolean).join("\n");
}

function ErrorFallback({ error }: { error: Error | null }) {
  const detalle = detalleError(error);
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

        {/* Qué falló: sin esto, un reporte de «pantalla de error» no se puede diagnosticar. */}
        <details className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-left dark:border-gray-700 dark:bg-gray-800">
          <summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">Detalles técnicos</summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-gray-600 dark:text-gray-400">{detalle}</pre>
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(detalle).catch(() => undefined)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar detalles para soporte
          </button>
        </details>

        {/* Actions */}
        <div className="mt-5 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <RefreshCw className="h-4 w-4" />
          Recargar página
        </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SentryErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Siempre a la consola: en la app de escritorio (Ctrl+Shift+I) es el
    // único rastro si Sentry no está configurado.
    console.error("[app] Error no controlado", error, info.componentStack);
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
    if (this.state.hasError) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}
