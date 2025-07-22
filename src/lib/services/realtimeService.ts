/**
 * Servicio para gestionar suscripciones en tiempo real con Supabase
 * para el tablero Kanban y otros componentes
 */

import { supabase } from "@/lib/supabase/config";
import { getOrganizationId } from "./kanbanService";
import { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Interfaz para manejar eventos de cambios en tiempo real
 */
export interface RealtimeChangeHandler<T extends Record<string, any>> {
  onInsert?: (payload: T) => void;
  onUpdate?: (payload: T) => void;
  onDelete?: (payload: T) => void;
}

/**
 * Clase para gestionar suscripciones en tiempo real a tablas de Supabase
 */
export class RealtimeSubscription {
  private channel: RealtimeChannel | null = null;
  private tableName: string;
  private organizationId: number | null;
  private filters: Record<string, any> = {};

  /**
   * Constructor
   * @param tableName - Nombre de la tabla a suscribirse
   * @param organizationId - ID de la organización (opcional, se toma del localStorage si no se proporciona)
   * @param filters - Filtros adicionales para la suscripción
   */
  constructor(tableName: string, organizationId?: number | null, filters: Record<string, any> = {}) {
    this.tableName = tableName;
    this.organizationId = organizationId !== undefined ? organizationId : getOrganizationId();
    this.filters = filters;
  }

  /**
   * Suscribirse a los cambios en la tabla
   * @param handlers - Manejadores de eventos para cambios en la tabla
   */
  subscribe<T extends Record<string, any>>(handlers: RealtimeChangeHandler<T>): void {
    if (!this.organizationId) {
      console.error(`No se puede suscribir a ${this.tableName} sin ID de organización`);
      return;
    }

    // Cancelar suscripción previa si existe
    this.unsubscribe();

    // Crear un nuevo canal de suscripción
    this.channel = supabase
      .channel(`${this.tableName}_changes`)
      .on<T>(
        'postgres_changes',
        {
          event: '*', // Escuchar todos los eventos (insert, update, delete)
          schema: 'public',
          table: this.tableName,
          filter: `organization_id=eq.${this.organizationId}` // Filtrar por organización
        },
        (payload) => {
          // Procesar el evento según su tipo
          if (payload.eventType === 'INSERT' && handlers.onInsert) {
            handlers.onInsert(payload.new as T);
          } 
          else if (payload.eventType === 'UPDATE' && handlers.onUpdate) {
            handlers.onUpdate(payload.new as T);
          } 
          else if (payload.eventType === 'DELETE' && handlers.onDelete) {
            handlers.onDelete(payload.old as T);
          }
          else {
            console.warn(`Tipo de evento no manejado: ${payload.eventType}`);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Suscripción activa a ${this.tableName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error en la suscripción a ${this.tableName}`);
        }
      });
  }

  /**
   * Cancelar la suscripción
   */
  unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

/**
 * Tipo para objetos de oportunidad
 */
type OpportunityRecord = Record<string, any> & {
  id: string;
  stage_id: string;
};

/**
 * Tipo para objetos de etapa
 */
type StageRecord = Record<string, any> & {
  id: string;
  pipeline_id: string;
};

/**
 * Tipo para objetos de tarea
 */
type TaskRecord = Record<string, any> & {
  id: string;
  opportunity_id: string;
};

/**
 * Tipo para objetos de cliente
 */
type CustomerRecord = Record<string, any> & {
  id: string;
};

/**
 * Suscribe a cambios en oportunidades para una etapa específica
 * @param stageId - ID de la etapa
 * @param handlers - Manejadores de eventos
 * @returns Objeto de suscripción
 */
export function subscribeToOpportunities(
  stageId: string,
  handlers: RealtimeChangeHandler<OpportunityRecord>
): RealtimeSubscription {
  const organizationId = getOrganizationId();
  const subscription = new RealtimeSubscription('opportunities', organizationId);
  
  if (organizationId) {
    // Suscribirse a cambios en oportunidades filtrados por organización y etapa
    subscription.subscribe<OpportunityRecord>({
      onInsert: (payload) => {
        if (payload.stage_id === stageId && handlers.onInsert) {
          handlers.onInsert(payload);
        }
      },
      onUpdate: (payload) => {
        if (payload.stage_id === stageId && handlers.onUpdate) {
          handlers.onUpdate(payload);
        }
      },
      onDelete: (payload) => {
        if (payload.stage_id === stageId && handlers.onDelete) {
          handlers.onDelete(payload);
        }
      }
    });
  }

  return subscription;
}

/**
 * Suscribe a cambios en etapas para un pipeline específico
 * @param pipelineId - ID del pipeline
 * @param handlers - Manejadores de eventos
 * @returns Objeto de suscripción
 */
export function subscribeToStages(
  pipelineId: string,
  handlers: RealtimeChangeHandler<StageRecord>
): RealtimeSubscription {
  const organizationId = getOrganizationId();
  const subscription = new RealtimeSubscription('stages', organizationId);
  
  if (organizationId) {
    // Suscribirse a cambios en etapas filtrados por organización y pipeline
    subscription.subscribe<StageRecord>({
      onInsert: (payload) => {
        if (payload.pipeline_id === pipelineId && handlers.onInsert) {
          handlers.onInsert(payload);
        }
      },
      onUpdate: (payload) => {
        if (payload.pipeline_id === pipelineId && handlers.onUpdate) {
          handlers.onUpdate(payload);
        }
      },
      onDelete: (payload) => {
        if (payload.pipeline_id === pipelineId && handlers.onDelete) {
          handlers.onDelete(payload);
        }
      }
    });
  }

  return subscription;
}

/**
 * Suscribe a cambios en tareas para una oportunidad específica
 * @param opportunityId - ID de la oportunidad
 * @param handlers - Manejadores de eventos
 * @returns Objeto de suscripción
 */
export function subscribeToTasks(
  opportunityId: string,
  handlers: RealtimeChangeHandler<TaskRecord>
): RealtimeSubscription {
  const organizationId = getOrganizationId();
  const subscription = new RealtimeSubscription('tasks', organizationId);
  
  if (organizationId) {
    // Suscribirse a cambios en tareas filtrados por organización y oportunidad
    subscription.subscribe<TaskRecord>({
      onInsert: (payload) => {
        if (payload.opportunity_id === opportunityId && handlers.onInsert) {
          handlers.onInsert(payload);
        }
      },
      onUpdate: (payload) => {
        if (payload.opportunity_id === opportunityId && handlers.onUpdate) {
          handlers.onUpdate(payload);
        }
      },
      onDelete: (payload) => {
        if (payload.opportunity_id === opportunityId && handlers.onDelete) {
          handlers.onDelete(payload);
        }
      }
    });
  }

  return subscription;
}

/**
 * Suscribe a cambios en un cliente específico
 * @param customerId - ID del cliente
 * @param handlers - Manejadores de eventos
 * @returns Objeto de suscripción
 */
export function subscribeToCustomer(
  customerId: string,
  handlers: RealtimeChangeHandler<CustomerRecord>
): RealtimeSubscription {
  const organizationId = getOrganizationId();
  const subscription = new RealtimeSubscription('customers', organizationId);
  
  if (organizationId) {
    // Suscribirse a cambios en el cliente filtrados por organización e ID
    subscription.subscribe<CustomerRecord>({
      onUpdate: (payload) => {
        if (payload.id === customerId && handlers.onUpdate) {
          handlers.onUpdate(payload);
        }
      },
      onDelete: (payload) => {
        if (payload.id === customerId && handlers.onDelete) {
          handlers.onDelete(payload);
        }
      }
    });
  }

  return subscription;
}
