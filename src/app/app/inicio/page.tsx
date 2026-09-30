'use client';

export const dynamic = 'force-dynamic';

/**
 * Inicio (Figma `03 Navegación y shell` › «Inicio — dashboard» 445:137182).
 *
 * Orden del escritorio listo (445:137185): cabecera (saludo, fecha ·
 * organización, Actualizar, Marcar turno, Personalizar, «⋯») → sucursal +
 * selector de periodo (Hoy…Año · Personalizado + Horas) → «Hoy» → fila de dos:
 * «Ventas del periodo» (con su gráfica dentro) | «Actividad reciente» →
 * «Tienda web» → «Módulos». Estados: cargando (445:137401), vacío /
 * organización nueva (445:137617: «Primeros pasos» en lugar de «Hoy» y
 * «Todavía no hay movimientos» en lugar de ventas y actividad), error
 * (445:137833), sin sucursal (445:138049) y móvil (448:205216…205745).
 *
 * Tanda 4 (2026-09-30): fuera del inicio los montajes viejos que el Figma ya
 * no tiene (`DashboardAtajos`, `DashboardKPIs`, `DashboardTendencia`,
 * `DashboardActividad`, `WebCommerceObservability`, `OnboardingBanner` y el
 * `PeriodoSelector` viejo). Dónde quedó cada funcionalidad: sección «Tanda 4»
 * de `docs/design/SHELL-FIGMA-A-CODIGO.md`. Cada bloque lee su propia ruta
 * `GET /api/inicio/*` con la organización de la sesión: ya no hay 41
 * consultas desde el navegador ni un intervalo de 30 s.
 */
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, Home, ListChecks, RefreshCw, SlidersHorizontal } from 'lucide-react';
import ModuleAccessDenied from '@/components/modules/ModuleAccessDenied';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { PageHeader, BranchBadgeActiva, EmptyState, RowActionsMenu, clasesBoton, useEsEscritorio, type AccionFila } from '@/components/kit';
import { useBranch } from '@/lib/context/BranchContext';
import { usePermissionContext } from '@/hooks/usePermissionContext';
import { veePanelCompleto } from '@/lib/dashboard/accesoPanel';
import { bloqueVisible } from '@/lib/dashboard/preferenciasInicio';
import { claveOcultarPasos, mostrarPrimerosPasos, type PrimerosPasos as DatosPasos } from '@/lib/dashboard/primerosPasos';
import type { FechasPeriodo, HorasPeriodo, PeriodoInicio } from '@/lib/dashboard/periodo';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { useDesktopCatalog } from '@/lib/offline/useDesktopCatalog';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { cn } from '@/utils/Utils';
import { useDynamicGreeting } from '@/components/inicio/useDynamicGreeting';
import { EmployeeDashboard } from '@/components/inicio/EmployeeDashboard';
import { BloqueHoy } from '@/components/inicio/BloqueHoy';
import { TarjetaDatosEmpresa } from '@/components/inicio/TarjetaDatosEmpresa';
import { TarjetaVentas } from '@/components/inicio/TarjetaVentas';
import { ActividadReciente } from '@/components/inicio/ActividadReciente';
import { TarjetaTiendaWeb } from '@/components/inicio/TarjetaTiendaWeb';
import { ModulosInicio } from '@/components/inicio/ModulosInicio';
import { DialogoPersonalizar } from '@/components/inicio/DialogoPersonalizar';
import { PrimerosPasos, SinMovimientos } from '@/components/inicio/PrimerosPasos';
import { SelectorPeriodoInicio } from '@/components/inicio/SelectorPeriodoInicio';
import { BotonTurno, TurnoCard, useTurnoInicio } from '@/components/inicio/TurnoInicio';
import { usePreferenciasInicio } from '@/components/inicio/usePreferenciasInicio';
import { useLecturaInicio, type LecturaInicio } from '@/components/inicio/useLecturaInicio';
import { CLAVE_PERIODO } from '@/components/inicio/textosPeriodo';

/** «Ver analítica web» sale del catálogo (su acceso lo decide `GET /api/analitica-web`). */
const PAGINA_ANALITICA_WEB = '/app/inicio/analitica-web';
const HAY_ANALITICA = CATALOGO_NAV.some((m) => m.paginas.some((p) => p.href === PAGINA_ANALITICA_WEB));

