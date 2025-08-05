/**
 * Servicio para gestionar plantillas de notificaciones
 */

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import type {
  NotificationTemplate,
  CreateTemplateData,
  UpdateTemplateData,
  NotificationChannel,
  ActionResult
} from '@/types/eventTrigger';

/**
 * Obtiene todas las plantillas
 */
export const getTemplates = async (channel?: NotificationChannel): Promise<NotificationTemplate[]> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('📋 Obteniendo plantillas:', { organizationId, channel });
    
    let query = supabase
      .from('notification_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('channel', { ascending: true })
      .order('name', { ascending: true });
    
    if (channel) {
      query = query.eq('channel', channel);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error al obtener plantillas:', error);
      throw error;
    }
    
    console.log('✅ Plantillas obtenidas:', data?.length || 0);
    return data || [];
  } catch (error) {
    console.error('Error en getTemplates:', error);
    throw error;
  }
};

/**
 * Obtiene plantillas agrupadas por canal
 */
export const getTemplatesByChannel = async (): Promise<Record<NotificationChannel, NotificationTemplate[]>> => {
  try {
    const templates = await getTemplates();
    
    const groupedTemplates: Record<NotificationChannel, NotificationTemplate[]> = {
      email: [],
      whatsapp: [],
      webhook: [],
      push: [],
      sms: []
    };
    
    templates.forEach(template => {
      if (template.channel in groupedTemplates) {
        groupedTemplates[template.channel].push(template);
      }
    });
    
    console.log('✅ Plantillas agrupadas por canal');
    return groupedTemplates;
  } catch (error) {
    console.error('Error en getTemplatesByChannel:', error);
    throw error;
  }
};

/**
 * Obtiene una plantilla específica por ID
 */
export const getTemplateById = async (id: string): Promise<NotificationTemplate | null> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🔍 Obteniendo plantilla por ID:', { id, organizationId });
    
    const { data, error } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No encontrada
        return null;
      }
      console.error('Error al obtener plantilla:', error);
      throw error;
    }
    
    console.log('✅ Plantilla obtenida:', data?.name);
    return data;
  } catch (error) {
    console.error('Error en getTemplateById:', error);
    throw error;
  }
};

/**
 * Crea una nueva plantilla
 */
export const createTemplate = async (
  templateData: CreateTemplateData
): Promise<NotificationTemplate> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🆕 Creando plantilla:', { organizationId, templateData });
    
    const newTemplate = {
      organization_id: organizationId,
      channel: templateData.channel,
      name: templateData.name,
      subject: templateData.subject || null,
      body_html: templateData.body_html || null,
      body_text: templateData.body_text,
      variables: templateData.variables,
      version: 1
    };
    
    const { data, error } = await supabase
      .from('notification_templates')
      .insert([newTemplate])
      .select()
      .single();
    
    if (error) {
      console.error('Error al crear plantilla:', error);
      throw error;
    }
    
    console.log('✅ Plantilla creada exitosamente:', data.id);
    return data;
  } catch (error) {
    console.error('Error en createTemplate:', error);
    throw error;
  }
};

/**
 * Actualiza una plantilla existente
 */
export const updateTemplate = async (
  id: string,
  updateData: UpdateTemplateData
): Promise<NotificationTemplate> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('📝 Actualizando plantilla:', { id, organizationId, updateData });
    
    // Incrementar versión al actualizar
    const { data: currentTemplate } = await supabase
      .from('notification_templates')
      .select('version')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();
    
    const updatePayload = {
      ...updateData,
      version: (currentTemplate?.version || 0) + 1,
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('notification_templates')
      .update(updatePayload)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();
    
    if (error) {
      console.error('Error al actualizar plantilla:', error);
      throw error;
    }
    
    console.log('✅ Plantilla actualizada exitosamente:', data.id);
    return data;
  } catch (error) {
    console.error('Error en updateTemplate:', error);
    throw error;
  }
};

/**
 * Elimina una plantilla
 */
