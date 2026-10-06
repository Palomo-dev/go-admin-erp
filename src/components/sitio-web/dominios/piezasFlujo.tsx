'use client';

/**
 * Piezas pequeñas que comparten los flujos de Conectar y Comprar (Figma
 * B/07-06…07-20): la lista de checks verdes, la caja gris de resumen y la
 * lista de pasos en curso. Solo tokens del kit; sin lógica.
 */
import type { ReactNode } from 'react';
import { cn } from '@/utils/Utils';
import { ICONO_ACCION_DOMINIO, ICONO_ESTADO_PASO, IconoDominio } from './iconosDominios';

/** Lista de solo lectura con check verde (B/07-06 «Lo que vamos a hacer», B/07-09). */
export function ListaCheck({ titulo, items, tono = 'neutro', className }: { titulo?: string; items: readonly string[]; tono?: 'neutro' | 'exito'; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg px-4 py-3', tono === 'exito' ? 'border border-line-success bg-success-subtle' : 'bg-canvas', className)}>
      {titulo && <p className="text-[13px] font-medium text-fg">{titulo}</p>}
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] leading-[18px] text-fg">
            <IconoDominio icono={ICONO_ESTADO_PASO.hecho} className="mt-px text-success-text" />
            <span className="min-w-0">{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Caja gris de datos (B/07-17, 07-20). */
export function CajaResumen({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1 rounded-lg bg-canvas px-4 py-3', className)}>{children}</div>;
}

export type EstadoPasoFlujo = 'hecho' | 'en_curso' | 'pendiente';

/** Pasos de un proceso largo (B/07-16 «Comprando…»): hecho, en curso con giro o pendiente en gris. */
export function PasosEnCurso({ pasos }: { pasos: readonly { texto: string; estado: EstadoPasoFlujo }[] }) {
  return (
    <ol className="flex flex-col gap-2" aria-live="polite">
      {pasos.map((p) => (
        <li key={p.texto} className={cn('flex items-center gap-2 text-sm', p.estado === 'pendiente' ? 'text-fg-muted' : 'text-fg')}>
          {p.estado === 'hecho' ? (
            <IconoDominio icono={ICONO_ESTADO_PASO.correcto} className="text-success-text" />
          ) : p.estado === 'en_curso' ? (
            <IconoDominio icono={ICONO_ACCION_DOMINIO.enCurso} girando className="text-brand" />
          ) : (
            <IconoDominio icono={ICONO_ESTADO_PASO.pendiente} />
          )}
          {p.texto}
        </li>
      ))}
    </ol>
  );
}