type Fase = LecturaInicio<unknown>['fase'];

/**
 * Esqueleto del panel (Figma 445:137401 / 448:205458): «Hoy», la fila de
 * ventas y actividad, y las filas de «Módulos». La cabecera y el selector de
 * periodo no esperan (anotación §E.1).
 */
function EsqueletoFilas() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5">
        <Skeleton className="h-6 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className={cn('h-[104px] rounded-xl', i > 1 && 'max-sm:hidden')} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 max-lg:hidden lg:grid-cols-2">
        <Skeleton className="h-[368px] rounded-xl" />
        <Skeleton className="h-[368px] rounded-xl" />
      </div>
    </div>
  );
}

function EsqueletoPanel() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <EsqueletoFilas />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Primera carga (antes de montar o de tener organización) y fallback del `Suspense`. */
function EsqueletoInicio() {
  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
      <Skeleton className="h-12 w-72" />
      <EsqueletoPanel />
    </div>
  );
}

function InicioContent() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const error = searchParams.get('error');
  const moduleCode = searchParams.get('module');
  const router = useRouter();
  const { organization } = useOrganization();
  const { branchFilter, isLoading: branchLoading } = useBranch();
  const { branches, canSelectAll } = useBranch();
  const { timezone } = useFormatDate();
  const { toast } = useToast();
  const t = useTranslations('home');
  const tNav = useTranslations('nav');
  const locale = useLocale();
  // Solo decide qué se monta (la actividad no está en el móvil del diseño) y
  // qué entra en el «⋯»; el resto del diseño responde por CSS.
  const esEscritorio = useEsEscritorio();
  const { context: permContext, resolvedOrganizationId } = usePermissionContext(organization?.id);
  // Go Admin Desktop (fase 4A): replicar el catálogo del POS al entrar al inicio.
  // Fuera del Desktop el hook no hace nada.
  useDesktopCatalog(organization?.id);

  const [mounted, setMounted] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  // «Actualizar»: `versionHoy` recarga «Hoy», el turno y los primeros pasos;
  // `versionModulos`, «Módulos»; `refresco` recarga ventas, actividad y tienda
  // web SIN esqueleto (si falla, se conservan los datos y avisa un toast).
  const [versionHoy, setVersionHoy] = useState(0);
  const [versionModulos, setVersionModulos] = useState(0);
  const [versionDatos, setVersionDatos] = useState(0);
  const [refresco, setRefresco] = useState(0);
  const [periodo, setPeriodo] = useState<PeriodoInicio>('hoy');
  const [horas, setHoras] = useState<HorasPeriodo | null>(null);
  const [fechas, setFechas] = useState<FechasPeriodo | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const greeting = useDynamicGreeting(userName, locale);
  // Preferencias del inicio por usuario y organización (Figma 448:196794).
  const { prefs, guardando: guardandoPrefs, guardar: guardarPrefs } = usePreferenciasInicio(organization?.id);
  const [personalizarAbierto, setPersonalizarAbierto] = useState(false);
  const [modulosLista, setModulosLista] = useState<Array<{ codigo: string; etiqueta: string }>>([]);
  const [faseVentas, setFaseVentas] = useState<Fase>('cargando');
  const [faseActividad, setFaseActividad] = useState<Fase>('cargando');
  const [pasosOcultos, setPasosOcultos] = useState(false);
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

  // Quién ve el panel con datos financieros: `@/lib/dashboard/accesoPanel`.
  const canSeeFinancialDashboard = veePanelCompleto(permContext);

  // El rol está resuelto SOLO cuando el hook completó una carga para ESTA
  // organización (ver la historia en guardrails: con `!loading` a secas se
  // pintaba primero el panel de empleado a un administrador).
  const rolResuelto = !!organization && resolvedOrganizationId === organization.id;

  // Las lecturas del panel esperan organización, sucursal y rol resueltos:
  // montar los bloques antes lanzaba cada consulta dos veces (con la sucursal
  // provisional y con la buena).
  const puedeConsultar = !!organization?.id && !branchLoading && rolResuelto && canSeeFinancialDashboard;

  // «Hoy» en la zona de la organización (no en la del navegador). Solo tras
  // montar, para no desalinear el HTML del servidor con el del cliente.
  const fechaHoy = mounted
    ? formatDateInTz(new Date(), timezone, { locale, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  // Sin ninguna sucursal accesible el panel se pintaría en ceros: se dice por
  // qué (Figma 445:138049). El panel del empleado no depende de la sucursal.
  const sinSucursal = !branchLoading && branches.length === 0;

  const sucursalActiva = typeof branchFilter === 'number' ? branchFilter : null;
  const nombreAlcance =
    sucursalActiva !== null ? branches.find((b) => Number(b.id) === sucursalActiva)?.name ?? '' : t('alcance.todas');
  const nombrePeriodo = t(`periods.${CLAVE_PERIODO[periodo]}`);

  // «Primeros pasos» (organización nueva): se consulta con el panel.
  // «Actualizar» los relee en silencio: si pasaran por «cargando», «Hoy» y
  // la fila de ventas se desmontarían y volverían a pedir todo.
  const { estado: estadoPasos } = useLecturaInicio<DatosPasos>(
    puedeConsultar && !sinSucursal ? '/api/inicio/primeros-pasos' : null,
    organization?.id,
    0,
    { refresco: versionHoy },
  );
  const pasos = estadoPasos.fase === 'listo' ? estadoPasos.datos : null;
  const verPasos = mostrarPrimerosPasos(pasos, pasosOcultos);
  const sinMovimientos = !!pasos && !pasos.hayMovimientos;

  useEffect(() => {
    setMounted(true);
    // Nombre del usuario desde la caché de AppLayout, con Supabase auth de respaldo.
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
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (user?.id) setUserId(user.id);
        const meta = user?.user_metadata || {};
        const nombre = meta.first_name || meta.firstName || meta.full_name || meta.name || '';
        if (nombre) setUserName(nombre.split(' ')[0]);
      })
      .catch(() => {});
  }, []);

  // «Ocultar por ahora» de los primeros pasos: por organización, en este navegador.
  useEffect(() => {
    if (!organization?.id) return;
    try {
      setPasosOcultos(localStorage.getItem(claveOcultarPasos(organization.id)) === '1');
    } catch {
      setPasosOcultos(false);
    }
  }, [organization?.id]);

  const alternarPasos = (ocultar: boolean) => {
    setPasosOcultos(ocultar);
    if (!organization?.id) return;
    try {
      if (ocultar) localStorage.setItem(claveOcultarPasos(organization.id), '1');
      else localStorage.removeItem(claveOcultarPasos(organization.id));
    } catch {
      // Sin almacenamiento: vale para esta visita.
    }
  };

  // Un solo aviso por «Actualizar» aunque fallen varios bloques.
  const avisado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const handleRefresh = () => {
    avisado.current = false;
    setActualizando(true);
    setVersionHoy((v) => v + 1);
    setVersionModulos((v) => v + 1);
    setRefresco((v) => v + 1);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setActualizando(false), 800);
  };

  const falloRefresco = useCallback(() => {
    if (avisado.current) return;
    avisado.current = true;
    toast({
      variant: 'destructive',
      title: t('errorInicio.actualizarTitulo'),
      description: t('errorInicio.actualizarDesc'),
      action: (
        <ToastAction altText={t('errorInicio.reintentar')} onClick={() => setRefresco((v) => v + 1)}>
          {t('errorInicio.reintentar')}
        </ToastAction>
      ),
    });
  }, [toast, t]);

  if (error === 'module_not_activated' && moduleCode) {
    return <ModuleAccessDenied moduleCode={moduleCode} />;
  }

  if (!mounted || !organization) {
    return <EsqueletoInicio />;
  }

  const verVentas = bloqueVisible(prefs, 'ventas');
  // La actividad no está en el móvil del diseño (448:205216): ni se consulta.
  const verActividad = bloqueVisible(prefs, 'actividad') && esEscritorio;
  // Error de la fila entera (445:137833): si fallan los dos bloques visibles,
  // un solo estado con «Reintentar» en vez de dos cajas rojas.
  const errorFila =
    (verVentas || verActividad) &&
    (!verVentas || faseVentas === 'error') &&
    (!verActividad || faseActividad === 'error');

  const accionesMenu: AccionFila[] = [
    {
      id: 'actualizar',
      etiqueta: t('refresh'),
      icono: RefreshCw,
      onSelect: handleRefresh,
      // En escritorio está el botón de la cabecera; en móvil, aquí.
      oculta: esEscritorio || !canSeeFinancialDashboard,
    },
    {
      id: 'personalizar',
      etiqueta: t('personalizar.boton'),
      icono: SlidersHorizontal,
      onSelect: () => setPersonalizarAbierto(true),
      oculta: esEscritorio || !canSeeFinancialDashboard,
    },
    {
      id: 'pasos',
      etiqueta: t('primerosPasos.mostrar'),
      icono: ListChecks,
      onSelect: () => alternarPasos(false),
      oculta: !pasosOcultos || !mostrarPrimerosPasos(pasos, false),
      separadorAntes: true,
    },
    {
      id: 'analitica',
      etiqueta: t('tiendaWeb.verAnalitica'),
      icono: BarChart3,
      onSelect: () => router.push(PAGINA_ANALITICA_WEB),
      oculta: !canSeeFinancialDashboard || !HAY_ANALITICA,
    },
  ];

  return (
    <div className="min-h-screen space-y-6 bg-canvas p-4 sm:p-6">
      {error && (
        <Alert className="mx-auto max-w-2xl">
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
          se dibuja también allí. En móvil las acciones van al «⋯». */}
      <PageHeader
        titulo={greeting || t('welcome', { userName: '' })}
        subtitulo={
          <span className="inline-block first-letter:uppercase">
            {fechaHoy}
            {organization.name && <span className="max-lg:hidden"> · {organization.name}</span>}
          </span>
        }
        icono={Home}
        cargando={actualizando}
        movil={false}
        acciones={
          <>
            {canSeeFinancialDashboard && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={actualizando}
                aria-label={t('refresh')}
                title={t('refresh')}
                className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0 max-lg:hidden' })}
              >
                <RefreshCw aria-hidden="true" className={cn('size-5', actualizando && 'animate-spin')} strokeWidth={1.5} />
              </button>
            )}
            {/* «Tu turno» en el encabezado solo en el panel completo y en
                escritorio; en móvil va la tarjeta. Sin contrato no se dibuja. */}
            {canSeeFinancialDashboard && (
              <span className="max-lg:hidden">
                <BotonTurno turno={turno} />
              </span>
            )}
            {canSeeFinancialDashboard && (
              <button
                type="button"
                onClick={() => setPersonalizarAbierto(true)}
                className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'max-lg:hidden' })}
              >
                <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('personalizar.boton')}
              </button>
            )}
            <RowActionsMenu acciones={accionesMenu} orientacion="horizontal" tamano="md" className="max-lg:hidden" />
          </>
        }
        debajo={
          <>
            <BranchBadgeActiva />
            <span className="flex-1" />
            {canSeeFinancialDashboard && (
              <SelectorPeriodoInicio
                periodo={periodo}
                onPeriodo={setPeriodo}
                horas={horas}
                onHoras={setHoras}
                fechas={fechas}
                onFechas={setFechas}
              />
            )}
            {/* Móvil (448:205216): sin botones en la cabecera; «Actualizar»,
                «Personalizar» y el resto quedan en el «⋯» junto al periodo. */}
            <RowActionsMenu acciones={accionesMenu} orientacion="horizontal" tamano="md" className="lg:hidden" />
          </>
        }
      />

      {/* Móvil, panel completo: «Tu turno» arriba del todo, bajo el saludo. */}
      {rolResuelto && canSeeFinancialDashboard && turno && <TurnoCard turno={turno} className="lg:hidden" />}

      {/* Datos mínimos de la empresa (acceso v3, fase 7): solo a quien administra. */}
      {rolResuelto && <TarjetaDatosEmpresa organizationId={organization?.id} permContext={permContext} />}

      {!rolResuelto ? (
        // Rol aún sin resolver: un único esqueleto neutro. No se elige panel
        // todavía para no pintar el de empleado a un administrador.
        <EsqueletoPanel />
      ) : canSeeFinancialDashboard && sinSucursal ? (
        <EmptyState
          variante="sinSucursal"
          accion={canSelectAll ? { etiqueta: t('panel.gestionarSucursales'), href: '/app/organizacion/sucursales' } : undefined}
          className="rounded-xl border border-line bg-surface"
        />
      ) : canSeeFinancialDashboard ? (
        !puedeConsultar ? (
          <EsqueletoPanel />
        ) : (
          <>
            {/* «Hoy» (445:137185) o, en una organización nueva, «Primeros
                pasos» en su lugar (445:137617, anotación §C.4). Hasta saber
                cuál, esqueleto: montar «Hoy» y ventas para una organización
                nueva lanzaba sus consultas y los hacía parpadear. Si la
                lectura de los pasos falla, se pinta el panel normal. */}
            {estadoPasos.fase === 'cargando' ? (
              <EsqueletoFilas />
            ) : verPasos && pasos ? (
              <PrimerosPasos datos={pasos} onOcultar={() => alternarPasos(true)} />
            ) : (
              <BloqueHoy organizationId={organization.id} sucursal={branchFilter} version={versionHoy} />
            )}

            {/* «Ventas del periodo» | «Actividad reciente». Sin ningún
                movimiento nunca: «Todavía no hay movimientos» (448:73622). */}
            {estadoPasos.fase === 'cargando' ? null : sinMovimientos ? (
              <SinMovimientos hrefProductos={pasos?.hrefProductos ?? null} hrefPos={pasos?.hrefPos ?? null} />
            ) : (
              (verVentas || verActividad) && (
                <>
                  {errorFila && (
                    <EmptyState
                      variante="error"
                      titulo={t('errorInicio.titulo')}
                      descripcion={t('errorInicio.descripcion')}
                      onReintentar={() => setVersionDatos((v) => v + 1)}
                    />
                  )}
                  <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-2', errorFila && 'hidden')}>
                    {verVentas && (
                      <TarjetaVentas
                        organizationId={organization.id}
                        periodo={periodo}
                        horas={horas}
                        fechas={fechas}
                        sucursal={sucursalActiva}
                        alcance={nombreAlcance}
                        version={versionDatos}
                        refresco={refresco}
                        onFalloRefresco={falloRefresco}
                        onFase={setFaseVentas}
                        className={cn('flex min-h-[368px] flex-col rounded-xl border border-line bg-surface', !verActividad && 'lg:col-span-2')}
                      />
                    )}
                    {verActividad && (
                      <ActividadReciente
                        organizationId={organization.id}
                        periodo={periodo}
                        horas={horas}
                        fechas={fechas}
                        sucursal={sucursalActiva}
                        contexto={[nombreAlcance, nombrePeriodo].filter(Boolean).join(' · ')}
                        version={versionDatos}
                        refresco={refresco}
                        onFalloRefresco={falloRefresco}
                        onFase={setFaseActividad}
                        className={cn(
                          'flex min-h-[368px] flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3.5',
                          !verVentas && 'lg:col-span-2',
                        )}
                      />
                    )}
                  </div>
                </>
              )
            )}

            {/* «Tienda web» (463:15506): se oculta sola si no hay tienda. */}
            {bloqueVisible(prefs, 'tiendaWeb') && (
              <TarjetaTiendaWeb
                organizationId={organization.id}
                periodo={periodo}
                horas={horas}
                fechas={fechas}
                sucursal={sucursalActiva}
                version={versionDatos}
                refresco={refresco}
                onFalloRefresco={falloRefresco}
              />
            )}

            {/* «Módulos» (FilaModulo 445:195568): qué módulos aparecen lo decide el servidor. */}
            <ModulosInicio
              organizationId={organization.id}
              periodo={periodo}
              horas={horas}
              fechas={fechas}
              sucursal={branchFilter}
              version={versionModulos}
              prefs={prefs}
              onGuardar={guardarPreferencias}
              guardando={guardandoPrefs}
              onModulos={setModulosLista}
            />
          </>
        )
      ) : (
        // Empleados: panel propio con turno, tareas, notificaciones y accesos
        // filtrados por los permisos de su cargo. Sin datos financieros.
        <EmployeeDashboard organizationId={organization?.id} userId={userId} permContext={permContext} turno={turno} />
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
    <Suspense fallback={<EsqueletoInicio />}>
      <InicioContent />
    </Suspense>
  );
}
