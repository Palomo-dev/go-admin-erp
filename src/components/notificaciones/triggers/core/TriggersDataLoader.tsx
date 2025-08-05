/**
 * Componente para cargar y gestionar datos de triggers
 */

'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Services
import * as eventTriggerService from '@/lib/services/eventTriggerService';

// Hooks
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

// Types
import type { 
  EventTrigger, 
  EventTriggerFilter, 
  EventTriggerResponse,
  TriggerStats as TriggerStatsType
} from '@/types/eventTrigger';

export interface TriggersDataLoaderProps {
  onEditTrigger?: (trigger: EventTrigger) => void;
  onTriggersUpdate?: (triggers: EventTrigger[]) => void;
}

export function TriggersDataLoader({ onEditTrigger, onTriggersUpdate }: TriggersDataLoaderProps) {
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const [stats, setStats] = useState<TriggerStatsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventTriggerFilter>({
    page: 1,
    limit: 10
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalPages: 0,
    count: 0
  });

  // Hook de organización
  const { organization } = useOrganization();

  // Cargar triggers
  const loadTriggers = async (currentFilters: EventTriggerFilter) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Cargando triggers con filtros:', currentFilters);
      
      const organizationId = organization?.id || obtenerOrganizacionActiva().id;
      const response: EventTriggerResponse = await eventTriggerService.getTriggers(currentFilters, organizationId);
      
      setTriggers(response.data);
      setPagination({
        page: response.page,
        limit: response.limit,
        totalPages: response.totalPages,
        count: response.count
      });
      
      console.log('✅ Triggers cargados:', response.data.length);
    } catch (err: any) {
      console.error('❌ Error al cargar triggers:', err);
      setError(err.message || 'Error al cargar triggers');
    } finally {
      setLoading(false);
    }
  };

  // Cargar estadísticas
  const loadStats = async () => {
    try {
      console.log('📊 Cargando estadísticas...');
      const organizationId = organization?.id || obtenerOrganizacionActiva().id;
      const statsData = await eventTriggerService.getTriggerStats(organizationId);
      setStats(statsData);
      console.log('✅ Estadísticas cargadas');
    } catch (err: any) {
      console.error('❌ Error al cargar estadísticas:', err);
      // No mostramos error para estadísticas, es opcional
    }
  };

  // Cargar datos inicial y suscribir a cambios en tiempo real
  useEffect(() => {
    const organizationId = organization?.id || 1;
    
    // Cargar datos inicial
    loadTriggers(filters);
    loadStats();
    
    // Suscribir a cambios en tiempo real
    const subscription = eventTriggerService.subscribeToTriggerChanges(
      organizationId,
      (payload) => {
        console.log('🔔 Cambio de trigger recibido:', payload);
        
        // Reload triggers when there are changes
        loadTriggers(filters);
        loadStats();
        
        // Show toast notification
        if (payload.eventType === 'INSERT') {
          toast.success('Nuevo trigger creado');
        } else if (payload.eventType === 'UPDATE') {
          toast.info('Trigger actualizado');
        } else if (payload.eventType === 'DELETE') {
          toast.info('Trigger eliminado');
        }
      }
    );
    
    // Cleanup subscription
    return () => {
      eventTriggerService.unsubscribeFromTriggerChanges();
    };
  }, [organization?.id]);

  // Aplicar filtros
  const handleFiltersChange = (newFilters: Partial<EventTriggerFilter>) => {
    const updatedFilters = {
      ...filters,
      ...newFilters,
      page: newFilters.page || 1 // Reset page when filters change (except explicit page changes)
    };
    
    setFilters(updatedFilters);
    loadTriggers(updatedFilters);
  };

  // Cambiar página
  const handlePageChange = (page: number) => {
    const updatedFilters = { ...filters, page };
    setFilters(updatedFilters);
    loadTriggers(updatedFilters);
  };

  // Refrescar datos
  const handleRefresh = () => {
    loadTriggers(filters);
    loadStats();
  };

  // Activar/desactivar trigger
  const handleToggleTrigger = async (id: string) => {
    try {
      console.log('🔄 Cambiando estado del trigger:', id);
      
      // Encontrar el trigger actual para obtener su estado
      const currentTrigger = triggers.find(t => t.id === id);
      const newActiveState = !currentTrigger?.active;
      const organizationId = organization?.id || obtenerOrganizacionActiva().id;
      
      await eventTriggerService.toggleTriggerStatus(id, newActiveState, organizationId);
      
      toast.success('Estado del trigger actualizado');
      
      // Recargar datos
      loadTriggers(filters);
      loadStats();
    } catch (err: any) {
      console.error('❌ Error al cambiar estado:', err);
      toast.error(err.message || 'Error al cambiar estado del trigger');
    }
  };

  // Eliminar trigger
  const handleDeleteTrigger = async (id: string) => {
    try {
      console.log('🗑️ Eliminando trigger:', id);
      
      const result = await eventTriggerService.deleteTrigger(id);
      
      if (result.success) {
        toast.success(result.message);
        // Recargar datos
        loadTriggers(filters);
        loadStats();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      console.error('❌ Error al eliminar trigger:', err);
      toast.error(err.message || 'Error al eliminar trigger');
    }
  };

  // Probar trigger
  const handleTestTrigger = async (id: string) => {
    try {
      console.log('🧪 Probando trigger:', id);
      
      // Buscar el trigger completo por ID
      const trigger = triggers.find(t => t.id === id);
      if (!trigger) {
        toast.error('Trigger no encontrado');
        return;
      }
      
      // Datos de prueba básicos
      const sampleData = {
        test: true,
        timestamp: new Date().toISOString(),
        user_id: 'test-user',
        message: 'Datos de prueba para el trigger'
      };
      
      const result = await eventTriggerService.testTrigger(trigger.id, sampleData);
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      console.error('❌ Error al probar trigger:', err);
      toast.error(err.message || 'Error al probar trigger');
    }
  };

  // Render error
  if (error && !loading) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
          </AlertDescription>
        </Alert>
        
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estadísticas básicas */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Estadísticas</CardTitle>
            <CardDescription>Resumen de triggers configurados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.active}</div>
                <div className="text-sm text-muted-foreground">Activos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-500">{stats.inactive}</div>
                <div className="text-sm text-muted-foreground">Inactivos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{Object.values(stats.by_event_code || {}).reduce((sum, count) => sum + count, 0)}</div>
                <div className="text-sm text-muted-foreground">Eventos</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Lista simplificada de triggers */}
      {loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Triggers Configurados</CardTitle>
                <CardDescription>
                  {triggers.length} trigger{triggers.length !== 1 ? 's' : ''} encontrado{triggers.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
              <Button onClick={handleRefresh} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {triggers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-lg font-medium mb-2">No hay triggers configurados</h3>
                <p className="text-muted-foreground mb-4">
                  Crea tu primer trigger para automatizar acciones
                </p>
                <Button onClick={() => onEditTrigger && onEditTrigger(null as any)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Trigger
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {triggers.map((trigger) => (
                  <div key={trigger.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{trigger.name}</h4>
                          <div className={`w-2 h-2 rounded-full ${
                            trigger.active ? 'bg-green-500' : 'bg-gray-400'
                          }`} />
                          <span className="text-xs text-muted-foreground">
                            {trigger.active ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Evento: <span className="font-mono">{trigger.event_code}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {trigger.channels.map((channel) => (
                            <span key={channel} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                              {channel}
                            </span>
                          ))}
                          <span className="text-xs text-muted-foreground">
                            Prioridad: {trigger.priority}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleTrigger(trigger.id)}
                        >
                          {trigger.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        {onEditTrigger && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditTrigger(trigger)}
                          >
                            Editar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Paginación simple */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-muted-foreground">
                      Página {pagination.page} de {pagination.totalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                      >
                        Siguiente
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default TriggersDataLoader;
