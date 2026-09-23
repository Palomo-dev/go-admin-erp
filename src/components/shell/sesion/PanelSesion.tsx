'use client';

/**
 * Contenido del panel de sesión (Figma `02 Componentes` › Sesión ›
 * SessionPopover / SessionSheet). Lo comparten el popover de escritorio y la
 * hoja inferior móvil.
 *
 * Orden del diseño: cabecera (→ Mi perfil) con «Cambiar de cuenta» · cuentas
 * guardadas (acordeón) · tarjeta del plan · uso del plan · Descargar GO Admin
 * Desktop · Tema oscuro · Idioma · Mi suscripción · Cerrar sesión.
 *
 * Reúne lo que antes estaba repartido entre el menú de perfil del header
 * (`ProfileDropdownMenu`) y el selector de cuentas del sidebar
 * (`AccountSwitcher`), que consultaban el plan cada uno por su cuenta. Se
 * conserva el aviso «Correo sin confirmar» con su «Reenviar» (60 s entre
 * envíos), que solo tenía el menú del header.
 *
 * «Configuración» no se repite aquí: ya vive en la navegación del sidebar.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Crown,
  CreditCard,
  Globe,
  Loader2,
  LogOut,
  MailWarning,
  Monitor,
  Moon,
  Plus,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/config';
import { changeLanguage } from '@/i18n/provider';
import { locales, localeNames, type Locale } from '@/i18n/config';
import { isDesktop } from '@/lib/utils/desktop';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DownloadDesktopDialog } from '@/components/pos/configuracion/printers/DownloadDesktopDialog';
import {
  MAX_SAVED_ACCOUNTS,
  getActiveAccountUserId,
  getSavedAccounts,
  isAccountStale,
  removeSavedAccount,
  switchToAccount,
  updateSavedAccountProfile,
  type SavedAccount,
} from '@/lib/auth/accountSwitcher';
import { AvatarUsuario } from './AvatarUsuario';
import { usePlanSesion, type PlanSesion } from './usePlanSesion';

export interface UsuarioSesion {
  name?: string;
  email?: string;
  role?: string;
  avatar?: string;
}

interface PanelSesionProps {
  usuario: UsuarioSesion | null;
  organizacion: string;
  tema: 'light' | 'dark';
  onAlternarTema: () => void;
  onCerrarSesion: () => void;
  cerrandoSesion: boolean;
  /** Cierra el popover o la hoja (al navegar, al cambiar de cuenta). */
  onCerrar: () => void;
  /** drawer = hoja móvil: el selector de idioma abre su propia hoja inferior. */
  modo?: 'rail' | 'expanded' | 'drawer';
}

// Limpia lo que dependía de la cuenta anterior antes de entrar con otra.
function limpiarEstadoDeCuentaAnterior(): void {
  try {
    for (const clave of [
      'currentBranchId',
      'branchFilterAll',
      'appLayout_userData_cache',
      'currentOrganizationId',
      'currentOrganizationName',
      'organizacionActiva',
    ]) {
      localStorage.removeItem(clave);
    }
    sessionStorage.removeItem('currentBranchId');
    sessionStorage.removeItem('organizacionActiva');
  } catch {
    // sin almacenamiento: no hay nada que limpiar
  }
}

