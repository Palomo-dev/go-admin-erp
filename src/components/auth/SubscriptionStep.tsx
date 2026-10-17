'use client';

import { useState, useEffect, useCallback } from 'react';
import SubscriptionPlanSelector from '../subscription/SubscriptionPlanSelector';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { Ticket, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { clasesBoton } from '@/components/kit/botonClases';
import { cn } from '@/utils/Utils';
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
  updateFormData: (data: Partial<SubscriptionData> & { validatedCoupon?: ValidatedCoupon | null }) => void;
  onNext: () => void;
  onBack: () => void;
  loading?: boolean;
  /** El registro ya titula el paso en la tarjeta. En la app el título vive aquí. */
  encabezado?: boolean;
  /** Tres columnas cuando el paso tiene el ancho del plan (1000 px). */
  enColumnas?: boolean;
}

export default function SubscriptionStep({
  formData,
  updateFormData,
  onNext,
  onBack,
  loading = false,
  encabezado = true,
  enColumnas = false,
}: SubscriptionStepProps) {
  const t = useTranslations('auth.signup.subscription');
  const tc = useTranslations('common');
  const [selectedPlan, setSelectedPlan] = useState(formData.subscriptionPlan || 'pro');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    formData.billingPeriod || 'monthly'
  );
  const [skipTrial, setSkipTrial] = useState(formData.skipTrial ?? true);
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
    <div className="w-full space-y-4 sm:space-y-5">
      {encabezado && (
        <div className="text-center">
          <h2 className="text-lg font-semibold text-fg sm:text-xl">{t('selectPlan')}</h2>
          <p className="mt-1 text-sm text-fg-secondary">
            {t('selectPlanDescription')}
            <span className="mt-1 block text-xs">{t('trialPeriod', { days: trialDays })}</span>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
        <SubscriptionPlanSelector
          selectedPlan={selectedPlan}
          onSelectPlan={handleSelectPlan}
          billingPeriod={billingPeriod}
          onChangeBillingPeriod={handleChangeBillingPeriod}
          enColumnas={enColumnas}
        />

        <div className="rounded-xl border border-line p-3 sm:p-4">
          <p className="mb-3 text-sm font-medium text-fg">{t('billingOption')}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <label
              className={cn(
                'flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                !skipTrial ? 'border-brand bg-brand-tint' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name="trialOption"
                checked={!skipTrial}
                onChange={() => handleToggleSkipTrial(false)}
                className="mt-0.5 accent-brand"
              />
              <span>
                <span className="block text-sm font-medium text-fg">{t('useTrial')}</span>
                <span className="mt-0.5 block text-xs text-fg-secondary">{t('useTrialDescription', { days: trialDays })}</span>
              </span>
            </label>
            <label
              className={cn(
                'flex flex-1 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                skipTrial ? 'border-line-success bg-success-subtle' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <input
                type="radio"
                name="trialOption"
                checked={skipTrial}
                onChange={() => handleToggleSkipTrial(true)}
                className="mt-0.5 accent-success"
              />
              <span>
                <span className="block text-sm font-medium text-fg">{t('payNow')}</span>
                <span className="mt-0.5 block text-xs text-fg-secondary">{t('payNowDescription')}</span>
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>:only-child]:md:col-span-2">
          <div className="rounded-xl border border-line bg-canvas p-3 sm:p-4">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-fg">
              <Ticket className="size-4 text-brand" aria-hidden="true" />
              {t('couponTitle')}
            </p>

            {!validatedCoupon ? (
              <div className="flex flex-col gap-2 sm:flex-row">
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
                  className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm uppercase text-fg placeholder:normal-case placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:flex-1"
                  disabled={couponLoading}
                />
                <button
                  type="button"
                  onClick={handleValidateCoupon}
                  disabled={couponLoading || !couponInput.trim()}
                  className={cn(clasesBoton({ tamano: 'md' }), 'w-full sm:w-auto')}
                >
                  {couponLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : t('couponApply')}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-line-success bg-success-subtle p-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-success-text" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-success-text">
                      {validatedCoupon.code} — {validatedCoupon.name}
                    </p>
                    <p className="text-xs text-success-text">
                      {validatedCoupon.discountDescription} {validatedCoupon.durationDescription}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="shrink-0 text-fg-muted hover:text-fg"
                  aria-label={t('couponRemove')}
                >
                  <XCircle className="size-4" />
                </button>
              </div>
            )}

            {couponError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-danger-text">
                <XCircle className="size-3.5" aria-hidden="true" />
                {couponError}
              </p>
            )}
          </div>

          <PriceSummary
            subscriptionPlan={selectedPlan}
            billingPeriod={billingPeriod}
            skipTrial={skipTrial}
            coupon={validatedCoupon}
            className="mt-0 h-full"
          />
        </div>

        <div className="flex justify-between gap-3">
          <button type="button" onClick={onBack} className={clasesBoton({ variante: 'secundario', tamano: 'lg' })}>
            {tc('back')}
          </button>
          <button type="submit" disabled={loading} className={clasesBoton({ tamano: 'lg' })}>
            {loading ? tc('loading') : tc('continue')}
          </button>
        </div>
      </form>
    </div>
  );
}
