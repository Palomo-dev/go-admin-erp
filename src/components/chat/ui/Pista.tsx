'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

/**
 * Pista oscura del Chat (Figma 94-chat-recuperado: «Ocultar panel», «Leído»,
 * «Entregado», «Ver en el mapa», «Negrilla (Ctrl+B)», «Copiar ID»). Misma
 * receta que la del kit (`AccionRapida`): fondo `bg-tooltip`, 12 px, radio 6.
 * Aparece al pasar el ratón o al enfocar con el teclado; el texto también
 * debe estar en el `aria-label` del control.
 */
export function Pista({
  texto,
  children,
  lado = 'bottom',
  alineacion = 'center',
}: {
  texto: string;
  children: React.ReactElement;
  lado?: 'top' | 'bottom' | 'left' | 'right';
  alineacion?: 'start' | 'center' | 'end';
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={lado}
            align={alineacion}
            sideOffset={6}
            collisionPadding={8}
            className="z-[9999] max-w-xs rounded-md bg-tooltip px-2 py-1 text-xs font-medium leading-4 text-fg-on-brand shadow-md"
          >
            {texto}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
