'use client';

import { useState, useEffect, useCallback } from 'react';
import SubscriptionPlanSelector from '../subscription/SubscriptionPlanSelector';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { Ticket, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import PriceSummary from './PriceSummary';

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

export interface SubscriptionData {
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  skipTrial: boolean;
  couponCode?: string;
}

interface SubscriptionStepProps {
  formData: {
    subscriptionPlan?: string;
    billingPeriod?: 'monthly' | 'yearly';
    skipTrial?: boolean;
    couponCode?: string;
  };
  updateFormData: (data: Partial<any>) => void;
  onNext: () => void;
  onBack: () => void;
  loading?: boolean;
}

export default function SubscriptionStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  loading = false,
}: SubscriptionStepProps) {
  const t = useTranslations('auth.signup.subscription');
  const tc = useTranslations('common');
  const [selectedPlan, setSelectedPlan] = useState(formData.subscriptionPlan || 'pro');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    formData.billingPeriod || 'monthly'
  );
  const [skipTrial, setSkipTrial] = useState(formData.skipTrial || false);
  const [trialDays, setTrialDays] = useState<number>(15);

  // Estado de cupón
  const [couponInput, setCouponInput] = useState(formData.couponCode || '');
  const [validatedCoupon, setValidatedCoupon] = useState<ValidatedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // Obtener trial_days del plan seleccionado desde la BD
  useEffect(() => {
    const fetchTrialDays = async () => {
      const planCode = (selectedPlan || 'pro').replace('-yearly', '');
      const { data } = await supabase
        .from('plans')
        .select('trial_days')
        .eq('code', planCode)
        .single();
      if (data?.trial_days) {
        setTrialDays(data.trial_days);
      }
    };
    fetchTrialDays();
  }, [selectedPlan]);
  

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
    updateFormData({ subscriptionPlan: planId });
  };

  const handleChangeBillingPeriod = (period: 'monthly' | 'yearly') => {
    setBillingPeriod(period);
    updateFormData({ billingPeriod: period });
    
    // Update selected plan to match the billing period
    const currentPlanBase = selectedPlan.replace('-yearly', '');
    const newPlanId = period === 'yearly' ? `${currentPlanBase}-yearly` : currentPlanBase;
    setSelectedPlan(newPlanId);
    updateFormData({ subscriptionPlan: newPlanId });
  };

  const handleToggleSkipTrial = (value: boolean) => {
    setSkipTrial(value);
    updateFormData({ skipTrial: value });
  };

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
        updateFormData({
          couponCode: data.coupon.code,
          validatedCoupon: {
            code: data.coupon.code,
            name: data.coupon.name,
            discountType: data.coupon.discountType,
            discountValue: data.coupon.discountValue,
            durationMonths: data.coupon.durationMonths,
            discountDescription: data.coupon.discountDescription,
            durationDescription: data.coupon.durationDescription,
          },
        });
      } else {
        setCouponError(data.error || 'Cupón no válido');
        updateFormData({ couponCode: undefined, validatedCoupon: null });
      }
    } catch {
      setCouponError('Error al validar el cupón');
      updateFormData({ couponCode: undefined });
    } finally {
      setCouponLoading(false);
    }
  }, [couponInput, updateFormData]);

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setValidatedCoupon(null);
    setCouponError(null);
    updateFormData({ couponCode: undefined, validatedCoupon: null });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="text-center">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900">{t('selectPlan')}</h2>
        <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-500">
          {t('selectPlanDescription')}
          <span className="block mt-1 text-[11px] sm:text-xs">{t('trialPeriod', { days: trialDays })}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        <SubscriptionPlanSelector
          selectedPlan={selectedPlan}
          onSelectPlan={handleSelectPlan}
          billingPeriod={billingPeriod}
          onChangeBillingPeriod={handleChangeBillingPeriod}
        />

        {/* Toggle: Trial vs Pago inmediato */}
        <div className="mt-4 sm:mt-6 border border-gray-200 rounded-lg p-3 sm:p-4 bg-gray-50">
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
            {t('billingOption')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <label
              className={`flex-1 flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-md border cursor-pointer transition-colors ${
                !skipTrial
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="trialOption"
                checked={!skipTrial}
                onChange={() => handleToggleSkipTrial(false)}
                className="mt-0.5 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-900">
                  {t('useTrial')}
                </p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                  {t('useTrialDescription', { days: trialDays })}
                </p>
              </div>
            </label>
            <label
              className={`flex-1 flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-md border cursor-pointer transition-colors ${
                skipTrial
                  ? 'border-green-500 bg-green-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="trialOption"
                checked={skipTrial}
                onChange={() => handleToggleSkipTrial(true)}
                className="mt-0.5 text-green-600 focus:ring-green-500"
              />
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-900">
                  {t('payNow')}
                </p>
                <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">
                  {t('payNowDescription')}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Sección de cupón de descuento */}
        <div className="mt-4 sm:mt-6 border border-gray-200 rounded-lg p-3 sm:p-4 bg-gray-50">
          <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3 flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" />
            {t('couponTitle')}
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
                placeholder={t('couponPlaceholder')}
                className="w-full sm:flex-1 rounded-md border border-gray-300 px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase"
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
                  t('couponApply')
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-md border border-green-300 bg-green-50">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-green-900 truncate">
                    {validatedCoupon.code} — {validatedCoupon.name}
                  </p>
                  <p className="text-[11px] sm:text-xs text-green-700">
                    {validatedCoupon.discountDescription} {validatedCoupon.durationDescription}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRemoveCoupon}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
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

        {/* Resumen de pago */}
        <PriceSummary
          subscriptionPlan={selectedPlan}
          billingPeriod={billingPeriod}
          skipTrial={skipTrial}
          coupon={validatedCoupon}
        />

        <div className="mt-6 sm:mt-8 flex justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-gray-300 bg-white py-1.5 px-4 sm:py-2 sm:px-6 text-xs sm:text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {tc('back')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-1.5 px-4 sm:py-2 sm:px-6 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? tc('loading') : tc('continue')}
          </button>
        </div>
      </form>
    </div>
  );
}
