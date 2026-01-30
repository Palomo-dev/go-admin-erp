"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, SlidersHorizontal, Plus, Loader2, LayoutGrid } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
}

interface PipelineHeaderProps {
  currentPipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
}

export default function PipelineHeader({ 
  currentPipelineId, 
  onPipelineChange,
}: PipelineHeaderProps) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  
  // Estado para crear nuevo pipeline
  const [isCreatePipelineOpen, setIsCreatePipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  
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

  // Crear nuevo pipeline
  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim() || !organizationId) {
      toast({
        title: "Error",
        description: "Se requiere nombre del pipeline y organización",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreatingPipeline(true);
    try {
      // Asegurar que organizationId sea un número entero
      const orgId = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId;
      
      // Crear etapas por defecto (probability debe estar entre 0 y 1)
      const defaultStages = [
        { name: "Contacto Inicial", position: 1, probability: 0.10, color: "#3b82f6" },
        { name: "Reunión Agendada", position: 2, probability: 0.30, color: "#8b5cf6" },
        { name: "Propuesta Enviada", position: 3, probability: 0.60, color: "#f59e0b" },
        { name: "Ganado", position: 4, probability: 1.00, color: "#22c55e" },
        { name: "Perdido", position: 5, probability: 0, color: "#ef4444" },
      ];
      
      // Verificar si ya existe un pipeline por defecto
      const { data: existingDefault } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_default", true)
        .maybeSingle();
      
      // Solo marcar como default si no existe ningún pipeline por defecto
      const shouldBeDefault = !existingDefault;
      
      // Crear el pipeline
      const { data: newPipeline, error: pipelineError } = await supabase
        .from("pipelines")
        .insert({
          name: newPipelineName.trim(),
          organization_id: orgId,
          is_default: shouldBeDefault,
        })
        .select()
        .single();
        
      if (pipelineError) {
        console.error("Error detallado pipeline:", JSON.stringify(pipelineError));
        throw new Error(pipelineError.message || pipelineError.details || "Error al crear pipeline");
      }
      
      // Crear las etapas por defecto
      const stagesToInsert = defaultStages.map(stage => ({
        ...stage,
        pipeline_id: newPipeline.id,
      }));
      
      const { error: stagesError } = await supabase
        .from("stages")
        .insert(stagesToInsert);
        
      if (stagesError) {
        console.error("Error al crear etapas:", JSON.stringify(stagesError));
      }
      
      // Actualizar lista de pipelines
      setPipelines([...pipelines, newPipeline]);
      setCurrentPipeline(newPipeline);
      onPipelineChange(newPipeline.id);
      
      toast({
        title: "Pipeline creado",
        description: `El pipeline "${newPipelineName}" ha sido creado exitosamente con etapas por defecto.`,
      });
      
      setIsCreatePipelineOpen(false);
      setNewPipelineName("");
    } catch (error: any) {
      console.error("Error al crear pipeline:", JSON.stringify(error));
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el pipeline. Verifica los permisos.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingPipeline(false);
    }
  };
  
  // Función para cambiar el pipeline por defecto
  const handleSetDefault = async (pipeline: Pipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!organizationId || pipeline.is_default) return;
    
    try {
      // Quitar is_default de todos los pipelines de la organización
      await supabase
        .from("pipelines")
        .update({ is_default: false })
        .eq("organization_id", organizationId);
      
      // Establecer el nuevo pipeline como default
      const { error } = await supabase
        .from("pipelines")
        .update({ is_default: true })
        .eq("id", pipeline.id);
        
      if (error) throw error;
      
      // Actualizar estado local
      setPipelines(pipelines.map(p => ({
        ...p,
        is_default: p.id === pipeline.id
      })));
      
      if (currentPipeline?.id === pipeline.id) {
        setCurrentPipeline({ ...pipeline, is_default: true });
      }
      
      toast({
        title: "Pipeline actualizado",
        description: `"${pipeline.name}" es ahora el pipeline por defecto.`,
      });
    } catch (error: any) {
      console.error("Error al establecer pipeline por defecto:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el pipeline por defecto.",
        variant: "destructive",
      });
    }
  };
  
  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="flex items-center gap-3 w-full sm:w-auto">
        {/* Icono del módulo */}
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <LayoutGrid className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        
        <div className="flex flex-col">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Pipeline CRM
          </h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            CRM / Pipeline
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 w-full sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-h-[40px] text-sm sm:text-base text-blue-600 dark:text-blue-400 bg-transparent hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800 font-medium">
                {currentPipeline?.name || "Seleccionar Pipeline"}
                <SlidersHorizontal className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <DropdownMenuLabel className="text-gray-900 dark:text-gray-100 font-semibold">Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
              {pipelines.map((pipeline) => (
                <div 
                  key={pipeline.id}
                  className={`flex items-center justify-between px-2 py-2 cursor-pointer rounded-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    pipeline.id === currentPipeline?.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                  onClick={() => handlePipelineChange(pipeline)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900 dark:text-gray-100">{pipeline.name}</span>
                    {pipeline.is_default && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                        Por defecto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={pipeline.is_default}
                      onCheckedChange={() => handleSetDefault(pipeline, { stopPropagation: () => {} } as React.MouseEvent)}
                      className="data-[state=checked]:bg-blue-600 scale-75"
                    />
                  </div>
                </div>
              ))}
              <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
              <DropdownMenuItem 
                onClick={() => setIsCreatePipelineOpen(true)}
                className="text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Nuevo Pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        
        <Button 
          onClick={() => router.push(`/app/crm/oportunidades/nuevo?pipeline=${currentPipelineId}`)} 
          size="sm" 
          className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          <span className="hidden sm:inline">Nueva Oportunidad</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>
      
      {/* Diálogo para crear nuevo pipeline */}
      <Dialog open={isCreatePipelineOpen} onOpenChange={setIsCreatePipelineOpen}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
              Crear Nuevo Pipeline
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pipelineName" className="text-gray-900 dark:text-gray-100 font-medium">
                Nombre del Pipeline <span className="text-red-600">*</span>
              </Label>
              <Input
                id="pipelineName"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="Ej: Ventas B2B, Marketing, etc."
                className="min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Se crearán etapas por defecto: Contacto Inicial, Reunión Agendada, Propuesta Enviada, Ganado y Perdido.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsCreatePipelineOpen(false);
                setNewPipelineName("");
              }} 
              disabled={isCreatingPipeline}
              className="w-full sm:w-auto min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreatePipeline} 
              disabled={isCreatingPipeline || !newPipelineName.trim()}
              className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700"
            >
              {isCreatingPipeline ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Pipeline
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
