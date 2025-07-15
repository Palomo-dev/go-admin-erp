import { supabase } from '@/lib/supabase/config';
import { RealtimeChannel, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import { toast } from '@/components/ui/use-toast';

// Tipo de manejador de eventos para el servicio
type ForecastUpdateHandler = () => void;

// Interfaz para los datos de oportunidad relevantes para pronósticos
export interface ForecastOpportunity {
  id: string;
  name: string;
  amount: number;
  currency: string;
  expected_close_date: string;
  status: string;
  stage_id: string;
  pipeline_id: string;
  updated_at: string;
}

// Clase para gestionar las suscripciones en tiempo real
class ForecastRealTimeService {
  private activeChannels: Map<string, RealtimeChannel> = new Map();
  private eventHandlers: Map<string, Set<ForecastUpdateHandler>> = new Map();
  private isInitialized: boolean = false;

  // IDs de las organizaciones actualmente suscritas
  private subscribedOrganizationIds: Set<number> = new Set();

  // Inicializar el servicio
  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    // Se puede agregar lógica adicional de inicialización aquí
    console.log('Servicio de tiempo real para pronóstico inicializado');
  }

  // Suscribirse a cambios en oportunidades para un pipeline específico
  subscribeToPipelineChanges(pipelineId: string, handler: ForecastUpdateHandler): () => void {
    if (!pipelineId) return () => {};
    
    // Generar un ID único para la suscripción
    const handlerId = `pipeline_${pipelineId}_${Date.now()}`;
    
    // Registrar el manejador
    if (!this.eventHandlers.has(pipelineId)) {
      this.eventHandlers.set(pipelineId, new Set());
      
      // Crear el canal si no existe
      this.createPipelineChannel(pipelineId);
    }
    
    this.eventHandlers.get(pipelineId)?.add(handler);
    
    // Retornar función para cancelar la suscripción
    return () => {
      const handlers = this.eventHandlers.get(pipelineId);
      if (handlers) {
        handlers.delete(handler);
        
        // Si no quedan manejadores, eliminar el canal
        if (handlers.size === 0) {
          this.removePipelineChannel(pipelineId);
          this.eventHandlers.delete(pipelineId);
        }
      }
    };
  }

  // Suscribirse a cambios en oportunidades para una organización
  subscribeToOrganizationChanges(organizationId: number, handler: ForecastUpdateHandler): () => void {
    if (!organizationId) return () => {};
    
    const orgIdStr = organizationId.toString();
    
    // Registrar el manejador
    if (!this.eventHandlers.has(orgIdStr)) {
      this.eventHandlers.set(orgIdStr, new Set());
      
      // Crear el canal si no existe
      this.createOrganizationChannel(organizationId);
    }
    
    this.eventHandlers.get(orgIdStr)?.add(handler);
    this.subscribedOrganizationIds.add(organizationId);
    
    // Retornar función para cancelar la suscripción
    return () => {
      const handlers = this.eventHandlers.get(orgIdStr);
      if (handlers) {
        handlers.delete(handler);
        
        // Si no quedan manejadores, eliminar el canal
        if (handlers.size === 0) {
          this.removeOrganizationChannel(organizationId);
          this.eventHandlers.delete(orgIdStr);
          this.subscribedOrganizationIds.delete(organizationId);
        }
      }
    };
  }

  // Crear un canal para monitorear cambios en un pipeline específico
  private createPipelineChannel(pipelineId: string): void {
    if (this.activeChannels.has(`pipeline_${pipelineId}`)) return;
    
    // Configurar canal para cambios en oportunidades en el pipeline
    const opportunityChannel = supabase
      .channel(`opportunities_pipeline_${pipelineId}`)
      // Monitorear cambios en oportunidades
      .on('postgres_changes', 
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'opportunities',
          filter: `pipeline_id=eq.${pipelineId}`
        }, 
        this.handleOpportunityChange.bind(this, pipelineId)
      )
      // Monitorear cambios en etapas del pipeline que afectarían probabilidades
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stages',
          filter: `pipeline_id=eq.${pipelineId}`
        },
        this.handleStageChange.bind(this, pipelineId)
      )
      .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Suscripción exitosa al pipeline ${pipelineId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`Error en canal del pipeline ${pipelineId}: ${status}`);
        } else if (status !== 'CLOSED') {
          console.error(`Error al suscribirse a cambios del pipeline ${pipelineId}: ${status}`);
        }
      });
    
    this.activeChannels.set(`pipeline_${pipelineId}`, opportunityChannel);
  }

  // Crear un canal para monitorear cambios en toda una organización
  private createOrganizationChannel(organizationId: number): void {
    const orgIdStr = organizationId.toString();
    if (this.activeChannels.has(`org_${orgIdStr}`)) return;
    
    // Configurar canal para cambios en oportunidades de la organización
    const orgChannel = supabase
      .channel(`opportunities_org_${orgIdStr}`)
      // Monitorear cambios en oportunidades
      .on('postgres_changes', 
        {
          event: '*',
          schema: 'public',
          table: 'opportunities',
          filter: `organization_id=eq.${organizationId}`
        }, 
        this.handleOrganizationOpportunityChange.bind(this, organizationId)
      )
      // Monitorear cambios en pipelines que podrían afectar el pronóstico
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipelines',
          filter: `organization_id=eq.${organizationId}`
        },
        this.handleOrganizationPipelineChange.bind(this, organizationId)
      )
      .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Suscripción exitosa a la organización ${organizationId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.warn(`Error en canal de la organización ${organizationId}: ${status}`);
        } else if (status !== 'CLOSED') {
          console.error(`Error al suscribirse a cambios de la organización ${organizationId}: ${status}`);
        }
      });
    
    this.activeChannels.set(`org_${orgIdStr}`, orgChannel);
  }

  // Eliminar un canal de pipeline
  private removePipelineChannel(pipelineId: string): void {
    const channelKey = `pipeline_${pipelineId}`;
    const channel = this.activeChannels.get(channelKey);
    
    if (channel) {
      try {
        // Verificar si el canal está cerrado antes de intentar removerlo
        supabase.removeChannel(channel).catch(error => {
          console.warn(`No se pudo remover el canal del pipeline ${pipelineId}:`, error);
        });
      } catch (error) {
        console.warn(`Error al intentar remover el canal del pipeline ${pipelineId}:`, error);
      } finally {
        // Asegurarse de eliminar el canal del mapa de canales activos
        this.activeChannels.delete(channelKey);
      }
    }
  }

  // Eliminar un canal de organización
  private removeOrganizationChannel(organizationId: number): void {
    const orgIdStr = organizationId.toString();
    const channelKey = `org_${orgIdStr}`;
    const channel = this.activeChannels.get(channelKey);
    
    if (channel) {
      try {
        // Verificar si el canal está cerrado antes de intentar removerlo
        supabase.removeChannel(channel).catch(error => {
          console.warn(`No se pudo remover el canal de la organización ${orgIdStr}:`, error);
        });
      } catch (error) {
        console.warn(`Error al intentar remover el canal de la organización ${orgIdStr}:`, error);
      } finally {
        // Asegurarse de eliminar el canal del mapa de canales activos
        this.activeChannels.delete(channelKey);
      }
    }
  }

  // Manejador para cambios en oportunidades de un pipeline específico
  private handleOpportunityChange(pipelineId: string, payload: any): void {
    console.log(`Cambio detectado en oportunidades del pipeline ${pipelineId}:`, payload);
    
    // Notificar a todos los manejadores registrados para este pipeline
    const handlers = this.eventHandlers.get(pipelineId);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler();
        } catch (error) {
          console.error('Error en manejador de eventos de oportunidad:', error);
        }
      });
    }
  }

  // Manejador para cambios en etapas de un pipeline
  private handleStageChange(pipelineId: string, payload: any): void {
    console.log(`Cambio detectado en etapas del pipeline ${pipelineId}:`, payload);
    
    // Notificar a todos los manejadores registrados para este pipeline
    const handlers = this.eventHandlers.get(pipelineId);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler();
        } catch (error) {
          console.error('Error en manejador de eventos de etapa:', error);
        }
      });
    }
  }

  // Manejador para cambios en oportunidades de una organización
  private handleOrganizationOpportunityChange(organizationId: number, payload: any): void {
    const orgIdStr = organizationId.toString();
    console.log(`Cambio detectado en oportunidades de la organización ${orgIdStr}:`, payload);
    
    // Notificar a todos los manejadores registrados para esta organización
    const handlers = this.eventHandlers.get(orgIdStr);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler();
        } catch (error) {
          console.error('Error en manejador de eventos de organización:', error);
        }
      });
    }
  }

  // Manejador para cambios en pipelines de una organización
  private handleOrganizationPipelineChange(organizationId: number, payload: any): void {
    const orgIdStr = organizationId.toString();
    console.log(`Cambio detectado en pipelines de la organización ${orgIdStr}:`, payload);
    
    // Notificar a todos los manejadores registrados para esta organización
    const handlers = this.eventHandlers.get(orgIdStr);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler();
        } catch (error) {
          console.error('Error en manejador de eventos de organización:', error);
        }
      });
    }
  }

  // Notificar manualmente todos los cambios (útil después de operaciones masivas)
  notifyAllChanges(): void {
    // Notificar para cada pipeline y organización
    this.eventHandlers.forEach((handlers, key) => {
      handlers.forEach(handler => {
        try {
          handler();
        } catch (error) {
          console.error(`Error al notificar cambios para ${key}:`, error);
        }
      });
    });
  }

  // Limpiar todos los canales y manejadores
  cleanup(): void {
    // Eliminar todos los canales activos
    this.activeChannels.forEach(channel => {
      supabase.removeChannel(channel);
    });
    
    // Limpiar colecciones
    this.activeChannels.clear();
    this.eventHandlers.clear();
    this.subscribedOrganizationIds.clear();
    this.isInitialized = false;
  }
}

// Exportar una instancia singleton del servicio
export const forecastRealTimeService = new ForecastRealTimeService();
