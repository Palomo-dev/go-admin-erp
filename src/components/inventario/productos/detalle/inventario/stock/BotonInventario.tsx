'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Botón de 40 px de la barra de acciones de Inventario (Figma 07 › Stock:
 * «Registrar entrada», «Registrar salida», «Ver historial», «Transferir»).
 * Navega con `href` o ejecuta `onClick`. Deshabilitado nunca va mudo: queda
 * enfocable (`aria-disabled`) y explica el motivo en el título y al lector
 * de pantalla.
 */
export interface BotonInventarioProps {
  etiqueta: string;
  icono: LucideIcon;
  href?: string;
  onClick?: () => void;
  variante?: 'primario' | 'secundario';
  deshabilitado?: boolean;
  motivo?: string;
  /** Abre en otra pestaña (el formulario no pierde lo que no se ha guardado). */
  nuevaPestana?: boolean;
  tamano?: 'sm' | 'md';
  extra?: ReactNode;
  className?: string;
}

export function BotonInventario({
  etiqueta,
  icono: Icono,
  href,
  onClick,
  variante = 'secundario',
  deshabilitado,
  motivo,
  nuevaPestana,
  tamano = 'md',
  extra,
  className,
}: BotonInventarioProps) {
  const idMotivo = useId();
  const clases = cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
    tamano === 'sm' ? 'h-8 px-2.5' : 'h-10 px-4',
    variante === 'primario'
      ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover'
      : 'border border-line-strong bg-surface text-fg hover:bg-hover',
    deshabilitado && 'cursor-not-allowed opacity-50',
    deshabilitado && (variante === 'primario' ? 'hover:bg-brand-action' : 'hover:bg-surface'),
    className,
  );
  const contenido = (
    <>
      <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span>{etiqueta}</span>
      {extra}
    </>
  );

  if (deshabilitado) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={motivo ? idMotivo : undefined}
        title={motivo}
        className={clases}
      >
        {contenido}
        {motivo && (
          <span id={idMotivo} className="sr-only">
            {motivo}
          </span>
        )}
      </button>
    );
  }
  if (href) {
    return (
      <Link
        href={href}
        className={clases}
        target={nuevaPestana ? '_blank' : undefined}
        rel={nuevaPestana ? 'noopener noreferrer' : undefined}
      >
        {contenido}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={clases}>
      {contenido}
    </button>
  );
}
