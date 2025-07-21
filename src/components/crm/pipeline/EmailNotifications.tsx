"use client";

import { supabase } from "@/lib/supabase/config";
import { Opportunity } from "@/types/crm";

interface EmailNotificationProps {
  opportunityId: string;
  fromStage: any;
  toStage: any;
  organizationId: string | null;
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
  const missingFields: string[] = [];
  
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
    
    // El campo email_notifications_enabled no existe en la tabla pipelines
    // Por lo tanto, asumimos que siempre están habilitadas las notificaciones
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
    
    // 5. Registrar la notificación en la base de datos
    await registerNotification(
      opportunityId, 
      organizationId, 
      notificationType, 
      emailTemplate.subject, 
      opportunity.created_by || null
    );

    // 6. En un entorno de producción real, aquí se enviaría el correo
    // a través de una función edge o un servicio externo.
    // Por ahora, simulamos el envío registrando la información.
    console.log('Email enviado:', {
      to: assignedUser?.email || 'sin_asignar@example.com',
      subject: emailTemplate.subject,
      body: emailTemplate.body
    });
    
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
}

// Determinar el tipo de notificación según las etapas
function determineNotificationType(fromStage: any, toStage: any) {
  // Si se mueve a una etapa final
  if (toStage.name.toLowerCase().includes("ganado")) {
    return "opportunity_won";
  } 
  
  if (toStage.name.toLowerCase().includes("perdido")) {
    return "opportunity_lost";
  }
  
  // Si avanza a una etapa de negociación
  if (toStage.name.toLowerCase().includes("negociación")) {
    return "negotiation_started";
  }
  
  // Si avanza a una etapa de propuesta
  if (toStage.name.toLowerCase().includes("propuesta")) {
    return "proposal_stage";
  }
  
  // Notificación genérica de cambio de etapa
  return "stage_change";
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
  const opportunityName = opportunity.name;
  const amount = opportunity.amount ? new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: opportunity.currency || 'COP'
  }).format(opportunity.amount) : "No especificado";
  
  let subject = "";
  let body = "";
  
  switch (notificationType) {
    case "opportunity_won":
      subject = `¡Oportunidad ganada! ${opportunityName}`;
      body = `
        <p>Hola ${assignedUser?.name || ""},</p>
        <p>¡Felicitaciones! La oportunidad <strong>${opportunityName}</strong> con ${customerName} ha sido marcada como ganada.</p>
        <p>Valor: ${amount}</p>
        <p>Es importante realizar el seguimiento post-venta para asegurar la satisfacción del cliente.</p>
        <p>Gracias por tu excelente trabajo.</p>
      `;
      break;
      
    case "opportunity_lost":
      subject = `Oportunidad perdida: ${opportunityName}`;
      body = `
        <p>Hola ${assignedUser?.name || ""},</p>
        <p>La oportunidad <strong>${opportunityName}</strong> con ${customerName} ha sido marcada como perdida.</p>
        <p>Por favor, registra los motivos de la pérdida para aprender de esta experiencia.</p>
        <p>Valor: ${amount}</p>
      `;
      break;
      
    case "negotiation_started":
      subject = `Oportunidad en negociación: ${opportunityName}`;
      body = `
        <p>Hola ${assignedUser?.name || ""},</p>
        <p>La oportunidad <strong>${opportunityName}</strong> con ${customerName} ha avanzado a la etapa de negociación.</p>
        <p>Valor: ${amount}</p>
        <p>Es recomendable preparar los puntos de negociación y alternativas para cerrar el trato.</p>
      `;
      break;
      
    case "proposal_stage":
      subject = `Propuesta requerida: ${opportunityName}`;
      body = `
        <p>Hola ${assignedUser?.name || ""},</p>
        <p>La oportunidad <strong>${opportunityName}</strong> con ${customerName} ha avanzado a la etapa de propuesta.</p>
        <p>Valor estimado: ${amount}</p>
        <p>Por favor, prepara y envía la propuesta comercial lo antes posible.</p>
      `;
      break;
      
    default: // stage_change genérico
      subject = `Actualización de oportunidad: ${opportunityName}`;
      body = `
        <p>Hola ${assignedUser?.name || ""},</p>
        <p>La oportunidad <strong>${opportunityName}</strong> con ${customerName} ha cambiado de etapa:</p>
        <p>De: ${fromStage.name} → A: ${toStage.name}</p>
        <p>Valor: ${amount}</p>
      `;
  }
  
  return { subject, body };
}

// Registrar la notificación en la base de datos
async function registerNotification(
  opportunityId: string,
  organizationId: string | null,
  type: string,
  message: string,
  userId: string | null
) {
  try {
    // Si no tenemos userId, necesitamos al menos un email de destinatario
    // para satisfacer la restricción check_notification_recipient
    if (!userId) {
      // Intentar obtener un email de administrador para la organización
      const { data: adminUsers } = await supabase
        .from('user_organization_roles')
        .select('user_id')
        .eq('organization_id', organizationId)
        .eq('role', 'admin')
        .limit(1);

      // Si encontramos un admin, usamos su ID
      if (adminUsers && adminUsers.length > 0) {
        userId = adminUsers[0].user_id;
      } else {
        // Si no hay admin, usamos un email genérico para evitar el error
        const notificationData = {
          organization_id: organizationId,
          recipient_email: 'admin@gocrm.example.com', // Email genérico para notificaciones del sistema
          channel: "email",
          status: "pending",
          payload: { 
            type,
            title: type,
            content: type.replace('_', ' '),
            opportunity_id: opportunityId
          },
          created_at: new Date().toISOString()
        };
        
        const { error } = await supabase.from("notifications").insert(notificationData);
        
        if (error) {
          throw error;
        }
        
        return { success: true };
      }
    }

    // Si llegamos aquí, tenemos un userId válido
    const { error } = await supabase.from("notifications").insert({
      organization_id: organizationId,
      recipient_user_id: userId,
      channel: "email",
      status: "pending",
      payload: { 
        type,
        title: type,
        content: type.replace('_', ' '),
        opportunity_id: opportunityId // Guardamos el ID de la oportunidad dentro de payload
      },
      created_at: new Date().toISOString()
    });
    
    if (error) {
      throw error;
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error al registrar notificación:", error);
    return { success: false, error };
  }
}
