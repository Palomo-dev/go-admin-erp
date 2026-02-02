'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import {
  AlertCircle,
  RefreshCw,
  History,
} from 'lucide-react';

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import timelineService, { type TimelineEvent } from '@/lib/services/timelineService';

import {
  EventDetailHeader,
  EventSummaryPanel,
  EventDiffPanel,
  EventMetadataPanel,
  EventCorrelationPanel,
  EventActions,
} from '@/components/timeline/eventos';

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  
  const eventId = params.id as string;
  const organizationId = getOrganizationId();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<TimelineEvent | null>(null);
  const [actorName, setActorName] = useState<string | undefined>();
  const [branchName, setBranchName] = useState<string | undefined>();

  const loadEvent = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const eventData = await timelineService.getEventById(eventId);

      if (!eventData) {
        setError('Evento no encontrado');
        return;
      }

      // Verificar que el evento pertenece a la organización
      if (eventData.organization_id !== organizationId) {
        setError('No tienes acceso a este evento');
        return;
      }

      setEvent(eventData);

      // Resolver nombres
      if (eventData.actor_id) {
        const names = await timelineService.resolveActorNames([eventData.actor_id]);
        setActorName(names[eventData.actor_id]);
      }

      if (eventData.branch_id) {
        const branchNames = await timelineService.resolveBranchNames([eventData.branch_id]);
        setBranchName(branchNames[eventData.branch_id]);
      }
    } catch (err) {
      console.error('Error loading event:', err);
      setError('No se pudo cargar el evento');
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle del evento',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId, organizationId, toast]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const handleBack = () => {
    router.push('/app/timeline');
  };

  const handleRefresh = () => {
    loadEvent(true);
  };

  const handleNavigateToEntity = (entityType: string, entityId: string) => {
    const entityRoutes: Record<string, string> = {
      product: `/app/inventario/productos/${entityId}`,
      customer: `/app/crm/clientes/${entityId}`,
      invoice: `/app/finanzas/facturas/${entityId}`,
      trip: `/app/transporte/viajes/${entityId}`,
      shipment: `/app/transporte/envios/${entityId}`,
      conversation: `/app/inbox/${entityId}`,
      integration: `/app/integraciones/conexiones/${entityId}`,
      employee: `/app/hrm/empleados/${entityId}`,
      membership: `/app/pms/memberships/${entityId}`,
      sale: `/app/pos/ventas/${entityId}`,
      payment: `/app/finanzas/pagos/${entityId}`,
    };

    const route = entityRoutes[entityType.toLowerCase()];
    if (route) {
      router.push(route);
    } else {
      toast({
        title: 'Navegación no disponible',
        description: `No hay ruta configurada para ${entityType}`,
      });
    }
  };

  const handleViewCorrelation = (correlationId: string) => {
    router.push(`/app/timeline?correlationId=${correlationId}`);
  };

  const handleViewEvent = (eventId: string) => {
    router.push(`/app/timeline/eventos/${eventId}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="h-8 w-96 mb-2" />
          <Skeleton className="h-5 w-64" />
        </div>
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {error || 'Evento no encontrado'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            El evento que buscas no existe o no tienes permisos para verlo.
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleBack}>
              Volver al Timeline
            </Button>
            <Button onClick={() => loadEvent()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <EventDetailHeader
        event={event}
        actorName={actorName}
        branchName={branchName}
        onBack={handleBack}
      />

      {/* Botón de actualizar flotante */}
      <div className="fixed bottom-6 right-6 z-20">
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Resumen */}
            <EventSummaryPanel event={event} />

            {/* Diff Before/After */}
            <EventDiffPanel event={event} hasSensitiveAccess={true} />
          </div>

          {/* Columna lateral */}
          <div className="space-y-6">
            {/* Acciones */}
            <EventActions
              event={event}
              onNavigateToEntity={handleNavigateToEntity}
              onViewCorrelation={handleViewCorrelation}
            />

            {/* Correlación */}
            <EventCorrelationPanel
              event={event}
              organizationId={organizationId}
              onViewEvent={handleViewEvent}
              onViewAllCorrelation={handleViewCorrelation}
            />

            {/* Metadatos */}
            <EventMetadataPanel event={event} />
          </div>
        </div>
      </div>
    </div>
  );
}
