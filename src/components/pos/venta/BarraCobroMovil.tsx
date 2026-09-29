'use client';

import { CreditCard, LockOpen, ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BotonImporte } from '@/components/kit';
import { clasesBadgeTono } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { useBarraInferiorPropia } from '@/components/shell/header/cabeceraMovil';
import { teclaAtajo } from '@/lib/pos/venta/atajos';
import type { EstadoBotonCobrar } from '@/lib/pos/venta/requisitosCarrito';

/**
 * Barra fija del celular y la tableta vertical (POS-UX-V2 D3c; Figma
 * `250:81342`, `275:33959`): a la izquierda el carrito (unidades y total, abre
 * la hoja del carrito) y a la derecha «Cobrar · F4», o «Abrir caja para
 * cobrar» cuando falta la caja. Sustituye al botón flotante «Carrito · n · $».
 *
 * No decide nada: el estado del botón es el mismo que el del carrito
 * (`estadoBotonCobrar`), calculado por la página.
 */
export interface BarraCobroMovilProps {
  unidades: number;
  /** Total ya formateado en la moneda de la organización. */
  total: string;
  estado: EstadoBotonCobrar;
  onVerCarrito: () => void;
  onCobrar: () => void;
  onAbrirCaja: () => void;
}

export function BarraCobroMovil({ unidades, total, estado, onVerCarrito, onCobrar, onAbrirCaja }: BarraCobroMovilProps) {
  const t = useTranslations('posVenta.barraMovil');
  const tMembresias = useTranslations('membresias.pos');
  const sinCaja = estado === 'sin-caja';
  // Barra inferior propia: el shell oculta la suya y deja abajo este alto.
  const refBarra = useBarraInferiorPropia();
  return (
    <div
      ref={refBarra}
      role="region"
      aria-label={t('etiqueta')}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden"
    >
      <button
        type="button"
        onClick={onVerCarrito}
        aria-label={t('verCarrito', { n: unidades, total })}
        className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="relative flex size-10 items-center justify-center rounded-lg bg-brand-tint text-brand" aria-hidden="true">
          <ShoppingCart className="size-5" strokeWidth={1.75} />
          {unidades > 0 && (
            <span className={cn(clasesBadgeTono('marca', 'solido', 'sm'), 'absolute -right-1.5 -top-1.5 min-w-5 justify-center tabular-nums')}>
              {unidades}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-col" aria-hidden="true">
          <span className="text-xs text-fg-secondary">{t('total')}</span>
          <span className="truncate text-base font-semibold tabular-nums text-fg">{total}</span>
        </span>
      </button>
      <div className="min-w-0 flex-1">
        {sinCaja ? (
          <BotonImporte etiqueta={t('abrirCaja')} icono={LockOpen} estado="sinCaja" atajo={teclaAtajo('caja')} onClick={onAbrirCaja} tamano="lg" />
        ) : (
          <BotonImporte
            etiqueta={t('cobrar')}
            icono={CreditCard}
            atajo={teclaAtajo('cobrar')}
            estado={estado === 'listo' ? 'listo' : 'deshabilitado'}
            motivo={estado === 'sin-cliente' ? tMembresias('motivoSinCliente') : undefined}
            onClick={onCobrar}
            tamano="lg"
          />
        )}
      </div>
    </div>
  );
}
