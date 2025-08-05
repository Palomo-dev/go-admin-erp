/**
 * Componente principal para gestionar disparadores de eventos
 */

'use client';

import React, { useState, useCallback } from 'react';
import { Plus, Database, Settings, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

// Componentes internos
import { TriggersDataLoader } from './TriggersDataLoader';
import { EventCatalogTab } from '../catalog/EventCatalogTab';

import { SimpleTriggerForm } from '../forms/SimpleTriggerForm';
import { CustomEventsManager } from '../../custom-events/CustomEventsManager';

// Services
import * as eventTriggerService from '@/lib/services/eventTriggerService';
import { useOrganization, obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

// Types
import type { EventTrigger } from '@/types/eventTrigger';

export const TriggersManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('triggers');
  const [showForm, setShowForm] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<any>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // Hook de organización
  const { organization } = useOrganization();
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const organizationId = organization?.id || obtenerOrganizacionActiva().id;

  // Forzar actualización de datos
  const forceRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  // Manejar apertura del formulario
  const handleNewTrigger = () => {
    setEditingTrigger(null);
    setShowForm(true);
  };

  const handleEditTrigger = useCallback((trigger: EventTrigger) => {
    setEditingTrigger(trigger);
    setShowForm(true);
  }, []);

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingTrigger(null);
  };

  // Manejar envío exitoso del formulario
  const handleFormSubmit = async (formData: any) => {
    try {
      console.log('📝 Enviando datos del formulario:', formData);
      
      // Obtener organizationId correcto
      const organizationId = organization?.id || 1;
      console.log('🏢 Usando organizationId:', organizationId);
      
      if (editingTrigger) {
        // Actualizar trigger existente
        await eventTriggerService.updateTrigger(editingTrigger.id, formData, organizationId);
        toast.success('Trigger actualizado correctamente');
      } else {
        // Crear nuevo trigger
        await eventTriggerService.createTrigger(formData, organizationId);
        toast.success('Trigger creado correctamente');
      }
      
      handleCloseForm();
      forceRefresh();
    } catch (error) {
      console.error('❌ Error al guardar trigger:', error);
      toast.error('Error al guardar el trigger');
    }
  };

  // Manejar actualización de lista de triggers
  const handleTriggersUpdate = useCallback((newTriggers: EventTrigger[]) => {
    setTriggers(newTriggers);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Triggers de Eventos</h1>
          <p className="text-muted-foreground">
            Configura acciones automáticas basadas en eventos del sistema
          </p>
        </div>
        <Button onClick={handleNewTrigger}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Trigger
        </Button>
      </div>

      {/* Tabs principales */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="triggers" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Eventos
          </TabsTrigger>
          <TabsTrigger 
            value="custom-events" 
            className="flex items-center gap-2"
            id="trigger-custom-events"
          >
            <Settings className="h-4 w-4" />
            Personalizados
          </TabsTrigger>


        </TabsList>

        {/* Contenido de triggers */}
        <TabsContent value="triggers" className="space-y-4">
          <TriggersDataLoader 
            key={refreshKey}
            onEditTrigger={handleEditTrigger}
            onTriggersUpdate={handleTriggersUpdate}
          />
        </TabsContent>

        {/* Contenido de eventos */}
        <TabsContent value="events" className="space-y-4">
          <EventCatalogTab />
        </TabsContent>

        {/* Contenido de eventos personalizados - VERSIÓN ULTRA SEGURA */}
        <TabsContent value="custom-events" className="space-y-4">
          <SafeCustomEventsWrapper organizationId={organizationId} />
        </TabsContent>




      </Tabs>

      {/* Modal del formulario */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTrigger ? 'Editar Trigger' : 'Nuevo Trigger'}
            </DialogTitle>
            <DialogDescription>
              Configura cuándo y cómo se ejecutarán las acciones automáticas
            </DialogDescription>
          </DialogHeader>
          
          <div className="px-6 pb-6">
            <SimpleTriggerForm
              onClose={handleCloseForm}
              onSubmit={handleFormSubmit}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Wrapper ultra seguro para eventos personalizados - evita errores persistentes
 */
interface SafeCustomEventsWrapperProps {
  organizationId: number;
}

const SafeCustomEventsWrapper: React.FC<SafeCustomEventsWrapperProps> = ({ 
  organizationId 
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  // Resetear error al cambiar organización
  React.useEffect(() => {
    setHasError(false);
    setRetryCount(0);
  }, [organizationId]);

  // Función de retry con delay progresivo
  const handleRetry = useCallback(() => {
    if (retryCount < MAX_RETRIES) {
      console.log(`[SafeCustomEventsWrapper] Retry ${retryCount + 1}/${MAX_RETRIES}`);
      setHasError(false);
      setIsLoading(true);
      setRetryCount(prev => prev + 1);
      
      // Delay progresivo: 1s, 2s, 4s
      setTimeout(() => {
        setIsLoading(false);
      }, Math.pow(2, retryCount) * 1000);
    }
  }, [retryCount]);

  // Simulación de carga inicial
  React.useEffect(() => {
    if (!hasError) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasError, retryCount]);

  // Manejo de errores
  const handleError = useCallback((error: Error, errorInfo: any) => {
    console.error('[SafeCustomEventsWrapper] Error capturado:', {
      error: error.message,
      stack: error.stack,
      errorInfo,
      organizationId,
      retryCount
    });
    
    setHasError(true);
    setIsLoading(false);
    
    toast.error(`Error en eventos personalizados (intento ${retryCount + 1}/${MAX_RETRIES})`);
  }, [organizationId, retryCount]);

  // Estado de carga
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Eventos Personalizados
          </CardTitle>
          <CardDescription>
            Cargando gestor de eventos personalizados...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Estado de error con retry
  if (hasError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Settings className="h-5 w-5" />
            Error en Eventos Personalizados
          </CardTitle>
          <CardDescription>
            Hubo un problema al cargar el gestor de eventos personalizados
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p>• ID Organización: {organizationId}</p>
            <p>• Intentos realizados: {retryCount}/{MAX_RETRIES}</p>
            <p>• Estado: Error capturado y contenido</p>
          </div>
          
          <div className="flex gap-2">
            {retryCount < MAX_RETRIES && (
              <Button 
                onClick={handleRetry}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reintentar ({MAX_RETRIES - retryCount} restantes)
              </Button>
            )}
            <Button 
              onClick={() => setHasError(false)}
              variant="secondary"
              size="sm"
            >
              Continuar sin eventos personalizados
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Renderizado normal con boundary
  try {
    return (
      <React.Suspense fallback={
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Cargando componente...</div>
            </div>
          </CardContent>
        </Card>
      }>
        <CustomEventsManager 
          organizationId={organizationId}
        />
      </React.Suspense>
    );
  } catch (error) {
    console.error('[SafeCustomEventsWrapper] Error en renderizado:', error);
    handleError(error as Error, { phase: 'render' });
    return null;
  }
};

export default TriggersManager;
