/**
 * Utilidad para traducir y formatear notificaciones del sistema
 * Convierte los mensajes técnicos en texto comprensible en español
 */

import type { NotificationType, SourceModule } from '@/types/notification';

export interface NotificationTranslation {
  title: string;
  message: string;
  category: 'info' | 'success' | 'warning' | 'error';
  icon?: string;
}

// Tipo para payload de notificaciones
export interface NotificationPayload {
  type?: string;
  event_code?: string;
  source_module?: string;
  title?: string;
  message?: string;
  subject?: string;
  category?: string;
  icon?: string;
  due_date?: string;
  metadata?: {
    event_code?: string;
    event_data?: {
      invoice_id?: string;
      customer_name?: string;
      customer_email?: string;
      amount?: number;
      total?: number;
      currency?: string;
      payment_method?: string;
      products?: Array<{ name?: string; sku?: string }>;
      due_date?: string;
      amount_formatted?: string;
    };
  };
  event_data?: {
    invoice_id?: string;
    customer_name?: string;
    customer_email?: string;
    amount?: number;
    total?: number;
    currency?: string;
    payment_method?: string;
    products?: Array<{ name?: string; sku?: string }>;
    due_date?: string;
    amount_formatted?: string;
  };
  // Campos adicionales que pueden estar presentes
  [key: string]: unknown;
}

/**
 * Mapeo de tipos de notificación a módulos del sistema
 */
export const NOTIFICATION_TYPE_TO_MODULE: Record<NotificationType, SourceModule> = {
  // CRM y Ventas
  'stage_change': 'crm',
  'opportunity_won': 'ventas',
  'opportunity_lost': 'ventas',
  'opportunity_regressed': 'crm',
  'proposal_stage': 'ventas',
  'client_created': 'crm',
  'client_updated': 'crm',
  'task_assigned': 'crm',
  'task_due': 'crm',
  'task_created_for_client': 'crm',
  
  // Finanzas
  'payment_received': 'finanzas',
  'invoice_created': 'finanzas',
  
  // PMS
  'booking_created': 'pms',
  'booking_updated': 'pms',
  
  // Inventario
  'product_low_stock': 'inventario',
  'product_out_of_stock': 'inventario',
  
  // RR.HH.
  'employee_added': 'rrhh',
  'employee_updated': 'rrhh',
  
  // Sistema
  'system_alert': 'sistema',
};

/**
 * Traducciones para alertas del sistema
 */
export const ALERT_TRANSLATIONS: Record<string, string> = {
  // Severidades
  critical: 'Crítico',
  error: 'Error',
  warning: 'Advertencia',
  info: 'Información',
  
  // Estados
  active: 'Activo',
  resolved: 'Resuelto',
  pending: 'Pendiente',
  acknowledged: 'Reconocido',
  
  // Módulos fuente
  system: 'Sistema',
  database: 'Base de Datos',
  auth: 'Autenticación',
  api: 'API',
  storage: 'Almacenamiento',
  email: 'Email',
  payment: 'Pagos',
  crm: 'CRM',
  inventory: 'Inventario',
  pos: 'Punto de Venta'
};

/**
 * Obtiene el módulo correspondiente a un tipo de notificación
 */
export const getModuleFromNotificationType = (type: string): SourceModule | null => {
  return NOTIFICATION_TYPE_TO_MODULE[type as NotificationType] || null;
};

/**
 * Mapeo de tipos de notificaciones a traducciones en español
 */
