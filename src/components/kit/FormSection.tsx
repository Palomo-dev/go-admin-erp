import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';

/**
 * Sección de formulario (Figma `SectionCard`/`FormSection`): tarjeta con
 * título, descripción y los campos en una o dos columnas. En móvil, siempre
 * una columna.
 */
export interface FormSectionProps {
  titulo: string;
  descripcion?: ReactNode;
  /** Acción a la derecha del título (p. ej. «Consultar DIAN/RUES»). */
  accion?: ReactNode;
  columnas?: 1 | 2 | 3;
  children: ReactNode;
  id?: string;
  className?: string;
}

const COLUMNAS = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3' } as const;

export function FormSection({ titulo, descripcion, accion, columnas = 1, children, id, className }: FormSectionProps) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      aria-label={idTitulo ? undefined : titulo}
      className={cn('rounded-xl border border-line bg-surface p-4 sm:p-6', className)}
    >
      <div className="mb-4 flex items-start justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <h2 id={idTitulo} className="text-base font-semibold text-fg">
            {titulo}
          </h2>
          {descripcion && <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      <div className={cn('grid grid-cols-1 gap-4', COLUMNAS[columnas])}>{children}</div>
    </section>
  );
}
