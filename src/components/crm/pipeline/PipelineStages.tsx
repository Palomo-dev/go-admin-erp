"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/config";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/utils/Utils";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { BarChart3, Calendar, DollarSign, Loader2, Plus } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { translateOpportunityStatus } from '@/utils/crmTranslations';

interface Stage {
  id: string;
  name: string;
  color?: string;
  description?: string;
  position: number;
  pipeline_id: string;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  // Eliminamos company ya que no existe en la tabla customers
}

interface Opportunity {
  id: string;
  name: string; // La tabla usa 'name' en lugar de 'title'
  stage_id: string;
  customer_id: string;
  amount: number; // La tabla usa 'amount' en lugar de 'value'
  expected_close_date: string;
  customer: Customer;
  customers?: Customer[];
  status?: string;
  currency?: string;
}

interface PipelineStagesProps {
  pipelineId: string;
}

export default function PipelineStages({ pipelineId }: PipelineStagesProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Estado para el diálogo de configuración de etapas
  const [configStage, setConfigStage] = useState<any>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageProbability, setStageProbability] = useState<number | null>(null);
  const [stageColor, setStageColor] = useState("#3b82f6");
  const [stageDescription, setStageDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  
  // Estado para el diálogo de eliminación de etapas
  const [deleteStageId, setDeleteStageId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Estado para el diálogo de creación de etapas
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [newStageProbability, setNewStageProbability] = useState<number | null>(null);
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [newStageDescription, setNewStageDescription] = useState("");

  // Obtener ID de la organización y el usuario
  useEffect(() => {
    // Obtener ID de la organización desde localStorage
    const storedOrg = localStorage.getItem('selectedOrganization');
    if (storedOrg) {
      try {
        const orgData = JSON.parse(storedOrg);
        // Asegurar que el ID de organización se maneje como string
        const orgId = String(orgData.id);
        setOrganizationId(orgId);
        console.log(`Organización guardada correctamente: ${orgId}`);
      } catch (error) {
        console.error('Error al parsear la organización:', error);
        // Si hay error, buscar en otras claves
        findOrganizationId();
      }
    } else {
      // Si no está en selectedOrganization, buscar en otras claves
      findOrganizationId();
    }
  }, []);

  // Función para buscar el ID de la organización en otras claves
  const findOrganizationId = () => {
    let foundOrgId = false;
    
    // Posibles claves donde podría estar guardado el organizationId
    const possibleKeys = [
      'currentOrganizationId',
      'organizationId',
      'organization_id',
      'orgId',
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        try {
          // Intentar convertir a string si es un JSON o asegurar que sea string
          let orgIdValue = orgId;
          // Si parece ser JSON, intentar parsearlo
          if (orgId.startsWith('{') || orgId.startsWith('[')) {
            const parsed = JSON.parse(orgId);
            orgIdValue = parsed.id ? String(parsed.id) : String(parsed);
          }
          
          console.log(`Organización encontrada en localStorage con clave: ${key}`);
          setOrganizationId(String(orgIdValue));
          console.log(`Organización guardada correctamente: ${orgIdValue}`);
          foundOrgId = true;
          break;
        } catch (error) {
          console.error('Error al procesar el ID de organización:', error);
        }
      }
    }
    
    // Si no se encuentra en ninguna clave, usar null (la app manejará este caso)
    if (!foundOrgId) {
      console.log('No se encontró ID de organización en localStorage');
      setOrganizationId(null);
    }
  }

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
  const loadStages = async () => {
    if (!pipelineId) {
      console.error('ID de pipeline no definido');
      return;
    }

    try {
      console.log('Cargando etapas para pipeline ID:', pipelineId);
      setLoading(true);
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position, pipeline_id, probability')
        .eq('pipeline_id', pipelineId)
        .order('position');

      if (error) {
        console.error('Error al cargar etapas:', error);
        return;
      }

      // Verificar si se encontraron etapas
      if (!data || data.length === 0) {
        console.log('No se encontraron etapas para el pipeline', pipelineId);
        return;
      }

      console.log('Etapas cargadas:', data.length);
      
      // Asegurarse de que todos los datos tengan el pipeline_id
      const stagesWithPipelineId = data.map((stage) => ({ 
        ...stage, 
        pipeline_id: stage.pipeline_id || pipelineId 
      }));

      setStages(stagesWithPipelineId);
    } catch (err) {
      console.error('Error al cargar etapas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Función para cargar las oportunidades (con useCallback para evitar bucles infinitos)
  const loadOpportunities = useCallback(async () => {
    if (!pipelineId) {
      console.error('ID de pipeline no definido para cargar oportunidades');
      return;
    }

    try {
      console.log('Cargando oportunidades para pipeline ID:', pipelineId);
      // Validar que organizationId sea un UUID válido
      if (organizationId && !isValidUUID(organizationId)) {
        console.warn('ID de organización no es un UUID válido:', organizationId);
      }
      setLoading(true);
      
      // Construir la consulta base
      let query = supabase
        .from('opportunities')
        .select(`
          id, name, stage_id, customer_id, amount, currency, expected_close_date, status,
          customer:customers!customer_id(id, full_name, email)
        `)
        .eq('pipeline_id', pipelineId)
        .in('status', ['open', 'won', 'lost']) // Mostrar todas las oportunidades (abiertas, ganadas y perdidas)
        .order('updated_at', { ascending: false });
        
      // Agregar filtro de organización solo si está disponible
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error('Error al cargar oportunidades:', error);
        return;
      }

      // Verificar si se encontraron oportunidades
      if (!data || data.length === 0) {
        console.log('No se encontraron oportunidades para el pipeline', pipelineId);
        // Verificar si hay oportunidades sin filtrar por estado
        const { data: allOpps, error: allOppsError } = await supabase
          .from('opportunities')
          .select('id, status')
          .eq('pipeline_id', pipelineId);
          
        if (!allOppsError && allOpps && allOpps.length > 0) {
          console.log(`Se encontraron ${allOpps.length} oportunidades totales (incluyendo no abiertas)`);
          console.log('Estados:', allOpps.map(o => o.status).filter((v, i, a) => a.indexOf(v) === i));
        }
        return;
      }

      console.log('Oportunidades cargadas:', data.length);
      
      // Las oportunidades ya vienen con el objeto customer desde Supabase
      const formattedOpps = data.map((opp: any) => {
        // Si no hay datos del cliente, proporcionamos un valor predeterminado
        if (!opp.customer) {
          return {
            ...opp,
            customer: { id: opp.customer_id, full_name: "Cliente sin nombre" }
          };
        }
        return opp;
      });

      setOpportunities(formattedOpps);
    } catch (err) {
      console.error('Error al cargar oportunidades:', err);
    } finally {
      setLoading(false);
    }
  }, [pipelineId, organizationId]);

  // Cargar datos iniciales cuando el componente se monta
  useEffect(() => {
    if (pipelineId) {
      console.log('Iniciando carga de datos para pipeline:', pipelineId);
      loadStages();
      loadOpportunities();
    } else {
      console.error('No se puede cargar datos: pipelineId no está definido');
    }
  }, [pipelineId, organizationId, loadOpportunities]);

  // Escuchar el evento para recargar datos cuando se crea una nueva oportunidad
  useEffect(() => {    
    const handleRefresh = () => {
      console.log('Recargando datos del pipeline después de nueva oportunidad');
      loadOpportunities();
    };
    
    window.addEventListener('refresh-pipeline-data', handleRefresh);
    
    // Eliminar el listener al desmontar
    return () => {
      window.removeEventListener('refresh-pipeline-data', handleRefresh);
    };
  }, [loadOpportunities]);

  // Filtrar las oportunidades por etapa
  const getOpportunitiesByStage = (stageId: string) => {
    return opportunities.filter((opportunity) => opportunity.stage_id === stageId);
  };

  // Calcular el valor total de las oportunidades en una etapa
  const calculateStageValue = (stageId: string): number => {
    const stageOpportunities = getOpportunitiesByStage(stageId);
    return stageOpportunities.reduce((total: number, opp: any) => {
      // Calcular el valor usando el campo amount
      const weightedValue = opp.amount || 0; 
      return total + weightedValue;
    }, 0);
  };
  
  // Función para manejar la configuración de etapas
  const handleConfigStage = (stageToEdit: any) => {
    setConfigStage(stageToEdit);
    setStageName(stageToEdit.name || "");
    setStageProbability(stageToEdit.probability || null);
    setStageColor(stageToEdit.color || "#3b82f6"); // Color predeterminado azul
    setStageDescription(stageToEdit.description || "");
    setIsConfigOpen(true);
  };

  // Función para manejar la eliminación de etapas
  const handleDeleteStage = (stageId: string) => {
    setDeleteStageId(stageId);
    setIsDeleteDialogOpen(true);
  };

  // Función para confirmar la eliminación de etapa
  const confirmDeleteStage = async () => {
    if (!deleteStageId) return;
    
    setIsDeleting(true);
    
    try {
      // Verificar si hay oportunidades asociadas a esta etapa
      const { data: opportunitiesData, error: opportunitiesError } = await supabase
        .from("opportunities")
        .select("id")
        .eq("stage_id", deleteStageId);
      
      if (opportunitiesError) {
        console.error("Error al verificar oportunidades:", opportunitiesError);
        toast({
          title: "Error",
          description: "No se pudo verificar las oportunidades asociadas",
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }
      
      // Si hay oportunidades asociadas, no permitir eliminación
      if (opportunitiesData && opportunitiesData.length > 0) {
        toast({
          title: "No se puede eliminar",
          description: `Esta etapa tiene ${opportunitiesData.length} oportunidad(es) asociada(s). Mueva las oportunidades a otra etapa antes de eliminar.`,
          variant: "destructive",
        });
        setIsDeleteDialogOpen(false);
        setIsDeleting(false);
        return;
      }
      
      // Eliminar la etapa
      const { error } = await supabase
        .from("stages")
        .delete()
        .eq("id", deleteStageId);
      
      if (error) {
        console.error("Error al eliminar etapa:", error);
        toast({
          title: "Error",
          description: "No se pudo eliminar la etapa",
          variant: "destructive",
        });
        setIsDeleting(false);
        return;
      }
      
      // Actualizar la lista de etapas localmente
      setStages(prevStages => prevStages.filter(stage => stage.id !== deleteStageId));
      
      toast({
        title: "Etapa eliminada",
        description: "La etapa ha sido eliminada correctamente",
      });
      
      setIsDeleteDialogOpen(false);
      setDeleteStageId(null);
      
    } catch (error) {
      console.error("Error inesperado al eliminar etapa:", error);
      toast({
        title: "Error",
        description: "Error inesperado al eliminar la etapa",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Función para validar UUID
  const isValidUUID = (uuid: string) => {
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(uuid);
  };

  // Función para abrir el diálogo de crear etapa
  const handleCreateStage = () => {
    // Limpiar el formulario
    setNewStageName("");
    setNewStageProbability(null);
    setNewStageColor("#3b82f6");
    setNewStageDescription("");
    setIsCreateOpen(true);
  };

  // Función para crear una nueva etapa
  const handleSaveNewStage = async () => {
    if (!newStageName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etapa es requerido",
        variant: "destructive",
      });
      return;
    }

    if (!pipelineId) {
      toast({
        title: "Error",
        description: "No se pudo obtener el ID del pipeline",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      // Obtener la siguiente posición
      const nextPosition = Math.max(...stages.map(s => s.position), 0) + 1;
      
      // Debug: Mostrar los datos que se van a insertar
      // Convertir probabilidad a formato decimal si existe
      const probabilityValue = newStageProbability ? newStageProbability / 100 : null;
      
      const insertData = {
        name: newStageName.trim(),
        color: newStageColor,
        description: newStageDescription ? newStageDescription.trim() : null,
        position: nextPosition,
        pipeline_id: pipelineId,
        probability: probabilityValue
      };
      
      console.log('Datos a insertar en stages:', insertData);
      
      const { data, error } = await supabase
        .from('stages')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error completo al crear etapa:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        toast({
          title: "Error",
          description: `Error al crear la etapa: ${error.message || 'Error desconocido'}`,
          variant: "destructive",
        });
        return;
      }

      // Actualizar el estado local
      const newStage: Stage = {
        id: data.id,
        name: data.name,
        color: data.color,
        description: data.description,
        position: data.position,
        pipeline_id: data.pipeline_id
      };

      setStages(prevStages => [...prevStages, newStage]);
      
      toast({
        title: "Éxito",
        description: "Etapa creada exitosamente",
      });
      
      // Cerrar el diálogo
      setIsCreateOpen(false);
      
    } catch (error) {
      console.error("Error inesperado al crear etapa:", error);
      toast({
        title: "Error",
        description: "Error inesperado al crear la etapa",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Función para guardar los cambios de la etapa
  const handleSaveStage = async () => {
    if (!configStage) return;
    setIsSaving(true);

    // Validar campos requeridos
    if (!stageName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etapa es obligatorio",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    if (!organizationId) {
      toast({
        title: "Error",
        description: "No se pudo determinar la organización actual",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    if (!userId) {
      toast({
        title: "Error",
        description: "No se pudo determinar el usuario actual",
        variant: "destructive",
      });
      setIsSaving(false);
      return;
    }

    try {
      // Verificar que el usuario pertenece a la organización
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError || !memberData) {
        console.error('Error de verificación de permisos:', memberError);
        toast({
          title: "Error de permisos",
          description: "No tienes permisos para editar etapas en esta organización",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      // Verificar que el pipeline pertenece a la organización correcta
      const { data: pipelineData, error: pipelineError } = await supabase
        .from('pipelines')
        .select('organization_id')
        .eq('id', configStage.pipeline_id)
        .maybeSingle();

      if (pipelineError) {
        console.error('Error al verificar el pipeline:', pipelineError);
        toast({
          title: "Error de acceso",
          description: "No se pudo verificar los permisos de la etapa",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      if (!pipelineData) {
        toast({
          title: "Error de acceso",
          description: "No se encontró el pipeline asociado a esta etapa",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      // Convertir ambos a String para comparar
      const dbOrgId = String(pipelineData.organization_id);
      const currentOrgId = String(organizationId);

      if (dbOrgId !== currentOrgId) {
        console.error(`Error de acceso: organización no coincide (DB: ${dbOrgId}, Current: ${currentOrgId})`);
        toast({
          title: "Error de acceso",
          description: "No tienes permisos para modificar etapas en este pipeline",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      // Convertir la probabilidad a formato numérico para la BD
      let probabilityValue = null;
      if (stageProbability !== null && stageProbability !== undefined) {
        probabilityValue = stageProbability / 100;
      }

      // Preparar los datos a actualizar
      const updateData = {
        name: stageName.trim(),
        probability: probabilityValue,
        color: stageColor || "#3b82f6", // Asegurar que siempre haya un color
        description: stageDescription ? stageDescription.trim() : null,
        updated_at: new Date().toISOString()
      };
      
      // Preparar datos para actualización
      
      // Validar que el ID de la etapa sea un UUID válido
      if (!isValidUUID(configStage.id)) {
        console.error('ID de etapa inválido, no es un UUID');
        toast({
          title: "Error",
          description: "El identificador de la etapa no es válido",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
      
      // Validar que el pipeline_id también sea un UUID válido
      if (!isValidUUID(configStage.pipeline_id)) {
        console.error('ID de pipeline inválido, no es un UUID');
        toast({
          title: "Error",
          description: "El identificador del pipeline no es válido",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
      
      // Usar la función RPC mejorada que desactiva temporalmente los triggers
      console.log('Intentando actualizar etapa desactivando triggers:', {
        id: configStage.id,
        name: updateData.name,
        color: updateData.color
      });
      
      const { data, error } = await supabase
        .rpc('update_stage_without_triggers', {
          p_stage_id: configStage.id,
          p_name: updateData.name,
          p_color: updateData.color,
          p_description: updateData.description,
          p_probability: updateData.probability
        });
        
      if (error) {
        console.error('Error al actualizar etapa:', error.message);
        toast({
          title: "Error",
          description: `No se pudo actualizar la etapa: ${error.message || 'Error desconocido'}`,
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
      
      if (!data || data.length === 0) {
        console.error('Respuesta vacía de Supabase');
        toast({
          title: "Error",
          description: "No se pudo actualizar la etapa: No se recibieron datos de respuesta",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }
      
      // Actualizar localmente
      setStages(prevStages => 
        prevStages.map(s => 
          s.id === configStage.id ? 
          { 
            ...s, 
            name: updateData.name,
            probability: updateData.probability,
            color: updateData.color,
            description: updateData.description || undefined
          } : 
          s
        )
      );
      
      // Mostrar mensaje de éxito
      toast({
        title: "Éxito",
        description: "La etapa se ha actualizado correctamente",
      });
      
      // Cerrar el diálogo
      setIsConfigOpen(false);
    } catch (error) {
      console.error('Error al actualizar la etapa:', error);
      toast({
        title: "Error al guardar",
        description: "No se pudo actualizar la etapa",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calcular el valor total del pipeline completo
  const totalPipelineValue = useMemo(() => {
    return opportunities.reduce((total, opp) => total + (opp.amount || 0), 0);
  }, [opportunities]);

  // Calcular el valor ponderado total del pipeline (considerando probabilidades)
  const weightedPipelineValue = useMemo(() => {
    return opportunities.reduce((total, opp) => {
      const weightedValue = opp.amount; // Ya no usamos probability
      return total + weightedValue;
    }, 0);
  }, [opportunities]);

  // Manejar el arrastre y soltar de oportunidades entre etapas
  const handleDragEnd = async (result: any) => {
    if (!result.destination) {
      console.log('Drag cancelado: no hay destino');
      return;
    }

    const { draggableId, source, destination } = result;

    // Si la oportunidad se soltó en la misma etapa, no hacemos nada
    if (source.droppableId === destination.droppableId) {
      console.log('Misma etapa: no es necesario actualizar');
      return;
    }

    console.log(`Moviendo oportunidad ${draggableId} de etapa ${source.droppableId} a ${destination.droppableId}`);

    // Obtener el ID de la oportunidad y las etapas de origen y destino
    const opportunityId = draggableId;
    const fromStageId = source.droppableId;
    const toStageId = destination.droppableId;

    // Encontrar la oportunidad que se movió
    const movedOpportunity = opportunities.find((opp) => opp.id === opportunityId);
    if (!movedOpportunity) {
      console.error('No se encontró la oportunidad:', opportunityId);
      toast({
        title: "Error",
        description: "No se encontró la oportunidad",
        variant: "destructive"
      });
      return;
    }

    // Encontrar información de las etapas
    const fromStage = stages.find((stage) => stage.id === fromStageId);
    const toStage = stages.find((stage) => stage.id === toStageId);

    if (!fromStage || !toStage) {
      console.error('No se encontraron las etapas de origen o destino');
      toast({
        title: "Error",
        description: "No se encontraron las etapas",
        variant: "destructive"
      });
      return;
    }

    console.log(`Moviendo de "${fromStage.name}" a "${toStage.name}"`);

    // Determinar el nuevo estado basado en el nombre de la etapa destino
    let newStatus = movedOpportunity.status || 'open';
    
    // Actualizar estado según el nombre de la etapa
    if (toStage.name === "Ganado") {
      newStatus = "won";
    } else if (toStage.name === "Perdido") {
      newStatus = "lost";
    } else if ((movedOpportunity.status === "won" || movedOpportunity.status === "lost") && 
               toStage.name !== "Ganado" && toStage.name !== "Perdido") {
      // Si va de ganado/perdido a una etapa normal, vuelve a estado abierto
      newStatus = "open";
    }

    // Actualizar localmente para una respuesta inmediata en la UI
    setOpportunities((prevOpps) =>
      prevOpps.map((opp) => {
        if (opp.id === opportunityId) {
          return { ...opp, stage_id: toStageId, status: newStatus };
        }
        return opp;
      })
    );

    try {
      // Usar la nueva función SQL que devuelve JSON con información detallada
      console.log(`Actualizando oportunidad ${opportunityId} a etapa ${toStageId} con estado ${newStatus}`);
      toast({
        title: "Actualizando",
        description: "Guardando cambios...",
      });
      
      // Llamada a la función SQL con SECURITY DEFINER
      const { data, error } = await supabase.rpc('direct_update_opportunity', {
        p_opportunity_id: opportunityId,
        p_stage_id: toStageId,
        p_status: newStatus
      });
      
      // Manejo de errores explícitos de Supabase
      if (error) {
        console.error('Error explícito de Supabase:', error);
        toast({
          title: "Error de servidor",
          description: error.message || "Error al comunicarse con el servidor",
          variant: "destructive",
        });
        throw error;
      }
      
      // Verificar la respuesta detallada de la función SQL
      console.log('Respuesta de la actualización:', data);
      
      if (!data || data.success === false) {
        console.warn('Error detallado de la actualización:', data?.message, data?.error_code);
        toast({
          title: "No se pudo actualizar",
          description: data?.message || "Error al actualizar la oportunidad",
          variant: "destructive",
        });
        throw new Error(data?.message || "Error desconocido al actualizar");
      }
      
      // Notificar éxito
      toast({
        title: "Actualizado",
        description: "La oportunidad se movió correctamente",
      });
      
      console.log('Actualización exitosa a etapa', toStageId, 'con estado', newStatus);
    } catch (error: any) {
      console.error("Error al actualizar la oportunidad:", error);
      toast({
        title: "Error",
        description: `No se pudo actualizar la oportunidad: ${error.message || "Error desconocido"}`,
        variant: "destructive",
      });
      
      // Revertir el cambio local en caso de error
      setOpportunities((prevOpps) =>
        prevOpps.map((opp) => (
          opp.id === opportunityId ? 
          { ...opp, stage_id: fromStageId, status: movedOpportunity.status } : 
          opp
        ))
      );
      return;
    }

    // Intentar ejecutar automatizaciones (tareas, notificaciones, etc.)
    try {
      // Obtener organizationId y userId del localStorage si no están disponibles
      const orgId = organizationId || (localStorage.getItem('selectedOrganization') ? 
        JSON.parse(localStorage.getItem('selectedOrganization') || '{}').id : 
        null);
        
      const usrId = userId || (await supabase.auth.getUser()).data.user?.id || null;
      
      if (orgId && usrId) {
        console.log('Ejecutando automatizaciones por cambio de etapa');
        await handleStageChangeAutomation({
          opportunityId: movedOpportunity.id,
          opportunityTitle: movedOpportunity.name,
          customerId: movedOpportunity.customer_id,
          customerName: movedOpportunity.customer?.full_name || 'Cliente',
          stageId: destination.droppableId,
          stageName: toStage.name,
          fromStageId: fromStageId,
          toStageId: toStageId,
          userId: usrId,
          pipelineId: pipelineId,
          organizationId: orgId
        });
      }
    } catch (error) {
      console.error("Error al ejecutar automatizaciones:", error);
      // No mostramos toast aquí para no sobrecargar al usuario con mensajes
      // Las automatizaciones no son críticas para la operación principal
    }
  };

  // Mostrar esqueletos mientras se cargan los datos
  if (loading) {
    return (
      <div className="flex flex-wrap gap-6 p-6 overflow-x-auto bg-white/5 dark:bg-black/5 rounded-lg">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-blue-100 dark:border-blue-900">
            <Skeleton className="h-10 w-full mb-4 bg-blue-100 dark:bg-blue-900/30" />
            <div className="px-3 py-2 mb-3 bg-blue-50 dark:bg-blue-900/20 rounded">
              <Skeleton className="h-6 w-full bg-blue-100 dark:bg-blue-900/30" />
            </div>
            <Skeleton className="h-24 w-full mb-2 bg-blue-100 dark:bg-blue-900/30" />
            <Skeleton className="h-24 w-full bg-blue-100 dark:bg-blue-900/30" />
          </div>
        ))}
      </div>
    );
  }
  
  // Mostrar mensaje si no hay etapas
  if (!stages || stages.length === 0) {
    return (
      <>
        <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-blue-100 dark:border-blue-900">
          <h3 className="text-xl font-medium text-blue-700 dark:text-blue-300 mb-2">No hay etapas configuradas</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Este pipeline no tiene etapas configuradas. Crea la primera etapa para comenzar a gestionar oportunidades.
          </p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="w-full h-32 border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 bg-blue-50/50 dark:bg-blue-950/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200 flex flex-col items-center justify-center gap-2"
            variant="outline"
          >
            <Plus className="h-6 w-6" />
            <span className="font-medium">Crear nueva etapa</span>
          </Button>
        </div>
        
        {/* Diálogo de creación de nueva etapa */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crear nueva etapa</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newStageName" className="text-right">
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="newStageName"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  className="col-span-3"
                  required
                  placeholder="Nombre de la etapa"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newProbability" className="text-right">
                  Probabilidad (%) <span className="text-gray-400 text-xs">(Opcional)</span>
                </Label>
                <Input
                  id="newProbability"
                  type="number"
                  min="0"
                  max="100"
                  value={newStageProbability || ''}
                  onChange={(e) => setNewStageProbability(parseInt(e.target.value) || null)}
                  className="col-span-3"
                  placeholder="0-100"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newColor" className="text-right">
                  Color <span className="text-gray-400 text-xs">(Opcional)</span>
                </Label>
                <div className="col-span-3 flex items-center gap-2">
                  <input
                    type="color"
                    id="newColor"
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="h-8 w-8 rounded-md cursor-pointer"
                  />
                  <Input
                    value={newStageColor}
                    onChange={(e) => setNewStageColor(e.target.value)}
                    className="flex-1"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="newDescription" className="text-right">
                  Descripción <span className="text-gray-400 text-xs">(Opcional)</span>
                </Label>
                <Input
                  id="newDescription"
                  value={newStageDescription}
                  onChange={(e) => setNewStageDescription(e.target.value)}
                  className="col-span-3"
                  placeholder="Descripción de la etapa"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
                Cancelar
              </Button>
              <Button type="submit" onClick={handleSaveNewStage} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <span className="mr-2">Creando</span>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  "Crear etapa"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 p-6 min-h-[calc(100vh-10rem)] bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {stages.map((stage) => (
          <div 
            key={stage.id} 
            className="flex-shrink-0 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all duration-200 border border-blue-100 dark:border-blue-900"
          >
            <div 
              className="p-3 border-b border-blue-100 dark:border-blue-900 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white dark:from-blue-950 dark:to-gray-900"
              style={{
                borderLeft: stage.color ? `4px solid ${stage.color}` : undefined,
                borderTopLeftRadius: '0.375rem',
                borderTopRightRadius: '0.375rem'
              }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-200 cursor-help">{stage.name}</h3>
                  </TooltipTrigger>
                  <TooltipContent>
                    {stage.description ? (
                      <p>{stage.description}</p>
                    ) : (
                      <p>Sin descripción</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
                        {getOpportunitiesByStage(stage.id).length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Número de oportunidades</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <button 
                  onClick={() => handleConfigStage(stage)}
                  className="ml-1 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
                  title="Configurar etapa"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <button 
                  onClick={() => handleDeleteStage(stage.id)}
                  className="ml-1 p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400"
                  title="Eliminar etapa"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2">
                    <path d="m3 6 3 0"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="m8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    <line x1="10" x2="10" y1="11" y2="17"></line>
                    <line x1="14" x2="14" y1="11" y2="17"></line>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Mostrar valor total de etapa */}
            <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 flex justify-between items-center text-sm border-b border-blue-100 dark:border-blue-900">
              <div className="flex items-center">
                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-1.5" />
                <span className="text-blue-700 dark:text-blue-300">Valor total:</span>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="font-medium text-blue-700 dark:text-blue-300">
                      {formatCurrency(calculateStageValue(stage.id))}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Valor ponderado por probabilidad</p>
                    <p className="text-xs text-gray-500">Total sin ponderar: {formatCurrency(getOpportunitiesByStage(stage.id).reduce((acc, opp) => acc + (opp.amount || 0), 0))}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <Droppable droppableId={stage.id}>
              {(provided) => (
                <div 
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="min-h-[12rem] p-2 bg-white dark:bg-gray-800"
                >
                  {getOpportunitiesByStage(stage.id).map((opportunity, index) => (
                    <Draggable 
                      key={opportunity.id} 
                      draggableId={opportunity.id} 
                      index={index}
                    >
                      {(provided) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`p-3 mb-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow ${opportunity.status === 'won' 
                            ? 'border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 hover:border-green-300 hover:bg-green-50 dark:hover:border-green-700 dark:hover:bg-green-900/20' 
                            : opportunity.status === 'lost'
                            ? 'border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 hover:border-red-300 hover:bg-red-50 dark:hover:border-red-700 dark:hover:bg-red-900/20'
                            : 'border border-blue-100 dark:border-blue-900 hover:border-blue-300 hover:bg-blue-50 dark:hover:border-blue-700 dark:hover:bg-blue-900/20'}`}
                        >
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center">
                            {opportunity.name}
                            {opportunity.status === 'won' && (
                              <span className="ml-1.5 text-green-600 dark:text-green-400 text-xs bg-green-100 dark:bg-green-900/30 rounded-full px-1.5 py-0.5">
                                {translateOpportunityStatus('won')}
                              </span>
                            )}
                            {opportunity.status === 'lost' && (
                              <span className="ml-1.5 text-red-600 dark:text-red-400 text-xs bg-red-100 dark:bg-red-900/30 rounded-full px-1.5 py-0.5">
                                {translateOpportunityStatus('lost')}
                              </span>
                            )}
                          </h4>
                          
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 flex items-center">
                            {opportunity.customer?.full_name || 'Cliente no especificado'}
                          </div>
                          
                          {opportunity.expected_close_date && (
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                              <Calendar className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                              {new Date(opportunity.expected_close_date).toLocaleDateString('es-ES')}
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-blue-50 dark:border-blue-900/50">
                            <div className={`font-medium flex items-center ${opportunity.status === 'won' ? 'text-green-600 dark:text-green-400' : opportunity.status === 'lost' ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                              <DollarSign className="h-3 w-3 mr-0.5" />
                              {formatCurrency(opportunity.amount)}
                            </div>
                            <Badge 
                              className={`capitalize ${opportunity.status === 'won' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : opportunity.status === 'lost' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}`}
                            >
                              {opportunity.currency || 'COP'}
                            </Badge>
                          </div>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
        
        {/* Botón para crear nueva etapa */}
        <div className="flex-shrink-0 w-72">
          <Button
            onClick={handleCreateStage}
            variant="outline"
            className="w-full h-32 border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-600 bg-blue-50/50 dark:bg-blue-950/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200 flex flex-col items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus">
              <path d="M5 12h14"/>
              <path d="m12 5 0 14"/>
            </svg>
            <span className="font-medium">Crear nueva etapa</span>
          </Button>
        </div>
      </div>
      
      {/* Diálogo de configuración de etapa */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stageName" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="stageName"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="probability" className="text-right">
                Probabilidad (%) <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={stageProbability || ''}
                onChange={(e) => setStageProbability(parseInt(e.target.value) || null)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="color" className="text-right">
                Color <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="h-8 w-8 rounded-md cursor-pointer"
                />
                <Input
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Descripción <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="description"
                value={stageDescription}
                onChange={(e) => setStageDescription(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" onClick={handleSaveStage} disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="mr-2">Guardando</span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de creación de nueva etapa */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newStageName" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="newStageName"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                className="col-span-3"
                required
                placeholder="Nombre de la etapa"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newProbability" className="text-right">
                Probabilidad (%) <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="newProbability"
                type="number"
                min="0"
                max="100"
                value={newStageProbability || ''}
                onChange={(e) => setNewStageProbability(parseInt(e.target.value) || null)}
                className="col-span-3"
                placeholder="0-100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newColor" className="text-right">
                Color <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="newColor"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="h-8 w-8 rounded-md cursor-pointer"
                />
                <Input
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="flex-1"
                  placeholder="#3b82f6"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newDescription" className="text-right">
                Descripción <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="newDescription"
                value={newStageDescription}
                onChange={(e) => setNewStageDescription(e.target.value)}
                className="col-span-3"
                placeholder="Descripción de la etapa"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
              Cancelar
            </Button>
            <Button type="submit" onClick={handleSaveNewStage} disabled={isCreating}>
              {isCreating ? (
                <>
                  <span className="mr-2">Creando</span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Crear etapa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de confirmación para eliminar etapa */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La etapa será eliminada permanentemente.
            </AlertDialogDescription>
            {deleteStageId && (
              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  <strong>Nota:</strong> Solo se pueden eliminar etapas que no tengan oportunidades asociadas.
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteStage}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                "Eliminar etapa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
