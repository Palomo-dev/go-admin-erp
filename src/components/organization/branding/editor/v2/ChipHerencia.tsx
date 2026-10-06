'use client';

import { Link2, Pencil, Ban, Sparkles } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTranslations } from 'next-intl';

export type TipoChipHerencia = 'heredado' | 'personalizado' | 'vacio' | 'nuevo';

const ESTILO: Record<TipoChipHerencia, { clase: string; Icono: typeof Link2 }> = {
  heredado: {
    clase: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    Icono: Link2,
  },
  personalizado: {
    clase: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
    Icono: Pencil,
  },
  vacio: {
    clase: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900',
    Icono: Ban,
  },
  nuevo: {
    clase: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
    Icono: Sparkles,
  },
};

/** Chip «heredado / personalizado» de la herencia por campo de una sede (D6, Figma 05-26). */
export function ChipHerencia({ tipo, compacto, className }: { tipo: TipoChipHerencia; compacto?: boolean; className?: string }) {
  const t = useTranslations('branding.editor');
  const { clase, Icono } = ESTILO[tipo];
  const texto = t(`chipHerencia.${tipo}`);
  const etiqueta = compacto ? (tipo === 'heredado' ? t('chipHerencia.compactoHereda') : tipo === 'personalizado' ? t('chipHerencia.compactoPropia') : texto) : texto;
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', clase, className)}
    >
      <Icono className="h-3 w-3" aria-hidden />
      {etiqueta}
    </span>
  );
}
