"use client";

import { supabase } from "@/lib/supabase/config";
import { Opportunity } from "@/types/crm";

interface EmailNotificationProps {
  opportunityId: string;
  fromStage: any;
  toStage: any;
  organizationId: number;
  opportunity: Opportunity;
}

// Este componente maneja las notificaciones por correo electrónico cuando una oportunidad cambia de etapa
export async function sendStageChangeNotification({
  opportunityId,
  fromStage,
  toStage,
  organizationId,
  opportunity,
}: EmailNotificationProps) {
  // Verificar cada campo requerido e informar específicamente cuál falta
  const missingFields = [];
  
  if (!opportunityId) missingFields.push('opportunityId');
  if (!fromStage) missingFields.push('fromStage');
  if (!toStage) missingFields.push('toStage');
  if (!organizationId) missingFields.push('organizationId');
  if (!opportunity) missingFields.push('opportunity');
  
  // Si faltan campos, registrar cuáles son exactamente y retornar
  if (missingFields.length > 0) {
    console.error(`Datos insuficientes para enviar notificación: Faltan [${missingFields.join(', ')}]`);
    return { success: false, error: `Datos insuficientes: ${missingFields.join(', ')}` };
  }
  
  // Validación adicional para los campos dentro del objeto opportunity
  if (!opportunity.customer_id) {
    console.warn('La oportunidad no tiene un cliente asociado, continuando sin información de cliente');
  }

  try {
    // Obtener información del pipeline asociado con la etapa actual
    const { data: stageData } = await supabase
      .from("stages")
      .select("pipeline_id")
      .eq("id", toStage.id)
      .single();
    
    const pipelineId = stageData?.pipeline_id || '';
    
    // 1. Obtener información del cliente
    const customer = await getCustomerInfo(opportunity.customer_id);
    
    // 2. Obtener información del usuario asignado
    const assignedUser = opportunity.created_by 
      ? await getUserInfo(opportunity.created_by)
      : null;
    
    // 3. Determinar el tipo de notificación según la etapa destino
    const notificationType = determineNotificationType(fromStage, toStage);
    
    // 4. Crear la plantilla de correo según el tipo
    const emailTemplate = createEmailTemplate(
      notificationType,
      opportunity,
      fromStage,
      toStage,
      customer,
      assignedUser
    );
    
    // 5. Registrar la notificación en el sistema
    await registerNotification({
      opportunityId,
      organizationId,
      type: notificationType,
      message: emailTemplate.subject,
      userId: opportunity.created_by || null
    });
    
    // 6. Aquí en un sistema real enviaríamos el email
    // Como no hay integración con sistema de correo, solo registramos la intención
    console.log(`Notificación de cambio de etapa generada: ${emailTemplate.subject}`);
    console.log(`De: ${fromStage.name} → A: ${toStage.name}`);
    console.log(`Para: ${customer?.email || 'Sin correo de cliente'}`);
    
    return { 
      success: true, 
      message: "Notificación registrada correctamente",
      notificationType,
      emailTemplate
    };
    
  } catch (error) {
    console.error("Error al enviar notificación:", error);
    return { success: false, error };
  }
}

// Obtener información del cliente
async function getCustomerInfo(customerId: string | null | undefined) {
  if (!customerId) {
    console.warn("No se proporcionó ID de cliente para obtener información");
    return {
      id: null,
      full_name: "Cliente",
      email: null,
      phone: null
    };
  }
  
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, full_name, email, phone")
      .eq("id", customerId)
      .single();
      
    if (error) {
      console.error("Error al obtener información del cliente:", error);
      throw error;
    }
    
    if (!data) {
      console.warn(`No se encontró información para el cliente con ID: ${customerId}`);
      return {
        id: customerId,
        full_name: "Cliente no encontrado",
        email: null,
        phone: null
      };
    }
    
    return data;
  } catch (error) {
    console.error("Error inesperado al consultar información del cliente:", error);
    return {
      id: customerId,
      full_name: "Cliente",
      email: null,
      phone: null
    };
  }
}

// Obtener información del usuario
async function getUserInfo(userId: string) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("id", userId)
      .single();
      
    if (error || !data) {
      console.error("Error al obtener información del usuario:", error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error("Error al consultar usuario:", error);
    return null;
  }
}

// Determinar el tipo de notificación según las etapas
function determineNotificationType(fromStage: any, toStage: any) {
  if (!fromStage) {
    return "opportunity_created";
  }
  
  // Verificar si la oportunidad avanza a una etapa "ganada"
  if (toStage.name === "Ganado") {
    return "opportunity_won";
  }
  
  // Verificar si la oportunidad avanza a una etapa "perdida"
  if (toStage.name === "Perdido") {
    return "opportunity_lost";
  }
  
  // En cualquier otro caso, es un avance normal en el pipeline
  const fromPosition = fromStage.position || 0;
  const toPosition = toStage.position || 0;
  
  if (toPosition > fromPosition) {
    return "opportunity_advanced";
  } else if (toPosition < fromPosition) {
    return "opportunity_regressed";
  } else {
    return "opportunity_updated";
  }
}

