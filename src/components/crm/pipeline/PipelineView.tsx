"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PipelineHeader from "./PipelineHeader";
import PipelineStages from "./PipelineStages";
import ForecastView from "./ForecastView";
import TableView from "./TableView";
import ClientsView from "./ClientsView";
import AutomationsView from "./AutomationsView";
import ProductSelector from "./ProductSelector";
import PipelineManager from "./PipelineManager";
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

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface SelectedProduct {
  product: Product;
  quantity: number;
  unit_price: number;
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
  const [customerId, setCustomerId] = useState("");
  const [stageId, setStageId] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState("");

  // Cargar clientes, etapas, monedas y productos al iniciar
  useEffect(() => {
    const loadData = async () => {
      try {
        // Validar que tenemos los parámetros necesarios
        if (!pipelineId || !organizationId) {
          console.log("Esperando pipelineId y organizationId...", { pipelineId, organizationId });
          setIsLoadingData(false);
          return;
        }
        
        setIsLoadingData(true);
        console.log("Cargando datos con:", { pipelineId, organizationId });
        
        // Cargar clientes
        console.log("Cargando clientes...");
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, first_name, last_name")
          .eq("organization_id", organizationId)
          .order("first_name");
          
        if (customersError) {
          console.error("Error al cargar clientes:", customersError);
          throw customersError;
        }
        
        console.log("Clientes cargados:", customersData);
        
        // Formatear nombres completos de clientes
        const formattedCustomers = (customersData || []).map(customer => ({
          id: customer.id,
          full_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Sin nombre'
        }));
        console.log("Clientes formateados:", formattedCustomers);
        setCustomers(formattedCustomers);
        
        // Cargar etapas del pipeline
        console.log("Cargando etapas para pipeline:", pipelineId);
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, position")
          .eq("pipeline_id", pipelineId)
          .order("position");
          
        if (stagesError) {
          console.error("Error al cargar etapas:", stagesError);
          throw stagesError;
        }
        
        console.log("Etapas cargadas:", stagesData);
        setStages(stagesData || []);
        
        // Establecer la primera etapa como predeterminada
        if (stagesData && stagesData.length > 0) {
          setStageId(stagesData[0].id);
        }
        
        // Cargar monedas disponibles
        console.log("Cargando monedas...");
        const { data: currenciesData, error: currenciesError } = await supabase
          .from("currencies")
          .select("code, name, symbol")
          .eq("is_active", true)
          .order("code");
          
        if (currenciesError) {
          console.warn("Error al cargar monedas:", currenciesError);
          // Usar monedas por defecto si no se pueden cargar
          setCurrencies([
            { code: "USD", name: "Dólar estadounidense", symbol: "$" },
            { code: "COP", name: "Peso colombiano", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" }
          ]);
        } else {
          console.log("Monedas cargadas:", currenciesData);
          setCurrencies(currenciesData || []);
        }
        
        // Cargar productos disponibles
        console.log("Cargando productos...");
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, name, sku")
          .eq("organization_id", organizationId)
          .eq("status", "active")
          .order("name");
          
        if (productsError) {
          console.warn("Error al cargar productos:", productsError);
          setProducts([]);
        } else {
          console.log("Productos cargados:", productsData);
          setProducts(productsData || []);
        }
        
        console.log("Carga de datos completada");
        console.log("Estados finales:", {
          customers: formattedCustomers.length,
          stages: (stagesData || []).length,
          currencies: (currenciesData || []).length,
          products: (productsData || []).length
        });
        
        setIsLoadingData(false);
        
      } catch (error) {
        console.error("Error al cargar datos:", error);
        setError("Error al cargar datos. Por favor intente nuevamente.");
        setIsLoadingData(false);
      }
    };
    
    loadData();
  }, [pipelineId, organizationId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    
    // Validaciones
    if (!title || !customerId || !stageId || !value || !currency) {
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
      const { data: opportunityData, error: opportunityError } = await supabase
        .from("opportunities")
        .insert({
          name: title,
          customer_id: customerId,
          pipeline_id: pipelineId,
          stage_id: stageId,
          amount: numericValue,
          expected_close_date: expectedCloseDate || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          organization_id: organizationId,
          status: "open",
          currency: currency
        })
        .select()
        .single();
        
      if (opportunityError) throw opportunityError;
      
      // Insertar productos asociados si hay alguno seleccionado
      if (selectedProducts.length > 0 && opportunityData) {
        const productInserts = selectedProducts.map(sp => ({
          opportunity_id: opportunityData.id,
          product_id: sp.product.id,
          quantity: sp.quantity,
          unit_price: sp.unit_price
        }));
        
        const { error: productsError } = await supabase
          .from("opportunity_products")
          .insert(productInserts);
          
        if (productsError) {
          console.warn("Error al asociar productos:", productsError);
          // No fallar completamente, solo mostrar advertencia
        }
      }
      
      // Notificar éxito y cerrar
      if (onSuccess) onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error("Error al crear oportunidad:", error);
      const errorMessage = error instanceof Error ? error.message : "Error al guardar la oportunidad.";
      setError(errorMessage);
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
      
      <div className="space-y-6 py-4">
        {isLoadingData && (
          <div className="flex items-center justify-center py-4">
            <LoadingSpinner size="sm" />
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
              Cargando datos del formulario...
            </span>
          </div>
        )}
        
        {/* Información básica */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            Información Básica
          </h3>
          
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Título *
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre de la oportunidad"
                required
                className="w-full"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cliente *
                </Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 ? (
                      <SelectItem value="no-data" disabled>
                        No hay clientes disponibles
                      </SelectItem>
                    ) : (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.full_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="stage" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Etapa *
                </Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      console.log("Renderizando selector de etapas. Total:", stages.length);
                      if (stages.length === 0) {
                        console.log("No hay etapas disponibles:", stages);
                        return (
                          <SelectItem value="no-data" disabled>
                            No hay etapas disponibles
                          </SelectItem>
                        );
                      }
                      return stages.map((stage) => {
                        console.log("Renderizando etapa:", stage);
                        return (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        );
                      });
                    })()}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Información financiera */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            Información Financiera
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="value" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Valor *
              </Label>
              <Input
                id="value"
                value={value}
                onChange={(e) => {
                  const inputValue = e.target.value.replace(/[^0-9.]/g, "");
                  const validatedValue = inputValue.replace(/\.(?=.*\.)/g, "");
                  setValue(validatedValue);
                }}
                onBlur={() => {
                  if (value) {
                    const numericValue = parseFloat(value);
                    if (!isNaN(numericValue)) {
                      setValue(formatCurrency(numericValue));
                    }
                  }
                }}
                placeholder="0.00"
                required
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="currency" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Moneda *
              </Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    console.log("Renderizando selector de monedas. Total:", currencies.length);
                    if (currencies.length === 0) {
                      console.log("No hay monedas disponibles:", currencies);
                      return (
                        <SelectItem value="no-data" disabled>
                          No hay monedas disponibles
                        </SelectItem>
                      );
                    }
                    return currencies.map((curr) => {
                      console.log("Renderizando moneda:", curr);
                      return (
                        <SelectItem key={curr.code} value={curr.code}>
                          {curr.symbol} {curr.code} - {curr.name}
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="expectedCloseDate" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Fecha Estimada de Cierre
            </Label>
            <Input
              id="expectedCloseDate"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
        
        {/* Productos */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
            Productos (Opcional)
          </h3>
          
          <ProductSelector
            products={products}
            selectedProducts={selectedProducts}
            onProductsChange={setSelectedProducts}
            currency={currency}
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isNewOpportunityDialogOpen, setIsNewOpportunityDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("kanban");

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
    console.log('🔄 Cambiando pipeline de', currentPipelineId, 'a', pipelineId);
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
      
      <div className="w-full">
        {/* Sistema de navegación personalizado */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setActiveTab("kanban")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "kanban"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setActiveTab("table")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "table"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Tabla
            </button>
            <button
              onClick={() => setActiveTab("forecast")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "forecast"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Pronóstico
            </button>
            <button
              onClick={() => setActiveTab("clients")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "clients"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Clientes
            </button>
            <button
              onClick={() => setActiveTab("automation")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === "automation"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Automatización
            </button>

          </div>
        </div>
        
        {/* Contenido de las pestañas */}
        {activeTab === "kanban" && (
          <div className="mt-0">
            {currentPipelineId && (
              <PipelineStages 
                key={`${currentPipelineId}-${refreshTrigger}`} 
                pipelineId={currentPipelineId} 
              />
            )}
          </div>
        )}
        
        {activeTab === "table" && (
          <div>
            {currentPipelineId ? (
              <TableView 
                key={currentPipelineId} 
                pipelineId={currentPipelineId} 
              />
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Seleccione un pipeline para ver la tabla
              </div>
            )}
          </div>
        )}
        
        {activeTab === "forecast" && (
          <div>
            {currentPipelineId ? (
              <ForecastView 
                key={currentPipelineId} 
                pipelineId={currentPipelineId} 
              />
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Seleccione un pipeline para ver el pronóstico
              </div>
            )}
          </div>
        )}

        {activeTab === "clients" && (
          <div>
            {currentPipelineId ? (
              <ClientsView pipelineId={currentPipelineId} />
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Seleccione un pipeline para ver los clientes
              </div>
            )}
          </div>
        )}

        {activeTab === "automation" && (
          <div>
            {currentPipelineId ? (
              <AutomationsView pipelineId={currentPipelineId} />
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Seleccione un pipeline para configurar automatizaciones
              </div>
            )}
          </div>
        )}

        {activeTab === "pipelines" && (
          <div>
            {organizationId ? (
              <PipelineManager 
                organizationId={organizationId}
                currentPipelineId={currentPipelineId}
                onPipelineChange={handlePipelineChange}
              />
            ) : (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                Cargando información de la organización...
              </div>
            )}
          </div>
        )}
      </div>
      
      <Dialog open={isNewOpportunityDialogOpen} onOpenChange={setIsNewOpportunityDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* El DialogHeader, DialogTitle y DialogDescription están dentro del componente NewOpportunityForm */}
          {currentPipelineId && organizationId && (
            <NewOpportunityForm 
              onClose={() => setIsNewOpportunityDialogOpen(false)} 
              pipelineId={currentPipelineId}
              organizationId={organizationId}
              onSuccess={() => {
                console.log('✅ Oportunidad creada exitosamente, forzando actualización de componentes');
                // Incrementar el refreshTrigger para forzar re-renderizado de todos los componentes
                setRefreshTrigger(prev => prev + 1);
                // Cerrar el diálogo
                setIsNewOpportunityDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