/** «14 oct 2026» en la zona horaria de la organización (timestamptz → formatDateInTz). */
function useFechaLarga() {
  const { timezone } = useOrgTimezone();
  return (valor: string | null | undefined) =>
    formatDateInTz(valor, timezone, { day: 'numeric', month: 'short', year: 'numeric' });
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const ENTERO = new Intl.NumberFormat('es-CO');

function Fila({
  icono: Icono,
  titulo,
  descripcion,
  cola,
  destructivo = false,
  onClick,
  href,
  disabled,
  encendido,
}: {
  icono: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  titulo: string;
  descripcion?: string;
  cola?: React.ReactNode;
  destructivo?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /**
   * Si se define, la fila entera es un interruptor (`role="switch"`). El
   * interruptor que se ve al final es solo dibujo: un `<Switch>` de Radix es
   * otro `<button>` y no puede ir dentro de este.
   */
  encendido?: boolean;
}) {
  const clases = cn(
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left outline-none transition-colors',
    'hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
    destructivo ? 'text-danger' : 'text-fg'
  );
  const cuerpo = (
    <>
      <Icono size={20} aria-hidden className={cn('shrink-0', destructivo ? 'text-danger' : 'text-fg-secondary')} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-5">{titulo}</span>
        {descripcion && <span className="text-[13px] leading-[18px] text-fg-secondary">{descripcion}</span>}
      </span>
      {cola}
    </>
  );
  return href ? (
    <Link href={href} className={clases} onClick={onClick}>
      {cuerpo}
    </Link>
  ) : (
    <button
      type="button"
      className={clases}
      onClick={onClick}
      disabled={disabled}
      role={encendido === undefined ? undefined : 'switch'}
      aria-checked={encendido}
    >
      {cuerpo}
    </button>
  );
}

/** Dibujo del interruptor (misma medida que `ui/switch`), sin semántica propia. */
function InterruptorVisual({ encendido }: { encendido: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
        encendido ? 'bg-brand-action' : 'bg-line-strong'
      )}
    >
      <span
        className={cn(
          'block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform',
          encendido ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </span>
  );
}

// Orden del diseño (Figma LanguagePicker 78:3173).
const ORDEN_IDIOMAS: Locale[] = (['es', 'en', 'fr', 'pt'] as Locale[]).filter((l) => locales.includes(l));

/**
 * Selector de idioma (Figma `02 Componentes` › LanguagePicker 78:3173).
 * Escritorio: sub-panel de 280 px anclado a la derecha de la fila «Idioma».
 * Móvil (hoja de sesión): hoja inferior propia con título y cerrar.
 */
function SelectorIdioma({
  locale,
  abierto,
  onAbrir,
  onElegir,
  enHoja,
}: {
  locale: Locale;
  abierto: boolean;
  onAbrir: (abierto: boolean) => void;
  onElegir: (l: Locale) => void;
  enHoja: boolean;
}) {
  const t = useTranslations('session');
  const fila = (
    <Fila
      icono={Globe}
      titulo={t('language')}
      onClick={() => onAbrir(!abierto)}
      cola={
        <span className="flex items-center gap-1 text-xs font-medium text-fg-secondary">
          {localeNames[locale]}
          <ChevronRight size={16} aria-hidden="true" className="text-fg-muted" />
        </span>
      }
    />
  );
  const opciones = (
    <div role="radiogroup" aria-label={t('language')} className="flex flex-col gap-0.5">
      {ORDEN_IDIOMAS.map((l) => {
        const activo = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={activo}
            lang={l}
            onClick={() => onElegir(l)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
              enHoja ? 'py-3' : 'py-2',
              activo ? 'bg-brand-tint' : 'hover:bg-hover'
            )}
          >
            <span className={cn('w-6 shrink-0 text-xs font-semibold', activo ? 'text-brand-deep' : 'text-fg-muted')}>{l.toUpperCase()}</span>
            <span className={cn('flex-1 text-sm font-medium', activo ? 'text-brand-deep' : 'text-fg')}>{localeNames[l]}</span>
            {activo && <Check size={16} aria-hidden="true" className="shrink-0 text-brand-deep" />}
          </button>
        );
      })}
      <p className="pl-2.5 pt-1.5 text-xs font-medium text-fg-muted">{t('languageHint')}</p>
    </div>
  );

  if (enHoja) {
    return (
      <>
        {fila}
        <Sheet open={abierto} onOpenChange={onAbrir}>
          <SheetContent side="bottom" hideCloseButton className="rounded-t-2xl border-line bg-surface px-2 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
            <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-line-strong" aria-hidden="true" />
            <div className="flex items-center justify-between pb-1.5 pl-2 pt-1">
              <SheetTitle className="text-base font-semibold text-fg">{t('language')}</SheetTitle>
              <button
                type="button"
                onClick={() => onAbrir(false)}
                aria-label={t('close')}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {opciones}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={abierto} onOpenChange={onAbrir}>
      <PopoverAnchor asChild>
        <div>{fila}</div>
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={8}
        className="w-[280px] rounded-xl border-line bg-surface p-2 text-fg shadow-md"
      >
        <p className="pb-1.5 pl-2 pt-1 text-sm font-medium text-fg">{t('language')}</p>
        {opciones}
      </PopoverContent>
    </Popover>
  );
}

