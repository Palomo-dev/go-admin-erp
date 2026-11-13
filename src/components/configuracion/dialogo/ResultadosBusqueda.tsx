'use client';

/**
 * Resultados del buscador del diálogo (Figma pág. 10, sección 12 · 03):
 * «N ajustes para «q»», cada uno con «Entrada › Sección» en el color de marca
 * y el ajuste debajo. Es la lista de un combobox: el campo de búsqueda lleva
 * el foco y `aria-activedescendant`; Enter abre el activo (el primero si no
 * se movió), ↑ ↓ mueven, Esc limpia.
 */
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { ResultadoBusqueda } from '../config/buscadorConfiguracion';

export function idOpcion(prefijo: string, i: number): string {
  return `${prefijo}-opcion-${i}`;
}

interface Props {
  /** Prefijo de ids (hay una lista en escritorio y otra en el celular). */
  prefijo: string;
  consulta: string;
  resultados: readonly ResultadoBusqueda[];
  activo: number;
  onActivo: (i: number) => void;
  onElegir: (r: ResultadoBusqueda) => void;
  onLimpiar: () => void;
}

export function ResultadosBusqueda({ prefijo, consulta, resultados, activo, onActivo, onElegir, onLimpiar }: Props) {
  const t = useTranslations('configuracionDialogo.buscar');
  const tu = useTranslations('configuracionUnificada.buscar');
  if (resultados.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface">
        <EmptyState variante="search" titulo={tu('vacioTitulo', { q: consulta })} descripcion={tu('vacioDescripcion')} accion={{ etiqueta: tu('limpiar'), onClick: onLimpiar }} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-fg lg:text-xl" aria-live="polite">
        {tu('resultados', { n: resultados.length, q: consulta })}
      </p>
      <ul id={`${prefijo}-lista`} role="listbox" aria-label={tu('listaAria')} className="flex flex-col gap-3">
        {resultados.map((r, i) => (
          <li
            key={`${r.seccionId}#${r.ancla ?? ''}`}
            id={idOpcion(prefijo, i)}
            role="option"
            aria-selected={i === activo}
            onClick={() => onElegir(r)}
            onMouseEnter={() => onActivo(i)}
            className={cn(
              'cursor-pointer rounded-lg border bg-surface px-3 py-3 transition-colors',
              i === activo ? 'border-line-brand bg-brand-tint/40' : 'border-line hover:bg-hover',
            )}
          >
            <span className="block text-xs text-link">{r.ruta}</span>
            <span className="block text-[13px] font-semibold text-fg">{r.titulo}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t('pista')}</p>
    </div>
  );
}
