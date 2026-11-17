'use client';

/**
 * Recuadro oscuro de «Marcar turno» para el lector (Figma 20.30.2, 20.30.5,
 * 20.30.6 y 20.30.11): icono grande, título y texto en blanco. Lo usan la
 * etiqueta NFC («Acerca la parte de atrás…») y los errores del QR y de la
 * etiqueta («Este código ya se usó», «Esta etiqueta es de la …»).
 */
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';

export function PanelLector({
  icono: Icono,
  titulo,
  descripcion,
  animado = false,
  rol,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  descripcion?: string;
  /** El icono late (esperando la etiqueta); se detiene con movimiento reducido. */
  animado?: boolean;
  /** `alert` para los errores: el lector de pantalla lo anuncia. */
  rol?: 'alert' | 'status';
  children?: React.ReactNode;
}) {
  return (
    <div role={rol} className="flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-xl bg-tooltip px-6 py-10 text-center">
      <Icono aria-hidden className={cn('size-20 text-white', animado && 'motion-safe:animate-pulse')} strokeWidth={1} />
      <p className="mt-4 text-base font-medium text-white">{titulo}</p>
      {descripcion && <p className="max-w-xs text-sm text-white/80">{descripcion}</p>}
      {children}
    </div>
  );
}
