'use client';

import { AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Aviso con acción (Figma «AvisoConAccion» 1886:919304): lo que falta y a dónde
 * ir. Se usa en «Añadir sección» (sección sin datos), en el lienzo y en la hoja
 * inferior móvil. La acción abre el módulo del ERP en otra pestaña: el editor
 * no pierde lo que lleva sin guardar.
 */
export interface AvisoConAccionProps {
  titulo: string;
  detalle: string;
  accion?: { texto: string; href: string } | null;
  tono?: 'advertencia' | 'informacion';
  className?: string;
}

export function AvisoConAccion({ titulo, detalle, accion, tono = 'advertencia', className }: AvisoConAccionProps) {
  const Icono = tono === 'advertencia' ? AlertTriangle : Info;
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        tono === 'advertencia' ? 'border-line-warning bg-warning-subtle' : 'border-line-info bg-info-subtle',
        className,
      )}
    >
      <Icono
        aria-hidden
        className={cn('mt-0.5 h-5 w-5 shrink-0', tono === 'advertencia' ? 'text-warning-text' : 'text-info-text')}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={cn('text-sm font-medium', tono === 'advertencia' ? 'text-warning-text' : 'text-info-text')}>{titulo}</p>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{detalle}</p>
        {accion ? (
          <a
            href={accion.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-xs font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <ExternalLink aria-hidden className="h-4 w-4" />
            {accion.texto}
          </a>
        ) : null}
      </div>
    </div>
  );
}
