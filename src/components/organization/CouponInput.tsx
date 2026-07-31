'use client';

import { useState, useCallback } from 'react';
import { Ticket, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export interface ValidatedCoupon {
  id: string;
  code: string;
  name: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  durationMonths: number | null;
  stripeCouponId: string | null;
  discountDescription: string;
  durationDescription: string;
}

interface CouponInputProps {
  onCouponValidated: (coupon: ValidatedCoupon | null) => void;
  initialCode?: string;
}

export default function CouponInput({ onCouponValidated, initialCode = '' }: CouponInputProps) {
  const [couponInput, setCouponInput] = useState(initialCode);
  const [validatedCoupon, setValidatedCoupon] = useState<ValidatedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const handleValidateCoupon = useCallback(async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    setValidatedCoupon(null);

    try {
      const response = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponInput.trim() }),
      });
      const data = await response.json();

      if (data.valid && data.coupon) {
        setValidatedCoupon(data.coupon);
        onCouponValidated(data.coupon);
      } else {
        setCouponError(data.error || 'Cupón no válido');
        onCouponValidated(null);
      }
    } catch {
      setCouponError('Error al validar el cupón');
      onCouponValidated(null);
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, onCouponValidated]);

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setValidatedCoupon(null);
    setCouponError(null);
    onCouponValidated(null);
  };

  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 bg-gray-50 dark:bg-gray-800/50">
      <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 flex items-center gap-1.5">
        <Ticket className="h-3.5 w-3.5" />
        ¿Tienes un código de descuento?
      </p>

      {!validatedCoupon ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={couponInput}
            onChange={(e) => {
              setCouponInput(e.target.value.toUpperCase());
              setCouponError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleValidateCoupon();
              }
            }}
            placeholder="Ingresa tu código"
            className="w-full sm:flex-1 rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-900 px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase text-gray-900 dark:text-gray-100"
            disabled={couponLoading}
          />
          <button
            type="button"
            onClick={handleValidateCoupon}
            disabled={couponLoading || !couponInput.trim()}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {couponLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              'Aplicar'
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-green-900 dark:text-green-300 truncate">
                {validatedCoupon.code} — {validatedCoupon.name}
              </p>
              <p className="text-[11px] sm:text-xs text-green-700 dark:text-green-400">
                {validatedCoupon.discountDescription} {validatedCoupon.durationDescription}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemoveCoupon}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {couponError && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <XCircle className="h-3.5 w-3.5" />
          {couponError}
        </div>
      )}
    </div>
  );
}
