'use client';

import { useState } from 'react';
import SubscriptionPlanSelector from '../subscription/SubscriptionPlanSelector';

export interface SubscriptionData {
  subscriptionPlan: string;
  billingPeriod: 'monthly' | 'yearly';
}

interface SubscriptionStepProps {
  formData: {
    subscriptionPlan?: string;
    billingPeriod?: 'monthly' | 'yearly';
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
  const [selectedPlan, setSelectedPlan] = useState(formData.subscriptionPlan || 'free');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>(
    formData.billingPeriod || 'monthly'
  );

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext();
  };

  return (
    <div className="space-y-8 w-full max-w-6xl mx-auto px-4">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Selecciona un plan</h2>
        <p className="mt-2 text-base text-gray-500">
          Elige el plan que mejor se adapte a las necesidades de tu organización.
          <span className="block mt-1 text-sm">Todos los planes incluyen un periodo de prueba de 30 días.</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full">
        <SubscriptionPlanSelector
          selectedPlan={selectedPlan}
          onSelectPlan={handleSelectPlan}
          billingPeriod={billingPeriod}
          onChangeBillingPeriod={handleChangeBillingPeriod}
        />

        <div className="mt-10 flex justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-gray-300 bg-white py-2 px-6 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Atrás
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-6 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : 'Continuar'}
          </button>
        </div>
      </form>
    </div>
  );
}