function BarraUso({ etiqueta, valor, porcentaje, tono }: { etiqueta: string; valor: string; porcentaje: number | null; tono: 'marca' | 'exito' | 'advertencia' | 'peligro' }) {
  const color = { marca: 'bg-brand', exito: 'bg-success', advertencia: 'bg-warning', peligro: 'bg-danger' }[tono];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-[18px] text-fg-secondary">{etiqueta}</span>
        <span className="text-xs font-medium tabular-nums text-fg">{valor}</span>
      </div>
      {porcentaje !== null && (
        <div
          className="h-2 overflow-hidden rounded-full bg-subtle"
          role="progressbar"
          aria-label={etiqueta}
          aria-valuenow={Math.round(porcentaje)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={cn('h-2 rounded-full', color)} style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }} />
        </div>
      )}
    </div>
  );
}

/** Umbral de las barras de uso (Figma › Progress): < 70 % marca, 70–90 % atención, ≥ 90 % límite. */
function tonoPorUso(pct: number): 'marca' | 'advertencia' | 'peligro' {
  if (pct >= 90) return 'peligro';
  if (pct >= 70) return 'advertencia';
  return 'marca';
}

function TarjetaPlan({ datos, onCerrar }: { datos: PlanSesion['plan']; onCerrar: () => void }) {
  const t = useTranslations('session');
  const formatDate = useFechaLarga();
  if (!datos) {
    return (
      <div className="rounded-xl border border-line p-4 text-[13px] text-fg-secondary">
        {t('noPlan')}{' '}
        <Link href="/app/organizacion/plan" onClick={onCerrar} className="font-medium text-link underline">
          {t('choosePlan')}
        </Link>
      </div>
    );
  }
  const estadoBadge = {
    prueba: { texto: t('trialDays', { days: datos.diasPruebaRestantes ?? 0 }), clases: 'border-line-warning bg-warning-subtle text-warning-text' },
    activo: { texto: t('active'), clases: 'border-line-success bg-success-subtle text-success-text' },
    vencido: { texto: t('pastDue'), clases: 'border-line-danger bg-danger-subtle text-danger-text' },
    cancelado: { texto: t('canceled'), clases: 'border-line bg-subtle text-fg-secondary' },
    sin_plan: { texto: t('noPlanShort'), clases: 'border-line bg-subtle text-fg-secondary' },
  }[datos.estado];
  const diasUsados =
    datos.estado === 'prueba' && datos.diasPruebaTotales && datos.diasPruebaRestantes !== null
      ? datos.diasPruebaTotales - datos.diasPruebaRestantes
      : null;
  const esTope = datos.codigo === 'ultimate';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-fg">{t('plan')}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line-brand bg-brand-tint px-2 py-1 text-xs font-semibold text-brand-deep">
            <Crown size={12} aria-hidden="true" />
            {datos.nombre}
          </span>
        </div>
        <span className={cn('shrink-0 rounded-full border px-2 py-1 text-xs font-semibold', estadoBadge.clases)}>{estadoBadge.texto}</span>
      </div>
      {diasUsados !== null && datos.diasPruebaTotales && (
        <BarraUso
          etiqueta={t('trialProgress')}
          valor={t('xOfY', { x: diasUsados, y: datos.diasPruebaTotales, unit: t('days') })}
          porcentaje={(diasUsados / datos.diasPruebaTotales) * 100}
          tono="marca"
        />
      )}
      {datos.precio !== null && (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium tabular-nums text-fg">
            {COP.format(datos.precio)} / {datos.periodo === 'anual' ? t('year') : t('month')}
          </span>
          {datos.proximoCobro && (
            <span className="text-[13px] leading-[18px] text-fg-secondary">
              {datos.cancelaAlFinal
                ? t('endsOn', { date: formatDate(datos.proximoCobro) })
                : datos.estado === 'prueba'
                  ? t('chargedAfterTrial', { date: formatDate(datos.proximoCobro) })
                  : t('renewsOn', { date: formatDate(datos.proximoCobro) })}
            </span>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {!esTope && (
          <Link
            href="/app/organizacion/plan"
            onClick={onCerrar}
            className="flex h-8 flex-1 items-center justify-center rounded-lg bg-brand-action px-3 text-xs font-medium text-fg-on-brand outline-none transition-colors hover:bg-brand-action-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {t('upgradePlan')}
          </Link>
        )}
        <Link
          href="/app/plan"
          onClick={onCerrar}
          className="flex h-8 flex-1 items-center justify-center rounded-lg bg-brand-tint px-3 text-xs font-medium text-brand-deep outline-none transition-colors hover:bg-brand-tint-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          {t('viewSubscription')}
        </Link>
      </div>
    </div>
  );
}

function UsoDelPlan({ uso, onCerrar }: { uso: PlanSesion['uso']; onCerrar: () => void }) {
  const t = useTranslations('session');
  const formatDate = useFechaLarga();
  const fila = (etiqueta: string, actual: number, maximo: number | null, unidad: string) =>
    maximo === null ? (
      <BarraUso etiqueta={etiqueta} valor={t('unlimited', { x: ENTERO.format(actual), unit: unidad })} porcentaje={null} tono="marca" />
    ) : (
      <BarraUso
        etiqueta={etiqueta}
        valor={t('xOfY', { x: ENTERO.format(actual), y: ENTERO.format(maximo), unit: unidad })}
        porcentaje={maximo > 0 ? (actual / maximo) * 100 : 100}
        tono={tonoPorUso(maximo > 0 ? (actual / maximo) * 100 : 100)}
      />
    );
  const { restantesPlan, comprados, cupoMensual, seRenuevan } = uso.creditosIa;
  // Créditos: el color lo da lo que QUEDA del cupo (verde, ámbar por debajo del
  // 20 %, rojo agotado). Los comprados no caducan con el ciclo y se muestran aparte.
  const pctRestante = cupoMensual ? (restantesPlan / cupoMensual) * 100 : null;
  const tonoCreditos = restantesPlan + comprados <= 0 ? 'peligro' : pctRestante !== null && pctRestante < 20 ? 'advertencia' : 'exito';

  return (
    <div className="flex flex-col gap-3 p-2">
      <span className="text-xs font-medium text-fg-muted">{t('planUsage')}</span>
      {fila(t('users'), uso.usuarios.actual, uso.usuarios.maximo, t('usersUnit'))}
      {fila(t('branches'), uso.sucursales.actual, uso.sucursales.maximo, t('branchesUnit'))}
      <BarraUso
        etiqueta={t('aiCredits')}
        valor={
          // Si quedan más que el cupo (bono o cambio de plan), «1.000 de 500» no
          // tiene sentido: se muestran solo los disponibles.
          cupoMensual && restantesPlan <= cupoMensual
            ? t('xOfY', { x: ENTERO.format(restantesPlan), y: ENTERO.format(cupoMensual), unit: '' }).trim()
            : t('creditsAvailable', { count: ENTERO.format(restantesPlan) })
        }
        porcentaje={pctRestante === null ? null : Math.min(100, pctRestante)}
        tono={tonoCreditos}
      />
      {comprados > 0 && (
        <span className="-mt-1 text-xs text-fg-secondary">{t('purchasedCredits', { count: ENTERO.format(comprados) })}</span>
      )}
      <div className="flex items-center justify-between gap-2 text-xs font-medium">
        <span className="text-fg-secondary">{seRenuevan ? t('renewsCredits', { date: formatDate(seRenuevan) }) : ''}</span>
        <Link href="/app/plan" onClick={onCerrar} className="text-link underline underline-offset-2">
          {t('buyCredits')}
        </Link>
      </div>
    </div>
  );
}

export function PanelSesion({ usuario, organizacion, tema, onAlternarTema, onCerrarSesion, cerrandoSesion, onCerrar, modo }: PanelSesionProps) {
  const t = useTranslations('session');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const { datos, cargando } = usePlanSesion();

  const [verCuentas, setVerCuentas] = useState(false);
  const [verIdiomas, setVerIdiomas] = useState(false);
  const [cuentas, setCuentas] = useState<SavedAccount[]>([]);
  const [activaId, setActivaId] = useState<string | null>(null);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);
  const [errorCambio, setErrorCambio] = useState<string | null>(null);
  const [correoConfirmado, setCorreoConfirmado] = useState(true);
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [verDescarga, setVerDescarga] = useState(false);
  const enDesktop = useMemo(() => isDesktop(), []);

  useEffect(() => {
    setCuentas(getSavedAccounts());
    setActivaId(getActiveAccountUserId());
    supabase.auth.getUser().then(({ data }) => setCorreoConfirmado(!!data.user?.email_confirmed_at));
  }, []);

  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  const otras = cuentas.filter((c) => c.userId !== activaId);

  // Las cuentas que nunca estuvieron activas en este navegador no tienen
  // nombre: se resuelve desde `profiles` al abrir la lista (lo hacía igual el
  // selector viejo) y se guarda en el registro local.
  useEffect(() => {
    if (!verCuentas) return;
    const pendientes = otras.filter((c) => !c.name || c.name === c.email);
    if (pendientes.length === 0) return;
    let cancelado = false;
    void supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', pendientes.map((c) => c.userId))
      .then(({ data }) => {
        if (cancelado || !data) return;
        for (const p of data) {
          const nombre = `${p.first_name || ''} ${p.last_name || ''}`.trim();
          if (nombre) updateSavedAccountProfile(p.id, { name: nombre, avatarUrl: p.avatar_url || undefined });
        }
        setCuentas(getSavedAccounts());
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verCuentas]);

  const cambiarCuenta = async (cuenta: SavedAccount) => {
    setCambiandoId(cuenta.userId);
    setErrorCambio(null);
    const r = await switchToAccount(cuenta.userId);
    if (!r.ok) {
      setErrorCambio(r.error || t('switchError'));
      setCuentas(getSavedAccounts());
      setCambiandoId(null);
      return;
    }
    limpiarEstadoDeCuentaAnterior();
    window.location.href = '/app/inicio';
  };

  const reenviarConfirmacion = async () => {
    if (!usuario?.email || reenviando || espera > 0) return;
    setReenviando(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: usuario.email });
    setReenviando(false);
    if (error) {
      toast.error(t('resendError'), { description: error.message });
      return;
    }
    toast.success(t('resendOk'), { description: t('resendOkDescription') });
    setEspera(60);
  };

  const elegirIdioma = async (nuevo: Locale) => {
    setVerIdiomas(false);
    if (nuevo === locale) return;
    changeLanguage(nuevo);
    // Se guarda en el perfil para que viaje a otros dispositivos, como hace
    // «Datos personales». Si falla, el idioma cambia igual en este dispositivo.
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { error } = await supabase.from('profiles').update({ preferred_language: nuevo }).eq('id', data.user.id);
      if (error) console.warn('[PanelSesion] no se guardó el idioma en el perfil', error.message);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Cabecera → Mi perfil. El › va dentro del botón del perfil: fuera de él
          parecía un tercer botón que no hacía nada. */}
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={() => {
            onCerrar();
            router.push('/app/perfil');
          }}
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={t('viewProfile')}
          title={t('viewProfile')}
        >
          <AvatarUsuario nombre={usuario?.name} correo={usuario?.email} foto={usuario?.avatar} tamano={48} indicador />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base font-semibold leading-[22px] text-fg">{usuario?.name || usuario?.email || '—'}</span>
            {usuario?.email && <span className="truncate text-[13px] leading-[18px] text-fg-secondary">{usuario.email}</span>}
            <span className="flex min-w-0 items-center gap-1.5 pt-0.5 text-xs font-medium text-fg-secondary">
              <Building2 size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">
                {organizacion}
                {usuario?.role ? ` · ${usuario.role}` : ''}
              </span>
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-fg-muted transition-colors group-hover:text-fg" />
        </button>
        <button
          type="button"
          onClick={() => setVerCuentas((v) => !v)}
          aria-expanded={verCuentas}
          aria-label={t('switchAccount')}
          title={t('switchAccount')}
          className={cn(
            'flex h-8 shrink-0 items-center gap-0.5 rounded-lg px-1.5 text-fg-secondary outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand',
            verCuentas && 'bg-hover text-fg'
          )}
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
          {verCuentas ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>

      {/* Cuentas guardadas */}
      {verCuentas && (
        <div className="flex flex-col gap-0.5">
          <span className="px-2 py-1 text-xs font-medium text-fg-muted">{t('otherAccounts')}</span>
          {errorCambio && <p className="px-2 text-xs font-medium text-danger-text">{errorCambio}</p>}
          {otras.map((c) => {
            const vieja = isAccountStale(c);
            const cambiando = cambiandoId === c.userId;
            return (
              <div key={c.userId} className={cn('flex items-center gap-2.5 rounded-lg p-2 hover:bg-hover', cambiandoId && !cambiando && 'opacity-50')}>
                <button
                  type="button"
                  disabled={!!cambiandoId}
                  onClick={() => cambiarCuenta(c)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <AvatarUsuario nombre={c.name} correo={c.email} foto={c.avatarUrl} tamano={32} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-fg">{c.name || c.email}</span>
                    <span className="truncate text-[13px] text-fg-secondary">{c.email}</span>
                    {cambiando && (
                      <span className="flex items-center gap-1 text-xs font-medium text-brand-deep">
                        <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                        {t('switching')}
                      </span>
                    )}
                    {vieja && !cambiando && (
                      <span className="flex items-center gap-1 text-xs font-medium text-warning-text">
                        <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />
                        {t('staleSession')}
                      </span>
                    )}
                  </span>
                </button>
                {!cambiando && (
                  <button
                    type="button"
                    onClick={() => {
                      removeSavedAccount(c.userId);
                      setCuentas(getSavedAccounts());
                    }}
                    aria-label={t('removeAccount', { name: c.name || c.email })}
                    title={t('removeAccount', { name: c.name || c.email })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-muted outline-none hover:bg-pressed hover:text-fg focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {cuentas.length < MAX_SAVED_ACCOUNTS ? (
            <button
              type="button"
              onClick={() => {
                onCerrar();
                router.push('/auth/login?addAccount=1');
              }}
              className="flex items-center gap-2.5 rounded-lg p-2 text-left outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-brand-deep">
                <Plus size={16} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-brand-deep">{t('addAccount')}</span>
            </button>
          ) : (
            <p className="px-2 py-1 text-xs text-fg-secondary">{t('maxAccounts', { max: MAX_SAVED_ACCOUNTS })}</p>
          )}
        </div>
      )}

      <div className="h-px bg-line" />

      {/* Correo sin confirmar */}
      {!correoConfirmado && (
        <div className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3">
          <MailWarning size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warning-text" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13px] font-medium text-warning-text">{t('emailNotConfirmed')}</span>
            <button
              type="button"
              onClick={reenviarConfirmacion}
              disabled={reenviando || espera > 0}
              className="self-start text-xs font-medium text-link underline underline-offset-2 disabled:no-underline disabled:opacity-60"
            >
              {reenviando ? t('sending') : espera > 0 ? t('resendIn', { seconds: espera }) : t('resend')}
            </button>
          </div>
        </div>
      )}

      {/* Plan y uso */}
      {cargando && !datos ? (
        <div aria-hidden="true" className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <span className="h-4 w-32 animate-pulse rounded bg-subtle" />
          <span className="h-2 w-full animate-pulse rounded bg-subtle" />
          <span className="h-8 w-full animate-pulse rounded bg-subtle" />
        </div>
      ) : datos ? (
        <>
          <TarjetaPlan datos={datos.plan} onCerrar={onCerrar} />
          <UsoDelPlan uso={datos.uso} onCerrar={onCerrar} />
        </>
      ) : null}

      <div className="h-px bg-line" />

      {!enDesktop && (
        <Fila icono={Monitor} titulo={t('downloadDesktop')} descripcion={t('downloadDesktopDescription')} onClick={() => setVerDescarga(true)} />
      )}
      <Fila
        icono={Moon}
        titulo={t('darkTheme')}
        onClick={onAlternarTema}
        encendido={tema === 'dark'}
        cola={<InterruptorVisual encendido={tema === 'dark'} />}
      />
      <SelectorIdioma
        locale={locale}
        abierto={verIdiomas}
        onAbrir={setVerIdiomas}
        onElegir={elegirIdioma}
        enHoja={modo === 'drawer'}
      />
      <Fila
        icono={CreditCard}
        titulo={t('mySubscription')}
        href="/app/plan"
        onClick={onCerrar}
        cola={<ChevronRight size={16} aria-hidden="true" className="text-fg-muted" />}
      />

      <div className="h-px bg-line" />

      <Fila icono={LogOut} titulo={cerrandoSesion ? t('signingOut') : t('signOut')} destructivo onClick={onCerrarSesion} disabled={cerrandoSesion} />

      <DownloadDesktopDialog open={verDescarga} onOpenChange={setVerDescarga} />
    </div>
  );
}
