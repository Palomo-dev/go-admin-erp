'use client';

import * as React from 'react';
import { cn } from '@/utils/Utils';
import { inicialesDe } from './iniciales';

export { inicialesDe } from './iniciales';

/**
 * Avatar de persona o empresa (Figma `Avatar Size=sm Type=initials`, listado
 * de Clientes): círculo Azul GO con dos iniciales o la foto si existe. Un
 * solo color, no uno por nombre: el color no significa nada en el listado.
 */
export interface AvatarInicialesProps {
  nombre: string;
  /** Foto; si falla al cargar vuelve a las iniciales. */
  src?: string | null;
  /** `sm` 32 px (tablas) · `md` 40 px · `lg` 64 px (ficha). */
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TAMANO = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-xl',
} as const;

export function AvatarIniciales({ nombre, src, tamano = 'sm', className }: AvatarInicialesProps) {
  const [fallo, setFallo] = React.useState(false);
  React.useEffect(() => setFallo(false), [src]);
  const conFoto = !!src && !fallo;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand-action font-semibold text-fg-on-brand',
        TAMANO[tamano],
        className,
      )}
    >
      {conFoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL de Storage arbitraria, sin loader de next/image
        <img src={src} alt="" className="size-full object-cover" onError={() => setFallo(true)} />
      ) : (
        inicialesDe(nombre)
      )}
    </span>
  );
}
