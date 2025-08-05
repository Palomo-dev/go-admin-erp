/**
 * Servicio para gestionar el catálogo de eventos
 */

import { supabase } from '@/lib/supabase/config';
import type { EventCatalogItem } from '@/types/eventTrigger';

/**
 * Obtiene todos los eventos disponibles
 */
export const getEvents = async (): Promise<EventCatalogItem[]> => {
  try {
    console.log('📋 Obteniendo catálogo de eventos');
    
    const { data, error } = await supabase
      .from('event_catalog')
      .select('*')
      .order('module', { ascending: true })
      .order('code', { ascending: true });
    
    if (error) {
      console.error('Error al obtener eventos:', error);
      throw error;
    }
    
    console.log('✅ Eventos obtenidos:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Error en getEvents:', error);
    throw error;
  }
};

/**
 * Obtiene eventos por módulo específico
 */
export const getEventsByModule = async (module: string): Promise<EventCatalogItem[]> => {
  try {
    console.log('🔍 Obteniendo eventos del módulo:', module);
    
    const { data, error } = await supabase
      .from('event_catalog')
      .select('*')
      .eq('module', module)
      .order('code', { ascending: true });
    
    if (error) {
      console.error('Error al obtener eventos por módulo:', error);
      throw error;
    }
    
    console.log('✅ Eventos del módulo obtenidos:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Error en getEventsByModule:', error);
    throw error;
  }
};

/**
 * Obtiene un evento específico por código
 */
export const getEventByCode = async (code: string): Promise<EventCatalogItem | null> => {
  try {
    console.log('🔍 Obteniendo evento por código:', code);
    
    const { data, error } = await supabase
      .from('event_catalog')
      .select('*')
      .eq('code', code)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No encontrado
        return null;
      }
      console.error('Error al obtener evento:', error);
      throw error;
    }
    
    console.log('✅ Evento obtenido:', data?.code);
    return data;
  } catch (error) {
    console.error('Error en getEventByCode:', error);
    throw error;
  }
};

/**
 * Obtiene módulos únicos del catálogo de eventos
 */
export const getEventModules = async (): Promise<string[]> => {
  try {
    console.log('📦 Obteniendo módulos únicos');
    
    const { data, error } = await supabase
      .from('event_catalog')
      .select('module')
      .order('module', { ascending: true });
    
    if (error) {
      console.error('Error al obtener módulos:', error);
      throw error;
    }
    
    // Extraer módulos únicos
    const uniqueModules = Array.from(new Set(data?.map(item => item.module) || []));
    
    console.log('✅ Módulos únicos obtenidos:', uniqueModules);
    return uniqueModules;
  } catch (error) {
    console.error('Error en getEventModules:', error);
    throw error;
  }
};

/**
 * Crea un nuevo evento en el catálogo (opcional, para administradores)
 */
export const createEvent = async (eventData: {
  code: string;
  module: string;
  description: string;
  sample_payload: Record<string, any>;
}): Promise<EventCatalogItem> => {
  try {
    console.log('🆕 Creando nuevo evento:', eventData);
    
    const { data, error } = await supabase
      .from('event_catalog')
      .insert([eventData])
      .select()
      .single();
    
    if (error) {
      console.error('Error al crear evento:', error);
      throw error;
    }
    
    console.log('✅ Evento creado exitosamente:', data.code);
    return data;
  } catch (error) {
    console.error('Error en createEvent:', error);
    throw error;
  }
};

/**
 * Actualiza un evento existente
 */
export const updateEvent = async (
  code: string,
  updateData: {
    module?: string;
    description?: string;
    sample_payload?: Record<string, any>;
  }
): Promise<EventCatalogItem> => {
  try {
    console.log('📝 Actualizando evento:', { code, updateData });
    
    const { data, error } = await supabase
      .from('event_catalog')
      .update(updateData)
      .eq('code', code)
      .select()
      .single();
    
    if (error) {
      console.error('Error al actualizar evento:', error);
      throw error;
    }
    
    console.log('✅ Evento actualizado exitosamente:', data.code);
    return data;
  } catch (error) {
    console.error('Error en updateEvent:', error);
    throw error;
  }
};

/**
 * Mapeo de módulos a colores para la UI
 */
export const MODULE_COLORS: Record<string, string> = {
  finance: 'bg-green-100 text-green-800',
  inventory: 'bg-blue-100 text-blue-800',
  pms: 'bg-purple-100 text-purple-800',
  users: 'bg-orange-100 text-orange-800',
  crm: 'bg-pink-100 text-pink-800',
  sales: 'bg-yellow-100 text-yellow-800',
  system: 'bg-gray-100 text-gray-800'
};

/**
 * Mapeo de módulos a iconos para la UI
 */
export const MODULE_ICONS: Record<string, string> = {
  finance: '💰',
  inventory: '📦',
  pms: '🏨',
  users: '👥',
  crm: '📊',
  sales: '💼',
  system: '⚙️'
};

/**
 * Obtiene el color del módulo para la UI
 */
export const getModuleColor = (module: string): string => {
  return MODULE_COLORS[module] || 'bg-gray-100 text-gray-800';
};

/**
 * Obtiene el icono del módulo para la UI
 */
export const getModuleIcon = (module: string): string => {
  return MODULE_ICONS[module] || '📋';
};

export default {
  getEvents,
  getEventsByModule,
  getEventByCode,
  getEventModules,
  createEvent,
  updateEvent,
  getModuleColor,
  getModuleIcon
};
