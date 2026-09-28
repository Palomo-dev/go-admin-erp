'use client';

/**
 * Vista rápida de una tarea desde la campana (Figma `02 Componentes` ›
 * TaskQuickView 626:14723 y PosponerMenu 626:14725). Antes, tocar un
 * recordatorio saltaba a /app/pm/tareas sin vista previa.
 *
 * Escritorio: hoja lateral de 440 px. Móvil: hoja inferior.
 * - Cabecera: título, vencimiento (vencida / hoy / en N días) y prioridad.
 * - Asignado a · Cliente · Proyecto · Vence, y la descripción.
 * - «Marcar como completada» (principal) → la hoja se queda con «Deshacer».
 * - «Posponer»: mañana o la próxima semana a la hora de apertura de la
 *   organización (8:00 si no tiene horario), o una fecha a elegir.
 * - «Abrir en Tareas».
 *
 * Completar, deshacer y posponer pasan por `pmService` (recalcula el progreso
 * del proyecto, la meta y el resultado clave). Fechas en la zona de la
 * organización.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, Calendar, CalendarClock, Check, CheckCircle2, ChevronRight, ClipboardList, Clock, ExternalLink, RefreshCw, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { formatDateInTz, plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';
import { pmService } from '@/lib/services/pmService';

interface TareaDetalle {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  asignado: string | null;
  cliente: { id: string; nombre: string } | null;
  proyecto: string | null;
}

const TONO_PRIORIDAD: Record<string, string> = {
  critical: 'border-line-danger bg-danger-subtle text-danger-text',
  high: 'border-line-warning bg-warning-subtle text-warning-text',
  med: 'border-line-info bg-info-subtle text-info-text',
  low: 'border-line bg-subtle text-fg-secondary',
};

const badge = 'rounded-full border px-2 py-0.5 text-xs font-semibold leading-4';

/** Suma días a un día calendario YYYY-MM-DD (sin pasar por la zona del navegador). */
function sumarDias(plain: string, dias: number): string {
  const [a, m, d] = plain.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

function diaSemana(plain: string): number {
  const [a, m, d] = plain.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

async function cargarTarea(id: string): Promise<TareaDetalle> {
  const orgId = getOrganizationId();
  const { data: t, error } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, priority, status, assigned_to, customer_id, project_id, related_to_type, related_to_id')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!t) throw new Error('not_found');

  const clienteId = t.customer_id ?? (t.related_to_type === 'cliente' ? t.related_to_id : null);
  const [perfil, cliente, proyecto] = await Promise.all([
    t.assigned_to ? supabase.from('profiles').select('first_name, last_name').eq('id', t.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
    clienteId ? supabase.from('customers').select('id, full_name').eq('id', clienteId).maybeSingle() : Promise.resolve({ data: null }),
    t.project_id ? supabase.from('projects').select('name').eq('id', t.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = perfil.data as { first_name?: string | null; last_name?: string | null } | null;
  const c = cliente.data as { id: string; full_name?: string | null } | null;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
    asignado: p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null : null,
    cliente: c ? { id: c.id, nombre: c.full_name ?? '' } : null,
    proyecto: (proyecto.data as { name?: string } | null)?.name ?? null,
  };
}

interface VistaRapidaTareaProps {
  tareaId: string | null;
  onCerrar: () => void;
  /** Tras completar, deshacer o posponer: la campana refresca sus recordatorios. */
  onCambio?: () => void;
}

export function VistaRapidaTarea({ tareaId, onCerrar, onCambio }: VistaRapidaTareaProps) {
  const t = useTranslations('header.task');
  const locale = useLocale();
  const movil = useMediaQuery('(max-width: 1023px)');
  const { timezone, operatingHours } = useOrgTimezone();
  const [tarea, setTarea] = useState<TareaDetalle | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [completada, setCompletada] = useState<{ estadoAnterior: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [posponerAbierto, setPosponerAbierto] = useState(false);
  const [eligiendoFecha, setEligiendoFecha] = useState(false);
  const [fechaElegida, setFechaElegida] = useState('');

  useEffect(() => {
    if (!tareaId) return;
    let vivo = true;
    setCargando(true);
    setError(false);
    setCompletada(null);
    cargarTarea(tareaId)
      .then((d) => vivo && setTarea(d))
      .catch((e) => {
        console.error('[VistaRapidaTarea] cargar', e);
        if (vivo) setError(true);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [tareaId, intento]);

  const hora = operatingHours?.start_time?.slice(0, 5) || '08:00';
  const hoy = toPlainDate(new Date(), timezone);
  const opciones = useMemo(() => {
    const manana = sumarDias(hoy, 1);
    const dias = (8 - diaSemana(hoy)) % 7 || 7; // próximo lunes
    const lunes = sumarDias(hoy, dias);
    return [
      { clave: 'tomorrow', plain: manana, Icono: Clock },
      { clave: 'nextWeek', plain: lunes, Icono: CalendarClock },
    ];
  }, [hoy]);
  const etiquetaDia = (plain: string) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${plain}T12:00:00Z`));

  const vencimiento = useMemo(() => {
    if (!tarea?.due_date) return null;
    const due = toPlainDate(new Date(tarea.due_date), timezone);
    const [a1, m1, d1] = hoy.split('-').map(Number);
    const [a2, m2, d2] = due.split('-').map(Number);
    const dias = Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
    if (dias < 0) return { texto: t('overdue', { n: -dias }), clase: 'border-line-danger bg-danger-subtle text-danger-text' };
    if (dias === 0) return { texto: t('dueToday'), clase: 'border-line-warning bg-warning-subtle text-warning-text' };
    return { texto: t('dueIn', { n: dias }), clase: 'border-line bg-subtle text-fg-secondary' };
  }, [tarea?.due_date, timezone, hoy, t]);

  const completar = useCallback(async () => {
    if (!tarea) return;
    setOcupado(true);
    try {
      await pmService.updateTaskStatus(tarea.id, 'done');
      setCompletada({ estadoAnterior: tarea.status && tarea.status !== 'done' ? tarea.status : 'open' });
      onCambio?.();
    } catch (e) {
      console.error('[VistaRapidaTarea] completar', e);
      toast.error(t('actionError'));
    } finally {
      setOcupado(false);
    }
  }, [tarea, onCambio, t]);

  const deshacer = useCallback(async () => {
    if (!tarea || !completada) return;
    setOcupado(true);
    try {
      await pmService.updateTaskStatus(tarea.id, completada.estadoAnterior);
      setCompletada(null);
      onCambio?.();
    } catch (e) {
      console.error('[VistaRapidaTarea] deshacer', e);
      toast.error(t('actionError'));
    } finally {
      setOcupado(false);
    }
  }, [tarea, completada, onCambio, t]);

  const posponer = useCallback(
    async (plain: string) => {
      if (!tarea || !plain) return;
      setOcupado(true);
      try {
        const due = plainDateToInstant(plain, timezone, hora);
        await pmService.updateTask(tarea.id, { due_date: due });
        setTarea({ ...tarea, due_date: due });
        setPosponerAbierto(false);
        setEligiendoFecha(false);
        toast.success(t('postponedTo', { date: `${etiquetaDia(plain)} · ${hora}` }));
        onCambio?.();
      } catch (e) {
        console.error('[VistaRapidaTarea] posponer', e);
        toast.error(t('actionError'));
      } finally {
        setOcupado(false);
      }
    },
    // etiquetaDia depende de locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tarea, timezone, hora, onCambio, t, locale]
  );

  const abrirEnTareas = tareaId ? `/app/pm/tareas?taskId=${tareaId}` : '/app/pm/tareas';
  const titulo = tarea?.title ?? '';

  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="flex items-center gap-3 px-3 py-2.5 text-sm">
      <dt className="w-24 shrink-0 text-fg-secondary">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 text-fg">{valor}</dd>
    </div>
  );

  return (
    <Sheet open={!!tareaId} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent
        side={movil ? 'bottom' : 'right'}
        hideCloseButton
        className={cn(
          'flex flex-col gap-0 border-line bg-surface p-0 text-fg',
          movil ? 'max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'h-full w-full sm:max-w-[440px]'
        )}
      >
        {movil && <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />}

        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <span
            className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', completada ? 'bg-success-subtle text-success-text' : 'bg-subtle text-fg-secondary')}
            aria-hidden="true"
          >
            {completada ? <CheckCircle2 className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className={cn('text-base font-semibold leading-[22px] text-fg', completada && 'text-fg-muted line-through')}>
              {cargando && !tarea ? <span className="block h-4 w-3/4 animate-pulse rounded bg-subtle" /> : titulo || t('task')}
            </SheetTitle>
            <SheetDescription className="sr-only">{t('srDescription')}</SheetDescription>
            {tarea && !error && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {completada ? (
                  <span className={cn(badge, 'border-line-success bg-success-subtle text-success-text')}>{t('completed')}</span>
                ) : (
                  vencimiento && <span className={cn(badge, vencimiento.clase)}>{vencimiento.texto}</span>
                )}
                {tarea.priority && (
                  <span className={cn(badge, TONO_PRIORIDAD[tarea.priority] ?? TONO_PRIORIDAD.low)}>
                    {t(`priority.${tarea.priority in TONO_PRIORIDAD ? tarea.priority : 'low'}`)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t('close')}
            className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-line-danger bg-danger-subtle p-3" role="alert">
              <p className="flex items-center gap-2 text-sm font-medium text-danger-text">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('loadError')}
              </p>
              <p className="mt-1 pl-6 text-xs text-fg-secondary">{t('loadErrorHint')}</p>
              <button
                type="button"
                onClick={() => setIntento((x) => x + 1)}
                className="ml-4 mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-hover"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('retry')}
              </button>
            </div>
          ) : cargando && !tarea ? (
            <div className="space-y-2.5 rounded-lg border border-line p-3" aria-hidden="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-3 w-3/5 animate-pulse rounded bg-subtle" />
              ))}
            </div>
          ) : tarea ? (
            <>
              {completada && (
                <div className="flex items-start gap-2 rounded-lg border border-line-success bg-success-subtle p-3" role="status">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
                  <p className="flex-1 text-sm text-success-text">{t('completedHint')}</p>
                  <button
                    type="button"
                    onClick={() => void deshacer()}
                    disabled={ocupado}
                    className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
                  >
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('undo')}
                  </button>
                </div>
              )}
              <dl className="divide-y divide-line rounded-lg border border-line">
                {fila(
                  t('assignedTo'),
                  tarea.asignado ? (
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-medium text-fg-on-brand" aria-hidden="true">
                        {iniciales(tarea.asignado)}
                      </span>
                      <span className="truncate">{tarea.asignado}</span>
                    </span>
                  ) : (
                    <span className="text-fg-muted">{t('unassigned')}</span>
                  )
                )}
                {tarea.cliente &&
                  fila(
                    t('customer'),
                    <Link href={`/app/clientes/${tarea.cliente.id}`} onClick={onCerrar} className="truncate text-link hover:underline">
                      {tarea.cliente.nombre}
                    </Link>
                  )}
                {tarea.proyecto && fila(t('project'), <span className="truncate">{tarea.proyecto}</span>)}
                {fila(
                  t('due'),
                  tarea.due_date ? (
                    formatDateInTz(tarea.due_date, timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', locale })
                  ) : (
                    <span className="text-fg-muted">{t('noDueDate')}</span>
                  )
                )}
              </dl>
              {tarea.description && (
                <div>
                  <p className="text-xs font-medium text-fg-muted">{t('description')}</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-5 text-fg-secondary">{tarea.description}</p>
                </div>
              )}
            </>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-line px-5 py-4">
          {error ? (
            <Link
              href={abrirEnTareas}
              onClick={onCerrar}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-action text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t('openInTasks')}
            </Link>
          ) : completada ? (
            <>
              <button
                type="button"
                onClick={onCerrar}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-brand-tint text-sm font-medium text-brand-deep hover:bg-brand-tint-hover"
              >
                {t('close')}
              </button>
              <Link href={abrirEnTareas} onClick={onCerrar} className="flex w-fit items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-fg hover:bg-hover">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t('openInTasks')}
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void completar()}
                disabled={!tarea || ocupado}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-action text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t('markDone')}
              </button>
              <div className="flex items-center justify-between">
                <Popover
                  open={posponerAbierto}
                  onOpenChange={(o) => {
                    setPosponerAbierto(o);
                    if (!o) setEligiendoFecha(false);
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={!tarea || ocupado}
                      className="flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-fg hover:bg-hover disabled:opacity-50"
                    >
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {t('postpone')}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-72 rounded-xl border-line bg-surface p-2 text-fg shadow-md">
                    <p className="px-2 pb-1 pt-1 text-xs font-medium text-fg-muted">{t('postponeUntil')}</p>
                    {eligiendoFecha ? (
                      <div className="flex flex-col gap-2 p-2">
                        <input
                          type="date"
                          value={fechaElegida}
                          min={sumarDias(hoy, 1)}
                          onChange={(e) => setFechaElegida(e.target.value)}
                          aria-label={t('pickDate')}
                          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-fg"
                        />
                        <button
                          type="button"
                          disabled={!fechaElegida || ocupado}
                          onClick={() => void posponer(fechaElegida)}
                          className="h-9 rounded-lg bg-brand-action text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover disabled:opacity-50"
                        >
                          {t('postponeAt', { time: hora })}
                        </button>
                      </div>
                    ) : (
                      <>
                        {opciones.map(({ clave, plain, Icono }) => (
                          <button
                            key={clave}
                            type="button"
                            onClick={() => void posponer(plain)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium text-fg hover:bg-hover"
                          >
                            <Icono className="h-4 w-4 shrink-0 text-fg-secondary" aria-hidden="true" />
                            <span className="flex-1">{t(clave)}</span>
                            <span className="text-xs font-normal text-fg-muted">
                              {etiquetaDia(plain)} · {hora}
                            </span>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEligiendoFecha(true)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm font-medium text-fg hover:bg-hover"
                        >
                          <Calendar className="h-4 w-4 shrink-0 text-fg-secondary" aria-hidden="true" />
                          <span className="flex-1">{t('pickDate')}</span>
                          <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </PopoverContent>
                </Popover>
                <Link href={abrirEnTareas} onClick={onCerrar} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-fg hover:bg-hover">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  {t('openInTasks')}
                </Link>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
