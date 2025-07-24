'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { CheckIcon, XMarkIcon, CreditCardIcon, CalendarIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import { StarIcon, ArrowUpIcon } from '@heroicons/react/24/solid';
import ChangePlanModal from './ChangePlanModal';

interface Plan {
  id: number;
  code: string;
  name: string;
  price_usd_month: number;
  price_usd_year: number;
  trial_days: number;
  max_modules: number;
  max_branches: number;
  features: {
    support: string;
    analytics: boolean;
    storage_gb: number;
    custom_reports: boolean;
    dedicated_manager?: boolean;
  };
  is_active: boolean;
}

interface Subscription {
  id: number;
  organization_id: number;
  plan_id: number;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_start?: string;
  trial_end?: string;
  amount: number;
  created_at: string;
  plans: Plan;
}

interface OrganizationModule {
  id: number;
  organization_id: number;
  module_code: string;
  is_active: boolean;
  enabled_at: string;
  modules: {
    code: string;
    name: string;
    description: string;
    icon: string;
    is_core: boolean;
  };
}

interface PlanTabProps {
  orgId: number;
}

export default function PlanTab({ orgId }: PlanTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [organizationModules, setOrganizationModules] = useState<OrganizationModule[]>([]);
  const [allModules, setAllModules] = useState<any[]>([]);
  const [showChangePlanModal, setShowChangePlanModal] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [changingBilling, setChangingBilling] = useState(false);
  const [showPlanComparison, setShowPlanComparison] = useState(false);

  useEffect(() => {
    if (orgId) {
      loadPlanData();
    }
  }, [orgId]);

  const loadPlanData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Obtener información de la organización
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      if (orgError) throw orgError;
      setOrganizationName(orgData.name);

      // Obtener suscripción actual
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plans!inner(*)
        `)
        .eq('organization_id', orgId)
        .eq('status', 'active')
        .single();

      if (subError && subError.code !== 'PGRST116') {
        console.error('Error loading subscription:', subError);
      } else if (subData) {
        setSubscription(subData);
      }

      // Obtener todos los planes disponibles
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price_usd_month', { ascending: true });

      if (plansError) throw plansError;
      setAvailablePlans(plansData || []);

      // Obtener módulos de la organización
      const { data: orgModulesData, error: orgModulesError } = await supabase
        .from('organization_modules')
        .select(`
          *,
          modules!inner(*)
        `)
        .eq('organization_id', orgId);

      if (orgModulesError) throw orgModulesError;
      setOrganizationModules(orgModulesData || []);

      // Obtener todos los módulos para comparar
      const { data: allModulesData, error: allModulesError } = await supabase
        .from('modules')
        .select('*')
        .eq('is_active', true)
        .order('rank', { ascending: true });

      if (allModulesError) throw allModulesError;
      setAllModules(allModulesData || []);

    } catch (err: any) {
      console.error('Error loading plan data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChanged = () => {
    setShowChangePlanModal(false);
    loadPlanData();
  };

  const handleBillingCycleChange = async (newBillingPeriod: 'monthly' | 'yearly') => {
    try {
      setChangingBilling(true);
      setError(null);

      const response = await fetch('/api/subscriptions/change-billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId: orgId,
          billingPeriod: newBillingPeriod,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al cambiar el ciclo de facturación');
      }

      // Mostrar mensaje de éxito
      alert(result.message);
      
      // Recargar datos
      loadPlanData();

    } catch (err: any) {
      console.error('Error changing billing cycle:', err);
      setError(err.message);
    } finally {
      setChangingBilling(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const isTrialActive = (sub: Subscription) => {
    if (!sub.trial_end) return false;
    return new Date(sub.trial_end) > new Date();
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Cargando información del plan...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <XMarkIcon className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plans || availablePlans.find(p => p.code === 'free');
  const activeModules = organizationModules.filter(om => om.is_active);
  const availableModules = allModules.filter(m => 
    !organizationModules.some(om => om.module_code === m.code)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Mi Plan</h2>
          <p className="text-sm text-gray-500">
            Gestiona tu suscripción y módulos activos
          </p>
        </div>

        {/* Plan Actual */}
        <div className="p-6">
          {subscription ? (
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <StarIcon className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {currentPlan?.name}
                  </h3>
                  <div className="flex items-center space-x-2 mt-1">
                    <p className="text-sm text-gray-500">
                      {formatPrice(subscription.amount)} / {subscription.amount === currentPlan?.price_usd_month ? 'mes' : 'año'}
                    </p>
                    {subscription.amount === currentPlan?.price_usd_year && currentPlan?.price_usd_month && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Ahorras {formatPrice((currentPlan.price_usd_month * 12) - currentPlan.price_usd_year)} al año
                      </span>
                    )}
                  </div>
                  
                  {/* Estado de la suscripción */}
                  <div className="mt-3 flex items-center space-x-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      subscription.status === 'active' 
                        ? 'bg-green-100 text-green-800'
                        : subscription.status === 'trialing'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {subscription.status === 'active' && 'Activa'}
                      {subscription.status === 'trialing' && 'Período de prueba'}
                      {subscription.status === 'canceled' && 'Cancelada'}
                      {subscription.status === 'past_due' && 'Pago pendiente'}
                    </span>

                    {isTrialActive(subscription) && (
                      <span className="text-sm text-yellow-600">
                        {getDaysRemaining(subscription.trial_end!)} días de prueba restantes
                      </span>
                    )}
                  </div>

                  {/* Fechas */}
                  <div className="mt-3 text-sm text-gray-500 space-y-1">
                    <div className="flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      Período actual: {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col space-y-3">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowChangePlanModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <ArrowUpIcon className="w-4 h-4 mr-2" />
                    Cambiar Plan
                  </button>
                  <button
                    onClick={() => setShowPlanComparison(!showPlanComparison)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Comparar Planes
                  </button>
                </div>
                
                {/* Botones de ciclo de facturación */}
                {currentPlan?.code !== 'free' && (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500">Ciclo de facturación:</span>
                    <div className="flex rounded-md shadow-sm">
                      <button
                        onClick={() => handleBillingCycleChange('monthly')}
                        disabled={changingBilling || subscription.amount === currentPlan?.price_usd_month}
                        className={`px-3 py-1 text-xs font-medium rounded-l-md border ${
                          subscription.amount === currentPlan?.price_usd_month
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {changingBilling ? 'Cambiando...' : 'Mensual'}
                      </button>
                      <button
                        onClick={() => handleBillingCycleChange('yearly')}
                        disabled={changingBilling || subscription.amount === currentPlan?.price_usd_year}
                        className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-r border-b ${
                          subscription.amount === currentPlan?.price_usd_year
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {changingBilling ? 'Cambiando...' : 'Anual'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Sin suscripción activa</h3>
              <p className="mt-1 text-sm text-gray-500">
                Actualmente estás usando el plan gratuito
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setShowChangePlanModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Seleccionar Plan
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Límites del Plan */}
      {currentPlan && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Límites del Plan</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {activeModules.length}
                  <span className="text-sm text-gray-500">
                    /{currentPlan.max_modules || '∞'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Módulos activos</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  1
                  <span className="text-sm text-gray-500">
                    /{currentPlan.max_branches || '∞'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-1">Sucursales</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {currentPlan.features?.storage_gb || 0} GB
                </div>
                <p className="text-sm text-gray-500 mt-1">Almacenamiento</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Módulos Activos */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Módulos Activos</h3>
          <p className="text-sm text-gray-500">
            Módulos disponibles en tu plan actual
          </p>
        </div>
        <div className="p-6">
          {activeModules.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeModules.map((orgModule) => (
                <div key={orgModule.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {orgModule.modules?.name || 'Módulo sin nombre'}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {orgModule.modules?.description || 'Sin descripción'}
                        </p>
                        {orgModule.modules?.is_core && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2">
                            Módulo Core
                          </span>
                        )}
                      </div>
                    </div>
                    <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Sin módulos activos</h3>
              <p className="mt-1 text-sm text-gray-500">
                No tienes módulos activos en este momento
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Módulos Disponibles */}
      {availableModules.length > 0 && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Módulos Disponibles</h3>
            <p className="text-sm text-gray-500">
              Módulos que puedes activar con tu plan actual
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableModules.map((module) => (
                <div key={module.code} className="border border-gray-200 rounded-lg p-4 opacity-60">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        <BuildingOfficeIcon className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {module.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1">
                          {module.description}
                        </p>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 mt-2">
                          No disponible
                        </span>
                      </div>
                    </div>
                    <XMarkIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comparación de Planes */}
      {showPlanComparison && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Comparación de Planes</h3>
            <p className="text-sm text-gray-500">
              Compara las características de todos los planes disponibles
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {availablePlans.map((plan) => {
                const isCurrentPlan = plan.code === currentPlan?.code;
                const planPrice = plan.price_usd_month;
                const currentPrice = currentPlan?.price_usd_month || 0;
                const isUpgrade = planPrice > currentPrice;
                const isDowngrade = planPrice < currentPrice && planPrice > 0;
                
                return (
                  <div key={plan.id} className={`border rounded-lg p-6 relative ${
                    isCurrentPlan ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}>
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                          Plan Actual
                        </span>
                      </div>
                    )}
                    
                    <div className="text-center">
                      <h4 className="text-lg font-semibold text-gray-900">{plan.name}</h4>
                      <div className="mt-2">
                        <span className="text-3xl font-bold text-gray-900">
                          {formatPrice(plan.price_usd_month)}
                        </span>
                        <span className="text-gray-500">/mes</span>
                      </div>
                      {plan.price_usd_year && plan.price_usd_year !== plan.price_usd_month * 12 && (
                        <div className="mt-1">
                          <span className="text-lg font-semibold text-green-600">
                            {formatPrice(plan.price_usd_year)}
                          </span>
                          <span className="text-gray-500 text-sm">/año</span>
                          <div className="text-xs text-green-600">
                            Ahorra {formatPrice((plan.price_usd_month * 12) - plan.price_usd_year)}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-900 mb-2">Características:</h5>
                      <ul className="space-y-1 text-sm text-gray-600">
                        <li className="flex items-center">
                          <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                          {plan.max_modules || '∞'} módulos
                        </li>
                        <li className="flex items-center">
                          <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                          {plan.max_branches || '∞'} sucursales
                        </li>
                        {plan.features?.storage_gb && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            {plan.features.storage_gb} GB almacenamiento
                          </li>
                        )}
                        {plan.features?.analytics && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            Análisis avanzados
                          </li>
                        )}
                        {plan.features?.custom_reports && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            Reportes personalizados
                          </li>
                        )}
                        {plan.features?.support && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            {plan.features.support === 'community-only' && 'Soporte de comunidad'}
                            {plan.features.support === 'email' && 'Soporte por email'}
                            {plan.features.support === 'priority' && 'Soporte prioritario 24/7'}
                          </li>
                        )}
                        {plan.trial_days > 0 && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                            {plan.trial_days} días de prueba gratis
                          </li>
                        )}
                      </ul>
                    </div>
                    
                    <div className="mt-6">
                      {isCurrentPlan ? (
                        <div className="w-full text-center py-2 px-4 bg-blue-100 text-blue-800 rounded-md font-medium">
                          Plan Actual
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setShowPlanComparison(false);
                            setShowChangePlanModal(true);
                          }}
                          className={`w-full py-2 px-4 rounded-md font-medium ${
                            isUpgrade
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : isDowngrade
                              ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {isUpgrade && 'Upgrade'}
                          {isDowngrade && 'Downgrade'}
                          {!isUpgrade && !isDowngrade && 'Seleccionar'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de cambio de plan */}
      {showChangePlanModal && (
        <ChangePlanModal
          isOpen={showChangePlanModal}
          onClose={() => setShowChangePlanModal(false)}
          organizationId={orgId}
          organizationName={organizationName}
          currentPlanId={currentPlan?.code || 'free'}
          onPlanChanged={handlePlanChanged}
        />
      )}
    </div>
  );
}
