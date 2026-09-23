'use client';

/**
 * Ítem de módulo del sidebar (Figma `02 Componentes` › Navegación › NavItem).
 *
 * - expanded: 40 px de alto, icono en chip de 28, etiqueta y › si tiene submenú.
 * - rail: 48×48, solo el chip, con tooltip a la derecha.
 * - drawer: 48 px de alto (área táctil móvil); el submenú se abre como nivel 2 (DrawerNivel2).
 *
 * Activo (la ruta está en el módulo): fila en Tinte GO, chip en Azul acción.
 * Un módulo con varias páginas es un botón que abre su panel; uno con una sola
 * página es un enlace directo.
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ModuloVisible } from '@/lib/navigation/filtrar';

export type ModoSidebar = 'rail' | 'expanded' | 'drawer';

interface NavItemProps {
  item: ModuloVisible;
  modo: ModoSidebar;
  activo: boolean;
  /** true si el panel de submenú (o el nivel 2 del drawer) de este módulo está abierto. */
  abierto: boolean;
  /** id del panel/acordeón que controla, para aria-controls. */
  controlaId?: string;
  onAbrirSubmenu: (item: ModuloVisible, disparador: HTMLElement) => void;
  onHover?: (item: ModuloVisible | null, disparador: HTMLElement | null) => void;
  onNavegar?: () => void;
}

export function NavItem({ item, modo, activo, abierto, controlaId, onAbrirSubmenu, onHover, onNavegar }: NavItemProps) {
  const t = useTranslations('nav');
  const etiqueta = t(item.modulo.etiqueta);
  const Icono = item.modulo.icono;
  const rail = modo === 'rail';

  const clases = cn(
    'group flex items-center rounded-lg outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
    rail ? 'h-12 w-12 justify-center' : cn('w-full gap-2.5 pl-1.5 pr-2', modo === 'drawer' ? 'h-12' : 'h-10'),
    activo ? 'bg-brand-tint' : abierto ? 'bg-hover' : 'hover:bg-hover'
  );

  const contenido = (
    <>
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
          activo ? 'bg-brand-action text-fg-on-brand' : 'bg-subtle text-fg-secondary group-hover:text-fg'
        )}
      >
        <Icono size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      {!rail && (
        <>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm font-medium',
              activo ? 'text-brand-deep' : 'text-fg'
            )}
          >
            {etiqueta}
          </span>
          {/* En el drawer el submenú es un nivel 2 que se desliza (no un acordeón): › igual que en escritorio. */}
          {item.tieneSubmenu && <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-fg-muted" />}
        </>
      )}
    </>
  );

  const eventosHover = onHover
    ? {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => onHover(item, e.currentTarget),
        onMouseLeave: () => onHover(null, null),
      }
    : {};

  const elemento = item.tieneSubmenu ? (
    <button
      type="button"
      className={clases}
      aria-expanded={abierto}
      aria-controls={controlaId}
      aria-label={rail ? etiqueta : undefined}
      aria-current={activo ? 'true' : undefined}
      onClick={(e) => onAbrirSubmenu(item, e.currentTarget)}
      {...eventosHover}
    >
      {contenido}
    </button>
  ) : (
    <Link
      href={item.href}
      className={clases}
      aria-label={rail ? etiqueta : undefined}
      aria-current={activo ? 'page' : undefined}
      onClick={onNavegar}
      {...eventosHover}
    >
      {contenido}
    </Link>
  );

  // En el rail, los módulos con submenú muestran el panel flotante al pasar el
  // ratón (con el nombre en su cabecera): un tooltip encima sería redundante.
  if (!rail || item.tieneSubmenu) return elemento;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{elemento}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className="border-0 bg-tooltip px-2.5 py-1 text-xs font-medium text-white">
        {etiqueta}
      </TooltipContent>
    </Tooltip>
  );
}
