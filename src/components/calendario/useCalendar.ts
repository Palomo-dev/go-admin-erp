'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/config';
import { useBranch } from '@/lib/context/BranchContext';
import { RRule } from 'rrule';
import { useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { plainDateToInstant, toPlainDate, todayInTz, addPlainDays } from '@/lib/utils/dateDisplay';
import { cursorDelDia, diaDelCursor, moverFechasEvento } from './fechasCalendario';
import { cambiarReunionCalendario, esReunionCrm, estadoReunionCalendario, patchReunionCalendario } from './reunionesCalendario';
import { 
  CalendarEvent, 
  CalendarFilters, 
  CalendarViewType,
  ALL_SOURCE_TYPES 
} from './types';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';

// Función para expandir eventos recurrentes
export function expandRecurringEvents(
  events: CalendarEvent[],
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const expandedEvents: CalendarEvent[] = [];

  for (const event of events) {
    const recurrenceRule = event.recurrence_rule;
    
    // Si no tiene recurrencia, agregar como está
    if (!recurrenceRule || esReunionCrm(event)) {
      expandedEvents.push(event);
      continue;
    }

    try {
      // Parsear la regla RRULE
      const eventStart = new Date(event.start_at);
      const eventEnd = event.end_at ? new Date(event.end_at) : new Date(eventStart.getTime() + 3600000);
      const duration = eventEnd.getTime() - eventStart.getTime();

      // Siempre incluir el evento original si está dentro del rango
      if (eventStart >= rangeStart && eventStart < rangeEnd) {
        expandedEvents.push(event);
      }

      // Crear RRule con la fecha de inicio del evento
      const rrule = RRule.fromString(`DTSTART:${eventStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${recurrenceRule}`);
      
      // Obtener ocurrencias en el rango (excluyendo la fecha original del evento)
      const occurrences = rrule.between(rangeStart, rangeEnd, true);

      for (const occurrence of occurrences) {
        if (occurrence >= rangeEnd) continue;
        // Saltar si es la misma fecha/hora que el evento original
        if (Math.abs(occurrence.getTime() - eventStart.getTime()) < 60000) {
          continue;
        }
        
        const occurrenceEnd = new Date(occurrence.getTime() + duration);
        expandedEvents.push({
          ...event,
          start_at: occurrence.toISOString(),
          end_at: occurrenceEnd.toISOString(),
          // Marcar como ocurrencia de evento recurrente
          metadata: {
            ...(event.metadata as Record<string, unknown> || {}),
            is_recurrence_instance: true,
            original_event_id: event.id,
            occurrence_date: occurrence.toISOString(),
          },
        });
      }
    } catch (err) {
      console.error('Error expanding recurrence for event:', event.id, err);
      // Si falla la expansión, agregar el evento original
      expandedEvents.push(event);
    }
  }

  return expandedEvents;
}

interface UseCalendarProps {
  organizationId: number | null;
  initialView?: CalendarViewType;
  initialDate?: Date;
}

interface UseCalendarReturn {
  events: CalendarEvent[];
  isLoading: boolean;
  error: string | null;
  currentDate: Date;
  view: CalendarViewType;
  filters: CalendarFilters;
  dateRange: { from: Date; to: Date };
  setView: (view: CalendarViewType) => void;
  setCurrentDate: (date: Date) => void;
  setFilters: (filters: Partial<CalendarFilters>) => void;
  goToToday: () => void;
  goToNext: () => void;
  goToPrevious: () => void;
  refreshEvents: () => Promise<void>;
  createEvent: (event: Partial<CalendarEvent>) => Promise<{ data: CalendarEvent | null; error: string | null }>;
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => Promise<{ success: boolean; error: string | null }>;
  deleteEvent: (id: string) => Promise<{ success: boolean; error: string | null }>;
  moveEvent: (id: string, newDate: Date, newHour: number) => Promise<{ success: boolean; error: string | null }>;
  resizeEvent: (id: string, newStart: Date, newEnd: Date) => Promise<{ success: boolean; error: string | null }>;
}

function getDateRange(date: Date, view: CalendarViewType): { from: Date; to: Date } {
  switch (view) {
    case 'month':
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);
      return {
        from: startOfWeek(monthStart, { weekStartsOn: 1 }),
        to: endOfWeek(monthEnd, { weekStartsOn: 1 }),
      };
    case 'week':
      return {
        from: startOfWeek(date, { weekStartsOn: 1 }),
        to: endOfWeek(date, { weekStartsOn: 1 }),
      };
    case 'day':
      return {
        from: startOfDay(date),
        to: endOfDay(date),
      };
    case 'agenda':
      // Para la vista agenda, mostramos eventos del mes actual
      return {
        from: startOfMonth(date),
        to: endOfMonth(date),
      };
    default:
      return {
        from: startOfMonth(date),
        to: endOfMonth(date),
      };
  }
}