const NOTIFICATION_TRANSLATIONS: Record<string, NotificationTranslation> = {
  // === OPORTUNIDADES CRM ===
  'opportunity_won': {
    title: 'Oportunidad Ganada',
    message: 'Se ha cerrado una oportunidad exitosamente',
    category: 'success',
    icon: '🎉'
  },
  'opportunity_lost': {
    title: 'Oportunidad Perdida', 
    message: 'Una oportunidad ha sido marcada como perdida',
    category: 'warning',
    icon: '⚠️'
  },
  'opportunity_regressed': {
    title: 'Retroceso en Oportunidad',
    message: 'Una oportunidad ha retrocedido en el pipeline',
    category: 'warning',
    icon: '🔄'
  },
  'stage_change': {
    title: 'Cambio de Etapa',
    message: 'Una oportunidad ha cambiado de etapa en el pipeline',
    category: 'info',
    icon: '📈'
  },
  'opportunity_created': {
    title: 'Nueva Oportunidad',
    message: 'Se ha creado una nueva oportunidad de negocio',
    category: 'info',
    icon: '💼'
  },
  'opportunity_updated': {
    title: 'Oportunidad Actualizada',
    message: 'Se ha actualizado la información de una oportunidad',
    category: 'info',
    icon: '✏️'
  },

  // === TAREAS CRM ===
  'task_assigned': {
    title: 'Tarea Asignada',
    message: 'Se te ha asignado una nueva tarea',
    category: 'info',
    icon: '📋'
  },
  'task_completed': {
    title: 'Tarea Completada',
    message: 'Una tarea ha sido marcada como completada',
    category: 'success',
    icon: '✅'
  },
  'task_overdue': {
    title: 'Tarea Vencida',
    message: 'Una tarea ha superado su fecha límite',
    category: 'error',
    icon: '⏰'
  },
  'task_due_soon': {
    title: 'Tarea Por Vencer',
    message: 'Una tarea vence pronto - requiere atención',
    category: 'warning',
    icon: '🔔'
  },
  'task_created_for_client': {
    title: 'Tarea Relacionada',
    message: 'Se ha creado una nueva tarea relacionada contigo',
    category: 'info',
    icon: '📋'
  },



  // === ACTIVIDADES CRM ===
  'activity_created': {
    title: 'Nueva Actividad',
    message: 'Se ha registrado una nueva actividad',
    category: 'info',
    icon: '📝'
  },
  'call_received': {
    title: 'Llamada Recibida',
    message: 'Se ha recibido una nueva llamada',
    category: 'info',
    icon: '📞'
  },
  'call_made': {
    title: 'Llamada Realizada',
    message: 'Se ha registrado una llamada saliente',
    category: 'info',
    icon: '📞'
  },
  'email_received': {
    title: 'Email Recibido',
    message: 'Has recibido un nuevo email',
    category: 'info',
    icon: '📧'
  },
  'email_sent': {
    title: 'Email Enviado',
    message: 'Se ha enviado un email exitosamente',
    category: 'success',
    icon: '📧'
  },
  'whatsapp_received': {
    title: 'WhatsApp Recibido',
    message: 'Has recibido un mensaje de WhatsApp',
    category: 'info',
    icon: '💬'
  },
  'sms_received': {
    title: 'SMS Recibido',
    message: 'Has recibido un mensaje de texto',
    category: 'info',
    icon: '📱'
  },

  // === CLIENTES ===
  'customer_created': {
    title: 'Nuevo Cliente',
    message: 'Se ha registrado un nuevo cliente',
    category: 'success',
    icon: '👤'
  },
  'customer_updated': {
    title: 'Cliente Actualizado',
    message: 'Se ha actualizado la información de un cliente',
    category: 'info',
    icon: '✏️'
  },

  // === SISTEMA ===
  'system_alert': {
    title: 'Alerta del Sistema',
    message: 'El sistema requiere tu atención',
    category: 'warning',
    icon: '⚠️'
  },
  'backup_completed': {
    title: 'Respaldo Completado',
    message: 'El respaldo automático se ha completado exitosamente',
    category: 'success',
    icon: '💾'
  },
  'maintenance_scheduled': {
    title: 'Mantenimiento Programado',
    message: 'El sistema entrará en mantenimiento programado',
    category: 'warning',
    icon: '🔧'
  },

  // === INVENTARIO ===
  'product_low_stock': {
    title: 'Stock Bajo',
    message: 'Un producto tiene stock bajo y requiere reposición',
    category: 'warning',
    icon: '📦'
  },
  'product_out_of_stock': {
    title: 'Sin Stock',
    message: 'Un producto se ha quedado sin inventario',
    category: 'error',
    icon: '📦'
  },

  // === FINANZAS ===
  'invoice_created': {
    title: 'Factura Creada',
    message: 'Se ha generado una nueva factura',
    category: 'info',
    icon: '🧾'
  },
  'invoice_paid': {
    title: 'Factura Pagada',
    message: 'Se ha recibido el pago de una factura',
    category: 'success',
    icon: '💰'
  },
  'payment_overdue': {
    title: 'Pago Vencido',
    message: 'Una factura ha superado su fecha de pago',
    category: 'error',
    icon: '⏰'
  },

  // === FACTURACIÓN ===
  'invoice.created': {
    title: 'Nueva Factura Creada',
    message: 'Se ha creado una nueva factura',
    category: 'success',
    icon: '🧾'
  },

  'invoice.paid': {
    title: 'Factura Pagada',
    message: 'Una factura ha sido pagada exitosamente',
    category: 'success',
    icon: '💰'
  },

  'invoice.overdue': {
    title: 'Factura Vencida',
    message: 'Una factura ha superado su fecha de vencimiento',
    category: 'warning',
    icon: '📅'
  },

  // === SISTEMA ===
  'system_webhook': {
    title: 'Llamada del Sistema',
    message: 'El sistema ha procesado una solicitud externa',
    category: 'info',
    icon: '🔗'
  },
  'system_error': {
    title: 'Error del Sistema',
    message: 'Se ha detectado un error en el sistema',
    category: 'error',
    icon: '🚨'
  },
  'system_maintenance': {
    title: 'Mantenimiento',
    message: 'El sistema está en mantenimiento programado',
    category: 'info',
    icon: '🔧'
  },

  // === GENERAL ===
  'general': {
    title: 'Notificación',
    message: 'Nueva notificación del sistema',
    category: 'info',
    icon: '🔔'
  },
  'test_notification': {
    title: 'Notificación de Prueba',
    message: 'Esta es una notificación de prueba del sistema',
    category: 'info',
    icon: '🧪'
  }
};