// Crear la plantilla de correo según el tipo de notificación
function createEmailTemplate(
  notificationType: string,
  opportunity: any,
  fromStage: any,
  toStage: any,
  customer: any,
  assignedUser: any
) {
  const customerName = customer?.full_name || "Cliente";
  const opportunityName = opportunity?.name || "Oportunidad";
  const fromStageName = fromStage?.name || "Etapa anterior";
  const toStageName = toStage?.name || "Nueva etapa";
  const userName = assignedUser?.name || "Usuario asignado";
  
  let subject = "";
  let body = "";
  
  switch (notificationType) {
    case "opportunity_created":
      subject = `Nueva oportunidad: ${opportunityName}`;
      body = `Se ha creado una nueva oportunidad "${opportunityName}" para el cliente ${customerName} en la etapa ${toStageName}.`;
      break;
      
    case "opportunity_won":
      subject = `¡Oportunidad ganada! - ${opportunityName}`;
      body = `La oportunidad "${opportunityName}" para ${customerName} ha sido marcada como GANADA. ¡Felicidades!`;
      break;
      
    case "opportunity_lost":
      subject = `Oportunidad perdida - ${opportunityName}`;
      body = `La oportunidad "${opportunityName}" para ${customerName} ha sido marcada como PERDIDA.`;
      break;
      
    case "opportunity_advanced":
      subject = `Avance en oportunidad - ${opportunityName}`;
      body = `La oportunidad "${opportunityName}" para ${customerName} ha avanzado de "${fromStageName}" a "${toStageName}".`;
      break;
      
    case "opportunity_regressed":
      subject = `Retroceso en oportunidad - ${opportunityName}`;
      body = `La oportunidad "${opportunityName}" para ${customerName} ha retrocedido de "${fromStageName}" a "${toStageName}".`;
      break;
      
    default:
      subject = `Actualización de oportunidad - ${opportunityName}`;
      body = `La oportunidad "${opportunityName}" para ${customerName} ha sido actualizada.`;
      break;
  }
  
  return { subject, body };
}

// Registrar la notificación en la base de datos
async function registerNotification({
  opportunityId,
  organizationId,
  type,
  message,
  userId
}: {
  opportunityId: string;
  organizationId: number;
  type: string;
  message: string;
  userId: string | null;
}) {
  try {
    // Definir el tipo correcto para los datos de notificación
    interface NotificationData {
      organization_id: number;
      recipient_user_id?: string | null;
      recipient_email?: string;
      recipient_phone?: string;
      channel: 'email' | 'push' | 'whatsapp' | 'sms' | 'webhook';
      payload: Record<string, any>;
      status: 'pending' | 'sent' | 'error' | 'read';
      created_at: string;
      updated_at: string;
    }
    
    // Preparar los datos para la notificación según el esquema actual
    const notificationData: NotificationData = {
      organization_id: organizationId,
      recipient_user_id: userId, // Este campo debe existir para satisfacer la restricción
      channel: 'email', // Uno de los valores permitidos: email, push, whatsapp, sms, webhook
      payload: {
        opportunity_id: opportunityId,
        type,
        message,
        subject: message,
        body: `Actualización de estado en oportunidad relacionada con etapa ${type}`
      },
      status: 'pending',  // Valores permitidos: pending, sent, error, read
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Si no tenemos userId, buscar un correo alternativo
    if (!userId) {
      try {
        // Consultamos directamente al cliente a partir del customer_id en la oportunidad
        const { data: opportunity } = await supabase
          .from('opportunities')
          .select('customer_id')
          .eq('id', opportunityId)
          .single();
          
        if (opportunity?.customer_id) {
          // Obtenemos el email del cliente
          const { data: customer } = await supabase
            .from('customers')
            .select('email')
            .eq('id', opportunity.customer_id)
            .single();
            
          if (customer?.email) {
            // Si tenemos correo del cliente, lo usamos
            notificationData.recipient_user_id = undefined;
            notificationData.recipient_email = customer.email;
          } else {
            // Sin correo de cliente, usamos un valor predeterminado
            notificationData.recipient_user_id = undefined;
            notificationData.recipient_email = 'notificaciones@goadmin.com';
          }
        } else {
          // Sin cliente, usamos un valor predeterminado
          notificationData.recipient_user_id = undefined;
          notificationData.recipient_email = 'notificaciones@goadmin.com';
        }
      } catch (error) {
        console.error('Error al buscar cliente para notificación:', error);
        notificationData.recipient_user_id = undefined;
        notificationData.recipient_email = 'notificaciones@goadmin.com';
      }
    }

    const { error } = await supabase
      .from("notifications")
      .insert(notificationData);
      
    if (error) {
      console.error("Error al registrar notificación:", error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error al crear notificación:", error);
    return false;
  }
}
