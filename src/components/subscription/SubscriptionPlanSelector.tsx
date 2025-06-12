'use client';

import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingPeriod: 'monthly' | 'yearly';
  features: string[];
  isPopular?: boolean;
  trialDays?: number;
}

export interface SubscriptionPlanSelectorProps {
  selectedPlan: string;
  onSelectPlan: (planId: string) => void;
  plans?: SubscriptionPlan[];
  billingPeriod?: 'monthly' | 'yearly';
  onChangeBillingPeriod?: (period: 'monthly' | 'yearly') => void;
}

export default function SubscriptionPlanSelector({
  selectedPlan,
  onSelectPlan,
  billingPeriod = 'monthly',
  onChangeBillingPeriod,
  plans = defaultPlans,
}: SubscriptionPlanSelectorProps) {
  // Filter plans by billing period
  const filteredPlans = plans.filter(plan => plan.billingPeriod === billingPeriod);

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      {/* Billing period toggle */}
      {onChangeBillingPeriod && (
        <div className="flex justify-center">
          <div className="bg-gray-100 p-1 rounded-lg inline-flex">
            <button
              type="button"
              onClick={() => onChangeBillingPeriod('monthly')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                billingPeriod === 'monthly'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => onChangeBillingPeriod('yearly')}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                billingPeriod === 'yearly'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Anual <span className="text-green-500 text-xs">-20%</span>
            </button>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filteredPlans.map((plan) => (
          <div
            key={plan.id}
            onClick={() => onSelectPlan(plan.id)}
            className={`relative rounded-lg border ${
              selectedPlan === plan.id
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-gray-300'
            } bg-white p-6 shadow-sm cursor-pointer hover:border-blue-400 transition-all h-full`}
          >
            {plan.isPopular && (
              <div className="absolute top-0 right-0 -mt-3 -mr-3">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  Popular
                </span>
              </div>
            )}
            
            <div className="flex flex-col h-full">
              <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
              
              <div className="mt-4">
                <span className="text-3xl font-bold tracking-tight text-gray-900">
                  ${plan.price}
                </span>
                <span className="text-base font-medium text-gray-500">
                  {billingPeriod === 'monthly' ? '/mes' : '/año'}
                </span>
              </div>
              
              {plan.trialDays && (
                <p className="mt-2 text-sm text-blue-600">
                  Incluye {plan.trialDays} días de prueba
                </p>
              )}
              
              <ul className="mt-6 space-y-3 flex-grow">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <div className="flex-shrink-0">
                      <CheckIcon className="h-5 w-5 text-green-500" aria-hidden="true" />
                    </div>
                    <p className="ml-2 text-sm text-gray-500">{feature}</p>
                  </li>
                ))}
              </ul>
              
              <div className="mt-6">
                <div
                  className={`w-full rounded-md py-2 px-4 text-center text-sm font-semibold ${
                    selectedPlan === plan.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {selectedPlan === plan.id ? 'Plan seleccionado' : 'Seleccionar plan'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Default plans
const defaultPlans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Gratis',
    description: 'Para pequeños negocios que están comenzando',
    price: 0,
    billingPeriod: 'monthly',
    features: [
      '1 usuario',
      '1 sucursal',
      'Funciones básicas',
      'Soporte por email',
    ],
  },
  {
    id: 'basic',
    name: 'Básico',
    description: 'Para negocios en crecimiento',
    price: 29,
    billingPeriod: 'monthly',
    features: [
      '5 usuarios',
      '2 sucursales',
      'Todas las funciones básicas',
      'Reportes básicos',
      'Soporte prioritario',
    ],
    trialDays: 14,
  },
  {
    id: 'pro',
    name: 'Profesional',
    description: 'Para negocios establecidos',
    price: 79,
    billingPeriod: 'monthly',
    features: [
      'Usuarios ilimitados',
      'Sucursales ilimitadas',
      'Todas las funciones',
      'Reportes avanzados',
      'API access',
      'Soporte 24/7',
    ],
    isPopular: true,
    trialDays: 14,
  },
  // Yearly plans
  {
    id: 'free-yearly',
    name: 'Gratis',
    description: 'Para pequeños negocios que están comenzando',
    price: 0,
    billingPeriod: 'yearly',
    features: [
      '1 usuario',
      '1 sucursal',
      'Funciones básicas',
      'Soporte por email',
    ],
  },
  {
    id: 'basic-yearly',
    name: 'Básico',
    description: 'Para negocios en crecimiento',
    price: 279,
    billingPeriod: 'yearly',
    features: [
      '5 usuarios',
      '2 sucursales',
      'Todas las funciones básicas',
      'Reportes básicos',
      'Soporte prioritario',
    ],
    trialDays: 14,
  },
  {
    id: 'pro-yearly',
    name: 'Profesional',
    description: 'Para negocios establecidos',
    price: 759,
    billingPeriod: 'yearly',
    features: [
      'Usuarios ilimitados',
      'Sucursales ilimitadas',
      'Todas las funciones',
      'Reportes avanzados',
      'API access',
      'Soporte 24/7',
    ],
    isPopular: true,
    trialDays: 14,
  },
];
