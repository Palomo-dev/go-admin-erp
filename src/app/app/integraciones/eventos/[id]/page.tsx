'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import {
  integrationsService,
  IntegrationEvent,
} from '@/lib/services/integrationsService';
import { EventDetail } from '@/components/integraciones/eventos/id';
import { DetailSkeleton } from '@/components/common/PageSkeletons';

export default function EventoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const { toast } = useToast();

  const [event, setEvent] = useState<IntegrationEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  // Cargar evento
  const loadEvent = useCallback(async () => {
    if (!eventId) return;

    try {
      setLoading(true);
      const data = await integrationsService.getEventById(eventId);

      if (!data) {
        setError('Evento no encontrado');
        return;
      }

      setEvent(data);
    } catch (err) {
      console.error('Error loading event:', err);
      setError('Error al cargar el evento');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  // Handler de reprocesar
  const handleReprocess = async () => {
    if (!event) return;

    setReprocessing(true);
    try {
      const result = await integrationsService.reprocessEvent(event.id);

      if (result.success) {
        toast({
          title: 'Evento encolado',
          description: result.message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo reprocesar el evento',
      });
    } finally {
      setReprocessing(false);
    }
  };

  // Estado de carga
  if (loading) {
    return (
  <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
    <DetailSkeleton />
  </div>
);
  }

  // Estado de error
  if (error || !event) {
    return (
      <div className="h-full bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center">
        <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full mb-4">
          <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {error || 'Evento no encontrado'}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md text-center">
          No se pudo cargar la información del evento solicitado.
        </p>
        <div className="flex gap-3">
          <Link href="/app/integraciones/eventos">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a eventos
            </Button>
          </Link>
          <Button
            onClick={() => loadEvent()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <EventDetail
      event={event}
      onReprocess={handleReprocess}
      reprocessing={reprocessing}
    />
  );
}
