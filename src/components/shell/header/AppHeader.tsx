'use client';

/**
 * Header del shell (Figma `02 Componentes` › AppHeader 45:2224, MobileHeader
 * 48:2550 y MobileTabBar 57:3101).
 *
 * Escritorio (≥ 1024 px), 64 px: OrgSwitcher a la izquierda; a la derecha el
 * buscador (Ctrl K), «Reportar problema», la campana y GO Asistente. El tema y
 * el perfil ya no están aquí: viven en el bloque de sesión del sidebar.
 *
 * Móvil, 56 px, en tres modos (cabeceraMovil.tsx): raíz con «Org / Sucursal»
 * y la lupa; página con «←», título y acción; POS con «←», la sucursal y el
 * estado de la caja.
 * La navegación baja a la barra inferior: Inicio · Ventas · GO Asistente ·
 * Alertas · Menú. Solo se ve en Inicio y en las páginas principales del menú;
 * la regla única vive en cabeceraMovil.tsx (`barraInferiorVisible`).
 *
 * Los avisos de prueba y de correo sin verificar van debajo, como antes.
 *
 * Con el GO Asistente abierto (Figma `667:34706`) el header se compacta: el
 * buscador queda en icono (sigue abriendo la paleta con Ctrl/⌘ K) y el chip del
 * plan sale del OrgSwitcher. Con el panel ampliado a 720 px (pantalla 09,
 * `668:37351`) además se retira «Reportar problema» (sigue en el panel de
 * sesión) y el botón del asistente queda en icono. El estado llega por el
 * evento `go-asistente:estado` (`useEstadoAsistente`), sin acoplar el header al
 * panel.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Bell, Bot, ChevronDown, Home, Menu, Search, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import GlobalSearch, { ABRIR_BUSCADOR_EVENT, type PaginaBuscable } from '@/components/app-layout/Header/GlobalSearch';
import { TrialBanner } from '@/components/app-layout/Header/TrialBanner';
import { EmailVerificationBanner } from '@/components/app-layout/Header/EmailVerificationBanner';
import { rutaActiva, type SeccionVisible } from '@/lib/navigation/filtrar';
import { useNombresNav } from '@/lib/navigation/useNombresNav';
import { BranchBadgeActiva } from '@/components/kit/BranchBadge';
import { Kbd } from '@/components/kit/Kbd';
import { clasesBadgeTono } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEstadoAsistente } from '../useEstadoAsistente';
import { OrgSwitcher } from './OrgSwitcher';
import { FeedbackButton, ReportarProblemaDialog } from './ReportarProblema';
import { DetalleNotificacion, NotificationsBell, PanelNotificaciones, textoContador } from './Notificaciones';
import { VistaRapidaTarea } from './VistaRapidaTarea';
import { useNotificacionesHeader, type NotificacionHeader } from './useNotificacionesHeader';
import {
  ALTO_BARRA_APP,
  barraInferiorVisible,
  espacioInferior,
  modoPorRuta,
  rutaPadre,
  useBarrasInferioresPropias,
  useCabeceraMovilActual,
  useTecladoAbierto,
  type CabeceraMovilPagina,
} from './cabeceraMovil';

const abrirBuscador = () => window.dispatchEvent(new Event(ABRIR_BUSCADOR_EVENT));

/** ¿Mac o iPad? Tras montar: el servidor no sabe el sistema. */
function useEsMac(): boolean {
  const [esMac, setEsMac] = useState(false);
  useEffect(() => {
    const plataforma = typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : '';
    if (/Mac|iPhone|iPad/i.test(plataforma)) setEsMac(true);
  }, []);
  return esMac;
}

/** Texto del atajo del asistente como lo pinta el tooltip del Figma: «Ctrl+J» o «⌘J». */
export function textoAtajoAsistente(esMac: boolean): string {
  return esMac ? '⌘J' : 'Ctrl+J';
}

interface AppHeaderProps {
  organizacionId: string | null;
  organizacionNombre: string;
  correo: string | null;
  pathname: string | null;
  secciones: SeccionVisible[];
  paginasBuscables: PaginaBuscable[];
  asistenteAbierto: boolean;
  onAlternarAsistente: () => void;
  onAbrirMenu: () => void;
}

