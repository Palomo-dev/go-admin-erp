import { supabase } from "@/lib/supabase/config";
import { Customer, CustomerInteraction, EditFormData, Opportunity, PipelineStage } from "../types";
import { getOrganizationId } from "../utils/pipelineUtils";
import { crearOportunidad } from "@/components/crm/oportunidad/apiOportunidades";

/** Texto legible de un error de Supabase o de red, sin `any`. */
function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  const e = error as { message?: string; error_description?: string } | null;
  return e?.message || e?.error_description || JSON.stringify(error);
}

/**
 * Servicio para operaciones relacionadas con el pipeline en Supabase
 */

/**
 * Cargar las etapas del pipeline
 */
export const loadPipelineStages = async (pipelineId: string): Promise<PipelineStage[]> => {
  try {
    const organizationId = getOrganizationId();
    console.log(`Usando organizationId: ${organizationId} para cargar etapas del pipeline: ${pipelineId}`);
    
    const { data, error } = await supabase
      .from("stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("position", { ascending: true });

    if (error) {
      console.error("Error de Supabase al cargar etapas:", JSON.stringify(error));
      throw error;
    }
    
    console.log(`Etapas cargadas: ${data?.length || 0}`);
    return data || [];
  } catch (error: unknown) {
    console.error("Error al cargar etapas del pipeline:", 
      mensajeError(error));
    return [];
  }
};

/**
 * Cargar todos los clientes con sus oportunidades para un pipeline específico
 */
export const loadCustomersWithOpportunities = async (pipelineId: string): Promise<{
  customers: Customer[], 
  opportunities: Opportunity[]
}> => {
  try {
    // Usar el organizationId sin convertir a entero para evitar posibles errores
    const organizationId = getOrganizationId();
    console.log(`Usando organizationId: ${organizationId} para cargar clientes y oportunidades del pipeline: ${pipelineId}`);
    
    // Cargar clientes filtrados por organization_id
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId);
    
    if (customersError) {
      console.error("Error de Supabase al cargar clientes:", JSON.stringify(customersError));
      throw customersError;
    }

    // Cargar oportunidades
    const { data: opportunitiesData, error: opportunitiesError } = await supabase
      .from("opportunities")
      .select("*")
      .eq("pipeline_id", pipelineId);
      // Filtro de organization_id solo si es necesario
      // .eq("organization_id", organizationId);

    if (opportunitiesError) {
      console.error("Error de Supabase al cargar oportunidades:", JSON.stringify(opportunitiesError));
      throw opportunitiesError;
    }

    console.log(`Clientes cargados: ${customersData?.length || 0}, Oportunidades cargadas: ${opportunitiesData?.length || 0}`);
    return {
      customers: customersData || [],
      opportunities: opportunitiesData || [],
    };
  } catch (error: unknown) {
    console.error("Error al cargar clientes y oportunidades:", 
      mensajeError(error));
    
    // Mostrar mensaje más detallado para facilitar el diagnóstico
    const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
    const errorDetails = {
      message: e?.message,
      details: e?.details,
      hint: e?.hint,
      code: e?.code
    };
    console.log('Detalles del error:', JSON.stringify(errorDetails));
    
    return { customers: [], opportunities: [] };
  }
};

/**
 * Cargar interacciones de un cliente específico
 */
export const loadCustomerInteractions = async (customerId: string): Promise<CustomerInteraction[]> => {
  try {
    const organizationId = parseInt(getOrganizationId()) || 1;
    
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("related_id", customerId)
      .eq("related_type", "customer")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: false });

    if (error) {
      console.error("Error al cargar interacciones del cliente:", JSON.stringify(error));
      throw error;
    }
    return data || [];
  } catch (error: unknown) {
    console.error("Error al cargar interacciones del cliente:", 
      mensajeError(error));
    return [];
  }
};

/**
 * Actualizar datos de un cliente
 */
export const updateCustomer = async (
  customerId: string, 
  formData: EditFormData
): Promise<{ success: boolean; error?: unknown }> => {
  try {
    console.log(`Actualizando cliente con ID: ${customerId}`);
    
    const { error } = await supabase
      .from("customers")
      .update({
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        notes: formData.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);

    if (error) {
      console.error("Error de Supabase al actualizar cliente:", JSON.stringify(error));
      throw error;
    }
    return { success: true };
  } catch (error: unknown) {
    console.error("Error al actualizar cliente:", 
      mensajeError(error));
    return { success: false, error };
  }
};

/**
 * Crear una nueva oportunidad para un cliente.
 *
 * CRM ola 3B (guardarraíl 36): por `POST /api/crm/opportunities` (RPC
 * `crm_create_opportunity`: permiso, organización de la sesión, moneda base
 * y actividad «creada» en una transacción). Antes insertaba desde el
 * navegador con `status: "active"`, que el CHECK de la tabla rechaza.
 */
export const createOpportunity = async (
  customerId: string,
  pipelineId: string,
  data: {
    name: string;
    amount: number;
    stage_id: string;
    expected_close_date: string;
  }
): Promise<{ success: boolean; opportunity?: Opportunity; error?: unknown }> => {
  try {
    const creada = await crearOportunidad({
      name: data.name,
      amount: data.amount,
      customer_id: customerId,
      pipeline_id: pipelineId,
      stage_id: data.stage_id,
      expected_close_date: data.expected_close_date || null,
      origen: "cliente",
    });
    return { success: true, opportunity: creada as unknown as Opportunity };
  } catch (error: unknown) {
    console.error("Error al crear oportunidad:", error instanceof Error ? error.message : error);
    return { success: false, error };
  }
};
