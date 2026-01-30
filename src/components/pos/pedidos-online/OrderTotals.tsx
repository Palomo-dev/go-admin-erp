'use client';

import { Separator } from '@/components/ui/separator';

interface OrderTotalsProps {
  subtotal: number;
  taxTotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  tipAmount?: number;
  total: number;
  variant?: 'full' | 'compact';
  currencySymbol?: string;
}

export function OrderTotals({
  subtotal,
  taxTotal = 0,
  discountTotal = 0,
  deliveryFee = 0,
  tipAmount = 0,
  total,
  variant = 'full',
  currencySymbol = '$',
}: OrderTotalsProps) {
  const formatCurrency = (amount: number) => {
    return `${currencySymbol}${amount.toLocaleString()}`;
  };

  if (variant === 'compact') {
    return (
      <div className="flex items-center justify-between border-t pt-3">
        <span className="font-medium">Total</span>
        <span className="text-lg font-bold text-primary">{formatCurrency(total)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>{formatCurrency(subtotal)}</span>
      </div>
      
      {taxTotal > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Impuestos</span>
          <span>{formatCurrency(taxTotal)}</span>
        </div>
      )}
      
      {discountTotal > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Descuento</span>
          <span>-{formatCurrency(discountTotal)}</span>
        </div>
      )}
      
      {deliveryFee > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Envío</span>
          <span>{formatCurrency(deliveryFee)}</span>
        </div>
      )}
      
      {tipAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Propina</span>
          <span>{formatCurrency(tipAmount)}</span>
        </div>
      )}
      
      <Separator />
      
      <div className="flex justify-between text-lg font-bold">
        <span>Total</span>
        <span className="text-primary">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
