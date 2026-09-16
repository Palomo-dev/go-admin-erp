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
import type { DashboardData, PeriodoDashboard, HorasDashboard, FechasCustomDashboard } from '@/components/inicio';
import { useDynamicGreeting } from '@/components/inicio/useDynamicGreeting';
import { useDashboardRealtime } from '@/components/inicio/useDashboardRealtime';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { supabase } from '@/lib/supabase/config';
import { WebCommerceObservability } from '@/components/pos/pedidos-online/WebCommerceObservability';
import { BranchBadge } from '@/components/inventario/BranchBadge';
import { useBranch } from '@/lib/context/BranchContext';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { STAGE_MANAGER_ROLE_IDS } from '@/lib/services/crm/stagePermissions';
import { EmployeeDashboard } from '@/components/inicio/EmployeeDashboard';

function InicioContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const error = searchParams.get('error');
  const moduleCode = searchParams.get('module');
  const { organization } = useOrganization();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const { toast } = useToast();
  const t = useTranslations('home');
  const locale = useLocale();
  const { context: permContext, resolvedOrganizationId } = usePermissionContext(organization?.id);

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [fechaHoy, setFechaHoy] = useState('');
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('hoy');
  const [horas, setHoras] = useState<HorasDashboard | null>(null);
  const [fechasCustom, setFechasCustom] = useState<FechasCustomDashboard | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const greeting = useDynamicGreeting(userName, locale);

  // Solo los administradores y managers de la organización (Super Admin /
  // Admin de organización / Manager, role_id 1/2/5, o is_super_admin) pueden
  // ver el dashboard financiero. Los empleados no ven datos financieros.
  const canSeeFinancialDashboard = !!(
    permContext && (
      permContext.isSuperAdmin ||
      STAGE_MANAGER_ROLE_IDS.includes(permContext.roleId)
    )
  );

  // El rol está resuelto SOLO cuando el hook completó una carga para ESTA
  // organización. No vale con `permContext !== null || !loading`, que era el
  // guardia anterior y seguía fallando: el hook arranca antes de que exista
  // `organization` (carga para la última organización del perfil), y entre
  // esa carga y la siguiente `loading` vale false un instante con un contexto
  // null o de otra organización. En ese instante `canSeeFinancialDashboard`
  // era false y a un administrador se le pintaba el panel de empleado antes
  // de saltar al financiero.
  //
  // Con `resolvedOrganizationId === organization.id` el contexto es de esta
  // organización, sea un rol real o null por falta de membresía (ese null sí
  // es definitivo). Sin sesión el hook no marca nada como resuelto, así que
  // se queda en skeleton hasta que el layout redirija a login.
  const rolResuelto = !!organization && resolvedOrganizationId === organization.id;

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
        const uid = parsed?.data?.id || parsed?.id || '';
        if (uid) setUserId(uid);
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
      if (user?.id) setUserId(user.id);
      const meta = user?.user_metadata || {};
      const nombre = meta.first_name || meta.firstName || meta.full_name || meta.name || '';
      if (nombre) setUserName(nombre.split(' ')[0]);
    }).catch(() => {});
  }, []);

  // Módulos activos: una sola vez por organización y en paralelo con el
  // contexto de permisos, no dentro de cada carga del dashboard. Así, cuando
  // el rol se resuelve, Atajos/Alertas/Módulos ya se pintan filtrados en vez
  // de mostrar todo y refiltrar (otro parpadeo).
  useEffect(() => {
    const orgId = organization?.id;
    if (!orgId) return;
    let cancelado = false;
    moduleManagementService
      .getActiveModules(orgId)
      .then((modules) => {
        if (cancelado) return;
        const newCodes = modules.map((m) => m.code).sort();
        // Misma referencia si el contenido no cambió: evita refetchs en hijos.
        setActiveModuleCodes((prev) =>
          prev && prev.length === newCodes.length && prev.every((c, i) => c === newCodes[i])
            ? prev
            : newCodes,
        );
      })
      .catch(() => {
        // Sin códigos, los hijos muestran todos los módulos (comportamiento previo).
      });
    return () => {
      cancelado = true;
    };
  }, [organization?.id]);

  const loadData = useCallback(async (silent = false) => {
    if (!organization?.id || branchLoading || !rolResuelto) return;
    // Los empleados no-admin no reciben datos financieros del dashboard:
    // se omite el fetch completo para no traer KPIs/actividad al cliente.
    if (!canSeeFinancialDashboard) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    try {
      const data = await inicioService.getDashboardData(organization.id, periodo, horas, fechasCustom, branchFilter);
      setDashboardData(data);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
      if (!silent) {
        toast({
          title: t('common.error'),
          description: t('errorLoadingDashboard'),
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [organization?.id, toast, t, periodo, horas, fechasCustom, branchFilter, branchLoading, rolResuelto, canSeeFinancialDashboard]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime + auto-refresh para las cards del dashboard (igual que pedidos-online).
  // Recarga silenciosa: actualiza datos sin mostrar el skeleton de carga.
  const handleRealtimeRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  useDashboardRealtime(
    organization?.id ?? null,
    periodo,
    horas,
    handleRealtimeRefresh,
    !!organization?.id && canSeeFinancialDashboard,
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast({ title: t('dashboardUpdated') });
  };

  if (error === 'module_not_activated' && moduleCode) {
    return <ModuleAccessDenied moduleCode={moduleCode} />;
  }

  if (!mounted || !organization) {
    return (
      <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
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
            <BranchBadge className="mt-1.5" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSeeFinancialDashboard && (
            <PeriodoSelector
              value={periodo}
              onChange={setPeriodo}
              horas={horas}
              onHorasChange={setHoras}
              fechasCustom={fechasCustom}
              onFechasCustomChange={setFechasCustom}
            />
          )}

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

          {canSeeFinancialDashboard && (
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
          )}
        </div>
      </div>

      {/* Onboarding para organizaciones nuevas */}
      <OnboardingBanner
        steps={dashboardData?.onboarding || []}
        organizacionCreatedAt={dashboardData?.organizacionCreatedAt || null}
      />

      {/* Atajos rápidos — solo para admins/managers. Los empleados ven su
          propio panel con accesos filtrados por permisos de su cargo. */}
      {rolResuelto && canSeeFinancialDashboard && (
        <DashboardAtajos activeModuleCodes={activeModuleCodes} />
      )}

      {!rolResuelto ? (
        // Rol aún sin resolver: un único skeleton neutro. No se elige panel
        // todavía para no pintar el de empleado a un administrador.
        <>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[74px] sm:h-[86px] bg-gray-200 dark:bg-gray-700 rounded-xl" />
            ))}
          </div>
          <DashboardKPIs data={null} isLoading periodo={periodo} organizationId={organization?.id} horas={horas} fechasCustom={fechasCustom} branchFilter={branchFilter} />
        </>
      ) : canSeeFinancialDashboard ? (
        <>
          {/* KPIs y Actividad dependen de `dashboardData`: son los únicos que
              muestran skeleton al cambiar de periodo. El resto de secciones
              carga por su cuenta y se monta desde el principio, en paralelo,
              en vez de esperar a que termine la carga principal (antes eran
              dos oleadas de loaders: primero KPIs, después todo lo demás). */}
          <DashboardKPIs data={isLoading ? null : (dashboardData?.kpis ?? null)} isLoading={isLoading} periodo={periodo} organizationId={organization?.id} horas={horas} fechasCustom={fechasCustom} branchFilter={branchFilter} />

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

          {/* Observabilidad de comercio web: stock reservado + pedidos próximos a expirar */}
          {organization?.id && (
            <WebCommerceObservability
              organizationId={organization.id}
              withinMinutes={30}
            />
          )}

          {/* Dashboards consolidados por módulo activo */}
          <DashboardModulos
            activeModuleCodes={activeModuleCodes}
            isLoading={false}
          />
        </>
      ) : (
        // Empleados: panel propio con turno, tareas, notificaciones y accesos
        // filtrados por los permisos de su cargo. Sin datos financieros.
        <EmployeeDashboard
          organizationId={organization?.id}
          userId={userId}
          permContext={permContext}
        />
      )}
    </div>
  );
}

export default function InicioPage() {
  return (
    <Suspense
      fallback={
        <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
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
