'use client';

/**
 * El sidebar del shell con su panel de submenú, tal como lo monta `AppLayout`.
 *
 * Decide el modo y guarda las preferencias de la persona:
 * - escritorio (≥ 1024 px): rail o expandido. Por defecto expandido desde
 *   1280 px y rail por debajo (decisión 15 del diseño); la elección se recuerda
 *   (`shell.sidebar`). Antes arrancaba siempre colapsado y no se recordaba.
 * - móvil (< 1024 px): drawer con acordeón, abierto desde el header.
 *
 * Panel de submenú (solo escritorio):
 * - clic en un módulo con varias páginas: abre o cierra su panel fijo;
 * - en el rail, pasar el ratón muestra una vista previa flotante;
 * - «Fijar» (`shell.submenuFijado`) lo deja abierto al navegar y cambia solo al
 *   módulo de la ruta; sin fijar, se cierra al navegar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { ModuloVisible, RutaActiva, SeccionVisible } from '@/lib/navigation/filtrar';
import { Sidebar } from './Sidebar';
import { SubMenuPanel } from './SubMenuPanel';
import { BloqueSesion } from '../sesion/BloqueSesion';
import type { UsuarioSesion } from '../sesion/PanelSesion';

const CLAVE_MODO = 'shell.sidebar';
const CLAVE_FIJADO = 'shell.submenuFijado';
const PANEL_ID = 'shell-submenu';

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento: la preferencia dura lo que dure la pestaña
  }
}

interface SidebarShellProps {
  pathname: string | null;
  secciones: SeccionVisible[];
  cargando: boolean;
  activa: RutaActiva | null;
  drawerAbierto: boolean;
  onCerrarDrawer: () => void;
  usuario: UsuarioSesion | null;
  organizacion: string;
  tema: 'light' | 'dark';
  onAlternarTema: () => void;
  onCerrarSesion: () => void;
  cerrandoSesion: boolean;
  /** Acciones fijas del drawer móvil (p. ej. «Reportar problema»). */
  accionesDrawer?: React.ReactNode;
}

