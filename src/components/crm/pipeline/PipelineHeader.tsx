"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { PlusCircle, SlidersHorizontal } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

interface PipelineHeaderProps {
  currentPipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
  onNewOpportunity: () => void;
}

export default function PipelineHeader({ 
  currentPipelineId, 
  onPipelineChange, 
  onNewOpportunity 
}: PipelineHeaderProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);
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
  
  // Cargar los pipelines de la organización cuando tengamos el ID
  useEffect(() => {
    const loadPipelines = async () => {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, is_default")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false });
        
      if (error) {
        console.error("Error al cargar pipelines:", error);
        return;
      }
      
      if (data && data.length > 0) {
        setPipelines(data);
        
        // Establecer el pipeline actual
        if (currentPipelineId) {
          const selected = data.find(p => p.id === currentPipelineId);
          if (selected) {
            setCurrentPipeline(selected);
          } else {
            // Si no encontramos el pipeline seleccionado, usar el primero
            setCurrentPipeline(data[0]);
            onPipelineChange(data[0].id);
          }
        } else {
          // Si no hay pipeline seleccionado, usar el predeterminado o el primero
          const defaultPipeline = data.find(p => p.is_default) || data[0];
          setCurrentPipeline(defaultPipeline);
          onPipelineChange(defaultPipeline.id);
        }
      }
    };
    
    loadPipelines();
  }, [organizationId, currentPipelineId, onPipelineChange]);
  
  const handlePipelineChange = (pipeline: Pipeline) => {
    setCurrentPipeline(pipeline);
    onPipelineChange(pipeline.id);
  };
  
  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="flex flex-col w-full sm:w-auto">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
          Pipeline CRM
        </h1>
        <div className="flex items-center mt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-h-[40px] text-sm sm:text-base text-blue-600 dark:text-blue-400 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800 font-medium">
                {currentPipeline?.name || "Seleccionar Pipeline"}
                <SlidersHorizontal className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <DropdownMenuLabel className="text-gray-900 dark:text-gray-100 font-semibold">Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem 
                  key={pipeline.id} 
                  onClick={() => handlePipelineChange(pipeline)}
                  className={`text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${
                    pipeline.id === currentPipeline?.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  {pipeline.name}
                  {pipeline.is_default && (
                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                      Por defecto
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
        <Button 
          onClick={onNewOpportunity} 
          size="sm" 
          className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          <span className="hidden sm:inline">Nueva Oportunidad</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>
    </header>
  );
}