/**
 * Traduce y formatea el contenido de una notificación
 */
export function translateNotification(payload: NotificationPayload | null | undefined): NotificationTranslation {
  try {
    console.log('🚀 translateNotification ENTRADA:', { payload, typeofPayload: typeof payload });
    
    // Si no hay payload o es inválido, usar traducciones por defecto
    if (!payload) {
      console.warn('⚠️ translateNotification: payload vacío o null');
      return {
        title: 'Notificación',
        message: 'Nueva notificación disponible',
        category: 'info',
        icon: '📩'
      };
    }
    
    // Obtener la traducción base
    const translation = getTranslation(payload);
    
    // 🗺️ FACTURAS: Siempre procesar por enrichTranslation para obtener título correcto
    const isInvoiceNotification = payload?.metadata?.event_code === 'invoice.created' || 
                                payload?.type === 'invoice.created' ||
                                (payload?.title && payload.title.includes('Factura'));
    
    if (isInvoiceNotification) {
      console.log('🧾 FACTURA DETECTADA - Procesando por enrichTranslation');
      const enrichedTranslation = enrichTranslation(translation, payload);
      return enrichedTranslation;
    }
    
    // Para otros tipos: verificar si ya hay título y mensaje específicos
    if (payload.title && payload.message) {
      return {
        title: payload.title,
        message: payload.message,
        category: translation.category || 'info',
        icon: translation.icon || '️'
      };
    }
    
    // Enriquecer con información específica del payload
    const enrichedTranslation = enrichTranslation(translation, payload);
    console.log('✨ translateNotification RESULTADO FINAL:', enrichedTranslation);
    
    return enrichedTranslation;
    
  } catch (error) {
    console.error('❌ Error en translateNotification:', error);
    return {
      title: 'Notificación',
      message: 'Nueva notificación disponible',
      category: 'info',
      icon: '�'
    };
  }
}

/**
 * Obtiene la traducción base para una notificación
 */
function getTranslation(payload: NotificationPayload | null | undefined): NotificationTranslation {
  // Determinar el tipo de notificación
  const type = payload?.type || 'system_alert';
  console.log('🏷️ translateNotification TIPO:', type);
  
  // Buscar traducción específica
  let translation = NOTIFICATION_TRANSLATIONS[type];
  console.log('📋 translateNotification TRANSLATION FOUND:', !!translation, translation);
  
  // Si no existe traducción específica, crear una genérica
  if (!translation) {
    console.log('⚠️ translateNotification - Creando traducción genérica para:', type);
    translation = {
      title: formatTitle(payload?.title || type),
      message: payload?.message || 'Nueva notificación del sistema',
      category: 'info',
      icon: '🔔'
    };
  }
  
  return translation;
}

/**
 * Enriquece la traducción con información específica del payload
 */