export function SidebarShell({
  pathname,
  secciones,
  cargando,
  activa,
  drawerAbierto,
  onCerrarDrawer,
  usuario,
  organizacion,
  tema,
  onAlternarTema,
  onCerrarSesion,
  cerrandoSesion,
  accionesDrawer,
}: SidebarShellProps) {
  const [modo, setModo] = useState<'rail' | 'expanded'>('expanded');
  const [esMovil, setEsMovil] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [fijado, setFijado] = useState(false);
  const [flotante, setFlotante] = useState<{ id: string; top: number } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preferencias guardadas y punto de corte.
  useEffect(() => {
    const guardado = leer(CLAVE_MODO);
    setModo(guardado === 'rail' || guardado === 'expanded' ? guardado : window.innerWidth >= 1280 ? 'expanded' : 'rail');
    setFijado(leer(CLAVE_FIJADO) === '1');
    const medir = () => setEsMovil(window.innerWidth < 1024);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const buscar = useCallback(
    (id: string | null): ModuloVisible | null =>
      id ? secciones.flatMap((s) => s.modulos).find((m) => m.modulo.id === id) ?? null : null,
    [secciones]
  );

  // Al navegar: sin fijar se cierra; fijado, sigue al módulo de la ruta.
  useEffect(() => {
    setFlotante(null);
    if (!fijado) {
      setPanel(null);
      return;
    }
    const id = activa?.modulo.id ?? null;
    if (id && buscar(id)?.tieneSubmenu) setPanel(id);
    // Solo al cambiar de ruta o de fijado: `buscar` cambia con los módulos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, fijado]);

  const alternarModo = () => {
    const nuevo = modo === 'rail' ? 'expanded' : 'rail';
    setModo(nuevo);
    guardar(CLAVE_MODO, nuevo);
  };

  const alternarFijado = () => {
    const nuevo = !fijado;
    setFijado(nuevo);
    guardar(CLAVE_FIJADO, nuevo ? '1' : '0');
  };

  const abrirSubmenu = (item: ModuloVisible) => {
    setFlotante(null);
    setPanel((actual) => (actual === item.modulo.id ? null : item.modulo.id));
  };

  const limpiarTemporizador = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };

  // Vista previa flotante en el rail: aparece tras una pausa corta (para no
  // parpadear al cruzar el menú) y se queda mientras el ratón esté encima.
  const alPasar = (item: ModuloVisible | null, disparador: HTMLElement | null) => {
    limpiarTemporizador();
    if (!item || !disparador || !item.tieneSubmenu || panel === item.modulo.id) {
      temporizador.current = setTimeout(() => setFlotante(null), 180);
      return;
    }
    const rect = disparador.getBoundingClientRect();
    temporizador.current = setTimeout(() => setFlotante({ id: item.modulo.id, top: rect.top }), 120);
  };

  const itemPanel = buscar(panel);
  const itemFlotante = flotante ? buscar(flotante.id) : null;
  const paginaActiva = activa?.pagina?.href ?? null;
  const bloque = (m: 'rail' | 'expanded' | 'drawer') => (
    <BloqueSesion
      modo={m}
      usuario={usuario}
      organizacion={organizacion}
      tema={tema}
      onAlternarTema={onAlternarTema}
      onCerrarSesion={onCerrarSesion}
      cerrandoSesion={cerrandoSesion}
    />
  );

  if (esMovil) {
    return (
      <>
        <div
          aria-hidden="true"
          onClick={onCerrarDrawer}
          className={cn(
            'fixed inset-0 z-40 bg-slate-900/50 transition-opacity duration-300',
            drawerAbierto ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        />
        <div
          className={cn(
            'fixed inset-y-0 left-0 z-50 h-dynamic-screen transition-transform duration-300 ease-out',
            drawerAbierto ? 'translate-x-0' : '-translate-x-full'
          )}
          aria-hidden={!drawerAbierto}
          inert={!drawerAbierto || undefined}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCerrarDrawer();
          }}
        >
          <Sidebar
            modo="drawer"
            secciones={secciones}
            cargando={cargando}
            activa={activa}
            submenuAbierto={null}
            submenuPanelId={PANEL_ID}
            onAbrirSubmenu={() => undefined}
            onCerrarDrawer={onCerrarDrawer}
            onNavegar={onCerrarDrawer}
            pie={bloque('drawer')}
            accionesDrawer={accionesDrawer}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative z-30 flex h-dynamic-screen shrink-0">
        <Sidebar
          modo={modo}
          secciones={secciones}
          cargando={cargando}
          activa={activa}
          submenuAbierto={panel}
          submenuPanelId={PANEL_ID}
          onAbrirSubmenu={abrirSubmenu}
          onHoverModulo={modo === 'rail' ? alPasar : undefined}
          onAlternarModo={alternarModo}
          onNavegar={() => {
            if (!fijado) setPanel(null);
          }}
          pie={bloque(modo)}
        />
        {itemPanel && itemPanel.tieneSubmenu && (
          <SubMenuPanel
            id={PANEL_ID}
            item={itemPanel}
            modo="docked"
            paginaActiva={paginaActiva}
            fijado={fijado}
            onFijar={alternarFijado}
            onCerrar={() => setPanel(null)}
            onNavegar={() => {
              if (!fijado) setPanel(null);
            }}
          />
        )}
      </div>
      {modo === 'rail' && itemFlotante && flotante && (
        <div
          className="fixed z-50"
          style={{
            left: 'calc(var(--size-sidebar-collapsed) + 8px)',
            top: Math.max(8, Math.min(flotante.top - 8, window.innerHeight - 488)),
            height: Math.min(480, window.innerHeight - 16),
          }}
        >
          <SubMenuPanel
            id={`${PANEL_ID}-flotante`}
            item={itemFlotante}
            modo="floating"
            paginaActiva={paginaActiva}
            fijado={false}
            onFijar={() => {
              setPanel(itemFlotante.modulo.id);
              setFlotante(null);
              if (!fijado) alternarFijado();
            }}
            onCerrar={() => setFlotante(null)}
            onNavegar={() => setFlotante(null)}
            onMouseEnter={limpiarTemporizador}
            onMouseLeave={() => alPasar(null, null)}
          />
        </div>
      )}
    </>
  );
}
