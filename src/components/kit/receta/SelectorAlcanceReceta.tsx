'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { SegmentedControl } from '../SegmentedControl';
import type { AlcanceReceta, EstadoVarianteReceta } from './recetaLogica';

/**
 * Alcance de la receta de un producto con variantes (Figma
 * `SelectorAlcanceReceta` 957-583482): una receta para todas (compartida, en el
 * producto) o una por variante, con un chip por variante (sin receta ·
 * compartida · propia · con errores).
 */
export interface VarianteAlcance {
  clave: string;
  nombre: string;
  estado: EstadoVarianteReceta;
}

export interface SelectorAlcanceRecetaProps {
  alcance: AlcanceReceta;
  onAlcanceChange: (a: AlcanceReceta) => void;
  variantes: readonly VarianteAlcance[];
  deshabilitado?: boolean;
}

const TONO_CHIP: Record<EstadoVarianteReceta, string> = {
  sin_receta: 'bg-subtle text-fg-secondary',
  compartida: 'bg-subtle text-fg-secondary',
  propia: 'bg-brand-tint text-brand-deep',
  con_errores: 'bg-danger-subtle text-danger-text',
};

export function SelectorAlcanceReceta({ alcance, onAlcanceChange, variantes, deshabilitado }: SelectorAlcanceRecetaProps) {
  const t = useTranslations('receta.alcance');
  const idEtiqueta = useId();
  return (
    <div className="flex flex-col gap-2">
      <p id={idEtiqueta} className="text-xs font-medium text-fg">
        {t('titulo')}
      </p>
      <SegmentedControl<AlcanceReceta>
        aria-labelledby={idEtiqueta}
        opciones={[
          { valor: 'compartida', etiqueta: t('compartida') },
          { valor: 'por_variante', etiqueta: t('porVariante') },
        ]}
        valor={alcance}
        onValorChange={onAlcanceChange}
        deshabilitado={deshabilitado}
        className="self-start"
      />
      {alcance === 'por_variante' ? (
        <>
          <ul className="flex flex-wrap gap-1.5" aria-label={t('estados')}>
            {variantes.map((v) => (
              <li key={v.clave} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TONO_CHIP[v.estado])}>
                {t('chip', { nombre: v.nombre, estado: t(`estado.${v.estado}`) })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">{t('ayudaPorVariante')}</p>
        </>
      ) : (
        <p className="text-xs text-fg-muted">{t('ayudaCompartida', { count: variantes.length })}</p>
      )}
    </div>
  );
}
