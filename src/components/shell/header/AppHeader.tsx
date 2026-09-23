'use client';

/**
 * Header del shell (Figma `02 Componentes` › AppHeader 45:2224, MobileHeader
 * 48:2550 y MobileTabBar 57:3101).
 *
 * Escritorio (≥ 1024 px), 64 px: OrgSwitcher a la izquierda; a la derecha el
 * buscador (Ctrl K), «Reportar problema», la campana y GO Asistente. El tema y
 * el perfil ya no están aquí: viven en el bloque de sesión del sidebar.
 *
 * Móvil, 56 px: «Org / Sucursal» y la lupa. La navegación baja a la barra
 * inferior: Inicio · Ventas · GO Asistente · Alertas · Menú.
 *
 * Los avisos de prueba y de correo sin verificar van debajo, como antes.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, Bot, Home, Menu, Search, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { TooltipProvider } from '@/components/ui/tooltip';
import GlobalSearch, { ABRIR_BUSCADOR_EVENT, type PaginaBuscable } from '@/components/app-layout/Header/GlobalSearch';
import { TrialBanner } from '@/components/app-layout/Header/TrialBanner';
import { EmailVerificationBanner } from '@/components/app-layout/Header/EmailVerificationBanner';
import type { SeccionVisible } from '@/lib/navigation/filtrar';
import { OrgSwitcher } from './OrgSwitcher';
import { FeedbackButton, ReportarProblemaDialog } from './ReportarProblema';
import { DetalleNotificacion, NotificationsBell, PanelNotificaciones, textoContador } from './Notificaciones';
import { useNotificacionesHeader, type NotificacionHeader } from './useNotificacionesHeader';

const abrirBuscador = () => window.dispatchEvent(new Event(ABRIR_BUSCADOR_EVENT));

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

  return (
    <TooltipProvider delayDuration={300}>
      <header className="sticky top-0 z-30 border-b border-line bg-surface mobile-safe-top">
        {/* Escritorio */}
        <div className="hidden h-16 items-center gap-2 px-6 lg:flex">
          <OrgSwitcher variante="escritorio" organizacionId={orgNum} organizacionNombre={organizacionNombre} />
          <div className="flex-1" />
          <button
            type="button"
            onClick={abrirBuscador}
            className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface pl-3 pr-2 text-sm font-medium text-fg-secondary outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t('search')}
            <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-sans text-xs font-medium text-fg-muted">Ctrl K</kbd>
          </button>
          <FeedbackButton />
          <NotificationsBell datos={notificaciones} />
          <button
            type="button"
            onClick={onAlternarAsistente}
            aria-pressed={asistenteAbierto}
            className={cn(
              'flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
              asistenteAbierto
                ? 'bg-brand-action text-fg-on-brand hover:bg-brand-action-hover'
                : 'bg-brand-tint text-brand-deep hover:bg-brand-tint-hover'
            )}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
            {t('assistant')}
          </button>
        </div>

        {/* Móvil */}
        <div className="flex h-14 items-center gap-2 px-4 lg:hidden">
          <div className="min-w-0 flex-1">
            <OrgSwitcher variante="movil" organizacionId={orgNum} organizacionNombre={organizacionNombre} />
          </div>
          <button
            type="button"
            onClick={abrirBuscador}
            aria-label={t('search')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-fg-secondary hover:bg-hover"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <TrialBanner orgId={organizacionId} />
        <EmailVerificationBanner />
      </header>

      <GlobalSearch sinDisparador paginas={paginasBuscables} />
      <ReportarProblemaDialog organizacionId={orgNum} organizacionNombre={organizacionNombre} correo={correo} />
      <MobileTabBar
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

function MobileTabBar({
  pathname,
  secciones,
  pendientes,
  notificaciones,
  asistenteAbierto,
  onAlternarAsistente,
  onAbrirMenu,
}: {
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
      <nav
        aria-label={t('mobileNavigation')}
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ height: 'calc(4rem + env(safe-area-inset-bottom))' }}
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
          />
        </SheetContent>
      </Sheet>
      <DetalleNotificacion notificacion={detalle} onCerrar={() => setDetalle(null)} />
    </>
  );
}
