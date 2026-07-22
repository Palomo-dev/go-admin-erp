'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import SubscriptionPlanSelector from '@/components/subscription/SubscriptionPlanSelector';
import { useTranslations } from 'next-intl';
import {
  LockClosedIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  TicketIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { signOut } from '@/lib/supabase/config';

interface ValidatedCoupon {
  code: string;
  name: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  durationMonths: number | null;
  stripeCouponId: string | null;
  discountDescription: string;
  durationDescription: string;
}

type FrozenReason = 'trial_expired' | 'suspended' | 'payment_failed' | 'canceled' | 'deleted';

export default function CuentaCongeladaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = (searchParams.get('reason') as FrozenReason) || 'trial_expired';

  const [orgId, setOrgId] = useState<number | null>(null);
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado de cupón
  const [couponInput, setCouponInput] = useState('');
  const [validatedCoupon, setValidatedCoupon] = useState<ValidatedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  useEffect(() => {
    const fetchOrgData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push('/auth/login');
          return;
        }

        const currentOrgId = localStorage.getItem('currentOrganizationId');
        if (!currentOrgId) {
          router.push('/auth/select-organization');
          return;
        }

        const { data: org } = await supabase
          .from('organizations')
          .select('id, name, status')
          .eq('id', currentOrgId)
          .single();

        if (org) {
          setOrgId(org.id);
          setOrgName(org.name);

          // Verificar estado de suscripción: si está activa o trial vigente, redirigir a /app/inicio
          if (org.status === 'active') {
            const { data: sub } = await supabase
              .from('subscriptions')
              .select('status, trial_end, current_period_end')
              .eq('organization_id', org.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            if (sub) {
              const now = new Date();
              const isTrialActive = sub.status === 'trialing' &&
                sub.trial_end && new Date(sub.trial_end) > now;
              const isSubscriptionActive = ['active', 'trialing'].includes(sub.status) && !isTrialActive;

              if (isTrialActive || sub.status === 'active') {
                router.push('/app/inicio');
                return;
              }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching org data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrgData();
  }, [router]);

  const handleCheckout = async () => {
    if (!orgId) return;
    setCheckoutLoading(true);
    setError(null);

    try {
      const planCode = selectedPlan.replace('-yearly', '');
      const baseUrl = window.location.origin;
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          planCode,
          billingPeriod,
          couponCode: validatedCoupon?.code || undefined,
          successUrl: `${baseUrl}/app/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${baseUrl}/app/cuenta-congelada?reason=trial_expired&checkout=canceled`,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Error al crear la sesión de pago');
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleValidateCoupon = async () => {
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
      } else {
        setCouponError(data.error || 'Cupón no válido');
      }
    } catch {
      setCouponError('Error al validar el cupón');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setValidatedCoupon(null);
    setCouponError(null);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const isSuspended = reason === 'suspended' || reason === 'deleted';
  const isPaymentFailed = reason === 'payment_failed';
  const isCanceled = reason === 'canceled';

  const config = {
    trial_expired: {
      icon: LockClosedIcon,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      title: 'Tu período de prueba ha finalizado',
      subtitle: 'Tu cuenta está pausada. Selecciona un plan y suscríbete para reactivar el acceso completo.',
    },
    suspended: {
      icon: ShieldCheckIcon,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      title: 'Cuenta suspendida',
      subtitle: 'Tu organización ha sido suspendida. Contacta al soporte para reactivarla.',
    },
    deleted: {
      icon: ExclamationTriangleIcon,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      title: 'Cuenta eliminada',
      subtitle: 'Tu organización ha sido eliminada. Contacta al soporte para más información.',
    },
    payment_failed: {
      icon: ExclamationTriangleIcon,
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      iconColor: 'text-orange-600 dark:text-orange-400',
      title: 'Pago pendiente',
      subtitle: 'Tu último pago falló. Actualiza tu método de pago para reactivar tu cuenta.',
    },
    canceled: {
      icon: LockClosedIcon,
      iconBg: 'bg-gray-100 dark:bg-gray-800',
      iconColor: 'text-gray-600 dark:text-gray-400',
      title: 'Suscripción cancelada',
      subtitle: 'Tu suscripción fue cancelada. Selecciona un plan para reactivar tu cuenta.',
    },
  };

  const c = config[reason] || config.trial_expired;
  const Icon = c.icon;

  const canPay = !isSuspended;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header con icono */}
        <div className="text-center space-y-3">
          <div className={`w-16 h-16 mx-auto rounded-full ${c.iconBg} flex items-center justify-center`}>
            <Icon className={`w-8 h-8 ${c.iconColor}`} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {c.title}
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            {c.subtitle}
          </p>
          {orgName && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Organización: <span className="font-medium">{orgName}</span>
            </p>
          )}
        </div>

        {/* Contenido según estado */}
        {canPay ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-6">
            {/* Selector de plan */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 text-center">
                Selecciona tu plan
              </h2>
              <SubscriptionPlanSelector
                selectedPlan={selectedPlan}
                onSelectPlan={(planId) => {
                  setSelectedPlan(planId);
                  const isYearly = planId.endsWith('-yearly');
                  setBillingPeriod(isYearly ? 'yearly' : 'monthly');
                }}
                billingPeriod={billingPeriod}
                onChangeBillingPeriod={(period) => {
                  setBillingPeriod(period);
                  const base = selectedPlan.replace('-yearly', '');
                  setSelectedPlan(period === 'yearly' ? `${base}-yearly` : base);
                }}
              />
            </div>

            {/* Sección de cupón de descuento */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 flex items-center gap-1.5">
                <TicketIcon className="h-3.5 w-3.5" />
                Cupón de descuento
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
                    placeholder="Ingresa tu código"
                    className="w-full sm:flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    disabled={couponLoading}
                  />
                  <button
                    type="button"
                    onClick={handleValidateCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="w-full sm:w-auto inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {couponLoading ? (
                      <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Aplicar'
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CheckCircleIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-green-900 dark:text-green-300 truncate">
                        {validatedCoupon.code} — {validatedCoupon.name}
                      </p>
                      <p className="text-[11px] sm:text-xs text-green-700 dark:text-green-400">
                        {validatedCoupon.discountDescription} {validatedCoupon.durationDescription}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <XCircleIcon className="h-4 w-4" />
                  </button>
                </div>
              )}

              {couponError && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                  <XCircleIcon className="h-3.5 w-3.5" />
                  {couponError}
                </div>
              )}
            </div>

            {/* Botón de checkout */}
            <div className="space-y-3">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
                  <ExclamationTriangleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
              )}

              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? (
                  <>
                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CreditCardIcon className="w-5 h-5" />
                    Suscribir y pagar ahora
                    <ArrowRightIcon className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                Pago seguro procesado por Stripe. Puedes cancelar en cualquier momento.
              </p>
            </div>

            {/* Si tiene customer_id, mostrar opción de actualizar método de pago */}
            {isPaymentFailed && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  ¿Solo necesitas actualizar tu método de pago?
                </p>
                <a
                  href="/app/plan/billing"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <CreditCardIcon className="w-4 h-4" />
                  Ir a facturación
                </a>
              </div>
            )}
          </div>
        ) : (
          /* Estado suspendido/eliminado: sin opciones de pago */
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-8 text-center space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Tu cuenta no puede ser reactivada mediante pago. Contacta a nuestro equipo de soporte para resolver esta situación.
              </p>
            </div>

            <div className="space-y-2">
              <a
                href="mailto:soporte@goadmin.io"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Contactar soporte
              </a>
              <br />
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Si crees que esto es un error, contacta a soporte@goadmin.io
          </p>
        </div>
      </div>
    </div>
  );
}
