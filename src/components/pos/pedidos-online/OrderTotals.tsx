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
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground dark:text-gray-400">Subtotal</span>
        <span className="dark:text-gray-100">{formatear(subtotal)}</span>
      </div>
      
      {taxTotal > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground dark:text-gray-400">Impuestos</span>
          <span className="dark:text-gray-100">{formatear(taxTotal)}</span>
        </div>
      )}
      
      {discountTotal > 0 && (
        <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
          <span>Descuento</span>
          <span>-{formatear(discountTotal)}</span>
        </div>
      )}
      
      {deliveryFee > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground dark:text-gray-400">Envío</span>
          <span className="dark:text-gray-100">{formatear(deliveryFee)}</span>
        </div>
      )}
      
      {tipAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground dark:text-gray-400">Propina</span>
          <span className="dark:text-gray-100">{formatear(tipAmount)}</span>
        </div>
      )}
      
      <Separator />
      
      <div className="flex justify-between text-lg font-bold">
        <span className="dark:text-gray-100">Total</span>
        <span className="text-primary dark:text-blue-400">{formatear(total)}</span>
      </div>
    </div>
  );
}
