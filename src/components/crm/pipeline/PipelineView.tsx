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
        <DialogTitle className="text-xl font-semibold text-gray-900 dark:text-white">
          Nueva Oportunidad
        </DialogTitle>
        <DialogDescription className="text-gray-600 dark:text-gray-400">
          Complete la información para crear una nueva oportunidad
        </DialogDescription>
      </DialogHeader>
      
      <div className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="title" className="text-right">
            Título
          </Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="col-span-3"
            required
          />
        </div>
        
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="customer" className="text-right">
            Cliente
          </Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Seleccionar cliente" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customer.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="stage" className="text-right">
            Etapa
          </Label>
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Seleccionar etapa" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="value" className="text-right">
            Valor
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
            className="col-span-3"
            placeholder="$0"
            required
          />
        </div>
        
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="probability" className="text-right">
            Probabilidad
          </Label>
          <Select value={probability} onValueChange={setProbability}>
            <SelectTrigger className="col-span-3">
              <SelectValue placeholder="Seleccionar probabilidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="25">25%</SelectItem>
              <SelectItem value="50">50%</SelectItem>
              <SelectItem value="75">75%</SelectItem>
              <SelectItem value="90">90%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="expectedCloseDate" className="text-right">
            Fecha est. cierre
          </Label>
          <Input
            id="expectedCloseDate"
            type="date"
            value={expectedCloseDate}
            onChange={(e) => setExpectedCloseDate(e.target.value)}
            className="col-span-3"
          />
        </div>
      </div>
      
      {error && (
        <div className="text-red-500 text-sm mb-4">{error}</div>
      )}
      
      <DialogFooter>
        <Button
          type="button"
          onClick={onClose}
          variant="outline"
          className="mr-2"
          disabled={isSubmitting}
        >
          Cancelar
        </Button>
        <Button 
          type="submit" 
          className="bg-blue-600 hover:bg-blue-700 text-white"
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

  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
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
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="lg" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando pipeline...</span>
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
      
      <Tabs defaultValue="kanban" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
          <TabsTrigger value="table">Tabla</TabsTrigger>
          <TabsTrigger value="forecast">Pronóstico</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="automation">Automatización</TabsTrigger>
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
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Seleccione un pipeline para ver la tabla
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="forecast">
          {currentPipelineId ? (
            <ForecastView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Seleccione un pipeline para ver el pronóstico
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients">
          {currentPipelineId ? (
            <ClientsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Seleccione un pipeline para ver los clientes
            </div>
          )}
        </TabsContent>

        <TabsContent value="automation">
          {currentPipelineId ? (
            <AutomationsView pipelineId={currentPipelineId} />
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Seleccione un pipeline para configurar automatizaciones
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      <Dialog open={isNewOpportunityDialogOpen} onOpenChange={setIsNewOpportunityDialogOpen}>
        <DialogContent className="sm:max-w-md">
          {/* El DialogHeader, DialogTitle y DialogDescription están dentro del componente NewOpportunityForm */}
          {currentPipelineId && organizationId && (
            <NewOpportunityForm 
              onClose={() => setIsNewOpportunityDialogOpen(false)} 
              pipelineId={currentPipelineId}
              organizationId={organizationId}
              onSuccess={() => {
                // Recargar datos cuando se crea una nueva oportunidad
                console.log("Oportunidad creada con éxito");
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
