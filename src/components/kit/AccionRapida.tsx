'use client';

import * as React from 'react';
import Link from 'next/link';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

/**
 * Acción visible de una fila (`DataTable accionesRapidas`) o de una tarjeta:
 * un icono solo («ojo») o un botón pequeño con texto («🔒 Cerrar»), 32 px.
 *
 * Figma 680:405300 (cajas vista cajera): una acción que no aplica a esa fila
 * se ve **deshabilitada y explica por qué** en un tooltip oscuro al pasar el
 * ratón o enfocarla con el teclado («Solo el cajero que abrió la caja o un
 * administrador puede cerrarla»). Sin motivo, mejor no mostrarla (PATRONES §6).
 *
 * El clic nunca llega a la fila: abrir la acción no abre el detalle.
 */
export interface AccionRapidaProps {
  etiqueta: string;
  icono: LucideIcon;
  onClick?: () => void;
  href?: string;
  /** Solo el icono (la etiqueta queda como nombre accesible y tooltip). */
  soloIcono?: boolean;
  deshabilitada?: boolean;
  /** Por qué está deshabilitada: se muestra en el tooltip y lo lee el lector de pantalla. */
  motivo?: string;
  className?: string;
}

function Ayuda({ texto, children }: { texto: string; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="z-50 max-w-xs rounded-md bg-tooltip px-2.5 py-1.5 text-xs font-medium leading-4 text-fg-on-brand shadow-md"
          >
            {texto}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function AccionRapida({
  etiqueta,
  icono: Icono,
  onClick,
  href,
  soloIcono,
  deshabilitada,
  motivo,
  className,
}: AccionRapidaProps) {
  const idMotivo = React.useId();
  const clases = cn(
    'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    soloIcono ? 'w-8 text-fg-secondary hover:bg-hover hover:text-fg' : 'border border-line-strong bg-surface px-3 text-fg hover:bg-hover',
    deshabilitada && 'cursor-not-allowed opacity-50 hover:bg-transparent',
    deshabilitada && !soloIcono && 'hover:bg-surface',
    className,
  );
  const contenido = (
    <>
      <Icono aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
      {!soloIcono && <span>{etiqueta}</span>}
    </>
  );
  const detener = (e: React.SyntheticEvent) => e.stopPropagation();

  if (deshabilitada) {
    // `aria-disabled` y no `disabled`: un botón deshabilitado no recibe foco ni
    // eventos, y entonces el motivo nunca se ve con teclado.
    const boton = (
      <button
        type="button"
        aria-disabled="true"
        aria-label={soloIcono || motivo ? etiqueta : undefined}
        aria-describedby={motivo ? idMotivo : undefined}
        onClick={detener}
        onKeyDown={detener}
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
    return motivo ? <Ayuda texto={motivo}>{boton}</Ayuda> : boton;
  }

  const boton = href ? (
    <Link href={href} aria-label={soloIcono ? etiqueta : undefined} onClick={detener} className={clases}>
      {contenido}
    </Link>
  ) : (
    <button
      type="button"
      aria-label={soloIcono ? etiqueta : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      onKeyDown={detener}
      className={clases}
    >
      {contenido}
    </button>
  );
  return soloIcono ? <Ayuda texto={etiqueta}>{boton}</Ayuda> : boton;
}
