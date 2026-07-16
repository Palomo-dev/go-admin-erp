'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { TagIcon, CheckCircle2 } from 'lucide-react';

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
}

export default function PriceSummary({
  subscriptionPlan,
  billingPeriod,
  skipTrial = false,
  coupon = null,
  compact = false,
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

  const padding = compact ? 'p-3' : 'p-4';
  const textSize = compact ? 'text-xs' : 'text-sm';
  const titleSize = compact ? 'text-sm' : 'text-base';

  return (
    <div className={`mt-3 sm:mt-4 ${padding} bg-white border border-gray-200 rounded-lg shadow-sm`}>
      <h4 className={`${titleSize} font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center gap-1.5`}>
        <TagIcon className="h-4 w-4 text-blue-600" />
        Resumen de pago
      </h4>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-xs sm:text-sm">
          <span className="text-gray-600">Plan {planName} ({periodLabelShort})</span>
          <span className="font-medium text-gray-900">${planPrice.toFixed(2)} {periodLabel}</span>
        </div>

        {coupon && discountAmount > 0 && (
          <div className="flex justify-between items-center text-xs sm:text-sm text-green-700">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Descuento ({coupon.code})
            </span>
            <span className="font-medium">-${discountAmount.toFixed(2)}</span>
          </div>
        )}

        {coupon && coupon.durationMonths && (
          <p className="text-[11px] text-green-600 italic">
            {coupon.durationDescription}
          </p>
        )}

        <div className="border-t border-gray-200 pt-1.5 mt-1.5">
          <div className="flex justify-between items-center">
            <span className={`${textSize} font-semibold text-gray-900`}>Total a pagar</span>
            <span className={`${textSize} font-bold text-gray-900`}>
              ${finalPrice.toFixed(2)} {periodLabel}
            </span>
          </div>
        </div>
      </div>

      {skipTrial ? (
        <p className="mt-2 text-[11px] sm:text-xs text-amber-600 flex items-center gap-1">
          Se cobrará ahora al verificar la tarjeta
        </p>
      ) : (
        <p className="mt-2 text-[11px] sm:text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          No se cobrará hasta que termine el período de prueba
        </p>
      )}
    </div>
  );
}
