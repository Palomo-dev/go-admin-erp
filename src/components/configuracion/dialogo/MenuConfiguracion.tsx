'use client';

/**
 * Menú del diálogo de Configuración: grupos con encabezado en mayúsculas y una
 * entrada por módulo (Figma pág. 10, sección 12). En escritorio, lista con el
 * activo en el tinte de marca; en el celular, tarjetas con chevron.
 *
 * Teclado: ↑ ↓ recorren las entradas, Inicio/Fin van al extremo.
 */
import { useRef, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import type { GrupoMenu, EntradaMenu } from '../config/menuConfiguracion';

interface Props {
  menu: readonly GrupoMenu[];
  entradaActiva: string | null;
  onEntrada: (entrada: EntradaMenu) => void;
  etiquetaEntrada: (id: string) => string;
}

export function MenuConfiguracion({ menu, entradaActiva, onEntrada, etiquetaEntrada }: Props) {
  const t = useTranslations('configuracionDialogo');
  const ref = useRef<HTMLElement>(null);

  const alPulsar = (e: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const botones = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button[data-entrada]') ?? []);
    if (botones.length === 0) return;
    const i = botones.indexOf(document.activeElement as HTMLButtonElement);
    const siguiente =
      e.key === 'Home' ? 0 : e.key === 'End' ? botones.length - 1 : e.key === 'ArrowDown' ? (i + 1) % botones.length : (i - 1 + botones.length) % botones.length;
    e.preventDefault();
    botones[siguiente]?.focus();
  };

  return (
    <nav ref={ref} aria-label={t('menuAria')} onKeyDown={alPulsar} className="flex flex-col gap-4 lg:gap-1">
      {menu.map(({ grupo, entradas }) => {
        const idGrupo = `config-grupo-${grupo}`;
        return (
          <div key={grupo} className="flex flex-col gap-2 lg:gap-0.5">
            <p id={idGrupo} className="px-1 text-[11px] font-medium uppercase tracking-wide text-fg-muted lg:px-2 lg:pb-1 lg:pt-3">
              {t(`grupos.${grupo}`)}
            </p>
            <ul aria-labelledby={idGrupo} className="overflow-hidden rounded-xl border border-line bg-surface lg:flex lg:flex-col lg:gap-0.5 lg:rounded-none lg:border-0 lg:bg-transparent">
              {entradas.map((entrada) => {
                const activa = entrada.id === entradaActiva;
                const Icono = entrada.icono;
                return (
                  <li key={entrada.id} className="border-b border-line last:border-b-0 lg:border-0">
                    <button
                      type="button"
                      data-entrada={entrada.id}
                      onClick={() => onEntrada(entrada)}
                      aria-current={activa ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                        'lg:gap-2.5 lg:rounded-lg lg:px-2 lg:py-[7px] lg:text-sm',
                        activa ? 'lg:bg-brand-tint lg:font-medium lg:text-brand' : 'text-fg',
                      )}
                    >
                      <Icono aria-hidden="true" className={cn('size-[18px] shrink-0 lg:size-4', activa ? 'lg:text-brand' : 'text-fg-secondary')} strokeWidth={1.5} />
                      <span className="min-w-0 flex-1 truncate">{etiquetaEntrada(entrada.id)}</span>
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted lg:hidden" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