export function AppHeader({
  organizacionId,
  organizacionNombre,
  correo,
  pathname,
  secciones,
  paginasBuscables,
  asistenteAbierto,
  onAlternarAsistente,
  onAbrirMenu,
}: AppHeaderProps) {
  const t = useTranslations('header');
  const notificaciones = useNotificacionesHeader(organizacionId);
  const orgNum = organizacionId ? parseInt(organizacionId, 10) : null;
  const pagina = useCabeceraMovilActual();
  const teclado = useTecladoAbierto();
  const barrasPropias = useBarrasInferioresPropias();
  const barraVisible = barraInferiorVisible({ pathname, pagina, barrasPropias: barrasPropias.cantidad, teclado });
  const espacio = espacioInferior(barraVisible, barrasPropias.alto);
  const esMac = useEsMac();
  const atajoBuscador = esMac ? 'Meta+K' : 'Ctrl+K';
  // Header compacto con el panel abierto; mínimo con el panel a 720 px.
  const { ampliado } = useEstadoAsistente();
  const compacto = asistenteAbierto;
  const minimo = asistenteAbierto && ampliado;
  const etiquetaAsistente = asistenteAbierto ? t('closeAssistant') : t('openAssistant');

  // El contenido (AppLayout) y los avisos flotantes dejan abajo el sitio de la
  // barra que se vea: la de la app o la propia de la pieza (BulkActionBar…).
  useEffect(() => {
    document.documentElement.style.setProperty('--shell-barra-inferior', espacio);
  }, [espacio]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty('--shell-barra-inferior');
    },
    []
  );

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 border-b border-line bg-surface mobile-safe-top">
        {/* Escritorio */}
        <div className="hidden h-16 items-center gap-2 px-6 lg:flex">
          <OrgSwitcher
            variante="escritorio"
            organizacionId={orgNum}
            organizacionNombre={organizacionNombre}
            sinPlan={compacto}
          />
          <div className="flex-1" />
          {/* SearchTrigger (Figma 54:2970): abre la paleta; también Ctrl K / ⌘ K y «/».
              Variant=button normalmente; icon-outline con el asistente abierto. */}
          {compacto ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={abrirBuscador}
                  aria-label={t('search')}
                  aria-haspopup="dialog"
                  aria-keyshortcuts="Control+K Meta+K /"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Search className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-2">
                {t('search')}
                <Kbd tecla={atajoBuscador} tema="oscuro" />
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={abrirBuscador}
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K /"
              className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface pl-3 pr-2 text-sm font-medium text-fg-secondary outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Search className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t('search')}
              <Kbd tecla={atajoBuscador} tamano="md" />
            </button>
          )}
          {!minimo && <FeedbackButton />}
          <NotificationsBell datos={notificaciones} />
          {/* AssistantLauncher (Figma 45:2223): tooltip «Abrir GO Asistente · Ctrl+J» (667:34455).
              El atajo lo atiende el panel; aquí solo se anuncia. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onAlternarAsistente}
                aria-pressed={asistenteAbierto}
                aria-keyshortcuts="Control+J Meta+J"
                aria-label={minimo ? t('assistant') : undefined}
                className={cn(
                  'flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                  minimo ? 'w-10' : 'px-4',
                  asistenteAbierto
                    ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover'
                    : 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
                )}
              >
                <Bot className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                {!minimo && t('assistant')}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="flex flex-col items-start gap-0.5 leading-4">
              <span>{etiquetaAsistente}</span>
              <span className="opacity-70">{textoAtajoAsistente(esMac)}</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Móvil: raíz, página o POS (ver cabeceraMovil.tsx) */}
        <MobileHeader
          pathname={pathname}
          pagina={pagina}
          organizacionId={orgNum}
          organizacionNombre={organizacionNombre}
        />

        <TrialBanner orgId={organizacionId} />
        <EmailVerificationBanner />
      </header>

      <GlobalSearch paginas={paginasBuscables} organizacionId={organizacionId} />
      <ReportarProblemaDialog organizacionId={orgNum} organizacionNombre={organizacionNombre} correo={correo} />
      <MobileTabBar
        visible={barraVisible}
        pathname={pathname}
        secciones={secciones}
        pendientes={notificaciones.pendientes}
        notificaciones={notificaciones}
        asistenteAbierto={asistenteAbierto}
        onAlternarAsistente={onAlternarAsistente}
        onAbrirMenu={onAbrirMenu}
      />
    </TooltipProvider>
  );
}

