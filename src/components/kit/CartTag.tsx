'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Percent, Tag, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesTonoCartTag, vistaCartTag, type OrigenDescuento, type TonoCartTag } from './cartTagLogica';
import { ariaAtajo } from './teclas';
import { useKitT } from './useIdiomaKit';

/**
 * Etiqueta compacta del carrito (Figma `CartTag` 237:76837, 20 px, Inter 11):
 * cocina, modificador `{nombre} (+$X)`, nota, descuento, «Sin impuesto
 * (excluido)». Va en el renglón 2 de `CartLine`, que las recibe ya armadas en
 * `etiquetas`. Mesas la usa igual.
 *
 * - Solo es un botón si trae `onClick` (descuento o nota editables); si no, es
 *   texto. El texto se recorta con «…» a `anchoMaximo` (modificador 190, nota 150).
 * - `origen` (descuentos, `discount_source`): manual rojo con etiqueta, general
 *   rojo con «%» y el sufijo «· general», promoción en violeta. Cada uno con su
 *   tooltip por defecto (`kit.carrito`), que `titulo` sobrescribe.
 * - `icono={null}` quita el icono por defecto.
 */
export interface CartTagProps {
  tono?: TonoCartTag;
  /** Icono lucide de 12 px. `null` = sin icono aunque el origen traiga uno. */
  icono?: LucideIcon | null;
  children: ReactNode;
  /** Hace la etiqueta editable (botón). */
  onClick?: () => void;
  /** Tooltip (`title`). Por defecto, el del origen o el texto si es una cadena. */
  titulo?: string;
  origen?: OrigenDescuento;
  /** Ancho máximo en px antes de recortar con «…». */
  anchoMaximo?: number;
  /** Nombre accesible del botón cuando el texto solo no basta («Editar descuento de Pan»). */
  etiquetaAccesible?: string;
  deshabilitada?: boolean;
  /** Atajo que anuncia el botón (`aria-keyshortcuts`), escrito como en los diseños: «D». */
  atajo?: string;
  className?: string;
}

const ICONO: Record<'etiqueta' | 'porcentaje', LucideIcon> = { etiqueta: Tag, porcentaje: Percent };

export function CartTag({
  tono,
  icono,
  children,
  onClick,
  titulo,
  origen,
  anchoMaximo,
  etiquetaAccesible,
  deshabilitada,
  atajo,
  className,
}: CartTagProps) {
  const t = useKitT();
  const vista = vistaCartTag({ tono, origen });
  const clases = clasesTonoCartTag(vista.tono);
  const Icono = icono === null ? null : icono ?? (vista.icono ? ICONO[vista.icono] : null);
  const textoTitulo =
    titulo ?? (vista.claveTitulo ? t(`carrito.${vista.claveTitulo}`) : typeof children === 'string' ? children : undefined);
  const estilo: CSSProperties | undefined = anchoMaximo ? { maxWidth: anchoMaximo } : undefined;

  const contenido = (
    <>
      {Icono && <Icono aria-hidden="true" className={cn('size-3 shrink-0', clases.icono)} strokeWidth={2} />}
      <span className="truncate">
        {children}
        {vista.sufijo && ` · ${t('carrito.descuentoGeneral')}`}
      </span>
    </>
  );

  const base = cn(
    'inline-flex h-5 max-w-full shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-1.5 text-[11px] font-medium leading-[14px] tabular-nums',
    clases.caja,
    className,
  );

  if (!onClick) {
    return (
      <span className={base} style={estilo} title={textoTitulo}>
        {contenido}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      title={textoTitulo}
      aria-label={etiquetaAccesible}
      aria-keyshortcuts={atajo ? ariaAtajo(atajo) : undefined}
      style={estilo}
      className={cn(
        base,
        'cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline',
      )}
    >
      {contenido}
    </button>
  );
}
