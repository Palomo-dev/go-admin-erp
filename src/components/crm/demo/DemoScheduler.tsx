'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, Loader2, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { buildDemoChecklist, checklistProgress } from '@/lib/services/crm/demoChecklists';
import { demoApi, type DemoRow } from '@/components/crm/propuestas/proposalApi';

/**
 * F10 — agendar una demo mínima: fecha y hora en la zona horaria de la
 * organización (`plainDateToInstant`), asistentes y checklist por vertical.
 * Sin integración de vídeo: `video_provider` en BD es `none` (placeholder
 * honesto); el enlace de reunión se pega a mano si existe.
 */
export interface DemoSchedulerProps {
  opportunityId: string;
  verticalSlug: string | null;
  defaultAttendee?: { name?: string | null; email?: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = { scheduled: 'Programada', completed: 'Realizada', canceled: 'Cancelada', no_show: 'No asistió' };

export function DemoScheduler({ opportunityId, verticalSlug, defaultAttendee }: DemoSchedulerProps) {
  const { timezone } = useOrgTimezone();
  const { formatDateTime, getToday, toInstant } = useFormatDate();
  const [demos, setDemos] = useState<DemoRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('30');
  const [attendee, setAttendee] = useState(defaultAttendee?.name ?? '');
  const [attendeeEmail, setAttendeeEmail] = useState(defaultAttendee?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const dateInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setDemos(await demoApi.list(opportunityId)); } catch { /* la lista queda vacía; el error aparece al crear */ }
  }, [opportunityId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (creating) { setDate((d) => d || getToday()); dateInput.current?.focus(); } }, [creating, getToday]);

  const restoreFocus = useRef(false);
  useEffect(() => { if (!creating && restoreFocus.current) { restoreFocus.current = false; newButton.current?.focus(); } }, [creating]);
  const closeForm = () => { restoreFocus.current = true; setCreating(false); setError(null); };

  const create = async () => {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Elige la fecha de la demo.'); dateInput.current?.focus(); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { setError('Elige la hora.'); return; }
    const scheduledAt = toInstant(date, time);
    if (Date.parse(scheduledAt) < Date.now() - 60 * 60 * 1000) { setError('La demo no puede quedar en el pasado.'); dateInput.current?.focus(); return; }
    setBusy(true);
    try {
      await demoApi.create({
        opportunity_id: opportunityId,
        scheduled_at: scheduledAt,
        duration_minutes: Number(duration) || 30,
        attendees: attendee.trim() ? [{ name: attendee.trim(), ...(attendeeEmail.trim() ? { email: attendeeEmail.trim() } : {}) }] : [],
        checklist: buildDemoChecklist(verticalSlug),
      });
      toast({ title: 'Demo agendada', description: `${formatDateTime(scheduledAt)} (${timezone})` });
      closeForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agendar la demo');
    } finally {
      setBusy(false);
    }
  };

  const toggleItem = async (demo: DemoRow, index: number) => {
    const checklist = demo.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it));
    setDemos((ds) => ds.map((d) => (d.id === demo.id ? { ...d, checklist } : d)));
    try { await demoApi.update(demo.id, { checklist }); } catch (e) { toast({ title: 'No se pudo guardar el checklist', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); await load(); }
  };

  const setStatus = async (demo: DemoRow, status: string) => {
    try { await demoApi.update(demo.id, { status }); await load(); } catch (e) { toast({ title: 'No se pudo actualizar la demo', description: e instanceof Error ? e.message : 'Error', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />Demo</h2>
        {!creating && <Button ref={newButton} type="button" size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Agendar demo</Button>}
      </div>

      {creating && (
        <form className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void create(); }} aria-describedby={error ? 'demo-error' : undefined}>
          <div className="space-y-1"><Label htmlFor="demo-date" className="text-xs">Fecha ({timezone}) *</Label><Input id="demo-date" ref={dateInput} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" aria-invalid={error ? true : undefined} /></div>
          <div className="space-y-1"><Label htmlFor="demo-time" className="text-xs">Hora *</Label><Input id="demo-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="demo-duration" className="text-xs">Duración (min)</Label><Input id="demo-duration" type="number" min={5} max={480} value={duration} onChange={(e) => setDuration(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label htmlFor="demo-attendee" className="text-xs">Asistente principal</Label><Input id="demo-attendee" value={attendee} onChange={(e) => setAttendee(e.target.value)} className="h-9" placeholder="Nombre" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="demo-attendee-email" className="text-xs">Email del asistente</Label><Input id="demo-attendee-email" type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} className="h-9" /></div>
          <p className="sm:col-span-2 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1"><Video className="h-3.5 w-3.5" aria-hidden="true" />Sin videollamada integrada todavía: comparte el enlace de tu herramienta habitual en la invitación.</p>
          {error && <p id="demo-error" role="alert" className="sm:col-span-2 text-xs text-red-700 dark:text-red-300">{error}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={closeForm} disabled={busy}>Cancelar</Button>
            <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" /> : null}Agendar</Button>
          </div>
        </form>
      )}

      {demos.length === 0 && !creating && <p className="text-sm text-gray-600 dark:text-gray-400">Sin demos agendadas. La demo guiada de 25–40 min con checklist por vertical es el paso previo a la propuesta.</p>}

      <ul className="space-y-2">
        {demos.map((d) => {
          const progress = checklistProgress(d.checklist ?? []);
          return (
            <li key={d.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  <span className="font-medium">{formatDateTime(d.scheduled_at)}</span> · {d.duration_minutes} min · <Badge variant="secondary">{STATUS_LABEL[d.status] ?? d.status}</Badge>
                  {d.attendees?.length ? <span className="text-gray-600 dark:text-gray-400"> · {d.attendees.map((a) => a.name).join(', ')}</span> : null}
                </div>
                {d.status === 'scheduled' && (
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void setStatus(d, 'completed')}>Realizada</Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => void setStatus(d, 'no_show')}>No asistió</Button>
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void setStatus(d, 'canceled')}>Cancelar</Button>
                  </div>
                )}
              </div>
              {d.checklist?.length > 0 && (
                <fieldset className="mt-2">
                  <legend className="text-xs text-gray-600 dark:text-gray-400 mb-1">Checklist · {progress.done}/{progress.total} ({progress.percent} %)</legend>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {d.checklist.map((it, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Checkbox id={`demo-${d.id}-${i}`} checked={it.done} onCheckedChange={() => void toggleItem(d, i)} disabled={d.status !== 'scheduled'} />
                        <Label htmlFor={`demo-${d.id}-${i}`} className="font-normal text-gray-800 dark:text-gray-200">{it.label}</Label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
