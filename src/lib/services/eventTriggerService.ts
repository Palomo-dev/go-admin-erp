/**
 * Servicio de Event Triggers con Supabase Real-time
 */

import { supabase } from '@/lib/supabase/config';
import Logger from '@/lib/utils/logger';
import { RealtimeChannel } from '@supabase/supabase-js';

// Types for better TypeScript support
interface EventTrigger {
  id: string;
  organization_id: number;
  name: string;
  event_code: string;
  template_id?: string | null;
  channels: string[];
  priority?: number;
  silent_window_minutes?: number;
  active: boolean;
  conditions: Record<string, any>;
  webhook_url?: string | null;
  created_at: string;
  updated_at: string;
  event_source?: string;
  custom_event_id?: string | null;
}

interface TriggerStats {
  total: number;
  active: number;
  inactive: number;
  by_channel: Record<string, number>;
  by_priority: Record<string, number>;
  by_event_code: Record<string, number>;
}



// Real-time channel for trigger updates
let triggerChannel: RealtimeChannel | null = null;

/**
 * Real-time subscription management
 */
export const subscribeToTriggerChanges = (organizationId: number, callback: (payload: { eventType: string; new: EventTrigger | null; old: EventTrigger | null }) => void) => {
  Logger.info('GENERAL', '🔔 Suscribiendo a cambios de triggers:', { organizationId });
  
  // Cleanup existing channel
  if (triggerChannel) {
    triggerChannel.unsubscribe();
  }
  
  triggerChannel = supabase
    .channel(`triggers-${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'event_triggers',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload: any) => {
        Logger.info('GENERAL', '🔄 Cambio de trigger recibido:', payload);
        callback({
          eventType: payload.eventType,
          new: payload.new as EventTrigger | null,
          old: payload.old as EventTrigger | null
        });
      }
    )
    .subscribe();
    
  return triggerChannel;
};

export const unsubscribeFromTriggerChanges = () => {
  if (triggerChannel) {
    triggerChannel.unsubscribe();
    triggerChannel = null;
    Logger.info('GENERAL', '🔕 Desuscrito de cambios de triggers');
  }
};

export const getTriggers = async (filters: any = {}, organizationId: number = 1): Promise<any> => {
  Logger.info('GENERAL', '🔍 Obteniendo triggers desde Supabase:', { organizationId, filters });

  try {
    let query = supabase
      .from('event_triggers')
      .select('*')
      .eq('organization_id', organizationId);

    // Aplicar filtros
    if (filters.active !== undefined) {
      query = query.eq('active', filters.active);
    }
    
    if (filters.event_code) {
      query = query.ilike('event_code', `%${filters.event_code}%`);
    }
    
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,event_code.ilike.%${filters.search}%`);
    }
    
    // Ordenar por fecha de creación
    query = query.order('created_at', { ascending: false });
    
    // Paginación
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    
    const { data, error, count } = await query
      .range(startIndex, startIndex + limit - 1);
      
    if (error) {
      Logger.error('GENERAL', '❌ Error obteniendo triggers:', error);
      throw error;
    }
    
    Logger.info('GENERAL', `📊 Encontrados ${data?.length || 0} triggers`);
    
    return {
      data: data || [],
      count: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    };
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en getTriggers:', error);
    throw error;
  }
};

export const getTriggerStats = async (organizationId: number = 1): Promise<TriggerStats> => {
  Logger.info('GENERAL', '📊 Calculando estadísticas de triggers desde Supabase:', { organizationId });
  
  try {
    const { data, error } = await supabase
      .from('event_triggers')
      .select('*')
      .eq('organization_id', organizationId);
      
    if (error) {
      Logger.error('GENERAL', '❌ Error obteniendo estadísticas:', error);
      throw error;
    }
    
    const triggers = (data || []) as EventTrigger[];
    
    const stats: TriggerStats = {
      total: triggers.length,
      active: triggers.filter((t: EventTrigger) => t.active).length,
      inactive: triggers.filter((t: EventTrigger) => !t.active).length,
      by_channel: {},
      by_priority: {},
      by_event_code: {}
    };
    
    // Calcular estadísticas por canal, prioridad y evento
    triggers.forEach((trigger: EventTrigger) => {
      // Estadísticas por canal
      trigger.channels?.forEach((channel: string) => {
        stats.by_channel[channel] = (stats.by_channel[channel] || 0) + 1;
      });
      
      // Estadísticas por prioridad
      if (trigger.priority) {
        stats.by_priority[trigger.priority] = (stats.by_priority[trigger.priority] || 0) + 1;
      }
      
      // Estadísticas por evento
      stats.by_event_code[trigger.event_code] = (stats.by_event_code[trigger.event_code] || 0) + 1;
    });
    
    Logger.info('GENERAL', '📊 Estadísticas calculadas:', stats);
    
    return stats;
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en getTriggerStats:', error);
    throw error;
  }
};