export const deleteTemplate = async (id: string): Promise<ActionResult> => {
  try {
    const organizationId = getOrganizationId();
    
    console.log('🗑️ Eliminando plantilla:', { id, organizationId });
    
    // Verificar si la plantilla está siendo usada por algún trigger
    const { data: triggersUsingTemplate, error: checkError } = await supabase
      .from('event_triggers')
      .select('id, name')
      .eq('template_id', id)
      .eq('organization_id', organizationId);
    
    if (checkError) {
      console.error('Error al verificar uso de plantilla:', checkError);
      return { success: false, message: 'Error al verificar uso de plantilla' };
    }
    
    if (triggersUsingTemplate && triggersUsingTemplate.length > 0) {
      const triggerNames = triggersUsingTemplate.map(t => t.name).join(', ');
      return {
        success: false,
        message: `No se puede eliminar. Plantilla en uso por triggers: ${triggerNames}`
      };
    }
    
    const { error } = await supabase
      .from('notification_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('Error al eliminar plantilla:', error);
      return { success: false, message: 'Error al eliminar plantilla' };
    }
    
    console.log('✅ Plantilla eliminada exitosamente');
    return { success: true, message: 'Plantilla eliminada exitosamente' };
  } catch (error) {
    console.error('Error en deleteTemplate:', error);
    return { success: false, message: 'Error inesperado' };
  }
};

/**
 * Procesa variables en una plantilla
 */
export const processTemplate = (
  template: string,
  variables: Record<string, any>
): string => {
  let processedTemplate = template;
  
  // 🐛 DEBUG: Log para facturas
  if (template.includes('Factura de Venta Creada') || template.includes('{{customer_name}}')) {
    console.log('🔍 [processTemplate] Procesando:', {
      template: template.substring(0, 100) + '...',
      variables: variables
    });
  }
  
  // Reemplazar variables con formato {{variable}}
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    const beforeReplace = processedTemplate;
    processedTemplate = processedTemplate.replace(regex, String(value || ''));
    
    // DEBUG: Log individual de reemplazos para facturas
    if ((template.includes('Factura de Venta') || template.includes('{{customer_name}}')) && beforeReplace !== processedTemplate) {
      console.log(`🔄 Reemplazado {{${key}}} → ${value}`);
    }
  });
  
  return processedTemplate;
};

/**
 * Procesa una plantilla con variables dinámicas e imágenes automáticas de productos
 */
