'use client';

import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';
import { supabase } from '@/lib/supabase/config';

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
  plans,
}: SubscriptionPlanSelectorProps) {
  const [dbPlans, setDbPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  // Load plans from database
  useEffect(() => {
    const loadPlans = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .eq('is_active', true)
          .order('price_usd_month', { ascending: true });

        if (error) throw error;

        // Transform database plans to component format
        const transformedPlans: SubscriptionPlan[] = [];
        
        data?.forEach(plan => {
          console.log('Processing database plan:', plan);
          
          // Monthly plan
          const monthlyPlan = {
            id: plan.code,
            name: plan.name,
            description: getDescriptionForPlan(plan.code),
            price: parseFloat(plan.price_usd_month),
            billingPeriod: 'monthly' as const,
            features: getFeaturesForPlan(plan),
            isPopular: plan.code === 'pro',
            trialDays: plan.trial_days,
          };
          console.log('Created monthly plan:', monthlyPlan);
          transformedPlans.push(monthlyPlan);

          // Always create yearly plan
          const yearlyPlan = {
            id: `${plan.code}-yearly`,
            name: `${plan.name} (Anual)`,
            description: getDescriptionForPlan(plan.code),
            price: parseFloat(plan.price_usd_year),
            billingPeriod: 'yearly' as const,
            features: [...getFeaturesForPlan(plan), 'Descuento anual'],
            isPopular: plan.code === 'pro',
            trialDays: plan.trial_days,
          };
          console.log('Created yearly plan:', yearlyPlan);
          transformedPlans.push(yearlyPlan);
        });

        console.log('All transformed plans:', transformedPlans);
        setDbPlans(transformedPlans);
      } catch (error) {
        console.error('Error loading plans:', error);
        console.log('Using default plans instead');
        setDbPlans(defaultPlans);
      } finally {
        setLoading(false);
      }
    };

    if (!plans) {
      loadPlans();
    } else {
      setDbPlans(plans);
      setLoading(false);
    }
  }, [plans]);

  // Use provided plans or loaded plans
  const availablePlans = plans || dbPlans;
  console.log('Available plans:', availablePlans);
  console.log('Billing period:', billingPeriod);
  
  // Filter plans by billing period
  const filteredPlans = availablePlans.filter(plan => plan.billingPeriod === billingPeriod);
  console.log('Filtered plans:', filteredPlans);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Cargando planes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* Billing period toggle */}
      {onChangeBillingPeriod && (
        <div className="flex justify-center">
          <div className="bg-gray-100 p-0.5 sm:p-1 rounded-lg inline-flex">
            <button
              type="button"
              onClick={() => onChangeBillingPeriod('monthly')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-md ${
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
              className={`px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-md ${
                billingPeriod === 'yearly'
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Anual <span className="text-green-500 text-[10px] sm:text-xs">-20%</span>
            </button>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {filteredPlans.map((plan) => (
          <div
            key={plan.id}
            onClick={() => onSelectPlan(plan.id)}
            className={`relative rounded-lg border ${
              selectedPlan === plan.id
                ? 'border-blue-500 ring-2 ring-blue-500'
                : 'border-gray-300'
            } bg-white p-3 sm:p-4 shadow-sm cursor-pointer hover:border-blue-400 transition-all`}
          >
            {plan.isPopular && (
              <div className="absolute top-0 right-0 -mt-2 -mr-2">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-blue-800">
                  Popular
                </span>
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                      ${plan.price}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-gray-500">
                      {billingPeriod === 'monthly' ? '/mes' : '/año'}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs sm:text-sm text-gray-500">{plan.description}</p>
                
                {plan.trialDays && (
                  <p className="mt-1 text-xs text-blue-600">
                    ✓ Incluye {plan.trialDays} días de prueba
                  </p>
                )}
                
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {plan.features.slice(0, 4).map((feature, index) => (
                    <span key={index} className="inline-flex items-center text-[10px] sm:text-xs text-gray-600">
                      <CheckIcon className="h-3 w-3 sm:h-4 sm:w-4 text-green-500 mr-1" aria-hidden="true" />
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
              
              <div className="sm:ml-4">
                <div
                  className={`rounded-md py-1.5 px-4 sm:py-2 sm:px-6 text-center text-xs sm:text-sm font-semibold whitespace-nowrap ${
                    selectedPlan === plan.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                  }`}
                >
                  {selectedPlan === plan.id ? '✓ Seleccionado' : 'Seleccionar'}
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

// Helper functions
function getDescriptionForPlan(planCode: string): string {
  const descriptions: Record<string, string> = {
    free: 'Para pequeños negocios que están comenzando',
    pro: 'Para negocios en crecimiento con necesidades avanzadas',
    enterprise: 'Para grandes empresas con requisitos personalizados'
  };
  return descriptions[planCode] || 'Plan personalizado para tu negocio';
}

function getFeaturesForPlan(plan: any): string[] {
  const features: string[] = [];
  
  // Add module and branch limits
  if (plan.max_modules) {
    features.push(`Hasta ${plan.max_modules} módulos`);
  } else {
    features.push('Módulos ilimitados');
  }
  
  if (plan.max_branches) {
    features.push(`Hasta ${plan.max_branches} sucursales`);
  } else {
    features.push('Sucursales ilimitadas');
  }
  
  // Add features from JSON
  if (plan.features) {
    if (plan.features.storage_gb) {
      features.push(`${plan.features.storage_gb} GB de almacenamiento`);
    }
    
    if (plan.features.analytics) {
      features.push('Análisis avanzados');
    }
    
    if (plan.features.custom_reports) {
      features.push('Reportes personalizados');
    }
    
    if (plan.features.support) {
      const supportTypes: Record<string, string> = {
        'community-only': 'Soporte de comunidad',
        'email': 'Soporte por email',
        'priority': 'Soporte prioritario 24/7'
      };
      features.push(supportTypes[plan.features.support] || 'Soporte incluido');
    }
    
    if (plan.features.dedicated_manager) {
      features.push('Gerente de cuenta dedicado');
    }
  }
  
  // Add trial info
  if (plan.trial_days > 0) {
    features.push(`${plan.trial_days} días de prueba gratis`);
  }
  
  return features;
}
