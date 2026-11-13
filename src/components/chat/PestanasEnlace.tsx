'use client';

/**
 * Pestañas que navegan (cada una es una página), con el mismo aspecto que el
 * `TabBar` del kit (Figma `TabItem` 581:277913). `TabBar` es un `tablist` que
 * cambia paneles en la misma página; aquí cada pestaña es un enlace con
 * `aria-current`, que es lo correcto para la navegación entre páginas.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface PestanaEnlace {
  href: string;
  etiqueta: string;
  activa: boolean;
  icono?: LucideIcon;
}

export function PestanasEnlace({ pestanas, etiqueta, className }: { pestanas: readonly PestanaEnlace[]; etiqueta: string; className?: string }) {
  return (
    <nav aria-label={etiqueta} className={cn('flex items-end gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]', className)}>
      {pestanas.map((p) => {
        const Icono = p.icono;
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.activa ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
              p.activa ? 'border-brand text-brand-deep' : 'border-transparent text-fg-secondary hover:text-fg',
            )}
          >
            {Icono && <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />}
            {p.etiqueta}
          </Link>
        );
      })}
    </nav>
  );
}
