'use client';

import { useState } from 'react';
import SubscriptionPlanSelector from '../subscription/SubscriptionPlanSelector';
import { useTranslations } from 'next-intl';

export interface SubscriptionData {
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
  skipTrial: boolean;
}

interface SubscriptionStepProps {
  formData: {
    subscriptionPlan?: string;
    billingPeriod?: 'monthly' | 'yearly';
    skipTrial?: boolean;
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
          <span className="block mt-1 text-[11px] sm:text-xs">{t('trialPeriod')}</span>
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
                  {t('useTrialDescription')}
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
