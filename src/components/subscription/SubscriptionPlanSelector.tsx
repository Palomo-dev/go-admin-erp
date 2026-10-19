'use client';

import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';
import { supabase } from '@/lib/supabase/config';
import { formatMoneda } from '@/lib/utils/moneda';
import { MONEDA_PLAN_SAAS } from '@/lib/organizacion/plan';
import { cn } from '@/utils/Utils';

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
  /**
   * En el alta el paso mide 1000 px: los tres planes van en columnas.
   * En un diálogo angosto se dejan en una sola columna.
   */
  enColumnas?: boolean;
}

export default function SubscriptionPlanSelector({
  selectedPlan,
  onSelectPlan,
  billingPeriod = 'monthly',
  onChangeBillingPeriod,
  plans,
  enColumnas = false,
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
          transformedPlans.push(yearlyPlan);
        });

        setDbPlans(transformedPlans);
      } catch (error) {
        console.error('Error loading plans:', error);
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
  const filteredPlans = availablePlans.filter(plan => plan.billingPeriod === billingPeriod);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="size-8 animate-spin rounded-full border-b-2 border-brand" />
        <span className="ml-2 text-sm text-fg-secondary">Cargando planes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* Billing period toggle */}
      {onChangeBillingPeriod && (
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-lg bg-subtle p-1" role="group" aria-label="Periodo de facturación">
            <button
              type="button"
              onClick={() => onChangeBillingPeriod('monthly')}
              aria-pressed={billingPeriod === 'monthly'}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm',
                billingPeriod === 'monthly' ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
              )}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => onChangeBillingPeriod('yearly')}
              aria-pressed={billingPeriod === 'yearly'}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm',
                billingPeriod === 'yearly' ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg',
              )}
            >
              Anual <span className="text-[10px] text-success-text sm:text-xs">-20%</span>
            </button>
          </div>
        </div>
      )}

      {/* Plan cards */}
      <div className={cn('grid grid-cols-1 gap-3', enColumnas && 'lg:grid-cols-3')}>
        {filteredPlans.map((plan) => {
          const elegido = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlan(plan.id)}
              aria-pressed={elegido}
              className={cn(
                'flex h-full w-full flex-col rounded-xl border p-4 text-left transition-colors',
                !enColumnas && 'sm:flex-row sm:items-center sm:gap-4',
                elegido ? 'border-brand bg-brand-tint ring-1 ring-brand' : 'border-line bg-canvas hover:border-line-strong',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-fg">{plan.name}</h3>
                  {plan.isPopular && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-medium text-fg-on-brand">Popular</span>
                  )}
                </div>
                <p className="mt-1 text-xl font-semibold tracking-tight text-fg">
                  {plan.price ? formatMoneda(plan.price, MONEDA_PLAN_SAAS) : 'Personalizado'}
                  <span className="ml-1 text-sm font-medium text-fg-muted">{billingPeriod === 'monthly' ? '/mes' : '/año'}</span>
                </p>
                <p className="mt-1 text-sm text-fg-secondary">{plan.description}</p>
                {plan.trialDays ? (
                  <p className="mt-2 text-xs font-medium text-brand-deep">Incluye {plan.trialDays} días de prueba</p>
                ) : null}
                <ul className={cn('mt-3 flex gap-1.5', enColumnas ? 'flex-col' : 'flex-wrap gap-x-3')}>
                  {plan.features.slice(0, 4).map((feature, index) => (
                    <li key={index} className="inline-flex items-start gap-1 text-xs text-fg-secondary">
                      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <span
                className={cn(
                  'mt-4 inline-flex shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold',
                  enColumnas ? 'w-full' : 'w-full sm:mt-0 sm:w-auto',
                  elegido ? 'bg-brand-action text-fg-on-brand' : 'bg-surface text-brand-deep ring-1 ring-inset ring-line-brand',
                )}
              >
                {elegido ? '✓ Seleccionado' : 'Seleccionar'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Default plans (fallback si no se cargan de BD)
const defaultPlans: SubscriptionPlan[] = [
  {
    id: 'pro',
    name: 'Plan Pro',
    description: 'Para emprendedores y pequeños negocios',
    price: 20,
    billingPeriod: 'monthly',
    features: [
      '3 usuarios',
      '1 sucursal',
      '8 módulos',
      '500 créditos IA',
      'Soporte por email',
    ],
    trialDays: 15,
  },
  {
    id: 'business',
    name: 'Plan Business',
    description: 'Para negocios en crecimiento con múltiples sucursales',
    price: 49,
    billingPeriod: 'monthly',
    features: [
      '10 usuarios',
      '5 sucursales',
      '13 módulos',
      '2000 créditos IA',
      'Soporte prioritario',
    ],
    isPopular: true,
    trialDays: 30,
  },
  {
    id: 'ultimate',
    name: 'Plan Ultimate',
    description: 'Para grandes empresas con todas las funcionalidades',
    price: 199,
    billingPeriod: 'monthly',
    features: [
      '30 usuarios',
      '15 sucursales',
      'Todos los módulos',
      '10000 créditos IA',
      'Soporte 24/7',
    ],
    trialDays: 30,
  },
  // Yearly plans
  {
    id: 'pro-yearly',
    name: 'Plan Pro (Anual)',
    description: 'Para emprendedores y pequeños negocios',
    price: 199,
    billingPeriod: 'yearly',
    features: [
      '3 usuarios',
      '1 sucursal',
      '8 módulos',
      '500 créditos IA',
      'Soporte por email',
      'Descuento anual',
    ],
    trialDays: 15,
  },
  {
    id: 'business-yearly',
    name: 'Plan Business (Anual)',
    description: 'Para negocios en crecimiento con múltiples sucursales',
    price: 490,
    billingPeriod: 'yearly',
    features: [
      '10 usuarios',
      '5 sucursales',
      '13 módulos',
      '2000 créditos IA',
      'Soporte prioritario',
      'Descuento anual',
    ],
    isPopular: true,
    trialDays: 30,
  },
  {
    id: 'ultimate-yearly',
    name: 'Plan Ultimate (Anual)',
    description: 'Para grandes empresas con todas las funcionalidades',
    price: 1990,
    billingPeriod: 'yearly',
    features: [
      '30 usuarios',
      '15 sucursales',
      'Todos los módulos',
      '10000 créditos IA',
      'Soporte 24/7',
      'Descuento anual',
    ],
    trialDays: 30,
  },
];

// Helper functions
function getDescriptionForPlan(planCode: string): string {
  const descriptions: Record<string, string> = {
    pro: 'Para emprendedores y pequeños negocios',
    business: 'Para negocios en crecimiento con múltiples sucursales',
    ultimate: 'Para grandes empresas con todas las funcionalidades'
  };
  return descriptions[planCode] || 'Plan personalizado para tu negocio';
}

function getFeaturesForPlan(plan: {
  max_modules?: number | null;
  max_branches?: number | null;
  trial_days?: number | null;
  features?: {
    storage_gb?: number | null;
    analytics?: boolean | null;
    custom_reports?: boolean | null;
    support?: string | null;
    dedicated_manager?: boolean | null;
  } | null;
}): string[] {
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
  
  const diasPrueba = plan.trial_days ?? 0;
  if (diasPrueba > 0) {
    features.push(`${diasPrueba} días de prueba gratis`);
  }
  
  return features;
}
