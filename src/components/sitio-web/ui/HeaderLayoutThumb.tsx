'use client';

import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosComun } from './textos';

/**
 * Disposición del encabezado del sitio (Figma D/02 HeaderLayoutThumb; editor
 * D/05-14): Clásico, Logo centrado, Dividido, Mínimo y Megamenú. Esquema con
 * tokens (logo en `brand`, enlaces en `line`); seleccionado con borde de marca,
 * tinte y check. Es un `radio`.
 */
export type DisposicionEncabezado = 'clasico' | 'logo_centrado' | 'dividido' | 'minimo' | 'megamenu';

export const DISPOSICIONES_ENCABEZADO: readonly DisposicionEncabezado[] = ['clasico', 'logo_centrado', 'dividido', 'minimo', 'megamenu'];

export interface HeaderLayoutThumbProps {
  disposicion: DisposicionEncabezado;
  seleccionado: boolean;
  onSeleccionar: () => void;
  className?: string;
}

const Logo = () => <span className="h-2 w-4 rounded-full bg-brand" />;
const Enlaces = ({ n = 4 }: { n?: number }) => (
  <span className="flex gap-1">
    {Array.from({ length: n }, (_, i) => (
      <span key={i} className="h-0.5 w-2.5 rounded-full bg-line-strong" />
    ))}
  </span>
);
const Acciones = () => (
  <span className="flex items-center gap-1">
    <span className="size-1.5 rounded-full bg-fg-secondary" />
    <span className="h-1.5 w-3 rounded-full bg-brand" />
  </span>
);

function Esquema({ d }: { d: DisposicionEncabezado }) {
  switch (d) {
    case 'logo_centrado':
      return (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-center justify-center gap-6 border-b border-line pb-1.5">
            <Logo />
            <span className="size-1.5 rounded-full bg-fg-secondary" />
          </span>
          <span className="flex justify-center">
            <Enlaces />
          </span>
        </span>
      );
    case 'dividido':
      return (
        <span className="flex items-center justify-between">
          <Enlaces n={3} />
          <Logo />
          <span className="flex items-center gap-1">
            <Enlaces n={2} />
            <span className="h-1.5 w-3 rounded-full bg-brand" />
          </span>
        </span>
      );
    case 'minimo':
      return (
        <span className="flex items-center justify-between">
          <Logo />
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-fg-secondary" />
            <span className="flex flex-col gap-0.5">
              <span className="h-0.5 w-2.5 bg-fg-secondary" />
              <span className="h-0.5 w-2.5 bg-fg-secondary" />
              <span className="h-0.5 w-2.5 bg-fg-secondary" />
            </span>
          </span>
        </span>
      );
    case 'megamenu':
      return (
        <span className="flex flex-col gap-1">
          <span className="flex items-center justify-between">
            <Logo />
            <span className="h-1.5 w-1/2 rounded-full bg-surface" />
            <Acciones />
          </span>
          <span className="rounded-sm bg-line px-1 py-0.5">
            <Enlaces n={5} />
          </span>
          <span className="grid grid-cols-4 gap-1 rounded-sm bg-surface p-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex flex-col gap-0.5">
                <span className="h-0.5 w-full bg-fg-secondary" />
                <span className="h-0.5 w-3/4 bg-line-strong" />
                <span className="h-0.5 w-3/4 bg-line-strong" />
              </span>
            ))}
          </span>
        </span>
      );
    default:
      return (
        <span className="flex items-center justify-between">
          <Logo />
          <span className="flex items-center gap-2">
            <Enlaces />
            <Acciones />
          </span>
        </span>
      );
  }
}

export function HeaderLayoutThumb({ disposicion, seleccionado, onSeleccionar, className }: HeaderLayoutThumbProps) {
  const tx = useTextosComun();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionado}
      onClick={onSeleccionar}
      className={cn(
        'flex w-full flex-col gap-2 rounded-xl border p-2 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
        seleccionado ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-surface hover:bg-hover',
        className,
      )}
    >
      <span aria-hidden="true" className="block aspect-[16/7] w-full rounded-lg bg-subtle p-2">
        <Esquema d={disposicion} />
      </span>
      <span className="flex items-center justify-between gap-2 px-1 pb-0.5">
        <span className={cn('text-sm leading-5', seleccionado ? 'font-medium text-brand-deep' : 'text-fg')}>
          {tx(`cabecera.${disposicion}`)}
        </span>
        {seleccionado && <Check aria-hidden="true" className="size-4 text-brand" strokeWidth={1.5} />}
      </span>
    </button>
  );
}
