'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bot,
  Calendar as CalendarIcon,
  CheckSquare,
  Clock,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Settings,
  StickyNote,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchSelect } from '@/components/ui/search-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/utils/Utils';
import {
  Activity,
  ActivityDirection,
  ActivityType,
  RelatedType,
  ACTIVITY_TYPE_CONFIG,
  CreateActivityInput,
  DIRECTIONAL_TYPES,
  DIRECTION_LABELS,
  MANUAL_ACTIVITY_TYPES,
  OUTCOME_OPTIONS,
  TIMED_TYPES,
  UpdateActivityInput,
} from './types';

/**
 * ActividadForm — registro de una actividad ya ocurrida.
 *
 * El formulario ya no es genérico: cada tipo pide lo suyo.
 *   · llamada / correo / WhatsApp / SMS → sentido (`channel`) y resultado
 *   · llamada / reunión / visita        → duración
 *   · correo                            → asunto (`metadata.subject`)
 *   · reunión / visita                  → lugar o enlace (`metadata.location`)
 *   · nota                              → solo el texto
 *   · tarea                             → NO se inventa aquí: delega en el
 *     diálogo unificado de tarea (`onRequestTask`), que escribe en `tasks`.
 *
 * Todos los campos existen de verdad en la tabla `activities` (verificado
 * contra la BD: channel, outcome, duration_seconds, metadata).
 */

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Phone,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MessageCircle,
  Settings,
  MessageSquare,
  Bot,
  CheckSquare,
};

interface ActividadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity?: Activity | null;
  customers: { id: string; full_name: string; email?: string }[];
  opportunities: { id: string; title: string }[];
  onSave: (data: CreateActivityInput | UpdateActivityInput) => Promise<void>;
  isLoading?: boolean;
  /**
   * Se invoca al elegir el tipo «Tarea»: la tarea no es una fila de
   * `activities`, se crea con el diálogo unificado de tarea.
   */
  onRequestTask?: (related: { type: RelatedType; id: string } | null) => void;
}