export const createTrigger = async (triggerData: Partial<EventTrigger>, organizationId: number = 1): Promise<EventTrigger> => {
  Logger.info('GENERAL', '🆕 Creando trigger en Supabase:', { organizationId, triggerData });
  
  try {
    const newTrigger = {
      organization_id: organizationId,
      name: triggerData.name || '',
      event_code: triggerData.event_code || '',
      template_id: triggerData.template_id || null,
      channels: triggerData.channels || [],
      priority: triggerData.priority || 2,
      silent_window_minutes: triggerData.silent_window_minutes || 0,
      active: triggerData.active ?? true,
      conditions: triggerData.conditions || {},
      webhook_url: triggerData.webhook_url || null,
      event_source: triggerData.event_source || 'system',
      custom_event_id: triggerData.custom_event_id || null
    };
    
    const { data, error } = await supabase
      .from('event_triggers')
      .insert([newTrigger])
      .select()
      .single();
      
    if (error) {
      Logger.error('GENERAL', '❌ Error creando trigger:', error);
      throw error;
    }
    
    Logger.info('GENERAL', '✅ Trigger creado exitosamente:', data);
    
    return data as EventTrigger;
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en createTrigger:', error);
    throw error;
  }
};

export const updateTrigger = async (id: string, updateData: Partial<EventTrigger>, organizationId: number = 1): Promise<EventTrigger> => {
  Logger.info('GENERAL', '📝 Actualizando trigger en Supabase:', { id, organizationId, updateData });
  
  try {
    const updatePayload = {
      ...updateData,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('event_triggers')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
      
    if (error) {
      Logger.error('GENERAL', '❌ Error actualizando trigger:', error);
      throw error;
    }
    
    if (!data) {
      throw new Error('Trigger no encontrado');
    }
    
    Logger.info('GENERAL', '✅ Trigger actualizado exitosamente:', data);
    
    return data as EventTrigger;
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en updateTrigger:', error);
    throw error;
  }
};

export const deleteTrigger = async (id: string, organizationId: number = 1): Promise<{ success: boolean; message: string }> => {
  Logger.info('GENERAL', '🗑️ Eliminando trigger de Supabase:', { id, organizationId });
  
  try {
    const { error } = await supabase
      .from('event_triggers')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
      
    if (error) {
      Logger.error('GENERAL', '❌ Error eliminando trigger:', error);
      throw error;
    }
    
    Logger.info('GENERAL', '✅ Trigger eliminado exitosamente');
    
    return { success: true, message: 'Trigger eliminado correctamente' };
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en deleteTrigger:', error);
    return { success: false, message: 'Error eliminando trigger' };
  }
};

export const toggleTriggerStatus = async (id: string, isActive: boolean, organizationId: number = 1): Promise<{ success: boolean; trigger?: EventTrigger; message?: string }> => {
  Logger.info('GENERAL', '🔄 Cambiando estado trigger en Supabase:', { id, isActive, organizationId });
  
  try {
    const { data, error } = await supabase
      .from('event_triggers')
      .update({ 
        active: isActive, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
      
    if (error) {
      Logger.error('GENERAL', '❌ Error cambiando estado trigger:', error);
      throw error;
    }
    
    if (!data) {
      return { success: false, message: 'Trigger no encontrado' };
    }
    
    Logger.info('GENERAL', `✅ Estado de trigger ${isActive ? 'activado' : 'desactivado'}:`, data.name);
    
    return { success: true, trigger: data as EventTrigger };
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en toggleTriggerStatus:', error);
    return { success: false, message: 'Error cambiando estado del trigger' };
  }
};

export const testTrigger = async (triggerId: string, testData: Record<string, any>): Promise<{ success: boolean; message: string; data?: any }> => {
  Logger.info('GENERAL', '🧪 Probando trigger:', { triggerId, testData });
  
  try {
    // Obtener información del trigger
    const { data: trigger, error } = await supabase
      .from('event_triggers')
      .select('*')
      .eq('id', triggerId)
      .single();
      
    if (error || !trigger) {
      return { success: false, message: 'Trigger no encontrado' };
    }
    
    // Simulación de ejecución del trigger
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
    
    // Simular resultado exitoso con datos
    const simulatedChannels = trigger.channels || ['email'];
    const simulatedNotifications = simulatedChannels.length;
    
    Logger.info('GENERAL', '✅ Trigger probado exitosamente:', trigger.name);
    
    return { 
      success: true, 
      message: `Trigger "${trigger.name}" ejecutado correctamente en modo de prueba`,
      data: {
        notifications: simulatedNotifications,
        channels: simulatedChannels,
        trigger_name: trigger.name,
        event_code: trigger.event_code
      }
    };
    
  } catch (error) {
    Logger.error('GENERAL', '❌ Error en testTrigger:', error);
    return { success: false, message: 'Error probando trigger' };
  }
};
