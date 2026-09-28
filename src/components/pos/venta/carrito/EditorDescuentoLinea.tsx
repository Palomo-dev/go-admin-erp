'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { CartTag } from '@/components/kit';

/**
 * Descuento de una línea editado en el sitio (ranura `editorDescuento` de
 * `CartLine`, estado `editando-descuento`): el campo «Descuento», Aplicar /
 * Cancelar y los descuentos frecuentes del producto. El importe lo aplica la
 * pantalla con `POSService.updateCartItemDiscount`; aquí no se calcula nada
 * (el campo se lee como hoy: `parseFloat(...) || 0`).
 */
export interface EditorDescuentoLineaProps {
  nombre: string;
  valor: string;
  onValor: (valor: string) => void;
  onAplicar: (monto: number) => void;
  onCancelar: () => void;
  /** Descuentos frecuentes del producto (`POSService.getFrequentDiscounts`). */
  frecuentes?: number[];
  formatear: (valor: number) => string;
  deshabilitado?: boolean;
}

const BOTON_ICONO =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50';

export function EditorDescuentoLinea({
  nombre,
  valor,
  onValor,
  onAplicar,
  onCancelar,
  frecuentes = [],
  formatear,
  deshabilitado,
}: EditorDescuentoLineaProps) {
  const t = useTranslations('posVenta.carrito');
  const aplicar = () => onAplicar(parseFloat(valor) || 0);

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label={t('descuentoDe', { nombre })}>
      <input
        type="number"
        min="0"
        step="0.01"
        value={valor}
        onChange={(e) => onValor(e.target.value)}
        onKeyDown={(e) => {
          // preventDefault: que Enter / Esc no lleguen además a los atajos de la pantalla.
          if (e.key === 'Enter') {
            e.preventDefault();
            aplicar();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancelar();
          }
        }}
        placeholder={t('descuento')}
        aria-label={t('descuentoDe', { nombre })}
        disabled={deshabilitado}
        autoFocus
        className="h-7 w-24 rounded-md border border-line-strong bg-surface px-2 text-xs tabular-nums text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        onClick={aplicar}
        disabled={deshabilitado}
        title={t('aplicarDescuento')}
        aria-label={t('aplicarDescuento')}
        className={cn(BOTON_ICONO, 'text-success-text hover:bg-success-subtle')}
      >
        <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onCancelar}
        title={t('cancelar')}
        aria-label={t('cancelar')}
        className={cn(BOTON_ICONO, 'text-fg-secondary hover:bg-hover hover:text-fg')}
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      {frecuentes.length > 0 && (
        <>
          <span className="text-[11px] font-medium text-fg-muted">{t('frecuentes')}</span>
          {frecuentes.map((monto) => (
            <CartTag
              key={monto}
              origen="manual"
              icono={null}
              onClick={() => onAplicar(monto)}
              deshabilitada={deshabilitado}
              titulo={t('aplicarFrecuente', { monto: formatear(monto) })}
              etiquetaAccesible={t('aplicarFrecuente', { monto: formatear(monto) })}
            >
              -{formatear(monto)}
            </CartTag>
          ))}
        </>
      )}
    </div>
  );
}
