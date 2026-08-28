'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ModuleAccessDenied from '@/components/modules/ModuleAccessDenied';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Home, RefreshCw, QrCode } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/utils/Utils';
import {
  inicioService,
  DashboardKPIs,
  DashboardAtajos,
  DashboardActividad,
  DashboardTendencia,
  DashboardAlertas,
  PeriodoSelector,
  OnboardingBanner,
  DashboardModulos,
} from '@/components/inicio';
import type { DashboardData, PeriodoDashboard, HorasDashboard } from '@/components/inicio';
import { useDynamicGreeting } from '@/components/inicio/useDynamicGreeting';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { supabase } from '@/lib/supabase/config';

function InicioContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const error = searchParams.get('error');
  const module = searchParams.get('module');
  const { organization } = useOrganization();
  const { toast } = useToast();
  const t = useTranslations('home');
  const locale = useLocale();

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [fechaHoy, setFechaHoy] = useState('');
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('hoy');
  const [horas, setHoras] = useState<HorasDashboard | null>(null);
  const [userName, setUserName] = useState<string>('');
  const greeting = useDynamicGreeting(userName, locale);

  useEffect(() => {
    setMounted(true);
    setFechaHoy(
      new Date().toLocaleDateString(locale, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    );
    // Nombre del usuario desde cache de AppLayout (appLayout_userData_cache)
    // con fallback a Supabase auth si el cache aún no se ha poblado
    try {
      const cached = typeof window !== 'undefined' ? localStorage.getItem('appLayout_userData_cache') : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        const nombre = parsed?.data?.name || '';
        if (nombre) {
          setUserName(nombre.split(' ')[0]);
          return;
        }
      }
    } catch {
      // ignore
    }
    // Fallback: consultar Supabase auth si no hay cache
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata || {};
      const nombre = meta.first_name || meta.firstName || meta.full_name || meta.name || '';
      if (nombre) setUserName(nombre.split(' ')[0]);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const [data, modules] = await Promise.all([
        inicioService.getDashboardData(organization.id, periodo, horas),
        moduleManagementService.getActiveModules(organization.id).catch(() => null),
      ]);
      setDashboardData(data);
      if (modules) setActiveModuleCodes(modules.map(m => m.code));
    } catch (err) {
      console.error('Error cargando dashboard:', err);
      toast({
        title: 'Error',
        description: t('errorLoadingDashboard'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast, periodo, horas]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: t('dashboardUpdated') });
  };

  if (error === 'module_not_activated' && module) {
    return <ModuleAccessDenied moduleCode={module} />;
  }

  if (!mounted || !organization) {
    return (
      <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="animate-pulse space-y-6">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Alertas de error */}
      {error && (
        <Alert className="max-w-2xl mx-auto">
          <AlertDescription>
            {error === 'module_not_activated' && t('errors.moduleNotActivated')}
            {error === 'insufficient_permissions' && t('errors.insufficientPermissions')}
            {error === 'plan_limit_reached' && t('errors.planLimitReached')}
            {!['module_not_activated', 'insufficient_permissions', 'plan_limit_reached'].includes(error) && t('errors.unexpected')}
          </AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Home className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {greeting || t('welcome', { userName: '' })}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
              {fechaHoy}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PeriodoSelector
            value={periodo}
            onChange={setPeriodo}
            horas={horas}
            onHorasChange={setHoras}
          />

          <Link href="/marcar">
            <Button
              variant="outline"
              size="sm"
              className="border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <QrCode className="h-4 w-4 mr-2" />
              {t('markShift')}
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-gray-300 dark:border-gray-700"
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            {t('refresh')}
          </Button>
        </div>
      </div>

      {/* Onboarding para organizaciones nuevas */}
      <OnboardingBanner
        steps={dashboardData?.onboarding || []}
        organizacionCreatedAt={dashboardData?.organizacionCreatedAt || null}
      />

      {/* Atajos rápidos */}
      <DashboardAtajos activeModuleCodes={activeModuleCodes} />

      {/* KPIs */}
      <DashboardKPIs data={dashboardData?.kpis ?? null} isLoading={isLoading} periodo={periodo} />

      {/* Alertas consolidadas de módulos */}
      <DashboardAlertas
        organizationId={organization?.id}
        activeModuleCodes={activeModuleCodes}
      />

      {/* Actividad Reciente + Tendencia de Ventas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardActividad
          data={dashboardData?.actividad ?? []}
          isLoading={isLoading}
        />

        {/* Tendencia de ventas (reemplaza al antiguo bloque "Accesos Rápidos" redundante) */}
        {organization?.id && (
          <DashboardTendencia organizationId={organization.id} dias={30} />
        )}
      </div>

      {/* Dashboards consolidados por módulo activo */}
      <DashboardModulos
        activeModuleCodes={activeModuleCodes}
        isLoading={isLoading}
      />
    </div>
  );
}

export default function InicioPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <InicioContent />
    </Suspense>
  );
}
