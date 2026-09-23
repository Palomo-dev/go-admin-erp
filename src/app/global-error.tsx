"use client";
import * as Sentry from "@sentry/react";
import { useEffect, useState } from "react";
// global-error reemplaza al layout raíz: sin estas hojas no hay Tailwind ni tokens.
import "@/styles/tokens.css";
import "./globals.css";
import { Firma } from "@/components/shell/marca/Firma";
import { defaultLocale, detectBrowserLocale, isValidLocale, type Locale } from "@/i18n/config";

interface TextosErrorGlobal {
  title: string;
  description: string;
  retry: string;
}

/**
 * Idioma sin providers: global-error se monta fuera de I18nProvider, así que se
 * lee la misma preferencia que guarda `changeLanguage` (localStorage en web) y,
 * si no hay, el idioma del navegador.
 */
function resolverIdioma(): Locale {
  try {
    const guardado = window.localStorage.getItem("preferredLanguage");
    if (guardado && isValidLocale(guardado)) return guardado;
  } catch {
    // Almacenamiento bloqueado: se usa el del navegador.
  }
  return detectBrowserLocale();
}

async function cargarTextos(idioma: Locale): Promise<TextosErrorGlobal | null> {
  for (const loc of idioma === defaultLocale ? [idioma] : [idioma, defaultLocale]) {
    try {
      const mod = await import(`../../messages/${loc}.json`);
      const textos = mod.default?.errorPages?.globalError as TextosErrorGlobal | undefined;
      if (textos) return textos;
    } catch {
      // Si el chunk del idioma no carga (puede ser la causa del error), se prueba el siguiente.
    }
  }
  return null;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [idioma, setIdioma] = useState<Locale>(defaultLocale);
  const [textos, setTextos] = useState<TextosErrorGlobal | null>(null);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    let cancelado = false;
    const loc = resolverIdioma();
    setIdioma(loc);
    void cargarTextos(loc).then((t) => {
      if (!cancelado) setTextos(t);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <html lang={idioma}>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
          <div className="w-full max-w-md text-center">
            {/* Firma del manual de marca (sin hooks ni providers) */}
            <div className="mb-6 flex items-center justify-center">
              <Firma />
            </div>

            {/* Aviso: si los textos no cargan, queda la firma y el botón de reintento */}
            {textos && (
              <div className="rounded-xl border border-line-warning bg-warning-subtle p-4 shadow-sm">
                <div className="flex items-start gap-3 text-left">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-surface">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-warning"
                      aria-hidden="true"
                    >
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-warning-text">{textos.title}</p>
                    <p className="mt-1 text-xs text-warning-text">{textos.description}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Acción */}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-action px-5 py-2.5 text-sm font-medium text-fg-on-brand shadow-sm transition-colors hover:bg-brand-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              {textos?.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
