'use client';

/**
 * Cómo se comporta el shell móvil en cada pantalla (Figma `02 Componentes` ›
 * MobileHeader 48:2550 y MobileTabBar 57:3101).
 *
 * MobileHeader tiene tres modos:
 * - root (inicio y la entrada de cada módulo): organización / sucursal + buscar.
 * - page (detalle, formulario): «← Volver» · título (+ subtítulo) · acción
 *   contextual. Sin selector de organización.
 * - pos: «←» (salir del POS; el carrito se conserva) · chip de la sucursal
 *   activa · estado de la caja. Sin selector de organización: cambiarla con
 *   un carrito abierto es riesgoso, y sigue en Inicio y en el menú.
 *
 * Barra inferior (MobileTabBar) — regla aprobada el 2026-09-29, una sola y
 * aquí (`barraInferiorVisible`):
 * - Se ve SOLO en Inicio y en las páginas principales del menú (las raíces
 *   del catálogo de navegación, sin cablear rutas: `esRaizConBarra`).
 * - No se ve en detalles (manda «←»), formularios, flujos de pantalla
 *   completa (el POS y las páginas del catálogo con `pantallaCompleta`) ni
 *   con el teclado abierto.
 * - Tampoco mientras una pieza pone su propia barra inferior fija
 *   (BulkActionBar en móvil, pie del formulario de documento, «Cobrar» del
 *   POS…): la pieza se registra con `useBarraInferiorPropia` y ocupa el sitio.
 * - `ocultarBarra` de la página es el override explícito (true la oculta,
 *   false la muestra), por encima de la ruta pero no de las barras propias
 *   ni del teclado.
 *
 * El modo de la cabecera sale de la ruta (`modoPorRuta`). Una página puede
 * precisarlo con `useCabeceraMovil({ titulo, accion, ocultarBarra, … })`: gana
 * lo que declare la página y, al desmontarse, vuelve lo de la ruta.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Acción a la derecha en modo página («⋯», «Guardar», filtros…) y en modo POS («⋯ Caja y dispositivo»). */
  accion?: ReactNode;
  /** A dónde vuelve «←» si no hay historial (por defecto, la página padre del menú). */
  volverA?: string;
  /** Modo POS: chip de estado de la caja/turno. */
  estadoPos?: EstadoPos | null;
  /**
   * Override explícito de la barra inferior: `true` la oculta y `false` la
   * muestra aunque la ruta no sea raíz. Sin valor, decide la regla central.
   */
  ocultarBarra?: boolean;
}

type Fijar = (c: CabeceraMovilPagina | null) => void;

// Dos contextos: las páginas solo usan el de fijar (estable), así que no se
// vuelven a renderizar cuando cambia la cabecera; solo la cabecera lee el valor.
const ContextoValor = createContext<CabeceraMovilPagina | null>(null);
const ContextoFijar = createContext<Fijar>(() => undefined);

/** Barras inferiores propias abiertas y el alto (px) de la más alta. */
export interface BarrasInferiores {
  cantidad: number;
  alto: number;
}
type RegistrarBarra = (id: symbol, alto: number | null) => void;
const SIN_BARRAS: BarrasInferiores = { cantidad: 0, alto: 0 };
const ContextoBarras = createContext<BarrasInferiores>(SIN_BARRAS);
// Fuera del shell (tests, páginas públicas) registrar no hace nada.
const ContextoRegistrarBarra = createContext<RegistrarBarra>(() => undefined);

/** Resumen de las barras registradas (puro, para el proveedor y los tests). */
export function resumirBarras(barras: ReadonlyMap<symbol, number>): BarrasInferiores {
  return { cantidad: barras.size, alto: barras.size ? Math.max(...barras.values()) : 0 };
}

