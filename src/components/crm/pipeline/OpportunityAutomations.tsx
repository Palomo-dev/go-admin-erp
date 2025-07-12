"use client";

import { supabase } from "@/lib/supabase/config";
import { sendStageChangeNotification } from "./EmailNotifications";

interface AutomationProps {
  opportunityId: string;
  opportunityTitle?: string;
  customerId?: string;
  customerName?: string;
  stageId?: string;
  stageName?: string;
  fromStageId?: string;
  toStageId?: string;
  userId?: string;
  pipelineId?: string;
  organizationId: string | null;
}

interface AutomationTask {
  title: string;
  description: string;
  due_date?: Date;
  priority: "low" | "med" | "high";
}

export async function handleStageChangeAutomation({
  opportunityId,
  opportunityTitle,
  customerId,
  customerName,
  stageId,
  stageName,
  fromStageId,
  toStageId,
  userId,
  pipelineId,
  organizationId,
}: AutomationProps) {
  if (!opportunityId || !organizationId) {
    console.error("Datos insuficientes para ejecutar automatización");
    return { success: false, error: "Datos insuficientes" };
  }
  
  // Si tenemos stageId pero no toStageId, usamos stageId como toStageId
  const actualToStageId = toStageId || stageId;

  try {
    // 1. Obtener información de la oportunidad
    const opportunity = await fetchOpportunityInfo(opportunityId);
    if (!opportunity) {
      return { success: false, error: "No se encontró la oportunidad" };
    }
    
    // 2. Obtener información de las etapas si tenemos sus IDs
    let fromStage = null;
    let toStage = null;
    
    if (fromStageId) {
      fromStage = await fetchStageInfo(fromStageId);
    }
    
    // Usar stageId o toStageId para la etapa destino
    const targetStageId = actualToStageId || stageId;
    if (targetStageId) {
      toStage = await fetchStageInfo(targetStageId);
    } else if (stageName) {
      // Si tenemos el nombre pero no el ID, podemos crear un objeto básico
      toStage = { name: stageName };
    }
    
    // Si no tenemos al menos la etapa de destino, no podemos continuar
    if (!toStage) {
      return { success: false, error: "No se encontró información de la etapa destino" };
    }

    // 2. Determinar automatizaciones basadas en las etapas y configuraciones
    const automations = await determineAutomations(fromStage, toStage, opportunityId, organizationId);

    // 3. Ejecutar las automatizaciones
    const automationPromises = [];

    // Crear tareas si hay alguna definida
    if (automations.tasks && automations.tasks.length > 0) {
      automationPromises.push(
        ...automations.tasks.map((task) =>
          createTask(task, opportunityId, organizationId, opportunity)
        )
      );
    }

    // Actualizar oportunidad si es necesario
    if (automations.updateOpportunity) {
      automationPromises.push(updateOpportunityStatus(opportunityId, toStage));
    }

    // Enviar notificaciones por correo electrónico si está habilitado
    if (automations.sendEmail) {
      automationPromises.push(
        sendStageChangeNotification({
          opportunityId,
          fromStage,
          toStage,
          organizationId: organizationId ? Number(organizationId) : 0, // Convertir a number
          opportunity
        })
      );
    }

    const results = await Promise.all(automationPromises);

    // 4. Registrar el historial de cambio
    await logStageChange(opportunityId, fromStageId, toStageId, organizationId);

    return { success: true, results, automations };
  } catch (error) {
    console.error("Error en la automatización:", error);
    return { success: false, error };
  }
}

// Función auxiliar para obtener información de una etapa
async function fetchStageInfo(stageId: string | undefined) {
  if (!stageId) return null;
  
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, position')
    .eq('id', stageId)
    .single();
    
  if (error) {
    console.error("Error al obtener información de etapa:", error);
    return null;
  }
  
  return data;
}

