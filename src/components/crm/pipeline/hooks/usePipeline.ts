import { useState, useEffect } from "react";
import { 
  Customer, 
  CustomerInteraction, 
  EditFormData, 
  ErrorState,
  FormMessage, 
  OpportunityFormData, 
  PipelineStage 
} from "../types";
import { 
  filterCustomers, 
  sortCustomers, 
  processCustomersWithOpportunities 
} from "../utils/pipelineUtils";
import * as pipelineService from "../services/pipelineService";

/**
 * Hook personalizado para gestionar toda la lógica del pipeline de clientes
 */
export const usePipeline = (pipelineId: string) => {
  // Estados para clientes y oportunidades
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado para el cliente seleccionado y sus interacciones
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerInteractions, setCustomerInteractions] = useState<CustomerInteraction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);

  // Estados para búsqueda y ordenamiento
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("full_name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Estados para modales
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCreateOpportunityOpen, setIsCreateOpportunityOpen] = useState(false);

  // Estados para formularios
  const [editFormData, setEditFormData] = useState<EditFormData>({
    full_name: "",
    email: "",
    phone: "",
    address: "",
    notes: "",
  });

  const [opportunityFormData, setOpportunityFormData] = useState<OpportunityFormData>({
    name: "",
    amount: 0,
    expected_close_date: "",
    stage: "",
  });

  // Estado para mensajes de formulario y guardado
  const [formMessage, setFormMessage] = useState<FormMessage>({ type: "", text: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Estado para control de errores
  const [error, setError] = useState<ErrorState>(null);

  // Efecto para cargar datos iniciales
  useEffect(() => {
    if (!pipelineId) {
      console.error('No se proporcionó un ID de pipeline');
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      setError(null); // Reiniciar errores al iniciar la carga
      
      try {
        console.log(`Cargando datos para el pipeline: ${pipelineId}`);
        
        // Cargar etapas del pipeline
        const stages = await pipelineService.loadPipelineStages(pipelineId);
        console.log(`Etapas cargadas: ${stages.length}`);
        setPipelineStages(stages);
        
        // Cargar clientes con oportunidades
        const { customers, opportunities } = await pipelineService.loadCustomersWithOpportunities(pipelineId);
        console.log(`Clientes cargados: ${customers.length}, Oportunidades: ${opportunities.length}`);
        
        // Procesar clientes con sus estadísticas de oportunidades
        const processedCustomers = processCustomersWithOpportunities(customers, opportunities);
        setCustomers(processedCustomers);
      } catch (err: any) {
        console.error('Error al cargar datos del pipeline:', err);
        const errorMessage = err?.message || 'Error desconocido al cargar datos';
        setError(errorMessage);
        // Mostrar mensaje al usuario si es necesario
        // toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [pipelineId]);

  // Clientes filtrados y ordenados
  const filteredCustomers = sortCustomers(
    filterCustomers(customers, searchQuery),
    sortField,
    sortDirection as "asc" | "desc"
  );

  // Funciones para manejar acciones sobre clientes
  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailsOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditFormData({
      full_name: customer.full_name,
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setIsEditOpen(true);
  };

  const handleCreateOpportunity = (customer: Customer) => {
    setSelectedCustomer(customer);
    setOpportunityFormData({
      name: "",
      amount: 0,
      expected_close_date: new Date().toISOString().split("T")[0],
      stage: pipelineStages.length > 0 ? pipelineStages[0].id : "",
    });
    setIsCreateOpportunityOpen(true);
  };

  const handleViewHistory = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsHistoryOpen(true);
    setCustomerInteractions([]); // Limpiar interacciones anteriores
    setLoadingInteractions(true);

    // Cargar datos del historial
    const interactions = await pipelineService.loadCustomerInteractions(customer.id);
    setCustomerInteractions(interactions);
    setLoadingInteractions(false);
  };

  // Funciones para manejar formularios
  const handleEditFormChange = (field: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleOpportunityFormChange = (field: string, value: string | number) => {
    setOpportunityFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Función para guardar cambios en el cliente
  const saveCustomerChanges = async () => {
    if (!selectedCustomer) return;

    setIsSaving(true);
    setFormMessage({ type: "", text: "" });

    try {
      // Actualizar cliente en la base de datos
      const result = await pipelineService.updateCustomer(selectedCustomer.id, editFormData);
      
      if (!result.success) throw new Error("Error al actualizar cliente");

      // Actualizar estado local
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                full_name: editFormData.full_name,
                email: editFormData.email,
                phone: editFormData.phone,
                address: editFormData.address,
                notes: editFormData.notes,
              }
            : customer
        )
      );

      setFormMessage({
        type: "success",
        text: "Cliente actualizado correctamente",
      });

      // Cerrar el modal después de un breve tiempo
      setTimeout(() => {
        setIsEditOpen(false);
        setFormMessage({ type: "", text: "" });
      }, 1500);
    } catch (error) {
      console.error("Error al actualizar cliente:", error);
      setFormMessage({ type: "error", text: "Error al guardar los cambios" });
    } finally {
      setIsSaving(false);
    }
  };

  // Función para crear nueva oportunidad
  const createNewOpportunity = async () => {
    if (
      !selectedCustomer ||
      !opportunityFormData.name ||
      !opportunityFormData.expected_close_date ||
      !opportunityFormData.stage
    ) {
      setFormMessage({
        text: "Por favor complete todos los campos obligatorios",
        type: "error",
      });
      return;
    }

    setIsSaving(true);
    setFormMessage({ type: "", text: "" });

    try {
      // Insertar nueva oportunidad
      const result = await pipelineService.createOpportunity(
        selectedCustomer.id, 
        pipelineId,
        {
          name: opportunityFormData.name,
          amount: opportunityFormData.amount,
          stage_id: opportunityFormData.stage,
          expected_close_date: opportunityFormData.expected_close_date,
        }
      );

      if (!result.success || !result.opportunity) throw new Error("Error al crear oportunidad");

      const newOpportunity = result.opportunity;

      // Actualizar estado local
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === selectedCustomer.id
            ? {
                ...customer,
                total_opportunities: customer.total_opportunities + 1,
                active_opportunities: customer.active_opportunities + 1,
                total_value: customer.total_value + Number(opportunityFormData.amount),
                has_opportunities: true,
                latest_opportunity: {
                  id: newOpportunity.id,
                  name: newOpportunity.name,
                  status: newOpportunity.status,
                  amount: newOpportunity.amount,
                  stage_id: newOpportunity.stage_id,
                  created_at: newOpportunity.created_at,
                },
              }
            : customer
        )
      );

      setFormMessage({
        type: "success",
        text: "Oportunidad creada correctamente",
      });

      // Cerrar el modal después de un breve tiempo
      setTimeout(() => {
        setIsCreateOpportunityOpen(false);
        setFormMessage({ type: "", text: "" });
      }, 1500);
    } catch (error: any) {
      console.error("Error al crear oportunidad:", 
        error?.message || error?.error_description || JSON.stringify(error));
      setFormMessage({
        type: "error",
        text: `Error al crear la oportunidad: ${error?.message || 'Verifica tu conexión a Supabase'}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Función para manejar ordenamiento
  const handleSort = (field: string) => {
    if (field === sortField) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  return {
    // Estados
    customers,
    filteredCustomers,
    pipelineStages,
    loading,
    selectedCustomer,
    customerInteractions,
    loadingInteractions,
    searchQuery,
    sortField,
    sortDirection,
    isDetailsOpen,
    isEditOpen,
    isHistoryOpen,
    isCreateOpportunityOpen,
    editFormData,
    opportunityFormData,
    formMessage,
    isSaving,
    error, // Añadimos el estado de error
    
    // Setters
    setSearchQuery,
    setIsDetailsOpen,
    setIsEditOpen,
    setIsHistoryOpen,
    setIsCreateOpportunityOpen,
    
    // Acciones
    handleViewCustomer,
    handleEditCustomer,
    handleCreateOpportunity,
    handleViewHistory,
    handleEditFormChange,
    handleOpportunityFormChange,
    saveCustomerChanges,
    createNewOpportunity,
    handleSort,
  };
};
