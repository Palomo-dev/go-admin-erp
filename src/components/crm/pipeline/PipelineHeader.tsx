"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, SlidersHorizontal, Plus, Loader2, LayoutGrid, Users, Trash2 } from "lucide-react";
import CreateOpportunityDialog from "./modals/CreateOpportunityDialog";
import BulkActionsDialog from "./modals/BulkActionsDialog";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { Switch } from "@/components/ui/switch";
import { PIPELINE_TEMPLATES, createPipelineFromTemplate, type PipelineTemplateKey } from "@/lib/services/crm/pipelineTemplates";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/use-toast";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  pipeline_type: string | null;
}

interface PipelineHeaderProps {
  currentPipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
  externalCreateDialogOpen?: boolean;
  onExternalCreateDialogOpenChange?: (open: boolean) => void;
}

export default function PipelineHeader({ 
  currentPipelineId, 
  onPipelineChange,
  externalCreateDialogOpen,
  onExternalCreateDialogOpenChange,
}: PipelineHeaderProps) {
  const router = useRouter();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);
  
  // Estado para crear nuevo pipeline (controlable externamente)
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const isCreatePipelineOpen = externalCreateDialogOpen ?? internalCreateOpen;
  const setIsCreatePipelineOpen = onExternalCreateDialogOpenChange ?? setInternalCreateOpen;
  const [newPipelineName, setNewPipelineName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<PipelineTemplateKey>('blank');
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [createOpportunityOpen, setCreateOpportunityOpen] = useState(false);
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const [deletePipelineOpen, setDeletePipelineOpen] = useState(false);
  const [isDeletingPipeline, setIsDeletingPipeline] = useState(false);
  
  // Cargar los pipelines de la organización cuando tengamos el ID
  useEffect(() => {
    const loadPipelines = async () => {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, is_default, pipeline_type")
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

  // Crear nuevo pipeline desde una plantilla preestablecida
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
      const orgId = typeof organizationId === 'string' ? parseInt(organizationId, 10) : organizationId;

      // Verificar si ya existe un pipeline por defecto
      const { data: existingDefault } = await supabase
        .from("pipelines")
        .select("id")
        .eq("organization_id", orgId)
        .eq("is_default", true)
        .maybeSingle();

      const shouldBeDefault = !existingDefault;

      // Si la plantilla es "blank", crear pipeline vacío (comportamiento original)
      if (selectedTemplate === 'blank') {
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
          throw new Error(pipelineError.message || pipelineError.details || "Error al crear pipeline");
        }

        setPipelines([...pipelines, newPipeline]);
        setCurrentPipeline(newPipeline);
        onPipelineChange(newPipeline.id);

        toast({
          title: "Pipeline creado",
          description: `El pipeline "${newPipelineName}" ha sido creado exitosamente. Configura las etapas desde el gestor de etapas.`,
        });
      } else {
        // Usar plantilla preestablecida (crea pipeline + etapas)
        const pipelineId = await createPipelineFromTemplate(
          supabase,
          orgId,
          selectedTemplate,
          newPipelineName.trim()
        );

        if (!pipelineId) {
          throw new Error("No se pudo crear el pipeline desde la plantilla.");
        }

        // Recargar pipelines desde la BD para incluir el nuevo con sus etapas
        const { data: refreshed } = await supabase
          .from("pipelines")
          .select("id, name, is_default, pipeline_type")
          .eq("organization_id", orgId)
          .order("is_default", { ascending: false });

        if (refreshed && refreshed.length > 0) {
          setPipelines(refreshed);
          const created = refreshed.find((p) => p.id === pipelineId);
          if (created) {
            setCurrentPipeline(created);
            onPipelineChange(created.id);
          }
        }

        const templateLabel = PIPELINE_TEMPLATES.find((t) => t.key === selectedTemplate)?.label || '';
        toast({
          title: "Pipeline creado",
          description: `El pipeline "${newPipelineName}" (${templateLabel}) ha sido creado con sus etapas preestablecidas.`,
        });
      }

      setIsCreatePipelineOpen(false);
      setNewPipelineName("");
      setSelectedTemplate('blank');
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

  // Eliminar pipeline actual con confirmación
  const handleDeletePipeline = async () => {
    if (!currentPipeline || !organizationId) return;
    setIsDeletingPipeline(true);
    try {
      // Verificar si hay oportunidades asociadas
      const { count, error: countError } = await supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", currentPipeline.id);

      if (countError) throw countError;

      if (count && count > 0) {
        toast({
          title: "No se puede eliminar",
          description: `El pipeline tiene ${count} oportunidad(es) asociada(s). Mueve o elimina las oportunidades primero.`,
          variant: "destructive",
        });
        setDeletePipelineOpen(false);
        return;
      }

      // Eliminar etapas del pipeline
      const { error: stagesError } = await supabase
        .from("stages")
        .delete()
        .eq("pipeline_id", currentPipeline.id);

      if (stagesError) throw stagesError;

      // Eliminar el pipeline
      const { error: pipelineError } = await supabase
        .from("pipelines")
        .delete()
        .eq("id", currentPipeline.id);

      if (pipelineError) throw pipelineError;

      // Recargar pipelines y seleccionar otro
      const { data: remaining } = await supabase
        .from("pipelines")
        .select("id, name, is_default, pipeline_type")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false });

      const updatedPipelines = (remaining || []) as Pipeline[];
      setPipelines(updatedPipelines);

      if (updatedPipelines.length > 0) {
        const next = updatedPipelines.find((p) => p.is_default) || updatedPipelines[0];
        setCurrentPipeline(next);
        onPipelineChange(next.id);
      } else {
        setCurrentPipeline(null);
      }

      toast({
        title: "Pipeline eliminado",
        description: `"${currentPipeline.name}" ha sido eliminado correctamente.`,
      });
      setDeletePipelineOpen(false);
    } catch (error: any) {
      console.error("Error al eliminar pipeline:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el pipeline.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingPipeline(false);
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
                    {pipeline.pipeline_type && pipeline.pipeline_type !== 'sales' && (
                      <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium capitalize">
                        {pipeline.pipeline_type === 'onboarding' ? 'Onboarding' :
                         pipeline.pipeline_type === 'renewal' ? 'Renovación' :
                         pipeline.pipeline_type}
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
              {currentPipeline && (
                <DropdownMenuItem
                  onClick={() => setDeletePipelineOpen(true)}
                  className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer font-medium"
                  disabled={currentPipeline.is_default}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Pipeline Actual
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        
        <Button
          onClick={() => setCreateOpportunityOpen(true)}
          size="sm"
          className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm"
        >
          <PlusCircle className="h-5 w-5 mr-2" />
          <span className="hidden sm:inline">Nueva Oportunidad</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
        <Button
          onClick={() => setBulkActionsOpen(true)}
          size="sm"
          variant="outline"
          className="w-full sm:w-auto min-h-[44px] border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium text-sm"
        >
          <Users className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Asignación Masiva</span>
          <span className="sm:hidden">Asignar</span>
        </Button>
      </div>

      <CreateOpportunityDialog
        isOpen={createOpportunityOpen}
        onClose={() => setCreateOpportunityOpen(false)}
        pipelineId={currentPipelineId}
        onSuccess={() => window.dispatchEvent(new Event('refresh-pipeline-data'))}
      />

      <BulkActionsDialog
        isOpen={bulkActionsOpen}
        onClose={() => setBulkActionsOpen(false)}
        pipelineId={currentPipelineId}
        onSuccess={() => {
          onPipelineChange(currentPipelineId);
          window.dispatchEvent(new Event('refresh-pipeline-data'));
        }}
      />
      
      {/* Diálogo para crear nuevo pipeline */}
      <Dialog open={isCreatePipelineOpen} onOpenChange={setIsCreatePipelineOpen}>
        <DialogContent className="sm:max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
              Crear Nuevo Pipeline
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Selector de plantilla preestablecida */}
            <div className="flex flex-col gap-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">
                Plantilla <span className="text-red-600">*</span>
              </Label>
              <div className="grid gap-2">
                {PIPELINE_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplate === tpl.key;
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => setSelectedTemplate(tpl.key)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {tpl.label}
                        </span>
                        {tpl.pipeline_type && tpl.pipeline_type !== 'sales' && (
                          <span className="text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium capitalize">
                            {tpl.pipeline_type === 'onboarding' ? 'Onboarding' :
                             tpl.pipeline_type === 'renewal' ? 'Renovación' :
                             tpl.pipeline_type}
                          </span>
                        )}
                        {tpl.pipeline_type === 'sales' && (
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                            Ventas
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {tpl.description}
                      </p>
                      {tpl.stages.length > 0 && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                          {tpl.stages.length} etapa{tpl.stages.length !== 1 ? 's' : ''}: {tpl.stages.map(s => s.name).join(' → ')}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nombre del pipeline */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pipelineName" className="text-gray-900 dark:text-gray-100 font-medium">
                Nombre del Pipeline <span className="text-red-600">*</span>
              </Label>
              <Input
                id="pipelineName"
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="Ej: Ventas B2B, Onboarding Enterprise, etc."
                className="min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedTemplate === 'blank'
                  ? 'Pipeline vacío. Podrás configurar las etapas desde el gestor de etapas.'
                  : `Se crearán ${PIPELINE_TEMPLATES.find(t => t.key === selectedTemplate)?.stages.length ?? 0} etapas preestablecidas con esta plantilla. Podrás editarlas después.`}
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreatePipelineOpen(false);
                setNewPipelineName("");
                setSelectedTemplate('blank');
              }}
              disabled={isCreatingPipeline}
              className="w-full sm:w-auto min-h-[44px] dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700"
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

      {/* Confirmación para eliminar pipeline */}
      <AlertDialog open={deletePipelineOpen} onOpenChange={setDeletePipelineOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pipeline &ldquo;{currentPipeline?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminarán todas las etapas del pipeline.
              Las oportunidades asociadas deben moverse a otro pipeline antes de eliminar.
              {currentPipeline?.is_default && " No se puede eliminar el pipeline por defecto."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingPipeline}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePipeline}
              disabled={isDeletingPipeline || currentPipeline?.is_default}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeletingPipeline ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