export function useCalendar({ 
  organizationId, 
  initialView = 'month',
  initialDate = new Date()
}: UseCalendarProps): UseCalendarReturn {
  const { timezone } = useOrgTimezone();
  const initialDateRef = useRef(initialDate);
  const activeOrgRef = useRef(organizationId);
  activeOrgRef.current = organizationId;
  const requestRef = useRef(0);
  useEffect(() => {
    const dia = toPlainDate(initialDateRef.current, timezone);
    setCurrentDate(previous => diaDelCursor(previous) === dia ? previous : cursorDelDia(dia));
  }, [organizationId, timezone]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(() => cursorDelDia(toPlainDate(initialDate, timezone)));
  const [view, setView] = useState<CalendarViewType>(initialView);
  const [filters, setFiltersState] = useState<CalendarFilters>({
    dateRange: getDateRange(initialDate, initialView),
    branchId: null,
    assignedTo: null,
    status: 'all',
    sourceTypes: ALL_SOURCE_TYPES,
  });

  // Sincronizar branchId con el contexto global de sucursal
  const { branchFilter } = useBranch();
  useEffect(() => {
    setFiltersState(prev => prev.branchId === branchFilter ? prev : { ...prev, branchId: branchFilter });
  }, [branchFilter]);

  const dateRange = useMemo(() => {
    const range = getDateRange(currentDate, view);
    // Intervalo [from,to): conserva los microsegundos del último día en Postgres.
    return { from: new Date(plainDateToInstant(diaDelCursor(range.from), timezone)), to: new Date(plainDateToInstant(addPlainDays(diaDelCursor(range.to), 1), timezone)) };
  }, [currentDate, view, timezone]);

  const fetchEvents = useCallback(async () => {
    if (organizationId !== activeOrgRef.current) return;
    const request = ++requestRef.current;
    if (!organizationId) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Query 1: Eventos normales en el rango
      let query = supabase
        .from('calendar_unified')
        .select('*')
        .eq('organization_id', organizationId)
        .or(`end_at.gte.${dateRange.from.toISOString()},and(end_at.is.null,start_at.gte.${dateRange.from.toISOString()})`)
        .lt('start_at', dateRange.to.toISOString())
        .order('start_at', { ascending: true });

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters.status !== 'all') {
        query = filters.status === 'completed' ? query.in('status', ['completed', 'confirmed']) : query.eq('status', filters.status);
      }

      if (filters.sourceTypes.length < ALL_SOURCE_TYPES.length) {
        query = query.in('source_type', filters.sourceTypes);
      }

      // Query 2: Eventos recurrentes (incluye los que empiezan dentro y antes del rango)
      let recurringQuery = supabase
        .from('calendar_unified')
        .select('*')
        .eq('organization_id', organizationId)
        .not('recurrence_rule', 'is', null)
        .lt('start_at', dateRange.to.toISOString())
        .order('start_at', { ascending: true });

      if (filters.branchId) {
        recurringQuery = recurringQuery.eq('branch_id', filters.branchId);
      }

      if (filters.assignedTo) {
        recurringQuery = recurringQuery.eq('assigned_to', filters.assignedTo);
      }

      if (filters.status !== 'all') {
        recurringQuery = filters.status === 'completed' ? recurringQuery.in('status', ['completed', 'confirmed']) : recurringQuery.eq('status', filters.status);
      }

      if (filters.sourceTypes.length < ALL_SOURCE_TYPES.length) recurringQuery = recurringQuery.in('source_type', filters.sourceTypes);

      const [{ data, error: queryError }, { data: recurringData, error: recurringError }] = await Promise.all([
        query,
        recurringQuery
      ]);

      if (queryError) throw queryError;
      if (recurringError) throw recurringError;
      if (request !== requestRef.current || organizationId !== activeOrgRef.current) return;

      // Combinar eventos evitando duplicados
      const seenIds = new Set<string>();
      const allEventsRaw: Record<string, unknown>[] = [];
      
      // Agregar eventos normales
      for (const event of (data || [])) {
        const eventData = event as Record<string, unknown>;
        const sourceId = String(eventData.source_id || '');
        if (!seenIds.has(sourceId)) {
          seenIds.add(sourceId);
          allEventsRaw.push(event);
        }
      }
      
      // Agregar eventos recurrentes (si no están ya)
      for (const event of (recurringData || [])) {
        const eventData = event as Record<string, unknown>;
        const sourceId = String(eventData.source_id || '');
        if (!seenIds.has(sourceId)) {
          seenIds.add(sourceId);
          allEventsRaw.push(event);
        }
      }
      
      // Asegurar que cada evento tenga un id (usando source_id)
      const eventsWithId = allEventsRaw.map(event => {
        const eventData = event as Record<string, unknown>;
        return {
          ...event,
          id: String(eventData.source_id || ''),
          source_id: String(eventData.source_id || ''),
        };
      });

      // Expandir eventos recurrentes
      const expandedEvents = expandRecurringEvents(
        eventsWithId as CalendarEvent[],
        dateRange.from,
        dateRange.to
      );

      setEvents(expandedEvents.map(event => ({ ...event, status: estadoReunionCalendario(event) })).filter(event => filters.status === 'all' || event.status === filters.status));
    } catch (err) {
      if (request !== requestRef.current || organizationId !== activeOrgRef.current) return;
      console.error('Error fetching calendar events:', err);
      setError('No se pudieron cargar los eventos del calendario');
      setEvents([]);
    } finally {
      if (request === requestRef.current && organizationId === activeOrgRef.current) setIsLoading(false);
    }
  }, [organizationId, dateRange, filters]);

  useEffect(() => {
    const requests = requestRef;
    fetchEvents();
    return () => { requests.current++; };
  }, [fetchEvents]);

  const setFilters = useCallback((newFilters: Partial<CalendarFilters>) => {
    setFiltersState(prev => ({ ...prev, ...newFilters }));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(cursorDelDia(todayInTz(timezone)));
  }, [timezone]);

  const goToNext = useCallback(() => {
    setCurrentDate(prev => {
      switch (view) {
        case 'month': return addMonths(prev, 1);
        case 'week': return addWeeks(prev, 1);
        case 'day': return addDays(prev, 1);
        default: return addMonths(prev, 1);
      }
    });
  }, [view]);

  const goToPrevious = useCallback(() => {
    setCurrentDate(prev => {
      switch (view) {
        case 'month': return subMonths(prev, 1);
        case 'week': return subWeeks(prev, 1);
        case 'day': return subDays(prev, 1);
        default: return subMonths(prev, 1);
      }
    });
  }, [view]);

  const createEvent = useCallback(async (eventData: Partial<CalendarEvent>) => {
    if (!organizationId) {
      return { data: null, error: 'No hay organización seleccionada' };
    }

    if (esReunionCrm(eventData)) return { data: null, error: 'Las reuniones CRM se agendan desde su ficha' };
    try {
      // Extraer recurrence_rule del metadata si existe
      const metadata = eventData.metadata as Record<string, unknown> | null;
      const rrule = metadata?.rrule as string | null;

      const { data, error: insertError } = await supabase
        .from('calendar_events')
        .insert({
          organization_id: organizationId,
          title: eventData.title,
          description: eventData.description,
          start_at: eventData.start_at,
          end_at: eventData.end_at,
          all_day: eventData.all_day || false,
          location: eventData.location,
          assigned_to: eventData.assigned_to,
          customer_id: eventData.customer_id,
          branch_id: eventData.branch_id,
          event_type: 'custom',
          color: eventData.color || '#3B82F6',
          status: eventData.status || 'confirmed',
          metadata: eventData.metadata || {},
          recurrence_rule: rrule || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchEvents();
      return { data, error: null };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear evento';
      console.error('Error creating event:', err);
      return { data: null, error: errorMessage };
    }
  }, [organizationId, fetchEvents]);

  const updateEvent = useCallback(async (id: string, updates: Partial<CalendarEvent>) => {
    const event = events.find(item => (item.id || item.source_id) === id);
    if (!organizationId || !event || event.source_type !== 'calendar_event') return { success: false, error: 'Evento no encontrado' };
    try {
      if (esReunionCrm(event)) {
        await cambiarReunionCalendario(id, patchReunionCalendario(updates));
      } else {
        const { error: updateError } = await supabase.from('calendar_events').update({
          title: updates.title, description: updates.description, start_at: updates.start_at,
          end_at: updates.end_at, all_day: updates.all_day, location: updates.location,
          assigned_to: updates.assigned_to, color: updates.color, status: updates.status,
        }).eq('id', id).eq('organization_id', organizationId);
        if (updateError) throw updateError;
      }
      await fetchEvents();
      return { success: true, error: null };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al actualizar evento' };
    }
  }, [organizationId, events, fetchEvents]);

  const deleteEvent = useCallback(async (id: string) => {
    const event = events.find(item => (item.id || item.source_id) === id);
    if (!organizationId || !event || event.source_type !== 'calendar_event') return { success: false, error: 'Evento no encontrado' };
    if (esReunionCrm(event)) return updateEvent(id, { status: 'cancelled' });
    try {
      const { error: deleteError } = await supabase.from('calendar_events').delete()
        .eq('id', id).eq('organization_id', organizationId);
      if (deleteError) throw deleteError;
      await fetchEvents();
      return { success: true, error: null };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al eliminar evento' };
    }
  }, [organizationId, events, fetchEvents, updateEvent]);

  const moveEvent = useCallback(async (id: string, newDate: Date, hour: number) => {
    const event = events.find(item => (item.id || item.source_id) === id);
    if (!event || event.source_type !== 'calendar_event' || event.metadata?.is_recurrence_instance) return { success: false, error: 'Evento no editable' };
    try { return await updateEvent(id, moverFechasEvento(event.start_at, event.end_at, newDate, hour, timezone)); }
    catch (err: unknown) { return { success: false, error: err instanceof Error ? err.message : 'Fecha inválida' }; }
  }, [events, timezone, updateEvent]);

  const resizeEvent = useCallback(async (id: string, start: Date, end: Date) => {
    const event = events.find(item => (item.id || item.source_id) === id);
    if (!event || event.source_type !== 'calendar_event' || event.metadata?.is_recurrence_instance) return { success: false, error: 'Evento no editable' };
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return { success: false, error: 'Rango inválido' };
    return updateEvent(id, { start_at: start.toISOString(), end_at: end.toISOString() });
  }, [events, updateEvent]);

  return {
    events,
    isLoading,
    error,
    currentDate,
    view,
    filters,
    dateRange,
    setView,
    setCurrentDate,
    setFilters,
    goToToday,
    goToNext,
    goToPrevious,
    refreshEvents: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    moveEvent,
    resizeEvent,
  };
}
