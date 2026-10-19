'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { TagIcon, CheckCircle2 } from 'lucide-react';
import { cn } from '@/utils/Utils';

export interface CouponData {
  code: string;
  name: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  durationMonths: number | null;
  discountDescription: string;
  durationDescription: string;
}

interface PriceSummaryProps {
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  skipTrial?: boolean;
  coupon?: CouponData | null;
  compact?: boolean;
  className?: string;
}

export default function PriceSummary({
  subscriptionPlan,
  billingPeriod,
  skipTrial = false,
  coupon = null,
  compact = false,
  className,
}: PriceSummaryProps) {
  const [planPrice, setPlanPrice] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string>('');

  useEffect(() => {
    const fetchPlanPrice = async () => {
      const planCode = (subscriptionPlan || 'pro').replace('-yearly', '');
      const { data } = await supabase
        .from('plans')
        .select('name, price_usd_month, price_usd_year')
        .eq('code', planCode)
        .single();

      if (data) {
        setPlanName(data.name);
        const price = billingPeriod === 'yearly'
          ? parseFloat(data.price_usd_year)
          : parseFloat(data.price_usd_month);
        setPlanPrice(price);
      }
    };
    fetchPlanPrice();
  }, [subscriptionPlan, billingPeriod]);

  const padding = compact ? 'p-3' : 'p-4';
  const textSize = compact ? 'text-xs' : 'text-sm';
  const titleSize = compact ? 'text-sm' : 'text-base';

  if (planPrice === null) return null;

  const periodLabel = billingPeriod === 'monthly' ? '/mes' : '/año';
  const periodLabelShort = billingPeriod === 'monthly' ? 'mensual' : 'anual';

  let discountAmount = 0;
  let finalPrice = planPrice;

  if (coupon) {
    if (coupon.discountType === 'percentage') {
      discountAmount = planPrice * (coupon.discountValue / 100);
    } else {
      discountAmount = Math.min(coupon.discountValue, planPrice);
    }
    finalPrice = Math.max(planPrice - discountAmount, 0);
  }

  return (
    <div className={cn('rounded-xl border border-line bg-canvas shadow-sm', padding, className)}>
      <h4 className={cn('mb-3 flex items-center gap-1.5 font-semibold text-fg', titleSize)}>
        <TagIcon className="size-4 text-brand" aria-hidden="true" />
        Resumen de pago
      </h4>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-fg-secondary">{planName} ({periodLabelShort})</span>
          <span className="font-medium text-fg">${planPrice.toFixed(2)} {periodLabel}</span>
        </div>

        {coupon && discountAmount > 0 && (
          <div className="flex items-center justify-between text-sm text-success-text">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Descuento ({coupon.code})
            </span>
            <span className="font-medium">-${discountAmount.toFixed(2)}</span>
          </div>
        )}

        {coupon && coupon.durationMonths && (
          <p className="text-xs italic text-success-text">{coupon.durationDescription}</p>
        )}

        <div className="mt-1.5 border-t border-line pt-1.5">
          <div className="flex items-center justify-between">
            <span className={cn('font-semibold text-fg', textSize)}>Total a pagar</span>
            <span className={cn('font-bold text-fg', textSize)}>
              ${finalPrice.toFixed(2)} {periodLabel}
            </span>
          </div>
        </div>
      </div>

      {skipTrial ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-warning-text">
          Se cobrará ahora al verificar la tarjeta
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-xs text-success-text">
          <CheckCircle2 className="size-3" aria-hidden="true" />
          No se cobrará hasta que termine el período de prueba
        </p>
      )}
    </div>
  );
}
