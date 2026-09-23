'use client';

/**
 * Sidebar del shell (Figma `02 Componentes` › Navegación › Sidebar, y
 * `03 Navegación y shell`).
 *
 * - rail 72 px: isotipo, iconos con tooltip, botón expandir, bloque de sesión colapsado.
 * - expanded 264 px: firma «GO Admin» + contraer, secciones con título, bloque de sesión.
 * - drawer 288 px (móvil): cabecera Azul GO con ×, acordeón de páginas, acciones fijas al pie.
 *
 * Sin selector de organización: vive en el header. El contenido lo decide
 * `filtrarNavegacion()`; aquí solo se pinta.
 */
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { RutaActiva, SeccionVisible, ModuloVisible } from '@/lib/navigation/filtrar';
import { Firma, Isotipo } from '../marca/Firma';
import { NavItem, type ModoSidebar } from './NavItem';
import { ListaPaginas } from './SubMenuPanel';

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
  /** Acciones fijas del drawer, sobre el bloque de sesión (p. ej. «Reportar problema»). */
  accionesDrawer?: React.ReactNode;
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
}: SidebarProps) {
  const t = useTranslations('nav');
  const rail = modo === 'rail';
  const drawer = modo === 'drawer';
  // En el drawer el submenú es un acordeón con un solo módulo abierto a la vez;
  // arranca abierto el del módulo activo.
  const [acordeon, setAcordeon] = useState<string | null>(activa?.modulo.id ?? null);

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

        {/* Navegación */}
        <nav
          aria-label={t('mainNavigation')}
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 pt-1',
            rail ? 'items-center px-3' : 'px-4'
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
                    const abiertoAqui = drawer ? acordeon === item.modulo.id : submenuAbierto === item.modulo.id;
                    const acordeonId = `acordeon-${item.modulo.id}`;
                    return (
                      <li key={item.modulo.id}>
                        <NavItem
                          item={item}
                          modo={modo}
                          activo={activo}
                          abierto={abiertoAqui}
                          controlaId={drawer ? acordeonId : submenuPanelId}
                          onAbrirSubmenu={(it, el) =>
                            drawer
                              ? setAcordeon((actual) => (actual === it.modulo.id ? null : it.modulo.id))
                              : onAbrirSubmenu(it, el)
                          }
                          onHover={rail ? onHoverModulo : undefined}
                          onNavegar={onNavegar}
                        />
                        {drawer && item.tieneSubmenu && abiertoAqui && (
                          <div id={acordeonId} className="ml-[18px] border-l border-line py-1 pl-3">
                            <ListaPaginas
                              paginas={item.paginas}
                              paginaActiva={activo ? activa?.pagina?.href ?? null : null}
                              onNavegar={onNavegar}
                              tactil
                            />
                          </div>
                        )}
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
