'use client';

/**
 * Cómo se comporta el shell móvil en cada pantalla (Figma `02 Componentes` ›
 * MobileHeader 48:2550 y MobileTabBar 57:3101).
 *
 * MobileHeader tiene tres modos:
 * - root (inicio y la entrada de cada módulo): organización / sucursal + buscar.
 * - page (detalle, formulario): «← Volver» · título (+ subtítulo) · acción
 *   contextual. Sin selector de organización.
 * - pos: organización / sucursal + estado de la caja, mínimo.
 *
 * La barra inferior se ve en todo /app, salvo en formularios a pantalla
 * completa, en el POS con el carrito abierto o cobrando, y con el teclado
 * abierto.
 *
 * El modo sale de la ruta (`modoPorRuta`). Una página puede precisarlo con
 * `useCabeceraMovil({ titulo, accion, ocultarBarra, … })`: gana lo que declare
 * la página y, al desmontarse, vuelve lo de la ruta.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';

export type ModoCabeceraMovil = 'root' | 'page' | 'pos';

export interface EstadoPos {
  texto: string;
  tono: 'exito' | 'advertencia';
}

export interface CabeceraMovilPagina {
  modo?: ModoCabeceraMovil;
  titulo?: string;
  subtitulo?: string;
  /** Acción a la derecha en modo página: un botón «⋯», «Guardar», filtros… */
  accion?: ReactNode;
  /** A dónde vuelve «←» si no hay historial (por defecto, la página padre del menú). */
  volverA?: string;
  /** Modo POS: chip de estado de la caja/turno. */
  estadoPos?: EstadoPos | null;
  ocultarBarra?: boolean;
}

type Fijar = (c: CabeceraMovilPagina | null) => void;

// Dos contextos: las páginas solo usan el de fijar (estable), así que no se
// vuelven a renderizar cuando cambia la cabecera; solo la cabecera lee el valor.
const ContextoValor = createContext<CabeceraMovilPagina | null>(null);
const ContextoFijar = createContext<Fijar>(() => undefined);

export function CabeceraMovilProvider({ children }: { children: ReactNode }) {
  const [pagina, fijar] = useState<CabeceraMovilPagina | null>(null);
  return (
    <ContextoFijar.Provider value={fijar}>
      <ContextoValor.Provider value={pagina}>{children}</ContextoValor.Provider>
    </ContextoFijar.Provider>
  );
}

export function useCabeceraMovilActual(): CabeceraMovilPagina | null {
  return useContext(ContextoValor);
}

/**
 * Para las páginas: declara título, acción o que la barra inferior se oculte.
 * Se publica tras cada render de la página, así `accion` nunca queda con un
 * cierre viejo; al desmontarse la página, vuelve lo que diga la ruta.
 */
export function useCabeceraMovil(c: CabeceraMovilPagina): void {
  const fijar = useContext(ContextoFijar);
  useEffect(() => {
    fijar(c);
  });
  useEffect(() => () => fijar(null), [fijar]);
}

// ─── Modo por ruta ──────────────────────────────────────────────────────────

/** Rutas que son la entrada de un módulo o una página del menú: modo raíz. */
const RAICES = new Set<string>([
  '/app/inicio',
  ...CATALOGO_NAV.flatMap((m) => [...m.rutas, ...m.paginas.map((p) => p.href)]).map((r) => r.split('?')[0]),
]);

const SEGMENTOS_FORMULARIO = new Set(['nuevo', 'nueva', 'crear', 'editar', 'new', 'edit', 'create']);

function limpiar(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function modoPorRuta(pathname: string | null): ModoCabeceraMovil {
  if (!pathname) return 'root';
  const ruta = limpiar(pathname);
  if (ruta === '/app/pos') return 'pos';
  return RAICES.has(ruta) ? 'root' : 'page';
}

/** Formularios a pantalla completa (…/nuevo, …/[id]/editar): sin barra inferior. */
export function esFormularioPorRuta(pathname: string | null): boolean {
  if (!pathname) return false;
  const ultimo = limpiar(pathname).split('/').pop() ?? '';
  return SEGMENTOS_FORMULARIO.has(ultimo);
}

/** Página del menú más cercana por encima de la ruta: a dónde vuelve «←» sin historial. */
export function rutaPadre(pathname: string | null): string {
  if (!pathname) return '/app/inicio';
  const partes = limpiar(pathname).split('/');
  for (let i = partes.length - 1; i > 1; i--) {
    const candidata = partes.slice(0, i).join('/');
    if (RAICES.has(candidata)) return candidata;
  }
  return '/app/inicio';
}

/** El teclado en pantalla abierto (el viewport visible se encoge con un campo enfocado). */
export function useTecladoAbierto(): boolean {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const medir = () => {
      const campo = document.activeElement;
      const editable =
        campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement || (campo as HTMLElement | null)?.isContentEditable;
      setAbierto(!!editable && window.innerHeight - vv.height > 150);
    };
    vv.addEventListener('resize', medir);
    window.addEventListener('focusin', medir);
    window.addEventListener('focusout', medir);
    return () => {
      vv.removeEventListener('resize', medir);
      window.removeEventListener('focusin', medir);
      window.removeEventListener('focusout', medir);
    };
  }, []);
  return abierto;
}
