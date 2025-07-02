"use client";

import { useState, useEffect } from "react";
import { Settings2, PlusCircle, X, Trash2, AlertCircle, Check, ArrowUpCircle, ArrowDownCircle, Edit, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { supabase } from "@/lib/supabase/config";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// No necesitamos el slider
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/utils/Utils";
import { Stage, Pipeline } from "@/types/crm";
import { toast } from "@/components/ui/use-toast";

interface StageFormData {
  id: string;
  name: string;
  position: number;
  probability: number;
  color?: string;
  pipelineId: string;
}

interface StageManagerProps {
  pipeline: Pipeline | null;
  onPipelineChange: (pipeline: Pipeline) => void;
  onStagesUpdate: () => void;
}

export function StageManager({ pipeline, onPipelineChange, onStagesUpdate }: StageManagerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [editingStage, setEditingStage] = useState<StageFormData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { theme } = useTheme();

  const getOrganizationId = () => {
    if (typeof window !== "undefined") {
      const orgData = localStorage.getItem("organizacionActiva");
      if (orgData) {
        try {
          const parsed = JSON.parse(orgData);
          return parsed?.id || null;
        } catch (err) {
          console.error("Error parsing organization data from localStorage", err);
          return null;
        }
      }
    }
    return null;
  };

  // Crear una nueva etapa
  const handleCreateFormSubmit = async (values: StageFormData) => {
    if (!pipeline) return;
    
    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      if (!organizationId) {
        toast({
          title: "Error",
          description: "No se pudo encontrar el ID de la organización",
          variant: "destructive",
        });
        return;
      }

      const newStage = {
        id: values.id || crypto.randomUUID(),
        name: values.name,
        pipeline_id: pipeline.id,
        position: values.position,
        probability: values.probability,
        color: values.color || "#3498db",
        organization_id: organizationId,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("stages").insert(newStage);

      if (error) {
        throw error;
      }

      toast({
        title: "Etapa creada",
        description: `La etapa ${values.name} ha sido creada correctamente.`,
      });
      
      onStagesUpdate();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error al crear etapa:", error);
      toast({
        title: "Error",
        description: "No se pudo crear la etapa. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Actualizar una etapa existente
  const handleEditFormSubmit = async (values: StageFormData) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("stages")
        .update({
          name: values.name,
          position: values.position,
          probability: values.probability,
          color: values.color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", values.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Etapa actualizada",
        description: `La etapa ${values.name} ha sido actualizada correctamente.`,
      });
      
      onStagesUpdate();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error al actualizar etapa:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la etapa. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Borrar una etapa
  const handleDeleteStage = async () => {
    if (!deleteStageId) return;

    setIsLoading(true);
    try {
      // Verificar si hay oportunidades en esta etapa
      const { data: opportunities, error: checkError } = await supabase
        .from("opportunities")
        .select("id")
        .eq("stage_id", deleteStageId);

      if (checkError) throw checkError;

      if (opportunities && opportunities.length > 0) {
        toast({
          title: "No se puede eliminar",
          description: `Esta etapa contiene ${opportunities.length} oportunidades. Muévelas a otra etapa antes de eliminar.`,
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
        setIsLoading(false);
        return;
      }

      const { error } = await supabase
        .from("stages")
        .delete()
        .eq("id", deleteStageId);

      if (error) throw error;

      toast({
        title: "Etapa eliminada",
        description: "La etapa ha sido eliminada correctamente.",
      });
      
      onStagesUpdate();
    } catch (error) {
      console.error("Error al eliminar etapa:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la etapa. Por favor, inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsDeleteDialogOpen(false);
      setDeleteStageId(null);
    }
  };

  // Cambiar el orden de las etapas
  const handleStageReorder = async (stage: Stage, direction: 'up' | 'down') => {
    if (!pipeline || !pipeline.stages) return;
    
    const stageIndex = pipeline.stages.findIndex(s => s.id === stage.id);
    if (stageIndex < 0) return;
    
    // No mover si es la primera y va hacia arriba, o es la última y va hacia abajo
    if ((stageIndex === 0 && direction === "up") || 
        (stageIndex === pipeline.stages.length - 1 && direction === "down")) {
      return;
    }
    
    const swapIndex = direction === "up" ? stageIndex - 1 : stageIndex + 1;
    const currentStage = pipeline.stages[stageIndex];
    const swapStage = pipeline.stages[swapIndex];
    
    // Intercambiar posiciones
    const tempPosition = currentStage.position;
    
    setIsLoading(true);
    try {
      const updates = [
        { id: currentStage.id, position: swapStage.position },
        { id: swapStage.id, position: tempPosition }
      ];
      
      for (const update of updates) {
        const { error } = await supabase
          .from("stages")
          .update({ position: update.position })
          .eq("id", update.id);
          
        if (error) throw error;
      }
      
      // Actualizar localmente para inmediatez
      const newStages = [...pipeline.stages];
      newStages[stageIndex] = { ...newStages[stageIndex], position: swapStage.position };
      newStages[swapIndex] = { ...newStages[swapIndex], position: tempPosition };
      const compareStages = (a: Stage, b: Stage) => {
        return a.position - b.position;
      };    
      newStages.sort(compareStages);
      
      onPipelineChange({
        ...pipeline,
        stages: newStages
      });
      
      toast({
        title: "Posición actualizada",
        description: "El orden de las etapas ha sido actualizado."
      });
    } catch (error) {
      console.error("Error al reordenar etapas:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el orden de las etapas.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Dialog para crear/editar etapa
  const StageFormDialog = () => {
    const [formData, setFormData] = useState<StageFormData>({
      id: "",
      name: "",
      position: 0,
      probability: 0,
      color: "#3498db",
      pipelineId: pipeline?.id || ""
    });

    // Inicializar datos cuando se abre el dialog para editar
    useEffect(() => {
      if (editingStage) {
        setFormData(editingStage);
      } else {
        // Para nueva etapa, calcular la siguiente posición disponible
        if (pipeline && pipeline.stages) {
          const getMaxPosition = (max: number, stage: Stage) => Math.max(max, stage.position);
          const maxPosition = pipeline.stages.reduce(getMaxPosition, 0);
          setFormData({
            id: "",
            name: "",
            position: maxPosition + 10, // Dejamos espacio entre posiciones
            probability: 0,
            color: "#3498db",
            pipelineId: pipeline.id
          });
        }
      }
    }, [editingStage, pipeline, isDialogOpen]);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (editingStage) {
        handleEditFormSubmit(formData);
      } else {
        handleCreateFormSubmit(formData);
      }
    };

    return (
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStage ? "Editar Etapa" : "Nueva Etapa"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la etapa</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ej: Contacto Inicial"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="position">
                  Posición
                </Label>
                <Input
                  id="position"
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={formData.position}
                  onChange={(e) => setFormData({...formData, position: parseInt(e.target.value) || 1})}
                />
                <p className="text-xs text-muted-foreground">
                  Posición determina el orden de las etapas de izquierda a derecha. 
                  Se recomienda dejar espacios entre posiciones (ej: 10, 20, 30...).
                </p>
              </div>
              
              <div className="grid gap-2 mb-4">
                <Label htmlFor="probability">Probabilidad (%)</Label>
                <Input
                  id="probability"
                  type="number"
                  value={formData.probability}
                  min={0}
                  max={100}
                  step={5}
                  onChange={(e) => setFormData({...formData, probability: parseInt(e.target.value)})}
                />
                <div className="text-center text-sm">{formData.probability}%</div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="color">Color (opcional)</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    id="color"
                    value={formData.color}
                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                    className="h-10 w-10 rounded cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">
                    {formData.color}
                  </span>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : editingStage ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  // Si no hay pipeline, no mostrar nada
  if (!pipeline) {
    return null;
  }

  return (
    <Card className={cn("mb-6", theme === "dark" ? "border-gray-800" : "border-gray-200")}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Gestión de Etapas</CardTitle>
            <CardDescription>
              Personaliza las etapas del pipeline según tu proceso de ventas
            </CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingStage(null);
                    setIsDialogOpen(true);
                  }}
                >
                  <PlusCircle className="h-5 w-5 mr-2" />
                  Crear Nueva Etapa
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Crear una nueva etapa en el pipeline</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {pipeline.stages.length === 0 ? (
            <div className="text-center p-4 border rounded-md border-dashed">
              <Settings2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">
                No hay etapas configuradas. Crea la primera etapa de tu pipeline.
              </p>
            </div>
          ) : (
            pipeline.stages
              .sort((a, b) => a.position - b.position)
              .map((stage) => (
                <div
                  key={stage.id}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-md",
                    theme === "dark" ? "bg-gray-900" : "bg-gray-50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: stage.color || "#3498db" }}
                    ></span>
                    <span>{stage.name}</span>
                    <Badge variant="secondary" className="ml-2">
                      {stage.probability}%
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleStageReorder(stage, "up")}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mover arriba</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleStageReorder(stage, "down")}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mover abajo</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingStage({
                                id: stage.id,
                                name: stage.name,
                                position: stage.position,
                                probability: stage.probability,
                                color: stage.color,
                                pipelineId: pipeline.id
                              });
                              setIsDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Editar etapa</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600"
                            onClick={() => {
                              setDeleteStageId(stage.id);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Eliminar etapa</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))
          )}
        </div>
      </CardContent>

      {/* Dialog para crear/editar etapa */}
      <StageFormDialog />

      {/* Dialog de confirmación para eliminar */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la etapa. Las oportunidades en esta etapa deberán moverse primero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteStage}
              disabled={isLoading}
              className="bg-red-500 hover:bg-red-600"
            >
              {isLoading ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
