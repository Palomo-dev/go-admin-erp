'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/config';

export interface RecurringEvent {
  id: string;
  organization_id: number;
  branch_id: number | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  recurrence_rule: string;
  recurrence_end_date: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  event_type: string | null;
  color: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  exceptions_count?: number;
  assigned_user?: { first_name: string; last_name: string } | null;
  branch?: { name: string } | null;
}

export interface CalendarException {
  id: string;
  calendar_event_id: string;
  original_date: string;
  exception_type: 'cancelled' | 'modified';
  new_start_at: string | null;
  new_end_at: string | null;
  new_title: string | null;
  new_description: string | null;
  created_at: string;
}

interface UseRecurringEventsProps {
  organizationId: number | null;
}

export function useRecurringEvents({ organizationId }: UseRecurringEventsProps) {
  const [events, setEvents] = useState<RecurringEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecurringEvents = useCallback(async () => {
    if (!organizationId) {
      setEvents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: eventsData, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', organizationId)
        .not('recurrence_rule', 'is', null)
        .order('start_at', { ascending: false });

      if (eventsError) throw eventsError;

      // Obtener conteo de excepciones para cada evento
      const eventsWithExceptions = await Promise.all(
        (eventsData || []).map(async (event) => {
          const { count } = await supabase
            .from('calendar_exceptions')
            .select('*', { count: 'exact', head: true })
            .eq('calendar_event_id', event.id);

          return {
            ...event,
            exceptions_count: count || 0,
          };
        })
      );

      setEvents(eventsWithExceptions);
    } catch (err) {
      console.error('Error fetching recurring events:', err);
      setError('No se pudieron cargar los eventos recurrentes');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchRecurringEvents();
  }, [fetchRecurringEvents]);

  const getExceptions = useCallback(async (eventId: string): Promise<CalendarException[]> => {
    const { data, error } = await supabase
      .from('calendar_exceptions')
      .select('*')
      .eq('calendar_event_id', eventId)
      .order('original_date', { ascending: true });

    if (error) {
      console.error('Error fetching exceptions:', error);
      return [];
    }

    return data || [];
  }, []);

  const createException = useCallback(async (exception: Omit<CalendarException, 'id' | 'created_at'>) => {
    const { data, error } = await supabase
      .from('calendar_exceptions')
      .insert(exception)
      .select()
      .single();

    if (error) {
      console.error('Error creating exception:', error);
      throw error;
    }

    return data;
  }, []);

  const updateException = useCallback(async (id: string, updates: Partial<CalendarException>) => {
    const { data, error } = await supabase
      .from('calendar_exceptions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating exception:', error);
      throw error;
    }

    return data;
  }, []);

  const deleteException = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('calendar_exceptions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting exception:', error);
      throw error;
    }
  }, []);

  const updateEvent = useCallback(async (id: string, updates: Partial<RecurringEvent>) => {
    const { data, error } = await supabase
      .from('calendar_events')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating event:', error);
      throw error;
    }

    await fetchRecurringEvents();
    return data;
  }, [fetchRecurringEvents]);

  const deleteEvent = useCallback(async (id: string) => {
    // Primero eliminar excepciones
    await supabase
      .from('calendar_exceptions')
      .delete()
      .eq('calendar_event_id', id);

    // Luego eliminar evento
    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting event:', error);
      throw error;
    }

    await fetchRecurringEvents();
  }, [fetchRecurringEvents]);

  return {
    events,
    isLoading,
    error,
    refresh: fetchRecurringEvents,
    getExceptions,
    createException,
    updateException,
    deleteException,
    updateEvent,
    deleteEvent,
  };
}
