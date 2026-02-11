'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/config';
import { Clock, AlertTriangle, XCircle, X, CreditCard, ArrowRight } from 'lucide-react';

interface TrialBannerProps {
  orgId: string | null;
}

interface SubscriptionInfo {
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  plan_name: string;
}

type BannerState = 'trial_active' | 'trial_warning' | 'trial_expired' | 'hidden';

const DISMISS_KEY = 'trial_banner_dismissed_at';

export function TrialBanner({ orgId }: TrialBannerProps) {
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const [daysLeft, setDaysLeft] = useState(0);
  const [planName, setPlanName] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) return;

    const fetchSubscription = async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select(`
          status,
          trial_start,
          trial_end,
          stripe_subscription_id,
          stripe_customer_id,
          current_period_end,
          plans ( name )
        `)
        .eq('organization_id', orgId)
        .single();

      if (error || !data) {
        setLoaded(true);
        return;
      }

      const sub = data as any;
      const name = sub.plans?.name || 'Plan';
      setPlanName(name);

      // Determinar estado del banner
      const now = new Date();

      // Caso 1: Tiene trial_end definido
      if (sub.trial_end) {
        const trialEnd = new Date(sub.trial_end);
        const diffMs = trialEnd.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          // Trial vencido
          const hasPaymentMethod = !!sub.stripe_customer_id && !!sub.stripe_subscription_id;
          if (!hasPaymentMethod || sub.status === 'trialing') {
            setBannerState('trial_expired');
            setDaysLeft(0);
          }
        } else if (diffDays <= 3) {
          // Trial por vencer (≤3 días)
          setBannerState('trial_warning');
          setDaysLeft(diffDays);
        } else {
          // Trial activo con días restantes
          setBannerState('trial_active');
          setDaysLeft(diffDays);
        }
      }
      // Caso 2: Status trialing sin trial_end explícito
      else if (sub.status === 'trialing' && sub.current_period_end) {
        const periodEnd = new Date(sub.current_period_end);
        const diffMs = periodEnd.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          setBannerState('trial_expired');
          setDaysLeft(0);
        } else if (diffDays <= 3) {
          setBannerState('trial_warning');
          setDaysLeft(diffDays);
        } else {
          setBannerState('trial_active');
          setDaysLeft(diffDays);
        }
      }

      // Verificar si fue descartado recientemente (solo para trial_active)
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const dismissDate = new Date(dismissedAt);
        const hoursSinceDismiss = (now.getTime() - dismissDate.getTime()) / (1000 * 60 * 60);
        // Re-mostrar después de 24h para trial_active, siempre mostrar warning/expired
        if (hoursSinceDismiss < 24) {
          setDismissed(true);
        }
      }

      setLoaded(true);
    };

    fetchSubscription();
  }, [orgId]);

  // No mostrar si: está oculto, no cargado, o descartado (solo en estado azul)
  if (!loaded || bannerState === 'hidden') return null;
  if (dismissed && bannerState === 'trial_active') return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setDismissed(true);
  };

  const config = {
    trial_active: {
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-300',
      subtext: 'text-blue-600 dark:text-blue-400',
      icon: Clock,
      iconColor: 'text-blue-500 dark:text-blue-400',
      message: `Estás en período de prueba gratis del ${planName}`,
      detail: `Te quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''} de prueba`,
      canDismiss: true,
      showCTA: false,
    },
    trial_warning: {
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      text: 'text-amber-700 dark:text-amber-300',
      subtext: 'text-amber-600 dark:text-amber-400',
      icon: AlertTriangle,
      iconColor: 'text-amber-500 dark:text-amber-400',
      message: `Tu prueba gratis del ${planName} vence pronto`,
      detail: `${daysLeft} día${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}. Vincula un método de pago para no perder acceso.`,
      canDismiss: false,
      showCTA: true,
    },
    trial_expired: {
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-300',
      subtext: 'text-red-600 dark:text-red-400',
      icon: XCircle,
      iconColor: 'text-red-500 dark:text-red-400',
      message: `Tu período de prueba del ${planName} ha finalizado`,
      detail: 'Activa tu plan para seguir usando todas las funcionalidades.',
      canDismiss: false,
      showCTA: true,
    },
    hidden: null,
  };

  const c = config[bannerState];
  if (!c) return null;

  const Icon = c.icon;

  return (
    <div className={`border-b ${c.bg} px-3 sm:px-4 py-2`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 shrink-0 ${c.iconColor}`} />
          <p className={`text-xs sm:text-sm font-medium ${c.text} truncate`}>
            {c.message}
            <span className={`font-normal ml-1 ${c.subtext}`}>
              — {c.detail}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {c.showCTA && (
            <Link href="/app/plan">
              <button className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                <CreditCard className="h-3 w-3" />
                <span className="hidden sm:inline">Gestionar Plan</span>
                <span className="sm:hidden">Plan</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </Link>
          )}

          {c.canDismiss && (
            <button
              onClick={handleDismiss}
              className={`p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${c.subtext}`}
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