/** Exportado para las pruebas de render de pantallas con cabecera móvil (una sola «←»). */
export function MobileHeader({
  pathname,
  pagina,
  organizacionId,
  organizacionNombre,
}: {
  pathname: string | null;
  pagina: CabeceraMovilPagina | null;
  organizacionId: number | null;
  organizacionNombre: string;
}) {
  const t = useTranslations('header');
  const tNav = useTranslations('nav');
  const nombres = useNombresNav();
  const router = useRouter();
  const modo = pagina?.modo ?? modoPorRuta(pathname);

  // «←» de los modos página y POS: atrás si hay historial; si no, a donde diga
  // la página o a la página padre del menú (en el POS, /app/inicio).
  const volver = () => {
    if (window.history.length > 1) router.back();
    else router.push(pagina?.volverA ?? rutaPadre(pathname));
  };
  const botonVolver = (
    <button
      type="button"
      onClick={volver}
      aria-label={t('back')}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
    >
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );

  // SearchTrigger Variant=icon-outline (Figma 54:2978) → SearchCommand móvil a pantalla completa.
  const buscar = (
    <button
      type="button"
      onClick={abrirBuscador}
      aria-label={t('search')}
      aria-haspopup="dialog"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Search className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );

  if (modo === 'page') {
    // Título: el que declare la página, o la página del menú a la que pertenece la ruta.
    const activa = rutaActiva(pathname);
    const titulo = pagina?.titulo ?? (activa?.pagina ? nombres.pagina(activa.pagina) : activa ? tNav(activa.modulo.etiqueta) : '');
    const subtitulo = pagina?.subtitulo ?? organizacionNombre;
    const estado = pagina?.estado;
    // Fila bajo el título: chip de estado (si la página lo declara) y subtítulo.
    const filaSubtitulo =
      estado || subtitulo ? (
        <span className="flex min-w-0 max-w-full items-center gap-1.5">
          {estado && (
            // <span> y no <Badge> (un <div>): la fila puede ir dentro del botón del título.
            <span className={clasesBadgeTono(estado.tono, 'suave', 'sm')}>
              <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
              {estado.texto}
            </span>
          )}
          {subtitulo && <span className="truncate text-xs font-medium leading-4 text-fg-secondary">{subtitulo}</span>}
        </span>
      ) : null;
    return (
      <div className="flex h-14 items-center gap-1 pl-1 pr-2 lg:hidden">
        {botonVolver}
        {pagina?.onTitulo ? (
          // «Título ▾»: la página pone un selector detrás del título (Pipeline: elegir embudo).
          <button
            type="button"
            onClick={pagina.onTitulo}
            aria-label={pagina.tituloAria}
            aria-haspopup="dialog"
            className="flex min-w-0 flex-1 flex-col items-start rounded-lg px-1 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex min-w-0 max-w-full items-center gap-1">
              <span className="truncate text-base font-semibold leading-[22px] text-fg">{titulo}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.75} />
            </span>
            {filaSubtitulo}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col">
            {/* <p> y no <h1>: el título principal sigue siendo el de la página. */}
            <p className="truncate text-base font-semibold leading-[22px] text-fg">{titulo}</p>
            {filaSubtitulo}
          </div>
        )}
        {pagina?.accion ?? null}
      </div>
    );
  }

  if (modo === 'pos') {
    // «←» · sucursal · caja. Sin selector de organización: cambiar de
    // organización con un carrito abierto es riesgoso (sigue en Inicio y en el
    // menú). El carrito se conserva al salir, así que «←» no pide confirmación;
    // mientras se cobra, el cobro cubre la pantalla y la cabecera no se alcanza.
    // La sucursal trunca con «…» para que la fila quepa en 360 px.
    const estado = pagina?.estadoPos;
    return (
      <div className="flex h-14 items-center gap-1.5 pl-1 pr-3 lg:hidden">
        {botonVolver}
        <BranchBadgeActiva className="min-w-0 shrink" />
        {estado && (
          <span
            className={cn(
              'ml-auto inline-flex h-6 max-w-[60%] shrink-0 items-center overflow-hidden rounded-full border px-2.5 text-xs font-semibold',
              estado.tono === 'exito'
                ? 'border-line-success bg-success-subtle text-success-text'
                : 'border-line-warning bg-warning-subtle text-warning-text'
            )}
          >
            <span className="truncate">{estado.texto}</span>
          </span>
        )}
        {/* «⋯ Caja y dispositivo» del POS (Figma 187:7933): lo pone la página con `accion`. */}
        {pagina?.accion ? <div className={cn('shrink-0', !estado && 'ml-auto')}>{pagina.accion}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex h-14 items-center gap-2 px-4 lg:hidden">
      <div className="min-w-0 flex-1">
        <OrgSwitcher variante="movil" organizacionId={organizacionId} organizacionNombre={organizacionNombre} />
      </div>
      {buscar}
    </div>
  );
}

function MobileTabBar({
  visible,
  pathname,
  secciones,
  pendientes,
  notificaciones,
  asistenteAbierto,
  onAlternarAsistente,
  onAbrirMenu,
}: {
  visible: boolean;
  pathname: string | null;
  secciones: SeccionVisible[];
  pendientes: number;
  notificaciones: ReturnType<typeof useNotificacionesHeader>;
  asistenteAbierto: boolean;
  onAlternarAsistente: () => void;
  onAbrirMenu: () => void;
}) {
  const t = useTranslations('header');
  const [alertas, setAlertas] = useState(false);
  const [detalle, setDetalle] = useState<NotificacionHeader | null>(null);
  const [tareaId, setTareaId] = useState<string | null>(null);

  // «Ventas» lleva al primer módulo visible de la sección Ventas (POS, PMS,
  // gimnasio…): el plan de la organización decide cuál existe.
  const ventas = useMemo(() => secciones.find((s) => s.codigo === 'ventas')?.modulos[0] ?? null, [secciones]);
  const enVentas = !!ventas && !!pathname && ventas.modulo.rutas.some((r) => pathname.startsWith(r));
  const enInicio = pathname === '/app/inicio';

  const item = (activo: boolean) =>
    cn(
      'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-[11px] font-medium outline-none',
      activo ? 'text-brand-deep' : 'text-fg-secondary'
    );
  const indicador = <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-sm bg-brand" aria-hidden="true" />;

  return (
    <>
      {visible && (
      <nav
        aria-label={t('mobileNavigation')}
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ height: ALTO_BARRA_APP }}
      >
        <Link href="/app/inicio" className={item(enInicio)} aria-current={enInicio ? 'page' : undefined}>
          {enInicio && indicador}
          <Home className="h-5 w-5" aria-hidden="true" />
          {t('tabHome')}
        </Link>
        {ventas ? (
          <Link href={ventas.href} className={item(enVentas)} aria-current={enVentas ? 'page' : undefined}>
            {enVentas && indicador}
            <ShoppingCart className="h-5 w-5" aria-hidden="true" />
            {t('tabSales')}
          </Link>
        ) : (
          <span className="flex-1" aria-hidden="true" />
        )}
        <button type="button" onClick={onAlternarAsistente} aria-pressed={asistenteAbierto} className={item(asistenteAbierto)}>
          <span className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full border-4 border-surface bg-brand-action text-fg-on-brand shadow-md">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-brand-deep">{t('assistant')}</span>
        </button>
        <button type="button" onClick={() => setAlertas(true)} className={item(alertas)} aria-haspopup="dialog">
          {alertas && indicador}
          <span className="relative">
            <Bell className="h-5 w-5" aria-hidden="true" />
            {pendientes > 0 && (
              <span className="absolute -right-2.5 -top-1.5 rounded-full border-2 border-surface bg-danger px-1 text-[10px] font-semibold leading-3 text-white">
                {textoContador(pendientes)}
              </span>
            )}
          </span>
          {t('tabAlerts')}
          {pendientes > 0 && <span className="sr-only">{t('pendingCount', { n: pendientes })}</span>}
        </button>
        <button type="button" onClick={onAbrirMenu} className={item(false)} aria-haspopup="dialog">
          <Menu className="h-5 w-5" aria-hidden="true" />
          {t('tabMenu')}
        </button>
      </nav>
      )}

      <Sheet open={alertas} onOpenChange={setAlertas}>
        <SheetContent side="bottom" hideCloseButton className="max-h-[90dvh] rounded-t-2xl border-line bg-surface p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="sr-only">{t('notifications')}</SheetTitle>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <PanelNotificaciones
            datos={notificaciones}
            enHoja
            onCerrar={() => setAlertas(false)}
            onAbrir={(n) => {
              setAlertas(false);
              setDetalle(n);
            }}
            onAbrirTarea={(id) => {
              setAlertas(false);
              setTareaId(id);
            }}
          />
        </SheetContent>
      </Sheet>
      <DetalleNotificacion notificacion={detalle} onCerrar={() => setDetalle(null)} datos={notificaciones} />
      <VistaRapidaTarea tareaId={tareaId} onCerrar={() => setTareaId(null)} onCambio={notificaciones.refrescarTareas} />
    </>
  );
}