// Función para obtener información de la oportunidad
async function fetchOpportunityInfo(opportunityId: string) {
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      id, name, amount, currency, expected_close_date, 
      customer_id, status, created_by, stage_id
    `
    )
    .eq("id", opportunityId)
    .single();

  if (error) {
    console.error("Error al obtener información de la oportunidad:", error);
    return null;
  }

  // Si por alguna razón no hay stage_id (aunque debería haberla), usamos un valor por defecto
  return data ? {
    ...data,
    stage_id: data.stage_id || 'unknown'
  } : null;
}

// Determinar qué automatizaciones aplicar según las etapas
async function determineAutomations(
  fromStage: any | null,
  toStage: any,
  opportunityId: string,
  organizationId: string | null
) {
  const tasks: AutomationTask[] = [];
  let updateOpportunity = false;
  let sendEmail = true; // Por defecto enviar email

  try {
    // La tabla stage_automations no existe según la consulta anterior
    // Por lo tanto, aplicamos lógica por defecto según el nombre/posición de la etapa

    // Si no hay configuraciones, usar la lógica por defecto
    if (tasks.length === 0) {
      // Lógica para etapas finales (ganado/perdido)
      if (
        toStage.name.toLowerCase().includes("ganado") ||
        toStage.position === 1000
      ) {
        tasks.push({
          title: `Seguimiento para oportunidad ganada`,
          description: `Realizar seguimiento post-venta para asegurar satisfacción del cliente`,
          due_date: new Date(new Date().setDate(new Date().getDate() + 7)),
          priority: "med",
        });

        updateOpportunity = true;
      } else if (
        toStage.name.toLowerCase().includes("perdido") ||
        toStage.position === 999
      ) {
        tasks.push({
          title: `Analizar oportunidad perdida`,
          description: `Revisar causas de la pérdida y documentar retroalimentación`,
          due_date: new Date(new Date().setDate(new Date().getDate() + 3)),
          priority: "med",
        });

        updateOpportunity = true;
      } else if (
        toStage.name.toLowerCase().includes("negociación") ||
        (fromStage && toStage.position > fromStage.position)
      ) {
        tasks.push({
          title: `Seguimiento para ${toStage.name}`,
          description: `Realizar seguimiento para la etapa de ${toStage.name}`,
          due_date: new Date(new Date().setDate(new Date().getDate() + 2)),
          priority: "high",
        });
      }
    }

  } catch (error) {
    console.error("Error al determinar automatizaciones:", error);
    // En caso de error, usar configuraciones por defecto básicas
    tasks.push({
      title: `Seguimiento para ${toStage.name}`,
      description: `Realizar seguimiento para la etapa de ${toStage.name}`,
      due_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      priority: "med",
    });
  }
  
  return { tasks, updateOpportunity, sendEmail };
}

// Crear tarea asociada a la oportunidad
async function createTask(
  task: AutomationTask,
  opportunityId: string,
  organizationId: string | null,
  opportunity: any | null
) {
  const { title, description, due_date, priority } = task;

  const { data, error } = await supabase.from("tasks").insert({
    organization_id: organizationId,
    title,
    description,
    due_date: due_date?.toISOString(),
    assigned_to: opportunity.created_by, // Asignar al creador de la oportunidad
    priority,
    status: "open", // Cambiado de "pending" a "open" para cumplir con la restricción
    related_type: "opportunity",
    related_id: opportunityId,
    created_at: new Date().toISOString(),
    created_by: opportunity.created_by,
  });

  if (error) {
    console.error("Error al crear tarea:", error);
    return { success: false, error };
  }

  return { success: true, data };
}

// Actualizar el estado de la oportunidad
async function updateOpportunityStatus(opportunityId: string, toStage: any) {
  let status = "active";

  if (toStage.name.toLowerCase().includes("ganado")) {
    status = "won";
  } else if (toStage.name.toLowerCase().includes("perdido")) {
    status = "lost";
  }

  const { error } = await supabase
    .from("opportunities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", opportunityId);

  if (error) {
    console.error("Error al actualizar estado de oportunidad:", error);
    return { success: false, error };
  }

  return { success: true };
}

// Registrar el cambio de etapa en el historial
async function logStageChange(
  opportunityId: string,
  fromStageId: string | undefined,
  toStageId: string | undefined,
  organizationId: string | null
) {
  // Si no tenemos los datos mínimos necesarios, no podemos registrar
  if (!opportunityId || !organizationId) {
    // Datos insuficientes para registrar cambio de etapa
    return { success: false, error: "Datos insuficientes" };
  }
  try {
    // Obtenemos el usuario que realiza la acción desde la sesión actual
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id || null;
    
    // Obtener nombres de las etapas para mejor registro
    const [fromStageData, toStageData] = await Promise.all([
      fetchStageInfo(fromStageId),
      fetchStageInfo(toStageId)
    ]);
    
    const fromStageName = fromStageData?.name || fromStageId;
    const toStageName = toStageData?.name || toStageId;
    
    // Registrar el cambio en la tabla activities en lugar de opportunity_history
    const { error } = await supabase.from("activities").insert({
      organization_id: organizationId,
      related_type: "opportunity",
      related_id: opportunityId,
      activity_type: "system",
      user_id: userId,
      notes: `Cambio de etapa: ${fromStageName} → ${toStageName}`,
      occurred_at: new Date().toISOString(),
      metadata: {
        from_stage_id: fromStageId,
        to_stage_id: toStageId,
        from_stage_name: fromStageName,
        to_stage_name: toStageName
      },
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Error al registrar actividad:", error);
      // Si hay error al registrar, al menos dejamos constancia en el log
      // Cambio de etapa registrado en log
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error en registro de historial:", error);
    return { success: false, error };
  }
}