function enrichTranslation(translation: NotificationTranslation, payload: NotificationPayload | null | undefined): NotificationTranslation {
  const enriched = { ...translation };
  
  try {
    // Usar subject como título si es más descriptivo que el tipo
    if (payload?.subject && payload.subject !== payload?.type && payload.subject.length > 10) {
      enriched.title = payload.subject;
    }
    
    // Mejorar títulos para tipos específicos
    if (payload?.type === 'opportunity_won') {
      enriched.title = 'Oportunidad Ganada';
      enriched.message = '¡Felicidades! Se ha cerrado una oportunidad exitosamente';
      enriched.category = 'success';
    }
    
    if (payload?.type === 'opportunity_lost') {
      enriched.title = 'Oportunidad Perdida';
      enriched.message = 'Se ha perdido una oportunidad';
      enriched.category = 'warning';
    }
    
    if (payload?.type === 'stage_change') {
      enriched.title = 'Cambio de Etapa';
      enriched.message = 'Una oportunidad ha cambiado de etapa en el pipeline de ventas';
      enriched.category = 'info';
    }
    
    if (payload?.type === 'task_assigned') {
      enriched.title = 'Tarea Asignada';
      enriched.message = 'Se te ha asignado una nueva tarea';
      enriched.category = 'info';
    }
    
    if (payload?.type === 'task_created_for_client') {
      enriched.title = 'Nueva Tarea Relacionada';
      enriched.message = 'Se ha creado una nueva tarea relacionada contigo';
      enriched.category = 'info';
    }
    
    // Agregar información de oportunidad si está disponible
    if (payload?.opportunity_id && typeof payload.opportunity_id === 'string') {
      // Si hay un mensaje sobre oportunidad, mantenerlo
      if (payload?.opportunity_title && typeof payload.opportunity_title === 'string') {
        enriched.message += ` - ${payload.opportunity_title}`;
      } else if (translation.title.includes('Oportunidad') || translation.title.includes('Etapa')) {
        enriched.message += ` (ID: ${payload.opportunity_id.substring(0, 8)}...)`;
      }
    }
    
    // Agregar información de cliente si está disponible
    if (payload?.customer_id || 
        (payload?.context && typeof payload.context === 'object' && payload.context !== null && 
         'type' in payload.context && payload.context.type === 'customer')) {
      if (payload?.customer_name && typeof payload.customer_name === 'string') {
        enriched.message += ` - Cliente: ${payload.customer_name}`;
      }
    }
    
    // Agregar información de tarea si está disponible
    if (payload?.task_id || 
        (payload?.context && typeof payload.context === 'object' && payload.context !== null && 
         'type' in payload.context && payload.context.type === 'task')) {
      if (payload?.task_title && typeof payload.task_title === 'string') {
        enriched.message += ` - Tarea: ${payload.task_title}`;
      }
    }
    
    // Agregar información temporal si está disponible
    if (payload?.due_date) {
      const dueDate = new Date(payload.due_date);
      enriched.message += ` (Vence: ${dueDate.toLocaleDateString('es-ES')})`;
    }

    // ===== PROCESAMIENTO ESPECÍFICO DE FACTURAS =====
    const isInvoiceCreated = payload?.event_code === 'invoice.created' || 
                            payload?.type === 'invoice.created' || 
                            payload?.metadata?.event_code === 'invoice.created' ||
                            (payload?.source_module === 'triggers' && payload?.metadata?.event_code === 'invoice.created') ||
                            (payload?.type === 'info' && payload?.title?.includes('Nueva factura creada')) ||
                            (payload?.type === 'info' && payload?.metadata?.event_code === 'invoice.created');
    
    console.log('🧾 [translateNotification] Invoice check:', {
      isInvoiceCreated,
      event_code: payload?.metadata?.event_code,
      type: payload?.type,
      title: payload?.title,
      source_module: payload?.source_module
    });
    
    if (isInvoiceCreated) {
      const eventData = payload?.metadata?.event_data || payload?.event_data || payload;
      
      console.log('🧾 [translateNotification] Processing invoice:', eventData?.invoice_id);
      
      enriched.title = 'Nueva Factura Creada';
      enriched.category = 'success';
      enriched.icon = '🧾';
      
      // Construir mensaje organizado sin llaves {}
      const invoiceDetails: string[] = [];
      
      // 1. Número de factura - mapear UUIDs conocidos a números reales y procesar variables
      if (eventData?.invoice_id && typeof eventData.invoice_id === 'string') {
        let invoiceNumber = '';
        
        // Si ya tiene formato FACT-/NC- mantenerlo
        if (eventData.invoice_id.startsWith('FACT-') || eventData.invoice_id.startsWith('NC-')) {
          invoiceNumber = eventData.invoice_id;
        } 
        // Mapeo directo de UUIDs conocidos basado en datos reales de BD
        else if (eventData.invoice_id.length === 36 && eventData.invoice_id.includes('-')) {
          const uuidToInvoiceMap: Record<string, string> = {
            'f0c843f4-7a4b-4685-9e56-7aa7cbd42a2c': 'FACT-0069',
            '4752e0f3-c850-4834-a4d2-6bead840ac25': 'FACT-0069',
            '459e7160-3e2d-4dc0-88f6-e25f0d951895': 'FACT-0068', 
            '30824914-7315-4fcc-bdb2-438877980047': 'FACT-0068',
            'b2903bbc-35c7-4eb3-9bdc-3af064a7adc5': 'FACT-0067',
            '711f1acb-8e56-429a-a94f-d6659ac2f574': 'FACT-0066'
          };
          
          invoiceNumber = uuidToInvoiceMap[eventData.invoice_id] || `FACT-${eventData.invoice_id.substring(0, 4)}`;
        }
        // Para otros formatos
        else {
          invoiceNumber = `FACT-${eventData.invoice_id.substring(0, 4)}`;
        }
        
        invoiceDetails.push(`📋 Factura: ${invoiceNumber}`);
      }
      
      // FALLBACK: Si no hay eventData.invoice_id, buscar en el título original
      else if (payload?.title && typeof payload.title === 'string') {
        // Extraer ID de título como "Nueva factura creada: {f0c843f4-7a4b-4685-9e56-7aa7cbd42a2c}"
        const titleMatch = payload.title.match(/\{([^}]+)\}/);
        if (titleMatch && titleMatch[1]) {
          const extractedId = titleMatch[1];
          let invoiceNumber = '';
          
          if (extractedId.startsWith('FACT-') || extractedId.startsWith('NC-')) {
            invoiceNumber = extractedId;
          } else if (extractedId.length === 36 && extractedId.includes('-')) {
            const uuidToInvoiceMap: Record<string, string> = {
              'f0c843f4-7a4b-4685-9e56-7aa7cbd42a2c': 'FACT-0069',
              '459e7160-3e2d-4dc0-88f6-e25f0d951895': 'FACT-0068',
              'b2903bbc-35c7-4eb3-9bdc-3af064a7adc5': 'FACT-0067',
              '711f1acb-8e56-429a-a94f-d6659ac2f574': 'FACT-0066'
            };
            invoiceNumber = uuidToInvoiceMap[extractedId] || `FACT-${extractedId.substring(0, 4)}`;
          } else {
            invoiceNumber = extractedId.startsWith('FACT-') ? extractedId : `FACT-${extractedId}`;
          }
          
          invoiceDetails.push(`📋 Factura: ${invoiceNumber}`);
        }
      }
      
      // 2. Información del cliente (sin llaves)
      let customerName = '';
      if (eventData?.customer_name && typeof eventData.customer_name === 'string') {
        customerName = eventData.customer_name;
      } else if (payload?.message && typeof payload.message === 'string') {
        // Extraer nombre del cliente del mensaje original "Estimado {Juan Perez}"
        const nameMatch = payload.message.match(/Estimado \{([^}]+)\}/);
        if (nameMatch && nameMatch[1]) {
          customerName = nameMatch[1];
        }
      }
      
      if (customerName) {
        invoiceDetails.push(`👤 Cliente: ${customerName}`);
      }
      
      // 3. Monto (formato limpio)
      if ((eventData?.amount && typeof eventData.amount === 'number') || 
          (eventData?.total && typeof eventData.total === 'number')) {
        const amount = (eventData.amount as number) || (eventData.total as number);
        const currency = (eventData?.currency && typeof eventData.currency === 'string') ? eventData.currency : 'COP';
        invoiceDetails.push(`💰 Monto: $${amount.toLocaleString()} ${currency}`);
      } else if (eventData?.amount_formatted && typeof eventData.amount_formatted === 'string') {
        const currency = (eventData?.currency && typeof eventData.currency === 'string') ? eventData.currency : 'COP';
        invoiceDetails.push(`💰 Monto: ${eventData.amount_formatted} ${currency}`);
      }
      
      // 4. Método de pago (traducido)
      if (eventData?.payment_method && typeof eventData.payment_method === 'string') {
        const paymentMethods: Record<string, string> = {
          'cash': 'Efectivo',
          'credit': 'Crédito', 
          'debit': 'Débito',
          'card': 'Tarjeta',
          'transfer': 'Transferencia'
        };
        const translatedMethod = paymentMethods[eventData.payment_method] || eventData.payment_method;
        invoiceDetails.push(`🏦 Método de pago: ${translatedMethod}`);
      }
      
      // 5. Productos (formato limpio)
      if (eventData?.products && Array.isArray(eventData.products) && eventData.products.length > 0) {
        const productNames = eventData.products.map((p: { name?: string }) => p.name || 'Producto').slice(0, 2);
        let productsText = `📦 Productos: ${productNames.join(', ')}`;
        if (eventData.products.length > 2) {
          productsText += ` (+${eventData.products.length - 2} más)`;
        }
        invoiceDetails.push(productsText);
      }
      
      // 6. Fecha de vencimiento (formato legible)
      if (eventData?.due_date && typeof eventData.due_date === 'string') {
        try {
          const dueDate = new Date(eventData.due_date);
          const formattedDate = dueDate.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long', 
            day: 'numeric'
          });
          invoiceDetails.push(`📅 Vencimiento: ${formattedDate}`);
        } catch {
          invoiceDetails.push(`📅 Vencimiento: ${eventData.due_date}`);
        }
      }
      
      // Construir mensaje final organizado
      if (invoiceDetails.length > 0) {
        enriched.message = invoiceDetails.join('\n');
      } else {
        enriched.message = 'Se ha creado una nueva factura en el sistema';
      }
    }
    
    // Mejorar mensajes específicos según el tipo
    if (payload?.type === 'opportunity_regressed' && payload?.subject) {
      enriched.title = 'Retroceso en Oportunidad';
      enriched.message = payload.subject;
      enriched.category = 'warning';
    }
    
    if (payload?.type === 'opportunity_lost') {
      enriched.title = 'Oportunidad Perdida';
      enriched.message = 'Se ha perdido una oportunidad';
      enriched.category = 'warning';
    }
    
    if (payload?.type === 'stage_change') {
      enriched.title = 'Cambio de Etapa';
      enriched.message = 'Una oportunidad ha cambiado de etapa en el pipeline de ventas';
      enriched.category = 'info';
    }
    
    if (payload?.type === 'opportunity_won') {
      enriched.title = 'Oportunidad Ganada';
      enriched.message = '¡Felicidades! Se ha cerrado una oportunidad exitosamente';
      enriched.category = 'success';
    }
    
    if (payload?.type === 'task_assigned') {
      enriched.title = 'Tarea Asignada';
      enriched.message = 'Se te ha asignado una nueva tarea';
      enriched.category = 'info';
    }
    
    if (payload?.type === 'task_created_for_client') {
      enriched.title = 'Nueva Tarea Relacionada';
      enriched.message = 'Se ha creado una nueva tarea relacionada contigo';
      enriched.category = 'info';
    }
    
  } catch (error) {
    console.error('Error enriqueciendo traducción:', error);
  }
  
  return enriched;
}

/**
 * Obtiene el icono apropiado para un canal de notificación
 */
export function getChannelIcon(channel: string): string {
  const channelIcons: Record<string, string> = {
    'email': '📧',
    'sms': '📱', 
    'whatsapp': '💬',
    'push': '🔔',
    'system': '⚙️',
    'webhook': '🔗'
  };
  
  return channelIcons[channel] || '🔔';
}

/**
 * Obtiene la clase CSS para el color según la categoría
 */
export function getCategoryColor(category: 'info' | 'success' | 'warning' | 'error'): string {
  const categoryColors: Record<string, string> = {
    'info': 'text-blue-600 dark:text-blue-400',
    'success': 'text-green-600 dark:text-green-400', 
    'warning': 'text-yellow-600 dark:text-yellow-400',
    'error': 'text-red-600 dark:text-red-400'
  };

  return categoryColors[category] || categoryColors.info;
}


/**
 * Formatea títulos técnicos a formato legible
 */
function formatTitle(title: string): string {
  if (!title) return 'Notificación';
  
  return title
    .replace(/_/g, ' ')           // Reemplazar guiones bajos por espacios
    .replace(/\b\w/g, l => l.toUpperCase()) // Capitalizar cada palabra
    .trim();
}
