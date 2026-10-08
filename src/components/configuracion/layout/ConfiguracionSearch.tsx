'use client';

/**
 * Resultados del buscador de Configuración (Figma «10. Configuración
 * unificada»): cada resultado muestra el ajuste y debajo «Módulo › Sección», y
 * lleva al deep link. Sin resultados: estado vacío con «Limpiar búsqueda».
 */
import Link from 'next/link';
import { ArrowRight, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import type { ResultadoBusqueda } from '../config/buscadorConfiguracion';

interface Props {
  consulta: string;
  resultados: readonly ResultadoBusqueda[];
  onLimpiar: () => void;
  onElegir?: (r: ResultadoBusqueda) => void;
}

export function ConfiguracionSearch({ consulta, resultados, onLimpiar, onElegir }: Props) {
  const t = useTranslations('configuracionUnificada.buscar');
  if (resultados.length === 0) {
    return (
      <div className="max-w-3xl rounded-xl border border-line bg-surface">
        <EmptyState
          variante="search"
          titulo={t('vacioTitulo', { q: consulta })}
          descripcion={t('vacioDescripcion')}
          accion={{ etiqueta: t('limpiar'), onClick: onLimpiar }}
        />
      </div>
    );
  }
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <p className="text-[13px] font-medium text-fg-muted" aria-live="polite">
        {t('resultados', { n: resultados.length, q: consulta })}
      </p>
      <ul aria-label={t('listaAria')} className="overflow-hidden rounded-xl border border-line bg-surface">
        {resultados.map((r) => (
          <li key={`${r.seccionId}#${r.ancla ?? ''}`} className="border-b border-line last:border-b-0">
            <Link
              href={r.href}
              onClick={() => onElegir?.(r)}
              className="flex items-center gap-3 px-4 py-2.5 outline-none transition-colors hover:bg-hover focus-visible:bg-brand-tint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
            >
              <Settings2 aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{r.titulo}</span>
                <span className="block text-xs text-fg-muted">{r.ruta}</span>
              </span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t('pista')}</p>
    </div>
  );
}
