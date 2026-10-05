'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useCabeceraMovil } from '@/components/shell/header/cabeceraMovil';
import { Breadcrumbs, type Miga } from './Breadcrumbs';
import { useKitT } from './useIdiomaKit';

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
  /** El título se vuelve «Título ▾» y abre un selector de la página (Pipeline: elegir embudo). */
  onTitulo?: () => void;
  /** Nombre accesible del botón del título. */
  tituloAria?: string;
  /**
   * Override explícito del MobileTabBar (`true` lo oculta, `false` lo
   * muestra). Casi nunca hace falta: la regla central de
   * `shell/header/cabeceraMovil.tsx` ya lo quita en detalles, formularios,
   * flujos y mientras se ve una barra inferior propia (BulkActionBar…).
   */
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
  /**
   * `form`: «←» pregunta antes de salir (formulario con cambios). Si se pasa,
   * el clic no navega solo: la pantalla decide (diálogo «Salir con cambios»).
   */
  onVolver?: () => void;
  cargando?: boolean;
  /**
   * Barra fina de avance bajo el subtítulo (carga por lotes: «1.000 de 4.368»).
   * Se oculta sola cuando `actual >= total`.
   */
  progreso?: { actual: number; total: number; etiqueta?: string } | null;
  /** Fila bajo la cabecera (BranchBadge, pestañas): se ve también en móvil. */
  debajo?: ReactNode;
  /** `false` para páginas fuera del shell: se dibuja también en móvil. */
  movil?: PageHeaderMovil | false;
  className?: string;
}

function PublicarCabeceraMovil({ titulo, subtitulo, accion, ocultarBarra, volverA, onTitulo, tituloAria }: PageHeaderMovil & { volverA?: string }) {
  useCabeceraMovil({ modo: 'page', titulo, subtitulo, accion, ocultarBarra, volverA, onTitulo, tituloAria });
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
  onVolver,
  cargando,
  progreso,
  debajo,
  movil = {},
  className,
}: PageHeaderProps) {
  const integrarMovil = movil !== false;
  const t = useKitT();

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {integrarMovil && (
        <PublicarCabeceraMovil
          titulo={movil.titulo ?? titulo}
          subtitulo={movil.subtitulo ?? (typeof subtitulo === 'string' ? subtitulo : undefined)}
          accion={movil.accion}
          ocultarBarra={movil.ocultarBarra}
          onTitulo={movil.onTitulo}
          tituloAria={movil.tituloAria}
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
                onClick={
                  onVolver
                    ? (e) => {
                        e.preventDefault();
                        onVolver();
                      }
                    : undefined
                }
                aria-label={t('cabecera.volver')}
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
                  {cargando && <span className="sr-only">{t('cabecera.cargando')}</span>}
                  <div className="min-w-0 truncate">{subtitulo}</div>
                </div>
              )}
              {progreso && progreso.total > 0 && progreso.actual < progreso.total && (
                <div
                  role="progressbar"
                  aria-label={progreso.etiqueta ?? t('cabecera.progreso')}
                  aria-valuemin={0}
                  aria-valuemax={progreso.total}
                  aria-valuenow={progreso.actual}
                  className="mt-1 h-1 w-48 max-w-full overflow-hidden rounded-full bg-brand-tint"
                >
                  <div
                    className="h-full rounded-full bg-brand-action transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.round((progreso.actual / progreso.total) * 100)}%` }}
                  />
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
