"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Button } from "@/components/ui/button";
import { PlusCircle, Filter, SlidersHorizontal } from "lucide-react";
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
  
  // Obtener el ID de la organización del localStorage
  useEffect(() => {
    const orgId = localStorage.getItem("currentOrganizationId");
    if (orgId) {
      setOrganizationId(Number(orgId));
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
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Pipeline CRM
        </h1>
        <div className="flex items-center mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="text-blue-600 dark:text-blue-400 bg-transparent font-medium">
                {currentPipeline?.name || "Seleccionar Pipeline"}
                <SlidersHorizontal className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem 
                  key={pipeline.id} 
                  onClick={() => handlePipelineChange(pipeline)}
                  className={pipeline.id === currentPipeline?.id ? "bg-blue-50 dark:bg-gray-700" : ""}
                >
                  {pipeline.name}
                  {pipeline.is_default && (
                    <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded-full">
                      Por defecto
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      
      <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          className="border-gray-300 dark:border-gray-600"
        >
          <Filter className="h-4 w-4 mr-1" />
          Filtros
        </Button>
        
        <Button 
          onClick={onNewOpportunity} 
          size="sm" 
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <PlusCircle className="h-4 w-4 mr-1" />
          Nueva Oportunidad
        </Button>
        
        <ThemeToggle />
      </div>
    </header>
  );
}