export const processTemplateWithProductImages = async (
  template: string,
  variables: Record<string, any>
): Promise<string> => {
  let processedTemplate = template;
  
  // Primero, intentar obtener imágenes automáticas de productos si hay variables relevantes
  if (variables.product_name || variables.product_sku) {
    try {
      const { getProductImagesFromTemplate, getPublicImageUrl } = await import('./productImageService');
      const productImages = await getProductImagesFromTemplate(variables);
      
      // Convertir a URLs públicas y agregar a las variables
      Object.entries(productImages).forEach(([key, path]) => {
        if (!variables[key]) { // Solo agregar si no existe ya
          variables[key] = getPublicImageUrl(path);
        }
      });
    } catch (error) {
      console.warn('No se pudieron cargar imágenes automáticas de productos:', error);
    }
  }
  
  // 🐛 DEBUG: Para facturas mostrar variables antes del procesamiento
  if (template.includes('{{customer_name}}') || template.includes('Factura de Venta')) {
    console.log('🔍 [processTemplateWithProductImages] Antes del reemplazo:', {
      template: template.substring(0, 200),
      variables: variables
    });
  }
  
  // 🔥 ORDEN CORREGIDO: PRIMERO dobles llaves, DESPUÉS simples
  
  // 1. Reemplazar variables con formato {{variable}} (PRIMERO)
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    const beforeReplace = processedTemplate;
    processedTemplate = processedTemplate.replace(regex, String(value || ''));
    
    // DEBUG: Log individual para facturas
    if ((template.includes('{{customer_name}}') || template.includes('Factura de Venta')) && beforeReplace !== processedTemplate) {
      console.log(`✅ [Doble Llave] Reemplazado {{${key}}} → ${value}`);
      console.log(`    Antes: ${beforeReplace.substring(0, 50)}...`);
      console.log(`    Después: ${processedTemplate.substring(0, 50)}...`);
    }
  });
  
  // 2. Reemplazar variables con formato {variable} (SEGUNDO, para casos especiales)
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\s*${key}\\s*\\}`, 'g');
    const beforeReplace = processedTemplate;
    processedTemplate = processedTemplate.replace(regex, String(value || ''));
    
    // DEBUG: Log individual para facturas
    if ((template.includes('{{customer_name}}') || template.includes('Factura de Venta')) && beforeReplace !== processedTemplate) {
      console.log(`⚠️ [Llave Simple] Reemplazado {${key}} → ${value}`);
      console.log(`    Antes: ${beforeReplace.substring(0, 50)}...`);
      console.log(`    Después: ${processedTemplate.substring(0, 50)}...`);
    }
  });
  
  // 🐛 DEBUG: Resultado final
  if (template.includes('{{customer_name}}') || template.includes('Factura de Venta')) {
    console.log('🏁 [processTemplateWithProductImages] Resultado final:', {
      original: template.substring(0, 100),
      processed: processedTemplate.substring(0, 200)
    });
  }
  
  return processedTemplate;
};

/**
 * Función especializada para procesar plantillas en envíos automáticos
 * Optimizada para eventos en tiempo real como pedidos, facturas, etc.
 */
export const processTemplateForAutomaticSending = async (
  template: NotificationTemplate,
  eventData: Record<string, any>
): Promise<{
  subject: string;
  body_text: string;
  body_html: string;
}> => {
  try {
    console.log('🔄 Procesando plantilla para envío automático:', {
      template: template.name,
      eventData: Object.keys(eventData)
    });
    
    // 🐛 DEBUG: Datos específicos para facturas
    if (template.name === 'Factura Creada') {
      console.log('🧾 [DEBUG] Datos de factura recibidos:', {
        invoice_id: eventData.invoice_id,
        customer_name: eventData.customer_name,
        amount: eventData.amount,
        due_date: eventData.due_date,
        payment_method: eventData.payment_method,
        allKeys: Object.keys(eventData)
      });
      console.log('🧾 [DEBUG] Template subject original:', template.subject);
      console.log('🧾 [DEBUG] Template body original:', template.body_text?.substring(0, 200));
    }

    // Procesar asunto si existe
    const subject = template.subject ? 
      await processTemplateWithProductImages(template.subject, eventData) : '';
    
    // Procesar contenido de texto
    const body_text = await processTemplateWithProductImages(template.body_text, eventData);
    
    // Procesar contenido HTML si existe
    const body_html = template.body_html ? 
      await processTemplateWithProductImages(template.body_html, eventData) : '';

    console.log('✅ Plantilla procesada exitosamente');
    
    return {
      subject,
      body_text,
      body_html
    };
  } catch (error) {
    console.error('❌ Error procesando plantilla:', error);
    throw error;
  }
};

/**
 * Valida variables en una plantilla
 */
export const validateTemplateVariables = (
  template: string,
  availableVariables: string[]
): {
  isValid: boolean;
  missingVariables: string[];
  unusedVariables: string[];
} => {
  // Extraer variables usadas en la plantilla
  const variableRegex = /{{(\s*\w+\s*)}}/g;
  const usedVariables: string[] = [];
  let match;
  
  while ((match = variableRegex.exec(template)) !== null) {
    const variable = match[1].trim();
    if (!usedVariables.includes(variable)) {
      usedVariables.push(variable);
    }
  }
  
  // Encontrar variables faltantes y no utilizadas
  const missingVariables = usedVariables.filter(v => !availableVariables.includes(v));
  const unusedVariables = availableVariables.filter(v => !usedVariables.includes(v));
  
  return {
    isValid: missingVariables.length === 0,
    missingVariables,
    unusedVariables
  };
};

/**
 * Obtiene canales disponibles con sus configuraciones
 */
export const getChannelConfigs = (): Record<NotificationChannel, {
  label: string;
  icon: string;
  color: string;
  supportsHtml: boolean;
  requiresSubject: boolean;
}> => {
  return {
    email: {
      label: 'Email',
      icon: '📧',
      color: 'bg-blue-100 text-blue-800',
      supportsHtml: true,
      requiresSubject: true
    },
    whatsapp: {
      label: 'WhatsApp',
      icon: '📱',
      color: 'bg-green-100 text-green-800',
      supportsHtml: false,
      requiresSubject: false
    },
    webhook: {
      label: 'Webhook',
      icon: '🔗',
      color: 'bg-purple-100 text-purple-800',
      supportsHtml: false,
      requiresSubject: false
    },
    push: {
      label: 'Push',
      icon: '🔔',
      color: 'bg-orange-100 text-orange-800',
      supportsHtml: false,
      requiresSubject: true
    },
    sms: {
      label: 'SMS',
      icon: '💬',
      color: 'bg-yellow-100 text-yellow-800',
      supportsHtml: false,
      requiresSubject: false
    }
  };
};

export default {
  getTemplates,
  getTemplatesByChannel,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  processTemplate,
  processTemplateWithProductImages,
  processTemplateForAutomaticSending,
  validateTemplateVariables,
  getChannelConfigs
};
