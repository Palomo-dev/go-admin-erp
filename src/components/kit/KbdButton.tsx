'use client';

import * as React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton, TAMANO_ICONO, temaKbdDe, type TamanoBoton, type VarianteBoton } from './botonClases';
import { Kbd } from './Kbd';
import { ariaAtajo } from './teclas';

/**
 * Botón con su atajo visible (Figma `KbdButton`: primary · outline · ghost ·
 * destructive × sm · md · lg): «Abrir caja · F9», «Espera · F6», «Nueva venta
 * · Enter». Pone `aria-keyshortcuts` y el `Kbd` con el tema que pide la
 * variante. El `Kbd` se oculta por debajo de `lg` (sin teclado físico no
 * dice nada), pero el atajo sigue anunciado.
 *
 * El botón no escucha el teclado: el atajo lo registra la pantalla con
 * `useAtajos` (un solo registro por ámbito).
 */
export interface KbdButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** «F9», «Ctrl+N», «Alt+1», «Esc». */
  atajo?: string;
  icono?: LucideIcon;
  /** Oculta el icono en móvil para que quepa la etiqueta. */
  ocultarIconoEnMovil?: boolean;
  /** Muestra el `Kbd` también en móvil (por defecto solo desde `lg`). */
  atajoSiempreVisible?: boolean;
  /** Spinner + `aria-busy`; el botón queda deshabilitado. */
  cargando?: boolean;
  anchoCompleto?: boolean;
}

export const KbdButton = React.forwardRef<HTMLButtonElement, KbdButtonProps>(function KbdButton(
  {
    variante = 'primario',
    tamano = 'md',
    atajo,
    icono: Icono,
    ocultarIconoEnMovil,
    atajoSiempreVisible,
    cargando,
    anchoCompleto,
    disabled,
    className,
    children,
    type = 'button',
    ...resto
  },
  ref,
) {
  const aria = atajo ? ariaAtajo(atajo) : undefined;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      aria-keyshortcuts={aria || undefined}
      className={clasesBoton({ variante, tamano, anchoCompleto, className })}
      {...resto}
    >
      {cargando ? (
        <Loader2 aria-hidden="true" className={cn(TAMANO_ICONO[tamano], 'animate-spin')} />
      ) : (
        Icono && <Icono aria-hidden="true" className={cn(TAMANO_ICONO[tamano], 'shrink-0', ocultarIconoEnMovil && 'hidden lg:block')} strokeWidth={1.5} />
      )}
      {children !== undefined && children !== null && <span className="truncate">{children}</span>}
      {atajo && (
        <Kbd
          tecla={atajo}
          tema={temaKbdDe(variante)}
          tamano={tamano === 'lg' ? 'md' : 'sm'}
          className={cn('ml-1', !atajoSiempreVisible && 'hidden lg:inline-flex')}
        />
      )}
    </button>
  );
});
