'use client';

/**
 * Avatar de persona (Figma `02 Componentes` › Átomos › Avatar): foto o
 * iniciales sobre Azul GO, con punto de estado opcional abajo a la derecha. En
 * el sidebar colapsado ese punto es la única señal de sesión activa.
 */
import Image from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/lib/supabase/imageUtils';

type Tamano = 32 | 40 | 48;

const TAMANOS: Record<Tamano, { caja: string; texto: string; punto: string }> = {
  32: { caja: 'h-8 w-8', texto: 'text-xs', punto: 'h-2.5 w-2.5 -bottom-px -right-px' },
  40: { caja: 'h-10 w-10', texto: 'text-sm', punto: 'h-3 w-3 -bottom-px -right-px' },
  48: { caja: 'h-12 w-12', texto: 'text-base font-semibold', punto: 'h-3 w-3 bottom-0 right-0' },
};

export function iniciales(nombre?: string | null, respaldo?: string | null): string {
  const fuente = (nombre || respaldo || '').trim();
  if (!fuente) return '?';
  const partes = fuente.split(/[\s@._-]+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[1][0] : fuente.slice(0, 2);
  return letras.toUpperCase();
}

export function AvatarUsuario({
  nombre,
  correo,
  foto,
  tamano = 40,
  indicador = false,
  className,
}: {
  nombre?: string | null;
  correo?: string | null;
  foto?: string | null;
  tamano?: Tamano;
  indicador?: boolean;
  className?: string;
}) {
  const [fotoRota, setFotoRota] = useState(false);
  const t = TAMANOS[tamano];
  const url = foto && !fotoRota ? getAvatarUrl(foto) : '';

  return (
    <span className={cn('relative inline-flex shrink-0', t.caja, className)}>
      {url ? (
        <span className={cn('relative overflow-hidden rounded-full', t.caja)}>
          <Image src={url} alt="" fill sizes={`${tamano}px`} className="object-cover" onError={() => setFotoRota(true)} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn('flex items-center justify-center rounded-full bg-brand font-medium text-fg-on-brand', t.caja, t.texto)}
        >
          {iniciales(nombre, correo)}
        </span>
      )}
      {indicador && (
        <span aria-hidden="true" className={cn('absolute rounded-full border-2 border-sidebar bg-success', t.punto)} />
      )}
    </span>
  );
}
