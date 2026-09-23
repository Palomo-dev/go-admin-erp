'use client';

/**
 * Segunda columna de navegación (Figma `02 Componentes` › Navegación ›
 * SubMenuPanel). Sustituye al flyout `DropdownMenu` del sidebar viejo, que
 * convivía con el panel y daba dos caminos a la misma página.
 *
 * - docked: fijo junto al sidebar; «Fijar» lo mantiene abierto al cambiar de
 *   módulo y al navegar.
 * - floating: vista previa al pasar el ratón por el rail, con sombra.
 *
 * Módulos con grupos (Finanzas, Inventario, POS…): 448 px, dos columnas. Sin
 * grupos: una columna de 256 px.
 */
import Link from 'next/link';
import { Pin, PinOff, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { PaginaNav } from '@/lib/navigation/catalog';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import type { ModuloVisible } from '@/lib/navigation/filtrar';

interface Grupo {
  titulo: string | null;
  paginas: PaginaNav[];
}

/** Agrupa conservando el orden del catálogo. */
function agrupar(paginas: PaginaNav[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const p of paginas) {
    const titulo = p.grupo ?? null;
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === titulo) ultimo.paginas.push(p);
    else grupos.push({ titulo, paginas: [p] });
  }
  return grupos;
}

/** Reparte los grupos en dos columnas de alto parecido, sin romper el orden. */
function enDosColumnas(grupos: Grupo[]): [Grupo[], Grupo[]] {
  if (grupos.length < 2) return [grupos, []];
  const peso = (g: Grupo) => g.paginas.length + 1; // +1 por el título
  const total = grupos.reduce((s, g) => s + peso(g), 0);
  let mejor = 1;
  let menorDiferencia = Infinity;
  let izquierda = 0;
  for (let i = 1; i < grupos.length; i += 1) {
    izquierda += peso(grupos[i - 1]);
    const diferencia = Math.abs(total - 2 * izquierda);
    if (diferencia < menorDiferencia) {
      menorDiferencia = diferencia;
      mejor = i;
    }
  }
  return [grupos.slice(0, mejor), grupos.slice(mejor)];
}

export function ListaPaginas({
  paginas,
  paginaActiva,
  onNavegar,
  tactil = false,
}: {
  paginas: PaginaNav[];
  paginaActiva: string | null;
  onNavegar?: () => void;
  /** Filas de 44 px para el acordeón móvil. */
  tactil?: boolean;
}) {
  const nombres = useNombresNav();
  return (
    <ul className="flex flex-col gap-0.5">
      {paginas.map((p) => {
        const activa = p.href === paginaActiva;
        return (
          <li key={p.href}>
            <Link
              href={p.href}
              onClick={onNavegar}
              aria-current={activa ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md pl-1.5 pr-2 text-[13px] leading-[18px] outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-brand',
                tactil ? 'h-11' : 'h-8',
                activa ? 'bg-brand-tint text-brand-deep' : 'text-fg hover:bg-hover'
              )}
            >
              {activa && <span aria-hidden="true" className="h-4 w-[3px] shrink-0 rounded-sm bg-brand" />}
              <span className="min-w-0 flex-1 truncate">{nombres.pagina(p)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BloqueGrupo({ grupo, paginaActiva, onNavegar }: { grupo: Grupo; paginaActiva: string | null; onNavegar?: () => void }) {
  const nombres = useNombresNav();
  return (
    <div className="flex flex-col gap-0.5">
      {grupo.titulo && (
        <p className="pb-1 pl-1.5 pt-2 text-xs font-semibold leading-4 text-fg-muted">{nombres.grupo(grupo.titulo)}</p>
      )}
      <ListaPaginas paginas={grupo.paginas} paginaActiva={paginaActiva} onNavegar={onNavegar} />
    </div>
  );
}

interface SubMenuPanelProps {
  id: string;
  item: ModuloVisible;
  modo: 'docked' | 'floating';
  paginaActiva: string | null;
  fijado: boolean;
  onFijar: () => void;
  onCerrar: () => void;
  onNavegar?: () => void;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function SubMenuPanel({
  id,
  item,
  modo,
  paginaActiva,
  fijado,
  onFijar,
  onCerrar,
  onNavegar,
  className,
  onMouseEnter,
  onMouseLeave,
}: SubMenuPanelProps) {
  const t = useTranslations('nav');
  const Icono = item.modulo.icono;
  const grupos = agrupar(item.paginas);
  const conGrupos = grupos.some((g) => g.titulo !== null);
  const [col1, col2] = conGrupos ? enDosColumnas(grupos) : [grupos, []];
  const nombre = t(item.modulo.etiqueta);

  return (
    <section
      id={id}
      aria-label={t('submenuOf', { module: nombre })}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar();
      }}
      className={cn(
        'flex h-full flex-col overflow-hidden bg-surface',
        conGrupos ? 'w-[448px]' : 'w-64',
        modo === 'floating' ? 'rounded-xl border border-line shadow-[0_2px_6px_rgba(15,23,42,0.06),0_12px_32px_-4px_rgba(15,23,42,0.14)]' : 'border-r border-line',
        className
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2.5 bg-brand-tint pl-4 pr-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-action text-fg-on-brand">
          <Icono size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold leading-[22px] text-fg">{nombre}</h2>
        <button
          type="button"
          onClick={onFijar}
          aria-pressed={fijado}
          aria-label={fijado ? t('unpinSubmenu') : t('pinSubmenu')}
          title={fijado ? t('unpinSubmenu') : t('pinSubmenu')}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand',
            fijado && 'bg-hover text-fg'
          )}
        >
          {fijado ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t('closeSubmenu')}
          title={t('closeSubmenu')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 gap-2 overflow-y-auto overscroll-contain px-3 pb-4 pt-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {col1.map((g, i) => (
            <BloqueGrupo key={g.titulo ?? `sin-grupo-${i}`} grupo={g} paginaActiva={paginaActiva} onNavegar={onNavegar} />
          ))}
        </div>
        {col2.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {col2.map((g, i) => (
              <BloqueGrupo key={g.titulo ?? `sin-grupo-b-${i}`} grupo={g} paginaActiva={paginaActiva} onNavegar={onNavegar} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
