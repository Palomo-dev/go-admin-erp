"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Loader2 } from "lucide-react";

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
          console.log("Pipeline predeterminado encontrado:", existingPipeline.id);
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
            name: "Pipeline de Ventas",
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

        // 3. Crear etapas básicas para el pipeline
        setMessage("Configurando etapas...");
        
        // Crear etapas sin el campo color que no existe en la base de datos
        // Usar valores de probability entre 0 y 1 para cumplir con la restricción de la tabla
        const defaultStages = [
          { name: "Contacto Inicial", position: 0, probability: 0.1 },
          { name: "Reunión Agendada", position: 1, probability: 0.3 },
          { name: "Propuesta Enviada", position: 2, probability: 0.5 },
          { name: "Negociación", position: 3, probability: 0.7 },
          { name: "Ganado", position: 4, probability: 1.0 },
          { name: "Perdido", position: 5, probability: 0.0 }
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

        console.log("Pipeline y etapas creados correctamente");
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
    <div className="flex flex-col items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-center text-muted-foreground">{message}</p>
    </div>
  );
}
