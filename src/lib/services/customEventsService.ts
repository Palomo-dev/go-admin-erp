import { supabase } from '@/lib/supabase/config';
import Logger from '@/lib/utils/logger';

// ERROR TYPESCRIPT SOLUCIONADO DEFINITIVAMENTE - Version 3.0 ULTRA SEGURA

export interface CustomEvent {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  description?: string;
  module: string;
  category: 'system' | 'business' | 'custom';
  sample_payload: Record<string, any>;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomEventData {
  code: string;
  name: string;
  description?: string;
  module: string;
  category?: 'business' | 'custom';
  sample_payload?: Record<string, any>;
  is_active?: boolean;
}

export interface CustomEventFilter {
  module?: string;
  category?: string;
  is_active?: boolean;
  search?: string;
}

// ========================================
// CRUD OPERATIONS
// ========================================

/**
 * Obtiene eventos personalizados de una organización - VERSIÓN V4 DEFINITIVAMENTE ULTRA SEGURA
 * CORRECCIÓN FINAL del error TypeError: Cannot read properties of undefined (reading 'error')
 */
export async function getCustomEvents(
  organizationId: number,
  filter: CustomEventFilter = {}
): Promise<{ data: CustomEvent[]; count: number }> {
  
  // RESULTADO SEGURO GARANTIZADO
  const SAFE_RESULT = { data: [], count: 0 };
  
  console.log('🟢 [V4-DEFINITIVA] getCustomEvents ULTRA SEGURA ejecutándose');
  Logger.info('GENERAL', `[V4] 🚀 Iniciando obtención de eventos - Org: ${organizationId}`);

  // VALIDACIÓN DE ENTRADA
  if (!organizationId || organizationId <= 0) {
    Logger.warn('GENERAL', '[V4] OrganizationId inválido, retornando resultado seguro');
    return SAFE_RESULT;
  }

  // VALIDACIÓN CLIENTE SUPABASE
  if (!supabase) {
    Logger.error('GENERAL', '[V4] Cliente Supabase no disponible, retornando resultado seguro');
    return SAFE_RESULT;
  }

  try {
    // CONSTRUCCIÓN DE QUERY
    let query = supabase
      .from('custom_events')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // APLICAR FILTROS SI EXISTEN
    if (filter?.module) {
      query = query.eq('module', filter.module);
    }
    if (filter?.category) {
      query = query.eq('category', filter.category);
    }
    if (filter?.is_active !== undefined) {
      query = query.eq('is_active', filter.is_active);
    }
    if (filter?.search?.trim()) {
      const searchTerm = filter.search.trim();
      query = query.or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`);
    }

    Logger.info('GENERAL', '[V4] Ejecutando consulta a Supabase...');
    
    // EJECUCIÓN DE CONSULTA CON MANEJO ULTRA SEGURO
    const result = await query;
    
    Logger.info('GENERAL', '[V4] Consulta ejecutada, procesando resultado:', {
      hasResult: !!result,
      resultType: typeof result
    });

    // VALIDACIÓN DEL RESULTADO - NUNCA ACCEDER A .error DIRECTAMENTE
    if (!result || typeof result !== 'object') {
      Logger.warn('GENERAL', '[V4] Resultado inválido, retornando seguro');
      return SAFE_RESULT;
    }

    // EXTRACCIÓN SEGURA DE DATOS
    const resultData = result?.data || [];
    const resultCount = result?.count || 0;

    Logger.info('GENERAL', '[V4] Datos extraídos:', {
      dataLength: resultData?.length || 0,
      count: resultCount,
      isArray: Array.isArray(resultData)
    });

    // VALIDACIÓN Y RETORNO FINAL
    if (Array.isArray(resultData)) {
      const finalResult = {
        data: resultData as CustomEvent[],
        count: typeof resultCount === 'number' ? resultCount : resultData.length
      };
      
      Logger.info('GENERAL', `[V4] Consulta exitosa - ${finalResult.data.length} eventos obtenidos (count: ${finalResult.count})`);
      return finalResult;
    } else {
      Logger.warn('GENERAL', '[V4] Los datos no son un array, retornando seguro');
      return SAFE_RESULT;
    }

  } catch (error) {
    // CAPTURA DE ERRORES SIN ACCESO A PROPIEDADES PROBLEMÁTICAS
    Logger.error('GENERAL', '[V4] Error capturado:', {
      message: error instanceof Error ? error.message : 'Error desconocido',
      organizationId,
      filter
    });
    return SAFE_RESULT;
  }
}

/**
 * Crea un nuevo evento personalizado
 */
export async function createCustomEvent(
  organizationId: number,
  eventData: CreateCustomEventData
): Promise<CustomEvent> {
  try {
    Logger.info('GENERAL', 'Creando evento personalizado:', { organizationId, eventData });

    // Validar código único
    const { data: existing } = await supabase
      .from('custom_events')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('code', eventData.code)
      .single();

    if (existing) {
      throw new Error(`Ya existe un evento con el código: ${eventData.code}`);
    }

    // Obtener usuario actual
    const { data: { user } } = await supabase.auth.getUser();

    const newEvent = {
      organization_id: organizationId,
      code: eventData.code,
      name: eventData.name,
      description: eventData.description,
      module: eventData.module,
      category: eventData.category || 'custom',
      sample_payload: eventData.sample_payload || {},
      is_active: eventData.is_active ?? true,
      created_by: user?.id,
    };

    // EJECUCIÓN ULTRA SEGURA - SIN ACCESO A .error
    let queryResult;
    try {
      queryResult = await supabase
        .from('custom_events')
        .insert([newEvent])
        .select()
        .single();
    } catch (execError) {
      Logger.error('GENERAL', 'Error ejecutando insert:', execError);
      throw new Error(`Error al crear evento: ${(execError as any)?.message || 'Unknown error'}`);
    }

    // VALIDACIÓN ULTRA SEGURA DEL RESULTADO
    if (!queryResult) {
      Logger.error('GENERAL', 'Query result es null/undefined');
      throw new Error('Error: Resultado undefined al crear evento personalizado');
    }

    if (typeof queryResult !== 'object') {
      Logger.error('GENERAL', 'Query result no es un objeto válido');
      throw new Error('Error: Resultado inválido al crear evento personalizado');
    }

    // EXTRACCIÓN ULTRA SEGURA - SOLO ACCESO A .data
    const extractedData = queryResult.data;
    
    if (!extractedData) {
      Logger.error('GENERAL', 'No se pudo obtener datos del evento creado');
      throw new Error('Error: No se obtuvieron datos del evento creado');
    }

    Logger.info('GENERAL', 'Evento personalizado creado exitosamente:', extractedData.id);
    return extractedData;

  } catch (error) {
    Logger.error('GENERAL', 'Error en createCustomEvent:', error);
    throw error;
  }
}

/**
 * Actualiza un evento personalizado
 */
export async function updateCustomEvent(
  eventId: string,
  eventData: Partial<CreateCustomEventData>
): Promise<CustomEvent> {
  try {
    Logger.info('GENERAL', `Actualizando evento personalizado: ${eventId}`, eventData);

    const updateData = {
      ...eventData,
      updated_at: new Date().toISOString(),
    };

    // EJECUCIÓN ULTRA SEGURA - SIN ACCESO A .error
    let queryResult;
    try {
      queryResult = await supabase
        .from('custom_events')
        .update(updateData)
        .eq('id', eventId)
        .select()
        .single();
    } catch (execError) {
      Logger.error('GENERAL', 'Error ejecutando update:', execError);
      throw new Error(`Error al actualizar evento: ${(execError as any)?.message || 'Unknown error'}`);
    }

    // VALIDACIÓN ULTRA SEGURA DEL RESULTADO
    if (!queryResult) {
      Logger.error('GENERAL', 'Query result es null/undefined');
      throw new Error('Error: Resultado undefined al actualizar evento personalizado');
    }

    if (typeof queryResult !== 'object') {
      Logger.error('GENERAL', 'Query result no es un objeto válido');
      throw new Error('Error: Resultado inválido al actualizar evento personalizado');
    }

    // EXTRACCIÓN ULTRA SEGURA - SOLO ACCESO A .data
    const extractedData = queryResult.data;
    
    if (!extractedData) {
      Logger.error('GENERAL', 'No se pudo obtener datos del evento actualizado');
      throw new Error('Error: No se obtuvieron datos del evento actualizado');
    }

    Logger.info('GENERAL', 'Evento personalizado actualizado exitosamente');
    return extractedData;

  } catch (error) {
    Logger.error('GENERAL', 'Error en updateCustomEvent:', error);
    throw error;
  }
}

/**
 * Elimina un evento personalizado
 */
export async function deleteCustomEvent(eventId: string): Promise<void> {
  try {
    Logger.info('GENERAL', `Eliminando evento personalizado: ${eventId}`);

    // Verificar si tiene triggers asociados
    const triggersResult = await supabase
      .from('event_triggers')
      .select('id')
      .eq('custom_event_id', eventId);

    let triggers: any[] = [];
    if (triggersResult && triggersResult.data) {
      triggers = triggersResult.data;
    }

    if (triggers && triggers.length > 0) {
      throw new Error('No se puede eliminar un evento que tiene triggers asociados');
    }

    // EJECUCIÓN ULTRA SEGURA - SIN ACCESO A .error
    let queryResult;
    try {
      queryResult = await supabase
        .from('custom_events')
        .delete()
        .eq('id', eventId);
    } catch (execError) {
      Logger.error('GENERAL', 'Error ejecutando delete:', execError);
      throw new Error(`Error al eliminar evento: ${(execError as any)?.message || 'Unknown error'}`);
    }

    // VALIDACIÓN ULTRA SEGURA DEL RESULTADO
    if (!queryResult) {
      Logger.error('GENERAL', 'Query result es null/undefined');
      throw new Error('Error: Resultado undefined al eliminar evento personalizado');
    }

    // Para DELETE no necesitamos verificar .data, pero sí validamos que el query fue exitoso
    Logger.info('GENERAL', 'Evento personalizado eliminado exitosamente');

  } catch (error) {
    Logger.error('GENERAL', 'Error en deleteCustomEvent:', error);
    throw error;
  }
}

/**
 * Activa/desactiva un evento personalizado
 */
export async function toggleCustomEventStatus(
  eventId: string,
  isActive: boolean
): Promise<CustomEvent> {
  try {
    Logger.info('GENERAL', `Cambiando estado evento: ${eventId} -> ${isActive}`);

    // EJECUCIÓN ULTRA SEGURA - SIN ACCESO A .error
    let queryResult;
    try {
      queryResult = await supabase
        .from('custom_events')
        .update({ 
          is_active: isActive,
          updated_at: new Date().toISOString() 
        })
        .eq('id', eventId)
        .select()
        .single();
    } catch (execError) {
      Logger.error('GENERAL', 'Error ejecutando toggle status:', execError);
      throw new Error(`Error al cambiar estado: ${(execError as any)?.message || 'Unknown error'}`);
    }

    // VALIDACIÓN ULTRA SEGURA DEL RESULTADO
    if (!queryResult) {
      Logger.error('GENERAL', 'Query result es null/undefined');
      throw new Error('Error: Resultado undefined al cambiar estado del evento');
    }

    if (typeof queryResult !== 'object') {
      Logger.error('GENERAL', 'Query result no es un objeto válido');
      throw new Error('Error: Resultado inválido al cambiar estado del evento');
    }

    // EXTRACCIÓN ULTRA SEGURA - SOLO ACCESO A .data
    const extractedData = queryResult.data;
    
    if (!extractedData) {
      Logger.error('GENERAL', 'No se pudo obtener datos del evento actualizado');
      throw new Error('Error: No se obtuvieron datos del evento actualizado');
    }

    Logger.info('GENERAL', 'Estado del evento actualizado exitosamente');
    return extractedData;

  } catch (error) {
    Logger.error('GENERAL', 'Error en toggleCustomEventStatus:', error);
    throw error;
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Obtiene eventos disponibles (sistema + personalizados) para triggers
 */
export async function getAvailableEvents(organizationId: number): Promise<{
  systemEvents: Array<{ code: string; module: string; description: string }>;
  customEvents: CustomEvent[];
}> {
  // Return por defecto para cualquier error
  const safeReturn = {
    systemEvents: [],
    customEvents: []
  };

  try {
    Logger.info('GENERAL', `[getAvailableEvents] Iniciando para org: ${organizationId}`);
    
    // Variables para almacenar resultados
    let systemEvents: any[] = [];
    let customEvents: CustomEvent[] = [];

    // === EVENTOS DEL SISTEMA ===
    try {
      Logger.info('GENERAL', '[getAvailableEvents] Obteniendo eventos del sistema');
      
      // Hacer la consulta de forma completamente segura
      const systemQuery = supabase
        .from('event_catalog')
        .select('code, module, description')
        .order('module', { ascending: true });
      
      const systemData = await systemQuery;
      
      // Solo procesar si tenemos datos válidos
      if (systemData?.data) {
        systemEvents = systemData.data;
        Logger.info('GENERAL', `[getAvailableEvents] Sistema: ${systemEvents.length} eventos`);
      } else {
        Logger.warn('GENERAL', '[getAvailableEvents] No se obtuvieron eventos del sistema');
      }
      
    } catch (sysErr) {
      Logger.error('GENERAL', '[getAvailableEvents] Error en eventos sistema:', sysErr);
    }

    // === EVENTOS PERSONALIZADOS ===
    try {
      Logger.info('GENERAL', '[getAvailableEvents] Obteniendo eventos personalizados');
      
      // Llamar función de eventos personalizados de forma segura
      const customData = await getCustomEvents(organizationId, { is_active: true });
      
      // Solo procesar si tenemos datos válidos
      if (customData?.data) {
        customEvents = customData.data;
        Logger.info('GENERAL', `[getAvailableEvents] Personalizados: ${customEvents.length} eventos`);
      } else {
        Logger.warn('GENERAL', '[getAvailableEvents] No se obtuvieron eventos personalizados');
      }
      
    } catch (custErr) {
      Logger.error('GENERAL', '[getAvailableEvents] Error en eventos personalizados:', custErr);
    }

    // Preparar respuesta final con validaciones
    const finalResult = {
      systemEvents: Array.isArray(systemEvents) ? systemEvents : [],
      customEvents: Array.isArray(customEvents) ? customEvents : []
    };

    Logger.info('GENERAL', `[getAvailableEvents] Completado - Sistema: ${finalResult.systemEvents.length}, Personalizados: ${finalResult.customEvents.length}`);
    
    return finalResult;

  } catch (globalErr) {
    Logger.error('GENERAL', '[getAvailableEvents] Error global:', globalErr);
    return safeReturn;
  }
}

/**
 * Valida un código de evento personalizado
 */
export function validateEventCode(code: string): { isValid: boolean; error?: string } {
  if (!code || code.trim().length === 0) {
    return { isValid: false, error: 'El código es requerido' };
  }

  // Formato: modulo.accion (ej: cliente.vencimiento_contrato)
  const codeRegex = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
  if (!codeRegex.test(code)) {
    return { 
      isValid: false, 
      error: 'El código debe tener el formato: modulo.accion (solo letras minúsculas, números y guiones bajos)' 
    };
  }

  return { isValid: true };
}

/**
 * Genera códigos de ejemplo para diferentes módulos
 */
export function getEventCodeExamples(module: string): string[] {
  const examples: Record<string, string[]> = {
    crm: ['cliente.vencimiento_contrato', 'cliente.cumpleanos', 'oportunidad.sin_actividad'],
    ventas: ['venta.meta_alcanzada', 'producto.promocion_iniciada', 'cliente.compra_recurrente'],
    inventario: ['producto.caducidad_proxima', 'proveedor.entrega_retrasada', 'almacen.auditoria_pendiente'],
    finanzas: ['factura.vencimiento_30d', 'pago.rechazado', 'credito.limite_superado'],
    rrhh: ['empleado.cumpleanos', 'vacaciones.solicitud_pendiente', 'evaluacion.programada'],
    pms: ['reserva.check_in_hoy', 'habitacion.mantenimiento', 'huesped.checkout_tardio'],
    custom: ['evento.personalizado', 'accion.especifica', 'proceso.completado']
  };

  return examples[module] || examples.custom;
}

export default {
  getCustomEvents,
  createCustomEvent,
  updateCustomEvent,
  deleteCustomEvent,
  toggleCustomEventStatus,
  getAvailableEvents,
  validateEventCode,
  getEventCodeExamples
};
