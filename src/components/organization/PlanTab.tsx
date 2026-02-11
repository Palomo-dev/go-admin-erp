'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { CheckIcon, XMarkIcon, CreditCardIcon, CalendarIcon, DocumentTextIcon, NoSymbolIcon, ArrowPathIcon, CogIcon } from '@heroicons/react/24/outline';
import { 
  ShoppingCart, 
  Package, 
  Palette, 
  MapPin, 
  Users, 
  UserCheck, 
  Building2, 
  BarChart3, 
  Bell, 
  Zap, 
  Truck, 
  Calendar, 
  Activity,
  Shield,
  CreditCard as CreditCardLucide,
  MessageSquare,
  Banknote,
  Dumbbell,
  BedDouble,
  ParkingCircle,
  Briefcase,
  type LucideIcon
} from 'lucide-react';
import { StarIcon, ArrowUpIcon } from '@heroicons/react/24/solid';
import ChangePlanModal from './ChangePlanModal';
import { PlanSkeleton } from './OrganizationSkeletons';
import CancelSubscriptionModal from '@/components/subscription/CancelSubscriptionModal';
import PaymentMethodCard from './PaymentMethodCard';

// Mapa de iconos para módulos (igual que en modulos/page.tsx)
const moduleIcons: Record<string, LucideIcon> = {
  'organizations': Building2,
  'branding': Palette,
  'branches': MapPin,
  'clientes': Users,
  'subscriptions': CreditCardLucide,
  'roles': Shield,
  'pos': ShoppingCart,
  'pos_retail': ShoppingCart,
  'pos_restaurant': ShoppingCart,
  'pos_gym': ShoppingCart,
  'inventory': Package,
  'pms_hotel': BedDouble,
  'parking': ParkingCircle,
  'crm': UserCheck,
  'hrm': Briefcase,
  'finance': Banknote,
  'reports': BarChart3,
  'notifications': Bell,
  'integrations': Zap,
  'transport': Truck,
  'calendar': Calendar,
  'operations': Activity,
  'chat': MessageSquare,
  'gym': Dumbbell
};

