'use client';

import { useTranslations } from 'next-intl';
import { KbdButton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import type { EstadoParte } from './cuentaMesaLogica';

/**
 * Una parte de la cuenta dividida (Figma `CuentaDividida` Nuevo 1073:667363,
 * Estado=pendiente/cobrando/pagada): título, detalle de lo que lleva, importe
 * y su botón de cobro, o «Pagado con Tarjeta · 20:41».
 */
export interface CuentaDivididaProps {
  titulo: string;
  detalle: string;
  importe: string;
  estado: EstadoParte;
  /** «Pagado con Tarjeta · 20:41». */
  pagadoCon?: string | null;
  onCobrar?: () => void;
  /** Sin botón (la vista previa de «Dividir»). */
  sinAccion?: boolean;
  className?: string;
}

export function CuentaDividida({ titulo, detalle, importe, estado, pagadoCon, onCobrar, sinAccion, className }: CuentaDivididaProps) {
  const t = useTranslations('posMesasFlujo.partes');
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-xl border p-4',
        estado === 'pagada' ? 'border-line-success bg-success-subtle' : estado === 'cobrando' ? 'border-2 border-line-brand bg-surface' : 'border-line bg-surface',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-base font-semibold text-fg">{titulo}</h3>
        <span
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-semibold',
            estado === 'pagada'
              ? 'border-line-success bg-surface text-success-text'
              : estado === 'cobrando'
                ? 'border-line-brand bg-brand-tint text-brand-deep'
                : 'border-line-warning bg-warning-subtle text-warning-text',
          )}
        >
          {estado === 'cobrando' && <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />}
          {t(`estado.${estado}`)}
        </span>
      </div>
      <p className="line-clamp-2 text-[13px] text-fg-secondary">{detalle}</p>
      <p className="text-2xl font-semibold tabular-nums text-fg">{importe}</p>
      {estado === 'pagada' ? (
        pagadoCon && <p className="text-[13px] font-medium text-success-text">{pagadoCon}</p>
      ) : (
        !sinAccion && (
          <KbdButton
            variante={estado === 'cobrando' ? 'primario' : 'secundario'}
            tamano="sm"
            anchoCompleto
            onClick={onCobrar}
            cargando={false}
            disabled={estado === 'cobrando'}
            className={cn('mt-1', estado === 'cobrando' && 'disabled:opacity-100')}
          >
            {estado === 'cobrando' ? t('cobrando') : t('cobrarParte')}
          </KbdButton>
        )
      )}
    </div>
  );
}
