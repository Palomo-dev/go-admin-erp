'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CircleCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton } from '@/components/kit';
import { useTextosComun } from './textos';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from './iconosSitio';

/**
 * Paso de una lista de lanzamiento (Figma A/07b; Resumen A/02a, asistente A/03,
 * salud SEO B/08):
 *
 * - `listo`: check verde, título, detalle y «Listo» en verde a la derecha.
 * - `actual`: el siguiente paso, en caja con tinte y borde de marca, radio
 *   marcado y el botón primario «Configurar».
 * - `pendiente`: círculo vacío y «Configurar» secundario.
 *
 * Con `icono` (opcional; usa `ICONO_TAREA_SITIO`), el título lleva delante el
 * MISMO icono de 16 px que su entrada del menú, para que se reconozca sin
 * leer. Va suelto y no en caja de 32: en la tarjeta de 312 px de A/02a (1024)
 * la caja dejaba unos 64 px de texto y cortaba «Pagos e…». Marcador de estado
 * 24 px; títulos 14/20 y detalle 13/18. El texto nunca se corta: salta de
 * línea en todos los anchos, y si no le quedan 8rem, el botón «Configurar» (o
 * «Listo») baja debajo del texto en vez de apretarlo.
 *
 * Se pinta como `<li>`: quien lo usa lo mete en una `<ol>`/`<ul>`.
 */
export type EstadoChecklist = 'listo' | 'actual' | 'pendiente';

export interface AccionChecklist {
  etiqueta?: string;
  href?: string;
  onClick?: () => void;
}

export interface ChecklistItemProps {
  titulo: string;
  detalle?: ReactNode;
  estado: EstadoChecklist;
  /** Icono de la tarea (de `ICONO_TAREA_SITIO`), de 16 px delante del título. */
  icono?: LucideIcon;
  /** A dónde lleva «Configurar» (la subpágina del paso). Sin acción en `listo`. */
  accion?: AccionChecklist;
  /** Texto de la derecha en `listo`; por defecto «Listo». */
  textoListo?: string;
  className?: string;
}

export function ChecklistItem({ titulo, detalle, estado, icono: Icono, accion, textoListo, className }: ChecklistItemProps) {
  const tx = useTextosComun();
  const actual = estado === 'actual';
  const etiquetaAccion = accion?.etiqueta ?? tx('checklist.configurar');
  const claseBoton = clasesBoton({ variante: actual ? 'primario' : 'secundario', tamano: 'sm' });
  const textoEstado =
    estado === 'listo' ? textoListo ?? tx('checklist.listo') : estado === 'actual' ? tx('checklist.pasoActual') : tx('checklist.pendiente');

  return (
    <li
      aria-current={actual ? 'step' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-3',
        actual ? 'border-line-brand bg-brand-tint' : 'border-transparent',
        className,
      )}
    >
      {estado === 'listo' ? (
        <CircleCheck aria-hidden="true" className="size-6 shrink-0 fill-success text-surface" strokeWidth={TRAZO_ICONO} />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px]',
            actual ? 'border-brand' : 'border-line-strong',
          )}
        >
          {actual && <span className="size-2.5 rounded-full bg-brand" />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-[8rem] flex-1 flex-col gap-0.5">
          <p className={cn('flex items-start gap-1.5 text-sm font-medium leading-5', actual ? 'text-brand-deep' : 'text-fg')}>
            {Icono ? (
              <Icono
                aria-hidden="true"
                className={cn(CLASE_TAMANO_ICONO.base, 'mt-0.5 shrink-0', actual ? 'text-brand-deep' : 'text-fg-secondary')}
                strokeWidth={TRAZO_ICONO}
              />
            ) : null}
            <span className="min-w-0 break-words">{titulo}</span>
          </p>
          {detalle ? <div className={cn('break-words text-[13px] leading-[18px] text-fg-secondary', Icono && 'pl-[22px]')}>{detalle}</div> : null}
        </div>
        {estado === 'listo' ? (
          <span className="shrink-0 text-[13px] font-medium text-success-text">{textoEstado}</span>
        ) : (
          <>
            <span className="sr-only">{textoEstado}</span>
            {accion?.href ? (
              <Link href={accion.href} className={cn(claseBoton, 'shrink-0')}>
                {etiquetaAccion}
              </Link>
            ) : accion?.onClick ? (
              <button type="button" onClick={accion.onClick} className={cn(claseBoton, 'shrink-0')}>
                {etiquetaAccion}
              </button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}
