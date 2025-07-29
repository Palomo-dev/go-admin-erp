"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/config";

// Importaciones de UI
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, Save } from "lucide-react";

// Interfaces
interface OpportunityData {
  id: string;
  name: string;
  amount: number;
  currency: string;
  expected_close_date?: string;
  stage_id: string;
  pipeline_id: string;
  customer_id: string;
  organization_id: number;
  status?: string;
  updated_at?: string;
  pipeline?: { id: string; name: string };
  stage?: { id: string; name: string };
  customer?: { id: string; first_name: string; last_name: string; full_name?: string };
}

interface StageData {
  id: string;
  name: string;
  position: number;
  pipeline_id: string;
}

interface CustomerData {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
}

interface CurrencyData {
  code: string;
  name: string;
  symbol: string;
}

/**
 * Página de edición de oportunidad
 * Permite editar los detalles de una oportunidad existente
 */
export default function EditOpportunityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opportunityId = searchParams.get("id");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opportunity, setOpportunity] = useState<OpportunityData | null>(null);
  const [stages, setStages] = useState<StageData[]>([]);
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyData[]>([]);
  const [organizationId, setOrganizationId] = useState<number | null>(null);

  // Obtener organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem('selectedOrganization') || localStorage.getItem('organizationId') || '2';
    setOrganizationId(parseInt(orgId));
  }, []);

  // Cargar datos de la oportunidad
  useEffect(() => {
    const fetchOpportunity = async () => {
      if (!opportunityId || !organizationId) {
        if (!opportunityId) {
          toast({
            title: "Error",
            description: "ID de oportunidad no válido",
            variant: "destructive",
          });
          router.push("/app/crm/pipeline");
        }
        return;
      }

      try {
        setLoading(true);
        
        // Primero verificamos la estructura de la tabla para debuggear
        const { data: tableInfo, error: tableError } = await supabase
          .from('opportunities')
          .select()
          .limit(1);
          
        if (tableError) {
          console.error("Error al verificar tabla:", tableError);
        } else {
          console.log("Estructura de oportunidad:", tableInfo.length > 0 ? Object.keys(tableInfo[0]) : "No hay datos");
        }
        
        // Cargar datos de la oportunidad con joins
        const { data: opportunityData, error: opportunityError } = await supabase
          .from("opportunities")
          .select(`
            *,
            pipeline:pipelines(id, name),
            stage:stages(id, name),
            customer:customers(id, first_name, last_name, full_name)
          `)
          .eq("id", opportunityId)
          .eq("organization_id", organizationId)
          .single();
        
        if (opportunityError || !opportunityData) {
          throw new Error("No se pudo cargar la oportunidad");
        }
        
        console.log("Oportunidad cargada:", opportunityData);
        setOpportunity(opportunityData);
        
        // Cargar etapas del pipeline
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("*")
          .eq("pipeline_id", opportunityData.pipeline_id)
          .order("position");
        
        if (stagesError) {
          console.error("Error al cargar etapas:", stagesError);
        } else {
          console.log("Etapas cargadas:", stagesData);
          setStages(stagesData || []);
        }
        
        // Cargar monedas disponibles
        const { data: currenciesData, error: currenciesError } = await supabase
          .from("currencies")
          .select("code, name, symbol")
          .eq("is_active", true)
          .order("code");
        
        if (currenciesError) {
          console.error("Error al cargar monedas:", currenciesError);
          // Fallback con monedas básicas
          setCurrencies([
            { code: "USD", name: "Dólar estadounidense", symbol: "$" },
            { code: "COP", name: "Peso colombiano", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" }
          ]);
        } else {
          console.log("Monedas cargadas:", currenciesData);
          setCurrencies(currenciesData || []);
        }
        
        // Cargar cliente
        if (opportunityData.customer_id) {
          const { data: customerData, error: customerError } = await supabase
            .from("customers")
            .select("*")
            .eq("id", opportunityData.customer_id)
            .single();
          
          if (customerError) {
            console.error("Error al cargar cliente:", customerError);
          } else {
            console.log("Cliente cargado:", customerData);
            setCustomers(customerData ? [customerData] : []);
          }
        }
      } catch (error) {
        console.error("Error al cargar datos:", error);
        toast({
          title: "Error",
          description: "No se pudo cargar la oportunidad. Verifica el ID y vuelve a intentarlo.",
          variant: "destructive",
        });
        router.push("/app/crm/pipeline");
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunity();
  }, [opportunityId, organizationId, router]);

  // Manejar cambios en los inputs
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setOpportunity((prev) => prev ? {
      ...prev,
      [name]: value,
    } : null);
  };

  // Manejar cambios en selects
  const handleSelectChange = (name: string, value: string) => {
    setOpportunity((prev) => prev ? {
      ...prev,
      [name]: value,
    } : null);
  };

  // Manejar cambio de moneda
  const handleCurrencyChange = (value: string) => {
    setOpportunity((prev) => prev ? {
      ...prev,
      currency: value,
    } : null);
  };

  // Guardar cambios
  const handleSave = async () => {
    if (!opportunity) return;
    
    setSaving(true);
    
    try {
      // Creamos un objeto solo con los campos que existen en la tabla
      const updateData: Partial<OpportunityData> = {
        name: opportunity.name,
        amount: opportunity.amount,
        stage_id: opportunity.stage_id,
        currency: opportunity.currency || 'USD',
        updated_at: new Date().toISOString(),
      };
      
      // Solo agregamos expected_close_date si existe
      if (opportunity.expected_close_date) {
        updateData.expected_close_date = opportunity.expected_close_date;
      }
      
      console.log("Datos a actualizar:", updateData);
      
      const { data, error } = await supabase
        .from("opportunities")
        .update(updateData)
        .eq("id", opportunityId)
        .select();
        
      console.log("Respuesta de actualización:", { data, error });
        
      if (error) {
        console.error("Error detallado:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(error.message);
      }
      
      // Trigger para recálculo de pronóstico
      await triggerForecastRecalculation();
      
      // Broadcast para actualizar Kanban
      if (opportunityId) {
        await broadcastOpportunityUpdate(opportunityId, updateData);
      }
      
      toast({
        title: "Oportunidad actualizada",
        description: "Los cambios han sido guardados correctamente.",
      });
      
      // Regresar a la vista de pipeline
      router.push("/app/crm/pipeline");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      console.error("Error al guardar oportunidad:", error);
      toast({
        title: "Error",
        description: `No se pudieron guardar los cambios: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Función para trigger de recálculo de pronóstico
  const triggerForecastRecalculation = async () => {
    try {
      console.log('🔄 Activando recálculo de pronóstico...');
      
      // Disparar evento personalizado para recálculo
      if (typeof window !== 'undefined' && opportunity) {
        window.dispatchEvent(new CustomEvent('forecastRecalculation', {
          detail: { 
            pipelineId: opportunity.pipeline_id,
            opportunityId: opportunityId,
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      console.log('✅ Trigger de recálculo de pronóstico activado');
    } catch (error) {
      console.error('❌ Error en trigger de recálculo:', error);
    }
  };

  // Función para broadcast de actualización de Kanban
  const broadcastOpportunityUpdate = async (oppId: string, updateData: Partial<OpportunityData>) => {
    try {
      console.log('📡 Enviando broadcast de actualización de Kanban...');
      
      // Disparar evento personalizado para actualización de Kanban
      if (typeof window !== 'undefined' && opportunity) {
        window.dispatchEvent(new CustomEvent('kanbanUpdate', {
          detail: { 
            type: 'opportunity_updated',
            opportunityId: oppId,
            data: updateData,
            pipelineId: opportunity.pipeline_id,
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      console.log('✅ Broadcast de Kanban enviado');
    } catch (error) {
      console.error('❌ Error en broadcast de Kanban:', error);
    }
  };

  // Mostrar spinner mientras carga
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" className="text-blue-500" />
        <span className="ml-2">Cargando datos...</span>
      </div>
    );
  }

  // Si no se encontró la oportunidad
  if (!opportunity) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Oportunidad no encontrada</h1>
        <p className="mt-2">No se pudo encontrar la oportunidad especificada.</p>
        <Button onClick={() => router.push("/app/crm/pipeline")} className="mt-4">
          Volver al Pipeline
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center mb-6">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => router.push("/app/crm/pipeline")}
          className="mr-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <h1 className="text-2xl font-bold">Editar Oportunidad</h1>
      </div>
      
      <Card className="w-full max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Detalles de la oportunidad</CardTitle>
          <CardDescription>
            Actualiza la información de esta oportunidad de venta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Nombre de la oportunidad */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input 
              id="name" 
              name="name" 
              value={opportunity.name || ""} 
              onChange={handleChange}
              placeholder="Nombre de la oportunidad"
            />
          </div>
          
          {/* Cliente (solo lectura) */}
          <div className="space-y-2">
            <Label htmlFor="customer">Cliente</Label>
            <Input 
              id="customer" 
              value={
                customers.length > 0 && customers[0]?.full_name 
                ? customers[0].full_name 
                : customers.length > 0 && customers[0]?.first_name 
                ? `${customers[0].first_name} ${customers[0].last_name || ''}`.trim() 
                : "Sin cliente"
              } 
              disabled
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          
          {/* Etapa (editable) */}
          <div className="space-y-2">
            <Label htmlFor="stage">Etapa *</Label>
            <Select value={opportunity.stage_id || ""} onValueChange={(value) => handleSelectChange("stage_id", value)}>
              <SelectTrigger>
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
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Monto */}
            <div className="space-y-2">
              <Label htmlFor="amount">Monto *</Label>
              <Input 
                id="amount" 
                name="amount" 
                type="number"
                value={opportunity.amount || ""} 
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>
            
            {/* Moneda */}
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda *</Label>
              <Select value={opportunity.currency || "USD"} onValueChange={handleCurrencyChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.symbol} {currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Fecha estimada de cierre */}
            <div className="space-y-2">
              <Label htmlFor="expected_close_date">Fecha de cierre</Label>
              <Input 
                id="expected_close_date" 
                name="expected_close_date" 
                type="date"
                value={opportunity.expected_close_date ? opportunity.expected_close_date.substring(0, 10) : ""} 
                onChange={handleChange}
              />
            </div>
          </div>
          
          {/* Estado (solo lectura) */}
          <div className="space-y-2">
            <Label htmlFor="status">Estado</Label>
            <Input 
              id="status" 
              value={opportunity.status === "won" ? "Ganada" : opportunity.status === "lost" ? "Perdida" : opportunity.status === "open" ? "Abierta" : (opportunity.status || "Sin estado")} 
              disabled
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          
          {/* No incluimos campo de descripción ya que no existe en la tabla */}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button 
            variant="outline" 
            onClick={() => router.push("/app/crm/pipeline")}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSave}
            disabled={saving}
            className="gap-2"
          >
            {saving ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Guardar cambios</span>
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
