"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import PipelineHeader from "./PipelineHeader";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { 
  NewOpportunityForm, 
  PipelineTabs, 
  PipelineTabContent, 
  useOrganizationId 
} from "./views";
import PipelineManager from "./PipelineManager";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface PipelineViewCoreProps {}

/**
 * Componente principal del pipeline CRM refactorizado
 * Maneja la lógica de estado y coordina los componentes modulares
 */
export default function PipelineViewCore({}: PipelineViewCoreProps) {
  const [currentPipelineId, setCurrentPipelineId] = useState<string>("");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isNewOpportunityDialogOpen, setIsNewOpportunityDialogOpen] = useState(false);
  const [isCreatePipelineDialogOpen, setIsCreatePipelineDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("kanban");

  // Usar el hook personalizado para obtener el ID de organización
  const organizationId = useOrganizationId();

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

  const handleNewOpportunitySuccess = () => {
    console.log('✅ Oportunidad creada exitosamente, forzando actualización de componentes');
    // Incrementar el refreshTrigger para forzar re-renderizado de todos los componentes
    setRefreshTrigger(prev => prev + 1);
    // Cerrar el diálogo
    setIsNewOpportunityDialogOpen(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header del Pipeline */}
      <PipelineHeader 
        currentPipelineId={currentPipelineId}
        onPipelineChange={handlePipelineChange}
      />
      
      {/* Navegación de Pestañas */}
      <PipelineTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onNewOpportunity={() => setIsNewOpportunityDialogOpen(true)}
        onCreatePipeline={() => setIsCreatePipelineDialogOpen(true)}
      />
      
      {/* Contenido de las Pestañas */}
      <PipelineTabContent
        activeTab={activeTab}
        currentPipelineId={currentPipelineId}
        organizationId={organizationId}
        refreshTrigger={refreshTrigger}
        onPipelineChange={handlePipelineChange}
      />
      
      {/* Diálogo de Nueva Oportunidad */}
      <Dialog open={isNewOpportunityDialogOpen} onOpenChange={setIsNewOpportunityDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {currentPipelineId && organizationId && (
            <NewOpportunityForm 
              onClose={() => setIsNewOpportunityDialogOpen(false)} 
              pipelineId={currentPipelineId}
              organizationId={organizationId}
              onSuccess={handleNewOpportunitySuccess}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de Crear Pipeline */}
      <Dialog open={isCreatePipelineDialogOpen} onOpenChange={setIsCreatePipelineDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          {organizationId && (
            <PipelineManager 
              organizationId={organizationId}
              currentPipelineId={currentPipelineId}
              onPipelineChange={handlePipelineChange}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
