'use client';

/**
 * Tarjeta flotante del acceso (Figma `TarjetaAcceso` 1129:35496, docs/design/AUTH-ACCESO-V2.md
 * §11.3): radio 16, `bg/surface`, sombra lg, 32 px de relleno (24 en móvil) y
 * 20 px entre bloques. Orden fijo: pasos → icono → título y descripción → aviso
 * → cuerpo → pie.
 *
 * Anchos: Normal 440 · Ancha 560 (organización, sucursal, selección) · Plan
 * 1000 (paso de planes) · en móvil ocupa el ancho con 16 px a cada lado (358
 * en 390).
 */
import * as React from 'react';
import { cn } from '@/utils/Utils';

export type AnchoTarjeta = 'normal' | 'ancha' | 'plan';

const ANCHO: Record<AnchoTarjeta, string> = {
  normal: 'max-w-[440px]',
  ancha: 'max-w-[560px]',
  plan: 'max-w-[1000px]',
};

export interface TarjetaAccesoProps {
  titulo: string;
  descripcion?: React.ReactNode;
  ancho?: AnchoTarjeta;
  /** `ProgresoPasos` del kit. */
  pasos?: React.ReactNode;
  /** `IconoDestacado` del kit. */
  icono?: React.ReactNode;
  /** `AvisoAcceso` del kit. */
  aviso?: React.ReactNode;
  /** `PieEnlace` del kit u otro pie. */
  pie?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Alinea título y descripción al centro (estados con icono). */
  centrado?: boolean;
  /** Id del título, para `aria-labelledby` del formulario. */
  idTitulo?: string;
}

export function TarjetaAcceso({
  titulo,
  descripcion,
  ancho = 'normal',
  pasos,
  icono,
  aviso,
  pie,
  children,
  className,
  centrado,
  idTitulo,
}: TarjetaAccesoProps) {
  const generado = React.useId();
  const id = idTitulo ?? `tarjeta-acceso-${generado}`;
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'w-full rounded-2xl border border-line bg-surface p-6 text-fg sm:p-8',
        'shadow-[0_12px_32px_rgba(15,23,42,0.14),0_2px_6px_rgba(15,23,42,0.06)]',
        ANCHO[ancho],
        className,
      )}
    >
      <div className="flex flex-col gap-5">
        {pasos}
        {icono && <div className={cn('flex', centrado ? 'justify-center' : 'justify-start')}>{icono}</div>}
        <header className={cn('space-y-1.5', centrado && 'text-center')}>
          <h1 id={id} className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-fg">
            {titulo}
          </h1>
          {descripcion && <p className="text-sm leading-5 text-fg-secondary">{descripcion}</p>}
        </header>
        {aviso}
        {children}
        {pie}
      </div>
    </section>
  );
}
