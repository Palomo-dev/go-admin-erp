"use client";

// Forzar renderizado dinámico para evitar errores de useSearchParams
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { formatCurrency } from "@/utils/Utils";

// Importaciones de UI
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { ChevronLeft, Save } from "lucide-react";

/**
 * Componente interno con useSearchParams
 */
function EditOpportunityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const opportunityId = searchParams.get("id");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opportunity, setOpportunity] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Cargar datos de la oportunidad
  useEffect(() => {
    const fetchOpportunity = async () => {
      if (!opportunityId) {
        toast({
          title: "Error",
          description: "ID de oportunidad no válido",
          variant: "destructive",
        });
        router.push("/app/crm/pipeline");
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
        
        // Cargar oportunidad
        const { data: opportunityData, error: opportunityError } = await supabase
          .from("opportunities")
          .select("*")
          .eq("id", opportunityId)
          .single();
        
        if (opportunityError || !opportunityData) {
          throw new Error("No se pudo cargar la oportunidad");
        }
        
        console.log("Oportunidad cargada:", opportunityData);
        setOpportunity(opportunityData);
        
        // Cargar etapas
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
  }, [opportunityId, router]);

  // Manejar cambios en los inputs
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOpportunity((prev: any) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Manejar cambios en selects
  const handleSelectChange = (name: string, value: string) => {
    setOpportunity((prev: any) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Guardar cambios
  const handleSave = async () => {
    if (!opportunity) return;
    
    setSaving(true);
    
    try {
      // Creamos un objeto solo con los campos que existen en la tabla
      const updateData: any = {
        name: opportunity.name,
        amount: opportunity.amount,
      };
      
      // Solo agregamos expected_close_date si existe
      if (opportunity.expected_close_date) {
        updateData.expected_close_date = opportunity.expected_close_date;
      }
      
      console.log("Datos a actualizar:", updateData);
      
      const { data, error } = await supabase
        .from("opportunities")
        .update(updateData)
        .eq("id", opportunityId);
        
      if (error) {
        console.error("Error detallado:", error);
        throw new Error(error.message);
      }
      
      toast({
        title: "Oportunidad actualizada",
        description: "Los cambios han sido guardados correctamente.",
      });
      
      // Regresar a la vista de pipeline
      router.push("/app/crm/pipeline");
    } catch (error: any) {
      console.error("Error al guardar oportunidad:", error);
      toast({
        title: "Error",
        description: `No se pudieron guardar los cambios: ${error.message || 'Error desconocido'}`,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
          
          {/* Etapa (solo lectura) */}
          <div className="space-y-2">
            <Label htmlFor="stage">Etapa</Label>
            <Input 
              id="stage" 
              value={stages.find(s => s.id === opportunity.stage_id)?.name || "Sin etapa"} 
              disabled
              className="bg-gray-100 dark:bg-gray-800"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monto */}
            <div className="space-y-2">
              <Label htmlFor="amount">Monto</Label>
              <Input 
                id="amount" 
                name="amount" 
                type="number"
                value={opportunity.amount || ""} 
                onChange={handleChange}
                placeholder="0.00"
              />
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
              value={opportunity.status === "won" ? "Ganada" : opportunity.status === "lost" ? "Perdida" : opportunity.status === "open" ? "Abierta" : opportunity.status} 
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

/**
 * Página de edición de oportunidad con Suspense
 */
export default function EditOpportunityPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center h-screen">
        <LoadingSpinner size="lg" className="text-blue-500" />
        <span className="ml-2">Cargando...</span>
      </div>
    }>
      <EditOpportunityContent />
    </Suspense>
  );
}