export function CabeceraMovilProvider({ children }: { children: ReactNode }) {
  const [pagina, fijar] = useState<CabeceraMovilPagina | null>(null);
  const [resumen, setResumen] = useState<BarrasInferiores>(SIN_BARRAS);
  const barras = useRef(new Map<symbol, number>());
  // Registrar es estable: las piezas no se vuelven a renderizar por él, y el
  // resumen solo cambia cuando cambia la cantidad o el alto.
  const registrar = useCallback<RegistrarBarra>((id, alto) => {
    if (alto === null) barras.current.delete(id);
    else barras.current.set(id, alto);
    const r = resumirBarras(barras.current);
    setResumen((previo) => (previo.cantidad === r.cantidad && previo.alto === r.alto ? previo : r));
  }, []);
  return (
    <ContextoFijar.Provider value={fijar}>
      <ContextoRegistrarBarra.Provider value={registrar}>
        <ContextoBarras.Provider value={resumen}>
          <ContextoValor.Provider value={pagina}>{children}</ContextoValor.Provider>
        </ContextoBarras.Provider>
      </ContextoRegistrarBarra.Provider>
    </ContextoFijar.Provider>
  );
}

/** Para el shell: cuántas barras inferiores propias hay abiertas y su alto. */
export function useBarrasInferioresPropias(): BarrasInferiores {
  return useContext(ContextoBarras);
}

/**
 * Para las piezas con barra inferior fija propia (BulkActionBar en móvil, pie
 * del formulario de documento, «Cobrar» del POS): mientras `activa`, la barra
 * de la app se oculta y el contenido deja abajo el alto medido de la pieza.
 * Devuelve la ref para el elemento fijo.
 */
export function useBarraInferiorPropia<T extends HTMLElement = HTMLDivElement>(activa = true): (el: T | null) => void {
  const registrar = useContext(ContextoRegistrarBarra);
  const [elemento, setElemento] = useState<T | null>(null);
  useEffect(() => {
    if (!activa) return;
    const id = Symbol('barra-inferior');
    const medir = () => registrar(id, elemento ? Math.round(elemento.getBoundingClientRect().height) : 0);
    medir();
    const observador = elemento && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    if (observador && elemento) observador.observe(elemento);
    return () => {
      observador?.disconnect();
      registrar(id, null);
    };
  }, [activa, elemento, registrar]);
  return setElemento;
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

/** Páginas del menú que son un flujo a pantalla completa (mesas, check-in): sin barra inferior. */
const PANTALLA_COMPLETA = new Set<string>(
  CATALOGO_NAV.flatMap((m) => m.paginas.filter((p) => p.pantallaCompleta).map((p) => p.href.split('?')[0]))
);

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

/** Formularios a pantalla completa (…/nuevo, …/[id]/editar). */
export function esFormularioPorRuta(pathname: string | null): boolean {
  if (!pathname) return false;
  const ultimo = limpiar(pathname).split('/').pop() ?? '';
  return SEGMENTOS_FORMULARIO.has(ultimo);
}

/**
 * Inicio o una página principal del menú (raíz del catálogo) que no sea un
 * flujo a pantalla completa: las únicas rutas con barra inferior.
 */
export function esRaizConBarra(pathname: string | null): boolean {
  if (!pathname) return false;
  const ruta = limpiar(pathname);
  if (modoPorRuta(ruta) !== 'root' || esFormularioPorRuta(ruta)) return false;
  return !PANTALLA_COMPLETA.has(ruta);
}

export interface EntradaBarraInferior {
  pathname: string | null;
  pagina: Pick<CabeceraMovilPagina, 'modo' | 'ocultarBarra'> | null;
  /** Barras inferiores propias abiertas (BulkActionBar, pie de formulario…). */
  barrasPropias: number;
  teclado: boolean;
}

/** La regla única de la barra inferior (ver el comentario del archivo). */
export function barraInferiorVisible({ pathname, pagina, barrasPropias, teclado }: EntradaBarraInferior): boolean {
  if (teclado || barrasPropias > 0) return false;
  if (pagina?.ocultarBarra !== undefined) return !pagina.ocultarBarra;
  if (pagina?.modo === 'pos') return false;
  return esRaizConBarra(pathname);
}

/** Alto de la barra de la app: 64 px + el área segura del teléfono. */
export const ALTO_BARRA_APP = 'calc(4rem + env(safe-area-inset-bottom))';

/**
 * Espacio que el contenido deja abajo (`--shell-barra-inferior`): la barra de
 * la app si se ve; si no, la barra propia más alta; si no, nada.
 */
export function espacioInferior(barraVisible: boolean, altoPropias: number): string {
  if (barraVisible) return ALTO_BARRA_APP;
  return altoPropias > 0 ? `${altoPropias}px` : '0px';
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
