"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/config";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, getCurrentTheme, applyTheme } from "@/utils/Utils";
import { handleStageChangeAutomation } from "./OpportunityAutomations";
import { BarChart3, Calendar, DollarSign, Loader2, Settings, Plus, GripVertical, Trash2 } from "lucide-react";
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
  
  // Estado para crear nueva etapa
  const [isNewStageOpen, setIsNewStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [isCreatingStage, setIsCreatingStage] = useState(false);
  
  // Estado para drag & drop de etapas
  const [isDraggingStage, setIsDraggingStage] = useState(false);

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
        setStages([]); // Limpiar etapas para evitar mostrar las de otro pipeline
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
    // Convertir de decimal (0-1) a porcentaje (0-100) para mostrar en el modal
    const probabilityPercent = stageToEdit.probability != null 
      ? Math.round(stageToEdit.probability * 100) 
      : null;
    setStageProbability(probabilityPercent);
    setStageColor(stageToEdit.color || "#3b82f6"); // Color predeterminado azul
    setStageDescription(stageToEdit.description || "");
    setIsConfigOpen(true);
  };

  // Función para validar si un string es un UUID válido
  const isValidUUID = (uuid: string | null): boolean => {
    if (!uuid) return false;
    // Patrón de UUID v4
    const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return pattern.test(uuid);
  };

  // Función para guardar los cambios de la etapa
  const handleSaveStage = async () => {
    if (!configStage) return;
    setIsSaving(true); // Mostrar carga
    
    try {
      // Validar campos requeridos y contexto
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
      
      // Verificar que el usuario pertenece a la organización (cumple con RLS)
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
      // El organization_id en la BD es entero mientras que el del frontend puede ser string
      const dbOrgId = String(pipelineData.organization_id);
      const currentOrgId = String(organizationId);
      
      console.log('Verificando organización:', { 
        dbOrgId, 
        currentOrgId, 
        match: dbOrgId === currentOrgId 
      });
      
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
      // De porcentaje (0-100) a decimal (0-1)
      let probabilityValue = null;
      if (stageProbability !== null && stageProbability !== undefined) {
        // Convertir de porcentaje a decimal como número (sin formatear como string)
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

  // Función para crear nueva etapa
  const handleCreateStage = async () => {
    if (!newStageName.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la etapa es obligatorio",
        variant: "destructive",
      });
      return;
    }

    if (!organizationId || !pipelineId) {
      toast({
        title: "Error",
        description: "No se pudo determinar la organización o pipeline",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingStage(true);

    try {
      // Obtener la última posición
      const maxPosition = stages.length > 0 
        ? Math.max(...stages.map(s => s.position)) 
        : 0;
      
      // Calcular probabilidad basada en posición (lógica progresiva)
      // Las etapas intermedias tienen probabilidad proporcional
      const totalStages = stages.length + 1;
      const newPosition = maxPosition + 1;
      // Probabilidad: primera etapa 10%, aumenta progresivamente hasta 90% (antes de Ganado/Perdido)
      const probability = Math.min(0.1 + ((newPosition - 1) / Math.max(totalStages - 1, 1)) * 0.8, 0.9);

      const { data, error } = await supabase
        .from('stages')
        .insert({
          pipeline_id: pipelineId,
          name: newStageName.trim(),
          position: newPosition,
          probability: probability,
          color: '#3b82f6',
        })
        .select()
        .single();

      if (error) throw error;

      // Agregar a la lista local
      setStages(prev => [...prev, data]);
      
      toast({
        title: "Éxito",
        description: "Etapa creada correctamente",
      });

      // Limpiar y cerrar
      setNewStageName("");
      setIsNewStageOpen(false);
    } catch (error: any) {
      console.error('Error al crear etapa:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear la etapa",
        variant: "destructive",
      });
    } finally {
      setIsCreatingStage(false);
    }
  };

  // Función para eliminar etapa
  const handleDeleteStage = async (stageId: string) => {
    const stageToDelete = stages.find(s => s.id === stageId);
    if (!stageToDelete) return;

    // Verificar si hay oportunidades en esta etapa
    const oppsInStage = getOpportunitiesByStage(stageId);
    if (oppsInStage.length > 0) {
      toast({
        title: "No se puede eliminar",
        description: `Esta etapa tiene ${oppsInStage.length} oportunidad(es). Muévelas primero a otra etapa.`,
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`¿Estás seguro de eliminar la etapa "${stageToDelete.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('stages')
        .delete()
        .eq('id', stageId);

      if (error) throw error;

      // Actualizar lista local
      setStages(prev => prev.filter(s => s.id !== stageId));

      toast({
        title: "Éxito",
        description: "Etapa eliminada correctamente",
      });
    } catch (error: any) {
      console.error('Error al eliminar etapa:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la etapa",
        variant: "destructive",
      });
    }
  };

  // Función para reordenar etapas (drag & drop)
  const handleStageDragEnd = async (result: any) => {
    if (!result.destination || result.type !== 'STAGE') return;

    const { source, destination } = result;
    if (source.index === destination.index) return;

    const reorderedStages = Array.from(stages);
    const [movedStage] = reorderedStages.splice(source.index, 1);
    reorderedStages.splice(destination.index, 0, movedStage);

    // Recalcular posiciones y probabilidades
    const updatedStages = reorderedStages.map((stage, index) => {
      const totalStages = reorderedStages.length;
      let probability: number;
      
      // Lógica de probabilidad:
      // - Etapas con nombre "Ganado" o "Ganada" = 100%
      // - Etapas con nombre "Perdido" o "Perdida" = 0%
      // - Resto: probabilidad progresiva basada en posición
      const stageLower = stage.name.toLowerCase();
      if (stageLower.includes('ganado') || stageLower.includes('ganada') || stageLower === 'won') {
        probability = 1.0;
      } else if (stageLower.includes('perdido') || stageLower.includes('perdida') || stageLower === 'lost') {
        probability = 0;
      } else {
        // Probabilidad progresiva: primera etapa ~10%, última antes de Ganado/Perdido ~90%
        const normalStages = reorderedStages.filter(s => {
          const name = s.name.toLowerCase();
          return !name.includes('ganado') && !name.includes('ganada') && 
                 !name.includes('perdido') && !name.includes('perdida') &&
                 name !== 'won' && name !== 'lost';
        });
        const posInNormal = normalStages.findIndex(s => s.id === stage.id);
        if (posInNormal >= 0 && normalStages.length > 1) {
          probability = 0.1 + (posInNormal / (normalStages.length - 1)) * 0.8;
        } else {
          probability = 0.5; // Por defecto 50% si es la única etapa normal
        }
      }

      return {
        ...stage,
        position: index + 1,
        probability
      };
    });

    // Actualizar estado local inmediatamente
    setStages(updatedStages);

    // Actualizar en la base de datos
    try {
      const updates = updatedStages.map(stage => 
        supabase
          .from('stages')
          .update({ 
            position: stage.position,
            probability: stage.probability,
            updated_at: new Date().toISOString()
          })
          .eq('id', stage.id)
      );

      await Promise.all(updates);

      toast({
        title: "Éxito",
        description: "Orden de etapas actualizado",
      });
    } catch (error: any) {
      console.error('Error al reordenar etapas:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el nuevo orden",
        variant: "destructive",
      });
      // Revertir cambios
      loadStages();
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

  // Manejar el arrastre y soltar (oportunidades y etapas)
  const handleDragEnd = async (result: any) => {
    // Si es un drag de etapas, usar la función específica
    if (result.type === 'STAGE') {
      await handleStageDragEnd(result);
      return;
    }

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
      <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-blue-100 dark:border-blue-900">
        <h3 className="text-xl font-medium text-blue-700 dark:text-blue-300 mb-2">No hay etapas configuradas</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Este pipeline no tiene etapas configuradas. Contacte al administrador para configurar el pipeline.
        </p>
      </div>
    );
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {/* Contenedor con scroll horizontal en móvil */}
      <div 
        className="overflow-x-auto overflow-y-hidden -mx-3 sm:mx-0 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-gray-200 dark:scrollbar-track-gray-800"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'thin'
        }}
      >
        <Droppable droppableId="stages-container" direction="horizontal" type="STAGE">
          {(stagesProvided) => (
            <div 
              ref={stagesProvided.innerRef}
              {...stagesProvided.droppableProps}
              className="flex gap-3 sm:gap-6 p-3 sm:p-6 min-h-[calc(100vh-10rem)] bg-gray-50 dark:bg-gray-900 transition-colors duration-200 min-w-min"
            >
              {stages.map((stage, stageIndex) => (
                <Draggable key={stage.id} draggableId={`stage-${stage.id}`} index={stageIndex}>
                  {(stageDragProvided, stageDragSnapshot) => (
                    <div 
                      ref={stageDragProvided.innerRef}
                      {...stageDragProvided.draggableProps}
                      className={`flex-shrink-0 w-[280px] sm:w-72 bg-white dark:bg-gray-800 rounded-lg shadow-sm transition-all duration-200 border ${stageDragSnapshot.isDragging ? 'border-blue-500 shadow-lg' : 'border-gray-200 dark:border-gray-700'}`}
                    >
                      <div 
                        className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 rounded-t-lg"
                        style={{
                          borderLeft: stage.color ? `4px solid ${stage.color}` : '4px solid #3b82f6',
                        }}
                      >
                        {/* Handle para arrastrar etapa */}
                        <div {...stageDragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing mr-2">
                          <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                        </div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <h3 className="font-semibold text-gray-800 dark:text-gray-200 cursor-help flex-1">{stage.name}</h3>
                            </TooltipTrigger>
                            <TooltipContent>
                              {stage.description ? <p>{stage.description}</p> : <p>Sin descripción</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-800">
                            {getOpportunitiesByStage(stage.id).length}
                          </Badge>
                          <button 
                            onClick={() => handleConfigStage(stage)}
                            className="p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400"
                            title="Configurar etapa"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteStage(stage.id)}
                            className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900 text-red-500 dark:text-red-400"
                            title="Eliminar etapa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Mostrar valor total de etapa */}
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/30 flex justify-between items-center text-sm border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center">
                          <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400 mr-1.5" />
                          <span className="text-gray-600 dark:text-gray-300">Valor total:</span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {formatCurrency(calculateStageValue(stage.id))}
                        </span>
                      </div>
                      
                      <Droppable droppableId={stage.id} type="OPPORTUNITY">
                        {(oppDropProvided) => (
                          <div 
                            {...oppDropProvided.droppableProps}
                            ref={oppDropProvided.innerRef}
                            className="min-h-[12rem] p-2 bg-white dark:bg-gray-800"
                          >
                            {getOpportunitiesByStage(stage.id).map((opportunity, index) => (
                              <Draggable 
                                key={opportunity.id} 
                                draggableId={opportunity.id} 
                                index={index}
                              >
                                {(oppDragProvided) => (
                                  <Card
                                    ref={oppDragProvided.innerRef}
                                    {...oppDragProvided.draggableProps}
                                    {...oppDragProvided.dragHandleProps}
                                    className={`p-3 mb-2 cursor-pointer transition-all duration-200 shadow-sm hover:shadow ${opportunity.status === 'won' 
                                      ? 'border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' 
                                      : opportunity.status === 'lost'
                                      ? 'border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                                      : 'border border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-700'}`}
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
                                    
                                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                      {opportunity.customer?.full_name || 'Cliente no especificado'}
                                    </div>
                                    
                                    {opportunity.expected_close_date && (
                                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                                        <Calendar className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                                        {new Date(opportunity.expected_close_date).toLocaleDateString('es-ES')}
                                      </div>
                                    )}
                                    
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                      <div className={`font-medium flex items-center ${opportunity.status === 'won' ? 'text-green-600 dark:text-green-400' : opportunity.status === 'lost' ? 'text-red-500 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                        <DollarSign className="h-3 w-3 mr-0.5" />
                                        {formatCurrency(opportunity.amount)}
                                      </div>
                                      <Badge className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                        {opportunity.currency || 'COP'}
                                      </Badge>
                                    </div>
                                  </Card>
                                )}
                              </Draggable>
                            ))}
                            {oppDropProvided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  )}
                </Draggable>
              ))}
              {stagesProvided.placeholder}
              
              {/* Botón para agregar nueva etapa */}
              <div className="flex-shrink-0 w-[280px] sm:w-72">
                <Button
                  variant="outline"
                  onClick={() => setIsNewStageOpen(true)}
                  className="w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                >
                  <Plus className="h-6 w-6 mr-2" />
                  Nueva Etapa
                </Button>
              </div>
            </div>
          )}
        </Droppable>
      </div>
      
      {/* Diálogo para crear nueva etapa */}
      <Dialog open={isNewStageOpen} onOpenChange={setIsNewStageOpen}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">Nueva Etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="newStageName" className="text-gray-900 dark:text-gray-100 font-medium">
                Nombre de la etapa <span className="text-red-600">*</span>
              </Label>
              <Input
                id="newStageName"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="Ej: Propuesta Enviada"
                className="min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                La probabilidad se calculará automáticamente según la posición de la etapa.
              </p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsNewStageOpen(false);
                setNewStageName("");
              }} 
              disabled={isCreatingStage}
              className="w-full sm:w-auto min-h-[44px]"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateStage} 
              disabled={isCreatingStage || !newStageName.trim()}
              className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700"
            >
              {isCreatingStage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Etapa
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de configuración de etapa */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">Configurar etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="stageName" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Nombre <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <Input
                id="stageName"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                required
              />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="probability" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Probabilidad (%) <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={stageProbability || ''}
                onChange={(e) => setStageProbability(parseInt(e.target.value) || null)}
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="color" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Color <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="h-10 w-10 rounded-md cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                />
                <Input
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="flex-1 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="description" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Descripción <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="description"
                value={stageDescription}
                onChange={(e) => setStageDescription(e.target.value)}
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsConfigOpen(false)} disabled={isSaving} className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </Button>
            <Button type="submit" onClick={handleSaveStage} disabled={isSaving} className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white">
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
    </DragDropContext>
  );
}
