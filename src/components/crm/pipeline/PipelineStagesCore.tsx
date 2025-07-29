"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase/config";
import { toast } from "@/components/ui/use-toast";
import { Plus } from "lucide-react";

// Componentes modulares extraídos
import { StageColumn, StageManagementDialogs, KanbanDragDropProvider } from "./kanban";

interface Stage {
  id: string;
  name: string;
  color?: string;
  description?: string;
  position: number;
  pipeline_id: string;
  probability?: number;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
}

interface Opportunity {
  id: string;
  name: string;
  stage_id: string;
  customer_id: string;
  amount: number;
  expected_close_date: string;
  customer: Customer;
  customers?: Customer[];
  status?: string;
  currency?: string;
}

interface PipelineStagesCoreProps {
  pipelineId: string;
}

export default function PipelineStagesCore({ pipelineId }: PipelineStagesCoreProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastKanbanUpdate, setLastKanbanUpdate] = useState<string>('');
  
  // Estados para diálogos de gestión de etapas
  const [configStage, setConfigStage] = useState<Stage | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageProbability, setStageProbability] = useState<number | null>(null);
  const [stageColor, setStageColor] = useState("#3b82f6");
  const [stageDescription, setStageDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para eliminación de etapas
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Estados para creación de etapas
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageProbability, setNewStageProbability] = useState<number | null>(null);
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [newStageDescription, setNewStageDescription] = useState("");

  // Obtener ID de la organización y el usuario
  useEffect(() => {
    const getOrganizationId = () => {
      const storedOrg = localStorage.getItem('selectedOrganization');
      if (storedOrg) {
        try {
          const orgData = JSON.parse(storedOrg);
          const orgId = String(orgData.id);
          setOrganizationId(orgId);
          console.log(`Organización guardada correctamente: ${orgId}`);
        } catch (error) {
          console.error('Error al parsear la organización:', error);
          setOrganizationId('2'); // Fallback
        }
      } else {
        setOrganizationId('2'); // Fallback
      }
    };

    getOrganizationId();
  }, []);

  // Obtener ID del usuario autenticado
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error al obtener usuario:', error.message);
          return;
        }
        
        if (user) {
          console.log('Usuario autenticado:', user.email);
          setUserId(user.id);
        } else {
          console.warn('No se pudo obtener el usuario autenticado');
        }
      } catch (err) {
        console.error('Error inesperado al obtener usuario:', err);
      }
    };
    
    getUser();
  }, []);

  // Función para cargar las etapas del pipeline
  const loadStages = useCallback(async () => {
    if (!pipelineId) {
      console.error('ID de pipeline no definido');
      return;
    }

    try {
      console.log('Cargando etapas para pipeline ID:', pipelineId);
      setLoading(true);
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position, pipeline_id, probability, color, description')
        .eq('pipeline_id', pipelineId)
        .order('position');

      if (error) {
        console.error('Error al cargar etapas:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.log('No se encontraron etapas para el pipeline', pipelineId);
        return;
      }

      console.log(`Etapas cargadas: ${data.length}`);
      setStages(data);
    } catch (error) {
      console.error('Error inesperado al cargar etapas:', error);
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  // Función para cargar las oportunidades
  const loadOpportunities = useCallback(async () => {
    if (!pipelineId || !organizationId) {
      console.log('Faltan datos para cargar oportunidades:', { pipelineId, organizationId });
      return;
    }

    try {
      console.log('Cargando oportunidades para pipeline:', pipelineId);
      const { data, error } = await supabase
        .from('opportunities')
        .select(`
          id, name, stage_id, customer_id, amount, expected_close_date, status, currency,
          customers:customer_id (
            id, full_name, email
          )
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al cargar oportunidades:', error);
        return;
      }

      // Filtrar oportunidades que pertenecen a etapas de este pipeline
      const stageIds = stages.map(stage => stage.id);
      const filteredOpportunities = data?.filter(opp => stageIds.includes(opp.stage_id)) || [];

      // Transformar datos para compatibilidad
      const transformedOpportunities = filteredOpportunities.map(opp => ({
        ...opp,
        customer: Array.isArray(opp.customers) ? opp.customers[0] : opp.customers
      }));

      console.log(`Oportunidades cargadas: ${transformedOpportunities.length}`);
      setOpportunities(transformedOpportunities);
    } catch (error) {
      console.error('Error inesperado al cargar oportunidades:', error);
    }
  }, [pipelineId, organizationId, stages]);

  // Cargar datos iniciales
  useEffect(() => {
    loadStages();
  }, [loadStages]);

  useEffect(() => {
    if (stages.length > 0) {
      loadOpportunities();
    }
  }, [loadOpportunities, stages]);

  // Listener para eventos de actualización del Kanban
  useEffect(() => {
    const handleKanbanUpdate = (event: CustomEvent) => {
      if (event.detail.pipelineId === pipelineId) {
        console.log('🔄 Recibido evento de actualización del Kanban');
        setLastKanbanUpdate(new Date().toISOString());
        loadOpportunities();
        if (event.detail.data?.stage_id) {
          loadStages();
        }
      }
    };

    window.addEventListener('kanbanUpdate', handleKanbanUpdate as EventListener);
    return () => window.removeEventListener('kanbanUpdate', handleKanbanUpdate as EventListener);
  }, [pipelineId, loadOpportunities, loadStages]);

  // Función para calcular el valor de una etapa
  const calculateStageValue = useCallback((stageId: string) => {
    const stageOpportunities = opportunities.filter(opp => opp.stage_id === stageId);
    const stage = stages.find(s => s.id === stageId);
    const probability = (stage?.probability || 50) / 100;
    
    return stageOpportunities.reduce((total, opp) => {
      return total + (opp.amount * probability);
    }, 0);
  }, [opportunities, stages]);

  // Handlers para gestión de etapas
  const handleConfigStage = (stage: Stage) => {
    setConfigStage(stage);
    setStageName(stage.name);
    setStageProbability(stage.probability || null);
    setStageColor(stage.color || "#3b82f6");
    setStageDescription(stage.description || "");
    setIsConfigOpen(true);
  };

  const handleDeleteStage = async (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return;

    // Verificar si hay oportunidades asociadas
    const associatedOpportunities = opportunities.filter(opp => opp.stage_id === stageId);
    if (associatedOpportunities.length > 0) {
      toast({
        title: "No se puede eliminar",
        description: `Esta etapa tiene ${associatedOpportunities.length} oportunidad(es) asociada(s). Mueve las oportunidades a otra etapa antes de eliminar.`,
        variant: "destructive",
      });
      return;
    }

    setStageToDelete(stage);
    setIsDeleteOpen(true);
  };

  const handleCreateStage = () => {
    setNewStageName("");
    setNewStageProbability(null);
    setNewStageColor("#3b82f6");
    setNewStageDescription("");
    setIsCreateOpen(true);
  };

  const handleSaveStage = async () => {
    if (!configStage || !stageName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etapa es requerido",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('stages')
        .update({
          name: stageName.trim(),
          probability: stageProbability,
          color: stageColor,
          description: stageDescription.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', configStage.id);

      if (error) throw error;

      toast({
        title: "Etapa actualizada",
        description: "Los cambios han sido guardados correctamente.",
      });

      setIsConfigOpen(false);
      loadStages();
    } catch (error: any) {
      console.error('Error al actualizar etapa:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la etapa",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNewStage = async () => {
    if (!newStageName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etapa es requerido",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const nextPosition = Math.max(...stages.map(s => s.position), 0) + 1;
      
      const { error } = await supabase
        .from('stages')
        .insert({
          name: newStageName.trim(),
          pipeline_id: pipelineId,
          position: nextPosition,
          probability: newStageProbability,
          color: newStageColor,
          description: newStageDescription.trim() || null,
          organization_id: parseInt(organizationId || '2')
        });

      if (error) throw error;

      toast({
        title: "Etapa creada",
        description: "La nueva etapa ha sido creada exitosamente.",
      });

      setIsCreateOpen(false);
      loadStages();
    } catch (error: any) {
      console.error('Error al crear etapa:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la etapa",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!stageToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('stages')
        .delete()
        .eq('id', stageToDelete.id);

      if (error) throw error;

      toast({
        title: "Etapa eliminada",
        description: "La etapa ha sido eliminada correctamente.",
      });

      setIsDeleteOpen(false);
      setStageToDelete(null);
      loadStages();
    } catch (error: any) {
      console.error('Error al eliminar etapa:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la etapa",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-72">
            <Skeleton className="h-64 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <KanbanDragDropProvider
      stages={stages}
      opportunities={opportunities}
      organizationId={organizationId}
      userId={userId}
      onOpportunitiesUpdate={setOpportunities}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            opportunities={opportunities}
            onConfigStage={handleConfigStage}
            onDeleteStage={handleDeleteStage}
            calculateStageValue={calculateStageValue}
          />
        ))}
        
        {/* Botón para crear nueva etapa */}
        <div className="flex-shrink-0 w-72">
          <Button
            onClick={handleCreateStage}
            variant="outline"
            className="w-full h-32 border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 bg-blue-50/50 dark:bg-blue-950/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200 flex flex-col items-center justify-center gap-2"
          >
            <Plus className="h-6 w-6" />
            <span className="font-medium">Crear nueva etapa</span>
          </Button>
        </div>
      </div>

      {/* Diálogos de gestión de etapas */}
      <StageManagementDialogs
        // Estados de diálogos
        isConfigOpen={isConfigOpen}
        isCreateOpen={isCreateOpen}
        isDeleteOpen={isDeleteOpen}
        
        // Estados de carga
        isSaving={isSaving}
        isCreating={isCreating}
        isDeleting={isDeleting}
        
        // Datos de configuración de etapa
        configStage={configStage}
        stageName={stageName}
        stageProbability={stageProbability}
        stageColor={stageColor}
        stageDescription={stageDescription}
        
        // Datos de nueva etapa
        newStageName={newStageName}
        newStageProbability={newStageProbability}
        newStageColor={newStageColor}
        newStageDescription={newStageDescription}
        
        // Etapa a eliminar
        stageToDelete={stageToDelete}
        
        // Handlers de estado
        setStageName={setStageName}
        setStageProbability={setStageProbability}
        setStageColor={setStageColor}
        setStageDescription={setStageDescription}
        setNewStageName={setNewStageName}
        setNewStageProbability={setNewStageProbability}
        setNewStageColor={setNewStageColor}
        setNewStageDescription={setNewStageDescription}
        
        // Handlers de diálogos
        setIsConfigOpen={setIsConfigOpen}
        setIsCreateOpen={setIsCreateOpen}
        setIsDeleteOpen={setIsDeleteOpen}
        
        // Handlers de acciones
        onSaveStage={handleSaveStage}
        onSaveNewStage={handleSaveNewStage}
        onConfirmDelete={handleConfirmDelete}
      />
    </KanbanDragDropProvider>
  );
}
