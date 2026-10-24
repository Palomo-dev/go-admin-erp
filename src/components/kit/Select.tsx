'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface OpcionSelect {
  valor: string;
  etiqueta: string;
  deshabilitada?: boolean;
}

export interface SelectProps extends Pick<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  'id' | 'aria-label' | 'aria-labelledby' | 'aria-describedby' | 'aria-invalid' | 'aria-required' | 'className' | 'disabled'> {
  valor: string;
  onValorChange: (valor: string) => void;
  opciones: readonly OpcionSelect[];
  placeholder?: string;
  tamano?: 'md' | 'sm';
  nombre?: string;
}

/** Select único del kit · Figma 02 Componentes / 103:3174. */
export function Select({ valor, onValorChange, opciones, placeholder, tamano = 'md', nombre, className, disabled, ...campo }: SelectProps) {
  const [abierto, setAbierto] = React.useState(false);
  return (
    <SelectPrimitive.Root value={valor} onValueChange={onValorChange} disabled={disabled} name={nombre} open={abierto} onOpenChange={setAbierto}>
      <SelectPrimitive.Trigger
        {...campo}
        className={cn(
          'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 text-left text-fg',
          'outline-none transition-colors data-[placeholder]:text-fg-muted focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:border-brand',
          'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-muted',
          tamano === 'sm' ? 'h-8 text-[13px] leading-[18px]' : 'h-10 text-sm leading-5',
          className,
        )}
      >
        <span className="truncate"><SelectPrimitive.Value placeholder={placeholder} /></span>
        <SelectPrimitive.Icon asChild>
          {abierto ? <ChevronUp aria-hidden className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} /> : <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />}
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[100] max-h-[min(70vh,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-surface p-1 text-fg shadow-md"
          onEscapeKeyDown={(evento) => evento.stopPropagation()}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center"><ChevronUp aria-hidden className="size-4" strokeWidth={1.5} /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="flex flex-col gap-0.5">
            {opciones.filter((opcion) => opcion.valor !== '').map((opcion) => (
              <SelectPrimitive.Item
                key={opcion.valor}
                value={opcion.valor}
                disabled={opcion.deshabilitada}
                className="flex h-9 cursor-default select-none items-center justify-between gap-2 rounded-md py-2 pl-2 pr-3 text-sm leading-5 outline-none data-[highlighted]:bg-hover data-[state=checked]:bg-brand-tint data-[state=checked]:text-brand-deep data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemText>{opcion.etiqueta}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator><Check aria-hidden className="size-4" strokeWidth={1.5} /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center"><ChevronDown aria-hidden className="size-4" strokeWidth={1.5} /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