export function ActividadForm({
  open,
  onOpenChange,
  activity,
  customers,
  opportunities,
  onSave,
  isLoading,
  onRequestTask,
}: ActividadFormProps) {
  const [activityType, setActivityType] = useState<ActivityType>('call');
  const [notes, setNotes] = useState('');
  const [relatedType, setRelatedType] = useState<RelatedType>('customer');
  const [relatedId, setRelatedId] = useState('');
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [direction, setDirection] = useState<ActivityDirection>('outbound');
  const [outcome, setOutcome] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [subject, setSubject] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!activity;

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (activity) {
      setActivityType(activity.activity_type);
      setNotes(activity.notes || '');
      setRelatedType((activity.related_type as RelatedType) || 'customer');
      setRelatedId(activity.related_id || '');
      setOccurredAt(new Date(activity.occurred_at));
      setDirection(activity.channel === 'inbound' ? 'inbound' : 'outbound');
      setOutcome(activity.outcome || '');
      setDurationMinutes(
        activity.duration_seconds ? String(Math.round(activity.duration_seconds / 60)) : ''
      );
      const meta = (activity.metadata ?? {}) as Record<string, unknown>;
      setSubject(typeof meta.subject === 'string' ? meta.subject : '');
      setLocation(typeof meta.location === 'string' ? meta.location : '');
    } else {
      setActivityType('call');
      setNotes('');
      setRelatedType('customer');
      setRelatedId('');
      setOccurredAt(new Date());
      setDirection('outbound');
      setOutcome('');
      setDurationMinutes('');
      setSubject('');
      setLocation('');
    }
  }, [activity, open]);

  const showDirection = DIRECTIONAL_TYPES.includes(activityType);
  const showDuration = TIMED_TYPES.includes(activityType);
  const outcomeOptions = OUTCOME_OPTIONS[activityType] ?? [];
  const showSubject = activityType === 'email';
  const showLocation = activityType === 'meeting' || activityType === 'visit';
  const isTask = activityType === 'task';

  const relatedOptions = useMemo(
    () =>
      relatedType === 'customer'
        ? customers.map((c) => ({ value: c.id, label: c.full_name }))
        : opportunities.map((o) => ({ value: o.id, label: o.title })),
    [relatedType, customers, opportunities]
  );

  // El resultado depende del tipo: al cambiar de tipo se descarta si ya no aplica.
  useEffect(() => {
    if (outcome && !outcomeOptions.some((o) => o.value === outcome)) setOutcome('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isTask) {
      onRequestTask?.(relatedId ? { type: relatedType, id: relatedId } : null);
      return;
    }
    if (!relatedId) {
      setError(`Elige ${relatedType === 'customer' ? 'el cliente' : 'la oportunidad'} de la actividad.`);
      return;
    }
    if (!notes.trim() && !subject.trim()) {
      setError('Escribe al menos una nota de lo ocurrido.');
      return;
    }
    // El endpoint rechaza fechas futuras (tolera 5 min de desfase de reloj).
    if (occurredAt.getTime() > Date.now() + 5 * 60_000) {
      setError('La fecha no puede estar en el futuro: la actividad ya ocurrió.');
      return;
    }
    const minutes = durationMinutes.trim() ? Number(durationMinutes) : null;
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)) {
      setError('La duración debe estar entre 0 y 1440 minutos.');
      return;
    }

    const metadata: Record<string, unknown> = { ...(activity?.metadata ?? {}) };
    if (showSubject) {
      if (subject.trim()) metadata.subject = subject.trim();
      else delete metadata.subject;
    }
    if (showLocation) {
      if (location.trim()) metadata.location = location.trim();
      else delete metadata.location;
    }

    const data: CreateActivityInput | UpdateActivityInput = {
      activity_type: activityType,
      notes: notes.trim() || undefined,
      related_type: relatedType,
      related_id: relatedId,
      occurred_at: occurredAt.toISOString(),
      channel: showDirection ? direction : null,
      outcome: outcomeOptions.length ? outcome || null : null,
      duration_seconds: showDuration && minutes !== null ? Math.round(minutes * 60) : null,
      metadata,
    };

    await onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            {isEditing ? 'Editar actividad' : 'Nueva actividad'}
          </DialogTitle>
          <DialogDescription>
            Registra algo que ya pasó: queda en el timeline del cliente o de la oportunidad.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo de actividad */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Tipo de actividad *</Label>
            <div className="grid grid-cols-4 gap-2">
              {MANUAL_ACTIVITY_TYPES.map((type) => {
                const config = ACTIVITY_TYPE_CONFIG[type];
                const Icon = ICONS[config.icon] || StickyNote;
                const selected = activityType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActivityType(type)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] transition-colors',
                      selected
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', selected ? '' : config.color)} />
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Relacionar con — obligatorio: una actividad siempre cuelga de alguien */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Relacionada con *</Label>
              <Select
                value={relatedType}
                onValueChange={(v) => {
                  setRelatedType(v as RelatedType);
                  setRelatedId('');
                }}
              >
                <SelectTrigger className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="opportunity">Oportunidad</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                {relatedType === 'customer' ? 'Cliente' : 'Oportunidad'} *
              </Label>
              <SearchSelect
                options={relatedOptions}
                value={relatedId || 'none'}
                onValueChange={(v) => setRelatedId(v === 'none' ? '' : v)}
                placeholder={relatedType === 'customer' ? 'Selecciona cliente' : 'Selecciona oportunidad'}
                searchPlaceholder="Buscar..."
                noneLabel="Sin seleccionar"
                className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              />
            </div>
          </div>

          {isTask ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200">
              <p className="font-medium">Las tareas se crean en el diálogo de tarea</p>
              <p className="mt-1 text-xs">
                Una tarea es trabajo pendiente con responsable, vencimiento y prioridad, no un
                registro de algo ya ocurrido. Se guarda en Tareas y aparece igual en el timeline.
              </p>
            </div>
          ) : (
            <>
              {/* Fecha y hora */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-gray-700 dark:text-gray-300">Fecha y hora</Label>
                  <div className="flex gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="flex-1 justify-start text-left font-normal bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(occurredAt, "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        align="start"
                      >
                        <Calendar
                          mode="single"
                          selected={occurredAt}
                          onSelect={(date: Date | undefined) => {
                            if (!date) return;
                            const next = new Date(date);
                            next.setHours(occurredAt.getHours(), occurredAt.getMinutes(), 0, 0);
                            setOccurredAt(next);
                          }}
                          disabled={(date: Date) => date > new Date()}
                          locale={es}
                          initialFocus
                        />
                        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                          <Input
                            type="time"
                            value={format(occurredAt, 'HH:mm')}
                            onChange={(e) => {
                              const [hours, minutes] = e.target.value.split(':');
                              const next = new Date(occurredAt);
                              next.setHours(parseInt(hours, 10) || 0, parseInt(minutes, 10) || 0, 0, 0);
                              setOccurredAt(next);
                            }}
                            className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200"
                          />
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOccurredAt(new Date())}
                      className="shrink-0 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600"
                    >
                      <Clock className="h-4 w-4 mr-1" />
                      Ahora
                    </Button>
                  </div>
                </div>

                {/* Sentido del contacto */}
                {showDirection && (
                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300">Sentido</Label>
                    <Select value={direction} onValueChange={(v) => setDirection(v as ActivityDirection)}>
                      <SelectTrigger className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <SelectItem value="outbound">{DIRECTION_LABELS.outbound}</SelectItem>
                        <SelectItem value="inbound">{DIRECTION_LABELS.inbound}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Resultado */}
                {outcomeOptions.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-gray-700 dark:text-gray-300">Resultado</Label>
                    <Select value={outcome || 'none'} onValueChange={(v) => setOutcome(v === 'none' ? '' : v)}>
                      <SelectTrigger className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700">
                        <SelectValue placeholder="Sin resultado" />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <SelectItem value="none">Sin especificar</SelectItem>
                        {outcomeOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Duración */}
                {showDuration && (
                  <div className="space-y-2">
                    <Label htmlFor="act-duration" className="text-gray-700 dark:text-gray-300">
                      Duración (minutos)
                    </Label>
                    <Input
                      id="act-duration"
                      type="number"
                      min={0}
                      max={1440}
                      step={1}
                      inputMode="numeric"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      placeholder="15"
                      className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </div>

              {/* Asunto (correo) */}
              {showSubject && (
                <div className="space-y-2">
                  <Label htmlFor="act-subject" className="text-gray-700 dark:text-gray-300">
                    Asunto
                  </Label>
                  <Input
                    id="act-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Propuesta comercial"
                    className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
              )}

              {/* Lugar o enlace (reunión / visita) */}
              {showLocation && (
                <div className="space-y-2">
                  <Label htmlFor="act-location" className="text-gray-700 dark:text-gray-300">
                    Lugar o enlace
                  </Label>
                  <Input
                    id="act-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Oficina del cliente / meet.google.com/…"
                    className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                  />
                </div>
              )}

              {/* Notas */}
              <div className="space-y-2">
                <Label htmlFor="act-notes" className="text-gray-700 dark:text-gray-300">
                  {activityType === 'note' ? 'Nota *' : 'Qué pasó *'}
                </Label>
                <Textarea
                  id="act-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder={
                    activityType === 'call'
                      ? 'Habló con el gerente, pide propuesta antes del viernes…'
                      : 'Describe la actividad…'
                  }
                  className="bg-gray-50 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700"
                />
              </div>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : isTask ? (
                'Abrir diálogo de tarea'
              ) : isEditing ? (
                'Actualizar'
              ) : (
                'Registrar actividad'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
