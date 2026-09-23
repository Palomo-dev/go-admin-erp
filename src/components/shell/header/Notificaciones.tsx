'use client';

/**
 * Campana del header y su panel (Figma `02 Componentes` › NotificationsBell
 * 45:2099 y NotificationsPopover 46:2810).
 *
 * El panel es el mismo en el popover de escritorio y en la hoja móvil (pestaña
 * «Alertas» del MobileTabBar). Los datos llegan de `useNotificacionesHeader`,
 * que se instancia una vez en el header.
 *
 * Contador: no leídas de la organización + recordatorios de tareas si PM está
 * activo, con tope «99+». Las horas pasan por la zona de la organización.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowUpRight, Bell, Check, ClipboardList, Mail, MessageSquare, Smartphone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NotificationDetailSheet, getTypeIcon } from '@/components/notificaciones/NotificationDetailSheet';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, formatTimeInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import type { TaskReminder } from '@/lib/hooks/useTaskReminders';
import type { AlcanceNotificaciones, NotificacionHeader, NotificacionesHeader } from './useNotificacionesHeader';

export function textoContador(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function useHoraRelativa() {
  const t = useTranslations('header');
  const locale = useLocale();
  const { timezone } = useOrgTimezone();
  return (iso: string) => {
    const fecha = new Date(iso);
    const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
    if (minutos < 1) return t('justNow');
    if (minutos < 60) return t('minutesAgo', { n: minutos });
    const hoy = toPlainDate(new Date(), timezone);
    const dia = toPlainDate(fecha, timezone);
    if (dia === hoy) return t('todayAt', { time: formatTimeInTz(fecha, timezone) });
    if (dia === toPlainDate(new Date(Date.now() - 86400000), timezone)) return t('yesterday');
    return formatDateInTz(fecha, timezone, { day: 'numeric', month: 'short', locale });
  };
}

function iconoDe(n: NotificacionHeader) {
  const tipo = typeof n.payload?.type === 'string' ? n.payload.type : '';
  if (tipo) return getTypeIcon(tipo);
  if (n.channel === 'email') return Mail;
  if (n.channel === 'sms') return Smartphone;
  if (n.channel === 'whatsapp') return MessageSquare;
  return Bell;
}

function Vacio() {
  const t = useTranslations('header');
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle">
        <Check className="h-5 w-5 text-success-text" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-fg">{t('noPending')}</p>
      <p className="mt-1 text-sm text-fg-secondary">{t('noPendingHint')}</p>
    </div>
  );
}

function FilaTarea({ r, onAbrir }: { r: TaskReminder; onAbrir: () => void }) {
  const t = useTranslations('header');
  const vence = r.isOverdue
    ? t('taskOverdue', { n: Math.abs(r.daysUntilDue) })
    : r.daysUntilDue === 0
      ? t('taskDueToday')
      : t('taskDueIn', { n: r.daysUntilDue });
  return (
    <button
      type="button"
      onClick={onAbrir}
      className="flex w-full gap-3 rounded-lg p-2.5 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-subtle">
        <ClipboardList className="h-4 w-4 text-fg-secondary" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{r.title}</span>
        {r.customer?.name && <span className="block truncate text-sm text-fg-secondary">{r.customer.name}</span>}
        <span className={cn('block text-xs', r.isOverdue ? 'font-medium text-danger-text' : 'text-fg-muted')}>{vence}</span>
      </span>
    </button>
  );
}

export function PanelNotificaciones({
  datos,
  onCerrar,
  onAbrir,
  enHoja = false,
}: {
  datos: NotificacionesHeader;
  onCerrar: () => void;
  /** Abre el detalle; lo pinta quien monta el panel, fuera del popover. */
  onAbrir: (n: NotificacionHeader) => void;
  /** En la hoja móvil se muestra la X de cerrar. */
  enHoja?: boolean;
}) {
  const t = useTranslations('header');
  const router = useRouter();
  const hora = useHoraRelativa();
  const [pestana, setPestana] = useState<'notificaciones' | 'tareas'>('notificaciones');
  const [alcance, setAlcance] = useState<AlcanceNotificaciones>('mine');

  const lista = alcance === 'mine' ? datos.mias : datos.todas;
  const noLeidas = alcance === 'mine' ? datos.noLeidasMias : datos.noLeidasTodas;

  const abrir = (n: NotificacionHeader) => {
    void datos.marcarLeida(n);
    onAbrir({ ...n, is_read_by_me: true });
  };

  return (
    <div className="flex max-h-[min(640px,calc(100dvh-96px))] flex-col">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-fg">{t('notifications')}</h2>
          <p className="text-xs font-medium text-fg-secondary">
            {datos.pendientes > 0 ? t('pendingCount', { n: datos.pendientes }) : t('upToDate')}
          </p>
        </div>
        {pestana === 'notificaciones' && noLeidas > 0 && (
          <button
            type="button"
            onClick={() => void datos.marcarTodas(alcance)}
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t('markAllRead')}
          </button>
        )}
        {enHoja && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('close')}
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {datos.pmActivo && (
        <div role="tablist" className="mx-4 grid grid-cols-2 gap-1 rounded-lg bg-subtle p-1">
          {(['notificaciones', 'tareas'] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={pestana === p}
              onClick={() => setPestana(p)}
              className={cn(
                'flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors',
                pestana === p ? 'bg-surface text-fg shadow-sm' : 'text-fg-secondary hover:text-fg'
              )}
            >
              {p === 'notificaciones' ? t('notifications') : t('tasks')}
              {p === 'tareas' && datos.recordatorios.length > 0 && (
                <span className="rounded-full bg-warning-subtle px-1.5 text-xs font-semibold text-warning-text">
                  {datos.recordatorios.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {pestana === 'notificaciones' && (
        <div className="flex gap-2 px-4 pb-1 pt-3" role="group" aria-label={t('scope')}>
          {(['mine', 'all'] as const).map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={alcance === a}
              onClick={() => setAlcance(a)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                alcance === a ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-subtle text-fg-secondary hover:text-fg'
              )}
            >
              {a === 'mine' ? t('mine') : t('all')}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {pestana === 'tareas' ? (
          datos.cargandoTareas && datos.recordatorios.length === 0 ? (
            <Esqueleto />
          ) : datos.recordatorios.length === 0 ? (
            <Vacio />
          ) : (
            datos.recordatorios.map((r) => (
              <FilaTarea
                key={r.id}
                r={r}
                onAbrir={() => {
                  onCerrar();
                  router.push(`/app/pm/tareas?taskId=${r.id}`);
                }}
              />
            ))
          )
        ) : datos.cargando && lista.length === 0 ? (
          <Esqueleto />
        ) : lista.length === 0 ? (
          <Vacio />
        ) : (
          <ul className="flex flex-col gap-1">
            {lista.map((n) => {
              const Icono = iconoDe(n);
              const titulo = (typeof n.payload?.title === 'string' && n.payload.title) || t('notification');
              const contenido = typeof n.payload?.content === 'string' ? n.payload.content : '';
              const nueva = !n.is_read_by_me;
              return (
                <li key={n.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={cn(
                      'flex w-full gap-3 rounded-lg p-2.5 pr-8 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand',
                      nueva ? 'bg-brand-tint hover:bg-brand-tint-hover' : 'hover:bg-hover'
                    )}
                  >
                    <Icono className="mt-0.5 h-5 w-5 shrink-0 text-fg-secondary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{titulo}</span>
                      {contenido && <span className="line-clamp-2 block text-sm text-fg-secondary">{contenido}</span>}
                      <span className="block text-xs text-fg-muted">{hora(n.created_at)}</span>
                    </span>
                    {nueva && (
                      <>
                        <span className="absolute right-3 top-3.5 h-2 w-2 rounded-full bg-brand group-hover:hidden" aria-hidden="true" />
                        <span className="sr-only">{t('unread')}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void datos.descartar(n)}
                    aria-label={t('dismiss')}
                    className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg focus-visible:flex group-hover:flex"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-2">
        <Link
          href={pestana === 'tareas' ? '/app/pm/tareas' : '/app/notificaciones'}
          onClick={onCerrar}
          className="flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium text-fg outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          {t('seeAll')}
        </Link>
      </div>
    </div>
  );
}

/** Hoja de detalle de una notificación, montada fuera del popover o de la hoja móvil. */
export function DetalleNotificacion({ notificacion, onCerrar }: { notificacion: NotificacionHeader | null; onCerrar: () => void }) {
  const router = useRouter();
  return (
    <NotificationDetailSheet
      notification={notificacion}
      open={!!notificacion}
      onOpenChange={(o) => !o && onCerrar()}
      onNavigate={(url) => {
        onCerrar();
        router.push(url);
      }}
    />
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-2 p-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-subtle" />
      ))}
    </div>
  );
}

export function NotificationsBell({ datos }: { datos: NotificacionesHeader }) {
  const t = useTranslations('header');
  const [abierto, setAbierto] = useState(false);
  const [detalle, setDetalle] = useState<NotificacionHeader | null>(null);
  const n = datos.pendientes;
  return (
    <>
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={n > 0 ? t('notificationsWithCount', { n }) : t('notifications')}
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-fg-secondary outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-hover"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {n > 0 && (
            <span className="absolute left-[22px] top-0.5 rounded-full border-2 border-surface bg-danger px-[5px] text-xs font-semibold leading-4 text-white">
              {textoContador(n)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[360px] overflow-hidden rounded-xl border-line bg-surface p-0 shadow-md">
        <PanelNotificaciones
          datos={datos}
          onCerrar={() => setAbierto(false)}
          onAbrir={(x) => {
            setAbierto(false);
            setDetalle(x);
          }}
        />
      </PopoverContent>
    </Popover>
    <DetalleNotificacion notificacion={detalle} onCerrar={() => setDetalle(null)} />
    </>
  );
}
