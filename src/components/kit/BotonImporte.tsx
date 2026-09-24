'use client';

import { useId, type ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton, temaKbdDe } from './botonClases';
import { vistaBotonImporte, type EstadoBotonImporte } from './botonImporteLogica';
import { Kbd } from './Kbd';
import { ariaAtajo } from './teclas';
import { useKitT } from './useIdiomaKit';

/**
 * Botón de acción con importe (Figma `CobrarButton`): «Cobrar · $ 128.400 ·
 * F4» del carrito, «Completar venta · Enter» del cobro, «Registrar pago · $ …»
 * del diálogo único de pago, «Pagar» de facturas y CxP.
 *
 * Estados: `listo` · `sinCaja` (tinte de marca y la acción que la pantalla
 * ponga, p. ej. «Abrir caja para cobrar · F9») · `falta` (deshabilitado con
 * el motivo visible: «Falta $ 20.000») · `procesando` (spinner, `aria-busy`)
 * · `deshabilitado` (con motivo). El importe llega ya formateado.
 */
export interface BotonImporteProps {
  etiqueta: string;
  /** Importe ya formateado en la moneda del documento o de la organización. */
  importe?: ReactNode;
  atajo?: string;
  estado?: EstadoBotonImporte;
  /** Por qué no se puede (estados `falta` y `deshabilitado`). */
  motivo?: string;
  /** Etiqueta mientras `procesando` (por defecto «Procesando…»). */
  etiquetaProcesando?: string;
  onClick?: () => void;
  icono?: LucideIcon;
  /** md 40 · lg 48 (por defecto, el del carrito y el cobro). */
  tamano?: 'md' | 'lg';
  anchoCompleto?: boolean;
  type?: 'button' | 'submit';
  form?: string;
  className?: string;
}

export function BotonImporte({
  etiqueta,
  importe,
  atajo,
  estado = 'listo',
  motivo,
  etiquetaProcesando,
  onClick,
  icono: Icono,
  tamano = 'lg',
  anchoCompleto = true,
  type = 'button',
  form,
  className,
}: BotonImporteProps) {
  const t = useKitT();
  const idMotivo = useId();
  const vista = vistaBotonImporte(estado);
  const conMotivo = vista.mostrarMotivo && !!motivo;
  const texto = vista.ocupado ? etiquetaProcesando ?? t('botonImporte.procesando') : etiqueta;
  return (
    <div className={cn('flex flex-col gap-1.5', anchoCompleto && 'w-full', className)}>
      <button
        type={type}
        form={form}
        onClick={onClick}
        disabled={vista.deshabilitado}
        aria-busy={vista.ocupado || undefined}
        aria-describedby={conMotivo ? idMotivo : undefined}
        aria-keyshortcuts={atajo ? ariaAtajo(atajo) : undefined}
        className={clasesBoton({
          variante: vista.variante,
          tamano,
          anchoCompleto,
          className: cn('justify-between gap-3 px-4 text-base font-semibold', tamano === 'md' && 'text-sm'),
        })}
      >
        <span className="flex min-w-0 items-center gap-2">
          {vista.ocupado ? (
            <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin" />
          ) : (
            Icono && <Icono aria-hidden="true" className="size-5 shrink-0" strokeWidth={1.5} />
          )}
          <span className="truncate">{texto}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {vista.mostrarImporte && importe !== undefined && importe !== null && <span className="tabular-nums">{importe}</span>}
          {atajo && !vista.ocupado && (
            <Kbd tecla={atajo} tema={temaKbdDe(vista.variante)} tamano="md" className="hidden lg:inline-flex" />
          )}
        </span>
      </button>
      {conMotivo && (
        <p id={idMotivo} className={cn('text-center text-[13px] font-medium', estado === 'falta' ? 'text-danger-text' : 'text-fg-secondary')}>
          {motivo}
        </p>
      )}
    </div>
  );
}
