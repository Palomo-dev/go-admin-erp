'use client';

/**
 * Sidebar del shell (Figma `02 Componentes` › Navegación › Sidebar, y
 * `03 Navegación y shell`).
 *
 * - rail 72 px: isotipo, iconos con tooltip, botón expandir, bloque de sesión colapsado.
 * - expanded 264 px: firma «GO Admin» + contraer, secciones con título, bloque de sesión.
 * - drawer 288 px (móvil): cabecera Azul GO con ×; nivel 1 = módulos, nivel 2 = páginas del
 *   módulo que se desliza encima (DrawerNivel2), con el bloque de sesión fijo al pie.
 *
 * Sin selector de organización: vive en el header. El contenido lo decide
 * `filtrarNavegacion()`; aquí solo se pinta.
 */
import { useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RutaActiva, SeccionVisible, ModuloVisible } from '@/lib/navigation/filtrar';
import { Firma, Isotipo } from '../marca/Firma';
import { NavItem, type ModoSidebar } from './NavItem';
import { DrawerNivel2 } from './DrawerNivel2';

interface SidebarProps {
  modo: ModoSidebar;
  secciones: SeccionVisible[];
  cargando: boolean;
  activa: RutaActiva | null;
  /** id del módulo cuyo panel está abierto (escritorio). */
  submenuAbierto: string | null;
  submenuPanelId: string;
  onAbrirSubmenu: (item: ModuloVisible, disparador: HTMLElement) => void;
  onHoverModulo?: (item: ModuloVisible | null, disparador: HTMLElement | null) => void;
  onAlternarModo?: () => void;
  onCerrarDrawer?: () => void;
  onNavegar?: () => void;
  /** Bloque de sesión (UserBlock). */
  pie: React.ReactNode;
  /** Acciones al final de la lista del drawer. */
  accionesDrawer?: React.ReactNode;
  /** Drawer móvil: al abrirse vuelve al módulo de la ruta (o al nivel 1). */
  drawerAbierto?: boolean;
}

function Esqueleto({ rail }: { rail: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 pt-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className={cn('flex items-center gap-2.5', rail ? 'justify-center' : 'pl-1.5')}>
          <span className="h-7 w-7 animate-pulse rounded-md bg-subtle" />
          {!rail && <span className="h-3 flex-1 animate-pulse rounded bg-subtle" />}
        </div>
      ))}
    </div>
  );
}

