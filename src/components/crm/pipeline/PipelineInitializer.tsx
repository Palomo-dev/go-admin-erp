"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Skeleton } from "@/components/ui/skeleton";

interface PipelineInitializerProps {
  organizationId: string | null;
  onInitComplete: () => void;
}

/**
 * Componente que verifica si existe un pipeline predeterminado para la organización
 * y si no, lo crea automáticamente junto con etapas básicas
 */
export function PipelineInitializer({ organizationId, onInitComplete }: PipelineInitializerProps) {
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [message, setMessage] = useState<string>("Verificando pipeline...");

  useEffect(() => {
    const initializePipeline = async () => {
      if (!organizationId) {
        console.error("No se proporcionó ID de organización");
        setMessage("Error: No se encontró información de la organización");
        setIsInitializing(false);
        return;
      }

      try {
        // 1. Verificar si ya existe un pipeline predeterminado para esta organización
        const { data: existingPipeline, error: pipelineError } = await supabase
          .from("pipelines")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("is_default", true)
          .maybeSingle();

        if (pipelineError && pipelineError.code !== "PGRST116") {
          console.error("Error al verificar pipeline:", pipelineError);
          setMessage("Error al verificar pipeline existente");
          setIsInitializing(false);
          return;
        }

        // Si ya existe un pipeline predeterminado, terminamos
        if (existingPipeline) {
          // Pipeline predeterminado encontrado
          setIsInitializing(false);
          onInitComplete();
          return;
        }

        // 2. Crear un nuevo pipeline predeterminado
        setMessage("Creando pipeline predeterminado...");

        const { data: newPipeline, error: createError } = await supabase
          .from("pipelines")
          .insert({
            organization_id: organizationId,
            name: "Ventas B2B",
            is_default: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error("Error al crear pipeline:", createError);
          setMessage("Error al crear pipeline predeterminado");
          setIsInitializing(false);
          return;
        }

        // 3. Crear etapas semilla para el pipeline
        setMessage("Configurando etapas...");

        // Etapas semilla con probability en escala 0-100 (integer, constraint stages_probability_range)
        const defaultStages = [
          { name: "Lead nuevo", position: 0, probability: 5 },
          { name: "Contactado", position: 1, probability: 10 },
          { name: "Calificado", position: 2, probability: 20 },
          { name: "Discovery", position: 3, probability: 30 },
          { name: "Demo", position: 4, probability: 45 },
          { name: "Propuesta", position: 5, probability: 60 },
          { name: "Negociación", position: 6, probability: 75 },
          { name: "Contrato/pago", position: 7, probability: 90 },
          { name: "Ganado", position: 8, probability: 100 },
          { name: "Perdido", position: 9, probability: 0 }
        ];

        // Insertar todas las etapas con los campos correctos de la tabla
        const stagesWithPipelineId = defaultStages.map(stage => ({
          ...stage,
          pipeline_id: newPipeline.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: stagesError } = await supabase
          .from("stages")
          .insert(stagesWithPipelineId);

        if (stagesError) {
          console.error("Error al crear etapas:", stagesError);
          setMessage("Error al crear etapas del pipeline");
          setIsInitializing(false);
          return;
        }

        // Pipeline y etapas creados correctamente
        setMessage("Pipeline configurado correctamente");
        
        // Esperar un momento antes de notificar la finalización
        setTimeout(() => {
          setIsInitializing(false);
          onInitComplete();
        }, 1000);

      } catch (err) {
        console.error("Error inesperado:", err);
        setMessage("Error inesperado al configurar pipeline");
        setIsInitializing(false);
      }
    };

    initializePipeline();
  }, [organizationId, onInitComplete]);

  return (
    <div className="p-8 space-y-4 max-w-md mx-auto">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
