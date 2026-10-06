'use client';

import { Separator } from '@/components/ui/separator';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';

interface OrderTotalsProps {
  subtotal: number;
  taxTotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  tipAmount?: number;
  total: number;
  variant?: 'full' | 'compact';
  /** Moneda del pedido, si la trae; sin ella, la moneda base de la organización. */
  currencyCode?: string | null;
}

export function OrderTotals({
  subtotal,
  taxTotal = 0,
  discountTotal = 0,
  deliveryFee = 0,
  tipAmount = 0,
  total,
  variant = 'full',
  currencyCode,
}: OrderTotalsProps) {
  const { paraDocumento } = useMonedaOrganizacion();
  const moneda = paraDocumento(currencyCode);
  const formatear = (amount: number) => formatMoneda(amount, moneda);

  if (variant === 'compact') {
    return (
      <div className="flex items-center justify-between border-t dark:border-gray-700 pt-3">
        <span className="font-medium dark:text-gray-100">Total</span>
        <span className="text-lg font-bold text-primary dark:text-blue-400">{formatear(total)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-[13px]">
      <div className="flex justify-between">
        <span className="text-fg-secondary">Subtotal</span>
        <span className="text-fg tabular-nums">{formatear(subtotal)}</span>
      </div>
      
      {taxTotal > 0 && (
        <div className="flex justify-between">
          <span className="text-fg-secondary">Impuestos</span>
          <span className="text-fg tabular-nums">{formatear(taxTotal)}</span>
        </div>
      )}
      
      {discountTotal > 0 && (
        <div className="flex justify-between text-success-text">
          <span>Descuento</span>
          <span>-{formatear(discountTotal)}</span>
        </div>
      )}
      
      {deliveryFee > 0 && (
        <div className="flex justify-between">
          <span className="text-fg-secondary">Envío</span>
          <span className="text-fg tabular-nums">{formatear(deliveryFee)}</span>
        </div>
      )}
      
      {tipAmount > 0 && (
        <div className="flex justify-between">
          <span className="text-fg-secondary">Propina</span>
          <span className="text-fg tabular-nums">{formatear(tipAmount)}</span>
        </div>
      )}
      
      <Separator />
      
      <div className="flex justify-between pt-1 text-[15px] font-semibold text-fg">
        <span>Total</span>
        <span className="tabular-nums">{formatear(total)}</span>
      </div>
    </div>
  );
}
