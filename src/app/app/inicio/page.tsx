'use client';

export const dynamic = 'force-dynamic';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import ModuleAccessDenied from '@/components/modules/ModuleAccessDenied';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Home, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { cn } from '@/utils/Utils';
import {
  inicioService,
  DashboardKPIs,
  DashboardAtajos,
  DashboardActividad,
  DashboardTendencia,
  PeriodoSelector,
  OnboardingBanner,
} from '@/components/inicio';
import type { DashboardData, PeriodoDashboard, HorasDashboard, FechasCustomDashboard } from '@/components/inicio';
import { useDynamicGreeting } from '@/components/inicio/useDynamicGreeting';
import { useDashboardRealtime } from '@/components/inicio/useDashboardRealtime';
import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { supabase } from '@/lib/supabase/config';
import { WebCommerceObservability } from '@/components/pos/pedidos-online/WebCommerceObservability';
import { PageHeader, BranchBadgeActiva, EmptyState, clasesBoton } from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { EmployeeDashboard } from '@/components/inicio/EmployeeDashboard';
import { BloqueHoy } from '@/components/inicio/BloqueHoy';
import { TarjetaDatosEmpresa } from '@/components/inicio/TarjetaDatosEmpresa';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { bloqueVisible } from '@/lib/dashboard/preferenciasInicio';
import { TarjetaVentas } from '@/components/inicio/TarjetaVentas';
import { TarjetaTiendaWeb } from '@/components/inicio/TarjetaTiendaWeb';
import { ModulosInicio } from '@/components/inicio/ModulosInicio';
import { DialogoPersonalizar } from '@/components/inicio/DialogoPersonalizar';
import { BotonTurno, TurnoCard, useTurnoInicio } from '@/components/inicio/TurnoInicio';
import { usePreferenciasInicio } from '@/components/inicio/usePreferenciasInicio';

/**
 * Esqueleto de la primera carga (antes de montar o de tener organización) y
 * del `Suspense`: cabecera y tres tarjetas. Un solo componente para los dos
 * sitios, con `Skeleton` y el fondo `bg-canvas` del kit.
 */
