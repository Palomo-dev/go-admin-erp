import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Migas (Figma `Breadcrumbs` 109:4290). Caption 12/16 medium en pizarra con
 * `ChevronRight` de 12 px. Con más de `maxVisibles` se colapsa el medio en «…».
 * El POS y los diálogos no llevan migas.
 */
export interface Miga {
  etiqueta: string;
  href?: string;
}

export interface BreadcrumbsProps {
  migas: readonly Miga[];
  maxVisibles?: number;
  className?: string;
}

export function Breadcrumbs({ migas, maxVisibles = 3, className }: BreadcrumbsProps) {
  if (migas.length === 0) return null;
  const colapsar = migas.length > maxVisibles;
  const visibles: (Miga | null)[] = colapsar
    ? [migas[0], null, ...migas.slice(migas.length - (maxVisibles - 1))]
    : [...migas];

  return (
    <nav aria-label="Migas de pan" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-4 text-fg-secondary">
        {visibles.map((miga, i) => {
          const ultima = i === visibles.length - 1;
          return (
            <li key={miga ? `${i}-${miga.etiqueta}` : 'elipsis'} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden="true" className="size-3 shrink-0" />}
              {miga === null ? (
                <span aria-label="Niveles ocultos">…</span>
              ) : miga.href && !ultima ? (
                <Link
                  href={miga.href}
                  className="truncate rounded-sm hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {miga.etiqueta}
                </Link>
              ) : (
                <span className="truncate" aria-current={ultima ? 'page' : undefined}>
                  {miga.etiqueta}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
