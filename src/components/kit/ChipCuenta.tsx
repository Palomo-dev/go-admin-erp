'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { ChevronDown, Landmark, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';

/**
 * Insignia de la cuenta de una línea (Figma `ChipCuenta`, 02 Componentes,
 * sección 2317:39697): código y estado. Solo se ve con «Ver cuentas contables»
 * encendido. Abre el mismo selector que `CampoCuentaAutomatica`.
 */
export type EstadoChipCuenta = 'automatica' | 'categoria' | 'propia' | 'titulo' | 'sin_cuenta';

const TONO: Record<EstadoChipCuenta, string> = {
  automatica: 'border-line bg-subtle text-fg-secondary',
  categoria: 'border-line-info bg-info-subtle text-info-text',
  propia: 'border-line-brand bg-brand-tint text-brand-deep',
  titulo: 'border-line-warning bg-warning-subtle text-warning-text',
  sin_cuenta: 'border-line-danger bg-danger-subtle text-danger-text',
};

export interface ChipCuentaProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  cuenta: string | null | undefined;
  estado: EstadoChipCuenta;
  cargando?: boolean;
}

export const ChipCuenta = forwardRef<HTMLButtonElement, ChipCuentaProps>(function ChipCuenta(
  { cuenta, estado, cargando, className, type = 'button', ...resto },
  ref,
) {
  const t = useTranslations('cuentasAutomaticas');
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        TONO[estado],
        className,
      )}
      {...resto}
    >
      {cargando ? (
        <Loader2 aria-hidden="true" className="size-3 shrink-0 animate-spin" strokeWidth={1.5} />
      ) : (
        <Landmark aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
      )}
      <span className="truncate tabular-nums">{cuenta ?? t('estado.sin_cuenta')}</span>
      {cuenta && <span className="shrink-0">· {t(`estado.${estado}`)}</span>}
      <ChevronDown aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
    </button>
  );
});