export function Sidebar({
  modo,
  secciones,
  cargando,
  activa,
  submenuAbierto,
  submenuPanelId,
  onAbrirSubmenu,
  onHoverModulo,
  onAlternarModo,
  onCerrarDrawer,
  onNavegar,
  pie,
  accionesDrawer,
  drawerAbierto,
}: SidebarProps) {
  const t = useTranslations('nav');
  const rail = modo === 'rail';
  const drawer = modo === 'drawer';
  // Drawer por niveles (Figma MobileDrawerNivel2): `nivel2` es el módulo cuyas
  // páginas se ven. Al abrir el drawer arranca en el módulo de la ruta si tiene
  // submenú: lo más probable es ir a otra página del mismo módulo.
  const modulos = secciones.flatMap((s) => s.modulos);
  const moduloDeRuta = activa ? modulos.find((m) => m.modulo.id === activa.modulo.id && m.tieneSubmenu) ?? null : null;
  const [nivel2, setNivel2] = useState<string | null>(moduloDeRuta?.modulo.id ?? null);
  // Se conserva el último módulo para que el panel no se vacíe mientras sale.
  const [ultimoNivel2, setUltimoNivel2] = useState<string | null>(nivel2);
  const refVolver = useRef<HTMLButtonElement>(null);
  const refNivel1 = useRef<HTMLElement>(null);

  useEffect(() => {
    if (drawer && drawerAbierto) {
      setNivel2(moduloDeRuta?.modulo.id ?? null);
      if (moduloDeRuta) setUltimoNivel2(moduloDeRuta.modulo.id);
    }
    // Al abrir el drawer, al cambiar de ruta y cuando termina de cargar el menú
    // (si se abrió mientras cargaba, el módulo de la ruta aún no existía).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerAbierto, activa?.modulo.id, cargando]);

  const entrar = (id: string) => {
    setUltimoNivel2(id);
    setNivel2(id);
    // Tras la transición, el foco pasa a «← Menú».
    window.setTimeout(() => refVolver.current?.focus(), 220);
  };
  const volver = () => {
    const id = nivel2;
    setNivel2(null);
    window.setTimeout(() => {
      refNivel1.current?.querySelector<HTMLElement>(`[data-modulo="${id}"] button, [data-modulo="${id}"] a`)?.focus();
    }, 220);
  };
  const itemNivel2 = modulos.find((m) => m.modulo.id === (nivel2 ?? ultimoNivel2)) ?? null;
  const panelNivel2Id = 'drawer-nivel-2';

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex h-full shrink-0 flex-col overflow-hidden bg-sidebar',
          drawer
            ? 'w-72 max-w-[85vw] shadow-[0_2px_6px_rgba(15,23,42,0.06),0_12px_32px_-4px_rgba(15,23,42,0.14)]'
            : cn('border-r border-line', rail ? 'w-rail' : 'w-sidebar')
        )}
      >
        {/* Marca */}
        {drawer ? (
          <div className="mobile-safe-top flex h-[60px] shrink-0 items-center justify-between bg-brand pl-4 pr-2">
            <Firma invertido />
            <button
              type="button"
              onClick={onCerrarDrawer}
              aria-label={t('closeMenu')}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        ) : rail ? (
          <div className="flex h-16 shrink-0 items-center justify-center">
            <Isotipo tamano={32} />
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center justify-between pl-4 pr-2">
            <Firma />
            <button
              type="button"
              onClick={onAlternarModo}
              aria-label={t('collapseMenu')}
              title={t('collapseMenu')}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
            >
              <PanelLeftClose size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Navegación. En el drawer, dos paneles que se deslizan (nivel 1 / nivel 2). */}
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <nav
          ref={refNivel1}
          aria-label={t('mainNavigation')}
          aria-hidden={drawer && nivel2 ? true : undefined}
          inert={drawer && nivel2 ? true : undefined}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 pt-1',
            rail ? 'items-center px-3' : 'px-4',
            drawer && 'absolute inset-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
            drawer && (nivel2 ? '-translate-x-full' : 'translate-x-0')
          )}
        >
          {cargando && secciones.length <= 1 ? (
            <Esqueleto rail={rail} />
          ) : (
            secciones.map((seccion) => (
              <div key={seccion.codigo} className={cn('flex flex-col gap-0.5', rail && 'items-center')}>
                {rail ? (
                  <div className="pb-1.5 pt-2.5" aria-hidden="true">
                    <span className="block h-px w-6 bg-line" />
                  </div>
                ) : (
                  <p className="pb-1 pl-2 pt-3 text-xs font-semibold leading-4 text-fg-muted">{t(seccion.etiqueta)}</p>
                )}
                <ul className={cn('flex flex-col gap-0.5', !rail && 'w-full')}>
                  {seccion.modulos.map((item) => {
                    const activo = activa?.modulo.id === item.modulo.id;
                    const abiertoAqui = drawer ? nivel2 === item.modulo.id : submenuAbierto === item.modulo.id;
                    return (
                      <li key={item.modulo.id} data-modulo={item.modulo.id}>
                        <NavItem
                          item={item}
                          modo={modo}
                          activo={activo}
                          abierto={abiertoAqui}
                          controlaId={drawer ? panelNivel2Id : submenuPanelId}
                          onAbrirSubmenu={(it, el) => (drawer ? entrar(it.modulo.id) : onAbrirSubmenu(it, el))}
                          onHover={rail ? onHoverModulo : undefined}
                          onNavegar={onNavegar}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {/* Acciones del drawer (p. ej. «Reportar problema»): un elemento más del
              menú, al final de la lista (Figma MobileDrawer 30:954). */}
          {drawer && accionesDrawer && !cargando && <div className="flex flex-col gap-0.5 pt-3">{accionesDrawer}</div>}
        </nav>
        {drawer && itemNivel2 && (
          <div
            aria-hidden={nivel2 ? undefined : true}
            inert={nivel2 ? undefined : true}
            className={cn(
              'absolute inset-0 bg-sidebar transition-transform duration-200 ease-out motion-reduce:transition-none',
              nivel2 ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <DrawerNivel2
              ref={refVolver}
              id={panelNivel2Id}
              item={itemNivel2}
              paginaActiva={activa?.modulo.id === itemNivel2.modulo.id ? activa?.pagina?.href ?? null : null}
              onVolver={volver}
              onNavegar={onNavegar}
            />
          </div>
        )}
        </div>

        {/* Pie */}
        <div className={cn('flex shrink-0 flex-col', drawer && 'pb-safe-bottom')}>
          {rail && (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={onAlternarModo}
                aria-label={t('expandMenu')}
                title={t('expandMenu')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
              >
                <PanelLeftOpen size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          {pie}
        </div>
      </aside>
    </TooltipProvider>
  );
}
