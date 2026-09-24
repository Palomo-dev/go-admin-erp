/**
 * Render de componentes en pruebas (Testing Library + jsdom, POS-PLAN D9).
 *
 * Uso: el archivo de prueba empieza con el docblock `@jest-environment jsdom`
 * y renderiza con `renderConIdioma(<Componente />)`: el proveedor real de
 * next-intl con messages/<idioma>.json, así los textos de la prueba son los
 * que ve el cajero y una clave que falte rompe la prueba.
 *
 * jsdom no trae `matchMedia`, `ResizeObserver` ni `IntersectionObserver`: se
 * dan versiones mínimas (el ancho por defecto es de escritorio; se cambia con
 * `simularAncho`).
 */
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import es from '../../messages/es.json';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';
import pt from '../../messages/pt.json';

export type IdiomaPrueba = 'es' | 'en' | 'fr' | 'pt';
const MENSAJES = { es, en, fr, pt } as const;

let anchoSimulado = 1440;

/** Ancho de ventana que responden `matchMedia('(min-width: …)')` y `innerWidth`. */
export function simularAncho(ancho: number): void {
  anchoSimulado = ancho;
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: ancho });
  }
}

function cumpleConsulta(consulta: string): boolean {
  const min = /min-width:\s*(\d+)px/.exec(consulta);
  const max = /max-width:\s*(\d+(?:\.\d+)?)px/.exec(consulta);
  if (min && anchoSimulado < Number(min[1])) return false;
  if (max && anchoSimulado > Number(max[1])) return false;
  return Boolean(min || max);
}

function instalarApisDelNavegador(): void {
  if (typeof window === 'undefined') return;
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: cumpleConsulta(query),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!g.IntersectionObserver) {
    g.IntersectionObserver = class {
      readonly root = null;
      readonly rootMargin = '';
      readonly thresholds = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
  const el = window.HTMLElement?.prototype as unknown as Record<string, unknown> | undefined;
  if (el && !el.scrollIntoView) el.scrollIntoView = () => undefined;
  if (el && !el.hasPointerCapture) el.hasPointerCapture = () => false;
  if (el && !el.releasePointerCapture) el.releasePointerCapture = () => undefined;
}

instalarApisDelNavegador();

export function ProveedorIdioma({ idioma = 'es', children }: { idioma?: IdiomaPrueba; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={idioma} messages={MENSAJES[idioma]} timeZone="America/Bogota">
      {children}
    </NextIntlClientProvider>
  );
}

export function renderConIdioma(ui: ReactElement, opciones: RenderOptions & { idioma?: IdiomaPrueba } = {}) {
  const { idioma = 'es', ...resto } = opciones;
  return render(ui, {
    wrapper: ({ children }) => <ProveedorIdioma idioma={idioma}>{children}</ProveedorIdioma>,
    ...resto,
  });
}