function EsqueletoInicio() {
  return (
    <div className="min-h-screen space-y-4 bg-canvas p-4 sm:p-6">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function InicioContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const error = searchParams.get('error');
  const moduleCode = searchParams.get('module');
  const { organization } = useOrganization();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const { branches, canSelectAll } = useBranch();
  const { timezone } = useFormatDate();
  const { toast } = useToast();
  const t = useTranslations('home');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  const { context: permContext, resolvedOrganizationId } = usePermissionContext(organization?.id);
  // Go Admin Desktop (fase 4A): replicar el catálogo del POS al entrar al inicio.
  // Fuera del Desktop el hook no hace nada.
  useDesktopCatalog(organization?.id);

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // «Actualizar» también recarga el bloque «Hoy», que pide lo suyo aparte.
  const [versionHoy, setVersionHoy] = useState(0);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [activeModuleCodes, setActiveModuleCodes] = useState<string[] | undefined>(undefined);
  const [periodo, setPeriodo] = useState<PeriodoDashboard>('hoy');
  const [horas, setHoras] = useState<HorasDashboard | null>(null);
  const [fechasCustom, setFechasCustom] = useState<FechasCustomDashboard | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const greeting = useDynamicGreeting(userName, locale);
  // Preferencias del inicio por usuario y organización (Figma 448:196794):
  // bloques ocultos y orden/ocultos de «Módulos», guardadas en la base.
  const { prefs, guardando: guardandoPrefs, guardar: guardarPrefs } = usePreferenciasInicio(organization?.id);
  const [personalizarAbierto, setPersonalizarAbierto] = useState(false);
  const [versionModulos, setVersionModulos] = useState(0);
  const [modulosLista, setModulosLista] = useState<Array<{ codigo: string; etiqueta: string }>>([]);
  // «Tu turno» (Figma 631:21816): estado calculado en el servidor sobre la
  // marcación de HRM; marcar sigue siendo el flujo existente (/marcar).
  const turno = useTurnoInicio(organization?.id, versionHoy);
  const guardarPreferencias = useCallback(
    async (p: Parameters<typeof guardarPrefs>[0]) => {
      const ok = await guardarPrefs(p);
      if (ok) {
        // Los módulos que se vuelven a mostrar necesitan su resumen.
        setVersionModulos((v) => v + 1);
        toast({ title: t('personalizar.guardado') });
      }
      return ok;
    },
    [guardarPrefs, toast, t],
  );

  // Quién ve el panel con datos financieros. La regla vive en
  // `@/lib/dashboard/accesoPanel`: antes se leía la lista del CRM
  // (`STAGE_MANAGER_ROLE_IDS`), pensada para el control de etapas de las
  // oportunidades, así que tocarla allí cambiaba en silencio quién ve la caja
  // y la utilidad aquí.
  const canSeeFinancialDashboard = veePanelCompleto(permContext);

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

  // «Hoy» en la zona de la organización (no en la del navegador): a las 8 p. m.
  // en Bogotá el navegador de un usuario en Madrid ya dice «mañana». Solo tras
  // montar, para no desalinear el HTML del servidor con el del cliente.
  const fechaHoy = mounted
    ? formatDateInTz(new Date(), timezone, {
        locale,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  // Sin ninguna sucursal accesible el panel financiero se pintaría en ceros:
  // se dice por qué (Figma D-sinsuc). El panel del empleado no depende de la
  // sucursal (turno, tareas, notificaciones) y se sigue mostrando.
  const sinSucursal = !branchLoading && branches.length === 0;

  useEffect(() => {
    setMounted(true);
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
      setErrorCarga(false);
    } catch (err) {
      console.error('Error cargando dashboard:', err);
      if (!silent) {
        // La recarga silenciosa (realtime) conserva los últimos datos; la
        // carga visible que falla muestra el estado de error con «Reintentar».
        setErrorCarga(true);
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
    setVersionHoy((v) => v + 1);
    setVersionModulos((v) => v + 1);
    await loadData();
    setIsRefreshing(false);
    toast({ title: t('dashboardUpdated') });
  };

  if (error === 'module_not_activated' && moduleCode) {
    return <ModuleAccessDenied moduleCode={moduleCode} />;
  }

  if (!mounted || !organization) {
    return <EsqueletoInicio />;
  }

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
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

      {/* Cabecera del kit. `movil={false}`: el inicio es pantalla raíz y en
          móvil conserva el MobileHeader de organización/sucursal; la cabecera
          se dibuja también allí, como antes, en vez de publicar un modo página
          con «← Volver». */}
      <PageHeader
        titulo={greeting || t('welcome', { userName: '' })}
        subtitulo={<span className="inline-block first-letter:uppercase">{fechaHoy}</span>}
        icono={Home}
        movil={false}
        acciones={
          <>
            {/* «Tu turno» en el encabezado solo en el panel completo y en
                escritorio (Figma frames 7–10); en móvil va la tarjeta y en el
                panel de empleado, la tarjeta compacta (frame 11). Sin
                contrato activo (dueño que no marca) no se dibuja. */}
            {canSeeFinancialDashboard && (
              <span className="max-lg:hidden">
                <BotonTurno turno={turno} />
              </span>
            )}
            {canSeeFinancialDashboard && (
              <button
                type="button"
                onClick={() => setPersonalizarAbierto(true)}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('personalizar.boton')}
              </button>
            )}
            {canSeeFinancialDashboard && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                <RefreshCw aria-hidden="true" className={cn('size-4', isRefreshing && 'animate-spin')} strokeWidth={1.5} />
                {t('refresh')}
              </button>
            )}
          </>
        }
        debajo={
          <>
            <BranchBadgeActiva />
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
          </>
        }
      />

      {/* Móvil, panel completo: «Tu turno» arriba del todo, bajo el saludo
          (Figma 631:21819…22367). */}
      {rolResuelto && canSeeFinancialDashboard && turno && (
        <TurnoCard turno={turno} className="lg:hidden" />
      )}

      {/* Datos mínimos de la empresa (acceso v3, fase 7): solo a quien administra. */}
      {rolResuelto && <TarjetaDatosEmpresa organizationId={organization?.id} permContext={permContext} />}

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
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] rounded-xl sm:h-[86px]" />
            ))}
          </div>
          <DashboardKPIs data={null} isLoading periodo={periodo} organizationId={organization?.id} horas={horas} fechasCustom={fechasCustom} branchFilter={branchFilter} />
        </>
      ) : canSeeFinancialDashboard && sinSucursal ? (
        <EmptyState
          variante="sinSucursal"
          accion={
            canSelectAll
              ? { etiqueta: t('panel.gestionarSucursales'), href: '/app/organizacion/sucursales' }
              : undefined
          }
          className="rounded-xl border border-line bg-surface"
        />
      ) : canSeeFinancialDashboard ? (
        <>
          {/* Bloque «Hoy» (Figma 445:137185): lo accionable de la sucursal
              activa, primero. Sustituye a DashboardAlertas. */}
          <BloqueHoy organizationId={organization.id} sucursal={branchFilter} version={versionHoy} />

          {/* KPIs y Actividad dependen de `dashboardData`: son los únicos que
              muestran skeleton al cambiar de periodo. El resto de secciones
              carga por su cuenta y se monta desde el principio, en paralelo,
              en vez de esperar a que termine la carga principal (antes eran
              dos oleadas de loaders: primero KPIs, después todo lo demás). */}
          {bloqueVisible(prefs, 'indicadores') && (errorCarga && !isLoading ? (
            <EmptyState
              variante="error"
              onReintentar={() => loadData()}
              className="rounded-xl border border-line bg-surface"
            />
          ) : (
            <DashboardKPIs data={isLoading ? null : (dashboardData?.kpis ?? null)} isLoading={isLoading} periodo={periodo} organizationId={organization?.id} horas={horas} fechasCustom={fechasCustom} branchFilter={branchFilter} />
          ))}

          {/* «Ventas del periodo» (tarjeta con canal/sucursal + tendencia) y
              «Actividad reciente» (Figma 445:137185). Cada bloque se puede
              ocultar en «Personalizar el inicio». */}
          {(bloqueVisible(prefs, 'ventas') || bloqueVisible(prefs, 'actividad')) && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {bloqueVisible(prefs, 'ventas') && (
                <div className={cn('flex flex-col gap-6', !bloqueVisible(prefs, 'actividad') && 'lg:col-span-2')}>
                  <TarjetaVentas
                    organizationId={organization.id}
                    periodo={periodo}
                    horas={horas}
                    fechas={fechasCustom}
                    sucursal={branchFilter}
                    version={versionHoy}
                  />
                  <DashboardTendencia organizationId={organization.id} dias={30} />
                </div>
              )}
              {bloqueVisible(prefs, 'actividad') && (
                <div className={cn(!bloqueVisible(prefs, 'ventas') && 'lg:col-span-2')}>
                  <DashboardActividad
                    data={dashboardData?.actividad ?? []}
                    isLoading={isLoading}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tienda web (Figma bloque 463:15506) y su observabilidad: stock
              reservado + pedidos próximos a expirar. */}
          {bloqueVisible(prefs, 'tiendaWeb') && (
            <>
              <TarjetaTiendaWeb
                organizationId={organization.id}
                periodo={periodo}
                horas={horas}
                fechas={fechasCustom}
                sucursal={branchFilter}
                version={versionHoy}
              />
              <WebCommerceObservability
                organizationId={organization.id}
                withinMinutes={30}
              />
            </>
          )}

          {/* Módulos con resumen (FilaModulo 445:195568 y «Dashboard por
              módulo» 642:25956): una lectura en el servidor para toda la
              lista; qué módulos aparecen lo decide el servidor. */}
          <ModulosInicio
            organizationId={organization.id}
            periodo={periodo}
            horas={horas}
            fechas={fechasCustom}
            sucursal={branchFilter}
            version={versionModulos}
            prefs={prefs}
            onGuardar={guardarPreferencias}
            guardando={guardandoPrefs}
            onModulos={setModulosLista}
          />
        </>
      ) : (
        // Empleados: panel propio con turno, tareas, notificaciones y accesos
        // filtrados por los permisos de su cargo. Sin datos financieros.
        <EmployeeDashboard
          organizationId={organization?.id}
          userId={userId}
          permContext={permContext}
          turno={turno}
        />
      )}

      {canSeeFinancialDashboard && (
        <DialogoPersonalizar
          abierto={personalizarAbierto}
          onAbiertoChange={setPersonalizarAbierto}
          prefs={prefs}
          modulos={modulosLista.map((m) => ({ codigo: m.codigo, nombre: tNav(m.etiqueta) }))}
          onGuardar={guardarPreferencias}
          guardando={guardandoPrefs}
        />
      )}
    </div>
  );
}

export default function InicioPage() {
  return (
    <Suspense
      fallback={<EsqueletoInicio />}
    >
      <InicioContent />
    </Suspense>
  );
}
