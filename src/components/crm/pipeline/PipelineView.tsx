"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PipelineHeader from "./PipelineHeader";
import PipelineStages from "./PipelineStages";
import ForecastView from "./ForecastView";
import TableView from "./TableView";
import ClientsView from "./ClientsView";
import AutomationsView from "./AutomationsView";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { formatCurrency } from "@/utils/Utils";

// Interfaces para los tipos de datos
interface Customer {
  id: string;
  full_name: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
}

// Formulario para nueva oportunidad
const NewOpportunityForm = ({ 
  onClose, 
  pipelineId, 
  organizationId, 
  onSuccess 
}: { 
  onClose: () => void; 
  pipelineId: string; 
  organizationId: number;
  onSuccess?: () => void;
}) => {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState("50"); // Valor por defecto
  const [customerId, setCustomerId] = useState("");
  const [stageId, setStageId] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Cargar clientes y etapas al iniciar
  useEffect(() => {
    const loadData = async () => {
      try {
        // Cargar clientes
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name")
          .eq("organization_id", organizationId)
          .order("full_name");
          
        if (customersError) throw customersError;
        setCustomers(customersData || []);
        
        // Cargar etapas del pipeline
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, position")
          .eq("pipeline_id", pipelineId)
          .order("position");
          
        if (stagesError) throw stagesError;
        setStages(stagesData || []);
        
        // Establecer la primera etapa como predeterminada
        if (stagesData && stagesData.length > 0) {
          setStageId(stagesData[0].id);
        }
      } catch (error) {
        console.error("Error al cargar datos:", error);
        setError("Error al cargar datos. Por favor intente nuevamente.");
      }
    };
    
    loadData();
  }, [pipelineId, organizationId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    // Validaciones
    if (!title || !customerId || !stageId || !value) {
      setError("Por favor complete todos los campos requeridos.");
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Convertir valor a número
      const numericValue = parseFloat(value.replace(/[^0-9.-]+/g, ""));
      if (isNaN(numericValue)) {
        setError("El valor debe ser un número válido.");
        setIsSubmitting(false);
        return;
      }
      
      // Crear nueva oportunidad
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          name: title, // Corregido: se usa 'name' en lugar de 'title'
          customer_id: customerId,
          pipeline_id: pipelineId,
          stage_id: stageId,
          amount: numericValue, // Corregido: se usa 'amount' en lugar de 'value'
          // Removido campo 'probability' que no existe en la tabla
          expected_close_date: expectedCloseDate || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          organization_id: organizationId,
          status: "open", // Corregido: solo puede ser 'open', 'won' o 'lost'
          currency: "COP" // Campo obligatorio 'currency'
        })
        .select();
        
      if (error) throw error;
      
      // Notificar éxito y cerrar
      if (onSuccess) onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error al crear oportunidad:", error);
      setError(error.message || "Error al guardar la oportunidad.");
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
          Nueva Oportunidad
        </DialogTitle>
        <DialogDescription className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
          Complete la información para crear una nueva oportunidad
        </DialogDescription>
      </DialogHeader>
      
      <div className="grid gap-4 py-4">
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="title" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Título *
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            required
          />
        </div>
        
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="customer" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Cliente *
          </Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  {customer.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="stage" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Etapa *
          </Label>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Seleccionar etapa" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id} className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="value" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Valor *
          </Label>
          <Input
            id="value"
            value={value}
            onChange={(e) => {
              // Permitir sólo números y punto decimal
              const inputValue = e.target.value.replace(/[^0-9.]/g, "");
              // Evitar múltiples puntos decimales
              const validatedValue = inputValue.replace(/\.(?=.*\.)/g, "");
              // Actualizar el estado con el valor sin formatear
              setValue(validatedValue);
            }}
            onBlur={(e) => {
              // Formatear como moneda al perder el foco
              if (value) {
                const numericValue = parseFloat(value);
                if (!isNaN(numericValue)) {
                  setValue(formatCurrency(numericValue));
                }
              }
            }}
            className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            placeholder="$0"
            required
          />
        </div>
        
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="probability" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Probabilidad
          </Label>
          <Select value={probability} onValueChange={setProbability}>
            <SelectTrigger className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
              <SelectValue placeholder="Seleccionar probabilidad" />
            </SelectTrigger>
            <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectItem value="10" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">10%</SelectItem>
              <SelectItem value="25" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">25%</SelectItem>
              <SelectItem value="50" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">50%</SelectItem>
              <SelectItem value="75" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">75%</SelectItem>
              <SelectItem value="90" className="text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">90%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
          <Label htmlFor="expectedCloseDate" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
            Fecha est. cierre
          </Label>
          <Input
            id="expectedCloseDate"
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
            className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
          />
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
      )}
      
      <DialogFooter className="flex-col sm:flex-row gap-2">
        <Button
          type="button"
          onClick={onClose}
          variant="outline"
          className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Guardando..." : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default function PipelineView() {
  const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
  const [isNewOpportunityDialogOpen, setIsNewOpportunityDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  // Obtener el ID de la organización del localStorage con múltiples opciones de clave
  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en localStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en sessionStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== 'production') {
      // Usando ID de organización predeterminado para desarrollo
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      // No se pudo encontrar el ID de organización en el almacenamiento local
    }
  }, []);

  // Cargar el pipeline predeterminado cuando tenemos el ID de la organización
  useEffect(() => {
    const loadDefaultPipeline = async () => {
      if (!organizationId) return;

      setLoading(true);
      
      // Intentamos obtener el pipeline predeterminado
      const { data: defaultPipeline, error: defaultError } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .single();

      if (defaultError && defaultError.code !== "PGRST116") {
        console.error("Error al cargar el pipeline predeterminado:", defaultError);
      }

      // Si encontramos un pipeline predeterminado, lo usamos
      if (defaultPipeline) {
        setCurrentPipelineId(defaultPipeline.id);
        setLoading(false);
        return;
      }

      // Si no hay pipeline predeterminado, obtenemos el primer pipeline
      const { data: firstPipeline, error: firstError } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (firstError) {
        console.error("Error al cargar el primer pipeline:", firstError);
      } else if (firstPipeline) {
        setCurrentPipelineId(firstPipeline.id);
      }

      setLoading(false);
    };

    loadDefaultPipeline();
  }, [organizationId]);

  const handlePipelineChange = (pipelineId: string) => {
    setCurrentPipelineId(pipelineId);
  };

  const openNewOpportunityDialog = () => {
    setIsNewOpportunityDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 dark:bg-gray-900 gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Cargando pipeline...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <PipelineHeader 
        currentPipelineId={currentPipelineId}
        onPipelineChange={handlePipelineChange}
        onNewOpportunity={openNewOpportunityDialog}
      />
      
      <Tabs defaultValue="kanban" className="w-full px-3 sm:px-4">
        <TabsList className="mb-4 flex-wrap gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 h-auto p-2">
          <TabsTrigger value="kanban" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">Kanban</TabsTrigger>
          <TabsTrigger value="table" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">Tabla</TabsTrigger>
          <TabsTrigger value="forecast" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">Pronóstico</TabsTrigger>
          <TabsTrigger value="clients" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300">Clientes</TabsTrigger>
          <TabsTrigger value="automation" className="text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] px-3 sm:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-700 dark:text-gray-300 hidden sm:inline-flex">Automatización</TabsTrigger>
        </TabsList>
        
        <TabsContent value="kanban" className="mt-0">
          {currentPipelineId && (
            <PipelineStages pipelineId={currentPipelineId} />
          )}
        </TabsContent>
        
        <TabsContent value="table">
          {currentPipelineId ? (
            <TableView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver la tabla
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="forecast">
          {currentPipelineId ? (
            <ForecastView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver el pronóstico
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients">
          {currentPipelineId ? (
            <ClientsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para ver los clientes
            </div>
          )}
        </TabsContent>

        <TabsContent value="automation">
          {currentPipelineId ? (
            <AutomationsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 sm:p-6 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Seleccione un pipeline para configurar automatizaciones
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <Dialog open={isNewOpportunityDialogOpen} onOpenChange={setIsNewOpportunityDialogOpen}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          {/* El DialogHeader, DialogTitle y DialogDescription están dentro del componente NewOpportunityForm */}
          {currentPipelineId && organizationId && (
            <NewOpportunityForm 
              onClose={() => setIsNewOpportunityDialogOpen(false)} 
              pipelineId={currentPipelineId}
              organizationId={organizationId}
              onSuccess={() => {
                // Recargar datos cuando se crea una nueva oportunidad
                // Oportunidad creada con éxito
                // Forzar recarga de datos en las vistas actuales
                const currentTab = document.querySelector('[data-state="active"]')?.getAttribute('data-value');
                if (currentTab === "kanban") {
                  // Refresh kanban view
                  const event = new CustomEvent('refresh-pipeline-data');
                  window.dispatchEvent(event);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
