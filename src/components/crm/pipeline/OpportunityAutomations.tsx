"use client";

import { supabase } from "@/lib/supabase/config";
import { sendStageChangeNotification } from "./EmailNotifications";

interface AutomationProps {
  opportunityId: string;
  fromStageId: string;
  toStageId: string;
  organizationId: number | null;
}

interface AutomationTask {
  title: string;
  description: string;
  due_date?: Date;
  priority: "low" | "medium" | "high";
}

export async function handleStageChangeAutomation({
  opportunityId,
  fromStageId,
  toStageId,
  organizationId,
}: AutomationProps) {
  if (!opportunityId || !fromStageId || !toStageId || !organizationId) {
    console.error("Datos insuficientes para ejecutar automatización");
    return { success: false, error: "Datos insuficientes" };
  }

  try {
    // 1. Obtener información de etapas y oportunidad
    const [fromStage, toStage, opportunity] = await Promise.all([
      fetchStageInfo(fromStageId),
      fetchStageInfo(toStageId),
      fetchOpportunityInfo(opportunityId),
    ]);

    if (!fromStage || !toStage || !opportunity) {
      return { success: false, error: "No se encontró información requerida" };
    }

    // 2. Determinar automatizaciones basadas en las etapas
    const automations = determineAutomations(fromStage, toStage);

    // 3. Ejecutar las automatizaciones
    const results = await Promise.all([
      // Crear tareas si es necesario
      ...automations.tasks.map((task) =>
        createTask(task, opportunityId, organizationId, opportunity)
      ),

      // Actualizar oportunidad si es necesario
      automations.updateOpportunity &&
        updateOpportunityStatus(opportunityId, toStage),
        
      // Enviar notificaciones por correo electrónico
      sendStageChangeNotification({
        opportunityId,
        fromStage,
        toStage,
        organizationId,
        opportunity
      })
    ]);

    // 4. Registrar el historial de cambio
    await logStageChange(opportunityId, fromStageId, toStageId, organizationId);

    return { success: true, results };
  } catch (error) {
    console.error("Error en la automatización:", error);
    return { success: false, error };
  }
}

// Función para obtener información de la etapa
async function fetchStageInfo(stageId: string) {
  const { data, error } = await supabase
    .from("stages")
    .select("id, name, position, probability")
    .eq("id", stageId)
    .single();

  if (error) {
    console.error("Error al obtener información de la etapa:", error);
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
function determineAutomations(fromStage: any, toStage: any) {
  const tasks: AutomationTask[] = [];
  let updateOpportunity = false;

  // Lógica para etapas finales (ganado/perdido)
  if (
    toStage.name.toLowerCase().includes("ganado") ||
    toStage.position === 1000
  ) {
    // Suponemos que 1000 es la posición para "ganado"

    tasks.push({
      title: `Seguimiento para oportunidad ganada`,
      description: `Realizar seguimiento post-venta para asegurar satisfacción del cliente`,
      due_date: new Date(new Date().setDate(new Date().getDate() + 7)),
      priority: "medium",
    });

    updateOpportunity = true;
  } else if (
    toStage.name.toLowerCase().includes("perdido") ||
    toStage.position === 999
  ) {
    // Suponemos que 999 es la posición para "perdido"

    tasks.push({
      title: `Analizar oportunidad perdida`,
      description: `Revisar causas de la pérdida y documentar retroalimentación`,
      due_date: new Date(new Date().setDate(new Date().getDate() + 3)),
      priority: "medium",
    });

    updateOpportunity = true;
  } else if (
    toStage.name.toLowerCase().includes("negociación") ||
    toStage.position > fromStage.position
  ) {
    // Si avanza a una etapa de negociación o avanza en el pipeline
    tasks.push({
      title: `Seguimiento para ${toStage.name}`,
      description: `Realizar seguimiento para la etapa de ${toStage.name}`,
      due_date: new Date(new Date().setDate(new Date().getDate() + 2)),
      priority: "high",
    });
  }

  return { tasks, updateOpportunity };
}

// Crear tarea asociada a la oportunidad
async function createTask(
  task: AutomationTask,
  opportunityId: string,
  organizationId: number,
  opportunity: any
) {
  const { title, description, due_date, priority } = task;

  const { data, error } = await supabase.from("tasks").insert({
    organization_id: organizationId,
    title,
    description,
    due_date: due_date?.toISOString(),
    assigned_to: opportunity.created_by, // Asignar al creador de la oportunidad
    priority,
    status: "pending",
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
  fromStageId: string,
  toStageId: string,
  organizationId: number
) {
  try {
    // Registrar el cambio en la tabla de historial en Supabase
    const { error } = await supabase.from("opportunity_history").insert({
      opportunity_id: opportunityId,
      organization_id: organizationId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      changed_at: new Date().toISOString(),
      action_type: "stage_change",
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("Error al registrar historial:", error);
      // Si hay error al registrar, al menos dejamos constancia en el log
      console.log(
        `Cambio de etapa: ${fromStageId} → ${toStageId} para oportunidad ${opportunityId}`
      );
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    console.error("Error en registro de historial:", error);
    return { success: false, error };
  }
}
