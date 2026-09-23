import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

/**
 * Fila de `StatCard` bajo la cabecera: 4 columnas en escritorio (16 px entre
 * tarjetas, como en Figma), 2 en tableta y móvil. En móvil con más de dos
 * cifras se desplaza en horizontal en lugar de apilar 4 tarjetas.
 */
export interface KpiStripProps {
  children: ReactNode;
  /** Columnas en escritorio (por defecto 4). */
  columnas?: 2 | 3 | 4 | 5 | 6;
  /** Nombre del grupo para lectores de pantalla («Resumen de clientes»). */
  etiqueta?: string;
  className?: string;
}

const COLUMNAS: Record<NonNullable<KpiStripProps['columnas']>, string> = {
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export function KpiStrip({ children, columnas = 4, etiqueta = 'Resumen', className }: KpiStripProps) {
  return (
    <section
      aria-label={etiqueta}
      className={cn(
        'grid auto-cols-[minmax(160px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1 sm:grid-flow-row sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pb-0',
        COLUMNAS[columnas],
        className,
      )}
    >
      {children}
    </section>
  );
}
