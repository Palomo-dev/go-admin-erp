'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatDate, cn } from '@/utils/Utils';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Send, Clock, RotateCcw, Ban } from 'lucide-react';

interface JobEvent {
  id: string;
  job_id: string;
  event_type: string;
  event_code: string | null;
  event_message: string | null;
  metadata: any;
  created_at: string;
}

interface JobEventsTimelineProps {
  jobId: string;
}

const eventConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  validated: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400', label: 'Validado' },
  sent: { icon: <Send className="h-4 w-4" />, color: 'text-blue-600 dark:text-blue-400', label: 'Enviado' },
  accepted: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-green-600 dark:text-green-400', label: 'Aceptado' },
  rejected: { icon: <XCircle className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400', label: 'Rechazado' },
  error: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600 dark:text-red-400', label: 'Error' },
  retry_scheduled: { icon: <RotateCcw className="h-4 w-4" />, color: 'text-yellow-600 dark:text-yellow-400', label: 'Reintento programado' },
  cancelled: { icon: <Ban className="h-4 w-4" />, color: 'text-gray-600 dark:text-gray-400', label: 'Cancelado' },
  created: { icon: <Clock className="h-4 w-4" />, color: 'text-gray-600 dark:text-gray-400', label: 'Creado' },
};

export function JobEventsTimeline({ jobId }: JobEventsTimelineProps) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      const { data, error } = await supabase
        .from('electronic_invoicing_events')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setEvents(data);
      }
      setLoading(false);
    }
    loadEvents();
  }, [jobId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No hay eventos registrados</p>;
  }

  return (
    <div className="space-y-3">
      {events.map((event, idx) => {
        const config = eventConfig[event.event_type] || { icon: <Clock className="h-4 w-4" />, color: 'text-gray-600 dark:text-gray-400', label: event.event_type };
        const isLast = idx === events.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex-shrink-0', config.color)}>
                {config.icon}
              </div>
              {!isLast && <div className="w-px h-full bg-gray-200 dark:bg-gray-700 mt-1" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {config.label}
                </span>
                {event.event_code && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                    ({event.event_code})
                  </span>
                )}
              </div>
              {event.event_message && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {event.event_message}
                </p>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {formatDate(event.created_at)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default JobEventsTimeline;
