'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { Breadcrumbs, type Miga } from './Breadcrumbs';

/**
 * Cabecera de página única (Figma `PageHeader` 109:4573, PATRONES §4 y §13).
 *
 * - `list`: icono (caja 40×40 con tinte de marca, icono de 20) + título + meta
 *   + acciones: **una sola primaria**, el resto secundarias o en «⋯».
 * - `detail`: miniatura o icono + título + badge de estado + metadatos.
 * - `form`: «← Volver» en lugar del icono.
 *
 * En móvil (< lg) no se dibuja: publica título, subtítulo y la acción
 * contextual en el `MobileHeader Mode=page` del shell con `useCabeceraMovil`.
 * Lo que va en `debajo` (el `BranchBadge`, pestañas) sí se ve en móvil.
 *
 * Se mantiene en «cargando»: solo el subtítulo gira el `Loader`.
 */
export interface PageHeaderMovil {
  /** Acción a la derecha del MobileHeader: «+», «⋯», «Guardar». */
  accion?: ReactNode;
  /** Por defecto, el título y el subtítulo (si es texto) de la cabecera. */
  titulo?: string;
  subtitulo?: string;
  /** Oculta el MobileTabBar (formularios largos, selección múltiple). */
  ocultarBarra?: boolean;
}

export interface PageHeaderProps {
  titulo: string;
  subtitulo?: ReactNode;
  /** Icono de la pantalla según CATALOGO-ICONOS.md (el mismo del menú). */
  icono?: LucideIcon;
  /** Solo `detail` con foto real (producto). Sustituye al icono. */
  miniatura?: ReactNode;
  migas?: readonly Miga[];
  /** Botones de la derecha. Una sola primaria. */
  acciones?: ReactNode;
  /** `detail`: badge de estado junto al título. */
  badge?: ReactNode;
  variante?: 'list' | 'detail' | 'form';
  /** `form`: a dónde vuelve «←». */
  volverA?: string;
  cargando?: boolean;
  /** Fila bajo la cabecera (BranchBadge, pestañas): se ve también en móvil. */
  debajo?: ReactNode;
  /** `false` para páginas fuera del shell: se dibuja también en móvil. */
  movil?: PageHeaderMovil | false;
  className?: string;
}

function PublicarCabeceraMovil({ titulo, subtitulo, accion, ocultarBarra, volverA }: PageHeaderMovil & { volverA?: string }) {
  useCabeceraMovil({ modo: 'page', titulo, subtitulo, accion, ocultarBarra, volverA });
  return null;
}

export function PageHeader({
  titulo,
  subtitulo,
  icono: Icono,
  miniatura,
  migas,
  acciones,
  badge,
  variante = 'list',
  volverA,
  cargando,
  debajo,
  movil = {},
  className,
}: PageHeaderProps) {
  const integrarMovil = movil !== false;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {integrarMovil && (
        <PublicarCabeceraMovil
          titulo={movil.titulo ?? titulo}
          subtitulo={movil.subtitulo ?? (typeof subtitulo === 'string' ? subtitulo : undefined)}
          accion={movil.accion}
          ocultarBarra={movil.ocultarBarra}
          volverA={volverA}
        />
      )}

      <header className={cn('flex-col gap-3', integrarMovil ? 'hidden lg:flex' : 'flex')}>
        {migas && migas.length > 0 && <Breadcrumbs migas={migas} />}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {variante === 'form' && volverA ? (
              <Link
                href={volverA}
                aria-label="Volver"
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
              </Link>
            ) : miniatura ? (
              <div className="size-12 shrink-0 overflow-hidden rounded-lg">{miniatura}</div>
            ) : Icono ? (
              <div aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                <Icono className="size-5" strokeWidth={1.5} />
              </div>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[22px] font-semibold leading-7 tracking-[-0.2px] text-fg">{titulo}</h1>
                {badge}
              </div>
              {(subtitulo || cargando) && (
                <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-[18px] text-fg-secondary">
                  {cargando && (
                    <Loader aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-brand" strokeWidth={1.5} />
                  )}
                  {cargando && <span className="sr-only">Cargando…</span>}
                  <div className="min-w-0 truncate">{subtitulo}</div>
                </div>
              )}
            </div>
          </div>
          {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
        </div>
      </header>

      {debajo && <div className="flex flex-wrap items-center gap-2">{debajo}</div>}
    </div>
  );
}
