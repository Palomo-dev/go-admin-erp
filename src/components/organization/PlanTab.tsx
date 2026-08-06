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
import BuyAiCreditsModal from './BuyAiCreditsModal';
import BuyUsersModal from './BuyUsersModal';
import BuyBranchesModal from './BuyBranchesModal';
import { PlanSkeleton } from './OrganizationSkeletons';
import CancelSubscriptionModal from '@/components/subscription/CancelSubscriptionModal';
import PaymentMethodCard from './PaymentMethodCard';
import { useTranslations } from 'next-intl';
import { EmailConfirmedGate } from '@/components/auth/EmailConfirmedGate';

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
  max_users: number | null;
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
  const t = useTranslations('org.planTab');
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
  const [memberCount, setMemberCount] = useState(0);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [aiCredits, setAiCredits] = useState<{ remaining: number; monthly: number; consumed: number; purchased: number } | null>(null);
  const [showBuyAiCreditsModal, setShowBuyAiCreditsModal] = useState(false);
  const [showBuyUsersModal, setShowBuyUsersModal] = useState(false);
  const [showBuyBranchesModal, setShowBuyBranchesModal] = useState(false);
  const [activeAddons, setActiveAddons] = useState<{ extraUsers: number; extraBranches: number }>({ extraUsers: 0, extraBranches: 0 });
  const [initialPaymentMethods, setInitialPaymentMethods] = useState<any[]>([]);
  
  useEffect(() => {
    if (orgId) {
      loadPlanData();
    }
  }, [orgId]);

  const loadPlanData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Consulta 1: Obtener información de la organización (necesaria primero)
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', orgId)
        .single();

      if (orgError) throw orgError;
      setOrganizationName(orgData.name);

      // Consultas paralelas: todos los datos independientes a la vez
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [
        plansRes, allModulesRes, orgModulesRes, planRes, stripeRes,
        branchRes, memberRes, aiSettingsRes, aiConsumedRes, addonsRes,
        paymentMethodsRes
      ] = await Promise.all([
        // Planes disponibles
        supabase.from('plans').select('*').eq('is_active', true).order('price_usd_month', { ascending: true }),
        // Todos los módulos
        supabase.from('modules').select('*').eq('is_active', true).order('rank', { ascending: true }),
        // Módulos de la organización
        supabase.from('organization_modules').select('*, modules(*)').eq('organization_id', orgId).eq('is_active', true),
        // Plan actual via RPC
        supabase.rpc('get_current_plan', { org_id: orgId }),
        // Datos de Stripe
        supabase.from('subscriptions').select('stripe_subscription_id, stripe_customer_id, cancel_at_period_end, canceled_at, metadata, billing_period').eq('organization_id', orgId).single(),
        // Conteo de sucursales (head=true para no traer datos, solo count)
        supabase.from('branches').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
        // Conteo de miembros
        supabase.from('organization_members').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
        // Créditos de IA
        supabase.from('ai_settings').select('credits_remaining, purchased_credits').eq('organization_id', orgId).single(),
        // Consumo de IA del mes
        supabase.rpc('get_ai_credits_consumed', { p_org_id: orgId, p_since: startOfMonth.toISOString() }),
        // Addons activos
        supabase.from('subscription_addons').select('addon_type, quantity').eq('organization_id', orgId).eq('status', 'active'),
        // Métodos de pago (Stripe API call en paralelo)
        fetch(`/api/subscriptions/payment-methods?organizationId=${orgId}`).then(r => r.json()).catch(() => ({ paymentMethods: [] })),
      ]);

      // Procesar métodos de pago precargados
      setInitialPaymentMethods(paymentMethodsRes?.paymentMethods || []);

      // Procesar planes
      if (plansRes.error) throw plansRes.error;
      const parsedPlans = (plansRes.data || []).map((plan: any) => ({
        ...plan,
        price_usd_month: parseFloat(plan.price_usd_month) || 0,
        price_usd_year: parseFloat(plan.price_usd_year) || 0
      }));
      setAvailablePlans(parsedPlans);

      // Procesar módulos
      if (allModulesRes.error) throw allModulesRes.error;
      setAllModules(allModulesRes.data || []);

      // Procesar módulos de la organización
      if (orgModulesRes.error) {
        console.error('Error loading organization modules:', orgModulesRes.error);
      }
      const validModules = (orgModulesRes.data || []).filter((om: any) => om.modules !== null);
      setOrganizationModules(validModules);

      // Procesar conteos
      if (branchRes.error) {
        console.error('Error loading branches:', branchRes.error);
      } else {
        setBranchCount(branchRes.count || 0);
      }

      if (memberRes.error) {
        console.error('Error loading members:', memberRes.error);
      } else {
        setMemberCount(memberRes.count || 0);
      }

      // Procesar addons
      const extraUsers = (addonsRes.data || [])
        .filter((a: any) => a.addon_type === 'extra_users')
        .reduce((sum: number, a: any) => sum + a.quantity, 0);
      const extraBranches = (addonsRes.data || [])
        .filter((a: any) => a.addon_type === 'extra_branches')
        .reduce((sum: number, a: any) => sum + a.quantity, 0);
      setActiveAddons({ extraUsers, extraBranches });

      // Procesar datos del plan
      const planData = planRes.data;
      const stripeData = stripeRes.data;

      if (planRes.error) {
        console.error('Error loading plan via RPC:', planRes.error);
      } else if (planData && planData.length > 0) {
        const currentPlanData = planData[0];
        const subscriptionData: Subscription = {
          id: currentPlanData.subscription_id ? 1 : 0,
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
            max_users: currentPlanData.max_users || null,
            features: currentPlanData.features || {},
            is_active: true
          }
        };
        setSubscription(subscriptionData);
      }

      // Procesar créditos de IA
      const totalConsumed = aiConsumedRes.data || 0;
      const currentPlanId = planData?.[0]?.plan_id;
      const planFromList = (plansRes.data || []).find((p: any) => p.id === currentPlanId);
      const customConfig = stripeData?.metadata?.custom_config;
      
      const aiCreditsFromMetadata = customConfig?.ai_credits || customConfig?.aiCredits;
      const planMonthlyCredits = aiCreditsFromMetadata ?? 
                                 planFromList?.ai_credits_monthly ?? 
                                 planData?.[0]?.features?.ai_credits_month ?? 
                                 10000;

      if (!aiSettingsRes.error && aiSettingsRes.data) {
        setAiCredits({
          remaining: aiSettingsRes.data.credits_remaining || 0,
          monthly: planMonthlyCredits,
          consumed: totalConsumed,
          purchased: aiSettingsRes.data.purchased_credits || 0
        });
      } else {
        setAiCredits({
          remaining: planMonthlyCredits,
          monthly: planMonthlyCredits,
          consumed: 0,
          purchased: 0
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
        throw new Error(result.error || t('errorReactivate'));
      }

      alert(t('reactivated'));
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
        throw new Error(data.error || t('errorBillingPortal'));
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

      // Obtener token de sesión para enviar en el header
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/subscriptions/change-billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentSession?.access_token ? { 'Authorization': `Bearer ${currentSession.access_token}` } : {}),
        },
        body: JSON.stringify({
          organizationId: orgId,
          billingPeriod: newBillingPeriod,
        }),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(t('errorServerResponse'));
      }

      if (!response.ok) {
        throw new Error(result?.error || t('errorChangeBilling'));
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
      <div className="bg-red-50 border border-red-200 rounded-md p-4 dark:bg-red-900/30 dark:border-red-700">
        <div className="flex">
          <XMarkIcon className="h-5 w-5 text-red-400 dark:text-red-500" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800 dark:text-red-100">{t('errorTitle')}</h3>
            <div className="mt-2 text-sm text-red-700 dark:text-red-200">
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg dark:bg-gray-800">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-50">{t('myPlan')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('manageSub')}
          </p>
        </div>

        {/* Plan Actual */}
        <div className="p-4 sm:p-6">
          {subscription ? (
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center dark:bg-blue-800/30">
                    <StarIcon className="w-6 h-6 text-blue-600 dark:text-blue-300" />
                  </div>
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50">
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
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {formatPrice(currentAmount || 0)} / {isYearly ? t('perYear') : t('perMonth')}
                          </p>
                          {isYearly && (currentAmount ?? 0) > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100">
                              {t('save2Months')}
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
                        ? 'bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-100'
                        : subscription.status === 'trialing'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-100'
                        : 'bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-100'
                    }`}>
                      {subscription.status === 'active' && t('statusActive')}
                      {subscription.status === 'trialing' && t('statusTrialing')}
                      {subscription.status === 'canceled' && t('statusCanceled')}
                      {subscription.status === 'past_due' && t('statusPastDue')}
                    </span>

                    {isTrialActive(subscription) && (
                      <span className="text-sm text-yellow-600 dark:text-yellow-300">
                        {t('trialDaysRemaining', { days: getDaysRemaining(subscription.trial_end!) })}
                      </span>
                    )}
                  </div>

                  {/* Fechas */}
                  <div className="mt-3 text-sm text-gray-500 space-y-1 dark:text-gray-400">
                    <div className="flex items-center">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {t('currentPeriod')} {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col space-y-3 min-w-0">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowChangePlanModal(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  >
                    <ArrowUpIcon className="w-4 h-4 mr-2" />
                    {t('changePlan')}
                  </button>
                  <button
                    onClick={() => setShowPlanComparison(!showPlanComparison)}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900 dark:focus:ring-blue-400"
                  >
                    {t('comparePlans')}
                  </button>
                </div>
                
                {/* Botones de ciclo de facturación */}
                {currentPlan?.code !== 'free' && (() => {
                  // Determinar ciclo actual basado en el campo billing_period
                  const isCurrentlyYearly = subscription.billing_period === 'yearly';
                  
                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{t('billingCycle')}</span>
                      <div className="flex rounded-md shadow-sm">
                        <button
                          onClick={() => handleBillingCycleChange('monthly')}
                          disabled={changingBilling || !isCurrentlyYearly}
                          className={`px-3 py-1 text-xs font-medium rounded-l-md border ${
                            !isCurrentlyYearly
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-900'
                          } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {changingBilling ? t('changing') : t('monthly')}
                        </button>
                        <button
                          onClick={() => handleBillingCycleChange('yearly')}
                          disabled={changingBilling || isCurrentlyYearly}
                          className={`px-3 py-1 text-xs font-medium rounded-r-md border-t border-r border-b ${
                            isCurrentlyYearly
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-900'
                          } ${changingBilling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {changingBilling ? t('changing') : t('yearly')}
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* Botones adicionales de gestión */}
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    {subscription?.stripe_customer_id && (
                      <EmailConfirmedGate>
                        <button
                          onClick={handleOpenBillingPortal}
                          className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-900"
                        >
                          <DocumentTextIcon className="w-4 h-4 mr-1" />
                          {t('billingPortal')}
                        </button>
                      </EmailConfirmedGate>
                    )}
                    {subscription?.status === 'canceled' ? (
                      <button
                        onClick={() => setShowChangePlanModal(true)}
                        className="inline-flex items-center px-3 py-1.5 border border-green-300 text-xs font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 dark:border-green-600 dark:text-green-200 dark:bg-green-900/30 dark:hover:bg-green-800/30"
                      >
                        <ArrowPathIcon className="w-4 h-4 mr-1" />
                        {t('renewPlan')}
                      </button>
                    ) : subscription?.cancel_at_period_end ? (
                      <button
                        onClick={handleReactivate}
                        disabled={reactivating}
                        className="inline-flex items-center px-3 py-1.5 border border-green-300 text-xs font-medium rounded-md text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-50 dark:border-green-600 dark:text-green-200 dark:bg-green-900/30 dark:hover:bg-green-800/30"
                      >
                        <ArrowPathIcon className="w-4 h-4 mr-1" />
                        {reactivating ? t('reactivating') : t('reactivateSub')}
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowCancelModal(true)}
                        className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100 dark:border-red-600 dark:text-red-200 dark:bg-red-900/30 dark:hover:bg-red-800/30"
                      >
                        <NoSymbolIcon className="w-4 h-4 mr-1" />
                        {t('cancelSub')}
                      </button>
                    )}
                </div>

                {/* Aviso de suscripción cancelada */}
                {subscription?.status === 'canceled' && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md dark:bg-red-900/30 dark:border-red-700">
                    <p className="text-sm text-red-800 dark:text-red-100">
                      {t('canceledWarning')}
                    </p>
                  </div>
                )}

                {/* Aviso de pago pendiente */}
                {subscription?.status === 'past_due' && (
                  <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-md dark:bg-orange-900/30 dark:border-orange-700">
                    <p className="text-sm text-orange-800 dark:text-orange-100">
                      {t('pastDueWarning')}
                    </p>
                  </div>
                )}

                {/* Aviso de cancelación pendiente */}
                {subscription?.cancel_at_period_end && subscription?.status !== 'canceled' && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md dark:bg-yellow-900/30 dark:border-yellow-700">
                    <p className="text-sm text-yellow-800 dark:text-yellow-100">
                      {t('cancelPendingWarning')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <CreditCardIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-50">{t('noSubscription')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('usingFreePlan')}
              </p>
              <div className="mt-6">
                <button
                  onClick={() => setShowChangePlanModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                >
                  {t('selectPlan')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Límites del Plan */}
      {currentPlan && (
        <div className="bg-white shadow rounded-lg dark:bg-gray-800">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50">{t('planLimits')}</h3>
          </div>
          <div className="p-4 sm:p-6">
            {(() => {
              // Obtener límites desde metadata.custom_config (Enterprise) o plan
              const customConfig = subscription?.metadata?.custom_config;
              const planMaxModules = customConfig?.total_available_modules || customConfig?.modules_count || currentPlan.max_modules || null;
              // Limitar al total real de módulos existentes en el sistema
              const maxModules = planMaxModules && allModules.length > 0 ? Math.min(planMaxModules, allModules.length) : planMaxModules;
              const planMaxBranches = customConfig?.branches_count || customConfig?.branchesCount || currentPlan.max_branches || null;
              const planMaxUsers = customConfig?.users_count || customConfig?.usersCount || currentPlan.max_users || null;
              const maxBranches = planMaxBranches !== null ? planMaxBranches + activeAddons.extraBranches : null;
              const maxUsers = planMaxUsers !== null ? planMaxUsers + activeAddons.extraUsers : null;
              const maxStorage = currentPlan.features?.storage_gb || null;
              const aiCreditsMonthly = aiCredits?.monthly || 0;
              const aiCreditsPurchased = aiCredits?.purchased || 0;
              const aiCreditsLimit = aiCreditsMonthly + aiCreditsPurchased;
              const aiCreditsUsed = aiCredits?.consumed || 0;
              const aiCreditsAvailable = Math.max(0, aiCreditsLimit - aiCreditsUsed);
              
              // Calcular porcentajes
              const modulesPercent = maxModules ? Math.min((totalActiveModules / maxModules) * 100, 100) : 0;
              const branchesPercent = maxBranches ? Math.min((branchCount / maxBranches) * 100, 100) : 0;
              const usersPercent = maxUsers ? Math.min((memberCount / maxUsers) * 100, 100) : 0;
              const aiCreditsPercent = aiCreditsLimit ? Math.min((aiCreditsUsed / aiCreditsLimit) * 100, 100) : 0;
              
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 sm:gap-6">
                  {/* Módulos */}
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-300">
                      {totalActiveModules}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        /{maxModules || '∞'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('activeModulesLabel')}</p>
                    <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                      {t('coreAdditional', { core: coreModulesCount, additional: activePaidModules.length })}
                    </p>
                    {maxModules && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${modulesPercent}%` }}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Sucursales */}
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-300">
                      {branchCount}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        /{maxBranches || '∞'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('branchesLabel')}</p>
                    {activeAddons.extraBranches > 0 && (
                      <p className="text-xs text-green-500 mt-0.5 dark:text-green-400">
                        +{activeAddons.extraBranches} addon
                      </p>
                    )}
                    {maxBranches && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${branchesPercent}%` }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowBuyBranchesModal(true)}
                      className="mt-2 inline-flex items-center text-xs font-medium text-green-600 hover:text-green-700 dark:text-green-300 dark:hover:text-green-200"
                    >
                      + Comprar más
                    </button>
                  </div>
                  
                  {/* Usuarios */}
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-300">
                      {memberCount}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        /{maxUsers || '∞'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('usersLabel')}</p>
                    {activeAddons.extraUsers > 0 && (
                      <p className="text-xs text-indigo-500 mt-0.5 dark:text-indigo-400">
                        +{activeAddons.extraUsers} addon
                      </p>
                    )}
                    {maxUsers && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          className="bg-indigo-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${usersPercent}%` }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowBuyUsersModal(true)}
                      className="mt-2 inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-indigo-200"
                    >
                      + Comprar más
                    </button>
                  </div>
                  
                  {/* Almacenamiento */}
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-300">
                      {maxStorage ? `${maxStorage} GB` : '∞'}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('storageLabel')}</p>
                  </div>
                  
                  {/* Créditos IA */}
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-300">
                      {aiCreditsUsed.toLocaleString()}
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        /{aiCreditsLimit.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">{t('aiCreditsLabel')}</p>
                    {aiCreditsPurchased > 0 && (
                      <p className="text-xs text-amber-500 mt-0.5 dark:text-amber-400">
                        +{aiCreditsPurchased.toLocaleString()} comprados
                      </p>
                    )}
                    {aiCreditsLimit > 0 && (
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                        <div 
                          className="bg-amber-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${aiCreditsPercent}%` }}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowBuyAiCreditsModal(true)}
                      className="mt-2 inline-flex items-center text-xs font-medium text-amber-600 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
                    >
                      + Comprar más
                    </button>
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
          initialPaymentMethods={initialPaymentMethods}
        />
      )}

      {/* Módulos Activos */}
      <div className="bg-white shadow rounded-lg dark:bg-gray-800">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50">{t('activeModulesTitle')}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('activeModulesDesc', { core: coreModulesCount, additional: activePaidModules.length })}
          </p>
        </div>
        <div className="p-4 sm:p-6">
          {/* Módulos Core - Siempre activos */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center dark:text-gray-200">
              <StarIcon className="w-4 h-4 text-yellow-500 mr-2 dark:text-yellow-400" />
              {t('coreModules')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
              {allModules.filter(m => m.is_core).map((module) => (
                <div key={module.code} className="border border-blue-200 bg-blue-50 rounded-lg p-4 dark:border-blue-700 dark:bg-blue-900/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {(() => {
                          const Icon = getModuleIcon(module.code);
                          return <Icon className="w-6 h-6 text-blue-600 dark:text-blue-300" />;
                        })()}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                          {module.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2 dark:text-gray-400">
                          {module.description}
                        </p>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-2 dark:bg-blue-800/30 dark:text-blue-100">
                          {t('coreLabel')}
                        </span>
                      </div>
                    </div>
                    <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0 dark:text-green-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Módulos Adicionales Activos */}
          {activePaidModules.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center dark:text-gray-200">
                <ArrowUpIcon className="w-4 h-4 text-green-500 mr-2 dark:text-green-400" />
                {t('additionalModules')}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
                {activePaidModules.map((orgModule) => (
                  <div key={orgModule.id} className="border border-green-200 bg-green-50 rounded-lg p-4 dark:border-green-700 dark:bg-green-900/30">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0">
                          {(() => {
                            const Icon = getModuleIcon(orgModule.module_code);
                            return <Icon className="w-6 h-6 text-green-600 dark:text-green-300" />;
                          })()}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                            {orgModule.modules?.name || t('moduleNoName')}
                          </h4>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 dark:text-gray-400">
                            {orgModule.modules?.description || t('moduleNoDesc')}
                          </p>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-2 dark:bg-green-800/30 dark:text-green-100">
                            {t('activeLabel')}
                          </span>
                        </div>
                      </div>
                      <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0 dark:text-green-400" />
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
        <div className="bg-white shadow rounded-lg dark:bg-gray-800">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50">{t('availableModulesTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('availableModulesDesc')}
            </p>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
              {availableModules.map((module) => (
                <div key={module.code} className="border border-gray-200 rounded-lg p-4 opacity-60 dark:border-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {(() => {
                          const Icon = getModuleIcon(module.code);
                          return <Icon className="w-6 h-6 text-gray-400 dark:text-gray-500" />;
                        })()}
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-50">
                          {module.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-1 dark:text-gray-400">
                          {module.description}
                        </p>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 mt-2 dark:bg-gray-800 dark:text-gray-100">
                          {t('notAvailable')}
                        </span>
                      </div>
                    </div>
                    <XMarkIcon className="w-5 h-5 text-gray-400 flex-shrink-0 dark:text-gray-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comparación de Planes */}
      {showPlanComparison && (
        <div className="bg-white shadow rounded-lg dark:bg-gray-800">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-50">{t('planComparisonTitle')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('planComparisonDesc')}
            </p>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {availablePlans.map((plan) => {
                const isCurrentPlan = plan.code === currentPlan?.code;
                const planPrice = plan.price_usd_month;
                const currentPrice = currentPlan?.price_usd_month || 0;
                const isUpgrade = planPrice > currentPrice;
                const isDowngrade = planPrice < currentPrice && planPrice > 0;
                
                return (
                  <div key={plan.id} className={`border rounded-lg p-6 relative ${
                    isCurrentPlan ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'
                  }`}>
                    {isCurrentPlan && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-medium">
                          {t('currentPlanLabel')}
                        </span>
                      </div>
                    )}
                    
                    <div className="text-center">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{plan.name}</h4>
                      <div className="mt-2">
                        <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-50">
                          {formatPrice(plan.price_usd_month)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">{t('perMonthShort')}</span>
                      </div>
                      {plan.price_usd_year && plan.price_usd_year !== plan.price_usd_month * 12 && (
                        <div className="mt-1">
                          <span className="text-lg font-semibold text-green-600 dark:text-green-300">
                            {formatPrice(plan.price_usd_year)}
                          </span>
                          <span className="text-gray-500 text-sm dark:text-gray-400">{t('perYearShort')}</span>
                          <div className="text-xs text-green-600 dark:text-green-300">
                            {t('saveAmount', { amount: formatPrice((plan.price_usd_month * 12) - plan.price_usd_year) })}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4">
                      <h5 className="font-medium text-gray-900 mb-2 dark:text-gray-50">{t('features')}</h5>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <li className="flex items-center">
                          <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                          {t('modulesCount', { count: plan.max_modules || '∞' })}
                        </li>
                        <li className="flex items-center">
                          <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                          {t('branchesCount', { count: plan.max_branches || '∞' })}
                        </li>
                        {plan.features?.storage_gb && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                            {t('storageGb', { count: plan.features.storage_gb })}
                          </li>
                        )}
                        {plan.features?.analytics && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                            {t('advancedAnalytics')}
                          </li>
                        )}
                        {plan.features?.custom_reports && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                            {t('customReports')}
                          </li>
                        )}
                        {plan.features?.support && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                            {plan.features.support === 'community-only' && t('communitySupport')}
                            {plan.features.support === 'email' && t('emailSupport')}
                            {plan.features.support === 'priority' && t('prioritySupport')}
                          </li>
                        )}
                        {plan.trial_days > 0 && (
                          <li className="flex items-center">
                            <CheckIcon className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 dark:text-green-400" />
                            {t('trialDays', { days: plan.trial_days })}
                          </li>
                        )}
                      </ul>
                    </div>
                    
                    <div className="mt-6">
                      {isCurrentPlan ? (
                        <div className="w-full text-center py-2 px-4 bg-blue-100 text-blue-800 rounded-md font-medium dark:bg-blue-800/30 dark:text-blue-100">
                          {t('currentPlanLabel')}
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
                          {isUpgrade && t('upgrade')}
                          {isDowngrade && t('downgrade')}
                          {!isUpgrade && !isDowngrade && t('select')}
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

      {/* Modal de compra de créditos IA */}
      {showBuyAiCreditsModal && (
        <BuyAiCreditsModal
          isOpen={showBuyAiCreditsModal}
          onClose={() => setShowBuyAiCreditsModal(false)}
          organizationId={orgId}
          onPurchased={loadPlanData}
        />
      )}

      {/* Modal de compra de usuarios extra */}
      {showBuyUsersModal && (
        <BuyUsersModal
          isOpen={showBuyUsersModal}
          onClose={() => setShowBuyUsersModal(false)}
          organizationId={orgId}
          currentUsers={memberCount}
          maxUsers={currentPlan?.max_users ?? null}
          onPurchased={loadPlanData}
        />
      )}

      {/* Modal de compra de sucursales extra */}
      {showBuyBranchesModal && (
        <BuyBranchesModal
          isOpen={showBuyBranchesModal}
          onClose={() => setShowBuyBranchesModal(false)}
          organizationId={orgId}
          currentBranches={branchCount}
          maxBranches={currentPlan?.max_branches ?? null}
          onPurchased={loadPlanData}
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
