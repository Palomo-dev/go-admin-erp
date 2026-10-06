'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesTonoTarjeta, type TonoTarjeta } from './tonosKit';

/**
 * Sección de formulario (Figma `SectionCard`/`FormSection`): tarjeta con
 * título, descripción y los campos en una o dos columnas. En móvil, siempre
 * una columna.
 *
 * Con `icono` el título lleva la caja tintada de 32 px de Figma («Nuevo
 * proveedor»: Identificación, Contacto, Condiciones de compra…). Con
 * `colapsable` la cabecera es un botón con chevron que pliega los campos
 * (`aria-expanded`); los campos plegados siguen montados, así no se pierde lo
 * escrito.
 */
export interface FormSectionProps {
  titulo: string;
  descripcion?: ReactNode;
  /** Acción a la derecha del título (p. ej. «Consultar DIAN/RUES»). */
  accion?: ReactNode;
  /** Icono del título (caja tintada de marca de 32 px). */
  icono?: LucideIcon;
  /** Tono de la caja del icono (los de `Tarjeta`); por defecto, marca. P. ej. `peligro` en «Zona de peligro». */
  tonoIcono?: TonoTarjeta;
  /** La cabecera pliega y despliega los campos. */
  colapsable?: boolean;
  /** Estado inicial si es `colapsable` (por defecto, abierta). */
  abiertaPorDefecto?: boolean;
  columnas?: 1 | 2 | 3;
  children: ReactNode;
  id?: string;
  className?: string;
}

const COLUMNAS = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3' } as const;

export function FormSection({
  titulo,
  descripcion,
  accion,
  icono: Icono,
  tonoIcono = 'neutro',
  colapsable,
  abiertaPorDefecto = true,
  columnas = 1,
  children,
  id,
  className,
}: FormSectionProps) {
  const generado = useId();
  const idTitulo = id ? `${id}-titulo` : undefined;
  const idCuerpo = `${id ?? `seccion-${generado}`}-cuerpo`;
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const visible = !colapsable || abierta;

  const encabezado = (
    <div className="flex min-w-0 items-start gap-3">
      {Icono && (
        <span
          aria-hidden="true"
          data-tono={tonoIcono}
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', clasesTonoTarjeta(tonoIcono).icono)}
        >
          <Icono className="size-4" strokeWidth={1.5} />
        </span>
      )}
      <div className="min-w-0">
        <h2 id={idTitulo} className="text-base font-semibold text-fg">
          {titulo}
        </h2>
        {descripcion && <p className="mt-0.5 text-[13px] leading-[18px] text-fg-secondary">{descripcion}</p>}
      </div>
    </div>
  );

  return (
    <section
      id={id}
      aria-labelledby={idTitulo}
      aria-label={idTitulo ? undefined : titulo}
      className={cn('rounded-xl border border-line bg-surface p-4 sm:p-6', className)}
    >
      <div className={cn('flex items-start justify-between gap-3', visible && 'mb-4 sm:mb-5')}>
        {colapsable ? (
          <button
            type="button"
            aria-expanded={abierta}
            aria-controls={idCuerpo}
            onClick={() => setAbierta((v) => !v)}
            className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {encabezado}
            <ChevronDown
              aria-hidden="true"
              className={cn('mt-1 size-4 shrink-0 text-fg-muted transition-transform', abierta && 'rotate-180')}
              strokeWidth={1.5}
            />
          </button>
        ) : (
          encabezado
        )}
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      {/* `hidden` como clase: el atributo perdería contra `grid`. */}
      <div id={idCuerpo} className={visible ? cn('grid grid-cols-1 gap-4', COLUMNAS[columnas]) : 'hidden'}>
        {children}
      </div>
    </section>
  );
}
