'use client';

/**
 * Icono y colores por categoría de objeción (brief §2: el estado nunca va
 * solo en color; aquí el color acompaña al icono y a la etiqueta). Contraste
 * AA en ambos temas: texto -700 sobre -50 en claro, -300 sobre -950/40 en
 * oscuro.
 */

import type { LucideIcon } from 'lucide-react';
import { CircleDollarSign, Swords, Clock, UserCheck, Puzzle, ShieldQuestion, Wrench, MessageSquareWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { categoryLabel } from '@/lib/services/crm/objectionModel';
import { cn } from '@/utils/Utils';

interface Meta {
  icon: LucideIcon;
  className: string;
}

const META: Record<string, Meta> = {
  precio: { icon: CircleDollarSign, className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  competencia: { icon: Swords, className: 'border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300' },
  timing: { icon: Clock, className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300' },
  decisor: { icon: UserCheck, className: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300' },
  funcionalidad: { icon: Puzzle, className: 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300' },
  confianza: { icon: ShieldQuestion, className: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' },
  'implementación': { icon: Wrench, className: 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-300' },
};

const FALLBACK: Meta = { icon: MessageSquareWarning, className: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' };

export function categoryMeta(value: string | null | undefined): Meta {
  return (value && META[value]) || FALLBACK;
}

export function CategoryIcon({ value, className }: { value: string | null | undefined; className?: string }) {
  const Icon = categoryMeta(value).icon;
  return <Icon className={cn('h-3.5 w-3.5 shrink-0', className)} aria-hidden="true" />;
}

/** Badge de categoría: icono + etiqueta. */
export function CategoryBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  const meta = categoryMeta(value);
  return (
    <Badge variant="outline" className={cn('gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.className, className)}>
      <CategoryIcon value={value} />
      {categoryLabel(value)}
    </Badge>
  );
}
