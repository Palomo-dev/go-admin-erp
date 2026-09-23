'use client';

/**
 * Nivel 2 del menú móvil (Figma `02 Componentes` › MobileDrawerNivel2 622:13996
 * y DrawerPageRow 622:13657). Sustituye al acordeón del drawer.
 *
 * Al tocar un módulo con submenú, el panel se desliza y muestra:
 * «← Menú» (vuelve al nivel 1) · título del módulo con su chip de icono sobre
 * brand/tint · sus páginas agrupadas con los rótulos del catálogo, en filas de
 * 48 px y sin icono (el icono ya va en el título). La página activa: fondo
 * brand/tint, texto brand/deep e indicador de 3 px. El bloque de sesión queda
 * fijo al pie (lo pinta el Sidebar).
 */
import { forwardRef } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { ModuloVisible } from '@/lib/navigation/filtrar';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { agrupar } from './SubMenuPanel';

interface DrawerNivel2Props {
  id: string;
  item: ModuloVisible;
  paginaActiva: string | null;
  onVolver: () => void;
  onNavegar?: () => void;
}

export const DrawerNivel2 = forwardRef<HTMLButtonElement, DrawerNivel2Props>(function DrawerNivel2(
  { id, item, paginaActiva, onVolver, onNavegar },
  refVolver
) {
  const t = useTranslations('nav');
  const nombres = useNombresNav();
  const Icono = item.modulo.icono;
  const etiqueta = t(item.modulo.etiqueta);
  const grupos = agrupar(item.paginas);

  return (
    <div id={id} className="flex h-full flex-col">
      <button
        ref={refVolver}
        type="button"
        onClick={onVolver}
        className="flex h-12 shrink-0 items-center gap-2 px-4 text-sm font-medium text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <ArrowLeft size={20} aria-hidden="true" />
        {t('backToMenu')}
      </button>

      <div className="flex h-14 shrink-0 items-center gap-2.5 bg-brand-tint px-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-action text-fg-on-brand" aria-hidden="true">
          <Icono size={18} strokeWidth={1.75} />
        </span>
        <h2 className="min-w-0 truncate text-lg font-semibold leading-6 text-fg">{etiqueta}</h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">
        {grupos.map((grupo, i) => (
          <div key={grupo.titulo ?? `sin-grupo-${i}`} className="flex flex-col gap-0.5">
            {grupo.titulo && (
              <p className="pb-1 pl-3 pt-3 text-xs font-semibold leading-4 text-fg-muted">{nombres.grupo(grupo.titulo)}</p>
            )}
            <ul className="flex flex-col gap-0.5">
              {grupo.paginas.map((p) => {
                const activa = p.href === paginaActiva;
                return (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      onClick={onNavegar}
                      aria-current={activa ? 'page' : undefined}
                      className={cn(
                        'relative flex h-12 items-center rounded-lg px-3 text-sm font-medium outline-none transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-brand',
                        activa ? 'bg-brand-tint text-brand-deep' : 'text-fg hover:bg-hover'
                      )}
                    >
                      {activa && (
                        <span aria-hidden="true" className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-sm bg-brand" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{nombres.pagina(p)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
});