// Función para obtener el icono de un módulo
const getModuleIcon = (code: string): LucideIcon => {
  return moduleIcons[code] || Building2;
};

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
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  cancel_at_period_end?: boolean;
  canceled_at?: string;
  billing_period?: 'monthly' | 'yearly';
  metadata?: {
    custom_config?: {
      // Soportar ambos formatos: camelCase (signup) y snake_case (API)
      modules_count?: number;
      modulesCount?: number;
      total_available_modules?: number;
      branches_count?: number;
      branchesCount?: number;
      users_count?: number;
      usersCount?: number;
      ai_credits?: number;
      aiCredits?: number;
      selected_modules?: string[];
      selectedModules?: string[];
      billing_period?: string;
      core_modules_count?: number;
      max_modules_limit?: number;
    };
    is_enterprise_custom?: boolean;
  };
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
  const [branchCount, setBranchCount] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [aiCredits, setAiCredits] = useState<{ remaining: number; monthly: number } | null>(null);
  
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

      // Usar la función RPC get_current_plan para obtener el plan actual (mismo método que usa el módulo de módulos)
      const { data: planData, error: planError } = await supabase
        .rpc('get_current_plan', { org_id: orgId });

      // También obtener los datos de Stripe de la tabla subscriptions
      const { data: stripeData, error: stripeError } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id, stripe_customer_id, cancel_at_period_end, canceled_at, metadata, billing_period')
        .eq('organization_id', orgId)
        .single();


      if (planError) {
        console.error('Error loading plan via RPC:', planError);
      } else if (planData && planData.length > 0) {
        const currentPlanData = planData[0];
        // Construir objeto de suscripción compatible con la interfaz existente
        const subscriptionData: Subscription = {
          id: currentPlanData.subscription_id ? 1 : 0, // ID temporal si no hay suscripción real
          organization_id: orgId,
          plan_id: currentPlanData.plan_id,
          status: currentPlanData.subscription_status || 'active',
          current_period_start: currentPlanData.current_period_start || new Date().toISOString(),
          current_period_end: currentPlanData.current_period_end || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          trial_start: currentPlanData.trial_start,
          trial_end: currentPlanData.trial_end,
          amount: parseFloat(currentPlanData.price_usd_month) || 0,
          created_at: new Date().toISOString(),
          stripe_subscription_id: stripeData?.stripe_subscription_id || undefined,
          stripe_customer_id: stripeData?.stripe_customer_id || undefined,
          cancel_at_period_end: stripeData?.cancel_at_period_end || false,
          canceled_at: stripeData?.canceled_at || undefined,
          billing_period: stripeData?.billing_period || stripeData?.metadata?.custom_config?.billing_period || 'monthly',
          metadata: stripeData?.metadata || undefined,
          plans: {
            id: currentPlanData.plan_id,
            code: currentPlanData.plan_code,
            name: currentPlanData.plan_name,
            price_usd_month: parseFloat(currentPlanData.price_usd_month) || 0,
            price_usd_year: parseFloat(currentPlanData.price_usd_year) || 0,
            trial_days: currentPlanData.trial_days || 0,
            max_modules: currentPlanData.max_modules || 0,
            max_branches: currentPlanData.max_branches || 0,
            features: currentPlanData.features || {},
            is_active: true
          }
        };
        
        // Siempre mostrar la suscripción si get_current_plan devuelve datos
        // La función RPC siempre devuelve un plan (free por defecto si no hay suscripción)
        setSubscription(subscriptionData);
      }

      // Obtener todos los planes disponibles
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .eq('is_active', true)
        .order('price_usd_month', { ascending: true });

      if (plansError) throw plansError;
      // Parsear los precios a números (vienen como strings de la DB)
      const parsedPlans = (plansData || []).map((plan: any) => ({
        ...plan,
        price_usd_month: parseFloat(plan.price_usd_month) || 0,
        price_usd_year: parseFloat(plan.price_usd_year) || 0
      }));
      setAvailablePlans(parsedPlans);

      // Obtener módulos de la organización con left join para evitar errores
      const { data: orgModulesData, error: orgModulesError } = await supabase
        .from('organization_modules')
        .select(`
          *,
          modules(*)
        `)
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (orgModulesError) {
        console.error('Error loading organization modules:', orgModulesError);
      }
      
      // Filtrar solo los que tienen datos de módulo válidos
      const validModules = (orgModulesData || []).filter((om: any) => om.modules !== null);
      setOrganizationModules(validModules);

      // Obtener todos los módulos para comparar
      const { data: allModulesData, error: allModulesError } = await supabase
        .from('modules')
        .select('*')
        .eq('is_active', true)
        .order('rank', { ascending: true });

      if (allModulesError) throw allModulesError;
      setAllModules(allModulesData || []);

      // Obtener conteo de sucursales activas
      const { data: branchData, error: branchError } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId)
        .eq('is_active', true);

      if (branchError) {
        console.error('Error loading branches:', branchError);
      } else {
        setBranchCount(branchData?.length || 0);
      }

      // Obtener créditos de IA
      const { data: aiSettingsData, error: aiSettingsError } = await supabase
        .from('ai_settings')
        .select('credits_remaining')
        .eq('organization_id', orgId)
        .single();

      // Obtener créditos mensuales: primero de metadata (Enterprise), luego de plan
      const currentPlanId = planData?.[0]?.plan_id;
      const planFromList = (plansData || []).find((p: any) => p.id === currentPlanId);
      const customConfig = stripeData?.metadata?.custom_config;
      
      // Prioridad: 1) metadata.custom_config.ai_credits 2) plan.ai_credits_monthly 3) features.ai_credits_month
      const aiCreditsFromMetadata = customConfig?.ai_credits || customConfig?.aiCredits;
      const planMonthlyCredits = aiCreditsFromMetadata ?? 
                                 planFromList?.ai_credits_monthly ?? 
                                 planData?.[0]?.features?.ai_credits_month ?? 
                                 10000; // Default

      if (!aiSettingsError && aiSettingsData) {
        setAiCredits({
          remaining: aiSettingsData.credits_remaining || 0,
          monthly: planMonthlyCredits
        });
      } else {
        setAiCredits({
          remaining: planMonthlyCredits,
          monthly: planMonthlyCredits
        });
      }

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

  const handleCanceled = () => {
    setShowCancelModal(false);
    loadPlanData();
  };

  const handleReactivate = async () => {
    try {
      setReactivating(true);
      setError(null);

      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          action: 'reactivate'
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al reactivar la suscripción');
      }

      alert('Suscripción reactivada exitosamente');
      loadPlanData();
    } catch (err: any) {
      console.error('Error reactivating subscription:', err);
      setError(err.message);
    } finally {
      setReactivating(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      const response = await fetch('/api/subscriptions/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const data = await response.json();
      
      if (data.success && data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || 'Error abriendo portal de facturación');
      }
    } catch (err: any) {
      console.error('Error opening billing portal:', err);
      setError(err.message);
    }
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
    return <PlanSkeleton />;
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

  const currentPlan = subscription?.plans || availablePlans.find(p => p.code === 'pro');
  const activeModules = organizationModules.filter(om => om.is_active);
  // Módulos core (siempre 6)
  const coreModulesCount = allModules.filter(m => m.is_core).length || 6;
  // Módulos activos que NO son core (estos sí cuentan para los límites del plan)
  const activePaidModules = organizationModules.filter(om => om.is_active && !om.modules?.is_core);
  // Total de módulos activos incluyendo core
  const totalActiveModules = coreModulesCount + activePaidModules.length;
  const availableModules = allModules.filter(m => 
    !m.is_core && !organizationModules.some(om => om.module_code === m.code)
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
                    {(() => {
                      // Usar billing_period de la suscripción
                      const isYearly = subscription.billing_period === 'yearly';
                      
                      // Para Enterprise, calcular precio desde metadata
                      let currentAmount = isYearly ? currentPlan?.price_usd_year : currentPlan?.price_usd_month;
                      
                      if (currentPlan?.code === 'enterprise' && subscription.metadata?.custom_config) {
                        const cfg = subscription.metadata.custom_config;
                        // Precio base Enterprise: calculado desde config
                        // Soportar tanto camelCase (signup) como snake_case (API)
                        const basePrice = 199;
                        const modulesCount = cfg.modulesCount || cfg.modules_count || 6;
                        const branchesCount = cfg.branchesCount || cfg.branches_count || 5;
                        const usersCount = cfg.usersCount || cfg.users_count || 10;
                        const aiCredits = cfg.aiCredits || cfg.ai_credits || 0;
                        
                        const modulesPrice = Math.max(0, modulesCount - 6) * 49;
                        const branchesPrice = branchesCount * 59;
                        const usersPrice = usersCount * 19;
                        const aiCreditsPrice = aiCredits * 0.01;
                        const monthlyTotal = basePrice + modulesPrice + branchesPrice + usersPrice + aiCreditsPrice;
                        currentAmount = isYearly ? monthlyTotal * 10 : monthlyTotal;
                      }
                      
                      return (
                        <>
                          <p className="text-sm text-gray-500">
                            {formatPrice(currentAmount || 0)} / {isYearly ? 'año' : 'mes'}
                          </p>
                          {isYearly && (currentAmount ?? 0) > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Ahorras 2 meses al año
                            </span>
                          )}
                        </>
                      );
                    })()} 
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
                {currentPlan?.code !== 'free' && (() => {
                  // Determinar ciclo actual basado en fechas
                  const periodStart = new Date(subscription.current_period_start);
                  const periodEnd = new Date(subscription.current_period_end);
                  const diffMonths = (periodEnd.getFullYear() - periodStart.getFullYear()) * 12 + 
                    (periodEnd.getMonth() - periodStart.getMonth());
                  const isCurrentlyYearly = diffMonths >= 11;
                  
                  return (
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">Ciclo de facturación:</span>
                      <div className="flex rounded-md shadow-sm">
                        <button
                          onClick={() => handleBillingCycleChange('monthly')}
                          disabled={changingBilling || !isCurrentlyYearly}
                          className={`px-3 py-1 text-xs font-medium rounded-l-md border ${
                            !isCurrentlyYearly
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {changingBilling ? 'Cambiando...' : 'Mensual'}
                        </button>
                        <button
                          onClick={() => handleBillingCycleChange('yearly')}
                          disabled={changingBilling || isCurrentlyYearly}
                          className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-r border-b ${
                            isCurrentlyYearly
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {changingBilling ? 'Cambiando...' : 'Anual'}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Botones adicionales de gestión */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                    {subscription?.stripe_customer_id && (
                      <button
                        onClick={handleOpenBillingPortal}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <DocumentTextIcon className="w-4 h-4 mr-1" />
                        Portal de Facturación
                      </button>
                    )}
                    {subscription?.cancel_at_period_end ? (
                      <button
                        onClick={handleReactivate}
                        disabled={reactivating}
                        className="inline-flex items-center px-3 py-1.5 border border-green-300 text-xs font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50"
                      >
                        <ArrowPathIcon className="w-4 h-4 mr-1" />
                        {reactivating ? 'Reactivando...' : 'Reactivar Suscripción'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowCancelModal(true)}
                        className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                      >
                        <NoSymbolIcon className="w-4 h-4 mr-1" />
                        Cancelar Suscripción
                      </button>
                    )}
                </div>

                {/* Aviso de cancelación pendiente */}
                {subscription?.cancel_at_period_end && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm text-yellow-800">
                      ⚠️ Tu suscripción se cancelará al final del período actual. 
                      Puedes reactivarla antes de esa fecha.
                    </p>
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
            {(() => {
              // Obtener límites desde metadata.custom_config (Enterprise) o plan
              const customConfig = subscription?.metadata?.custom_config;
              const maxModules = customConfig?.total_available_modules || customConfig?.modules_count || currentPlan.max_modules || null;
              const maxBranches = customConfig?.branches_count || customConfig?.branchesCount || currentPlan.max_branches || null;
              const maxStorage = currentPlan.features?.storage_gb || null;
              const aiCreditsLimit = aiCredits?.monthly || 0;
              const aiCreditsUsed = aiCreditsLimit - (aiCredits?.remaining || 0);
              
              // Calcular porcentajes
              const modulesPercent = maxModules ? Math.min((totalActiveModules / maxModules) * 100, 100) : 0;
              const branchesPercent = maxBranches ? Math.min((branchCount / maxBranches) * 100, 100) : 0;
              const aiCreditsPercent = aiCreditsLimit ? Math.min((aiCreditsUsed / aiCreditsLimit) * 100, 100) : 0;
              
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {/* Módulos */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {totalActiveModules}
                      <span className="text-sm text-gray-500">
                        /{maxModules || '∞'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Módulos activos</p>
                    <p className="text-xs text-gray-400 mt-1">
                      ({coreModulesCount} core + {activePaidModules.length} adicionales)
                    </p>
                    {maxModules && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${modulesPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Sucursales */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {branchCount}
                      <span className="text-sm text-gray-500">
                        /{maxBranches || '∞'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Sucursales</p>
                    {maxBranches && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${branchesPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Almacenamiento */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {maxStorage ? `${maxStorage} GB` : '∞'}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Almacenamiento</p>
                  </div>
                  
                  {/* Créditos IA */}
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">
                      {aiCreditsUsed.toLocaleString()}
                      <span className="text-sm text-gray-500">
                        /{aiCreditsLimit.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Créditos IA</p>
                    <p className="text-xs text-gray-400 mt-1">
                      ({(aiCredits?.remaining || 0).toLocaleString()} disponibles)
                    </p>
                    {aiCreditsLimit > 0 && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-amber-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${aiCreditsPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Método de Pago */}
      {subscription && (
        <PaymentMethodCard 
          stripeCustomerId={subscription.stripe_customer_id || null}
          organizationId={orgId}
          onPaymentMethodUpdated={loadPlanData}
        />
      )}

      {/* Módulos Activos */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Módulos Activos</h3>
          <p className="text-sm text-gray-500">
            Módulos disponibles en tu plan actual ({coreModulesCount} core + {activePaidModules.length} adicionales)
          </p>
        </div>
        <div className="p-6">
          {/* Módulos Core - Siempre activos */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
              <StarIcon className="w-4 h-4 text-yellow-500 mr-2" />
              Módulos Core (incluidos en tu plan)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allModules.filter(m => m.is_core).map((module) => (
                <div key={module.code} className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {(() => {
                          const Icon = getModuleIcon(module.code);
                          return <Icon className="w-6 h-6 text-blue-600" />;
                        })()}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {module.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {module.description}
                        </p>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2">
                          Core
                        </span>
                      </div>
                    </div>
                    <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Módulos Adicionales Activos */}
          {activePaidModules.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                <ArrowUpIcon className="w-4 h-4 text-green-500 mr-2" />
                Módulos Adicionales Activos
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activePaidModules.map((orgModule) => (
                  <div key={orgModule.id} className="border border-green-200 bg-green-50 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          {(() => {
                            const Icon = getModuleIcon(orgModule.module_code);
                            return <Icon className="w-6 h-6 text-green-600" />;
                          })()}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">
                            {orgModule.modules?.name || 'Módulo sin nombre'}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {orgModule.modules?.description || 'Sin descripción'}
                          </p>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2">
                            Activo
                          </span>
                        </div>
                      </div>
                      <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
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
                        {(() => {
                          const Icon = getModuleIcon(module.code);
                          return <Icon className="w-6 h-6 text-gray-400" />;
                        })()}
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

      {/* Modal de cancelación de suscripción */}
      {showCancelModal && subscription && (
        <CancelSubscriptionModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          organizationId={orgId}
          organizationName={organizationName}
          currentPeriodEnd={subscription.current_period_end}
          onCanceled={handleCanceled}
        />
      )}
    </div>
  );
}
